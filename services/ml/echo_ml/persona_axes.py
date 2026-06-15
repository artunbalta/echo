"""Persona axes (§8) — Python mirror of packages/shared/src/persona.ts. The order MUST
match the shared definition so z vectors are interchangeable across services."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Axis:
    key: str
    neg: str
    pos: str


AXES: list[Axis] = [
    Axis("warmth", "cold", "warm"),
    Axis("dominance", "deferential", "assertive"),
    Axis("openness", "conventional", "eccentric"),
    Axis("energy", "calm", "high-energy"),
    Axis("formality", "casual", "formal"),
    Axis("intellect", "playful", "cerebral"),
    Axis("pace", "unhurried", "fast"),
    Axis("affect", "reserved", "expressive"),
]

AXIS_KEYS = [a.key for a in AXES]
AXIS_INDEX = {a.key: i for i, a in enumerate(AXES)}
