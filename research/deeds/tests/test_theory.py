"""The closed forms of deeds/theory.py, held to a Monte Carlo of their own model, and to the pilot's."""
import deeds  # noqa: F401

import math

import numpy as np
import pytest

from deeds import theory as T


def _simulate(rho, pi, n, people=400_000, seed=0):
    """Draw A, U and n + 1 days; the best linear guess from (A, x̄) is what the echo is; return its skill."""
    rng = np.random.default_rng(seed)
    A = rng.normal(0, math.sqrt(pi), people)
    U = rng.normal(0, math.sqrt(rho - pi), people)
    days = rng.normal(0, math.sqrt(1 - rho), (n + 1, people))
    x = A + U + days[:n]
    y = A + U + days[n]
    xbar = x.mean(0)
    # E[U | x̄ − A] by the normal formula: weight on (x̄ − A) is (ρ−π) / ((ρ−π) + (1−ρ)/n)
    w = (rho - pi) / ((rho - pi) + (1 - rho) / n)
    guess = A + w * (xbar - A)
    return 1 - np.mean((y - guess) ** 2) / np.var(y)


@pytest.mark.parametrize("rho,pi,n", [(0.6, 0.0, 1), (0.6, 0.05, 1), (0.8, 0.1, 3), (0.45, 0.02, 5)])
def test_echo_matches_its_model(rho, pi, n):
    assert abs(T.echo(rho, pi, n) - _simulate(rho, pi, n)) < 0.006


def test_the_landmarks():
    assert T.echo(0.6, 0.0, 1) == pytest.approx(0.36)            # one look, no persona: ρ²
    assert T.echo(0.6, 0.05, 10_000) == pytest.approx(0.6, abs=1e-3)  # many looks: ρ
    assert T.copying(0.49) < T.crowd() < T.copying(0.51)          # copying beats the crowd only above ρ = ½
    assert T.echo(0.7, 0.05, 1) > T.copying(0.7)                  # the echo always beats copying


def test_looks_needed_is_the_inverse_of_echo():
    for rho, pi, q in [(0.6, 0.0, 0.8), (0.5, 0.0, 0.8), (0.87, 0.0, 0.8), (0.6, 0.05, 0.9)]:
        n = T.looks_needed(q, rho, pi)
        assert T.echo(rho, pi, 1) <= q * rho + 1e-12 or n <= 1
        # at the real-valued n the echo knows exactly q of the knowable
        s, e = rho - pi, 1 - rho
        assert pi + n * s * s / (n * s + e) == pytest.approx(q * rho)
    assert T.looks_needed(0.8, 0.6) == pytest.approx(0.8 / 0.2 * 0.4 / 0.6)   # q/(1−q) · (1−ρ)/ρ = 2.67


def test_agrees_with_the_pilots_two_layers():
    import importlib.util, pathlib
    path = pathlib.Path(__file__).resolve().parents[2] / "pilot" / "echo_pilot" / "theory.py"
    spec = importlib.util.spec_from_file_location("pilot_theory", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for h2, nu, n in [(0.1, 0.4, 1), (0.05, 0.5, 4), (0.2, 0.3, 9)]:
        assert T.echo(h2 + nu, 0.0, n) == pytest.approx(mod.two_layers(h2, nu, n))
