/**
 * World constants — the single source of truth shared by the PixiJS client and the
 * authoritative Colyseus server. Changing a number here changes it everywhere.
 *
 * Documented assumptions (§18): tile 16px, 64×64 map, 20Hz net tick, interaction
 * radius 1.5 tiles. Sprites are authored at 16px and rendered with NEAREST scaling.
 */
export const WORLD = {
  /** Logical tile size in source pixels. Upscaled on the client for crisp pixels. */
  TILE_SIZE: 16,
  /** Map dimensions in tiles. */
  MAP_WIDTH: 64,
  MAP_HEIGHT: 64,
  /** Client-side integer upscale factor for the pixel-art look. */
  RENDER_SCALE: 3,
  /** Player movement speed, tiles per second. */
  MOVE_SPEED: 4,
  /** Authoritative simulation + broadcast rate. */
  TICK_HZ: 20,
  /** Two entities can interact when within this many tiles of each other. */
  INTERACTION_RADIUS: 1.5,
  /** Max concurrent entities (users + NPCs) before a world shards. */
  ROOM_CAPACITY: 150,
} as const;

export const TICK_MS = 1000 / WORLD.TICK_HZ;

/** Pixel width/height of the full map (source pixels). */
export const MAP_PX = {
  width: WORLD.MAP_WIDTH * WORLD.TILE_SIZE,
  height: WORLD.MAP_HEIGHT * WORLD.TILE_SIZE,
} as const;

export type Facing = "down" | "up" | "left" | "right";

export const FACINGS: readonly Facing[] = ["down", "up", "left", "right"] as const;

/** Clamp a tile position into the playable map bounds. */
export function clampToMap(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD.MAP_WIDTH - 1, x)),
    y: Math.max(0, Math.min(WORLD.MAP_HEIGHT - 1, y)),
  };
}

/** Euclidean distance in tiles. */
export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
