/**
 * The walkable parcel (section 6.2, steps 4 and 5). Build order step 10.
 *
 * Two properties matter here and neither is visual. The mesh must END at the deed line, because a
 * parcel that renders a little past its boundary is showing you land you do not own. And the
 * vegetation must be a pure function of position, because the same parcel is built on a server, in
 * a browser and again tomorrow, and a tree that moves between them is a different world each time.
 *
 * The second half is the built region (W2-1): the anchor cell and its rings on ONE lattice, so
 * chunks share edge vertices exactly and nothing is clipped inside the region; and the height is
 * the I1 function to the float, at the layer's default step, in under 400 ms.
 *
 * Run:  node --import tsx --test packages/planet/tests/scene.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, getResolution, gridDisk } from "h3-js";

import { cellAreaKm2 } from "../lib/geo.js";
import { landFractionOfCell } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { buildParcelScene, buildRegionScene, createTangentPatch, hashPosition, sceneHeightAt, type RegionScene } from "../lib/scene.js";
import { BIOME_COLOUR, BIOMES, calibratePlanet, createTerrain, type Biome } from "../lib/terrain.js";
import { biomeAtLocal } from "../lib/biome-mask.js";
import { DEMO_CELL } from "../lib/demo-cell.js";
import { PARCEL_REGION_K } from "../lib/parcel.js";
import { regionBound } from "../lib/walkable.js";

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

// ── the built region (W2-1, W2-4) ───────────────────────────────────────────────

/**
 * The demo disk at the layer's default step, built once for the tests below and timed, because
 * the budget (under 400 ms in node) is an acceptance criterion and not a hope.
 */
let demoRegion: RegionScene | null = null;
function demoScene(): RegionScene {
  if (demoRegion) return demoRegion;
  const t0 = performance.now();
  demoRegion = buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS);
  const ms = performance.now() - t0;
  console.log(
    `buildRegionScene(${DEMO_CELL}, k=${PARCEL_REGION_K}) at ${demoRegion.resolution} m: ` +
      `${ms.toFixed(0)} ms, ${demoRegion.triangleCount} triangles in ${demoRegion.chunks.length} chunks ` +
      `(${demoRegion.chunks.map((c) => c.triangleCount).join(", ")})`,
  );
  assert.ok(ms < 400, `the region took ${ms.toFixed(0)} ms to build; the budget is 400`);
  return demoRegion;
}

/** Deterministic points inside the anchor cell: hashed, not drawn, so a failure can be rerun. */
function pointsInsideAnchor(scene: RegionScene, count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; out.length < count; i++) {
    const x = (hashPosition(i, 0, 11) - 0.5) * 2 * scene.patch.extentM;
    const y = (hashPosition(i, 0, 12) - 0.5) * 2 * scene.patch.extentM;
    if (insideWithSlack(scene.patch.boundary, x, y, 0)) out.push([x, y]);
  }
  return out;
}

