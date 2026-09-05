/**
 * The globe as geometry (section 6.1). Build order step 4.
 *
 * The three claims section 6.1 makes that are cheap to believe and expensive to be wrong about:
 * one mesh rather than one per parcel, state changes that never rebuild geometry, and picking that
 * is a raycast plus arithmetic. Each gets a test.
 *
 * Section 6.1 said the raycast was against "a plain unit sphere", and that sentence shipped as a
 * bug: the planet is DRAWN displaced by relief, so the sphere and the ground are two different
 * surfaces and a pick answered with a cell a median 0.264 degrees from the one under the cursor,
 * on a parcel 0.40 degrees wide. What holds the repair here is that raycastGlobe lands on the
 * surface globeRadiusAt describes; what holds it against the pixels a person sees is
 * apps/web/tests/e2e/globePick.spec.ts, which raycasts the mesh the GPU drew.
 *
 * Run:  node --import tsx --test packages/planet/tests/globe.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToBoundary, cellToChildren, cellToLatLng, cellToParent, getResolution, isPentagon, latLngToCell } from "h3-js";

import { cellAreaKm2, cellCountAtResolution, latLngToVec3, type Vec3 } from "../lib/geo.js";
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
  globeRadius,
  globeRadiusAt,
  paintCell,
  raycastGlobe,
  paintTerrain,
  setCellExtrusion,
} from "../lib/globe.js";
import { seedInventory } from "../lib/rounds.js";
import { BIOME_COLOUR, BIOME_COLOUR_LINEAR, BIOMES, calibratePlanet, createTerrain, linearRgb, srgbToLinear } from "../lib/terrain.js";

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

test("every parcel gets a closed outline, drawn just above the terrain it crosses and nowhere else", () => {
  const cells = seedInventory(1, 1).slice(0, 60);
  const outlines = buildParcelOutlines(cells, field, calibration);

  // How many pieces each edge should have come out as, from the cell's own geometry rather than
  // from the builder: the chord between two boundary points over the longest piece allowed.
  const partsOf = (cell: string): number[] => {
    const ring = cellToBoundary(cell).map(([lat, lng]) => latLngToVec3(lat, lng));
    return ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      return Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / DEFAULT_GLOBE_OPTIONS.outlineSegmentArc));
    });
  };
  const perCell = cells.map(partsOf);
  const expected = perCell.reduce((sum, parts) => sum + parts.reduce((a, b) => a + b, 0), 0);
  assert.equal(outlines.segmentCount, expected);
  assert.equal(outlines.positions.length, expected * 6);
  assert.ok(perCell[0]!.every((n) => n > 1), "a resolution 1 edge came out as a single straight piece");
  // Where the last piece of one edge ends, so the join check below knows which segments are joins.
  const edgeEnds = new Set<number>();
  let at = 0;
  for (const parts of perCell) {
    for (const n of parts) {
      at += n;
      edgeEnds.add(at - 1);
    }
  }

  // EVERY point sits exactly outlineLift above the ground beneath it, not above a sphere. The old
  // outline was lifted 0.0075 of the radius, 1.5 km, and a ring that high is seen from off to one
  // side: it landed up to three parcels away from the land it was drawn to name.
  let worst = 0;
  let worstDip = 0;
  let joins = 0;
  for (let s = 0; s < outlines.segmentCount; s++) {
    for (const at of [0, 3]) {
      const o = s * 6 + at;
      const p: Vec3 = [outlines.positions[o]!, outlines.positions[o + 1]!, outlines.positions[o + 2]!];
      const r = Math.hypot(p[0], p[1], p[2]);
      const ground = globeRadiusAt(field, calibration, [p[0] / r, p[1] / r, p[2] / r]);
      worst = Math.max(worst, Math.abs(r - ground - DEFAULT_GLOBE_OPTIONS.outlineLift));
    }
    // And the pieces FOLLOW the ground rather than cutting under it: the midpoint of each drawn
    // chord, against the surface below it. A resolution 4 edge drawn as one straight line dives up
    // to 81 m under its own terrain, and a resolution 1 edge, which is what these cells are, is
    // sixteen times longer.
    const o = s * 6;
    const mid: Vec3 = [
      (outlines.positions[o]! + outlines.positions[o + 3]!) / 2,
      (outlines.positions[o + 1]! + outlines.positions[o + 4]!) / 2,
      (outlines.positions[o + 2]! + outlines.positions[o + 5]!) / 2,
    ];
    const midLength = Math.hypot(mid[0], mid[1], mid[2]);
    const under = globeRadiusAt(field, calibration, [mid[0] / midLength, mid[1] / midLength, mid[2] / midLength]) - midLength;
    worstDip = Math.max(worstDip, under);

    // The polyline is continuous: each piece starts where the last one ended.
    if (s > 0 && !edgeEnds.has(s - 1)) {
      const a = (s - 1) * 6 + 3;
      const b = s * 6;
      const step = Math.hypot(
        outlines.positions[a]! - outlines.positions[b]!,
        outlines.positions[a + 1]! - outlines.positions[b + 1]!,
        outlines.positions[a + 2]! - outlines.positions[b + 2]!,
      );
      assert.ok(step < 1e-6, `outline piece ${s} starts ${step} from where the last one ended`);
      joins++;
    }
  }
  assert.ok(joins > 0, "no joins were checked, so outlineSegmentArc is not doing anything");
  // Not "a small number": NEVER under the ground. The lift is 120 m and the deepest a drawn piece
  // dips below the terrain it spans is 10.9 m on these resolution 1 edges, so 9% of the lift is
  // spent on the line's own straightness and the rest is left to clear the drawn mesh.
  assert.ok(worstDip <= 0, `an outline piece is drawn ${(worstDip * 200_000).toFixed(1)} m under the ground it crosses`);

  // The negative control, because a zero is worth nothing until it has been watched moving. At
  // eight times the piece length the same measurement on the same cells goes positive: the line
  // goes under the mountain, which is what outlineSegmentArc is set the way it is to prevent.
  const coarse = buildParcelOutlines(cells, field, calibration, {
    outlineSegmentArc: DEFAULT_GLOBE_OPTIONS.outlineSegmentArc * 8,
  });
  let coarsest = 0;
  for (let s = 0; s < coarse.segmentCount; s++) {
    const o = s * 6;
    const mid: Vec3 = [
      (coarse.positions[o]! + coarse.positions[o + 3]!) / 2,
      (coarse.positions[o + 1]! + coarse.positions[o + 4]!) / 2,
      (coarse.positions[o + 2]! + coarse.positions[o + 5]!) / 2,
    ];
    const length = Math.hypot(mid[0], mid[1], mid[2]);
    coarsest = Math.max(
      coarsest,
      globeRadiusAt(field, calibration, [mid[0] / length, mid[1] / length, mid[2] / length]) - length,
    );
  }
  assert.ok(coarsest > 0, "eight times the piece length buries nothing, so this measurement cannot fail");
  // Float32 keeps about seven digits of a number near 1, so a point at 1.0006 quantises to 6e-8.
  assert.ok(worst < 1e-6, `an outline point stands ${worst} off the ground it names`);

  // The resolution table still holds for the set the outlines were built from.
  assert.equal(seedInventory(1, 1).length + 12, cellCountAtResolution(1));
});

/**
 * The lift a marker or a line is given is a LENGTH ON A PLANET, and this is what it costs.
 *
 * A ring lifted by `dr` and seen from outside is not over the ground it names: for a ray passing
 * `b` from the centre the apparent shift is `psi(1 + dr) - psi(1)` with `psi(R) = acos(b/R)`, which
 * is the same identity the pick bug was made of. This holds the number down where the geometry
 * says it has to be, so nobody restores a kilometre of lift because a line looked thin.
 */
