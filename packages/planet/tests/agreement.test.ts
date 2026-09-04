/**
 * THE test (section 6.3). Build order step 5.
 *
 * "For 50 random parcels: sample elevation at 500 points via the globe path, sample elevation at
 * the same 500 world positions via the in world scene path, assert the values agree to within
 * 1e-6. If this test does not exist, the feature is not done."
 *
 * SINCE DECISIONS C2 THERE ARE TWO SCENE PATHS, AND THIS TEST HOLDS BOTH.
 *
 * `sceneHeightAt` is the macro field read on the tangent patch. That is what the globe draws, what
 * the registry assigns from, and what `isLand`, every parcel boundary and every deed are computed
 * over. `createSceneHeight` is that same macro field PLUS the walking-scale displacement, and it
 * is what `buildRegionScene` builds the mesh from and what `PlanetWorld` seats the body, the
 * camera and every prop on. The second one is the ground a person is standing on; the first one is
 * not, and has not been since C2.
 *
 * This test used to measure only the first, which made it a test of something that is not what
 * ships. Run the shipped path against this file's own 1e-6 and 13,198 of its 25,000 samples fail,
 * worst 3.3631 m, or 1.246e-3 normalised. Nothing was wrong with the world; what was wrong was
 * that the evidence named a promise it was not checking.
 *
 * So the promise is TWO promises and each is asserted separately below, named for what it holds:
 * exact to 1e-6 on the macro field, because that is the one field the globe and the registry
 * share and any drift there is two planets, and within the displacement's own amplitude on the
 * drawn ground, because that is precisely what C2 spent to buy walking scale.
 *
 * It is worth being precise about what this can and cannot catch, because a test named after the
 * product's central promise is exactly the kind that quietly becomes a rubber stamp.
 *
 * Both renderers call the same terrain function, so the macro values can only disagree if they
 * disagree about the POSITION. That is the whole risk and it is a real one: the scene works in
 * local metres on a tangent plane and the globe works in unit vectors on a sphere, and there are
 * several plausible ways to convert between them that are subtly wrong. A later test in this file
 * builds two of those wrong ways and proves they fail the same assertion by six to nine orders of
 * magnitude, so passing means something.
 *
 * Run:  node --import tsx --test packages/planet/tests/agreement.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, cellToLatLng, getResolution } from "h3-js";

import { latLngToVec3, vec3ToLatLng, type Vec3 } from "../lib/geo.js";
import { globeHeightAt } from "../lib/globe.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import {
  createSceneHeight,
  createTangentPatch,
  DEFAULT_DETAIL,
  DEFAULT_REGION_OPTIONS,
  sceneHeightAt,
  tangentDistortion,
  type DetailOptions,
} from "../lib/scene.js";
import { calibratePlanet, createTerrain, normalisedHeight } from "../lib/terrain.js";
import { spawnPointFor } from "../lib/walkable.js";
import { loadGoldens, SEED } from "./helpers/shipped.js";

// The seed the users own, unless a test run names another (helpers/shipped.ts). The plan (B2)
// moved this from a private test seed to the shipped one so the promise is proven on the planet
// people stand on.
const RADIUS_KM = PLANET_PARAMS.radiusKm;
const TOLERANCE = 1e-6;

/**
 * The drawn ground's own tolerance, in METRES above sea level, and why it is a second number.
 *
 * C2 added the walking-scale displacement to the scene height and to nothing else, so the ground
 * underfoot stands away from the globe's ground by however much that displacement is worth. Four
 * metres is not an estimate of that, it is a hard ceiling on it: the octave amplitudes are
 * normalised to sum to `amplitudeM` by construction, each octave of value noise lands in -1..1,
 * the shore taper only ever scales the sum DOWN, and the read-back between lattice points is a
 * convex combination of lattice offsets. Nothing in that chain can exceed the dial.
 *
 * It is written out as a literal instead of read off DEFAULT_DETAIL because a tolerance that moves
 * with the dial it measures would pass at any setting of the dial, which is the failure this file
 * is being repaired for. The two assertions below pin it to the dial from the other side: it may
 * not be LARGER than the amplitude the displacement promises, and the measured worst must reach
 * most of it, so a displacement that grew and one that quietly went missing both fail here.
 *
 * Measured worst over the 25,000 samples: 3.3631 m, which is 1.246e-3 normalised and 84% of the
 * budget. Mean absolute divergence is 0.80 m, against the 0.94 m mean magnitude DEFAULT_DETAIL
 * records for the displacement alone: the gap is the samples that land on water, where the taper
 * has already taken the displacement to zero.
 */
