"""WI-1 (§9.2) — full-covariance posterior + general linear-Gaussian update tests."""
import numpy as np
from echo_ml import persona as P
from echo_ml.persona_axes import AXIS_INDEX
from echo_ml.autonomy import persona_drift_kl


def test_general_update_reduces_to_diagonal_when_W_is_identity():
    post = P.prior()
    phi = np.linspace(-0.6, 0.6, P.D)
    a = P.kalman_update_general(post, phi, np.eye(P.D), 0.3 * np.eye(P.D))
    b = P.kalman_update(post, phi, np.ones(P.D), 0.3)
    assert np.allclose(a.mu, b.mu)
    assert np.allclose(a.Sigma, b.Sigma)


def test_legacy_kalman_matches_per_dimension_formula():
    # The thin wrapper must reproduce the old per-dimension Kalman exactly on a diagonal Σ.
    post = P.prior()
    i = AXIS_INDEX["warmth"]
    y = np.zeros(P.D); mask = np.zeros(P.D); y[i] = 0.9; mask[i] = 1
    new = P.kalman_update(post, y, mask, r=0.3)
    v0 = P.HYPER.prior_var
    k = v0 / (v0 + 0.3)
    assert np.isclose(new.mu[i], 0.0 + k * (0.9 - 0.0))
    assert np.isclose(new.var[i], (1.0 - k) * v0)


def test_sigma_stays_symmetric_psd_after_many_random_updates():
    rng = np.random.default_rng(3)
    p = P.prior()
    for _ in range(250):
        W = rng.standard_normal((rng.integers(1, 4), P.D))
        phi = rng.standard_normal(W.shape[0])
        Psi = 0.1 + rng.random(W.shape[0])
        p = P.kalman_update_general(p, phi, W, Psi)
    assert np.allclose(p.Sigma, p.Sigma.T, atol=1e-9)
    eig = np.linalg.eigvalsh(p.Sigma)
    assert eig.min() >= P.HYPER.min_var - 1e-9   # eigenvalue floor holds
    assert np.all(np.abs(p.mu) <= 1.0 + 1e-9)    # mean stays clipped


def test_gaussian_kl_zero_for_identical_and_nonnegative():
    rng = np.random.default_rng(1)
    for _ in range(20):
        A = rng.standard_normal((P.D, P.D))
        S1 = A @ A.T + np.eye(P.D)
        B = rng.standard_normal((P.D, P.D))
        S2 = B @ B.T + np.eye(P.D)
        mu1, mu2 = rng.standard_normal(P.D), rng.standard_normal(P.D)
        assert P.gaussian_kl(mu1, S1, mu1, S1) == 0.0          # identical → 0
        assert P.gaussian_kl(mu1, S1, mu2, S2) >= 0.0          # always ≥ 0


def test_persona_drift_kl_uses_full_covariance():
    # Identical posterior vs itself → 0; a shifted mean → positive.
    p = P.prior()
    assert persona_drift_kl(p.mu, p.mu, p.Sigma, p.Sigma) == 0.0
    shifted = p.mu + 0.5
    assert persona_drift_kl(shifted, p.mu, p.Sigma, p.Sigma) > 0.0


def test_from_dict_loads_legacy_var_row():
    legacy = {"mu": [0.2] * P.D, "var": [0.4] * P.D, "version": 7}
    post = P.Posterior.from_dict(legacy)
    assert np.allclose(post.mu, 0.2)
    assert np.allclose(np.diag(post.Sigma), 0.4)          # var → diag(var)
    assert np.allclose(post.Sigma - np.diag(np.diag(post.Sigma)), 0.0)  # off-diag zero
    assert post.version == 7


def test_to_dict_from_dict_roundtrip_exact():
    rng = np.random.default_rng(2)
    p = P.prior()
    for _ in range(20):
        W = rng.standard_normal((2, P.D)); phi = rng.standard_normal(2)
        p = P.kalman_update_general(p, phi, W, 0.5 * np.ones(2))
    d = p.to_dict()
    assert set(d.keys()) == {"mu", "Sigma", "version"}
    p2 = P.Posterior.from_dict(d)
    assert np.allclose(p.mu, p2.mu)
    assert np.allclose(p.Sigma, p2.Sigma)


def test_var_property_is_writable_view_into_sigma():
    p = P.prior()
    p.var[AXIS_INDEX["openness"]] = 0.05
    assert p.Sigma[AXIS_INDEX["openness"], AXIS_INDEX["openness"]] == 0.05
    assert np.allclose(p.var, np.diag(p.Sigma))


def test_inflate_reopens_covariance_on_full_matrix():
    rng = np.random.default_rng(4)
    p = P.prior()
    i = AXIS_INDEX["warmth"]
    for _ in range(15):
        y = np.zeros(P.D); mask = np.zeros(P.D); y[i] = 0.8; mask[i] = 1
        p = P.kalman_update(p, y, mask, 0.3)
    confident = p.var[i]
    inflated = P.inflate(p, ["warmth"], factor=2.0)
    assert inflated.var[i] > confident
    assert np.allclose(inflated.Sigma, inflated.Sigma.T)
    assert np.linalg.eigvalsh(inflated.Sigma).min() >= P.HYPER.min_var - 1e-9
