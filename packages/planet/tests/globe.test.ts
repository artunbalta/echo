/**
 * The globe as geometry (section 6.1). Build order step 4.
 *
 * The three claims section 6.1 makes that are cheap to believe and expensive to be wrong about:
 * one mesh rather than one per parcel, state changes that never rebuild geometry, and picking that
 * is a raycast against a plain sphere plus arithmetic. Each gets a test.
 *
 * Run:  node --import tsx --test packages/planet/tests/globe.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToBoundary, cellToChildren, cellToLatLng, cellToParent, getResolution, isPentagon, latLngToCell } from "h3-js";

import { cellAreaKm2, cellCountAtResolution, type Vec3 } from "../lib/geo.js";
import {
  DEFAULT_GLOBE_OPTIONS,
  buildGlobeGeometry,
  buildParcelMesh,
  paintParcel,
  setParcelExtrusion,
  buildIcosphere,
  buildParcelOutlines,
  createRegistryIndex,
  globeHeightAt,
  paintCell,
  paintTerrain,
  setCellExtrusion,
} from "../lib/globe.js";
import { seedInventory } from "../lib/rounds.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";

const field = createTerrain("echo-planet-1");
const calibration = calibratePlanet(field, 0.6, 60_000);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the icosphere is a closed sphere with the vertex count the subdivision implies", () => {
  for (let n = 0; n <= 5; n++) {
    const sphere = buildIcosphere(n);
    const faces = 20 * Math.pow(4, n);
    assert.equal(sphere.vertexCount, 10 * Math.pow(4, n) + 2, `subdivision ${n}`);
    assert.equal(sphere.indices.length / 3, faces);

    // Every vertex sits on the unit sphere, which is what makes the direction array usable as a
    // terrain sampling position without a normalise on every read.
    for (let i = 0; i < sphere.vertexCount; i++) {
      const r = Math.hypot(sphere.directions[i * 3]!, sphere.directions[i * 3 + 1]!, sphere.directions[i * 3 + 2]!);
      assert.ok(Math.abs(r - 1) < 1e-6, `vertex ${i} has radius ${r}`);
    }

    // Closed and manifold: every edge is shared by exactly two faces, and Euler holds.
    const edges = new Map<string, number>();
    for (let f = 0; f < sphere.indices.length; f += 3) {
      const tri = [sphere.indices[f]!, sphere.indices[f + 1]!, sphere.indices[f + 2]!];
      assert.equal(new Set(tri).size, 3, "a face collapsed to a line");
      for (let k = 0; k < 3; k++) {
        const a = tri[k]!;
        const b = tri[(k + 1) % 3]!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [key, uses] of edges) assert.equal(uses, 2, `edge ${key} is used ${uses} times`);
    assert.equal(sphere.vertexCount - edges.size + faces, 2, "Euler characteristic is not 2");
  }

  assert.throws(() => buildIcosphere(-1), RangeError);
  assert.throws(() => buildIcosphere(2.5), RangeError);
});

test("picking walks up a mixed resolution registry and lands on the parcel containing the point", () => {
  // The registry that actually exists after a subdivision round: mostly coarse, with some parcels
  // already split. A picker that assumed one resolution would be right most of the time, which is
  // the worst way to be wrong.
  const coarse = seedInventory(1, 1);
  const registryCells = [...coarse.slice(40)];
  for (const cell of coarse.slice(0, 40)) registryCells.push(...cellToChildren(cell, 3));
  const index = createRegistryIndex(registryCells);

  assert.equal(index.coarsestResolution, 1);
  assert.equal(index.finestResolution, 3);

  const random = mulberry32(0x9c1);
  let hits = 0;
  let misses = 0;
  for (let i = 0; i < 4000; i++) {
    // Uniform over AREA, so the sample is not piled up at the poles.
    const lat = (Math.asin(random() * 2 - 1) * 180) / Math.PI;
    const lng = random() * 360 - 180;
    const picked = index.pick(lat, lng);
    const finest = latLngToCell(lat, lng, index.finestResolution);

    if (picked === null) {
      // The only thing this registry does not cover is the reserved commons, so a miss must be
      // inside one of the twelve pentagons and nowhere else.
      misses++;
      assert.ok(isPentagon(cellToParent(finest, 1)), `point ${lat},${lng} missed outside the commons`);
      continue;
    }
    hits++;

    assert.ok(index.cells.has(picked), `${picked} is not in the registry`);
    // The point really is inside the parcel that was returned: its finest cell descends from it.
    assert.equal(cellToParent(finest, getResolution(picked)), picked, `point ${lat},${lng} is not inside ${picked}`);
  }

  // Hits plus commons misses account for every sample, and the miss rate is the commons area.
  assert.equal(hits + misses, 4000);
  const commonsShare = misses / 4000;
  assert.ok(commonsShare > 0.003 && commonsShare < 0.015, `commons measured at ${commonsShare}, expected about 0.0077`);

  // A registry that covers nothing returns null rather than guessing.
  assert.equal(createRegistryIndex([]).pick(0, 0), null);

  // And a registry holding one parcel answers for that parcel and nothing else.
  const one = coarse[0]!;
  const sparse = createRegistryIndex([one]);
  const [clat, clng] = cellToLatLng(one);
  assert.equal(sparse.pick(clat, clng), one);
  assert.equal(sparse.pick(-clat, clng + 180), null);
});

test("the whole planet is one mesh, and every vertex knows which parcel it is in", () => {
  const registry = createRegistryIndex(seedInventory(1, 1));
  const geo = buildGlobeGeometry(field, calibration, registry, { subdivisions: 5 });

  assert.equal(geo.vertexCount, 10 * Math.pow(4, 5) + 2);
  assert.equal(geo.positions.length, geo.vertexCount * 3);
  assert.equal(geo.normals.length, geo.vertexCount * 3);

  // Every vertex belongs to a parcel, except where the reserved commons is, which the registry
  // deliberately does not cover.
  let uncovered = 0;
  for (let i = 0; i < geo.vertexCount; i++) if (geo.vertexCell[i] === -1) uncovered++;
  assert.ok(uncovered > 0, "the twelve pentagon commons should not be registry parcels");
  assert.ok(uncovered / geo.vertexCount < 0.02, `${uncovered} vertices uncovered, expected about 0.8%`);

  // The heights stored are the heights the globe path computes, with no second implementation.
  for (let i = 0; i < geo.vertexCount; i += 37) {
    const d: Vec3 = [geo.directions[i * 3]!, geo.directions[i * 3 + 1]!, geo.directions[i * 3 + 2]!];
    assert.ok(Math.abs(geo.heights[i]! - globeHeightAt(field, calibration, d)) < 1e-6);
  }

  // Displacement lifts land and leaves water at the sphere's own radius.
  for (let i = 0; i < geo.vertexCount; i++) {
    const r = Math.hypot(geo.positions[i * 3]!, geo.positions[i * 3 + 1]!, geo.positions[i * 3 + 2]!);
    const expected = 1 + DEFAULT_GLOBE_OPTIONS.reliefScale * Math.max(0, geo.heights[i]!);
    assert.ok(Math.abs(r - expected) < 1e-5, `vertex ${i} sits at ${r}, expected ${expected}`);
  }

  // The per parcel vertex lists partition the covered vertices exactly once.
  assert.equal(geo.offsets.length, geo.cells.length + 1);
  assert.equal(geo.cellVertices.length, geo.vertexCount - uncovered);
  const seen = new Set<number>();
  for (const v of geo.cellVertices) {
    assert.ok(!seen.has(v), `vertex ${v} is listed under two parcels`);
    seen.add(v);
  }
});

test("claiming a parcel rewrites that parcel's vertices and nothing else", () => {
  const registry = createRegistryIndex(seedInventory(1, 1));
  const geo = buildGlobeGeometry(field, calibration, registry, { subdivisions: 5 });

  const colours = new Float32Array(geo.vertexCount * 3);
  paintTerrain(geo, colours);
  const before = colours.slice();

  // A parcel that actually has vertices at this subdivision.
  const cell = geo.cells.find((c) => {
    const i = geo.cellIndex.get(c)!;
    return geo.offsets[i + 1]! - geo.offsets[i]! >= 4;
  })!;
  const index = geo.cellIndex.get(cell)!;
  const owned = new Set<number>();
  for (let k = geo.offsets[index]!; k < geo.offsets[index + 1]!; k++) owned.add(geo.cellVertices[k]!);

  const touched = paintCell(geo, cell, [255, 0, 128], colours);
  assert.equal(touched, owned.size);

  for (let v = 0; v < geo.vertexCount; v++) {
    const changed = colours[v * 3] !== before[v * 3] || colours[v * 3 + 1] !== before[v * 3 + 1];
    assert.equal(changed, owned.has(v), `vertex ${v} changed when it should not have`);
  }

  // Handing it back restores the terrain colour exactly, byte for byte.
  paintCell(geo, cell, null, colours);
  assert.deepEqual(colours, before);

  // An unknown cell is a no-op rather than a crash: subdivision rounds retire ids.
  assert.equal(paintCell(geo, "8f2830828052d25", [1, 2, 3], colours), 0);
});

test("an assigned parcel stands proud of the surface, and lies back down again", () => {
  const registry = createRegistryIndex(seedInventory(1, 1));
  const geo = buildGlobeGeometry(field, calibration, registry, { subdivisions: 5 });
  const before = geo.positions.slice();

  const cell = geo.cells.find((c) => {
    const i = geo.cellIndex.get(c)!;
    return geo.offsets[i + 1]! - geo.offsets[i]! >= 4;
  })!;
  const index = geo.cellIndex.get(cell)!;

  setCellExtrusion(geo, cell, true);
  for (let k = geo.offsets[index]!; k < geo.offsets[index + 1]!; k++) {
    const v = geo.cellVertices[k]!;
    const was = Math.hypot(before[v * 3]!, before[v * 3 + 1]!, before[v * 3 + 2]!);
    const now = Math.hypot(geo.positions[v * 3]!, geo.positions[v * 3 + 1]!, geo.positions[v * 3 + 2]!);
    assert.ok(
      Math.abs(now - was - DEFAULT_GLOBE_OPTIONS.assignedExtrusion) < 1e-5,
      `vertex ${v} rose by ${now - was}`,
    );
  }

  setCellExtrusion(geo, cell, false);
  for (let i = 0; i < geo.positions.length; i++) {
    assert.ok(Math.abs(geo.positions[i]! - before[i]!) < 1e-6, `position ${i} did not return`);
  }
});

test("every parcel gets a closed outline, drawn above the terrain it crosses", () => {
  const cells = seedInventory(1, 1).slice(0, 60);
  const outlines = buildParcelOutlines(cells, field, calibration);

  const expected = cells.reduce((sum, c) => sum + cellToBoundary(c).length, 0);
  assert.equal(outlines.segmentCount, expected);
  assert.equal(outlines.positions.length, expected * 6);

  // Every outline point clears the surface it sits on, so a boundary running over a ridge stays
  // visible rather than sinking into it.
  for (let s = 0; s < outlines.segmentCount; s++) {
    for (const at of [0, 3]) {
      const o = s * 6 + at;
      const r = Math.hypot(outlines.positions[o]!, outlines.positions[o + 1]!, outlines.positions[o + 2]!);
      assert.ok(r > 1, `outline point sits at radius ${r}`);
      assert.ok(r < 1 + DEFAULT_GLOBE_OPTIONS.reliefScale * 1.1, `outline point flew off at ${r}`);
    }
  }

  // The resolution table still holds for the set the outlines were built from.
  assert.equal(seedInventory(1, 1).length + 12, cellCountAtResolution(1));
});

test("the parcel mesh is built from the cell boundaries, so a parcel is exactly its own shape", () => {
  const cells = seedInventory(1, 1).slice(0, 120);

  for (const relief of [0, 1, 2]) {
    const mesh = buildParcelMesh(cells, field, calibration, { reliefSubdivisions: relief });
    const expected = cells.reduce((sum, c) => sum + cellToBoundary(c).length * Math.pow(4, relief), 0);
    assert.equal(mesh.triangleCount, expected, `relief ${relief}`);
    assert.equal(mesh.positions.length, expected * 9);

    // The triangle ranges partition the mesh with no gap and no overlap.
    assert.equal(mesh.triangleOffsets[0], 0);
    assert.equal(mesh.triangleOffsets[cells.length], mesh.triangleCount);
    for (let c = 1; c <= cells.length; c++) {
      assert.ok(mesh.triangleOffsets[c]! > mesh.triangleOffsets[c - 1]!, "a parcel produced no triangles");
    }

    // Every vertex sits on the terrain surface, between sea level and the highest relief.
    for (let o = 0; o < mesh.positions.length; o += 3) {
      const r = Math.hypot(mesh.positions[o]!, mesh.positions[o + 1]!, mesh.positions[o + 2]!);
      assert.ok(r >= 1 - 1e-6 && r <= 1 + DEFAULT_GLOBE_OPTIONS.reliefScale + 1e-6, `vertex at radius ${r}`);
    }
  }
});

test("the parcel mesh converges on the true area of the parcels as relief is subdivided", () => {
  // A flat triangle spanning a curved cell always undercounts area. Subdividing the fan on the
  // sphere must close that gap, which is the check that the fan is being placed on the sphere and
  // not merely interpolated in space.
  const cells = seedInventory(1, 1);
  const trueArea = cells.reduce((sum, c) => sum + cellAreaKm2(c, 200), 0);

  const meshArea = (relief: number): number => {
    const mesh = buildParcelMesh(cells, field, calibration, { reliefSubdivisions: relief, reliefScale: 0 });
    let total = 0;
    for (let t = 0; t < mesh.triangleCount; t++) {
      const o = t * 9;
      const ux = mesh.positions[o + 3]! - mesh.positions[o]!;
      const uy = mesh.positions[o + 4]! - mesh.positions[o + 1]!;
      const uz = mesh.positions[o + 5]! - mesh.positions[o + 2]!;
      const vx = mesh.positions[o + 6]! - mesh.positions[o]!;
      const vy = mesh.positions[o + 7]! - mesh.positions[o + 1]!;
      const vz = mesh.positions[o + 8]! - mesh.positions[o + 2]!;
      total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    return total * 200 * 200;
  };

  const coarse = meshArea(0);
  const fine = meshArea(2);
  assert.ok(coarse < trueArea, "flat fans cannot exceed the curved area they approximate");
  assert.ok(fine > coarse, "subdividing did not close the gap");
  assert.ok(Math.abs(fine - trueArea) / trueArea < 0.01, `mesh area was off by ${(fine / trueArea - 1) * 100}%`);
});

test("painting and extruding a parcel touches that parcel's triangles only", () => {
  const cells = seedInventory(1, 1).slice(0, 60);
  const mesh = buildParcelMesh(cells, field, calibration, { reliefSubdivisions: 1 });
  const beforeColours = mesh.colours.slice();
  const beforePositions = mesh.positions.slice();

  const cell = cells[7]!;
  const index = mesh.cellIndex.get(cell)!;
  const from = mesh.triangleOffsets[index]! * 9;
  const to = mesh.triangleOffsets[index + 1]! * 9;

  // The buffer is Float32, so the expected value has to be rounded the same way it is stored.
  const target: readonly number[] = [255, 0, 128].map((v) => Math.fround(v / 255));
  assert.equal(paintParcel(mesh, cell, [255, 0, 128]), (to - from) / 9);
  for (let o = 0; o < mesh.colours.length; o++) {
    if (o >= from && o < to) {
      assert.equal(mesh.colours[o], target[o % 3], `float ${o} inside the parcel was not painted`);
    } else {
      assert.equal(mesh.colours[o], beforeColours[o], `float ${o} outside the parcel changed`);
    }
  }
  paintParcel(mesh, cell, null);
  assert.deepEqual(mesh.colours, beforeColours);

  setParcelExtrusion(mesh, cell, true);
  for (let o = 0; o < mesh.positions.length; o += 3) {
    const was = Math.hypot(beforePositions[o]!, beforePositions[o + 1]!, beforePositions[o + 2]!);
    const now = Math.hypot(mesh.positions[o]!, mesh.positions[o + 1]!, mesh.positions[o + 2]!);
    const expected = o >= from && o < to ? DEFAULT_GLOBE_OPTIONS.assignedExtrusion : 0;
    assert.ok(Math.abs(now - was - expected) < 1e-6, `vertex ${o} moved by ${now - was}`);
  }
  setParcelExtrusion(mesh, cell, false);
  for (let o = 0; o < mesh.positions.length; o++) {
    assert.ok(Math.abs(mesh.positions[o]! - beforePositions[o]!) < 1e-6, `position ${o} did not return`);
  }

  assert.equal(paintParcel(mesh, "8f2830828052d25", [1, 2, 3]), 0);
  assert.equal(setParcelExtrusion(mesh, "8f2830828052d25", true), 0);
});