/**
 * The repair for bug 1, at the level the shared library can hold it: the pick's ray meets the
 * surface the globe DRAWS, and that surface is not a unit sphere.
 *
 * The expectation is not taken from raycastGlobe. Where the hit lands is checked against the two
 * things that define the answer independently of it: the ray it was cast along, and globeRadiusAt,
 * which is the expression buildGlobeGeometry displaces every vertex by.
 */
test("raycastGlobe lands on the surface the globe draws, on the ray, on the near side", () => {
  const random = mulberry32(20260904);
  // The hero's own camera: 4.35 radii out, looking at the middle of the planet.
  const origin: Vec3 = [0, 0.22, 4.35];
  let hits = 0;
  let worstRadius = 0;
  let worstOffRay = 0;
  let againstUnitSphere = 0;
  const gaps: number[] = [];

  for (let i = 0; i < 400; i++) {
    // A point in the disk, and the ray from the camera through it.
    const b = Math.sqrt(random()) * 1.02;
    const phi = random() * Math.PI * 2;
    const ray: Vec3 = [b * Math.cos(phi) - origin[0], b * Math.sin(phi) - origin[1], -origin[2]];
    const hit = raycastGlobe(field, calibration, origin, ray);
    if (!hit) continue;
    hits++;

    // 1. It is on the surface globeRadiusAt describes, to the solver's own tolerance: the bisection
    //    stops at 1e-6 radians of arc and the surface climbs as it goes, so the residual is that
    //    times the slope. 1e-4 of the radius is 20 m of ground on a 200 km planet.
    worstRadius = Math.max(worstRadius, Math.abs(hit.radius - globeRadiusAt(field, calibration, hit.direction)));

    // 2. It is on the ray, at the distance reported, and in front of the camera.
    const length = Math.hypot(ray[0], ray[1], ray[2]);
    for (let k = 0; k < 3; k++) {
      const along = origin[k]! + (ray[k]! / length) * hit.distance;
      worstOffRay = Math.max(worstOffRay, Math.abs(along - hit.direction[k]! * hit.radius));
    }
    assert.ok(hit.distance > 0, `the hit is ${hit.distance} along the ray, which is behind the camera`);

    // 3. It is not where a unit sphere would have said. That IS the bug, so this test has to be
    //    able to tell the two apart, and the size of the difference is the size of the complaint.
    const toCentre = -(origin[0] * ray[0] + origin[1] * ray[1] + origin[2] * ray[2]) / (length * length);
    const closest: Vec3 = [
      origin[0] + ray[0] * toCentre,
      origin[1] + ray[1] * toCentre,
      origin[2] + ray[2] * toCentre,
    ];
    const impact = Math.hypot(closest[0], closest[1], closest[2]);
    if (impact >= 1) continue;
    const back = Math.sqrt(1 - impact * impact) / length;
    const onSphere: Vec3 = [
      origin[0] + ray[0] * (toCentre - back),
      origin[1] + ray[1] * (toCentre - back),
      origin[2] + ray[2] * (toCentre - back),
    ];
    const unit = Math.hypot(onSphere[0], onSphere[1], onSphere[2]);
    const dot = Math.min(
      1,
      (onSphere[0] / unit) * hit.direction[0] + (onSphere[1] / unit) * hit.direction[1] + (onSphere[2] / unit) * hit.direction[2],
    );
    const gap = (Math.acos(dot) * 180) / Math.PI;
    gaps.push(gap);
    if (gap > 0.1) againstUnitSphere++;
  }

  assert.ok(hits > 300, `only ${hits} of 400 rays into the planet found it`);
  assert.ok(worstRadius < 1e-4, `a hit sits ${worstRadius} off the drawn surface`);
  assert.ok(worstOffRay < 1e-12, `a hit sits ${worstOffRay} off the ray it was cast along`);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  // The two surfaces really are different, and a test that could not tell them apart would be no
  // test at all. On the shipped page the same measurement came to a median 0.264 degrees.
  assert.ok(median > 0.05, `the drawn surface and a unit sphere answer the same rays: median gap ${median}`);
  assert.ok(againstUnitSphere > gaps.length / 4, `only ${againstUnitSphere} of ${gaps.length} rays are more than 0.1 degrees apart`);
});

