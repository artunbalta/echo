/**
 * The village on the ground (DECISIONS C41): where a settlement's houses stand, which family lived in
 * which one and in what order, the dock where it has a shore, its fields, its green and its graves —
 * as a pure function of the settlement, the ground and the arrival point.
 *
 * WHY THE GROUND IS INJECTED. The two questions a house asks of the ground — how high is it here, and
 * can anything stand here — are answered in the browser by the same height function the terrain mesh
 * is drawn from (`WorldFrame.heightAtTile`, `walkableTile`). Taking them as two functions, in
 * `geography.ts`'s idiom, keeps this module free of the terrain field and the tangent patch, and
 * testable against a coastline written by hand in a millisecond.
 *
 * L2, ONE MORE TIME. A house built a hundred years ago must still be standing where it was when the
 * village is read to a later day. So plots are created in HOUSEHOLD order, each household takes the
 * first plot that was free on the day it was founded or the next site in a fixed sequence, and
 * nothing about a plot depends on who is alive now. "Free on the day" is safe for the reason
 * `life.ts` gives everywhere: whether a household had emptied by a day is settled by that day. (A
 * child who pairs after the horizon leaves their parents' household unclosed either way: an unpaired
 * child's death and a paired child's wedding are both after the day being asked about.)
 *
 * WHAT IS STATIC AND WHAT IS TODAY. The green, the fields, the graveyard's site and the dock are
 * properties of the place — its capacity and its ground — and are laid out first, so the houses are
 * fitted around them and never the other way round. Which houses are lived in, which have fallen in,
 * which graves are dug and which boats are moored are properties of the day, and are read off it.
 *
 * THE VILLAGE DECIDES THE ARRIVAL, NOT THE OTHER WAY ROUND. The first draft laid the village out in
 * front of the parcel's spawn, and on Konreef — coastal 0.83 — that put a fishing village with no
 * dock six hundred metres inland of its own sea, because the sea was past the spawn's 280 m sight
 * line. So the green goes where the ground says (a setback inland of the nearest shore, or the flat
 * ground nearest the cell's centre), and the arrival point is the village's edge, looking in.
 * Everything about it is a function of the place, so it never moves as the village grows.
 *
 * NO LADDER (Design Law 1). A bigger house on a road town is the ground and the trade route showing,
 * not a number anybody holds. Nothing here is a rank, a wealth or a score.
 *
 * Pure: no clock, no I/O, no cache. Coordinates are PLANET-LOCAL METRES, east and north.
 */

import { DAYS_PER_YEAR, yearsToDays } from "./worldclock.js";
import { hash01, occupationOn, stream, type Household, type Person, type Settlement } from "./society.js";
import { present } from "./life.js";

// ── what the module needs and returns ───────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface VillageGround {
  /** Metres above sea level at a planet-local point; negative under water. */
  heightAt(x: number, y: number): number;
  /** Dry land inside the region: somewhere a house can stand and a body can walk. */
  standable(x: number, y: number): boolean;
}

export interface VillageSite {
  /** The cell's own centre, planet-local: (0, 0) in the anchor's frame. */
  origin: Point;
  /**
   * The nearest open water to the cell's centre, where it is near enough to build at. A fishing
   * village stands on its shore, not six hundred metres inland of it, so this decides WHERE the
   * village is and not only whether it has a dock.
   */
  shore: Point | null;
}

/** What the walls are made of. The ground decides, not the culture: you build with what is there. */
export type WallMaterial = "stone" | "timber" | "wattle";
export type RoofMaterial = "slate" | "shingle" | "thatch" | "tile";

export interface VillageStyle {
  walls: WallMaterial;
  roof: RoofMaterial;
  /** Roof pitch, radians. The culture decides this one: how your grandparents built. */
  pitch: number;
  /** The chance a house near the green has a second storey. The trade route shows here. */
  storeyChance: number;
  culture: string;
}

