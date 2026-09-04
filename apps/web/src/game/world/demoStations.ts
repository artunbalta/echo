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
 * exclude the mirror image of the footprint with every test still green. The flip itself lives
 * once, in controller.ts (tileToLocalM for a point, footprintToLocalM for a polygon), because the
 * scatter layer needs the same conversion and cannot import this file without a cycle: the
 * exclusion type flows from the layer to here. It wrote its own copy for exactly that reason and
 * that copy is gone.
 *
 * The vertical slice (Section A) builds only SLICE_STATIONS: the cave mouth and the campfire.
 *
 * OFFSETS ARE INTENTIONS, NOT POSITIONS. `snapStations` moves each to the nearest walkable tile
 * that suits it, deterministically, so changing DEMO_CELL is the one-line edit it is supposed to
 * be: nothing here is hand-tuned to one cell's coastline, and the test asserts the SNAPPED
 * positions are on land and reachable, which is the property that actually matters.
 */

import type { Biome, SpawnPoint } from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { footprintToLocalM, tileToLocalM } from "./controller";
import { BUILDABLE_FOOTPRINT_TILES, type ScatterLayerOptions, type StationExclusions } from "./scatterLayer";

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
  /** Biomes this station belongs in. The snap prefers them; it never refuses to place. */
  prefer?: readonly Biome[];
  /** How far the snap may move it, in tiles, before it settles for any walkable ground. */
  snapTiles?: number;
  /**
   * Place this one relative to another station's SNAPPED position rather than to the spawn. The
   * F5 witness has to stand just outside CLOSE of the gull, and the gull moves to find its shore,
   * so the witness has to move with it or the privacy condition it exists to create is lost.
   */
  relativeTo?: string;
}

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
  return footprintToLocalM(spawn, DEMO_FOOTPRINT, tileM);
}

/** Every path as a metre-space segment, for assets.ts Exclusions.paths. */
export function pathsLocalM(spawn: SpawnPoint, widthM: number, tileM = TILE_M): Array<{ a: [number, number]; b: [number, number]; widthM: number }> {
  const at = (id: string): [number, number] => (id === "spawn" ? [spawn.x, spawn.y] : stationLocalM(spawn, id, tileM));
  return DEMO_PATHS.map(([from, to]) => ({ a: at(from), b: at(to), widthM }));
}

/** What the demo's own furniture takes out of the scatter, metres. */
const STATION_CLEAR_M = 3;
const PATH_WIDTH_M = 3.2;
const SIGHT_WIDTH_M = 5;

/**
 * What the scatter has to dress around on the demo cell, and the reason scatterLayer.ts no longer
 * imports this file.
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
/**
 * The demo's scatter, as one value.
 *
 * This exists because of a regression that a green suite hid. The layer was made cell-agnostic and
 * its exclusions stopped defaulting to these stations, which is right: a parcel has no campfire.
 * But DemoClient kept calling `scatterLayer()` bare while the test called it with the stations
 * passed in, above a comment claiming the two were the same call. They were not. The demo lost both
 * station clearings, all five path sweeps and both sightlines, and put a fourteen metre buttress
 * tree 2.69 m from the cave mouth, which is the station the player spawns facing and the slice's
 * only action. Every test stayed green, because the test was measuring a configuration that
 * shipped nowhere.
 *
 * So the demo's layer arguments are a value now, not a shape repeated at two call sites. The app
 * passes THIS and the test asserts against THIS, which is what makes a passing test a statement
 * about what is on screen.
 */
export const DEMO_SCATTER: ScatterLayerOptions = {
  stations: (ctx) => demoStationExclusions(ctx.region.spawn, ctx.frame.tileM),
};

export function demoStationExclusions(spawn: SpawnPoint, tileM = TILE_M): StationExclusions {
  const [presenceX, presenceY] = offsetLocalM(spawn, DEMO_PRESENCE_HOME.dx, DEMO_PRESENCE_HOME.dy, tileM);
  return {
    clearings: SLICE_STATIONS.map((id) => {
      const [x, y] = stationLocalM(spawn, id, tileM);
      return { x, y, radiusM: STATION_CLEAR_M };
    }),
    paths: pathsLocalM(spawn, PATH_WIDTH_M, tileM),
    // Two lines the player must be able to SEE along, which is not the same as walk along: the
    // station they spawn facing, and the other presence's home.
    sightlines: [
      { a: [spawn.x, spawn.y], b: stationLocalM(spawn, SPAWN_FACES, tileM), widthM: SIGHT_WIDTH_M },
      { a: [spawn.x, spawn.y], b: [presenceX, presenceY], widthM: SIGHT_WIDTH_M },
    ],
  };
}

