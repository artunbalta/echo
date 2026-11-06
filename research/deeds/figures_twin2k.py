"""
The study's figures, from out/ only: out/figures/<name>.svg and a preview page, out/figures/preview.html.
`build()` returns {name: (svg, caption)} for the paper's page (research/paper/page.py).

    /opt/anaconda3/bin/python3.13 research/deeds/figures_twin2k.py
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "pilot"))

from deeds import figures as F  # noqa: E402

SPEC_SHORT = {
    "Text Persona - GPT4.1-mini": "GPT-4.1-mini, text persona (the paper's headline twin)",
}


RUNS = HERE / "runs"
# The committed copies first (research/deeds/facts.py writes them), so the paper builds from the repository.
SOURCES = {
    "results": ("twin2k-results.json", OUT / "twin2k" / "results.json"),
    "fair": ("twin2k-llm-on-covered.json", OUT / "twin2k" / "llm_on_covered.json"),
    "ceiling": ("twin2k-ceiling.json", OUT / "twin2k" / "ceiling.json"),
    "exchange": ("twin2k-exchange.json", OUT / "twin2k" / "exchange.json"),
    "bbrs": ("bbrs-results.json", OUT / "bbrs" / "results.json"),
    "sro": ("sro-results.json", OUT / "sro" / "results.json"),
    "mm": ("mm-results.json", OUT / "mm" / "results.json"),
}


def _load(name: str):
    committed, fresh = SOURCES[name]
    for path in (RUNS / committed, fresh):
        if path.exists():
            return json.loads(path.read_text())
    return None


def build() -> dict[str, tuple[str, str]]:
    res = _load("results")["forward"]
    w = res["witnesses"]
    fair = _load("fair")["forward"]["specs"]
    ceil = _load("ceiling")
    bbrs = _load("bbrs")
    exch = _load("exchange")
    figs: dict[str, tuple[str, str]] = {}

    persona_specs = {k: v for k, v in fair.items() if not k.startswith("Demographics")}
    twin_accs = sorted((v["acc_llm"] for v in persona_specs.values()), reverse=True)
    headline = fair["Text Persona - GPT4.1-mini"]["acc_llm"]
    reg = w.get("persona_hgb", w["words"])
    reg_label = "Regression, same persona (boosted median)" if "persona_hgb" in w else "Regression on their self-descriptions"
    looks = {int(k.split("_")[1]): v for k, v in ceil["overall"].items() if k.startswith("looks_")}
    rows = [
        {"label": "LLM twins, 12 persona specs (best shown)", "values": [twin_accs[0], *twin_accs[1:]], "range": (min(twin_accs), max(twin_accs)), "color": F.COL["twin"]},
        {"label": "… the headline twin (GPT-4.1-mini, text)", "values": [headline], "color": F.COL["twin"]},
        {"label": "LLM twin from demographics only", "values": [fair["Demographics Only - GPT4.1-mini"]["acc_llm"]], "color": F.COL["twin"]},
        {"label": reg_label, "values": [reg["accuracy"]], "color": F.COL["regression"]},
        {"label": "Their own earlier answer (the retest)", "values": [w["again"]["accuracy"]], "color": F.COL["again"]},
        {"label": "Two-layer echo after one look (registered)", "values": [w["echo"]["accuracy"]], "color": F.COL["echo"]},
        {"label": "… one look, the crowd's own transitions", "values": [w["echo_transition"]["accuracy"]], "color": F.COL["echo"], "hero": True},
        {"label": "Bayes-optimal echo after 3 looks (model)", "values": [looks[3]], "color": F.COL["echo"], "open": True},
        {"label": "… after 8 looks (model)", "values": [looks[8]], "color": F.COL["echo"], "open": True},
    ]
    refs = [
        {"label": "random guess (the paper's baseline)", "value": 0.5917, "color": F.COL["theory"]},
        {"label": "the crowd's median: knows nobody", "value": w["base"]["accuracy"], "color": F.COL["crowd"]},
        {"label": "knowable ceiling (model)", "value": ceil["overall"]["ceiling"], "color": F.COL["theory"]},
    ]
    figs["ladder"] = (
        F.ladder(rows, refs, note="Accuracy of every witness on Twin-2K-500's 17 retest tasks"),
        "Who guesses a person's answer best, on the benchmark's own metric and cells (Twin-2K-500, 2,058 people, 17 tasks, wave 4 predicted from waves 1–3). "
        "Every released LLM twin is less accurate than the crowd's median answer, which knows nobody. One earlier answer to the same question (the retest) beats them all; "
        "the two-layer echo, which reads that answer against the crowd, beats the retest. Open circles: the model's Bayes-optimal echo after more looks; the right-hand line is what anyone could know without knowing the day.",
    )

    llm_r = sorted(v["r_llm"] for v in persona_specs.values())
    rrows = [
        {"label": "LLM twins (best of 12 persona specs)", "value": llm_r[-1], "color": F.COL["twin"]},
        {"label": "LLM twins (average of the 12, as a score)", "value": w["llm_mean"]["r"], "score": w["llm_mean"].get("r_score"), "color": F.COL["twin"]},
        {"label": "Regression: demographics", "value": w["facts"]["r"], "score": w["facts"].get("r_score"), "color": F.COL["regression"]},
        {"label": "Regression: self-descriptions", "value": w["self"]["r"], "score": w["self"].get("r_score"), "color": F.COL["words"]},
        {"label": "Regression: economic choices", "value": w["choices"]["r"], "score": w["choices"].get("r_score"), "color": F.COL["deeds"]},
        {"label": "Regression: cognitive tests", "value": w["tests"]["r"], "score": w["tests"].get("r_score"), "color": F.COL["deeds"]},
        {"label": "Regression: the whole persona", "value": w["persona"]["r"], "score": w["persona"].get("r_score"), "color": F.COL["regression"]},
        {"label": "… plus their answers to the other 16 tasks", "value": w["persona+others"]["r"], "score": w["persona+others"].get("r_score"), "color": F.COL["regression"]},
        {"label": "One earlier answer to the same question", "value": w["again"]["r"], "color": F.COL["again"]},
        {"label": "Two-layer echo after one look", "value": w["echo"]["r"], "score": w["echo"].get("r_score"), "color": F.COL["echo"], "hero": True},
    ]
    figs["individuals"] = (
        F.bars_r(rrows, note="Individual-level r of every witness"),
        "Who knows the individual: Pearson r across people between each witness's guess and the person's answer, per column, averaged within tasks and then over the 17 tasks. "
        "Bars score the same rounded guesses that accuracy scores; the black tick scores a continuous guess where the witness has one. "
        "Everything a 500-question persona holds, read by a regression, reaches r ≈ .14–.21; one earlier answer to the same question reaches .49.",
    )

    points = [
        {"n": 0, "value": w["base"]["accuracy"], "label": "the crowd (0 looks)", "color": F.COL["crowd"]},
        {"n": 1, "value": w["again"]["accuracy"], "label": "copying the earlier answer", "color": F.COL["again"], "dx": -7},
        {"n": 1, "value": w["echo_transition"]["accuracy"], "label": "echo, observed (crowd transitions)", "color": F.COL["echo"], "dx": 7},
        {"n": 0, "value": headline, "label": "headline LLM twin (no looks)", "color": F.COL["twin"]},
    ]
    lines = [{"value": ceil["overall"]["ceiling"], "label": "knowable ceiling", "color": F.COL["theory"]}]
    figs["looks"] = (
        F.looks(looks, points, lines, lo=0.70, hi=0.88, note="Accuracy against looks"),
        "What each look at the person in the same situation is worth. The line is the Bayes-optimal echo under an ordered latent model fitted to each column's answer shares and retest "
        "(deeds/ceiling.py), averaged like the metric; it rises from the crowd towards what is knowable without knowing the day. Dots are observed: the crowd, copying one's earlier answer, "
        f"and the echo that reads that answer through the crowd's own transitions, which lands on the model's one-look value ({F.fmt(looks[1])} predicted, {F.fmt(w['echo_transition']['accuracy'])} observed).",
    )

    if bbrs:
        tasks = [{"task": t, "rho": v["rho"], "copy": v["skill"]["copy"], "echo": v["skill"]["echo_no_persona"]} for t, v in bbrs["tasks"].items()]
        m = bbrs["mean_skill"]
        figs["incentivised"] = (
            F.copy_vs_echo(tasks, note="Copying vs the echo on incentivised risk tasks"),
            "Incentivised behaviour (Basel–Berlin Risk Study, seven risk tasks, about 170 people retested after six months). Amber: guessing a person's standing from their own "
            "earlier standing, copied; it is worse than knowing nobody on every task less than half steady, as 2ρ − 1 says. Teal: the same one observation read by the two-layer echo; "
            f"it is the best witness on six of seven tasks. Mean skill: words {F.fmt(m['words'])}, other tasks {F.fmt(m['elsewhere'])}, copying {F.fmt(m['copy'])}, echo {F.fmt(m['echo'])}.",
        )

    sro = _load("sro")
    if sro:
        s = sro["summary"]["deeds"]
        figs["laws"] = (
            F.laws(s["points"], note="Copying and the echo across 138 behavioural measures"),
            f"The laws across the range (Self-Regulation Ontology: {s['variables']} behavioural measures from 37 tasks and forms, 150 people retested after about four months). "
            f"Amber: copying a person's earlier score; it is below the crowd on {s['S1']['copy_negative_when_low']} of the {s['S1']['low_rho']} measures less than half steady. "
            f"Teal: the same one observation read by the echo; it beats copying on {s['S2']['echo_np_beats_copy']} of {s['variables']} and tracks ρ² (r = {s['S2']['corr_echo_np_rho2']:.2f}).",
        )

    mm = _load("mm")
    if mm and mm["M1"].get("pooled"):
        # The figure draws an exploratory panel (not registered; the caption says so).
        names = {"Utilitarian": "more lives", "Gender": "gender", "Fitness": "fitness", "Age": "age", "Social Status": "status", "Species": "humans over pets"}
        panel, k = mm["M1"], None
        # Six points a curve, and most of them where ρ̂ is precise; the paper's table gives every panel.
        for kk in (6, 3, 10):
            for path in (RUNS / f"mm-exploratory-k{kk}.json", OUT / "mm" / f"exploratory_k{kk}.json"):
                if path.exists():
                    panel, k = json.loads(path.read_text())["M1"], kk
                    break
            if k:
                break
        curves = [{"label": names[n], **{x: panel[n][x] for x in ("n", "observed", "lo", "hi", "predicted")}} for n in names if n in panel]
        pooled = panel["pooled"]
        inside = sum(lo <= p <= hi for c in curves for lo, p, hi in zip(c["lo"], c["predicted"], c["hi"]))
        points = sum(len(c["n"]) for c in curves)
        people = [panel[n]["people"] for n in names if n in panel]
        who = f"everyone with more than {k} visits ({min(people):,}–{max(people):,} browsers per contrast; exploratory)" if k else "the registered panel"
        figs["looks_mm"] = (
            F.looks_measured(curves, note="The looks curve, measured on the Moral Machine", apart=("humans over pets",)),
            f"The looks curve, measured (Moral Machine): {who}. "
            f"Dots: the echo's skill on a held-out visit after n other visits, with 95% intervals over people, one curve per kind of dilemma; "
            f"humans over pets above, on its own scale, and the five contrasts of character below. "
            f"Dashes: the theory's nρ̂² / (nρ̂ + 1 − ρ̂), from ρ̂ fitted on pairs of visits only. "
            f"{inside} of {points} predicted points lie inside their measured interval; r = {pooled['corr']:.5f}, mean gap {pooled['mad']:.4f}.",
        )

    if exch:
        colors = {"self": F.COL["words"], "facts": F.COL["regression"], "choices": F.COL["deeds"], "tests": "--friends", "others": "--together"}
        labels = {"self": "self-descriptions", "facts": "demographics", "choices": "economic choices", "tests": "cognitive tests", "others": "other tasks' answers"}
        curves = {p: {int(k): v["mean"] for k, v in ks.items()} for p, ks in exch.items()}
        figs["exchange"] = (
            F.exchange(curves, w["again"]["r"], colors, labels, note="Exchange rate"),
            "The exchange rate: individual-level r (score) from k questions drawn at random from each pool, mean of 20 draws, against the r of one earlier answer to the same question. "
            "No pool, at any size available in the persona, comes near it.",
        )
    return figs


def main():
    sys.path.insert(0, str(HERE.parent / "pilot"))
    from echo_pilot import report as R

    figs = build()
    d = OUT / "figures"
    d.mkdir(parents=True, exist_ok=True)
    parts = []
    for name, (svg, cap) in figs.items():
        (d / f"{name}.svg").write_text(svg)
        parts.append(f'<section class="fig" id="{name}">{svg}<p class="cap"><b>{name}.</b> {F.esc(cap)}</p></section>')
    page = f"<!doctype html><html><head><meta charset=utf-8><style>{R.CSS}</style></head><body><main class=page>{''.join(parts)}</main></body></html>"
    (d / "preview.html").write_text(page)
    print("figures:", ", ".join(figs))


if __name__ == "__main__":
    main()
