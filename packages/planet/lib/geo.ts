/**
 * Spherical geometry for the ECHO planet.
 *
 * Two rules govern this file.
 *
 * 1. There is exactly one coordinate convention in the codebase and it lives here. When the globe
 *    renderer, the in world scene builder and the server exist, they import {@link latLngToVec3}
 *    and {@link vec3ToLatLng} from here. A local variant anywhere else is a bug. The product
 *    promise is that the terrain previewed on the globe is the terrain the player walks on, and
 *    that promise is only ever as good as the shared mapping from a point on the sphere to the
 *    position the terrain field is sampled at.
 *
 * 2. h3-js measures the world on Earth. Every area it returns is an area on a sphere of radius
 *    {@link H3_EARTH_RADIUS_KM}. Our planet has a radius of 200 km, so nothing from h3-js may be
 *    shown to a user, or used in a capacity number, until it has passed through
 *    {@link cellAreaKm2} or {@link areaScaleFromEarth}. This module is the only place that
 *    conversion is allowed to happen.
 *
 * Everything here is pure. No clock, no randomness, no I/O.
 */

import { cellArea, cellToLatLng, getNumCells, getResolution, getRes0Cells, isPentagon } from "h3-js";

/** A point in the planet's right handed 3D space. Y is the polar axis, so +Y is the north pole. */
export type Vec3 = [number, number, number];

// ── the coordinate convention ───────────────────────────────────────────────────

/**
 * A point on the sphere, from degrees to 3D.
 *
 * `lat` and `lng` are in degrees, `r` is the radius. Latitude runs to +Y, so the north pole is
 * `[0, r, 0]`, and longitude 0 sits on +X with longitude increasing towards +Z.
 */
export function latLngToVec3(lat: number, lng: number, r = 1): Vec3 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return [
    r * Math.cos(phi) * Math.cos(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(lambda),
  ];
}

/**
 * The exact inverse of {@link latLngToVec3}, returning `[lat, lng]` in degrees.
 *
 * The radius is recovered from the vector, so this accepts a point at any radius, not just a unit
 * vector. Longitude is degenerate at the poles, where every longitude names the same point: there
 * the result is whatever `atan2` yields, and callers who care must handle the pole themselves.
 */
export function vec3ToLatLng(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z);
  return [
    (Math.asin(y / r) * 180) / Math.PI,
    (Math.atan2(z, x) * 180) / Math.PI,
  ];
}

/**
 * The signed difference between two longitudes, in degrees, in the range (-180, 180].
 *
 * Longitude wraps, so -180 and +180 name the same meridian. Any test or tolerance check on a
 * recovered longitude has to go through this, otherwise a point on the antimeridian reads as a
 * 360 degree error.
 */
export function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  // Normalise negative zero away, so an exact match never reads as "-0 degrees" downstream.
  return d === 0 ? 0 : d;
}

// ── the resolution table ────────────────────────────────────────────────────────

/**
 * The number of H3 cells at a resolution: `2 + 120 * 7^r`.
 *
 * The 2 and the 120 are the twelve pentagons and the base icosahedral faces falling out of Euler's
 * formula. The factor of seven is the whole reason a subdivision round multiplies inventory by
 * seven and not by two or four. Exact in IEEE doubles up to resolution 16, past the resolution 15
 * that h3-js itself allows, so the argument guard below is the real limit.
 */
export function cellCountAtResolution(res: number): number {
  if (!Number.isInteger(res) || res < 0 || res > 15) {
    throw new RangeError(`resolution must be an integer in 0..15, got ${res}`);
  }
  return 2 + 120 * Math.pow(7, res);
}

/** The count h3-js itself reports, for cross checking {@link cellCountAtResolution}. */
export function h3CellCountAtResolution(res: number): number {
  return getNumCells(res);
}

// ── Earth to planet ─────────────────────────────────────────────────────────────

/**
 * The sphere h3-js measures on. This is H3's authalic Earth radius, the radius of the sphere with
 * the same surface area as the WGS84 ellipsoid. It is asserted against `cellArea` in the tests, so
 * an h3-js upgrade that changed it would fail loudly rather than quietly rescale the planet.
 */
export const H3_EARTH_RADIUS_KM = 6371.007180918475;

/** Surface area of a sphere, in km squared. */
export function sphereAreaKm2(radiusKm: number): number {
  return 4 * Math.PI * radiusKm * radiusKm;
}

