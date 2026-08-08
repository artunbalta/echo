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
        tel["curiosity"] = 0.75 if take else 0.05     # off-trail, no visible reward — pure novelty-seeking (★ P5: → openness)
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
        # Crossing the beach to the one odd far THING (the lone driftwood — a place, not a
        # person): the warmth-ish `approach` read belongs to social approach, so this cue is
        # carried purely by novelty; distance = cost = validity (★ P5: → openness).
        tel["curiosity"] = 0.7 if take else 0.05
        return True
    if action == "egg_horizon_seen":
        tel["curiosity"] = 0.45 if take else 0.0      # glimpsed the far isle / the far figure (★ P5: → openness)
        return True
    if action == "egg_reflection":
        tel["solitude_tol"] = 0.7 if take else 0.0    # the uncanny self-recognition beat
        return True
    if action == "egg_hollow":
        tel["curiosity"] = 0.8 if take else 0.0       # the hidden carved mark — pure curiosity, zero reward (★ P5)
        return True
    return False


# ── embodied-activity cues (the F1/F4/F5/F6 embodied rebuild, ECHO_level_design_7flows.md) ──────────
# Unlike the discrete menu cues above, these carry the *manner* of a performed activity as CONTINUOUS
# raw_signals; this block maps those manner scalars onto the EXISTING telemetry features as continuous
# values (never constants). Which activity's dwell counts as which time-share:
_EMBODIED_TS = {
    "gather_driftwood": "ts_earn",
    "assemble_raft": "ts_build",
    "launch_raft": "ts_build",
    "study_marker": "ts_learn",
    "dig_cache": "ts_build",
}

# The embodied-activity actions this block owns. Additive: only NEW action names appear here, so every
# prior Flow-0 / social / per-channel cue keeps its exact behaviour.
_EMBODIED_CUES = frozenset({
    "gather_driftwood", "assemble_raft", "launch_raft", "abandon_gather", "abandon_build",
    "plant_seed", "eat_now", "enter_cave", "stay_safe", "study_marker", "dig_cache", "sit_still",
    "movement_sample",
})


