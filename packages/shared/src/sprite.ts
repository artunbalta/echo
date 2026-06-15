/**
 * Sprite-sheet specification. Every character (selfie-generated, premade, or NPC)
 * conforms to this layout so the renderer can animate any of them identically.
 *
 * Layout: a single horizontal strip per row, one row per facing, in FACINGS order
 * (down, up, left, right). Each row has FRAME_COUNT frames: frame 0 = idle, frames
 * 1..N = walk cycle. Frames are FRAME_W × FRAME_H source pixels, transparent bg.
 */
import type { Facing } from "./world.js";

export const SPRITE = {
  FRAME_W: 16,
  FRAME_H: 24, // taller than a tile: characters occupy ~1.5 tiles vertically
  FRAME_COUNT: 4, // idle + 3 walk frames
  ROWS: 4, // one per facing
  WALK_FPS: 8,
} as const;

export const FACING_ROW: Record<Facing, number> = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

export interface SpriteSheetMeta {
  url: string;
  frameW: number;
  frameH: number;
  frameCount: number;
  rows: number;
  walkFps: number;
}

export function defaultSheetMeta(url: string): SpriteSheetMeta {
  return {
    url,
    frameW: SPRITE.FRAME_W,
    frameH: SPRITE.FRAME_H,
    frameCount: SPRITE.FRAME_COUNT,
    rows: SPRITE.ROWS,
    walkFps: SPRITE.WALK_FPS,
  };
}

/** Stylistic attributes extracted from a selfie (never identity). Drives generation. */
export interface CharacterAttributes {
  hairColor?: string;
  hairStyle?: string;
  skinTone?: string;
  glasses?: boolean;
  facialHair?: string;
  accessories?: string[];
  /** Free-form vibe descriptors, e.g. ["calm", "bookish"]. */
  vibe?: string[];
  palette?: string[]; // hex colors sampled/assigned for consistency
}
