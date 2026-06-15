"""WI-6 (§9.3/§9.9) — behavioral-reproducibility latent refinement (frozen LLM, black-box)."""
import numpy as np
from echo_ml import persona as P
from echo_ml import reconstruct as R


def test_cem_recovers_planted_latent_better_than_posterior_mean():
    # A "true" z* deterministically generates the reward; CEM from the (zero) posterior mean
    # recovers it far better than the raw mean.
    z_star = np.array([0.6, -0.4, 0.3, -0.7, 0.2, 0.5, -0.1, 0.0])
    post = P.prior()                                   # mean 0
    ref = R.refine_latent(post, score_fn=lambda z: -float(np.sum((z - z_star) ** 2)),
                          gamma=0.0, seed=1)
    assert np.linalg.norm(ref.z - z_star) < np.linalg.norm(post.mu - z_star)
    assert ref.score_after > ref.score_before
    assert np.all(np.abs(ref.z) <= 1.0 + 1e-9)         # stays in bounds


def test_kl_regularizer_prevents_divergence_when_data_is_sparse():
    # With a flat/noisy fidelity (sparse held-out data) the KL regularizer keeps the refined
    # latent anchored to the behavioral posterior instead of wandering to the [-1,1] bounds.
    rng = np.random.default_rng(0)
    post = P.Posterior(np.array([0.2] * P.D), np.eye(P.D) * 0.08, 0)
    noisy = R.refine_latent(post, score_fn=lambda z: float(rng.standard_normal()),
                            gamma=5.0, seed=3)
    assert np.linalg.norm(noisy.z - post.mu) < 0.3     # did not diverge
    # ...whereas with no regularizer and the same flat signal it wanders much further.
    rng2 = np.random.default_rng(0)
    free = R.refine_latent(post, score_fn=lambda z: float(rng2.standard_normal()),
                           gamma=0.0, seed=3)
    assert np.linalg.norm(free.z - post.mu) > np.linalg.norm(noisy.z - post.mu)


def test_kl_to_posterior_is_zero_at_mean_and_grows_with_distance():
    post = P.Posterior(np.zeros(P.D), np.eye(P.D) * 0.1, 0)
    near = R.kl_to_posterior(np.zeros(P.D), post)
    far = R.kl_to_posterior(np.full(P.D, 0.8), post)
    assert far > near >= 0.0


def test_reconstruction_fidelity_is_finite_and_deterministic_offline():
    # Key-free: mock LLM + hash embedder. Same inputs ⇒ same score.
    ex = [("cafe", "hey", "Yeah, I'd love to grab coffee sometime!"),
          ("books", "thoughts?", "Honestly the ending wrecked me.")]
    a = R.reconstruction_fidelity(np.zeros(P.D), ex)
    b = R.reconstruction_fidelity(np.zeros(P.D), ex)
    assert np.isfinite(a) and a == b
    assert R.reconstruction_fidelity(np.zeros(P.D), []) == 0.0   # no held-out ⇒ 0


def test_decode_latent_auxiliary_head():
    traits = R.decode_latent(np.array([0.9, 0.0, 0.0, -0.9, 0.0, 0.0, 0.0, 0.0]))
    assert any("warm" in t for t in traits)
    assert any("calm" in t for t in traits)


def test_refine_does_not_modify_any_llm_weights():
    # §9.9: refinement is black-box. The frozen reward/LLM params are untouched by CEM.
    from echo_ml.reward import RewardModel
    rwd = RewardModel.init(seed=0)
    before = (rwd.W1.copy(), rwd.W2.copy(), float(rwd.b2))
    ex = [("ctx", "msg", "a target message")]
    R.refine_latent(P.prior(), examples=ex, reward=rwd, iters=3, pop=8, seed=0)
    assert np.allclose(rwd.W1, before[0]) and np.allclose(rwd.W2, before[1])
    assert rwd.b2 == before[2]
