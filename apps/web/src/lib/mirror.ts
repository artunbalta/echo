/**
 * The mirror (DECISIONS C61): how the echo sees a person, and what it saw that made it so. Pure, and
 * shared: the mirror route computes it, the panel draws it, the tests pin it.
 *
 * THE ACCOUNT ADDS UP. The engine reports every update's own move on each axis (services/ml, the C61
 * fields), and `echo_ledger` keeps them. The prior is zero, so where the echo puts a person now is
 * exactly the sum of every move it ever made. The mirror itemises the moves it has on record and
 * shows the rest as one line, "not in this record", rather than leaving it out:
 *
 * - updates from before the record began, or that aged off its 90-day clock;
 * - updates that reached the engine by a route that records nothing (`missing` counts them, from the
 *   versions: each update moves the version by one, so a jump is a count);
 * - and nothing else. `recorded + notInRecord = now`, on every axis, by construction.
 *
 * WHEN THE ENGINE STARTED OVER. An engine that keeps nothing between restarts begins again at the
 * prior, version 0, and everything recorded before that no longer counts towards anything. A row
 * whose version runs backwards marks that. So that two requests finishing out of order are not
 * mistaken for it, a backwards step only counts as a restart when it is large (more than
 * `MIRROR.restartGap` updates) or comes after a quiet minute.
 *
 * NOT A SCORE (Design Law 1). It shows where between two words the echo puts a person, how sure it
 * is, and what moved it, with sizes said in words. Nothing goes up for doing more.
 */
import { AXIS_POLES, PERSONA_AXIS_KEYS, type PersonaAxisKey } from "@echo/shared";

export type LedgerKind = "act" | "choice" | "sense" | "walk";

/** One row of `echo_ledger`: one update (or, for walking, several folded together) and its move. */
export interface LedgerRow {
  id: number;
  /** ISO time it was recorded; a folded walk row carries its last window's. */
  at: string;
  kind: LedgerKind;
  action: string;
  cue: string | null;
  polarity: "take" | "refuse" | null;
  cond_key: string | null;
  /** What the engine read the act as: its features, by name. */
  read_as: Record<string, unknown> | null;
  /** Posterior mean after minus before, per axis, in `PERSONA_AXIS_KEYS` order. */
  delta: number[];
  /** The posterior's version before and after. */
  v0: number;
  v1: number;
  /** Walking windows folded into this row; 1 for anything else. */
  windows: number;
}

/** The engine's current read of the person, from `GET /persona`. */
export interface EchoNow {
  mu: number[];
  var: number[];
  version: number;
  /** Public minus private conditional means, per axis, when the engine has both. */
  watched?: number[] | null;
  /** Per axis, the features that load on it most, from the learned measurement matrix. */
  measurement?: Record<string, { feature: string; loading: number }[]> | null;
}

export const MIRROR = {
  /** At or under this variance the engine would put a word to an axis (persona.py `decode_traits`). */
  sureVar: 0.6,
  /** A lean, and a strong one (shared `describeAxes`). */
  leanAt: 0.33,
  strongAt: 0.66,
  /** Moves smaller than this are not drawn as anything. */
  noticed: 0.005,
  /** A backwards step in versions bigger than this is a restart, however soon it came. */
  restartGap: 20,
  /** A backwards step after this long a quiet is a restart, however small. */
  quietMs: 60_000,
  /** Rows in the timeline, and contributors shown per axis. */
  timeline: 60,
  perAxis: 6,
  /** "When others can see you" is said only for a difference at least this big. */
  watchedAt: 0.1,
} as const;

export type HowMuch = "barely" | "a little" | "noticeably" | "a lot";

/** A move's size, in words. */
export function howMuch(a: number): HowMuch {
  const x = Math.abs(a);
  return x < 0.01 ? "barely" : x < 0.04 ? "a little" : x < 0.12 ? "noticeably" : "a lot";
}

/** The pole a move pushes towards. */
export function towards(axis: PersonaAxisKey, a: number): string {
  return AXIS_POLES[axis][a > 0 ? 1 : 0];
}

// ── what acts are called ────────────────────────────────────────────────────────

