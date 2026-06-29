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


def _flow0_features(action: str, take: bool, rs: dict, tel: dict) -> bool:
    """Flow 0 (solitary shore, ECHO_level_design_7flows.md) cues → the EXISTING telemetry
    feature that best matches each cue's *signal type* (latency, grit, risk/cost, inward
    dwell, approach). Which axis each feature loads on stays LEARNED in W (persona_model) —
    the design-doc cue→axis lines are priors/hypotheses, not hardcodes (cross-cutting rule
    #1). Purely additive: returns True iff `action` is a Flow-0 cue, so the caller can skip
    the generic per-channel blocks and existing behaviour stays byte-identical.

    Where the committed W (trained on the island day-loop economy) has no strong telemetry
    path to the doc's intended axis (the *openness* exploration cues — enter_unmarked,
    approach_distant_lone, the horizon/hollow eggs), the cue still moves the posterior via the
    closest signal-type feature + the action embedding; the routing sharpens onto openness
    once W is re-anchored on Flow-0 exploration data (the doc's learned-loadings mechanism)."""
    if action == "first_move":
        # tempo of the very first input — a pure latency signal (→ pace via W). latencyMs is
        # already set from raw_signals at the top of event_to_observation.
        return True
    if action == "take_marked_path":
        # the obvious, paved choice — deliberately LOW weight (obvious ⇒ weak signal): carried
        # only by the action embedding, with no strong implicit feature attached.
        return True
    if action == "enter_unmarked":
        tel["risk_index"] = 0.75 if take else 0.1     # off-trail, no visible reward = costly/uncertain
        return True
    if action == "climb_hill":
        tel["persistence"] = 0.45 if take else 0.0    # bothering to climb at all = mild effort
        return True
    if action == "climb_persist":
        tel["persistence"] = 0.9 if take else 0.0     # retrying after each slip = strong grit
        return True
    if action == "gaze_reflection":
        dwell = float(rs.get("dwell_ms", 0.0) or 0.0)
        tel["solitude_tol"] = _clip01(dwell / 4000.0) if take else 0.0   # inward, self-focused dwell
        return True
    if action == "collect":
        tel["persistence"] = 0.4 if take else 0.0     # gathering the strewn objects
        return True
    if action == "stack_tidy":
        tel["persistence"] = 0.85 if take else 0.0    # ORDERING them (not just collecting) → conscientiousness
        tel["editsCount"] = 2.0 if take else 0.0
        return True
    if action == "ignore_all":
        # leaving them scattered — the Channel-K refusal twin below makes this move the
        # posterior (non-action is data); relative to a tidier player, formality does not rise.
        return True
    if action == "approach_distant_lone":
        tel["approach"] = True if take else False     # crossing to the one odd far thing
        tel["risk_index"] = 0.5 if take else 0.1      # distance = cost = validity
        return True
    if action == "egg_horizon_seen":
        tel["risk_index"] = 0.4 if take else 0.0      # climbed high enough to glimpse the far isle
        return True
    if action == "egg_reflection":
        tel["solitude_tol"] = 0.7 if take else 0.0    # the uncanny self-recognition beat
        return True
    if action == "egg_hollow":
        tel["risk_index"] = 0.5 if take else 0.0      # the hidden carved mark — pure curiosity, zero reward
        return True
    return False


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

    # — Flow 0 (solitary shore) cues — purely additive; when a cue is Flow-0 specific we skip
    #   the generic per-channel blocks below so existing behaviour stays byte-identical.
    flow0 = _flow0_features(action, take, rs, tel)

    # — locomotion / approach (Channel A, G1) —
    if not flow0 and channel in ("A", "G"):
        # approach is the engine's ±1 proximity feature; a refusal (avoid / hang back) is −1,
        # which is DISTINCT from "absent ⇒ 0" so the non-action actually moves the posterior.
        if "distance" in rs or action in ("approach", "initiate", "greet") or channel == "A":
            # boolean so persona._telemetry_features reads the sign correctly (it binarizes by
            # truthiness — a float −1.0 is truthy and was being mis-read as approach=+1).
            tel["approach"] = bool(take)
    # dwell → time-share (cue A4/A5)
    if not flow0 and rs.get("dwell_ms") is not None:
        key = _DWELL_TS.get(str(target.get("id", "")), None) or _DWELL_TS.get(str(target.get("kind", "")), None)
        if key:
            share = _clip01(float(rs["dwell_ms"]) / 8000.0)
            tel[key] = share if take else 0.0

    # — economic / resource (Channel F) —
    if not flow0 and channel == "F":
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
    if not flow0 and (cue.startswith("D11") or action == "pet_talk"):
        tel["pet_attach"] = _clip01(float(rs.get("amount", abs(float(rs.get("valence", 0.5))))))
    if not flow0 and channel in ("D", "G") and ("server" in str(target.get("kind", "")) or cue.startswith("G11")):
        # courtesy to a low-status server who cannot reciprocate (top individuating cue)
        tel["ts_social"] = 0.85 if take else 0.1

    # — normative / queue (Channel H) —
    if not flow0 and (cue.startswith("H1") or "queue" in action):
        if take:
            tel["persistence"] = 0.8
            tel["consistency"] = 0.85
        else:                                                    # cut / skip the queue
            tel["consistency"] = 0.1
            tel["approach"] = False

    # — non-action twins (Channel K): guarantee a concrete signal so refusal is data —
    if channel == "K" or not take:
        if "social" in action or cue in ("K1", "K11") or channel == "K":
            tel.setdefault("approach", False)
            tel.setdefault("solitude_tol", 0.85)
        tel.setdefault("approach", False)

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
