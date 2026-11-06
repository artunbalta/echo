"""
The registered analysis's heavy part (PREREG.md §3): every model-based witness, out of fold, saved to
out/twin2k/. Cheap witnesses (base, again, the released twins, the echo on the twins) are made where they
are scored, in analyze_twin2k.py.

    /opt/anaconda3/bin/python3.13 research/deeds/run_twin2k.py [--only forward] [--workers 10]

Jobs are (direction, witness, task) and run in parallel processes, one BLAS thread each (deeds/__init__.py).
"""
import deeds  # noqa: F401  (pins BLAS threads before numpy loads)

import argparse
import os
import pathlib
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

import pandas as pd

from deeds.data import load
from deeds.witnesses import KIND_SETS, echo, folds_of, regression

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"

# Forward: the truth is wave 4 and everything else is waves 1–3 (primary). Published: the authors' way round.
DIRECTIONS = {
    "forward": {"truth": "w4", "earlier": "w13", "others": "w13"},
    "published": {"truth": "w13", "earlier": "w4", "others": None},
}
WITNESSES = {
    "forward": [*KIND_SETS, "persona+others", "echo", "echo_persona"],
    "published": [*KIND_SETS, "echo_persona"],
}


def setting(tw, direction: str):
    d = DIRECTIONS[direction]
    return getattr(tw, d["truth"]), getattr(tw, d["earlier"]), d["others"]


def job(direction: str, witness: str, task: str):
    tw = load()
    folds = folds_of(len(tw.ids))
    truth, earlier, others = setting(tw, direction)
    cols = [c for c in tw.columns if tw.task[c] == task]
    weights = None
    if witness in KIND_SETS:
        point, score = regression(tw, truth, folds, KIND_SETS[witness], None, tasks=[task])
    elif witness == "persona+others":
        point, score = regression(tw, truth, folds, KIND_SETS["persona"], others, tasks=[task])
    elif witness == "echo":
        point, score, weights = echo(tw, truth, earlier, folds, KIND_SETS["persona"], others, tasks=[task])
    elif witness == "echo_persona":
        point, score, weights = echo(tw, truth, earlier, folds, KIND_SETS["persona"], None, tasks=[task])
    else:
        raise ValueError(witness)
    return direction, witness, task, point[cols], score[cols], weights


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(DIRECTIONS), default=None)
    ap.add_argument("--workers", type=int, default=int(os.environ.get("ECHO_RESEARCH_WORKERS", "10")))
    ap.add_argument("--witness", action="append", default=None)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    tw = load()
    jobs = [(d, w, t) for d in DIRECTIONS if not args.only or d == args.only
            for w in WITNESSES[d] if not args.witness or w in args.witness for t in tw.tasks]
    # The slow ones first, so the pool's tail is short.
    jobs.sort(key=lambda j: (not j[1].startswith("echo"), j[1] != "persona+others"))
    done: dict[tuple[str, str], list] = {}
    t0 = time.time()
    with ProcessPoolExecutor(args.workers) as pool:
        futs = [pool.submit(job, *j) for j in jobs]
        for i, fut in enumerate(as_completed(futs), 1):
            d, w, t, point, score, weights = fut.result()
            done.setdefault((d, w), []).append((point, score, weights))
            print(f"[{i}/{len(jobs)}] {time.time() - t0:7.0f}s  {d:9s} {w:15s} {t}", flush=True)
            parts = done[(d, w)]
            if len(parts) == len(tw.tasks):
                pd.concat([p for p, _, _ in parts], axis=1)[tw.columns].to_parquet(OUT / f"{d}__{w}__point.parquet")
                pd.concat([s for _, s, _ in parts], axis=1)[tw.columns].to_parquet(OUT / f"{d}__{w}__score.parquet")
                ws = [x for _, _, x in parts if x is not None]
                if ws:
                    pd.concat(ws).to_parquet(OUT / f"{d}__{w}__weights.parquet")


if __name__ == "__main__":
    main()
