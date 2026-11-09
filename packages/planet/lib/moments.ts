/**
 * Moments and hidden things (DECISIONS C86): something small happening near the stranger every minute
 * or so, and things tucked away around the village for whoever goes looking.
 *
 * WHY. Played for 25 minutes, a visit had long stretches of walking with nothing in reach: the
 * director's situations are hours apart (C63), and the pilot's six are over in the first minutes
 * (C75). A moment fills the gap the way a village does: someone's basket spills in front of you,
 * children's ball comes to your feet, people touch the well's rim for luck as they pass. Each is a
 * classic paradigm in the world's own clothes, and each is read under a label ingest.py already has
 * (C7), so `services/ml` is not touched:
 *
 * | Moment | What happens | Read as (cue) |
 * |---|---|---|
 * | `spilled-basket` | a woman trips and her apples roll across the path | `help_at_cost`; walking past, `pass_by` (H9) |
 * | `stuck-cart` | a handcart's wheel sinks, the carter strains at it | `help_at_cost`, held as long as you push; `pass_by` (H9) |
 * | `ball-game` | children's ball rolls to you; one of them is always left out | `include_marginal` / `ignore_marginal` (G2: Cyberball) |
 * | `stray-ball` | a child's throw goes wide and hits you | `forgive` / `retaliate`; walking off, `withdraw` (G10) |
 * | `well-custom` | people passing the well touch its rim and bow | `conform_custom`; passing it untouched, `deviate_custom` (H4) |
 * | `well-queue` | a line at the well with buckets | `wait_in_queue` / `cut_queue` (H1) |
 * | `village-dance` | in the evening a ring forms on the green | `group_join` / `group_observe`; walking off, `group_avoid` (G4) |
 * | `loose-hen` | after dark, a woman with a lantern chasing a hen that got out | `help_at_cost`; walking past, `pass_by` (H9) |
 * | `falling-stars` | at night, stars falling over the sea | `gaze_reflection`, held as long as you watch (J2) |
 * | `banging-door` | at night, a house's door banging in the wind | `stack_tidy`: pulling it shut (J5) |
 *
 * None is one of the pilot's six (no bread, no lending, no bet, no seed, no path, no lone stranger),
 * and none is set out while one of those stands: a moment never stands between a person and the study.
 *
 * NEVER A PROMPT (Law 2, as the director). A moment is people doing something, nothing else: no marker,
 * no word that it is for you. Leaving it is an answer, and never a penalty. Its people walk in from the
 * side rather than appearing, and walk off when it is over.
 *
 * HIDDEN THINGS are the village's own, the same for everyone, found once each by each stranger: hollow
 * stumps with something carved inside (`egg_hollow`, I3), a bottle on the shore with a note (`study_marker`,
 * J6), a still pool (`egg_reflection`, J2), a lookout rock (`egg_horizon_seen`, I3, and sitting there,
 * `gaze_reflection`, J2), a box someone buried (`dig_cache`).
 *
 * Pure: where and which, never when (the page keeps the clock).
 */
import { blocked, navGraph } from "./nav.js";
import { doorOf } from "./schedule.js";
import { inVillage } from "./director.js";
import type { VillagePlan } from "./village.js";

export type MomentKind = "spilled-basket" | "stuck-cart" | "ball-game" | "stray-ball" | "well-custom" | "well-queue" | "village-dance" | "loose-hen" | "falling-stars" | "banging-door";
export type EggKind = "hollow-stump" | "message-bottle" | "still-pool" | "lookout-rock" | "buried-box";

export const MOMENT_KINDS: readonly MomentKind[] = ["spilled-basket", "stuck-cart", "ball-game", "stray-ball", "well-custom", "well-queue", "village-dance", "loose-hen", "falling-stars", "banging-door"];
export const EGG_KINDS: readonly EggKind[] = ["hollow-stump", "message-bottle", "still-pool", "lookout-rock", "buried-box"];