test("the region is one lattice: adjacent chunks share their edge vertices exactly, and no triangle is clipped", () => {
  const scene = demoScene();
  const disk = gridDisk(DEMO_CELL, PARCEL_REGION_K);
  assert.equal(scene.chunks.length, disk.length, "one chunk per cell of the disk");
  assert.deepEqual(scene.chunks.map((c) => c.cell), disk);
  for (const chunk of scene.chunks) {
    assert.ok(chunk.triangleCount > 1000, `${chunk.cell} has only ${chunk.triangleCount} triangles`);
    assert.equal(chunk.positions.length, chunk.triangleCount * 9);
    assert.equal(chunk.normals.length, chunk.positions.length);
    assert.equal(chunk.colours.length, chunk.positions.length);
  }
  assert.equal(scene.triangleCount, scene.chunks.reduce((s, c) => s + c.triangleCount, 0));

  // Every vertex is a lattice point and every triangle is half of one lattice quad. That is the
  // whole no-T-junction argument: an edge of such a triangle has no lattice point in its interior,
  // so there is nothing for a neighbouring triangle to end against.
  const step = scene.resolution;
  for (const chunk of scene.chunks) {
    const p = chunk.positions;
    for (let t = 0; t < chunk.triangleCount; t++) {
      const o = t * 9;
      const xs = [p[o]!, p[o + 3]!, p[o + 6]!];
      const zs = [p[o + 2]!, p[o + 5]!, p[o + 8]!];
      for (const v of [...xs, ...zs]) {
        assert.ok(Math.abs(v / step - Math.round(v / step)) < 1e-9, `${chunk.cell}: ${v} is off the lattice`);
      }
      assert.equal(Math.max(...xs) - Math.min(...xs), step, `${chunk.cell}: triangle ${t} spans more than a quad in x`);
      assert.equal(Math.max(...zs) - Math.min(...zs), step, `${chunk.cell}: triangle ${t} spans more than a quad in z`);
    }
  }

  // The anchor and each of its six neighbours meet along an edge of about 800 m, so they share
  // about 70 vertices, and share them with ===: same x, same height, same z, same normal.
  const anchor = scene.chunks[0]!;
  const key = (p: Float32Array, v: number) => `${p[v]}|${p[v + 1]}|${p[v + 2]}`;
  const anchorVertices = new Map<string, number>();
  for (let v = 0; v < anchor.positions.length; v += 3) anchorVertices.set(key(anchor.positions, v), v);
  for (const neighbour of scene.chunks.slice(1)) {
    const shared = new Set<string>();
    for (let v = 0; v < neighbour.positions.length; v += 3) {
      const k = key(neighbour.positions, v);
      const a = anchorVertices.get(k);
      if (a === undefined) continue;
      shared.add(k);
      for (let c = 0; c < 3; c++) {
        assert.ok(anchor.positions[a + c] === neighbour.positions[v + c]);
        assert.ok(anchor.normals[a + c] === neighbour.normals[v + c], `${neighbour.cell}: a shared vertex has two normals`);
        assert.ok(anchor.colours[a + c] === neighbour.colours[v + c], `${neighbour.cell}: a shared vertex has two colours`);
      }
    }
    assert.ok(shared.size >= 30, `${neighbour.cell} shares only ${shared.size} vertices with the anchor`);
  }
});

test("I1: the mesh height is sceneHeightAt times the height scale, at the vertices and between them", () => {
  const scene = demoScene();
  // At 500 points inside the anchor cell, the function the scene carries is the I1 function.
  for (const [x, y] of pointsInsideAnchor(scene, 500)) {
    const expected = sceneHeightAt(scene.patch, field, calibration, x, y) * scene.heightScaleM;
    assert.ok(Math.abs(scene.heightAt(x, y) - expected) < 1e-6, `heightAt(${x}, ${y}) = ${scene.heightAt(x, y)}, I1 says ${expected}`);
  }
  // And at 500 emitted vertices the stored height is that number rounded to a float, which is
  // the most a Float32Array can carry: at 900 m a float's step is 6e-5, so the check is exact
  // rather than a tolerance that would pass anything. Colour is the contract's biome at the
  // vertex, not at the triangle: that is what lets two biomes blend across one triangle.
  const anchor = scene.chunks[0]!;
  const stride = Math.max(1, Math.floor(anchor.triangleCount * 3 / 500));
  let checked = 0;
  for (let v = 0; v < anchor.positions.length && checked < 500; v += stride * 3, checked++) {
    const x = anchor.positions[v]!;
    const y = -anchor.positions[v + 2]!; // three's z is south; local y is north
    const expected = Math.fround(sceneHeightAt(scene.patch, field, calibration, x, y) * scene.heightScaleM);
    assert.equal(anchor.positions[v + 1], expected, `vertex at ${x}, ${y}`);
    const colour = BIOME_COLOUR[biomeAtLocal(scene.patch, field, calibration, x, y)];
    for (let c = 0; c < 3; c++) assert.equal(anchor.colours[v + c], Math.fround(colour[c]! / 255));
  }
  assert.equal(checked, 500);
});

