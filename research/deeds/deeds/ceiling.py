"""
What is knowable about a person's answer, and why the retest is not the ceiling.

The field normalises a twin's accuracy by the person's own retest: how often wave 4 matches waves 1–3
(Park et al. 2024; Toubia et al. 2025). But the retest is one noisy answer guessing another noisy
answer. Someone who knew the person exactly, but not the day, would guess better.

On a yes/no item, a person who says yes with propensity π matches themselves with probability
π² + (1 − π)². The oracle that knows π guesses right with probability max(π, 1 − π), which is never less,
and is more whenever 0 < π < 1/2 or 1/2 < π < 1.

**The model.** Each column gets an ordered latent model. The person's steady level is T ~ N(0, ρ). Each
occasion adds independent noise e ~ N(0, 1 − ρ), and the answer is where T + e falls among thresholds set
by the column's answer shares.

- ρ is fitted per column so that the model's retest accuracy (the authors' metric) equals the observed one.
- The model then gives three accuracies:
  - **base**: guessing the crowd's median;
  - **retest**: one answer guessing the next;
  - **ceiling**: guessing the median of the person's own answers given T. This is the most anyone can
    know without knowing the day.
- It also gives the **looks curve**: the Bayes-optimal echo after n earlier answers to the same item, with
  nothing else.

The "personal knowledge index" of a witness is (accuracy − base) / (ceiling − base). It is the share of
what is knowable about the person, beyond the crowd, that the witness knows.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import ndtr, ndtri

NODES, WEIGHTS = np.polynomial.hermite_e.hermegauss(80)  # ∫ f(z) φ(z) dz ≈ Σ w f(z) / √(2π)
WEIGHTS = WEIGHTS / WEIGHTS.sum()


@dataclass
class Column:
    levels: np.ndarray   # the answers, ascending
    shares: np.ndarray   # how often each was given (sums to 1)
    span: float          # the scale's range (the metric's denominator)
    rho: float = 0.5     # the steady share of the latent variance

    @property
    def cuts(self) -> np.ndarray:
        c = np.cumsum(self.shares)[:-1]
        return ndtri(np.clip(c, 1e-9, 1 - 1e-9))


def answer_probs(col: Column, t: np.ndarray) -> np.ndarray:
    """P(answer = level k | steady level t), for each t: len(t) × K."""
    s = np.sqrt(max(1 - col.rho, 1e-9))
    edges = np.concatenate([[-np.inf], col.cuts, [np.inf]])
    cdf = ndtr((edges[None, :] - t[:, None]) / s)
    return np.clip(np.diff(cdf, axis=1), 0, 1)


def _loss_matrix(col: Column) -> np.ndarray:
    return np.abs(col.levels[:, None] - col.levels[None, :]) / col.span


def retest_accuracy(col: Column) -> float:
    t = NODES * np.sqrt(col.rho)
    P = answer_probs(col, t)
    L = _loss_matrix(col)
    return float(1 - np.sum(WEIGHTS * np.einsum("nj,jk,nk->n", P, L, P)))


def base_accuracy(col: Column) -> float:
    L = _loss_matrix(col)
    return float(1 - np.min(col.shares @ L))


def ceiling_accuracy(col: Column) -> float:
    """The oracle knows t: it guesses the answer minimising expected loss given t (the conditional median)."""
    t = NODES * np.sqrt(col.rho)
    P = answer_probs(col, t)
    L = _loss_matrix(col)
    return float(1 - np.sum(WEIGHTS * np.min(P @ L, axis=1)))


def fit_rho(col: Column, observed_retest: float) -> Column:
    """The ρ at which the model's retest accuracy is the observed one (monotone in ρ; bisection)."""
    lo, hi = 1e-4, 0.9999
    if retest_accuracy(Column(col.levels, col.shares, col.span, hi)) <= observed_retest:
        return Column(col.levels, col.shares, col.span, hi)
    if retest_accuracy(Column(col.levels, col.shares, col.span, lo)) >= observed_retest:
        return Column(col.levels, col.shares, col.span, lo)
    for _ in range(60):
        mid = (lo + hi) / 2
        if retest_accuracy(Column(col.levels, col.shares, col.span, mid)) < observed_retest:
            lo = mid
        else:
            hi = mid
    return Column(col.levels, col.shares, col.span, (lo + hi) / 2)


def looks_accuracy(col: Column, n: int, grid: int = 161) -> float:
    """
    The Bayes-optimal echo after n earlier answers to this item and nothing else, in expectation: integrate
    over the person's t, the n answers they gave, and the next one. Exact by enumeration over answer counts
    (the order of the n answers does not matter given t), on a grid for t.
    """
    if n == 0:
        return base_accuracy(col)
    K = len(col.levels)
    tg = np.linspace(-4, 4, grid) * np.sqrt(col.rho)
    prior = np.exp(-0.5 * (tg / np.sqrt(col.rho)) ** 2)
    prior /= prior.sum()
    P = answer_probs(col, tg)                              # grid × K
    L = _loss_matrix(col)
    logP = np.log(np.clip(P, 1e-300, None))
    total = 0.0
    from itertools import combinations_with_replacement
    from math import factorial

    for combo in combinations_with_replacement(range(K), n):
        counts = np.bincount(combo, minlength=K)
        multinom = factorial(n) / np.prod([factorial(int(c)) for c in counts])
        like = np.exp(logP @ counts)                       # P(these answers | t) up to the multinomial
        joint = prior * like * multinom                    # P(t, counts)
        mass = joint.sum()
        if mass < 1e-15:
            continue
        post = joint / mass
        pred = post @ P                                    # predictive distribution of the next answer
        guess = int(np.argmin(pred @ L))                   # its loss-minimising answer
        total += mass * (1 - pred @ L[:, guess])
    return float(total)


def knowledge_index(acc: float, base: float, ceiling: float) -> float:
    """The share of what is knowable about the person, beyond the crowd, that a witness knows."""
    return (acc - base) / (ceiling - base) if ceiling > base else float("nan")


def looks_accuracy_mc(col: Column, n: int, sims: int = 20000, grid: int = 121, seed: int = 0) -> float:
    """
    The same expectation by simulation, for scales with many answers (sliders), where enumerating every
    combination of n answers is out of reach: draw t, n answers and the next, and score the posterior guess.
    """
    if n == 0:
        return base_accuracy(col)
    rng = np.random.default_rng(seed)
    K = len(col.levels)
    tg = np.linspace(-4, 4, grid) * np.sqrt(col.rho)
    logprior = -0.5 * (tg / np.sqrt(col.rho)) ** 2
    P = answer_probs(col, tg)                        # grid × K
    logP = np.log(np.clip(P, 1e-300, None))
    L = _loss_matrix(col)
    t = rng.normal(0, np.sqrt(col.rho), sims)
    Pt = answer_probs(col, t)                        # sims × K
    cum = np.cumsum(Pt, axis=1)
    draws = (rng.random((sims, n + 1, 1)) > cum[:, None, :]).sum(axis=2).clip(0, K - 1)  # sims × (n+1) answer indices
    logpost = logprior[None, :] + logP[:, draws[:, :n]].transpose(1, 0, 2).sum(axis=2)  # sims × grid
    logpost -= logpost.max(axis=1, keepdims=True)
    post = np.exp(logpost)
    post /= post.sum(axis=1, keepdims=True)
    pred = post @ P                                  # sims × K
    guess = np.argmin(pred @ L, axis=1)
    return float(np.mean(1 - L[draws[:, n], guess]))