export interface Plot {
  index: number;
  x: number;
  y: number;
  /** Radians, planet-local (0 = east, π/2 = north): the way the door faces. Toward the green. */
  facing: number;
  widthM: number;
  depthM: number;
  storeys: 1 | 2;
  /** Every household that lived here, in the order they did. */
  households: readonly number[];
}

/** What a plot is today. `null` from {@link plotState} means nothing is left to see. */
export type PlotState = "lived" | "empty" | "ruin" | "foundation";

export interface Dock {
  /** Where it leaves the land. */
  root: Point;
  /** Where it ends, over water. */
  tip: Point;
  /** Radians, planet-local, root to tip. */
  heading: number;
  lengthM: number;
}

export interface Field {
  x: number;
  y: number;
  /** Radians, planet-local, along the long side. */
  heading: number;
  lengthM: number;
  widthM: number;
}

export interface Grave {
  x: number;
  y: number;
  /** The person buried here most recently. Slots are reused once the yard is full, as they are. */
  person: string;
  deathDay: number;
}

export interface Graveyard {
  x: number;
  y: number;
  radiusM: number;
  /** How many graves the yard holds before the oldest slot is dug again. */
  slots: number;
}

export interface VillagePlan {
  name: string;
  culture: string;
  style: VillageStyle;
  centre: Point;
  greenRadiusM: number;
  /**
   * Where a visitor arrives, and the way they face: at the village's edge, looking in. It is a
   * function of the place and never of the day, so it does not move as the village grows.
   */
  arrival: Point;
  arrivalFacing: Point;
  plots: Plot[];
  dock: Dock | null;
  fields: Field[];
  graveyard: Graveyard | null;
  /**
   * Benches round the green, facing the well, where the old sit through the day. Two seats each, a
   * metre apart along the bench. Static: the place has them whoever sits on them.
   */
  benches: { x: number; y: number; heading: number }[];
  /** Ground the vegetation has to leave bare, for the scatter layer. */
  clearings: { x: number; y: number; radiusM: number }[];
  /** Centrelines worn between the places people walk, for the scatter layer. */
  paths: [Point, Point][];
}

// ── the dials ───────────────────────────────────────────────────────────────────

export const VILLAGE = {
  /** The green at the centre: a well, and where people gather in the evening. */
  greenMinM: 7,
  greenPerCapacityM: 0.06,
  /** No house or field within this of the arrival point. You do not arrive in somebody's kitchen. */
  arrivalClearM: 12,
  /**
   * How far outside the outermost ring of houses the arrival point stands. Was 16: on Konreef that
   * left the nearest house 40-50 m away and seven seconds of walking barely closed it.
   */
  arrivalOutsideM: 6,
  /** How far inland from the shore the green keeps, where there is a shore. */
  shoreSetbackM: 42,
  /** Beyond this from the cell's centre a shore belongs to somewhere else, and the village is inland. */
  shoreMaxM: 760,
  /** How far from the cell's centre an inland village's green may be. */
  inlandMaxM: 420,
  /**
   * Rings of house sites around the green, and how close two houses may stand. Tightened from
   * 20/15/13 after the first aerial view of Konreef read as a scatter of cottages in a field rather
   * than as a village: a house is 5-8 m across, so 11 m centre to centre still leaves a yard between.
   */
  firstRingM: 16,
  ringStepM: 12,
  maxRings: 11,
  /** Centre to centre, no closer. */
  plotSpacingM: 11,
  /** Tallest difference in ground under one house's four corners and centre. */
  maxPlotReliefM: 1.8,
  /** A household moves into an emptied house no sooner than this. */
  reuseGapYears: 3,
  /** How long an emptied house stands before it falls in, and how long the ruin lasts. */
  emptyYears: 8,
  ruinYears: 60,
  foundationYears: 160,
  /** A dock is built where the shore is this close to the green. */
  dockMaxShoreM: 260,
  dockMinM: 10,
  dockMaxM: 26,
  /** Fields: how many per unit of capacity times arable, and their size. */
  fieldsPerArableCapacity: 0.1,
  maxFields: 12,
  fieldLengthM: 34,
  fieldWidthM: 20,
  maxFieldReliefM: 3.5,
  /** Graves: spacing along a row and between rows, and how many the yard is sized for. */
  graveAlongM: 1.7,
  graveRowM: 2.7,
  gravesPerCapacity: 4,
  minGraveSlots: 60,
} as const;

