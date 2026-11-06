"""
The incentivised replication (PREREG-BBRS.md): the Basel–Berlin Risk Study, about six months between sessions.

    /opt/anaconda3/bin/python3.13 research/deeds/run_bbrs.py [--draws 2000]

Writes out/bbrs/results.json. Every witness's guess for a retest person is a function of other people's
data and that person's session-1 predictors. The words and elsewhere models never see a retest person;
the echo's three weights are fitted on the other retest people.
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
DATA = HERE / "data" / "bbrs"
OUT = HERE / "out" / "bbrs"

TASKS = {  # task → (file stem, column); higher is riskier in every one (Frey et al. 2017)
    "price list": ("mpl__mplBehavior", "R"),
    "lotteries": ("lotteries__lotteriesOvert", "R"),
    "description": ("dfd__dfd_perpers", "R"),
    "experience": ("dfe__dfe_perpers", "R"),
    "card task": ("cct__cct_overt", "CCTncards"),
    "balloons": ("bart__bart", "pumps_adj"),
    "marbles": ("mt__mt", "MTr"),
}
WORDS = (["SOEP", "SOEPdri", "SOEPfin", "SOEPrec", "SOEPocc", "SOEPhea", "SOEPsoc"]
         + [f"D{d}{s}" for s in ("", "_r", "_b") for d in ("eth", "inv", "gam", "hea", "rec", "soc")]
         + ["GABS", "PRI", "PRIw", "BIS1att", "BIS1mot", "BIS1ctr", "BIS1com", "BIS1per", "BIS1ins", "BIS2att", "BIS2mot", "BIS2npl", "BIS",
            "SStas", "SSexp", "SSdis", "SSbor", "SSSV", "AUDIT", "FTND", "DAST"])


def _read(name: str) -> pd.DataFrame:
    df = pd.read_csv(DATA / f"{name}.csv")
    df["person"] = (pd.to_numeric(df["partid"], errors="coerce") // 100).astype("Int64")
    return df.dropna(subset=["person"]).drop_duplicates("person").set_index("person")


def load() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Session-1 tasks and words for everyone; session-2 tasks and words for the retest people."""
    s1 = pd.DataFrame({t: pd.to_numeric(_read(f"main__{stem}")[col], errors="coerce") for t, (stem, col) in TASKS.items()})
    s2 = pd.concat([pd.DataFrame({t: pd.to_numeric(_read(f"retest_{site}__{stem}")[col], errors="coerce") for t, (stem, col) in TASKS.items()})
                    for site in ("berlin", "basel")])
    q1 = _read("quest_scores")
    w1 = pd.DataFrame({c: pd.to_numeric(q1[c], errors="coerce") for c in WORDS if c in q1.columns})
    q2 = pd.concat([_read(f"retest_{site}__quest__quest_scores") for site in ("berlin", "basel")])
    w2 = pd.DataFrame({c: pd.to_numeric(q2[c], errors="coerce") for c in WORDS if c in q2.columns})
    return s1, s2, w1, w2


def z(s: pd.Series) -> pd.Series:
    return (s - s.mean()) / s.std(ddof=0)


def ridge_from(train_X: np.ndarray, train_y: np.ndarray, test_X: np.ndarray) -> np.ndarray:
    ok = ~np.isnan(train_y)
    A, B = _prep(train_X[ok], test_X)
    return _ridge_group(A, B, train_y[ok][:, None])[:, 0]


