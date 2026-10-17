/**
 * The village's forms (DECISIONS C41): houses, ruins, the well, the dock, the fields, the graveyard
 * and the boats, built from a `VillagePlan` and seated on the ground the terrain mesh is drawn from.
 *
 * THE BUDGET DECIDED THE SHAPE OF THIS FILE. An ordinary parcel already spends 103 of C16's 120 draw
 * calls before anyone lives on it (C31), so a village drawn the way the scatter draws a forest — one
 * mesh per class — would cost a call per kind of thing, twice over with shadows. Everything that
 * never moves is therefore ONE merged, non-indexed, vertex-coloured geometry: every house, every
 * grave, the dock, the fields, the well, in a single draw (plus its shadow). The boats are separate
 * because they will sail; the lit windows are separate because they change with the hour.
 *
 * THE ART BIBLE (§8): soft low-poly, flat-shaded, built things geometric. Every form here is boxes,
 * prisms and draped quads, flat-shaded by per-face normals, coloured from `PALETTE` and nowhere else.
 * The bible's carved-clay softness is the scatter's job; a house is a made thing and looks it.
 *
 * WHAT THE GROUND IS. Every form is seated with `frame.heightAtTile`, the one height function the
 * terrain mesh and the mover share. A house's floor is level with the HIGHEST ground under it, on a
 * stone plinth that reaches down to the lowest, so no corner of a floor is buried and nothing floats
 * on a slope.
 *
 * Coordinates: the plan is in planet-local metres (east, north). A local heading θ is three's
 * rotation.y = θ, because rotating +x by θ about y lands on (cos θ, 0, −sin θ), which is east-north
 * (cos θ, sin θ) once three's z is read as south.
 */

import * as THREE from "three";
import { gravesOn, plotState, type Plot, type PlotState, type SettledParcel, type VillageStyle } from "@echo/planet";

import { PALETTE } from "../three/palette";
import type { WorldFrame } from "./PlanetWorld";

// ── a tiny flat-shaded mesher ────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

const rgb = (hex: number): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const mix = (a: number, b: number, t: number): RGB => {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return [c.r, c.g, c.b];
};

/**
 * Non-indexed triangles with a normal and a colour per vertex: the same layout scatterGeometry.ts
 * merges into, so a village form could be handed to `deriveImpostor` one day without a conversion.
 */
export class Mesher {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();

  setTransform(m: THREE.Matrix4): void {
    this.m.copy(m);
  }

  get triangles(): number {
    return this.positions.length / 9;
  }

  tri(p: readonly number[], q: readonly number[], r: readonly number[], color: RGB): void {
    this.a.set(p[0], p[1], p[2]).applyMatrix4(this.m);
    this.b.set(q[0], q[1], q[2]).applyMatrix4(this.m);
    this.c.set(r[0], r[1], r[2]).applyMatrix4(this.m);
    this.ab.subVectors(this.b, this.a);
    this.ac.subVectors(this.c, this.a);
    const n = this.ab.cross(this.ac).normalize();
    for (const v of [this.a, this.b, this.c]) {
      this.positions.push(v.x, v.y, v.z);
      this.normals.push(n.x, n.y, n.z);
      this.colors.push(color[0], color[1], color[2]);
    }
  }

  /** A quad, counter-clockwise seen from the side it faces. */
  quad(p: readonly number[], q: readonly number[], r: readonly number[], s: readonly number[], color: RGB): void {
    this.tri(p, q, r, color);
    this.tri(p, r, s, color);
  }

