"""The pilot's analysis (web DECISIONS C75–C77): who knows you best, and what a choice is made of.

THE QUESTION. What someone does in the village, choice by choice, against what each WITNESS expected:

    self       their own words, given before they met any of it                       (stated)
    friends    what their friends said they would do, pooled by the median guess      (predicted, C76)
    echo       the engine as it is: eight axes and its own measurement model          (engine.py)
    echo_axes  one layer, fitted: the axes alone, the group's measurement model       (layers.py, τ = 0)
    echo_2l    two layers, fitted: the axes and the person's own ways                 (layers.py)
    traits     a questionnaire twin: the person's rated axes (their own and their friends' ratings)
               through the same fitted model, their own ways unknown                  (layers.from_traits)
    twin       a model of the group: people who chose like this went on to choose …   (ridge, LOO penalty)
    together   the median of self, friends and the two-layer echo                     (the three pooled)

asked in two SETTINGS:

    again      the second visit's choices from the first (`directions`; each from the other is possible):
               what a witness that has met you once expects when the same situation comes round again
    elsewhere  every choice, from everything ELSE (that paradigm never seen, on either visit): what a
               witness expects of you in a situation it has never seen you in

and held against REFERENCES: the BAR, the group's median choice (leave-one-person-out), the best guess
that knows nothing of the person; the person's own other visit (RETEST); and, in simulation only, two
ORACLES that know the simulated truth: one knows the person's traits exactly (the ceiling of any
axis-only witness), one knows their traits and their own tendencies (the ceiling of anyone).

SKILL is the share of the bar's error a witness removes, 1 − MAE/MAE_bar, over every choice in the
setting. A witness with nothing to say about a choice is scored as the bar there (no skill, no penalty),
so all are scored on the same choices. Each gives one level per choice, the median of what it expects
(the guess that minimises absolute error). ACCURACY, exact agreement, is reported beside it.

THE CURVE. In `again`, the echoes' skill after the first t minutes of the visit watched: how long the
world must watch someone before it knows their choices as well as their friends do.

Then: the say–do gap; self against friends on the same choices (Epley & Dunning's "holier than thou");
each choice's retest; self, friends and echoes on the eight axes; how each choice's variance splits
between traits, the person's own and the day (the fitted two-layer model); what the engine hears.

Inference is over people: bootstrap intervals that resample people, and sign-flip tests on each person's
mean difference, exact up to 16 people.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np

from . import engine as E
from . import layers as L
from . import stats as S
from .paradigms import LABEL, LEVELS, PARADIGM_OF, PARADIGMS, code_action, code_stated

AXES = E.AXES
WITNESSES = ("self", "friends", "echo", "echo_axes", "echo_2l", "traits", "twin", "together")
#: The witnesses `together` pools.
POOLED = ("self", "friends", "echo_2l")
REFERENCES = ("retest", "oracle_axes", "oracle_person")
SETTINGS = ("again", "elsewhere")
CURVE_MINUTES = (0, 2, 4, 6, 8, 10, 12, 15, 20, 25)
CURVE_WITNESSES = ("echo", "echo_axes", "echo_2l")
#: The model comparisons in `again` scored by the RPS, the models' own probabilities (H1 is the first).
DUELS_RPS = (("echo_axes", "echo_2l"), ("bar", "echo_2l"), ("echo", "echo_2l"))
#: The planned comparisons in `again`, each "the second removes more error than the first" (one-sided).
DUELS = (
    ("bar", "self"),
    ("bar", "friends"),
    ("bar", "echo_2l"),
    ("friends", "echo_2l"),
    ("self", "echo_2l"),
    ("echo_axes", "echo_2l"),
    ("echo", "echo_2l"),
    ("traits", "echo_2l"),
    ("self", "together"),
    ("friends", "together"),
    ("self", "retest"),
    ("friends", "retest"),
)


def _t(x: str) -> datetime:
    return datetime.fromisoformat(x.replace("Z", "+00:00"))


def visit_of(created_at: str, sessions: list[dict]) -> Optional[int]:
    """Which visit a staging belongs to: the one it was set out in."""
    t = _t(created_at)
    for s in sessions:
        start = _t(s["startedAt"])
        end = _t(s["endedAt"]) if s.get("endedAt") else start + timedelta(minutes=35)
        if start - timedelta(minutes=1) <= t <= end + timedelta(minutes=10):
            return int(s["n"])
    return None


def acts_of(export: dict) -> dict[str, dict[str, dict[int, float]]]:
    """What each person did, by paradigm and visit, coded 0..1. Unmet and unanswered stagings are left out."""
    out: dict[str, dict[str, dict[int, float]]] = {}
    for person in export["people"]:
        s = person["subject"]
        out[s] = {p: {} for p in PARADIGMS}
        for st in export["byPerson"].get(s, {}).get("stagings", []):
            p = PARADIGM_OF.get(st["situation"])
            if not p:
                continue
            v = visit_of(st["createdAt"], person["sessions"])
            value = code_action(p, st.get("resolved"))
            if v is not None and value is not None and v not in out[s][p]:
                out[s][p][v] = value
    return out


def finished_at(person: dict, visits: int, session_ms: float) -> Optional[datetime]:
    """When someone's last visit was over, so that the debrief was open to them (the route's `canStart` "done"); None before."""
    sessions = person.get("sessions") or []
    if len(sessions) < visits:
        return None
    last = sessions[-1]
    if last.get("endedAt"):
        return _t(last["endedAt"])
    return _t(last["startedAt"]) + timedelta(milliseconds=session_ms) + timedelta(minutes=10)


def after_debrief(export: dict) -> set[tuple[str, str]]:
    """
    The ratings made after the rater had finished all their visits, while the debrief was switched on: the
    registration (§2, Blinding) reports the results with and without them. An export from before the route
    said whether the debrief was on counts it as on, and takes the visit count from the most anyone made.
    """
    if export.get("reveal") is False:
        return set()
    visits = int(export.get("visits") or max([len(p.get("sessions") or []) for p in export["people"]] + [2]))
    session_ms = float((export.get("pilot") or {}).get("sessionMs", 25 * 60 * 1000))
    done = {p["subject"]: finished_at(p, visits, session_ms) for p in export["people"]}
    return {(r["rater"], r["ratee"]) for r in export["ratings"]
            if done.get(r["rater"]) is not None and r.get("at") and _t(r["at"]) >= done[r["rater"]]}


def before_debrief(export: dict) -> dict:
    """The export without the ratings made after the rater's debrief was open."""
    late = after_debrief(export)
    return {**export, "ratings": [r for r in export["ratings"] if (r["rater"], r["ratee"]) not in late]}


