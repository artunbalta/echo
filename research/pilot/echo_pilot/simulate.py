"""Synthetic friend groups that play the pilot village (C75/C76), and come out as the export does.

A simulated person has eight traits and, beside them, a stable tendency of their own in each paradigm
(the part of what they do that no trait explains). What they do on a visit is both, plus that day's noise.
What they SAY they would do comes from how they see themselves, with a pull toward the admirable (the
say–do gap). What their FRIENDS guess comes from how the friends see them: better the better they know
them, coloured by the friend's own traits (assumed similarity). They walk, and how they walk carries a
little of their openness and their pace.

The numbers below are assumptions, chosen from the ranges the literature reports, not measurements:
- the "personality coefficient": trait–single-act correlations of about .3;
- retest agreement of single economic choices: .6–.7;
- self–other agreement on traits: .3–.5;
- a say–do gap on prosocial choices: people say they would give and help more than they do.

The output has the export's shape (`GET /api/pilot?op=export`): people, ratings, and for each person the
director's stagings and the behavioural rows, so the analysis cannot tell it from the real thing. The
truth stays beside it, for the analysis to be checked against.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import norm

from .paradigms import LEVELS, PARADIGMS, SITUATION_OF, VERB_FOR, stated_from_codes
from .stats import quiet_fp

AXES = ("warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect")
SHORE = {"lend", "bet"}

#: How the web sends each verb (packages/planet/lib/affordances.ts; the tests read the source to check).
VERB_MEASURE: dict[str, tuple[str, str, str, str]] = {
    # verb: (channel, cue, action, stakes)
    "give-one": ("F", "F7", "give_gift", "medium"),
    "give-two": ("F", "F7", "give_gift", "medium"),
    "give-all": ("F", "F7", "give_gift", "high"),
    "lend": ("G", "G16", "lend_raft", "high"),
    "keep": ("G", "G16", "keep_raft", "medium"),
    "bet-safe": ("F", "F3", "tide_wager", "medium"),
    "bet-even": ("F", "F3", "tide_wager", "medium"),
    "bet-long": ("F", "F3", "tide_wager", "high"),
    "now": ("F", "F1", "eat_now", "medium"),
    "plant": ("F", "F1", "plant_seed", "medium"),
    "follow": ("I", "I3", "enter_unmarked", "medium"),
    "greet": ("G", "G1", "initiate", "low"),
}
VERB_RAW: dict[str, dict] = {
    "give-one": {"amount": 0.333},
    "give-two": {"amount": 0.667},
    "give-all": {"amount": 1},
    "bet-safe": {"variance": 0},
    "bet-even": {"variance": 0.25},
    "bet-long": {"variance": 1},
}
#: Walking past, as the director's layer sends it (director.ts `passed`), or None where passing says nothing.
PASSED: dict[str, tuple[str, str, str, str, bool] | None] = {
    # paradigm: (channel, cue, action, polarity, with distance)
    "give": ("F", "F7", "give_gift", "refuse", True),
    "lend": ("G", "G16", "keep_raft", "take", False),
    "bet": ("F", "F3", "tide_wager", "refuse", True),
    "seed": None,
    "path": ("I", "I3", "enter_unmarked", "refuse", True),
    "greet": ("G", "G1", "initiate", "refuse", True),
}
BASE_CONTEXT = {"stakes": "low", "audience_size": 0, "public_or_private": "private", "counterpart_status": "none", "stage": 1, "scarcity_level": 0.15, "mood_proxy": 0, "time_pressure": 0}


@dataclass
class SimParams:
    """The assumptions, every one of them adjustable."""

    #: How each paradigm's propensity loads on the eight traits (AXES order).
    loadings: dict[str, tuple[float, ...]] = field(
        default_factory=lambda: {
            "give": (0.32, -0.08, 0.0, 0.0, 0.0, 0.0, 0.0, 0.12),
            "lend": (0.25, -0.08, 0.18, 0.0, 0.0, 0.0, 0.0, 0.0),
            "bet": (0.0, 0.22, 0.15, 0.12, -0.1, 0.0, 0.0, 0.0),
            "seed": (0.0, 0.0, 0.0, 0.0, 0.2, 0.18, -0.18, 0.0),
            "path": (0.0, 0.0, 0.32, 0.12, 0.0, 0.0, 0.0, 0.0),
            "greet": (0.22, 0.14, 0.0, 0.2, 0.0, 0.0, 0.0, 0.14),
        }
    )
    #: Base rates of each level (LEVELS order).
    base: dict[str, tuple[float, ...]] = field(
        default_factory=lambda: {
            "give": (0.15, 0.35, 0.30, 0.20),
            "lend": (0.45, 0.55),
            "bet": (0.45, 0.35, 0.20),
            "seed": (0.40, 0.60),
            "path": (0.45, 0.55),
            "greet": (0.50, 0.50),
        }
    )
    #: A person's own stable tendency in a paradigm, beyond the traits; and a visit's noise.
    stable_sd: float = 0.6
    visit_sd: float = 0.55
    #: How well people see their own traits (correlation), and their own stable tendencies.
    self_insight: float = 0.8
    self_tendency: float = 0.5
    #: The pull of the admirable on what people say they would do (in propensity units).
    desirability: dict[str, float] = field(default_factory=lambda: {"give": 0.35, "lend": 0.25, "bet": 0.0, "seed": 0.2, "path": 0.15, "greet": 0.3})
    said_sd: float = 0.5
    #: How well a friend sees someone, by how well they know them (0..3), and how much of the friend
    #: they put into it (assumed similarity).
    friend_insight: tuple[float, ...] = (0.0, 0.45, 0.6, 0.72)
    projection: float = 0.3
    friend_tendency: float = 0.25
    guess_sd: float = 0.5
    #: How well the friends know each other: chances of 0, 1, 2, 3.
    know: tuple[float, ...] = (0.2, 0.3, 0.3, 0.2)
    no_idea: float = 0.15
    #: The village: windows of walking a visit, chances of never meeting one, and of not coming back.
    windows: tuple[int, int] = (40, 140)
    unmet_land: float = 0.07
    unmet_shore: float = 0.15
    dropout: float = 0.1
    #: Of those choosing nothing: walking past rather than saying so (give/path/greet only pass; the raft
    #: is refused aloud half the time, and the tide's bet declined a sixth of the time).
    lend_pass: float = 0.5
    bet_decline: float = 0.15


def _trait_cov(rng: np.random.Generator | None = None) -> np.ndarray:
    r = np.eye(8)
    for (a, b), v in {("warmth", "affect"): 0.3, ("energy", "affect"): 0.3, ("openness", "intellect"): 0.3, ("dominance", "energy"): 0.25, ("formality", "pace"): -0.1}.items():
        i, j = AXES.index(a), AXES.index(b)
        r[i, j] = r[j, i] = v
    return r


def _cuts(params: SimParams, p: str) -> np.ndarray:
    """Thresholds on a standardised propensity that give the paradigm's base rates."""
    cum = np.cumsum(params.base[p])[:-1]
    return norm.ppf(cum)


