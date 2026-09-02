/**
 * The walkable parcel, as a tangent plane patch (section 6.2, steps 1 to 3).
 *
 * This is the second half of the promise in section 1. The globe shows a parcel; the player walks
 * into it; the two must be the same ground. What makes that true is not care, it is that both
 * renderers reach the same terrain function at the same position, and this file exists to make the
 * "same position" half provable rather than hoped for.
 *
 * THE APPROXIMATION, stated plainly because section 6.2 asks for it to be noted.
 *
 * A parcel is projected gnomonically onto the plane tangent at its centre: a local coordinate in
 * metres is the point where a ray from the planet's centre, through the tangent plane, crosses the
 * sphere. That mapping is exact and invertible, so no terrain is misplaced by it. What it does not
 * preserve is DISTANCE: a metre near the edge of the patch is not quite a metre on the ground. The
 * error is (d/R)^2 / 3 to first order, so on this 200 km planet it is 0.14% across a resolution 1
 * parcel and 4 parts per million across a resolution 4 one. {@link tangentDistortion} measures it
 * for a given parcel rather than leaving you with this paragraph.
 *
 * Boundary clipping and deterministic vegetation are build order step 10 and deliberately absent.
 * What is here is exactly what step 5's agreement test needs: the projection, and the heightmap.
 */

import { cellToBoundary, cellToLatLng } from "h3-js";

import { latLngToVec3, type Vec3 } from "./geo.js";
import { normalisedHeight, type Calibration, type TerrainField } from "./terrain.js";

export interface TangentPatch {
  cell: string;
  /** Planet radius in metres, the unit local coordinates are expressed in. */
  radiusM: number;
  /** Unit vector at the parcel centre, and an orthonormal tangent frame there. */
  centre: Vec3;
  east: Vec3;
  north: Vec3;
  /** The parcel outline in local metres, ready for step 10 to clip against. */
  boundary: Array<readonly [number, number]>;
  /** Half width of the smallest axis aligned box containing the parcel, in metres. */
  extentM: number;
  /** A local coordinate in metres to the unit sphere direction it names. */
  toDirection(x: number, y: number): Vec3;
  /** The inverse. Returns null for a direction in the far hemisphere, which has no local image. */
  toLocal(direction: Vec3): [number, number] | null;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function createTangentPatch(cell: string, radiusKm: number): TangentPatch {
  const [lat, lng] = cellToLatLng(cell);
  const centre = latLngToVec3(lat, lng);
  const radiusM = radiusKm * 1000;

  // An orthonormal frame at the centre. The pole is used as the up reference, except at a pole
  // itself, where any perpendicular will do because every direction there is south.
  const up: Vec3 = Math.abs(centre[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  let ex: Vec3 = [
    up[1] * centre[2] - up[2] * centre[1],
    up[2] * centre[0] - up[0] * centre[2],
    up[0] * centre[1] - up[1] * centre[0],
  ];
  let n = Math.hypot(ex[0], ex[1], ex[2]);
  ex = [ex[0] / n, ex[1] / n, ex[2] / n];
  let no: Vec3 = [
    centre[1] * ex[2] - centre[2] * ex[1],
    centre[2] * ex[0] - centre[0] * ex[2],
    centre[0] * ex[1] - centre[1] * ex[0],
  ];
  n = Math.hypot(no[0], no[1], no[2]);
  no = [no[0] / n, no[1] / n, no[2] / n];

  const toDirection = (x: number, y: number): Vec3 => {
    const vx = centre[0] * radiusM + ex[0] * x + no[0] * y;
    const vy = centre[1] * radiusM + ex[1] * x + no[1] * y;
    const vz = centre[2] * radiusM + ex[2] * x + no[2] * y;
    const len = Math.hypot(vx, vy, vz);
    return [vx / len, vy / len, vz / len];
  };

  const toLocal = (d: Vec3): [number, number] | null => {
    const along = dot(d, centre);
    if (along <= 1e-9) return null;
    return [(radiusM * dot(d, ex)) / along, (radiusM * dot(d, no)) / along];
  };

  const boundary: Array<readonly [number, number]> = [];
  let extentM = 0;
  for (const [blat, blng] of cellToBoundary(cell)) {
    const local = toLocal(latLngToVec3(blat, blng));
    if (local === null) continue;
    boundary.push([local[0], local[1]] as const);
    extentM = Math.max(extentM, Math.abs(local[0]), Math.abs(local[1]));
  }

  return { cell, radiusM, centre, east: ex, north: no, boundary, extentM, toDirection, toLocal };
}

/**
 * The height the walkable scene renders at a local coordinate. THE scene path, in one function.
 *
 * The whole content of section 6.2 step 3 is the first line: convert the grid point back to a
 * position on the sphere BEFORE sampling. A scene that sampled a flat plane instead would look
 * plausible and would be a different planet from the one on the globe, which is the failure the
 * agreement test exists to catch.
 */
export function sceneHeightAt(
  patch: TangentPatch,
  field: TerrainField,
  calibration: Calibration,
  x: number,
  y: number,
): number {
  return normalisedHeight(field.elevation(patch.toDirection(x, y)), calibration);
}

export interface HeightPatch {
  patch: TangentPatch;
  /** Grid points per side. The grid is square and covers the parcel's bounding box. */
  resolution: number;
  /** Spacing between grid points, in metres. */
  spacingM: number;
  /** Local x and y of every grid point, row major. */
  x: Float64Array;
  y: Float64Array;
  /** Normalised height above sea level at every grid point. Negative is water. */
  heights: Float64Array;
  /** The unit direction each grid point was sampled at, three per point. */
  directions: Float64Array;
}

/** Sample the parcel onto a square grid. Step 10 clips this to the boundary polygon. */
export function buildHeightPatch(
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  resolution = 64,
): HeightPatch {
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError(`resolution must be an integer of at least 2, got ${resolution}`);
  }
  const patch = createTangentPatch(cell, radiusKm);
  const span = patch.extentM * 2;
  const spacingM = span / (resolution - 1);

  const x = new Float64Array(resolution * resolution);
  const y = new Float64Array(resolution * resolution);
  const heights = new Float64Array(resolution * resolution);
  const directions = new Float64Array(resolution * resolution * 3);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const k = j * resolution + i;
      const lx = -patch.extentM + i * spacingM;
      const ly = -patch.extentM + j * spacingM;
      x[k] = lx;
      y[k] = ly;
      const d = patch.toDirection(lx, ly);
      directions[k * 3] = d[0];
      directions[k * 3 + 1] = d[1];
      directions[k * 3 + 2] = d[2];
      heights[k] = normalisedHeight(field.elevation(d), calibration);
    }
  }

