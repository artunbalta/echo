"""
Exploratory witnesses (not in PREREG.md; reported as such).

echo_transition is the one-look echo without the linear stacker. For each column it learns, from other
people, what the crowd answered the second time given what it answered the first time. A person's guess is
the median of the second answers of everyone who first answered as they did (their bin, for many-level
scales). It is the empirical form of deeds/ceiling.py's one-look Bayes guess. It needs no persona: the
persona carries too little (the registered analysis) to be worth a parametric bridge.

    /opt/anaconda3/bin/python3.13 research/deeds/exploratory_twin2k.py
"""
import deeds  # noqa: F401

import pathlib

import numpy as np
import pandas as pd

from deeds.data import load
from deeds.witnesses import folds_of, to_admissible

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"
SETTINGS = {"forward": ("w4", "w13"), "published": ("w13", "w4")}
BINS = 10
MIN_BIN = 10


def _bin_edges(x: np.ndarray) -> np.ndarray:
    levels = np.unique(x)
    if len(levels) <= BINS:
        return levels
    return np.unique(np.quantile(x, np.linspace(0, 1, BINS + 1)[1:-1]))


def _bin(x: np.ndarray, edges: np.ndarray, discrete: bool) -> np.ndarray:
    if discrete:
        return np.searchsorted(edges, x)  # exact level index
    return np.searchsorted(edges, x, side="right")


def transition(truth: pd.DataFrame, earlier: pd.DataFrame, folds: np.ndarray, columns: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    point = pd.DataFrame(np.nan, index=truth.index, columns=columns)
    score = point.copy()
    for c in columns:
        y, x = truth[c].to_numpy(float), earlier[c].to_numpy(float)
        p, s = np.full(len(y), np.nan), np.full(len(y), np.nan)
        for f in np.unique(folds):
            tr = (folds != f) & ~np.isnan(x) & ~np.isnan(y)
            te = (folds == f) & ~np.isnan(x)
            edges = _bin_edges(x[tr])
            discrete = len(np.unique(x[tr])) <= BINS
            btr, bte = _bin(x[tr], edges, discrete), _bin(x[te], edges, discrete)
            all_med = to_admissible(np.array([np.median(y[tr])]), y[tr])[0]
            idx = np.where(te)[0]
            for b in np.unique(bte):
                ys = y[tr][btr == b]
                rows = idx[bte == b]
                if len(ys) >= MIN_BIN:
                    p[rows] = to_admissible(np.array([np.median(ys)]), y[tr])[0]
                    s[rows] = ys.mean()
                else:
                    p[rows], s[rows] = all_med, y[tr].mean()
        point[c], score[c] = p, s
    return point, score


def main():
    tw = load()
    folds = folds_of(len(tw.ids))
    for direction, (t, e) in SETTINGS.items():
        point, score = transition(getattr(tw, t), getattr(tw, e), folds, tw.columns)
        point.to_parquet(OUT / f"{direction}__echo_transition__point.parquet")
        score.to_parquet(OUT / f"{direction}__echo_transition__score.parquet")
        print(direction, "done", float(point.notna().to_numpy().mean()))


if __name__ == "__main__":
    main()
