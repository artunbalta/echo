/**
 * The globe, as geometry rather than as pixels (section 6.1).
 *
 * Nothing in this file imports a renderer. It produces typed arrays, and a thin three.js or WebGL
 * layer hands them to the GPU. That split is not tidiness: it is what lets the cross renderer
 * agreement test in section 6.3 run in a test process with no browser, and what stops a second copy
 * of the terrain sampling logic growing inside a React component.
 *
 * Three commitments from section 6.1 are structural here, not decorative.
 *
 *   One mesh. A single displaced icosphere carries the whole planet, and every parcel is a region
 *   of vertices inside it. Not one mesh per parcel: at the floor resolution that would be fifteen
 *   thousand draw calls for a planet you can cover with one.
 *
 *   State changes never rebuild geometry. Ownership is a colour, and colour lives in its own typed
 *   array. {@link paintCell} rewrites the vertices of one parcel and nothing else, so claiming a
 *   parcel costs a few hundred floats and a needsUpdate flag. Geometry is rebuilt only when a
 *   subdivision round changes which cells exist, which is rare enough to show a transition.
 *
 *   Picking is arithmetic. Raycast a plain unit sphere, convert the hit to lat/lng, ask H3 which
 *   cell that is at the finest resolution in play, then walk up parents until you find one the
 *   registry holds. No GPU picking, no BVH, no per parcel colliders, and it handles a mixed
 *   resolution registry for free.
 */

import { cellToBoundary, cellToLatLng, cellToParent, getResolution, latLngToCell } from "h3-js";

import { latLngToVec3, vec3ToLatLng, type Vec3 } from "./geo.js";
import {
  BIOME_COLOUR,
  biome,
  normalisedHeight,
  type Calibration,
  type Rgb,
  type TerrainField,
} from "./terrain.js";

// ── the registry, as something you can point at ─────────────────────────────────

export interface RegistryIndex {
  readonly cells: ReadonlySet<string>;
  readonly finestResolution: number;
  readonly coarsestResolution: number;
  /** The parcel containing a point, or null if the registry does not cover it. */
  pick(lat: number, lng: number): string | null;
}

/**
 * Index a mixed resolution registry for picking.
 *
 * The walk starts at the finest resolution present and climbs. A registry holding a resolution 1
 * parcel next to a resolution 8 one is the normal case, not an edge case, because freezing a parcel
 * at its resolution is the whole design.
 */
export function createRegistryIndex(cells: Iterable<string>): RegistryIndex {
  const set = new Set(cells);
  let finest = 0;
  let coarsest = 15;
  for (const cell of set) {
    const res = getResolution(cell);
    if (res > finest) finest = res;
    if (res < coarsest) coarsest = res;
  }
  if (set.size === 0) {
    finest = 0;
    coarsest = 0;
  }

  return {
    cells: set,
    finestResolution: finest,
    coarsestResolution: coarsest,
    pick(lat: number, lng: number): string | null {
      let cell = latLngToCell(lat, lng, finest);
      for (let res = finest; res >= coarsest; res--) {
        if (set.has(cell)) return cell;
        if (res === 0) break;
        cell = cellToParent(cell, res - 1);
      }
      return null;
    },
  };
}

// ── the sphere the planet is built on ───────────────────────────────────────────

export interface Icosphere {
  /** Unit direction per vertex, three floats each. */
  directions: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

/**
 * A subdivided icosahedron.
 *
 * Chosen over a lat/lng sphere for the same reason H3 is: a UV sphere piles vertices at the poles
 * and starves the equator, so polar terrain would be oversampled and tropical terrain smeared.
 * Vertex count is 10 * 4^n + 2, so 6 subdivisions is 40,962 vertices and 7 is 163,842.
 */
export function buildIcosphere(subdivisions: number): Icosphere {
  if (!Number.isInteger(subdivisions) || subdivisions < 0 || subdivisions > 8) {
    throw new RangeError(`subdivisions must be an integer in 0..8, got ${subdivisions}`);
  }

  const phi = (1 + Math.sqrt(5)) / 2;
  let vertices: number[][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((v) => {
    const n = Math.hypot(v[0]!, v[1]!, v[2]!);
    return [v[0]! / n, v[1]! / n, v[2]! / n];
  });

  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let step = 0; step < subdivisions; step++) {
    const midpoints = new Map<string, number>();
    const next: number[][] = [];
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const seen = midpoints.get(key);
      if (seen !== undefined) return seen;
      const va = vertices[a]!;
      const vb = vertices[b]!;
      const m = [va[0]! + vb[0]!, va[1]! + vb[1]!, va[2]! + vb[2]!];
      const n = Math.hypot(m[0]!, m[1]!, m[2]!);
      const index = vertices.length;
      vertices.push([m[0]! / n, m[1]! / n, m[2]! / n]);
      midpoints.set(key, index);
      return index;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a!, b!);
      const bc = midpoint(b!, c!);
      const ca = midpoint(c!, a!);
      next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const directions = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    directions[i * 3] = vertices[i]![0]!;
    directions[i * 3 + 1] = vertices[i]![1]!;
    directions[i * 3 + 2] = vertices[i]![2]!;
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let f = 0; f < faces.length; f++) {
    indices[f * 3] = faces[f]![0]!;
    indices[f * 3 + 1] = faces[f]![1]!;
    indices[f * 3 + 2] = faces[f]![2]!;
  }
  vertices = [];
  return { directions, indices, vertexCount: directions.length / 3 };
}

