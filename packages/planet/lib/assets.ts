/**
 * The asset registry and the placer (contract, plan §4).
 *
 * An asset class is a kind of thing that stands on the ground: a cactus, a boulder, a reed bed. The
 * registry says where each may stand, how thickly, and what it collides with. The placer turns a
 * biome mask plus the registry into positions, and it does so by hashing world positions, never by
 * drawing random numbers, so the same seed and the same registry give the same world on a server,
 * in a browser and next year.
 *
 * What this file decides and the renderer does not: density, biome affinity, altitude and water
 * bands, clustering, exclusions, LOD distances and colliders. What the renderer decides: the mesh.
 *
 * Content lives in DEMO_ASSET_CLASSES at the bottom and is deliberately small: only the classes the
 * chosen demo cell's biomes call for (plan B4). Densities there are provisional and A2 tunes them
 * against the instance ceiling; the rules are the contract, the numbers are not.
 */

import type { BiomeMask } from "./biome-mask.js";
import { hashPosition } from "./scene.js";
import type { RegionBound } from "./walkable.js";
import { hashString, type Biome, type Seed } from "./terrain.js";

export type AssetClassId = string;

export type ExclusionKind = "path" | "water" | "footprint" | "sightline";

export interface AssetClass {
  id: AssetClassId;
  /** Relative weight per biome, 0..1. Absent or zero means never placed there. */
  biomes: Partial<Record<Biome, number>>;
  /** Candidates per square kilometre before the biome weight and the bands thin them. */
  densityPerKm2: number;
  /** Normalised height band (0 is the shoreline, 1 this planet's high ground). */
  altitude?: { min: number; max: number };
  /** Distance to water band, metres. `max` Infinity means anywhere inland. */
  waterDistanceM?: { min: number; max: number };
  /** When set, each accepted candidate is a cluster centre with `count` members within `radiusM`. */
  cluster?: { radiusM: number; count: number };
  excludes: readonly ExclusionKind[];
  /** Full mesh within `nearM`, impostor to `farM`, culled beyond. */
  lod: { nearM: number; farM: number };
  /** Null for things you walk over (a dune ripple, a shell). */
  collider: { radiusM: number; heightM: number } | null;
  /** Uniform scale range; the value for a position is a hash of the position. */
  scale: [number, number];
  castsShadow: boolean;
}

export interface PlacedAsset {
  classId: AssetClassId;
  /** Local metres east and north of the anchor centre, and metres above sea level. */
  x: number;
  y: number;
  z: number;
  biome: Biome;
  scale: number;
  /** Radians, stable for the position. */
  rotation: number;
  /** Cluster index, carried by the members of a cluster; absent for singletons and for centres. */
  cluster?: number;
}

export interface Segment {
  a: readonly [number, number];
  b: readonly [number, number];
  /** Full width of the band to keep clear, metres. */
  widthM: number;
}

export interface Exclusions {
  /** Path centrelines. */
  paths: readonly Segment[];
  /** Convex polygons in local metres, e.g. the parcel's buildable footprint. */
  footprints: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** Lines of sight to keep clear, e.g. spawn to the other presence. */
  sightlines: readonly Segment[];
}

export const NO_EXCLUSIONS: Exclusions = { paths: [], footprints: [], sightlines: [] };

/** The most instances the demo disk may hold. An acceptance number (plan §0), not a suggestion. */
export const INSTANCE_CEILING = 25_000;

export interface PlaceOptions {
  /** Metres of height per unit of normalised elevation; must match the scene builder's. */
  heightScaleM: number;
  /** Stop placing at this many instances and say so. */
  maxInstances?: number;
  /** Place only inside the region the scene actually builds (walkable.ts regionBound). */
  bound?: RegionBound;
}

export interface Placement {
  placed: PlacedAsset[];
  /** True when the ceiling stopped placement early. Never silent (plan: no silent caps). */
  truncated: boolean;
  byClass: Record<AssetClassId, number>;
}