def _embodied_features(action: str, take: bool, rs: dict, tel: dict) -> bool:
    """Embodied performed-activity cues → the EXISTING telemetry features, set to CONTINUOUS values
    derived from the *manner* of the performance (thoroughness, persistence-after-fail, stillness,
    off-trail risk, delayed-vs-instant) carried in raw_signals — never constants. This is the
    individuation the button-menu threw away: two players performing the same activity in different
    styles emit different scalars → different φ → measurably different posteriors. Which axis each
    feature loads on stays LEARNED in W (cross-cutting rule #1); the doc's cue→axis lines are priors.

    latency_ms / decision_latency_ms / edits ride the generic top-block of event_to_observation, so this
    block only sets the manner features that block does not (persistence, ts_*, solitude_tol, risk_index,
    save_rate). Returns True iff `action` is an embodied cue, so the caller skips the generic per-channel
    blocks and prior behaviour is byte-identical.

    Openness-intended manner (decorative flourish) is still carried HONESTLY on the nearest own-axis
    feature (decoration = extra build effort → ts_build), never silently re-routed. NOTE: the ★ P5
    re-anchor (2026-07-12) DID give W an openness path — novel_tile_ratio / path_tortuosity /
    travel_novelty / curiosity — but those directions were anchored on the P3 passive sampler's and the
    F0/F2 choice cues' scalar definitions. Whether `decoration` belongs on `curiosity` is a real routing
    decision with its own evidence bar (does it load onto openness?), not a rename: it stays ⚑ in
    docs/known-gaps.md #6 until that is shown, because guessing here is the silent re-route the
    cross-cutting rule forbids."""
    if action not in _EMBODIED_CUES:
        return False

    # The F1 activity sampler's window. Its one mapped signal is stillness/dwell → solitude_tol (calm, the
    # low end of energy). heading_var / speed_var / explore_ratio stay UNMAPPED here on purpose: the ★ P5
    # re-anchor learned openness from the P3 `passive_locomotion` sampler (game/telemetry.ts), and its
    # path_tortuosity is a normalized ≥1 ratio — NOT the same quantity as this block's heading_var (4-way
    # facing changes per distance). Feeding one into the other's learned direction would be a silent
    # re-route into a W anchored on different definitions. passive_locomotion is the canonical
    # locomotion→openness channel; this branch keeps only the job it alone does (still_ms).
    if action == "movement_sample":
        still = rs.get("still_ms")
        if still is not None:
            tel["solitude_tol"] = _clip01(float(still) / 8000.0)
        return True

    # Abandoning a performed activity is data (Rule 1/K): time NOT spent on the craft reads as leisure/
    # avoidance — an own-axis read (like shirk_work), so the K-twin never cross-loads it onto warmth.
    if not take or action.startswith("abandon"):
        tel["ts_leisure"] = 0.5
        return True

    # thoroughness of a gather/build (just-enough ↔ obsessive) → conscientiousness/grit
    if rs.get("thoroughness01") is not None:
        tel["persistence"] = _clip01(float(rs["thoroughness01"]))
    # grinding a puzzle/build out after each failure → strong grit (high validity)
    if rs.get("persist_after_fail") is not None:
        tel["persistence"] = max(tel.get("persistence", 0.0), _clip01(float(rs["persist_after_fail"])))
    # holding still and quiet (the shy-creature beat) → calm / solitude-tolerance (the low end of energy)
    if rs.get("still_ms") is not None:
        tel["solitude_tol"] = _clip01(float(rs["still_ms"]) / 8000.0)
    # a costly/uncertain embodied choice (enter the dark cave, push off-trail) → risk
    if rs.get("risk01") is not None:
        tel["risk_index"] = _clip01(float(rs["risk01"]))
    elif action == "enter_cave":
        tel["risk_index"] = 0.75
    elif action == "stay_safe":
        tel["risk_index"] = 0.1
    # plant-vs-eat: investing the seed (delayed, larger payoff) vs eating now (instant) → time-discounting
    if action == "plant_seed" or rs.get("delayed") is True:
        tel["save_rate"] = 0.85
    elif action == "eat_now" or rs.get("delayed") is False:
        tel["save_rate"] = 0.15

    # time-share of the activity on its axis (build / earn / learn), from the dwell it took
    ts_key = _EMBODIED_TS.get(action)
    if ts_key:
        dwell = rs.get("dwell_ms")
        share = _clip01(float(dwell) / 12000.0) if dwell is not None else 0.4
        tel[ts_key] = max(tel.get(ts_key, 0.0), share)

    # ⚑ decorative flourish / non-functional extra effort: doc-intended OPENNESS. W now HAS an openness
    # path (★ P5), but `curiosity` was anchored on choice cues (enter_unmarked / eggs / asks_question),
    # not on "spent longer making it ornate" — so this stays carried honestly as extra build-time
    # (ts_build) and flagged in known-gaps #6 until routing it is shown to load onto openness.
    if rs.get("decoration") is not None:
        tel["ts_build"] = max(tel.get("ts_build", 0.0), _clip01(0.4 + 0.5 * _clip01(float(rs["decoration"]))))

    return True



def _f5_manner(rs: dict, tel: dict) -> None:
    """F5 manner scalars → the features whose definitions actually fit, and nothing else.

    ROUTED, because the definition is identical to what the feature was anchored on:
      • thoroughness01     → persistence   (same quantity as the raft gather's thoroughness)
      • persist_after_fail → persistence   (same quantity as the raft lashing's slips)

    NOT ROUTED, carried in raw_signals for the next re-anchor's corpus and flagged (⚑13):
      • dwell_ms           re-examined and dropped. It was mapped to ts_build by analogy with
                           _EMBODIED_TS, which was wrong by the same category argument that rejects
                           cost_paid01 below: ts_build is the day-loop economy's BUILD time-share and
                           neither probe is a build. The gull's own time-share is already carried by
                           help_at_cost's ts_social; the cache has no time-share that fits.
      • cost_paid01        the vitality actually spent on a costly act. Doc-intended warmth, but
                           ts_social already carries the gull's time-share and cost-paid is a
                           different quantity from time-spent. No anchored feature means "what the
                           help cost you".
      • circled01          whether the approach circled the cache rather than going direct: the
                           looking-around tell. This is the behavioural definition of the unobserved
                           self and it is precisely the one with nowhere clean to go. Inventing a
                           loading for it would be the silent re-route rule #1 forbids.
      • dwell_at_marker_ms hesitation in the presence of the owner's mark. Closest feature is
                           decision_latency, which decision_latency_ms already carries; routing both
                           would double-count one construct.
      • approach_detour01  graded path deviation toward the probe. `approach` is the boolean the cue
                           already sets, and path_tortuosity was anchored on the P3 sampler's
                           normalized ratio, which this is not (⚑6's exact mistake).
    """
    if rs.get("thoroughness01") is not None:
        tel["persistence"] = max(tel.get("persistence", 0.0), _clip01(float(rs["thoroughness01"])))
    if rs.get("persist_after_fail") is not None:
        tel["persistence"] = max(tel.get("persistence", 0.0), _clip01(float(rs["persist_after_fail"])))
    # dwell_ms is deliberately NOT routed. It was briefly mapped to ts_build by analogy with
    # _EMBODIED_TS, and that was wrong by the same category argument used to reject cost_paid01:
    # ts_build is the time-share of the day-loop economy's BUILD axis, and neither probe is a build.
    # Freeing a bird builds nothing, and digging up someone else's food is not construction either.
    # The gull's own time-share is already carried honestly by help_at_cost's ts_social; the cache has
    # no existing time-share whose definition fits. Flagged in ⚑13 rather than parked on the nearest
    # plausible feature.


