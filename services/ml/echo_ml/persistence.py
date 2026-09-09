"""The durable half of the learning store: PostgREST, write-behind, and a hydrate that refuses
more often than it succeeds (SOCIETY-PLAN SOC-2.D, DECISIONS C34).

WHAT THIS IS AND IS NOT. It makes the store DURABLE. It does not make it SHARED — a snapshot cannot,
and it was measured not to: two workers, one user, twelve observations, and a read that came back
`version 0`. The shared half needs the read-modify-write inside Postgres (`registry.ts`'s
`pg_advisory_xact_lock`), which PostgREST cannot express, so it is coupled to SOC-2.A's choice of
access path and this is not. C34 says which half is being taken; this file is that half.

THE WRITE IS OFF THE REQUEST THREAD, and that is not an optimisation. `Store.updating` serialises
every observation for one actor (⚑16b), so a network round trip inside it would serialise a
Supabase latency per event for that user. `record()` puts the user id on a queue and returns; a
daemon thread drains it and snapshots whatever the state looks like THEN. Coalescing is the point:
ten observations in a second are one write, and the write is always of current state rather than of
a stale copy captured at enqueue time.

LOSING A QUEUED SNAPSHOT ON A HARD KILL IS ACCEPTABLE and is the deliberate trade — it costs exactly
what a restart costs today, which is the thing this file exists to reduce rather than to guarantee.
What is NOT acceptable is the ingress getting slower because it started keeping records.

THE HYDRATE IS BOUNDED BY CONSTRUCTION: one row by primary key, plus that user's buckets, reward and
most recent behaviours. This is the property replay could not offer — its cold read is
O(all-events-ever) — and it is why hydrating inside the per-user lock is defensible where replaying
inside it was not.

ZERO KEY IS THE DEFAULT AND THE LOCAL RUN NEVER TOUCHES THIS. `SETTINGS.persist_enabled` is false
unless ML-owned credentials AND an explicit `ECHO_ML_PERSIST=1` are set (⚑24), so `npm run dev:ml`
behaves exactly as it did. Nothing here ever raises into a request: a database that is down degrades
to the in-memory store, which is the status quo, and says so in the log once.
"""
from __future__ import annotations

import logging
import queue
import threading
from typing import Any, Protocol

from .config import SETTINGS
from .snapshot import behavior_rows, bucket_rows, persona_row, restore
from .store import UserState

log = logging.getLogger("echo_ml.persistence")

#: How many behaviours to bring back. `app.py` caps the in-memory ring at 500; hydrating more would
#: restore a state the running process would immediately truncate.
BEHAVIOR_LIMIT = 500


class Rest(Protocol):
    """The three verbs this file needs. A Protocol so a test can pass a dict-backed fake.

    Deliberately NOT `SqlClient` from packages/planet: that interface has no `connect()` and cannot
    express the advisory locks the shared half will need, so borrowing it here would imply a
    compatibility that does not exist.
    """

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]: ...
    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None: ...
    def delete(self, table: str, params: dict[str, str]) -> None: ...


class PostgrestRest:
    """PostgREST over httpx — the transport the service already has a client for.

    `requirements.txt` carries httpx and no database driver, so this adds no dependency, no image
    change and no cold-start cost. It is also the reason `config.py` declared Supabase settings in
    the first place; they were simply never read.
    """

    def __init__(self, url: str, key: str, timeout: float = 5.0):
        import httpx

        self._client = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    def select(self, table, params):
        r = self._client.get(f"/{table}", params=params)
        r.raise_for_status()
        return r.json()

    def upsert(self, table, rows, on_conflict):
        if not rows:
            return
        r = self._client.post(
            f"/{table}",
            params={"on_conflict": on_conflict},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows,
        )
        r.raise_for_status()

    def delete(self, table, params):
        r = self._client.delete(f"/{table}", params=params, headers={"Prefer": "return=minimal"})
        r.raise_for_status()