/** What a person did, as they would say it: the phrase for taking it up, and for turning it down. */
const ACT_WORDS: Record<string, readonly [string, string?]> = {
  abandon_build: ["Left a build unfinished"],
  abandon_free_gull: ["Walked away from the caught gull"],
  abandon_gather: ["Stopped gathering half-way"],
  abandon_take_cache: ["Began to take from a found pouch, and stopped"],
  ask_return: ["Asked for something back"],
  asks_question: ["Asked a villager a question"],
  assemble_raft: ["Built a raft"],
  asserts: ["Spoke up for yourself"],
  back_off_door: ["Backed off from a door"],
  bargain_hard: ["Drove a hard bargain"],
  barter: ["Traded with a villager", "Turned down a trade"],
  build_home: ["Worked on your house"],
  chase_animals: ["Chased the animals"],
  climb_hill: ["Climbed", "Did not climb"],
  climb_persist: ["Kept climbing after a fall"],
  close_abrupt: ["Ended a conversation abruptly"],
  close_graceful: ["Took your leave politely"],
  cold_response_deescalate: ["Answered coldness gently"],
  cold_response_persist: ["Kept at it when met coldly"],
  cold_response_withdraw: ["Withdrew when met coldly"],
  collect: ["Picked things up"],
  conform_custom: ["Followed the local custom"],
  courtesy_to_high: ["Was courteous to someone above you"],
  courtesy_warm_server: ["Was warm to someone serving you"],
  curt_to_server: ["Was curt to someone serving you"],
  customize_home: ["Painted your house"],
  customize_self: ["Dyed your clothes"],
  cut_queue: ["Cut in line"],
  deviate_custom: ["Went against the local custom"],
  dig_cache: ["Dug up a cache"],
  draw_in_sand: ["Drew in the sand"],
  drink_water: ["Drank from the water"],
  drop_pebble: ["Dropped a pebble in"],
  eat_meal: ["Ate a meal"],
  egg_hollow: ["Went to look at a carved mark", "Walked past a carved mark"],
  eat_now: ["Ate it there and then", "Did not eat it"],
  enter_cave: ["Went into a cave", "Stayed out of a cave"],
  enter_forced: ["Forced your way in"],
  enter_invited: ["Went in when asked"],
  explore_house: ["Looked around someone's house"],
  fairness_split_fair: ["Split it fairly"],
  fairness_split_greedy: ["Kept the bigger share"],
  feed_hens: ["Fed the hens"],
  fish_from_dock: ["Fished from the dock"],
  force_door: ["Forced a door"],
  gather_driftwood: ["Gathered driftwood"],
  give_gift: ["Gave a gift"],
  group_avoid: ["Kept away from a group"],
  group_initiate: ["Started a group talking"],
  group_join: ["Joined a group"],
  group_observe: ["Watched a group from the side"],
  help_at_cost: ["Helped at a cost to yourself", "Did not help"],
  host_table: ["Hosted at your table"],
  ignore_all: ["Ignored everyone"],
  ignore_marginal: ["Left someone out"],
  ignores_pet: ["Ignored an animal"],
  include_marginal: ["Brought someone in"],
  initiate: ["Spoke to a villager first"],
  interrupt: ["Interrupted"],
  join_exclusion: ["Joined in leaving someone out"],
  knock_door: ["Knocked at a door"],
  let_others_ahead: ["Let others go first"],
  lift_furnishing: ["Picked something up in your house"],
  mourns: ["Mourned with a village"],
  opener_curt: ["Opened curtly"],
  opener_neutral: ["Opened plainly"],
  opener_silent: ["Said nothing to open"],
  opener_warm: ["Opened warmly"],
  pass_by: ["Walked on by"],
  pay_respects: ["Paid your respects at a grave"],
  peer_in_window: ["Looked in at a window"],
  place_loose: ["Set something down as it fell"],
  place_square: ["Set something down square"],
  plant_seed: ["Planted a seed"],
  play_snow: ["Played in the snow"],
  prepare_before_travel: ["Prepared before setting out", "Set out unprepared"],
  push_through: ["Pushed through the undergrowth"],
  return_boat: ["Brought a boat back"],
  return_cache: ["Left a found pouch for its owner"],
  keep_cache: ["Kept what was in a found pouch"],
  save_berries: ["Kept the berries for later", "Did not keep them"],
  self_disclosure: ["Told a villager about yourself"],
  shirk_work: ["Shirked the work"],
  shoo_pet: ["Shooed an animal off"],
  sit_still: ["Sat still a while"],
  skip_stone: ["Skipped a stone"],
  stack_tidy: ["Arranged your room in order", "Left your room as things fell"],
  stake_home: ["Marked out a house"],
  stay_safe: ["Stayed on the safe side"],
  study_marker: ["Looked closely at something"],
  take_boat: ["Took a boat that was not yours"],
  take_crop: ["Took from someone's field"],
  take_ore: ["Took ore from the mine"],
  take_vocation: ["Took up a trade"],
  touch_novel: ["Touched something new"],
  trample_crop: ["Trampled a crop"],
  transact_neutral: ["Traded plainly"],
  travel_far: ["Sailed far"],
  travel_near: ["Sailed to a near shore"],
  treat_other: ["Treated someone"],
  turn_furnishing: ["Turned something in your house"],
  wade_in: ["Waded in"],
  wait_in_queue: ["Waited your turn"],
  walk_over_grave: ["Walked over a grave"],
  warm_to_pet: ["Made friends with an animal", "Kept an animal at arm's length"],
  work_shift: ["Worked a shift"],
  // The implicit signals the /telemetry route carries, by type.
  passive_locomotion: ["Walking about"],
  approach: ["Went up to someone"],
  avoid: ["Kept away from someone"],
  dwell: ["Lingered near someone"],
  pet_talk: ["Talked to an animal"],
  leave_intent: ["Thought about leaving"],
  reply_latency: ["Took your time to answer"],
  choice_made: ["Made a choice"],
  fork_decision: ["Made a choice"],
  allocation: ["Shared out your time"],
  resource_bet: ["Took a gamble"],
  structure_progress: ["Built something"],
};

