/**
 * The director (DECISIONS C63): the world sets out, now and then, the one encounter that would teach a
 * stranger's echo the most about them.
 *
 * WHICH ONE is the engine's: `/select-situation`, the same expected-information-gain acquisition (BALD)
 * that picks villagers, over these situations' axis vectors, against the stranger's own posterior. The
 * engine also says how many a day it still wants (`cap`, from 3 down to 0 as it grows sure). This file
 * is the catalogue, and where and how a situation is set out.
 *
 * WHAT THEY ARE. The island's private probes, in the new world, sent under the labels ingest.py
 * already reads (C7: no engine change):
 *
 * | Situation | Set out | Read as |
 * |---|---|---|
 * | `netted_gull` | a gull caught in old netting, at the water | `help_at_cost`; walking past, `pass_by` |
 * | `lost_pouch` | a villager's pouch, dropped by a path | `return_cache`, or `keep_cache` by how much was taken |
 * | `carved_mark` | a stone with something cut in it, off the track | `egg_hollow`; walking past, its refusal |
 * | `dark_cleft` | a narrow dark gap in the rock | `enter_cave` or `stay_safe` |
 *
 * NEVER A PROMPT (Law 2). A staging is a thing in the world and nothing else: no marker, no quest, no
 * word that it was set out. Leaving it is as much an answer as anything, and never a penalty. Only
 * afterwards, in the mirror, is the stranger told what was set out for them and why.
 *
 * OUT OF SIGHT. The private ones are set where no villager out of doors can see them (`unseen`),
 * because the same choice watched and unwatched is a different datum (cue H2), and the private one is
 * what these probes are for.
 *
 * Pure.
 */
import type { VillagePlan } from "./village.js";

export type SituationId = "netted_gull" | "lost_pouch" | "carved_mark" | "dark_cleft";
export type StagedKind = "netted-gull" | "lost-pouch" | "carved-mark" | "dark-cleft";

export interface Situation {
  id: SituationId;
  kind: StagedKind;
  /** What it is, as the mirror says it afterwards. */
  name: string;
  /** What it would learn, as the mirror says it afterwards. */
  asks: string;
  /**
   * The doc prior over the axes, in `PERSONA_AXIS_KEYS` order (warmth, dominance, openness, energy,
   * formality, intellect, pace, affect): what an answer either way would say. The first two are the
   * island director's own vectors for the same probes.
   */
  axes: readonly number[];
  where: "shore" | "land";
  /** Set out of every villager's sight. */
  unseen: boolean;
  /** Walking past it is measured: as this action, at this polarity. Null where passing says nothing. */
  passed: { action: string; cue: string; channel: string; polarity: "take" | "refuse" } | null;
  sizeM: number;
}

export const SITUATIONS: Readonly<Record<SituationId, Situation>> = {
  netted_gull: {
    id: "netted_gull",
    kind: "netted-gull",
    name: "a gull caught in old netting",
    asks: "whether you stop for a creature in trouble when nobody would know",
    axes: [1, 0, 0, 0, 0, 0, 0, 0.3],
    where: "shore",
    unseen: true,
    passed: { action: "pass_by", cue: "H9", channel: "H", polarity: "take" },
    sizeM: 0.5,
  },
  lost_pouch: {
    id: "lost_pouch",
    kind: "lost-pouch",
    name: "someone's pouch, dropped by the path",
    asks: "what you do with what is not yours, when nobody would know",
    axes: [0.5, 0, 0, 0, 0.8, 0, 0, 0],
    where: "land",
    unseen: true,
    // Walking past a pouch is not noticing it as often as it is leaving it: it says nothing.
    passed: null,
    sizeM: 0.25,
  },
  carved_mark: {
    id: "carved_mark",
    kind: "carved-mark",
    name: "a stone with something cut into it, off the track",
    asks: "whether you go to look at what nobody asked you to",
    axes: [0, 0, 1, 0, 0, 0.3, 0, 0],
    where: "land",
    unseen: false,
    passed: { action: "egg_hollow", cue: "I3", channel: "I", polarity: "refuse" },
    sizeM: 0.6,
  },
  dark_cleft: {
    id: "dark_cleft",
    kind: "dark-cleft",
    name: "a narrow, dark gap in the rock",
    asks: "whether you go into the dark when you do not have to",
    axes: [0, 0.8, 0.3, 0.3, 0, 0, 0, 0],
    where: "land",
    unseen: false,
    passed: null,
    sizeM: 1.2,
  },
};

export const SITUATION_IDS = Object.keys(SITUATIONS) as SituationId[];

export const DIRECTOR = {
  /** At least this long between two stagings for one stranger. */
  gapMs: 20 * 60 * 1000,
  /** A staging left alone this long is gone. */
  lifeMs: 2 * 60 * 60 * 1000,
  /** Set this far from the stranger: far enough to come upon, near enough to be on their way. */
  nearM: [22, 48] as const,
  /** A villager out of doors this close can see it. */
  sightM: 30,
  /** Came this close: it was in plain view. */
  noticeM: 9,
  /** And then this far: they walked on. */
  goneM: 35,
  /** A shore staging stands this close to the sea. */
  waterM: 2.5,
  /** Places tried before giving up for now. */
  tries: 72,
} as const;

