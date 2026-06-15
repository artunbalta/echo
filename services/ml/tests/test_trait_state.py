"""WI-5 (§9.8) — separate durable trait z from transient state m_t."""
import numpy as np
from echo_ml import persona as P
from echo_ml.persona_model import PersonaModel, fit_state_factors


def _split_model(rng, F=24, K=3, sigma_m=8.0, psi=0.05):
    """Planted model: trait loading W (D,F) + transient state directions V (F,K) that
    partially overlap the trait directions (so un-marginalized they would corrupt z)."""
    W_meas = rng.standard_normal((F, P.D))               # trait directions in feature space
    V = rng.standard_normal((F, K))                       # state directions (NOT orthogonalized)
    Sigma_m = np.full(K, sigma_m)
    Psi = np.full(F, psi)
    W = W_meas.T                                          # (D, F) axis-major
    aware = PersonaModel(W=W, mu_phi=np.zeros(F), Psi=Psi, V=V, Sigma_m=Sigma_m)
    naive = PersonaModel(W=W, mu_phi=np.zeros(F), Psi=Psi)   # no state marginalization
    return aware, naive, W_meas, V, Sigma_m, Psi


def test_state_fluctuation_does_not_move_trait():
    rng = np.random.default_rng(0)
    aware, naive, W_meas, V, Sigma_m, Psi = _split_model(rng)
    F, K = V.shape

    def run(model):
        post = P.prior()
        for _ in range(60):
            m = rng.standard_normal(K) * np.sqrt(Sigma_m)     # pure transient fluctuation
            phi = V @ m + rng.standard_normal(F) * np.sqrt(Psi)  # z_true = 0
            Wm, Pt = model.apply(phi)
            post = P.kalman_update_general(post, model.center(phi), Wm, Pt)
        return np.linalg.norm(post.mu)

    aware_drift = run(aware)
    naive_drift = run(naive)
    # marginalizing the state keeps the trait near its (zero) truth; the naive model is
    # jerked around by the very same fluctuations.
    assert aware_drift < 0.25 * naive_drift
    assert aware_drift < 0.2


def test_true_trait_shift_still_updates_z():
    rng = np.random.default_rng(1)
    aware, _, W_meas, V, Sigma_m, Psi = _split_model(rng)
    F, K = V.shape
    z_star = np.array([0.6, -0.4, 0.3, -0.5, 0.2, 0.4, -0.3, 0.1])
    post = P.prior()
    for _ in range(300):
        m = rng.standard_normal(K) * np.sqrt(Sigma_m)
        phi = W_meas @ z_star + V @ m + rng.standard_normal(F) * np.sqrt(Psi)
        Wm, Pt = aware.apply(phi)
        post = P.kalman_update_general(post, aware.center(phi), Wm, Pt)
    # a genuine trait shift still registers despite the transient fluctuations.
    assert np.mean((post.mu - z_star) ** 2) < 0.05


def test_fit_state_factors_recovers_planted_directions():
    rng = np.random.default_rng(2)
    N, F, K = 4000, 16, 3
    V_true, _ = np.linalg.qr(rng.standard_normal((F, K)))   # orthonormal planted directions
    var = np.array([6.0, 3.0, 1.5])
    M = rng.standard_normal((N, K)) * np.sqrt(var)
    resid = M @ V_true.T + rng.standard_normal((N, F)) * 0.1
    V, Sigma_m, Psi = fit_state_factors(resid, K)
    assert V.shape == (F, K) and Sigma_m.shape == (K,)
    # recovered subspace ≈ planted subspace (projection of V onto span(V_true) ≈ V itself).
    P_true = V_true @ V_true.T
    captured = np.linalg.norm(P_true @ V) / np.linalg.norm(V)
    assert captured > 0.97
    assert np.all(Psi > 0)
    assert abs(Sigma_m[0] - 6.0) < 0.6                      # leading variance recovered


def test_diagonal_fallback_when_no_state_factors():
    # A model without V/Σ_m (clean / un-augmented artifact) must still apply cleanly.
    rng = np.random.default_rng(3)
    F = 20
    model = PersonaModel(W=rng.standard_normal((P.D, F)), mu_phi=np.zeros(F),
                         Psi=0.3 + rng.random(F))
    Wm, Pt = model.apply(rng.standard_normal(F))
    assert Pt.shape == (F, F)
    assert np.allclose(Pt, np.diag(np.diag(Pt)))           # purely diagonal noise
