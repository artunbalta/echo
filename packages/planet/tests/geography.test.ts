/**
 * The six numbers a cell's geography reduces to (SOC-6.B), and the finding that shaped them.
 *
 * THE HEADLINE INVARIANT IS RESOLUTION INDEPENDENCE, and it is why this module samples a metric disk
 * instead of the cell. A cell's own descendant grid returns a single biome for 82% of res-4 cells and
 * 98% of res-7 ones — the height field cannot express anything under about 1.56 km and a res-4 cell
 * is 1,294 m across — so a per-cell reading would have made "what is this place like" depend on which
 * resolution the registry had subdivided to. A parcel and the seven children it becomes must agree
 * about where they are, or the society on them forks the moment a round subdivides. That is L2, and
 * it is the first test below.
 *
 * Run:  node --import tsx --test packages/planet/tests/geography.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, cellToLatLng, latLngToCell } from "h3-js";

import { chooseCommons } from "../lib/commons.js";
import { GEOGRAPHY_SAMPLE, geographyOf, geographySampler, sampleGeography } from "../lib/geography.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { census, settlementAt } from "../lib/society.js";
import { calibratePlanet, createTerrain, hashString } from "../lib/terrain.js";

const SEED = "echo-capacity-1";
const field = createTerrain(SEED);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const RADIUS_KM = PLANET_PARAMS.radiusKm;
const RES = PLANET_PARAMS.startResolution;

/** Land cells in a fixed hash order, so the sample is reproducible and not cherry-picked. */
function landCells(count: number, resolution = RES): string[] {
  const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 40_000; i++) {
    // A deterministic sweep of the sphere; hashString gives the order, never the position.
    const lat = (hashString(`lat/${i}`) * 2 - 1) * 85;
    const lng = hashString(`lng/${i}`) * 360 - 180;
    const cell = latLngToCell(lat, lng, resolution);
    if (out.includes(cell)) continue;
    if (landFraction(cell) > 0.5) out.push(cell);
  }
  return out;
}

const SIX = ["habitability", "arable", "coastal", "wooded", "mountain", "tradeAccess"] as const;

test("L2: a cell and its children read the same place", () => {
  // The reason the disk is metric. A res-4 parcel that subdivides into seven res-5 children must not
  // become seven different countries; every child's centre is inside the parent's 3 km disk, so the
  // ground each of them reads is the same ground.
  let compared = 0;
  for (const parent of landCells(12)) {
    const here = geographyOf(parent, field, calibration, RADIUS_KM);
    for (const child of cellToChildren(parent, RES + 1)) {
      const there = geographyOf(child, field, calibration, RADIUS_KM);
      for (const key of SIX) {
        assert.ok(
          Math.abs(here[key] - there[key]) < 0.35,
          `${key}: parent ${here[key].toFixed(3)} against child ${there[key].toFixed(3)} — a ` +
            "subdivision round would move the society on this ground",
        );
      }
      compared++;
    }
  }
  assert.ok(compared >= 60, `only ${compared} parent/child pairs compared`);
});

test("the same lat/lng reads the same at every resolution, which is the stronger form", () => {
  for (const seed of landCells(8)) {
    const [lat, lng] = cellToLatLng(seed);
    const readings = [4, 5, 6, 7].map((r) => geographyOf(latLngToCell(lat, lng, r), field, calibration, RADIUS_KM));
    for (const key of SIX) {
      const values = readings.map((g) => g[key]);
      const spread = Math.max(...values) - Math.min(...values);
      assert.ok(spread < 1e-9, `${key} moved ${spread} across resolutions 4..7 at the same point`);
    }
  }
});

test("every number is in [0, 1], on land, at sea, and at the poles", () => {
  const cells = [
    ...landCells(30),
    latLngToCell(0, 0, RES), latLngToCell(89.9, 0, RES), latLngToCell(-89.9, 180, RES),
  ];
  for (const cell of cells) {
    const g = geographyOf(cell, field, calibration, RADIUS_KM);
    for (const key of SIX) {
      assert.ok(Number.isFinite(g[key]), `${cell} ${key} is ${g[key]}`);
      assert.ok(g[key] >= 0 && g[key] <= 1, `${cell} ${key} is ${g[key]}, outside [0, 1]`);
    }
  }
});

test("open ocean is uninhabitable, and says so through landShare rather than a special case", () => {
  const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
  let checked = 0;
  for (let i = 0; checked < 6 && i < 4_000; i++) {
    const cell = latLngToCell((hashString(`sea/${i}`) * 2 - 1) * 80, hashString(`sea2/${i}`) * 360 - 180, RES);
    if (landFraction(cell) > 0) continue;
    const g = geographyOf(cell, field, calibration, RADIUS_KM);
    const s = sampleGeography(cell, field, calibration, RADIUS_KM);
    if (s.land > 0) continue; // the 3 km disk reached a shore; not open ocean
    assert.equal(g.habitability, 0, `${cell} is open water and habitable`);
    assert.equal(g.coastal, 1, "every point of an all-water disk is at the water");
    checked++;
  }
  assert.ok(checked >= 6, `only ${checked} open-ocean cells found`);
});

test("coastal is zero only where the disk holds no water at all", () => {
  for (const cell of landCells(25)) {
    const g = geographyOf(cell, field, calibration, RADIUS_KM);
    const s = sampleGeography(cell, field, calibration, RADIUS_KM);
    assert.equal(
      g.coastal === 0,
      s.nearestWaterM === Infinity,
      `${cell}: coastal ${g.coastal} against nearest water ${s.nearestWaterM} m`,
    );
    if (s.nearestWaterM !== Infinity) assert.ok(g.coastal > 0);
  }
});

