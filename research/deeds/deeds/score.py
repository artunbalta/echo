"""
How a witness is scored (PREREG §3, §5).

- **Accuracy** is the authors' metric:
  - each cell scores 1 − |prediction − truth| / range;
  - a task's cells are averaged;
  - a person's tasks are averaged;
  - then people are averaged.
- **Individual-level r** asks the question that accuracy cannot: across people, does the witness put the
  ones who answer higher above the ones who answer lower? It is Pearson r per column, averaged within a
  task, then over tasks. A constant witness has no r; it is scored 0, because it knows nobody.

Inference resamples people, never cells: a person's 126 answers are not 126 people.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .data import Twin


def person_accuracy(tw: Twin, pred: pd.DataFrame, truth: pd.DataFrame, mask: pd.DataFrame) -> pd.Series:
    """Per person, the mean over tasks of the mean over the task's scored cells. NaN for a person with no cell."""
    rng = pd.Series({c: tw.range_of(c) for c in tw.columns})
    err = (pred[tw.columns] - truth[tw.columns]).abs().div(rng, axis=1)
    err = err.where(mask[tw.columns])
    per_task = pd.DataFrame({t: err[[c for c in tw.columns if tw.task[c] == t]].mean(axis=1) for t in tw.tasks})
    return 1 - per_task.mean(axis=1)


def task_accuracy(tw: Twin, pred: pd.DataFrame, truth: pd.DataFrame, mask: pd.DataFrame) -> pd.Series:
    """Per task, the mean over its scored cells (people × columns pooled), as the authors' task table."""
    rng = pd.Series({c: tw.range_of(c) for c in tw.columns})
    err = (pred[tw.columns] - truth[tw.columns]).abs().div(rng, axis=1).where(mask[tw.columns])
    return pd.Series({t: 1 - np.nanmean(err[[c for c in tw.columns if tw.task[c] == t]].to_numpy()) for t in tw.tasks})


def column_r(pred: pd.DataFrame, truth: pd.DataFrame, mask: pd.DataFrame, columns: list[str]) -> pd.Series:
    """Pearson r across people per column, over the masked cells; 0 when the witness (or the truth) is constant there."""
    out = {}
    for c in columns:
        m = mask[c].to_numpy() & pred[c].notna().to_numpy() & truth[c].notna().to_numpy()
        a = pred[c].to_numpy(dtype=float)[m]
        b = truth[c].to_numpy(dtype=float)[m]
        if len(a) < 3 or a.std() == 0 or b.std() == 0:
            out[c] = 0.0
        else:
            out[c] = float(np.corrcoef(a, b)[0, 1])
    return pd.Series(out)


def task_r(tw: Twin, col_r: pd.Series) -> pd.Series:
    """Per task, the mean of its columns' r."""
    return pd.Series({t: float(col_r[[c for c in tw.columns if tw.task[c] == t]].mean()) for t in tw.tasks})


def boot_r(tw: Twin, pred: pd.DataFrame, truth: pd.DataFrame, mask: pd.DataFrame, draws: int = 2000, seed: int = 0) -> np.ndarray:
    """
    The mean-over-tasks r under resampling of people: `draws` values. Each draw reweights people by multinomial
    counts and recomputes every column's weighted r, so a person drawn twice counts twice in every column.
    """
    rng = np.random.default_rng(seed)
    n = len(tw.ids)
    W = rng.multinomial(n, np.full(n, 1 / n), size=draws).astype(float)  # draws × people
    per_col = {}
    for c in tw.columns:
        m = mask[c].to_numpy() & pred[c].notna().to_numpy() & truth[c].notna().to_numpy()
        a = np.where(m, pred[c].to_numpy(dtype=float), 0.0)
        b = np.where(m, truth[c].to_numpy(dtype=float), 0.0)
        w = W * m  # draws × people
        sw = w.sum(1)
        ma, mb = (w @ a) / sw, (w @ b) / sw
        va = (w @ (a * a)) / sw - ma**2
        vb = (w @ (b * b)) / sw - mb**2
        cov = (w @ (a * b)) / sw - ma * mb
        with np.errstate(invalid="ignore", divide="ignore"):
            r = cov / np.sqrt(va * vb)
        per_col[c] = np.where((va > 1e-12) & (vb > 1e-12), r, 0.0)
    tasks = tw.tasks
    by_task = np.stack([np.mean([per_col[c] for c in tw.columns if tw.task[c] == t], axis=0) for t in tasks])
    return by_task.mean(0)


def boot_mean(x: np.ndarray, draws: int = 2000, seed: int = 0) -> np.ndarray:
    """The mean of per-person values under resampling of people."""
    rng = np.random.default_rng(seed)
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    idx = rng.integers(0, len(x), size=(draws, len(x)))
    return x[idx].mean(1)


def interval(samples: np.ndarray, level: float = 0.95) -> tuple[float, float]:
    a = (1 - level) / 2
    return float(np.quantile(samples, a)), float(np.quantile(samples, 1 - a))


def sign_test(wins: int, n: int) -> float:
    """One-sided exact binomial: the chance of at least `wins` successes in n fair coin flips."""
    from math import comb

    return sum(comb(n, k) for k in range(wins, n + 1)) / 2**n