/** A row's act in words. Unknown labels are said as they are, without the underscores. */
export function actWords(action: string, polarity: "take" | "refuse" | null): string {
  const w = ACT_WORDS[action];
  if (!w) {
    const plain = action.replace(/_/g, " ");
    return polarity === "refuse" ? `Turned down: ${plain}` : plain[0]!.toUpperCase() + plain.slice(1);
  }
  if (polarity === "refuse") return w[1] ?? `Turned down: ${w[0][0]!.toLowerCase()}${w[0].slice(1)}`;
  return w[0];
}

/** The engine's features, as what they mean (persona.py `TELEMETRY_FEATURE_NAMES`, the W anchors). */
export const FEATURE_WORDS: Record<string, string> = {
  risk_index: "risk taken",
  save_rate: "keeping for later",
  persistence: "seeing things through",
  ts_social: "time with people",
  ts_learn: "time learning",
  ts_build: "time building",
  ts_leisure: "time at leisure",
  ts_earn: "time earning",
  solitude_tol: "ease alone",
  pet_attach: "fondness for animals",
  decision_latency: "time taken to decide",
  latency_norm: "time taken to answer",
  edits_norm: "words taken back",
  approach: "going up to people",
  novel_tile_ratio: "new ground covered",
  path_tortuosity: "wandering",
  travel_novelty: "going somewhere new",
  curiosity: "curiosity",
  consistency: "doing the same again",
};

/** Features the engine takes in milliseconds, said in seconds. */
const MS_FEATURES: Record<string, string> = { decision_latency: "to decide", latencyMs: "to answer" };

/**
 * What a row was read as, in words: its known features, strongest first, sized in words rather than
 * numbers. A share (0 … 1) is "a little", "some", or the thing itself; a time is said in seconds.
 */
export function readAsWords(readAs: Record<string, unknown> | null): string[] {
  if (!readAs) return [];
  const said: { n: number; words: string }[] = [];
  for (const [k, v] of Object.entries(readAs)) {
    if (MS_FEATURES[k] && typeof v === "number" && Number.isFinite(v)) {
      said.push({ n: 1, words: `${Math.round(v / 100) / 10} s ${MS_FEATURES[k]}` });
      continue;
    }
    const phrase = FEATURE_WORDS[k];
    if (!phrase) continue;
    const n = typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" && Number.isFinite(v) ? v : null;
    if (n === null) continue;
    const x = Math.abs(n);
    said.push({ n: x, words: x === 0 ? `no ${phrase}` : x < 0.33 ? `a little ${phrase}` : x < 0.66 ? `some ${phrase}` : phrase });
  }
  return said
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((s) => s.words);
}

// ── what the world set out (C63) ────────────────────────────────────────────────

/** One encounter the director set out, as the mirror tells it afterwards. */
export interface SetOut {
  id: string;
  at: string;
  /** What it was, and what it was set out to learn. */
  name: string;
  asks: string;
  /** What the stranger did: a verb's label, "walked past", or "left it be" when it went unanswered. */
  answer: string;
}

/**
 * What was set out, answered or gone, newest first. One still standing is never shown: told about it
 * in advance, the stranger would be answering the mirror rather than the world.
 */