// ── the snap (the one thing that makes a cell swap a one-line edit) ─────────────

export interface SnappedStation extends Station {
  /** Tiles from the spawn, after snapping. */
  x: number;
  y: number;
  /** Planet-local metres. */
  xm: number;
  ym: number;
  /** The biome it ended up in. */
  biome: Biome;
  /** How far the snap had to move it, in tiles. 0 when the intention was already good. */
  movedTiles: number;
  /** True only when the station WANTED a biome and could not get it. A station with no
   *  preference is never "settled": it had nothing to settle for. */
  settled: boolean;
}

export interface SnapWorld {
  /** Tile offsets are relative to the spawn; this asks the world in the SAME frame. */
  walkable(dxTiles: number, dyTiles: number): boolean;
  biome(dxTiles: number, dyTiles: number): Biome;
  /** Optional: reject a candidate the player could not actually walk to. */
  reachable?(dxTiles: number, dyTiles: number): boolean;
}

/**
 * Move every station to the nearest tile that will hold it.
 *
 * The search is a deterministic ring walk outward from the intention, so the same cell always
 * produces the same layout, and it is tried twice: first insisting on the station's preferred
 * biomes, then taking any walkable ground. A station with no preference only runs the second pass.
 */
export function snapStations(spawn: SpawnPoint, world: SnapWorld, tileM = TILE_M): SnappedStation[] {
  const out: SnappedStation[] = [];
  const placedById = new Map<string, SnappedStation>();
  // Anything anchored to another station is placed after it, so it can follow where it went.
  const order = [...DEMO_STATIONS].sort((a, b) => Number(Boolean(a.relativeTo)) - Number(Boolean(b.relativeTo)));
  for (const s of order) {
    const anchor = s.relativeTo ? placedById.get(s.relativeTo) : undefined;
    if (s.relativeTo && !anchor) continue; // its anchor could not be placed; neither can it
    const baseX = (anchor?.x ?? 0) + s.dx;
    const baseY = (anchor?.y ?? 0) + s.dy;
    const limit = s.snapTiles ?? 10;
    const ok = (x: number, y: number, wantBiome: boolean): boolean => {
      if (!world.walkable(x, y)) return false;
      if (world.reachable && !world.reachable(x, y)) return false;
      if (wantBiome && s.prefer && !s.prefer.includes(world.biome(x, y))) return false;
      return true;
    };
    let found: { x: number; y: number; settled: boolean } | null = null;
    for (const wantBiome of s.prefer ? [true, false] : [false]) {
      for (let r = 0; r <= limit && !found; r++) {
        // A ring at radius r, walked in a fixed order so the choice is reproducible.
        for (let dx = -r; dx <= r && !found; dx++) {
          for (const dy of r === 0 ? [0] : [-r, r]) {
            if (ok(baseX + dx, baseY + dy, wantBiome)) found = { x: baseX + dx, y: baseY + dy, settled: Boolean(s.prefer) && !wantBiome };
            if (found) break;
          }
        }
        for (let dy = -r + 1; dy <= r - 1 && !found; dy++) {
          for (const dx of [-r, r]) {
            if (ok(baseX + dx, baseY + dy, wantBiome)) found = { x: baseX + dx, y: baseY + dy, settled: Boolean(s.prefer) && !wantBiome };
            if (found) break;
          }
        }
      }
      if (found) break;
    }
    if (!found) continue; // nothing walkable within the limit: the caller reports it as missing
    const [xm, ym] = offsetLocalM(spawn, found.x, found.y, tileM);
    const snappedStation: SnappedStation = {
      ...s,
      x: found.x,
      y: found.y,
      xm,
      ym,
      biome: world.biome(found.x, found.y),
      movedTiles: Math.hypot(found.x - baseX, found.y - baseY),
      settled: found.settled,
    };
    placedById.set(s.id, snappedStation);
    out.push(snappedStation);
  }
  // Back into the authored order, so a caller reading the list sees the table it wrote.
  return DEMO_STATIONS.map((s) => placedById.get(s.id)).filter((s): s is SnappedStation => Boolean(s));
}