// ── the globe ───────────────────────────────────────────────────────────────────

export interface GlobeOptions {
  /** Icosphere subdivisions. 6 gives 40,962 vertices, which is plenty for a 200 km planet. */
  subdivisions: number;
  /**
   * How far a boundary line floats above the terrain, as a fraction of the radius.
   *
   * It has to clear assignedExtrusion, or an assigned parcel rises through its own outline and
   * buries it, which is the one line on the screen that must never be ambiguous.
   */
  outlineLift: number;
  /** How far the highest ground stands off the sphere, as a fraction of the radius. */
  reliefScale: number;
  /** How far an assigned parcel lifts off the surface, section 6.1. */
  assignedExtrusion: number;
}

export const DEFAULT_GLOBE_OPTIONS: GlobeOptions = {
  subdivisions: 6,
  outlineLift: 0.0075,
  reliefScale: 0.025,
  assignedExtrusion: 0.006,
};

export interface GlobeGeometry {
  vertexCount: number;
  /** Unit direction per vertex. This is the position terrain is sampled at, always. */
  directions: Float32Array;
  /** Displaced positions, ready for the GPU. Mutated in place by {@link setCellExtrusion}. */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Height above sea level per vertex, normalised 0..1 over land and negative at sea. */
  heights: Float32Array;
  /** The unassigned appearance of every vertex, computed once. */
  terrainColours: Float32Array;
  /** Which registry parcel each vertex falls in, as an index into `cells`. -1 if uncovered. */
  vertexCell: Int32Array;
  cells: string[];
  cellIndex: Map<string, number>;
  /** Vertices of parcel i are `cellVertices.slice(offsets[i], offsets[i + 1])`. */
  cellVertices: Int32Array;
  offsets: Int32Array;
  options: GlobeOptions;
}

/**
 * Build the whole globe once.
 *
 * Cost is dominated by one terrain sample and one H3 lookup per vertex, so it scales with the
 * icosphere and not with the registry: a planet with fifteen thousand parcels costs the same as a
 * planet with eight hundred.
 */
/**
 * The height the globe renders at a position. THE globe path, in one function.
 *
 * It exists as a named function rather than inline in the loop below so that the cross renderer
 * agreement test in section 6.3 can call exactly what the renderer calls. A test that compares two
 * reimplementations of the same idea proves nothing; this one compares the shipping code.
 */
export function globeHeightAt(field: TerrainField, calibration: Calibration, direction: Vec3): number {
  return normalisedHeight(field.elevation(direction), calibration);
}

