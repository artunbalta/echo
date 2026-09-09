"""A UserState survives the trip to rows and back, exactly (SOC-2.D, DECISIONS C34).

Every restart returns every user to the prior today, and with `autoDeploy: true` and no
`buildFilter` that is every push to the connected branch — measured, 143 commits over 90 days on
main across 17 active days, of which only 38 touch services/ml. A docs commit resets everyone.

THIS FILE IS THE HALF THAT NEEDS NO DATABASE, and that split is the design. `snapshot.py` is pure
functions of their arguments, so the things that are easy to get subtly wrong are testable with no
key, no network and no service:

  · a full 8x8 covariance that round-trips as its own diagonal — 0001's column comment says
    "diagonal covariance as array" and was wrong seven hours after it shipped, and `jsonb` accepts
    both shapes without complaint, so nothing but a test can tell them apart;
  · a posterior restored under a `W` it was never folded through, which is a number in a coordinate
    system that no longer exists;
  · a refusal treated as an error rather than as "start from the prior", which is what every restart
    already does and is therefore free.

Run:  cd services/ml && python3 -m pytest tests/test_snapshot.py
"""
import numpy as np
import pytest

from echo_ml import ingest, persona as P
from echo_ml.autonomy import Bucket
from echo_ml.snapshot import (
    SNAPSHOT_VERSION,
    behavior_rows,
    bucket_rows,
    persona_row,
    restore,
    w_stamp,
)
from echo_ml.store import BehaviorEntry, UserState

FULL_CTX = {
    "stakes": "low", "audience_size": 0, "public_or_private": "private",
    "counterpart_status": "none", "stage": 1, "scarcity_level": "normal",
    "mood_proxy": "neutral", "time_pressure": False,
}


def lived_in_state(user_id="snap-user", folds=6):
    """A UserState with real history in it, folded through the actual pipeline."""
    st = UserState(user_id)
    for i in range(folds):
        ev = {
            "actor_id": user_id, "channel": "A", "action": f"dwell_{i}",
            "context": dict(FULL_CTX), "raw_signals": {"dwell_ms": 400 + i * 90},
            "session_mode": "room",
        }
        obs = ingest.event_to_observation(ev)
        st.posterior = P.observe(st.posterior, obs["action"], obs["telemetry"])
        ck = obs["cond_key"]
        st.cond[ck] = P.observe(st.cond.get(ck, P.prior()), obs["action"], obs["telemetry"])
        st.behaviors.append(
            BehaviorEntry(np.full(256, 0.01 * (i + 1)), obs["action"], ck, dict(obs["provenance"]))
        )
    st.temperature = 1.7
    st.calib = [(0.9, 1), (0.4, 0)]
    st.baseline_mu = st.posterior.mu.copy()
    b = Bucket("stakes:low")
    b.record(True, 0.8)
    b.record(False, 0.6)
    st.buckets[b.name] = b
    return st


def round_trip(st):
    return restore(
        st.user_id,
        persona_row(st),
        bucket_rows(st),
        {"params_json": st.reward.to_dict()},
        behavior_rows(st, st.behaviors),
    )


def test_the_posterior_survives_to_the_last_bit():
    st = lived_in_state()
    back = round_trip(st)
    assert back is not None
    assert np.array_equal(back.posterior.mu, st.posterior.mu), "the mean moved"
    assert np.array_equal(back.posterior.Sigma, st.posterior.Sigma), "the covariance moved"
    assert back.posterior.version == st.posterior.version


def test_the_covariance_is_stored_FULL_and_not_as_its_own_diagonal():
    """0001's column comment says 'diagonal covariance as array' and jsonb accepts both shapes."""
    st = lived_in_state(folds=2)  # before the eigenvalue floor pins Sigma to 0.02*I
    row = persona_row(st)
    assert np.array(row["z_cov_json"]).shape == (8, 8), "an 8x8 was flattened on the way out"

    off = st.posterior.Sigma - np.diag(np.diag(st.posterior.Sigma))
    assert np.abs(off).max() > 0, "fixture is degenerate: pick a fold count before the eigen floor"

    back = round_trip(st)
    assert np.array_equal(back.posterior.Sigma, st.posterior.Sigma)
    # And the failure this is really guarding: a writer that believed the comment.
    diag_only = dict(row, z_cov_json=None)
    diag_only["var"] = np.diag(st.posterior.Sigma).tolist()
    lossy = restore(st.user_id, diag_only)
    assert not np.array_equal(lossy.posterior.Sigma, st.posterior.Sigma), (
        "storing only the diagonal was lossless, so this test cannot see the bug it exists for"
    )