def skill(y: np.ndarray, guess: np.ndarray) -> float:
    return float(1 - np.sum((y - guess) ** 2) / np.sum((y - y.mean()) ** 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=2000)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    s1, s2, w1, w2 = load()
    retest = s2.index.intersection(s1.index)
    train = s1.index.difference(retest)
    S1 = s1.apply(z)                     # standing in the main session, among the main sample
    W1 = w1.reindex(s1.index)
    results, per_task_guesses = {}, {}
    for task in TASKS:
        y_all = z(s2[task].dropna())                                   # standing at retest, among the retest people
        people = y_all.index.intersection(retest)
        people = people[S1.loc[people, task].notna().to_numpy()]
        y = y_all.loc[people].to_numpy()
        x = S1.loc[people, task].to_numpy()
        others = [t for t in TASKS if t != task]
        target_train = S1.loc[train, task].to_numpy()
        guesses = {
            "crowd": np.zeros(len(y)),
            "words": ridge_from(W1.loc[train].to_numpy(), target_train, W1.loc[people].to_numpy()),
            "elsewhere": ridge_from(S1.loc[train, others].to_numpy(), target_train, S1.loc[people, others].to_numpy()),
            "persona": ridge_from(np.column_stack([W1.loc[train].to_numpy(), S1.loc[train, others].to_numpy()]), target_train,
                                  np.column_stack([W1.loc[people].to_numpy(), S1.loc[people, others].to_numpy()])),
            "copy": x,
        }
        m = guesses["persona"]
        echo, echo_copy = np.zeros(len(y)), np.zeros(len(y))
        for i in range(len(y)):
            o = np.arange(len(y)) != i
            (a, b, c), *_ = np.linalg.lstsq(np.column_stack([np.ones(o.sum()), m[o], x[o]]), y[o], rcond=None)
            echo[i] = a + b * m[i] + c * x[i]
            (a2, c2), *_ = np.linalg.lstsq(np.column_stack([np.ones(o.sum()), x[o]]), y[o], rcond=None)
            echo_copy[i] = a2 + c2 * x[i]
        guesses["echo"], guesses["echo_no_persona"] = echo, echo_copy
        rho = float(np.corrcoef(x, y)[0, 1])
        pi = float(max(np.corrcoef(m, y)[0, 1], 0) ** 2)
        sk = {k: skill(y, g) for k, g in guesses.items()}
        rng = np.random.default_rng(7)
        boot = {k: [] for k in guesses}
        for _ in range(args.draws):
            idx = rng.integers(0, len(y), len(y))
            for k, g in guesses.items():
                boot[k].append(skill(y[idx], g[idx]))
        ci = {k: [float(np.quantile(v, 0.025)), float(np.quantile(v, 0.975))] for k, v in boot.items()}
        d_echo_copy = np.array(boot["echo"]) - np.array(boot["copy"])
        results[task] = {
            "n": int(len(y)), "rho": rho, "pi_persona": pi, "skill": sk, "ci95": ci,
            "echo_minus_copy_ci95": [float(np.quantile(d_echo_copy, 0.025)), float(np.quantile(d_echo_copy, 0.975))],
            "theory": {"copy": T.copying(rho), "echo": T.echo(rho, pi, 1), "echo_no_persona": T.echo(rho, 0.0, 1)},
        }
        per_task_guesses[task] = {k: g.tolist() for k, g in guesses.items()} | {"y": y.tolist()}
    words_retest = {c: float(np.corrcoef(*w1.loc[w2.index.intersection(w1.index), c].to_frame().join(w2[c].rename("b")).dropna().to_numpy().T)[0, 1])
                    for c in ("SOEP", "Dinv", "Dgam", "Drec", "SSSV", "BIS") if c in w2.columns}
    summary = {
        "tasks": results,
        "mean_skill": {k: float(np.mean([r["skill"][k] for r in results.values()])) for k in next(iter(results.values()))["skill"]},
        "words_retest_r": words_retest,
        "B1": {t: {"rho": r["rho"], "copy": r["skill"]["copy"], "holds": (r["skill"]["copy"] < 0) if r["rho"] < 0.5 else None} for t, r in results.items()},
        "B2": {t: {"echo": r["skill"]["echo"], "copy": r["skill"]["copy"], "echo>0": r["skill"]["echo"] > 0, "echo>copy": r["skill"]["echo"] > r["skill"]["copy"]} for t, r in results.items()},
        "B3": {"mean_words": float(np.mean([r["skill"]["words"] for r in results.values()]))},
        "B4": {t: {"theory": r["theory"]["echo"], "observed": r["skill"]["echo"]} for t, r in results.items()},
    }
    (OUT / "results.json").write_text(json.dumps(summary, indent=1))
    (OUT / "guesses.json").write_text(json.dumps(per_task_guesses))
    print(f"{'task':12s} {'n':>4s} {'rho':>6s} {'pi':>6s} | " + " ".join(f"{k:>9s}" for k in next(iter(results.values()))["skill"]) + " | theory copy/echo")
    for t, r in results.items():
        print(f"{t:12s} {r['n']:4d} {r['rho']:6.3f} {r['pi_persona']:6.3f} | " + " ".join(f"{v:+9.3f}" for v in r["skill"].values())
              + f" | {r['theory']['copy']:+.3f} / {r['theory']['echo']:+.3f}")
    print("mean:", {k: round(v, 3) for k, v in summary["mean_skill"].items()})
    print("words retest r:", {k: round(v, 2) for k, v in words_retest.items()})


if __name__ == "__main__":
    main()
