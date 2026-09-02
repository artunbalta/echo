/**
 * The terrain contract (section 5).
 *
 * The product promise is that the globe and the walkable scene show the same ground. That promise
 * is only testable end to end at build order step 5, but it is only ACHIEVABLE if the field itself
 * is a pure function of seed and position, samples in 3D rather than on a wrapped 2D map, and never
 * touches a global generator. Those three are what this file pins.
 *
 * Run:  node --import tsx --test packages/planet/tests/terrain.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { latLngToVec3, type Vec3 } from "../lib/geo.js";
import {
  BIOMES,
  biome,
  biomeAt,
  calibratePlanet,
  createTerrain,
  fibonacciSphere,
  measureLandFraction,
  normalisedHeight,
  terrainFor,
  elevation as elevationOf,
  moisture as moistureOf,
  temperature as temperatureOf,
  type Biome,
} from "../lib/terrain.js";

const SEED = "echo-planet-1";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniformly spread positions, used everywhere below so a failure is reproducible. */
const points = fibonacciSphere(4000);

test("the same seed gives the same planet, and a different seed gives a different one", () => {
  const a = createTerrain(SEED);
  const b = createTerrain(SEED);
  const c = createTerrain("echo-planet-2");

  let differs = 0;
  for (const p of points) {
    assert.equal(a.elevation(p), b.elevation(p), "elevation is not reproducible");
    assert.equal(a.moisture(p), b.moisture(p), "moisture is not reproducible");
    assert.equal(a.temperature(p), b.temperature(p), "temperature is not reproducible");
    if (a.elevation(p) !== c.elevation(p)) differs++;
  }
  assert.ok(differs > points.length * 0.99, "a different seed produced a suspiciously similar planet");

  // The memoised entry point must agree with a freshly built field, and be the same object twice.
  assert.equal(terrainFor(SEED), terrainFor(SEED));
  for (const p of points.slice(0, 200)) {
    assert.equal(elevationOf(SEED, p), a.elevation(p));
    assert.equal(moistureOf(SEED, p), a.moisture(p));
    assert.equal(temperatureOf(SEED, p), a.temperature(p));
  }
});

test("call order never changes an answer", () => {
  // A field that leaked state into its generators would drift when sampled in a different order.
  const field = createTerrain(SEED);
  const forwards = points.map((p) => field.elevation(p));
  const shuffled = points.map((_, i) => i).reverse();
  for (const i of shuffled) {
    assert.equal(field.elevation(points[i]!), forwards[i]);
  }
  // And interleaving the three fields must not disturb any of them.
  const moistures = points.map((p) => field.moisture(p));
  for (let i = 0; i < points.length; i++) {
    field.temperature(points[i]!);
    assert.equal(field.moisture(points[i]!), moistures[i]);
  }
});

test("every field stays inside the range it promises", () => {
  const field = createTerrain(SEED);
  for (const p of fibonacciSphere(20_000)) {
    const e = field.elevation(p);
    assert.ok(e >= -1 && e <= 1, `elevation ${e} out of range`);
    const m = field.moisture(p);
    assert.ok(m >= 0 && m <= 1, `moisture ${m} out of range`);
    const t = field.temperature(p);
    assert.ok(t >= 0 && t <= 1, `temperature ${t} out of range`);
  }
});

test("there is no antimeridian seam and no polar smear, because the field is sampled in 3D", () => {
  const field = createTerrain(SEED);

  // A 2D noise map wrapped onto lat/lng tears here. Crossing the antimeridian must be no more
  // eventful than crossing any other meridian, so compare the two against a control gap.
  let worstSeam = 0;
  let worstControl = 0;
  for (let i = 0; i < 2000; i++) {
    const lat = -89 + (178 * i) / 2000;
    const seam = Math.abs(
      field.elevation(latLngToVec3(lat, 179.999)) - field.elevation(latLngToVec3(lat, -179.999)),
    );
    const control = Math.abs(
      field.elevation(latLngToVec3(lat, 20.001)) - field.elevation(latLngToVec3(lat, 19.999)),
    );
    worstSeam = Math.max(worstSeam, seam);
    worstControl = Math.max(worstControl, control);
  }
  assert.ok(
    worstSeam < worstControl * 3,
    `the antimeridian jumps by ${worstSeam} against ${worstControl} for an ordinary meridian`,
  );

  // At a pole every longitude is the same point, so every longitude must give the same answer.
  for (const pole of [90, -90]) {
    const reference = field.elevation(latLngToVec3(pole, 0));
    for (let lng = -180; lng < 180; lng += 7) {
      assert.ok(
        Math.abs(field.elevation(latLngToVec3(pole, lng)) - reference) < 1e-12,
        `the ${pole > 0 ? "north" : "south"} pole has a different height at longitude ${lng}`,
      );
    }
  }
});

test("sea level is calibrated to the land target, not guessed, across seeds and targets", () => {
  for (const seed of ["echo-planet-1", "echo-planet-2", "echo-planet-3"]) {
    const field = createTerrain(seed);
    for (const target of [0.3, 0.6, 0.8]) {
      const cal = calibratePlanet(field, target, 60_000);
      assert.ok(
        Math.abs(cal.landFraction - target) < 0.002,
        `${seed} at a ${target} target realised ${cal.landFraction}`,
      );
      // Measured again on an independent sample, so the number is not just the calibration
      // agreeing with itself.
      const measured = measureLandFraction(field, cal.seaLevel, 90_000);
      assert.ok(Math.abs(measured - target) < 0.01, `${seed} at ${target} measured ${measured}`);
      assert.ok(cal.peakElevation > cal.seaLevel, "the peak must be above the water");
    }
  }

  assert.throws(() => calibratePlanet(createTerrain(SEED), 0), RangeError);
  assert.throws(() => calibratePlanet(createTerrain(SEED), 1), RangeError);
});

