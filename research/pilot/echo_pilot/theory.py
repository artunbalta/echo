"""How well an echo can predict the next choice of a kind it has watched n times: Gaussian theory (C77).

One kind of choice, standardised: x_t = wᵀz + u + e_t, with the traits' share h² = var(wᵀz), the person's own
steady share ν = var(u), and the day's ε = 1 − h² − ν. SKILL is 1 − MSE/var(x), the share of the variance a
prediction of the next x removes. The report's explorer draws these lines; the tests hold them to a Monte
Carlo of the model.
"""
from __future__ import annotations


def ceiling(h2: float, nu: float) -> float:
    """Knowing the person exactly (their traits and their own way): ρ = h² + ν, the reliability."""
    return h2 + nu


def axes_ceiling(h2: float, nu: float) -> float:
    """Knowing their traits exactly and nothing else: h². The most any one-layer echo can reach without watching."""
    return h2


def copying(h2: float, nu: float) -> float:
    """Predicting the last choice again: 2ρ − 1 (negative when a choice is less than half steady)."""
    return 2 * (h2 + nu) - 1


def two_layers(h2: float, nu: float, n: int) -> float:
    """After n looks, with a layer for the person's own way: nρ² / (nρ + ε), ρ² after one."""
    if n <= 0:
        return 0.0
    rho, eps = h2 + nu, 1 - h2 - nu
    return n * rho * rho / (n * rho + eps)


def one_layer(h2: float, nu: float, n: int) -> float:
    """
    After n looks, with traits only: everything steady that the traits do not explain is taken for noise,
    so the echo moves c = h² / (h² + (ν + ε)/n) of the way, and scores 2cρ − c²(ρ + ε/n).
    """
    if n <= 0:
        return 0.0
    rho, eps = h2 + nu, 1 - h2 - nu
    c = h2 / (h2 + (nu + eps) / n)
    return 2 * c * rho - c * c * (rho + eps / n)


def looks_to_catch_up(h2: float, nu: float, limit: int = 400) -> int | None:
    """How many looks one layer needs to know what two layers know after one."""
    target = two_layers(h2, nu, 1)
    for n in range(1, limit + 1):
        if one_layer(h2, nu, n) >= target:
            return n
    return None
