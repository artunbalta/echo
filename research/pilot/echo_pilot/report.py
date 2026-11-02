"""The study's report: one self-contained HTML page from an analysis (and, for the simulation, the power run).

Every chart is inline SVG drawn here from the numbers, to one scale per chart; the page needs nothing but
two Google fonts. A simulated report says so at the top and on every panel that rests on simulated data.
"""
from __future__ import annotations

import html
import json
import math
from datetime import datetime, timezone
from typing import Iterable, Optional

from .paradigms import LABEL, PARADIGMS

WHO = {
    "self": ("Their own words", "--self"),
    "friends": ("Their friends", "--friends"),
    "echo": ("The engine's echo, as built", "--engine"),
    "echo_axes": ("One-layer echo (traits only)", "--axes"),
    "echo_2l": ("Two-layer echo", "--accent"),
    "traits": ("Questionnaire twin", "--traits"),
    "twin": ("Group model", "--twin"),
    "together": ("Self, friends and echo, pooled", "--together"),
    "retest": ("Their own other visit", "--retest"),
    "oracle_axes": ("Knowing their 8 traits exactly", "--oracle"),
    "oracle_person": ("Knowing them exactly", "--oracle"),
}
ORDER = ("echo_2l", "together", "self", "friends", "twin", "traits", "echo_axes", "echo")
WORLD = {
    "give": "A hungry stranger on the path. You carry three loaves.",
    "lend": "Someone needs your raft to reach the far shore.",
    "bet": "A fisher offers two fish now, or a bet on the tide with the same two on average.",
    "seed": "A handful of grain now, or a seed that will be three handfuls tomorrow.",
    "path": "An overgrown path leaves the marked one.",
    "greet": "A traveller sits alone by a fire.",
}
CODING = {
    "give": "0, ⅓, ⅔, 1 of the loaves",
    "lend": "lent 1, kept 0",
    "bet": "safe 0, even 0.5, long 1",
    "seed": "planted 1, ate 0",
    "path": "followed 1, passed 0",
    "greet": "went up 1, walked on 0",
}


def esc(x) -> str:
    return html.escape(str(x), quote=True)


def num(x: Optional[float], digits: int = 2, signed: bool = False) -> str:
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "–"
    s = f"{x:+.{digits}f}" if signed else f"{x:.{digits}f}"
    return s.replace("-", "−")


def pct(x: Optional[float]) -> str:
    return "–" if x is None else f"{round(100 * x)}%"


# ── charts ─────────────────────────────────────────────────────────────────────────────────────────


def _ticks(lo: float, hi: float, step: float) -> list[float]:
    start = math.ceil(lo / step - 1e-9) * step
    out, t = [], start
    while t <= hi + 1e-9:
        out.append(round(t, 6))
        t += step
    return out


def _spread(ys: list[float], gap: float, lo: float, hi: float) -> list[float]:
    """Label positions near `ys`, at least `gap` apart, kept within [lo, hi] (order kept)."""
    order = sorted(range(len(ys)), key=lambda i: ys[i])
    pos = [ys[i] for i in order]
    for k in range(1, len(pos)):
        pos[k] = max(pos[k], pos[k - 1] + gap)
    overflow = pos[-1] - hi if pos else 0
    if overflow > 0:
        pos = [p - overflow for p in pos]
        for k in range(len(pos) - 2, -1, -1):
            pos[k] = min(pos[k], pos[k + 1] - gap)
    pos = [max(p, lo) for p in pos]
    out = [0.0] * len(ys)
    for k, i in enumerate(order):
        out[i] = pos[k]
    return out


def dot_chart(rows: list[dict], refs: list[dict], lo: float = -0.4, hi: float = 0.8, note: str = "") -> str:
    """Skill per witness: a dot and its interval on one axis from `lo` to `hi`, with reference lines."""
    W, left, right, top, row_h = 780, 236, 64, 40, 34
    refs = [r for r in refs if r["value"] is not None]
    bottom = top + row_h * len(rows)
    H = bottom + 30 + 15 * len(refs) + 6
    x = lambda v: left + (W - left - right) * (min(max(v, lo), hi) - lo) / (hi - lo)  # noqa: E731
    mid = (left + W - right) / 2
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart">']
    for t in _ticks(lo, hi, 0.2):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top - 8}" y2="{bottom}" class="grid{" zero" if t == 0 else ""}"/>')
        out.append(f'<text x="{x(t):.1f}" y="{bottom + 18}" class="tick" text-anchor="middle">{num(t, 1)}</text>')
    out.append(f'<text x="{x(0) + 4:.1f}" y="{top - 14}" class="refl">0 = the bar, the group\'s usual choice</text>')
    for i, r in enumerate(refs):
        rx, ly = x(r["value"]), bottom + 36 + 15 * i
        out.append(f'<line x1="{rx:.1f}" x2="{rx:.1f}" y1="{top - 2}" y2="{ly - 10}" class="ref" style="stroke:var({r["color"]})"/>')
        anchor, dx = ("end", -5) if rx > mid else ("start", 5)
        out.append(f'<text x="{rx + dx:.1f}" y="{ly}" class="refl" text-anchor="{anchor}" style="fill:var({r["color"]})">{esc(r["label"])} {num(r["value"], 2, True)}</text>')
    for i, r in enumerate(rows):
        y = top + row_h * i + row_h / 2
        hero = r.get("hero", False)
        out.append(f'<text x="{left - 14}" y="{y + 4:.1f}" class="rowl{" hero" if hero else ""}" text-anchor="end">{esc(r["label"])}</text>')
        if r["value"] is None:
            out.append(f'<text x="{x(0) + 8:.1f}" y="{y + 4:.1f}" class="tick">no estimate</text>')
            continue
        if r.get("lo") is not None and r.get("hi") is not None:
            out.append(f'<line x1="{x(r["lo"]):.1f}" x2="{x(r["hi"]):.1f}" y1="{y:.1f}" y2="{y:.1f}" class="whisk" style="stroke:var({r["color"]})"/>')
        out.append(f'<circle cx="{x(r["value"]):.1f}" cy="{y:.1f}" r="{7 if hero else 5.5}" style="fill:var({r["color"]})"/>')
        out.append(f'<text x="{W - right + 10}" y="{y + 4:.1f}" class="val{" hero" if hero else ""}">{num(r["value"], 2, True)}</text>')
    out.append("</svg>")
    return "".join(out)


def curve_chart(minutes: list[float], series: list[dict], lines: list[dict], marks: list[dict], lo: float = -0.15, hi: float = 0.6) -> str:
    """Skill over the first visit's minutes: the echoes' curves (with a band where given) against level lines."""
    W, left, right, top, bottom = 780, 56, 196, 18, 46
    H = 380
    t_max = max(minutes)
    x = lambda t: left + (W - left - right) * t / t_max  # noqa: E731
    y = lambda v: top + (H - top - bottom) * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Skill over minutes of play" class="chart">']
    for v in _ticks(lo, hi, 0.1):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid{" zero" if abs(v) < 1e-9 else ""}"/>')
        out.append(f'<text x="{left - 8}" y="{y(v) + 4:.1f}" class="tick" text-anchor="end">{num(v, 1)}</text>')
    for t in minutes:
        out.append(f'<text x="{x(t):.1f}" y="{H - bottom + 18}" class="tick" text-anchor="middle">{t:g}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 6}" class="axisl" text-anchor="middle">minutes into the first visit</text>')
    for s in series:
        if s.get("band"):
            band = [(t, b) for t, b in zip(minutes, s["band"]) if b is not None and b[0] is not None]
            if band:
                upper = " ".join(f"{x(t):.1f},{y(b[1]):.1f}" for t, b in band)
                lower = " ".join(f"{x(t):.1f},{y(b[0]):.1f}" for t, b in reversed(band))
                out.append(f'<polygon points="{upper} {lower}" class="band" style="fill:var({s["color"]})"/>')
    for ln in lines:
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(ln["value"]):.1f}" y2="{y(ln["value"]):.1f}" class="level" style="stroke:var({ln["color"]})"/>')
    ends = []
    for s in series:
        pts = [(t, v) for t, v in zip(minutes, s["values"]) if v is not None]
        path = " ".join(f"{x(t):.1f},{y(v):.1f}" for t, v in pts)
        out.append(f'<polyline points="{path}" class="curve{" hero" if s.get("hero") else ""}" style="stroke:var({s["color"]})"/>')
        for t, v in pts:
            out.append(f'<circle cx="{x(t):.1f}" cy="{y(v):.1f}" r="{3.5 if s.get("hero") else 2.5}" style="fill:var({s["color"]})"/>')
        if pts:
            ends.append((y(pts[-1][1]), s["label"], s["color"], True))
    for ln in lines:
        ends.append((y(ln["value"]), f'{ln["label"]} {num(ln["value"], 2)}', ln["color"], False))
    ly = _spread([e[0] for e in ends], 14, top + 4, H - bottom - 2)
    for (_y, label, color, bold), lyy in zip(ends, ly):
        out.append(f'<text x="{W - right + 8}" y="{lyy + 4:.1f}" class="{"serl" if bold else "lvl"}" style="fill:var({color})">{esc(label)}</text>')
    for m in marks:
        if m["t"] is None:
            continue
        mx, my = x(m["t"]), y(m["value"])
        out.append(f'<line x1="{mx:.1f}" x2="{mx:.1f}" y1="{my:.1f}" y2="{H - bottom}" class="mark"/>')
        out.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="6" class="markdot"/>')
        out.append(f'<text x="{mx + 8:.1f}" y="{H - bottom - 8:.1f}" class="markl">{esc(m["label"])}</text>')
    out.append("</svg>")
    return "".join(out)


