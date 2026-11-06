"""
The study's figures as SVG in the pilot report's language (research/pilot/echo_pilot/report.py): CSS classes
and `var(--…)` colours, so one drawing serves the draft's page and the artifact, light and dark.
Every number is read from out/ (results.json, ceiling.json, llm_on_covered.json, exchange.json, bbrs).
"""
from __future__ import annotations

import html
import math
from typing import Optional

COL = {
    "crowd": "--engine", "twin": "--twin", "regression": "--axes", "words": "--self", "deeds": "--traits",
    "again": "--retest", "echo": "--accent", "theory": "--oracle", "warn": "--warn",
}


def esc(x) -> str:
    return html.escape(str(x), quote=True)


def fmt(x: Optional[float], d: int = 3) -> str:
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "–"
    return f"{x:.{d}f}".replace("-", "−")


def _ticks(lo: float, hi: float, step: float) -> list[float]:
    t, out = math.ceil(lo / step - 1e-9) * step, []
    while t <= hi + 1e-9:
        out.append(round(t, 6))
        t += step
    return out


def ladder(rows: list[dict], refs: list[dict], lo: float = 0.55, hi: float = 0.9, note: str = "") -> str:
    """
    Accuracy on one axis. Each row is a label with one or more dots (`values`, the first is the row's hero);
    `range` draws a bar under the dots; `open` dots are theory, not data. Reference lines run the full height.
    """
    W, left, right, top, row_h = 860, 340, 70, 46, 34
    bottom = top + row_h * len(rows)
    H = bottom + 34 + 16 * len(refs)
    x = lambda v: left + (W - left - right) * (min(max(v, lo), hi) - lo) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.05):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top - 10}" y2="{bottom}" class="grid"/>')
        out.append(f'<text x="{x(t):.1f}" y="{bottom + 18}" class="tick" text-anchor="middle">{fmt(t, 2)}</text>')
    out.append(f'<text x="{left}" y="{top - 22}" class="refl">accuracy on the benchmark\'s own metric (1 − |guess − answer| / range)</text>')
    mid = (left + W - right) / 2
    for i, r in enumerate(refs):
        rx, ly = x(r["value"]), bottom + 38 + 16 * i
        out.append(f'<line x1="{rx:.1f}" x2="{rx:.1f}" y1="{top - 6}" y2="{ly - 11}" class="ref" style="stroke:var({r["color"]})"/>')
        anchor, dx = ("end", -5) if rx > mid else ("start", 5)
        out.append(f'<text x="{rx + dx:.1f}" y="{ly}" class="refl" text-anchor="{anchor}" style="fill:var({r["color"]})">{esc(r["label"])} {fmt(r["value"])}</text>')
    for i, r in enumerate(rows):
        y = top + row_h * i + row_h / 2
        hero = r.get("hero", False)
        out.append(f'<text x="{left - 14}" y="{y + 4:.1f}" class="rowl{" hero" if hero else ""}" text-anchor="end">{esc(r["label"])}</text>')
        if r.get("range"):
            a, b = r["range"]
            out.append(f'<line x1="{x(a):.1f}" x2="{x(b):.1f}" y1="{y:.1f}" y2="{y:.1f}" class="whisk" style="stroke:var({r["color"]});stroke-width:7;stroke-linecap:round;opacity:.35"/>')
        for k, v in enumerate(r["values"]):
            rad = (7 if hero else 5.5) if k == 0 else 3.6
            if r.get("open"):
                out.append(f'<circle cx="{x(v):.1f}" cy="{y:.1f}" r="{rad}" style="fill:var(--sheet, #fff);stroke:var({r["color"]});stroke-width:2"/>')
            else:
                out.append(f'<circle cx="{x(v):.1f}" cy="{y:.1f}" r="{rad}" style="fill:var({r["color"]})"/>')
        out.append(f'<text x="{W - right + 10}" y="{y + 4:.1f}" class="val{" hero" if hero else ""}">{fmt(r["values"][0])}</text>')
    out.append("</svg>")
    return "".join(out)


