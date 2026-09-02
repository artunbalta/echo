/**
 * Create the planet and seed the registry (build order step 6).
 *
 * This is the script that turns a seed string into a world: it calibrates sea level, chooses the
 * twelve commons against the terrain, writes the manifest row that may never change again, measures
 * the land in every cell at the start resolution, and opens round 1.
 *
 * It is idempotent only in the sense that it refuses to run twice. A second planet is a second
 * world row, and overwriting the first would move the ground under everyone standing on it.
 *
 * Run:  DATABASE_URL=... npm run seed:registry -w @echo/planet
 *   or  node --import tsx packages/planet/scripts/seed-registry.ts --url postgres://... [--seed s]
 */

import pg from "pg";

import { chooseCommons } from "../lib/commons.js";
import { cellAreaKm2, sphereAreaKm2 } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import {
  createWorld,
  insertCells,
  openRound,
  registryStats,
  runPendingSubdivision,
  type SqlClient,
  type WorldRow,
} from "../lib/registry.js";
import { seedInventory } from "../lib/rounds.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]!;
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  const isFlag = next === undefined || next.startsWith("--");
  args.set(token.slice(2), isFlag ? "true" : next!);
  if (!isFlag) i++;
}

const URL = args.get("url") ?? process.env.DATABASE_URL;
const SEED = args.get("seed") ?? "echo-capacity-1";
const WORLD_ID = args.get("world") ?? "echo";
const DEPTH = Number(args.get("depth") ?? 2);
const FORCE = args.has("force");
/** Subdivide immediately after seeding, to measure what a restock costs at real scale. */
const MEASURE_ROUND = args.has("measure-round");

if (!URL) {
  console.error("No database. Pass --url or set DATABASE_URL.");
  process.exit(1);
}

const n = (x: number, d = 0) =>
  x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const since = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

const P = PLANET_PARAMS;
const pool = new pg.Pool({ connectionString: URL, max: 4 });
const db = pool as unknown as SqlClient;

try {
  const existing = await pool.query<{ id: string; seed: string }>("select id, seed from world_manifest");
  if (existing.rows.length > 0 && !FORCE) {
    console.error(`A world already exists: ${existing.rows[0]!.id} on seed ${existing.rows[0]!.seed}.`);
    console.error("Terrain is immutable and owners are standing on it. Pass --force only against a");
    console.error("throwaway database, which will delete every parcel in it.");
    process.exit(1);
  }
  if (FORCE) {
    await pool.query("truncate parcels, unclaimed_cells, rounds, landless_waitlist, world_manifest, referrals");
  }

  console.log(`Seeding world "${WORLD_ID}" on terrain seed ${SEED}.`);
  console.log(`  start resolution ${P.startResolution}, floor ${P.floorResolution}, trigger ${P.triggerFraction}`);

  let t = Date.now();
  const field = createTerrain(SEED);
  const calibration = calibratePlanet(field, P.landFractionTarget);
  const landFraction = landFractionSampler(field, calibration.seaLevel, DEPTH);
  console.log(`  sea level ${calibration.seaLevel.toFixed(6)}, land ${(calibration.landFraction * 100).toFixed(3)}%, in ${since(t)}`);

  t = Date.now();
  const commons = chooseCommons(P.commonsResolution ?? P.startResolution, landFraction, P.minLandFraction);
  const commonsArea = commons.cells.reduce((sum, c) => sum + cellAreaKm2(c, P.radiusKm), 0);
  console.log(`  commons: 12 reserved, ${commons.relocated} relocated onto land, ${commons.reserved.length - 12} pentagons vacated`);
  console.log(`  commons area ${n(commonsArea, 0)} km2 (${((commonsArea / sphereAreaKm2(P.radiusKm)) * 100).toFixed(3)}%), in ${since(t)}`);

  const world: WorldRow = {
    ...P,
    id: WORLD_ID,
    seed: SEED,
    terrainVersion: 1,
    seaLevel: calibration.seaLevel,
    peakElevation: calibration.peakElevation,
    commons: commons.cells,
    reserved: commons.reserved,
  };
  await createWorld(db, world);

  t = Date.now();
  const cells = seedInventory(P.startResolution, commons.reserved);
  console.log(`  ${n(cells.length)} cells at resolution ${P.startResolution}, measuring land at ${7 ** DEPTH} points each`);
  const measured = cells.map((h3Index) => ({ h3Index, landFraction: landFraction(h3Index) }));
  console.log(`  measured in ${since(t)}`);

  t = Date.now();
  const inserted = await insertCells(db, measured, P.minLandFraction);
  await openRound(db, 1, P.startResolution, P.triggerFraction);
  console.log(`  inserted ${n(inserted.inserted)} rows in ${since(t)}`);

  const stats = await registryStats(db);
  console.log(`\n  assignable   ${n(stats.assignable)}`);
  console.log(`  terminal     ${n(stats.terminal)} (no land at all, never subdivide)`);
  console.log(`  marginal     ${n(stats.unclaimed - stats.assignable - stats.terminal)} (some land, not enough, still subdivide)`);
  console.log(`  round 1 ends when the assignable pool falls to ${n(stats.openRound!.triggerAt)}`);

  const size = await pool.query<{ pretty: string }>(
    "select pg_size_pretty(pg_total_relation_size('unclaimed_cells')) as pretty",
  );
  console.log(`  unclaimed_cells on disk: ${size.rows[0]!.pretty}`);

  if (MEASURE_ROUND) {
    console.log("\n  Measuring one restock at real scale (this is what a closed round costs):");
    await pool.query("update rounds set closed_at = now() where closed_at is null");
    const report = await runPendingSubdivision(db, world, landFraction);
    if (report) {
      console.log(`    ${n(report.parentsSubdivided)} parents split into ${n(report.inserted)} rows in ${(report.millis / 1000).toFixed(1)}s`);
      console.log(`    ${n(report.newlyAssignable)} newly assignable, ${n(report.newlyTerminal)} newly terminal`);
      const after = await pool.query<{ pretty: string }>(
        "select pg_size_pretty(pg_total_relation_size('unclaimed_cells')) as pretty",
      );
      console.log(`    unclaimed_cells now ${after.rows[0]!.pretty}`);
      console.log("    The registry is closed to claims for that whole time, by design: restocking");
      console.log("    the shelves needs exclusive use of them. Claims wait rather than fail.");
    }
  }

  console.log("\nSeeded.");
} finally {
  await pool.end();
}