export interface MomentDef {
  kind: MomentKind;
  /** What it is called over it, as the prompt says. */
  name: string;
  /** The hours it can happen in, on the sky's clock (0.25 sunrise, 0.75 sunset); [0.85, 0.2] runs over midnight. */
  hours: readonly [number, number];
  /** Where: anywhere ahead of the stranger, at the well, on the green, overhead (the sky, wherever they are), or at a house's door. */
  where: "ahead" | "well" | "green" | "sky" | "door";
  /** Children in it (the ball games), so the cast is drawn small. */
  children: boolean;
  /** How long it waits for the stranger before it is over by itself, seconds (from when it begins). */
  lifeS: number;
  /**
   * Walking past it once it was in plain view, measured as this (the director's rule, C63). Null where
   * walking past says nothing: a ball game you never stopped at is not a choice about who to include.
   */
  passed: { action: string; cue: string; channel: string } | null;
}

export const MOMENTS: Readonly<Record<MomentKind, MomentDef>> = {
  "spilled-basket": { kind: "spilled-basket", name: "a woman whose apples have rolled everywhere", hours: [0.27, 0.78], where: "ahead", children: false, lifeS: 50, passed: { action: "pass_by", cue: "H9", channel: "H" } },
  "stuck-cart": { kind: "stuck-cart", name: "a carter with a wheel stuck fast", hours: [0.28, 0.74], where: "ahead", children: false, lifeS: 55, passed: { action: "pass_by", cue: "H9", channel: "H" } },
  "ball-game": { kind: "ball-game", name: "children playing catch", hours: [0.3, 0.78], where: "ahead", children: true, lifeS: 50, passed: null },
  "stray-ball": { kind: "stray-ball", name: "a child who threw wide", hours: [0.3, 0.78], where: "ahead", children: true, lifeS: 30, passed: { action: "withdraw", cue: "G10", channel: "G" } },
  "well-custom": { kind: "well-custom", name: "the well's worn rim", hours: [0.26, 0.82], where: "well", children: false, lifeS: 60, passed: { action: "deviate_custom", cue: "H4", channel: "H" } },
  "well-queue": { kind: "well-queue", name: "a line at the well", hours: [0.27, 0.7], where: "well", children: false, lifeS: 55, passed: null },
  "village-dance": { kind: "village-dance", name: "a ring dance on the green", hours: [0.74, 0.93], where: "green", children: false, lifeS: 70, passed: { action: "group_avoid", cue: "G4", channel: "G" } },
  // The night's own (C86): the village after dark is not empty of things to do.
  "loose-hen": { kind: "loose-hen", name: "a woman with a lantern, chasing a hen", hours: [0.82, 0.28], where: "ahead", children: false, lifeS: 50, passed: { action: "pass_by", cue: "H9", channel: "H" } },
  "falling-stars": { kind: "falling-stars", name: "stars falling over the sea", hours: [0.86, 0.2], where: "sky", children: false, lifeS: 26, passed: null },
  "banging-door": { kind: "banging-door", name: "a door banging in the wind", hours: [0.8, 0.3], where: "door", children: false, lifeS: 40, passed: null },
};

export const MOMENT = {
  /** Before the first, after arriving: time to look around. */
  firstS: 25,
  /** Between the end of one and the start of the next: something near about once a minute, all visit. */
  gapS: [20, 34] as const,
  /** Set this far ahead of the stranger: near, in front, on the way. */
  aheadM: [6.5, 10] as const,
  /** Its people walk in from about this far. */
  entryM: 15,
  /** The well and the green moments: only for someone this near them. */
  wellM: 28,
  greenM: 32,
  /** Came this close: it was in plain view. Then this far: they walked on. */
  noticeM: 8,
  goneM: 20,
  /** A door moment: a house whose door is this far from the stranger, metres. */
  doorM: [5, 25] as const,
  /** Never this near something the director set out (the pilot's six above all). */
  clearOfStagingM: 14,
  /**
   * Nothing begins while the stranger is this near something the director set out, which they may yet
   * go to. Walked away from it, they are free of it: one left standing for its four minutes (C75) does
   * not hold every moment back.
   */
  holdForStagingM: 40,
} as const;