def test_conditional_posteriors_survive_with_their_keys():
    st = lived_in_state()
    assert st.cond, "fixture built no conditional buckets"
    back = round_trip(st)
    assert set(back.cond) == set(st.cond)
    for k in st.cond:
        assert np.array_equal(back.cond[k].mu, st.cond[k].mu)
        assert np.array_equal(back.cond[k].Sigma, st.cond[k].Sigma)


def test_the_rest_of_the_state_survives_too():
    st = lived_in_state()
    back = round_trip(st)
    assert back.temperature == st.temperature
    assert back.calib == st.calib
    assert np.array_equal(back.baseline_mu, st.baseline_mu)

    assert set(back.buckets) == set(st.buckets)
    a, b = st.buckets["stakes:low"], back.buckets["stakes:low"]
    assert (b.level, b.volume) == (a.level, a.volume)
    assert b.agreement_ewma == pytest.approx(a.agreement_ewma)
    assert b.ece == pytest.approx(a.ece)
    # _cusum is the drift detector; without it a restarted bucket can never be demoted for drift.
    assert b._cusum == pytest.approx(a._cusum) and a._cusum > 0


def test_behaviours_survive_with_their_context_and_their_provenance():
    st = lived_in_state()
    back = round_trip(st)
    assert len(back.behaviors) == len(st.behaviors)
    for got, want in zip(back.behaviors, st.behaviors):
        assert np.allclose(got.embedding, want.embedding)
        assert got.action_text == want.action_text
        # The cond_key is embedded ALONGSIDE the action; a row without it cannot reproduce what was
        # embedded. And the provenance is SOC-2.F's evidentiary class (L7) — losing it here loses it
        # exactly as it was lost before.
        assert got.context == want.context
        assert got.provenance == want.provenance == {"session_mode": "room"}
    # Retrieval still works, which is what the behaviour index is FOR.
    assert back.retrieve(st.behaviors[0].embedding, k=2)


def test_a_row_folded_under_a_different_W_is_REFUSED_not_adapted():
    """C29: W is re-anchored once. A stored mu is a point in the coordinate system of its own W."""
    st = lived_in_state()
    row = persona_row(st, stamp="a-different-matrix-entirely")
    assert restore(st.user_id, row) is None, "a posterior from another W was adopted"
    # ...and refusing costs nothing: None means start from the prior, which is what a restart does.
    assert restore(st.user_id, row, stamp="a-different-matrix-entirely") is not None


def test_an_unrecognised_snapshot_version_is_refused_rather_than_guessed_at():
    st = lived_in_state()
    assert restore(st.user_id, dict(persona_row(st), snapshot_version=SNAPSHOT_VERSION + 1)) is None
    assert restore(st.user_id, dict(persona_row(st), snapshot_version=0)) is None
    assert restore(st.user_id, None) is None


def test_the_untrained_process_stamps_and_matches_only_itself():
    # A clean checkout with no artifact folds through the heuristic featurizer, which is a DIFFERENT
    # coordinate system rather than a degraded one. "" must not match a trained stamp.
    st = lived_in_state()
    untrained = persona_row(st, stamp="")
    assert restore(st.user_id, untrained, stamp="") is not None
    assert restore(st.user_id, untrained, stamp=w_stamp()) is None or w_stamp() == ""


def test_a_brand_new_user_round_trips_as_the_prior():
    st = UserState("nobody")
    back = round_trip(st)
    assert back is not None
    assert np.array_equal(back.posterior.mu, st.posterior.mu)
    assert back.cond == {} and back.buckets == {} and back.behaviors == []
    assert back.baseline_mu is None


def test_every_value_in_a_row_is_json_safe():
    """PostgREST takes JSON. A numpy float32 or an ndarray serialises to a TypeError at 3am."""
    import json

    st = lived_in_state()
    for row in [persona_row(st), reward := {"params_json": st.reward.to_dict()}, *bucket_rows(st),
                *behavior_rows(st, st.behaviors)]:
        json.dumps(row)  # raises if anything numpy leaked through