def _level(params: SimParams, p: str, eta_std: float) -> float:
    cuts = _cuts(params, p)
    return LEVELS[p][int(np.searchsorted(cuts, eta_std))]


def _sd(params: SimParams, p: str, cov: np.ndarray) -> float:
    lam = np.array(params.loadings[p])
    return math.sqrt(float(lam @ cov @ lam) + params.stable_sd**2 + params.visit_sd**2)


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@quiet_fp
def make_group(n: int, seed: int = 0, params: SimParams | None = None, start: datetime | None = None) -> tuple[dict, dict]:
    """One group of `n` friends, through two visits each: (export, truth)."""
    params = params or SimParams()
    rng = np.random.default_rng(seed)
    cov = _trait_cov(rng)
    start = start or datetime(2026, 11, 3, 18, 0, tzinfo=timezone.utc)
    subjects = [f"sim{seed:04d}-{i:03d}-4222-8333-444455556667" for i in range(n)]
    # By Cholesky, not multivariate_normal: the same draw, without numpy 2's spurious BLAS warnings on macOS.
    z = rng.normal(0, 1, size=(n, 8)) @ np.linalg.cholesky(cov).T
    assert np.isfinite(z).all()
    u = {p: rng.normal(0, params.stable_sd, size=n) for p in PARADIGMS}

    def propensity(i: int, p: str, view: np.ndarray, tendency: float, shift: float, sd: float) -> float:
        lam = np.array(params.loadings[p])
        return (float(lam @ view) + tendency * u[p][i] + shift + rng.normal(0, sd)) / _sd(params, p, cov)

    people, ratings, by_person, truth = [], [], {}, {}
    self_view = {}
    for i, s in enumerate(subjects):
        a = params.self_insight
        view = a * z[i] + math.sqrt(1 - a * a) * rng.normal(0, 1, size=8)
        self_view[i] = view
        said = {p: _level(params, p, propensity(i, p, view, params.self_tendency, params.desirability[p], params.said_sd)) for p in PARADIGMS}
        stated = stated_from_codes(said)
        if said["bet"] == 0.0 and rng.random() < params.bet_decline:
            stated["bet"] = "none"
        self_axes = [int(np.clip(round(4 + 1.3 * view[k] + rng.normal(0, 0.5)), 1, 7)) for k in range(8)]
        t0 = start + timedelta(minutes=int(rng.integers(0, 240)))
        visits = [t0] + ([] if rng.random() < params.dropout else [t0 + timedelta(hours=22 + int(rng.integers(0, 6)))])
        sessions = [{"n": v + 1, "startedAt": _iso(t), "endedAt": _iso(t + timedelta(minutes=25))} for v, t in enumerate(visits)]
        people.append(
            {"subject": s, "nickname": f"Friend {i + 1}", "joinedAt": _iso(t0 - timedelta(minutes=8)), "consentAt": _iso(t0 - timedelta(minutes=8)), "self": self_axes, "stated": stated, "sessions": sessions, "settled": {}}
        )
        stagings, rows = [], []
        acts: dict[str, dict[int, float | None]] = {p: {} for p in PARADIGMS}
        for v, t in enumerate(visits):
            order = list(rng.permutation(PARADIGMS))
            # The director asks one at a time (C75 `pilotAsk`): the first 20 s in, each next 30 s after the
            # last was answered, or after it stood its four minutes unmet.
            clock = t + timedelta(seconds=20)
            # Walking: windows through the visit, carrying a little openness, energy and pace.
            for w in range(int(rng.integers(*params.windows))):
                at = t + timedelta(seconds=20 + w * 1500 / params.windows[1] * 0.95)
                novel = float(np.clip(rng.normal(0.35 + 0.08 * z[i, 2] + 0.05 * z[i, 3], 0.12), 0.01, 0.98))
                tort = float(1 + math.exp(rng.normal(-0.2 + 0.3 * z[i, 2] - 0.15 * z[i, 6], 0.4)))
                rows.append({"kind": "telemetry", "actor_id": s, "t": _iso(at), "type": "passive_locomotion", "payload_json": {"novel_tile_ratio": round(novel, 3), "path_tortuosity": round(tort, 3), "tiles": 12}})
            for k, p in enumerate(order):
                sid = f"stg_sim{seed:04d}{i:03d}{v}{k}"
                created = clock
                unmet = rng.random() < (params.unmet_shore if p in SHORE else params.unmet_land)
                staging = {"id": sid, "subject": s, "cell": "843f6a1ffffffff", "situation": SITUATION_OF[p], "x": 0.0, "y": 0.0, "facing": 0.0, "owner": None, "ownerName": None, "infoGain": None, "createdAt": _iso(created), "resolved": None, "resolvedAt": None}
                if unmet:
                    staging["resolved"], staging["resolvedAt"] = "unmet", _iso(created + timedelta(minutes=4))
                    stagings.append(staging)
                    acts[p][v + 1] = None
                    clock = created + timedelta(minutes=4, seconds=30)
                    continue
                code = _level(params, p, propensity(i, p, z[i], 1.0, 0.0, params.visit_sd))
                acts[p][v + 1] = code
                verb = VERB_FOR[p][code]
                if p == "lend" and code == 0.0 and rng.random() < params.lend_pass:
                    verb = "passed"
                if p == "bet" and code == 0.0 and rng.random() < params.bet_decline:
                    verb = "passed"
                answered = created + timedelta(seconds=40 + int(rng.integers(0, 90)))
                clock = answered + timedelta(seconds=30)
                staging["resolved"], staging["resolvedAt"] = verb, _iso(answered)
                stagings.append(staging)
                latency = float(math.exp(rng.normal(math.log(2500) - 0.25 * z[i, 6] + 0.1 * z[i, 5], 0.45)))
                target = {"id": f"staged:{sid}", "kind": "resource"}
                if verb == "passed":
                    channel, cue, action, polarity, with_distance = PASSED[p]  # type: ignore[misc]
                    raw = {"distance": 36.0} if with_distance else {}
                    context = {**BASE_CONTEXT, "stakes": "medium"}
                else:
                    channel, cue, action, stakes = VERB_MEASURE[verb]
                    raw = {"dwell_ms": 1500, "decision_latency_ms": round(latency), "thoroughness01": 1, **VERB_RAW.get(verb, {})}
                    if p == "give":
                        raw["held"] = 3
                    if channel == "G" and action != "lend_raft" and action != "keep_raft":
                        raw["distance"] = 2.4
                    context = {**BASE_CONTEXT, "stakes": stakes, "counterpart_status": "none" if p == "path" else "stranger"}
                    polarity = "take"
                rows.append(
                    {"kind": "behavioral", "actor_id": s, "t": _iso(answered), "type": "act", "channel": channel, "cue": cue, "action": action, "polarity": polarity, "target_json": target, "context_json": context, "raw_signals_json": raw, "payload_json": {}, "session_mode": "landing", "provenance": "live"}
                )
        by_person[s] = {"stagings": stagings, "events": {"rows": sorted(rows, key=lambda r: r["t"]), "source": "simulation"}, "echo": None}
        truth[s] = {"z": z[i].tolist(), "u": {p: float(u[p][i]) for p in PARADIGMS}, "acts": acts, "said": said}

    # Friends: how each sees each, and what each guesses of the others.
    for i, rater in enumerate(subjects):
        for j, ratee in enumerate(subjects):
            if i == j:
                continue
            know = int(rng.choice(4, p=params.know))
            if know == 0:
                ratings.append({"rater": rater, "ratee": ratee, "know": 0, "axes": None, "predicted": None, "at": people[i]["joinedAt"]})
                continue
            a = params.friend_insight[know]
            view = a * z[j] + params.projection * self_view[i] + math.sqrt(max(1e-6, 1 - a * a)) * rng.normal(0, 1, size=8)
            bias = rng.normal(0, 0.3)
            axes = [int(np.clip(round(4 + 1.3 * view[k] + bias + rng.normal(0, 0.5)), 1, 7)) for k in range(8)]
            predicted = None
            if rng.random() >= params.no_idea:
                tend = params.friend_tendency * know / 3
                guess = {p: _level(params, p, propensity(j, p, view, tend, params.desirability[p] * 0.5, params.guess_sd)) for p in PARADIGMS}
                predicted = stated_from_codes(guess)
            ratings.append({"rater": rater, "ratee": ratee, "know": know, "axes": axes, "predicted": predicted, "at": people[j]["joinedAt"]})

    export = {"exportedAt": _iso(start + timedelta(days=3)), "cell": "843f6a1ffffffff", "simulated": True, "people": people, "ratings": ratings, "byPerson": by_person}
    return export, {"params": params.__dict__, "people": truth}


