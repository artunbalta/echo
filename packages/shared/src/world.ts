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
  /** Map dimensions in tiles. The shared ocean holds the 100 phyllotaxis island slots scaled up from
   *  the archipelago extent (OCEAN.EXTENT, archipelago.ts) by SCALE = MAP/EXTENT = 768/128 = 6. At
   *  this size adjacent islands sit ~36 tiles apart with radius-13 land (OCEAN_ISLAND_R) — ~10 tiles
   *  of open water between their grass edges, a clearly readable stretch of sea you SAIL across, with
   *  each island a real place to roam. (The retired 64-tile main-world/venue/town scenes generate
   *  their own dimensions, so this only resizes the shared world.) */
  MAP_WIDTH: 768,
  MAP_HEIGHT: 768,
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

/**
 * Survival-clock constants (ECHO_PLAYABLE_BLUEPRINT.md Part I / VII.1) — the island day's
 * three clocks share one source of truth, mirroring the WORLD pattern: client (useDay),
 * server persistence (wall-clock decay on load), and tests all read these.
 *
 * The three clocks: VITALITY (you decay unless you sustain yourself), DAYLIGHT (the day is
 * a finite budget, closed at the campfire), SEASON/DECAY (world state ages between sessions).
 * Difficulty comes ONLY from scarcity + irreversibility — never a score (Law 1).
 */
export const SURVIVAL = {
  /** One island day of real time (~8 min of daylight). The campfire `end` may close it sooner. */
  DAY_MS: 8 * 60 * 1000,
  VITALITY_MAX: 100,
  /** Baseline decay in vitality points per real minute; scaled by scarcityMultiplier(). */
  VITALITY_DRAIN_PER_MIN: 6,
  /** The grain ripens partway through the day (was a local const in IslandClient). */
  GROW_MS: 14_000,
  /** Wall-clock decay applied when a session resumes — the teeth of irreversibility. */
  DECAY: {
    /** A planted/ripe crop left untended this long has wilted by your return. */
    CROP_WILT_MS: 36 * 3600 * 1000,
    /** Fraction of structure progress a half-built structure loses per elapsed day. */
    STRUCT_WEATHER_PER_DAY: 0.05,
    /** How much a tended tie's warmth cools toward baseline per elapsed day. */
    TIE_COOL_PER_DAY: 0.08,
  },
  /** Multiplier on vitality drain + fork stakes: NORMAL at scarcity 0 → LEAN at scarcity 1. */
  SCARCITY: { LEAN: 1.6, NORMAL: 1.0 },
} as const;

/** Drain/stakes multiplier for a continuous scarcity_level in [0,1] (EventContext scale). */
export function scarcityMultiplier(level01: number): number {
  const t = Math.max(0, Math.min(1, level01));
  return SURVIVAL.SCARCITY.NORMAL + (SURVIVAL.SCARCITY.LEAN - SURVIVAL.SCARCITY.NORMAL) * t;
}

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

// ── distance-based presence (the one shared ocean, ECHO build prompt §2 + Step-6 polish #5) ────────
// Presence gates IDENTITY and MEASUREMENT by distance — NEVER visibility. Every player/NPC renders as
// a full, SHARP, fully-visible avatar at any distance (you see who's out there across the water, not a
// dim ghost); only the NAME resolves in within near range, and social cues / posterior movement fire
// ONLY at Tier 1 (CLOSE). CLOSE is pinned to the server's interaction-open gate (INTERACTION_RADIUS +
// 0.5) so the client's "named + social" boundary is EXACTLY where the server would allow an
// interaction — the Flow-0 solitary baseline cannot leak (no naming/social below CLOSE). Tunable here;
// distances are in tiles on the 128-tile slot field (cluster neighbours sit ~6 slot-tiles apart).
export const PRESENCE = {
  /** Tier 1 — named + interaction + social ENABLED (the ONLY tier that names or measures). */
  CLOSE: WORLD.INTERACTION_RADIUS + 0.5, // = 2.0
  /** Tier 2 — near band (held for future near-range affordances); still no naming/social. */
  APPROACH: 5.0,
  /** Tier 3 — the far band ("someone is out there"): a sharp, fully visible, but ANONYMOUS and
   *  non-interactable person. Runs APPROACH..HORIZON; beyond HORIZON is "over the horizon" — still
   *  rendered sharp (no cull; see PixiWorld.drawEntity), just the outer label for the partition. */
  HORIZON: 40.0,
} as const;

export type PresenceTier = "close" | "approaching" | "distant" | "over_horizon";

/** The presence tier of something `d` tiles from the local player (pure; client + tests share it).
 *  Drives the name gate (a remote is named only at "close") and mirrors the server-authoritative
 *  social gate (interactions/cues only at CLOSE). Render is sharp at every tier — see #5. */
export function presenceTier(d: number): PresenceTier {
  if (d <= PRESENCE.CLOSE) return "close";
  if (d <= PRESENCE.APPROACH) return "approaching";
  if (d <= PRESENCE.HORIZON) return "distant";
  return "over_horizon";
}