export function buildGlobeGeometry(
  field: TerrainField,
  calibration: Calibration,
  registry: RegistryIndex,
  options: Partial<GlobeOptions> = {},
): GlobeGeometry {
  const opts: GlobeOptions = { ...DEFAULT_GLOBE_OPTIONS, ...options };
  const sphere = buildIcosphere(opts.subdivisions);
  const count = sphere.vertexCount;

  const positions = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  const terrainColours = new Float32Array(count * 3);
  const vertexCell = new Int32Array(count).fill(-1);
  const cells: string[] = [];
  const cellIndex = new Map<string, number>();
  const perCell: number[][] = [];

  for (let i = 0; i < count; i++) {
    const d: Vec3 = [sphere.directions[i * 3]!, sphere.directions[i * 3 + 1]!, sphere.directions[i * 3 + 2]!];

    const height = globeHeightAt(field, calibration, d);
    heights[i] = height;

    // Water sits flat at the sphere's own radius. Bathymetry is real but a dented ocean reads as a
    // rendering fault at globe scale, and the parcel outlines have to lie on something smooth.
    const lift = 1 + opts.reliefScale * Math.max(0, height);
    positions[i * 3] = d[0] * lift;
    positions[i * 3 + 1] = d[1] * lift;
    positions[i * 3 + 2] = d[2] * lift;

    const colour = BIOME_COLOUR[biome(height, field.moisture(d), field.temperature(d))];
    terrainColours[i * 3] = colour[0] / 255;
    terrainColours[i * 3 + 1] = colour[1] / 255;
    terrainColours[i * 3 + 2] = colour[2] / 255;

    const [lat, lng] = vec3ToLatLng(d[0], d[1], d[2]);
    const cell = registry.pick(lat, lng);
    if (cell !== null) {
      let index = cellIndex.get(cell);
      if (index === undefined) {
        index = cells.length;
        cells.push(cell);
        cellIndex.set(cell, index);
        perCell.push([]);
      }
      vertexCell[i] = index;
      perCell[index]!.push(i);
    }
  }

  // Flatten the per parcel vertex lists into one array with offsets, so a repaint of one parcel is
  // a contiguous walk rather than a map lookup per vertex.
  const offsets = new Int32Array(cells.length + 1);
  for (let c = 0; c < cells.length; c++) offsets[c + 1] = offsets[c]! + perCell[c]!.length;
  const cellVertices = new Int32Array(offsets[cells.length]!);
  for (let c = 0; c < cells.length; c++) {
    const list = perCell[c]!;
    for (let k = 0; k < list.length; k++) cellVertices[offsets[c]! + k] = list[k]!;
  }

  return {
    vertexCount: count,
    directions: sphere.directions,
    positions,
    normals: computeNormals(positions, sphere.indices, count),
    indices: sphere.indices,
    heights,
    terrainColours,
    vertexCell,
    cells,
    cellIndex,
    cellVertices,
    offsets,
    options: opts,
  };
}

/** Area weighted vertex normals, accumulated from face normals. A displaced sphere is not a sphere. */
function computeNormals(positions: Float32Array, indices: Uint32Array, count: number): Float32Array {
  const normals = new Float32Array(count * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f]! * 3;
    const b = indices[f + 1]! * 3;
    const c = indices[f + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      normals[v] = normals[v]! + nx;
      normals[v + 1] = normals[v + 1]! + ny;
      normals[v + 2] = normals[v + 2]! + nz;
    }
  }
  for (let i = 0; i < count; i++) {
    const n = Math.hypot(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!) || 1;
    normals[i * 3] = normals[i * 3]! / n;
    normals[i * 3 + 1] = normals[i * 3 + 1]! / n;
    normals[i * 3 + 2] = normals[i * 3 + 2]! / n;
  }
  return normals;
}

/** Fill a colour buffer with the unowned planet. Call once, then use {@link paintCell}. */
export function paintTerrain(geo: GlobeGeometry, out: Float32Array): void {
  if (out.length !== geo.terrainColours.length) {
    throw new RangeError(`colour buffer must be ${geo.terrainColours.length} long`);
  }
  out.set(geo.terrainColours);
}

/**
 * Repaint one parcel, and nothing else.
 *
 * Pass null to hand the parcel back to the terrain preview colour. This is the whole cost of a
 * claim arriving over the wire: a few hundred floats and a needsUpdate flag, no geometry rebuild.
 */
export function paintCell(geo: GlobeGeometry, cell: string, colour: Rgb | null, out: Float32Array): number {
  const index = geo.cellIndex.get(cell);
  if (index === undefined) return 0;
  const from = geo.offsets[index]!;
  const to = geo.offsets[index + 1]!;
  for (let k = from; k < to; k++) {
    const v = geo.cellVertices[k]! * 3;
    if (colour === null) {
      out[v] = geo.terrainColours[v]!;
      out[v + 1] = geo.terrainColours[v + 1]!;
      out[v + 2] = geo.terrainColours[v + 2]!;
    } else {
      out[v] = colour[0] / 255;
      out[v + 1] = colour[1] / 255;
      out[v + 2] = colour[2] / 255;
    }
  }
  return to - from;
}

/**
 * Lift or drop one parcel along its normal, writing into the existing position array.
 *
 * Section 6.1 asks assigned parcels to stand slightly proud of the surface, which is what makes
 * owned land legible on a rotating globe without any labels at all.
 */
