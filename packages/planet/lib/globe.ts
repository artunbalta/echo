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
  BIOME_COLOUR_LINEAR,
  biome,
  linearRgb,
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
   * It has to clear whatever the parcel under it is drawn at. Over terrain that is the drawn
   * MESH, which stands above the continuous surface these points are sampled from wherever a
   * triangle spans a hollow; over an EXTRUDED parcel it is the extrusion as well, and a caller
   * that extrudes has to say so by passing `assignedExtrusion + outlineLift`, or the parcel rises
   * through its own outline and buries it.
   */
  outlineLift: number;
  /**
   * The longest straight piece a boundary edge is drawn as, in radians of arc. 250 m at 200 km.
   *
   * An edge drawn as ONE chord is under the ground it spans wherever that ground is convex, and a
   * buried outline is the one line on the screen that has to be unambiguous. Measured over 400
   * seeded resolution 4 cells on the shipped seed, whose edges are 800 m, the depth of a boundary
   * chord below its own terrain: 1 piece p99 37.4 m and 81.0 m worst, 2 pieces 9.8 and 25.2,
   * 4 pieces 2.6 and 6.5, 8 pieces 0.7 and 3.4. That is the quadratic a chord's sagitta should be,
   * so it is written as a LENGTH and not as a count: a commons is reserved at resolution 1 and its
   * edges are sixteen times longer, where four pieces each dive 650 m, measured, and take the line
   * under the mountain it is drawn over.
   */
  outlineSegmentArc: number;
  /** How far the highest ground stands off the sphere, as a fraction of the radius. */
  reliefScale: number;
  /** How far an assigned parcel lifts off the surface, section 6.1. */
  assignedExtrusion: number;
}

/**
 * reliefScale is 0.05 under DECISIONS C1, up from 0.025.
 *
 * It had to move, and the reason is the promise this file's header opens with rather than taste.
 * The dial is a fraction of the radius; the ground a person walks is `heightScaleM` metres. So what
 * the globe is really saying about the land is the ratio between them, `reliefScale * R /
 * heightScaleM`, and when heightScaleM went 900 -> 2,700 that ratio fell from 5.6x to 1.9x on its
 * own. The globe would have gone on drawing the same shape while under-reporting its roughness by
 * three times, which is the same split between the previewed terrain and the walked terrain that
 * DECISIONS C3 refused to accept for colour.
 *
 * It does NOT go back to 0.075, which is the number that restores 5.6x exactly. That was built and
 * looked at, and the landing pays for it in the one thing the landing is for. Measured on the hero
 * at 1280x800, the planet's own pixels and the raggedness of its limb, taken as the standard
 * deviation of the silhouette radius over 720 rays from the centroid:
 *
 *   0.025   298,718 px   limb sd 2.43 px on a 308 px radius   0.79%   gain 1.9x
 *   0.05    287,354 px   limb sd 3.93 px on a 302 px radius   1.30%   gain 3.7x
 *   0.075   277,204 px   limb sd 5.57 px on a 297 px radius   1.88%   gain 5.6x
 *
 * The planet SHRINKS as the dial grows because `resize()` frames `1 + reliefScale` while the mean
 * drawn radius is only 1.007: nearly all of the extra fitted radius is empty air around a handful
 * of peaks, so 0.075 costs 7.2% of the hero for relief that is on a few summits. And at 0.075 the
 * upper limb stops reading as a planet's edge and starts reading as a chipped rock.
 *
 * 0.05 is where the mountains first read as forms that cast shadows rather than as a grey colour
 * on a smooth ball, at 3.8% of the hero and 1.3% of raggedness. Closing half the gap deliberately,
 * with both halves of the cost written down, rather than closing all of it and losing the picture.
 */
