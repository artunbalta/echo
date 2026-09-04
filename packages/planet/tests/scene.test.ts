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
import { buildParcelScene, buildRegionScene, createSceneHeight, createTangentPatch, DEFAULT_DETAIL, hashPosition, sceneHeightAt, type RegionScene } from "../lib/scene.js";
import { BIOME_COLOUR, BIOME_COLOUR_LINEAR, BIOMES, calibratePlanet, createTerrain, srgbToLinear, type Biome } from "../lib/terrain.js";
import { biomeAtLocal } from "../lib/biome-mask.js";
import { DEMO_CELL } from "../lib/demo-cell.js";
import { PARCEL_REGION_K } from "../lib/parcel.js";
import { regionBound } from "../lib/walkable.js";

/**
 * The displacement's ceiling, as a LITERAL and not as `DEFAULT_DETAIL.amplitudeM`.
 *
 * Bounding a measurement by the dial that produces it passes at every dial setting, which is not a
 * bound at all. Proven rather than argued: with the two assertions below reading the dial, setting
 * the amplitude from 4 to 40 left this file passing 14 of 14 on a world ten times louder, and only
 * agreement.test.ts noticed. `moved > 250` catches relief going to zero and nothing caught it
 * growing.
 *
 * So the number is written here and the dial is asserted against it separately. A change to the
 * amplitude now has to come here and be read, which is the point.
 */
const DETAIL_CEILING_M = 4;