def coverage(export: dict) -> dict:
    """How much of the study there is: people, visits, the six met and unmet, ratings and guesses, and where the events came from."""
    met = {p: 0 for p in PARADIGMS}
    unmet = {p: 0 for p in PARADIGMS}
    sources: dict[str, int] = {}
    for person in export["people"]:
        rec = export["byPerson"].get(person["subject"], {})
        for st in rec.get("stagings", []):
            p = PARADIGM_OF.get(st["situation"])
            if not p:
                continue
            if code_action(p, st.get("resolved")) is None:
                unmet[p] += 1
            else:
                met[p] += 1
        src = (rec.get("events") or {}).get("source", "none")
        sources[src] = sources.get(src, 0) + 1
    known = [r for r in export["ratings"] if r["know"] >= 1]
    return {
        "people": len(export["people"]),
        "two_visits": sum(1 for p in export["people"] if len(p["sessions"]) >= 2),
        "met": met,
        "unmet": unmet,
        "ratings": len(export["ratings"]),
        "ratings_known": len(known),
        "guesses": sum(1 for r in known if r.get("predicted")),
        "know": {k: sum(1 for r in export["ratings"] if r["know"] == k) for k in range(4)},
        "after_debrief": len(after_debrief(export)),
        "event_sources": sources,
    }


def snap(paradigm: str, x: Optional[float]) -> Optional[float]:
    """The level nearest a value (ties to the lower), for exact agreement."""
    if x is None:
        return None
    return min(LEVELS[paradigm], key=lambda lv: (abs(lv - x), lv))


def _median(xs: list[float]) -> Optional[float]:
    return float(np.median(xs)) if xs else None


Dist = list[tuple[float, float]]


def rps(dist: Optional[Dist], actual: float) -> Optional[float]:
    """
    The ranked probability score of a distribution over a paradigm's levels: the squared distance between
    its cumulative and the outcome's, averaged over the K − 1 cuts (Epstein 1969). A proper score that
    respects the levels' order; the Brier score for a choice of two. Lower is better; 0 is certainty, right.
    """
    if not dist:
        return None
    levels = [lv for lv, _ in dist]
    o = min(range(len(levels)), key=lambda i: abs(levels[i] - actual))
    cum, total = 0.0, 0.0
    for k in range(len(levels) - 1):
        cum += dist[k][1]
        total += (cum - (1.0 if k >= o else 0.0)) ** 2
    return total / (len(levels) - 1)


def point(paradigm: str, x: Optional[float]) -> Optional[Dist]:
    """A single answer as a distribution: all its weight on the nearest level."""
    if x is None:
        return None
    at = snap(paradigm, x)
    return [(lv, 1.0 if lv == at else 0.0) for lv in LEVELS[paradigm]]


def empirical(paradigm: str, values: list[float]) -> Optional[Dist]:
    """Answers as a distribution: the share at each level (the bar's, of everyone else's choices; the friends', of their guesses)."""
    if not values:
        return None
    snapped = [snap(paradigm, v) for v in values]
    return [(lv, snapped.count(lv) / len(snapped)) for lv in LEVELS[paradigm]]