const DRAWN_TOLERANCE_M = 4;

// The vertical scale and the lattice the region builder ships, so what is measured below is the
// ground the app draws and not a neighbour of it. Both come from DEFAULT_REGION_OPTIONS rather
// than from literals, because `buildRegionScene` and `PlanetWorld` both read them from there.
const HEIGHT_SCALE_M = DEFAULT_REGION_OPTIONS.heightScaleM;
const RESOLUTION_M = DEFAULT_REGION_OPTIONS.resolution;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const field = createTerrain(SEED);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget, 60_000);

/**
 * Fifty parcels spread across every resolution the registry can hold, not fifty of one size.
 *
 * Resolution matters here more than anything else: a resolution 1 parcel is 26 km across on a
 * 200 km planet, which is where a tangent plane is worked hardest, and a resolution 8 parcel is
 * 29 m, where it is trivially exact. Sampling only one size would test only one difficulty.
 */
function chooseParcels(count: number, random: () => number): string[] {
  const base = seedInventory(1, 1);
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = base[Math.floor(random() * base.length)]!;
    const targetRes = 1 + (i % 8);
    let cell = start;
    while (getResolution(cell) < targetRes) {
      const children = cellToChildren(cell, getResolution(cell) + 1);
      cell = children[Math.floor(random() * children.length)]!;
    }
    chosen.push(cell);
  }
  return chosen;
}

test("the globe and the walked ground agree: exactly on the macro field, and to 4 m on the drawn scene", () => {
  const random = mulberry32(0x60be);
  const parcels = chooseParcels(50, random);

  let worstMacro = 0;
  let worstMacroParcel = "";
  let worstDrawnM = 0;
  let worstDrawnParcel = "";
  let samples = 0;

  for (const cell of parcels) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    // The height function the app itself builds. `buildRegionScene` and `PlanetWorld` both make
    // exactly this call, on the anchor patch, at the shipped step, and hand the result out as the
    // scene's `heightAt`. Its lattice is at integer multiples of the step from the patch origin
    // and the builder's grid line i sits at (i - half) * step, so the two lattices are the same
    // lattice and this is the drawn surface rather than a resampling of it.
    const drawnAt = createSceneHeight(patch, field, calibration, {
      heightScaleM: HEIGHT_SCALE_M,
      resolution: RESOLUTION_M,
    });

    for (let i = 0; i < 500; i++) {
      // A position inside the parcel, expressed the way the walkable scene expresses positions.
      const x = (random() * 2 - 1) * patch.extentM;
      const y = (random() * 2 - 1) * patch.extentM;

      // The same world position, expressed the way the globe expresses positions.
      const direction = patch.toDirection(x, y);

      const fromGlobe = globeHeightAt(field, calibration, direction);
      const fromScene = sceneHeightAt(patch, field, calibration, x, y);
      const macroDifference = Math.abs(fromGlobe - fromScene);
      if (macroDifference > worstMacro) {
        worstMacro = macroDifference;
        worstMacroParcel = cell;
      }
      assert.ok(
        macroDifference < TOLERANCE,
        `macro: ${cell} at local (${x}, ${y}): globe ${fromGlobe}, scene ${fromScene}`,
      );

      // Metres against metres: the globe's ground at this point, and the ground a body standing
      // at this point rests on.
      const drawnDifference = Math.abs(fromGlobe * HEIGHT_SCALE_M - drawnAt(x, y));
      if (drawnDifference > worstDrawnM) {
        worstDrawnM = drawnDifference;
        worstDrawnParcel = cell;
      }
      assert.ok(
        drawnDifference <= DRAWN_TOLERANCE_M,
        `drawn: ${cell} at local (${x}, ${y}): globe ${fromGlobe * HEIGHT_SCALE_M} m, drawn ${drawnAt(x, y)} m`,
      );

      samples++;
    }
  }

  assert.equal(samples, 25_000);

  // PROMISE ONE, the one the globe and the registry share. There is one macro field, both paths
  // reach it at one position, and the two numbers are the same number. This is the promise that
  // may never soften: a drift here is not a rounding, it is two planets, and it is what decides
  // whether the parcel the registry sold is the parcel the globe drew. Measured worst: exactly 0.
  assert.ok(worstMacro < TOLERANCE, `the macro field disagreed by ${worstMacro} at ${worstMacroParcel}`);

  // PROMISE TWO, the one a person's feet keep, and an APPROXIMATE promise by DECISIONS C2. The
  // ground drawn and stood on is the macro field plus the walking-scale displacement, so it stands
  // away from the globe by up to the displacement's amplitude and by no more than that.
  assert.ok(
    worstDrawnM <= DRAWN_TOLERANCE_M,
    `the drawn ground stood ${worstDrawnM} m off the globe at ${worstDrawnParcel}, past the ${DRAWN_TOLERANCE_M} m C2 spent`,
  );
  // The tolerance is the displacement's amplitude, not a number chosen to fit the measurement.
  // Raising the dial without raising this line's budget is caught by the per-sample assertion
  // above; lowering the dial is caught here.
  assert.ok(
    DRAWN_TOLERANCE_M <= DEFAULT_DETAIL.amplitudeM,
    `the tolerance ${DRAWN_TOLERANCE_M} m is larger than the ${DEFAULT_DETAIL.amplitudeM} m the displacement can reach`,
  );
  // And it is not slack. A displacement that went missing, or was tapered away to nothing, would
  // leave this test passing on a world with no relief in it at all, which is the shape of the bug
  // being repaired here. Measured 3.3631 m against a 4 m budget, so the margin is 16%.
  assert.ok(
    worstDrawnM > DRAWN_TOLERANCE_M * 0.5,
    `the worst divergence was only ${worstDrawnM} m; the displacement is not reaching the ground`,
  );
});