  return { patch, resolution, spacingM, x, y, heights, directions };
}

/**
 * How wrong the flat plane assumption is for this parcel, as a relative error on distance.
 *
 * Measured, not derived: walk the parcel boundary, compare the straight line distance in the local
 * plane against the true great circle distance on the sphere, and return the worst ratio seen.
 * Section 6.2 says to note the approximation, and a number notes it better than a sentence.
 */
export function tangentDistortion(patch: TangentPatch): number {
  let worst = 0;
  for (const [x, y] of patch.boundary) {
    const planar = Math.hypot(x, y);
    if (planar < 1e-6) continue;
    const angle = Math.acos(Math.min(1, dot(patch.toDirection(x, y), patch.centre)));
    const onSphere = angle * patch.radiusM;
    worst = Math.max(worst, Math.abs(planar - onSphere) / onSphere);
  }
  return worst;
}

// ── the walkable parcel (section 6.2, steps 4 and 5) ────────────────────────────

/**
 * A parcel cut to its own boundary, with water and vegetation.
 *
 * Two rules from section 6.2 that are easy to get subtly wrong, and are the whole point of this
 * code being here rather than in a renderer.
 *
 * The mesh is CUT to the parcel polygon, not merely faded at the edge. Where the boundary crosses
 * water the parcel edge IS water, and a player standing there has to see that: it is the difference
 * between owning a coastline and owning a square that happens to contain one.
 *
 * Vegetation is placed by hashing the world position. Not by a seeded generator walked in order,
 * which would move every tree if the grid resolution changed, and never by Math.random. The same
 * parcel gives the same trees in the same places on the server, in the browser, and next year.
 */

import { biome, BIOME_COLOUR, type Biome, type Rgb } from "./terrain.js";

export interface ParcelSceneOptions {
  /** Grid points per side over the parcel's bounding box before clipping. */
  resolution: number;
  /** Vertical exaggeration, as metres of height per unit of normalised elevation. */
  heightScaleM: number;
  /** Plants per square kilometre on fully vegetated, flat ground. */
  vegetationPerKm2: number;
  /** Slope above which nothing grows, as a rise over run. */
  maxSlope: number;
}

export const DEFAULT_SCENE_OPTIONS: ParcelSceneOptions = {
  resolution: 96,
  heightScaleM: 900,
  vegetationPerKm2: 3200,
  maxSlope: 0.8,
};

export interface Plant {
  /** Local metres, east and north of the parcel centre, and metres above sea level. */
  x: number;
  y: number;
  z: number;
  biome: Biome;
  /** 0.6 to 1.4, stable for this position. */
  scale: number;
  /** Radians, stable for this position. */
  rotation: number;
}