test("raycastGlobe misses what the globe does not cover, and is a pure function of its inputs", () => {
  const origin: Vec3 = [0, 0, 4.35];
  // Aimed past the planet. A ray from a camera at distance D through a point q from the centre in
  // the plane z = 0 passes D*q/hypot(q, D) from the centre, so this is the q that puts the ray
  // just outside the relief shell, whatever the terrain happens to do there.
  const shell = 1 + DEFAULT_GLOBE_OPTIONS.reliefScale;
  const wanted = shell + 1e-6;
  const q = (wanted * 4.35) / Math.sqrt(4.35 * 4.35 - wanted * wanted);
  assert.equal(raycastGlobe(field, calibration, origin, [q, 0, -4.35]), null, "a ray outside the relief shell hit something");
  // The negative control, so "miss" is not simply what this function always says. Nothing is drawn
  // BELOW radius 1, so any ray passing inside the unit sphere has to cross the surface, whatever
  // the terrain does: that is a theorem about globeRadius and not a fact about this seed.
  const inside = 1 - 1e-4;
  const qIn = (inside * 4.35) / Math.sqrt(4.35 * 4.35 - inside * inside);
  const near = raycastGlobe(field, calibration, origin, [qIn, 0, -4.35]);
  assert.ok(near, "a ray passing inside the unit sphere missed the planet");
  assert.ok(near.radius >= 1, `a hit came back at radius ${near.radius}, under the sphere the sea sits on`);
  // Aimed away from it.
  assert.equal(raycastGlobe(field, calibration, origin, [0, 0, 1]), null, "a ray pointing away from the planet hit it");
  // Straight through the middle, which has no plane of its own and is written out separately.
  const centre = raycastGlobe(field, calibration, origin, [0, 0, -1]);
  assert.ok(centre, "a ray straight at the planet's centre missed it");
  assert.ok(Math.abs(centre.direction[2] - 1) < 1e-12, `the centre hit came back facing ${centre.direction.join(", ")}`);
  assert.ok(Math.abs(centre.radius - globeRadiusAt(field, calibration, [0, 0, 1])) < 1e-12);
  // The NEAR side, not the far one: 4.35 out minus the radius, and not 4.35 plus it.
  assert.ok(Math.abs(centre.distance - (4.35 - centre.radius)) < 1e-12, `the centre hit is ${centre.distance} away`);

  const a = raycastGlobe(field, calibration, origin, [0.3, 0.1, -4.35]);
  const b = raycastGlobe(field, calibration, origin, [0.3, 0.1, -4.35]);
  assert.deepEqual(a, b, "two identical rays got two different answers");
});

