"""Small-sample statistics for a group of friends, with numpy alone.

A pilot among friends is a handful of people, so every inference here resamples or permutes PEOPLE, never
items (a person's six choices are not six independent people), and a paired test is a sign-flip test,
exact when the group is small enough to enumerate (2^n flips up to n = 16).
"""
from __future__ import annotations

import functools
import itertools
import math
from typing import Callable, Optional, Sequence

import numpy as np


def quiet_fp(fn):
    """
    The engine's own `_numerics.quiet_fp`, for the same reason: on macOS, NumPy 2 on Accelerate raises
    divide/overflow/invalid flags on valid matmuls. Warning behaviour only, never arithmetic; real
    non-finite values are caught by the assertions where results are made.
    """

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
            return fn(*args, **kwargs)

    return wrapper


def mean(xs: Sequence[float]) -> Optional[float]:
    xs = [x for x in xs if x is not None]
    return float(np.mean(xs)) if xs else None


def pearson(x: Sequence[float], y: Sequence[float]) -> dict:
    """r with its Fisher-z 95% interval, over pairs where both are present. Null below three pairs or no spread."""
    pairs = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    n = len(pairs)
    if n < 3:
        return {"r": None, "n": n, "lo": None, "hi": None}
    a = np.array([p[0] for p in pairs], dtype=float)
    b = np.array([p[1] for p in pairs], dtype=float)
    if a.std() == 0 or b.std() == 0:
        return {"r": None, "n": n, "lo": None, "hi": None}
    r = float(np.corrcoef(a, b)[0, 1])
    if n <= 3 or abs(r) >= 1:
        return {"r": r, "n": n, "lo": None, "hi": None}
    zr, se = math.atanh(r), 1 / math.sqrt(n - 3)
    return {"r": r, "n": n, "lo": math.tanh(zr - 1.96 * se), "hi": math.tanh(zr + 1.96 * se)}


def sign_flip(d: Sequence[float], alternative: str = "greater", draws: int = 20000, seed: int = 0) -> Optional[float]:
    """
    The paired test: under the null each person's difference is as likely to have the other sign. Exact up
    to 16 people, Monte Carlo beyond. `greater` asks whether the mean difference is above zero.
    """
    d = np.array([x for x in d if x is not None], dtype=float)
    n = len(d)
    if n == 0:
        return None
    observed = d.mean()
    if n <= 16:
        signs = np.array(list(itertools.product((1.0, -1.0), repeat=n)))
    else:
        rng = np.random.default_rng(seed)
        signs = rng.choice((1.0, -1.0), size=(draws, n))
    null = (signs * np.abs(d)).mean(axis=1)
    eps = 1e-12
    if alternative == "greater":
        return float(np.mean(null >= observed - eps))
    if alternative == "less":
        return float(np.mean(null <= observed + eps))
    return float(np.mean(np.abs(null) >= abs(observed) - eps))


def bootstrap(people: Sequence, statistic: Callable[[Sequence], Optional[float]], draws: int = 2000, seed: int = 0) -> tuple[Optional[float], Optional[float]]:
    """A 95% percentile interval for a statistic of a group, resampling people with replacement."""
    if not people:
        return None, None
    rng = np.random.default_rng(seed)
    n = len(people)
    values = []
    for _ in range(draws):
        sample = [people[i] for i in rng.integers(0, n, size=n)]
        v = statistic(sample)
        if v is not None and math.isfinite(v):
            values.append(v)
    if len(values) < draws * 0.5:
        return None, None
    return float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))


def dz(d: Sequence[float]) -> Optional[float]:
    """Cohen's d for paired differences."""
    d = np.array([x for x in d if x is not None], dtype=float)
    if len(d) < 2 or d.std(ddof=1) == 0:
        return None
    return float(d.mean() / d.std(ddof=1))


def profile_r(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    """Within-person profile correlation across the eight axes."""
    return pearson(a, b)["r"]