export interface ParcelScene {
  cell: string;
  patch: TangentPatch;
  /** Triangle soup, three vertices each, in local metres with z up. Already clipped. */
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  triangleCount: number;
  /** Height of the water surface in the same local frame. Ground below this is submerged. */
  waterLevelZ: number;
  /** True when the parcel contains any water at all, so the renderer knows to draw the sea. */
  hasWater: boolean;
  /** Fraction of the parcel's area above water, measured on the clipped mesh. */
  landFraction: number;
  plants: Plant[];
  dominantBiome: Biome;
}

/** A stable value in 0..1 from a position in local metres. Never a generator, never an index. */
export function hashPosition(x: number, y: number, salt = 0): number {
  // Quantise to a millimetre first, so a position that is the same place is the same number even
  // when it arrives by a different arithmetic route on a different machine.
  let h = 2166136261 >>> 0;
  for (const value of [Math.round(x * 1000), Math.round(y * 1000), salt]) {
    let v = value | 0;
    for (let byte = 0; byte < 4; byte++) {
      h ^= (v & 0xff) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
      v >>= 8;
    }
  }
  return (h >>> 0) / 4294967296;
}

/** Is a point inside the convex boundary polygon? Gnomonic projection keeps an H3 cell convex. */
function insidePolygon(polygon: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
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
  return true;
}

/** Sutherland Hodgman, one convex clip polygon. Returns the clipped convex polygon, possibly empty. */
function clipTriangle(
  triangle: Array<[number, number]>,
  polygon: ReadonlyArray<readonly [number, number]>,
  winding: number,
): Array<[number, number]> {
  let output: Array<[number, number]> = triangle;
  for (let i = 0; i < polygon.length && output.length > 0; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const inside = (p: readonly [number, number]) =>
      winding * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;

    const input = output;
    output = [];
    for (let k = 0; k < input.length; k++) {
      const current = input[k]!;
      const previous = input[(k + input.length - 1) % input.length]!;
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn) {
        if (!previousIn) output.push(intersect(previous, current, a, b));
        output.push(current);
      } else if (previousIn) {
        output.push(intersect(previous, current, a, b));
      }
    }
  }
  return output;
}

function intersect(
  p: readonly [number, number],
  q: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): [number, number] {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) < 1e-12) return [q[0], q[1]];
  const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / denominator;
  return [p[0] + dx * t, p[1] + dy * t];
}

/**
 * Build the walkable parcel.
 *
 * The grid is sampled over the parcel's bounding box and then every triangle is clipped to the
 * boundary polygon, so the mesh ends exactly at the deed line. Height comes from
 * {@link sceneHeightAt}, which is the same function the agreement test compares against the globe,
 * so the ground here is the ground the globe showed.
 */
