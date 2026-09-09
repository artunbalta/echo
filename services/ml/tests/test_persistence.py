"""The durable store's transport, driven against a fake PostgREST (SOC-2.D, C34).

No network and no key, but the REAL queue, the real daemon thread and the real snapshot functions —
so what is under test is the behaviour that is hard to get right rather than httpx.

FIVE PROPERTIES, and each is a way this could be quietly wrong:

  · WRITES ARE OFF THE REQUEST THREAD and coalesce. `Store.updating` serialises every observation
    for one actor (⚑16b); a round trip inside it would serialise a network latency per event.
  · THE SNAPSHOT IS OF CURRENT STATE, not of a copy captured when the id was enqueued — which is
    the whole reason the queue carries ids and not payloads.
  · HYDRATE REFUSES MORE OFTEN THAN IT SUCCEEDS, and a refusal is "start from the prior" rather
    than an error, because that is what every restart already does.
  · BEHAVIOURS COME BACK IN THE RIGHT ORDER. They are read newest-first and the in-memory ring is
    oldest-first with a `[-500:]` truncation, so getting this backwards silently discards the
    NEWEST behaviours on the next append.
  · NOTHING RAISES INTO A REQUEST. A database that is down degrades to today's behaviour.

Run:  cd services/ml && python3 -m pytest tests/test_persistence.py
"""
import numpy as np
import pytest

from echo_ml import persona as P
from echo_ml.persistence import Persistence
from echo_ml.snapshot import w_stamp
from echo_ml.store import BehaviorEntry, Store


class FakeRest:
    """A dict-backed PostgREST. Records calls so ordering and coalescing are observable."""

    def __init__(self, fail_on=None):
        self.tables: dict[str, list[dict]] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail_on = fail_on

    def _rows(self, table):
        return self.tables.setdefault(table, [])

    def select(self, table, params):
        if self.fail_on == "select":
            raise RuntimeError("postgrest is down")
        self.calls.append(("select", table))
        uid = params.get("user_id", "eq.").split("eq.", 1)[-1]
        rows = [r for r in self._rows(table) if r.get("user_id") == uid]
        if params.get("order", "").endswith("desc"):
            rows = list(reversed(rows))
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        return [dict(r) for r in rows]

    def upsert(self, table, rows, on_conflict):
        if self.fail_on == "upsert":
            raise RuntimeError("postgrest is down")
        self.calls.append(("upsert", table))
        keys = [k.strip() for k in on_conflict.split(",")]
        for row in rows:
            if keys != ["id"]:
                existing = [r for r in self._rows(table) if all(r.get(k) == row.get(k) for k in keys)]
                for r in existing:
                    self._rows(table).remove(r)
            self._rows(table).append(dict(row))

    def delete(self, table, params):
        if self.fail_on == "delete":
            raise RuntimeError("postgrest is down")
        self.calls.append(("delete", table))
        uid = params.get("user_id", "eq.").split("eq.", 1)[-1]
        self.tables[table] = [r for r in self._rows(table) if r.get("user_id") != uid]


def wired(fail_on=None):
    store = Store()
    rest = FakeRest(fail_on)
    return store, rest, Persistence(rest, store)


def fold(store, uid, n=4):
    with store.updating(uid) as st:
        for i in range(n):
            st.posterior = P.observe(st.posterior, f"dwell_{i}", {"solitude_tol": 0.5 + i * 0.05})
            st.behaviors.append(BehaviorEntry(np.full(256, 0.01 * (i + 1)), f"dwell_{i}", "stakes:low",
                                              {"session_mode": "room"}))
        st.bucket("stakes:low").record(True, 0.8)
    return store.get(uid)


def test_a_full_user_survives_a_restart():
    store, rest, p = wired()
    before = fold(store, "u1", n=5)
    mu, sigma, version = before.posterior.mu.copy(), before.posterior.Sigma.copy(), before.posterior.version
    p.record("u1")
    p.flush()

    # The restart: a brand new process, same durable rows.
    fresh = Store()
    revived = Persistence(rest, fresh).hydrate("u1")
    assert revived is not None, "the user came back as a stranger"
    assert np.array_equal(revived.posterior.mu, mu)
    assert np.array_equal(revived.posterior.Sigma, sigma)
    assert revived.posterior.version == version
    assert len(revived.behaviors) == 5
    assert revived.buckets["stakes:low"].volume == 1


