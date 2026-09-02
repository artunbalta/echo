/**
 * The gate on every later step (build order step 1).
 *
 * Two things are proved here, and nothing in this project may be built until both hold.
 *
 *   1. latLngToVec3 and vec3ToLatLng are exact inverses. Every terrain sample, on the globe and
 *      in the walkable scene alike, is taken at a position produced by this pair. If they disagree
 *      by more than rounding, the two renderers sample different points and the central product
 *      promise fails silently rather than loudly.
 *
 *   2. The resolution table really is 2 + 120 * 7^r, h3-js agrees, and there really are exactly
 *      twelve pentagons at every resolution. The subdivision economics in
 *      scripts/simulate-capacity.ts multiply inventory by seven each round, and that factor is
 *      only correct because of these two facts.
 *
 * The random pairs are drawn from a seeded generator rather than Math.random, so a failure is
 * reproducible and the suite can never flake.
 *
 * Run:  node --import tsx --test packages/planet/tests/geo.test.ts
 *   (or)  npm run test -w @echo/planet
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellArea, getNumCells, getPentagons, getRes0Cells, cellToChildrenSize, isPentagon } from "h3-js";

import {
  latLngToVec3,
  vec3ToLatLng,
  angleDiffDeg,
  cellCountAtResolution,
  h3CellCountAtResolution,
  H3_EARTH_RADIUS_KM,
  sphereAreaKm2,
  areaScaleFromEarth,
  cellAreaKm2,
  equalAreaWidthM,
  hexagonWidthM,
} from "../lib/geo.js";

/** mulberry32, the same reproducible generator the rest of the repo uses. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUND_TRIP_SAMPLES = 10_000;
const TOLERANCE_DEG = 1e-9;

/**
 * How close to a pole degrees stop round tripping to 1e-9.
 *
 * Latitude is recovered by asin(y), whose slope blows up as y approaches 1, so an error of one
 * ulp in y becomes an error of roughly 1.1e-16 / cos(lat) radians. Setting that equal to 1e-9
 * degrees puts the breakdown at about 5e-4 degrees from a pole, which is a cap 1.7 m across on a
 * 200 km planet. A uniformly drawn latitude lands inside it about once in 180,000 draws, so a
 * 10,000 pair test has roughly a 5% chance of hitting it: near enough to certain over a few
 * hundred CI runs. This constant is where the assertion is allowed to stop, with a 2x margin, and
 * the test below measures the real threshold rather than trusting this comment.
 */
const POLE_BAND_DEG = 1e-3;

test("lat/lng round trips through vec3 for 10,000 random pairs within 1e-9 degrees", () => {
  const rand = mulberry32(0x5eed);
  let worstLat = 0;
  let worstLng = 0;
  let inPolarCap = 0;

  for (let i = 0; i < ROUND_TRIP_SAMPLES; i++) {
    const lat = rand() * 180 - 90;
    const lng = rand() * 360 - 180;

    const [x, y, z] = latLngToVec3(lat, lng);
    const [lat2, lng2] = vec3ToLatLng(x, y, z);

    // The position must come back, everywhere, with no exceptions. This is the property the two
    // renderers actually depend on, so it is asserted for every sample including polar ones.
    const q = latLngToVec3(lat2, lng2);
    const drift = Math.hypot(x - q[0], y - q[1], z - q[2]);
    assert.ok(drift < 3e-8, `sample ${i}: position drifted ${drift} at ${lat},${lng}`);

    if (90 - Math.abs(lat) < POLE_BAND_DEG) {
      inPolarCap++;
      continue;
    }

    const dLat = Math.abs(lat2 - lat);
    // Longitude wraps, so a point on the antimeridian must not read as a 360 degree error.
    const dLng = Math.abs(angleDiffDeg(lng2, lng));

    worstLat = Math.max(worstLat, dLat);
    worstLng = Math.max(worstLng, dLng);

    assert.ok(dLat < TOLERANCE_DEG, `sample ${i}: lat ${lat} came back as ${lat2}`);
    assert.ok(dLng < TOLERANCE_DEG, `sample ${i}: lng ${lng} came back as ${lng2}`);
  }

  assert.ok(worstLat < TOLERANCE_DEG && worstLng < TOLERANCE_DEG);
  // The excluded cap is 1.1e-5 of the sphere by latitude, so it should almost always be empty.
  assert.ok(inPolarCap <= 3, `${inPolarCap} of 10,000 samples fell inside the polar cap`);
});

