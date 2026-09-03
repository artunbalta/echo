/**
 * The action → axis map, as data (contract, plan §4 and §7). The document twin is
 * docs/world-design/action-axis-map.md, aligned by hand row for row; W5-2 adds the test that
 * keeps them in step and asserts every label here against what services/ml/echo_ml/ingest.py
 * (and the /telemetry branch of app.py) actually routes.
 *
 * Two kinds of visible consequence, kept apart on purpose (I2):
 *
 *   beat      a scripted consequence of the act itself (the seed sprouts, the cave glimmers). It
 *             fires whether or not the measurement service is up, and the inspector says so.
 *   reaction  a bounded, monotone function of ONE axis of the live posterior mean. It moves only
 *             when a real update arrived (`mocked !== true`), sits at its base value when the
 *             service is offline, and the inspector shows base, offset and result with the event
 *             and posterior version it responded to.
 *
 * A reaction is promised only where the action's ROUTED feature loads on the axis at or above
 * REACTION_LOADING_THRESHOLD; the loading quoted on the reaction is that feature's. Loadings are
 * the telemetry block of the committed W (services/ml/echo_ml/artifacts/measurement.npz), read
 * once and copied here by hand; they are the manner-driven part only. The label embedding also
 * moves the posterior on every event, which is why predicted moves come from
 * scripts/predict-sequence.py through the real engine and never from this table.
 */

import type { CueChannel, CueId, PersonaAxisKey } from "@echo/shared";

export type ReactionChannel =
  | "campfire_size"
  | "presence_distance"
  | "fog_offset"
  | "sky_saturation"
  | "homestead_tidiness";

export interface Reaction {
  axis: PersonaAxisKey;
  channel: ReactionChannel;
  /** The routed feature whose loading justifies the channel. */
  feature: string;
  /** Learned loading of that feature on the axis. Must clear REACTION_LOADING_THRESHOLD. */
  loading: number;
  /** |μ| below this is treated as no signal; the channel stays at base. */
  deadBand: number;
  /** Channel multiplier at μ = -1 and μ = +1; base is 1 at μ = 0. Monotone between. */
  range: [number, number];
}

export interface ActionRow {
  /** The label ingest.py routes, or the TelemetryType for the /telemetry path. */
  action: string;
  cue: CueId;
  channel: CueChannel;
  /** "behavioral" = BehavioralEvent via /api/observe/behavioral; "telemetry" = TelemetryEvent via /api/telemetry. */
  route: "behavioral" | "telemetry";
  input: string;
  rawSignals: readonly string[];
  /** Telemetry features ingest.py sets from those signals. */
  features: readonly string[];
  /** Learned loadings of those features, per axis, from measurement.npz (largest per axis). */
  loadings: Partial<Record<PersonaAxisKey, number>>;
  beat: string | null;
  reaction: Reaction | null;
  /** Why a channel is NOT promised, when the doc might expect one. */
  unrouted?: string;
}

/** A reaction channel needs a routed feature whose learned loading on its axis is at least this. */
export const REACTION_LOADING_THRESHOLD = 0.15;

const CAVE_REACTION: Reaction = { axis: "dominance", channel: "campfire_size", feature: "risk_index", loading: 0.41, deadBand: 0.05, range: [0.6, 1.8] };