export const DEFAULT_GLOBE_OPTIONS: GlobeOptions = {
  subdivisions: 6,
  outlineLift: 0.0006,
  outlineSegmentArc: 0.00125,
  reliefScale: 0.05,
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

/**
 * The radius the globe DRAWS at a direction: where the ground actually is.
 *
 * buildGlobeGeometry, setCellExtrusion, buildParcelMesh and buildParcelOutlines each lifted a
 * direction by this same expression written out four times, and picking used none of them: it
 * raycast a plain unit sphere. That is the whole of bug 1. Every consumer now says "the drawn
 * radius" by calling this, so a pick, a marker, an outline and an arrow cannot be told four
 * different stories about where the surface is.
 *
 * Water sits flat at radius 1, which is why the max(0, h): see buildGlobeGeometry.
 */
export function globeRadius(height: number, reliefScale = DEFAULT_GLOBE_OPTIONS.reliefScale): number {
  return 1 + reliefScale * Math.max(0, height);
}

/** The same, for a direction whose height is not already in hand. Costs one field evaluation. */
export function globeRadiusAt(
  field: TerrainField,
  calibration: Calibration,
  direction: Vec3,
  options: Partial<GlobeOptions> = {},
): number {
  return globeRadius(globeHeightAt(field, calibration, direction), options.reliefScale ?? DEFAULT_GLOBE_OPTIONS.reliefScale);
}

export interface GlobeHit {
  /** Unit direction of the surface point. This is what becomes a lat/lng and then a cell. */
  direction: Vec3;
  /** Distance from the ray origin, in radius units. */
  distance: number;
  /**
   * Radius of the hit. `direction * radius` is exactly `origin + normalize(ray) * distance`: the
   * three fields describe ONE point on the ray, which is what a caller placing a marker at the
   * hit needs. It agrees with `globeRadiusAt(direction)` to the solver's own tolerance, which is
   * the surface's slope times `angularTolerance`: measured worst 5.8e-6 of the radius, 1.2 m of
   * ground, over 400 rays from the hero's camera.
   */
  radius: number;
}

export interface GlobeRaycastOptions extends GlobeOptions {
  /**
   * How far apart, in radians of arc across the planet, the march samples the surface.
   *
   * A QUARTER of the icosphere's own edge at `subdivisions`, because a feature narrower than one
   * drawn triangle is not on the screen to be pointed at and four samples across the narrowest
   * one that is cannot step over it. Swept against a step 64 times finer, from the hero's own
   * camera, 3,000 rays in each of the two bands where a ray grazes the ground rather than meeting it:
   *
   *   band        edge/2                        edge/4         edge/8         ms/ray at edge/4
   *   b 0.90-1.00 2 of 2,972 rays wrong by 4.9  0 of 2,972     0 of 2,972     0.048
   *   b 1.00-1.05 2 of 3,000 hit/miss splits    0 of 3,000     0 of 3,000     0.114
   *
   * Everywhere else every step from edge/2 to edge/16 agrees to 3e-5 degrees, which is 1/13,000
   * of a parcel and is the bisection's own tolerance rather than the sampling. edge/4 is where the
   * grazing band stops disagreeing too, and it costs 0.024 ms averaged over the whole disk against
   * the 0.26 ms the pick used to take and the 43.49 ms a raycast of the drawn mesh was measured at.
   */
  angularStep: number;
  /** Bisection stops when the bracket is narrower than this, in radians. */
  angularTolerance: number;
}

/** The icosahedron's edge on a unit sphere, 4 / sqrt(10 + 2 sqrt 5). Halves at every subdivision. */
const ICOSAHEDRON_EDGE = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));

