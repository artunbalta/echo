/**
 * Inside a house (DECISIONS C54): one room, laid out from who lives in it — a bed for each of them,
 * the couple's together, a cradle for the smallest; the hearth under the chimney; a table with a bench
 * either side; a chest, a shelf; and the tools of the trade by the door.
 *
 * FROM THE HOUSEHOLD, LIKE EVERYTHING. Nothing here is stored or drawn at random: the room is a pure
 * function of the plot, the day and the people who sleep there, so the house a stranger forces at
 * dusk has the same beds in it for anyone who looks in, and the family asleep in them are the family
 * the schedule sent home (`homeState`).
 *
 * THE HOUSE'S OWN FRAME, AS ITS WALLS ARE DRAWN: `u` along the way the door faces (the plot's depth,
 * the door at +depth/2), `v` across it (the drawing's z), the floor at zero. Where the door and the
 * chimney are is the drawing's (`villageGeometry.ts` draws them from its own variation stream), so the
 * caller hands them in and the room is built round them.
 *
 * WHAT A FORCED DOOR LEAVES (C45's `forced` mark): the door down on the floor inside, a stool knocked
 * over, and whoever is home up and against the back wall, watching the doorway — not asleep.
 *
 * Pure.
 */

import { present } from "./life.js";
import { ageYears, occupationOn, type Occupation, type Person, type Settlement } from "./society.js";
import { residentsOn, type Plot, type VillagePlan } from "./village.js";

export type FurnitureKind =
  | "floor" | "wall" | "hearth" | "fire" | "table" | "bench" | "bed" | "blanket" | "cradle" | "chest" | "shelf" | "pot"
  | "nets" | "loom" | "anvil" | "wheel" | "sacks" | "tools" | "door-down" | "stool" | "dust";

/** A box in the room: its centre on the floor plan, its size, and how high it stands. */
export interface Furniture {
  kind: FurnitureKind;
  u: number;
  v: number;
  /** Bottom above the floor, metres. */
  y: number;
  /** Size along `u`, up, and along `v`. */
  du: number;
  dy: number;
  dv: number;
  /** Turned about the vertical, radians (a stool on its side is still a box, turned). */
  turn?: number;
  /** Blocks a body walking: the bed and the table do, a blanket does not. */
  solid: boolean;
}

/** Where someone of the house is, inside it: in bed, or at the table. */
export interface Spot {
  u: number;
  v: number;
  /** For a bed: the way the head lies (radians in the house frame, 0 = +u). At the table: the way they face. */
  heading: number;
}

export interface Room {
  plot: number;
  depthM: number;
  widthM: number;
  door: { u: number; v: number };
  items: Furniture[];
  /** Where each person sleeps: the foot of their place in bed, and the way their head lies. */
  beds: Map<string, Spot>;
  /** Where each sits by day. */
  seats: Map<string, Spot>;
  /** Where whoever is home stands when the door has been forced: the back wall, facing the door. */
  wall: Map<string, Spot>;
  /** Nobody lives here. */
  empty: boolean;
}

export const ROOM = {
  /** Inner wall thickness, and how high the inner walls are drawn (the cutaway's height). */
  wallM: 0.14,
  wallHeightM: 1.4,
  /** A bed: a single, and a pair's. */
  bedLongM: 1.95,
  singleM: 0.9,
  doubleM: 1.45,
  bedHeightM: 0.42,
} as const;

/** The trade a house keeps by its door, if any. */
const TRADE_KIT: Partial<Record<Occupation, FurnitureKind>> = {
  fisher: "nets",
  weaver: "loom",
  smith: "anvil",
  potter: "wheel",
  farmer: "sacks",
  carpenter: "tools",
  stonecutter: "tools",
  miner: "tools",
};

/**
 * The room in a house on a day. `door` and `hearth` are across-positions (`v`) of the doorway in the
 * front wall and the chimney at the back, as the house was drawn. `forced` is whether C45's mark stands.
 */