def dot_chart_narrow(rows: list[dict], refs: list[dict], lo: float = -0.4, hi: float = 0.8, note: str = "") -> str:
    """The dot chart for a phone: each witness's name above its row, the reference lines named below."""
    W, left, right, top, row_h = 380, 10, 54, 22, 46
    refs = [r for r in refs if r["value"] is not None]
    bottom = top + row_h * len(rows)
    H = bottom + 26 + 16 * len(refs) + 8
    x = lambda v: left + (W - left - right) * (min(max(v, lo), hi) - lo) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(note)}" class="chart narrowchart">']
    for t in _ticks(lo, hi, 0.4):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top - 4}" y2="{bottom}" class="grid{" zero" if t == 0 else ""}"/>')
        out.append(f'<text x="{x(t):.1f}" y="{bottom + 16}" class="tick" text-anchor="middle">{num(t, 1)}</text>')
    out.append(f'<text x="{x(0) + 4:.1f}" y="{top - 8}" class="refl">0 = the bar</text>')
    for i, r in enumerate(refs):
        rx, ly = x(r["value"]), bottom + 34 + 16 * i
        out.append(f'<line x1="{rx:.1f}" x2="{rx:.1f}" y1="{top}" y2="{bottom}" class="ref" style="stroke:var({r["color"]})"/>')
        out.append(f'<text x="{left}" y="{ly}" class="refl" style="fill:var({r["color"]})">— {esc(r["label"])} {num(r["value"], 2, True)}</text>')
    for i, r in enumerate(rows):
        y = top + row_h * i + row_h - 14
        hero = r.get("hero", False)
        out.append(f'<text x="{left}" y="{y - 13:.1f}" class="rowl{" hero" if hero else ""}">{esc(r["label"])}</text>')
        if r["value"] is None:
            continue
        if r.get("lo") is not None and r.get("hi") is not None:
            out.append(f'<line x1="{x(r["lo"]):.1f}" x2="{x(r["hi"]):.1f}" y1="{y:.1f}" y2="{y:.1f}" class="whisk" style="stroke:var({r["color"]})"/>')
        out.append(f'<circle cx="{x(r["value"]):.1f}" cy="{y:.1f}" r="{7 if hero else 5.5}" style="fill:var({r["color"]})"/>')
        out.append(f'<text x="{W - 4}" y="{y + 4:.1f}" class="val{" hero" if hero else ""}" text-anchor="end">{num(r["value"], 2, True)}</text>')
    out.append("</svg>")
    return "".join(out)


def curve_chart_narrow(minutes: list[float], series: list[dict], lines: list[dict], marks: list[dict], lo: float = -0.15, hi: float = 0.6) -> str:
    """The curve for a phone: the plot full width, what each line is named in a key below it."""
    W, left, right, top = 380, 34, 10, 12
    plot_h = 230
    keys = [(s["label"], s["color"], None, True) for s in series] + [(ln["label"], ln["color"], ln["value"], False) for ln in lines]
    H = top + plot_h + 40 + 17 * len(keys)
    t_max = max(minutes)
    x = lambda t: left + (W - left - right) * t / t_max  # noqa: E731
    y = lambda v: top + plot_h * (hi - min(max(v, lo), hi)) / (hi - lo)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Skill over minutes of play" class="chart narrowchart">']
    for v in _ticks(lo, hi, 0.2):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid{" zero" if abs(v) < 1e-9 else ""}"/>')
        out.append(f'<text x="{left - 6}" y="{y(v) + 4:.1f}" class="tick" text-anchor="end">{num(v, 1)}</text>')
    for t in (0, 5, 10, 15, 20, 25):
        if t <= t_max:
            out.append(f'<text x="{x(t):.1f}" y="{top + plot_h + 16}" class="tick" text-anchor="middle">{t}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{top + plot_h + 32}" class="axisl" text-anchor="middle">minutes into the first visit</text>')
    for s in series:
        if s.get("band"):
            band = [(t, b) for t, b in zip(minutes, s["band"]) if b is not None and b[0] is not None]
            if band:
                upper = " ".join(f"{x(t):.1f},{y(b[1]):.1f}" for t, b in band)
                lower = " ".join(f"{x(t):.1f},{y(b[0]):.1f}" for t, b in reversed(band))
                out.append(f'<polygon points="{upper} {lower}" class="band" style="fill:var({s["color"]})"/>')
    for ln in lines:
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(ln["value"]):.1f}" y2="{y(ln["value"]):.1f}" class="level" style="stroke:var({ln["color"]})"/>')
    for s in series:
        pts = [(t, v) for t, v in zip(minutes, s["values"]) if v is not None]
        out.append(f'<polyline points="{" ".join(f"{x(t):.1f},{y(v):.1f}" for t, v in pts)}" class="curve{" hero" if s.get("hero") else ""}" style="stroke:var({s["color"]})"/>')
    for m in marks:
        if m["t"] is not None:
            out.append(f'<circle cx="{x(m["t"]):.1f}" cy="{y(m["value"]):.1f}" r="6" class="markdot"/>')
    ky = top + plot_h + 52
    for i, (label, color, value, solid) in enumerate(keys):
        yy = ky + 17 * i
        out.append(f'<line x1="{left}" x2="{left + 22}" y1="{yy - 4}" y2="{yy - 4}" class="{"curve" if solid else "level"}" style="stroke:var({color})"/>')
        out.append(f'<text x="{left + 30}" y="{yy}" class="lvl" style="fill:var({color})">{esc(label)}{"" if value is None else " " + num(value, 2)}</text>')
    out.append("</svg>")
    return "".join(out)