test("the drawn-scene tolerance has teeth: a louder displacement fails it while the macro promise stays green", () => {
  // The proof the repair is owed. A guard nobody has watched fail is not evidence, so here is the
  // failure, kept rather than described: the same displacement, twice as tall.
  //
  // The taper widens in the same ratio because `createSceneHeight` refuses a taper under 1.5 times
  // the amplitude, on pain of a shore that runs backwards into the sea. Doubling only the amplitude
  // would throw there and prove nothing about this tolerance.
  const loud: DetailOptions = {
    ...DEFAULT_DETAIL,
    amplitudeM: DEFAULT_DETAIL.amplitudeM * 2,
    taperM: DEFAULT_DETAIL.taperM * 2,
  };

  const random = mulberry32(0x60be);
  let worstMacro = 0;
  let worstDrawnM = 0;

  for (const cell of chooseParcels(8, random)) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    const drawnAt = createSceneHeight(patch, field, calibration, {
      heightScaleM: HEIGHT_SCALE_M,
      resolution: RESOLUTION_M,
      detail: loud,
    });
    for (let i = 0; i < 500; i++) {
      const x = (random() * 2 - 1) * patch.extentM;
      const y = (random() * 2 - 1) * patch.extentM;
      const fromGlobe = globeHeightAt(field, calibration, patch.toDirection(x, y));
      worstMacro = Math.max(worstMacro, Math.abs(fromGlobe - sceneHeightAt(patch, field, calibration, x, y)));
      worstDrawnM = Math.max(worstDrawnM, Math.abs(fromGlobe * HEIGHT_SCALE_M - drawnAt(x, y)));
    }
  }

  // Measured 6.7235 m on these 4,000 samples against a 4 m budget, so the drawn-scene assertion
  // above rejects this ground by 68%. Run for real, by editing DEFAULT_DETAIL rather than passing
  // an override, an amplitude of 6 trips the per-sample assertion at 4.2437 m and an amplitude of
  // 2.5 trips the tolerance assertion; a taper widened until it swallows the relief leaves the
  // worst divergence at 0.0015 m and trips the slack assertion. All three have been watched to
  // fail, which is the only reason to believe any of them.
  assert.ok(
    worstDrawnM > DRAWN_TOLERANCE_M,
    `a doubled displacement only moved the ground ${worstDrawnM} m, inside the ${DRAWN_TOLERANCE_M} m budget`,
  );
  // And this is why the two promises are two assertions. The macro agreement is blind to the
  // displacement by construction, so it stays at exactly 0 through a change that moves every
  // vertex of the world people walk on. One assertion covering both would have to be the loose
  // one, and would have caught nothing here.
  assert.ok(worstMacro < TOLERANCE, `the macro field noticed the displacement, by ${worstMacro}`);
});