  /** An axis-aligned box in the current transform, centred at (x, y, z). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: RGB, top: RGB = color): void {
    const [x0, x1, y0, y1, z0, z1] = [x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z - sz / 2, z + sz / 2];
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color); // +x
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color); // -x
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top); // +y
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], color); // -y
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color); // +z
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color); // -z
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ── materials of the place ──────────────────────────────────────────────────────

interface Swatch {
  wall: RGB;
  frame: RGB | null;
  roof: RGB;
  roofUnder: RGB;
}

function swatch(style: VillageStyle): Swatch {
  const wall =
    style.walls === "stone" ? mix(PALETTE.rockLight, PALETTE.sand, 0.25)
    : style.walls === "timber" ? rgb(PALETTE.wood)
    : mix(PALETTE.cloth, PALETTE.sand, 0.2);
  const frame = style.walls === "stone" ? null : style.walls === "timber" ? rgb(PALETTE.trunk) : rgb(PALETTE.wood);
  const roofHex =
    style.roof === "slate" ? PALETTE.rock
    : style.roof === "shingle" ? PALETTE.trunk
    : style.roof === "tile" ? PALETTE.clay
    : PALETTE.thatch;
  return { wall, frame, roof: rgb(roofHex), roofUnder: mix(roofHex, PALETTE.shadow, 0.55) };
}

const DOOR = rgb(PALETTE.trunk);
const GLASS = mix(PALETTE.shadow, PALETTE.trunk, 0.4);
const STONE = rgb(PALETTE.rock);
const STONE_OLD = mix(PALETTE.rock, PALETTE.lichen, 0.6);
const RUIN = mix(PALETTE.rock, PALETTE.humus, 0.35);
const DECK = rgb(PALETTE.woodLight);
const DECK_ALT = mix(PALETTE.woodLight, PALETTE.wood, 0.5);
const POST = rgb(PALETTE.trunk);
const SOIL = rgb(PALETTE.soil);
const GLOW = rgb(PALETTE.lantern);

/** Crops through a world year: sprouting, green, ripe, stubble. Seventy-three real hours a year (C24). */
export function cropColour(dayOfYear: number): RGB {
  const t = ((dayOfYear % 365) + 365) % 365 / 365;
  if (t < 0.3) return mix(PALETTE.soil, PALETTE.leafLight, t / 0.3);
  if (t < 0.55) return rgb(PALETTE.leaf);
  if (t < 0.75) return mix(PALETTE.leaf, PALETTE.thatch, (t - 0.55) / 0.2);
  return mix(PALETTE.thatch, PALETTE.soil, (t - 0.75) / 0.25);
}

// ── seating ─────────────────────────────────────────────────────────────────────

/** Ground height at a local point, metres above sea level (negative under water). */
const groundAt = (frame: WorldFrame, x: number, y: number): number => {
  const [tx, ty] = frame.fromLocalM(x, y);
  return frame.heightAtTile(tx, ty);
};

/** three's position of a local point at a given height. */
const sceneAt = (frame: WorldFrame, x: number, y: number, h: number, out = new THREE.Vector3()): THREE.Vector3 => {
  const [tx, ty] = frame.fromLocalM(x, y);
  return out.set(tx * frame.tileM, h, ty * frame.tileM);
};

/** The four corners of a rectangle along `heading`, `along` × `across`, centred at (x, y), local metres. */
function corners(x: number, y: number, heading: number, along: number, across: number): [number, number][] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const out: [number, number][] = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
    out.push([x + (c * a * along) / 2 - (s * b * across) / 2, y + (s * a * along) / 2 + (c * b * across) / 2]);
  }
  return out;
}

const placement = (frame: WorldFrame, x: number, y: number, heading: number, h: number): THREE.Matrix4 =>
  new THREE.Matrix4().compose(sceneAt(frame, x, y, h), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(1, 1, 1));