def theory_chart(h2: float, nu: float, looks: int = 20) -> str:
    """The closed forms (`theory.py`) as a still figure: skill after n looks, one layer and two, with the ceilings."""
    from .theory import copying, one_layer, two_layers

    W, left, right, top, bottom, H = 780, 56, 210, 14, 44, 330
    rho = h2 + nu
    x = lambda n: left + (W - left - right) * n / looks  # noqa: E731
    y = lambda v: top + (H - top - bottom) * (1 - max(0.0, min(1.0, v)))  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Skill after n looks, one layer and two" class="chart">']
    for v in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid"/>')
        out.append(f'<text x="{left - 8}" y="{y(v) + 4:.1f}" class="tick" text-anchor="end">{num(v, 1)}</text>')
    for n in (0, 1, 2, 5, 10, 15, 20):
        out.append(f'<text x="{x(n):.1f}" y="{H - bottom + 18}" class="tick" text-anchor="middle">{n}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 6}" class="axisl" text-anchor="middle">times it has watched you in this situation</text>')
    ends = []
    for v, color, label in ((rho, "--oracle", f"knowing them exactly {num(rho)}"), (h2, "--axes", f"knowing their traits exactly {num(h2)}")):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="level" style="stroke:var({color})"/>')
        ends.append((y(v), label, color))
    for fn, color, label, hero in ((one_layer, "--axes", "one-layer echo", False), (two_layers, "--accent", "two-layer echo", True)):
        pts = " ".join(f"{x(n):.1f},{y(fn(h2, nu, n)):.1f}" for n in range(looks + 1))
        out.append(f'<polyline points="{pts}" class="curve{" hero" if hero else ""}" style="stroke:var({color})"/>')
        ends.append((y(fn(h2, nu, looks)), label, color))
    c = copying(h2, nu)
    out.append(f'<circle cx="{x(1):.1f}" cy="{y(c):.1f}" r="6" style="fill:var(--retest)"/>')
    ends.append((y(c), f"copying last time {num(c)}", "--retest"))
    ly = _spread([e[0] for e in ends], 15, top + 4, H - bottom)
    for (_y, label, color), lyy in zip(ends, ly):
        out.append(f'<text x="{W - right + 10}" y="{lyy + 4:.1f}" class="lvl" style="fill:var({color})">{esc(label)}</text>')
    out.append("</svg>")
    return "".join(out)


def shares_chart(shares: dict, truth: Optional[dict]) -> str:
    """Each paradigm's variance split into traits / the person's own / the visit, as fitted (and as simulated)."""
    W, left, right, top, row_h = 780, 190, 20, 34, 30
    rows = [p for p in PARADIGMS if p in shares]
    H = top + row_h * len(rows) + 30
    span = W - left - right
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="What a choice is made of" class="chart">']
    keys = (("traits", "--axes", "traits"), ("own", "--accent", "their own"), ("visit", "--rule-strong", "the day"))
    lx = left
    for _key, color, name in keys:
        out.append(f'<rect x="{lx}" y="8" width="12" height="12" rx="2" style="fill:var({color})"/><text x="{lx + 18}" y="18" class="tick">{name}</text>')
        lx += 120
    if truth:
        out.append(f'<line x1="{lx + 6}" x2="{lx + 6}" y1="6" y2="22" class="truth"/><text x="{lx + 14}" y="18" class="tick">as simulated</text>')
    for i, p in enumerate(rows):
        yy = top + row_h * i
        out.append(f'<text x="{left - 12}" y="{yy + 15}" class="rowl" text-anchor="end">{esc(LABEL[p])}</text>')
        xx = left
        for key, color, _ in keys:
            w = span * max(shares[p][key], 0)
            out.append(f'<rect x="{xx:.1f}" y="{yy + 3}" width="{w:.1f}" height="18" style="fill:var({color})"/>')
            if w > 34:
                out.append(f'<text x="{xx + w / 2:.1f}" y="{yy + 16}" class="inbar" text-anchor="middle">{pct(shares[p][key])}</text>')
            xx += w
        if truth and p in truth:
            for edge in (truth[p]["traits"], truth[p]["traits"] + truth[p]["own"]):
                tx = left + span * edge
                out.append(f'<line x1="{tx:.1f}" x2="{tx:.1f}" y1="{yy}" y2="{yy + 24}" class="truth"/>')
    out.append("</svg>")
    return "".join(out)


def gap_chart(gap: dict, holier: dict) -> str:
    """Per paradigm, on the 0..1 code: what people did, what they said they would, what their friends guessed."""
    W, left, right, top, row_h = 780, 190, 40, 40, 30
    H = top + row_h * len(PARADIGMS) + 36
    x = lambda v: left + (W - left - right) * v  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Say and do" class="chart">']
    legend = (("did", "--ink"), ("said they would", "--self"), ("friends guessed", "--friends"))
    lx = left
    for name, color in legend:
        out.append(f'<circle cx="{lx + 6}" cy="14" r="5.5" style="fill:var({color})"/><text x="{lx + 16}" y="18" class="tick">{name}</text>')
        lx += 150
    for t in (0, 0.25, 0.5, 0.75, 1):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top - 6}" y2="{H - 30}" class="grid"/>')
        out.append(f'<text x="{x(t):.1f}" y="{H - 12}" class="tick" text-anchor="middle">{num(t, 2)}</text>')
    for i, p in enumerate(PARADIGMS):
        yy = top + row_h * i + 12
        g, h = gap[p], holier[p]
        out.append(f'<text x="{left - 12}" y="{yy + 4}" class="rowl" text-anchor="end">{esc(LABEL[p])}</text>')
        did, said = g.get("did"), g.get("said")
        guess = None if h.get("friends_error") is None or did is None else did + h["friends_error"]
        pts = [v for v in (did, said, guess) if v is not None]
        if pts:
            out.append(f'<line x1="{x(min(pts)):.1f}" x2="{x(max(pts)):.1f}" y1="{yy}" y2="{yy}" class="span"/>')
        for v, color in ((guess, "--friends"), (said, "--self"), (did, "--ink")):
            if v is not None:
                out.append(f'<circle cx="{x(v):.1f}" cy="{yy}" r="5.5" style="fill:var({color})"/>')
    out.append("</svg>")
    return "".join(out)


def bars_chart(rows: list[tuple[str, float, str]], unit: str, hi: Optional[float] = None) -> str:
    """Plain horizontal bars: (label, value, color token)."""
    W, left, right, top, row_h = 780, 190, 110, 10, 28
    H = top + row_h * len(rows) + 10
    hi = hi or max([v for _, v, _ in rows] + [1e-9])
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(unit)}" class="chart">']
    for i, (label, v, color) in enumerate(rows):
        yy = top + row_h * i
        w = (W - left - right) * max(v, 0) / hi
        out.append(f'<text x="{left - 12}" y="{yy + 15}" class="rowl" text-anchor="end">{esc(label)}</text>')
        out.append(f'<rect x="{left}" y="{yy + 4}" width="{max(w, 1.5):.1f}" height="16" rx="2" style="fill:var({color})"/>')
        out.append(f'<text x="{left + w + 8:.1f}" y="{yy + 16}" class="val">{num(v, 2)} {esc(unit)}</text>')
    out.append("</svg>")
    return "".join(out)


def power_chart(power: dict, tests: list[tuple[str, str, str]]) -> str:
    """Power of the planned tests by group size, with the .8 convention marked."""
    sizes = sorted(int(n) for n in power["sizes"])
    W, left, right, top, bottom, H = 780, 56, 220, 16, 44, 340
    x = lambda n: left + (W - left - right) * (n - sizes[0]) / (sizes[-1] - sizes[0])  # noqa: E731
    y = lambda v: top + (H - top - bottom) * (1 - v)  # noqa: E731
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Power by group size" class="chart">']
    for v in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        out.append(f'<line x1="{left}" x2="{W - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" class="grid{" target" if v == 0.8 else ""}"/>')
        out.append(f'<text x="{left - 8}" y="{y(v) + 4:.1f}" class="tick" text-anchor="end">{num(v, 1)}</text>')
    for n in sizes:
        out.append(f'<text x="{x(n):.1f}" y="{H - bottom + 18}" class="tick" text-anchor="middle">{n}</text>')
    out.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - 6}" class="axisl" text-anchor="middle">friends in the pilot</text>')
    ends = []
    for key, label, color in tests:
        vals = [power["sizes"][str(n) if str(n) in power["sizes"] else n]["power"][key] for n in sizes]
        path = " ".join(f"{x(n):.1f},{y(v):.1f}" for n, v in zip(sizes, vals))
        out.append(f'<polyline points="{path}" class="curve" style="stroke:var({color})"/>')
        for n, v in zip(sizes, vals):
            out.append(f'<circle cx="{x(n):.1f}" cy="{y(v):.1f}" r="2.6" style="fill:var({color})"/>')
        ends.append((y(vals[-1]), label, color))
    ly = _spread([e[0] for e in ends], 14, top + 4, H - bottom)
    for (_y, label, color), lyy in zip(ends, ly):
        out.append(f'<text x="{W - right + 10}" y="{lyy + 4:.1f}" class="lvl" style="fill:var({color})">{esc(label)}</text>')
    out.append("</svg>")
    return "".join(out)


# ── the page ───────────────────────────────────────────────────────────────────────────────────────

