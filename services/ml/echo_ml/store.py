"""Per-user learning state (§9.9: lightweight, no per-user LLM weights).

Holds {persona posterior, reward head, behavior index, autonomy buckets, calibration
data}. The behavior index is an in-process cosine store mirroring the pgvector
`behavior_index` table.

IN MEMORY, FULL STOP. This docstring used to say "optionally hydrated/persisted to Supabase" and
there is no such option: nothing in `services/ml` has ever read a database, and `persona_state`,
`behavior_index`, `reward_model_state`, `autonomy_buckets`, `preference_pairs` and
`meeting_outcomes` have been declared in `db/migrations/0001_init.sql` since June with ZERO writers.
`render.yaml` carried the same false sentence as a deployment instruction — "with both set, learning
state hydrates/persists to Supabase" — which an operator could act on and get nothing.

SO EVERY POSTERIOR RESETS ON EVERY REDEPLOY, and `autoDeploy: true` with no `buildFilter` means
every push to the connected branch redeploys both services: measured over 90 days on `main`, 143
commits across 17 active days, **of which only 38 touch `services/ml`** — so most of the redeploys
that wipe every posterior are for changes that never touch the measurement engine. What a person
then sees is `EchoPanel`'s "No one knows you here yet — not even your echo."

That is SOC-2.D, and it is not fixed here. What is fixed here is the record.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
import threading
import numpy as np

from .persona import Posterior, prior
from .reward import RewardModel
from .autonomy import Bucket
from .embeddings import cosine
from .config import HYPER


@dataclass
class BehaviorEntry:
    embedding: np.ndarray
    action_text: str
    context: str
    #: WHERE THIS ROW CAME FROM (SOCIETY-PLAN SOC-2.F, cross-cutting law L7).
    #:
    #: L7: "Once a row of one evidentiary class is ingested it is indistinguishable from another
    #: forever." `session_mode` has existed in `packages/shared/src/telemetry.ts` since the landing
    #: path was built, is stamped by `measure.ts`, and is a checked column in migration 0011 -- and
    #: `ingest.event_to_observation` never read it, so every row already written is unfilterable and
    #: always will be. This field is where it stops.
    #:
    #: IT IS DELIBERATELY NOT A FEATURE AND NOT A BUCKET KEY. It never enters `telemetry`, so no
    #: posterior moves; it never enters `cond_key`, because that would fork every existing user's
    #: conditional buckets and silently re-partition evidence already gathered. Provenance is for
    #: telling rows APART later, not for weighing them now. `test_provenance.py` pins both halves.
    #:
    #: A shared world multiplies the classes (SOC-2.F names NPC-witnessed vs player-witnessed and
    #: server-stamped vs client-asserted). Nothing populates those yet, and none is invented here:
    #: this carries the one class that is genuinely stamped today, and it is a dict so the next one
    #: is an added key rather than a migration.
    provenance: dict[str, str] = field(default_factory=dict)


@dataclass
class UserState:
    user_id: str
    posterior: Posterior = field(default_factory=prior)
    reward: RewardModel = field(default_factory=RewardModel.init)
    behaviors: list[BehaviorEntry] = field(default_factory=list)
    buckets: dict[str, Bucket] = field(default_factory=dict)
    # Per-context conditional posteriors (event-schema.md): a separate Posterior per context
    # value (e.g. "counterpart:server", "stakes:high") so the conditional signature — where
    # individuation lives — is recoverable. Keyed by the ingress cond_key.
    cond: dict[str, Posterior] = field(default_factory=dict)
    temperature: float = HYPER.temperature_init
    # calibration training data: (raw_confidence, agreed)
    calib: list[tuple[float, int]] = field(default_factory=list)
    # snapshot of the persona prior mean for drift comparison
    baseline_mu: np.ndarray | None = None
    # P3: passive locomotion scalars (heading_change_rate, path_tortuosity, novel_tile_ratio,
    # backtrack_rate, ...) RECORDED as the * re-anchor's training corpus (known-gaps #2).
    # Deliberately NOT featurized yet - the committed W has no telemetry->openness path; these
    # start moving the posterior only after the one-time P5 re-anchor. Bounded ring buffer.
    locomotion: list[dict] = field(default_factory=list)

    def bucket(self, name: str) -> Bucket:
        if name not in self.buckets:
            self.buckets[name] = Bucket(name)
        return self.buckets[name]

    def retrieve(self, query_emb: np.ndarray, k: int = 5) -> list[str]:
        """Top-k past behaviors by cosine similarity (§9.3 retrieval)."""
        if not self.behaviors:
            return []
        scored = [(cosine(query_emb, b.embedding), b.action_text) for b in self.behaviors]
        scored.sort(key=lambda s: s[0], reverse=True)
        return [t for _, t in scored[:k]]


class Store:
    """The per-user state map, and the per-user WRITE lock that guards it.

    THE LOCK IS NOT OPTIONAL, and known-gaps ⚑16 is why. Every persona update is a
    read-modify-write across several statements in app.py::

        st = STORE.get(uid)
        st.posterior = P.observe(st.posterior, action, telemetry)

    `self._lock` below only ever protected the `_users` DICT. Two requests for the SAME user get the
    same `UserState` object, both read `st.posterior`, both compute, and the second assignment
    overwrites the first. The observation is gone: no error, no log, and a posterior that looks fine.
    FastAPI runs sync `def` endpoints in a threadpool, so two in-flight requests for one user really
    are two threads in this code at once.

    Measured before the fix: eight concurrent observations for one actor produced ``behaviors 8`` and
    ``persona.version 2``. Six discarded. Since F2 and F3 emit two events per actor per interaction,
    roughly half of every live player-to-player measurement was being dropped.

    Keyed PER USER, not globally: the loss is per user (six different users posted concurrently each
    landed intact), and a global lock would serialize unrelated traffic for nothing.

    SCOPE, stated plainly rather than assumed. This is an in-process `threading.RLock`, so it
    serializes threads inside ONE Python process and nothing more. That is sufficient for how this
    service is actually run — `uvicorn echo_ml.app:app` with no `--workers`, i.e. a single worker
    process, both in the Dockerfile and in run.sh, on a single Render instance. It is NOT sufficient
    under `--workers N`, multiple instances, or any horizontal scaling. Note though that the store
    itself is a process-local in-memory dict with no shared backing: under multiple workers a user's
    posterior would already depend on which worker served the request, which is a larger and more
    visible problem than the race. So this lock is exactly as complete as the store is, and the
    thing that would have to change first is the store, not the lock.
    """

    def __init__(self):
        self._users: dict[str, UserState] = {}
        self._lock = threading.Lock()
        # One write lock per user. Re-entrant so a caller already holding it can nest safely.
        self._user_locks: dict[str, threading.RLock] = {}
        #: The durable backing, or None (SOC-2.D). Attached after construction because
        #: `persistence` imports this module — and left None everywhere until ⚑24's gate opens.
        self._persist = None

    def attach(self, persistence) -> None:
        """Give this store a durable backing. Idempotent; safe to call with None."""
        self._persist = persistence

    def get(self, user_id: str) -> UserState:
        """This user's state, hydrating it from the durable store the first time it is asked for.

        THE HYDRATE HAPPENS OUTSIDE `self._lock`, and that is the whole shape of this method. That
        lock protects the `_users` DICT and is held by every user's every access; a network read
        inside it would serialise all of them behind one Supabase latency, which is precisely the
        cost the per-user keying below exists to avoid. So: look under the lock, read outside it,
        then take the lock again to install.

        A second thread may have installed a state while this one was reading. FIRST WRITER WINS and
        the hydrated copy is dropped — never merged. Merging two views of one posterior is how the
        race ⚑16 records gets reintroduced through the back door.
        """
        with self._lock:
            state = self._users.get(user_id)
        if state is not None:
            return state

        hydrated = self._persist.hydrate(user_id) if self._persist is not None else None

        with self._lock:
            existing = self._users.get(user_id)
            if existing is not None:
                return existing
            self._users[user_id] = hydrated if hydrated is not None else UserState(user_id)
            return self._users[user_id]

    def lock_for(self, user_id: str) -> threading.RLock:
        """The write lock for one user. Created on demand; one entry per user, same as `_users`."""
        with self._lock:
            lk = self._user_locks.get(user_id)
            if lk is None:
                lk = threading.RLock()
                self._user_locks[user_id] = lk
            return lk

    @contextmanager
    def updating(self, user_id: str) -> Iterator[UserState]:
        """Exclusive read-modify-write on one user's state, and the durable snapshot that follows.

        Every endpoint that MUTATES a user must hold this for the whole read-modify-write, not just
        for the assignment: the read and the write are what have to be atomic together.

        THE SNAPSHOT IS MARKED HERE RATHER THAN AT THE FIVE CALL SITES, deliberately. A sixth
        endpoint will be written one day, and a convention that has to be remembered at every
        mutation is a convention that will be missed at one of them — the resulting bug being a user
        whose posterior is durable on four paths and amnesiac on the fifth, which is the kind of
        thing nobody finds. `record` only enqueues an id, so it costs nothing here and never
        performs I/O under this lock; the daemon thread takes the lock again when it actually writes.

        On an exception nothing is marked: a half-applied update is not a state worth persisting,
        and the in-memory copy is already the more truthful of the two.
        """
        with self.lock_for(user_id):
            yield self.get(user_id)
            if self._persist is not None:
                self._persist.record(user_id)

    def delete(self, user_id: str) -> bool:
        """Hard delete all derived state for a user (§13 erasure), in memory AND durably.

        Under the user's own lock, so erasure cannot land in the middle of an update and leave a
        half-applied posterior behind for a user who asked to be forgotten — but the durable delete
        is deliberately NOT inside `self._lock`, the global dict lock, because holding that across a
        network call serialises every unrelated user.

        The durable delete goes FIRST and is allowed to raise. Erasure is a promise to a person: if
        the rows cannot be removed, the honest outcome is a failed request, not a cleared cache and
        a surviving row that the next hydrate would bring back.
        """
        with self.lock_for(user_id):
            if self._persist is not None:
                self._persist.forget(user_id)
            with self._lock:
                self._user_locks.pop(user_id, None)
                return self._users.pop(user_id, None) is not None

    def all_user_ids(self) -> list[str]:
        with self._lock:
            return list(self._users.keys())


STORE = Store()
