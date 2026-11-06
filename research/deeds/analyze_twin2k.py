"""
The registered analysis's scoring (PREREG.md §3–§6). It reads run_twin2k.py's witnesses, makes the cheap
ones, and writes out/twin2k/results.json and summary.md.

    /opt/anaconda3/bin/python3.13 research/deeds/analyze_twin2k.py [--draws 2000]
"""
import deeds  # noqa: F401

import argparse
import json
import math
import pathlib

import numpy as np
import pandas as pd

from deeds.data import WITHIN, load
from deeds import score as S
from deeds import witnesses as W

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"
HEADLINE = "Text Persona - GPT4.1-mini"  # the authors' headline twin (71.72%)
DEMOGRAPHICS_ONLY = "Demographics Only - GPT4.1-mini"
SETTINGS = {"forward": ("w4", "w13"), "published": ("w13", "w4")}


def holm(ps: dict[str, float]) -> dict[str, float]:
    order = sorted(ps, key=ps.get)
    m, out, run = len(ps), {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, (m - i) * ps[k]))
        out[k] = run
    return out


def witnesses_for(tw, direction: str, folds):
    truth_name, earlier_name = SETTINGS[direction]
    truth, earlier = getattr(tw, truth_name), getattr(tw, earlier_name)
    mask = truth.notna() & earlier.notna() & tw.llm[HEADLINE].notna()
    bp, bs = W.base(tw, truth, folds)
    points: dict[str, pd.DataFrame] = {"base": bp, "again": W.again(tw, earlier)}
    scores: dict[str, pd.DataFrame] = {"base": bs}
    filled: dict[str, float] = {}

    persona_specs = [s for s in tw.llm if s != DEMOGRAPHICS_ONLY]
    for spec, table in tw.llm.items():
        silent = mask & table.isna()
        filled[spec] = float(silent.to_numpy().sum() / mask.to_numpy().sum())
        points[f"llm:{spec}"] = table.where(~silent, bp)  # a silent twin is scored as the base (as in the pilot)
    stack = np.stack([tw.llm[s].to_numpy(dtype=float) for s in persona_specs])
    with np.errstate(invalid="ignore"):
        mean = np.nanmean(stack, axis=0)
    llm_mean = pd.DataFrame(mean, index=truth.index, columns=tw.columns)
    llm_mean = llm_mean.where(llm_mean.notna(), bs)
    scores["llm_mean"] = llm_mean
    points["llm_mean"] = pd.DataFrame({c: W.rounded(truth[c].to_numpy(float), folds, llm_mean[c].to_numpy(float)) for c in tw.columns}, index=truth.index)
    points["llm_demographics"] = points.pop(f"llm:{DEMOGRAPHICS_ONLY}")

    for f in sorted(OUT.glob(f"{direction}__*__point.parquet")):
        name = f.name.split("__")[1]
        points[name] = pd.read_parquet(f)
        sf = OUT / f"{direction}__{name}__score.parquet"
        if sf.exists():
            scores[name] = pd.read_parquet(sf)
    ep, es, ew = W.echo_on(tw, truth, earlier, folds, llm_mean)
    points["echo_llm"], scores["echo_llm"] = ep, es
    return truth, earlier, mask, points, scores, filled, ew


def evaluate(tw, truth, mask, points, scores, tasks=None):
    tasks = tasks or tw.tasks
    sub = tw if tasks == tw.tasks else _restrict(tw, tasks)
    rows, per_person, col_rs = {}, {}, {}
    for name, p in points.items():
        p = p.where(~(mask & p.isna()), points["base"])  # any silence is the base's answer
        pa = S.person_accuracy(sub, p, truth, mask)
        cr = S.column_r(p, truth, mask, sub.columns)
        tr = S.task_r(sub, cr)
        row = {"accuracy": float(pa.mean()), "r": float(tr.mean()), "task_accuracy": S.task_accuracy(sub, p, truth, mask).to_dict(), "task_r": tr.to_dict()}
        if name in scores:
            cs = S.column_r(scores[name], truth, mask, sub.columns)
            row["r_score"] = float(S.task_r(sub, cs).mean())
            row["task_r_score"] = S.task_r(sub, cs).to_dict()
            col_rs[name + ":score"] = cs
        rows[name], per_person[name], col_rs[name] = row, pa, cr
    acc_again = rows["again"]["accuracy"]
    for row in rows.values():
        row["normalised"] = row["accuracy"] / acc_again
    return rows, pd.DataFrame(per_person), col_rs