test("the 1e-9 degree bound breaks down within about 5e-4 degrees of a pole, and not before", () => {
  // Measured, not asserted from the comment above. Scanning in from the pole, find the first
  // distance at which the latitude round trip is still worse than 1e-9 degrees.
  let breakdown = 0;
  for (let e = 0; e <= 80; e++) {
    const d = Math.pow(10, -e / 10);
    let worst = 0;
    for (let k = 0; k < 360; k++) {
      const lat = 90 - d;
      const [x, y, z] = latLngToVec3(lat, -180 + k);
      worst = Math.max(worst, Math.abs(vec3ToLatLng(x, y, z)[0] - lat));
    }
    if (worst >= TOLERANCE_DEG && breakdown === 0) breakdown = d;
  }

  assert.ok(breakdown > 1e-4, `degrees broke down ${breakdown} from the pole, further out than expected`);
  assert.ok(breakdown < POLE_BAND_DEG, `degrees broke down at ${breakdown}, outside the excluded cap`);
  // On a 200 km planet that cap is under two metres across, which is why positions are the contract.
  assert.ok((breakdown * Math.PI * 200_000) / 180 < 2, "the polar cap is under 2 m across");
});

test("the round trip preserves the radius, and the unit sphere really is unit", () => {
  const rand = mulberry32(0xc0ffee);

  for (let i = 0; i < ROUND_TRIP_SAMPLES; i++) {
    const lat = rand() * 180 - 90;
    const lng = rand() * 360 - 180;
    const r = 0.5 + rand() * 2.5;

    const [x, y, z] = latLngToVec3(lat, lng, r);
    assert.ok(Math.abs(Math.hypot(x, y, z) - r) < 1e-12, `sample ${i}: radius drifted`);

    const [lat2, lng2] = vec3ToLatLng(x, y, z);
    assert.ok(Math.abs(lat2 - lat) < TOLERANCE_DEG);
    assert.ok(Math.abs(angleDiffDeg(lng2, lng)) < TOLERANCE_DEG);
  }

  const [ux, uy, uz] = latLngToVec3(0, 0);
  assert.ok(Math.abs(Math.hypot(ux, uy, uz) - 1) < 1e-15);
});

test("the sample POSITION round trips everywhere, including at the poles", () => {
  // What the terrain contract actually needs is that a POSITION survives the trip to degrees and
  // back, not that a longitude does. At a pole every longitude names the same point, so degrees are
  // ill conditioned there while the position is not, and the 1e-9 degree bound above is not a
  // universal property: for latitudes within about a millionth of a degree of a pole, sin(lat)
  // rounds to exactly 1 and asin snaps the point onto the pole itself.
  //
  // A directed sweep of the polar band at both poles, 1,400 log spaced distances by 72 longitudes,
  // puts the worst case at 1.914e-8 unit radii, 3.8 mm on a 200 km planet, at 1.1e-6 degrees from
  // the north pole. Terrain is sampled at metre scale, so the 3e-8 bound below is the one that
  // matters and it keeps 57% headroom over the measured maximum. Do not tighten it to 2e-8: that
  // leaves 4%, and the true maximum was found by a directed sweep, not by the samples below.
  const rand = mulberry32(0xb0a7);
  const cases: Array<[number, number]> = [
    [90, 0], [-90, 0], [90, 137.5], [-90, -22.25],
    [89.999999999, 45], [-89.999999999, -45], [89.999999, -160], [-89.9999999, 73],
    // The measured worst case, kept as a fixture so a regression here fails loudly.
    [89.9999989035218, -150], [-89.9999989035218, -150],
    [0, 180], [0, -180], [0, 0], [45, 90],
  ];
  for (let i = 0; i < 2000; i++) cases.push([rand() * 180 - 90, rand() * 360 - 180]);

  const PLANET_RADIUS_M = 200_000;
  let worstM = 0;

  for (const [lat, lng] of cases) {
    const p = latLngToVec3(lat, lng);
    const [lat2, lng2] = vec3ToLatLng(p[0], p[1], p[2]);
    const q = latLngToVec3(lat2, lng2);
    const drift = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    worstM = Math.max(worstM, drift * PLANET_RADIUS_M);
    assert.ok(drift < 3e-8, `position drifted by ${drift} unit radii at ${lat},${lng}`);
  }

  assert.ok(worstM < 0.006, `worst drift on the planet was ${worstM} m`);

  // Away from the poles, the round trip is good to the last few bits.
  for (let i = 0; i < 2000; i++) {
    const lat = rand() * 178 - 89;
    const lng = rand() * 360 - 180;
    const p = latLngToVec3(lat, lng);
    const [lat2, lng2] = vec3ToLatLng(p[0], p[1], p[2]);
    const q = latLngToVec3(lat2, lng2);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-14);
  }
});

test("the coordinate convention points where the comments say it points", () => {
  const near = (a: readonly number[], b: readonly number[], eps = 1e-12) =>
    a.every((v, i) => Math.abs(v - b[i]!) < eps);

  assert.ok(near(latLngToVec3(0, 0), [1, 0, 0]), "lng 0 on the equator is +X");
  assert.ok(near(latLngToVec3(90, 0), [0, 1, 0]), "the north pole is +Y");
  assert.ok(near(latLngToVec3(-90, 0), [0, -1, 0]), "the south pole is -Y");
  assert.ok(near(latLngToVec3(0, 90), [0, 0, 1]), "lng 90 on the equator is +Z");
  assert.ok(near(latLngToVec3(0, 180), [-1, 0, 0]), "the antimeridian is -X");
});

