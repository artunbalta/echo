"""
The laws across the range of reliabilities (PREREG-SRO.md): the Self-Regulation Ontology, 150 people
retested about 111 days later.

    /opt/anaconda3/bin/python3.13 research/deeds/run_sro.py [--draws 1000]

Writes out/sro/results.json. Every guess for a retested person comes from other people's data and that
person's time-1 measures: the words and elsewhere models never see a retested person, and the echo's
weights are fitted on the other retested people.
"""
import deeds  # noqa: F401

import argparse
import json
import pathlib

import numpy as np
import pandas as pd

from deeds import theory as T
from deeds.witnesses import _prep, _ridge_group

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data" / "sro"
OUT = HERE / "out" / "sro"
DEED_SURVEYS = ("holt_laury_survey", "cognitive_reflection_survey")  # behaviour delivered as a form


def kind(col: str) -> str:
    task = col.split(".")[0]
    return "word" if task.endswith("_survey") and task not in DEED_SURVEYS else "deed"


def load():
    t1 = pd.read_csv(DATA / "Complete_meaningful_variables.csv").set_index("Unnamed: 0")
    t2 = pd.read_csv(DATA / "Retest_meaningful_variables.csv").set_index("Unnamed: 0")
    return t1.apply(pd.to_numeric, errors="coerce"), t2.apply(pd.to_numeric, errors="coerce")


def z(df: pd.DataFrame) -> pd.DataFrame:
    return (df - df.mean()) / df.std(ddof=0)


def ridge_from(train_X: np.ndarray, train_y: np.ndarray, test_X: np.ndarray) -> np.ndarray:
    ok = ~np.isnan(train_y)
    A, B = _prep(train_X[ok], test_X)
    return _ridge_group(A, B, train_y[ok][:, None])[:, 0]


def skill(y: np.ndarray, g: np.ndarray) -> float:
    return float(1 - np.sum((y - g) ** 2) / np.sum((y - y.mean()) ** 2))


def loo_stack(y: np.ndarray, cols: list[np.ndarray]) -> np.ndarray:
    out = np.zeros(len(y))
    Z = np.column_stack([np.ones(len(y)), *cols])
    for i in range(len(y)):
        o = np.arange(len(y)) != i
        coef, *_ = np.linalg.lstsq(Z[o], y[o], rcond=None)
        out[i] = Z[i] @ coef
    return out