test("every emitted vertex is inside the region bound or within one grid step of it, and inside its chunk's sphere", () => {
  const scene = demoScene();
  const bound = regionBound(DEMO_CELL, PARCEL_REGION_K, RADIUS);
  assert.equal(scene.extentM, bound.radiusM);
  const step = scene.resolution;
  let rim = 0;
  let total = 0;
  for (const chunk of scene.chunks) {
    const p = chunk.positions;
    const [cx, cy, cz] = chunk.bounds.centre;
    for (let v = 0; v < p.length; v += 3) {
      total++;
      const x = p[v]!;
      const y = -p[v + 2]!;
      const d = Math.hypot(p[v]! - cx, p[v + 1]! - cy, p[v + 2]! - cz);
      assert.ok(d <= chunk.bounds.radius + 1e-3, `${chunk.cell}: a vertex is outside its bounding sphere`);
      if (bound.contains(x, y)) continue;
      rim++;
      // A quad is emitted when any corner is inside, so a vertex outside is one step from one that is not.
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) {
        for (let di = -1; di <= 1 && !near; di++) near = bound.contains(x + di * step, y + dj * step);
      }
      assert.ok(near, `${chunk.cell}: a vertex at ${x}, ${y} is more than a step outside the region`);
    }
  }
  assert.ok(rim > 0 && rim < total * 0.05, `${rim} of ${total} vertices are on the rim`);
});

test("the region reports its water and its make-up, and is the same region every time", () => {
  const scene = demoScene();
  assert.equal(scene.waterLevelY, 0);
  assert.equal(scene.hasWater, true, "the demo cell is a coast");
  const fractions = Object.values(scene.composition) as number[];
  assert.ok(Math.abs(fractions.reduce((s, f) => s + f, 0) - 1) < 1e-9);
  assert.ok((scene.composition.ocean ?? 0) > 0 && (scene.composition.ocean ?? 0) < 1);
  for (const kind of Object.keys(scene.composition)) assert.ok(BIOMES.includes(kind as Biome));
  assert.ok(scene.areaM2 > 5e6 && scene.areaM2 < 20e6, `the k=1 disk measures ${scene.areaM2} m2`);

  // Determinism at a coarser step, so two more builds cost a few ms each. Math.random is
  // replaced to prove it is never consulted, as the parcel test does.
  const a = buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS, { resolution: 36 });
  const original = Math.random;
  let b: RegionScene;
  try {
    Math.random = () => 0.123456789;
    b = buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS, { resolution: 36 });
  } finally {
    Math.random = original;
  }
  assert.deepEqual(a.chunks, b.chunks);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.composition, b.composition);
  assert.equal(a.hasWater, b.hasWater);
  assert.equal(a.triangleCount, b.triangleCount);
  assert.equal(a.areaM2, b.areaM2);
  // Coarser is fewer triangles of the same ground, not a different ground.
  assert.ok(a.triangleCount * 9 < scene.triangleCount * 1.1 && a.triangleCount * 9 > scene.triangleCount * 0.8, `${a.triangleCount} at 36 m against ${scene.triangleCount} at 12 m`);
  assert.ok(Math.abs((a.composition.ocean ?? 0) - (scene.composition.ocean ?? 0)) < 0.02);
});

test("a bad step or ring count is refused before any work is done", () => {
  assert.throws(() => buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS, { resolution: 0 }), RangeError);
  assert.throws(() => buildRegionScene(DEMO_CELL, -1, field, calibration, RADIUS), RangeError);
  assert.throws(() => buildRegionScene(DEMO_CELL, 1.5, field, calibration, RADIUS), RangeError);
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
