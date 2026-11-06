"""
The released twins, each on the people and cells it actually answered (no base fill-in), against the crowd
and the regression on the same cells. This deviates from PREREG §3, which scores a silent twin as the
base. That rule flatters a twin that answered half the people, so this table is reported beside the
registered one. Writes out/twin2k/llm_on_covered.json.
"""
import deeds  # noqa: F401

import json
import pathlib

import numpy as np
import pandas as pd

from deeds.data import load
from deeds import score as S
from deeds import witnesses as W

OUT = pathlib.Path(__file__).resolve().parent / "out" / "twin2k"


def main():
    tw = load()
    folds = W.folds_of(len(tw.ids))
    out = {}
    for direction, (t, e) in {"forward": ("w4", "w13"), "published": ("w13", "w4")}.items():
        truth, earlier = getattr(tw, t), getattr(tw, e)
        bp, _ = W.base(tw, truth, folds)
        persona = pd.read_parquet(OUT / f"{direction}__persona__point.parquet")
        rows = {}
        for spec, table in tw.llm.items():
            mask = truth.notna() & earlier.notna() & table.notna()
            people = mask.any(axis=1)
            acc_l = S.person_accuracy(tw, table, truth, mask)[people]
            acc_b = S.person_accuracy(tw, bp, truth, mask)[people]
            acc_p = S.person_accuracy(tw, persona, truth, mask)[people]
            acc_a = S.person_accuracy(tw, earlier, truth, mask)[people]
            d = (acc_l - acc_b).to_numpy()
            b = S.boot_mean(d, 2000, seed=11)
            r_l = S.task_r(tw, S.column_r(table, truth, mask, tw.columns))
            r_p = S.task_r(tw, S.column_r(persona, truth, mask, tw.columns))
            rows[spec] = {"people": int(people.sum()), "acc_llm": float(acc_l.mean()), "acc_base": float(acc_b.mean()),
                          "acc_persona": float(acc_p.mean()), "acc_again": float(acc_a.mean()),
                          "llm_minus_base": float(np.nanmean(d)), "llm_minus_base_ci95": S.interval(b),
                          "r_llm": float(r_l.mean()), "r_persona_same_cells": float(r_p.mean()),
                          "persona_wins_tasks": int((r_p > r_l).sum()), "tasks": int(len(r_l)),
                          "p_sign": S.sign_test(int((r_p > r_l).sum()), int(len(r_l)))}
        best_acc = max(rows, key=lambda s: rows[s]["llm_minus_base"])
        best_r = max(rows, key=lambda s: rows[s]["r_llm"])
        out[direction] = {"specs": rows, "most_favourable_by_accuracy": best_acc, "most_favourable_by_r": best_r}
        print(f"== {direction}")
        for s, v in sorted(rows.items(), key=lambda kv: -kv[1]["llm_minus_base"]):
            print(f"  {s:55s} n={v['people']:4d} llm {v['acc_llm']:.4f} base {v['acc_base']:.4f} Δ {v['llm_minus_base']:+.4f} "
                  f"[{v['llm_minus_base_ci95'][0]:+.4f},{v['llm_minus_base_ci95'][1]:+.4f}] | r llm {v['r_llm']:.3f} vs ridge {v['r_persona_same_cells']:.3f} ({v['persona_wins_tasks']}/{v['tasks']}, p {v['p_sign']:.4f})")
    (OUT / "llm_on_covered.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
