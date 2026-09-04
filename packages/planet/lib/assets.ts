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
import { DEMO_LAND_BIOMES } from "./demo-cell.js";

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

/**
 * The most instances a built region may hold. An acceptance number (plan §0), not a suggestion.
 *
 * Raised from 25,000 on B4d's evidence: at 25,000 over a 15 km2 disk the ground within 120 m of
 * the player held about fifty things, which is what "the world reads as empty" means numerically.
 * The near field is now dressed at its biome's real density and thinned outward by spawnFalloff;
 * the cost is instances, which one InstancedMesh per class and chunk absorbs, not draw calls.
 */
export const INSTANCE_CEILING = 120_000;

export interface PlaceOptions {
  /** Metres of height per unit of normalised elevation; must match the scene builder's. */
  heightScaleM: number;
  /** Stop placing at this many instances and say so. */
  maxInstances?: number;
  /** Place only inside the region the scene actually builds (walkable.ts regionBound). */
  bound?: RegionBound;
  /**
   * A multiplier on every class's acceptance, by position. `densityPerKm2` is the NEAR FIELD
   * density; this thins it with distance so the ground around the player is dressed without the
   * whole disk paying for it. Rejection can only thin, never thicken, so the lattice is always at
   * the full density and this decides how much of it survives.
   */
  densityScale?: (x: number, y: number) => number;
}

/**
 * The falloff every parcel is dressed with: full density out to `fullM`, then a smooth decay to
 * `farFactor` by `farM`. A pure function of position, so the layout stays deterministic.
 */
export function spawnFalloff(
  cx: number,
  cy: number,
  fullM: number,
  farM: number,
  farFactor: number,
  /** Nothing is dressed past here. Set it beyond the fog: what is never seen is never placed. */
  cutoffM = Infinity,
): (x: number, y: number) => number {
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d >= cutoffM) return 0;
    if (d <= fullM) return 1;
    if (d >= farM) return farFactor;
    const t = (d - fullM) / (farM - fullM);
    // Smoothstep, so there is no visible ring where the density steps down.
    const e = t * t * (3 - 2 * t);
    return 1 + (farFactor - 1) * e;
  };
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
    const scale = options.densityScale ? options.densityScale(x, y) : 1;
    if (hashPosition(x, y, salt + 3) > (cls.biomes[biomeHere] ?? 0) * scale) return false;
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

// ── content: the asset classes (plan W2-2, cut per B4 to what a cell needs) ─────

/**
 * Every class the planet has words for, across all ten land biomes.
 *
 * `densityPerKm2` is the NEAR FIELD density, the ground within sight of the player, and it is set
 * from what the biome looks like rather than from a budget: woodland is one stem every six or
 * seven metres, a desert is one thing every fifteen. The budget is met by `spawnFalloff` thinning
 * the distance, not by making the near field bare. B4d measures the result.
 *
 * A cell needs only the classes its own biomes call for; `classesForBiomes` selects them, so
 * changing the demo cell changes which classes ship without touching this table.
 */