def _restrict(tw, tasks):
    import copy

    t = copy.copy(tw)
    t.columns = [c for c in tw.columns if tw.task[c] in tasks]
    return t


def hypotheses(tw, truth, mask, points, scores, rows, per_person, col_rs, draws):
    llm_specs = [k for k in points if k.startswith("llm:")]
    best = max(llm_specs, key=lambda k: rows[k]["accuracy"])
    res = {"llm_best": best}

    d = (per_person[best] - per_person["base"]).to_numpy()
    b = S.boot_mean(d, draws)
    res["H1"] = {"delta": float(np.nanmean(d)), "upper95_one_sided": float(np.quantile(b, 0.95)), "ci95": S.interval(b),
                 "p": float((b >= 0.01).mean()), "holds": bool(np.quantile(b, 0.95) < 0.01)}

    tr_p, tr_l = pd.Series(rows["persona"]["task_r"]), pd.Series(rows[best]["task_r"])
    wins = int((tr_p > tr_l).sum())
    bp_ = S.boot_r(tw, points["persona"].where(~(mask & points["persona"].isna()), points["base"]), truth, mask, draws, seed=1)
    bl_ = S.boot_r(tw, points[best], truth, mask, draws, seed=1)
    diff = bp_ - bl_
    res["H2"] = {"r_persona": rows["persona"]["r"], "r_llm_best": rows[best]["r"], "wins": wins, "of": len(tr_p),
                 "p_sign": S.sign_test(wins, len(tr_p)), "diff_ci95": S.interval(diff), "p_boot": float((diff <= 0).mean())}
    res["H2"]["p"] = max(res["H2"]["p_sign"], res["H2"]["p_boot"])

    if "persona+others" in points:
        tr_a, tr_o = pd.Series(rows["again"]["task_r"]), pd.Series(rows["persona+others"]["task_r"])
        wins3 = int((tr_a > tr_o).sum())
        ba = S.boot_r(tw, points["again"], truth, mask, draws, seed=2)
        bo = S.boot_r(tw, points["persona+others"], truth, mask, draws, seed=2)
        res["H3"] = {"r_again": rows["again"]["r"], "r_persona_others": rows["persona+others"]["r"], "wins": wins3, "of": len(tr_a),
                     "p": S.sign_test(wins3, len(tr_a)), "diff_ci95": S.interval(ba - bo), "holds": bool(wins3 >= 13 and S.sign_test(wins3, len(tr_a)) < .05)}

    echo_name = "echo" if "echo" in points else "echo_persona"
    if echo_name in points:
        d4 = (per_person[echo_name] - per_person["again"]).to_numpy()
        b4 = S.boot_mean(d4, draws, seed=3)
        res["H4"] = {"witness": echo_name, "acc_echo": rows[echo_name]["accuracy"], "acc_again": rows["again"]["accuracy"],
                     "normalised": rows[echo_name]["normalised"], "delta": float(np.nanmean(d4)), "ci95": S.interval(b4), "p": float((b4 <= 0).mean())}

    ps = {k: res[k]["p"] for k in ("H1", "H2", "H3", "H4") if k in res}
    for k, v in holm(ps).items():
        res[k]["p_holm"] = v

    if "words" in points and "deeds" in points:
        bw = S.boot_r(tw, points["words"], truth, mask, draws, seed=5)
        bd = S.boot_r(tw, points["deeds"], truth, mask, draws, seed=5)
        res["H5"] = {"r_words": rows["words"]["r"], "r_deeds": rows["deeds"]["r"], "diff_ci95": S.interval(bd - bw),
                     "r_score_words": rows["words"].get("r_score"), "r_score_deeds": rows["deeds"].get("r_score")}
    return res