def bars_r(rows: list[dict], lo: float = 0.0, hi: float = 0.6, note: str = "") -> str:
    """Individual-level r per witness: a bar from 0, a second (score) mark where a witness has one."""
    W, left, right, top, row_h = 860, 300, 140, 40, 28
    bottom = top + row_h * len(rows)
    H = bottom + 30
    x = lambda v: left + (W - left - right) * (min(max(v, lo), hi) - lo) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.1):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top - 8}" y2="{bottom}" class="grid{" zero" if t == 0 else ""}"/>')
        out.append(f'<text x="{x(t):.1f}" y="{bottom + 18}" class="tick" text-anchor="middle">{fmt(t, 1)}</text>')
    out.append(f'<text x="{left}" y="{top - 18}" class="refl">r across people: does the guess put those who answer higher above those who answer lower?</text>')
    for i, r in enumerate(rows):
        y = top + row_h * i + row_h / 2
        hero = r.get("hero", False)
        out.append(f'<text x="{left - 14}" y="{y + 4:.1f}" class="rowl{" hero" if hero else ""}" text-anchor="end">{esc(r["label"])}</text>')
        v = max(r["value"], lo)
        out.append(f'<rect x="{x(lo):.1f}" y="{y - 8:.1f}" width="{max(x(v) - x(lo), 1):.1f}" height="16" rx="3" style="fill:var({r["color"]});opacity:{1 if hero else .85}"/>')
        if r.get("score") is not None:
            out.append(f'<line x1="{x(r["score"]):.1f}" x2="{x(r["score"]):.1f}" y1="{y - 11:.1f}" y2="{y + 11:.1f}" style="stroke:var(--ink);stroke-width:2"/>')
        label = fmt(r["value"]) + (f"  ({fmt(r['score'])})" if r.get("score") is not None else "")
        out.append(f'<text x="{W - right + 10}" y="{y + 4:.1f}" class="val{" hero" if hero else ""}">{label}</text>')
    out.append("</svg>")
    return "".join(out)


def looks(curve: dict[int, float], points: list[dict], lines: list[dict], lo: float = 0.68, hi: float = 0.88, note: str = "") -> str:
    """
    Accuracy against the number of earlier answers to the same question: the model's Bayes-optimal echo
    (line), the observed witnesses at their number of looks (dots), and levels (dashed lines).
    """
    W, left, right, top, bottom_pad = 820, 70, 230, 30, 46
    H = 380
    ns = sorted(curve)
    nmax = max(ns)
    xs = lambda n: left + (W - left - right) * math.sqrt(n) / math.sqrt(nmax)  # noqa: E731  (√ spacing: the early looks matter most)
    y = lambda v: top + (H - top - bottom_pad) * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.02):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(t):.1f}" y2="{y(t):.1f}" class="grid"/>')
        out.append(f'<text x="{left - 8}" y="{y(t) + 4:.1f}" class="tick" text-anchor="end">{fmt(t, 2)}</text>')
    for n in ns:
        out.append(f'<text x="{xs(n):.1f}" y="{H - bottom_pad + 18}" class="tick" text-anchor="middle">{n}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 8}" class="refl" text-anchor="middle">earlier answers to the same question the echo has seen</text>')
    ends = []
    for ln in lines:
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(ln["value"]):.1f}" y2="{y(ln["value"]):.1f}" class="ref" style="stroke:var({ln["color"]})"/>')
        ends.append((y(ln["value"]), f'{ln["label"]} {fmt(ln["value"])}', ln["color"]))
    path = " ".join(f'{"M" if i == 0 else "L"}{xs(n):.1f},{y(curve[n]):.1f}' for i, n in enumerate(ns))
    out.append(f'<path d="{path}" style="fill:none;stroke:var(--accent);stroke-width:3"/>')
    for n in ns:
        out.append(f'<circle cx="{xs(n):.1f}" cy="{y(curve[n]):.1f}" r="3.5" style="fill:var(--accent)"/>')
    ends.append((y(curve[nmax]), f"Bayes-optimal echo (model) {fmt(curve[nmax])} at {nmax}", "--accent"))
    for p in points:
        cx = xs(p["n"]) + p.get("dx", 0)
        out.append(f'<circle cx="{cx:.1f}" cy="{y(p["value"]):.1f}" r="6" style="fill:var({p["color"]});stroke:var(--sheet,#fff);stroke-width:1.5"/>')
        ends.append((y(p["value"]), f'{p["label"]} {fmt(p["value"])}', p["color"]))
    ends.sort()
    placed = []
    for yy, text, color in ends:
        yy = max(yy, placed[-1] + 14) if placed else yy
        placed.append(yy)
        out.append(f'<text x="{W - right + 8}" y="{yy + 4:.1f}" class="refl" style="fill:var({color})">{esc(text)}</text>')
    out.append("</svg>")
    return "".join(out)