def _f4_features(action: str, take: bool, rs: dict, tel: dict) -> bool:
    """Flow 4 (repeated games and trust) cues → the features whose definitions actually fit.

    ROUTED, because the definition is the same quantity the feature was already anchored on:
      • promise_kept / promise_broken   → consistency 0.9 / 0.1. Byte-identical in shape to the
                                          return_cache / keep_cache anchor P7 set: did you do the
                                          thing the norm says, when nothing forced you to. Doing what
                                          you said you would, across real elapsed sessions, is the
                                          highest-validity integrity cue in the flow.
      • rounds_cooperated/rounds_total  → consistency, GRADED. A cooperation rate over rounds is
                                          norm-internalization at a coarser grain than one act, which
                                          is what wait_in_queue (0.85) and conform_custom (0.85)
                                          anchored. The spec's own note is load-bearing: a single
                                          defection is not a defector, so the PATTERN is the cue and
                                          a single round never sets this.
      • repair_hold01                   → persistence. Held work on a thing that resists, the same
                                          quantity the raft's lashings anchored.
      • trips                           → persistence. Going back for more is effort past the
                                          minimum, which is exactly the gather's thoroughness anchor.
      • gift_amount01                   → ts_social. NOT a new direction: the existing Channel-F
                                          give/tip/share branch already sets ts_social = amount, and
                                          a non-reciprocal gift IS that branch's construct. This is
                                          the same route reached from an embodied cue.
      • retaliate                       → risk_index, the existing dominance-driving anchor that
                                          asserts / bargain_hard / fairness_split_greedy already set.
      • withdraw                        → approach False + solitude_tol, the existing withdrawal read
                                          (cold_response_withdraw / group_avoid), an own-axis read so
                                          the K-twin never cross-loads it onto warmth.
      • forgive                         → approach True. You came close and did nothing back; the
                                          proxemic approach feature is exactly that.

    NOT ROUTED, carried in raw_signals for the second re-anchor's corpus and flagged (⚑, f4-beats.md):
      • response_to_defect01  what you did in the round AFTER they took more than their share. The
                              tit-for-tat signature, and the single most F4-specific signal there is.
                              The committed W has NO feature for it: consistency is the cooperation
                              LEVEL, not its conditional response to being wronged, and routing it
                              there would collapse a forgiving cooperator and a steadfast one into
                              the same number. This is the ⚑ case exactly and it stays unrouted.
      • settle_distance       the proxemics of a grievance. proxemics_close / proxemics_far exist as
                              F2 cues, but they were anchored at the interaction-OPEN gate, which is
                              a different quantity from where you choose to stop when you are angry.
      • return_directness01   graded path deviation on the way back. Same argument that keeps F5's
                              approach_detour01 unrouted: path_tortuosity was anchored on the P3
                              sampler's normalized ratio, which this is not (⚑6's exact mistake).
      • circled01             identical to F5's, and unrouted for the identical reason.
      • detoured_first01      how much of your own business you did first. Closest feature is a
                              ts_* time-share, but this is a FRACTION OF A DELAY, not a share of a
                              day, and no anchored feature means "you got to it eventually".
      • unprompted            arrived before the world noticed. No anchored feature means
                              self-starting; decision_latency already carries the timing itself.
      • stake_amount01        how much you put into a SHARED cache. Deliberately kept apart from
                              gift_amount01: the F7 anchor is give/tip/share, i.e. generosity with no
                              return, and a reciprocal stake in an exchange is a different construct.
      • cost_paid01           what the act cost you. Unrouted for the same reason as in F5 (⚑13).

    Returns True iff `action` is an F4 cue, so the caller skips the generic per-channel blocks and
    every prior cue keeps its exact behaviour.
    """
    if action == "promise_made":
        # Committing is not keeping. Carried by the action embedding and the generic latency block;
        # the KEEPING is what the integrity read is anchored on.
        return True

    if action in ("promise_kept", "promise_broken"):
        tel["consistency"] = 0.9 if action == "promise_kept" else 0.1
        return True

    if action in ("cooperate", "defect"):
        # The PATTERN over rounds, never a single round. rounds_* only ride the final round's event,
        # so an early defection cannot by itself make someone a defector.
        done = rs.get("rounds_total")
        if done:
            rate = _clip01(float(rs.get("rounds_cooperated", 0)) / max(1.0, float(done)))
            # interpolates between the anchors cut_queue (0.1) and conform_custom (0.85) already set
            tel["consistency"] = _clip01(0.1 + 0.75 * rate)
        if action == "defect":
            # walking off with your stake is time NOT spent on the exchange — an own-axis read
            tel["ts_leisure"] = max(tel.get("ts_leisure", 0.0), 0.4)
        return True

    if action == "repair":
        if rs.get("repair_hold01") is not None:
            tel["persistence"] = max(tel.get("persistence", 0.0), _clip01(float(rs["repair_hold01"])))
        tel["approach"] = True
        return True
    if action == "forgive":
        tel["approach"] = True
        return True
    if action == "retaliate":
        tel["risk_index"] = 0.7
        return True
    if action == "withdraw":
        tel["approach"] = False
        tel["solitude_tol"] = 0.8
        return True

    if action == "give_unreciprocated":
        amt = rs.get("gift_amount01")
        tel["ts_social"] = _clip01(float(amt)) if amt is not None else 0.6
        tel["approach"] = True
        if rs.get("trips") is not None:
            # more than one trip is effort past the minimum; one trip is just doing the thing
            tel["persistence"] = max(tel.get("persistence", 0.0),
                                     _clip01((float(rs["trips"]) - 1.0) / 3.0))
        return True
    if action == "withhold_unreciprocated":
        # came, stood there with it, left anyway. Read, never penalized: an own-axis leisure read so
        # the K-twin does not cross-load a non-gift onto warmth.
        tel["ts_leisure"] = 0.5
        return True

    return False


