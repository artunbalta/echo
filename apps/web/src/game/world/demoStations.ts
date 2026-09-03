/**
 * The demo's stations, as data (contract, plan §4).
 *
 * Both the scatter's exclusions (A2) and the loop's placement (A4) read this file, so the two never
 * disagree about where a thing stands. Offsets are in TILES from the spawn point, x east, y south.
 * They are intentions, not final positions: the loop snaps each to the nearest walkable tile
 * (walkable = land, decision Q10) and the connectivity test proves every station is reachable from
 * the spawn on foot, not merely dry.
 *
 * The helpers at the bottom are the ONLY way to turn these tile offsets into the planet's local
 * metres (east, north): the y axis flips between the two frames, and a consumer that forgot would
 * exclude the mirror image of the footprint with every test still green.
 *
 * The vertical slice (Section A) builds only SLICE_STATIONS: the cave mouth and the campfire.
 *
 * The layout was laid out on the mirrored frame and verified on the ground; when the frame was
 * fixed (scene.ts: x is now east) every dx was negated so the same verified ground is used.
 */

import type { SpawnPoint } from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { tileToLocalM } from "./controller";

export interface Station {
  id: string;
  /** The prop kind to draw, from apps/web/src/game/props.ts PROP_KINDS, or a new world kind. */
  kind: string;
  dx: number;
  dy: number;
  /** What the label layer shows within CLOSE. */
  label: string;
  /** Radius in tiles within which the station's beat arms. */
  reachTiles: number;
}

export const DEMO_STATIONS: readonly Station[] = [
  { id: "campfire", kind: "campfire", dx: -4, dy: 3, label: "the fire", reachTiles: 2.2 },
  { id: "cave_mouth", kind: "gamble_cave", dx: -16, dy: -7, label: "a cave mouth", reachTiles: 2.2 },
  { id: "marker_stone", kind: "marker_stone", dx: 9, dy: 5, label: "a marker stone", reachTiles: 2.2 },
  { id: "fertile_patch", kind: "fertile_patch", dx: 5, dy: -8, label: "a fertile patch", reachTiles: 1.6 },
  { id: "berry_bush", kind: "berry_bush", dx: 2, dy: -9, label: "a berry bush", reachTiles: 1.6 },
  { id: "buried_cache", kind: "buried_cache", dx: -11, dy: 9, label: "disturbed ground", reachTiles: 1.6 },
  { id: "gull", kind: "gull_tangled", dx: -20, dy: 6, label: "a gull, tangled", reachTiles: 1.6 },
  { id: "witness", kind: "npc", dx: -23, dy: 3, label: "", reachTiles: 0 },
  { id: "homestead", kind: "path_marker", dx: 0, dy: 6, label: "your parcel", reachTiles: 3 },
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

/** The parcel's buildable footprint the scatter leaves clear, tiles from spawn, convex. */
export const DEMO_FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [-6, 0],
  [6, 0],
  [8, 6],
  [6, 12],
  [-6, 12],
  [-8, 6],
];

export function stationById(id: string): Station {
  const s = DEMO_STATIONS.find((x) => x.id === id);
  if (!s) throw new Error(`no demo station ${id}`);
  return s;
}

/** A tile offset from the spawn, as planet-local metres (east, north) from the anchor centre. */
export function offsetLocalM(spawn: SpawnPoint, dx: number, dy: number, tileM = TILE_M): [number, number] {
  const [xm, ym] = tileToLocalM(dx, dy, tileM);
  return [spawn.x + xm, spawn.y + ym];
}

/** A station's intended position in planet-local metres. */
export function stationLocalM(spawn: SpawnPoint, id: string, tileM = TILE_M): [number, number] {
  const s = stationById(id);
  return offsetLocalM(spawn, s.dx, s.dy, tileM);
}

/** The footprint polygon in planet-local metres, ready for assets.ts Exclusions.footprints. */
export function footprintLocalM(spawn: SpawnPoint, tileM = TILE_M): Array<[number, number]> {
  return DEMO_FOOTPRINT.map(([dx, dy]) => offsetLocalM(spawn, dx, dy, tileM));
}

/** Every path as a metre-space segment, for assets.ts Exclusions.paths. */
export function pathsLocalM(spawn: SpawnPoint, widthM: number, tileM = TILE_M): Array<{ a: [number, number]; b: [number, number]; widthM: number }> {
  const at = (id: string): [number, number] => (id === "spawn" ? [spawn.x, spawn.y] : stationLocalM(spawn, id, tileM));
  return DEMO_PATHS.map(([from, to]) => ({ a: at(from), b: at(to), widthM }));
}
