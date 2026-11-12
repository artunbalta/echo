"""
The Python side of the twin audit's parity test (DECISIONS C90).

It builds a small panel to known shapes, runs research/deeds/audit.py on it, and writes everything the
TypeScript port needs to be held to it: the inputs, numpy's folds, the crowd, the audit's whole output,
and a few values of the numerics underneath (scipy's ndtr and ndtri, numpy's hermegauss(80), the
ordinal ceiling's three accuracies, the theory's closed forms).

    /opt/anaconda3/bin/python3.13 apps/web/tests/fixtures/knowable_fixture.py

The panel is synthetic (a seeded latent model); no row of anyone's data is in it. It is built to be
awkward on purpose: missing answers in both waves, ids in a different order in each file, people in
one wave and not the other, an item listed with no column, and twins that are silent for some people,
constant, continuous, or an exact line through the earlier answer (so the stacker's design loses rank).

One item, `knife`, is there to catch a leak. Half the folds answer 2 and half answer 4, so the crowd
for a person, read from the other folds, is the other side's answer. A crowd that also read the
person's own fold would say the same thing to everyone, and the parity test would see it at once.
"""
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[3] / "research" / "deeds"))

import deeds  # noqa: E402,F401  (pins BLAS to one thread)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.special import ndtr, ndtri  # noqa: E402

from audit import Panel, audit  # noqa: E402
from deeds import theory as T  # noqa: E402
from deeds.ceiling import NODES, WEIGHTS, Column, base_accuracy, ceiling_accuracy, fit_rho, retest_accuracy  # noqa: E402
from deeds.witnesses import folds_of  # noqa: E402


