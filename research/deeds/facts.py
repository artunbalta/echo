"""
Every number the paper and its page quote from Studies 1 and 2, in one flat file: runs/facts.json
(committed). The draft's {{f:key:format}} placeholders are filled from it (research/paper/build.py), so
no number in the text is typed by hand.

    /opt/anaconda3/bin/python3.13 research/deeds/facts.py

It reads out/: results.json, llm_on_covered.json, ceiling.json, exchange.json and bbrs/results.json.
It also copies those files into runs/, so the paper builds from committed files.
"""
from __future__ import annotations

import json
import pathlib
import shutil

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
RUNS = HERE / "runs"
HEADLINE = "Text Persona - GPT4.1-mini"


def main():
    RUNS.mkdir(exist_ok=True)
    res = json.loads((OUT / "twin2k" / "results.json").read_text())
    fair = json.loads((OUT / "twin2k" / "llm_on_covered.json").read_text())
    ceil = json.loads((OUT / "twin2k" / "ceiling.json").read_text())
    bbrs = json.loads((OUT / "bbrs" / "results.json").read_text())
    exch_path = OUT / "twin2k" / "exchange.json"
    exch = json.loads(exch_path.read_text()) if exch_path.exists() else None
    f: dict[str, float | int | str] = {}

    fw = res["forward"]
    w = fw["witnesses"]
    f["t1.people"], f["t1.cells"] = fw["people"], fw["cells"]
    f["t1.columns"], f["t1.tasks"] = len(ceil["columns"]), len(ceil["by_task"])
    for name, key in [("base", "base"), ("again", "again"), ("echo", "echo"), ("echo_persona", "echo_persona"), ("echo_llm", "echo_llm"),
                      ("echo_transition", "echo_transition"), ("persona", "persona"), ("persona_others", "persona+others"), ("words", "words"),
                      ("deeds", "deeds"), ("facts", "facts"), ("self", "self"), ("choices", "choices"), ("tests", "tests"),
                      ("llm_mean", "llm_mean"), ("llm_demographics", "llm_demographics"), ("llm_headline", f"llm:{HEADLINE}"), ("persona_hgb", "persona_hgb")]:
        if key not in w:
            continue
        f[f"t1.{name}.acc"] = w[key]["accuracy"]
        f[f"t1.{name}.norm"] = w[key]["normalised"]
        f[f"t1.{name}.r"] = w[key]["r"]
        if "r_score" in w[key]:
            f[f"t1.{name}.rs"] = w[key]["r_score"]
    h = fw["hypotheses"]
    f["t1.H1.delta"], f["t1.H1.lo"], f["t1.H1.hi"] = h["H1"]["delta"], *h["H1"]["ci95"]
    f["t1.H2.wins"], f["t1.H2.of"], f["t1.H2.p"] = h["H2"]["wins"], h["H2"]["of"], h["H2"]["p_holm"]
    f["t1.H3.wins"], f["t1.H3.of"] = h["H3"]["wins"], h["H3"]["of"]
    f["t1.H3.lo"], f["t1.H3.hi"] = h["H3"]["diff_ci95"]
    f["t1.H4.delta"], f["t1.H4.lo"], f["t1.H4.hi"], f["t1.H4.p"] = h["H4"]["delta"], *h["H4"]["ci95"], h["H4"]["p_holm"]
    f["t1.H5.lo"], f["t1.H5.hi"] = h["H5"]["diff_ci95"]
    f["t1.H6.corr"], f["t1.H6.mad"] = fw["H6"]["corr_pred_obs_columns"], fw["H6"]["mad_columns"]
    pub = res["published"]
    f["t1.pub.H4.delta"], f["t1.pub.H4.p"] = pub["hypotheses"]["H4"]["delta"], pub["hypotheses"]["H4"]["p"]
    f["t1.pub.base.acc"], f["t1.pub.again.acc"] = pub["witnesses"]["base"]["accuracy"], pub["witnesses"]["again"]["accuracy"]
    f["t1.pub.echo_transition.acc"] = pub["witnesses"]["echo_transition"]["accuracy"]
    f["t1.pub.llm_headline.acc"] = pub["witnesses"][f"llm:{HEADLINE}"]["accuracy"]
    f["t1.pub.base.norm"] = pub["witnesses"]["base"]["normalised"]
    f["t1.pub.llm_headline.norm"] = pub["witnesses"][f"llm:{HEADLINE}"]["normalised"]
    for label in ("no_anchoring", "within_only"):
        rb = fw["robustness"][label]
        for name, key in [("base", "base"), ("again", "again"), ("echo", "echo"), ("llm_headline", f"llm:{HEADLINE}"), ("persona", "persona")]:
            f[f"t1.rob.{label}.{name}.acc"] = rb[key]["accuracy"]
            f[f"t1.rob.{label}.{name}.r"] = rb[key]["r"]

    specs = fair["forward"]["specs"]
    persona_specs = {k: v for k, v in specs.items() if not k.startswith("Demographics")}
    deltas = sorted(v["llm_minus_base"] for v in specs.values())
    f["t1.llm.specs"] = len(specs)
    f["t1.llm.below_crowd"] = sum(1 for v in specs.values() if v["llm_minus_base_ci95"][1] < 0)
    f["t1.llm.delta_best"], f["t1.llm.delta_worst"] = deltas[-1], deltas[0]
    best = max(specs, key=lambda s: specs[s]["llm_minus_base"])
    f["t1.llm.best.lo"], f["t1.llm.best.hi"] = specs[best]["llm_minus_base_ci95"]
    f["t1.llm.best.acc"], f["t1.llm.best.base"] = specs[best]["acc_llm"], specs[best]["acc_base"]
    f["t1.llm.best.name"] = best
    f["t1.llm.r_best"] = max(v["r_llm"] for v in persona_specs.values())
    f["t1.llm.r_worst"] = min(v["r_llm"] for v in persona_specs.values())
    f["t1.llm.persona_wins_min"] = min(v["persona_wins_tasks"] for v in specs.values())
    f["t1.llm.persona_wins_max"] = max(v["persona_wins_tasks"] for v in specs.values())
    f["t1.llm.headline.delta"] = specs[HEADLINE]["llm_minus_base"]
    f["t1.llm.headline.wins"] = specs[HEADLINE]["persona_wins_tasks"]
    f["t1.llm.headline.p"] = specs[HEADLINE]["p_sign"]
    f["t1.llm.acc_min"] = min(v["acc_llm"] for v in persona_specs.values())
    f["t1.llm.acc_max"] = max(v["acc_llm"] for v in persona_specs.values())

    o = ceil["overall"]
    for k in ("base", "ceiling", "observed_retest"):
        f[f"t1.model.{k}"] = o[k]
    for n in (1, 2, 3, 5, 8, 13, 20):
        if f"looks_{n}" in o:
            f[f"t1.model.looks{n}"] = o[f"looks_{n}"]
    base, cap = w["base"]["accuracy"], o["ceiling"]
    for name, key in [("again", "again"), ("echo", "echo"), ("echo_transition", "echo_transition"), ("llm_headline", f"llm:{HEADLINE}"), ("persona", "persona")]:
        f[f"t1.know.{name}"] = (w[key]["accuracy"] - base) / (cap - base)
    for n in (1, 3, 8, 20):
        f[f"t1.know.looks{n}"] = (o[f"looks_{n}"] - o["base"]) / (cap - o["base"])
    tasks = ceil["by_task"]
    beats = [(v["rho"], v["observed_retest"] - v["base"]) for v in tasks.values()]
    f["t1.half.agree"] = sum(1 for rho, gap in beats if (gap > 0) == (rho > 0.5))
    f["t1.half.of"] = len(beats)
    import numpy as np

    f["t1.half.corr"] = float(np.corrcoef([b[0] for b in beats], [b[1] for b in beats])[0, 1])
    f["t1.rho.min"] = min(v["rho"] for v in tasks.values())
    f["t1.rho.max"] = max(v["rho"] for v in tasks.values())
    f["t1.pricing.rho"] = tasks["pricing"]["rho"]
    f["t1.pricing.base"] = tasks["pricing"]["base"]
    f["t1.pricing.ceiling"] = tasks["pricing"]["ceiling"]
    f["t1.framing.base"], f["t1.framing.retest"] = tasks["framing problem"]["base"], tasks["framing problem"]["observed_retest"]
    f["t1.probmatch.base"], f["t1.probmatch.retest"] = tasks["prob matching vs. max"]["base"], tasks["prob matching vs. max"]["observed_retest"]

    if exch:
        for pool, ks in exch.items():
            top = max(ks, key=lambda k: int(k))
            f[f"t1.ex.{pool}.max_k"] = int(top)
            f[f"t1.ex.{pool}.max_r"] = ks[top]["mean"]
            if "1" in ks:
                f[f"t1.ex.{pool}.one"] = ks["1"]["mean"]

    t = bbrs["tasks"]
    f["t2.tasks"] = len(t)
    f["t2.n_min"], f["t2.n_max"] = min(v["n"] for v in t.values()), max(v["n"] for v in t.values())
    for k, v in bbrs["mean_skill"].items():
        f[f"t2.mean.{k}"] = v
    low = [v for v in t.values() if v["rho"] < 0.5]
    f["t2.low.n"] = len(low)
    f["t2.low.copy_negative"] = sum(1 for v in low if v["skill"]["copy"] < 0)
    f["t2.echo_positive"] = sum(1 for v in t.values() if v["skill"]["echo"] > 0)
    f["t2.echo_beats_copy"] = sum(1 for v in t.values() if v["skill"]["echo"] > v["skill"]["copy"])
    f["t2.rho.min"], f["t2.rho.max"] = min(v["rho"] for v in t.values()), max(v["rho"] for v in t.values())
    f["t2.copy.min"] = min(v["skill"]["copy"] for v in t.values())
    th = [v["theory"]["copy"] for v in t.values()]
    ob = [v["skill"]["copy"] for v in t.values()]
    f["t2.copy_theory_corr"] = float(np.corrcoef(th, ob)[0, 1])
    f["t2.copy_theory_mad"] = float(np.mean(np.abs(np.array(th) - np.array(ob))))
    the = [v["theory"]["echo"] for v in t.values()]
    obe = [v["skill"]["echo"] for v in t.values()]
    f["t2.echo_theory_mad"] = float(np.mean(np.abs(np.array(the) - np.array(obe))))
    f["t2.echo_theory_bias"] = float(np.mean(np.array(obe) - np.array(the)))
    f["t2.experience.rho"], f["t2.experience.echo"] = t["experience"]["rho"], t["experience"]["skill"]["echo"]
    wr = bbrs["words_retest_r"]
    f["t2.words_retest.min"], f["t2.words_retest.max"] = min(wr.values()), max(wr.values())
    for task in ("card task", "description"):
        key = task.split()[0]
        f[f"t2.{key}.rho"] = t[task]["rho"]
        f[f"t2.{key}.copy"] = t[task]["skill"]["copy"]
        f[f"t2.{key}.echo"] = t[task]["skill"]["echo"]

    sro_path = OUT / "sro" / "results.json"
    if sro_path.exists():
        sro = json.loads(sro_path.read_text())["summary"]
        for role in ("deeds", "words"):
            s = sro[role]
            f[f"t3.{role}.n"] = s["variables"]
            f[f"t3.{role}.median_rho"] = s["median_rho"]
            for k, v in s["mean_skill"].items():
                f[f"t3.{role}.mean.{k}"] = v
            f[f"t3.{role}.copy_corr"] = s["S1"]["corr_copy_2rho_minus_1"]
            f[f"t3.{role}.low"] = s["S1"]["low_rho"]
            f[f"t3.{role}.low_negative"] = s["S1"]["copy_negative_when_low"]
            f[f"t3.{role}.echo_beats"] = s["S2"]["echo_np_beats_copy"]
            f[f"t3.{role}.echo_rho2_corr"] = s["S2"]["corr_echo_np_rho2"]
            f[f"t3.{role}.diff"] = s["S2"]["mean_diff"]
            f[f"t3.{role}.diff_lo"], f[f"t3.{role}.diff_hi"] = s["S2"]["mean_diff_fixed_ci95"]
        shutil.copy(sro_path, RUNS / "sro-results.json")
    # Appendix A: one row per task, observed accuracies beside the model's ρ and ceiling.
    ta = {name: w[key]["task_accuracy"] for name, key in (("crowd", "base"), ("twin", f"llm:{HEADLINE}"), ("again", "again"),
                                                          ("echo", "echo_transition"))}
    tr = {name: w[key]["task_r"] for name, key in (("twin", f"llm:{HEADLINE}"), ("again", "again"))}
    head = "| Task | ρ | Crowd | Headline twin (r) | Retest (r) | Echo, one look | Ceiling |\n|---|---|---|---|---|---|---|"
    rows = []
    for task in sorted(tasks, key=lambda t: tasks[t]["rho"]):
        v = tasks[task]
        rows.append(f"| {task} | {v['rho']:.2f} | {ta['crowd'][task]:.3f} | {ta['twin'][task]:.3f} ({tr['twin'][task]:.2f}) | "
                    f"{ta['again'][task]:.3f} ({tr['again'][task]:.2f}) | {ta['echo'][task]:.3f} | {v['ceiling']:.3f} |")
    f["t1.table.tasks"] = (head + "\n" + "\n".join(rows)).replace("-0.", "−0.")
    boot_path = OUT / "twin2k" / "ceiling_boot.json"
    if boot_path.exists():
        boot = json.loads(boot_path.read_text())
        f["t1.boot.draws"] = boot["draws"]
        for k, key in (("ceiling", "ceiling"), ("looks1", "looks_1"), ("looks3", "looks_3"), ("base", "base")):
            f[f"t1.model.{k}.lo"], f[f"t1.model.{k}.hi"] = boot["model"][key]["lo"], boot["model"][key]["hi"]
        for k, key in (("again", "again"), ("echo", "echo"), ("echo_transition", "echo_transition"), ("llm_headline", f"llm:{HEADLINE}")):
            f[f"t1.know.{k}.lo"], f[f"t1.know.{k}.hi"] = boot["knows"][key]["lo"], boot["knows"][key]["hi"]
        shutil.copy(boot_path, RUNS / "twin2k-ceiling-boot.json")
    mm_path = OUT / "mm" / "results.json"
    if mm_path.exists():
        mm = json.loads(mm_path.read_text())
        c = mm["counts"]
        f["t4.dilemmas"], f["t4.people"], f["t4.sessions"] = c["dilemmas"], c["people"], c["sessions"]
        f["t4.survey"], f["t4.survey_matched"] = c.get("survey_takers", 0), c.get("survey_takers_matched", 0)
        slug = {"Utilitarian": "util", "Gender": "gender", "Fitness": "fitness", "Age": "age", "Social Status": "status", "Species": "species"}
        m1, m2, m3, m4 = mm["M1"], mm["M2"], mm["M3"], mm["M4"]
        if "pooled" in m1:
            for k in ("corr", "mad", "mad_n2plus", "max_abs"):
                f[f"t4.m1.{k}"] = m1["pooled"][k]
            f["t4.m1.holds"] = m1["pooled"]["holds"]
            f["t4.m1.points"] = sum(v["K"] for k, v in m1.items() if k != "pooled")
            f["t4.m1.inside"] = sum(lo <= pr <= hi for k, v in m1.items() if k != "pooled" for lo, pr, hi in zip(v["lo"], v["predicted"], v["hi"]))
            f["t4.m1.people_min"] = min(v["people"] for k, v in m1.items() if k != "pooled")
            f["t4.m1.people_max"] = max(v["people"] for k, v in m1.items() if k != "pooled")
        for name, sl in slug.items():
            if name in m1:
                d = m1[name]
                f[f"t4.m1.{sl}.k"], f[f"t4.m1.{sl}.people"], f[f"t4.m1.{sl}.rho"] = d["K"], d["people"], d["rho"]
                f[f"t4.m1.{sl}.obs1"], f[f"t4.m1.{sl}.obsK"] = d["observed"][0], d["observed"][-1]
                f[f"t4.m1.{sl}.pred1"], f[f"t4.m1.{sl}.predK"] = d["predicted"][0], d["predicted"][-1]
                for n in (2, 3, 5, 10):
                    if n <= d["K"]:
                        f[f"t4.m1.{sl}.obs{n}"], f[f"t4.m1.{sl}.pred{n}"] = d["observed"][n - 1], d["predicted"][n - 1]
                if d.get("lo"):
                    f[f"t4.m1.{sl}.obsK.lo"], f[f"t4.m1.{sl}.obsK.hi"] = d["lo"][-1], d["hi"][-1]
                    f[f"t4.m1.{sl}.inside"] = sum(lo <= pr <= hi for lo, pr, hi in zip(d["lo"], d["predicted"], d["hi"]))
            d = m2[name]
            f[f"t4.m2.{sl}.people"], f[f"t4.m2.{sl}.rho"] = d["people"], d["rho"]
            f[f"t4.m2.{sl}.copy"], f[f"t4.m2.{sl}.theory"] = d["copy"]["value"], d["theory_copy"]
            f[f"t4.m2.{sl}.raw"], f[f"t4.m2.{sl}.echo1"] = d["raw_copy"]["value"], d["echo1"]["value"]
            f[f"t4.m2.{sl}.echo1_theory"] = d["theory_echo1"]
            d = m4[name]
            f[f"t4.m4.{sl}.within"], f[f"t4.m4.{sl}.across"] = d["within"]["value"], d["across"]["value"]
            f[f"t4.m4.{sl}.n80"], f[f"t4.m4.{sl}.country"] = d["looks_for_80"], d["country"]["value"]
            if d.get("looks_for_80_panel") is not None:
                f[f"t4.m4.{sl}.n80_panel"] = d["looks_for_80_panel"]
            if name in m3:
                d = m3[name]
                f[f"t4.m3.{sl}.people"], f[f"t4.m3.{sl}.rho"] = d["people"], d["rho"]
                for k in ("persona", "echo1", "both"):
                    f[f"t4.m3.{sl}.{k}"] = d[k]["value"]
        f["t4.m2.holds"] = sum(m2[n]["holds"] for n in slug)
        if "mean_gap" in m3:
            f["t4.m3.gap"], f["t4.m3.gap.lo"], f["t4.m3.gap.hi"] = m3["mean_gap"]["value"], m3["mean_gap"].get("lo"), m3["mean_gap"].get("hi")
            f["t4.m3.holds"] = m3["holds"]
            f["t4.m3.beats"] = sum(m3[n]["persona"]["value"] < m3[n]["echo1"]["value"] for n in slug if n in m3)
        shutil.copy(mm_path, RUNS / "mm-results.json")
        # Exploratory (not registered): the looks curve on panels of everyone with more than K visits.
        for k in (3, 6, 10):
            xp = OUT / "mm" / f"exploratory_k{k}.json"
            if not xp.exists():
                continue
            x = json.loads(xp.read_text())["M1"]
            inside = total = 0
            for name, sl in slug.items():
                if name not in x:
                    continue
                d = x[name]
                f[f"t4.x{k}.{sl}.people"], f[f"t4.x{k}.{sl}.rho"] = d["people"], d["rho"]
                for n in range(1, d["K"] + 1):
                    f[f"t4.x{k}.{sl}.obs{n}"], f[f"t4.x{k}.{sl}.pred{n}"] = d["observed"][n - 1], d["predicted"][n - 1]
                    f[f"t4.x{k}.{sl}.lo{n}"], f[f"t4.x{k}.{sl}.hi{n}"] = d["lo"][n - 1], d["hi"][n - 1]
                    inside += d["lo"][n - 1] <= d["predicted"][n - 1] <= d["hi"][n - 1]
                    total += 1
                f[f"t4.x{k}.{sl}.inside"] = sum(lo <= pr <= hi for lo, pr, hi in zip(d["lo"], d["predicted"], d["hi"]))
            f[f"t4.x{k}.inside"], f[f"t4.x{k}.points"] = inside, total
            f[f"t4.x{k}.corr"], f[f"t4.x{k}.mad"] = x["pooled"]["corr"], x["pooled"]["mad"]
            f[f"t4.x{k}.people_min"] = min(x[n]["people"] for n in slug if n in x)
            f[f"t4.x{k}.people_max"] = max(x[n]["people"] for n in slug if n in x)
            shutil.copy(xp, RUNS / f"mm-exploratory-k{k}.json")
    people_path = OUT / "mm" / "people.json"
    if people_path.exists():
        # Exploratory (not registered): browsers whose surveyed person never changes, against those whose does.
        pp = json.loads(people_path.read_text())
        f["t4.p.two_surveyed"], f["t4.p.changed"] = pp["browsers_two_surveyed"], pp["changed"]
        bins = pp["by_sessions_played"]
        f["t4.p.changed_2"], f["t4.p.changed_7_20"] = bins[0]["changed"], max(b["changed"] for b in bins if b["from"] in (7, 11))
        slug = {"Utilitarian": "util", "Gender": "gender", "Fitness": "fitness", "Age": "age", "Social Status": "status", "Species": "species"}
        for g, key in (("same_person", "same"), ("changes", "mixed")):
            G = pp["groups"][g]
            f[f"t4.p.{key}.browsers"] = G["browsers"]
            for name, sl in slug.items():
                f[f"t4.p.{key}.{sl}.rho"], f[f"t4.p.{key}.{sl}.copy"], f[f"t4.p.{key}.{sl}.theory"] = G["rho"][name], G["copy"][name], G["theory_copy"][name]
                f[f"t4.p.{key}.{sl}.ratio"] = G["within"][name] / G["across"][name]
            ratios = [G["within"][n] / G["across"][n] for n in slug]
            f[f"t4.p.{key}.ratio_min"], f[f"t4.p.{key}.ratio_max"] = min(ratios), max(ratios)
        shutil.copy(people_path, RUNS / "mm-people.json")
    elsewhere_path = OUT / "mm" / "elsewhere.json"
    if elsewhere_path.exists():
        # Exploratory (not registered): again (same contrast, another visit) against elsewhere (the other contrasts).
        ew = json.loads(elsewhere_path.read_text())
        slug = {"Utilitarian": "util", "Gender": "gender", "Fitness": "fitness", "Age": "age", "Social Status": "status", "Species": "species"}
        for name, sl in slug.items():
            for w in ("again", "elsewhere", "same_visit"):
                f[f"t4.e.{sl}.{w}"] = ew[name][w]
        weak = [n for n in slug if n != "Species"]
        for w in ("again", "elsewhere", "same_visit"):
            f[f"t4.e.weak.{w}.min"], f[f"t4.e.weak.{w}.max"] = min(ew[n][w] for n in weak), max(ew[n][w] for n in weak)
        shutil.copy(elsewhere_path, RUNS / "mm-elsewhere.json")
    audit_path = OUT / "audit" / "audit.json"
    if audit_path.exists():
        shutil.copy(audit_path, RUNS / "twin2k-audit.json")
    (RUNS / "facts.json").write_text(json.dumps(f, indent=1, sort_keys=True))
    for src, dst in [(OUT / "twin2k" / "results.json", "twin2k-results.json"), (OUT / "twin2k" / "llm_on_covered.json", "twin2k-llm-on-covered.json"),
                     (OUT / "twin2k" / "ceiling.json", "twin2k-ceiling.json"), (OUT / "bbrs" / "results.json", "bbrs-results.json")] + \
                    ([(exch_path, "twin2k-exchange.json")] if exch else []):
        shutil.copy(src, RUNS / dst)
    print(f"{len(f)} facts → runs/facts.json")


if __name__ == "__main__":
    main()