// ── style ───────────────────────────────────────────────────────────────────────

/** Roof pitch by naming culture: steep thatch in the vales, low slate in the uplands. */
const CULTURE_PITCH: Record<string, number> = {
  vale: 0.78,
  coast: 0.55,
  upland: 0.42,
  road: 0.62,
};

/**
 * What a village is built of. Walls and roof come from the GROUND — stone where there is rock,
 * timber where there are trees, wattle and daub where there is neither — because people build with
 * what is there. The culture gives only the pitch: the naming culture is drawn independently of the
 * ground (`society.ts`, `CULTURES[floor(rs() * 4)]`), so a "coast" village can stand far inland, and
 * reading that as history (the founders came from a coast) is the honest reading of it.
 */
export function styleOf(s: Settlement): VillageStyle {
  const g = s.geography;
  const walls: WallMaterial = g.mountain >= 0.5 ? "stone" : g.wooded >= 0.4 ? "timber" : "wattle";
  let roof: RoofMaterial = walls === "stone" ? "slate" : walls === "timber" ? "shingle" : "thatch";
  // Fired tile is bought, not found: it arrives on a trade route.
  if (g.tradeAccess >= 0.5 && walls !== "stone") roof = "tile";
  const storeyChance = Math.max(0, Math.min(0.6, (g.tradeAccess - 0.3) * 1.2));
  return { walls, roof, pitch: CULTURE_PITCH[s.culture] ?? 0.6, storeyChance, culture: s.culture };
}

// ── geometry helpers ────────────────────────────────────────────────────────────

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const along = (p: Point, dir: Point, d: number): Point => ({ x: p.x + dir.x * d, y: p.y + dir.y * d });
const unit = (a: number): Point => ({ x: Math.cos(a), y: Math.sin(a) });

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Height relief and standability over a rectangle's corners and centre. */
function footprintOk(ground: VillageGround, x: number, y: number, heading: number, l: number, w: number, maxRelief: number): boolean {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const pts: Point[] = [{ x, y }];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    pts.push({ x: x + c * (a * l) / 2 - s * (b * w) / 2, y: y + s * (a * l) / 2 + c * (b * w) / 2 });
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    if (!ground.standable(p.x, p.y)) return false;
    const h = ground.heightAt(p.x, p.y);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi - lo <= maxRelief;
}

const clear = (p: Point, r: number, keepOut: readonly Circle[]): boolean =>
  keepOut.every((k) => Math.hypot(p.x - k.x, p.y - k.y) >= r + k.r);

// ── the place ───────────────────────────────────────────────────────────────────

/**
 * Where the green goes. On a coast: the first flat, dry ground a setback inland of the shore nearest
 * the cell's centre, swinging along the shore when the first line inland is too steep. Inland, or
 * where the shore gives nothing: the flattest dry ground nearest the cell's centre, in a spiral.
 */