CSS = """
/* The tide-table report: one reading column, figures at full measure, data set in mono. */
:root {
  --paper: #f3f5f4; --sheet: #fbfcfb; --ink: #1c2a2e; --muted: #5a6a6e; --rule: #d3dbd8; --rule-strong: #b9c4c1;
  --accent: #0d7f73; --accent-soft: #d5ece8;
  --self: #b5532e; --friends: #6a5bb3; --engine: #8b9497; --axes: #4a7fbf; --traits: #9a4f86; --twin: #a88324;
  --together: #2e4148; --retest: #c97f1d; --oracle: #7a868a; --warn: #9b3d2a; --warn-soft: #f5e2dc;
  --serif: "Source Serif 4", "Source Serif Pro", Georgia, serif;
  --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --rule-strong: #3d4e53;
  --accent: #3cc3b1; --accent-soft: #143a36;
  --self: #e48a63; --friends: #a597ec; --engine: #8d999c; --axes: #7fb0ea; --traits: #d088bd; --twin: #d7b24f;
  --together: #c9d8dc; --retest: #f0a94a; --oracle: #95a3a7; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --rule-strong: #3d4e53;
  --accent: #3cc3b1; --accent-soft: #143a36;
  --self: #e48a63; --friends: #a597ec; --engine: #8d999c; --axes: #7fb0ea; --traits: #d088bd; --twin: #d7b24f;
  --together: #c9d8dc; --retest: #f0a94a; --oracle: #95a3a7; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; }
body { background: var(--paper); color: var(--ink); font: 17px/1.6 var(--serif); }
.page { max-width: 860px; margin: 0 auto; padding-block: 28px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 34px; }
.page > * { min-width: 0; }
header { display: grid; gap: 14px; }
.kicker { font: 600 12px/1.3 var(--sans); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
h1 { font: 600 clamp(34px, 6vw, 54px)/1.05 var(--serif); letter-spacing: -.01em; margin: 0; text-wrap: balance; }
h2 { font: 600 26px/1.2 var(--serif); margin: 0; text-wrap: balance; }
h3 { font: 600 13px/1.3 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0; }
p { margin: 0; max-width: 66ch; }
.lede { font-size: 20px; line-height: 1.5; max-width: 62ch; }
.sim { display: flex; gap: 12px; align-items: baseline; background: var(--warn-soft); color: var(--warn); padding: 10px 14px; border-radius: 6px; font: 500 14px/1.45 var(--sans); }
.sim b { font-weight: 700; letter-spacing: .06em; }
section { display: grid; gap: 14px; }
.fig { background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; padding: 14px 14px 10px; display: grid; gap: 8px; }
.scroll { overflow-x: auto; }
.chart { width: 100%; min-width: 620px; height: auto; display: block; font-family: var(--sans); }
.cap { font: 400 14px/1.5 var(--sans); color: var(--muted); max-width: 80ch; }
.cap b { color: var(--ink); font-weight: 600; }
.src { font: 500 11.5px/1.4 var(--mono); color: var(--muted); }
.grid { stroke: var(--rule); stroke-width: 1; }
.grid.zero { stroke: var(--rule-strong); stroke-width: 1.4; }
.grid.target { stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 6 5; }
.tick { fill: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.axisl { fill: var(--muted); font-size: 12.5px; }
.rowl { fill: var(--ink); font-size: 14px; }
.rowl.hero, .val.hero { font-weight: 700; fill: var(--accent); }
.val { fill: var(--ink); font: 13px var(--mono); font-variant-numeric: tabular-nums; }
.whisk { stroke-width: 2.4; stroke-linecap: round; opacity: .55; }
.ref { stroke-width: 1.6; stroke-dasharray: 5 4; }
.refl { fill: var(--muted); font-size: 11.5px; paint-order: stroke; stroke: var(--sheet); stroke-width: 4px; stroke-linejoin: round; }
.level { stroke-width: 1.4; stroke-dasharray: 6 5; opacity: .9; }
.lvl { font-size: 12px; }
.curve { fill: none; stroke-width: 2; stroke-linejoin: round; }
.curve.hero { stroke-width: 3.4; }
.band { opacity: .14; }
.serl { font-size: 12.5px; font-weight: 600; }
.mark { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
.markdot { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.markl { fill: var(--ink); font: 600 12.5px var(--sans); paint-order: stroke; stroke: var(--sheet); stroke-width: 4px; stroke-linejoin: round; }
.truth { stroke: var(--ink); stroke-width: 2; }
.inbar { fill: var(--sheet); font: 600 11.5px var(--mono); }
.span { stroke: var(--rule-strong); stroke-width: 2; }
.keys { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.key { border-top: 3px solid var(--accent); padding-top: 10px; display: grid; gap: 4px; }
.key .n { font: 600 30px/1.1 var(--mono); color: var(--accent); font-variant-numeric: tabular-nums; }
.key .t { font: 400 14.5px/1.45 var(--sans); }
.key.quiet { border-color: var(--rule-strong); }
.key.quiet .n { color: var(--ink); }
table { border-collapse: collapse; font: 13.5px/1.4 var(--sans); width: 100%; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--rule); text-align: right; font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; }
th { font-weight: 600; color: var(--muted); font-size: 12px; letter-spacing: .04em; }
td.hero { color: var(--accent); font-weight: 700; }
td.mono, .mono { font-family: var(--mono); }
.witnesses { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px 22px; font: 14.5px/1.45 var(--sans); }
.w { display: grid; grid-template-columns: 14px 1fr; gap: 10px; align-items: start; }
.w i { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; }
.w b { font-weight: 600; }
.h { display: grid; gap: 6px; padding: 12px 14px; border-left: 3px solid var(--rule-strong); background: var(--sheet); }
.h .id { font: 600 12px var(--mono); color: var(--accent); }
.h p { font: 15px/1.5 var(--sans); }
.hyps { display: grid; gap: 10px; }
.explorer { display: grid; gap: 12px; }
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px 24px; font: 14px var(--sans); }
.controls label { display: grid; gap: 4px; }
.controls output { font: 600 14px var(--mono); color: var(--accent); }
input[type=range] { width: 100%; accent-color: var(--accent); }
input[type=range]:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
pre { background: var(--sheet); border: 1px solid var(--rule); border-radius: 6px; padding: 12px 14px; overflow-x: auto; font: 13px/1.55 var(--mono); margin: 0; }
code { font: 0.9em var(--mono); }
ul.plain { margin: 0; padding-left: 1.1em; display: grid; gap: 6px; max-width: 70ch; }
footer { font: 13px/1.5 var(--sans); color: var(--muted); border-top: 1px solid var(--rule); padding-top: 14px; }
.narrow { display: none; }
.narrowchart { min-width: 0; }
.narrowchart .rowl { paint-order: stroke; stroke: var(--sheet); stroke-width: 4px; stroke-linejoin: round; }
@media (max-width: 600px) { .wide { display: none; } .narrow { display: block; } }
@media (max-width: 520px) { body { font-size: 16px; } .lede { font-size: 18px; } }
"""