/** A number in [0, 1) fixed by a string (FNV with a murmur finish, as the director's). */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * The order one stranger meets the moments in: every kind once before any comes again, shuffled
 * afresh for each round, the same on every reload. So a 25-minute visit meets most of them, in an
 * order that differs from one person to the next.
 */
export function momentAt(seed: string, n: number): MomentKind {
  const round = Math.floor(n / MOMENT_KINDS.length);
  const order = [...MOMENT_KINDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(unit(`${seed}|moment|${round}|${i}`) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order[n % MOMENT_KINDS.length]!;
}

/** Whether a moment can happen here and now: its hours, and its place. */
export function momentFits(kind: MomentKind, hour: number, at: { x: number; y: number }, plan: VillagePlan | null): boolean {
  const def = MOMENTS[kind];
  const [h0, h1] = def.hours;
  if (h0 <= h1 ? hour < h0 || hour > h1 : hour < h0 && hour > h1) return false;
  if (def.where === "ahead" || def.where === "sky") return true;
  if (!plan) return false;
  if (def.where === "door") return plan.plots.some((p) => Math.hypot(doorOf(p).x - at.x, doorOf(p).y - at.y) < MOMENT.doorM[1]);
  const d = Math.hypot(at.x - plan.centre.x, at.y - plan.centre.y);
  return def.where === "well" ? d < MOMENT.wellM : d < MOMENT.greenM;
}

/**
 * The next moment from `n` on that fits: the rotation's own next if it does, or the first after it
 * that does (and `n` moves past both). Null when none fits here and now.
 */
export function nextMoment(seed: string, n: number, hour: number, at: { x: number; y: number }, plan: VillagePlan | null): { kind: MomentKind; n: number } | null {
  for (let k = 0; k < MOMENT_KINDS.length; k++) {
    const kind = momentAt(seed, n + k);
    if (momentFits(kind, hour, at, plan)) return { kind, n: n + k + 1 };
  }
  return null;
}

/** The ground a moment or a hidden thing is set on. */
export interface MomentGround {
  /** Metres above the sea; below zero is water. */
  height(x: number, y: number): number;
  plan: VillagePlan | null;
}

/** Open ground: dry, not on a house, the well, a bench or anything else standing there. */
export function openGround(ground: MomentGround, x: number, y: number): boolean {
  if (ground.height(x, y) < 0.15) return false;
  return !ground.plan || !blocked(navGraph(ground.plan), { x, y });
}

/**
 * Where a moment ahead is set: in front of the stranger (`heading`, radians, planet-local), within
 * forty degrees either side, on open ground, and clear of whatever the director set out. Null when
 * nowhere ahead will do.
 */
export function momentSpot(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround, avoid: { x: number; y: number } | null = null): { x: number; y: number; facing: number } | null {
  const [r0, r1] = MOMENT.aheadM;
  for (let i = 0; i < 40; i++) {
    const a = heading + (unit(`${seed}|a|${i}`) - 0.5) * (Math.PI * 0.45);
    const r = r0 + unit(`${seed}|r|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (!openGround(ground, x, y)) continue;
    // Room for the people in it: a metre and a half all round.
    let room = true;
    for (let k = 0; k < 6 && room; k++) room = openGround(ground, x + Math.cos((k / 6) * Math.PI * 2) * 1.5, y + Math.sin((k / 6) * Math.PI * 2) * 1.5);
    if (!room) continue;
    if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < MOMENT.clearOfStagingM) continue;
    // Facing the stranger, so that what happens happens toward them.
    return { x, y, facing: Math.atan2(at.y - y, at.x - x) };
  }
  return null;
}

/**
 * Which house's door bangs: the nearest lived-in house (`lived`, the caller's: a ruin has no door left
 * to bang) within `doorM`, preferring one ahead of the stranger (a door behind them is heard, and nobody
 * turns round for it). Facing the way the house faces.
 */
export function doorSpot(at: { x: number; y: number }, heading: number, plan: VillagePlan, lived: (plot: VillagePlan["plots"][number]) => boolean = () => true): { x: number; y: number; facing: number } | null {
  let best: { x: number; y: number; facing: number; score: number } | null = null;
  for (const plot of plan.plots) {
    if (!lived(plot)) continue;
    const d = doorOf(plot);
    const r = Math.hypot(d.x - at.x, d.y - at.y);
    if (r < MOMENT.doorM[0] || r > MOMENT.doorM[1]) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(d.y - at.y, d.x - at.x) - heading), Math.cos(Math.atan2(d.y - at.y, d.x - at.x) - heading)));
    const score = r + (off > Math.PI * 0.4 ? 40 : 0);
    if (!best || score < best.score) best = { x: d.x, y: d.y, facing: plot.facing, score };
  }
  return best && { x: best.x, y: best.y, facing: best.facing };
}

/** Where its people walk in from: off to one side of the stranger's way, about `entryM` away. */
export function entryPoint(spot: { x: number; y: number }, from: { x: number; y: number }, seed: string, ground: MomentGround): { x: number; y: number } {
  const toward = Math.atan2(spot.y - from.y, spot.x - from.x);
  for (let i = 0; i < 16; i++) {
    const side = unit(`${seed}|side|${i}`) < 0.5 ? -1 : 1;
    const a = toward + side * (Math.PI / 2 + (unit(`${seed}|tilt|${i}`) - 0.5) * 0.8);
    const r = MOMENT.entryM * (0.8 + 0.4 * unit(`${seed}|er|${i}`));
    const x = spot.x + Math.cos(a) * r;
    const y = spot.y + Math.sin(a) * r;
    if (openGround(ground, x, y)) return { x, y };
  }
  return { x: spot.x + Math.cos(toward + Math.PI / 2) * 6, y: spot.y + Math.sin(toward + Math.PI / 2) * 6 };
}

/** Walking past, one step at a time: `near` once within `noticeM`; `passed` when then beyond `goneM`. */
export function momentPass(wasNear: boolean, distM: number): { near: boolean; passed: boolean } {
  const near = wasNear || distM <= MOMENT.noticeM;
  return { near, passed: near && distM > MOMENT.goneM };
}

// ── hidden things ─────────────────────────────────────────────────────────────

export interface Egg {
  /** Stable across visits and viewers: the village's, by kind and number. */
  id: string;
  kind: EggKind;
  x: number;
  y: number;
  facing: number;
  /** Which of its kind's lines it says when found (the token carved, the note's words). */
  variant: number;
}

/** How many of each a village hides. */
const EGG_COUNTS: Readonly<Record<EggKind, number>> = { "hollow-stump": 3, "message-bottle": 2, "still-pool": 1, "lookout-rock": 1, "buried-box": 1 };

/**
 * Where a village hides its things: deterministic from the village, outside its own houses and fields
 * (`inVillage`), a few strides apart, each on the ground it needs: a bottle at the waterline, a pool in
 * a hollow of the land, the lookout on the highest ground near the village. Fewer when the land will not
 * have them (no shore, no bottles).
 */
export function eggsOf(seed: string, ground: MomentGround): Egg[] {
  const plan = ground.plan;
  if (!plan) return [];
  const c = plan.centre;
  const out: Egg[] = [];
  const apart = (x: number, y: number) => out.every((e) => Math.hypot(e.x - x, e.y - y) > 14);
  const dry = (x: number, y: number) => openGround(ground, x, y) && !inVillage(plan, x, y, 3);
  const nearSea = (x: number, y: number, r: number) => {
    for (let k = 0; k < 12; k++) if (ground.height(x + Math.cos((k / 12) * Math.PI * 2) * r, y + Math.sin((k / 12) * Math.PI * 2) * r) < 0) return true;
    return false;
  };
  // A bottle lies at the waterline, which random points miss: sweep round the dock (or the green, with
  // no dock) every 5° and 2 m, in an order the seed decides, for barely dry sand with the sea beside it.
  const shoreline = (key: string): { x: number; y: number } | null => {
    const o = plan.dock ? plan.dock.root : c;
    const spots: { x: number; y: number; k: number }[] = [];
    for (let i = 0; i < 72; i++) {
      for (let r = 10; r <= 90; r += 2) {
        const a = (i / 72) * Math.PI * 2;
        spots.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, k: unit(`${key}|${i}|${r}`) });
      }
    }
    spots.sort((p, q) => p.k - q.k);
    for (const { x, y } of spots) {
      const h = ground.height(x, y);
      if (h < 0.02 || h > 1.5 || !nearSea(x, y, 3) || inVillage(plan, x, y, 3) || !apart(x, y)) continue;
      if (blocked(navGraph(plan), { x, y })) continue;
      return { x, y };
    }
    return null;
  };
  for (const kind of EGG_KINDS) {
    for (let n = 0; n < EGG_COUNTS[kind]; n++) {
      const key = `${seed}|egg|${kind}|${n}`;
      let best: { x: number; y: number; score: number } | null = null;
      if (kind === "message-bottle") {
        const at = shoreline(key);
        if (at) out.push({ id: `${kind}:${n}`, kind, x: at.x, y: at.y, facing: unit(`${key}|f`) * Math.PI * 2, variant: Math.floor(unit(`${key}|v`) * 1e6) });
        continue;
      }
      for (let i = 0; i < 220; i++) {
        const a = unit(`${key}|a|${i}`) * Math.PI * 2;
        const r = (kind === "lookout-rock" ? 35 : 25) + unit(`${key}|r|${i}`) * (kind === "lookout-rock" ? 70 : 60);
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r;
        if (!dry(x, y) || !apart(x, y)) continue;
        if (kind === "lookout-rock") {
          // The highest ground of the tries: a lookout is somewhere to look out from.
          const score = ground.height(x, y);
          if (!best || score > best.score) best = { x, y, score };
          continue;
        }
        if (kind === "still-pool" && nearSea(x, y, 6)) continue;
        best = { x, y, score: 0 };
        break;
      }
      if (!best) continue;
      out.push({ id: `${kind}:${n}`, kind, x: best.x, y: best.y, facing: unit(`${key}|f`) * Math.PI * 2, variant: Math.floor(unit(`${key}|v`) * 1e6) });
    }
  }
  return out;
}

/** What a hidden thing says when found: one of its kind's lines, by its variant. */
export const EGG_LINES: Readonly<Record<EggKind, readonly string[]>> = {
  "hollow-stump": [
    "Inside the hollow, wrapped in a leaf: a small fish carved from bone.",
    "Inside the hollow: a wooden bird, its wings worn smooth by hands.",
    "Inside the hollow: a little boat cut from bark, with a mast of a twig.",
    "Inside the hollow: three pebbles, each with a line scratched on it.",
  ],
  "message-bottle": [
    "The note says: \"If you find this, the herons came back this year. Tell someone.\"",
    "The note says: \"I went across the water to see what is there. Do not wait for me.\"",
    "The note is a child's drawing of a house, and a dog, and the sea.",
    "The note says only a name, and a day, a long time ago.",
  ],
  "still-pool": ["The water is so still you can see the clouds go over your own face."],
  "lookout-rock": ["From up here the whole bay is laid out: the roofs, the boats, and the far shore in a haze."],
  "buried-box": ["A small box, rotten at the corners. Inside: a ring of plaited hair, and a shell."],
};

export function eggLine(e: Pick<Egg, "kind" | "variant">): string {
  const lines = EGG_LINES[e.kind];
  return lines[e.variant % lines.length]!;
}
