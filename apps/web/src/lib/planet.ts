/**
 * The planet, for the server (build order step 9).
 *
 * One world per process, behind the same seam the rest of this app uses: an in memory registry that
 * needs no keys, and a Postgres one when DATABASE_URL is set. A missing database costs you
 * durability, not the page.
 *
 * The terrain here is the same module the browser draws with and the same one the walkable scene
 * samples. That is the whole product promise and it is kept by there being exactly one copy of it,
 * in @echo/planet, imported by both sides.
 *
 * Server-only. Building the local world measures the land in 284,004 cells, which takes about ten
 * seconds once per process, so it is cached on globalThis and survives Next's dev recompiles.
 */
import "server-only";

import {
  MemoryRegistry,
  PLANET_PARAMS,
  calibratePlanet,
  chooseCommons,
  createTerrain,
  landFractionSampler,
  memoryWorld,
  type Calibration,
  type CommonsPlan,
  type ParcelRegistry,
  type TerrainField,
  type WorldRow,
} from "@echo/planet";

export interface Planet {
  commons: CommonsPlan;
  field: TerrainField;
  calibration: Calibration;
  world: WorldRow;
  landFraction: (cell: string) => number;
  backend: "memory" | "postgres";
  /**
   * The registry, built on first use.
   *
   * This is lazy for a reason that only showed up in production. Building it measures the land in
   * 284,004 cells, which is 33 seconds on a cold serverless instance, and the landing page does not
   * need any of it: the planet is drawn from terrain, and terrain plus calibration plus the twelve
   * commons costs about two hundred milliseconds. Making every caller of planet() pay for the
   * registry meant the hero waited half a minute for a number it does not show.
   */
  registry(): ParcelRegistry;
}

const SEED = process.env.PLANET_SEED ?? "echo-capacity-1";

/**
 * Bump this whenever the shape of Planet changes.
 *
 * The cache lives on globalThis so it survives Next's dev recompiles, which is the whole point of
 * it: rebuilding the world costs ten seconds. The cost of that is a stale object after a shape
 * change, which presents as a route reading a property that the running code adds and the cached
 * object does not have. Versioning the key is cheaper than remembering to restart.
 */
const PLANET_CACHE_VERSION = 3;

const g = globalThis as unknown as { __echoPlanet?: { version: number; seed: string; planet: Planet } };

export function planet(): Planet {
  const cached = g.__echoPlanet;
  if (cached && cached.version === PLANET_CACHE_VERSION && cached.seed === SEED) return cached.planet;

  const began = Date.now();
  const field = createTerrain(SEED);
  const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
  const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
  const commons = chooseCommons(
    PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution,
    landFraction,
    PLANET_PARAMS.minLandFraction,
  );

  const world = memoryWorld(
    PLANET_PARAMS,
    SEED,
    calibration.seaLevel,
    calibration.peakElevation,
    commons.cells,
    commons.reserved,
  );

  // Postgres is step 6 and works; wiring the pool in here is a deployment concern rather than a
  // rendering one, so the page runs on the in memory registry until DATABASE_URL is configured and
  // the seed script has been run against it.
  let registry: ParcelRegistry | null = null;

  const built: Planet = {
    commons,
    field,
    calibration,
    world,
    landFraction,
    backend: "memory",
    registry: () => {
      if (!registry) {
        const t = Date.now();
        registry = new MemoryRegistry(world, landFraction);
        console.log(`[planet] seeded the registry in ${((Date.now() - t) / 1000).toFixed(1)}s`);
      }
      return registry;
    },
  };
  g.__echoPlanet = { version: PLANET_CACHE_VERSION, seed: SEED, planet: built };
  console.log(
    `[planet] built ${SEED} in ${((Date.now() - began) / 1000).toFixed(1)}s, ` +
      `resolution ${world.startResolution}, ${commons.relocated} commons relocated, registry not yet seeded`,
  );
  return built;
}