export const ACTION_AXIS_MAP: readonly ActionRow[] = [
  {
    action: "enter_cave",
    cue: "F3",
    channel: "F",
    route: "behavioral",
    input: "walk into the cave mouth",
    rawSignals: ["risk01", "decision_latency_ms"],
    features: ["risk_index", "decision_latency"],
    loadings: { dominance: 0.41, warmth: -0.18, energy: 0.15 },
    beat: "the cave's glimmer brightens",
    reaction: CAVE_REACTION,
  },
  {
    action: "stay_safe",
    cue: "F3",
    channel: "F",
    route: "behavioral",
    input: "linger 700 ms at the threshold and leave",
    rawSignals: ["risk01", "decision_latency_ms"],
    features: ["risk_index", "decision_latency"],
    loadings: { dominance: 0.41, warmth: -0.18, energy: 0.15 },
    beat: null,
    reaction: CAVE_REACTION,
  },
  {
    action: "plant_seed",
    cue: "F1",
    channel: "F",
    route: "behavioral",
    input: "E at the fertile patch",
    rawSignals: ["delayed", "decision_latency_ms"],
    features: ["save_rate", "decision_latency"],
    loadings: { pace: -0.1, openness: -0.12, formality: 0.02 },
    beat: "the seed sprouts",
    reaction: null,
    unrouted: "save_rate loads formality at 0.016 and nothing else above threshold; no channel is promised (F12)",
  },
  {
    action: "eat_now",
    cue: "F1",
    channel: "F",
    route: "behavioral",
    input: "E at the berry bush",
    rawSignals: ["delayed", "decision_latency_ms"],
    features: ["save_rate", "decision_latency"],
    loadings: { pace: -0.1, openness: -0.12 },
    beat: "the bush thins",
    reaction: null,
    unrouted: "as plant_seed",
  },
  {
    action: "study_marker",
    cue: "A4",
    channel: "A",
    route: "behavioral",
    input: "dwell at the stone",
    rawSignals: ["dwell_ms"],
    features: ["ts_learn"],
    loadings: { intellect: 0.035 },
    beat: "the glyph reveals with dwell",
    reaction: null,
    unrouted: "ts_learn loads intellect at 0.035; intellect has no honest world channel, inspector only",
  },
  {
    action: "dig_cache",
    cue: "C7",
    channel: "C",
    route: "behavioral",
    input: "hold E through two slips",
    rawSignals: ["persist_after_fail", "dwell_ms"],
    features: ["persistence", "ts_build"],
    loadings: { formality: 0.28, energy: 0.15 },
    beat: "the cache opens",
    reaction: { axis: "formality", channel: "homestead_tidiness", feature: "persistence", loading: 0.28, deadBand: 0.05, range: [0.5, 1.5] },
  },
  {
    action: "sit_still",
    cue: "A4",
    channel: "A",
    route: "behavioral",
    input: "stand still 8 s at the marker stone",
    rawSignals: ["still_ms"],
    features: ["solitude_tol"],
    loadings: { affect: 0.23, warmth: -0.16, energy: -0.14 },
    beat: "the shy creature appears (a beat: it fires with ML down)",
    reaction: { axis: "affect", channel: "sky_saturation", feature: "solitude_tol", loading: 0.23, deadBand: 0.05, range: [0.7, 1.3] },
  },
  {
    action: "help_at_cost",
    cue: "H9",
    channel: "H",
    route: "behavioral",
    input: "free the gull under the witness",
    rawSignals: ["thoroughness01", "persist_after_fail", "dwell_ms", "cost_paid01"],
    features: ["ts_social", "approach", "persistence"],
    loadings: { warmth: 0.7, affect: -0.5, formality: 0.28 },
    beat: "the gull flies",
    reaction: { axis: "warmth", channel: "presence_distance", feature: "approach", loading: 0.7, deadBand: 0.05, range: [1.6, 0.4] },
  },
  {
    action: "abandon_free_gull",
    cue: "H9",
    channel: "H",
    route: "behavioral",
    input: "leave the gull",
    rawSignals: ["thoroughness01", "dwell_ms"],
    features: ["ts_leisure"],
    loadings: { warmth: -0.025 },
    beat: null,
    reaction: null,
    unrouted: "ts_leisure loads warmth at -0.025; the refusal moves nothing above threshold, so no channel is promised",
  },
  {
    action: "passive_locomotion",
    cue: "A9",
    channel: "A",
    route: "telemetry",
    input: "how you walk",
    rawSignals: ["novel_tile_ratio", "path_tortuosity", "heading_change_rate", "backtrack_rate", "dwell_ms", "tiles"],
    features: ["novel_tile_ratio", "path_tortuosity"],
    loadings: { openness: 0.47, affect: 0.34 },
    beat: null,
    reaction: { axis: "openness", channel: "fog_offset", feature: "path_tortuosity", loading: 0.47, deadBand: 0.05, range: [0.75, 1.25] },
  },
];

/**
 * The reaction channels, derived from the rows: a channel exists only where an emitter with a
 * qualifying loading exists. Pace (latency_norm +.87) and energy (nothing above .15) have no
 * emitter on the new host and therefore no channel; they are read in the inspector only.
 */
export const REACTION_CHANNELS: ReadonlyArray<{ axis: PersonaAxisKey; channel: ReactionChannel; feature: string; loading: number }> = (() => {
  const seen = new Map<ReactionChannel, { axis: PersonaAxisKey; channel: ReactionChannel; feature: string; loading: number }>();
  for (const row of ACTION_AXIS_MAP) {
    if (!row.reaction) continue;
    if (row.reaction.loading < REACTION_LOADING_THRESHOLD) throw new Error(`${row.action}: reaction loading below threshold`);
    if (!seen.has(row.reaction.channel)) {
      seen.set(row.reaction.channel, { axis: row.reaction.axis, channel: row.reaction.channel, feature: row.reaction.feature, loading: row.reaction.loading });
    }
  }
  return [...seen.values()];
})();

/** The definition-of-done channel: never touched by the day cycle, so attribution is clean. */
export const DOD_CHANNEL: ReactionChannel = "campfire_size";

/** Section A: the vertical slice wires this one reaction and nothing else. */
export const SLICE_REACTION: Reaction = CAVE_REACTION;

/** Channel multiplier for a posterior mean on the reaction's axis. Monotone, dead-banded, bounded. */
export function reactionValue(r: Reaction, mu: number): number {
  const m = Math.max(-1, Math.min(1, mu));
  if (Math.abs(m) < r.deadBand) return 1;
  const [lo, hi] = r.range;
  return m < 0 ? 1 + (1 - lo) * m : 1 + (hi - 1) * m;
}
