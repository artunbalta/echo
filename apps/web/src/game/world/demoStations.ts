/**
 * The demo's stations, as data (contract, plan §4).
 *
 * Both the scatter's exclusions (A2) and the loop's placement (A4) read this file, so the two never
 * disagree about where a thing stands. Offsets are in TILES from the spawn point, x east, y south.
 * They are intentions, not final positions: the loop snaps each to the nearest walkable tile and
 * the connectivity test proves every station is reachable from the spawn on foot, not merely dry.
 *
 * WHAT IS AND IS NOT HERE. This file is one world's layout: nine stations, five paths, two
 * sightlines and the widths they are swept at, all of it authored for the cell the demo is set on.
 * The machinery that reads a table like it, the frame conversions and the snap, is stations.ts,
 * because a parcel that is ever given something to stand on it needs that and none of this. C15
 * says the demo's two structures appear on DEMO_CELL and nowhere else, so nothing below may become
 * anybody's default.
 *
 * The vertical slice (Section A) builds only SLICE_STATIONS: the cave mouth and the campfire.
 */

import type { SpawnPoint } from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { BUILDABLE_FOOTPRINT_TILES, type ScatterLayerOptions } from "./scatterLayer";
import { offsetLocalM, pathsLocalM, stationLocalM, type Station, type StationExclusions } from "./stations";

export const DEMO_STATIONS: readonly Station[] = [
  { id: "campfire", kind: "campfire", dx: -4, dy: 3, label: "the fire", reachTiles: 2.2, snapTiles: 8 },
  { id: "cave_mouth", kind: "gamble_cave", dx: -16, dy: -7, label: "a cave mouth", reachTiles: 2.2, snapTiles: 14 },
  { id: "marker_stone", kind: "marker_stone", dx: 9, dy: 5, label: "a marker stone", reachTiles: 2.2, snapTiles: 10 },
  { id: "fertile_patch", kind: "fertile_patch", dx: 5, dy: -8, label: "a fertile patch", reachTiles: 1.6, prefer: ["rainforest", "forest", "grassland", "savanna", "taiga"], snapTiles: 12 },
  { id: "berry_bush", kind: "berry_bush", dx: 2, dy: -9, label: "a berry bush", reachTiles: 1.6, prefer: ["rainforest", "forest", "grassland", "taiga"], snapTiles: 12 },
  { id: "buried_cache", kind: "buried_cache", dx: -11, dy: 9, label: "disturbed ground", reachTiles: 1.6, snapTiles: 10 },
  { id: "gull", kind: "gull_tangled", dx: -20, dy: 6, label: "a gull, tangled", reachTiles: 1.6, prefer: ["beach"], snapTiles: 200 },
  { id: "witness", kind: "npc", dx: 3, dy: -3, label: "", reachTiles: 0, snapTiles: 8, relativeTo: "gull" },
  { id: "homestead", kind: "path_marker", dx: 0, dy: 6, label: "your parcel", reachTiles: 3, snapTiles: 6 },
];

/** The other presence's home and wander radius, tiles from spawn. On the spawn's line of sight. */
export const DEMO_PRESENCE_HOME = { dx: -24, dy: 10, wanderTiles: 6 } as const;

/** Paths the scatter keeps clear and the path layer draws, by station id ("spawn" is the spawn). */
export const DEMO_PATHS: ReadonlyArray<readonly [string, string]> = [
  ["spawn", "cave_mouth"],
  ["spawn", "campfire"],
  ["spawn", "marker_stone"],
  ["campfire", "fertile_patch"],
  ["cave_mouth", "gull"],
];

/** Which station the player faces at spawn. The cave is the slice's one action. */
export const SPAWN_FACES = "cave_mouth";

/** Section A: the vertical slice builds these and nothing else. */
export const SLICE_STATIONS: readonly string[] = ["cave_mouth", "campfire"];

/**
 * The parcel's buildable footprint the scatter leaves clear, tiles from spawn, convex.
 *
 * The six points now live in scatterLayer.ts, which is their only consumer and the one place that
 * has to have a footprint for a cell nobody authored. They never were demo data: they name no cell,
 * no biome and no station. The name stays here so the loop's marker and the test that proves the
 * polygon convex keep reading it from the file that owns the demo's layout.
 */
export const DEMO_FOOTPRINT: ReadonlyArray<readonly [number, number]> = BUILDABLE_FOOTPRINT_TILES;

/** What the demo's own furniture takes out of the scatter, metres. */
const STATION_CLEAR_M = 3;
const PATH_WIDTH_M = 3.2;
const SIGHT_WIDTH_M = 5;

/**
 * The demo's scatter, as one value.
 *
 * This exists because of a regression that a green suite hid. The layer was made cell-agnostic and
 * its exclusions stopped defaulting to these stations, which is right: a parcel has no campfire.
 * But the demo's own mount kept calling `scatterLayer()` bare while the test called it with the
 * stations passed in, above a comment claiming the two were the same call. They were not. The demo
 * lost both station clearings, all five path sweeps and both sightlines, and put a 14 m buttress
 * tree 2.69 m from the cave mouth, which is the station the player spawns facing and the slice's
 * only action. Every test stayed green, because the test was measuring a configuration that
 * shipped nowhere.
 *
 * So the demo's layer arguments are a value now, not a shape repeated at two call sites, and there
 * is one call site left: parcelWorld.ts, which passes THIS wherever it is given a slice. The test
 * takes its layer out of that same list, which is what makes a passing test a statement about what
 * is on screen.
 */
export const DEMO_SCATTER: ScatterLayerOptions = {
  stations: (ctx) => demoStationExclusions(ctx.region.spawn, ctx.frame.tileM),
};

/**
 * What the scatter has to dress around on the demo cell, and the reason scatterLayer.ts does not
 * import this file.
 *
 * A parcel has none of this. The layer's own floor, the buildable footprint and the spawn clearing,
 * is everything a bare cell needs; the two slice stations, the five paths and the two sightlines
 * are furniture that exists only because the demo builds it, and defaulting to them elsewhere would
 * carve corridors toward a campfire that is not there. The widths live here for the same reason:
 * 3 m of bare ground per station, a 3.2 m path, a 5 m sightline are decisions about THIS world.
 *
 * Positions are the AUTHORED intentions, not the snapped ones. The snap is the loop's business and
 * it runs later in the frame order; on the demo cell it moves neither slice station at all, and the
 * paths already sweep a cleared band from the spawn to each of them, so the intention is what the
 * ground is dressed around.
 */
export function demoStationExclusions(spawn: SpawnPoint, tileM = TILE_M): StationExclusions {
  const [presenceX, presenceY] = offsetLocalM(spawn, DEMO_PRESENCE_HOME.dx, DEMO_PRESENCE_HOME.dy, tileM);
  return {
    clearings: SLICE_STATIONS.map((id) => {
      const [x, y] = stationLocalM(DEMO_STATIONS, spawn, id, tileM);
      return { x, y, radiusM: STATION_CLEAR_M };
    }),
    paths: pathsLocalM(DEMO_STATIONS, DEMO_PATHS, spawn, PATH_WIDTH_M, tileM),
    // Two lines the player must be able to SEE along, which is not the same as walk along: the
    // station they spawn facing, and the other presence's home.
    sightlines: [
      { a: [spawn.x, spawn.y], b: stationLocalM(DEMO_STATIONS, spawn, SPAWN_FACES, tileM), widthM: SIGHT_WIDTH_M },
      { a: [spawn.x, spawn.y], b: [presenceX, presenceY], widthM: SIGHT_WIDTH_M },
    ],
  };
}