/**
 * Where a ray meets the surface the globe draws. The shared half of the pick.
 *
 * WHY THIS EXISTS AT ALL. Picking used to raycast `new THREE.SphereGeometry(1, 48, 32)`, and the
 * planet is drawn displaced to `globeRadiusAt`. Two hits on one ray at two radii are two different
 * points on a sphere, and the gap between them is exactly
 * `atan(sqrt(R2 - b2)/b) - atan(sqrt(1 - b2)/b)` for a ray passing `b` from the centre. Measured
 * over 3,041 live rays on the shipped page that closed form reproduced the browser's own two hit
 * points to a median of 3.73e-12 degrees, so this is an identity and not a correlation. It cost
 * a median 0.264 and a p95 2.177 degrees against a resolution 4 parcel 0.40 degrees wide: 77.8% of
 * pixels showing land were answered with some other cell, and 4.9% of pixels showing SEA were
 * offered as an assignable parcel.
 *
 * WHY IT IS A MARCH AND NOT A MESH RAYCAST. Intersecting the drawn globe itself was measured on
 * the shipped page at 43.49 ms per pointer move against 0.26 ms for the whole of the old pick,
 * because that mesh is 1,310,720 triangles. This solves the same intersection against the
 * CONTINUOUS surface the mesh samples, in the field, for the cost of a few dozen elevation
 * evaluations.
 *
 * THE PARAMETRISATION IS THE GEOMETRY THAT CAUSED THE BUG. Seen from the planet's centre a
 * straight ray is an arc of directions: at angle psi from its closest approach it is at radius
 * b / cos(psi) in the direction cos(psi) * Chat + sin(psi) * Dhat, with Chat and Dhat orthogonal
 * unit vectors. So the march steps in ARC ACROSS THE PLANET, which is the thing the sampling has
 * to resolve, rather than in distance along the ray, which is nearly tangential at the limb and
 * would tunnel straight through a headland there.
 *
 * The shell is entered at radius 1 + reliefScale, which nothing can be drawn above because
 * normalisedHeight clamps at 1, and anything at radius <= 1 is already under the ground, because
 * the drawn radius is never below 1. Between those two the march looks for the first crossing and
 * bisects it.
 */
