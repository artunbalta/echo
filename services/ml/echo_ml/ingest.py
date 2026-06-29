"""BehavioralEvent ingress — the server-side realization of the instrumentation contract
(docs/world-design/event-schema.md).

The client emits ``BehavioralEvent`` envelopes (packages/shared/src/telemetry.ts); this module
turns one envelope into the ``(action, telemetry)`` the persona engine already consumes
(``persona.observe`` → ``featurize_raw``), plus the conditional-bucket key under which the
update is also recorded. It enforces the two hard rules of the contract:

  Rule 2 — context is MANDATORY. An event whose 8-field context envelope is incomplete is
           rejected (``MissingContext``); the conditional signature that carries identity is
           unreadable without it.
  Rule 1/K — non-action is data. A ``polarity="refuse"`` event (a Channel-K twin) is mapped to
           a *concrete* telemetry signal (e.g. approach = −1, high solitude) so a refusal moves
           the posterior rather than vanishing into "absent ⇒ neutral".

``mood_proxy`` is deliberately NOT mapped to any trait feature — it rides in the context only,
so a bad mood never moves the durable trait z (trait/state separation, WI-5).

This mapping is intentionally transparent and population-agnostic: it only sets the
language-free telemetry features; *which axis each feature loads on stays learned* in W
(persona_model.py), never hardcoded here.
"""
from __future__ import annotations

from typing import Any

REQUIRED_CONTEXT = (
    "stakes", "audience_size", "public_or_private", "counterpart_status",
    "stage", "scarcity_level", "mood_proxy", "time_pressure",
)

# Stations/targets whose dwell maps to a time-share feature (cue A4/A5, stage-map s0/s1).
_DWELL_TS = {
    "book_cairn": "ts_learn", "library": "ts_learn", "academy": "ts_learn",
    "berry_bush": "ts_earn", "market": "ts_earn", "harbor": "ts_earn",
    "bedroll": "ts_leisure", "campfire": "ts_leisure",
    "raft": "ts_build", "workshop": "ts_build", "structure": "ts_build",
    "plaza": "ts_social", "tavern": "ts_social",
}

_SOCIAL_CHANNELS = {"D", "E", "G", "H"}


class MissingContext(ValueError):
    """Raised when an event's context envelope is incomplete (contract Rule 2)."""


def validate_context(ctx: dict | None) -> None:
    if not isinstance(ctx, dict):
        raise MissingContext("context envelope is required")
    missing = [k for k in REQUIRED_CONTEXT if ctx.get(k) is None]
    if missing:
        raise MissingContext(f"context missing required fields: {missing}")


def _clip01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def event_to_observation(ev: dict) -> dict[str, Any]:
    """Map one BehavioralEvent → {userId, action, telemetry, context, cond_key, polarity}.

    Raises MissingContext if the context envelope is incomplete.
    """
    ctx = ev.get("context")
    validate_context(ctx)

    actor = ev.get("actor_id")
    if not actor:
        raise ValueError("event missing actor_id (per-actor routing key)")

    channel = str(ev.get("channel", "")).upper()[:1]
    cue = str(ev.get("cue", ""))
    action = str(ev.get("action", "") or cue or channel)
    polarity = "refuse" if ev.get("polarity") == "refuse" else "take"
    take = polarity == "take"
    rs = ev.get("raw_signals") or {}
    target = ev.get("target") or {}

    tel: dict[str, float] = {}

    # — implicit raw signals (Channel B/C/E) — present on most events —
    if rs.get("latency_ms") is not None:
        tel["latencyMs"] = float(rs["latency_ms"])
    if rs.get("edits") is not None:
        tel["editsCount"] = float(rs["edits"])
    if rs.get("decision_latency_ms") is not None:
        tel["decision_latency"] = float(rs["decision_latency_ms"])

    # — locomotion / approach (Channel A, G1) —
    if channel in ("A", "G"):
        # approach is the engine's ±1 proximity feature; a refusal (avoid / hang back) is −1,
        # which is DISTINCT from "absent ⇒ 0" so the non-action actually moves the posterior.
        if "distance" in rs or action in ("approach", "initiate", "greet") or channel == "A":
            tel["approach"] = 1.0 if take else -1.0
    # dwell → time-share (cue A4/A5)
    if rs.get("dwell_ms") is not None:
        key = _DWELL_TS.get(str(target.get("id", "")), None) or _DWELL_TS.get(str(target.get("kind", "")), None)
        if key:
            share = _clip01(float(rs["dwell_ms"]) / 8000.0)
            tel[key] = share if take else 0.0

    # — economic / resource (Channel F) —
    if channel == "F":
        if cue.startswith("F1") or "save" in action or "spend" in action:
            tel["save_rate"] = 0.85 if take else 0.15            # save seed vs eat now
        if cue.startswith("F3") or "wager" in action or "bet" in action:
            tel["risk_index"] = _clip01(float(rs.get("variance", 0.8 if take else 0.1)))
        if cue.startswith("F7") or "give" in action or "tip" in action or "share" in action:
            amt = _clip01(float(rs.get("amount", 0.6)))
            tel["ts_social"] = amt if take else 0.0              # generosity reads social
        if cue.startswith("F9") or "bargain" in action:
            tel["risk_index"] = _clip01(float(rs.get("amount", 0.6)) if take else 0.2)

    # — pet / disclosure (Channel D) —
    if cue.startswith("D11") or action == "pet_talk":
        tel["pet_attach"] = _clip01(float(rs.get("amount", abs(float(rs.get("valence", 0.5))))))
    if channel in ("D", "G") and ("server" in str(target.get("kind", "")) or cue.startswith("G11")):
        # courtesy to a low-status server who cannot reciprocate (top individuating cue)
        tel["ts_social"] = 0.85 if take else 0.1

    # — normative / queue (Channel H) —
    if cue.startswith("H1") or "queue" in action:
        if take:
            tel["persistence"] = 0.8
            tel["consistency"] = 0.85
        else:                                                    # cut / skip the queue
            tel["consistency"] = 0.1
            tel["approach"] = -1.0

    # — non-action twins (Channel K): guarantee a concrete signal so refusal is data —
    if channel == "K" or not take:
        if "social" in action or cue in ("K1", "K11") or channel == "K":
            tel.setdefault("approach", -1.0)
            tel.setdefault("solitude_tol", 0.85)
        tel.setdefault("approach", -1.0)

    # conditional-bucket key: social events condition on counterpart status; otherwise on stakes.
    if channel in _SOCIAL_CHANNELS and ctx.get("counterpart_status") not in (None, "none"):
        cond_key = f"counterpart:{ctx['counterpart_status']}"
    else:
        cond_key = f"stakes:{ctx['stakes']}"

    return {
        "userId": str(actor),
        "action": action,
        "telemetry": tel,
        "context": ctx,
        "cond_key": cond_key,
        "polarity": polarity,
    }
