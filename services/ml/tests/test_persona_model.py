"""WI-2 (§9.2) — learned measurement matrix W (Factor Analysis + anchoring)."""
import numpy as np
import pytest
from echo_ml import persona as P
from echo_ml.persona_model import (
    PersonaModel, fa_em, anchor_alignment, get_persona_model, set_persona_model, ARTIFACT_PATH,
)


def _planted_fa(rng, N=900, F=24, K=6):
    L = rng.standard_normal((F, K))
    mu = rng.standard_normal(F)
    Z = rng.standard_normal((N, K))
    Psi = 0.1 + 0.4 * rng.random(F)
    Phi = Z @ L.T + mu + rng.standard_normal((N, F)) * np.sqrt(Psi)
    return Phi, Z


def test_fa_em_lower_bound_is_monotonic():
    rng = np.random.default_rng(0)
    Phi, _ = _planted_fa(rng)
    _, _, _, lls = fa_em(Phi, K=6, iters=100, seed=1)
    diffs = np.diff(lls)
    assert np.all(diffs > -1e-6)              # EM lower bound never decreases
    assert lls[-1] > lls[0]                   # and it actually improves


def test_anchor_alignment_recovers_planted_loading():
    # Generate features from known axis labels via a planted W; the ridge anchor recovers it.
    rng = np.random.default_rng(2)
    N, F, D = 1500, 20, P.D
    W_true = rng.standard_normal((D, F))
    mu = rng.standard_normal(F)
    Z = rng.standard_normal((N, D))
    Phi = Z @ W_true + mu + rng.standard_normal((N, F)) * 0.1
    W, Psi = anchor_alignment(Phi - mu, Z, ridge=1e-2)
    assert W.shape == (D, F)
    assert np.linalg.norm(W - W_true) / np.linalg.norm(W_true) < 0.1   # < 10% rel error
    assert np.all(Psi > 0)


def test_planted_W_recovers_known_z_from_many_observations():
    # The core WI-2 acceptance: with a trained synthetic W, the general Kalman update
    # recovers a planted latent z* from many noisy observations (MSE below threshold).
    rng = np.random.default_rng(5)
    F = 30
    W_axis = rng.standard_normal((P.D, F)) * 0.5      # (D,F)
    mu = rng.standard_normal(F)
    Psi = 0.2 + 0.3 * rng.random(F)
    model = PersonaModel(W=W_axis, mu_phi=mu, Psi=Psi)
    z_star = np.array([0.6, -0.4, 0.3, -0.7, 0.2, 0.5, -0.1, 0.0])
    post = P.prior()
    for _ in range(400):
        phi = mu + W_axis.T @ z_star + rng.standard_normal(F) * np.sqrt(Psi)
        W_meas, Psi_total = model.apply(phi)
        post = P.kalman_update_general(post, model.center(phi), W_meas, Psi_total)
    assert np.mean((post.mu - z_star) ** 2) < 0.02


def test_missing_artifact_triggers_heuristic_fallback(tmp_path):
    missing = PersonaModel.load(tmp_path / "does_not_exist.npz")
    assert missing.trained is False
    # observe() with the untrained model must still update via the heuristic path, no error.
    post = P.prior()
    out = P.observe(post, "Hey! Thanks so much, you are wonderful!!", {}, model=missing)
    assert out.version == post.version + 1
    assert not np.allclose(out.mu, post.mu)   # heuristic featurizer moved it


def test_persona_model_save_load_roundtrip(tmp_path):
    rng = np.random.default_rng(7)
    W = rng.standard_normal((P.D, P.FEATURE_DIM))
    model = PersonaModel(W=W, mu_phi=rng.standard_normal(P.FEATURE_DIM),
                         Psi=0.3 + rng.random(P.FEATURE_DIM),
                         feature_names=P.feature_names())
    path = tmp_path / "m.npz"
    model.save(path)
    loaded = PersonaModel.load(path)
    assert loaded.trained
    assert np.allclose(loaded.W, model.W)
    assert np.allclose(loaded.Psi, model.Psi)
    assert loaded.feature_names == model.feature_names


def test_interpretability_reports_top_features_per_axis():
    model = get_persona_model()
    if not model.trained:
        pytest.skip("no committed artifact in this checkout")
    interp = model.interpretability(top=3)
    assert set(interp.keys()) == set(model.axis_keys)
    for axis, feats in interp.items():
        assert len(feats) == 3
        assert all("feature" in f and "loading" in f for f in feats)


def test_committed_artifact_drives_non_degenerate_movement():
    # The committed artifact must make the learned-W path active and move a Turkish-only
    # conversation (the Turkish-collapse acceptance, end-to-end).
    set_persona_model(None)                  # force reload of the committed artifact
    model = get_persona_model()
    if not model.trained:
        set_persona_model(None)
        pytest.skip("no committed artifact in this checkout")
    assert model.W.shape == (P.D, P.FEATURE_DIM)
    post = P.prior()
    moved = P.observe(post, "Sanırım belki yarın buluşabiliriz, çok isterim!", {"latencyMs": 600})
    assert np.linalg.norm(moved.mu - post.mu) > 0.1
    set_persona_model(None)                  # reset cache for other tests


def test_empty_observation_is_a_noop_but_telemetry_still_updates():
    # An observation with no information at all (empty text AND no telemetry) must be a no-op
    # even on the trained path — matching the heuristic path — while a telemetry-only signal
    # (e.g. reply latency) still updates the posterior.
    set_persona_model(None)
    model = get_persona_model()
    if not model.trained:
        set_persona_model(None)
        pytest.skip("no committed artifact in this checkout")
    post = P.prior()
    assert np.allclose(P.observe(post, "", {}).mu, post.mu)
    assert np.allclose(P.observe(post, "   ", None).mu, post.mu)
    assert not np.allclose(P.observe(post, "", {"latencyMs": 200}).mu, post.mu)
    set_persona_model(None)


def test_committed_artifact_pace_follows_latency():
    set_persona_model(None)
    model = get_persona_model()
    if not model.trained:
        set_persona_model(None)
        pytest.skip("no committed artifact in this checkout")
    from echo_ml.persona_axes import AXIS_INDEX
    fast = P.observe(P.prior(), "", {"latencyMs": 200})
    slow = P.observe(P.prior(), "", {"latencyMs": 4000})
    assert fast.mu[AXIS_INDEX["pace"]] > slow.mu[AXIS_INDEX["pace"]]
    set_persona_model(None)