/** One staging: a situation set out for one stranger, in one parcel, and what became of it. */
export interface Staging {
  id: string;
  subject: string;
  cell: string;
  situation: SituationId;
  x: number;
  y: number;
  facing: number;
  /** For the pouch: whose it is (a villager's id), and their given name. */
  owner: string | null;
  ownerName: string | null;
  /** The engine's expected information gain for it, when picked. */
  infoGain: number | null;
  createdAt: string;
  /** A verb id, "passed", or null while it stands. */
  resolved: string | null;
  resolvedAt: string | null;
}

/** Still standing at `now`: not answered, and not past its life. */
export function standing(s: Staging, now: number): boolean {
  return s.resolved === null && now - Date.parse(s.createdAt) < DIRECTOR.lifeMs;
}

/**
 * Whether a new staging may be set out now, from this stranger's stagings: none standing, the last
 * one at least `gapMs` ago, and fewer today than the engine still wants.
 */
export function mayStage(stagings: readonly Staging[], cap: number, now: number): "standing" | "too_soon" | "enough_today" | null {
  if (stagings.some((s) => standing(s, now))) return "standing";
  const last = Math.max(0, ...stagings.map((s) => Date.parse(s.createdAt)));
  if (now - last < DIRECTOR.gapMs) return "too_soon";
  const today = new Date(now).toISOString().slice(0, 10);
  if (stagings.filter((s) => s.createdAt.slice(0, 10) === today).length >= cap) return "enough_today";
  return null;
}

function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function toSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Inside the village's own things (a house plot, a field, the green, the mine, the graves, the dock). Paths are fine. */
export function inVillage(plan: VillagePlan | null, x: number, y: number, marginM = 2): boolean {
  if (!plan) return false;
  const near = (px: number, py: number, r: number) => Math.hypot(px - x, py - y) < r + marginM;
  if (near(plan.centre.x, plan.centre.y, plan.greenRadiusM)) return true;
  if (plan.plots.some((p) => near(p.x, p.y, Math.hypot(p.depthM, p.widthM) / 2))) return true;
  if (plan.fields.some((f) => near(f.x, f.y, Math.hypot(f.lengthM, f.widthM) / 2))) return true;
  if (plan.mine && near(plan.mine.x, plan.mine.y, 4)) return true;
  if (plan.graveyard && near(plan.graveyard.x, plan.graveyard.y, plan.graveyard.radiusM)) return true;
  if (plan.dock && toSegment({ x, y }, plan.dock.root, plan.dock.tip) < marginM + 1) return true;
  return false;
}

export interface Ground {
  /** Dry, walkable, in this parcel. */
  standable(x: number, y: number): boolean;
  sea(x: number, y: number): boolean;
  /** A villager out of doors could see this point. */
  seen(x: number, y: number): boolean;
  plan: VillagePlan | null;
}

/** Whether a situation can be set out near this point at all (the gull needs a shore within reach). */
export function available(sit: Situation, at: { x: number; y: number }, ground: Ground): boolean {
  if (sit.where === "land") return true;
  const far = DIRECTOR.nearM[1] + 10;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    for (const r of [far * 0.4, far * 0.7, far]) if (ground.sea(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r)) return true;
  }
  return false;
}

/**
 * Where to set a situation out, near the stranger: deterministic from the seed, on the ground the
 * situation needs, out of sight where it must be, never inside the village's own things. Null when
 * nowhere near will do.
 */
export function stagingSpot(sit: Situation, at: { x: number; y: number }, seed: string, ground: Ground): { x: number; y: number; facing: number } | null {
  const [r0, r1] = DIRECTOR.nearM;
  const fits = (x: number, y: number) => ground.standable(x, y) && !inVillage(ground.plan, x, y) && !(sit.unseen && ground.seen(x, y));
  if (sit.where === "shore") {
    // A shore is a thin line, which random points miss: sweep the ring (every 5° and 5 m, in an order
    // the seed decides) for dry ground with the sea right beside it, and face it to the water.
    const spots: { a: number; r: number; k: number }[] = [];
    for (let i = 0; i < 72; i++) for (let r = r0; r <= r1; r += 5) spots.push({ a: (i / 72) * Math.PI * 2, r, k: unit(`${seed}|${i}|${r}`) });
    spots.sort((p, q) => p.k - q.k);
    for (const { a, r } of spots) {
      const x = at.x + Math.cos(a) * r;
      const y = at.y + Math.sin(a) * r;
      if (!fits(x, y)) continue;
      for (let k = 0; k < 12; k++) {
        const b = (k / 12) * Math.PI * 2;
        if (ground.sea(x + Math.cos(b) * DIRECTOR.waterM, y + Math.sin(b) * DIRECTOR.waterM)) return { x, y, facing: b };
      }
    }
    return null;
  }
  for (let i = 0; i < DIRECTOR.tries; i++) {
    const a = unit(`${seed}|a|${i}`) * Math.PI * 2;
    const r = r0 + unit(`${seed}|r|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (fits(x, y)) return { x, y, facing: unit(`${seed}|f|${i}`) * Math.PI * 2 };
  }
  return null;
}

/**
 * Walking past, one step at a time: `near` once the stranger has come within `noticeM`; `passed` when,
 * after that, they are beyond `goneM` without having acted.
 */
export function passStep(wasNear: boolean, distM: number): { near: boolean; passed: boolean } {
  const near = wasNear || distM <= DIRECTOR.noticeM;
  return { near, passed: near && distM > DIRECTOR.goneM };
}