function findCentre(ground: VillageGround, site: VillageSite, greenR: number): Point | null {
  const fits = (p: Point) => footprintOk(ground, p.x, p.y, 0, greenR * 2, greenR * 2, VILLAGE.maxPlotReliefM * 1.5);
  const shore = site.shore;
  if (shore !== null && dist(site.origin, shore) <= VILLAGE.shoreMaxM) {
    const back = Math.atan2(site.origin.y - shore.y, site.origin.x - shore.x);
    for (let swing = 0; swing < 13; swing++) {
      const a = back + (swing % 2 === 0 ? 1 : -1) * Math.ceil(swing / 2) * 0.18;
      const dir = unit(a);
      // The first dry metre walking inland from the water, then the setback.
      let landfall: Point | null = null;
      for (let d = 0; d <= 220; d += 2) {
        const p = along(shore, dir, d);
        if (ground.standable(p.x, p.y)) {
          landfall = p;
          break;
        }
      }
      if (landfall === null) continue;
      for (let extra = 0; extra <= 60; extra += 6) {
        const p = along(landfall, dir, VILLAGE.shoreSetbackM + extra);
        if (fits(p)) return p;
      }
    }
  }
  for (let r = 0; r <= VILLAGE.inlandMaxM; r += 8) {
    const n = r === 0 ? 1 : 16;
    for (let k = 0; k < n; k++) {
      const p = along(site.origin, unit((k / n) * Math.PI * 2 + r * 0.01), r);
      if (fits(p)) return p;
    }
  }
  return null;
}

/**
 * The arrival point: just outside the outermost ring, on the side away from the graveyard, looking
 * in. Swung round until the ground takes it. Depends on the place alone, so it never moves.
 */
function findArrival(ground: VillageGround, centre: Point, side: Point, outerM: number, keepOut: readonly Circle[]): Point | null {
  const base = Math.atan2(-side.y, -side.x);
  for (let swing = 0; swing < 24; swing++) {
    const a = base + (swing % 2 === 0 ? 1 : -1) * Math.ceil(swing / 2) * 0.16;
    for (const extra of [0, 10, 20]) {
      const p = along(centre, unit(a), outerM + VILLAGE.arrivalOutsideM + extra);
      if (!ground.standable(p.x, p.y)) continue;
      if (!clear(p, VILLAGE.arrivalClearM, keepOut)) continue;
      return p;
    }
  }
  return null;
}

/** How many rings of sites a village of this capacity reaches into: enough for every household it can hold, and some. */
function ringsFor(capacity: number): number {
  const plotsNeeded = Math.ceil(capacity / 3) + 4;
  let sites = 0;
  for (let k = 1; k <= VILLAGE.maxRings; k++) {
    const r = VILLAGE.firstRingM + (k - 1) * VILLAGE.ringStepM;
    sites += Math.floor((2 * Math.PI * r) / VILLAGE.plotSpacingM);
    if (sites >= plotsNeeded * 1.6) return k;
  }
  return VILLAGE.maxRings;
}

function layDock(ground: VillageGround, centre: Point, site: VillageSite, key: string): Dock | null {
  if (site.shore === null) return null;
  const toSea = { x: site.shore.x - centre.x, y: site.shore.y - centre.y };
  const len = Math.hypot(toSea.x, toSea.y);
  if (len === 0 || len > VILLAGE.dockMaxShoreM) return null;
  const dir = { x: toSea.x / len, y: toSea.y / len };
  // March to the last dry metre: that is the shore, and the dock starts there.
  let root: Point | null = null;
  for (let d = 0; d <= len + 40; d += 2) {
    const p = along(centre, dir, d);
    if (ground.standable(p.x, p.y) && ground.heightAt(p.x, p.y) > 0) root = p;
    else if (root !== null) break;
  }
  if (root === null) return null;
  const r = stream(`${key}/dock`);
  const lengthM = VILLAGE.dockMinM + r() * (VILLAGE.dockMaxM - VILLAGE.dockMinM);
  const tip = along(root, dir, lengthM);
  if (ground.heightAt(tip.x, tip.y) >= 0) return null; // the "sea" was a puddle the dock would cross
  return { root, tip, heading: Math.atan2(dir.y, dir.x), lengthM };
}

