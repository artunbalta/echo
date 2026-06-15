"""Behavioral-reproducibility objective — WI-6 (§9.3 doppelgänger goal, §9.9 frozen LLM).

The 8 persona axes are a *means*; the goal is that the policy conditioned on the latent z
produces what the user would actually write. This module adds a generative-fidelity
objective and a black-box latent refinement that nudges z toward behavioral reproducibility
— **without touching LLM weights** (§9.9): the base model stays frozen and is only queried.

Two pieces:

  1. A read-only reconstruction metric. Over held-out real messages a*_t with contexts s_t,
         L(z) = (1/T) Σ_t  sim( π(decode(z), s_t),  a*_t )
     where π is the frozen policy (policy.generate) and sim is the embedding cosine between
     the policy's output and the true message — the offline-friendly proxy for the LLM
     logprob log π(a*_t | decode(z), s_t) when token logprobs are unavailable. Wired into
     /persona/{uid} as a "reconstruction score" and exercised by a CI test.

  2. Black-box latent refinement by CEM (Cross-Entropy Method). Treating L(z) as a black-box
     reward, we search z around the posterior mean, bounded to [-1,1]^D, maximizing
         L(z) − γ · KL( N(z, σ²I) ‖ posterior )
     so the doppelgänger latent never drifts implausibly far from what behavior implied (the
     FA/Kalman posterior is the prior/regularizer). The 8 interpretable axes remain an
     auxiliary head — reported for the UI — while the refined latent is what drives policy.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence
import numpy as np

from .config import HYPER
from .persona import Posterior, decode_traits, gaussian_kl, D
from .embeddings import embed, cosine
from .reward import RewardModel
from .policy import generate

# An example is (context, user_message, target_text): the real message a*_t the user wrote.
Example = tuple[str, str, str]


def decode_latent(z: np.ndarray) -> list[str]:
    """Auxiliary interpretable head: decode a latent vector into trait phrases (for the UI)."""
    return decode_traits(Posterior(np.asarray(z, dtype=float), np.eye(D) * 0.05, 0))


def reconstruction_fidelity(z: np.ndarray, examples: Sequence[Example], *,
                            reward: Optional[RewardModel] = None,
                            generate_fn: Callable = generate,
                            embed_fn: Callable = embed, n: int = 2) -> float:
    """L(z): mean embedding-cosine between the policy's output (conditioned on z) and the
    user's actual message, over held-out examples. Read-only — the LLM is only queried. With
    no examples returns 0.0. Deterministic offline (mock LLM + hash embedder)."""
    examples = list(examples or [])
    if not examples:
        return 0.0
    reward = reward or RewardModel.init()
    post = Posterior(np.clip(np.asarray(z, dtype=float), -1.0, 1.0), np.eye(D) * 0.05, 0)
    total = 0.0
    for context, user_message, target in examples:
        pol = generate_fn(post, reward, context, user_message, [], n=n)
        total += cosine(embed_fn(pol.action), embed_fn(target))
    return total / len(examples)


def kl_to_posterior(z: np.ndarray, posterior: Posterior, sigma: float = 0.1) -> float:
    """KL( N(z, σ²I) ‖ posterior ) — the regularizer pinning the refined latent to what the
    behavioral posterior implied (≈ Mahalanobis distance of z from the posterior mean under
    its precision). Keeps refinement from diverging when held-out data is sparse."""
    return gaussian_kl(z, np.eye(D) * sigma ** 2, posterior.mu, posterior.Sigma)


def cem_refine(objective: Callable[[np.ndarray], float], z0: np.ndarray, *,
               iters: int = 20, pop: int = 40, elite_frac: float = 0.2,
               sigma0: float = 0.3, seed: int = 0,
               bounds: tuple[float, float] = (-1.0, 1.0)) -> tuple[np.ndarray, float]:
    """Maximize a black-box `objective(z)` with the Cross-Entropy Method, bounded to
    `bounds`, seeded. No gradients, no LLM backprop (§9.9). Returns (best_z, best_value)."""
    rng = np.random.default_rng(seed)
    lo, hi = bounds
    mean = np.clip(np.asarray(z0, dtype=float), lo, hi).copy()
    std = np.full(D, sigma0)
    n_elite = max(1, int(round(elite_frac * pop)))
    best_z, best_val = mean.copy(), objective(mean)
    for _ in range(iters):
        samples = np.clip(mean + std * rng.standard_normal((pop, D)), lo, hi)
        vals = np.array([objective(s) for s in samples])
        elite_idx = np.argsort(-vals)[:n_elite]
        elite = samples[elite_idx]
        mean = elite.mean(axis=0)
        std = elite.std(axis=0) + 1e-6
        if vals[elite_idx[0]] > best_val:
            best_val, best_z = float(vals[elite_idx[0]]), samples[elite_idx[0]].copy()
    return best_z, best_val


@dataclass
class Refinement:
    z: np.ndarray              # the reconstruction-optimized latent (drives policy)
    traits: list[str]          # auxiliary interpretable head, decoded from z
    score_before: float        # fidelity at the posterior mean
    score_after: float         # fidelity at the refined latent
    objective: float           # L(z) − γ·KL at the refined latent


def refine_latent(posterior: Posterior, examples: Optional[Sequence[Example]] = None, *,
                  score_fn: Optional[Callable[[np.ndarray], float]] = None,
                  gamma: Optional[float] = None, reward: Optional[RewardModel] = None,
                  iters: int = 20, pop: int = 40, elite_frac: float = 0.2,
                  sigma0: float = 0.3, seed: int = 0) -> Refinement:
    """Refine the latent for behavioral reproducibility (offline / batched — never the hot
    path). Maximizes score_fn(z) − γ·KL(z ‖ posterior) by CEM from the posterior mean. The
    default score_fn is the LLM reconstruction_fidelity over `examples`; tests/offline jobs
    may inject a custom black-box reward."""
    gamma = HYPER.gamma_reconstruction if gamma is None else gamma
    if score_fn is None:
        rwd = reward or RewardModel.init()
        score_fn = lambda z: reconstruction_fidelity(z, examples or [], reward=rwd)

    def objective(z: np.ndarray) -> float:
        return score_fn(z) - gamma * kl_to_posterior(z, posterior)

    z0 = posterior.mu.copy()
    z_star, obj = cem_refine(objective, z0, iters=iters, pop=pop, elite_frac=elite_frac,
                             sigma0=sigma0, seed=seed)
    return Refinement(z=z_star, traits=decode_latent(z_star),
                      score_before=float(score_fn(z0)), score_after=float(score_fn(z_star)),
                      objective=float(obj))