def oracle(truth: dict, subject: str, paradigm: str, knows_own: bool) -> list[tuple[float, float]]:
    """
    What someone who knew the simulated person exactly would expect of their next choice: their traits
    (and, `knows_own`, their own steady tendency too), with only what they cannot know left as noise.
    The best any witness could do, as a distribution over the levels.
    """
    params = SimParams(**truth["params"])
    person = truth["people"][subject]
    cov = _trait_cov()
    lam = np.array(params.loadings[paradigm])
    center = float(lam @ np.array(person["z"])) + (person["u"][paradigm] if knows_own else 0.0)
    noise = params.visit_sd if knows_own else math.sqrt(params.stable_sd**2 + params.visit_sd**2)
    cuts = _cuts(params, paradigm) * _sd(params, paradigm, cov)
    cdf = [0.0] + [float(norm.cdf((c - center) / noise)) for c in cuts] + [1.0]
    return [(lv, cdf[k + 1] - cdf[k]) for k, lv in enumerate(LEVELS[paradigm])]


def shares(params: SimParams | None = None) -> dict[str, dict[str, float]]:
    """How each paradigm's propensity splits, as assumed: traits, the person's own, the visit's."""
    params = params or SimParams()
    cov = _trait_cov()
    out = {}
    for p in PARADIGMS:
        lam = np.array(params.loadings[p])
        traits, own, visit = float(lam @ cov @ lam), params.stable_sd**2, params.visit_sd**2
        total = traits + own + visit
        out[p] = {"traits": traits / total, "own": own / total, "visit": visit / total}
    return out