function layFields(ground: VillageGround, s: Settlement, centre: Point, away: Point, outerM: number, keepOut: Circle[], key: string): Field[] {
  const want = Math.min(VILLAGE.maxFields, Math.round(s.capacity * s.geography.arable * VILLAGE.fieldsPerArableCapacity));
  const fields: Field[] = [];
  if (want <= 0) return fields;
  const awayAngle = Math.atan2(away.y, away.x);
  const r = stream(`${key}/fields`);
  // Two belts landward of the houses, fanning ±80° around the direction away from the sea.
  for (let belt = 0; belt < 3 && fields.length < want; belt++) {
    const radius = outerM + VILLAGE.fieldLengthM * (0.6 + belt * 1.05);
    const n = Math.max(3, Math.floor((radius * ((160 / 180) * Math.PI)) / (VILLAGE.fieldWidthM + 4)));
    for (let i = 0; i < n && fields.length < want; i++) {
      const a = awayAngle + ((i + 0.5) / n - 0.5) * ((160 / 180) * Math.PI) + (r() - 0.5) * 0.08;
      const p = along(centre, unit(a), radius);
      const reach = Math.hypot(VILLAGE.fieldLengthM, VILLAGE.fieldWidthM) / 2;
      if (!clear(p, reach, keepOut)) continue;
      if (!footprintOk(ground, p.x, p.y, a, VILLAGE.fieldLengthM, VILLAGE.fieldWidthM, VILLAGE.maxFieldReliefM)) continue;
      fields.push({ x: p.x, y: p.y, heading: a, lengthM: VILLAGE.fieldLengthM, widthM: VILLAGE.fieldWidthM });
      keepOut.push({ x: p.x, y: p.y, r: reach });
    }
  }
  return fields;
}

function layGraveyard(ground: VillageGround, s: Settlement, centre: Point, side: Point, outerM: number, keepOut: Circle[]): Graveyard | null {
  const slots = Math.max(VILLAGE.minGraveSlots, s.capacity * VILLAGE.gravesPerCapacity);
  const radiusM = Math.sqrt((slots * VILLAGE.graveAlongM * VILLAGE.graveRowM) / Math.PI) + 2;
  const sideAngle = Math.atan2(side.y, side.x);
  for (let step = 0; step < 24; step++) {
    // Off to one side of the arrival line, swinging further round until the ground allows it.
    const a = sideAngle + (step % 2 === 0 ? 1 : -1) * Math.floor(step / 2) * 0.22;
    for (const extra of [0, 14, 28]) {
      const p = along(centre, unit(a), outerM + radiusM + extra);
      if (!clear(p, radiusM, keepOut)) continue;
      if (!footprintOk(ground, p.x, p.y, a, radiusM * 1.6, radiusM * 1.6, VILLAGE.maxFieldReliefM)) continue;
      keepOut.push({ x: p.x, y: p.y, r: radiusM });
      return { x: p.x, y: p.y, radiusM, slots };
    }
  }
  return null;
}

// ── houses ──────────────────────────────────────────────────────────────────────

interface Candidate {
  x: number;
  y: number;
  ring: number;
  key: string;
}

/** The fixed sequence of house sites: ring by ring outward from the green, jittered by the seed. */
function* sites(centre: Point, key: string): Generator<Candidate> {
  for (let ring = 1; ring <= VILLAGE.maxRings; ring++) {
    const radius = VILLAGE.firstRingM + (ring - 1) * VILLAGE.ringStepM;
    const n = Math.floor((2 * Math.PI * radius) / VILLAGE.plotSpacingM);
    const turn = hash01(`${key}/ring/${ring}`) * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      const r = stream(`${key}/site/${ring}/${j}`);
      const a = turn + (j / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
      const rr = radius + (r() - 0.5) * 4;
      yield { x: centre.x + Math.cos(a) * rr, y: centre.y + Math.sin(a) * rr, ring, key: `${key}/site/${ring}/${j}` };
    }
  }
}

/**
 * Households to plots, in founding order. A household takes the lowest-numbered plot that had stood
 * empty for {@link VILLAGE}.reuseGapYears by its founding day, or the next site the ground allows.
 */
