/**
 * A stranger's own house, on their own land (DECISIONS C59).
 *
 * ON YOUR OWN PARCEL, AND NOWHERE ELSE. The registry says whose a parcel is (`parcelOf`), and a house
 * goes up only there. It stands on dry ground in the parcel, not too steep, and clear of whatever
 * village shares the land: its houses, fields, dock, green, mine, graves and paths. A village on
 * your land is still the village's (C25).
 *
 * BUILT IN STAGES, FROM WHAT YOU CARRY. Stake it out where you stand, facing the way you face. Then
 * four stages, each a stretch of work and the materials for it:
 *
 * - foundation stones;
 * - walls of driftwood and branches;
 * - a thatch of reeds;
 * - a door.
 *
 * The pack holds eight things, so a house is several trips. That is the point.
 *
 * MADE YOURS, TWO WAYS, AND BOTH ARE MEASURED.
 *
 * - **The catalogue's J1, customising:** paint the door or the walls, or dye your own clothes. Each
 *   costs a dye from the pack: berries for red, herbs for green, shells for lime white, ore for rust.
 *   Taste with a price on it, as the catalogue asks.
 * - **J5, order against chaos:** what you set down inside. Each thing goes down square — turned with
 *   the walls and pushed flush to the nearest one — or as it is, at your feet, turned however you are
 *   standing. The catalogue's own advice: offer an easy tidy and an easy chaos, so what is chosen is
 *   the person and not the interface. `orderliness` reads the room for alignment, things against the
 *   walls or on the middle line, and pairs mirrored across it.
 *
 * NOTHING HERE IS A SCORE (Design Law 1). The orderliness is a reading for the echo, never shown, and
 * a house is not worth anything.
 *
 * Pure.
 */

import { cellAtLocal } from "./crossing.js";
import type { Pack } from "./items.js";
import type { TangentPatch } from "./scene.js";
import type { VillagePlan } from "./village.js";

export const HOME = {
  /** Outside measurements: along the way the door faces, and across. */
  depthM: 5.2,
  widthM: 4.2,
  wallM: 0.14,
  wallHeightM: 2.1,
  /** The doorway, across the front wall. */
  doorM: 1.0,
  /** How far a house keeps from the village's things, beyond their own size. */
  clearM: 3,
  /** How far the ground may fall across the footprint, metres. */
  slopeM: 1.4,
  /** At most this many things set down inside. */
  maxItems: 24,
} as const;

export type StageId = "foundation" | "walls" | "roof" | "door";

export interface Stage {
  id: StageId;
  label: string;
  needs: Record<string, number>;
  /** Seconds of work. */
  holdS: number;
  beat: string;
}

/** A house's stages, in order. `Home.stage` counts those done: 0 staked, 4 a house. */
export const STAGES: readonly Stage[] = [
  { id: "foundation", label: "Lay the foundation stones", needs: { stone: 4 }, holdS: 10, beat: "Four corners, set level. It will stand." },
  { id: "walls", label: "Raise the walls", needs: { driftwood: 4, "dry branch": 2 }, holdS: 14, beat: "Walls. You can stand inside something now." },
  { id: "roof", label: "Thatch the roof", needs: { reed: 6 }, holdS: 12, beat: "The reeds lie close. It will keep the rain off." },
  { id: "door", label: "Hang the door", needs: { driftwood: 2 }, holdS: 8, beat: "It swings, and it shuts. A house." },
];

/** What a colour is made from, and what it is called. A dye is used up. */
export const DYES: Record<string, { name: string; hex: number }> = {
  berries: { name: "berry red", hex: 0x8e2f3a },
  herbs: { name: "leaf green", hex: 0x4f7a3a },
  shell: { name: "lime white", hex: 0xe8e2d4 },
  ore: { name: "rust", hex: 0x8a4a2a },
};

/** What can be set down in a house, and the room it takes: along its length, across, and up. */
export interface Placeable {
  du: number;
  dv: number;
  dy: number;
  /** Blocks a body walking. */
  solid: boolean;
}

export const PLACEABLE: Record<string, Placeable> = {
  bed: { du: 1.95, dv: 0.9, dy: 0.42, solid: true },
  table: { du: 1.1, dv: 0.7, dy: 0.75, solid: true },
  stool: { du: 0.36, dv: 0.36, dy: 0.45, solid: false },
  shelf: { du: 0.9, dv: 0.3, dy: 1.3, solid: true },
  basket: { du: 0.45, dv: 0.45, dy: 0.35, solid: false },
  pot: { du: 0.32, dv: 0.32, dy: 0.4, solid: false },
  bowl: { du: 0.22, dv: 0.22, dy: 0.1, solid: false },
  /** Laid on the floor, a rug. */
  cloth: { du: 1.2, dv: 0.8, dy: 0.02, solid: false },
  /** Stood in a corner, a lamp. */
  torch: { du: 0.15, dv: 0.15, dy: 1.1, solid: false },
};

/** A thing set down: its centre in the house's frame, and how it is turned. */
export interface Placed {
  kind: string;
  /** Toward the door from the middle of the floor, metres. */
  u: number;
  /** Across, to the left facing the door. */
  v: number;
  /** Radians from the house's own axis. */
  turn: number;
}