def copy_vs_echo(tasks: list[dict], note: str = "") -> str:
    """BBRS: skill of copying and of the echo against the task's retest r, with the theory's curves 2ρ−1 and ρ²."""
    W, H, left, right, top, bottom_pad = 820, 400, 70, 190, 24, 48
    lo, hi = -1.1, 0.6
    x = lambda r: left + (W - left - right) * max(min(r, 0.75), 0) / 0.75  # noqa: E731
    y = lambda v: top + (H - top - bottom_pad) * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.2):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(t):.1f}" y2="{y(t):.1f}" class="grid{" zero" if abs(t) < 1e-9 else ""}"/>')
        out.append(f'<text x="{left - 8}" y="{y(t) + 4:.1f}" class="tick" text-anchor="end">{fmt(t, 1)}</text>')
    for t in _ticks(0, 0.75, 0.25):
        out.append(f'<text x="{x(t):.1f}" y="{H - bottom_pad + 18}" class="tick" text-anchor="middle">{fmt(t, 2)}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 8}" class="refl" text-anchor="middle">retest r of the task (ρ), about six months apart</text>')
    out.append(f'<text x="{left + 30}" y="{y(0) - 8:.1f}" class="refl">0 = the crowd\'s mean: knows nobody</text>')
    rs = [i / 100 for i in range(0, 76)]
    for fn, color, label in ((lambda r: 2 * r - 1, "--retest", "theory, copying: 2ρ − 1"), (lambda r: r * r, "--accent", "theory, echo after one look: ρ²")):
        d = " ".join(f'{"M" if i == 0 else "L"}{x(r):.1f},{y(fn(r)):.1f}' for i, r in enumerate(rs))
        out.append(f'<path d="{d}" style="fill:none;stroke:var({color});stroke-width:2;stroke-dasharray:6 5"/>')
        out.append(f'<text x="{W - right + 8}" y="{y(fn(0.75)) + 4:.1f}" class="refl" style="fill:var({color})">{esc(label)}</text>')
    for t in tasks:
        out.append(f'<circle cx="{x(t["rho"]):.1f}" cy="{y(t["copy"]):.1f}" r="6" style="fill:var(--retest)"/>')
        out.append(f'<circle cx="{x(t["rho"]):.1f}" cy="{y(t["echo"]):.1f}" r="6" style="fill:var(--accent)"/>')
        out.append(f'<line x1="{x(t["rho"]):.1f}" x2="{x(t["rho"]):.1f}" y1="{y(t["copy"]):.1f}" y2="{y(t["echo"]):.1f}" style="stroke:var(--rule);stroke-width:1"/>')
        out.append(f'<text x="{x(t["rho"]) + 10:.1f}" y="{y(t["copy"]) + 4:.1f}" class="tick">{esc(t["task"])}</text>')
    out.append("</svg>")
    return "".join(out)