EXPLORER_JS = """
(function () {
  var svg = document.getElementById('theory-chart');
  var hIn = document.getElementById('h2'), vIn = document.getElementById('nu');
  var hOut = document.getElementById('h2o'), vOut = document.getElementById('nuo'), eOut = document.getElementById('eo');
  var W = 780, H = 330, L = 56, R = 210, T = 14, B = 44, N = 20;
  function x(n) { return L + (W - L - R) * n / N; }
  function yy(v) { return T + (H - T - B) * (1 - v); }
  function f(v) { return (v < 0 ? '\\u2212' : '') + Math.abs(v).toFixed(2); }
  function draw() {
    var h = parseFloat(hIn.value), nu = parseFloat(vIn.value);
    if (h + nu > 0.95) { nu = Math.max(0, 0.95 - h); vIn.value = nu.toFixed(2); }
    var rho = h + nu, eps = 1 - rho;
    hOut.textContent = h.toFixed(2); vOut.textContent = nu.toFixed(2); eOut.textContent = eps.toFixed(2);
    function two(n) { return n === 0 ? 0 : n * rho * rho / (n * rho + eps); }
    function one(n) { if (n === 0) return 0; var c = h / (h + (nu + eps) / n); return 2 * c * rho - c * c * (rho + eps / n); }
    var s = '';
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy(v) + '" y2="' + yy(v) + '" class="grid"/>';
      s += '<text x="' + (L - 8) + '" y="' + (yy(v) + 4) + '" class="tick" text-anchor="end">' + v.toFixed(1) + '</text>';
    });
    [0, 1, 2, 5, 10, 15, 20].forEach(function (n) {
      s += '<text x="' + x(n) + '" y="' + (H - B + 18) + '" class="tick" text-anchor="middle">' + n + '</text>';
    });
    s += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" class="axisl" text-anchor="middle">times it has watched you in this situation</text>';
    function level(v, color, label) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy(v) + '" y2="' + yy(v) + '" class="level" style="stroke:var(' + color + ')"/>';
      return { y: yy(v), label: label + ' ' + f(v), color: color };
    }
    var labels = [];
    labels.push(level(rho, '--oracle', 'knowing them exactly'));
    labels.push(level(h, '--axes', 'knowing their traits exactly'));
    var rt = 2 * rho - 1;
    function curve(fn, color, hero) {
      var pts = [];
      for (var n = 0; n <= N; n++) pts.push(x(n) + ',' + yy(Math.max(0, fn(n))));
      s += '<polyline points="' + pts.join(' ') + '" class="curve' + (hero ? ' hero' : '') + '" style="stroke:var(' + color + ')"/>';
    }
    curve(one, '--axes', false); curve(two, '--accent', true);
    s += '<circle cx="' + x(1) + '" cy="' + yy(Math.max(0, rt)) + '" r="6" style="fill:var(--retest)"/>';
    labels.push({ y: yy(two(N)), label: 'two-layer echo', color: '--accent' });
    labels.push({ y: yy(Math.max(0, one(N))), label: 'one-layer echo', color: '--axes' });
    labels.push({ y: yy(Math.max(0, rt)), label: 'copying last time ' + f(rt), color: '--retest' });
    labels.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < labels.length; i++) if (labels[i].y < labels[i - 1].y + 15) labels[i].y = labels[i - 1].y + 15;
    labels.forEach(function (l) { s += '<text x="' + (W - R + 10) + '" y="' + (l.y + 4) + '" class="lvl" style="fill:var(' + l.color + ')">' + l.label + '</text>'; });
    svg.innerHTML = s;
    document.getElementById('one1').textContent = f(one(1));
    document.getElementById('two1').textContent = f(two(1));
    var k = 0; while (k < 400 && one(k) < two(1)) k++;
    document.getElementById('catch').textContent = k >= 400 ? 'never, within 400 looks' : k + ' looks';
  }
  hIn.addEventListener('input', draw); vIn.addEventListener('input', draw); draw();
})();
"""


def _witness_rows(skills: dict, keys: Iterable[str], hero: str = "echo_2l") -> list[dict]:
    rows = []
    for k in keys:
        if k not in skills:
            continue
        label, color = WHO[k]
        s = skills[k]
        rows.append({"label": label, "color": color, "value": s.get("value"), "lo": s.get("lo"), "hi": s.get("hi"), "hero": k == hero})
    return rows


def panels(results: dict, study: Optional[dict] = None) -> dict:
    """
    The numbers each panel shows: across the simulated groups of a study (medians, and the middle half of
    groups as the interval), or from the one analysis given (its estimates and bootstrap intervals).
    """
    out: dict = {"across": study is not None}
    keys = list(results["settings"]["again"]["witnesses"])

    def iv(summary: Optional[dict]) -> dict:
        if not summary:
            return {"value": None, "lo": None, "hi": None}
        iqr = summary.get("iqr") or [None, None]
        return {"value": summary.get("median"), "lo": iqr[0], "hi": iqr[1]}

    for setting in ("again", "elsewhere"):
        w = results["settings"][setting]["witnesses"]
        if study:
            out[setting] = {k: iv(study["skill"].get(f"{setting}:{k}")) for k in keys}
            out[f"{setting}_acc"] = {k: study["accuracy"].get(f"{setting}:{k}", {}).get("median") for k in (*keys, "bar")}
        else:
            out[setting] = {k: {"value": w[k]["skill"], "lo": w[k]["lo"], "hi": w[k]["hi"]} for k in keys}
            out[f"{setting}_acc"] = {**{k: w[k]["accuracy"] for k in keys}, "bar": w["self"]["accuracy_base"]}
    if study:
        c = study["curve"]
        out["minutes"] = c["minutes"]
        out["curve"] = {w: {"values": c[w]["median"], "band": c[w]["iqr"]} for w in ("echo", "echo_axes", "echo_2l")}
        out["lines"] = {k: v["median"] for k, v in study["lines"].items()}
        out["crossings"] = {k: {"value": v["median"], "share": v["share"], "iqr": v.get("iqr")} for k, v in study["crossings"].items()}
        out["by_paradigm"] = {p: {k: study["by_paradigm"].get(f"{p}:{k}", {}).get("median") for k in keys} for p in PARADIGMS}
        out["retest_agree"] = {p: study["retest"][p]["median"] for p in PARADIGMS}
        sh = {}
        for p in PARADIGMS:
            parts = {k: study["shares"][f"{p}:{k}"]["median"] or 0.0 for k in ("traits", "own", "visit")}
            total = sum(parts.values()) or 1.0
            sh[p] = {k: v / total for k, v in parts.items()}
        out["shares"], out["true_shares"] = sh, study.get("true_shares")
        out["gap"] = {p: {k: study["gap"][f"{p}:{k}"]["median"] for k in ("said", "did", "gap")} for p in PARADIGMS}
        out["holier"] = {p: {k: study["holier"][f"{p}:{k}"]["median"] for k in ("self_error", "friends_error")} for p in PARADIGMS}
        out["gap_p"] = None
    else:
        c = results["curve"]
        out["minutes"] = c["minutes"]
        # Minutes are ints in memory and strings once through JSON; either is read.
        cw = {w: {int(t): v for t, v in by_t.items()} for w, by_t in c["witnesses"].items()}
        out["curve"] = {w: {"values": [cw[w][t]["skill"] for t in c["minutes"]], "band": [((cw[w][t]["lo"], cw[w][t]["hi"]) if cw[w][t]["lo"] is not None else None) for t in c["minutes"]]} for w in ("echo", "echo_axes", "echo_2l")}
        out["lines"] = c["lines"]
        out["crossings"] = {k: {"value": v, "share": None, "iqr": None} for k, v in c["crossings"]["echo_2l"].items()}
        bp = results["settings"]["again"]["by_paradigm"]
        out["by_paradigm"] = {p: {k: bp[p][k]["skill"] for k in keys} for p in PARADIGMS}
        out["retest_agree"] = {p: results["retest"][p]["agree"] for p in PARADIGMS}
        out["shares"], out["true_shares"] = results.get("shares"), results.get("true_shares")
        out["gap"] = {p: {k: results["gap"][p][k] for k in ("said", "did", "gap")} for p in PARADIGMS}
        out["holier"] = {p: {k: results["holier"][p][k] for k in ("self_error", "friends_error")} for p in PARADIGMS}
        out["gap_p"] = results["gap"]["give"]["p"]
    return out


