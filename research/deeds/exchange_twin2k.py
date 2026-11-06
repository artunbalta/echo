"""
The exchange rate (PREREG §4, descriptive): how many items from each pool of information it takes to know
the person as well as one earlier answer to the same question does.

For each pool (self, choices, tests, facts, others = the other 16 tasks' earlier answers), k items are drawn
at random (an item is a question, with all its encoded columns). Ridge on them predicts every column out
of fold, and the score r is averaged within tasks, then over tasks. There are 20 draws per k. Writes
out/twin2k/exchange.json.

    /opt/anaconda3/bin/python3.13 research/deeds/exchange_twin2k.py [--workers 9]
"""
import deeds  # noqa: F401

import argparse
import json
import os
import pathlib
import re
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

from deeds.data import features, load, others_matrix
from deeds.score import column_r, task_r
from deeds.witnesses import folds_of, ridge_columns

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"
HEADLINE = "Text Persona - GPT4.1-mini"
KS = [1, 2, 4, 8, 16, 32, 64, 128, 256]
POOLS = ("self", "choices", "tests", "facts", "others")
DRAWS = 20


def items_of(names: list[str]) -> dict[str, list[int]]:
    """Encoded columns grouped by the question they came from (one-hot levels of one answer are one item)."""
    out: dict[str, list[int]] = {}
    for i, n in enumerate(names):
        out.setdefault(re.sub(r"==.*$", "", n), []).append(i)
    return out


def run(pool: str, k: int, draw: int):
    import pandas as pd

    tw = load()
    folds = folds_of(len(tw.ids))
    truth = tw.w4
    mask = tw.w13.notna() & tw.w4.notna() & tw.llm[HEADLINE].notna()
    rng = np.random.default_rng(10_000 * KS.index(k) + 100 * draw + POOLS.index(pool))
    score = pd.DataFrame(np.nan, index=truth.index, columns=tw.columns)
    if pool != "others":
        X, names = features((pool,))
        items = items_of(names)
        keys = sorted(items)
        if k > len(keys):
            return pool, k, draw, None
        pick = rng.choice(len(keys), size=k, replace=False)
        cols_idx = [i for j in pick for i in items[keys[j]]]
        Xk = X[:, cols_idx]
    for task in tw.tasks:
        cols = [c for c in tw.columns if tw.task[c] == task]
        if pool == "others":
            Xo, onames = others_matrix(task, "w13")
            if k > Xo.shape[1]:
                return pool, k, draw, None
            Xk = Xo[:, rng.choice(Xo.shape[1], size=k, replace=False)]
        S = ridge_columns(Xk, truth[cols].to_numpy(float), folds)
        score[cols] = S
    r = float(task_r(tw, column_r(score, truth, mask, tw.columns)).mean())
    return pool, k, draw, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=int(os.environ.get("ECHO_RESEARCH_WORKERS", "9")))
    args = ap.parse_args()
    jobs = [(p, k, d) for p in POOLS for k in KS for d in range(DRAWS)]
    res: dict = {}
    progress = OUT / "exchange.progress.jsonl"
    done = set()
    if progress.exists():  # a crashed run's finished draws are kept
        for line in progress.read_text().splitlines():
            row = json.loads(line)
            done.add((row["pool"], row["k"], row["draw"]))
            if row["r"] is not None:
                res.setdefault(row["pool"], {}).setdefault(str(row["k"]), []).append(row["r"])
    todo = [j for j in jobs if j not in done]
    with ProcessPoolExecutor(args.workers) as pool, progress.open("a") as log:
        futs = [pool.submit(run, *j) for j in todo]
        for i, f in enumerate(as_completed(futs), 1):
            p, k, d, r = f.result()
            log.write(json.dumps({"pool": p, "k": k, "draw": d, "r": r}) + "\n")
            log.flush()
            if r is not None:
                res.setdefault(p, {}).setdefault(str(k), []).append(r)
            if i % 50 == 0:
                print(f"{i}/{len(todo)}", flush=True)
    summary = {p: {k: {"mean": float(np.mean(v)), "lo": float(np.quantile(v, 0.1)), "hi": float(np.quantile(v, 0.9)), "n": len(v)} for k, v in ks.items()} for p, ks in res.items()}
    (OUT / "exchange.json").write_text(json.dumps(summary, indent=1))
    for p, ks in summary.items():
        print(p, {k: round(v["mean"], 3) for k, v in sorted(ks.items(), key=lambda kv: int(kv[0]))})


if __name__ == "__main__":
    main()