function assignPlots(s: Settlement, ground: VillageGround, centre: Point, style: VillageStyle, keepOut: readonly Circle[], key: string): Plot[] {
  const plots: (Plot & { households: number[] })[] = [];
  const gap = yearsToDays(VILLAGE.reuseGapYears);
  const next = sites(centre, key);
  const placed: Circle[] = [];

  for (const h of s.households) {
    const reuse = plots.find((p) => s.households[p.households[p.households.length - 1]].dissolvedDay + gap <= h.foundedDay);
    if (reuse !== undefined) {
      reuse.households.push(h.index);
      continue;
    }
    for (;;) {
      const step = next.next();
      if (step.done) return plots; // every ring is full: the village is as big as its ground lets it be
      const c = step.value;
      const r = stream(`${c.key}/house`);
      const widthM = 5.5 + r() * 2.8;
      const depthM = 4.4 + r() * 2.2;
      const facing = Math.atan2(centre.y - c.y, centre.x - c.x) + (r() - 0.5) * 0.3;
      const reach = Math.hypot(widthM, depthM) / 2 + 1.5;
      if (!clear(c, reach, keepOut) || !clear(c, reach - 1.5, placed)) continue;
      if (placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < VILLAGE.plotSpacingM)) continue;
      if (!footprintOk(ground, c.x, c.y, facing, widthM, depthM, VILLAGE.maxPlotReliefM)) continue;
      const storeys: 1 | 2 = r() < style.storeyChance * (c.ring <= 2 ? 1 : 0.4) ? 2 : 1;
      plots.push({ index: plots.length, x: c.x, y: c.y, facing, widthM, depthM, storeys, households: [h.index] });
      placed.push({ x: c.x, y: c.y, r: reach - 1.5 });
      break;
    }
  }
  return plots;
}

/** What is left of a plot on a day. */
export function plotState(s: Settlement, plot: Plot, day: number): PlotState | null {
  let last: Household | null = null;
  for (const hi of plot.households) {
    const h = s.households[hi];
    if (h.foundedDay <= day) last = h;
  }
  if (last === null) return null; // not built yet
  if (last.dissolvedDay > day) return "lived";
  const years = (day - last.dissolvedDay) / DAYS_PER_YEAR;
  if (years < VILLAGE.emptyYears) return "empty";
  if (years < VILLAGE.ruinYears) return "ruin";
  if (years < VILLAGE.foundationYears) return "foundation";
  return null;
}

/** Which household lives on a plot on a day, if one does. */
export function householdOn(s: Settlement, plot: Plot, day: number): Household | null {
  for (let i = plot.households.length - 1; i >= 0; i--) {
    const h = s.households[plot.households[i]];
    if (h.foundedDay <= day) return h.dissolvedDay > day ? h : null;
  }
  return null;
}

// ── the plan ────────────────────────────────────────────────────────────────────

