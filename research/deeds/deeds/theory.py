"""
Who can know what about a person's next answer: the Gaussian theory of the paper's §2.

One kind of situation, standardised. The next answer y = A + U + e:
- A: what a persona can know (its share is π);
- U: the person's own way in this very situation, which no persona carries (ρ − π);
- e: the day (1 − ρ).

ρ is the retest reliability. Earlier answers to the same situation are x_k = A + U + e_k. SKILL is
1 − MSE / var(y), the share of the variance a guess removes. These generalise the pilot's two-layer
closed forms (research/pilot/echo_pilot/theory.py) to an echo that starts from a persona instead of
nothing; with π = 0 they are the same.
"""
from __future__ import annotations

import math


def crowd() -> float:
    """Guessing the crowd's mean: knows nobody."""
    return 0.0


def persona(pi: float) -> float:
    """Elsewhere: everything a persona carries about this situation, and nothing else. Capped at π, however clever the model."""
    return pi


def copying(rho: float) -> float:
    """Guessing one's own last answer: 2ρ − 1. Worse than the crowd whenever ρ < 1/2."""
    return 2 * rho - 1


def echo(rho: float, pi: float, n: int) -> float:
    """
    The two-layer echo after n looks, starting from a persona: π + n(ρ − π)² / (n(ρ − π) + 1 − ρ).
    One look, no persona: ρ². Infinitely many: ρ.
    """
    if n <= 0:
        return pi
    s = rho - pi
    return pi + n * s * s / (n * s + 1 - rho)


def oracle(rho: float) -> float:
    """Knowing the person exactly but not the day: ρ. The knowable ceiling."""
    return rho


def knowing(skill: float, rho: float) -> float:
    """The share of what is knowable about the person that a witness knows (the personal knowledge index)."""
    return skill / rho if rho > 0 else float("nan")


def looks_needed(q: float, rho: float, pi: float = 0.0) -> float:
    """
    How many looks before an echo knows a share q of the knowable. With no persona this is the odds of q
    times the day's share over the person's: n = q/(1−q) · (1−ρ)/ρ. With a persona, solve the general form.
    """
    if not 0 < q < 1:
        raise ValueError("q in (0, 1)")
    target = q * rho
    if pi >= target:
        return 0.0
    s, e = rho - pi, 1 - rho
    # π + n s² / (n s + e) = target  ⇔  n (s² − s (target − π)) = e (target − π)
    need = target - pi
    denom = s * s - s * need
    return math.inf if denom <= 0 else e * need / denom