export function buildParcelScene(
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: Partial<ParcelSceneOptions> = {},
): ParcelScene {
  const opts: ParcelSceneOptions = { ...DEFAULT_SCENE_OPTIONS, ...options };
  const patch = createTangentPatch(cell, radiusKm);
  const polygon = patch.boundary;

  // Which way the boundary winds, so the clipper knows which side is inside.
  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  const winding = area2 >= 0 ? 1 : -1;

  const step = (patch.extentM * 2) / (opts.resolution - 1);
  const heightAt = (x: number, y: number) =>
    sceneHeightAt(patch, field, calibration, x, y) * opts.heightScaleM;
  const biomeAtLocal = (x: number, y: number): Biome => {
    const direction = patch.toDirection(x, y);
    const height = sceneHeightAt(patch, field, calibration, x, y);
    return biome(height, field.moisture(direction), field.temperature(direction));
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  let landArea = 0;
  let totalArea = 0;
  let hasWater = false;
  const biomeArea = new Map<Biome, number>();

  const emit = (poly: Array<[number, number]>): void => {
    // Fan triangulate the clipped convex polygon.
    for (let k = 1; k + 1 < poly.length; k++) {
      const tri = [poly[0]!, poly[k]!, poly[k + 1]!];
      const z = tri.map(([x, y]) => heightAt(x, y));

      const ux = tri[1]![0] - tri[0]![0];
      const uy = tri[1]![1] - tri[0]![1];
      const uz = z[1]! - z[0]!;
      const vx = tri[2]![0] - tri[0]![0];
      const vy = tri[2]![1] - tri[0]![1];
      const vz = z[2]! - z[0]!;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      if (nz < 0) {
        nx = -nx; ny = -ny; nz = -nz;
      }
      nx /= nl; ny /= nl; nz /= nl;

      const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
      const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
      const flat = Math.abs(ux * vy - uy * vx) / 2;
      totalArea += flat;
      const kind = biomeAtLocal(cx, cy);
      if (kind === "ocean") hasWater = true;
      else landArea += flat;
      biomeArea.set(kind, (biomeArea.get(kind) ?? 0) + flat);
      const colour = BIOME_COLOUR[kind];

      for (let v = 0; v < 3; v++) {
        positions.push(tri[v]![0], tri[v]![1], z[v]!);
        normals.push(nx, ny, nz);
        colours.push(colour[0] / 255, colour[1] / 255, colour[2] / 255);
      }
    }
  };

  for (let j = 0; j + 1 < opts.resolution; j++) {
    for (let i = 0; i + 1 < opts.resolution; i++) {
      const x0 = -patch.extentM + i * step;
      const y0 = -patch.extentM + j * step;
      const x1 = x0 + step;
      const y1 = y0 + step;
      const quad: Array<[number, number]> = [
        [x0, y0], [x1, y0], [x1, y1], [x0, y1],
      ];
      // Whole quads inside the boundary skip the clipper, which is most of them.
      if (quad.every(([x, y]) => insidePolygon(polygon, x, y))) {
        emit([quad[0]!, quad[1]!, quad[2]!]);
        emit([quad[0]!, quad[2]!, quad[3]!]);
        continue;
      }
      const clipped = clipTriangle([quad[0]!, quad[1]!, quad[2]!], polygon, winding);
      if (clipped.length >= 3) emit(clipped);
      const clipped2 = clipTriangle([quad[0]!, quad[2]!, quad[3]!], polygon, winding);
      if (clipped2.length >= 3) emit(clipped2);
    }
  }

  // Vegetation. Candidate positions come from a jittered lattice whose jitter is a hash of the
  // lattice point, so density is even and every plant is a pure function of where it stands.
  const plants: Plant[] = [];
  const areaKm2 = totalArea / 1e6;
  const wanted = Math.round(areaKm2 * opts.vegetationPerKm2);
  const lattice = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, wanted))));
  const spacing = (patch.extentM * 2) / lattice;

  for (let j = 0; j < lattice; j++) {
    for (let i = 0; i < lattice; i++) {
      const baseX = -patch.extentM + (i + 0.5) * spacing;
      const baseY = -patch.extentM + (j + 0.5) * spacing;
      const jx = hashPosition(baseX, baseY, 1);
      const jy = hashPosition(baseX, baseY, 2);
      const x = baseX + (jx - 0.5) * spacing;
      const y = baseY + (jy - 0.5) * spacing;
      if (!insidePolygon(polygon, x, y)) continue;

      const kind = biomeAtLocal(x, y);
      const density = VEGETATION_DENSITY[kind];
      if (density <= 0) continue;
      if (hashPosition(x, y, 3) > density) continue;

      // Slope, from the heights around the point. Nothing grows on a cliff.
      const z = heightAt(x, y);
      const slope = Math.hypot(
        (heightAt(x + spacing * 0.5, y) - heightAt(x - spacing * 0.5, y)) / spacing,
        (heightAt(x, y + spacing * 0.5) - heightAt(x, y - spacing * 0.5)) / spacing,
      );
      if (slope > opts.maxSlope) continue;

      plants.push({
        x,
        y,
        z,
        biome: kind,
        scale: 0.6 + hashPosition(x, y, 4) * 0.8,
        rotation: hashPosition(x, y, 5) * Math.PI * 2,
      });
    }
  }

  let dominantBiome: Biome = "ocean";
  let best = -1;
  for (const [kind, area] of biomeArea) {
    // The dominant biome of a parcel is what it IS, so open water does not win a parcel that has
    // any land at all: nobody describes their land as "ocean" because half of it is offshore.
    const weight = kind === "ocean" ? area * 0.001 : area;
    if (weight > best) {
      best = weight;
      dominantBiome = kind;
    }
  }

  return {
    cell,
    patch,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colours: new Float32Array(colours),
    triangleCount: positions.length / 9,
    waterLevelZ: 0,
    hasWater,
    landFraction: totalArea > 0 ? landArea / totalArea : 0,
    plants,
    dominantBiome,
  };
}

/** How thickly each biome plants itself, 0 to 1. Rock, ice, sand and water grow nothing. */
const VEGETATION_DENSITY: Record<Biome, number> = {
  ocean: 0,
  beach: 0.04,
  grassland: 0.35,
  forest: 0.85,
  rainforest: 1,
  savanna: 0.22,
  desert: 0.03,
  tundra: 0.08,
  taiga: 0.6,
  "bare-rock": 0,
  snow: 0,
};

export { BIOME_COLOUR, type Biome, type Rgb };