export const ASSET_CLASSES: readonly AssetClass[] = [
  // ── canopy: the thing that makes a place read as somewhere ──
  { id: "conifer", biomes: { taiga: 0.9, forest: 0.5, tundra: 0.15 }, densityPerKm2: 7000, waterDistanceM: { min: 8, max: Infinity }, cluster: { radiusM: 9, count: 3 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 900 }, collider: { radiusM: 0.7, heightM: 9 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "broadleaf", biomes: { forest: 0.9, grassland: 0.2, taiga: 0.2 }, densityPerKm2: 6500, waterDistanceM: { min: 8, max: Infinity }, cluster: { radiusM: 11, count: 3 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 900 }, collider: { radiusM: 0.9, heightM: 8 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "buttress-tree", biomes: { rainforest: 0.85 }, densityPerKm2: 4500, cluster: { radiusM: 14, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 900 }, collider: { radiusM: 1.6, heightM: 14 }, scale: [0.8, 1.6], castsShadow: true },
  { id: "vine-tangle", biomes: { rainforest: 0.6, forest: 0.2 }, densityPerKm2: 5000, cluster: { radiusM: 8, count: 3 }, excludes: ["water", "path", "footprint"], lod: { nearM: 110, farM: 380 }, collider: null, scale: [0.7, 1.6], castsShadow: false },
  { id: "fallen-log", biomes: { rainforest: 0.45, forest: 0.4, taiga: 0.35 }, densityPerKm2: 1100, excludes: ["water", "path", "footprint"], lod: { nearM: 140, farM: 500 }, collider: { radiusM: 1.1, heightM: 0.9 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "bromeliad", biomes: { rainforest: 0.55 }, densityPerKm2: 6000, excludes: ["water", "path"], lod: { nearM: 60, farM: 200 }, collider: null, scale: [0.6, 1.2], castsShadow: false },
  { id: "canopy-palm", biomes: { rainforest: 0.9, beach: 0.25 }, densityPerKm2: 6000, cluster: { radiusM: 10, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 900 }, collider: { radiusM: 0.6, heightM: 11 }, scale: [0.8, 1.4], castsShadow: true },
  { id: "acacia", biomes: { savanna: 0.7, grassland: 0.15 }, densityPerKm2: 900, waterDistanceM: { min: 15, max: Infinity }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 900 }, collider: { radiusM: 1.1, heightM: 6 }, scale: [0.8, 1.6], castsShadow: true },
  { id: "dead-tree", biomes: { tundra: 0.3, taiga: 0.2, desert: 0.1 }, densityPerKm2: 700, excludes: ["water", "path", "footprint"], lod: { nearM: 160, farM: 700 }, collider: { radiusM: 0.5, heightM: 5 }, scale: [0.6, 1.2], castsShadow: true },
  // ── understorey ──
  { id: "thicket", biomes: { forest: 0.8, rainforest: 0.8, taiga: 0.6, grassland: 0.3 }, densityPerKm2: 9000, cluster: { radiusM: 7, count: 4 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 120, farM: 450 }, collider: { radiusM: 1.2, heightM: 1.6 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "fern", biomes: { rainforest: 0.9, forest: 0.7, taiga: 0.4 }, densityPerKm2: 14000, cluster: { radiusM: 5, count: 5 }, excludes: ["water", "path"], lod: { nearM: 70, farM: 220 }, collider: null, scale: [0.6, 1.3], castsShadow: false },
  { id: "berry-bush", biomes: { forest: 0.5, taiga: 0.5, grassland: 0.4, tundra: 0.2 }, densityPerKm2: 2200, excludes: ["water", "path", "footprint"], lod: { nearM: 110, farM: 380 }, collider: { radiusM: 0.8, heightM: 1.1 }, scale: [0.7, 1.3], castsShadow: true },
  { id: "grass-tuft", biomes: { grassland: 0.95, savanna: 0.8, tundra: 0.5, beach: 0.25, forest: 0.4, taiga: 0.35 }, densityPerKm2: 18000, excludes: ["water", "path"], lod: { nearM: 70, farM: 220 }, collider: null, scale: [0.7, 1.4], castsShadow: false },
  { id: "dead-shrub", biomes: { desert: 0.8, tundra: 0.45, savanna: 0.3, grassland: 0.15 }, densityPerKm2: 3200, excludes: ["water", "path", "footprint"], lod: { nearM: 100, farM: 400 }, collider: null, scale: [0.6, 1.3], castsShadow: false },
  { id: "cactus", biomes: { desert: 0.7 }, densityPerKm2: 900, waterDistanceM: { min: 40, max: Infinity }, cluster: { radiusM: 12, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 150, farM: 700 }, collider: { radiusM: 0.5, heightM: 2.4 }, scale: [0.7, 1.4], castsShadow: true },
  { id: "reeds", biomes: { beach: 0.8, grassland: 0.35, rainforest: 0.3 }, densityPerKm2: 3000, waterDistanceM: { min: 0, max: 90 }, cluster: { radiusM: 6, count: 7 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 120, farM: 500 }, collider: null, scale: [0.8, 1.4], castsShadow: false },
  { id: "moss-patch", biomes: { tundra: 0.8, taiga: 0.6, snow: 0.15 }, densityPerKm2: 9000, excludes: ["water", "path"], lod: { nearM: 60, farM: 200 }, collider: null, scale: [0.7, 1.6], castsShadow: false },
  // ── stone and ground ──
  { id: "boulder", biomes: { tundra: 0.7, "bare-rock": 0.9, desert: 0.35, grassland: 0.25, taiga: 0.4, forest: 0.25, rainforest: 0.2 }, densityPerKm2: 1600, waterDistanceM: { min: 6, max: Infinity }, cluster: { radiusM: 10, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 900 }, collider: { radiusM: 1.4, heightM: 1.8 }, scale: [0.6, 2.4], castsShadow: true },
  { id: "scree", biomes: { "bare-rock": 0.9, snow: 0.4, tundra: 0.3 }, densityPerKm2: 12000, altitude: { min: 0.03, max: 1 }, cluster: { radiusM: 8, count: 6 }, excludes: ["water", "path"], lod: { nearM: 80, farM: 300 }, collider: null, scale: [0.5, 1.2], castsShadow: false },
  { id: "lichen-rock", biomes: { tundra: 0.9, taiga: 0.5, "bare-rock": 0.6 }, densityPerKm2: 5000, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 300 }, collider: { radiusM: 0.6, heightM: 0.6 }, scale: [0.5, 1.3], castsShadow: false },
  { id: "snow-drift", biomes: { snow: 0.9, tundra: 0.2 }, densityPerKm2: 5000, excludes: ["water", "path"], lod: { nearM: 100, farM: 400 }, collider: null, scale: [0.9, 2.2], castsShadow: false },
  { id: "dune-ripple", biomes: { desert: 0.9, beach: 0.35 }, densityPerKm2: 4000, excludes: ["water", "path"], lod: { nearM: 60, farM: 250 }, collider: null, scale: [1, 2.2], castsShadow: false },
  // ── the shoreline ──
  { id: "driftwood", biomes: { beach: 0.6 }, densityPerKm2: 1400, waterDistanceM: { min: 0, max: 160 }, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 400 }, collider: { radiusM: 0.9, heightM: 0.5 }, scale: [0.7, 1.3], castsShadow: true },
  { id: "shell", biomes: { beach: 0.9 }, densityPerKm2: 4500, waterDistanceM: { min: 0, max: 120 }, excludes: ["water", "path"], lod: { nearM: 40, farM: 120 }, collider: null, scale: [0.6, 1.2], castsShadow: false },
  { id: "tidepool", biomes: { beach: 0.4 }, densityPerKm2: 250, waterDistanceM: { min: 0, max: 60 }, excludes: ["water", "path", "footprint"], lod: { nearM: 120, farM: 400 }, collider: null, scale: [1, 1.6], castsShadow: false },
  { id: "shore-rock", biomes: { beach: 0.5 }, densityPerKm2: 1800, waterDistanceM: { min: 0, max: 70 }, cluster: { radiusM: 7, count: 3 }, excludes: ["water", "path", "footprint"], lod: { nearM: 120, farM: 450 }, collider: { radiusM: 0.7, heightM: 0.8 }, scale: [0.5, 1.4], castsShadow: true },
];

/** The classes a set of biomes calls for: everything with a non-zero weight in any of them. */
export function classesForBiomes(biomes: readonly Biome[], registry: readonly AssetClass[] = ASSET_CLASSES): AssetClass[] {
  const want = new Set(biomes);
  return registry.filter((c) => (Object.keys(c.biomes) as Biome[]).some((b) => want.has(b) && (c.biomes[b] ?? 0) > 0));
}

/**
 * The classes the demo cell ships with. A selection, not a second table: change DEMO_LAND_BIOMES
 * and this follows, which is the one-line cell swap the plan promised.
 */
export const DEMO_ASSET_CLASSES: readonly AssetClass[] = classesForBiomes(DEMO_LAND_BIOMES);
