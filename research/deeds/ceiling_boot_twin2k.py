"""
How sure is the knowable ceiling? A bootstrap over people of everything deeds/ceiling.py derives from
the data. In each draw the same resampled people feed:
- every column's answer shares and observed retest;
- the fitted ρ;
- the crowd, the ceiling and the one- and three-look echo;
- the personal knowledge index of the observed witnesses, from their per-person accuracies on the same
  people.
Writes out/twin2k/ceiling_boot.json (intervals: 2.5th and 97.5th percentiles).

    /opt/anaconda3/bin/python3.13 research/deeds/ceiling_boot_twin2k.py [--draws 200] [--workers 4]
"""
import deeds  # noqa: F401

import argparse
import json
import pathlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from deeds.ceiling import Column, base_accuracy, ceiling_accuracy, fit_rho, looks_accuracy, looks_accuracy_mc
from deeds.data import load

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"
HEADLINE = "Text Persona - GPT4.1-mini"
WITNESSES = ["base", "again", "echo", "echo_transition", f"llm:{HEADLINE}"]


def one_draw(seed: int):
    tw = load()
    rng = np.random.default_rng(seed)
    n = len(tw.ids)
    pick = rng.integers(0, n, n)
    mask = (tw.w13.notna() & tw.w4.notna() & tw.llm[HEADLINE].notna()).to_numpy()
    a13, a4 = tw.w13.to_numpy(float), tw.w4.to_numpy(float)
    per_col = {}
    for j, c in enumerate(tw.columns):
        m = mask[pick, j]
        a, b = a13[pick, j][m], a4[pick, j][m]
        span = tw.range_of(c)
        observed = float(np.mean(1 - np.abs(a - b) / span))
        levels, counts = np.unique(np.concatenate([a, b]), return_counts=True)
        col = fit_rho(Column(levels, counts / counts.sum(), span), observed)
        exact = len(levels) <= 12
        per_col[c] = {
            "base": base_accuracy(col), "ceiling": ceiling_accuracy(col),
            "looks_1": looks_accuracy(col, 1) if exact else looks_accuracy_mc(col, 1, sims=8000, seed=seed),
            "looks_3": looks_accuracy(col, 3) if exact else looks_accuracy_mc(col, 3, sims=8000, seed=seed),
        }
    df = pd.DataFrame(per_col).T
    df["task"] = [tw.task[c] for c in df.index]
    overall = df.groupby("task").mean().mean().to_dict()
    pp = pd.read_parquet(OUT / "forward__per_person_accuracy.parquet")
    acc = {w: float(pp[w].to_numpy()[pick].mean()) for w in WITNESSES if w in pp.columns}
    base = acc["base"]
    know = {w: (v - base) / (overall["ceiling"] - base) for w, v in acc.items() if w != "base"}
    return {"model": overall, "observed": acc, "knows": know}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=200)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    with ProcessPoolExecutor(args.workers) as pool:
        draws = list(pool.map(one_draw, range(args.draws)))

    def interval(values):
        v = np.array(values)
        return {"lo": float(np.quantile(v, 0.025)), "hi": float(np.quantile(v, 0.975)), "median": float(np.median(v))}

    out = {"draws": args.draws,
           "model": {k: interval([d["model"][k] for d in draws]) for k in draws[0]["model"]},
           "knows": {k: interval([d["knows"][k] for d in draws]) for k in draws[0]["knows"]}}
    (OUT / "ceiling_boot.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