export function setCellExtrusion(geo: GlobeGeometry, cell: string, extruded: boolean): number {
  const index = geo.cellIndex.get(cell);
  if (index === undefined) return 0;
  const from = geo.offsets[index]!;
  const to = geo.offsets[index + 1]!;
  const extra = extruded ? geo.options.assignedExtrusion : 0;
  for (let k = from; k < to; k++) {
    const v = geo.cellVertices[k]!;
    const lift = 1 + geo.options.reliefScale * Math.max(0, geo.heights[v]!) + extra;
    geo.positions[v * 3] = geo.directions[v * 3]! * lift;
    geo.positions[v * 3 + 1] = geo.directions[v * 3 + 1]! * lift;
    geo.positions[v * 3 + 2] = geo.directions[v * 3 + 2]! * lift;
  }
  return to - from;
}

// ── parcel outlines ─────────────────────────────────────────────────────────────

export interface Outlines {
  /** Line segment endpoints, six floats per segment. */
  positions: Float32Array;
  segmentCount: number;
}

/**
 * The boundary of every parcel, as line segments lying just above the terrain.
 *
 * Drawn on top of the displaced surface rather than into it, so a boundary running over a ridge
 * stays visible. The lift is proportional to the relief scale, so it survives any relief setting.
 */
export function buildParcelOutlines(
  cells: readonly string[],
  field: TerrainField,
  calibration: Calibration,
  options: Partial<GlobeOptions> = {},
): Outlines {
  const opts: GlobeOptions = { ...DEFAULT_GLOBE_OPTIONS, ...options };
  const segments: number[] = [];

  for (const cell of cells) {
    const boundary = cellToBoundary(cell);
    const points = boundary.map(([lat, lng]) => {
      const d = latLngToVec3(lat, lng);
      const height = normalisedHeight(field.elevation(d), calibration);
      const lift = 1 + opts.reliefScale * Math.max(0, height) + opts.outlineLift;
      return [d[0] * lift, d[1] * lift, d[2] * lift] as const;
    });
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      segments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  return { positions: new Float32Array(segments), segmentCount: segments.length / 6 };
}

// ── the parcel mesh ─────────────────────────────────────────────────────────────

/**
 * One merged mesh built from the H3 cell boundaries themselves, which is what section 6.1 asks for.
 *
 * The icosphere above is the right shape for TERRAIN: it samples elevation evenly and shades as a
 * smooth sphere. It is the wrong shape for a REGISTRY, because a parcel edge only lands where an
 * icosphere edge happens to be, and every boundary comes out with a sawtooth. On a map of who owns
 * what, that is not a rendering artefact, it is a wrong answer about where your land stops.
 *
 * So parcels are triangulated from their own boundaries: a fan from the cell centre out to each
 * boundary vertex, subdivided a level or two so the patch still carries relief, displaced by the
 * terrain, and coloured once per cell. Exact hexagons and pentagons, one mesh, one draw call, and
 * the vertices are already unshared so a per parcel fill needs no de-indexing.
 *
 * Cost is proportional to the registry rather than to the screen: 5,810 parcels at one subdivision
 * is 139,440 triangles, which is a rounding error for a GPU and rebuilds only on a round.
 */
export interface ParcelMesh {
  /** Nine floats per triangle. Mutated in place by {@link setParcelExtrusion}. */
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  terrainColours: Float32Array;
  triangleCount: number;
  cells: string[];
  cellIndex: Map<string, number>;
  /** Triangles of parcel i are the range [triangleOffsets[i], triangleOffsets[i + 1]). */
  triangleOffsets: Int32Array;
  options: GlobeOptions;
}

export interface ParcelMeshOptions extends GlobeOptions {
  /** How many times each fan triangle is split, so a large parcel still shows its own relief. */
  reliefSubdivisions: number;
}

export const DEFAULT_PARCEL_MESH_OPTIONS: ParcelMeshOptions = {
  ...DEFAULT_GLOBE_OPTIONS,
  reliefSubdivisions: 1,
};

export function buildParcelMesh(
  cells: readonly string[],
  field: TerrainField,
  calibration: Calibration,
  options: Partial<ParcelMeshOptions> = {},
): ParcelMesh {
  const opts: ParcelMeshOptions = { ...DEFAULT_PARCEL_MESH_OPTIONS, ...options };
  const split = Math.max(0, Math.round(opts.reliefSubdivisions));
  const perFan = Math.pow(4, split);

  let triangleCount = 0;
  for (const cell of cells) triangleCount += cellToBoundary(cell).length * perFan;

  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  const terrainColours = new Float32Array(triangleCount * 9);
  const triangleOffsets = new Int32Array(cells.length + 1);
  const cellIndex = new Map<string, number>();

  /** A boundary or centre point, lifted onto the terrain. */
  const lift = (d: Vec3): Vec3 => {
    const height = globeHeightAt(field, calibration, d);
    const r = 1 + opts.reliefScale * Math.max(0, height);
    return [d[0] * r, d[1] * r, d[2] * r];
  };

  let t = 0;
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]!;
    triangleOffsets[c] = t;
    cellIndex.set(cell, c);

    const [clat, clng] = cellToLatLng(cell);
    const centre = latLngToVec3(clat, clng);
    const ring = cellToBoundary(cell).map(([lat, lng]) => latLngToVec3(lat, lng));

    // The fill colour is sampled once, at the cell centre, exactly as section 6.1 specifies. One
    // parcel is one colour: a gradient across a deed would be a claim nobody made.
    const height = globeHeightAt(field, calibration, centre);
    const colour = BIOME_COLOUR[biome(height, field.moisture(centre), field.temperature(centre))];

    for (let i = 0; i < ring.length; i++) {
      emit(centre, ring[i]!, ring[(i + 1) % ring.length]!, split);
    }

    function emit(a: Vec3, b: Vec3, cc: Vec3, depth: number): void {
      if (depth > 0) {
        const ab = midOnSphere(a, b);
        const bc = midOnSphere(b, cc);
        const ca = midOnSphere(cc, a);
        emit(a, ab, ca, depth - 1);
        emit(b, bc, ab, depth - 1);
        emit(cc, ca, bc, depth - 1);
        emit(ab, bc, ca, depth - 1);
        return;
      }
      const p = [lift(a), lift(b), lift(cc)];
      // A flat normal per triangle. The fan is fine enough that this reads as relief, and it keeps
      // parcel edges crisp instead of smoothing them into their neighbours.
      const ux = p[1]![0] - p[0]![0], uy = p[1]![1] - p[0]![1], uz = p[1]![2] - p[0]![2];
      const vx = p[2]![0] - p[0]![0], vy = p[2]![1] - p[0]![1], vz = p[2]![2] - p[0]![2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      for (let k = 0; k < 3; k++) {
        const o = t * 9 + k * 3;
        positions[o] = p[k]![0];
        positions[o + 1] = p[k]![1];
        positions[o + 2] = p[k]![2];
        normals[o] = nx;
        normals[o + 1] = ny;
        normals[o + 2] = nz;
        terrainColours[o] = colour[0] / 255;
        terrainColours[o + 1] = colour[1] / 255;
        terrainColours[o + 2] = colour[2] / 255;
      }
      t++;
    }
  }
  triangleOffsets[cells.length] = t;

  return {
    positions,
    normals,
    colours: new Float32Array(terrainColours),
    terrainColours,
    triangleCount: t,
    cells: [...cells],
    cellIndex,
    triangleOffsets,
    options: opts,
  };
}

