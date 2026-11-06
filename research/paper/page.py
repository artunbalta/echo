"""The draft as a page to read: `python3 research/paper/page.py` (needs the `markdown` package).

Reads draft.md and brief.md (made by build.py, never by hand) and writes draft.html and brief.html: the
same text, set as a paper, in the report's palette, light and dark.
"""
import html
import json
import re
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
RUNS = HERE.parent / "pilot" / "runs"
sys.path.insert(0, str(HERE.parent / "pilot"))

from echo_pilot import report as R  # noqa: E402  (pure Python: no engine, no numpy)

sys.path.insert(0, str(HERE.parent / "deeds"))
import figures_twin2k  # noqa: E402  (Studies 1 and 2, from research/deeds/runs)

CSS = """
/* A preprint: one measure of serif text, tables and formulae set quietly, the draft's status kept in view. */
:root {
  --paper: #f3f5f4; --sheet: #fbfcfb; --ink: #1c2a2e; --muted: #5a6a6e; --rule: #d3dbd8; --accent: #0d7f73; --warn: #9b3d2a; --warn-soft: #f5e2dc;
  --serif: "Source Serif 4", "Source Serif Pro", Georgia, serif;
  --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; }
body { background: var(--paper); color: var(--ink); font: 18px/1.65 var(--serif); }
.page { max-width: 760px; margin: 0 auto; padding-block: 32px 96px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.page > * { min-width: 0; }
.status { font: 500 13.5px/1.5 var(--sans); color: var(--warn); background: var(--warn-soft); padding: 10px 14px; border-radius: 6px; margin-bottom: 28px; }
h1 { font: 600 clamp(30px, 5.4vw, 44px)/1.12 var(--serif); letter-spacing: -.01em; margin: 0 0 12px; text-wrap: balance; }
h2 { font: 600 24px/1.25 var(--serif); margin: 44px 0 10px; text-wrap: balance; }
h3 { font: 600 13px/1.3 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 28px 0 8px; }
p, li { max-width: 68ch; }
p { margin: 0 0 14px; }
em { color: var(--muted); }
h1 + p em { font: 400 15px/1.5 var(--sans); color: var(--muted); }
strong { font-weight: 600; }
a { color: var(--accent); }
code { font: 0.86em var(--mono); background: var(--sheet); border: 1px solid var(--rule); border-radius: 4px; padding: 0 4px; }
ul, ol { padding-left: 1.2em; margin: 0 0 14px; }
li { margin: 4px 0; }
.tablewrap { overflow-x: auto; margin: 6px 0 20px; }
table { border-collapse: collapse; font: 14px/1.45 var(--sans); min-width: 100%; }
th, td { border-bottom: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; font-variant-numeric: tabular-nums; }
th { color: var(--muted); font-weight: 600; font-size: 12.5px; letter-spacing: .03em; }
td.num { white-space: nowrap; font-family: var(--mono); font-size: 13px; }
sub { font-size: 0.72em; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 32px 0; }
.refs li { font-size: 15px; line-height: 1.5; }
@media (max-width: 520px) { body { font-size: 16.5px; } }
/* Figures: the report's charts, in the same colours. */
:root { --sheet-fig: #fbfcfb; --rule-strong: #b9c4c1; --self: #b5532e; --friends: #6a5bb3; --engine: #8b9497; --axes: #4a7fbf; --traits: #9a4f86; --twin: #a88324; --together: #2e4148; --retest: #c97f1d; --oracle: #7a868a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --sheet-fig: #141d20; --rule-strong: #3d4e53; --self: #e48a63; --friends: #a597ec; --engine: #8d999c; --axes: #7fb0ea; --traits: #d088bd; --twin: #d7b24f; --together: #c9d8dc; --retest: #f0a94a; --oracle: #95a3a7; } }
:root[data-theme="dark"] { --sheet-fig: #141d20; --rule-strong: #3d4e53; --self: #e48a63; --friends: #a597ec; --engine: #8d999c; --axes: #7fb0ea; --traits: #d088bd; --twin: #d7b24f; --together: #c9d8dc; --retest: #f0a94a; --oracle: #95a3a7; }
figure { margin: 22px 0 26px; padding: 12px 12px 8px; background: var(--sheet-fig); border: 1px solid var(--rule); border-radius: 8px; }
figure .scroll { overflow-x: auto; }
figcaption { font: 400 13.5px/1.5 var(--sans); color: var(--muted); margin-top: 6px; max-width: 80ch; }
figcaption b { color: var(--ink); font-weight: 600; }
.chart { width: 100%; min-width: 620px; height: auto; display: block; font-family: var(--sans); }
.grid { stroke: var(--rule); stroke-width: 1; }
.grid.zero { stroke: var(--rule-strong); stroke-width: 1.4; }
.grid.target { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 6 5; }
.tick { fill: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.axisl { fill: var(--muted); font-size: 12.5px; }
.rowl { fill: var(--ink); font-size: 14px; }
.rowl.hero, .val.hero { font-weight: 700; fill: var(--accent); }
.val { fill: var(--ink); font: 13px var(--mono); }
.whisk { stroke-width: 2.4; stroke-linecap: round; opacity: .55; }
.ref { stroke-width: 1.6; stroke-dasharray: 5 4; }
.refl { fill: var(--muted); font-size: 11.5px; paint-order: stroke; stroke: var(--sheet-fig); stroke-width: 4px; stroke-linejoin: round; }
.level { stroke-width: 1.4; stroke-dasharray: 6 5; opacity: .9; }
.lvl { font-size: 12px; }
.curve { fill: none; stroke-width: 2; stroke-linejoin: round; }
.curve.hero { stroke-width: 3.4; }
.band { opacity: .14; }
.serl { font-size: 12.5px; font-weight: 600; }
.mark { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
.markdot { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.markl { fill: var(--ink); font: 600 12.5px var(--sans); paint-order: stroke; stroke: var(--sheet-fig); stroke-width: 4px; stroke-linejoin: round; }
"""


