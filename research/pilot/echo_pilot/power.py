"""How many friends the pilot needs (C76, C77): the analysis run on many simulated groups of each size.

For each group size, many groups are simulated (`simulate.make_group`, its assumptions as given) and
analysed exactly as the real data will be (`analysis.analyze`, the engine on the library path, which the
tests hold to the endpoints bit for bit). A hypothesis's POWER at a size is the share of groups in which
its test comes out at p < .05. The planned tests:

- in `again`: each of self, friends and the two-layer echo beats the bar; the two-layer echo beats the
  one-layer echo, the engine's echo, the friends, the person's own words and the questionnaire twin;
  the three together beat self and friends alone (one-sided, sign-flip);
- in `elsewhere`: self, friends and the two-layer echo beat the bar;
- people say they would give more than they do (`gap_give`), and more than their friends think they
  will (`holier_give`), two-sided.

Scored by the RPS instead (`analysis.duel_rps`; a test name ending ":rps"), the central test had less
power at 16 people (.35 against .57, 60 groups): with so few people the two-layer echo's probabilities
are not yet calibrated, though the choice it names is. MAE stays the registered score.
"""
from __future__ import annotations

import multiprocessing as mp
from typing import Iterable, Optional

import numpy as np

from .analysis import CURVE_WITNESSES, REFERENCES, WITNESSES, analyze
from .simulate import SimParams, make_group

ALPHA = 0.05
TESTS = (
    "again:self>bar",
    "again:friends>bar",
    "again:echo_2l>bar",
    "again:echo_2l>echo_axes",
    "again:echo_2l>echo",
    "again:echo_2l>friends",
    "again:echo_2l>self",
    "again:echo_2l>traits",
    "again:together>self",
    "again:together>friends",
    "elsewhere:self>bar",
    "elsewhere:friends>bar",
    "elsewhere:echo_2l>bar",
    "gap_give",
    "holier_give",
)


def tests_of(res: dict) -> dict[str, Optional[float]]:
    """The p value of each planned test in one analysis."""
    out: dict[str, Optional[float]] = {}
    duels = {(d["a"], d["b"]): d["p"] for d in res["settings"]["again"]["duels"]}
    duels_rps = {(d["a"], d["b"]): d["p"] for d in res["settings"]["again"]["duels_rps"]}
    for t in TESTS:
        if t.endswith(":rps"):
            b, a = t.split(":")[1].split(">")
            out[t] = duels_rps.get((a, b))
        elif t == "gap_give":
            out[t] = res["gap"]["give"]["p"]
        elif t == "holier_give":
            out[t] = res["holier"]["give"]["p"]
        else:
            setting, rest = t.split(":")
            b, a = rest.split(">")
            out[t] = res["settings"][setting]["witnesses"][b]["p"] if a == "bar" else duels.get((a, b))
    return out


def _one(args: tuple[int, int, Optional[dict]]) -> dict:
    n, seed, overrides = args
    params = SimParams(**overrides) if overrides else SimParams()
    export, truth = make_group(n, seed=seed, params=params)
    res = analyze(export, mode="fast", truth=truth, ci=False)
    skills = {f"{name}:{w}": res["settings"][name]["witnesses"][w]["skill"] for name in ("again", "elsewhere") for w in (*WITNESSES, *REFERENCES)}
    curve = {w: [res["curve"]["witnesses"][w][t]["skill"] for t in res["curve"]["minutes"]] for w in CURVE_WITNESSES}
    lines = res["curve"]["lines"]
    return {"p": tests_of(res), "skill": skills, "curve": curve, "minutes": res["curve"]["minutes"], "lines": lines, "crossings": res["curve"]["crossings"]["echo_2l"]}


def _median(xs: list) -> Optional[float]:
    xs = [x for x in xs if x is not None]
    return float(np.median(xs)) if xs else None


def _quartiles(xs: list) -> Optional[list[float]]:
    xs = [x for x in xs if x is not None]
    return [float(np.percentile(xs, 25)), float(np.percentile(xs, 75))] if xs else None


def power(sizes: Iterable[int] = (6, 8, 10, 12, 16, 20, 30), reps: int = 200, workers: int = 8, overrides: Optional[dict] = None, seed0: int = 1000) -> dict:
    """Power of each planned test at each group size, with the skills and the curve each size reaches."""
    jobs = [(n, seed0 + n * 10_000 + r, overrides) for n in sizes for r in range(reps)]
    ctx = mp.get_context("spawn")
    with ctx.Pool(workers) as pool:
        results = pool.map(_one, jobs, chunksize=2)
    table: dict[int, list[dict]] = {}
    for (n, _, _), res in zip(jobs, results):
        table.setdefault(n, []).append(res)
    out: dict = {"alpha": ALPHA, "reps": reps, "tests": list(TESTS), "sizes": {}}
    for n, runs in sorted(table.items()):
        minutes = runs[0]["minutes"]
        crossing_lines = runs[0]["crossings"].keys()
        out["sizes"][n] = {
            "power": {t: float(np.mean([(r["p"][t] is not None and r["p"][t] < ALPHA) for r in runs])) for t in TESTS},
            "skill": {k: {"median": _median([r["skill"][k] for r in runs]), "iqr": _quartiles([r["skill"][k] for r in runs])} for k in runs[0]["skill"]},
            "curve": {
                "minutes": minutes,
                **{w: {"median": [_median([r["curve"][w][i] for r in runs]) for i in range(len(minutes))], "iqr": [_quartiles([r["curve"][w][i] for r in runs]) for i in range(len(minutes))]} for w in CURVE_WITNESSES},
                "lines": {k: _median([r["lines"][k] for r in runs]) for k in runs[0]["lines"]},
            },
            "crossings": {k: {"median": _median([r["crossings"][k] for r in runs]), "share": float(np.mean([r["crossings"][k] is not None for r in runs]))} for k in crossing_lines},
        }
    return out
