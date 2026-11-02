"""The pilot's six paradigms (web DECISIONS C75): what each answer is worth, and how the web sends it.

Every choice is coded on one scale, 0..1, in the direction of the paradigm's name:

    give   loaves given of three (0, 1/3, 2/3, 1)        the dictator game
    lend   the raft lent (1) or kept (0)                  the trust game's first move
    bet    risk taken with the mean held at two fish      safe 0, even 0.5, long 1; declining 0
    seed   planted for tomorrow (1) or taken now (0)      delay discounting
    path   the overgrown path followed (1) or not (0)     exploration
    greet  went up to the traveller (1) or walked on (0)  approaching a stranger

The same codes serve the person's own words (`stated`), their friends' guesses (`predicted`, C76), and
what they did in the village (the director's `player_stagings`, `resolved`). A staging left unmet is
missing, never a zero: nobody can refuse what they never came upon.
"""
from __future__ import annotations

from typing import Optional

PARADIGMS: tuple[str, ...] = ("give", "lend", "bet", "seed", "path", "greet")

#: The director's situation for each paradigm (packages/planet/lib/director.ts).
SITUATION_OF: dict[str, str] = {
    "give": "hungry_stranger",
    "lend": "raft_borrower",
    "bet": "tide_fisher",
    "seed": "seed_offer",
    "path": "overgrown_path",
    "greet": "lone_traveler",
}
PARADIGM_OF: dict[str, str] = {v: k for k, v in SITUATION_OF.items()}

#: What a staging's `resolved` is worth. "passed" is walking on after coming near; absent keys are missing.
ACTION_CODE: dict[str, dict[str, float]] = {
    "give": {"give-one": 1 / 3, "give-two": 2 / 3, "give-all": 1.0, "passed": 0.0},
    "lend": {"lend": 1.0, "keep": 0.0, "passed": 0.0},
    "bet": {"bet-safe": 0.0, "bet-even": 0.5, "bet-long": 1.0, "passed": 0.0},
    "seed": {"now": 0.0, "plant": 1.0},
    "path": {"follow": 1.0, "passed": 0.0},
    "greet": {"greet": 1.0, "passed": 0.0},
}

#: Short names for the paper's tables.
LABEL: dict[str, str] = {
    "give": "Giving (dictator)",
    "lend": "Trust (lending)",
    "bet": "Risk (tide bet)",
    "seed": "Patience (seed)",
    "path": "Exploration (path)",
    "greet": "Approach (stranger)",
}

#: The engine feature each paradigm's choice is read through (ingest.py), or None where none is (trust, C75).
FEATURE_OF: dict[str, Optional[str]] = {
    "give": "ts_social",
    "lend": None,
    "bet": "risk_index",
    "seed": "save_rate",
    "path": "curiosity",
    "greet": "approach",
}

#: Every option of each paradigm as a coded value, and the telemetry ingest.py makes of it (checked against
#: the real ingest in the tests). The echo's prediction scores these against what it expects of a person.
OPTION_TELEMETRY: dict[str, list[tuple[float, dict]]] = {
    "give": [(0.0, {"ts_social": 0.0}), (1 / 3, {"ts_social": 0.333}), (2 / 3, {"ts_social": 0.667}), (1.0, {"ts_social": 1.0})],
    "lend": [(0.0, {}), (1.0, {})],
    "bet": [(0.0, {"risk_index": 0.0}), (0.5, {"risk_index": 0.25}), (1.0, {"risk_index": 1.0})],
    "seed": [(0.0, {"save_rate": 0.15}), (1.0, {"save_rate": 0.85})],
    "path": [(0.0, {"curiosity": 0.05}), (1.0, {"curiosity": 0.75})],
    "greet": [(0.0, {"approach": False}), (1.0, {"approach": True})],
}


def code_action(paradigm: str, resolved: Optional[str]) -> Optional[float]:
    """What a staging's answer is worth, or None (unmet, still standing, or an answer that says nothing)."""
    if resolved is None:
        return None
    return ACTION_CODE[paradigm].get(resolved)


def code_stated(stated: Optional[dict]) -> dict[str, Optional[float]]:
    """The six answers (a person's own, or a friend's guess about them) on the same 0..1 scale."""
    if not stated:
        return {p: None for p in PARADIGMS}
    bet = {"bet-safe": 0.0, "bet-even": 0.5, "bet-long": 1.0, "none": 0.0}
    out: dict[str, Optional[float]] = {}
    out["give"] = stated["give"] / 3 if stated.get("give") in (0, 1, 2, 3) else None
    out["lend"] = (1.0 if stated["lend"] else 0.0) if isinstance(stated.get("lend"), bool) else None
    out["bet"] = bet.get(stated.get("bet"))
    out["seed"] = {"now": 0.0, "plant": 1.0}.get(stated.get("seed"))
    out["path"] = {"marked": 0.0, "unmarked": 1.0}.get(stated.get("path"))
    out["greet"] = (1.0 if stated["greet"] else 0.0) if isinstance(stated.get("greet"), bool) else None
    return out


def stated_from_codes(codes: dict[str, float]) -> dict:
    """The inverse, for the simulation: codes back to the web's `PilotStated` shape."""
    bet = {0.0: "bet-safe", 0.5: "bet-even", 1.0: "bet-long"}
    return {
        "give": int(round(codes["give"] * 3)),
        "lend": codes["lend"] >= 0.5,
        "bet": bet[min(bet, key=lambda v: abs(v - codes["bet"]))],
        "seed": "plant" if codes["seed"] >= 0.5 else "now",
        "path": "unmarked" if codes["path"] >= 0.5 else "marked",
        "greet": codes["greet"] >= 0.5,
    }


#: The verb a coded action is answered with, for the simulation (the inverse of ACTION_CODE, taking over passing).
VERB_FOR: dict[str, dict[float, str]] = {
    "give": {0.0: "passed", 1 / 3: "give-one", 2 / 3: "give-two", 1.0: "give-all"},
    "lend": {0.0: "keep", 1.0: "lend"},
    "bet": {0.0: "bet-safe", 0.5: "bet-even", 1.0: "bet-long"},
    "seed": {0.0: "now", 1.0: "plant"},
    "path": {0.0: "passed", 1.0: "follow"},
    "greet": {0.0: "passed", 1.0: "greet"},
}

#: The levels each paradigm's code takes.
LEVELS: dict[str, tuple[float, ...]] = {p: tuple(sorted(VERB_FOR[p])) for p in PARADIGMS}