test("the agreement holds for raw elevation too, not only for the normalised height", () => {
  // The normalisation is shared, so comparing only normalised heights could hide a divergence that
  // the shared step happened to squash. Compare the underlying field as well.
  const random = mulberry32(0x7a11);
  let worst = 0;
  for (const cell of chooseParcels(20, random)) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    for (let i = 0; i < 250; i++) {
      const x = (random() * 2 - 1) * patch.extentM;
      const y = (random() * 2 - 1) * patch.extentM;
      const direction = patch.toDirection(x, y);
      // The same point reached a second way: through lat/lng and back. A projection bug that
      // cancelled inside toDirection would not cancel here.
      const [dlat, dlng] = vec3ToLatLng(direction[0], direction[1], direction[2]);
      worst = Math.max(worst, Math.abs(field.elevation(direction) - field.elevation(latLngToVec3(dlat, dlng))));
      // And the local coordinate must survive the trip to the sphere and back.
      const back = patch.toLocal(direction);
      assert.ok(back !== null, "a point inside the parcel projected to the far hemisphere");
      assert.ok(Math.abs(back[0] - x) < 1e-6 * Math.max(1, Math.abs(x)), `x drifted from ${x} to ${back[0]}`);
      assert.ok(Math.abs(back[1] - y) < 1e-6 * Math.max(1, Math.abs(y)), `y drifted from ${y} to ${back[1]}`);
    }
  }
  assert.ok(worst < 1e-9, `raw elevation drifted by ${worst} between two derivations of the same point`);
});

test("the tangent plane approximation is measured, and is small at every parcel size", () => {
  // Section 6.2 asks for the approximation to be noted. Noting it as a number, per resolution,
  // beats noting it as a sentence, and it is the number that decides whether a resolution 1 parcel
  // can be walked on a flat patch at all.
  const random = mulberry32(0xd157);
  const base = seedInventory(1, 1);
  const worstByResolution = new Map<number, number>();

  for (let res = 1; res <= 8; res++) {
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      let cell = base[Math.floor(random() * base.length)]!;
      while (getResolution(cell) < res) {
        const children = cellToChildren(cell, getResolution(cell) + 1);
        cell = children[Math.floor(random() * children.length)]!;
      }
      worst = Math.max(worst, tangentDistortion(createTangentPatch(cell, RADIUS_KM)));
    }
    worstByResolution.set(res, worst);
  }

  // A resolution 1 parcel is 24 km across on a 200 km planet, the hardest case in the design.
  // Measured 2.2e-3, which is 27 m of distance error across the parcel: real, and the reason a
  // founder parcel that size is a landscape rather than a place.
  assert.ok(worstByResolution.get(1)! < 5e-3, `resolution 1 distortion was ${worstByResolution.get(1)}`);
  // By resolution 4, the size the capacity report recommends, it is 6.7e-6, or 4 mm.
  assert.ok(worstByResolution.get(4)! < 1e-5, `resolution 4 distortion was ${worstByResolution.get(4)}`);

  // It falls with the square of the parcel width, as the geometry says it must, until the
  // measurement itself runs out of precision. acos(x) for x within 1e-15 of 1 cannot resolve an
  // angle below about 4e-8 rad, so resolution 8 reports the floor of the measuring instrument and
  // not the distortion, which is 1.7e-9 by the formula and 0.0006 mm on the ground.
  const MEASUREMENT_FLOOR = 1e-7;
  for (let res = 2; res <= 7; res++) {
    assert.ok(
      worstByResolution.get(res)! < worstByResolution.get(res - 1)!,
      `resolution ${res} is not flatter than ${res - 1}`,
    );
  }
  assert.ok(worstByResolution.get(7)! < MEASUREMENT_FLOOR);
  assert.ok(worstByResolution.get(8)! < MEASUREMENT_FLOOR, "resolution 8 should be at the floor");

  // The distortion is about DISTANCE, not position. The projection itself is a bijection, which is
  // why the agreement test above passes at 1e-6 even for the parcel with the worst distortion.
  assert.ok(worstByResolution.get(1)! > 1e-4, "the hardest case should be measurably distorted");
});

