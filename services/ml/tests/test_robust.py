"""WI-4 (§9.8) — robust observation update: Mahalanobis gating + Student-t IRLS."""
import numpy as np
from echo_ml import persona as P
from echo_ml.persona_model import PersonaModel


def _model(rng, F=30):
    W = rng.standard_normal((P.D, F)) * 0.5
    mu = rng.standard_normal(F)
    Psi = 0.2 + 0.3 * rng.random(F)
    return PersonaModel(W=W, mu_phi=mu, Psi=Psi), W, mu, Psi


def test_in_distribution_message_updates_normally():
    rng = np.random.default_rng(0)
    model, W, mu, Psi = _model(rng)
    z = np.array([0.5, -0.3, 0.2, -0.4, 0.1, 0.3, -0.2, 0.0])
    phi = mu + W.T @ z + rng.standard_normal(W.shape[1]) * np.sqrt(Psi)
    post = P.prior()
    Wm, Pt = model.apply(phi)
    tr = {}
    out = P.robust_kalman_update(post, model.center(phi), Wm, Pt, trace=tr)
    assert tr["weight"] > 0.7 and not tr["surprising"]
    assert np.linalg.norm(out.mu - post.mu) > 0.1     # a real, normal update


def test_outlier_is_downweighted_to_a_small_fraction():
    rng = np.random.default_rng(0)
    model, W, mu, Psi = _model(rng)
    z = np.array([0.5, -0.3, 0.2, -0.4, 0.1, 0.3, -0.2, 0.0])
    phi_in = mu + W.T @ z + rng.standard_normal(W.shape[1]) * np.sqrt(Psi)
    phi_out = phi_in + 200.0                            # huge planted outlier (large d²)
    post = P.prior()
    Wm, Pt = model.apply(phi_in)

    robust_in = np.linalg.norm(P.robust_kalman_update(post, model.center(phi_in), Wm, Pt).mu - post.mu)
    robust_out = np.linalg.norm(P.robust_kalman_update(post, model.center(phi_out), Wm, Pt).mu - post.mu)
    naive_out = np.linalg.norm(P.kalman_update_general(post, model.center(phi_out), Wm, Pt).mu - post.mu)

    # the outlier moves a small fraction of an in-distribution message, and far less than a
    # naive Kalman would move on the very same outlier.
    assert robust_out < 0.15 * robust_in
    assert robust_out < 0.1 * naive_out


def test_irls_converges():
    rng = np.random.default_rng(1)
    model, W, mu, Psi = _model(rng)
    phi = mu + np.full(W.shape[1], 30.0)                # outlier so IRLS actually engages
    post = P.prior()
    Wm, Pt = model.apply(phi)
    weights = []
    for it in (1, 2, 3, 5, 8):
        tr = {}
        P.robust_kalman_update(post, model.center(phi), Wm, Pt, irls_iters=it, trace=tr)
        weights.append(tr["weight"])
    assert abs(weights[-1] - weights[-2]) < 1e-4        # converged
    assert all(0.0 <= w <= 1.0 for w in weights)


def test_gate_threshold_scales_with_F():
    taus = [P.chi2_quantile(0.99, f) for f in (5, 8, 30, 50, 200)]
    assert taus == sorted(taus)                          # monotonically increasing in F
    # Wilson–Hilferty sanity: χ²_50(0.99) ≈ 76.2 (true value 76.15)
    assert abs(P.chi2_quantile(0.99, 50) - 76.15) < 1.0


def test_heteroscedastic_short_messages_move_less():
    # A short / low-information message gets more measurement noise → a smaller step than a
    # long one, even with identical content style.
    long_scale = P.reliability_noise_scale("word " * 40, {})
    short_scale = P.reliability_noise_scale("ok", {})
    edited_scale = P.reliability_noise_scale("word " * 40, {"editsCount": 6})
    assert short_scale > long_scale                      # short ⇒ noisier
    assert edited_scale > long_scale                     # heavy edits ⇒ noisier
    assert long_scale >= 1.0


def test_single_garbage_message_barely_perturbs_but_consistent_run_moves():
    # The acceptance: one outlier barely moves the posterior; a run of consistent
    # in-distribution messages still accumulates real movement.
    rng = np.random.default_rng(2)
    model, W, mu, Psi = _model(rng)
    z = np.array([0.5, -0.3, 0.2, -0.4, 0.1, 0.3, -0.2, 0.0])
    Wm, Pt = model.apply(mu)

    garbage = model.center(mu + W.T @ z + 300.0)
    after_garbage = P.robust_kalman_update(P.prior(), garbage, Wm, Pt)
    assert np.linalg.norm(after_garbage.mu) < 0.1        # barely perturbed

    post = P.prior()
    for _ in range(15):
        phi = mu + W.T @ z + rng.standard_normal(W.shape[1]) * np.sqrt(Psi)
        post = P.robust_kalman_update(post, model.center(phi), Wm, Pt)
    assert np.linalg.norm(post.mu) > 0.3                 # consistent signal accrues