test("globeRadius is the one expression every part of the globe is displaced by", () => {
  const geo = buildGlobeGeometry(field, calibration, createRegistryIndex([]), { subdivisions: 3 });
  for (let i = 0; i < geo.vertexCount; i += 7) {
    const wanted = globeRadius(geo.heights[i]!, geo.options.reliefScale);
    for (let k = 0; k < 3; k++) {
      const drawn = geo.positions[i * 3 + k]!;
      assert.ok(
        Math.abs(drawn - geo.directions[i * 3 + k]! * wanted) < 1e-6,
        `vertex ${i} is drawn at ${drawn}, not at globeRadius times its direction`,
      );
    }
    // And the same function answers for the direction alone, which is what the pick calls. The two
    // differ by the Float32Array `heights` is stored in: 1e-7 of a height, times the relief scale.
    const direction: Vec3 = [geo.directions[i * 3]!, geo.directions[i * 3 + 1]!, geo.directions[i * 3 + 2]!];
    const fromDirection = globeRadiusAt(field, calibration, direction, geo.options);
    assert.ok(
      Math.abs(fromDirection - wanted) < geo.options.reliefScale * 1e-7,
      `the direction form says ${fromDirection} and the height form says ${wanted}`,
    );
  }
});

test("the outline's lift costs a fraction of a parcel, and is still enough to clear the drawn mesh", () => {
  // A resolution 4 parcel, flat side to flat side, in degrees of arc on a 200 km planet: 0.386.
  const parcelDeg = (Math.sqrt(cellAreaKm2(latLngToCell(12, 34, 4), 200) / (Math.sqrt(3) / 2)) / (2 * Math.PI * 200)) * 360;
  const shift = (dr: number, b: number) => ((Math.acos(b / (1 + dr)) - Math.acos(b)) * 180) / Math.PI;

  // Both ways the shipped code lifts a line: alone over terrain, and over a hover marker that is
  // itself standing off the ground. The marker's own number lives in the app, next to the mesh it
  // beats; what is pinned here is that the pair cannot cost a parcel.
  for (const [name, dr] of [
    ["the outline", DEFAULT_GLOBE_OPTIONS.outlineLift],
    ["a marker and its outline", DEFAULT_GLOBE_OPTIONS.outlineLift * 1.5],
  ] as const) {
    // Two thresholds, because a parcel is not the same size everywhere on the disk: at b = 0.8 it
    // is 1.4 px on the shipped hero and at 0.95 it is 0.7, so the limb is held looser on purpose
    // rather than to a number that pretends a sub-pixel hexagon can be seen to be misplaced.
    assert.ok(shift(dr, 0.8) < parcelDeg / 5, `${name} lands ${shift(dr, 0.8).toFixed(4)} degrees off its ground at b=0.8`);
    assert.ok(shift(dr, 0.95) < parcelDeg / 2, `${name} lands ${shift(dr, 0.95).toFixed(4)} degrees off its ground at b=0.95`);
  }
  // And it is not zero, or the line is inside the mesh it is drawn over. The drawn icosphere's flat
  // triangles stand above the continuous surface these points are sampled from by up to 6.3e-4 of
  // the radius, p999 3.65e-4, over 141,700 measured samples at 8 subdivisions.
  assert.ok(DEFAULT_GLOBE_OPTIONS.outlineLift >= 3.65e-4, "the outline lift no longer clears the drawn mesh");
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
  // It used to be `v / 255`, which pinned the C3 bug: a colour attribute is read as LINEAR and
  // nothing on the path converts, so an owner colour stated in sRGB bytes has to go through the
  // transfer exactly as the terrain under it does, or a claimed parcel is in a different colour
  // space from the ground it sits on.
  const target: readonly number[] = linearRgb([255, 0, 128]).map((v) => Math.fround(v));
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