export function villagePlan(s: Settlement, ground: VillageGround, site: VillageSite): VillagePlan | null {
  const key = `${s.seed}/${s.cell}/village`;
  const style = styleOf(s);
  const greenRadiusM = VILLAGE.greenMinM + VILLAGE.greenPerCapacityM * s.capacity;
  const centre = findCentre(ground, site, greenRadiusM);
  if (centre === null) return null;

  const rings = ringsFor(s.capacity);
  const outerM = VILLAGE.firstRingM + (rings - 1) * VILLAGE.ringStepM + 8;
  const keepOut: Circle[] = [{ x: centre.x, y: centre.y, r: greenRadiusM }];

  const dock = layDock(ground, centre, site, key);
  if (dock) {
    // Keep the walk to the dock clear of houses: a corridor of circles from the green to the root.
    const n = Math.ceil(dist(centre, dock.root) / 6);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      keepOut.push({ x: centre.x + (dock.root.x - centre.x) * t, y: centre.y + (dock.root.y - centre.y) * t, r: 3.5 });
    }
  }

  // Seaward is toward the dock where there is one, else away from the cell's centre; landward is
  // its opposite, and the graveyard and the arrival take the two sides.
  let seaward = dock
    ? { x: dock.root.x - centre.x, y: dock.root.y - centre.y }
    : { x: centre.x - site.origin.x, y: centre.y - site.origin.y };
  if (Math.hypot(seaward.x, seaward.y) < 1e-6) seaward = { x: 0, y: -1 };
  const away = { x: -seaward.x, y: -seaward.y };
  const side = { x: -seaward.y, y: seaward.x };

  const arrival = findArrival(ground, centre, side, outerM, keepOut);
  if (arrival === null) return null;
  keepOut.push({ x: arrival.x, y: arrival.y, r: VILLAGE.arrivalClearM });
  const toCentre = { x: centre.x - arrival.x, y: centre.y - arrival.y };
  const toCentreLen = Math.hypot(toCentre.x, toCentre.y) || 1;
  const arrivalFacing = { x: toCentre.x / toCentreLen, y: toCentre.y / toCentreLen };

  const fields = layFields(ground, s, centre, away, outerM, keepOut, key);
  const graveyard = layGraveyard(ground, s, centre, side, outerM, keepOut);
  const plots = assignPlots(s, ground, centre, style, keepOut, key);

  const clearings = [
    { x: centre.x, y: centre.y, radiusM: greenRadiusM + 2 },
    { x: arrival.x, y: arrival.y, radiusM: VILLAGE.arrivalClearM },
    ...plots.map((p) => ({ x: p.x, y: p.y, radiusM: Math.hypot(p.widthM, p.depthM) / 2 + 2.5 })),
    ...fields.map((f) => ({ x: f.x, y: f.y, radiusM: Math.hypot(f.lengthM, f.widthM) / 2 })),
  ];
  if (graveyard) clearings.push({ x: graveyard.x, y: graveyard.y, radiusM: graveyard.radiusM + 1 });
  if (dock) clearings.push({ x: dock.root.x, y: dock.root.y, radiusM: 6 });

  const benchCount = Math.max(4, Math.round(greenRadiusM / 2.2));
  const turn = hash01(`${key}/benches`) * Math.PI * 2;
  const benches = Array.from({ length: benchCount }, (_, i) => {
    const a = turn + (i / benchCount) * Math.PI * 2;
    return { x: centre.x + Math.cos(a) * greenRadiusM * 0.82, y: centre.y + Math.sin(a) * greenRadiusM * 0.82, heading: a + Math.PI / 2 };
  });

  const paths: [Point, Point][] = plots.map((p) => [{ x: p.x, y: p.y }, centre]);
  paths.push([arrival, centre]);
  if (dock) paths.push([centre, dock.root]);
  if (graveyard) paths.push([centre, { x: graveyard.x, y: graveyard.y }]);
  for (const f of fields) paths.push([centre, { x: f.x, y: f.y }]);

  return {
    name: s.name,
    culture: s.culture,
    style,
    centre,
    greenRadiusM,
    arrival,
    arrivalFacing,
    plots,
    dock,
    fields,
    graveyard,
    benches,
    clearings,
    paths,
  };
}

/**
 * The graves dug by a day: everyone who died in the village, in order of death, each in the next slot
 * of the yard — and once the yard is full, in the slot of whoever has lain there longest. So a grave
 * never moves when the village is read to a later day; only the oldest name on a slot is replaced.
 */
export function gravesOn(s: Settlement, plan: VillagePlan, day: number): Grave[] {
  const yard = plan.graveyard;
  if (yard === null) return [];
  const dead = s.people
    .filter((p) => p.deathDay <= day && present(s, p, p.deathDay - 1))
    .sort((a, b) => a.deathDay - b.deathDay || a.index - b.index);
  const slots = graveSlots(yard);
  const latest = new Map<number, Person>();
  dead.forEach((p, i) => latest.set(i % slots.length, p));
  return [...latest].sort((a, b) => a[0] - b[0]).map(([slot, p]) => ({ ...slots[slot], person: p.id, deathDay: p.deathDay }));
}