def test_the_write_is_off_the_request_thread_and_coalesces():
    store, rest, p = wired()
    fold(store, "u2")
    for _ in range(10):
        p.record("u2")           # ten observations in a moment
    p.flush()
    upserts = [t for verb, t in rest.calls if verb == "upsert" and t == "persona_state"]
    assert len(upserts) < 10, f"{len(upserts)} writes for ten records — the queue is not coalescing"
    assert len(upserts) >= 1


def test_the_snapshot_is_of_CURRENT_state_not_of_the_state_at_enqueue():
    store, rest, p = wired()
    fold(store, "u3", n=2)
    p.record("u3")
    p.flush()
    later = fold(store, "u3", n=3)     # more observations after the first write
    p.record("u3")
    p.flush()
    stored = rest.tables["persona_state"][0]
    assert stored["version"] == later.posterior.version, "the queue carried a stale copy"
    assert len(rest.tables["behavior_index"]) == 5


def test_behaviours_come_back_oldest_first():
    store, rest, p = wired()
    fold(store, "u4", n=4)
    p.record("u4"); p.flush()
    revived = Persistence(rest, Store()).hydrate("u4")
    assert [b.action_text for b in revived.behaviors] == ["dwell_0", "dwell_1", "dwell_2", "dwell_3"], (
        "reversed: app.py truncates with [-500:], so this silently drops the NEWEST behaviours"
    )


def test_a_row_from_another_W_is_refused_and_that_costs_nothing():
    store, rest, p = wired()
    fold(store, "u5")
    p.record("u5"); p.flush()
    rest.tables["persona_state"][0]["w_sha256"] = "some-other-matrix"
    assert Persistence(rest, Store()).hydrate("u5") is None


def test_an_absent_user_is_read_once_per_process_not_once_per_request():
    # `GET /persona/{uid}` is unauthenticated today (SOC-2.E). Without this, enumerating ids is a
    # database read per request; with it, it is one per distinct id, the same bound Store already has.
    store, rest, p = wired()
    for _ in range(8):
        assert p.hydrate("never-seen") is None
    reads = [t for verb, t in rest.calls if verb == "select" and t == "persona_state"]
    assert len(reads) == 1, f"{len(reads)} database reads for eight probes of an absent user"


def test_a_write_makes_an_absent_user_readable_again():
    store, rest, p = wired()
    assert p.hydrate("u6") is None          # caches the absence
    fold(store, "u6")
    p.record("u6"); p.flush()
    assert Persistence(rest, Store()).hydrate("u6") is not None
    assert p.hydrate("u6") is not None, "record() did not clear the negative cache"


def test_erasure_removes_every_table_and_is_loud_when_it_cannot():
    store, rest, p = wired()
    fold(store, "u7")
    p.record("u7"); p.flush()
    assert any(rest.tables[t] for t in ("persona_state", "behavior_index", "autonomy_buckets"))
    p.forget("u7")
    for table in ("persona_state", "behavior_index", "autonomy_buckets", "reward_model_state"):
        assert rest.tables.get(table, []) == [], f"{table} still holds rows for an erased user"

    # Erasure is a promise to a person: a failure must raise rather than be logged and swallowed.
    _, _, loud = wired(fail_on="delete")
    with pytest.raises(RuntimeError):
        loud.forget("u7")


def test_a_database_that_is_down_never_reaches_a_request():
    store, rest, p = wired(fail_on="select")
    assert p.hydrate("u8") is None            # degrades to the prior, does not raise

    store, rest, p = wired(fail_on="upsert")
    fold(store, "u9")
    p.record("u9")
    p.flush()                                  # the worker swallows it
    assert p.enabled


def test_disabled_persistence_does_nothing_at_all():
    store = Store()
    p = Persistence(None, store)
    assert p.enabled is False
    assert p.hydrate("u10") is None
    p.record("u10")
    p.flush()
    p.forget("u10")       # must not raise with no backend


def test_the_stamp_written_is_the_stamp_this_process_folds_under():
    store, rest, p = wired()
    fold(store, "u11")
    p.record("u11"); p.flush()
    assert rest.tables["persona_state"][0]["w_sha256"] == w_stamp()
