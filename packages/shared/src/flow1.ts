/**
 * FLOW 1 — "Scarcity, Learning, Solving" (still alone), as EMBODIED animated activities
 * (ECHO_level_design_7flows.md §FLOW 1). This is the data-driven contract for the embodied rebuild:
 * an interaction is a *performed activity* (walk, gather, assemble, launch, plant, dig, study), and
 * the measurement is extracted from the **manner** of the performance — thoroughness, deliberation,
 * persistence-after-failure, decorative flourish — carried as CONTINUOUS `raw_signals` scalars, not
 * from a single button press. Two people building the same raft in different styles emit different
 * scalars → different φ → measurably different posteriors (the individuation the menu model threw away).
 *
 * This is the single source of truth the client scene (WorldClient / the F1 activity runner) and the
 * headless evidence walkthrough (services/ml/scripts/flow1_embodied_walkthrough.py) both follow, so the
 * playable beats and the proven posterior movement can never drift apart.
 *
 * Per cross-cutting rule #1 the cue→axis lines are PRIORS (learned in W). Cues whose doc-intended axis
 * is *openness* (decoration, explore-ratio, heading-variance) have no telemetry→openness path in the
 * committed W — they are carried honestly on the nearest own-axis feature or captured-unrouted, flagged
 * ⚑ in docs/known-gaps.md (#2, #6), NEVER silently re-routed.
 */
import type {
  BehavioralEvent,
  EventContext,
  CueChannel,
  CueId,
  TargetKind,
  RawSignals,
  ActionPolarity,
  Stakes,
} from "./telemetry.js";

/** The solitary Flow-1 context (own island, no audience). The doc's high-validity *costly* choices are
 *  still uncontaminated by an audience; stakes vary per activity (gather low, gamble high, build medium). */
export const FLOW1_CONTEXT: EventContext = {
  stakes: "low",
  audience_size: 0,
  public_or_private: "private",
  counterpart_status: "none",
  stage: 1,
  scarcity_level: 0.15, // resource trickles in — a gentle scarcity, not famine
  mood_proxy: 0,
  time_pressure: 0,
};

/** A single embodied-activity cue: the semantic action + its channel/cue + the doc-intended axis prior. */
export interface EmbodiedCueDef {
  channel: CueChannel;
  cue: CueId;
  action: string;
  /** The abandon/refuse twin emitted if the player walks away mid-activity (non-action is data). */
  refuseAction?: string;
  targetKind: TargetKind;
  /** Design-doc cue→axis PRIOR (documentation; the real loading is learned in W). ⚑ = no W path yet. */
  axisPrior: string;
}

/**
 * The manner scalars the client derives from an actual performance and hands to the engine via
 * raw_signals. Every field is optional — an activity reports whichever ones its performance produced.
 * These map onto the EXISTING 16 telemetry features (continuously) in ingest._embodied_features.
 */
export interface EmbodiedManner {
  /** gather/build thoroughness, just-enough(0) ↔ obsessive(1) → persistence. */
  thoroughness01?: number;
  /** retried after a slip/failure → persistence (grit, HIGH validity). */
  persist_after_fail?: number;
  /** ms deliberated before/within the commitment → decision_latency (pace). */
  decision_latency_ms?: number;
  /** redo / re-tidy count → editsCount (formality / self-monitoring). */
  edits?: number;
  /** total ms the activity took → its time-share feature (ts_build/ts_earn/ts_learn). */
  dwell_ms?: number;
  /** ms held still & quiet → solitude_tol (calm; the shy-creature beat). */
  still_ms?: number;
  /** off-trail / dark-cave / threshold cost, 0..1 → risk_index (dominance). */
  risk01?: number;
  /** invest/plant (delayed payoff) vs consume now → save_rate (time-discounting → pace). */
  delayed?: boolean;
  /** ⚑ decorative flourish (doc: openness) — carried as ts_build until the W re-anchor. */
  decoration?: number;
  /** ⚑ explore-new vs revisit-known while gathering (BALD signal; doc: openness) — captured, unrouted. */
  explore_ratio?: number;
}

/** The Flow-1 embodied cue vocabulary (mirrors ingest._EMBODIED_CUES). */
export const FLOW1_CUES = {
  // ── the flagship: the raft build (gather → assemble → launch = the F1→F2 seam) ──
  gather_driftwood: {
    channel: "F", cue: "F2", action: "gather_driftwood", refuseAction: "abandon_gather",
    targetKind: "resource", axisPrior: "thoroughness→persistence(conscientiousness/energy); explore-ratio→openness ⚑",
  },
  assemble_raft: {
    channel: "C", cue: "C7", action: "assemble_raft", refuseAction: "abandon_build",
    targetKind: "structure", axisPrior: "persistence(grit)→affect/energy; edits→formality; deliberation→pace; decoration→openness ⚑",
  },
  launch_raft: {
    channel: "C", cue: "C7", action: "launch_raft",
    targetKind: "structure", axisPrior: "commitment latency→pace; the F1→F2 crossing decision",
  },
  // ── the rest of F1 (wired in the F1 sub-slice; the same manner→feature mapping already handles them) ──
  plant_seed: { channel: "F", cue: "F1", action: "plant_seed", targetKind: "resource", axisPrior: "patience/time-discounting→save_rate→pace(−)" },
  eat_now: { channel: "F", cue: "F1", action: "eat_now", targetKind: "resource", axisPrior: "high time-discounting→save_rate low" },
  enter_cave: { channel: "F", cue: "F3", action: "enter_cave", targetKind: "place", axisPrior: "risk-seeking→risk_index→dominance" },
  stay_safe: { channel: "F", cue: "F3", action: "stay_safe", targetKind: "place", axisPrior: "risk-averse" },
  study_marker: { channel: "A", cue: "A4", action: "study_marker", targetKind: "station", axisPrior: "non-instrumental knowledge dwell→ts_learn→intellect/openness" },
  dig_cache: { channel: "C", cue: "C7", action: "dig_cache", refuseAction: "abandon_build", targetKind: "structure", axisPrior: "persist-after-fail→persistence(grit)→affect/energy + intellect" },
  sit_still: { channel: "A", cue: "A4", action: "sit_still", targetKind: "self", axisPrior: "stillness→solitude_tol (calm; low-energy coverage)" },
} as const satisfies Record<string, EmbodiedCueDef>;