def figures() -> dict[str, tuple[str, str]]:
    """Each figure the draft marks (`<!-- figure:id -->`): its SVG and its caption, from the kept runs."""
    study = json.loads((RUNS / "study-16.json").read_text())
    power = json.loads((RUNS / "power.json").read_text())
    n_label = f"{study['reps']} simulated groups of {study['n']}"

    def across(setting: str) -> dict:
        out = {}
        for key, v in study["skill"].items():
            st, w = key.split(":")
            if st == setting and v["median"] is not None:
                lo, hi = v["iqr"] or (None, None)
                out[w] = {"value": v["median"], "lo": lo, "hi": hi}
        return out

    def refs(panel: dict) -> list[dict]:
        return [{"label": R.WHO[k][0], "value": panel[k]["value"], "color": R.WHO[k][1]} for k in ("retest", "oracle_axes", "oracle_person") if k in panel]

    again, elsewhere = across("again"), across("elsewhere")
    c = study["curve"]
    series = [
        {"label": R.WHO["echo_2l"][0], "color": "--accent", "values": c["echo_2l"]["median"], "band": c["echo_2l"]["iqr"], "hero": True},
        {"label": "One-layer echo", "color": "--axes", "values": c["echo_axes"]["median"]},
        {"label": "Engine's echo", "color": "--engine", "values": c["echo"]["median"]},
    ]
    lv = {k: v["median"] for k, v in study["lines"].items()}
    lines = [{"label": lab, "value": lv[k], "color": col} for k, lab, col in (("friends", "Friends", "--friends"), ("self", "Own words", "--self"), ("retest", "Own other visit", "--retest"), ("oracle_axes", "Traits known exactly", "--oracle")) if lv.get(k) is not None]
    fx = study["crossings"]["friends"]["median"]
    marks = [{"t": fx, "value": lv["friends"], "label": f"≈ {fx:.0f} min: as good as the friends"}] if fx is not None else []
    tests = [
        ("again:echo_2l>echo_axes", "two layers > one", "--accent"),
        ("again:echo_2l>bar", "echo > bar", "--axes"),
        ("again:self>bar", "own words > bar", "--self"),
        ("again:friends>bar", "friends > bar", "--friends"),
        ("again:echo_2l>friends", "echo > friends", "--together"),
        ("gap_give", "say–do gap, giving", "--retest"),
    ]
    return {
        **figures_twin2k.build(),
        "theory": (R.theory_chart(0.18, 0.45), "Skill (1 − MSE/var) at predicting the next choice of a kind after n looks, at the split the simulation assumes for giving (h² = .18, ν = .45): the closed forms of §4. The amber dot is copying the last choice."),
        "again": (R.dot_chart(R._witness_rows(again, R.ORDER), refs(again), note="Skill when the situation comes again"), f"When the situation comes again: each witness's skill over the bar, the second visit predicted from the first. Medians across {n_label}; whiskers span the middle half of groups. Dashed lines: copying the first visit, the traits known exactly, the person known exactly."),
        "curve": (R.curve_chart(c["minutes"], series, lines, marks), f"The minutes it takes: the echoes' skill from the first t minutes of the first visit, against the levels of the friends, the person's own words, their other visit and exact trait knowledge. Medians across {n_label}; the band spans the middle half of groups."),
        "elsewhere": (R.dot_chart(R._witness_rows(elsewhere, R.ORDER), refs(elsewhere), note="Skill in an unseen situation"), f"A situation never seen: each choice predicted with that paradigm hidden on both visits. Medians across {n_label}."),
        "power": (R.power_chart(power, tests), f"Power of the planned tests by group size: the share of {power['reps']} simulated groups per size in which each comes out at p < .05 (one-sided sign-flip over people). The dashed line marks .8."),
    }



