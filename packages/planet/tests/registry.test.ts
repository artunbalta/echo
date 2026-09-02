/**
 * The registry against a real Postgres (build order steps 6, 7 and 8).
 *
 * These tests do not run against a mock. Two of the three things they check, SKIP LOCKED under
 * concurrency and a trigger that fires exactly once, do not exist outside a real database: a fake
 * would pass whatever it was written to pass. So the suite needs a throwaway Postgres and says so
 * loudly when it does not have one, rather than quietly reporting success.
 *
 *   initdb -D /tmp/pg -U echo --auth=trust
 *   pg_ctl -D /tmp/pg -o "-p 55432 -c listen_addresses=127.0.0.1" start
 *   createdb -h 127.0.0.1 -p 55432 -U echo echo_planet
 *   psql -h 127.0.0.1 -p 55432 -U echo -d echo_planet -f db/migrations/0009_planet_registry.sql
 *   PLANET_TEST_DATABASE_URL=postgres://echo@127.0.0.1:55432/echo_planet npm test -w @echo/planet
 */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { chooseCommons } from "../lib/commons.js";
import { cellAreaKm2 } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import {
  claimParcel,
  createWorld,
  insertCells,
  openRound,
  registryCover,
  registryStats,
  type SqlClient,
  type WorldRow,
} from "../lib/registry.js";
import { seedInventory } from "../lib/rounds.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { checkTiling } from "../lib/tiling.js";

const URL = process.env.PLANET_TEST_DATABASE_URL;
const skip = URL ? false : "set PLANET_TEST_DATABASE_URL to run the registry tests against Postgres";

/** A small planet: the same rules, few enough cells that a test can exhaust several rounds. */
const TEST_PARAMS = { ...PLANET_PARAMS, startResolution: 1, floorResolution: 7, commonsResolution: 1 };

const field = createTerrain("echo-registry-test");
const calibration = calibratePlanet(field, TEST_PARAMS.landFractionTarget, 60_000);
const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
const commons = chooseCommons(1, landFraction, TEST_PARAMS.minLandFraction);

const world: WorldRow = {
  ...TEST_PARAMS,
  id: "test",
  seed: "echo-registry-test",
  terrainVersion: 1,
  seaLevel: calibration.seaLevel,
  peakElevation: calibration.peakElevation,
  commons: commons.cells,
  reserved: commons.reserved,
};

async function freshRegistry(pool: pg.Pool, startResolution: number): Promise<void> {
  await pool.query("truncate parcels, unclaimed_cells, rounds, landless_waitlist, world_manifest, referrals");
  await createWorld(pool as unknown as SqlClient, { ...world, startResolution });
  const cells = seedInventory(startResolution, commons.reserved).map((h3Index) => ({
    h3Index,
    landFraction: landFraction(h3Index),
  }));
  await insertCells(pool as unknown as SqlClient, cells, world.minLandFraction);
  await openRound(pool as unknown as SqlClient, 1, startResolution, world.triggerFraction);
}

test("200 simultaneous registrations produce 200 distinct parcels", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: URL, max: 200 });
  try {
    await freshRegistry(pool, 2);
    const before = await registryStats(pool as unknown as SqlClient);
    assert.ok(before.assignable > 400, `only ${before.assignable} assignable cells to compete for`);

    // Two hundred at once, each on its own connection, each in its own transaction.
    const began = Date.now();
    const results = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const client = await pool.connect();
        try {
          return await claimParcel(client as unknown as SqlClient, {
            ownerId: `user-${i}`,
            world: { ...world, startResolution: 2 },
            landFraction,
          });
        } finally {
          client.release();
        }
      }),
    );
    const elapsed = Date.now() - began;

    const assigned = results.filter((r) => r.status === "assigned");
    assert.equal(assigned.length, 200, "somebody was turned away from a pool of thousands");

    const parcels = assigned.map((r) => (r.status === "assigned" ? r.parcel.h3Index : ""));
    assert.equal(new Set(parcels).size, 200, "two users were given the same parcel");

    // And the database agrees with what the callers were told.
    const after = await registryStats(pool as unknown as SqlClient);
    assert.equal(after.parcels, 200);
    assert.equal(after.assignable, before.assignable - 200);
    assert.equal(after.openRound!.assignableRemaining, before.openRound!.assignableRemaining - 200);

    const owners = await pool.query<{ owner_id: string }>("select distinct owner_id from parcels");
    assert.equal(owners.rows.length, 200, "an owner ended up with two parcels or none");

    console.log(`      200 concurrent claims in ${elapsed} ms (${(elapsed / 200).toFixed(1)} ms each)`);
  } finally {
    await pool.end();
  }
});