export type Flow1CueKey = keyof typeof FLOW1_CUES;

/**
 * Scene config for the embodied raft build. Positions are egocentric tile offsets from the home-island
 * centre (like FLOW0_AFFORDANCES). The client places `driftwoodCount` pieces along the shore; the player
 * walks to and gathers them (their path + how many they take = the gather manner), assembles at the
 * `assemblySpot`, then pushes off from `launchSpot` (which unlocks sailing — the F1→F2 seam).
 */
export const RAFT_BUILD = {
  /** How many driftwood pieces lie on the shore. `needed` are required to build; every piece gathered
   *  BEYOND `needed` is the thoroughness/openness cue (a thorough player over-gathers; a hasty one grabs
   *  the minimum) — carried as thoroughness01 = gathered/driftwoodCount through the ingress. */
  driftwoodCount: 8,
  needed: 5,
  /** Egocentric offsets for the driftwood scatter (down the west/south shore). Each is snapped to the
   *  nearest walkable land tile at placement time so none land in water / unreachable (Flow1Client). */
  driftwoodOffsets: [
    { dx: -3, dy: 3 }, { dx: -5, dy: 4 }, { dx: -7, dy: 3 }, { dx: -9, dy: 4 },
    { dx: -4, dy: 5 }, { dx: -6, dy: 6 }, { dx: -8, dy: 5 }, { dx: -2, dy: 6 },
  ],
  /** Where the raft is assembled (near the shore). */
  assemblySpot: { dx: -4, dy: 6 },
  /** Where the finished raft is pushed into the water (the crossing point, at the shore's edge). */
  launchSpot: { dx: -4, dy: 8 },
  /** Rendered heights (source px, avatar ≈ 24) so props read at gatherable scale, not their native PNG size. */
  displayH: { driftwood: 17, raft: 26 },
  /** The prop kind for each state (rendered via proc:<kind> → PROP_ASSETS PNG, procedural fallback). */
  sprites: { driftwood: "proc:driftwood", raft: "proc:raft" },
} as const;

/** F1 → F2 transition (affordance-seepage). Launching the raft makes the sea crossable. */
export const FLOW1_TO_FLOW2 = {
  /** Building the raft (reaching `needed`) is enough to seep; launching it starts the crossing. */
  minDriftwood: RAFT_BUILD.needed,
};

/**
 * Build one solo Flow-1 embodied BehavioralEvent. Stamps the mandatory FLOW1_CONTEXT (own island,
 * audience 0, private, no counterpart), overridable per activity (e.g. the gamble cave raises stakes).
 * The manner scalars ride in `raw_signals`; ingest._embodied_features maps them onto the 16 features.
 */
export function buildFlow1Event(opts: {
  actorId: string;
  sessionId: string;
  channel: CueChannel;
  cue: CueId;
  action: string;
  polarity?: ActionPolarity;
  targetId?: string;
  targetKind?: TargetKind;
  raw?: RawSignals & EmbodiedManner;
  stakes?: Stakes;
  contextOverride?: Partial<EventContext>;
}): BehavioralEvent {
  return {
    actor_id: opts.actorId,
    sessionId: opts.sessionId,
    t: Date.now(),
    type: "structure_progress", // coarse legacy routing type; channel/cue/action carry the real signal
    channel: opts.channel,
    cue: opts.cue,
    action: opts.action,
    polarity: opts.polarity ?? "take",
    target: { id: opts.targetId ?? opts.action, kind: opts.targetKind ?? "structure", status: "none" },
    context: { ...FLOW1_CONTEXT, ...(opts.stakes ? { stakes: opts.stakes } : {}), ...(opts.contextOverride ?? {}) },
    raw_signals: (opts.raw ?? {}) as RawSignals,
    payload: {},
    provenance: "live",
  };
}

/** The continuous passive-sampler cue (the debounced ~1.5s movement aggregate; known-gaps #2).
 *  still_ms → solitude_tol; heading_var/speed_var/explore_ratio captured-but-unrouted until the re-anchor. */
export const MOVEMENT_SAMPLE = {
  channel: "A" as CueChannel,
  cue: "A6" as CueId,
  action: "movement_sample",
  axisPrior: "still_ms→solitude_tol; heading/speed/explore ⚑ captured for the W re-anchor",
};