def witnesses(t1z: pd.DataFrame, t2z: pd.DataFrame, target: str, predictors: dict[str, list[str]], train, people):
    y_all = t2z[target]
    ppl = [p for p in people if not np.isnan(y_all.get(p, np.nan)) and not np.isnan(t1z.at[p, target])]
    y = y_all.loc[ppl].to_numpy()
    x = t1z.loc[ppl, target].to_numpy()
    target_train = t1z.loc[train, target].to_numpy()
    g = {"crowd": np.zeros(len(y)), "copy": x}
    for name, cols in predictors.items():
        g[name] = ridge_from(t1z.loc[train, cols].to_numpy(), target_train, t1z.loc[ppl, cols].to_numpy())
    g["echo"] = loo_stack(y, [g["persona"], x])
    g["echo_no_persona"] = loo_stack(y, [x])
    return ppl, y, x, g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=1000)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    t1, t2 = load()
    retest = [p for p in t2.index if p in t1.index]
    train = [p for p in t1.index if p not in set(retest)]
    t1z = z(t1)
    t2z = z(t2.loc[retest])
    cols = [c for c in t1.columns if c in t2.columns]
    deeds = [c for c in cols if kind(c) == "deed"]
    words = [c for c in cols if kind(c) == "word"]
    results = {}
    for role, targets in (("deeds", deeds), ("words", words)):
        rows = {}
        for target in targets:
            task = target.split(".")[0]
            if role == "deeds":
                preds = {"words": words, "elsewhere": [c for c in deeds if c.split(".")[0] != task]}
            else:  # words as targets: the other surveys' words, and the deeds
                preds = {"words": [c for c in words if c.split(".")[0] != task], "elsewhere": deeds}
            preds["persona"] = preds["words"] + preds["elsewhere"]
            ppl, y, x, g = witnesses(t1z, t2z, target, preds, train, retest)
            if len(y) < 40 or np.std(y) == 0 or np.std(x) == 0:
                continue
            rho = float(np.corrcoef(x, y)[0, 1])
            pi = float(max(np.corrcoef(g["persona"], y)[0, 1], 0) ** 2)
            rows[target] = {"n": len(y), "rho": rho, "pi": pi, "skill": {k: skill(y, v) for k, v in g.items()},
                            "theory": {"copy": T.copying(rho), "echo_no_persona": T.echo(rho, 0.0, 1), "echo": T.echo(rho, pi, 1)}}
            rows[target]["_g"] = (y, g)
        results[role] = rows

    def summary(rows: dict) -> dict:
        names = list(next(iter(rows.values()))["skill"])
        rho = np.array([r["rho"] for r in rows.values()])
        sk = {k: np.array([r["skill"][k] for r in rows.values()]) for k in names}
        low = rho < 0.5
        out = {
            "variables": len(rows),
            "mean_skill": {k: float(v.mean()) for k, v in sk.items()},
            "median_rho": float(np.median(rho)),
            "S1": {"corr_copy_2rho_minus_1": float(np.corrcoef(sk["copy"], 2 * rho - 1)[0, 1]), "low_rho": int(low.sum()),
                   "copy_negative_when_low": int((sk["copy"][low] < 0).sum()), "share": float((sk["copy"][low] < 0).mean()) if low.any() else None},
            "S2": {"echo_np_beats_copy": int((sk["echo_no_persona"] > sk["copy"]).sum()), "share": float((sk["echo_no_persona"] > sk["copy"]).mean()),
                   "corr_echo_np_rho2": float(np.corrcoef(sk["echo_no_persona"], np.clip(rho, 0, None) ** 2)[0, 1]),
                   "echo_np_positive": int((sk["echo_no_persona"] > 0).sum())},
            "S3": {"mean_words": float(sk["words"].mean())},
        }
        rng = np.random.default_rng(3)
        diffs = []
        for _ in range(args.draws):
            ds = []
            for r in rows.values():
                y, g = r["_g"]
                idx = rng.integers(0, len(y), len(y))
                ds.append(skill(y[idx], g["echo_no_persona"][idx]) - skill(y[idx], g["copy"][idx]))
            diffs.append(np.mean(ds))
        out["S2"]["mean_diff"] = float(np.mean(sk["echo_no_persona"] - sk["copy"]))
        out["S2"]["mean_diff_ci95"] = [float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))]
        # Deviation, reported as such: resampling each variable's own variance blows up on heavy-tailed
        # measures (a resample without the outlier has a tiny variance). The paired comparison with the
        # denominator fixed at the full sample's variance is the usual remedy.
        rng = np.random.default_rng(4)
        fixed = []
        for _ in range(args.draws):
            ds = []
            for r in rows.values():
                y, g = r["_g"]
                idx = rng.integers(0, len(y), len(y))
                v = np.sum((y - y.mean()) ** 2) / len(y)
                ds.append((np.mean((y[idx] - g["copy"][idx]) ** 2) - np.mean((y[idx] - g["echo_no_persona"][idx]) ** 2)) / v)
            fixed.append(np.mean(ds))
        out["S2"]["mean_diff_fixed_ci95"] = [float(np.quantile(fixed, 0.025)), float(np.quantile(fixed, 0.975))]
        out["S2"]["median_diff"] = float(np.median(sk["echo_no_persona"] - sk["copy"]))
        out["points"] = [{"var": k, "rho": r["rho"], "copy": r["skill"]["copy"], "echo": r["skill"]["echo_no_persona"]} for k, r in rows.items()]
        return out

    summ = {role: summary(rows) for role, rows in results.items()}
    for rows in results.values():
        for r in rows.values():
            r.pop("_g")
    (OUT / "results.json").write_text(json.dumps({"summary": summ, "variables": results}, indent=1))
    for role, s in summ.items():
        print(f"== {role} as targets: {s['variables']} variables, median rho {s['median_rho']:.2f}")
        print("   mean skill:", {k: round(v, 3) for k, v in s["mean_skill"].items()})
        print("   S1:", s["S1"])
        print("   S2:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s["S2"].items()})
        print("   S3:", s["S3"])


if __name__ == "__main__":
    main()