test("the disk is the documented one, and a bad one is refused rather than approximated", () => {
  const s = sampleGeography(landCells(1)[0], field, calibration, RADIUS_KM);
  const { rings } = GEOGRAPHY_SAMPLE;
  assert.equal(s.points, 1 + 3 * rings * (rings + 1), "the ring formula and the loop disagree");
  assert.equal(s.points, 91);
  const cell = landCells(1)[0];
  assert.throws(() => sampleGeography(cell, field, calibration, RADIUS_KM, { rings: 0 }), /bad geography sample/);
  assert.throws(() => sampleGeography(cell, field, calibration, RADIUS_KM, { radiusM: 0 }), /bad geography sample/);
  assert.throws(() => sampleGeography(cell, field, calibration, RADIUS_KM, { rings: 2.5 }), /bad geography sample/);
});

test("the commons are what tradeAccess is measured from, and saying so changes the answer", () => {
  // The invented number (DECISIONS C32), held to its own claim: WITH the commons, a cell beside one
  // must beat a cell far from every one of them. Without them the term is absent entirely, which is
  // what a synthetic test planet wants and what the shipped world must not do.
  const commons = chooseCommons(
    PLANET_PARAMS.commonsResolution ?? RES,
    landFractionSampler(field, calibration.seaLevel, 2),
    PLANET_PARAMS.minLandFraction,
  );
  const opts = { commons: commons.cells };

  // At a commons the distance is zero and the term is exactly 1, so the two readings must be EQUAL.
  // They were asserted strictly-greater at first, which was wrong in the informative direction: the
  // term is a penalty for being far, not a bonus for being near, and the only place it does nothing
  // is the place it is measured from.
  const near = geographyOf(commons.cells[0], field, calibration, RADIUS_KM, opts);
  const bare = geographyOf(commons.cells[0], field, calibration, RADIUS_KM);
  assert.equal(near.tradeAccess, bare.tradeAccess, "the term must be exactly 1 at zero distance");
  for (const cell of landCells(20)) {
    const withCommons = geographyOf(cell, field, calibration, RADIUS_KM, opts);
    const without = geographyOf(cell, field, calibration, RADIUS_KM);
    assert.ok(
      withCommons.tradeAccess <= without.tradeAccess + 1e-12,
      `${cell}: the commons term raised trade access, and it may only ever lower it`,
    );
  }

  // Somewhere as far from all twelve as the sample can find.
  let worst = { cell: "", km: 0 };
  for (const cell of landCells(60)) {
    const g = geographyOf(cell, field, calibration, RADIUS_KM, opts);
    if (worst.cell === "" || g.tradeAccess < worst.km) worst = { cell, km: g.tradeAccess };
  }
  assert.ok(
    near.tradeAccess > worst.km,
    `a cell on a commons (${near.tradeAccess.toFixed(3)}) should beat the remotest cell found ` +
      `(${worst.km.toFixed(3)}) — if it does not, TRADE_RANGE_KM no longer discriminates`,
  );
});

test("geography is deterministic, and the sampler is a cache and not a second answer", () => {
  const sampler = geographySampler(field, calibration, RADIUS_KM);
  for (const cell of landCells(10)) {
    const a = geographyOf(cell, field, calibration, RADIUS_KM);
    const b = geographyOf(cell, field, calibration, RADIUS_KM);
    assert.deepEqual(a, b);
    assert.deepEqual(sampler(cell), a);
    assert.deepEqual(sampler(cell), a, "the memo returned something different the second time");
  }
});

test("it feeds society() and a real village comes out of real ground", () => {
  // The whole point of SOC-6.B: the injected seam SOC-6.A left open, closed against the real planet.
  const commons = chooseCommons(
    PLANET_PARAMS.commonsResolution ?? RES,
    landFractionSampler(field, calibration.seaLevel, 2),
    PLANET_PARAMS.minLandFraction,
  );
  const sampler = geographySampler(field, calibration, RADIUS_KM, { commons: commons.cells });

  let settled = 0;
  let people = 0;
  const trades = new Set<string>();
  for (const cell of landCells(80)) {
    const s = settlementAt(SEED, cell, sampler(cell), 0);
    if (s === null) continue;
    settled++;
    const c = census(s, 0);
    people += c.population;
    for (const p of c.alive) trades.add(p.occupation);
    assert.ok(s.people.length > 0, `${cell} has a settlement with nobody in it`);
    assert.ok(s.foundedDay < 0);
  }
  assert.ok(settled > 0, "no settlement anywhere on 80 land cells");
  assert.ok(people > 0, "settlements exist but nobody is alive in any of them");
  assert.ok(trades.size >= 5, `only ${trades.size} trades across ${settled} settlements — the ground is not varying`);
  console.log(`  ${settled}/80 land cells settled, ${people} alive at day 0, ${trades.size} trades`);
});

test("a parcel's worth of geography is cheap enough to do on demand, which is the whole design", () => {
  const cells = landCells(40);
  const started = process.hrtime.bigint();
  for (const cell of cells) geographyOf(cell, field, calibration, RADIUS_KM);
  const perCell = Number(process.hrtime.bigint() - started) / 1e6 / cells.length;
  // Measured at 0.089 ms; the bar is deliberately loose because this is a regression guard against
  // somebody making the disk a full-planet scan, not a benchmark.
  assert.ok(perCell < 5, `geography is ${perCell.toFixed(3)} ms per cell — it was 0.089`);
  console.log(`  geography ${perCell.toFixed(4)} ms per cell over ${cells.length} cells`);
});
