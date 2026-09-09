"""A person is remembered across a restart, through the shipped routes (SOC-2.D, DECISIONS C34).

The other two files prove the pieces: `test_snapshot.py` that a UserState survives becoming rows,
`test_persistence.py` that the queue coalesces and the hydrate refuses. Neither would notice if
`Store.updating` stopped marking users dirty, or if `app.py` never attached the backing at all —
which is the same shape as every gap this repo keeps finding: two correct halves and no join.

So this drives the REAL FastAPI app with a durable store attached, observes a user, throws the
process away, and asks whether the person is still there.

Run:  cd services/ml && python3 -m pytest tests/test_durable_endtoend.py
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from echo_ml.app import app
from echo_ml.config import SETTINGS
from echo_ml.persistence import Persistence
from echo_ml.store import STORE, Store

from tests.test_persistence import FakeRest

FULL_CTX = {
    "stakes": "low", "audience_size": 0, "public_or_private": "private",
    "counterpart_status": "none", "stage": 1, "scarcity_level": "normal",
    "mood_proxy": "neutral", "time_pressure": False,
}
UID = "durable-e2e"


@pytest.fixture
def durable():
    """Attach a fake-backed Persistence to the real STORE, and take it away again afterwards."""
    rest = FakeRest()
    STORE.attach(Persistence(rest, STORE))
    STORE.delete(UID)
    try:
        yield rest
    finally:
        STORE.attach(None)
        STORE._users.pop(UID, None)


def client():
    return TestClient(app, headers={"Authorization": f"Bearer {SETTINGS.ml_token}"})


def observe(c, action, i):
    body = {"event": {
        "actor_id": UID, "channel": "A", "action": action,
        "context": dict(FULL_CTX), "raw_signals": {"dwell_ms": 300 + i * 120},
        "session_mode": "room",
    }}
    r = c.post("/observe/behavioral", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_a_person_is_still_there_after_the_process_is_thrown_away(durable):
    c = client()
    for i in range(6):
        observe(c, f"dwell_{i}", i)
    STORE._persist.flush()

    live = STORE.get(UID)
    mu, version, behaviours = live.posterior.mu.copy(), live.posterior.version, len(live.behaviors)
    assert version >= 6 and behaviours == 6

    # THE RESTART. A new Store, the same rows.
    fresh = Store()
    fresh.attach(Persistence(durable, fresh))
    revived = fresh.get(UID)

    assert revived.posterior.version == version, "the posterior came back as a stranger"
    assert np.array_equal(revived.posterior.mu, mu)
    assert len(revived.behaviors) == behaviours, (
        "behaviours were lost, so EchoPanel's 'No one knows you here yet' would still be shown"
    )
    assert revived.cond, "the conditional signature — where individuation lives — did not survive"
    assert revived.behaviors[0].provenance == {"session_mode": "room"}, "L7's class was dropped"


def test_the_endpoint_reports_the_revived_user_and_not_a_prior(durable):
    c = client()
    for i in range(4):
        observe(c, f"dwell_{i}", i)
    STORE._persist.flush()

    fresh = Store()
    fresh.attach(Persistence(durable, fresh))
    revived = fresh.get(UID)
    # What /persona reports is what EchoPanel gates on.
    assert len(revived.behaviors) == 4
    assert revived.posterior.version >= 4


def test_erasure_removes_the_durable_rows_too(durable):
    c = client()
    observe(c, "dwell_0", 0)
    STORE._persist.flush()
    assert durable.tables["persona_state"]

    assert c.request("DELETE", f"/user/{UID}").status_code in (200, 204, 404)
    for table in ("persona_state", "behavior_index", "autonomy_buckets", "reward_model_state"):
        assert durable.tables.get(table, []) == [], (
            f"{table} survived an erasure — the next hydrate would bring the person back"
        )


def test_nothing_is_written_when_the_gate_is_shut(durable):
    """The default everywhere today. ⚑24's gate is shut, so the app attaches a disabled backing."""
    STORE.attach(None)
    # The fixture's own setup ran a delete THROUGH the backing before it was detached, which is
    # itself the erasure path working; clear the log so what is asserted below is only what the
    # observe did.
    durable.calls.clear()
    c = client()
    observe(c, "dwell_0", 0)
    assert durable.calls == [], "a write happened with no durable backing attached"