function midOnSphere(a: Vec3, b: Vec3): Vec3 {
  const x = a[0] + b[0];
  const y = a[1] + b[1];
  const z = a[2] + b[2];
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

/** Repaint one parcel. Pass null to hand it back to its terrain preview colour. */
export function paintParcel(mesh: ParcelMesh, cell: string, colour: Rgb | null): number {
  const index = mesh.cellIndex.get(cell);
  if (index === undefined) return 0;
  const from = mesh.triangleOffsets[index]!;
  const to = mesh.triangleOffsets[index + 1]!;
  for (let o = from * 9; o < to * 9; o += 3) {
    if (colour === null) {
      mesh.colours[o] = mesh.terrainColours[o]!;
      mesh.colours[o + 1] = mesh.terrainColours[o + 1]!;
      mesh.colours[o + 2] = mesh.terrainColours[o + 2]!;
    } else {
      mesh.colours[o] = colour[0] / 255;
      mesh.colours[o + 1] = colour[1] / 255;
      mesh.colours[o + 2] = colour[2] / 255;
    }
  }
  return to - from;
}

/** Lift or drop one parcel along the normal, writing into the existing position array. */
export function setParcelExtrusion(mesh: ParcelMesh, cell: string, extruded: boolean): number {
  const index = mesh.cellIndex.get(cell);
  if (index === undefined) return 0;
  const from = mesh.triangleOffsets[index]!;
  const to = mesh.triangleOffsets[index + 1]!;
  const delta = extruded ? mesh.options.assignedExtrusion : -mesh.options.assignedExtrusion;
  for (let o = from * 9; o < to * 9; o += 3) {
    const r = Math.hypot(mesh.positions[o]!, mesh.positions[o + 1]!, mesh.positions[o + 2]!) || 1;
    const scale = (r + delta) / r;
    mesh.positions[o] = mesh.positions[o]! * scale;
    mesh.positions[o + 1] = mesh.positions[o + 1]! * scale;
    mesh.positions[o + 2] = mesh.positions[o + 2]! * scale;
  }
  return to - from;
}