class Persistence:
    """Snapshot on a queue, hydrate on demand, and never raise into a request."""

    def __init__(self, rest: Rest | None = None, store=None):
        self._rest = rest
        self._store = store
        self._queue: queue.Queue[str] = queue.Queue()
        self._pending: set[str] = set()
        self._guard = threading.Lock()
        self._worker: threading.Thread | None = None
        self._complained = False
        #: Ids read and found absent. Bounds an unauthenticated `GET /persona/{uid}` to ONE database
        #: read per distinct id per process — the same bound `Store._users` already has — instead of
        #: one per request. SOC-2.E is what makes that path authenticated; this makes it cheap
        #: meanwhile.
        self._missing: set[str] = set()

    @property
    def enabled(self) -> bool:
        return self._rest is not None

    # ── reading ────────────────────────────────────────────────────────────────

    def hydrate(self, user_id: str) -> UserState | None:
        """The stored state for a user, or None — which means "start from the prior".

        None is the overwhelmingly common answer and is not an error: a row from another `W`, an
        unrecognised snapshot version, an absent user and a database that is down are all the same
        result, and that result is what every restart does today.
        """
        if not self.enabled or user_id in self._missing:
            return None
        try:
            eq = f"eq.{user_id}"
            persona = self._rest.select("persona_state", {"user_id": eq, "limit": "1"})
            if not persona:
                self._missing.add(user_id)
                return None
            state = restore(
                user_id,
                persona[0],
                self._rest.select("autonomy_buckets", {"user_id": eq}),
                (self._rest.select("reward_model_state", {"user_id": eq, "limit": "1"}) or [None])[0],
                self._rest.select(
                    "behavior_index",
                    {"user_id": eq, "order": "ts.desc", "limit": str(BEHAVIOR_LIMIT)},
                ),
            )
            if state is not None:
                # `order=ts.desc` reads newest-first; the in-memory ring is oldest-first and
                # `app.py` truncates with `[-500:]`, so a reversed list would drop the NEWEST
                # behaviours on the next append.
                state.behaviors.reverse()
            return state
        except Exception as e:  # noqa: BLE001 — a durable read must never fail a request
            self._complain("hydrate", e)
            return None

    # ── writing ────────────────────────────────────────────────────────────────

    def record(self, user_id: str) -> None:
        """Mark a user dirty. Returns immediately; never touches the network on this thread."""
        if not self.enabled:
            return
        with self._guard:
            if user_id in self._pending:
                return  # already queued: ten observations in a second are one write
            self._pending.add(user_id)
        self._missing.discard(user_id)
        self._queue.put(user_id)
        self._ensure_worker()

    def flush(self, timeout: float | None = None) -> None:
        """Drain the queue. For tests and for a graceful shutdown; not on any request path."""
        if self.enabled:
            self._queue.join()

    def _ensure_worker(self) -> None:
        if self._worker is None or not self._worker.is_alive():
            self._worker = threading.Thread(target=self._drain, name="echo-ml-persist", daemon=True)
            self._worker.start()

    def _drain(self) -> None:
        while True:
            user_id = self._queue.get()
            try:
                with self._guard:
                    self._pending.discard(user_id)
                self._write(user_id)
            except Exception as e:  # noqa: BLE001
                self._complain("snapshot", e)
            finally:
                self._queue.task_done()

    def _write(self, user_id: str) -> None:
        store = self._store
        if store is None:
            return
        # Snapshot under the user's own lock so the row is a consistent read-modify-write, and NOT
        # under `Store._lock`: that is the global dict lock, and holding it across a network call
        # would serialise every unrelated user — the exact cost per-user keying exists to avoid.
        with store.lock_for(user_id):
            state = store.get(user_id)
            persona = persona_row(state)
            buckets = bucket_rows(state)
            reward = {"user_id": user_id, "params_json": state.reward.to_dict(), "version": 0}
            behaviors = behavior_rows(state, state.behaviors)
        self._rest.upsert("persona_state", [persona], "user_id")
        self._rest.upsert("reward_model_state", [reward], "user_id")
        if buckets:
            self._rest.upsert("autonomy_buckets", buckets, "user_id,context_bucket")
        if behaviors:
            # Append-only and rewritten wholesale: `behavior_index` has a surrogate key, so an
            # upsert cannot identify "the same behaviour". Delete-then-insert keeps the stored set
            # equal to the in-memory ring, which is what hydrate expects to read back.
            self._rest.delete("behavior_index", {"user_id": f"eq.{user_id}"})
            self._rest.upsert("behavior_index", behaviors, "id")

    # ── erasure (§13) ──────────────────────────────────────────────────────────

    def forget(self, user_id: str) -> None:
        """Delete every durable row for a user. Called by `Store.delete`, OUTSIDE the global lock.

        Erasure has to work from both sides — the web cascade in `api/account/delete` and this —
        because either service can be down when someone asks to be forgotten, and a route that
        reports success while a row survives is the failure that route's own comment exists to
        prevent.
        """
        if not self.enabled:
            return
        self._missing.discard(user_id)
        try:
            for table in ("behavior_index", "autonomy_buckets", "reward_model_state", "persona_state"):
                self._rest.delete(table, {"user_id": f"eq.{user_id}"})
        except Exception as e:  # noqa: BLE001
            # Loud, because this one is a promise to a person rather than a performance concern.
            log.error("erasure failed to reach the durable store for %s: %s", user_id, e)
            raise

    def _complain(self, what: str, e: Exception) -> None:
        if not self._complained:
            self._complained = True
            log.warning("%s failed; falling back to in-memory state (this is logged once): %s", what, e)


def build(store) -> Persistence:
    """The process's persistence, wired only if `persist_enabled` (⚑24) allows it."""
    if not SETTINGS.persist_enabled:
        return Persistence(None, store)
    try:
        return Persistence(PostgrestRest(SETTINGS.supabase_url, SETTINGS.supabase_key), store)
    except Exception as e:  # noqa: BLE001
        log.warning("durable store unavailable, staying in memory: %s", e)
        return Persistence(None, store)