def watched_for(visit: int) -> tuple[int, ...]:
    """The visits an echo watches to predict `visit`: every one before it, or the second for the first."""
    return (2,) if visit == 1 else tuple(range(1, visit))


def bar_of(acts: dict[str, dict[str, dict[int, float]]], subject: str, paradigm: str) -> Optional[float]:
    """The bar: the median of everyone else's choices in the paradigm, both visits."""
    return _median([v for q in acts if q != subject for v in acts[q][paradigm].values()])


# ── the witnesses ───────────────────────────────────────────────────────────────────────────────────


def engine_echoes(export: dict, mode: str = "exact", minutes=CURVE_MINUTES) -> dict[str, dict]:
    """
    The engine's echo of each person, rebuilt from their rows: from everything (`all`); for each visit,
    from the visits it is predicted from (`again`, by the visit predicted, `watched_for`); from everything
    but each paradigm (`elsewhere`); through the first minutes of a single visit watched (`curve`, by the
    visit predicted, then minute). The echo never sees the choice it is asked about.
    """
    exact = E.Exact() if mode == "exact" else None
    return {person["subject"]: _engine_echo(export, person["subject"], exact, minutes) for person in export["people"]}


def _engine_echo(export: dict, s: str, exact: Optional["E.Exact"], minutes) -> dict:
    rec = export["byPerson"].get(s, {})
    rows = (rec.get("events") or {}).get("rows", [])
    staged: dict[str, set[str]] = {p: set() for p in PARADIGMS}
    for st in rec.get("stagings", []):
        p = PARADIGM_OF.get(st["situation"])
        if p:
            staged[p].add(f"staged:{st['id']}")
    sessions = next(p for p in export["people"] if p["subject"] == s)["sessions"]
    starts = {int(x["n"]): L._secs(x["startedAt"]) for x in sessions}

    def replay(keep):
        return exact.replay(f"research|{s}", rows, keep) if exact else E.fast_replay(rows, s, keep)

    def on(ws: tuple[int, ...]):
        """Rows of the visits `ws`."""
        return lambda r: L.visit_at(E.when(r), sessions) in ws

    def until(w: int, t: float):
        return lambda r: L.visit_at(E.when(r), sessions) == w and E.when(r) <= starts[w] + 60 * t

    def without(ids: set[str]):
        return lambda r: (r.get("target_json") or {}).get("id") not in ids

    def bare(r) -> bool:
        """Not one of the village's moments or hidden things (C86, C87): what the echo had without them (RQ8)."""
        tid = str((r.get("target_json") or {}).get("id") or "")
        return not (tid.startswith("moment:") or tid.startswith("egg:"))

    targets = [v for v in sorted(starts) if all(w in starts for w in watched_for(v))]
    return {
        "all": replay(lambda r: True),
        "again": {v: replay(on(watched_for(v))) for v in targets},
        "elsewhere": {p: replay(without(staged[p])) for p in PARADIGMS},
        # RQ8 (registration §5): the same echo, never shown the village's moments.
        "elsewhere_bare": {p: replay(lambda r, ids=staged[p]: without(ids)(r) and bare(r)) for p in PARADIGMS},
        "curve": {v: {t: replay(until(watched_for(v)[0], t)) for t in minutes} for v in targets if len(watched_for(v)) == 1},
    }


def layer_echoes(export: dict, minutes=CURVE_MINUTES) -> dict[str, Optional[dict]]:
    """
    The fitted echoes of each person, one layer and two, each from a measurement model fitted on
    everyone else: their predictions in both settings and through the first visit's minutes.
    """
    subjects = [p["subject"] for p in export["people"]]
    obs = {s: L.observations(export, s) for s in subjects}
    out: dict[str, Optional[dict]] = {}
    for s in subjects:
        others = [q for q in subjects if q != s]
        if len(others) < 4:
            out[s] = None
            continue
        z = L.anchors(export, others, also=[s])
        models = {"echo_axes": L.fit({q: obs[q] for q in others}, {q: z[q] for q in others}, layers=1), "echo_2l": L.fit({q: obs[q] for q in others}, {q: z[q] for q in others}, layers=2)}
        sessions = next(p for p in export["people"] if p["subject"] == s)["sessions"]
        starts = {int(x["n"]): L._secs(x["startedAt"]) for x in sessions}
        targets = [v for v in sorted(starts) if all(w in starts for w in watched_for(v))]
        single = [v for v in targets if len(watched_for(v)) == 1]
        seen_again = {v: L.observations(export, s, visits=watched_for(v)) for v in targets}
        seen_else = {p: L.observations(export, s, drop=[p]) for p in PARADIGMS}
        seen_curve = {v: {t: L.observations(export, s, visits=watched_for(v), until=starts[watched_for(v)[0]] + 60 * t) for t in minutes} for v in single}
        rec: dict = {"again": {v: {} for v in targets}, "elsewhere": {}, "curve": {v: {} for v in single}, "traits": {p: L.from_traits(models["echo_2l"], z[s], p) for p in PARADIGMS}}
        for key, model in models.items():
            for v in targets:
                m, C = L.posterior(model, seen_again[v])
                rec["again"][v][key] = {p: L.distribution(model, m, C, p) for p in PARADIGMS}
            for v in single:
                rec["curve"][v][key] = {}
                for t in minutes:
                    m, C = L.posterior(model, seen_curve[v][t])
                    rec["curve"][v][key][t] = {p: L.distribution(model, m, C, p) for p in PARADIGMS}
            rec["elsewhere"][key] = {}
            for p in PARADIGMS:
                m, C = L.posterior(model, seen_else[p])
                rec["elsewhere"][key][p] = L.distribution(model, m, C, p)
        rec["z"] = L.posterior(models["echo_2l"], obs[s])[0][: L.K].tolist()
        out[s] = rec
    return out