test("angleDiffDeg wraps at the antimeridian", () => {
  assert.equal(angleDiffDeg(180, -180), 0);
  assert.equal(angleDiffDeg(-180, 180), 0);
  assert.equal(angleDiffDeg(179, -179), -2);
  assert.equal(angleDiffDeg(-179, 179), 2);
  assert.equal(angleDiffDeg(10, 5), 5);
});

test("the resolution table is 2 + 120 * 7^r and h3-js agrees", () => {
  const expected = [122, 842, 5882, 41162, 288122, 2016842, 14117882, 98825162, 691776122];

  for (let res = 0; res <= 8; res++) {
    assert.equal(cellCountAtResolution(res), 2 + 120 * Math.pow(7, res));
    assert.equal(cellCountAtResolution(res), expected[res], `resolution ${res}`);
    assert.equal(h3CellCountAtResolution(res), cellCountAtResolution(res), `h3-js disagrees at ${res}`);
  }

  // The table stays exact well past the floor resolution, so nothing silently loses precision.
  for (let res = 9; res <= 15; res++) {
    assert.equal(getNumCells(res), cellCountAtResolution(res), `resolution ${res}`);
    assert.ok(Number.isSafeInteger(cellCountAtResolution(res)));
  }

  assert.throws(() => cellCountAtResolution(-1), RangeError);
  assert.throws(() => cellCountAtResolution(1.5), RangeError);
});

test("there are exactly twelve pentagons at every resolution, and they have six children", () => {
  for (let res = 0; res <= 8; res++) {
    const pentagons = getPentagons(res);
    assert.equal(pentagons.length, 12, `resolution ${res} has ${pentagons.length} pentagons`);
    assert.ok(pentagons.every((c) => isPentagon(c)));

    if (res < 8) {
      // Six children, not seven. Every count in the capacity simulation depends on this.
      assert.equal(cellToChildrenSize(pentagons[0]!, res + 1), 6);
    }
  }

  // A hexagon has seven children, which is the factor a subdivision round multiplies inventory by.
  const hexagons = getRes0Cells().filter((c) => !isPentagon(c));
  assert.equal(cellToChildrenSize(hexagons[0]!, 1), 7);
  assert.equal(cellToChildrenSize(hexagons[0]!, 3), 343);
});

test("h3-js measures on Earth, and the scale to a 200 km planet is exact", () => {
  const res0 = getRes0Cells();
  assert.equal(res0.length, 122);

  const earthTotal = res0.reduce((sum, c) => sum + cellArea(c, "km2"), 0);
  const impliedRadius = Math.sqrt(earthTotal / (4 * Math.PI));
  assert.ok(
    Math.abs(impliedRadius - H3_EARTH_RADIUS_KM) / H3_EARTH_RADIUS_KM < 1e-12,
    `h3-js implies an Earth radius of ${impliedRadius} km, not ${H3_EARTH_RADIUS_KM}`,
  );

  // The whole planet, reassembled from rescaled cells, is the sphere we said we were building.
  const planetTotal = res0.reduce((sum, c) => sum + cellAreaKm2(c, 200), 0);
  const expected = sphereAreaKm2(200);
  assert.ok(Math.abs(planetTotal - expected) / expected < 1e-12);
  assert.ok(Math.abs(expected - 502_654.82) < 0.01, `planet surface is ${expected} km2`);

  // The scale factor is roughly 1/1015. An unscaled h3-js area is not slightly wrong, it is wrong
  // by three orders of magnitude, which is why cellAreaKm2 exists.
  assert.ok(Math.abs(1 / areaScaleFromEarth(200) - 1015) < 1);
});

test("parcel widths match the numbers the design document quotes", () => {
  const planet = sphereAreaKm2(200);

  const meanRes1 = planet / cellCountAtResolution(1);
  assert.ok(Math.abs(meanRes1 - 597) < 1, `mean resolution 1 parcel is ${meanRes1} km2`);
  assert.ok(Math.abs(equalAreaWidthM(meanRes1) / 1000 - 27.6) < 0.5);

  const meanRes8 = planet / cellCountAtResolution(8);
  assert.ok(Math.abs(equalAreaWidthM(meanRes8) - 30.4) < 0.5, `resolution 8 is ${equalAreaWidthM(meanRes8)} m across`);

  // A hexagon is narrower flat to flat than the equal area circle is wide, by about 5%.
  assert.ok(hexagonWidthM(meanRes8) < equalAreaWidthM(meanRes8));
  assert.ok(hexagonWidthM(meanRes8) / equalAreaWidthM(meanRes8) > 0.95);
});