test("normalised height puts the shoreline at 0 and this planet's high ground at 1", () => {
  const field = createTerrain(SEED);
  const cal = calibratePlanet(field, 0.6, 60_000);

  assert.equal(normalisedHeight(cal.seaLevel, cal), 0);
  assert.ok(Math.abs(normalisedHeight(cal.peakElevation, cal) - 1) < 1e-12);
  assert.ok(normalisedHeight(cal.seaLevel - 0.1, cal) < 0, "below sea level must be negative");
  // Ground above the 99.9th percentile exists and simply reads as fully mountainous.
  assert.ok(normalisedHeight(cal.peakElevation + 0.5, cal) >= 1);
});

test("the biome table covers its whole input space and reaches every biome", () => {
  // Ocean is decided by the sign alone, since the signature carries no sea level.
  for (const m of [0, 0.5, 1]) {
    for (const t of [0, 0.5, 1]) {
      assert.equal(biome(-0.001, m, t), "ocean");
      assert.equal(biome(-1, m, t), "ocean");
      assert.equal(biome(0, m, t), "ocean");
    }
  }

  // No input anywhere in range may fall through the table.
  const seen = new Set<Biome>();
  for (let e = -1; e <= 1.0001; e += 0.02) {
    for (let m = 0; m <= 1.0001; m += 0.05) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const b = biome(e, m, t);
        assert.ok(BIOMES.includes(b), `${e},${m},${t} produced ${b}`);
        seen.add(b);
      }
    }
  }
  assert.equal(seen.size, BIOMES.length, `unreachable biomes: ${BIOMES.filter((b) => !seen.has(b))}`);

  // And every one of them actually occurs on the planet, not just in the table.
  const field = createTerrain(SEED);
  const cal = calibratePlanet(field, 0.6, 60_000);
  const onPlanet = new Set<Biome>();
  for (const p of fibonacciSphere(60_000)) onPlanet.add(biomeAt(field, cal, p));
  assert.equal(onPlanet.size, BIOMES.length, `missing from the planet: ${BIOMES.filter((b) => !onPlanet.has(b))}`);
});

test("the poles are cold and mountains are cold, from latitude and altitude alone", () => {
  const field = createTerrain(SEED);

  // Section 5.5 is explicit that this comes from latitude, not from a separate polar noise field,
  // so it must hold at every longitude rather than on average.
  for (let lng = -180; lng < 180; lng += 15) {
    assert.ok(field.temperature(latLngToVec3(88, lng)) < 0.2, `the north pole is warm at ${lng}`);
    assert.ok(field.temperature(latLngToVec3(-88, lng)) < 0.2, `the south pole is warm at ${lng}`);
    assert.ok(field.temperature(latLngToVec3(0, lng)) > 0.7, `the equator is cold at ${lng}`);
  }

  // Temperature must fall monotonically with latitude once the small local term is averaged out.
  const bandMean = (lat: number) => {
    let sum = 0;
    for (let lng = -180; lng < 180; lng += 3) sum += field.temperature(latLngToVec3(lat, lng));
    return sum / 120;
  };
  let previous = Infinity;
  for (let lat = 0; lat <= 85; lat += 5) {
    const mean = bandMean(lat);
    assert.ok(mean < previous, `latitude ${lat} is not colder than ${lat - 5}`);
    previous = mean;
  }

  // Altitude does the rest: at one latitude, the highest ground must be colder than the lowest.
  const sameLatitude: Array<{ p: Vec3; e: number }> = [];
  for (let lng = -180; lng < 180; lng += 0.25) {
    const p = latLngToVec3(12, lng);
    sameLatitude.push({ p, e: field.elevation(p) });
  }
  sameLatitude.sort((a, b) => a.e - b.e);
  const low = sameLatitude[0]!;
  const high = sameLatitude[sameLatitude.length - 1]!;
  assert.ok(
    field.temperature(high.p) < field.temperature(low.p),
    "high ground is not colder than low ground at the same latitude",
  );
});

test("no Math.random anywhere in the terrain path", () => {
  // Section 11 asks for this to be grepped and confirmed. Confirming it in a test means it stays
  // confirmed, rather than being true on the day somebody typed grep.
  // Comments are stripped first, because this file's own header promises there is no Math.random
  // in it and a raw grep would flag that promise as the violation.
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const roots = [new URL("../lib/", import.meta.url).pathname, new URL("../scripts/", import.meta.url).pathname];
  const offenders: string[] = [];
  for (const dir of roots) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      if (/Math\s*\.\s*random/.test(withoutComments(readFileSync(join(dir, file), "utf8")))) {
        offenders.push(file);
      }
    }
  }
  assert.deepEqual(offenders, [], `Math.random found in ${offenders.join(", ")}`);

  // And the check itself must work, or it is a rubber stamp.
  assert.equal(withoutComments("// Math.random\nconst a = 1;").includes("random"), false);
  assert.equal(withoutComments("const a = Math.random();").includes("random"), true);
});

test("the noise generators are seeded from the string, not from a global generator", () => {
  // Building a planet must not consume any global randomness, and must not depend on how much
  // randomness anything else consumed first. Salting Math.random proves the field ignores it.
  const before = createTerrain(SEED).elevation(points[0]!);
  const original = Math.random;
  try {
    const rigged = mulberry32(999);
    Math.random = rigged;
    for (let i = 0; i < 50; i++) Math.random();
    assert.equal(createTerrain(SEED).elevation(points[0]!), before);
  } finally {
    Math.random = original;
  }
});
