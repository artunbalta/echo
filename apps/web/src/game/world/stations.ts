/**
 * Stations: the machinery for standing authored furniture on ground that will hold it.
 *
 * Nothing here knows what a campfire is or which cell it burns on. What is left once the demo's
 * tables are taken out is arithmetic between two frames and one deterministic search, and it moved
 * out of demoStations.ts when /parcel began running the same world as /demo. A parcel that is ever
 * given anything to stand on it needs exactly this and none of the demo's layout, and a file named
 * for the demo is a file the next author copies rather than calls.
 *
 * THE TWO FRAMES. Offsets are in TILES from a spawn, x east and y SOUTH; the planet's local metres
 * are x east and y NORTH. The helpers below are the ONLY way to cross between them: a consumer that
 * forgot the flip would exclude the mirror image of its own footprint with every test still green.
 * The flip itself lives once, in controller.ts (tileToLocalM for a point, footprintToLocalM for a
 * polygon), because scatterLayer.ts needs the same conversion and cannot import this file without a
 * cycle: the exclusion type flows from the layer to here.
 *
 * OFFSETS ARE INTENTIONS, NOT POSITIONS. `snapStations` moves each to the nearest walkable tile
 * that suits it (walkable = land, decision Q10), deterministically, so a table is never hand-tuned
 * to one cell's coastline and changing the cell stays the one-line edit it is supposed to be. What
 * a caller's test should assert is the SNAPPED layout, because that is the one the world builds.
 */

import type { Biome, SpawnPoint } from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { footprintToLocalM, tileToLocalM } from "./controller";
import { BUILDABLE_FOOTPRINT_TILES } from "./scatterLayer";

/**
 * What a cell's own furniture takes out of the scatter.
 *
 * The type is scatterLayer.ts's, because the layer is what consumes it, and it is re-exported here
 * so a table of stations has one address to read the machinery from. The shapes the helpers below
 * return are exactly what its fields take.
 */
export type { StationExclusions } from "./scatterLayer";

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

export function stationById(stations: readonly Station[], id: string): Station {
  const s = stations.find((x) => x.id === id);
  if (!s) throw new Error(`no station ${id}`);
  return s;
}

/** A tile offset from the spawn, as planet-local metres (east, north) from the anchor centre. */
export function offsetLocalM(spawn: SpawnPoint, dx: number, dy: number, tileM = TILE_M): [number, number] {
  const [xm, ym] = tileToLocalM(dx, dy, tileM);
  return [spawn.x + xm, spawn.y + ym];
}

/** A station's intended position in planet-local metres. */
export function stationLocalM(stations: readonly Station[], spawn: SpawnPoint, id: string, tileM = TILE_M): [number, number] {
  const s = stationById(stations, id);
  return offsetLocalM(spawn, s.dx, s.dy, tileM);
}

/**
 * A buildable plot in planet-local metres, ready for assets.ts Exclusions.footprints.
 *
 * The default is the layer's own six points rather than a second copy of them, because two tables
 * of the same hexagon is how one of them ends up a tile out and nobody notices: a footprint that is
 * short excludes the wrong ground and every test stays green.
 */
export function footprintLocalM(
  spawn: SpawnPoint,
  tiles: ReadonlyArray<readonly [number, number]> = BUILDABLE_FOOTPRINT_TILES,
  tileM = TILE_M,
): Array<[number, number]> {
  return footprintToLocalM(spawn, tiles, tileM);
}

/** Every path as a metre-space segment, for assets.ts Exclusions.paths. "spawn" is the spawn. */
export function pathsLocalM(
  stations: readonly Station[],
  paths: ReadonlyArray<readonly [string, string]>,
  spawn: SpawnPoint,
  widthM: number,
  tileM = TILE_M,
): Array<{ a: [number, number]; b: [number, number]; widthM: number }> {
  const at = (id: string): [number, number] => (id === "spawn" ? [spawn.x, spawn.y] : stationLocalM(stations, spawn, id, tileM));
  return paths.map(([from, to]) => ({ a: at(from), b: at(to), widthM }));
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
export function snapStations(stations: readonly Station[], spawn: SpawnPoint, world: SnapWorld, tileM = TILE_M): SnappedStation[] {
  const out: SnappedStation[] = [];
  const placedById = new Map<string, SnappedStation>();
  // Anything anchored to another station is placed after it, so it can follow where it went.
  const order = [...stations].sort((a, b) => Number(Boolean(a.relativeTo)) - Number(Boolean(b.relativeTo)));
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
  return stations.map((s) => placedById.get(s.id)).filter((s): s is SnappedStation => Boolean(s));
}
