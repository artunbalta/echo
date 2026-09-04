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
 * Boundary clipping and deterministic vegetation (build order step 10) live in the second half of
 * this file; the first half is exactly what step 5's agreement test needs: the projection, and the
 * heightmap. Local x is metres EAST of the cell centre and local y metres NORTH; the agreement
 * test pins both.
 */

import { cellToBoundary, cellToLatLng, getResolution, gridDisk, latLngToCell } from "h3-js";

import { latLngToVec3, vec3ToLatLng, type Vec3 } from "./geo.js";
import { hashString, normalisedHeight, type Calibration, type TerrainField } from "./terrain.js";

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
  // east = centre x up. (The first version had up x centre, which points WEST under geo.ts's
  // convention; the frame was mirrored and every "east" in the contracts was a lie. Fixed before
  // anything was built on it; the agreement test pins the orientation now.)
  let ex: Vec3 = [
    centre[1] * up[2] - centre[2] * up[1],
    centre[2] * up[0] - centre[0] * up[2],
    centre[0] * up[1] - centre[1] * up[0],
  ];
  let n = Math.hypot(ex[0], ex[1], ex[2]);
  ex = [ex[0] / n, ex[1] / n, ex[2] / n];
  // north = east x centre, so (east, north, up) is right handed.
  let no: Vec3 = [
    ex[1] * centre[2] - ex[2] * centre[1],
    ex[2] * centre[0] - ex[0] * centre[2],
    ex[0] * centre[1] - ex[1] * centre[0],
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
 * The MACRO height at a local coordinate: the shared field, read on the tangent patch.
 *
 * ONE OF TWO HEIGHT FUNCTIONS, and the one that is not what a person stands on. This is the field
 * the globe draws, the field the registry assigns parcels from, and the field `isLand`, `biome`,
 * `walkableAt` and every deed are computed over, so it agrees with `globeHeightAt` to the bit and
 * `agreement.test.ts` holds it there at 1e-6. {@link createSceneHeight} is this plus the
 * walking-scale displacement, and THAT is the ground the mesh is built from and the body, the
 * camera and the props are seated on (DECISIONS C2).
 *
 * Both exist because C2 split them deliberately. A caller that needs the terrain the planet agrees
 * about wants this one; a caller that needs the terrain underfoot wants the other, and the two
 * differ by up to the displacement's amplitude, measured at 3.3631 m of the 4 m budget. Anything
 * that must line up with the globe, the registry or a parcel boundary reads this function. Anything
 * that must line up with the drawn surface reads the scene's own `heightAt`.
 *
 * The whole content of section 6.2 step 3 is the one line of body: convert the grid point back to a
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

// ── detail displacement (DECISIONS C2) ──────────────────────────────────────────

/**
 * Relief at walking scale, added to the SCENE height and to nothing else.
 *
 * WHY IT IS NOT IN THE FIELD. The height field is fBm whose finest octave is `detailFrequency` 4.0
 * over six octaves, so the smallest feature it can express is about 1.56 km wide and none of its
 * variance lives under 100 m. Standing in it, the ground is a plane. Putting the fix in
 * `elevation()` would be a different planet: every parcel's land fraction, the sea level
 * calibration, the twelve commons and every deed move with it. So this is added where the mesh is
 * BUILT and nowhere else, and `isLand`, `biome`, `walkableAt`, the registry and the globe's
 * assignment maths all still read the field alone and are all still right.
 *
 * WHY IT LIVES ON THE MESH'S OWN LATTICE. The region is drawn as triangles on a lattice of
 * `resolution` metres, and the mover, the camera and every scattered prop are seated by the height
 * function rather than by the mesh. A displacement finer than one triangle is a displacement the
 * mesh cannot draw: the surface would carry the lattice's linear interpolation of it while the
 * height function carried the real thing, and everything standing on it would float or sink by the
 * difference. That error is about 0.75 * A * h^2 / L^2 for amplitude A and wavelength L over a
 * lattice of step h, so a one metre bump 48 m across leaves a fern 4.7 cm above its own shadow,
 * and pushing that under a millimetre needs L past 400 m, which is not walking scale at all.
 *
 * So the displacement is DEFINED at lattice points and read back off the same two triangles per
 * quad the builder emits. It is exactly piecewise linear on the drawn surface, which means the
 * height function and the mesh return the same number at every position, not merely close ones,
 * and prop seating is left where it was.
 *
 * A consequence worth stating rather than discovering: the lattice belongs to the ANCHOR patch, so
 * the displacement is a property of the built region. The same region gives the same ground on
 * every machine, every reload and on a server, which is what determinism is needed for here; the
 * same ground reached from a different anchor cell would crease differently, and nothing in the
 * product reaches it that way, because a region is always built from its own cell.
 */
export interface DetailOptions {
  /** Metres the displacement reaches at full strength: the sum of the octave amplitudes. */
  amplitudeM: number;
  /** Wavelength of the coarsest octave, metres. */
  coarsestM: number;
  /** Halvings of the wavelength. An octave finer than two lattice steps is dropped, not drawn. */
  octaves: number;
  /**
   * Ground below this many metres above sea level is displaced less than fully, reaching zero at
   * the waterline itself.
   *
   * The width is 2.5 times the amplitude, and that ratio is the whole reason there is a number
   * here. A smoothstep ramp over a width W has a peak gradient of 1.5 A / W with respect to the
   * ground's own height, so at W below 1.5 A the ramp can fall faster than the shore rises and the
   * displaced coast runs backwards into the sea: a beach with the water on the wrong side of it.
   * At 2.5 A the worst case is 60% of the ground's own rise, so the shore stays monotone, no land
   * is pushed under the water sheet, and the h = 0 contour, which is what `isLand` and every parcel
   * boundary are drawn from, does not move by a millimetre.
   */
  taperM: number;
}

/**
 * Four metres of relief over four octaves, from 192 m down to 24 m.
 *
 * The ladder is the house's own fBm: the amplitude halves as the wavelength halves, normalised so
 * the octaves sum to `amplitudeM`, which is exactly what `fbm` in terrain.ts does. That fixes
 * everything except the two ends, and both ends are measured rather than chosen.
 *
 * The FINE end is the 12 m lattice. Nothing under two steps can be drawn, so the last octave is
 * 24 m and there is no argument about it.
 *
 * The COARSE end is where the field runs out. The macro field's finest expressible feature is
 * about 1.56 km, so a person crossing a parcel walks over one shape; 192 m puts two or three
 * swells inside the 420 m the fog leaves visible, which is the band the field has nothing in.
 *
 * The AMPLITUDE was swept over the SAME 400 parcels DEFAULT_SCENE_OPTIONS above is measured on,
 * and read off the slope it buys at the 12 m step, which is the tilt under a foot. Median slope
 * against amplitude: 2.44 undisplaced, 2.51 at 2 m, 2.61 at 3 m, 2.75 at 4 m, 3.12 at 6 m, 3.52 at
 * 8 m; the share of land over 5 degrees goes 18.8, 19.3, 20.0, 20.9, 24.0, 28.9%.
 *
 * Four is where the ground stops being flat without the macro landscape being overwritten. The
 * octave amplitudes are 2.13, 1.07, 0.53 and 0.27 m against a mean dry span inside a parcel of
 * 80.5 m, so the biggest swell is a fortieth of the hill it sits on, and the shipped ground keeps
 * the macro field's own p95 slope almost exactly: 8.12 degrees undisplaced, 8.34 displaced.
 *
 * WHAT IT IS WORTH TO A PERSON, which is the only reason any of this is here. Measured alone, with
 * the macro subtracted, over 2.08 M dry lattice points on 120 parcels: the displacement runs
 * 0.94 m in mean magnitude and 2.06 m at p95, and its OWN slope is 1.18 degrees mean and 2.38 at
 * p95. That last number is the point of the whole change: at heightScaleM 900 the entire landscape
 * had a mean slope of 1.03 degrees, so what is added here at walking scale is more tilt underfoot
 * than the old world had in total. Over a 96 m walk, about twenty seconds, the ground rises and
 * falls through 0.73 m at the median and 1.54 m at p95: a meadow that is never level, not a hill.
 */
export const DEFAULT_DETAIL: DetailOptions = {
  amplitudeM: 4,
  coarsestM: 192,
  octaves: 4,
  taperM: 10,
};

/** Hermite ease, the cheapest interpolant with a zero derivative at both ends. */
const fade = (t: number): number => t * t * (3 - 2 * t);

/**
 * Value noise in -1..1 on a grid of `cellM`, from `hashPosition` and nothing else.
 *
 * Value rather than gradient noise because the corner values are what `hashPosition` already gives,
 * and the artefact value noise is criticised for, axis-aligned ridges, is invisible once four
 * octaves are summed and the whole thing is quantised onto a triangle lattice anyway.
 *
 * `corner` is memoised by the caller. Each corner of the coarsest octave serves 256 lattice points
 * on a 12 m grid, so caching turns two million hashes per region into forty thousand, which is the
 * difference between the region build fitting in its 400 ms budget and not.
 */
function valueNoise(
  x: number,
  y: number,
  cellM: number,
  corner: (i: number, j: number) => number,
): number {
  const gx = Math.floor(x / cellM);
  const gy = Math.floor(y / cellM);
  const u = fade(x / cellM - gx);
  const v = fade(y / cellM - gy);
  const lo = corner(gx, gy) + (corner(gx + 1, gy) - corner(gx, gy)) * u;
  const hi = corner(gx, gy + 1) + (corner(gx + 1, gy + 1) - corner(gx, gy + 1)) * u;
  return lo + (hi - lo) * v;
}

export interface SceneHeightOptions {
  /** Metres of height per unit of normalised elevation. */
  heightScaleM: number;
  /** The lattice the mesh is drawn on, metres. The displacement is defined on exactly this grid. */
  resolution: number;
  /** Off, or a set of dials. Absent means {@link DEFAULT_DETAIL}. */
  detail?: DetailOptions | null;
}

/**
 * THE height the walkable world is drawn at and stood on, in metres above sea level.
 *
 * THE OTHER OF THE TWO HEIGHT FUNCTIONS, and the one that ships underfoot: {@link sceneHeightAt}
 * times the height scale, plus the walking-scale displacement. One function, built once per world,
 * so `buildRegionScene` and the host's `heightAtTile` cannot be two implementations of the same
 * idea. Off the lattice it is the exact macro height plus the lattice-linear displacement, which is
 * what the mesh's own triangles carry.
 *
 * WHAT THIS COSTS, since it is the divergence C2 bought and not a detail. This ground is not the
 * globe's ground: it stands away from it by up to `detail.amplitudeM`, measured at 3.3631 m worst
 * over agreement.test.ts's 25,000 samples, and 0.80 m in the mean. That is a promise softened from
 * exact to bounded, and the bound is asserted on both sides there. The macro field itself is
 * untouched, so the waterline, the parcel boundaries and the registry do not move by anything.
 *
 * The memo is a cache over lattice points and cannot change an answer; it is what keeps a region
 * build at one terrain evaluation per vertex rather than two.
 */
export function createSceneHeight(
  patch: TangentPatch,
  field: TerrainField,
  calibration: Calibration,
  options: SceneHeightOptions,
): (x: number, y: number) => number {
  const heightScaleM = options.heightScaleM;
  const step = options.resolution;
  if (!(step > 0)) throw new RangeError(`resolution must be a positive step in metres, got ${step}`);
  const detail = options.detail === undefined ? DEFAULT_DETAIL : options.detail;
  const macroAt = (x: number, y: number) =>
    normalisedHeight(field.elevation(patch.toDirection(x, y)), calibration) * heightScaleM;
  if (!detail || detail.amplitudeM <= 0) return macroAt;

  if (detail.taperM < detail.amplitudeM * 1.5) {
    throw new RangeError(`a ${detail.taperM} m taper inverts a shore under ${detail.amplitudeM} m of displacement`);
  }
  // Octaves the lattice cannot draw are DROPPED, and what is left is not renormalised. Two steps is
  // the shortest wavelength a triangle mesh can carry at all, so a coarser build gets a low-passed
  // version of the same ground rather than an aliased different one, which is what a lower level of
  // detail should be. At the shipped 12 m nothing is dropped.
  let drawable = detail.octaves;
  while (drawable > 0 && detail.coarsestM / Math.pow(2, drawable - 1) < step * 2) drawable--;
  if (drawable === 0) return macroAt;

  // The seed salts every octave, so two planets never share a crease pattern, exactly as the asset
  // placer salts its lattice.
  const salt = Math.floor(hashString(field.seed) * 0x7fffffff) | 0;
  // Geometric amplitudes summing to amplitudeM, so the dial means what it says.
  const first = (detail.amplitudeM * (1 - 0.5)) / (1 - Math.pow(0.5, detail.octaves));

  const ground = new Map<number, number>();
  const offset = new Map<number, number>();
  const key = (i: number, j: number) => (i + 0x8000) * 0x10000 + (j + 0x8000);

  // One corner cache per octave, and the octave's own wavelength beside it, so the ladder is
  // walked without re-deriving either.
  const octaves: Array<{ cellM: number; amplitude: number; corner: (i: number, j: number) => number }> = [];
  {
    let amplitude = first;
    let wavelength = detail.coarsestM;
    for (let o = 0; o < drawable; o++) {
      const cellM = wavelength;
      const octaveSalt = salt + o;
      const cache = new Map<number, number>();
      octaves.push({
        cellM,
        amplitude,
        corner: (i, j) => {
          const k = key(i, j);
          let value = cache.get(k);
          if (value === undefined) {
            value = hashPosition(i * cellM, j * cellM, octaveSalt) * 2 - 1;
            cache.set(k, value);
          }
          return value;
        },
      });
      amplitude *= 0.5;
      wavelength *= 0.5;
    }
  }

  const groundAt = (i: number, j: number): number => {
    const k = key(i, j);
    let value = ground.get(k);
    if (value === undefined) {
      value = macroAt(i * step, j * step);
      ground.set(k, value);
    }
    return value;
  };

  /** The lowest macro ground in the 3x3 lattice neighbourhood: a one-step morphological erosion. */
  const erodedGroundAt = (i: number, j: number): number => {
    let lowest = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const h = groundAt(i + di, j + dj);
        if (h < lowest) lowest = h;
      }
    }
    return lowest;
  };

  const offsetAt = (i: number, j: number): number => {
    const k = key(i, j);
    let value = offset.get(k);
    if (value === undefined) {
      const x = i * step;
      const y = j * step;
      let sum = 0;
      for (const octave of octaves) sum += octave.amplitude * valueNoise(x, y, octave.cellM, octave.corner);
      // The taper reads the LOWEST macro ground within one lattice step, not the ground underfoot.
      //
      // That one word is what makes "no coastline moves" exact rather than nearly true. Every
      // triangle the builder emits spans a single quad, so its three corners are all within one
      // step of each other; a triangle that contains the waterline has a corner at or below sea
      // level, and every corner of it therefore reads that corner's height and tapers to zero. The
      // whole triangle is undisplaced, and the drawn coast is the macro coast to the last bit. The
      // same rule taken from the point's own height would leave a metre or so of wobble in the
      // shoreline on a steep shore, which is a coastline moving, however small.
      //
      // It is also why the taper is a smoothstep of the eroded height rather than a hard test: the
      // ramp is shifted one step seaward, not broken, so nothing steps at the edge of the band.
      const h = erodedGroundAt(i, j);
      const t = h <= 0 ? 0 : h >= detail.taperM ? 1 : fade(h / detail.taperM);
      value = sum * t;
      offset.set(k, value);
    }
    return value;
  };

  return (x: number, y: number): number => {
    const fx = x / step;
    const fy = y / step;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    if (u === 0 && v === 0) return groundAt(i, j) + offsetAt(i, j);
    // The builder splits every quad into (0,0)(1,0)(1,1) and (0,0)(1,1)(0,1). Barycentric weights
    // on whichever of the two holds the point, with the zero-weight corners never asked for.
    let d: number;
    if (u >= v) {
      d = offsetAt(i, j) * (1 - u);
      if (u > v) d += offsetAt(i + 1, j) * (u - v);
      if (v > 0) d += offsetAt(i + 1, j + 1) * v;
    } else {
      d = offsetAt(i, j) * (1 - v);
      if (u > 0) d += offsetAt(i + 1, j + 1) * u;
      d += offsetAt(i, j + 1) * (v - u);
    }
    return macroAt(x, y) + d;
  };
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
 * This builder is the PREVIEW one: nothing in the app draws it, and it carries no walking-scale
 * displacement, because its grid is a fraction of a bounding box rather than a step in metres and
 * a displacement has no lattice to live on until there is one. `buildRegionScene` is what ships.
 *
 * The mesh is CUT to the parcel polygon, not merely faded at the edge. Where the boundary crosses
 * water the parcel edge IS water, and a player standing there has to see that: it is the difference
 * between owning a coastline and owning a square that happens to contain one.
 *
 * Vegetation is placed by hashing the world position. Not by a seeded generator walked in order,
 * which would move every tree if the grid resolution changed, and never by Math.random. The same
 * parcel gives the same trees in the same places on the server, in the browser, and next year.
 */

