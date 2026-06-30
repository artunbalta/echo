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
  /** Map dimensions in tiles. The shared ocean is the archipelago extent (= OCEAN.EXTENT in
   *  archipelago.ts), so the 100 phyllotaxis island slots sit at their RAW coordinates in one sea
   *  (no compression) — one continuous ocean, not 100 maps. (The retired 64-tile main-world/venue/
   *  town scenes generate their own dimensions, so this only resizes the shared world.) */
  MAP_WIDTH: 512,
  MAP_HEIGHT: 512,
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

// ── distance-based presence (the one shared ocean, ECHO build prompt §2) ─────────────────────────
// Presence falls off with distance: far life is an anonymous silhouette; it resolves into a real,
// named, interactable person as you approach. CLOSE is pinned to the server's interaction-open gate
// (INTERACTION_RADIUS + 0.5) so the client's "social enabled" boundary is EXACTLY where the server
// would allow an interaction — the Flow-0 solitary baseline cannot leak (no social below CLOSE).
// Tunable here; distances are in tiles on the 128-tile ocean (cluster neighbours sit ~6 tiles apart).
export const PRESENCE = {
  /** Tier 1 — full sharp named avatar + interaction + social ENABLED. */
  CLOSE: WORLD.INTERACTION_RADIUS + 0.5, // = 2.0
  /** Tier 2 — sprite + name resolve in (alpha lerp CLOSE..APPROACH); NO social. */
  APPROACH: 5.0,
  /** Tier 3 — faint anonymous silhouette (no name, no interaction); the "someone is out there"
   *  band runs APPROACH..HORIZON. Beyond HORIZON, cull entirely (over the horizon). */
  HORIZON: 40.0,
  /** Silhouette opacity at Tier 3 (lerps up to 1.0 across Tier 2). */
  SILHOUETTE_ALPHA: 0.22,
} as const;

export type PresenceTier = "close" | "approaching" | "distant" | "over_horizon";

/** The presence tier of something `d` tiles from the local player (pure; client + tests share it). */
export function presenceTier(d: number): PresenceTier {
  if (d <= PRESENCE.CLOSE) return "close";
  if (d <= PRESENCE.APPROACH) return "approaching";
  if (d <= PRESENCE.HORIZON) return "distant";
  return "over_horizon";
}

/** Render opacity for a remote at distance `d`: full when CLOSE, lerps down through APPROACH, holds
 *  at SILHOUETTE_ALPHA through DISTANT, 0 beyond the horizon. */
export function presenceAlpha(d: number): number {
  if (d <= PRESENCE.CLOSE) return 1;
  if (d > PRESENCE.HORIZON) return 0;
  if (d <= PRESENCE.APPROACH) {
    const t = (d - PRESENCE.CLOSE) / (PRESENCE.APPROACH - PRESENCE.CLOSE); // 0 at CLOSE → 1 at APPROACH
    return 1 - t * (1 - PRESENCE.SILHOUETTE_ALPHA);
  }
  return PRESENCE.SILHOUETTE_ALPHA;
}