function distanceToSegment(p: readonly [number, number], s: Segment): number {
  const [px, py] = p;
  const [ax, ay] = s.a;
  const [bx, by] = s.b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideConvex(polygon: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return polygon.length >= 3;
}

/** Is a candidate position excluded for this class. */
export function excluded(cls: AssetClass, mask: BiomeMask, ex: Exclusions, x: number, y: number): boolean {
  for (const kind of cls.excludes) {
    // The grid gate first (cheap), then the exact predicate: a shoreline can run between two grid
    // points, and a shell standing in the sea is a fake (I2).
    if (kind === "water" && (!mask.isLandAt(x, y) || !mask.isLandExactAt(x, y))) return true;
    if (kind === "path" && ex.paths.some((s) => distanceToSegment([x, y], s) < s.widthM / 2)) return true;
    if (kind === "sightline" && ex.sightlines.some((s) => distanceToSegment([x, y], s) < s.widthM / 2)) return true;
    if (kind === "footprint" && ex.footprints.some((poly) => insideConvex(poly, x, y))) return true;
  }
  return false;
}

/** Does the class allow this biome, height and water distance. The rules, in one place. */
export function allowed(cls: AssetClass, biomeHere: Biome, height: number, waterM: number): boolean {
  const w = cls.biomes[biomeHere] ?? 0;
  if (w <= 0) return false;
  if (cls.altitude && (height < cls.altitude.min || height > cls.altitude.max)) return false;
  if (cls.waterDistanceM && (waterM < cls.waterDistanceM.min || waterM > cls.waterDistanceM.max)) return false;
  return true;
}

/**
 * Place every class of the registry over the mask.
 *
 * For each class: a lattice at the class's density, jittered by a hash of the lattice point, gated
 * by a hash against the biome weight, then the bands and the exclusions. A clustered class treats
 * each accepted lattice point as a centre and puts `count` members around it, each re-validated.
 * The seed salts every hash so two planets never share a layout.
 */
export function placeAssets(
  mask: BiomeMask,
  registry: readonly AssetClass[],
  seed: Seed,
  exclusions: Exclusions,
  options: PlaceOptions,
): Placement {
  const placed: PlacedAsset[] = [];
  const byClass: Record<AssetClassId, number> = {};
  const ceiling = options.maxInstances ?? INSTANCE_CEILING;
  let truncated = false;
  const seedSalt = Math.floor(hashString(seed) * 0x7fffffff);

  const tryPlace = (cls: AssetClass, salt: number, x: number, y: number, cluster?: number): boolean => {
    if (x < -mask.extentM || x > mask.extentM || y < -mask.extentM || y > mask.extentM) return false;
    if (options.bound && !options.bound.contains(x, y)) return false;
    const biomeHere = mask.biomeAt(x, y);
    const height = mask.heightAt(x, y);
    if (!allowed(cls, biomeHere, height, mask.waterDistanceAt(x, y))) return false;
    if (hashPosition(x, y, salt + 3) > (cls.biomes[biomeHere] ?? 0)) return false;
    if (excluded(cls, mask, exclusions, x, y)) return false;
    if (placed.length >= ceiling) {
      truncated = true;
      return false;
    }
    placed.push({
      classId: cls.id,
      x,
      y,
      z: Math.max(0, height) * options.heightScaleM,
      biome: biomeHere,
      scale: cls.scale[0] + hashPosition(x, y, salt + 4) * (cls.scale[1] - cls.scale[0]),
      rotation: hashPosition(x, y, salt + 5) * Math.PI * 2,
      ...(cluster !== undefined ? { cluster } : {}),
    });
    byClass[cls.id] = (byClass[cls.id] ?? 0) + 1;
    return true;
  };

  for (const cls of registry) {
    if (!(cls.densityPerKm2 > 0)) continue;
    const salt = (seedSalt ^ Math.floor(hashString(cls.id) * 0x7fffffff)) | 0;
    const spacing = Math.sqrt(1e6 / cls.densityPerKm2);
    const lattice = Math.max(1, Math.ceil((2 * mask.extentM) / spacing));
    let clusterId = 0;
    for (let j = 0; j < lattice && !truncated; j++) {
      for (let i = 0; i < lattice && !truncated; i++) {
        const baseX = -mask.extentM + (i + 0.5) * spacing;
        const baseY = -mask.extentM + (j + 0.5) * spacing;
        const x = baseX + (hashPosition(baseX, baseY, salt + 1) - 0.5) * spacing;
        const y = baseY + (hashPosition(baseX, baseY, salt + 2) - 0.5) * spacing;
        if (!cls.cluster) {
          tryPlace(cls, salt, x, y);
          continue;
        }
        if (!tryPlace(cls, salt, x, y)) continue;
        for (let m = 0; m < cls.cluster.count; m++) {
          const r = cls.cluster.radiusM * Math.sqrt(hashPosition(x, y, salt + 10 + m * 2));
          const a = hashPosition(x, y, salt + 11 + m * 2) * Math.PI * 2;
          tryPlace(cls, salt, x + r * Math.cos(a), y + r * Math.sin(a), clusterId);
        }
        clusterId++;
      }
    }
  }
  return { placed, truncated, byClass };
}

// ── colliders ───────────────────────────────────────────────────────────────────

export interface Collider {
  x: number;
  y: number;
  radiusM: number;
  heightM: number;
  classId: AssetClassId;
}

/**
 * A grid hash over colliders, so the camera boom and the mover can ask "what is near this point"
 * without touching every placed asset. Cells are `cellM` wide; a query visits the cells its
 * radius covers and nothing else.
 */
export class ColliderIndex {
  private readonly cells = new Map<string, Collider[]>();
  readonly count: number;
  /** The largest collider radius in the index. Every query widens its cell range by this, because
   *  a collider is binned by its centre and its disc can reach into the next cell. */
  readonly maxRadiusM: number;

  constructor(
    placed: readonly PlacedAsset[],
    registry: readonly AssetClass[],
    readonly cellM = 8,
  ) {
    const byId = new Map(registry.map((c) => [c.id, c] as const));
    let n = 0;
    let maxR = 0;
    for (const p of placed) {
      const cls = byId.get(p.classId);
      if (!cls || !cls.collider) continue;
      const c: Collider = {
        x: p.x,
        y: p.y,
        radiusM: cls.collider.radiusM * p.scale,
        heightM: cls.collider.heightM * p.scale,
        classId: p.classId,
      };
      const key = this.key(p.x, p.y);
      const list = this.cells.get(key);
      if (list) list.push(c);
      else this.cells.set(key, [c]);
      if (c.radiusM > maxR) maxR = c.radiusM;
      n++;
    }
    this.count = n;
    this.maxRadiusM = maxR;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellM)},${Math.floor(y / this.cellM)}`;
  }

  /** Colliders whose disc overlaps the circle (x, y, r). */
  queryCircle(x: number, y: number, r: number): Collider[] {
    const out: Collider[] = [];
    const reach = r + this.maxRadiusM;
    const i0 = Math.floor((x - reach) / this.cellM);
    const i1 = Math.floor((x + reach) / this.cellM);
    const j0 = Math.floor((y - reach) / this.cellM);
    const j1 = Math.floor((y + reach) / this.cellM);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const c of list) {
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < r + c.radiusM) out.push(c);
        }
      }
    }
    return out;
  }

  /** Colliders within `r` of the segment a-b (a capsule query, for a camera boom). */
  querySegment(a: readonly [number, number], b: readonly [number, number], r: number): Collider[] {
    const reach = r + this.maxRadiusM;
    const minX = Math.min(a[0], b[0]) - reach;
    const maxX = Math.max(a[0], b[0]) + reach;
    const minY = Math.min(a[1], b[1]) - reach;
    const maxY = Math.max(a[1], b[1]) + reach;
    const seg: Segment = { a, b, widthM: 0 };
    const out: Collider[] = [];
    for (let j = Math.floor(minY / this.cellM); j <= Math.floor(maxY / this.cellM); j++) {
      for (let i = Math.floor(minX / this.cellM); i <= Math.floor(maxX / this.cellM); i++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const c of list) {
          if (distanceToSegment([c.x, c.y], seg) < r + c.radiusM) out.push(c);
        }
      }
    }
    return out;
  }
}

// ── content: the demo registry (plan B4) ────────────────────────────────────────

/**
 * Only what the demo cell's biomes call for: beach, desert and tundra, with a trace of grassland.
 * Ten classes, down from the twenty-two the full planet would need; the rest are deferred with
 * the biomes that need them. Densities are provisional (A2 tunes to the instance ceiling); the
 * affinities, bands and exclusions are the rules.
 */
export const DEMO_ASSET_CLASSES: readonly AssetClass[] = [
  { id: "driftwood", biomes: { beach: 0.6 }, densityPerKm2: 400, waterDistanceM: { min: 0, max: 160 }, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 400 }, collider: { radiusM: 0.9, heightM: 0.5 }, scale: [0.7, 1.3], castsShadow: true },
  { id: "shell", biomes: { beach: 0.9 }, densityPerKm2: 900, waterDistanceM: { min: 0, max: 120 }, excludes: ["water", "path"], lod: { nearM: 40, farM: 120 }, collider: null, scale: [0.6, 1.2], castsShadow: false },
  { id: "reeds", biomes: { beach: 0.8, grassland: 0.3 }, densityPerKm2: 200, waterDistanceM: { min: 0, max: 80 }, altitude: { min: 0, max: 0.02 }, cluster: { radiusM: 6, count: 6 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 120, farM: 500 }, collider: null, scale: [0.8, 1.4], castsShadow: false },
  { id: "tidepool", biomes: { beach: 0.4 }, densityPerKm2: 60, waterDistanceM: { min: 0, max: 60 }, excludes: ["water", "path", "footprint"], lod: { nearM: 120, farM: 400 }, collider: null, scale: [1, 1.6], castsShadow: false },
  { id: "cactus", biomes: { desert: 0.7 }, densityPerKm2: 220, waterDistanceM: { min: 60, max: Infinity }, cluster: { radiusM: 12, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 150, farM: 700 }, collider: { radiusM: 0.5, heightM: 2.2 }, scale: [0.7, 1.4], castsShadow: true },
  { id: "dead-shrub", biomes: { desert: 0.8, tundra: 0.3, grassland: 0.2 }, densityPerKm2: 600, excludes: ["water", "path", "footprint"], lod: { nearM: 100, farM: 400 }, collider: null, scale: [0.6, 1.3], castsShadow: false },
  { id: "dune-ripple", biomes: { desert: 0.9, beach: 0.3 }, densityPerKm2: 350, excludes: ["water", "path"], lod: { nearM: 60, farM: 250 }, collider: null, scale: [1, 2], castsShadow: false },
  { id: "boulder", biomes: { desert: 0.4, tundra: 0.7, grassland: 0.2 }, densityPerKm2: 140, waterDistanceM: { min: 20, max: Infinity }, cluster: { radiusM: 10, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 900 }, collider: { radiusM: 1.4, heightM: 1.6 }, scale: [0.6, 2.2], castsShadow: true },
  { id: "lichen-rock", biomes: { tundra: 0.9 }, densityPerKm2: 500, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 300 }, collider: { radiusM: 0.6, heightM: 0.5 }, scale: [0.5, 1.2], castsShadow: false },
  { id: "grass-tuft", biomes: { grassland: 0.9, tundra: 0.5, beach: 0.2 }, densityPerKm2: 700, excludes: ["water", "path"], lod: { nearM: 60, farM: 200 }, collider: null, scale: [0.7, 1.3], castsShadow: false },
];