/** A small deterministic stream for the cosmetic variation a plot carries (door side, window count). */
function variation(key: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ── the forms ───────────────────────────────────────────────────────────────────

const STOREY_M = 2.6;

/**
 * One house in its own frame: +x is the way the door faces (the plot's depth), z is across (its
 * width), the floor is y = 0. Lit windows go to `glow`, which only a lived-in house gets.
 */
function house(m: Mesher, glow: Mesher, plot: Plot, state: PlotState, sw: Swatch, pitch: number, skirt: number, seed: string): void {
  const d = plot.depthM;
  const w = plot.widthM;
  const r = variation(`${seed}/plot/${plot.index}`);
  // The stone skirt every house stands on, down to the lowest ground under it.
  m.box(0, -skirt / 2 + 0.12, 0, d + 0.25, skirt + 0.24, w + 0.25, STONE);

  if (state === "foundation") {
    // Only the footing is left: a low ring of stones in the grass.
    for (const [x, z, sx, sz] of [[d / 2, 0, 0.4, w], [-d / 2, 0, 0.4, w], [0, w / 2, d, 0.4], [0, -w / 2, d, 0.4]] as const) {
      m.box(x, 0.3, z, sx, 0.36, sz, STONE_OLD);
    }
    return;
  }
  if (state === "ruin") {
    // Walls fallen to uneven stumps, one side open, no roof.
    const open = Math.floor(r() * 4);
    const sides = [[d / 2, 0, 0.35, w], [-d / 2, 0, 0.35, w], [0, w / 2, d, 0.35], [0, -w / 2, d, 0.35]] as const;
    sides.forEach(([x, z, sx, sz], i) => {
      const h = i === open ? 0.35 : 0.6 + r() * 1.3;
      m.box(x, h / 2, z, sx, h, sz, RUIN);
    });
    m.box(0.3, 0.12, 0, d * 0.8, 0.18, 0.22, mix(PALETTE.trunk, PALETTE.humus, 0.5)); // the fallen ridge beam
    return;
  }

  const H = STOREY_M * plot.storeys;
  m.box(0, H / 2, 0, d, H, w, sw.wall);

  // Timber framing: corner posts, and a rail at every storey line.
  if (sw.frame) {
    for (const [x, z] of [[d / 2, w / 2], [d / 2, -w / 2], [-d / 2, w / 2], [-d / 2, -w / 2]] as const) {
      m.box(x, H / 2, z, 0.2, H, 0.2, sw.frame);
    }
    for (let k = 1; k <= plot.storeys; k++) {
      const y = k * STOREY_M - 0.1;
      m.box(d / 2 + 0.03, y, 0, 0.08, 0.16, w, sw.frame);
      m.box(-d / 2 - 0.03, y, 0, 0.08, 0.16, w, sw.frame);
    }
  }

  // The roof: a gable whose ridge runs across, so the eaves are over the door.
  const ov = 0.45;
  const rise = (d / 2) * Math.tan(pitch);
  const drop = ov * Math.tan(pitch);
  const zE = w / 2 + ov * 0.7;
  const ridge = H + rise;
  const eave = H - drop;
  const t = 0.14; // thickness
  // Top faces, then their undersides a thickness lower.
  m.quad([d / 2 + ov, eave, zE], [d / 2 + ov, eave, -zE], [0, ridge, -zE], [0, ridge, zE], sw.roof);
  m.quad([-d / 2 - ov, eave, -zE], [-d / 2 - ov, eave, zE], [0, ridge, zE], [0, ridge, -zE], sw.roof);
  m.quad([d / 2 + ov, eave - t, -zE], [d / 2 + ov, eave - t, zE], [0, ridge - t, zE], [0, ridge - t, -zE], sw.roofUnder);
  m.quad([-d / 2 - ov, eave - t, zE], [-d / 2 - ov, eave - t, -zE], [0, ridge - t, -zE], [0, ridge - t, zE], sw.roofUnder);
  // The gables, in the wall's own colour.
  m.tri([d / 2, H, w / 2], [0, ridge - t, w / 2], [-d / 2, H, w / 2], sw.wall);
  m.tri([-d / 2, H, -w / 2], [0, ridge - t, -w / 2], [d / 2, H, -w / 2], sw.wall);

  // The door, on the front, and the windows: both faces, every storey.
  const doorZ = (r() - 0.5) * (w * 0.4);
  m.box(d / 2 + 0.04, 0.95, doorZ, 0.1, 1.9, 0.95, DOOR);
  const lit = state === "lived";
  const window = (x: number, y: number, z: number, face: 1 | -1) => {
    m.box(x, y, z, 0.08, 0.72, 0.68, GLASS);
    if (lit) glow.box(x + face * 0.03, y, z, 0.04, 0.6, 0.56, GLOW);
  };
  for (let k = 0; k < plot.storeys; k++) {
    const y = k * STOREY_M + 1.45;
    const zs = k === 0 ? [doorZ + (doorZ > 0 ? -1.6 : 1.6)] : [-w / 4, w / 4];
    for (const z of zs) if (Math.abs(z) < w / 2 - 0.5) window(d / 2 + 0.04, y, z, 1);
    window(-d / 2 - 0.04, y, (r() - 0.5) * (w * 0.5), -1);
  }

  // A chimney through the back slope, near one gable. An emptied house keeps its chimney cold.
  const cz = (r() < 0.5 ? 1 : -1) * (w / 2 - 0.8);
  const cx = -d / 4;
  const roofAt = ridge - (Math.abs(cx) / (d / 2)) * rise;
  m.box(cx, (roofAt + ridge + 0.9) / 2, cz, 0.7, ridge + 0.9 - roofAt + 0.4, 0.7, STONE, STONE);
}

/** The well on the green: a stone ring, two posts, a little roof. */
function well(m: Mesher, sw: Swatch): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.75;
    const z = Math.sin(a) * 0.75;
    m.box(x, 0.4, z, 0.55, 0.8, 0.55, STONE);
  }
  m.box(0, 1.1, 0.75, 0.14, 2.2, 0.14, POST);
  m.box(0, 1.1, -0.75, 0.14, 2.2, 0.14, POST);
  m.quad([0.7, 2.0, 1.0], [0.7, 2.0, -1.0], [0, 2.5, -1.0], [0, 2.5, 1.0], sw.roof);
  m.quad([-0.7, 2.0, -1.0], [-0.7, 2.0, 1.0], [0, 2.5, 1.0], [0, 2.5, -1.0], sw.roof);
}