/**
 * The factor that converts an area on H3's Earth to an area on a planet of `radiusKm`.
 *
 * Areas scale with the square of the radius. At the 200 km planet radius this is about 1/1015, so
 * an unscaled h3-js area is wrong by three orders of magnitude. That is the mistake this function
 * exists to prevent.
 */
export function areaScaleFromEarth(radiusKm: number): number {
  const ratio = radiusKm / H3_EARTH_RADIUS_KM;
  return ratio * ratio;
}

/**
 * The true area of an H3 cell on a planet of `radiusKm`, in km squared.
 *
 * This asks h3-js for the cell's solid angle in steradians and multiplies by r squared, rather than
 * asking for square kilometres and dividing Earth back out. The two agree to 1e-9, but the
 * steradian route is radius free: it never imports H3's Earth radius as an unstated assumption, and
 * the 122 resolution 0 cells reproduce 4*pi*r^2 to within 2e-10.
 *
 * One trap this function cannot protect you from. Cell area is the spherical area of the cell's
 * boundary vertices, and a parent's boundary is not the union of its children's boundaries, so
 * areas are NOT additive across resolutions. A hexagon's seven children sum to about 0.01% less
 * than the parent, and a pentagon's six children sum to about 0.2% MORE. Never validate a tiling by
 * summing areas, and never assume a parcel's area is the sum of the areas it would subdivide into.
 */
export function cellAreaKm2(cell: string, radiusKm: number): number {
  return cellArea(cell, "rads2") * radiusKm * radiusKm;
}

/**
 * The number of resolution `targetRes` cells that lie inside `cell`, without materialising them.
 *
 * A hexagon has 7^k descendants k levels down. A pentagon does NOT have 6 * 7^(k-1): exactly one of
 * its six children is itself a pentagon, so the shortfall repeats at every level and the true count
 * is 1 + 5 * (7^k - 1) / 6, giving 6, 41, 286, 2001 rather than 6, 42, 294, 2058. Using 7^k
 * uniformly across all 122 base cells overcounts the resolution 8 sphere by 1.67%, which is enough
 * to fail a perfectly valid tiling. This is the weight the section 8 invariant is built on.
 */
export function descendantCount(cell: string, targetRes: number): number {
  const k = targetRes - getResolution(cell);
  if (k < 0) throw new RangeError(`${cell} is already finer than resolution ${targetRes}`);
  const hexes = Math.pow(7, k);
  return isPentagon(cell) ? 1 + (5 * (hexes - 1)) / 6 : hexes;
}

/**
 * The total number of resolution `targetRes` cells on the sphere, as the weighted sum over base
 * cells. Equal to cellCountAtResolution(targetRes), and the identity that makes descendantCount
 * safe to trust: 110 * 7^8 + 12 * P(8) = 691,776,122.
 */
export function descendantCountOfSphere(targetRes: number): number {
  return getRes0Cells().reduce((sum, c) => sum + descendantCount(c, targetRes), 0);
}

// ── how wide is a parcel, really ────────────────────────────────────────────────

/**
 * The diameter, in metres, of the circle with the same area as the parcel.
 *
 * This is the number to put in front of a user. It is shape independent, so it stays honest across
 * the hexagons, the twelve pentagons and the varying cell areas, and it is what "a parcel about
 * 30 m across" should mean.
 */
export function equalAreaWidthM(areaKm2: number): number {
  return 2 * Math.sqrt((areaKm2 * 1e6) / Math.PI);
}

/**
 * The flat to flat width, in metres, of a regular hexagon of the same area.
 *
 * Reported alongside {@link equalAreaWidthM} because it is the distance a player actually walks
 * crossing a parcel at its narrowest, which runs about 5% under the equal area diameter.
 */
export function hexagonWidthM(areaKm2: number): number {
  return Math.sqrt((2 * areaKm2 * 1e6) / Math.sqrt(3));
}

/**
 * Where a parcel is, in the three forms every caller needs.
 *
 * Exists so that nothing outside this package has to import h3-js just to ask where a cell is. The
 * API routes and the renderers all want the same three things and should not each convert.
 */
export function cellCentre(cell: string): { lat: number; lng: number; direction: Vec3 } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng, direction: latLngToVec3(lat, lng) };
}
