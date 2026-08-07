/**
 * Flow 5 — "Pressure & the Unobserved Self", the embodied half.
 *
 * P7 already shipped F5's MEASUREMENT half: the two Ring-of-Gyges probes as entities, the
 * public-minus-private delta, `privacy:public|private` conditioning on the conditional buckets, and a
 * BALD situation-director that picks which probe to present under which condition. None of that moves.
 *
 * What P7 shipped as the INTERACTION half was a centre-screen popup with two buttons, which is the
 * disguised multiple-choice questionnaire the project's own record rules out: every behaviour collapses
 * to "which button", and a button cannot individuate people. This module is the embodied replacement.
 * The DECISION cues are unchanged and keep their existing routing (`help_at_cost` / `pass_by`,
 * `return_cache` / `keep_cache`); what is added is the MANNER of performing them, carried in
 * `raw_signals` and sampled from the act itself.
 *
 * Two probes, each a performed activity in the shape of F1's raft build:
 *
 *   the gull   — a bird caught in your own trap line. You walk to it and HOLD to work the line. The
 *                bird struggles and the hold SLIPS, exactly as the raft's lashings do, and has to be
 *                re-taken. The release is progressive and the gull's posture opens stage by stage, so
 *                the silhouette IS the progress. Vitality drains while you work: the cost is real.
 *                You may stop at any point and walk away, leaving it partly free.
 *
 *   the cache  — a half-buried cache with SOMEONE ELSE'S mark carved into it. The mark is legible only
 *                up close, so learning whose it is happens in the body. Two physical spots, one key:
 *                hold at the MOUND to dig (progressive take, the cache visibly empties), or walk to the
 *                MARKER STONE beside it and hold there to press the mark back and cover the mound over.
 *                Doing the honest thing costs you a walk to a different place, which is the point.
 *
 * Law 2 is preserved exactly: walking past either probe emits nothing. Only an ACT is measured.
 *
 * No points, no score, no bar, no timer. See docs/world-design/f5-beats.md for the beat table and the
 * routing decisions, including which manner scalars are deliberately left unrouted and flagged.
 */
import type { EmbodiedCueDef } from "./flow1.js";

/**
 * The F5 embodied cue vocabulary. The four decision cues already exist in SOCIAL_CUES (channel H,
 * stage 7) and are re-declared here ONLY so this module can name them; their catalog entry and their
 * ingest routing are untouched. The `abandon_*` twins are new and route through the existing
 * abandon branch (time NOT spent on the act reads as leisure/avoidance, an own-axis read).
 */
export const FLOW5_CUES = {
  free_gull: {
    channel: "H", cue: "H9", action: "help_at_cost", refuseAction: "abandon_free_gull",
    targetKind: "npc",
    axisPrior:
      "costly help with no witness → ts_social/warmth (existing); persistence(grit) from the slips; " +
      "thoroughness of the release → persistence; cost_paid01 → openness/warmth ⚑ unrouted",
  },
  pass_gull: {
    channel: "H", cue: "H9", action: "pass_by",
    targetKind: "npc", axisPrior: "walked past the costly good (K-twin; read, never penalized)",
  },
  take_cache: {
    channel: "H", cue: "H2", action: "keep_cache", refuseAction: "abandon_take_cache",
    targetKind: "resource",
    axisPrior:
      "kept what wasn't theirs → consistency (existing, now graded by taken01); " +
      "circled01 / dwell_at_marker_ms → impression-management ⚑ unrouted",
  },
  cover_cache: {
    channel: "H", cue: "H2", action: "return_cache",
    targetKind: "resource", axisPrior: "honesty unobserved → consistency (existing)",
  },
} as const satisfies Record<string, EmbodiedCueDef>;

export type Flow5CueKey = keyof typeof FLOW5_CUES;

/**
 * Scene config for the two probes. Offsets are egocentric tiles from the home-island centre, the same
 * convention FLOW0_AFFORDANCES and RAFT_BUILD use, and are snapped to walkable land at placement.
 *
 * The witness spot is where the public-condition NPC stands: far enough to sit OUTSIDE the
 * `CLOSE <= 2.0` interaction gate, so they are visibly present and cannot be talked to. Being seen is
 * a fact about the situation, never a conversation.
 */
export const FLOW5_PROBES = {
  gull: {
    /** Where the tangled gull sits, on the trap line down the east shore. */
    spot: { dx: 7, dy: 5 },
    /** Hold time for a full release, in ms. Reachable in 3 to 5 holds around the slips. */
    freeMs: 9000,
    /** The release runs through this many visible stages; the gull's posture opens with each. */
    stages: 4,
    /** The line resists at these fractions of the work: the hold drops and must be re-taken. */
    slipsAt: [0.3, 0.62],
    /** Vitality drained over a full release. Real cost, felt, never shown as a number. */
    vitalityCost: 0.08,
    /** How close you must be to work the line. */
    reach: 1.6,
  },
  cache: {
    /** The mound you dig. */
    spot: { dx: -3, dy: -7 },
    /** The marker stone beside it, carrying the owner's carved mark. Walking here to cover the cache
     *  back over is what makes the honest act cost something physical. */
    markerSpot: { dx: -4.6, dy: -6.2 },
    /** Hold time to empty the mound completely, in ms. Any stopping point is a legitimate ending. */
    digMs: 6000,
    /** The mound empties through this many visible stages. */
    stages: 4,
    /** Hold time at the marker stone to press the mark back and cover the mound over. */
    coverMs: 2600,
    /** How close you must be to read the owner's mark. Learning whose it is happens in the body. */
    markReadRange: 1.2,
    reach: 1.6,
  },
  /** Where the public-condition witness stands, relative to the probe. Outside CLOSE (2.0). */
  witnessOffset: { dx: 3.4, dy: -3.4 },
  displayH: { gull: 15, cache: 16, marker: 13, witness: 24 },
  /** Only the gull's two states and the marked cache are new prop kinds. The owner's mark reuses the
   *  existing `marker_stone` (already "a weathered standing stone with a faint glyph", which is
   *  exactly what it is) and the emptied cache reuses `buried_cache`. */
  sprites: {
    gull: "proc:gull_tangled",
    gullFree: "proc:gull_free",
    cache: "proc:cache_marked",
    cacheOpen: "proc:buried_cache",
    marker: "proc:marker_stone",
  },
} as const;

/** Live state of a probe, for the HUD's whisper line and the scene's own bookkeeping. */
export interface Flow5ProbeState {
  probe: "gull" | "cache";
  phase: "idle" | "working" | "done" | "abandoned";
  /** 0..1 progress through the act (release fraction, or dig fraction). */
  progress01: number;
  slips: number;
}