export interface Home {
  cell: string;
  /** The middle of the floor, in the parcel's local metres. */
  x: number;
  y: number;
  /** The way the door faces, radians (0 east, π/2 north). */
  facing: number;
  /** Stages done: 0 staked … 4 a house. */
  stage: number;
  /** Painted parts, by dye. */
  colours: { door?: string; walls?: string };
  items: Placed[];
  madeDay: number;
}

/** A stranger's own look (C59), by dye. Only the shirt so far. */
export interface Look {
  shirt?: string;
}

// ── frames ──────────────────────────────────────────────────────────────────────

/** A point in the parcel's local metres, in the house's own frame. */
export function toHouse(h: Pick<Home, "x" | "y" | "facing">, x: number, y: number): { u: number; v: number } {
  const c = Math.cos(h.facing);
  const s = Math.sin(h.facing);
  const dx = x - h.x;
  const dy = y - h.y;
  return { u: dx * c + dy * s, v: -dx * s + dy * c };
}

/** The other way. */
export function fromHouse(h: Pick<Home, "x" | "y" | "facing">, u: number, v: number): { x: number; y: number } {
  const c = Math.cos(h.facing);
  const s = Math.sin(h.facing);
  return { x: h.x + u * c - v * s, y: h.y + u * s + v * c };
}

const innerU = HOME.depthM / 2 - HOME.wallM;
const innerV = HOME.widthM / 2 - HOME.wallM;

/** Within the walls (the floor), with a margin inward. */
export function insideHome(h: Pick<Home, "x" | "y" | "facing">, x: number, y: number, margin = 0): boolean {
  const { u, v } = toHouse(h, x, y);
  return Math.abs(u) < innerU - margin && Math.abs(v) < innerV - margin;
}

/** Whether a body at a point would be in a wall: the four walls, less the doorway, once they stand. */
export function inWall(h: Pick<Home, "x" | "y" | "facing" | "stage">, x: number, y: number, radiusM: number): boolean {
  if (h.stage < 2) return false;
  const { u, v } = toHouse(h, x, y);
  const outU = HOME.depthM / 2 + radiusM;
  const outV = HOME.widthM / 2 + radiusM;
  if (Math.abs(u) > outU || Math.abs(v) > outV) return false;
  const inU = innerU - radiusM;
  const inV = innerV - radiusM;
  if (Math.abs(u) < inU && Math.abs(v) < inV) return false;
  // In the band of the walls: the doorway in the front wall lets a body through, once the door is hung
  // or before it is; a door is a door, not a wall.
  return !(u > 0 && Math.abs(v) < HOME.doorM / 2 - radiusM);
}

// ── where a house may stand ─────────────────────────────────────────────────────

export interface SiteGround {
  /** The parcel, its frame. */
  cell: string;
  patch: TangentPatch;
  /** Dry ground a body can stand on. */
  standable(x: number, y: number): boolean;
  heightAt(x: number, y: number): number;
  /** The village that shares the land, if any. */
  plan: VillagePlan | null;
}

export type SiteProblem = "not-yours" | "water" | "steep" | "village";

const toSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
};

/** Why a house cannot go here, facing this way; null when it can. */
export function siteProblem(g: SiteGround, x: number, y: number, facing: number): SiteProblem | null {
  const h = { x, y, facing };
  const heights: number[] = [];
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const u = (i / 4 - 0.5) * (HOME.depthM + 0.6);
      const v = (j / 4 - 0.5) * (HOME.widthM + 0.6);
      const p = fromHouse(h, u, v);
      if (cellAtLocal(g.patch, p.x, p.y) !== g.cell) return "not-yours";
      if (!g.standable(p.x, p.y)) return "water";
      heights.push(g.heightAt(p.x, p.y));
    }
  }
  if (Math.max(...heights) - Math.min(...heights) > HOME.slopeM) return "steep";
  const plan = g.plan;
  if (plan) {
    const me = Math.hypot(HOME.depthM, HOME.widthM) / 2;
    const at = { x, y };
    const near = (px: number, py: number, r: number) => Math.hypot(px - x, py - y) < r + me + HOME.clearM;
    if (near(plan.centre.x, plan.centre.y, plan.greenRadiusM)) return "village";
    for (const p of plan.plots) if (near(p.x, p.y, Math.hypot(p.depthM, p.widthM) / 2)) return "village";
    for (const f of plan.fields) if (near(f.x, f.y, Math.hypot(f.lengthM, f.widthM) / 2)) return "village";
    if (plan.mine && near(plan.mine.x, plan.mine.y, 4)) return "village";
    if (plan.graveyard && near(plan.graveyard.x, plan.graveyard.y, plan.graveyard.radiusM)) return "village";
    if (plan.dock && toSegment(at, plan.dock.root, plan.dock.tip) < me + HOME.clearM) return "village";
    for (const [a, b] of plan.paths) if (toSegment(at, a, b) < me + 1) return "village";
  }
  return null;
}

// ── building ────────────────────────────────────────────────────────────────────

