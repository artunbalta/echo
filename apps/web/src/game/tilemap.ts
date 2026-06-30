/**
 * Procedural tilemap (Phase 1). A real Tiled JSON map can be dropped in later; the
 * renderer only needs the {ground, decorations, collision} shape this produces.
 * Deterministic from a seed so client and (future) server agree on collision.
 */
import { WORLD, oceanIslandCenters, OCEAN_ISLAND_R, OCEAN_BEACH_W } from "@echo/shared";

export type DecoKind = "tree" | "bush" | "flower";

export interface Decoration {
  kind: DecoKind;
  x: number; // tile
  y: number;
}

/** A doorway the player can step into to travel to another scene (e.g. the venue). */
export interface Portal {
  x: number; // tile (top-left of the footprint)
  y: number;
  w: number; // footprint width in tiles
  h: number; // footprint height in tiles
}

/** One island in an archipelago: centre (tile units) + approximate radius. */
export interface IslandInfo {
  x: number;
  y: number;
  r: number;
  home?: boolean; // the player's own island (where the day's stations live)
}

export interface TileMap {
  width: number;
  height: number;
  collision: Uint8Array; // width*height, 1 = blocked
  /** Optional water mask (width*height, 1 = sea). When present the renderer draws an ocean
   *  ground with the land tiles (and a sand beach where land meets water) painted on top. */
  water?: Uint8Array;
  decorations: Decoration[];
  /** The venue doorway — only the main world has one; the single-player island has none. */
  portal?: Portal | null;
  /** Archipelago metadata: where the home island sits and where the others are (for spawn,
   *  station placement, and "sail to the nearest island"). */
  homeCenter?: { x: number; y: number };
  islands?: IslandInfo[];
  /** True ONLY for THE shared ocean (generateOcean): its islands are perfect discs at the shared
   *  ocean.ts slot geometry, so collision + the coastline render use the continuous oceanLandAt
   *  geometry rather than the per-tile array. Other watered maps (the wobbly generateArchipelago,
   *  the single generateIslandMap) leave this unset and use the per-tile masks/collision. */
  sharedOcean?: boolean;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTileMap(seed = 7): TileMap {
  const W = WORLD.MAP_WIDTH;
  const H = WORLD.MAP_HEIGHT;
  const r = rng(seed);
  const collision = new Uint8Array(W * H);
  const decorations: Decoration[] = [];

  // A portal doorway stands at the world's north edge; a clear corridor links it to the plaza.
  const portal: Portal = { x: Math.round(W / 2) - 1, y: 2, w: 2, h: 1 };
  const portalOpening = (x: number, y: number) =>
    x >= portal.x - 2 && x <= portal.x + portal.w + 1 && y >= 0 && y <= Math.round(H / 2);

  const keepClear = (x: number, y: number) => {
    // keep the central spawn plaza and the corridor up to the portal open
    const cx = W / 2,
      cy = H / 2;
    return Math.hypot(x - cx, y - cy) < 6 || portalOpening(x, y);
  };

  // Border ring of trees (leaving a gap at the top for the portal doorway).
  for (let x = 0; x < W; x++) {
    for (const y of [0, 1, H - 2, H - 1]) {
      if (portalOpening(x, y)) continue;
      if (r() < 0.7) {
        decorations.push({ kind: "tree", x, y });
        collision[y * W + x] = 1;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (const x of [0, 1, W - 2, W - 1]) {
      if (r() < 0.7) {
        decorations.push({ kind: "tree", x, y });
        collision[y * W + x] = 1;
      }
    }
  }

  // Scattered clusters of trees + bushes + flowers.
  const clusters = 28;
  for (let i = 0; i < clusters; i++) {
    const cx = 4 + Math.floor(r() * (W - 8));
    const cy = 4 + Math.floor(r() * (H - 8));
    const size = 2 + Math.floor(r() * 4);
    for (let j = 0; j < size; j++) {
      const x = Math.max(2, Math.min(W - 3, cx + Math.floor((r() - 0.5) * 6)));
      const y = Math.max(2, Math.min(H - 3, cy + Math.floor((r() - 0.5) * 6)));
      if (keepClear(x, y)) continue;
      const k = r();
      if (k < 0.45) {
        decorations.push({ kind: "tree", x, y });
        collision[y * W + x] = 1;
      } else if (k < 0.8) {
        decorations.push({ kind: "bush", x, y });
        collision[y * W + x] = 1;
      } else {
        decorations.push({ kind: "flower", x, y }); // non-blocking
      }
    }
  }

  return { width: W, height: H, collision, decorations, portal };
}

/**
 * Stamp one island (a wobbly blob of land + beach) into the sea masks at (cx,cy). Used to build
 * the archipelago. Scatters a few trees/bushes/flowers on the inner land; the home island leaves
 * its plaza/stations clear (decor handled by the caller for home).
 */
function stampIsland(
  water: Uint8Array,
  collision: Uint8Array,
  decorations: Decoration[],
  W: number,
  H: number,
  cx: number,
  cy: number,
  radius: number,
  seed: number,
  withDecor: boolean,
) {
  const r = rng(seed);
  const SEGS = 36;
  const wobble = Array.from({ length: SEGS }, () => 0.82 + r() * 0.4);
  const landAt = (x: number, y: number) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const ang = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * SEGS;
    const i = Math.floor(ang) % SEGS;
    const next = (i + 1) % SEGS;
    const f = ang - Math.floor(ang);
    return Math.hypot(dx, dy) < radius * (wobble[i] * (1 - f) + wobble[next] * f);
  };
  const x0 = Math.max(0, Math.floor(cx - radius - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius + 2));
  const y0 = Math.max(0, Math.floor(cy - radius - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (landAt(x, y)) {
        water[y * W + x] = 0;
        collision[y * W + x] = 0;
      }
    }
  }
  if (!withDecor) return;
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && water[y * W + x] === 0;
  const onBeach = (x: number, y: number) => !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1);
  const count = Math.round(radius * 1.2);
  for (let i = 0; i < count; i++) {
    const x = Math.round(cx + (r() - 0.5) * radius * 1.6);
    const y = Math.round(cy + (r() - 0.5) * radius * 1.6);
    if (!isLand(x, y) || onBeach(x, y)) continue;
    const k = r();
    if (k < 0.45) {
      decorations.push({ kind: "tree", x, y });
      collision[y * W + x] = 1;
    } else if (k < 0.72) {
      decorations.push({ kind: "bush", x, y });
      collision[y * W + x] = 1;
    } else {
      decorations.push({ kind: "flower", x, y });
    }
  }
}

/**
 * The endless world (the user's vision): one large sea holding many islands. The player's own
 * island sits at the centre (the camera keeps it centred); a ring of other islands — empty for
 * now, since they have no owners yet — dots the water around it. Once you've built the raft you
 * can sail across the sea to reach them. New signups claim the empty island nearest the last
 * signup (server-side, db/migrations/0004_islands.sql) so the world fills in organically.
 */
export function generateArchipelago(seed = 7): TileMap {
  const W = 110;
  const H = 110;
  const collision = new Uint8Array(W * H).fill(1); // everything starts as (blocked) sea
  const water = new Uint8Array(W * H).fill(1);
  const decorations: Decoration[] = [];
  const cx = Math.round(W / 2);
  const cy = Math.round(H / 2);

  const islands: IslandInfo[] = [{ x: cx, y: cy, r: 9, home: true }];
  // Neighbour islands: a near ring (glimpsable from home across the water) and a far ring
  // (discovered by sailing) — a believable, non-uniform archipelago.
  const offsets: [number, number, number][] = [
    [-19, -6, 7], [19, -8, 7], [-5, -21, 6], [7, 21, 7], [-21, 15, 7], [22, 17, 6], // near ring ~18-26
    [-16, 34, 6], [36, 4, 6], [-37, -3, 7], [5, -37, 6], [35, -30, 7], [-33, -30, 6], // far ring ~30-45
  ];
  for (const [dx, dy, r] of offsets) islands.push({ x: cx + dx, y: cy + dy, r });

  // Home island first (no auto-decor — its stations + clearings are placed by IslandClient),
  // then the neighbours (with a little scenery so they read as real places).
  islands.forEach((isl, idx) =>
    stampIsland(water, collision, decorations, W, H, isl.x, isl.y, isl.r, seed + idx * 101, idx > 0),
  );
  // A light scatter of trees on the home island, kept away from the central plaza.
  const r = rng(seed + 999);
  for (let i = 0; i < 8; i++) {
    const x = Math.round(cx + (r() - 0.5) * 14);
    const y = Math.round(cy + (r() - 0.5) * 14);
    if (water[y * W + x] === 1) continue;
    if (Math.hypot(x - cx, y - cy) < 6) continue; // keep the plaza + stations open
    decorations.push({ kind: r() < 0.6 ? "tree" : "bush", x, y });
    collision[y * W + x] = 1;
  }

  return { width: W, height: H, collision, water, decorations, portal: null, homeCenter: { x: cx, y: cy }, islands };
}

/**
 * THE ONE SHARED OCEAN. A single WORLD.MAP-tile sea holding the 100 archipelago islands as REAL,
 * BOUNDED, contiguous landmasses (smooth discs at their scaled slot coordinates, ringed by a sand
 * beach), separated by open water. Each island is big enough to play Flow 0 on; the open sea between
 * them is a MOVEMENT BARRIER — `collision[]=1` on water (so PixiWorld.blockedAt blocks it unless
 * sailing) and the authoritative server enforces the same wall in WorldRoom.integrate via the SAME
 * shared geometry (ocean.ts oceanLandAt). You don't walk the sea; you sail across it.
 *
 * Land/water are derived from the shared ocean geometry, so the rendered coastline, the client wall,
 * and the server wall are one source of truth. Deterministic — a pure function of the slot layout.
 */
export function generateOcean(): TileMap {
  const W = WORLD.MAP_WIDTH;
  const H = WORLD.MAP_HEIGHT;
  const collision = new Uint8Array(W * H).fill(1); // 1 = blocked: the open sea is a wall (unless sailing)
  const water = new Uint8Array(W * H).fill(1); // 1 = sea; islands punch land (0) into it
  const decorations: Decoration[] = [];
  const islands: IslandInfo[] = [];
  const R = OCEAN_ISLAND_R; // land radius (grass); sand ring extends OCEAN_BEACH_W beyond
  const reach = Math.ceil(R + OCEAN_BEACH_W) + 1;

  for (const c of oceanIslandCenters()) {
    islands.push({ x: c.x, y: c.y, r: R });
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        // exact distance to the (fractional) centre keeps the coastline a smooth contiguous circle
        const d = Math.hypot(x - c.x, y - c.y);
        if (d <= R + OCEAN_BEACH_W) {
          water[y * W + x] = 0; // land (grass core + sand ring): renders as island, not sea
          collision[y * W + x] = 0; // walkable — only the open sea blocks
        }
      }
    }
    decorations.push({ kind: "tree", x: cx, y: cy }); // a centre landmark
  }

  return { width: W, height: H, collision, water, decorations, portal: null, islands, sharedOcean: true };
}