test("the subdivision fires exactly once, however many claims cross the threshold together", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: URL, max: 120 });
  try {
    await freshRegistry(pool, 1);
    const before = await registryStats(pool as unknown as SqlClient);
    const toGo = before.openRound!.assignableRemaining - before.openRound!.triggerAt;

    // Sell everything up to one claim short of the trigger, then fire a hundred at once, so a
    // read-then-write trigger would let several of them all believe they were the one.
    const claim = async (i: number) => {
      const client = await pool.connect();
      try {
        return await claimParcel(client as unknown as SqlClient, {
          ownerId: `pre-${i}`,
          world: { ...world, startResolution: 1 },
          landFraction,
        });
      } finally {
        client.release();
      }
    };
    for (let i = 0; i < toGo - 1; i++) await claim(i);

    const stampede = await Promise.all(Array.from({ length: 100 }, (_, i) => claim(1000 + i)));
    const subdivisions = stampede.filter((r) => r.status === "assigned" && r.subdivision);
    assert.equal(subdivisions.length, 1, `${subdivisions.length} claims each ran a subdivision`);

    // Exactly one round is open, it is the next one, and it is one resolution finer.
    const rounds = await pool.query<{ n: number; resolution: number; closed_at: Date | null }>(
      "select n, resolution, closed_at from rounds order by n",
    );
    assert.equal(rounds.rows.length, 2);
    assert.equal(rounds.rows.filter((r) => r.closed_at === null).length, 1);
    assert.equal(rounds.rows[1]!.resolution, rounds.rows[0]!.resolution + 1);

    // No cell was pushed two resolutions, which is what a double subdivision would leave behind.
    const resolutions = await pool.query<{ resolution: number }>(
      "select distinct resolution from unclaimed_cells order by 1",
    );
    assert.deepEqual(
      resolutions.rows.map((r) => r.resolution),
      [1, 2],
      "a cell subdivided twice, or landless rows moved when they should not",
    );
  } finally {
    await pool.end();
  }
});

test("the tiling invariant holds after six subdivision rounds", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: URL, max: 40 });
  try {
    await freshRegistry(pool, 1);

    const claim = async (i: number) => {
      const client = await pool.connect();
      try {
        return await claimParcel(client as unknown as SqlClient, {
          ownerId: `owner-${i}`,
          world: { ...world, startResolution: 1 },
          landFraction,
        });
      } finally {
        client.release();
      }
    };

    let owner = 0;
    let subdivisions = 0;
    const seen: number[] = [];

    // Drive a signup stream until six rounds have subdivided, checking the cover after each one.
    while (subdivisions < 6) {
      const batch = await Promise.all(Array.from({ length: 24 }, () => claim(owner++)));
      const fired = batch.filter((r) => r.status === "assigned" && r.subdivision);
      if (fired.length === 0) {
        assert.ok(batch.some((r) => r.status === "assigned"), "the pool emptied before six rounds");
        continue;
      }
      assert.equal(fired.length, 1, "two subdivisions in one batch");
      subdivisions++;
      seen.push(rounded(fired[0]!));

      const cover = await registryCover(pool as unknown as SqlClient, world);
      const result = checkTiling(cover, world.floorResolution);
      assert.equal(result.ok, true, `after subdivision ${subdivisions}: ${JSON.stringify(result)}`);
    }

    // Six subdivisions means the registry walked resolutions 1 through 7.
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6]);

    const stats = await registryStats(pool as unknown as SqlClient);
    assert.equal(stats.openRound!.resolution, 7);
    assert.ok(stats.parcels > 0);
    console.log(`      six rounds, ${stats.parcels} parcels sold, ${stats.unclaimed} rows left`);
  } finally {
    await pool.end();
  }
});

function rounded(result: { status: string } & Record<string, unknown>): number {
  const subdivision = (result as { subdivision?: { fromResolution: number } }).subdivision!;
  return subdivision.fromResolution;
}

test("a parcel moves from unclaimed to parcels exactly once, with its real area", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: URL, max: 4 });
  try {
    await freshRegistry(pool, 2);
    const client = await pool.connect();
    let claimed: string;
    try {
      const result = await claimParcel(client as unknown as SqlClient, {
        ownerId: "solo",
        world: { ...world, startResolution: 2 },
        landFraction,
      });
      assert.equal(result.status, "assigned");
      claimed = result.status === "assigned" ? result.parcel.h3Index : "";

      // The area written is the real area on this planet, not an Earth area and not an average.
      const row = await pool.query<{ area_km2: number; land_fraction: number; resolution: number }>(
        "select area_km2, land_fraction, resolution from parcels where h3_index = $1",
        [claimed],
      );
      const expected = cellAreaKm2(claimed, world.radiusKm);
      assert.ok(Math.abs(row.rows[0]!.area_km2 - expected) / expected < 1e-5);
      assert.ok(row.rows[0]!.land_fraction >= world.minLandFraction);
      assert.equal(row.rows[0]!.resolution, 2);
    } finally {
      client.release();
    }

    const gone = await pool.query("select 1 from unclaimed_cells where h3_index = $1", [claimed]);
    assert.equal(gone.rowCount, 0, "a sold parcel is still in the unclaimed pool");
  } finally {
    await pool.end();
  }
});