/** The yard's slots, row by row from the middle out, so the first graves are at its heart. */
export function graveSlots(yard: Graveyard): Point[] {
  const out: Point[] = [];
  const rows = Math.floor((yard.radiusM * 2) / VILLAGE.graveRowM);
  const all: (Point & { d: number })[] = [];
  for (let row = 0; row < rows; row++) {
    const y = -yard.radiusM + (row + 0.5) * VILLAGE.graveRowM;
    const half = Math.sqrt(Math.max(0, yard.radiusM * yard.radiusM - y * y)) - 1;
    for (let x = -half; x <= half; x += VILLAGE.graveAlongM) all.push({ x: yard.x + x, y: yard.y + y, d: Math.hypot(x, y) });
  }
  all.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  for (const p of all.slice(0, yard.slots)) out.push({ x: p.x, y: p.y });
  return out;
}

/** Everyone present in the village on a day, and the plot they sleep in. Infants and all. */
export function residentsOn(s: Settlement, plan: VillagePlan, day: number): { person: Person; plot: Plot }[] {
  const homeOf = new Map<number, Plot>();
  for (const plot of plan.plots) {
    const h = householdOn(s, plot, day);
    if (h !== null) homeOf.set(h.index, plot);
  }
  const out: { person: Person; plot: Plot }[] = [];
  for (const p of s.people) {
    if (!present(s, p, day)) continue;
    // Home is the household you are in today: your own once you have paired, the one you were born into before.
    const house = p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto;
    const plot = homeOf.get(house);
    if (plot !== undefined) out.push({ person: p, plot });
  }
  return out;
}


// ── the planet's villages, as the globe sees them ───────────────────────────────

/**
 * The least land a settled cell needs for the globe to show it as a village. Lostrenreef, beside the
 * demo cell, is a settlement whose own land fraction is 0.00 — its habitability comes from the 3 km
 * disk around it — and a light in the open sea would be a village nobody can walk to. Read by
 * `scripts/index-villages.ts` and by the test that holds that index to the seed.
 */
export const VILLAGE_LIGHT_MIN_LAND = 0.15;

// ── a sentence about a place ────────────────────────────────────────────────────

export interface SettlementSummary {
  name: string;
  culture: string;
  /** "fishing village", "market town", "hamlet", "abandoned village" — what the trades and the headcount say. */
  kind: string;
  population: number;
  households: number;
  graves: number;
  /** The most common trades today, most first. */
  trades: [string, number][];
}

/**
 * What a settlement is, in a few words: read off who lives there today and what they do, never
 * authored. The thresholds are shares of the living, so a village of fishers is one where at least
 * one in seven fishes — Konreef's eleven fishers of forty-six, say — and nothing names a place a
 * "town" until sixty people live in it.
 */
export function settlementSummary(s: Settlement, day: number): SettlementSummary {
  const living = s.people.filter((p) => present(s, p, day));
  const trades = new Map<string, number>();
  for (const p of living) {
    const trade = occupationOn(p, day);
    trades.set(trade, (trades.get(trade) ?? 0) + 1);
  }
  const n = living.length;
  const share = (...ks: string[]) => ks.reduce((a, k) => a + (trades.get(k) ?? 0), 0) / Math.max(1, n);
  const size = n >= 60 ? "town" : n < 15 ? "hamlet" : "village";
  let kind: string;
  if (n === 0) kind = "abandoned village";
  else if (share("fisher") >= 0.15) kind = `fishing ${size}`;
  else if (share("miner", "stonecutter") >= 0.2) kind = `mining ${size}`;
  else if (share("trader", "carter", "innkeeper") >= 0.25) kind = `market ${size}`;
  else if (share("herder") >= 0.2) kind = `herding ${size}`;
  else if (share("farmer") >= 0.25) kind = `farming ${size}`;
  else kind = size;
  return {
    name: s.name,
    culture: s.culture,
    kind,
    population: n,
    households: s.households.filter((h) => h.foundedDay <= day && h.dissolvedDay > day).length,
    graves: s.people.filter((p) => p.deathDay <= day && present(s, p, p.deathDay - 1)).length,
    trades: [...trades].sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}