import { biome, BIOME_COLOUR, BIOME_COLOUR_LINEAR, BIOMES, type Biome, type Rgb } from "./terrain.js";
import { biomeAtLocal, VEGETATION_DENSITY } from "./biome-mask.js";

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

/**
 * heightScaleM is 2,700 under DECISIONS C1, up from 900.
 *
 * Measured over 400 assignable land parcels sampled on the 12 m mesh lattice and cut to the deed
 * line: at 900 the median slope of an emitted triangle is 0.81 degrees, the mean 1.03, and 0.17% of
 * land is steeper than 5 degrees, which is a painted floor. At 2,700 those become 2.44, 3.09 and
 * 18.8%, and the mean dry span inside a parcel goes from 26.8 m to 80.5 m. Earth is about 6 degrees
 * and 46%, so this is still half of Earth on purpose: the peak becomes 2.7 km on a 200 km body.
 *
 * `isLand` tests raw elevation and `biome()` takes normalised height, so this changes how tall the
 * same shape is drawn and nothing else. No terrainVersion, no re-seed, no deed moves.
 */
export const DEFAULT_SCENE_OPTIONS: ParcelSceneOptions = {
  resolution: 96,
  heightScaleM: 2700,
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
  // The biome at a local coordinate is the contract's biomeAtLocal (biome-mask.ts), so the mask
  // the asset placer reads and the colours this mesh carries come from the same function.
  const biomeHere = (x: number, y: number): Biome => biomeAtLocal(patch, field, calibration, x, y);

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
      const kind = biomeHere(cx, cy);
      if (kind === "ocean") hasWater = true;
      else landArea += flat;
      biomeArea.set(kind, (biomeArea.get(kind) ?? 0) + flat);
      // Linear, because a colour attribute is read as linear and converted nowhere: see
      // BIOME_COLOUR_LINEAR. BIOME_COLOUR keeps the bytes, and bytes are what the 2D preview plate
      // (scripts/preview-planet.ts) wants, because it paints into a canvas and not into an
      // attribute. What this line does NOT say, and what an earlier version of it was read as
      // saying, is that every preview is safe: anything holding a LINEAR buffer and writing image
      // bytes out of it owes the display transfer on the way, `linearToSrgb`. The globe preview
      // rasteriser was not given it when this seam moved, and rendered a black sea.
      const colour = BIOME_COLOUR_LINEAR[kind];

      for (let v = 0; v < 3; v++) {
        positions.push(tri[v]![0], tri[v]![1], z[v]!);
        normals.push(nx, ny, nz);
        colours.push(colour[0], colour[1], colour[2]);
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

      const kind = biomeHere(x, y);
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

// ── the built region (contract W2-1) ────────────────────────────────────────────

/**
 * The anchor cell and its k rings as ONE ground mesh, chunked per cell for the renderer.
 *
 * The seam problem, and why there is one grid and not seven. A mesh built per cell samples each
 * cell on its own grid, and two grids never agree along the shared edge: one cell's edge vertex
 * lands between two of its neighbour's, the surfaces cross, and the join shows as a hairline of
 * sky or a T-junction crack at every cell boundary. So the region is sampled on a single lattice in
 * the anchor cell's tangent frame, at integer multiples of the step, and every triangle reads its
 * corners from that lattice. Two chunks meeting at a cell boundary write the very same doubles into
 * their buffers, and the test asserts equality with ===, not a tolerance.
 *
 * Nothing is clipped inside the region. A cell boundary is a matter of which chunk a triangle is
 * filed under, never a cut through it, so a chunk's edge is jagged at the step and its neighbour's
 * is the exact complement. Only the outer ring ends the world, and that too is whole quads: a quad
 * is emitted when any corner is inside the region, which leaves a rim at most one step wide past
 * the exact hexagonal bound for the fog to take.
 *
 * Height is `createSceneHeight`: `sceneHeightAt` times the height scale, which is the I1 function
 * and the reason the ground here is the ground the globe showed, plus the walking-scale
 * displacement, which the globe does not have and does not need (DECISIONS C2). The displacement
 * is defined on this very lattice, so the mesh draws it exactly rather than approximating it, and
 * the scene hands the same function out as `heightAt` for everything that has to stand on it.
 * Colour is per VERTEX from `biomeAtLocal`, so two biomes blend across the one triangle that
 * straddles them instead of meeting at a hard edge.
 *
 * Coordinates: OUT of here is three's frame, x east, y up, z SOUTH. Local metres run y NORTH, so
 * z is emitted as -y and the renderer does no conversion. The `heightAt` the scene carries takes
 * LOCAL metres, the way every other function in this package does.
 *
 * walkable.ts imports createTangentPatch from this file and this file imports regionBound from
 * it. Both modules only call across that cycle from inside functions, never while evaluating, so
 * the order the loader takes them in does not matter.
 */

import { regionBound } from "./walkable.js";

export interface RegionSceneOptions {
  /**
   * Grid spacing in metres, in the sense a DEM means it: "12 m resolution". Twelve gives the
   * demo disk (k=1 at the founder resolution, 4.2 km across) about 139k triangles in 7 chunks,
   * built in about 150 ms in node; the tests time it against a 400 ms budget.
   */
  resolution: number;
  /** Vertical exaggeration, metres of height per unit of normalised elevation. */
  heightScaleM: number;
  /**
   * The walking-scale displacement, or null for the macro field alone. Absent is
   * {@link DEFAULT_DETAIL}; the option exists so a test can measure the two grounds against each
   * other, not so a caller can ship a different one.
   */
  detail?: DetailOptions | null;
}

export const DEFAULT_REGION_OPTIONS: RegionSceneOptions = {
  resolution: 12,
  heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM,
};

export interface RegionChunk {
  /** The H3 cell every triangle here belongs to, by its centroid. */
  cell: string;
  /** Triangle soup, three vertices each: x east, y up, z south, in metres. */
  positions: Float32Array;
  normals: Float32Array;
  /** 0..1 per channel, LINEAR, from BIOME_COLOUR of the biome at each vertex. See linearRgb. */
  colours: Float32Array;
  triangleCount: number;
  /** A sphere containing every vertex, in the same frame, for frustum culling. */
  bounds: { centre: readonly [number, number, number]; radius: number };
}

export interface RegionScene {
  cell: string;
  k: number;
  /** The disk's cells in gridDisk order, the anchor first; one chunk each, in the same order. */
  cells: string[];
  /** The anchor cell's tangent frame: the one frame every chunk is expressed in. */
  patch: TangentPatch;
  resolution: number;
  heightScaleM: number;
  /** Radius of the circle containing the region, from regionBound. */
  extentM: number;
  chunks: RegionChunk[];
  triangleCount: number;
  /** Height of the sea surface in three's y. Zero, because height is metres above sea level. */
  waterLevelY: 0;
  /** True when any vertex inside the region is below sea level. */
  hasWater: boolean;
  /** Flat area of the emitted mesh, square metres, rim included. */
  areaM2: number;
  /** Fraction of that area per biome, each triangle giving a third to each corner's biome. */
  composition: Partial<Record<Biome, number>>;
  /** The exact height the mesh was sampled from, at any local coordinate: metres above sea level. */
  heightAt(x: number, y: number): number;
}

export function buildRegionScene(
  cell: string,
  k: number,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: Partial<RegionSceneOptions> = {},
): RegionScene {
  // An option a caller left undefined is the default, not undefined: a layer with optional
  // settings passes { resolution: undefined } all the time, and a spread would let that win.
  const opts: RegionSceneOptions = {
    resolution: options.resolution ?? DEFAULT_REGION_OPTIONS.resolution,
    heightScaleM: options.heightScaleM ?? DEFAULT_REGION_OPTIONS.heightScaleM,
    ...("detail" in options ? { detail: options.detail } : {}),
  };
  const step = opts.resolution;
  if (!(step > 0)) throw new RangeError(`resolution must be a positive step in metres, got ${step}`);
  if (!Number.isInteger(k) || k < 0) throw new RangeError(`k must be a non-negative integer, got ${k}`);

  const patch = createTangentPatch(cell, radiusKm);
  const bound = regionBound(cell, k, radiusKm);
  const cells = gridDisk(cell, k);
  const res = getResolution(cell);
  const cellIndex = new Map<string, number>();
  cells.forEach((c, i) => cellIndex.set(c, i));
  // Where each disk cell's centre sits in the anchor frame, for the rim triangles that fall
  // outside every disk cell and have to be filed under the nearest one.
  const centres = cells.map((c): readonly [number, number] => {
    const [lat, lng] = cellToLatLng(c);
    return patch.toLocal(latLngToVec3(lat, lng)) ?? [0, 0];
  });
  // THE height function, built once and handed out on the scene, so the mesh, the mover, the camera
  // and every prop are seated by one piece of code. The displacement lives on this same lattice.
  const heightAt = createSceneHeight(patch, field, calibration, {
    heightScaleM: opts.heightScaleM,
    resolution: step,
    ...("detail" in opts ? { detail: opts.detail } : {}),
  });

  // The lattice: grid line i is at (i - half) * step, so the anchor centre is a vertex and every
  // vertex is an integer multiple of the step. One extra line past the bound each side, so the
  // emitted rim never runs out of corners.
  const half = Math.ceil(bound.radiusM / step) + 1;
  const n = 2 * half + 1;
  if (n * n > 16_000_000) {
    throw new RangeError(`a ${n}x${n} grid is too large; raise the resolution or lower k`);
  }
  const at = (i: number) => (i - half) * step;

  // 1. Membership, then the vertices any emitted quad will need: everything within one grid
  //    step of an inside point. Everything else is never sampled, which is what keeps the corners
  //    of the square from costing 40% of the build.
  const inside = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) if (bound.contains(at(i), at(j))) inside[j * n + i] = 1;
  }
  const needed = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!inside[j * n + i]) continue;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= n) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if (ii >= 0 && ii < n) needed[jj * n + ii] = 1;
        }
      }
    }
  }

  // 2. Sample every needed vertex once. Height, biome and cell are each a function of the vertex
  //    and nothing else, so a vertex shared by two chunks is sampled once and copied twice.
  const heights = new Float64Array(n * n);
  const biomes = new Uint8Array(n * n);
  const cellOf = new Int16Array(n * n).fill(-1);
  const biomeIndex = new Map<Biome, number>();
  BIOMES.forEach((b, i) => biomeIndex.set(b, i));
  const cellAtLocal = (x: number, y: number): number => {
    const d = patch.toDirection(x, y);
    const [lat, lng] = vec3ToLatLng(d[0], d[1], d[2]);
    return cellIndex.get(latLngToCell(lat, lng, res)) ?? -1;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      if (!needed[idx]) continue;
      const x = at(i);
      const y = at(j);
      heights[idx] = heightAt(x, y);
      biomes[idx] = biomeIndex.get(biomeAtLocal(patch, field, calibration, x, y))!;
      cellOf[idx] = cellAtLocal(x, y);
    }
  }

  // 3. Vertex normals by central difference over the lattice, in three's frame. A local normal is
  //    (-dh/dx, -dh/dy, 1) with z up; mapping (x, y, z) to (x, z, -y) makes it (-dh/dx, 1, dh/dy).
  //    An unsampled neighbour contributes nothing, so the rim is one sided rather than wrong.
  const normals = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      if (!needed[idx]) continue;
      const h = heights[idx]!;
      const hasL = i > 0 && needed[idx - 1] === 1;
      const hasR = i < n - 1 && needed[idx + 1] === 1;
      const hasD = j > 0 && needed[idx - n] === 1;
      const hasU = j < n - 1 && needed[idx + n] === 1;
      const spanX = ((hasL ? 1 : 0) + (hasR ? 1 : 0)) * step;
      const spanY = ((hasD ? 1 : 0) + (hasU ? 1 : 0)) * step;
      const dhx = spanX > 0 ? ((hasR ? heights[idx + 1]! : h) - (hasL ? heights[idx - 1]! : h)) / spanX : 0;
      const dhy = spanY > 0 ? ((hasU ? heights[idx + n]! : h) - (hasD ? heights[idx - n]! : h)) / spanY : 0;
      const len = Math.hypot(dhx, 1, dhy);
      normals[idx * 3] = -dhx / len;
      normals[idx * 3 + 1] = 1 / len;
      normals[idx * 3 + 2] = dhy / len;
    }
  }

  // 4. Which chunk each triangle belongs to. The rule is the H3 cell of the centroid. An H3 cell
  //    is convex in the anchor's gnomonic frame (its edges are great circles, which the projection
  //    keeps straight), so a triangle whose three corners resolve to one cell has its centroid in
  //    that cell as well, and the lookup is skipped for all but the thin band of triangles that
  //    straddle a boundary. latLngToCell costs about a microsecond; per vertex instead of per
  //    triangle, and only per vertex that is needed, is what keeps this pass under 100 ms.
  //    A centroid past the disk, in the one-step rim, goes to the nearest disk cell so the chunk
  //    count is the disk size and nothing is filed under a cell the region does not build.
  const quads = (n - 1) * (n - 1);
  const triCell = new Int16Array(quads * 2).fill(-1);
  const perCell = new Int32Array(cells.length);
  const OCEAN = biomeIndex.get("ocean")!;
  const triArea = (step * step) / 2;
  const biomeArea = new Float64Array(BIOMES.length);
  let hasWater = false;
  let triangleCount = 0;

  const classify = (ka: number, kb: number, kc: number, xa: number, ya: number, xb: number, yb: number, xc: number, yc: number): number => {
    const ca = cellOf[ka]!;
    if (ca >= 0 && ca === cellOf[kb] && ca === cellOf[kc]) return ca;
    const cx = (xa + xb + xc) / 3;
    const cy = (ya + yb + yc) / 3;
    const c = cellAtLocal(cx, cy);
    if (c >= 0) return c;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < centres.length; i++) {
      const d = (centres[i]![0] - cx) ** 2 + (centres[i]![1] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const k00 = j * n + i;
      const k10 = k00 + 1;
      const k01 = k00 + n;
      const k11 = k01 + 1;
      if (!(inside[k00] || inside[k10] || inside[k01] || inside[k11])) continue;
      const x0 = at(i);
      const y0 = at(j);
      const x1 = at(i + 1);
      const y1 = at(j + 1);
      const q = (j * (n - 1) + i) * 2;
      // Two triangles, wound counter-clockwise seen from above once z = -y, so they face the sky.
      const c0 = classify(k00, k10, k11, x0, y0, x1, y0, x1, y1);
      const c1 = classify(k00, k11, k01, x0, y0, x1, y1, x0, y1);
      triCell[q] = c0;
      triCell[q + 1] = c1;
      perCell[c0]!++;
      perCell[c1]!++;
      triangleCount += 2;
      for (const kv of [k00, k10, k11, k00, k11, k01]) {
        biomeArea[biomes[kv]!]! += triArea / 3;
        if (biomes[kv] === OCEAN && inside[kv]) hasWater = true;
      }
    }
  }

  // 5. Fill the chunks, each sized exactly, reading every corner from the lattice arrays.
  const colourOf = BIOMES.map((b) => BIOME_COLOUR_LINEAR[b]);
  const chunks: RegionChunk[] = cells.map((c, i) => ({
    cell: c,
    positions: new Float32Array(perCell[i]! * 9),
    normals: new Float32Array(perCell[i]! * 9),
    colours: new Float32Array(perCell[i]! * 9),
    triangleCount: perCell[i]!,
    bounds: { centre: [0, 0, 0], radius: 0 },
  }));
  const written = new Int32Array(cells.length);
  const put = (chunk: RegionChunk, o: number, kv: number, x: number, y: number) => {
    chunk.positions[o] = x;
    chunk.positions[o + 1] = heights[kv]!;
    chunk.positions[o + 2] = -y;
    chunk.normals[o] = normals[kv * 3]!;
    chunk.normals[o + 1] = normals[kv * 3 + 1]!;
    chunk.normals[o + 2] = normals[kv * 3 + 2]!;
    const col = colourOf[biomes[kv]!]!;
    chunk.colours[o] = col[0];
    chunk.colours[o + 1] = col[1];
    chunk.colours[o + 2] = col[2];
  };
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const q = (j * (n - 1) + i) * 2;
      if (triCell[q]! < 0) continue;
      const k00 = j * n + i;
      const k10 = k00 + 1;
      const k01 = k00 + n;
      const k11 = k01 + 1;
      const x0 = at(i);
      const y0 = at(j);
      const x1 = at(i + 1);
      const y1 = at(j + 1);
      const a = chunks[triCell[q]!]!;
      let o = written[triCell[q]!]! * 9;
      put(a, o, k00, x0, y0);
      put(a, o + 3, k10, x1, y0);
      put(a, o + 6, k11, x1, y1);
      written[triCell[q]!]!++;
      const b = chunks[triCell[q + 1]!]!;
      o = written[triCell[q + 1]!]! * 9;
      put(b, o, k00, x0, y0);
      put(b, o + 3, k11, x1, y1);
      put(b, o + 6, k01, x0, y1);
      written[triCell[q + 1]!]!++;
    }
  }

  // 6. A bounding sphere per chunk: the box centre, and the farthest vertex from it.
  for (const chunk of chunks) {
    const p = chunk.positions;
    if (p.length === 0) continue;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let v = 0; v < p.length; v += 3) {
      const x = p[v]!, y = p[v + 1]!, z = p[v + 2]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    let r2 = 0;
    for (let v = 0; v < p.length; v += 3) {
      const d = (p[v]! - cx) ** 2 + (p[v + 1]! - cy) ** 2 + (p[v + 2]! - cz) ** 2;
      if (d > r2) r2 = d;
    }
    chunk.bounds = { centre: [cx, cy, cz], radius: Math.sqrt(r2) };
  }

  const areaM2 = triangleCount * triArea;
  const composition: Partial<Record<Biome, number>> = {};
  BIOMES.forEach((b, i) => {
    if (biomeArea[i]! > 0) composition[b] = biomeArea[i]! / areaM2;
  });

  return {
    cell,
    k,
    cells,
    patch,
    resolution: step,
    heightScaleM: opts.heightScaleM,
    extentM: bound.radiusM,
    chunks,
    triangleCount,
    waterLevelY: 0,
    hasWater,
    areaM2,
    composition,
    heightAt,
  };
}

export { BIOME_COLOUR, type Biome, type Rgb };