@S.quiet_fp
def _ridge(X: np.ndarray, y: np.ndarray, x: np.ndarray) -> float:
    """A ridge prediction (intercept free), its penalty chosen by leave-one-out error, as the echoes' fits are."""
    best: Optional[tuple[float, np.ndarray]] = None
    for lam in L.LAMBDAS:
        penalty = lam * np.eye(X.shape[1])
        penalty[0, 0] = 0.0
        A = X.T @ X + penalty
        H = X @ np.linalg.solve(A, X.T)
        mse = float(np.mean(((y - H @ y) / np.clip(1.0 - np.diag(H), 1e-6, None)) ** 2))
        if best is None or mse < best[0]:
            best = (mse, np.linalg.solve(A, X.T @ y))
    assert best is not None
    return float(np.clip(x @ best[1], 0.0, 1.0))


def twin_elsewhere(acts_mean: dict[str, dict[str, Optional[float]]], subject: str, paradigm: str) -> Optional[float]:
    """The paradigm from the other five, a ridge regression fitted on everyone else."""
    others = [q for q in acts_mean if q != subject and acts_mean[q][paradigm] is not None]
    if len(others) < 4:
        return None
    feats = [k for k in PARADIGMS if k != paradigm]
    col = {k: S.mean([acts_mean[q][k] for q in others]) or 0.0 for k in feats}
    X = np.array([[1.0] + [acts_mean[q][k] if acts_mean[q][k] is not None else col[k] for k in feats] for q in others])
    y = np.array([acts_mean[q][paradigm] for q in others], dtype=float)
    x = np.array([1.0] + [acts_mean[subject][k] if acts_mean[subject][k] is not None else col[k] for k in feats])
    return _ridge(X, y, x)


def twin_again(acts: dict[str, dict[str, dict[int, float]]], subject: str, paradigm: str, visit: int = 2) -> Optional[float]:
    """One visit's choice from the six of the latest visit watched, a ridge regression fitted on everyone else."""
    w = max(watched_for(visit))
    train = [q for q in acts if q != subject and acts[q][paradigm].get(visit) is not None and any(acts[q][k].get(w) is not None for k in PARADIGMS)]
    if len(train) < 4:
        return None
    col = {k: S.mean([acts[q][k].get(w) for q in train]) or 0.0 for k in PARADIGMS}

    def row(q: str) -> list[float]:
        return [1.0] + [acts[q][k][w] if acts[q][k].get(w) is not None else col[k] for k in PARADIGMS]

    X = np.array([row(q) for q in train])
    y = np.array([acts[q][paradigm][visit] for q in train], dtype=float)
    return _ridge(X, y, np.array(row(subject)))


# ── scoring ─────────────────────────────────────────────────────────────────────────────────────────


def _pred(it: dict, key: str) -> float:
    if key == "bar":
        return it["base"]
    v = it.get(key)
    return it["base"] if v is None else v


def score(items: list[dict], key: str, ci: bool = True) -> dict:
    """A witness's skill over the bar, and its exact agreement, on every choice in `items`."""
    use = [it for it in items if it.get("base") is not None]
    empty = {"n": 0, "people": 0, "mae": None, "mae_base": None, "skill": None, "lo": None, "hi": None, "p": None, "accuracy": None, "accuracy_base": None, "silent": None}
    if not use:
        return empty
    groups: dict[str, list[dict]] = {}
    for it in use:
        groups.setdefault(it["subject"], []).append(it)
    people = list(groups.values())

    def skill_of(gs) -> Optional[float]:
        flat = [it for g in gs for it in g]
        base = np.mean([abs(it["base"] - it["actual"]) for it in flat])
        if base == 0:
            return None
        return float(1 - np.mean([abs(_pred(it, key) - it["actual"]) for it in flat]) / base)

    d = [float(np.mean([abs(it["base"] - it["actual"]) - abs(_pred(it, key) - it["actual"]) for it in g])) for g in people]
    lo, hi = S.bootstrap(people, skill_of) if ci else (None, None)
    return {
        "n": len(use),
        "people": len(people),
        "mae": float(np.mean([abs(_pred(it, key) - it["actual"]) for it in use])),
        "mae_base": float(np.mean([abs(it["base"] - it["actual"]) for it in use])),
        "skill": skill_of(people),
        "lo": lo,
        "hi": hi,
        "p": S.sign_flip(d, "greater"),
        "accuracy": float(np.mean([snap(it["paradigm"], _pred(it, key)) == it["actual"] for it in use])),
        "accuracy_base": float(np.mean([snap(it["paradigm"], it["base"]) == it["actual"] for it in use])),
        "silent": float(np.mean([it.get(key) is None for it in use])) if key != "bar" else 0.0,
    }


