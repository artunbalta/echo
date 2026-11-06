"""
Registered robustness (PREREG §6): a gradient-boosted median model in place of ridge for the persona
witness, so that the accuracy comparison does not rest on rounding a mean. It uses absolute-error loss, so
its guess is a conditional median, the metric's own optimum. Folds are as everywhere else. Writes
out/twin2k/forward__persona_hgb__point.parquet and __score.parquet (score = the same model's guess).

    /opt/anaconda3/bin/python3.13 research/deeds/robust_hgb_twin2k.py [--workers 9]
"""
import deeds  # noqa: F401

import argparse
import os
import pathlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from deeds.data import features, load
from deeds.witnesses import KIND_SETS, folds_of, rounded

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"


def one(c: str):
    from sklearn.ensemble import HistGradientBoostingRegressor

    tw = load()
    folds = folds_of(len(tw.ids))
    X, _ = features(KIND_SETS["persona"])
    y = tw.w4[c].to_numpy(float)
    sc = np.full(len(y), np.nan)
    for f in np.unique(folds):
        tr = (folds != f) & ~np.isnan(y)
        te = folds == f
        m = HistGradientBoostingRegressor(loss="absolute_error", learning_rate=0.05, max_iter=300, max_leaf_nodes=15,
                                          min_samples_leaf=40, l2_regularization=1.0, early_stopping=True,
                                          validation_fraction=0.15, n_iter_no_change=20, random_state=0)
        m.fit(X[tr], y[tr])
        sc[te] = m.predict(X[te])
    return c, sc, rounded(y, folds, sc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=int(os.environ.get("ECHO_RESEARCH_WORKERS", "9")))
    args = ap.parse_args()
    tw = load()
    with ProcessPoolExecutor(args.workers) as pool:
        res = list(pool.map(one, tw.columns))
    score = pd.DataFrame({c: s for c, s, _ in res}, index=tw.w4.index)[tw.columns]
    point = pd.DataFrame({c: p for c, _, p in res}, index=tw.w4.index)[tw.columns]
    point.to_parquet(OUT / "forward__persona_hgb__point.parquet")
    score.to_parquet(OUT / "forward__persona_hgb__score.parquet")
    print("done", point.notna().to_numpy().mean())


if __name__ == "__main__":
    main()
