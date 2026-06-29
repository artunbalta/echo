/**
 * FLOW 0 — "Waking Alone" (the solitary shore). The data-driven emit contract for the first
 * flow of ECHO_level_design_7flows.md: the pre-social baseline read at maximum validity.
 *
 * This is the single source of truth the client scene (Flow0Client) and the headless evidence
 * walkthrough (services/ml/scripts/flow0_walkthrough.py) both follow, so the playable beats and
 * the proven posterior movement can never drift apart. Every affordance emits a real
 * BehavioralEvent to /observe/behavioral on USE and — when the player leaves a region without
 * acting — its REFUSE/IGNORE twin (non-action is data). Context is the mandatory F0 envelope.
 *
 * Per cross-cutting rule #1, the cue→axis lines below are PRIORS (what the doc hypothesizes the
 * cue measures); the axis a cue actually moves is learned in W. They live here as documentation
 * and as the label the dusk read can cite.
 */
import type {
  BehavioralEvent,
  EventContext,
  CueChannel,
  CueId,
  TargetKind,
  RawSignals,
  ActionPolarity,
} from "./telemetry.js";

/** The mandatory Flow-0 context (the doc's `{stage:F0, audience:none, stakes:none, public:false}`,
 *  mapped to the 8-field envelope; stakes "none" → the baseline "low"). */
export const FLOW0_CONTEXT: EventContext = {
  stakes: "low",
  audience_size: 0,
  public_or_private: "private",
  counterpart_status: "none",
  stage: 0,
  scarcity_level: 0,
  mood_proxy: 0,
  time_pressure: 0,
};

export interface Flow0Affordance {
  /** Station / object id placed in the scene. */
  id: string;
  /** Human label shown in the diegetic proximity prompt. */
  label: string;
  /** Region key for the F0→F1 `visited_regions ≥ 2` transition trigger. */
  region: "shore" | "east" | "west" | "hill" | "tidepool";
  /** Where it sits, as a tile offset from the home-island centre (egocentric layout). */
  dx: number;
  dy: number;
  /** Procedural sprite kind ("proc:<kind>"); Higgsfield art overrides via artDir (Step 6). */
  sprite: string;
  channel: CueChannel;
  cue: CueId;
  /** The USE action label — MUST match ingest's Flow-0 map + the walkthrough. */
  action: string;
  /** The REFUSE/IGNORE twin emitted when the player leaves F0 without acting on this. */
  refuseAction?: string;
  targetKind: TargetKind;
  /** Default implicit signals for the USE event. */
  raw?: RawSignals;
  /** Design-doc cue→axis PRIOR (documentation; the real loading is learned in W). */
  axisPrior: string;
  /** Real-world analog (≈) from the doc. */
  analog: string;
}

/**
 * The F0 objects and their exact readings (ECHO_level_design_7flows.md §FLOW 0 layout table).
 * Spawn (first_move) is handled separately — it is the very first input, not an object.
 */
