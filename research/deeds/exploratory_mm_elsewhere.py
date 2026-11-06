"""
Study 2c, exploratory (not registered): again against elsewhere, on the Moral Machine. For a visit's
choice on one contrast, three witnesses read another visit by the same person, or the same visit:
- again: the other visit, same contrast, read as the echo after one look (κ = ρ̂);
- elsewhere: the other visit, the five other contrasts (ridge, fitted on other people);
- elsewhere, same visit: the target visit's own five other contrasts (it shares the visit's mood).
Every witness and the crowd are fitted on the other folds. Skill = 1 − MSE / MSE(crowd).

Writes out/mm/elsewhere.json.

    /opt/anaconda3/bin/python3.13 research/deeds/exploratory_mm_elsewhere.py [--draws 10]
"""
import deeds  # noqa: F401

import argparse
import json

import numpy as np
import pandas as pd

import run_mm as R
from deeds.witnesses import _prep, _ridge_group


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=10)
    args = ap.parse_args()
    cols = ["user", "session", "dim", "saved", "country", "intervention", "pedped", "barrier", "signal", "nchar", "diff"]
    rows = pd.read_parquet(R.MM / "dilemmas.parquet", columns=cols).sort_values(["dim", "session"], kind="stable").reset_index(drop=True)
    uniq, user_index = np.unique(rows["user"].to_numpy(), return_inverse=True)
    v = R.visits_of(rows, user_index)
    crowd = R.Crowd(rows, R.fold_of(rows["user"].to_numpy()))
    s_idx, sessions = pd.factorize(rows["session"].to_numpy()[v.first])
    S, D = len(sessions), len(R.DIMS)
    s_user = np.zeros(S, np.int64)
    s_fold = np.zeros(S, np.int8)
    s_user[s_idx], s_fold[s_idx] = v.user, v.fold
    per_user = np.bincount(s_user, minlength=len(uniq))
    two = per_user[s_user] >= 2
    rng = np.random.default_rng(7)
    acc = {d: {w: [0.0, 0.0] for w in ("again", "elsewhere", "same_visit")} for d in range(D)}
    for f in range(R.FOLDS):
        c = crowd.without(f)
        r = v.score - (c[v.first] + c[v.second]) / 2
        M = np.full((S, D), np.nan)
        M[s_idx, v.dim] = r
        train, test = np.flatnonzero(two & (s_fold != f)), np.flatnonzero(two & (s_fold == f))
        _, ix = R.draw(s_user[train], 2, rng)
        A, B = train[ix[:, 0]], train[ix[:, 1]]
        fitted = {}
        for d in range(D):
            others = [k for k in range(D) if k != d]
            ok = ~np.isnan(M[A, d])
            both = ok & ~np.isnan(M[B, d])
            a, b = M[A[both], d], M[B[both], d]
            rho = float(np.clip((a * b).sum() / ((a * a + b * b) / 2).sum(), 1e-6, 1 - 1e-6))
            fitted[d] = {"rho": rho, "others": others, "y": M[A[ok], d], "XB": M[B[ok]][:, others], "XA": M[A[ok]][:, others]}
        for _ in range(args.draws):
            _, ix = R.draw(s_user[test], 2, rng)
            TA, TB = test[ix[:, 0]], test[ix[:, 1]]
            for d in range(D):
                F_ = fitted[d]
                # The same choices as the registered one-look echo (M2): both visits have the contrast.
                ok = ~np.isnan(M[TA, d]) & ~np.isnan(M[TB, d])
                y = M[TA[ok], d]
                sse_crowd = float((y * y).sum())
                pred = F_["rho"] * M[TB[ok], d]
                acc[d]["again"][0] += float(((y - pred) ** 2).sum())
                acc[d]["again"][1] += sse_crowd
                for name, Xtr, Xte in (("elsewhere", F_["XB"], M[TB[ok]][:, F_["others"]]), ("same_visit", F_["XA"], M[TA[ok]][:, F_["others"]])):
                    P, Q = _prep(Xtr, Xte)
                    p = _ridge_group(P, Q, F_["y"][:, None])[:, 0]
                    acc[d][name][0] += float(((y - p) ** 2).sum())
                    acc[d][name][1] += sse_crowd
        print(f"fold {f} done", flush=True)
    out = {R.DIMS[d]: {w: 1 - s / c for w, (s, c) in acc[d].items()} for d in range(D)}
    (R.OUT / "elsewhere.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