def exchange(curves: dict[str, dict[int, float]], again: float, colors: dict[str, str], labels: dict[str, str], note: str = "") -> str:
    """r against the number of items drawn from each pool (log spacing), with one earlier answer's r as the level to reach."""
    W, H, left, right, top, bottom_pad = 820, 380, 70, 210, 24, 48
    ks = sorted({k for c in curves.values() for k in c})
    lo, hi = 0.0, max(0.55, again + 0.05)
    xk = lambda k: left + (W - left - right) * math.log2(k) / math.log2(max(ks))  # noqa: E731
    y = lambda v: top + (H - top - bottom_pad) * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.1):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(t):.1f}" y2="{y(t):.1f}" class="grid"/>')
        out.append(f'<text x="{left - 8}" y="{y(t) + 4:.1f}" class="tick" text-anchor="end">{fmt(t, 1)}</text>')
    for k in ks:
        out.append(f'<text x="{xk(k):.1f}" y="{H - bottom_pad + 18}" class="tick" text-anchor="middle">{k}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 8}" class="refl" text-anchor="middle">questions drawn at random from the pool (each with all its coded answers)</text>')
    out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(again):.1f}" y2="{y(again):.1f}" class="ref" style="stroke:var(--retest)"/>')
    ends = [(y(again), f"one earlier answer {fmt(again)}", "--retest")]
    for name, c in curves.items():
        kk = sorted(c)
        d = " ".join(f'{"M" if i == 0 else "L"}{xk(k):.1f},{y(c[k]):.1f}' for i, k in enumerate(kk))
        out.append(f'<path d="{d}" style="fill:none;stroke:var({colors[name]});stroke-width:2.5"/>')
        for k in kk:
            out.append(f'<circle cx="{xk(k):.1f}" cy="{y(c[k]):.1f}" r="3" style="fill:var({colors[name]})"/>')
        ends.append((y(c[kk[-1]]), f"{labels[name]} {fmt(c[kk[-1]])} at {kk[-1]}", colors[name]))
    ends.sort()
    placed = []
    for yy, text, color in ends:
        yy = max(yy, placed[-1] + 14) if placed else yy
        placed.append(yy)
        out.append(f'<text x="{W - right + 8}" y="{yy + 4:.1f}" class="refl" style="fill:var({color})">{esc(text)}</text>')
    out.append("</svg>")
    return "".join(out)


def laws(points: list[dict], note: str = "") -> str:
    """Many measures at once: skill of copying and of the echo against each measure's retest r, with 2ρ − 1 and ρ²."""
    W, H, left, right, top, bottom_pad = 820, 420, 70, 190, 24, 48
    xlo, xhi, lo, hi = -0.2, 1.0, -1.6, 0.9
    x = lambda r: left + (W - left - right) * (min(max(r, xlo), xhi) - xlo) / (xhi - xlo)  # noqa: E731
    y = lambda v: top + (H - top - bottom_pad) * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.4):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(t):.1f}" y2="{y(t):.1f}" class="grid{" zero" if abs(t) < 1e-9 else ""}"/>')
        out.append(f'<text x="{left - 8}" y="{y(t) + 4:.1f}" class="tick" text-anchor="end">{fmt(t, 1)}</text>')
    for t in _ticks(-0.2, 1.0, 0.2):
        out.append(f'<text x="{x(t):.1f}" y="{H - bottom_pad + 18}" class="tick" text-anchor="middle">{fmt(t, 1)}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 8}" class="refl" text-anchor="middle">retest r of the measure (ρ), about four months apart</text>')
    out.append(f'<text x="{left + 6}" y="{y(0) - 6:.1f}" class="refl">0 = the crowd\'s mean</text>')
    rs = [i / 100 for i in range(0, 95)]
    for fn, color, label, ly in ((lambda r: r * r, "--accent", "echo after one look: theory ρ²", 0), (lambda r: 2 * r - 1, "--retest", "copying: theory 2ρ − 1", 1)):
        d = " ".join(f'{"M" if i == 0 else "L"}{x(r):.1f},{y(fn(r)):.1f}' for i, r in enumerate(rs))
        out.append(f'<path d="{d}" style="fill:none;stroke:var({color});stroke-width:2;stroke-dasharray:6 5"/>')
        out.append(f'<text x="{W - right + 8}" y="{top + 18 + 18 * ly:.1f}" class="refl" style="fill:var({color})">{esc(label)}</text>')
    for p in points:
        out.append(f'<circle cx="{x(p["rho"]):.1f}" cy="{y(p["copy"]):.1f}" r="3.2" style="fill:var(--retest);opacity:.75"/>')
    for p in points:
        out.append(f'<circle cx="{x(p["rho"]):.1f}" cy="{y(p["echo"]):.1f}" r="3.2" style="fill:var(--accent);opacity:.85"/>')
    out.append("</svg>")
    return "".join(out)
