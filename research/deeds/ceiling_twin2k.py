"""
The knowable ceiling for every scored column of Twin-2K-500 (deeds/ceiling.py), from the column's answer
shares and its observed retest. Then the looks curve: the Bayes-optimal echo after n earlier answers to the
item and nothing else. Writes out/twin2k/ceiling.json.

    /opt/anaconda3/bin/python3.13 research/deeds/ceiling_twin2k.py
"""
import deeds  # noqa: F401

import json
import pathlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from deeds.ceiling import Column, base_accuracy, ceiling_accuracy, fit_rho, looks_accuracy, looks_accuracy_mc, retest_accuracy
from deeds.data import load

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"
HEADLINE = "Text Persona - GPT4.1-mini"
LOOKS = [0, 1, 2, 3, 5, 8, 13, 20]


def one(c: str):
    tw = load()
    mask = tw.w13[c].notna() & tw.w4[c].notna() & tw.llm[HEADLINE][c].notna()
    a, b = tw.w13.loc[mask, c].to_numpy(float), tw.w4.loc[mask, c].to_numpy(float)
    span = tw.range_of(c)
    observed = float(np.mean(1 - np.abs(a - b) / span))
    vals = np.concatenate([a, b])
    levels, counts = np.unique(vals, return_counts=True)
    col = fit_rho(Column(levels, counts / counts.sum(), span), observed)
    exact = len(levels) <= 12
    curve = {n: (looks_accuracy(col, n) if exact and n <= 8 else looks_accuracy_mc(col, n)) for n in LOOKS}
    return c, {"task": tw.task[c], "levels": int(len(levels)), "rho": col.rho, "observed_retest": observed, "model_retest": retest_accuracy(col),
               "base": base_accuracy(col), "ceiling": ceiling_accuracy(col), "looks": curve, "n": int(mask.sum())}


def main():
    tw = load()
    with ProcessPoolExecutor(3) as pool:
        cols = dict(pool.map(one, tw.columns))
    df = pd.DataFrame({c: {k: v for k, v in d.items() if k != "looks"} for c, d in cols.items()}).T
    for n in LOOKS:
        df[f"looks_{n}"] = [cols[c]["looks"][n] for c in df.index]
    num = df.drop(columns=["task"]).astype(float)
    num["task"] = df["task"]
    by_task = num.groupby("task").mean(numeric_only=True)
    overall = by_task.mean()
    out = {"overall": overall.round(4).to_dict(), "by_task": by_task.round(4).to_dict(orient="index"),
           "columns": {c: {k: (v if not isinstance(v, dict) else {str(n): x for n, x in v.items()}) for k, v in d.items()} for c, d in cols.items()}}
    (OUT / "ceiling.json").write_text(json.dumps(out, indent=1, default=float))
    print(by_task[["rho", "observed_retest", "model_retest", "base", "ceiling", "looks_1", "looks_3", "looks_8"]].round(3).to_string())
    print("overall:", overall[["observed_retest", "base", "ceiling", "looks_1", "looks_3", "looks_8", "looks_20"]].round(4).to_dict())


if __name__ == "__main__":
    main()
