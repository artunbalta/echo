/**
 * Walkability, the spawn point, the region bound, and connectivity (contract, plan §4).
 *
 * Four facts the whole rebuild rests on, in one file so the client and the server cannot drift:
 *
 *   1. Walkable means LAND, nothing else. Gameplay stays (x, y) on a flat plane; height is visual
 *      only and slope is never a gate (decision Q10). `walkableAt` is therefore `isLand` plus the
 *      region bound, and it is the predicate the mover checks before every step, on both sides.
 *
 *   2. A parcel is assignable when 15% of it is dry, which says nothing about its centre. 2.69%
 *      of the shipped planet's assignable parcels have a submerged centre. `spawnPointFor` finds a
 *      dry point INSIDE the parcel deterministically: it walks the cell's own descendants whose
 *      centre lies in the parcel (H3 children are only approximately nested), centre first and
 *      then nearest first, and takes the first that is land. The walkable test proves this for
 *      every one of those parcels.
 *
 *   3. The built world is finite and hexagonal. The scene builds the anchor cell and its k rings;
 *      `regionBound` is that exact union of hexagons in the anchor frame, so the edge of the
 *      built ground is the edge of the walkable world, and the placer never scatters past it.
 *
 *   4. "Reachable" means a flood fill over walkable ground joins two points, not that both are
 *      dry. Two banks of a channel are dry.
 *
 * DEPARTURE FROM THE FROZEN CONTRACT, recorded here so the two do not silently disagree, which is
 * the failure mode the plan's D1 to D34 list is entirely made of. Section 4 specified that
 * walkability would quantise the normalised height to 1e-6 before comparing it to the threshold,
 * as a cross-engine guard. It does not, and should not: rounding does not remove the straddle
 * risk, it moves it from "within one ulp of sea level" to "within one ulp of a rounding boundary",
 * which is no rarer and is arbitrary as well. The land test is a plain sign test in terrain.ts
 * (isLandHeight), shared by the registry, the biome table and the globe, and the cross-engine
 * guarantee is the goldens spec that runs the planet in Chromium, WebKit and Firefox
 * (apps/web/tests/e2e/goldens.spec.ts).
 */

import {
  cellToBoundary,
  cellToCenterChild,
  cellToChildren,
  cellToLatLng,
  cellToParent,
  getResolution,
  gridDisk,
  latLngToCell,
} from "h3-js";

import { latLngToVec3, type Vec3 } from "./geo.js";
import { createTangentPatch, type TangentPatch } from "./scene.js";
import { hashString, isLand, type Calibration, type TerrainField } from "./terrain.js";

// ── the region ──────────────────────────────────────────────────────────────────

export interface RegionBound {
  /** Radius of a circle that contains the whole region, for quick rejects and mask extents. */
  readonly radiusM: number;
  /** Exact membership in the anchor patch's local metres. */
  contains(x: number, y: number): boolean;
}