export function setOutOf(
  stagings: readonly { id: string; situation: string; createdAt: string; resolved: string | null; resolvedAt: string | null; ownerName?: string | null }[],
  catalogue: Readonly<Record<string, { name: string; asks: string; verbs: readonly { id: string; label: string }[] }>>,
  now: number,
  lifeMs: number,
): SetOut[] {
  return stagings
    .filter((s) => s.resolved !== null || now - Date.parse(s.createdAt) >= lifeMs)
    .filter((s) => catalogue[s.situation])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map((s) => {
      const c = catalogue[s.situation]!;
      const answer = s.resolved === null ? "left it be" : s.resolved === "passed" ? "walked past" : (c.verbs.find((v) => v.id === s.resolved)?.label ?? s.resolved);
      // Whose it was, where it was somebody's.
      const name = s.ownerName ? c.name.replace(/^someone's/, `${s.ownerName}'s`) : c.name;
      return { id: s.id, at: s.resolvedAt ?? s.createdAt, name, asks: c.asks, answer };
    });
}

// ── the reading ─────────────────────────────────────────────────────────────────

export interface AxisReading {
  key: PersonaAxisKey;
  poles: readonly [string, string];
  mu: number;
  sd: number;
  /** The engine would put a word to it. */
  sure: boolean;
  /** "warm", "strongly warm", or null for the middle. */
  words: string | null;
}

export interface Move {
  axis: PersonaAxisKey;
  amount: number;
  words: HowMuch;
  towards: string;
}

export interface Contributor {
  label: string;
  kind: LedgerKind;
  /** Times done; for walking, windows walked. */
  count: number;
  amount: number;
  words: HowMuch;
  towards: string;
  last: string;
}

export interface TimelineEntry {
  id: number;
  at: string;
  kind: LedgerKind;
  label: string;
  windows: number;
  moves: Move[];
  readAs: string[];
}

export interface MirrorView {
  /** The engine answered with a posterior; false shows the record alone. */
  live: boolean;
  reason?: string;
  axes: AxisReading[];
  /** Per axis, what moved it most, either way, from the record. */
  evidence: Record<PersonaAxisKey, Contributor[]>;
  /** Per axis, of where the echo puts the person now, what the record does not itemise. Null when not live. */
  notInRecord: Record<PersonaAxisKey, number> | null;
  /** Updates the engine made that are not in the record, counted from versions. */
  missing: number;
  timeline: TimelineEntry[];
  /** When the record (since the last restart) begins, and how many rows it has. */
  since: string | null;
  rows: number;
  /** When the engine was found to have started over; true for "after the last row". */
  restarted: string | true | null;
  /** "When others can see you" — the biggest public-minus-private difference, if big enough. */
  watched: Move | null;
  /** Per axis, the features the engine reads it from, in words. */
  reads: Partial<Record<PersonaAxisKey, string[]>>;
}

const zeroes = (): Record<PersonaAxisKey, number> => Object.fromEntries(PERSONA_AXIS_KEYS.map((k) => [k, 0])) as Record<PersonaAxisKey, number>;

function moveOf(axis: PersonaAxisKey, amount: number): Move {
  return { axis, amount, words: howMuch(amount), towards: towards(axis, amount) };
}

/** The rows that still count: those since the engine last started over, as far as the record shows. */
export function currentEpoch(rows: readonly LedgerRow[]): { rows: LedgerRow[]; restarted: string | null } {
  const byId = [...rows].sort((a, b) => a.id - b.id);
  let start = 0;
  let restarted: string | null = null;
  let maxV1 = -1;
  let lastAt = 0;
  byId.forEach((r, i) => {
    const at = Date.parse(r.at);
    if (maxV1 >= 0 && r.v0 < maxV1 && (maxV1 - r.v0 > MIRROR.restartGap || at - lastAt > MIRROR.quietMs)) {
      start = i;
      restarted = r.at;
      maxV1 = -1;
    }
    maxV1 = Math.max(maxV1, r.v1);
    lastAt = Math.max(lastAt, at);
  });
  return { rows: byId.slice(start).sort((a, b) => a.v0 - b.v0 || a.id - b.id), restarted };
}

export function mirrorOf(now: EchoNow | null, ledger: readonly LedgerRow[], opts: { at?: number; reason?: string } = {}): MirrorView {
  const at = opts.at ?? Date.now();
  let { rows, restarted } = currentEpoch(ledger) as { rows: LedgerRow[]; restarted: string | true | null };
  const last = rows[rows.length - 1];
  if (now && last) {
    const maxV1 = Math.max(...rows.map((r) => r.v1));
    const lastAt = Math.max(...rows.map((r) => Date.parse(r.at)));
    if (now.version < maxV1 && (maxV1 - now.version > MIRROR.restartGap || at - lastAt > MIRROR.quietMs)) {
      // The engine has started over since the last row: none of the record counts any more.
      rows = [];
      restarted = true;
    } else {
      // A row written after the engine was read is not part of what it said.
      rows = rows.filter((r) => r.v1 <= now.version);
    }
  }

  const recorded = zeroes();
  for (const r of rows) PERSONA_AXIS_KEYS.forEach((k, i) => (recorded[k] += r.delta[i] ?? 0));

  // Missing updates, from the versions: before the first row, between rows, after the last.
  let missing = 0;
  if (now) {
    let v = 0;
    for (const r of rows) {
      missing += Math.max(0, r.v0 - v);
      v = Math.max(v, r.v1);
    }
    missing += Math.max(0, now.version - v);
  }

  // Who moved what: one contributor per kind of act, taken or turned down.
  const groups = new Map<string, { label: string; kind: LedgerKind; count: number; sum: number[]; last: string }>();
  for (const r of rows) {
    const key = `${r.kind}|${r.action}|${r.polarity ?? ""}`;
    const g = groups.get(key) ?? { label: actWords(r.action, r.polarity), kind: r.kind, count: 0, sum: new Array(PERSONA_AXIS_KEYS.length).fill(0), last: r.at };
    g.count += r.kind === "walk" ? r.windows : 1;
    r.delta.forEach((d, i) => (g.sum[i] += d));
    if (Date.parse(r.at) > Date.parse(g.last)) g.last = r.at;
    groups.set(key, g);
  }
  const evidence = Object.fromEntries(
    PERSONA_AXIS_KEYS.map((k, i) => [
      k,
      [...groups.values()]
        .filter((g) => Math.abs(g.sum[i]!) >= MIRROR.noticed)
        .sort((a, b) => Math.abs(b.sum[i]!) - Math.abs(a.sum[i]!))
        .slice(0, MIRROR.perAxis)
        .map((g) => ({ label: g.label, kind: g.kind, count: g.count, amount: g.sum[i]!, words: howMuch(g.sum[i]!), towards: towards(k, g.sum[i]!), last: g.last })),
    ]),
  ) as Record<PersonaAxisKey, Contributor[]>;

  const timeline = [...rows]
    .sort((a, b) => b.id - a.id)
    .slice(0, MIRROR.timeline)
    .map((r) => ({
      id: r.id,
      at: r.at,
      kind: r.kind,
      label: actWords(r.action, r.polarity),
      windows: r.windows,
      moves: PERSONA_AXIS_KEYS.map((k, i) => moveOf(k, r.delta[i] ?? 0))
        .filter((m) => Math.abs(m.amount) >= MIRROR.noticed)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 3),
      readAs: readAsWords(r.read_as),
    }));

  const axes: AxisReading[] = PERSONA_AXIS_KEYS.map((k, i) => {
    const mu = now?.mu[i] ?? 0;
    const v = now?.var[i] ?? 1;
    const sure = !!now && v <= MIRROR.sureVar;
    const lean = Math.abs(mu) >= MIRROR.leanAt ? `${Math.abs(mu) > MIRROR.strongAt ? "strongly " : ""}${towards(k, mu)}` : null;
    return { key: k, poles: AXIS_POLES[k], mu, sd: Math.sqrt(Math.max(0, v)), sure, words: sure ? lean : null };
  });

  let watched: Move | null = null;
  if (now?.watched && now.watched.length === PERSONA_AXIS_KEYS.length) {
    const i = now.watched.reduce((best, d, j) => (Math.abs(d) > Math.abs(now.watched![best]!) ? j : best), 0);
    if (Math.abs(now.watched[i]!) >= MIRROR.watchedAt) watched = moveOf(PERSONA_AXIS_KEYS[i]!, now.watched[i]!);
  }

  const reads: Partial<Record<PersonaAxisKey, string[]>> = {};
  for (const k of PERSONA_AXIS_KEYS) {
    const said = (now?.measurement?.[k] ?? []).filter((f) => FEATURE_WORDS[f.feature]).map((f) => `${f.loading < 0 ? "less " : ""}${FEATURE_WORDS[f.feature]}`);
    if (said.length) reads[k] = said;
  }

  return {
    live: !!now,
    ...(opts.reason ? { reason: opts.reason } : {}),
    axes,
    evidence,
    notInRecord: now ? (Object.fromEntries(PERSONA_AXIS_KEYS.map((k, i) => [k, now.mu[i]! - recorded[k]])) as Record<PersonaAxisKey, number>) : null,
    missing,
    timeline,
    since: rows.length ? [...rows].sort((a, b) => a.id - b.id)[0]!.at : null,
    rows: rows.length,
    restarted,
    watched,
    reads,
  };
}
