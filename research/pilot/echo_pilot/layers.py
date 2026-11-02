"""The two-layer echo: a person as their traits AND their own ways (C77, a proposal; out of the engine).

The engine's echo has one layer: eight axes z, and every feature a mix of them plus noise,
φ_j = μ_j + w_jᵀz + ε_j. A choice is then only as predictable as the axes make it, and the axes make
single acts barely predictable: the "personality coefficient" (trait–act correlations of about .3).
Yet people repeat themselves far better than that. Most of what makes one kind of choice steady from one
day to the next is particular to that kind of choice (the specific variance of factor analysis; the
"nuances" below the Big Five). A one-layer echo has nowhere to keep it, so it forgets it, or worse, it
reads it as character and over-generalises one generous loaf to warmth in everything.

The two-layer echo keeps it. Beside the eight axes, its state holds one number per feature, u_j, the
person's own steady tendency in it beyond their traits:

    φ_j(visit) = μ_j + w_jᵀz + u_j + ε_j,    z ~ N(0, I),  u_j ~ N(0, τ_j²),  ε_j ~ N(0, σ_j²)

and it learns both with the engine's update (linear-Gaussian, Joseph form) on the stacked state
x = [z; u]. An act's surprise is shared between the layers in proportion to what each could explain;
what goes to u_j waits for the same situation to come again, what goes to z carries everywhere. With
τ = 0 it IS a one-layer echo, which makes the ablation exact (`layers=1`).

The parameters are the group's, fitted on the OTHER people only (the person predicted is never in it),
by variance components (`fit`): a visit's noise from how far people's two visits differ, their steady
part from how far people differ beyond that, and of the steady part, the traits' share from what the
anchors (self- and friends' ratings) predict of it out of sample. τ_j² is what the traits leave. The
six choices' stability, each estimated from a dozen pairs of visits, is partially pooled (`_pool`).

What it reads, per visit: the six choices on their own 0..1 codes (trust included: the engine reads no
lending, C75, this reads the choice), the visit's mean walk (novel-tile share, log tortuosity) and its
mean log decision time. It reads nothing else: no ratings of the person predicted, no words.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

import numpy as np
from scipy.stats import norm

from . import engine as E
from .paradigms import LEVELS, PARADIGM_OF, PARADIGMS, code_action
from .stats import quiet_fp

FEATURES: tuple[str, ...] = (*PARADIGMS, "novel", "tortuosity", "latency")
K = 8
J = len(FEATURES)

Obs = tuple[int, str, float]  # (visit, feature, value)


def _secs(x) -> float:
    if isinstance(x, (int, float)):
        return float(x) / (1000.0 if x > 1e11 else 1.0)
    return datetime.fromisoformat(str(x).replace("Z", "+00:00")).timestamp()


def visit_at(t: float, sessions: list[dict]) -> Optional[int]:
    """Which visit a moment belongs to (a minute's grace before, ten after, as `analysis.visit_of`)."""
    for s in sessions:
        start = _secs(s["startedAt"])
        end = _secs(s["endedAt"]) if s.get("endedAt") else start + 35 * 60
        if start - 60 <= t <= end + 600:
            return int(s["n"])
    return None


def observations(export: dict, subject: str, until: Optional[float] = None, drop: Iterable[str] = (), visits: Optional[Iterable[int]] = None) -> list[Obs]:
    """
    What the echo has seen of one person: per visit, each choice met, the mean walk, the mean decision
    time. `until` (seconds) keeps only what happened by then; `drop` leaves paradigms out entirely, their
    acts' decision times included; `visits` keeps only those visits.
    """
    person = next(p for p in export["people"] if p["subject"] == subject)
    sessions = person["sessions"]
    keep_visit = set(visits) if visits is not None else None
    drop = set(drop)
    rec = export["byPerson"].get(subject, {})
    out: list[Obs] = []
    seen: set[tuple[int, str]] = set()
    staged_paradigm: dict[str, str] = {}
    for st in sorted(rec.get("stagings", []), key=lambda s: _secs(s["createdAt"])):
        p = PARADIGM_OF.get(st["situation"])
        if not p:
            continue
        staged_paradigm[f"staged:{st['id']}"] = p
        if p in drop:
            continue
        v = visit_at(_secs(st["createdAt"]), sessions)
        value = code_action(p, st.get("resolved"))
        if v is None or value is None or (keep_visit is not None and v not in keep_visit):
            continue
        at = _secs(st.get("resolvedAt") or st["createdAt"])
        if until is not None and at > until:
            continue
        if (v, p) not in seen:
            seen.add((v, p))
            out.append((v, p, float(value)))
    walks: dict[int, list[tuple[float, float]]] = {}
    lat: dict[int, list[float]] = {}
    for row in (rec.get("events") or {}).get("rows", []):
        t = E.when(row)
        if until is not None and t > until:
            continue
        v = visit_at(t, sessions)
        if v is None or (keep_visit is not None and v not in keep_visit):
            continue
        if row.get("kind") == "telemetry":
            pay = row.get("payload_json") or {}
            if row.get("type") == "passive_locomotion" and isinstance(pay.get("novel_tile_ratio"), (int, float)) and isinstance(pay.get("path_tortuosity"), (int, float)):
                walks.setdefault(v, []).append((float(pay["novel_tile_ratio"]), math.log(max(float(pay["path_tortuosity"]), 1.0))))
            continue
        if staged_paradigm.get((row.get("target_json") or {}).get("id")) in drop:
            continue
        ms = (row.get("raw_signals_json") or {}).get("decision_latency_ms")
        if isinstance(ms, (int, float)) and ms > 0:
            lat.setdefault(v, []).append(math.log(float(ms)))
    for v, ws in sorted(walks.items()):
        if len(ws) >= 3:
            out.append((v, "novel", float(np.mean([w[0] for w in ws]))))
            out.append((v, "tortuosity", float(np.mean([w[1] for w in ws]))))
    for v, ls in sorted(lat.items()):
        out.append((v, "latency", float(np.mean(ls))))
    return out


def raw_anchors(export: dict) -> dict[str, np.ndarray]:
    """Each person on the eight axes (1..7) as they and their friends see them: the mean of their own rating and their friends' mean."""
    self_axes = {p["subject"]: np.array(p["self"], dtype=float) for p in export["people"]}
    friends: dict[str, list] = {s: [] for s in self_axes}
    for r in export["ratings"]:
        if r["know"] >= 1 and r.get("axes") and r["ratee"] in friends:
            friends[r["ratee"]].append(r["axes"])
    return {s: np.mean([v] + ([np.mean(friends[s], axis=0)] if friends[s] else []), axis=0) for s, v in self_axes.items()}


def anchors(export: dict, subjects: Iterable[str], also: Iterable[str] = ()) -> dict[str, np.ndarray]:
    """
    The anchors of `subjects`, standardised across them; `also` are placed on the same scale without
    moving it (the person predicted, by the measurement model the others fitted).
    """
    subjects = list(subjects)
    raw = raw_anchors(export)
    stack = np.array([raw[s] for s in subjects])
    mu, sd = stack.mean(axis=0), stack.std(axis=0)
    sd[sd == 0] = 1.0
    return {s: (raw[s] - mu) / sd for s in (*subjects, *also)}


@dataclass
class Fitted:
    """A fitted two-layer (or, with tau2 = 0, one-layer) measurement model."""

    mu: np.ndarray  # (J,)
    W: np.ndarray  # (J, K)
    tau2: np.ndarray  # (J,)
    sigma2: np.ndarray  # (J,)
    layers: int

    def prior(self) -> tuple[np.ndarray, np.ndarray]:
        return np.zeros(K + J), np.diag(np.concatenate([np.ones(K), self.tau2]))

    def row(self, j: int) -> np.ndarray:
        h = np.zeros(K + J)
        h[:K] = self.W[j]
        h[K + j] = 1.0
        return h


#: The ridge penalties the leave-one-person-out search chooses among.
LAMBDAS: tuple[float, ...] = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0, 300.0, 1000.0)