export function roomOf(
  s: Settlement,
  plan: VillagePlan,
  plot: Plot,
  day: number,
  where: { door: number; hearth: number },
  forced = false,
): Room {
  const d = plot.depthM;
  const w = plot.widthM;
  const t = ROOM.wallM;
  const items: Furniture[] = [];
  const box = (kind: FurnitureKind, u: number, v: number, du: number, dy: number, dv: number, y = 0, solid = true, turn?: number) =>
    items.push({ kind, u, v, du, dy, dv, y, solid, ...(turn !== undefined ? { turn } : {}) });

  // The shell: a plank floor, and the walls from inside (the drawing's walls face outward only).
  box("floor", 0, 0, d, 0.04, w, 0, false);
  box("wall", -d / 2 + t / 2, 0, t, ROOM.wallHeightM, w, 0, false);
  box("wall", 0, w / 2 - t / 2, d, ROOM.wallHeightM, t, 0, false);
  box("wall", 0, -w / 2 + t / 2, d, ROOM.wallHeightM, t, 0, false);
  // The front wall, in two pieces either side of the doorway.
  const gap = 1.0;
  const left = -w / 2;
  const right = w / 2;
  const a = where.door - gap / 2;
  const b = where.door + gap / 2;
  if (a - left > 0.05) box("wall", d / 2 - t / 2, (left + a) / 2, t, ROOM.wallHeightM, a - left, 0, false);
  if (right - b > 0.05) box("wall", d / 2 - t / 2, (b + right) / 2, t, ROOM.wallHeightM, right - b, 0, false);

  const people = residentsOn(s, plan, day).filter((r) => r.plot.index === plot.index && present(s, r.person, day)).map((r) => r.person);
  const empty = people.length === 0;
  const beds = new Map<string, Spot>();
  const seats = new Map<string, Spot>();
  const wall = new Map<string, Spot>();

  // The hearth, under the chimney: against the side wall, a quarter of the way from the back (where
  // the drawing puts the chimney), stone, with a fire in it while anyone lives here.
  const hs = where.hearth >= 0 ? 1 : -1;
  const hearthU = -d / 4;
  box("hearth", hearthU, hs * (w / 2 - t - 0.4), 1.2, 0.55, 0.8);
  if (!empty) box("fire", hearthU, hs * (w / 2 - t - 0.45), 0.6, 0.22, 0.42, 0.55, false);

  if (empty) {
    // An emptied house: what was not worth taking.
    box("stool", 0.4, -hs * 0.8, 0.4, 0.4, 0.4, 0, true, 0.6);
    box("pot", -d / 2 + t + 0.3, -hs * (w / 2 - t - 0.4), 0.3, 0.3, 0.3);
    box("dust", 0, 0, d * 0.6, 0.01, w * 0.6, 0.04, false);
    return { plot: plot.index, depthM: d, widthM: w, door: { u: d / 2, v: where.door }, items, beds, seats, wall, empty };
  }

  // Beds: heads to the back wall, side by side, from the side away from the hearth; then, if the back
  // wall is full, along that side wall, heads to it. A crowded house shares the last bed.
  const sleepers = [...people].sort((x, y) => x.birthDay - y.birthDay);
  const placed = new Set<string>();
  const groups: { kind: "double" | "single" | "cradle"; who: Person[] }[] = [];
  for (const p of sleepers) {
    if (placed.has(p.id)) continue;
    const partner = p.partner !== null ? s.people[p.partner] : null;
    if (partner && people.some((q) => q.id === partner.id) && !placed.has(partner.id)) {
      groups.push({ kind: "double", who: [p, partner] });
      placed.add(p.id);
      placed.add(partner.id);
      continue;
    }
    groups.push({ kind: ageYears(p, day) < 4 ? "cradle" : "single", who: [p] });
    placed.add(p.id);
  }
  const away = -hs;
  const backU = -d / 2 + t;
  const long = ROOM.bedLongM;
  // The back wall runs from the far side wall to short of the hearth's corner.
  const backFrom = away * (w / 2 - t);
  const backTo = hs * (w / 2 - t - (hearthU - 0.6 < backU + long ? 0.95 : 0));
  const sideFrom = backU + long + 0.2;
  const sideTo = d / 2 - t - 1.2;
  let along = 0; // metres used along the back wall, from backFrom toward backTo
  let sideUsed = 0;
  let lastBed: { u: number; v: number; head: number; long: number } | null = null;
  for (const g of groups) {
    const size = g.kind === "double" ? ROOM.doubleM : g.kind === "single" ? ROOM.singleM : 0.6;
    const len = g.kind === "cradle" ? 0.9 : long;
    let bed: { u: number; v: number; head: number; long: number } | null = null;
    if (along + size <= Math.abs(backTo - backFrom)) {
      // Against the back wall: centred `size` wide across, lying along u.
      const v = backFrom - away * (along + size / 2);
      bed = { u: backU + len / 2, v, head: Math.PI, long: len };
      if (g.kind === "cradle") box("cradle", bed.u, v, len, 0.5, size);
      else {
        box("bed", bed.u, v, len, ROOM.bedHeightM, size);
        box("blanket", bed.u + 0.25, v, len - 0.5, 0.06, size - 0.08, ROOM.bedHeightM, false);
      }
      along += size + 0.15;
    } else if (sideFrom + sideUsed + size <= sideTo) {
      // Along the far side wall, forward of the back beds: lying along v, head to the wall.
      const u = sideFrom + sideUsed + size / 2;
      const v = away * (w / 2 - t - len / 2);
      bed = { u, v, head: away > 0 ? Math.PI / 2 : -Math.PI / 2, long: len };
      if (g.kind === "cradle") box("cradle", u, v, size, 0.5, len);
      else {
        box("bed", u, v, size, ROOM.bedHeightM, len);
        box("blanket", u, v - away * 0.25, size - 0.08, 0.06, len - 0.5, ROOM.bedHeightM, false);
      }
      sideUsed += size + 0.15;
    }
    const at = bed ?? lastBed!;
    g.who.forEach((p, i) => {
      const off = g.who.length === 2 ? (i === 0 ? -0.33 : 0.33) : bed ? 0 : 0.2;
      // The foot of their place, and the way the head lies: to the back wall, or to the side wall.
      if (at.head === Math.PI) beds.set(p.id, { u: at.u + at.long / 2 - 0.15, v: at.v + off, heading: Math.PI });
      else beds.set(p.id, { u: at.u + off, v: at.v - Math.sign(at.v) * (at.long / 2 - 0.15), heading: at.head });
    });
    if (bed) lastBed = bed;
  }

  // The table in the front half, clear of the beds and the doorway, a bench at either end.
  const front0 = Math.max(backU + long + 0.25, hearthU + 0.75);
  const front1 = d / 2 - t - 1.05;
  const tableU = (front0 + front1) / 2;
  const tableDu = Math.min(0.8, Math.max(0.5, front1 - front0 - 0.1));
  const tableDv = Math.min(1.6, w * 0.28);
  const tableV = Math.max(-w / 2 + t + tableDv / 2 + 0.5, Math.min(w / 2 - t - tableDv / 2 - 0.5, -where.door * 0.5));
  box("table", tableU, tableV, tableDu, 0.75, tableDv);
  box("bench", tableU, tableV - tableDv / 2 - 0.3, 0.9, 0.42, 0.3);
  box("bench", tableU, tableV + tableDv / 2 + 0.3, 0.9, 0.42, 0.3);
  people.forEach((p, i) => {
    const end = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2);
    seats.set(p.id, { u: tableU + (k % 2 === 0 ? -0.22 : 0.22) * Math.min(1, k), v: tableV + end * (tableDv / 2 + 0.3), heading: end < 0 ? Math.PI / 2 : -Math.PI / 2 });
    // Against the back wall when the door has been forced: shoulder to shoulder, facing the doorway.
    wall.set(p.id, { u: backU + long + 0.15, v: (i - (people.length - 1) / 2) * 0.55, heading: 0 });
  });

  // The trade by the front wall, on the side away from the door; a shelf of pots between them if it fits.
  const trade = people.map((p) => TRADE_KIT[occupationOn(p, day)]).find(Boolean);
  const far = where.door > 0 ? -1 : 1;
  const tradeV = far * (w / 2 - t - 0.55);
  if (trade) box(trade, d / 2 - t - 0.5, tradeV, trade === "loom" ? 0.5 : 0.8, trade === "loom" ? 1.2 : 0.55, trade === "loom" ? 1.1 : 0.8);
  const shelfV = (where.door + far * 0.5 + tradeV - far * 0.45) / 2;
  if (Math.abs(tradeV - where.door) > 2.6) {
    box("shelf", d / 2 - t - 0.15, shelfV, 0.3, 1.1, 0.9, 0.3);
    box("pot", d / 2 - t - 0.15, shelfV - 0.2, 0.22, 0.25, 0.22, 1.42, false);
    box("pot", d / 2 - t - 0.15, shelfV + 0.22, 0.25, 0.3, 0.25, 1.42, false);
  }
  // A chest at the foot of the first bed, if there is floor there.
  if (lastBed && front0 - (backU + long) > 0.6) box("chest", backU + long + 0.35, backFrom - away * 0.55, 0.5, 0.5, 0.9);

  // What a forced door leaves.
  if (forced) {
    box("door-down", d / 2 - t - 1.1, where.door, 1.8, 0.08, 0.95, 0, false, 0.15);
    box("stool", front1 - 0.1, where.door * 0.3 + far * 0.9, 0.42, 0.42, 0.42, 0, true, 1.1);
  }
  return { plot: plot.index, depthM: d, widthM: w, door: { u: d / 2, v: where.door }, items, beds, seats, wall, empty };
}

/** A point of the room, in the planet's local metres: `u` along the plot's facing, `v` across as the house is drawn. */
export function roomToLocal(plot: Plot, u: number, v: number): { x: number; y: number } {
  const c = Math.cos(plot.facing);
  const sn = Math.sin(plot.facing);
  // The drawing's +z (v) is the facing turned a quarter clockwise: (sin f, -cos f) in east-north.
  return { x: plot.x + c * u + sn * v, y: plot.y + sn * u - c * v };
}

/** A heading in the house's frame (0 = +u, toward the door; positive toward +v), as a planet-local heading. */
export const roomHeading = (plot: Plot, h: number): number => plot.facing - h;