def clean(x):
    """JSON has no NaN: missing is null."""
    if isinstance(x, dict):
        return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return None if math.isnan(x) else float(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    return x


def table(df: pd.DataFrame) -> dict:
    return {"ids": [str(i) for i in df.index], "columns": [str(c) for c in df.columns], "values": clean(df.to_numpy(dtype=float).tolist())}


def build():
    rng = np.random.default_rng(7)
    n = 306
    spec = [  # item, group, lo, hi, reliability
        ("q0", "a", 1, 5, 0.75), ("q1", "a", 1, 5, 0.55), ("q2", "a", 1, 7, 0.65),
        ("q3", "b", 1, 5, 0.45), ("q4", "b", 0, 1, 0.60), ("q5", "b", 1, 7, 0.80),
        ("q6", "c", 1, 5, 0.35), ("q7", "c", 1, 5, 0.70),
    ]
    cols = [s[0] for s in spec]
    ids = [f"p{i:03d}" for i in range(n)]
    person = rng.normal(0, 1, n)  # a little of everyone runs through all their answers
    steady = np.column_stack([np.sqrt(rho) * (0.4 * person + np.sqrt(1 - 0.16) * rng.normal(0, 1, n)) for *_, rho in spec])

    def wave():
        out = np.empty((n, len(spec)))
        for j, (_, _, lo, hi, rho) in enumerate(spec):
            z = steady[:, j] + rng.normal(0, np.sqrt(1 - rho), n)
            mid, half = (lo + hi) / 2, (hi - lo) / 2
            out[:, j] = np.clip(np.round(mid + 0.15 * half + z * half * 0.6), lo, hi)
        return out

    truth = pd.DataFrame(wave(), index=ids, columns=cols)
    earlier = pd.DataFrame(wave(), index=ids, columns=cols)
    # the knife-edge item: the 300 people of the panel are ids[:300] in this order, so these are their folds
    side = np.full(n, 3.0)
    side[:300] = np.where(folds_of(300) < 5, 2.0, 4.0)
    truth["knife"] = side
    earlier["knife"] = np.clip(side + rng.choice([-1.0, 0.0, 0.0, 0.0, 1.0], n), 1, 5)
    spec.append(("knife", "c", 1, 5, None))
    cols.append("knife")
    truth = truth.mask(rng.random(truth.shape) < 0.03)
    earlier = earlier.mask(rng.random(earlier.shape) < 0.03)
    truth = truth.drop(index=ids[300:303])                      # three people only in the earlier wave
    earlier = earlier.drop(index=ids[303:306])                  # three only in the later one
    earlier = earlier.iloc[rng.permutation(len(earlier))]       # and the files do not agree on an order
    earlier = earlier[["q3", "q0", "knife", "q7", "q1", "q2", "q4", "q5", "q6"]]
    items = pd.DataFrame({"item": cols + ["q_absent"], "group": [s[1] for s in spec] + ["c"], "lo": [float(s[2]) for s in spec] + [1.0],
                          "hi": [float(s[3]) for s in spec] + [5.0]})
    panel = Panel(truth, earlier, items)
    assert list(panel.truth.index) == ids[:300], "the knife-edge item was laid on the wrong folds"
    knife = panel.crowd()["knife"].to_numpy()
    assert (knife[panel.folds < 5] == 4).all() and (knife[panel.folds >= 5] == 2).all(), "the knife-edge item is not on its edge"

    lo = np.array([s[2] for s in spec], float)
    hi = np.array([s[3] for s in spec], float)
    t = panel.truth.to_numpy()
    e = panel.earlier.to_numpy()
    pid = panel.truth.index

    # a persona twin: a little of the person, spread as wide as the answers themselves, silent for some
    signal = np.nan_to_num((t - np.nanmean(t, 0)) / np.nanstd(t, 0))
    noisy = 0.15 * signal + rng.normal(0, 1, t.shape)
    persona = np.clip(np.round((lo + hi) / 2 + 0.4 * (hi - lo) / 2 + noisy * (hi - lo) / 2 * 0.7), lo, hi)
    persona[rng.random(persona.shape) < 0.02] = np.nan
    persona = pd.DataFrame(persona, index=pid, columns=panel.columns)
    persona = persona.drop(index=pid[rng.choice(len(pid), 12, replace=False)])
    persona = persona.iloc[rng.permutation(len(persona))]
    persona["not_an_item"] = 1.0
    persona = persona.drop(columns=["q6"])                      # and it never answered one item

    continuous = 0.5 * np.where(np.isnan(e), np.nanmean(e, 0), e) + 0.5 * np.nanmean(t, 0) + rng.normal(0, 0.35, t.shape)
    continuous[rng.random(continuous.shape) < 0.05] = np.nan
    twins = {
        "persona": persona,
        "crowd": panel.crowd(),
        "truth": panel.truth,
        "earlier": panel.earlier,
        "constant": pd.DataFrame(np.tile((lo + hi) / 2, (len(pid), 1)), index=pid, columns=panel.columns),
        "continuous": pd.DataFrame(continuous, index=pid, columns=panel.columns),
        "affine": 1 + 0.5 * panel.earlier,
    }
    result = audit(panel, twins)

    col = Column(np.array([1.0, 2, 3, 4, 5]), np.array([0.08, 0.17, 0.3, 0.27, 0.18]), 4.0, 0.6)
    slider = Column(np.arange(0, 101, 5, dtype=float), np.full(21, 1 / 21), 100.0, 0.7)
    yesno = Column(np.array([0.0, 1.0]), np.array([0.35, 0.65]), 1.0, 0.5)
    zs = [-8.5, -6.0, -3.5, -2.5, -1.0, -0.3, 0.0, 1e-9, 0.2, 0.7, 1.7, 2.49, 2.51, 3.6, 5.5, 8.2]
    ps = [1e-12, 1e-9, 1e-5, 0.001, 0.02, 0.075, 0.1, 0.3, 0.5, 0.61, 0.925, 0.98, 0.9999, 1 - 1e-9]
    fixture = {
        "about": "Written by apps/web/tests/fixtures/knowable_fixture.py from research/deeds/audit.py. Synthetic; nobody's data.",
        "items": items.to_dict(orient="records"),
        "truth": table(truth), "earlier": table(earlier),
        "twins": {k: table(v) for k, v in twins.items()},
        "panel": {"ids": [str(i) for i in pid], "columns": list(panel.columns), "groups": list(panel.groups), "folds": panel.folds.tolist(),
                  "crowd": table(panel.crowd())},
        "audit": clean(result),
        "numerics": {
            "ndtr": [[z, float(ndtr(z))] for z in zs],
            "ndtri": [[p, float(ndtri(p))] for p in ps],
            "nodes": NODES.tolist(), "weights": WEIGHTS.tolist(),
            "columns": [
                {"levels": c.levels.tolist(), "shares": c.shares.tolist(), "span": c.span, "rho": c.rho, "retest": retest_accuracy(c),
                 "base": base_accuracy(c), "ceiling": ceiling_accuracy(c), "fit_to": target, "fitted_rho": fit_rho(c, target).rho}
                for c, target in ((col, 0.8), (slider, 0.86), (yesno, 0.62), (col, 0.999), (col, 0.5))
            ],
            "theory": {
                "echo": [[rho, pi, k, T.echo(rho, pi, k)] for rho, pi, k in ((0.6, 0.0, 1), (0.6, 0.05, 1), (0.8, 0.1, 3), (0.45, 0.02, 5), (0.7, 0.05, 0))],
                "looks_needed": [[q, rho, pi, T.looks_needed(q, rho, pi)] for q, rho, pi in ((0.8, 0.6, 0.0), (0.8, 0.5, 0.0), (0.8, 0.87, 0.0), (0.9, 0.6, 0.05))],
            },
        },
    }
    (HERE / "knowable_fixture.json").write_text(json.dumps(clean(fixture), allow_nan=False) + "\n")
    for name, v in result["twins"].items():
        print(f"{name:11s} people {v['people']:3d} acc {v['accuracy']:.4f} crowd {v['crowd']:.4f} r {v['r']:+.3f} knows {v['knows']:+.3f} one look {v['with_one_look']:.4f}")
    print("ceiling", result["ceiling"]["overall"])


if __name__ == "__main__":
    build()