STATUS = {
    "draft": "Working draft. Studies 1 and 2 are pre-registered analyses of public data. Study 3's pilot data are not yet in, so its results are simulated.",
    "brief": "Brief version of the working draft. All four studies are pre-registered analyses of public data; the working draft has every table, test and deviation.",
}


def main() -> int:
    for name in STATUS:
        render(name)
    return 0


def render(name: str) -> None:
    text = (HERE / f"{name}.md").read_text()
    title = re.match(r"# (.+)", text).group(1)
    body = markdown.markdown(text, extensions=["tables", "sane_lists"])
    body = body.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    # Numbers stay on one line; prose cells wrap.
    numeric = re.compile(r"^(?:[+−\-–]?[\d.]+%?(?: \[[^\]]+\])?|–|&gt;\d+)$")
    body = re.sub(r"<td>([^<]*)</td>", lambda m: f'<td class="num">{m.group(1)}</td>' if numeric.match(m.group(1).strip()) else m.group(0), body)
    # Subscripts in the formulae (x_ijt, μ_j, …), outside code.
    parts = re.split(r"(<code>.*?</code>)", body, flags=re.S)
    sub = re.compile(r"(?<![A-Za-z0-9_/])([xzuwμεστσ])_([a-z]{1,3})(?![a-z])")
    body = "".join(part if part.startswith("<code>") else sub.sub(r"\1<sub>\2</sub>", part) for part in parts)
    body = re.sub(r'(<h2[^>]*>References[^<]*</h2>\s*)<ul>', r'\1<ul class="refs">', body)
    # The figures, numbered in the order they appear.
    figs, count = figures(), [0]

    def figure(m: "re.Match") -> str:
        svg, caption = figs[m.group(1)]
        count[0] += 1
        return f'<figure id="fig-{m.group(1)}"><div class="scroll">{svg}</div><figcaption><b>Figure {count[0]}.</b> {html.escape(caption)}</figcaption></figure>'

    body = re.sub(r"<!-- figure:(\w+) -->", figure, body)
    page = f"""<title>{html.escape(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>{CSS}</style>
<main class="page">
<div class="status">{STATUS[name]}</div>
{body}
</main>
"""
    (HERE / f"{name}.html").write_text(page, encoding="utf-8")
    print(f"{name}.html: {len(page)} bytes")


if __name__ == "__main__":
    raise SystemExit(main())
