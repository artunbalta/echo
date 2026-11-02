"""Does pooling the choices' stability close the echo's gap to copying? An experiment, not the registered analysis.

Six choices' stability, τ²/(τ² + σ²), are each estimated from a dozen pairs of visits. Partial pooling
(`layers.POOL_PAIRS`) shrinks each toward their common mean. It is tried with the stability the same for
all six (the simulation as assumed) and with it unequal (some choices much steadier than others), so
that pooling is not credited for a simulation built to suit it. Writes runs/pooling.json.

    services/ml/.venv/bin/python research/pilot/experiments/pooling.py [reps]
"""
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

#: Unequal stability: around the assumed .6, from .3 (risk) to .9 (giving).
UNEQUAL = {"give": 0.9, "lend": 0.7, "bet": 0.3, "seed": 0.8, "path": 0.5, "greet": 0.4}
POOLS = (0.0, 10.0, 30.0)


def one(args):
    seed, pool, unequal = args
    from echo_pilot import layers
    from echo_pilot.analysis import analyze
    from echo_pilot.simulate import SimParams, make_group

    layers.POOL_PAIRS = pool
    params = SimParams(stable_sd_by=UNEQUAL) if unequal else SimParams()
    export, truth = make_group(16, seed=seed, params=params)
    res = analyze(export, mode="fast", truth=truth, ci=False, minutes=(0, 25))
    w = res["settings"]["again"]["witnesses"]
    duels = {(d["a"], d["b"]): d["p"] for d in res["settings"]["again"]["duels"]}
    return {"seed": seed, "pool": pool, "unequal": unequal, "echo_2l": w["echo_2l"]["skill"], "retest": w["retest"]["skill"], "echo_axes": w["echo_axes"]["skill"], "friends": w["friends"]["skill"], "h1": duels[("echo_axes", "echo_2l")]}


if __name__ == "__main__":
    import numpy as np

    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    t = time.time()
    jobs = [(1000 + 160000 + r, pool, unequal) for unequal in (False, True) for pool in POOLS for r in range(reps)]
    with mp.get_context("spawn").Pool(10) as pool:
        runs = pool.map(one, jobs, chunksize=2)
    out = {"reps": reps, "n": 16, "unequal": UNEQUAL, "results": {}}
    for unequal in (False, True):
        for p in POOLS:
            rs = [r for r in runs if r["unequal"] == unequal and r["pool"] == p]
            key = f"{'unequal' if unequal else 'as assumed'} · pool {p:g}"
            out["results"][key] = {
                "echo_2l": float(np.median([r["echo_2l"] for r in rs])),
                "retest": float(np.median([r["retest"] for r in rs])),
                "echo_axes": float(np.median([r["echo_axes"] for r in rs])),
                "friends": float(np.median([r["friends"] for r in rs])),
                "echo_2l_minus_copying": float(np.median([r["echo_2l"] - r["retest"] for r in rs])),
                "h1_power": float(np.mean([r["h1"] < 0.05 for r in rs])),
            }
            print(key, {k: round(v, 3) for k, v in out["results"][key].items()})
    out["seconds"] = round(time.time() - t, 1)
    (HERE.parent / "runs" / "pooling.json").write_text(json.dumps(out, indent=1))
    print(out["seconds"], "s")