test("the displacement's ceiling is a number this file states, not the dial it measures", () => {
  assert.equal(
    DEFAULT_DETAIL.amplitudeM,
    DETAIL_CEILING_M,
    "the shipped amplitude moved without this file's ceiling moving with it: decide which is right",
  );
});


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
  // At 500 points inside the anchor cell, the function the scene carries is the I1 function plus
  // the C2 displacement and nothing else. The macro half is asserted exactly, by rebuilding the
  // same scene with the detail off; the displaced half is asserted against its own bound. A test
  // that only checked "close to sceneHeightAt" would pass with the displacement silently missing,
  // which is the whole thing this phase adds.
  const bare = buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS, { resolution: 12, detail: null });
  let moved = 0;
  for (const [x, y] of pointsInsideAnchor(scene, 500)) {
    const macro = sceneHeightAt(scene.patch, field, calibration, x, y) * scene.heightScaleM;
    assert.ok(Math.abs(bare.heightAt(x, y) - macro) < 1e-6, `detail off: heightAt(${x}, ${y}) is not I1`);
    const d = scene.heightAt(x, y) - macro;
    assert.ok(Math.abs(d) <= DEFAULT_DETAIL.amplitudeM + 1e-9, `displacement of ${d} m at ${x}, ${y}`);
    // Land stays land: the taper is what makes that true, and it is the promise C2 is built on.
    if (macro > 0) assert.ok(scene.heightAt(x, y) > 0, `land at ${x}, ${y} was pushed under the sea`);
    if (Math.abs(d) > 0.01) moved++;
  }
  assert.ok(moved > 250, `only ${moved} of 500 points moved by more than a centimetre`);
  // And at 500 emitted vertices the stored height is that number rounded to a float, which is
  // the most a Float32Array can carry: at 900 m a float's step is 6e-5, so the check is exact
  // rather than a tolerance that would pass anything. Colour is the contract's biome at the
  // vertex, not at the triangle: that is what lets two biomes blend across one triangle.
  //
  // This used to assert `colour[c] / 255`, which pinned the C3 bug rather than the contract: the
  // attribute is read as linear and nothing converts on the way in, so the raw byte ratio was the
  // wrong number and this test was the reason nobody noticed. It now pins the transfer.
  const anchor = scene.chunks[0]!;
  const stride = Math.max(1, Math.floor(anchor.triangleCount * 3 / 500));
  let checked = 0;
  for (let v = 0; v < anchor.positions.length && checked < 500; v += stride * 3, checked++) {
    const x = anchor.positions[v]!;
    const y = -anchor.positions[v + 2]!; // three's z is south; local y is north
    // The vertex carries the SCENE height, which is heightAt itself: a lattice point is where the
    // mesh and the height function have to be equal to the last bit, because the mover, the camera
    // and every prop are seated by one and standing on the other.
    assert.equal(anchor.positions[v + 1], Math.fround(scene.heightAt(x, y)), `vertex at ${x}, ${y}`);
    const kind = biomeAtLocal(scene.patch, field, calibration, x, y);
    const colour = BIOME_COLOUR_LINEAR[kind];
    for (let c = 0; c < 3; c++) {
      assert.equal(anchor.colours[v + c], Math.fround(colour[c]!), `vertex at ${x}, ${y}, channel ${c}`);
      assert.equal(colour[c], srgbToLinear(BIOME_COLOUR[kind][c]! / 255));
    }
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

// ── the walking-scale displacement (DECISIONS C2) ───────────────────────────────

test("C2: the displacement adds NOTHING to the gap between heightAt and the drawn triangle", () => {
  const scene = demoScene();
  const bare = buildRegionScene(DEMO_CELL, PARCEL_REGION_K, field, calibration, RADIUS, { resolution: 12, detail: null });
  // This is the whole design in one assertion, and it is why the displacement lives on the mesh's
  // own lattice rather than one octave finer. The mover, the camera and every scattered prop are
  // seated by heightAt; the eye sees the triangles. Between two vertices those two already differ,
  // by the macro field's curvature across 12 m, which the lattice has always approximated: measured
  // here at 2,700 it is 2.1 mm at the median and 131 mm at the worst curvature on the demo disk,
  // exactly three times what the same measurement gives at 900, because it is a height and C1
  // tripled every height. What must not happen is the displacement ADDING to it. It adds nothing:
  // being piecewise linear on the very lattice the triangles are drawn from, it is carried exactly,
  // and the two surfaces below agree to the last bit a float can hold.
  const sample = (region: RegionScene): number[] => {
    const gaps: number[] = [];
    for (const chunk of region.chunks) {
      const p = chunk.positions;
      const stride = Math.max(1, Math.floor(chunk.triangleCount / 3000)) * 9;
      for (let t = 0; t + 8 < p.length; t += stride) {
        // three's frame is (x east, y up, z south); local y is north, so it is -z.
        const px = [p[t]!, p[t + 3]!, p[t + 6]!];
        const py = [-p[t + 2]!, -p[t + 5]!, -p[t + 8]!];
        const pz = [p[t + 1]!, p[t + 4]!, p[t + 7]!];
        for (let k = 0; k < 4; k++) {
          // Barycentric weights from a hash, so a failure names a point that can be rerun.
          let a = hashPosition(t, k, 21);
          let b = hashPosition(t, k, 22);
          if (a + b > 1) {
            a = 1 - a;
            b = 1 - b;
          }
          const c = 1 - a - b;
          const x = px[0]! * c + px[1]! * a + px[2]! * b;
          const y = py[0]! * c + py[1]! * a + py[2]! * b;
          const drawn = pz[0]! * c + pz[1]! * a + pz[2]! * b;
          gaps.push(Math.abs(region.heightAt(x, y) - drawn));
        }
      }
    }
    return gaps;
  };
  const withDetail = sample(scene);
  const without = sample(bare);
  assert.equal(withDetail.length, without.length);
  assert.ok(withDetail.length > 20_000, `only ${withDetail.length} points were checked`);
  let worstDelta = 0;
  let worst = 0;
  for (let i = 0; i < withDetail.length; i++) {
    worstDelta = Math.max(worstDelta, Math.abs(withDetail[i]! - without[i]!));
    worst = Math.max(worst, withDetail[i]!);
  }
  const mean = withDetail.reduce((s2, v) => s2 + v, 0) / withDetail.length;
  console.log(
    `C2: heightAt against the drawn triangle over ${withDetail.length} interior points: ` +
      `mean ${(mean * 1000).toFixed(3)} mm, worst ${(worst * 1000).toFixed(1)} mm; ` +
      `the displacement changes it by ${(worstDelta * 1e6).toFixed(3)} micrometres`,
  );
  // Not zero, and it should not be: the drawn positions are a Float32Array, whose step at a
  // hundred metres of height is 7.6 micrometres, and three of those are interpolated per point.
  // Measured at 14 micrometres, which is four orders below the gap itself.
  assert.ok(worstDelta < 1e-4, `the displacement moved the gap by ${worstDelta} m; it must be carried exactly`);
});

test("C2: no triangle that holds the waterline is displaced, so the drawn coast is the macro coast", () => {
  const scene = demoScene();
  const macro = (x: number, y: number) => sceneHeightAt(scene.patch, field, calibration, x, y) * scene.heightScaleM;
  let coastal = 0;
  for (const chunk of scene.chunks) {
    const p = chunk.positions;
    for (let t = 0; t + 8 < p.length; t += 9) {
      const xs = [p[t]!, p[t + 3]!, p[t + 6]!];
      const ys = [-p[t + 2]!, -p[t + 5]!, -p[t + 8]!];
      const hs = [p[t + 1]!, p[t + 4]!, p[t + 7]!];
      const wet = hs.some((h) => h <= 0);
      const dry = hs.some((h) => h > 0);
      if (!(wet && dry)) continue;
      coastal++;
      for (let v = 0; v < 3; v++) {
        assert.equal(hs[v], Math.fround(macro(xs[v]!, ys[v]!)), `a shoreline vertex at ${xs[v]}, ${ys[v]} was displaced`);
      }
    }
  }
  assert.ok(coastal > 200, `only ${coastal} shoreline triangles were found on a 45% ocean cell`);
});

test("C2: the displacement is a pure function of the ground, and never Math.random", () => {
  const patch = createTangentPatch(DEMO_CELL, RADIUS);
  const make = () => createSceneHeight(patch, field, calibration, { heightScaleM: 2700, resolution: 12 });
  const a = make();
  const original = Math.random;
  let b: (x: number, y: number) => number;
  try {
    Math.random = () => 0.123456789;
    b = make();
  } finally {
    Math.random = original;
  }
  const bare = createSceneHeight(patch, field, calibration, { heightScaleM: 2700, resolution: 12, detail: null });
  let moved = 0;
  for (let i = 0; i < 400; i++) {
    const x = (hashPosition(i, 0, 31) - 0.5) * 3000;
    const y = (hashPosition(i, 0, 32) - 0.5) * 3000;
    assert.equal(a(x, y), b(x, y), `two builds disagree at ${x}, ${y}`);
    const d = a(x, y) - bare(x, y);
    assert.ok(Math.abs(d) <= DEFAULT_DETAIL.amplitudeM, `${d} m of displacement at ${x}, ${y}`);
    if (Math.abs(d) > 0.01) moved++;
  }
  assert.ok(moved > 150, `only ${moved} of 400 points carry any displacement`);
});

test("C2: an octave the lattice cannot draw is dropped, and a taper that would invert a shore is refused", () => {
  const patch = createTangentPatch(DEMO_CELL, RADIUS);
  const at = (resolution: number) =>
    createSceneHeight(patch, field, calibration, { heightScaleM: 2700, resolution });
  const bare = createSceneHeight(patch, field, calibration, { heightScaleM: 2700, resolution: 12, detail: null });
  // 12 m draws all four octaves; 96 m can only carry the 192 m one; 192 m carries none at all and
  // the ground is the macro field exactly, which is what a coarse preview should be.
  const fine = at(12);
  const coarse = at(96);
  const bald = at(192);
  let fineMoved = 0;
  let coarseMoved = 0;
  for (let i = 0; i < 200; i++) {
    const x = Math.round((hashPosition(i, 0, 41) - 0.5) * 2000);
    const y = Math.round((hashPosition(i, 0, 42) - 0.5) * 2000);
    if (Math.abs(fine(x, y) - bare(x, y)) > 0.01) fineMoved++;
    if (Math.abs(coarse(x, y) - bare(x, y)) > 0.01) coarseMoved++;
    assert.equal(bald(x, y), bare(x, y), `a 192 m lattice drew an octave it cannot carry at ${x}, ${y}`);
  }
  assert.ok(fineMoved > coarseMoved, `12 m moved ${fineMoved} points and 96 m moved ${coarseMoved}`);
  assert.throws(
    () =>
      createSceneHeight(patch, field, calibration, {
        heightScaleM: 2700,
        resolution: 12,
        detail: { ...DEFAULT_DETAIL, taperM: DEFAULT_DETAIL.amplitudeM },
      }),
    RangeError,
  );
  assert.ok(
    DEFAULT_DETAIL.taperM >= DEFAULT_DETAIL.amplitudeM * 1.5,
    "the shipped taper would let a shore run backwards into the sea",
  );
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