/** A plain circle. Tests and single-parcel scenes use it; the built world uses `regionBound`. */
export function circleBound(radiusM: number): RegionBound {
  const r2 = radiusM * radiusM;
  return { radiusM, contains: (x, y) => x * x + y * y <= r2 };
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

/**
 * The union of the anchor cell and its `k` rings, as polygons in the anchor's tangent frame.
 * A point is in the region when it is inside any of them. The gnomonic projection keeps every
 * cell convex, so membership is a sign test per edge.
 */
export function regionBound(cell: string, k: number, radiusKm: number): RegionBound {
  const anchor = createTangentPatch(cell, radiusKm);
  const polygons: Array<Array<[number, number]>> = [];
  let radiusM = 0;
  for (const c of gridDisk(cell, k)) {
    const polygon: Array<[number, number]> = [];
    for (const [lat, lng] of cellToBoundary(c)) {
      const local = anchor.toLocal(latLngToVec3(lat, lng));
      if (local === null) continue;
      polygon.push([local[0], local[1]]);
      radiusM = Math.max(radiusM, Math.hypot(local[0], local[1]));
    }
    if (polygon.length >= 3) polygons.push(polygon);
  }
  const r2 = radiusM * radiusM;
  return {
    radiusM,
    contains: (x, y) => x * x + y * y <= r2 && polygons.some((p) => insideConvex(p, x, y)),
  };
}

// ── walkability ─────────────────────────────────────────────────────────────────

/** Can a person stand at this local coordinate. Land, and inside the built region. */
export function walkableAt(
  patch: TangentPatch,
  field: TerrainField,
  seaLevel: number,
  x: number,
  y: number,
  bound?: RegionBound,
): boolean {
  if (bound && !bound.contains(x, y)) return false;
  return isLand(field, seaLevel, patch.toDirection(x, y));
}

// ── the spawn ───────────────────────────────────────────────────────────────────

export interface SpawnPoint {
  /** The parcel this spawn belongs to. */
  cell: string;
  /** The descendant cell whose centre is the spawn point. */
  childCell: string;
  /** Resolution steps below the parcel the search had to go. 3 for every parcel measured so far. */
  depth: number;
  lat: number;
  lng: number;
  direction: Vec3;
  /** The spawn in the parcel's own tangent frame, metres east and north of the parcel centre. */
  x: number;
  y: number;
}

export interface SpawnOptions {
  /** First resolution offset to search. Depth 3 is 343 candidates per hexagon. */
  depth?: number;
  /** Last resolution offset to try before giving up. Depth 5 is 16,807 candidates. */
  maxDepth?: number;
}

/**
 * A dry point inside the parcel, chosen the same way every time.
 *
 * Candidates are the parcel's descendants whose centre resolves back to the parcel (about 6% of
 * H3 children stick out of their parent; those are skipped, so "inside" is enforced here and not
 * only observed by a test). Order: the centre child first, then by distance from the centre in the
 * parcel's tangent frame, ties by a hash of the child's id. Returns null only for a parcel with no
 * dry descendant to `maxDepth`, which an assignable parcel cannot be.
 */
export function spawnPointFor(
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: SpawnOptions = {},
): SpawnPoint | null {
  const res = getResolution(cell);
  const first = options.depth ?? 3;
  const last = options.maxDepth ?? 5;
  if (first < 1 || last < first) throw new RangeError(`bad spawn depths ${first}..${last}`);
  const patch = createTangentPatch(cell, radiusKm);

  for (let depth = first; depth <= last; depth++) {
    const childRes = res + depth;
    if (childRes > 15) break;
    const centre = cellToCenterChild(cell, childRes);
    const candidates = cellToChildren(cell, childRes)
      .filter((c) => c !== centre)
      .map((c) => {
        const [lat, lng] = cellToLatLng(c);
        return { c, lat, lng };
      })
      .filter(({ lat, lng }) => latLngToCell(lat, lng, res) === cell)
      .map(({ c, lat, lng }) => {
        const local = patch.toLocal(latLngToVec3(lat, lng)) ?? [Infinity, Infinity];
        return { c, d2: local[0] * local[0] + local[1] * local[1], h: hashString(c) };
      })
      .sort((a, b) => a.d2 - b.d2 || a.h - b.h)
      .map((e) => e.c);
    for (const child of [centre, ...candidates]) {
      const [lat, lng] = cellToLatLng(child);
      if (latLngToCell(lat, lng, res) !== cell) continue;
      const direction = latLngToVec3(lat, lng);
      if (!isLand(field, calibration.seaLevel, direction)) continue;
      const local = patch.toLocal(direction);
      if (local === null) continue;
      return { cell, childCell: child, depth, lat, lng, direction, x: local[0], y: local[1] };
    }
  }
  return null;
}

/** True when the spawn's descendant cell really sits under the parcel it was searched for. */
export function spawnInsideParcel(spawn: SpawnPoint): boolean {
  const res = getResolution(spawn.cell);
  return cellToParent(spawn.childCell, res) === spawn.cell && latLngToCell(spawn.lat, spawn.lng, res) === spawn.cell;
}

// ── connectivity ────────────────────────────────────────────────────────────────

export interface ConnectOptions {
  /** Grid spacing in metres. Coarser is faster; finer sees narrow causeways. */
  stepM: number;
  /** Half width of the square the search may explore, in metres. */
  extentM: number;
  /** Give up after this many grid nodes, so a bad predicate cannot hang a test. */
  maxNodes?: number;
}

/**
 * Can you walk from `a` to `b`. A flood fill over a square grid of `walkable`, four-connected.
 *
 * An endpoint is represented by the nearest walkable node among the four grid nodes around it,
 * so a point on dry ground a metre from a node is not lost to rounding. If none of the four is
 * walkable the point is not on walkable ground at this resolution and the answer is false.
 */
export function connected(
  walkable: (x: number, y: number) => boolean,
  a: readonly [number, number],
  b: readonly [number, number],
  options: ConnectOptions,
): boolean {
  const { stepM, extentM } = options;
  if (!(stepM > 0) || !(extentM > 0)) throw new RangeError("stepM and extentM must be positive");
  const size = Math.floor((2 * extentM) / stepM) + 1;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size;
  const at = (i: number, j: number) => walkable(-extentM + i * stepM, -extentM + j * stepM);

  const snap = (p: readonly [number, number]): [number, number] | null => {
    const fi = (p[0] + extentM) / stepM;
    const fj = (p[1] + extentM) / stepM;
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of [Math.floor(fi), Math.ceil(fi)]) {
      for (const j of [Math.floor(fj), Math.ceil(fj)]) {
        if (!inside(i, j) || !at(i, j)) continue;
        const d = Math.hypot(i - fi, j - fj);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    return best;
  };

  const start = snap(a);
  const goal = snap(b);
  if (!start || !goal) return false;
  const [ai, aj] = start;
  const [bi, bj] = goal;

  const visited = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  queue[tail++] = aj * size + ai;
  visited[aj * size + ai] = 1;
  const limit = options.maxNodes ?? size * size;
  while (head < tail) {
    const k = queue[head++]!;
    if (head > limit) return false;
    const i = k % size;
    const j = (k - i) / size;
    if (i === bi && j === bj) return true;
    const next: Array<[number, number]> = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
    for (const [ni, nj] of next) {
      if (!inside(ni, nj)) continue;
      const nk = nj * size + ni;
      if (visited[nk]) continue;
      visited[nk] = 1;
      if (at(ni, nj)) queue[tail++] = nk;
    }
  }
  return false;
}