// ── the whole village ───────────────────────────────────────────────────────────

export interface VillageForms {
  built: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  /** House footprints for the mover, local metres: centre, heading, half extents. */
  footprints: { x: number; y: number; heading: number; halfAlong: number; halfAcross: number }[];
  triangles: number;
}

/** A family's paint, by household. Muted, and never violet (§8). */
export const BOAT_PAINT = [0x4e6d7a, 0x7a4a3a, 0x5d6b4a, 0x6b6a5a, 0x8a6a3a] as const;

/**
 * A small open boat in its own frame: +x is the bow. Four and a half metres, flat-bottomed. Drawn by
 * the villagers layer, which moves it; the moorings are `mooringsOn`'s, in @echo/planet, so the
 * drawing and the schedule cannot disagree about which boat is whose.
 */
export function boatForm(): THREE.BufferGeometry {
  const m = new Mesher();
  const hull = rgb(PALETTE.wood);
  const inside = mix(PALETTE.wood, PALETTE.shadow, 0.35);
  const L = 3.4;
  const B = 1.5;
  const H = 0.6;
  m.box(-0.35, H / 2, 0, L, H, B, hull, inside);
  // The bow: a wedge closing to a stem.
  const x0 = -0.35 + L / 2;
  m.quad([x0, 0, B / 2], [x0, H, B / 2], [x0 + 1.25, H, 0], [x0 + 1.25, 0.1, 0], hull);
  m.quad([x0 + 1.25, 0.1, 0], [x0 + 1.25, H, 0], [x0, H, -B / 2], [x0, 0, -B / 2], hull);
  m.tri([x0, H, B / 2], [x0, H, -B / 2], [x0 + 1.25, H, 0], inside);
  // A thwart and an oar laid along it.
  m.box(-0.2, H - 0.05, 0, 0.25, 0.08, B - 0.1, rgb(PALETTE.woodLight));
  m.box(-0.6, H + 0.02, 0.3, 2.6, 0.06, 0.08, rgb(PALETTE.woodLight));
  return m.geometry();
}