def theory(tw, col_rs, prior_name: str, echo_name: str):
    """H6: per column, ρ = r(again), π = r(prior score)², predicted r(echo)² = π + (ρ − π)² / (1 − π)."""
    rho = col_rs["again"]
    pi = col_rs[prior_name + ":score"].clip(lower=0) ** 2
    pred = pi + (rho.clip(lower=0) - pi).clip(lower=0) ** 2 / (1 - pi)
    obs = col_rs[echo_name + ":score"].clip(lower=0) ** 2
    by_task = pd.DataFrame({"rho": rho, "pi": pi, "pred_r2": pred, "obs_r2": obs, "task": pd.Series(tw.task)}).groupby("task").mean()
    return {
        "columns": int(len(rho)),
        "corr_pred_obs_columns": float(np.corrcoef(pred, obs)[0, 1]),
        "mad_columns": float((pred - obs).abs().mean()),
        "corr_pred_obs_tasks": float(np.corrcoef(by_task.pred_r2, by_task.obs_r2)[0, 1]),
        "mean_pred_r2": float(pred.mean()), "mean_obs_r2": float(obs.mean()),
        "by_task": by_task.round(4).to_dict(orient="index"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=2000)
    args = ap.parse_args()
    tw = load()
    folds = W.folds_of(len(tw.ids))
    results = {}
    for direction in SETTINGS:
        truth, earlier, mask, points, scores, filled, ew = witnesses_for(tw, direction, folds)
        rows, per_person, col_rs = evaluate(tw, truth, mask, points, scores)
        out = {"cells": int(mask.to_numpy().sum()), "people": int(mask.any(axis=1).sum()), "silent_twin_share": filled, "witnesses": rows}
        out["hypotheses"] = hypotheses(tw, truth, mask, points, scores, rows, per_person, col_rs, args.draws)
        prior = "persona+others" if "persona+others" in points else "persona"
        echo_name = "echo" if "echo" in points else "echo_persona"
        if prior + ":score" in col_rs and echo_name + ":score" in col_rs:
            out["H6"] = theory(tw, col_rs, prior, echo_name)
        out["robustness"] = {}
        for label, tasks in (("no_anchoring", [t for t in tw.tasks if t != "anchoring and adjustment"]), ("within_only", [t for t in tw.tasks if t in WITHIN])):
            r2, _, _ = evaluate(tw, truth, mask, points, scores, tasks)
            out["robustness"][label] = {k: {"accuracy": v["accuracy"], "r": v["r"], "normalised": v["normalised"]} for k, v in r2.items()}
        if len(ew):
            out["echo_llm_weights"] = ew.groupby("task")[["b", "c"]].mean().round(3).to_dict(orient="index")
        results[direction] = out
        per_person.to_parquet(OUT / f"{direction}__per_person_accuracy.parquet")
    (OUT / "results.json").write_text(json.dumps(results, indent=1, default=float))
    write_summary(results)


def write_summary(results):
    lines = ["# Twin-2K-500: words, deeds and the same situation again — results", ""]
    for direction, out in results.items():
        lines += [f"## {direction} ({out['people']} people, {out['cells']} cells)", "", "| witness | accuracy | normalised | r (point) | r (score) |", "|---|---|---|---|---|"]
        for name, row in sorted(out["witnesses"].items(), key=lambda kv: -kv[1]["accuracy"]):
            rs = row.get("r_score")
            lines.append(f"| {name} | {row['accuracy']:.4f} | {row['normalised']:.3f} | {row['r']:.3f} | {'' if rs is None else f'{rs:.3f}'} |")
        lines += ["", "```", json.dumps(out["hypotheses"], indent=1, default=float), "```", ""]
        if "H6" in out:
            h6 = {k: v for k, v in out["H6"].items() if k != "by_task"}
            lines += ["H6 (theory):", "```", json.dumps(h6, indent=1), "```", ""]
    (OUT / "summary.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