/** The next stage to build, or null for a finished house. */
export const nextStage = (h: Pick<Home, "stage">): Stage | null => STAGES[h.stage] ?? null;

/** Whether the pack holds what a stage takes. */
export function canBuild(pack: Pack, stage: Stage): boolean {
  return Object.entries(stage.needs).every(([id, n]) => (pack[id] ?? 0) >= n);
}

/** The pack after a stage's materials go into the house. */
export function spend(pack: Pack, stage: Stage): Pack | null {
  if (!canBuild(pack, stage)) return null;
  const next: Pack = { ...pack };
  for (const [id, n] of Object.entries(stage.needs)) {
    next[id] = (next[id] ?? 0) - n;
    if (next[id] === 0) delete next[id];
  }
  return next;
}

// ── setting things down ─────────────────────────────────────────────────────────

const QUARTER = Math.PI / 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How far a thing reaches from its centre along u and v, turned as it is. */
function extent(kind: string, turn: number): { eu: number; ev: number } {
  const p = PLACEABLE[kind] ?? { du: 0.4, dv: 0.4 };
  const c = Math.abs(Math.cos(turn));
  const s = Math.abs(Math.sin(turn));
  return { eu: (c * p.du + s * p.dv) / 2, ev: (s * p.du + c * p.dv) / 2 };
}

/** Kept on the floor: no part of it through a wall. */
function keepIn(kind: string, u: number, v: number, turn: number): { u: number; v: number } {
  const { eu, ev } = extent(kind, turn);
  const gap = 0.02;
  return {
    u: Math.max(-innerU + eu + gap, Math.min(innerU - eu - gap, u)),
    v: Math.max(-innerV + ev + gap, Math.min(innerV - ev - gap, v)),
  };
}

/**
 * Set down square: turned to the nearest quarter of the walls, a step ahead of you, and pushed flush
 * to the nearest wall if it is within reach of one.
 */
export function placeSquare(kind: string, body: { u: number; v: number; turn: number }): Placed {
  const turn = Math.round(body.turn / QUARTER) * QUARTER;
  const ahead = keepIn(kind, body.u + Math.cos(body.turn) * 0.7, body.v + Math.sin(body.turn) * 0.7, turn);
  const { eu, ev } = extent(kind, turn);
  const gaps = [
    { d: innerU - (ahead.u + eu), set: () => ({ u: innerU - eu - 0.02, v: ahead.v }) },
    { d: ahead.u - eu + innerU, set: () => ({ u: -innerU + eu + 0.02, v: ahead.v }) },
    { d: innerV - (ahead.v + ev), set: () => ({ u: ahead.u, v: innerV - ev - 0.02 }) },
    { d: ahead.v - ev + innerV, set: () => ({ u: ahead.u, v: -innerV + ev + 0.02 }) },
  ].sort((a, b) => a.d - b.d);
  const at = gaps[0]!.d < 0.7 ? gaps[0]!.set() : ahead;
  return { kind, u: at.u, v: at.v, turn: wrap(turn) };
}

/** Set down as it is: a step ahead of you, turned however you are standing. */
export function placeLoose(kind: string, body: { u: number; v: number; turn: number }): Placed {
  const at = keepIn(kind, body.u + Math.cos(body.turn) * 0.7, body.v + Math.sin(body.turn) * 0.7, body.turn);
  return { kind, u: at.u, v: at.v, turn: wrap(body.turn) };
}

/** Turned an eighth of the way round where it stands, and kept off the walls. */
export function turnPlaced(p: Placed): Placed {
  const turn = wrap(p.turn + Math.PI / 4);
  return { ...p, ...keepIn(p.kind, p.u, p.v, turn), turn };
}

/**
 * How orderly a room is, 0 (as things fell) … 1 (squared, against the walls, mirrored); null with
 * fewer than two things in it, which is no arrangement to read. Each thing counts:
 *
 * - 0.45 for being turned with the walls;
 * - 0.35 for standing against one, or on the middle line;
 * - 0.2 for having a twin mirrored across that line, or for being on it.
 */
export function orderliness(items: readonly Placed[]): number | null {
  if (items.length < 2) return null;
  let sum = 0;
  for (const it of items) {
    const off = Math.abs(wrap(it.turn - Math.round(it.turn / QUARTER) * QUARTER));
    const aligned = 1 - Math.min(1, off / (Math.PI / 8));
    const { eu, ev } = extent(it.kind, it.turn);
    const toWall = Math.min(innerU - (it.u + eu), it.u - eu + innerU, innerV - (it.v + ev), it.v - ev + innerV);
    const onLine = Math.abs(it.v) < 0.12;
    const placed = toWall < 0.15 || onLine ? 1 : 0;
    const twin = onLine || items.some((o) => o !== it && o.kind === it.kind && Math.abs(o.u - it.u) < 0.25 && Math.abs(o.v + it.v) < 0.25) ? 1 : 0;
    sum += 0.45 * aligned + 0.35 * placed + 0.2 * twin;
  }
  return sum / items.length;
}

/** Where J5 is read from a room: orderly at or above this, as things fell at or below `organic`. */
export const ARRANGEMENT = { orderly: 0.65, organic: 0.4 } as const;