def render(results: dict, power: Optional[dict] = None, study: Optional[dict] = None, sensitivity: Optional[dict] = None, power3: Optional[dict] = None, title: str = "Who Knows You Best", generated: Optional[str] = None) -> str:
    """The page: from one analysis, or (simulated) from a study across many groups, the power run and the sensitivity run."""
    simulated = results.get("simulated", False)
    generated = generated or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    cov = results["coverage"]
    D = panels(results, study)
    n_label = f"{study['reps']} simulated groups of {study['n']}" if study else (f"one simulated group of {cov['people']}" if simulated else f"the {cov['people']} people of the pilot")
    basis = f"Medians across {n_label}; whiskers span the middle half of groups." if study else "Bootstrap 95% intervals over people."
    again, elsewhere = D["again"], D["elsewhere"]
    has_oracle = again.get("oracle_axes", {}).get("value") is not None
    refs_keys = ["retest"] + (["oracle_axes", "oracle_person"] if has_oracle else [])
    refs = [{"label": WHO[k][0], "value": again[k]["value"], "color": WHO[k][1]} for k in refs_keys]
    refs_else = [{"label": WHO[k][0], "value": elsewhere[k]["value"], "color": WHO[k][1]} for k in refs_keys]

    series = [
        {"label": WHO["echo_2l"][0], "color": "--accent", "values": D["curve"]["echo_2l"]["values"], "band": D["curve"]["echo_2l"]["band"], "hero": True},
        {"label": "One-layer echo", "color": "--axes", "values": D["curve"]["echo_axes"]["values"]},
        {"label": "Engine's echo", "color": "--engine", "values": D["curve"]["echo"]["values"]},
    ]
    lv = D["lines"]
    line_keys = [("friends", "Friends", "--friends"), ("self", "Own words", "--self"), ("retest", "Own other visit", "--retest")]
    if lv.get("oracle_axes") is not None:
        line_keys.append(("oracle_axes", "Traits known exactly", "--oracle"))
    lines = [{"label": lab, "value": lv[k], "color": col} for k, lab, col in line_keys if lv.get(k) is not None]
    fx = D["crossings"].get("friends", {}).get("value")
    f_share = D["crossings"].get("friends", {}).get("share")
    marks = [{"t": fx, "value": lv.get("friends") or 0, "label": f"≈ {fx:.0f} min: as good as the friends"}] if fx is not None else []

    two_again, one_again = again["echo_2l"]["value"], again["echo_axes"]["value"]
    oracle_axes = again["oracle_axes"]["value"] if has_oracle else None
    acc = D["again_acc"]

    keys_html = ""
    if simulated:
        keys_html = f"""
  <div class="keys">
    <div class="key"><span class="n">{num(two_again, 2, True)}</span><span class="t">skill of the two-layer echo after one 25-minute visit, against <span class="mono">{num(one_again, 2, True)}</span> for the same echo with one layer.</span></div>
    <div class="key"><span class="n">{"≈ " + format(fx, ".0f") + " min" if fx is not None else "–"}</span><span class="t">of play before the two-layer echo predicts a choice as well as the person's friends do{f" (it gets there within the visit in {pct(f_share)} of groups)" if f_share is not None else ""}.</span></div>
    <div class="key quiet"><span class="n">{num(oracle_axes, 2, True)}</span><span class="t">for exact knowledge of the person's eight traits and nothing else: less than one visit gives the two-layer echo.</span></div>
  </div>"""

    sim_banner = f"""<div class="sim"><b>SIMULATED</b><span>Every number on this page comes from {esc(n_label)}, built to the ranges the literature reports. No person's choices are in it. It is the analysis rehearsed end to end, so that the pilot's report will be this page with real numbers.</span></div>""" if simulated else ""

    witness_list = "".join(f'<div class="w"><i style="background:var({WHO[k][1]})"></i><span><b>{esc(WHO[k][0])}.</b> {esc(desc)}</span></div>' for k, desc in (
        ("self", "What the person said they would do, before they met any of the six."),
        ("friends", "What their friends guessed, pooled by the median guess."),
        ("echo_2l", "The world, watching: their traits and their own steady ways, learned from what they did."),
        ("echo_axes", "The same echo with one layer, traits only, as trait-based persona models are built."),
        ("echo", "ECHO's engine as it stands: eight axes and its own measurement model."),
        ("traits", "A questionnaire twin: the traits they and their friends rated, through the fitted model."),
        ("twin", "A model of the group: people who chose like this went on to choose…"),
        ("together", "The median of their own words, their friends' guess and the two-layer echo."),
    ))
    paradigm_rows = "".join(f"<tr><td>{esc(LABEL[p])}</td><td style='text-align:left'>{esc(WORLD[p])}</td><td class='mono'>{esc(CODING[p])}</td></tr>" for p in PARADIGMS)

    cols = ["echo_2l", "self", "friends", "echo_axes", "echo", "retest"] + (["oracle_person"] if has_oracle else [])
    head = "".join(f"<th>{esc(WHO[k][0])}</th>" for k in cols)
    body = "".join(
        "<tr><td>" + esc(LABEL[p]) + "</td>" + "".join(f"<td class='{'hero ' if k == 'echo_2l' else ''}mono'>{num(D['by_paradigm'][p][k], 2, True)}</td>" for k in cols) + f"<td class='mono'>{pct(D['retest_agree'][p])}</td></tr>"
        for p in PARADIGMS
    )
    acc_line = ", ".join(f"{WHO[k][0].lower()} {pct(acc.get(k))}" for k in ("echo_2l", "self", "friends") if acc.get(k) is not None)

    ears = results["ears"]
    ear_rows = [(LABEL[p], ears[p]["total_bits"], "--engine") for p in PARADIGMS]
    noise = results.get("act_noise_scale")

    power_html = ""
    if power and len(power["sizes"]) >= 2:
        tests = [
            ("again:echo_2l>echo_axes", "two layers > one", "--accent"),
            ("again:echo_2l>bar", "echo > bar", "--axes"),
            ("again:self>bar", "own words > bar", "--self"),
            ("again:friends>bar", "friends > bar", "--friends"),
            ("again:echo_2l>friends", "echo > friends", "--together"),
            ("gap_give", "say–do gap, giving", "--retest"),
        ]
        sizes = sorted(int(k) for k in power["sizes"])
        row = lambda n: power["sizes"].get(str(n)) or power["sizes"].get(n)  # noqa: E731
        third_html = ""
        if power3:
            row3 = lambda n: power3["sizes"].get(str(n)) or power3["sizes"].get(n)  # noqa: E731
            sizes3 = [n for n in sorted(int(k) for k in power3["sizes"]) if row(n)]
            tests3 = (("again:echo_2l>echo_axes", "two layers > one"), ("again:echo_2l>bar", "echo > bar"), ("again:self>bar", "own words > bar"), ("again:friends>bar", "friends > bar"))
            head3 = "".join(f"<th>{n} friends</th>" for n in sizes3)
            body3 = "".join(
                f"<tr><td>{esc(label)}</td>" + "".join(f"<td class='mono'>{pct(row(n)['power'][key])} → <b>{pct(row3(n)['power'][key])}</b></td>" for n in sizes3) + "</tr>"
                for key, label in tests3
            )
            third_html = f"""<h3>What a third visit buys</h3>
    <p>The same groups asked to come three times: the second visit predicted from the first, the third from the first two. Two visits → three, by group size.</p>
    <div class="scroll"><table><thead><tr><th>Test</th>{head3}</tr></thead><tbody>{body3}</tbody></table></div>
    <p class="cap"><span class="src">runs/power-3visits.json · {power3['reps']} groups per size</span></p>"""
        need = next((n for n in sizes if row(n)["power"]["again:echo_2l>echo_axes"] >= 0.8), None)
        ref_n = study["n"] if study else 16
        at = row(ref_n)["power"] if row(ref_n) else {}
        power_html = f"""
  <section id="power">
    <h3>How many friends</h3>
    <h2>{f"About {need} people for the central test" if need else "More than " + str(sizes[-1]) + " people for the central test"}</h2>
    <p>Each line is the share of simulated groups ({power['reps']} at each size) in which a planned test comes out at p &lt; .05, one-sided sign-flip over people. At {ref_n} friends the central test, two layers against one, has power {pct(at.get('again:echo_2l>echo_axes'))}, and the echo against the bar {pct(at.get('again:echo_2l>bar'))}. So a circle of friends is a pilot in the proper sense: it estimates the effects and gives the central test a fair chance, and the confirmatory study needs about {need or "40"} people. Telling the echo from the friends needs far more than that; it is an estimate to report, not a test to pass.</p>
    <div class="fig"><div class="scroll">{power_chart(power, tests)}</div>
      <p class="cap">The dashed line marks .8, the usual target. <span class="src">runs/power.json · {power['reps']} groups per size · {round(power.get('seconds', 0) / 60) if power.get('seconds') else '–'} min on 10 cores</span></p></div>
    {third_html}
  </section>"""

    g, h = D["gap"]["give"], D["holier"]["give"]
    gap_p = D["gap_p"]

    # Headlines say what the numbers say, whichever way they fall (the same page serves the pilot's data).
    def v(x) -> float:
        return x if x is not None else float("nan")

    if v(two_again) > v(one_again) + 0.05 and v(two_again) > 0.05:
        head_again = "After one visit, two layers know the next choice; one layer does not"
    elif v(two_again) > v(one_again):
        head_again = "Two layers know the next choice a little better than one"
    else:
        head_again = "Here, two layers did not know the next choice better than one"
    head_curve = f"The world needs about {fx:.0f} minutes to match the friends" if fx is not None else "Within the visit, the world did not reach the friends"
    best_echo = max(v(elsewhere[k]["value"]) for k in ("echo", "echo_axes", "echo_2l"))
    best_people = max(v(elsewhere[k]["value"]) for k in ("self", "friends"))
    head_else = "Where it has not watched, nobody beats the person's own words and their friends" if best_echo < best_people else "Even where it has not watched, an echo holds its own"
    head_gap = "People promise more bread than they give" if v(g["gap"]) > 0 else "People gave the bread they promised"
    own_wins = sum(1 for sh in (D["shares"] or {}).values() if sh["own"] > sh["traits"])
    head_shares = "Most of what makes a choice repeatable belongs to the person, not to their traits" if own_wins >= 4 else "Here, the traits carry as much of a choice as the person's own ways"

    sens_html = ""
    if sensitivity and simulated:
        cols_s = (("echo_2l", "Two-layer"), ("echo_axes", "One-layer"), ("friends", "Friends"), ("self", "Own words"), ("oracle_axes", "Traits exactly"))
        head_s = "".join(f"<th>{esc(lab)}</th>" for _, lab in cols_s) + "<th>H1 power</th><th>Minutes to friends</th>"
        rows_s = ""
        for name, row in sensitivity["settings"].items():
            cells = "".join(f"<td class='{'hero ' if k == 'echo_2l' else ''}mono'>{num(row['skill'].get(f'again:{k}'), 2, True)}</td>" for k, _ in cols_s)
            cross_s = row["crossing_friends"]
            minutes_s = "–" if cross_s.get("median") is None else f"{cross_s['median']:.0f} ({pct(cross_s.get('share'))})"
            rows_s += f"<tr><td>{esc(name)}</td>{cells}<td class='mono'>{pct(row['power'].get('again:echo_2l>echo_axes'))}</td><td class='mono'>{minutes_s}</td></tr>"
        wins = sum(1 for row in sensitivity["settings"].values() if (row["skill"].get("again:echo_2l") or 0) > (row["skill"].get("again:echo_axes") or 0))
        total_s = len(sensitivity["settings"])
        head_sens = (f"Two layers beat one under all {total_s} assumptions tried" if wins == total_s else f"Two layers beat one under {wins} of {total_s} assumptions tried") + "; whether the echo beats the friends depends on how steady people are and how well friends know them"
        sens_html = f"""
  <section id="assumptions">
    <h3>How much rests on the assumptions</h3>
    <h2>{esc(head_sens)}</h2>
    <p>Each row moves one of the simulation's assumptions and runs the whole analysis again on {sensitivity['reps']} groups of {sensitivity['n']}. Skill is for the second visit predicted from the first, medians across groups. The last column gives the minute the echo reaches the friends, and in what share of groups it does within the visit.</p>
    <div class="scroll"><table><thead><tr><th>Assumption</th>{head_s}</tr></thead><tbody>{rows_s}</tbody></table></div>
    <p class="cap">"Traits exactly" is the simulated person's eight traits known without error, and nothing else about them.</p>
  </section>"""

    shares_html = ""
    if D["shares"]:
        true_sh = D["true_shares"]
        shares_html = f"""
  <section id="made-of">
    <h3>What a choice is made of</h3>
    <h2>{esc(head_shares)}</h2>
    <p>The two-layer model splits each choice's variance three ways: what the eight traits explain, what is the person's own and steady, and what changes from one day to the next. The person's own part is what a one-layer echo has nowhere to keep.</p>
    <div class="fig"><div class="scroll">{shares_chart(D['shares'], true_sh)}</div>
      <p class="cap">{"Fitted on each simulated group; bars are the medians across " + esc(n_label) + ", rescaled to add up. Black ticks: the split the simulation was built with. With a circle of friends the traits' share is hard to see, and it is read low; the steady part is not." if study else ("Fitted on the group, by variance components (the latent state–trait split)." + (" Black ticks: as simulated." if true_sh else ""))}</p></div>
  </section>"""

    gap_sentence = (
        f"On giving, people said <span class='mono'>{num(g['said'])}</span> of their bread and gave <span class='mono'>{num(g['did'])}</span>"
        + (f" (gap <span class='mono'>{num(g['gap'], 2, True)}</span>, p = <span class='mono'>{num(gap_p, 3)}</span>)" if gap_p is not None else f" (a median gap of <span class='mono'>{num(g['gap'], 2, True)}</span>)")
        + f". Their friends' guesses ran <span class='mono'>{num(h['friends_error'], 2, True)}</span> from what they did, their own words <span class='mono'>{num(h['self_error'], 2, True)}</span>: the asymmetry Epley and Dunning called \"holier than thou\", with bread."
    )

    return f"""<title>{esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>{CSS}</style>
<main class="page">
  <header>
    <span class="kicker">ECHO pilot village · six choices, two visits · {"simulation study" if simulated else "pilot results"}</span>
    <h1>Who knows you best?</h1>
    <p class="lede">Six classic experiments from economics and psychology, set in a game world as things that simply happen on a walk. Friends play it twice, a day apart. Before they play, each says what they would do, and their friends guess. The world keeps its own guess. The second visit shows who was right.</p>
    {sim_banner}
  </header>
  {keys_html}
  <section id="design">
    <h3>The six</h3>
    <div class="scroll"><table><thead><tr><th>Paradigm</th><th style="text-align:left">In the village</th><th>Coded</th></tr></thead><tbody>{paradigm_rows}</tbody></table></div>
    <p class="cap">Every choice is coded 0..1 in the direction of its name. The stakes are the world's own: bread, a raft, fish, a harvest, an afternoon, an evening by a fire. Nobody is paid.</p>
  </section>
  <section id="witnesses">
    <h3>The witnesses</h3>
    <div class="witnesses">{witness_list}</div>
    <p class="cap">Each gives one answer per choice, the median of what it expects. <b>Skill</b> is the share of the bar's error it removes, 1 − MAE/MAE<sub>bar</sub>, where the bar is the group's usual choice (everyone else's median). 0 is no better than the bar and 1 is never wrong. A witness with nothing to say about a choice is scored as the bar.</p>
  </section>
  <section id="again">
    <h3>Result 1 · when the same situation comes round again</h3>
    <h2>{esc(head_again)}</h2>
    <p>The second visit's choices, predicted from the first. The two-layer echo keeps each person's own way with bread, rafts and bets beside their traits, so it expects them to do roughly what they did. The one-layer echo can only read a choice as character, which explains little of it, so it barely moves from the bar. Simply copying the first visit (the amber line) does about as well as the two-layer echo: copying is what the second layer makes possible for a model of a person, and what one layer cannot do at all.</p>
    <div class="fig"><div class="scroll wide">{dot_chart(_witness_rows(again, ORDER), refs, note="Skill when the situation comes again")}</div><div class="narrow">{dot_chart_narrow(_witness_rows(again, ORDER), refs, note="Skill when the situation comes again")}</div>
      <p class="cap">{basis} Exact agreement with the choice made: {esc(acc_line)}, against {pct(acc.get('bar'))} for the bar{" (medians)" if study else ""}. Dashed lines: the person's own first-visit choice, copied{"; exact knowledge of their traits; exact knowledge of them" if has_oracle else ""}.</p></div>
  </section>
  <section id="curve">
    <h3>Result 2 · the minutes it takes</h3>
    <h2>{esc(head_curve)}</h2>
    <p>The same prediction, made from only the first t minutes of the first visit. The six are met one at a time, so the curve climbs as each is met. The friends' guess and the person's own words are flat: they do not wait.</p>
    <div class="fig"><div class="scroll wide">{curve_chart(D['minutes'], series, lines, marks)}</div><div class="narrow">{curve_chart_narrow(D['minutes'], series, lines, marks)}</div>
      <p class="cap">{basis.replace("whiskers span", "the band spans")}</p></div>
  </section>
  <section id="elsewhere">
    <h3>Result 3 · a situation it has never seen you in</h3>
    <h2>{esc(head_else)}</h2>
    <p>Every choice predicted with that paradigm never seen, on either visit. Whatever the echoes learn of someone's traits from five other choices and their walking carries little to a sixth. People and their friends know the person's own ways directly.</p>
    <div class="fig"><div class="scroll wide">{dot_chart(_witness_rows(elsewhere, ORDER), refs_else, note="Skill in an unseen situation")}</div><div class="narrow">{dot_chart_narrow(_witness_rows(elsewhere, ORDER), refs_else, note="Skill in an unseen situation")}</div>
      <p class="cap">{basis}</p></div>
  </section>
  {shares_html}
  <section id="say-do">
    <h3>Result 4 · saying and doing</h3>
    <h2>{esc(head_gap)}</h2>
    <p>{gap_sentence}</p>
    <div class="fig"><div class="scroll">{gap_chart(D['gap'], D['holier'])}</div>
      <p class="cap">{("Medians across " + esc(n_label) + ". ") if study else ""}Positions on the 0..1 code; each row joins what was done, said and guessed.</p></div>
  </section>
  <section id="theory">
    <h3>Why two layers</h3>
    <h2>One layer can learn your ways only by bending your character to fit them</h2>
    <p>Take one kind of choice and split its variance into the traits' share h², the person's own steady share ν, and the day's ε = 1 − h² − ν. The lines show the best an echo can do at predicting the next time after watching someone n times in this situation (Gaussian theory, mean squared error). With one layer, everything steady that the traits do not explain looks like noise, so it under-reacts: after one look it gets <output id="one1" class="mono">–</output>, against <output id="two1" class="mono">–</output> with two layers, and it needs <output id="catch" class="mono">–</output> to catch up. It catches up only by moving the person's traits to fit this one choice, which moves every other prediction with them.</p>
    <div class="fig explorer">
      <div class="controls">
        <label for="h2">Traits' share h² <output id="h2o">0.18</output><input id="h2" type="range" min="0.02" max="0.6" step="0.01" value="0.18"></label>
        <label for="nu">Person's own share ν <output id="nuo">0.45</output><input id="nu" type="range" min="0" max="0.8" step="0.01" value="0.45"></label>
        <span>The day's share ε <output id="eo">0.37</output></span>
      </div>
      <div class="scroll"><svg id="theory-chart" viewBox="0 0 780 330" class="chart" role="img" aria-label="Theory: skill against looks"></svg></div>
      <p class="cap">Starts at the split the simulation assumes for giving. Trait–behaviour correlations of about .3 put h² near .1; test–retest correlations of .5 to .7 for single economic choices put h² + ν near .6. Copying the last choice (the amber dot) scores 2(h² + ν) − 1.</p>
    </div>
  </section>
  <section id="engine">
    <h3>What the engine hears</h3>
    <h2>The engine as built is nearly deaf to these choices</h2>
    <p>For each paradigm, how far one act narrows the engine's eight axes, in bits, with the act's noise as the engine weighs it. Lending is not read at all: no route reads trust yet (C75). And every act is weighed as a message of no words: the engine's short-message heuristic multiplies an act's noise by <span class="mono">{num(noise, 0) if noise else "–"}</span>.</p>
    <div class="fig"><div class="scroll">{bars_chart(ear_rows, "bits")}</div>
      <p class="cap">From the engine's committed measurement model, unchanged: this study does not touch services/ml.</p></div>
  </section>
  <section id="table">
    <h3>By paradigm</h3>
    <div class="scroll"><table><thead><tr><th>Again · skill</th>{head}<th>Same choice twice</th></tr></thead><tbody>{body}</tbody></table></div>
    <p class="cap">{("Medians across " + esc(n_label) + "; a single group's numbers per paradigm swing widely, over a dozen or so choices each.") if study else (str(cov['two_visits']) + " of " + str(cov['people']) + " came back for the second visit; " + str(cov['guesses']) + " guesses from " + str(cov['ratings_known']) + " ratings by people who knew each other.")}</p>
  </section>
  {power_html}
  {sens_html}
  <section id="plan">
    <h3>What would count as a finding</h3>
    <div class="hyps">
      <div class="h"><span class="id">H1 · two layers</span><p>When a situation comes again, the two-layer echo removes more error than the one-layer echo. One-sided sign-flip over people. The central test.</p></div>
      <div class="h"><span class="id">H2 · the world knows you</span><p>The two-layer echo beats the bar, and its curve reaches the friends' line within the first visit, reported with a bootstrap interval on the crossing time.</p></div>
      <div class="h"><span class="id">H3 · who knows best</span><p>Echo, friends, own words and the three pooled, compared on the same choices. At pilot size these are estimates with intervals, not tests.</p></div>
      <div class="h"><span class="id">H4 · say and do</span><p>People say they would give more than they do, and their own forecast runs further from what they did than their friends' does (two-sided).</p></div>
      <div class="h"><span class="id">H5 · what a choice is made of</span><p>For most of the six, the person's own steady share exceeds the traits' share. Variance components with a bootstrap over people; descriptive.</p></div>
    </div>
  </section>
  <section id="methods">
    <h3>Method, briefly</h3>
    <ul class="plain">
      <li>Two 25-minute visits at least 20 hours apart. The village sets out the six one at a time, in an order of the person's own, 30 seconds after the last is answered. One left standing four minutes is unmet: missing, never a zero.</li>
      <li>Nobody sees what they are asked to predict. The tests change a person's second visit and check, to the last float, that nothing predicted from the first changes; the same for an unseen paradigm, for the curve's later minutes, and for the group's bar and models, which never include the person predicted. Ten deliberate leaks were planted; the tests caught all ten.</li>
      <li>The engine is used as it is. The research path replays each person's rows through the engine's own endpoints; the faster library path used for simulation is held to it bit for bit.</li>
      <li>The two-layer echo is fitted on everyone but the person predicted, by variance components: the day's noise from how far a person's two visits differ, the steady part from how far people differ beyond that, the traits' share from what self- and friends' ratings predict of it out of sample. Each choice's stability, estimated from a dozen pairs of visits, is shrunk toward the six choices' mean by a prior worth ten pairs (partial pooling, chosen on simulation before any data, under equal and unequal stability alike).</li>
      <li>Inference is over people: bootstrap intervals resample people, and paired tests flip the sign of each person's mean difference, exactly up to 16 people.</li>
      <li>Two variants were tried and set aside, both reported rather than dropped. Scored by the ranked probability score, the models' own probabilities, the central test had less power at 16 people (.35 against .57 over 60 groups): with so few people the two-layer echo's probabilities are not yet calibrated, though the choice it names is. Predicting each visit from the other, not only the second from the first, added little (.57 to .60), since both directions rest on the same pairs of choices.</li>
    </ul>
  </section>
  <section id="run">
    <h3>Running it</h3>
<pre>services/ml/.venv/bin/python research/pilot/analyze.py export.json   # the pilot
services/ml/.venv/bin/python research/pilot/analyze.py --simulate     # this page
services/ml/.venv/bin/python research/pilot/power.py 200              # the power curves
services/ml/.venv/bin/python -m pytest research/pilot/tests -q        # the guarantees</pre>
    <p class="cap">The export is <code>GET /api/pilot?op=export</code> with the owner's <code>x-pilot-admin</code> token.</p>
  </section>
  <footer>Generated {esc(generated)} · {esc(n_label)} · engine path: {esc(results.get("mode", ""))}{" · simulated" if simulated else ""}</footer>
</main>
<script>{EXPLORER_JS}</script>
"""


def write(results: dict, path, power: Optional[dict] = None, study: Optional[dict] = None, sensitivity: Optional[dict] = None) -> None:
    from pathlib import Path

    Path(path).write_text(render(results, power, study, sensitivity), encoding="utf-8")


def to_json(results: dict) -> str:
    def default(o):
        if hasattr(o, "tolist"):
            return o.tolist()
        raise TypeError(type(o))

    return json.dumps(results, default=default, indent=1)