export const FLOW0_AFFORDANCES: Flow0Affordance[] = [
  {
    id: "east_path", label: "a worn path east, into the trees", region: "east",
    dx: 6, dy: 0, sprite: "proc:path_marker", channel: "B", cue: "B6",
    action: "take_marked_path", refuseAction: "skip_marked_path", targetKind: "place",
    axisPrior: "openness(−,LOW) — obvious ⇒ weak signal", analog: "takes the paved road",
  },
  {
    id: "thicket", label: "an unmarked thicket west, no path through", region: "west",
    dx: -6, dy: 1, sprite: "proc:thicket", channel: "B", cue: "B7",
    action: "enter_unmarked", refuseAction: "avoid_unmarked", targetKind: "place",
    axisPrior: "openness(+,HIGH) — costly + free", analog: "wanders off-trail out of curiosity",
  },
  {
    id: "hill", label: "a climbable hill, back from the shore", region: "hill",
    dx: 0, dy: -6, sprite: "proc:hill", channel: "B", cue: "B8",
    action: "climb_hill", refuseAction: "skip_hill", targetKind: "place",
    axisPrior: "openness(+); persist→affect/energy(HIGH)", analog: "bothers to climb just to see",
  },
  {
    id: "tidepool", label: "a still tide pool", region: "tidepool",
    dx: 3, dy: -5, sprite: "proc:tidepool", channel: "A", cue: "A4",
    action: "gaze_reflection", refuseAction: "ignore_reflection", targetKind: "place",
    raw: { dwell_ms: 3500 }, axisPrior: "affect/self-focus(MED)", analog: "lingers at their own reflection",
  },
  {
    id: "scatter", label: "five things strewn on the sand", region: "shore",
    dx: 2, dy: 3, sprite: "proc:shell", channel: "B", cue: "B3",
    action: "stack_tidy", refuseAction: "ignore_all", targetKind: "resource",
    axisPrior: "conscientiousness→formality(+,MED)", analog: "tidies the space vs leaves it",
  },
  {
    id: "driftwood", label: "one piece of driftwood, far down the west shore", region: "west",
    dx: -10, dy: 4, sprite: "proc:driftwood", channel: "A", cue: "A12",
    action: "approach_distant_lone", refuseAction: "ignore_distant_lone", targetKind: "resource",
    raw: { distance: 9 }, axisPrior: "openness(+) + mild risk", analog: "goes to the one odd far thing",
  },
];

/** The first-input cue (the WASD glyph fades by t=5.5; time-to-first-move is the clean tempo read). */
export const FLOW0_FIRST_MOVE = {
  channel: "C" as CueChannel,
  cue: "C1" as CueId,
  action: "first_move",
  axisPrior: "pace(±,HIGH), energy(±,MED)",
  analog: "dropped somewhere new — freeze and scan, or move?",
};

export interface Flow0Egg {
  id: string;
  channel: CueChannel;
  cue: CueId;
  action: string;
  axisPrior: string;
  /** What it is, diegetically. */
  note: string;
}

/** The three easter eggs — curiosity is itself the measurement (real openness/affect cues). */
export const FLOW0_EGGS: Flow0Egg[] = [
  { id: "egg_horizon", channel: "B", cue: "B9", action: "egg_horizon_seen",
    axisPrior: "openness(+)", note: "from the hilltop, the silhouette of another island — the seed of Flow 2" },
  { id: "egg_reflection", channel: "B", cue: "J2", action: "egg_reflection",
    axisPrior: "affect/self-awareness", note: "gaze ≥3s and the reflection holds a different posture for a frame" },
  { id: "egg_hollow", channel: "B", cue: "B9", action: "egg_hollow",
    axisPrior: "openness(+,HIGH) — zero extrinsic reward", note: "a tiny carved mark hidden in the thicket" },
];

/** F0 → F1 transition trigger (affordance-seepage, no wall, no "Level 1"). */
export const FLOW0_TO_FLOW1 = {
  minVisitedRegions: 2,
  maxElapsedMs: 210_000,
};

/** Build one Flow-0 BehavioralEvent envelope (the mandatory F0 context is always attached). */
export function buildFlow0Event(opts: {
  actorId: string;
  sessionId: string;
  channel: CueChannel;
  cue: CueId;
  action: string;
  polarity?: ActionPolarity;
  targetId?: string;
  targetKind?: TargetKind;
  raw?: RawSignals;
  contextOverride?: Partial<EventContext>;
}): BehavioralEvent {
  const polarity = opts.polarity ?? "take";
  return {
    actor_id: opts.actorId,
    sessionId: opts.sessionId,
    t: Date.now(),
    type: "choice_made", // coarse legacy routing type; the channel/cue/action carry the real signal
    channel: opts.channel,
    cue: opts.cue,
    action: opts.action,
    polarity,
    target: { id: opts.targetId ?? opts.action, kind: opts.targetKind ?? "place", status: "none" },
    context: { ...FLOW0_CONTEXT, ...(opts.contextOverride ?? {}) },
    raw_signals: opts.raw ?? {},
    payload: {},
    provenance: "live",
  };
}