@quiet_fp
def _loo_ridge(Z: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """
    A ridge regression of y on Z (intercept free), its penalty chosen by leave-one-out error (the exact
    shortcut for linear smoothers: e_i / (1 − H_ii)). Returns the slopes and that error.
    """
    X = np.hstack([np.ones((len(y), 1)), Z])
    best: Optional[tuple[float, np.ndarray]] = None
    for lam in LAMBDAS:
        penalty = lam * np.eye(X.shape[1])
        penalty[0, 0] = 0.0
        A = X.T @ X + penalty
        H = X @ np.linalg.solve(A, X.T)
        loo = (y - H @ y) / np.clip(1.0 - np.diag(H), 1e-6, None)
        mse = float(np.mean(loo**2))
        if best is None or mse < best[0]:
            best = (mse, np.linalg.solve(A, X.T @ y)[1:])
    assert best is not None
    return best[1], best[0]


#: Partial pooling of the six choices' stability (C79): the pooled estimate is worth this many pairs of
#: visits against one choice's own (about what each choice has at sixteen people). Chosen on simulation
#: before any real data, under equal and unequal stability alike (experiments/pooling.py); 0 turns it off.
POOL_PAIRS: float = 10.0


@quiet_fp
def fit(obs: dict[str, list[Obs]], z: dict[str, np.ndarray], layers: int = 2) -> Fitted:
    """
    The measurement model of the people in `z` (their anchors, standardised), from their observations,
    by variance components (the latent state–trait split), feature by feature:

    - the VISIT's variance, σ²: half the mean squared difference between a person's two visits;
    - the PERSON's steady variance: the variance of people's means, less what the visit's noise puts in
      them (the one-way ANOVA estimator);
    - of that, the TRAITS' share: what the anchors predict of people's means out of sample (ridge,
      penalty and error by leave-one-person-out), never more than the steady variance;
    - the person's OWN, τ²: the steady variance the traits leave.

    w_j is the ridge's direction, scaled so that wᵀw is the traits' share: fitting eight slopes on a
    handful of people would otherwise hand the person's own steadiness to the axes. One layer (`layers=1`)
    has no τ: what the traits leave of the steady part is counted as noise, as the engine counts it.
    """
    mu, W = np.zeros(J), np.zeros((J, K))
    tau2, sigma2 = np.zeros(J), np.ones(J)
    for j, feat in enumerate(FEATURES):
        per = {s: {v: val for (v, f, val) in obs.get(s, []) if f == feat} for s in z}
        per = {s: d for s, d in per.items() if d}
        values = np.array([val for d in per.values() for val in d.values()], dtype=float)
        if len(per) < 4 or values.var() <= 0:
            mu[j] = float(values.mean()) if len(values) else 0.0
            sigma2[j] = float(max(values.var(), 1e-3)) if len(values) else 1.0
            continue
        means = np.array([np.mean(list(d.values())) for d in per.values()])
        counts = np.array([len(d) for d in per.values()], dtype=float)
        pairs = [(d[1], d[2]) for d in per.values() if 1 in d and 2 in d]
        total = float(values.var(ddof=1))
        within = float(np.mean([(a - b) ** 2 / 2 for a, b in pairs])) if len(pairs) >= 3 else 0.5 * total
        spread = float(means.var(ddof=1))
        steady = max(spread - within * float(np.mean(1.0 / counts)), 0.0)
        slopes, loo = _loo_ridge(np.array([z[s] for s in per]), means)
        traits = min(max(spread - loo, 0.0), steady)
        norm2 = float(slopes @ slopes)
        w = slopes * np.sqrt(traits / norm2) if (norm2 > 0 and traits > 0) else np.zeros(K)
        own = max(steady - traits, 0.0)
        floor = 1e-3 * max(total, 1e-6)
        mu[j], W[j] = float(means.mean()), w
        if layers == 1:
            tau2[j], sigma2[j] = 0.0, max(within + own, floor)
        else:
            tau2[j], sigma2[j] = own, max(within, floor)
    if layers == 2 and POOL_PAIRS > 0:
        _pool(obs, z, tau2, sigma2)
    assert np.isfinite(mu).all() and np.isfinite(W).all() and np.isfinite(tau2).all() and np.isfinite(sigma2).all()
    return Fitted(mu=mu, W=W, tau2=tau2, sigma2=sigma2, layers=layers)


def _pool(obs: dict[str, list[Obs]], z: dict[str, np.ndarray], tau2: np.ndarray, sigma2: np.ndarray) -> None:
    """
    Partial pooling of the six choices' stability, τ²/(τ² + σ²): each choice's own estimate, from its
    pairs of visits, shrunk toward the pairs-weighted mean of all six by POOL_PAIRS pairs' worth.
    The residual variance τ² + σ² of each choice is kept; only its split moves.
    """
    js = [FEATURES.index(p) for p in PARADIGMS]
    pairs = {j: sum(1 for s in z if {1, 2} <= {v for (v, f, _) in obs.get(s, []) if f == FEATURES[j]}) for j in js}
    resid = {j: tau2[j] + sigma2[j] for j in js}
    ratio = {j: (tau2[j] / resid[j]) if resid[j] > 0 else 0.0 for j in js}
    total = sum(pairs.values())
    if total == 0:
        return
    pooled = sum(pairs[j] * ratio[j] for j in js) / total
    for j in js:
        r = (pairs[j] * ratio[j] + POOL_PAIRS * pooled) / (pairs[j] + POOL_PAIRS)
        tau2[j], sigma2[j] = r * resid[j], max((1 - r) * resid[j], 1e-3 * resid[j])


@quiet_fp
def update(model: Fitted, m: np.ndarray, S: np.ndarray, j: int, value: float) -> tuple[np.ndarray, np.ndarray]:
    """One observation of feature j: the engine's linear-Gaussian step (Joseph form), on [z; u]."""
    h = model.row(j)
    s = float(h @ S @ h + model.sigma2[j])
    k = S @ h / s
    m = m + k * (value - model.mu[j] - h @ m)
    I_kh = np.eye(len(m)) - np.outer(k, h)
    S = I_kh @ S @ I_kh.T + model.sigma2[j] * np.outer(k, k)
    return m, (S + S.T) / 2


def posterior(model: Fitted, seen: Iterable[Obs]) -> tuple[np.ndarray, np.ndarray]:
    """The echo after these observations, in time order of visits."""
    m, S = model.prior()
    for _, feat, value in sorted(seen, key=lambda o: o[0]):
        m, S = update(model, m, S, FEATURES.index(feat), value)
    return m, S


@quiet_fp
def distribution(model: Fitted, m: np.ndarray, S: np.ndarray, paradigm: str) -> list[tuple[float, float]]:
    """
    What the echo expects of the person's next choice in a paradigm: the predictive of its code,
    N(μ_j + h·m, h S hᵀ + σ_j²), cut at the midpoints between the paradigm's levels.
    """
    j = FEATURES.index(paradigm)
    h = model.row(j)
    mean = float(model.mu[j] + h @ m)
    sd = math.sqrt(float(h @ S @ h + model.sigma2[j]))
    levels = LEVELS[paradigm]
    cuts = [(a + b) / 2 for a, b in zip(levels, levels[1:])]
    cdf = [0.0] + [float(norm.cdf((c - mean) / sd)) for c in cuts] + [1.0]
    return [(lv, cdf[i + 1] - cdf[i]) for i, lv in enumerate(levels)]


def from_traits(model: Fitted, z: np.ndarray, paradigm: str) -> list[tuple[float, float]]:
    """
    What a model of the person's rated traits alone expects (a questionnaire twin): their anchor taken as
    their axes, known; their own tendency unknown, so left in the noise.
    """
    m = np.concatenate([z, np.zeros(J)])
    C = np.diag(np.concatenate([np.zeros(K), model.tau2]))
    return distribution(model, m, C, paradigm)


def median(dist: list[tuple[float, float]]) -> float:
    """The level a distribution over levels puts its middle on: the guess that minimises expected absolute error."""
    acc = 0.0
    for level, p in dist:
        acc += p
        if acc >= 0.5 - 1e-12:
            return level
    return dist[-1][0]


def mean_of(dist: list[tuple[float, float]]) -> float:
    return float(sum(lv * p for lv, p in dist))


def stable_share(model: Fitted) -> dict[str, dict[str, float]]:
    """How each feature's variance splits, as fitted: traits (wᵀw), the person's own (τ²), the visit's (σ²)."""
    out = {}
    for j, f in enumerate(FEATURES):
        traits, own, visit = float(model.W[j] @ model.W[j]), float(model.tau2[j]), float(model.sigma2[j])
        total = traits + own + visit
        out[f] = {"traits": traits / total, "own": own / total, "visit": visit / total} if total > 0 else {"traits": 0.0, "own": 0.0, "visit": 1.0}
    return out


def session_start(export: dict, subject: str, n: int) -> Optional[float]:
    person = next(p for p in export["people"] if p["subject"] == subject)
    for s in person["sessions"]:
        if int(s["n"]) == n:
            return _secs(s["startedAt"])
    return None