#: The witnesses that say how likely each answer is (or can be read so), for the probabilistic score.
PROBABILISTIC = ("self", "friends", "echo", "echo_axes", "echo_2l", "traits", "retest", "oracle_axes", "oracle_person")


def _rps_of(it: dict, key: str) -> Optional[float]:
    """An item's RPS for a witness; a silent one is scored as the bar."""
    dists = it.get("dist") or {}
    d = dists.get(key) if key != "bar" else dists.get("bar")
    return rps(d if d is not None else dists.get("bar"), it["actual"])


def score_rps(items: list[dict], key: str, ci: bool = True) -> dict:
    """Probabilistic skill: 1 − RPS/RPS_bar, the bar being the spread of everyone else's choices."""
    use = [it for it in items if (it.get("dist") or {}).get("bar") is not None]
    if not use:
        return {"n": 0, "rps": None, "rps_bar": None, "skill": None, "lo": None, "hi": None, "p": None}
    groups: dict[str, list[dict]] = {}
    for it in use:
        groups.setdefault(it["subject"], []).append(it)
    people = list(groups.values())

    def skill_of(gs) -> Optional[float]:
        flat = [it for g in gs for it in g]
        bar = np.mean([_rps_of(it, "bar") for it in flat])
        return None if bar == 0 else float(1 - np.mean([_rps_of(it, key) for it in flat]) / bar)

    d = [float(np.mean([_rps_of(it, "bar") - _rps_of(it, key) for it in g])) for g in people]
    lo, hi = S.bootstrap(people, skill_of) if ci else (None, None)
    return {"n": len(use), "rps": float(np.mean([_rps_of(it, key) for it in use])), "rps_bar": float(np.mean([_rps_of(it, "bar") for it in use])), "skill": skill_of(people), "lo": lo, "hi": hi, "p": S.sign_flip(d, "greater")}


def duel_rps(items: list[dict], a: str, b: str, ci: bool = True) -> dict:
    """Does `b` score better than `a` by the RPS? Each person's mean of RPS_a − RPS_b, one-sided."""
    groups: dict[str, list[dict]] = {}
    for it in items:
        if (it.get("dist") or {}).get("bar") is not None:
            groups.setdefault(it["subject"], []).append(it)
    d = [float(np.mean([_rps_of(it, a) - _rps_of(it, b) for it in g])) for g in groups.values()]
    lo, hi = S.bootstrap(d, lambda g: S.mean(g)) if (ci and d) else (None, None)
    return {"a": a, "b": b, "score": "rps", "people": len(d), "mean": S.mean(d), "lo": lo, "hi": hi, "p": S.sign_flip(d, "greater"), "dz": S.dz(d)}


def duel(items: list[dict], a: str, b: str, ci: bool = True) -> dict:
    """Does `b` remove more of the error than `a`? Each person's mean of |a − x| − |b − x|, one-sided."""
    groups: dict[str, list[dict]] = {}
    for it in items:
        if it.get("base") is not None:
            groups.setdefault(it["subject"], []).append(it)
    d = [float(np.mean([abs(_pred(it, a) - it["actual"]) - abs(_pred(it, b) - it["actual"]) for it in g])) for g in groups.values()]
    lo, hi = S.bootstrap(d, lambda g: S.mean(g)) if (ci and d) else (None, None)
    return {"a": a, "b": b, "people": len(d), "mean": S.mean(d), "lo": lo, "hi": hi, "p": S.sign_flip(d, "greater"), "dz": S.dz(d)}


def crossing(curve: dict[int, Optional[float]], level: Optional[float]) -> Optional[float]:
    """The first minute a curve reaches `level`, interpolated linearly between the minutes measured."""
    if level is None:
        return None
    pts = [(t, v) for t, v in sorted(curve.items()) if v is not None]
    if pts and pts[0][1] >= level:
        return float(pts[0][0])
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if v1 >= level:
            return float(t0 + (t1 - t0) * (level - v0) / (v1 - v0))
    return None


# ── the analysis ────────────────────────────────────────────────────────────────────────────────────