test("the test has teeth: two plausible wrong scene implementations fail it", () => {
  const random = mulberry32(0xbad0);
  const parcels = chooseParcels(8, random).filter((c) => getResolution(c) <= 3);
  assert.ok(parcels.length > 0);

  /** Wrong 1: sample the tangent plane point itself, without projecting back onto the sphere. */
  const flatScene = (patch: ReturnType<typeof createTangentPatch>, x: number, y: number): number => {
    const v: Vec3 = [
      patch.centre[0] + (patch.east[0] * x + patch.north[0] * y) / patch.radiusM,
      patch.centre[1] + (patch.east[1] * x + patch.north[1] * y) / patch.radiusM,
      patch.centre[2] + (patch.east[2] * x + patch.north[2] * y) / patch.radiusM,
    ];
    return normalisedHeight(field.elevation(v), calibration);
  };

  /** Wrong 2: offset in degrees on a lat/lng grid, which is the 2D map mistake section 5.2 bans. */
  const latLngScene = (patch: ReturnType<typeof createTangentPatch>, x: number, y: number): number => {
    const [lat, lng] = cellToLatLng(patch.cell);
    const dLat = (y / patch.radiusM) * (180 / Math.PI);
    const dLng = (x / patch.radiusM) * (180 / Math.PI);
    return normalisedHeight(field.elevation(latLngToVec3(lat + dLat, lng + dLng)), calibration);
  };

  let worstFlat = 0;
  let worstLatLng = 0;
  for (const cell of parcels) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    for (let i = 0; i < 200; i++) {
      const x = (random() * 2 - 1) * patch.extentM;
      const y = (random() * 2 - 1) * patch.extentM;
      const truth = sceneHeightAt(patch, field, calibration, x, y);
      worstFlat = Math.max(worstFlat, Math.abs(flatScene(patch, x, y) - truth));
      worstLatLng = Math.max(worstLatLng, Math.abs(latLngScene(patch, x, y) - truth));
    }
  }

  // Both wrong implementations look completely plausible and both are caught by orders of magnitude.
  assert.ok(worstFlat > TOLERANCE * 100, `the unprojected plane only differed by ${worstFlat}`);
  assert.ok(worstLatLng > TOLERANCE * 100, `the lat/lng offset only differed by ${worstLatLng}`);
});

// ── the shipped planet, pinned ──────────────────────────────────────────────────

test("the shipped planet's calibration, field samples and demo spawn match their goldens", (t) => {
  const golden = loadGoldens(SEED);
  if (!golden) {
    // Only a deliberately different seed may skip; the shipped seed throws in loadGoldens.
    t.skip(`no goldens for ${SEED}; run scripts/write-goldens.ts ${SEED}`);
    return;
  }
  // Full calibration, as lib/planet.ts does it, not the 60k sample the tests above use for speed.
  const full = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
  // 1e-9 on a sea level of order 1e-2: the same engine gives the same bits today, but V8 has
  // changed Math.pow before. A drift larger than this is a different planet.
  assert.ok(Math.abs(full.seaLevel - golden.calibration.seaLevel) < 1e-9, `seaLevel ${full.seaLevel} vs ${golden.calibration.seaLevel}`);
  assert.ok(Math.abs(full.peakElevation - golden.calibration.peakElevation) < 1e-9, `peak ${full.peakElevation} vs ${golden.calibration.peakElevation}`);
  for (const g of golden.sphere) {
    assert.ok(Math.abs(field.elevation(g.direction) - g.elevation) < 1e-12);
    assert.ok(Math.abs(field.moisture(g.direction) - g.moisture) < 1e-12);
    assert.ok(Math.abs(field.temperature(g.direction) - g.temperature) < 1e-12);
    assert.ok(Math.abs(normalisedHeight(field.elevation(g.direction), full) - g.height) < 1e-9);
  }
  const patch = createTangentPatch(golden.demoCell, RADIUS_KM);
  for (const g of golden.local) {
    assert.ok(Math.abs(sceneHeightAt(patch, field, full, g.x, g.y) - g.height) < 1e-9);
  }
  assert.deepEqual(spawnPointFor(golden.demoCell, field, full, RADIUS_KM), golden.demoSpawn, "the demo spawn moved");
});

test("the tangent frame's x points east and its y points north", () => {
  for (const cell of chooseParcels(12, mulberry32(0xea57))) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    const [lat, lng] = cellToLatLng(cell);
    if (Math.abs(lat) > 85) continue; // at the pole "east" is not defined
    const east = patch.toLocal(latLngToVec3(lat, lng + 0.01));
    const north = patch.toLocal(latLngToVec3(lat + 0.01, lng));
    assert.ok(east && east[0] > 0 && Math.abs(east[1]) < Math.abs(east[0]) * 0.02, `${cell}: +lng went to ${east}`);
    assert.ok(north && north[1] > 0 && Math.abs(north[0]) < Math.abs(north[1]) * 0.02, `${cell}: +lat went to ${north}`);
  }
});
