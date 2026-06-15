"""Active-learning NPC selection — §9.6 (BALD / expected information gain).

Pick the NPC that maximizes information about the persona latent z:

    n* = argmax_n  I(z ; r_n | H)
       = argmax_n  H[ E_q p(r_n|z) ]  −  E_q H[ p(r_n|z) ]        (BALD)

Intuition: choose the NPC the model is uncertain about *marginally* (high total entropy)
but confident about *per-z* (low expected entropy) — the encounter that best
disambiguates competing hypotheses about the user. This is why the NPCs are a *spanning*
set (§8): only a set covering persona space contains such maximally-discriminative probes.

Outcome model: the user responds positively to NPC n with probability
    p(r_n = 1 | z) = σ( gain · <z, a_n> )
where a_n is the NPC's persona-axis vector — i.e. the user warms to people aligned with
their own persona. The MC approximation samples z ~ q(z|H).
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from .persona import Posterior


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _binary_entropy(p: np.ndarray | float) -> np.ndarray | float:
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return -(p * np.log(p) + (1 - p) * np.log(1 - p))


@dataclass
class BaldScore:
    npc_id: str
    score: float          # mutual information I(z; r_n | H)  (nats)
    predictive_p: float   # marginal P(positive response)
    aleatoric: float      # E_q H[p(r_n|z)]  (irreducible)


def bald_scores(
    post: Posterior,
    npcs: list[tuple[str, np.ndarray]],
    samples: int = 256,
    gain: float = 1.5,
    seed: int = 0,
) -> list[BaldScore]:
    """Compute BALD scores for each (npc_id, axis_vector). Returns sorted desc by score."""
    rng = np.random.default_rng(seed)
    # MC samples from the diagonal-Gaussian posterior q(z|H).
    z = rng.normal(post.mu, np.sqrt(post.var), size=(samples, post.mu.shape[0]))  # (S, d)

    out: list[BaldScore] = []
    for npc_id, a in npcs:
        a = np.asarray(a, dtype=float)
        logits = gain * (z @ a)            # (S,)
        p_s = _sigmoid(logits)             # per-sample response prob
        p_bar = float(p_s.mean())          # predictive (marginal) prob
        total_H = float(_binary_entropy(p_bar))          # H[ E_q p ]
        expected_H = float(_binary_entropy(p_s).mean())  # E_q H[ p ]
        mi = max(0.0, total_H - expected_H)              # BALD (≥0)
        out.append(BaldScore(npc_id, mi, p_bar, expected_H))

    out.sort(key=lambda s: s.score, reverse=True)
    return out


def select_npc(post: Posterior, npcs: list[tuple[str, np.ndarray]], **kw) -> BaldScore | None:
    scores = bald_scores(post, npcs, **kw)
    return scores[0] if scores else None
