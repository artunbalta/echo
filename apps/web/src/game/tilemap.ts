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

export interface TileMap {
  width: number;
  height: number;
  collision: Uint8Array; // width*height, 1 = blocked
  decorations: Decoration[];
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

  const keepClear = (x: number, y: number) => {
    // keep the central spawn plaza open
    const cx = W / 2,
      cy = H / 2;
    return Math.hypot(x - cx, y - cy) < 6;
  };

  // Border ring of trees.
  for (let x = 0; x < W; x++) {
    for (const y of [0, 1, H - 2, H - 1]) {
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

  return { width: W, height: H, collision, decorations };
}

export function isBlocked(map: TileMap, tileX: number, tileY: number): boolean {
  const x = Math.round(tileX);
  const y = Math.round(tileY);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return map.collision[y * map.width + x] === 1;
}