export function buildVillage(frame: WorldFrame, v: SettledParcel, day: number): VillageForms {
  const { plan, settlement } = v;
  const sw = swatch(plan.style);
  const built = new Mesher();
  const glow = new Mesher();
  const footprints: VillageForms["footprints"] = [];
  const seed = `${settlement.seed}/${settlement.cell}`;

  // Houses, in whatever state the day leaves them.
  for (const plot of plan.plots) {
    const state = plotState(settlement, plot, day);
    if (state === null) continue;
    const pts = corners(plot.x, plot.y, plot.facing, plot.depthM, plot.widthM);
    const hs = [...pts.map(([x, y]) => groundAt(frame, x, y)), groundAt(frame, plot.x, plot.y)];
    const low = Math.min(...hs);
    const high = Math.max(...hs);
    const floor = Math.max(0, high) + 0.12;
    const mat = placement(frame, plot.x, plot.y, plot.facing, floor);
    built.setTransform(mat);
    glow.setTransform(mat);
    house(built, glow, plot, state, sw, plan.style.pitch, floor - low + 0.4, seed);
    if (state !== "foundation") {
      footprints.push({ x: plot.x, y: plot.y, heading: plot.facing, halfAlong: plot.depthM / 2 + 0.2, halfAcross: plot.widthM / 2 + 0.2 });
    }
  }

  // The well, at the heart of the green.
  built.setTransform(placement(frame, plan.centre.x, plan.centre.y, 0, Math.max(0, groundAt(frame, plan.centre.x, plan.centre.y))));
  well(built, sw);
  footprints.push({ x: plan.centre.x, y: plan.centre.y, heading: 0, halfAlong: 1.1, halfAcross: 1.1 });

  // The benches round the green, where the old sit. A plank on two trestles, the seat at the
  // height the crowd's sitting pose puts a pair of hips.
  for (const b of plan.benches) {
    built.setTransform(placement(frame, b.x, b.y, b.heading, Math.max(0, groundAt(frame, b.x, b.y))));
    built.box(0, 0.4, 0, 2.3, 0.1, 0.42, rgb(PALETTE.woodLight));
    for (const x of [-0.9, 0.9]) built.box(x, 0.18, 0, 0.14, 0.36, 0.38, rgb(PALETTE.wood));
  }

  // Fields, draped on the ground in furrow stripes along their length.
  const crop = cropColour(day);
  for (const f of plan.fields) {
    const nx = Math.ceil(f.lengthM / 3);
    const ny = Math.ceil(f.widthM / 1.6);
    const c = Math.cos(f.heading);
    const s = Math.sin(f.heading);
    const at = (i: number, j: number): number[] => {
      const u = (i / nx - 0.5) * f.lengthM;
      const w = (j / ny - 0.5) * f.widthM;
      const x = f.x + c * u - s * w;
      const y = f.y + s * u + c * w;
      const p = sceneAt(frame, x, y, Math.max(0, groundAt(frame, x, y)) + 0.07);
      return [p.x, p.y, p.z];
    };
    built.setTransform(new THREE.Matrix4());
    for (let j = 0; j < ny; j++) {
      const colour = j % 2 === 0 ? SOIL : crop;
      // Counter-clockwise from above: along, then across. The other order faces the ground and the
      // renderer culls it, which is a field you can only see from underneath.
      for (let i = 0; i < nx; i++) built.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), colour);
    }
  }

  // The graveyard: a low wall with a gap toward the green, and a stone for every grave dug.
  const yard = plan.graveyard;
  if (yard) {
    const gate = Math.atan2(plan.centre.y - yard.y, plan.centre.x - yard.x);
    const n = Math.max(12, Math.round((2 * Math.PI * yard.radiusM) / 2.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.22) continue;
      const x = yard.x + Math.cos(a) * yard.radiusM;
      const y = yard.y + Math.sin(a) * yard.radiusM;
      built.setTransform(placement(frame, x, y, a + Math.PI / 2, Math.max(0, groundAt(frame, x, y))));
      built.box(0, 0.3, 0, (2 * Math.PI * yard.radiusM) / n + 0.05, 0.75, 0.4, STONE);
    }
    for (const g of gravesOn(settlement, plan, day)) {
      const years = (day - g.deathDay) / 365;
      const r = variation(g.person);
      const lean = Math.min(0.35, years / 400) * (r() - 0.5) * 2;
      built.setTransform(
        placement(frame, g.x, g.y, gate + (r() - 0.5) * 0.12, Math.max(0, groundAt(frame, g.x, g.y)) - Math.min(0.25, years / 600))
          .multiply(new THREE.Matrix4().makeRotationX(lean)),
      );
      const colour = years > 80 ? STONE_OLD : mix(PALETTE.rockLight, PALETTE.lichen, Math.min(1, years / 80));
      built.box(0, 0.38, 0, 0.14, 0.76, 0.46, colour);
      built.box(0.55, 0.05, 0, 0.9, 0.12, 0.5, mix(PALETTE.grass, PALETTE.soil, 0.5));
    }
  }

  // The dock: a deck of planks on posts, from the shore out over the water. Its boats are the
  // villagers layer's, because they sail.
  const dock = plan.dock;
  if (dock) {
    const rootH = groundAt(frame, dock.root.x, dock.root.y);
    const deck = Math.max(0.75, rootH + 0.25);
    built.setTransform(placement(frame, dock.root.x, dock.root.y, dock.heading, deck));
    const planks = Math.ceil(dock.lengthM / 0.9);
    for (let i = 0; i < planks; i++) {
      const x = (i + 0.5) * (dock.lengthM / planks);
      built.box(x, 0, 0, dock.lengthM / planks - 0.04, 0.14, 2.2, i % 3 === 0 ? DECK_ALT : DECK);
    }
    for (let x = 1.5; x < dock.lengthM; x += 3) {
      for (const z of [1.05, -1.05]) built.box(x, -1.3, z, 0.22, 2.6, 0.22, POST);
    }
  }

  return {
    built: built.geometry(),
    glow: glow.geometry(),
    footprints,
    triangles: built.triangles + glow.triangles,
  };
}