export function isBlocked(map: TileMap, tileX: number, tileY: number): boolean {
  const x = Math.round(tileX);
  const y = Math.round(tileY);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.collision[y * map.width + x] === 1;
}

/** True if (x,y) is sea (outside land). Out-of-bounds counts as water. */
export function isWater(map: TileMap, tileX: number, tileY: number): boolean {
  if (!map.water) return false;
  const x = Math.round(tileX);
  const y = Math.round(tileY);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.water[y * map.width + x] === 1;
}

/** A land tile touching the sea on any of its 4 sides — rendered as a sand beach. */
export function isBeach(map: TileMap, x: number, y: number): boolean {
  if (!map.water || map.water[y * map.width + x] === 1) return false;
  return (
    isWater(map, x - 1, y) || isWater(map, x + 1, y) || isWater(map, x, y - 1) || isWater(map, x, y + 1)
  );
}

/**
 * A small island surrounded by sea (BUILD-PLAN §0.A) — deliberately much smaller than the
 * 64×64 main world. An organic, noisy coastline (a circle whose radius wobbles per angle) of
 * grass, ringed by a sand beach, with a scattering of trees/bushes/flowers left clear at the
 * centre (the spawn plaza) and along the shore (where the diegetic stations live). No portal.
 */
export function generateIslandMap(seed = 7): TileMap {
  const W = 30;
  const H = 30;
  const r = rng(seed);
  const collision = new Uint8Array(W * H);
  const water = new Uint8Array(W * H);
  const decorations: Decoration[] = [];

  const cx = W / 2;
  const cy = H / 2;
  const baseR = 10.5;
  // Per-angle radius multiplier → a wobbling, organic coastline (not a perfect disc).
  const SEGS = 48;
  const wobble = Array.from({ length: SEGS }, () => 0.82 + r() * 0.42);

  const landAt = (x: number, y: number) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const ang = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * SEGS;
    const i = Math.floor(ang) % SEGS;
    const next = (i + 1) % SEGS;
    const f = ang - Math.floor(ang);
    const radius = baseR * (wobble[i] * (1 - f) + wobble[next] * f); // smooth between segments
    return Math.hypot(dx, dy) < radius;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!landAt(x, y)) {
        water[y * W + x] = 1;
        collision[y * W + x] = 1; // can't walk on the sea
      }
    }
  }

  // Decorations on the inner land only — keep the centre plaza and the beach clear so the
  // player and the stations have room.
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && water[y * W + x] === 0;
  const onBeach = (x: number, y: number) =>
    !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1);
  const clusters = 16;
  for (let i = 0; i < clusters; i++) {
    const ax = 4 + Math.floor(r() * (W - 8));
    const ay = 4 + Math.floor(r() * (H - 8));
    const size = 1 + Math.floor(r() * 3);
    for (let j = 0; j < size; j++) {
      const x = Math.max(1, Math.min(W - 2, ax + Math.floor((r() - 0.5) * 5)));
      const y = Math.max(1, Math.min(H - 2, ay + Math.floor((r() - 0.5) * 5)));
      if (!isLand(x, y) || onBeach(x, y)) continue;
      if (Math.hypot(x - cx, y - cy) < 4.5) continue; // keep the spawn plaza open
      const k = r();
      if (k < 0.4) {
        decorations.push({ kind: "tree", x, y });
        collision[y * W + x] = 1;
      } else if (k < 0.7) {
        decorations.push({ kind: "bush", x, y });
        collision[y * W + x] = 1;
      } else {
        decorations.push({ kind: "flower", x, y });
      }
    }
  }

  return { width: W, height: H, collision, water, decorations, portal: null };
}
