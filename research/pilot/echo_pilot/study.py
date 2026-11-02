"""The simulation study behind a simulated report (C77): every panel across many groups, not one.

The power run (`power.py`) asks how often each test passes at each size; this asks, at one size, what
every panel of the report looks like across the same groups: each witness's skill in both settings, the
curve, the crossings, the skill by paradigm, the variance split as fitted against as simulated, the
say–do gap and the friends' error, and the retest agreement. Medians and the middle half of groups.
"""
from __future__ import annotations

import multiprocessing as mp
from typing import Optional

import numpy as np

from .analysis import CURVE_WITNESSES, REFERENCES, WITNESSES, analyze
from .paradigms import PARADIGMS
from .simulate import SimParams, make_group


def _one(args: tuple[int, int, Optional[dict]]) -> dict:
    n, seed, overrides = args
    params = SimParams(**overrides) if overrides else SimParams()
    export, truth = make_group(n, seed=seed, params=params)
    res = analyze(export, mode="fast", truth=truth, ci=False)
    keys = (*WITNESSES, *REFERENCES)
    return {
        "seed": seed,
        "skill": {f"{s}:{w}": res["settings"][s]["witnesses"][w]["skill"] for s in ("again", "elsewhere") for w in keys},
        "accuracy": {**{f"{s}:{w}": res["settings"][s]["witnesses"][w]["accuracy"] for s in ("again", "elsewhere") for w in keys}, **{f"{s}:bar": res["settings"][s]["witnesses"]["self"]["accuracy_base"] for s in ("again", "elsewhere")}},
        "by_paradigm": {f"{p}:{w}": res["settings"]["again"]["by_paradigm"][p][w]["skill"] for p in PARADIGMS for w in keys},
        "curve": {w: [res["curve"]["witnesses"][w][t]["skill"] for t in res["curve"]["minutes"]] for w in CURVE_WITNESSES},
        "minutes": res["curve"]["minutes"],
        "lines": res["curve"]["lines"],
        "crossings": res["curve"]["crossings"]["echo_2l"],
        "shares": {f"{p}:{k}": (res["shares"] or {}).get(p, {}).get(k) for p in PARADIGMS for k in ("traits", "own", "visit")},
        "true_shares": res["true_shares"],
        "gap": {f"{p}:{k}": res["gap"][p][k] for p in PARADIGMS for k in ("said", "did", "gap")},
        "holier": {f"{p}:{k}": res["holier"][p][k] for p in PARADIGMS for k in ("self_error", "friends_error")},
        "retest": {p: res["retest"][p]["agree"] for p in PARADIGMS},
    }


def _summary(values: list) -> dict:
    xs = [x for x in values if x is not None and np.isfinite(x)]
    if not xs:
        return {"median": None, "iqr": None, "n": 0}
    return {"median": float(np.median(xs)), "iqr": [float(np.percentile(xs, 25)), float(np.percentile(xs, 75))], "n": len(xs)}


def study(n: int = 16, reps: int = 200, workers: int = 10, overrides: Optional[dict] = None, seed0: int = 1000) -> dict:
    """Every panel's numbers across `reps` simulated groups of `n` (the power run's seeds for that size)."""
    jobs = [(n, seed0 + n * 10_000 + r, overrides) for r in range(reps)]
    with mp.get_context("spawn").Pool(workers) as pool:
        runs = pool.map(_one, jobs, chunksize=2)
    minutes = runs[0]["minutes"]
    out: dict = {"n": n, "reps": reps, "seeds": [r["seed"] for r in runs]}
    for field in ("skill", "accuracy", "by_paradigm", "shares", "gap", "holier", "retest", "lines"):
        out[field] = {k: _summary([r[field][k] for r in runs]) for k in runs[0][field]}
    out["curve"] = {"minutes": minutes, **{w: {"median": [_summary([r["curve"][w][i] for r in runs])["median"] for i in range(len(minutes))], "iqr": [_summary([r["curve"][w][i] for r in runs])["iqr"] for i in range(len(minutes))]} for w in CURVE_WITNESSES}}
    out["crossings"] = {k: {**_summary([r["crossings"][k] for r in runs]), "share": float(np.mean([r["crossings"][k] is not None for r in runs]))} for k in runs[0]["crossings"]}
    out["true_shares"] = runs[0]["true_shares"]
    # The most typical group: the one whose witnesses' skills sit nearest the medians, for the panels that show one group.
    med = {k: v["median"] for k, v in out["skill"].items()}
    def distance(r: dict) -> float:
        return float(sum((r["skill"][k] - med[k]) ** 2 for k in med if r["skill"][k] is not None and med[k] is not None))
    out["typical_seed"] = min(runs, key=distance)["seed"]
    return out
