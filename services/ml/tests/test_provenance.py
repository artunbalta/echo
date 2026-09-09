"""Provenance reaches the store, and moves nothing on the way (SOC-2.F, cross-cutting law L7).

L7: "Once a row of one evidentiary class is ingested it is indistinguishable from another forever."
`session_mode` has been declared in packages/shared/src/telemetry.ts, stamped by measure.ts and
stored as a checked column in migration 0011 for as long as the landing path has existed — and
`event_to_observation` never read it. So every behavioural row written until now is permanently
unfilterable: nobody can ever ask "show me only what was observed in a shared room".

THIS FILE HOLDS BOTH HALVES, and the second is the one that makes the first safe to ship:

  1. The class is CARRIED. A stamped event reaches the observation with its session_mode, an
     unstamped one carries nothing rather than a guess, and a value outside the declared set is
     dropped rather than stored — a provenance field that can hold anything distinguishes nothing.

  2. NOTHING ELSE MOVES. The telemetry dict and the cond_key are byte-identical with and without the
     stamp, and the posterior after observing is identical to the last bit. Provenance is for telling
     rows apart later, never for weighing them now; routing it into a feature or a bucket key would
     fork every existing user's conditional posteriors and silently re-partition evidence already
     gathered, which is a modelling decision nobody has taken.

Run:  cd services/ml && python3 -m pytest tests/test_provenance.py
"""
import numpy as np
import pytest

from echo_ml import ingest, persona as P


FULL_CTX = {
    "stakes": "low",
    "audience_size": 0,
    "public_or_private": "private",
    "counterpart_status": "none",
    "stage": 1,
    "scarcity_level": "normal",
    "mood_proxy": "neutral",
    "time_pressure": False,
}


def event(**extra):
    return {"actor_id": "u1", "channel": "A", "action": "dwell", "context": dict(FULL_CTX), **extra}


def test_a_stamped_row_carries_its_class():
    obs = ingest.event_to_observation(event(session_mode="room"))
    assert obs["provenance"] == {"session_mode": "room"}


def test_every_declared_mode_survives_the_trip():
    # The three are the same three as SessionMode in shared telemetry and the CHECK in 0011.
    assert ingest.SESSION_MODES == ("solo", "room", "landing")
    for mode in ingest.SESSION_MODES:
        assert ingest.event_to_observation(event(session_mode=mode))["provenance"]["session_mode"] == mode


def test_an_unstamped_row_carries_nothing_rather_than_a_guess():
    # Defaulting to "solo" here would be worse than the bug: it would make rows of unknown class
    # indistinguishable from rows known to be solo, which is L7's failure wearing a helpful face.
    assert ingest.event_to_observation(event())["provenance"] == {}


@pytest.mark.parametrize("bad", ["", "SOLO", "multiplayer", 3, None, {"solo": True}])
def test_a_value_outside_the_declared_set_is_dropped(bad):
    assert ingest.event_to_observation(event(session_mode=bad))["provenance"] == {}


def test_the_stamp_changes_no_feature_and_no_bucket():
    bare = ingest.event_to_observation(event())
    stamped = ingest.event_to_observation(event(session_mode="room"))
    assert stamped["telemetry"] == bare["telemetry"], "provenance leaked into the feature vector"
    assert stamped["cond_key"] == bare["cond_key"], "provenance forked the conditional bucket"
    assert stamped["action"] == bare["action"]
    assert stamped["polarity"] == bare["polarity"]


def test_the_posterior_is_identical_to_the_last_bit():
    """The claim the whole change rests on: carrying provenance moves no measurement."""
    bare = ingest.event_to_observation(event())
    stamped = ingest.event_to_observation(event(session_mode="landing"))

    a = P.observe(P.prior(), bare["action"], bare["telemetry"])
    b = P.observe(P.prior(), stamped["action"], stamped["telemetry"])

    assert np.array_equal(a.mu, b.mu), "the mean moved"
    assert np.array_equal(a.Sigma, b.Sigma), "the covariance moved"


def test_a_social_row_carries_its_class_too():
    # Not only Channel A: the shared-world classes SOC-2.F is really about ride on social events,
    # and those take a different cond_key branch entirely.
    ctx = dict(FULL_CTX, counterpart_status="peer")
    obs = ingest.event_to_observation(
        {"actor_id": "u1", "channel": "G", "action": "opener_warm", "context": ctx, "session_mode": "room"}
    )
    assert obs["provenance"] == {"session_mode": "room"}
    assert obs["cond_key"] == "counterpart:peer", "the bucket key must still be the social one"


# ── through the real endpoint ───────────────────────────────────────────────────
#
# The unit tests above prove the ingest carries the class. They cannot prove the class SURVIVES THE
# WIRE, and that is the half that was actually broken: `session_mode` has been stamped by the client
# and stored in a column all along, and it still reached no posterior, because nothing in between
# read it. So this drives the shipped FastAPI route, with the envelope shaped the way
# `measure.ts` shapes it -- `session_mode` at the TOP LEVEL of the event, beside `context`, not
# inside it.


def _client():
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from fastapi.testclient import TestClient

    from echo_ml.app import app
    from echo_ml.config import SETTINGS
    from echo_ml.store import STORE

    # The ingress is token-gated; slice_walkthrough.py authenticates the same way. Going around the
    # gate would test a route that does not exist.
    client = TestClient(app, headers={"Authorization": f"Bearer {SETTINGS.ml_token}"})
    return client, STORE


def test_the_class_survives_the_wire_and_reaches_the_store():
    client, store = _client()
    body = {
        "event": {
            "actor_id": "provenance-e2e",
            "channel": "A",
            "action": "dwell",
            "context": dict(FULL_CTX),
            # Top level, beside `context` -- exactly where measure.ts puts it.
            "session_mode": "room",
        }
    }
    assert client.post("/observe/behavioral", json=body).status_code == 200

    with store.updating("provenance-e2e") as st:
        assert st.behaviors, "the event moved no behaviour into the store at all"
        assert st.behaviors[-1].provenance == {"session_mode": "room"}


def test_an_unstamped_event_over_the_wire_stores_no_class():
    client, store = _client()
    body = {
        "event": {
            "actor_id": "provenance-e2e-bare",
            "channel": "A",
            "action": "dwell",
            "context": dict(FULL_CTX),
        }
    }
    assert client.post("/observe/behavioral", json=body).status_code == 200
    with store.updating("provenance-e2e-bare") as st:
        assert st.behaviors[-1].provenance == {}