def _social_features(action: str, take: bool, rs: dict, tel: dict) -> bool:
    """Flow 2 dialogue + Flow 3 clearing cues (packages/shared/src/social.ts) → the EXISTING
    telemetry feature that matches each cue's signal type. Which axis each loads on stays LEARNED
    in W (cross-cutting rule #1). Returns True iff `action` is a known social cue (so the caller
    skips the generic per-channel blocks). Cues whose doc-intended axis is *openness* have no
    telemetry→openness path in the committed W and are flagged ⚑ in docs/known-gaps.md — they still
    move the posterior (via the closest signal-type feature + the action embedding), never silently
    re-routed.

    The conditional-bucket key (set later) conditions social channels on counterpart_status, so the
    courtesy gradient (warmth to a low-status server vs a high-status figure) is recoverable."""
    a = action

    # — warmth / approach-driving (approach=+1 → warmth via W) —
    if a in ("opener_warm", "cold_response_deescalate", "group_join", "include_marginal",
             "let_others_ahead", "proxemics_close", "opener_neutral", "transact_neutral"):
        tel["approach"] = True
        return True
    if a == "group_initiate":
        tel["approach"] = True
        tel["ts_social"] = 0.7              # initiating a group reads energy/sociability
        return True
    if a in ("courtesy_warm_server", "courtesy_to_high"):
        # courtesy to one who cannot repay (top individuating cue); the gradient lives in the
        # counterpart_status carried in context, not in the feature value.
        tel["ts_social"] = 0.85
        tel["approach"] = True
        return True
    if a in ("fairness_split_fair", "egg_gift_given"):
        tel["ts_social"] = 0.8
        tel["approach"] = True
        return True
    if a == "close_graceful":
        tel["approach"] = True
        tel["persistence"] = 0.5            # a clean, considerate close = conscientiousness
        return True

    # — dominance-driving (risk_index → dominance via W) —
    if a == "deviate_custom":
        tel["curiosity"] = 0.7              # doing your own thing under an audience (★ P5: → openness)
        return True
    if a in ("asserts", "interrupt", "cold_response_persist", "bargain_hard", "join_exclusion",
             "fairness_split_greedy", "close_abrupt"):
        tel["risk_index"] = 0.7
        if a in ("close_abrupt", "join_exclusion"):
            tel["approach"] = False
        return True

    # — withdrawal / low-warmth (approach=−1 → warmth−) —
    if a in ("opener_curt", "opener_silent", "curt_to_server", "cold_response_withdraw",
             "group_avoid", "ignore_marginal", "close_ghost", "proxemics_far"):
        tel["approach"] = False
        if a in ("opener_silent", "cold_response_withdraw", "group_avoid"):
            tel["solitude_tol"] = 0.8       # withdrawing reads as solitude-tolerance
        if a == "curt_to_server":
            tel["ts_social"] = 0.1
        return True

    # — norm / fairness / formality —
    if a == "wait_in_queue":
        tel["persistence"] = 0.8
        tel["consistency"] = 0.85
        return True
    if a == "cut_queue":
        tel["consistency"] = 0.1
        tel["approach"] = False
        return True
    if a == "conform_custom":
        tel["consistency"] = 0.85
        return True

    # — travel stand (the co-presence amplifier): far = novelty/risk, near = the known. openness is
    #   the doc-intended axis (⚑ routes via risk→dominance under the committed W — known-gaps). —
    if a == "travel_far":
        # Leaving the familiar for a distant shore; a BARE destination (dest_occupants=0, stamped
        # authoritatively by the server, P4/VIII.2) is the purest novelty read — a peopled one
        # shares the loading with sociality via the embedding.
        occ = rs.get("dest_occupants")
        tel["travel_novelty"] = 1.0 if (occ is not None and float(occ) == 0.0) else 0.8
        return True
    if a == "travel_near":
        tel["consistency"] = 0.7            # sticking to the known / nearby
        return True
    if a == "prepare_before_travel":
        tel["persistence"] = 0.6            # planning before the crossing
        return True

    # — food/dining stand (warmth / generosity / hosting) —
    if a == "treat_other":
        tel["ts_social"] = 0.85             # treating others vs self = generosity → warmth
        tel["approach"] = True
        return True
    if a == "host_table":
        tel["ts_social"] = 0.7              # hosting a table → warmth/energy
        tel["approach"] = True
        return True
    if a == "eat_meal":
        tel["ts_leisure"] = 0.5             # feeding yourself — low-signal self-care
        return True

    # — workplace/business stand (industriousness / time-allocation / vocation) —
    if a == "work_shift":
        tel["persistence"] = 0.8            # putting in the labour
        tel["ts_build"] = 0.6
        return True
    if a == "take_vocation":
        tel["persistence"] = 0.75           # committing to a craft → grit + a build/earn lean
        tel["ts_build"] = 0.7
        return True
    if a == "shirk_work":
        tel["ts_leisure"] = 0.6             # declining the shift = time NOT working (an own-axis read,
        return True                         # so the K-twin doesn't cross-load it onto warmth/dominance)

    # — openness-intended dialogue (⚑ no telemetry→openness path in W; carried by embedding +
    #   a mild engaged-disclosure signal). Flagged in docs/known-gaps.md. —
    if a == "asks_question":
        tel["curiosity"] = 0.55             # reaching into the other's world (★ P5: → openness)
        return True
    if a == "self_disclosure":
        tel["curiosity"] = 0.45             # opening one's own (★ P5: → openness, with a warm lean)
        tel["ts_social"] = 0.3
        return True
    if a == "group_observe":
        tel["solitude_tol"] = 0.5           # watching rather than joining
        return True

    # — P7 Stage-7 private moral probes (Channel H, privacy-conditioned cond_key) —
    #
    # F5 made these PERFORMED activities rather than two-button popups, so each now also carries the
    # MANNER of the performance in raw_signals. Only manner whose definition genuinely matches an
    # already-anchored feature is routed here; the rest is carried for the next re-anchor's corpus and
    # flagged in docs/known-gaps.md ⚑13, never attached to the nearest plausible loading. The DECISION
    # routing below is byte-unchanged from P7.
    if a == "help_at_cost":
        tel["ts_social"] = 0.85             # costly help with no witness → warmth/character
        tel["approach"] = True
        _f5_manner(rs, tel)
        return True
    if a == "pass_by":
        tel["approach"] = False             # walked past the costly good (read, never penalized)
        return True
    if a == "return_cache":
        tel["consistency"] = 0.9            # integrity unobserved → norm-internalization
        _f5_manner(rs, tel)
        return True
    if a == "keep_cache":
        # GRADED by how much was actually taken, which the embodied dig makes measurable for the first
        # time. This INTERPOLATES between the two values P7 already anchored (return 0.9 / keep 0.1)
        # rather than extending the feature past them: taking the whole cache reproduces P7's 0.1
        # exactly, and taking almost none approaches the honest end. Same feature, finer resolution.
        taken = rs.get("taken01")
        tel["consistency"] = 0.1 if taken is None else _clip01(0.1 + 0.8 * (1.0 - _clip01(float(taken))))
        _f5_manner(rs, tel)
        return True
    # Abandoning a probe mid-act is data, and reads the same way abandoning a build does: time NOT
    # spent on the act is leisure/avoidance, an own-axis read that never cross-loads onto warmth.
    if a in ("abandon_free_gull", "abandon_take_cache"):
        tel["ts_leisure"] = 0.5
        _f5_manner(rs, tel)
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

    # — Flow 0 (solitary shore) + embodied activities (F1/F4/F5/F6) + Flow 2/3 (social) cues — purely
    #   additive; when a cue is handled here we skip the generic per-channel blocks below so existing
    #   behaviour stays byte-identical. Dispatch is exclusive (first handler wins).
    flow0 = _flow0_features(action, take, rs, tel)
    embodied = (not flow0) and _embodied_features(action, take, rs, tel)
    f4 = (not flow0 and not embodied) and _f4_features(action, take, rs, tel)
    social = (not flow0 and not embodied and not f4) and _social_features(action, take, rs, tel)
    handled = flow0 or embodied or f4 or social

    # — locomotion / approach (Channel A, G1) —
    if not handled and channel in ("A", "G"):
        # approach is the engine's ±1 proximity feature; a refusal (avoid / hang back) is −1,
        # which is DISTINCT from "absent ⇒ 0" so the non-action actually moves the posterior.
        if "distance" in rs or action in ("approach", "initiate", "greet") or channel == "A":
            # boolean so persona._telemetry_features reads the sign correctly (it binarizes by
            # truthiness — a float −1.0 is truthy and was being mis-read as approach=+1).
            tel["approach"] = bool(take)
    # dwell → time-share (cue A4/A5)
    if not handled and rs.get("dwell_ms") is not None:
        key = _DWELL_TS.get(str(target.get("id", "")), None) or _DWELL_TS.get(str(target.get("kind", "")), None)
        if key:
            share = _clip01(float(rs["dwell_ms"]) / 8000.0)
            tel[key] = share if take else 0.0

    # — economic / resource (Channel F) —
    if not handled and channel == "F":
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
    if not handled and (cue.startswith("D11") or action == "pet_talk"):
        tel["pet_attach"] = _clip01(float(rs.get("amount", abs(float(rs.get("valence", 0.5))))))
    if not handled and channel in ("D", "G") and ("server" in str(target.get("kind", "")) or cue.startswith("G11")):
        # courtesy to a low-status server who cannot reciprocate (top individuating cue)
        tel["ts_social"] = 0.85 if take else 0.1

    # — normative / queue (Channel H) —
    if not handled and (cue.startswith("H1") or "queue" in action):
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
        # Catch-all: a refusal that produced NO own signal still moves the posterior as withdrawal.
        # Gated on emptiness so a handled refusal that DID set its own-axis feature (e.g. shirk_work
        # → ts_leisure, cut_queue → consistency) is NOT cross-loaded onto warmth/dominance.
        if not tel:
            tel["approach"] = False

    # conditional-bucket key: MORAL (Channel H) events condition on PRIVACY — the Ring-of-Gyges
    # axis (P7 / blueprint III.2, VIII.9): the same moral act watched vs unwatched builds two
    # separate conditional posteriors, so the public-minus-private delta (self-monitoring,
    # III.3) becomes a stored, first-class read. Social events condition on counterpart status;
    # everything else on stakes.
    if channel == "H":
        cond_key = f"privacy:{ctx['public_or_private']}"
    elif channel in _SOCIAL_CHANNELS and ctx.get("counterpart_status") not in (None, "none"):
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