export function raycastGlobe(
  field: TerrainField,
  calibration: Calibration,
  origin: Vec3,
  ray: Vec3,
  options: Partial<GlobeRaycastOptions> = {},
): GlobeHit | null {
  const reliefScale = options.reliefScale ?? DEFAULT_GLOBE_OPTIONS.reliefScale;
  const subdivisions = options.subdivisions ?? DEFAULT_GLOBE_OPTIONS.subdivisions;
  const angularStep = options.angularStep ?? ICOSAHEDRON_EDGE / Math.pow(2, subdivisions) / 4;
  const angularTolerance = options.angularTolerance ?? 1e-6;
  if (!(angularStep > 0)) throw new RangeError(`angularStep must be positive, got ${angularStep}`);

  const length = Math.hypot(ray[0], ray[1], ray[2]);
  if (!(length > 0)) return null;
  const dx = ray[0] / length;
  const dy = ray[1] / length;
  const dz = ray[2] / length;

  const rMax = 1 + reliefScale;
  // Closest approach: the foot of the perpendicular from the planet's centre onto the ray.
  const tc = -(origin[0] * dx + origin[1] * dy + origin[2] * dz);
  const cx = origin[0] + tc * dx;
  const cy = origin[1] + tc * dy;
  const cz = origin[2] + tc * dz;
  const b = Math.hypot(cx, cy, cz);
  if (b >= rMax) return null;

  // A ray straight at the centre has no plane of its own, so the arc below cannot be built for it.
  // Written out instead: the origin is at `-tc` along the ray from the centre, the surface is met
  // once on each side, and the nearer of the two that is still ahead of the camera wins.
  if (b < 1e-12) {
    const ahead: Vec3 = [dx, dy, dz];
    const behind: Vec3 = [-dx, -dy, -dz];
    const candidates: Array<{ direction: Vec3; distance: number; radius: number }> = [];
    for (const [direction, sign] of [
      [ahead, 1],
      [behind, -1],
    ] as const) {
      const radius = globeRadiusAt(field, calibration, direction, { reliefScale });
      candidates.push({ direction, distance: sign * radius + tc, radius });
    }
    const near = candidates.filter((c) => c.distance >= 0).sort((a, c) => a.distance - c.distance)[0];
    return near ?? null;
  }

  const ux = cx / b;
  const uy = cy / b;
  const uz = cz / b;
  const directionAt = (psi: number): Vec3 => {
    const c = Math.cos(psi);
    const s = Math.sin(psi);
    // Unit by construction: Chat and Dhat are orthonormal, so no normalise is needed and none is
    // done. That matters, because the direction is what becomes a latitude.
    return [ux * c + dx * s, uy * c + dy * s, uz * c + dz * s];
  };
  // Positive above the ground, negative below it.
  const gapAt = (psi: number): number => {
    const R = b / Math.cos(psi);
    if (R <= 1) return R - 1; // nothing is drawn below radius 1, so this is under the ground
    return R - globeRadiusAt(field, calibration, directionAt(psi), { reliefScale });
  };

  // The point of the ray at an angle, as one place so the three fields cannot drift apart.
  const hitAt = (psi: number): GlobeHit => ({
    direction: directionAt(psi),
    distance: tc + b * Math.tan(psi),
    radius: b / Math.cos(psi),
  });

  const psiExit = Math.acos(b / rMax);
  // Start where the ray enters the shell, or at the ray's own origin if that is already inside it.
  const start = Math.max(-psiExit, Math.atan2(-tc, b));
  if (start >= psiExit) return null;
  const startGap = gapAt(start);
  // Under the ground already: a ray that begins inside the planet has no near surface to meet.
  if (startGap < 0) return null;
  // Exactly ON it, which is a ray entering the shell at a full-height peak, or any ray at all when
  // reliefScale is zero and the shell has no thickness. Both are hits at the entry point.
  if (startGap === 0) return hitAt(start);

  // `start` is the base of every step and `lo` is the running bracket, and they are two variables
  // on purpose: stepping from the bracket instead adds the step to a moving point, which makes the
  // march accelerate quadratically and jump the arc it was meant to walk.
  const steps = Math.max(1, Math.ceil((psiExit - start) / angularStep));
  const step = (psiExit - start) / steps;
  let lo = start;
  let hi = start;
  let found = false;
  for (let i = 1; i <= steps; i++) {
    const psi = start + step * i;
    if (gapAt(psi) <= 0) {
      hi = psi;
      found = true;
      break;
    }
    lo = psi;
  }
  if (!found) return null;

  // Bisect. The bracket starts one angular step wide and halves every turn; the cap is what that
  // takes from the default step, and is there so a caller passing a huge step cannot spin.
  for (let k = 0; k < 40 && hi - lo > angularTolerance; k++) {
    const mid = (lo + hi) / 2;
    if (gapAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  return hitAt((lo + hi) / 2);
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
    const lift = globeRadius(height, opts.reliefScale);
    positions[i * 3] = d[0] * lift;
    positions[i * 3 + 1] = d[1] * lift;
    positions[i * 3 + 2] = d[2] * lift;

    // Linear: a colour attribute is read as linear and converted nowhere. See linearRgb, and
    // DECISIONS C3 for why the globe and the walked world are fixed by the same function.
    const colour = BIOME_COLOUR_LINEAR[biome(height, field.moisture(d), field.temperature(d))];
    terrainColours[i * 3] = colour[0];
    terrainColours[i * 3 + 1] = colour[1];
    terrainColours[i * 3 + 2] = colour[2];

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
  // An owner colour is chosen in sRGB bytes like every other colour on this planet, and lands in
  // the same linear attribute as the terrain under it, so it converts once, here, not per vertex.
  const linear = colour === null ? null : linearRgb(colour);
  for (let k = from; k < to; k++) {
    const v = geo.cellVertices[k]! * 3;
    if (linear === null) {
      out[v] = geo.terrainColours[v]!;
      out[v + 1] = geo.terrainColours[v + 1]!;
      out[v + 2] = geo.terrainColours[v + 2]!;
    } else {
      out[v] = linear[0];
      out[v + 1] = linear[1];
      out[v + 2] = linear[2];
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
    const lift = globeRadius(geo.heights[v]!, geo.options.reliefScale) + extra;
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
 * stays visible. The lift is proportional to nothing: it is a length, and the length is the
 * argument this function had wrong.
 *
 * WHAT WAS WRONG, AND WHAT IT COST (bug 1, third call site). `outlineLift` was 0.0075, which on a
 * 200 km planet is a hexagon drawn 1.5 km in the air. A ring that high is seen from a viewpoint
 * that is not the planet's centre, so it lands OUTWARD from the middle of the disk, away from the
 * ground it bounds: for a ray passing `b` from the centre the shift is
 * `atan(sqrt((1+lift)^2 - b^2)/b) - atan(sqrt(1 - b^2)/b)`, which is 0.134 degrees at b = 0.3 and
 * 1.256 at b = 0.95, against a resolution 4 parcel 0.40 degrees wide. Up to three parcels of
 * hexagon over ground it does not name, and outward is toward the cursor, which is what made a
 * wrong pick look right.
 *
 * WHAT THE LIFT ACTUALLY HAS TO CLEAR, measured rather than assumed. The drawn globe is a
 * displaced icosphere at 8 subdivisions and its flat triangles stand ABOVE the continuous surface
 * these points are sampled from on 30.7% of the ground, by p90 31.1 m, p99 59.1 m and 125.9 m at
 * worst over 141,700 samples. 0.0006 is 120 m, which clears the mesh over more than 99.9% of the
 * planet, and where it does not the line is hidden by a ridge standing in front of it, which is
 * what a ridge is supposed to do. It costs 0.0108 degrees of shift at b = 0.3 and 0.1042 at
 * b = 0.95: a twelfth of the old error, and 0.03 of a parcel becoming 0.27 of one at the limb.
 */
export function buildParcelOutlines(
  cells: readonly string[],
  field: TerrainField,
  calibration: Calibration,
  options: Partial<GlobeOptions> = {},
): Outlines {
  const opts: GlobeOptions = { ...DEFAULT_GLOBE_OPTIONS, ...options };
  const segments: number[] = [];

  // A point on the drawn surface under a direction, lifted. The direction is renormalised because
  // the callers below interpolate between two unit vectors, and a lerp of two unit vectors is not
  // one: at an 800 m edge on this planet the chord is shorter than the arc by 2.6e-6 of itself,
  // which is 0.5 mm of ground, so the cheap interpolation is exact enough and the normalise is
  // what makes the SAMPLE land on the boundary rather than a hair inside it.
  const surface = (x: number, y: number, z: number): [number, number, number] => {
    const len = Math.hypot(x, y, z);
    const d: Vec3 = [x / len, y / len, z / len];
    const lift = globeRadius(globeHeightAt(field, calibration, d), opts.reliefScale) + opts.outlineLift;
    return [d[0] * lift, d[1] * lift, d[2] * lift];
  };

  for (const cell of cells) {
    const ring = cellToBoundary(cell).map(([lat, lng]) => latLngToVec3(lat, lng));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      // The edge follows the ground rather than cutting through it: see outlineSegmentArc. The
      // arc is measured off the chord, which is shorter by 4e-6 of itself at a resolution 1 edge
      // and by nothing worth a trigonometric function at any finer one. Capped, so a caller
      // passing a tiny arc cannot ask for a million line segments.
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const parts = Math.min(256, Math.max(1, Math.ceil(chord / opts.outlineSegmentArc)));
      let from = surface(a[0], a[1], a[2]);
      for (let k = 1; k <= parts; k++) {
        const t = k / parts;
        const to = surface(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        segments.push(from[0], from[1], from[2], to[0], to[1], to[2]);
        from = to;
      }
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
  /**
   * Nine floats per triangle, LINEAR and 0..1, which is what a three colour attribute reads and
   * what `linearRgb` produces (DECISIONS C3). NOT bytes, and not a picture: a caller that turns
   * this buffer into image bytes owes it `linearToSrgb` on the way out. The type cannot say this,
   * because what crosses here is a Float32Array of anonymous numbers, so the sentence has to.
   */
  colours: Float32Array;
  /** The same, in the same space, before any {@link paintParcel}: a parcel's terrain colour. */
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
    const r = globeRadius(height, opts.reliefScale);
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
    const colour = BIOME_COLOUR_LINEAR[biome(height, field.moisture(centre), field.temperature(centre))];

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
        terrainColours[o] = colour[0];
        terrainColours[o + 1] = colour[1];
        terrainColours[o + 2] = colour[2];
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
  // Converted once, for the same reason as paintCell: the buffer this writes into is linear.
  const linear = colour === null ? null : linearRgb(colour);
  for (let o = from * 9; o < to * 9; o += 3) {
    if (linear === null) {
      mesh.colours[o] = mesh.terrainColours[o]!;
      mesh.colours[o + 1] = mesh.terrainColours[o + 1]!;
      mesh.colours[o + 2] = mesh.terrainColours[o + 2]!;
    } else {
      mesh.colours[o] = linear[0];
      mesh.colours[o + 1] = linear[1];
      mesh.colours[o + 2] = linear[2];
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
