/**
 * Procedural tilemap (Phase 1). A real Tiled JSON map can be dropped in later; the
 * renderer only needs the {ground, decorations, collision} shape this produces.
 * Deterministic from a seed so client and (future) server agree on collision.
 */
import { WORLD } from "@echo/shared";

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

export interface TileMap {
  width: number;
  height: number;
  collision: Uint8Array; // width*height, 1 = blocked
  decorations: Decoration[];
  portal: Portal;
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

export function isBlocked(map: TileMap, tileX: number, tileY: number): boolean {
  const x = Math.round(tileX);
  const y = Math.round(tileY);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.collision[y * map.width + x] === 1;
}