@S.quiet_fp
def analyze(export: dict, mode: str = "exact", truth: Optional[dict] = None, ci: bool = True, minutes=CURVE_MINUTES, directions: Optional[tuple[int, ...]] = None) -> dict:
    """
    Everything the study reports, from an export (`GET /api/pilot?op=export`) or a simulated one.
    `ci=False` skips the intervals (the power runs). `directions` are the visits `again` predicts, each
    from every visit before it (`watched_for`); None is every visit after the first (registered: with
    two visits, the second from the first). (2, 1) also predicts the first from the second, which adds
    little power in simulation (.57 to .60 at 16 people): both directions share the same pairs of choices.
    """
    people = export["people"]
    subjects = [p["subject"] for p in people]
    acts = acts_of(export)
    acts_mean = {s: {p: S.mean(list(acts[s][p].values())) for p in PARADIGMS} for s in subjects}
    said = {p["subject"]: code_stated(p["stated"]) for p in people}
    guesses: dict[str, dict[str, list[tuple[int, float]]]] = {s: {p: [] for p in PARADIGMS} for s in subjects}
    friend_axes: dict[str, list[list[int]]] = {s: [] for s in subjects}
    for r in export["ratings"]:
        if r["know"] < 1 or r["ratee"] not in guesses:
            continue
        if r.get("axes"):
            friend_axes[r["ratee"]].append(r["axes"])
        if r.get("predicted"):
            for p, v in code_stated(r["predicted"]).items():
                if v is not None:
                    guesses[r["ratee"]][p].append((int(r["know"]), v))
    base = {s: {p: bar_of(acts, s, p) for p in PARADIGMS} for s in subjects}
    engine = engine_echoes(export, mode, minutes)
    fitted = layer_echoes(export, minutes)
    oracle = None
    if truth:
        from .simulate import oracle as _oracle

        oracle = _oracle

    def engine_pick(post, p: str) -> Optional[float]:
        dist = E.choice_distribution(post, p)
        return None if dist is None else L.median(dist)

    def layer_rec(s: str, setting: str, w: Optional[int]) -> Optional[dict]:
        rec = fitted.get(s)
        if rec is None:
            return None
        return rec[setting] if w is None else rec[setting].get(w)

    def layer_pick(s: str, setting: str, key: str, p: str, w: Optional[int] = None) -> Optional[float]:
        rec = layer_rec(s, setting, w)
        return None if rec is None else L.median(rec[key][p])

    def layer_dists(s: str, setting: str, p: str, w: Optional[int] = None) -> dict:
        rec = layer_rec(s, setting, w)
        return {key: (None if rec is None else rec[key][p]) for key in ("echo_axes", "echo_2l")}

    def common(s: str, p: str) -> dict:
        g = guesses[s][p]
        rec = fitted.get(s)
        it = {"subject": s, "paradigm": p, "base": base[s][p], "self": said[s][p], "friends": _median([v for _, v in g]), "traits": None if rec is None else L.median(rec["traits"][p])}
        for k in (1, 2, 3):
            it[f"friends_k{k}"] = _median([v for kk, v in g if kk == k])
        it["dist"] = {
            "bar": empirical(p, [v for q in subjects if q != s for v in acts[q][p].values()]),
            "self": point(p, said[s][p]),
            "friends": empirical(p, [v for _, v in g]),
            "traits": None if rec is None else rec["traits"][p],
        }
        if oracle:
            o_axes, o_person = oracle(truth, s, p, knows_own=False), oracle(truth, s, p, knows_own=True)
            it["oracle_axes"], it["oracle_person"] = L.median(o_axes), L.median(o_person)
            it["dist"]["oracle_axes"], it["dist"]["oracle_person"] = o_axes, o_person
        return it

    items: dict[str, list[dict]] = {"again": [], "elsewhere": []}
    for s in subjects:
        for p in PARADIGMS:
            # Each visit predicted from the visits before it (or the first from the second, `directions`).
            for v in (directions if directions is not None else range(2, 10)):
                if v not in engine[s]["again"] or acts[s][p].get(v) is None:
                    continue
                ws = watched_for(v)
                last = max(ws)
                it = common(s, p)
                it.update(
                    visit=v,
                    watched=ws[0] if len(ws) == 1 else ws,
                    in_curve=len(ws) == 1,
                    actual=acts[s][p][v],
                    echo=engine_pick(engine[s]["again"][v], p),
                    echo_axes=layer_pick(s, "again", "echo_axes", p, v),
                    echo_2l=layer_pick(s, "again", "echo_2l", p, v),
                    twin=snap(p, twin_again(acts, s, p, v)),
                    retest=acts[s][p].get(last),
                )
                it["dist"].update(echo=E.choice_distribution(engine[s]["again"][v], p), retest=point(p, acts[s][p].get(last)), **layer_dists(s, "again", p, v))
                it["together"] = _median([it[k] for k in POOLED if it[k] is not None])
                if it["in_curve"]:
                    for t in minutes:
                        it[f"echo@{t}"] = engine_pick(engine[s]["curve"][v][t], p)
                        rec = layer_rec(s, "curve", v)
                        for key in ("echo_axes", "echo_2l"):
                            it[f"{key}@{t}"] = None if rec is None else L.median(rec[key][t][p])
                items["again"].append(it)
            for v, actual in acts[s][p].items():
                it = common(s, p)
                it.update(
                    visit=v,
                    actual=actual,
                    echo=engine_pick(engine[s]["elsewhere"][p], p),
                    echo_bare=engine_pick(engine[s]["elsewhere_bare"][p], p),
                    echo_axes=layer_pick(s, "elsewhere", "echo_axes", p),
                    echo_2l=layer_pick(s, "elsewhere", "echo_2l", p),
                    twin=snap(p, twin_elsewhere(acts_mean, s, p)),
                    retest=acts[s][p].get(3 - v),
                )
                it["dist"].update(echo=E.choice_distribution(engine[s]["elsewhere"][p], p), retest=point(p, acts[s][p].get(3 - v)), **layer_dists(s, "elsewhere", p))
                it["together"] = _median([it[w] for w in POOLED if it[w] is not None])
                items["elsewhere"].append(it)

    refs = ("retest", *(("oracle_axes", "oracle_person") if oracle else ()))
    settings: dict[str, dict] = {}
    for name, its in items.items():
        witnesses = {w: score(its, w, ci) for w in (*WITNESSES, *refs)}
        both = [it for it in its if it.get("retest") is not None]
        rt = score(both, "retest", False)["skill"]
        for w in WITNESSES:
            sk = score(both, w, False)["skill"]
            witnesses[w]["normalised"] = (sk / rt) if (sk is not None and rt is not None and rt > 0) else None
        friends_by_know = {}
        for k in (1, 2, 3):
            covered = [it for it in its if it.get(f"friends_k{k}") is not None]
            friends_by_know[k] = score(covered, f"friends_k{k}", ci)
        settings[name] = {
            "witnesses": witnesses,
            "probabilistic": {w: score_rps(its, w, ci) for w in PROBABILISTIC if w in witnesses},
            "friends_by_know": friends_by_know,
            "by_paradigm": {p: {w: score([it for it in its if it["paradigm"] == p], w, False) for w in (*WITNESSES, *refs)} for p in PARADIGMS},
        }
    settings["again"]["duels"] = [duel(items["again"], a, b, ci) for a, b in DUELS]
    # RQ8 (registration §5, estimation): what the village's moments add to the echo that never saw the paradigm.
    village_echo = {
        "echo": score(items["elsewhere"], "echo", ci),
        "echo_bare": score(items["elsewhere"], "echo_bare", ci),
        "duel": duel(items["elsewhere"], "echo", "echo_bare", ci),
    }
    settings["again"]["duels_rps"] = [duel_rps(items["again"], a, b, ci) for a, b in DUELS_RPS]

    # The curve: the echoes' skill through the first visit, against the witnesses that do not wait.
    curve: dict[str, dict[int, dict]] = {}
    on_curve = [it for it in items["again"] if it.get("in_curve")]
    for w in CURVE_WITNESSES:
        curve[w] = {}
        for t in minutes:
            sc = score(on_curve, f"{w}@{t}", ci and w == "echo_2l")
            curve[w][t] = {"skill": sc["skill"], "lo": sc["lo"], "hi": sc["hi"], "accuracy": sc["accuracy"], "silent": sc["silent"]}
    flat = {w: {t: curve[w][t]["skill"] for t in minutes} for w in CURVE_WITNESSES}
    # The level lines are scored on the curve's own choices (the same as `again`'s with two visits).
    lines = {k: score(on_curve, k, False)["skill"] for k in ("self", "friends", "retest")}
    for k in (1, 2, 3):
        lines[f"friends_k{k}"] = score([it for it in on_curve if it.get(f"friends_k{k}") is not None], f"friends_k{k}", False)["skill"]
    if oracle:
        lines["oracle_axes"] = score(on_curve, "oracle_axes", False)["skill"]
        lines["oracle_person"] = score(on_curve, "oracle_person", False)["skill"]
    crossings = {w: {line: crossing(flat[w], level) for line, level in lines.items()} for w in CURVE_WITNESSES}

    # The say–do gap (said minus did), and the friends' guess minus the same: whose words run ahead of the deed.
    gap, holier = {}, {}
    for p in PARADIGMS:
        d = [said[s][p] - acts_mean[s][p] for s in subjects if said[s][p] is not None and acts_mean[s][p] is not None]
        lo, hi = S.bootstrap(d, lambda g: S.mean(g)) if (ci and d) else (None, None)
        gap[p] = {"n": len(d), "gap": S.mean(d), "lo": lo, "hi": hi, "p": S.sign_flip(d, "two-sided"), "dz": S.dz(d), "said": S.mean([said[s][p] for s in subjects]), "did": S.mean([acts_mean[s][p] for s in subjects])}
        both = [s for s in subjects if said[s][p] is not None and acts_mean[s][p] is not None and guesses[s][p]]
        self_err = [said[s][p] - acts_mean[s][p] for s in both]
        friend_err = [float(np.mean([v for _, v in guesses[s][p]])) - acts_mean[s][p] for s in both]
        diff = [a - b for a, b in zip(self_err, friend_err)]
        lo, hi = S.bootstrap(diff, lambda g: S.mean(g)) if (ci and diff) else (None, None)
        holier[p] = {"n": len(both), "self_error": S.mean(self_err), "friends_error": S.mean(friend_err), "difference": S.mean(diff), "lo": lo, "hi": hi, "p": S.sign_flip(diff, "two-sided")}

    # Each choice against itself on the other visit.
    retest = {}
    for p in PARADIGMS:
        pairs = [(acts[s][p][1], acts[s][p][2]) for s in subjects if 1 in acts[s][p] and 2 in acts[s][p]]
        r = S.pearson([a for a, _ in pairs], [b for _, b in pairs])
        retest[p] = {"n": len(pairs), "agree": S.mean([1.0 if a == b else 0.0 for a, b in pairs]), "r": r["r"], "lo": r["lo"], "hi": r["hi"]}

    # Self and friends on the eight axes, and the echoes against both.
    self_axes = {p["subject"]: p["self"] for p in people}
    friend_mean = {s: (np.mean(friend_axes[s], axis=0).tolist() if friend_axes[s] else None) for s in subjects}
    echo_mu = {s: engine[s]["all"].mu.tolist() for s in subjects}
    echo2_mu = {s: (fitted[s]["z"] if fitted.get(s) else None) for s in subjects}

    def col(src: dict, s: str, k: int) -> Optional[float]:
        v = src.get(s)
        return None if v is None else v[k]

    axes = {}
    for k, a in enumerate(AXES):
        axes[a] = {
            "self_friends": S.pearson([self_axes[s][k] for s in subjects], [col(friend_mean, s, k) for s in subjects]),
            "echo_self": S.pearson([echo_mu[s][k] for s in subjects], [self_axes[s][k] for s in subjects]),
            "echo_friends": S.pearson([echo_mu[s][k] for s in subjects], [col(friend_mean, s, k) for s in subjects]),
            "echo2l_self": S.pearson([col(echo2_mu, s, k) for s in subjects], [self_axes[s][k] for s in subjects]),
            "echo2l_friends": S.pearson([col(echo2_mu, s, k) for s in subjects], [col(friend_mean, s, k) for s in subjects]),
        }
        if truth:
            z_true = [truth["people"][s]["z"][k] for s in subjects]
            axes[a]["echo_truth"] = S.pearson([echo_mu[s][k] for s in subjects], z_true)
            axes[a]["echo2l_truth"] = S.pearson([col(echo2_mu, s, k) for s in subjects], z_true)
            axes[a]["self_truth"] = S.pearson([self_axes[s][k] for s in subjects], z_true)
            axes[a]["friends_truth"] = S.pearson([col(friend_mean, s, k) for s in subjects], z_true)
    matched = [S.profile_r(echo_mu[s], [x - 4 for x in self_axes[s]]) for s in subjects]
    mismatched = [S.profile_r(echo_mu[s], [x - 4 for x in self_axes[t]]) for s in subjects for t in subjects if t != s]
    profiles = {"echo_self_matched": S.mean(matched), "echo_self_mismatched": S.mean(mismatched)}

    # What a choice is made of, as the two-layer model fitted on everyone sees it (and, simulated, as it was made).
    shares = None
    if len(subjects) >= 5:
        whole = L.fit({s: L.observations(export, s) for s in subjects}, L.anchors(export, subjects), layers=2)
        shares = L.stable_share(whole)
    true_shares = None
    if truth:
        from .simulate import SimParams
        from .simulate import shares as _shares

        true_shares = _shares(SimParams(**truth["params"]))

    return {
        "simulated": bool(export.get("simulated")),
        "mode": mode,
        "coverage": coverage(export),
        "settings": settings,
        "curve": {"minutes": list(minutes), "witnesses": curve, "lines": lines, "crossings": crossings},
        "gap": gap,
        "holier": holier,
        "retest": retest,
        "village_echo": village_echo,
        "axes": axes,
        "profiles": profiles,
        "shares": shares,
        "true_shares": true_shares,
        "ears": E.ears(),
        "act_noise_scale": E.act_noise_scale(),
        "labels": LABEL,
        "items": items,
        "echoes": {s: {"mu": echo_mu[s], "sd": np.sqrt(np.diag(engine[s]["all"].Sigma)).tolist(), "two_layer_z": echo2_mu[s]} for s in subjects},
    }
