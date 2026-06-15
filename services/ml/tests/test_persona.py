"""§9.2 persona posterior tests."""
import numpy as np
from echo_ml import persona as P
from echo_ml.persona_axes import AXIS_INDEX


def test_prior_is_uncertain_and_neutral():
    post = P.prior()
    assert np.allclose(post.mu, 0.0)
    assert np.all(post.var >= P.HYPER.prior_var - 1e-9)


def test_kalman_update_moves_toward_evidence_and_reduces_variance():
    post = P.prior()
    y = np.zeros(P.D)
    mask = np.zeros(P.D)
    i = AXIS_INDEX["warmth"]
    y[i] = 0.9
    mask[i] = 1
    new = P.kalman_update(post, y, mask, r=0.3)
    # mean moves toward the evidence, variance shrinks on the observed axis only
    assert new.mu[i] > post.mu[i]
    assert new.var[i] < post.var[i]
    j = AXIS_INDEX["pace"]
    assert np.isclose(new.var[j], post.var[j])  # untouched axis unchanged


def test_repeated_consistent_evidence_converges():
    post = P.prior()
    i = AXIS_INDEX["energy"]
    for _ in range(20):
        y = np.zeros(P.D); mask = np.zeros(P.D); y[i] = 0.8; mask[i] = 1
        post = P.kalman_update(post, y, mask, r=0.3)
    assert post.mu[i] > 0.6
    assert post.var[i] < 0.2  # confident


def test_featurize_text_sets_evidence():
    y, mask, r = P.featurize("Hey! Thanks so much, you are wonderful!!", {})
    assert mask[AXIS_INDEX["affect"]] == 1
    assert y[AXIS_INDEX["warmth"]] > 0  # warm tokens present
    assert r > 0


def test_implicit_latency_drives_pace():
    # fast reply ⇒ high pace; slow reply ⇒ low pace
    post = P.prior()
    fast = P.observe(post, "", {"latencyMs": 200})
    slow = P.observe(post, "", {"latencyMs": 4000})
    assert fast.mu[AXIS_INDEX["pace"]] > slow.mu[AXIS_INDEX["pace"]]


def test_elbo_improves_after_consistent_updates():
    i = AXIS_INDEX["openness"]
    y = np.zeros(P.D); mask = np.zeros(P.D); y[i] = 0.7; mask[i] = 1
    ev = [(y, mask, 0.3)] * 5
    pre = P.elbo(P.prior(), ev)
    post = P.prior()
    for _ in range(5):
        post = P.kalman_update(post, y, mask, 0.3)
    assert P.elbo(post, ev) > pre


def test_inflate_reopens_learning():
    post = P.prior()
    i = AXIS_INDEX["warmth"]
    for _ in range(15):
        y = np.zeros(P.D); mask = np.zeros(P.D); y[i] = 0.8; mask[i] = 1
        post = P.kalman_update(post, y, mask, 0.3)
    confident_var = post.var[i]
    inflated = P.inflate(post, ["warmth"], factor=2.0)
    assert inflated.var[i] > confident_var
