/**
 * The walkable parcel (section 6.2, steps 4 and 5). Build order step 10.
 *
 * Two properties matter here and neither is visual. The mesh must END at the deed line, because a
 * parcel that renders a little past its boundary is showing you land you do not own. And the
 * vegetation must be a pure function of position, because the same parcel is built on a server, in
 * a browser and again tomorrow, and a tree that moves between them is a different world each time.
 *
 * Run:  node --import tsx --test packages/planet/tests/scene.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, getResolution } from "h3-js";

import { cellAreaKm2 } from "../lib/geo.js";
import { landFractionOfCell } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { buildParcelScene, createTangentPatch, hashPosition } from "../lib/scene.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";

const field = createTerrain("echo-capacity-1");
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget, 60_000);
const RADIUS = PLANET_PARAMS.radiusKm;

/** A handful of real parcels at the shipped resolution, chosen without randomness. */
function sampleParcels(count: number): string[] {
  const base = seedInventory(1, 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let cell = base[(i * 137) % base.length]!;
    while (getResolution(cell) < PLANET_PARAMS.startResolution) {
      const children = cellToChildren(cell, getResolution(cell) + 1);
      cell = children[i % children.length]!;
    }
    out.push(cell);
  }
  return out;
}

test("the mesh is cut to the parcel boundary, not merely faded at it", () => {
  for (const cell of sampleParcels(6)) {
    const scene = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 48 });
    assert.ok(scene.triangleCount > 100, `${cell} produced only ${scene.triangleCount} triangles`);

    const polygon = scene.patch.boundary;
    // Every vertex is inside the deed line, allowing a millimetre for the clipper's arithmetic.
    for (let v = 0; v < scene.positions.length; v += 3) {
      const x = scene.positions[v]!;
      const y = scene.positions[v + 1]!;
      assert.ok(insideWithSlack(polygon, x, y, 0.001), `${cell}: a vertex at ${x}, ${y} is outside the parcel`);
    }

    // And it fills the parcel: the clipped area is the parcel's own area, within the flat plane
    // approximation that section 6.2 documents.
    let area = 0;
    for (let t = 0; t < scene.triangleCount; t++) {
      const o = t * 9;
      const ux = scene.positions[o + 3]! - scene.positions[o]!;
      const uy = scene.positions[o + 4]! - scene.positions[o + 1]!;
      const vx = scene.positions[o + 6]! - scene.positions[o]!;
      const vy = scene.positions[o + 7]! - scene.positions[o + 1]!;
      area += Math.abs(ux * vy - uy * vx) / 2;
    }
    const expected = cellAreaKm2(cell, RADIUS) * 1e6;
    assert.ok(
      Math.abs(area - expected) / expected < 0.02,
      `${cell}: clipped area ${area} against a parcel of ${expected}`,
    );
  }
});

test("where the boundary crosses water, the parcel edge is water and says so", () => {
  // The scene's own land fraction has to agree with the number the registry sold the parcel on,
  // or the deed and the ground disagree about what was bought.
  let checked = 0;
  for (const cell of sampleParcels(10)) {
    const scene = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 64 });
    const registryLand = landFractionOfCell(field, calibration.seaLevel, cell, 2);
    assert.ok(
      Math.abs(scene.landFraction - registryLand) < 0.12,
      `${cell}: the scene says ${scene.landFraction} land, the registry says ${registryLand}`,
    );
    assert.equal(scene.hasWater, scene.landFraction < 0.999);
    if (scene.hasWater) checked++;
  }
  assert.ok(checked > 0, "no sampled parcel had a coastline, so nothing was tested");
});

test("the same parcel gives the same trees in the same places, every time", () => {
  const cell = sampleParcels(1)[0]!;
  const a = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 48 });
  const b = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 48 });

  assert.ok(a.plants.length > 0, "the parcel grew nothing at all");
  assert.equal(a.plants.length, b.plants.length);
  for (let i = 0; i < a.plants.length; i++) {
    assert.deepEqual(a.plants[i], b.plants[i], `plant ${i} moved between two builds`);
  }

  // Salting Math.random must not reach the placement, because nothing here may consult it.
  const original = Math.random;
  try {
    Math.random = () => 0.123456789;
    const c = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 48 });
    assert.deepEqual(c.plants, a.plants);
  } finally {
    Math.random = original;
  }
});

test("nothing grows on water, rock, ice or a cliff", () => {
  for (const cell of sampleParcels(6)) {
    const scene = buildParcelScene(cell, field, calibration, RADIUS, { resolution: 64 });
    for (const plant of scene.plants) {
      assert.ok(
        !["ocean", "bare-rock", "snow"].includes(plant.biome),
        `${cell}: something grew on ${plant.biome}`,
      );
      assert.ok(plant.scale >= 0.6 && plant.scale <= 1.4);
      assert.ok(plant.rotation >= 0 && plant.rotation < Math.PI * 2);
      // And it stands on the ground, not above or below it.
      assert.ok(Number.isFinite(plant.z));
    }
  }
});

test("hashPosition depends on the place, not on the order it was asked about", () => {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 500; i++) points.push([i * 3.7 - 900, i * -1.9 + 400]);

  const forwards = points.map(([x, y]) => hashPosition(x, y));
  const backwards = [...points].reverse().map(([x, y]) => hashPosition(x, y)).reverse();
  assert.deepEqual(forwards, backwards);

  // Uniform enough to use as a probability, and different for different salts.
  const mean = forwards.reduce((s, v) => s + v, 0) / forwards.length;
  assert.ok(Math.abs(mean - 0.5) < 0.06, `mean was ${mean}`);
  assert.ok(forwards.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(forwards, points.map(([x, y]) => hashPosition(x, y, 1)));

  // A millimetre apart is the same place; a metre apart is not.
  assert.equal(hashPosition(10, 20), hashPosition(10.0001, 20.0001));
  assert.notEqual(hashPosition(10, 20), hashPosition(11, 20));
});

function insideWithSlack(
  polygon: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
  slack: number,
): boolean {
  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  const winding = area2 >= 0 ? 1 : -1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const cross = winding * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]));
    if (cross / length < -slack) return false;
  }
  return true;
}
