/**
 * Procedural placeholder art (Phase 1). Generates pixel-art sprite sheets and tile
 * textures on an offscreen canvas, in the palette sampled from the style-anchor
 * screenshot (§3). This is the explicit seam where real Higgsfield/Fal-generated
 * sprite sheets swap in (Phase 3): the renderer only consumes a sprite-sheet URL or a
 * canvas of the same SPRITE spec, so nothing downstream changes.
 */
import { SPRITE, FACINGS } from "@echo/shared";

const PALETTE = {
  grass: ["#74c365", "#6bbb5c", "#7ec96f", "#69b85b"],
  grassBlade: "#5aa64f",
  treeTrunk: "#7a4a2b",
  treeLeafA: "#3f8f3a",
  treeLeafB: "#4fa047",
  bushA: "#5aa64f",
  bushB: "#6fbf63",
  flower: "#b06cd5",
  outline: "#22311f",
};

const SKINS = ["#f1c79b", "#e0a87e", "#c98a5e", "#a9704a", "#7c4f33"];
const HAIRS = ["#3a2a1a", "#7a4a2b", "#1c1326", "#a06cd5", "#5aa6d0", "#d05a7a", "#cfcfcf"];
// Slightly muted shirts to sit inside the atmospheric, low-saturation world palette.
const SHIRTS = ["#b9543f", "#41699e", "#3f8a64", "#b89a4a", "#7a55a0", "#b05a86", "#557089"];
const PANTS = ["#2f3a45", "#382c46", "#43352a", "#2a3640", "#3a3340", "#45303a"];
const HAIR_STYLES = ["short", "long", "buzz", "bun"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/** Outline + cloth-shade colors, tuned to the ink/echo theme so characters read against grass. */
const OUTLINE = "#241a2e";

/** Deterministic hash → number in [0,1) from an id string. */
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

export interface CharStyle {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hairStyle: HairStyle;
}

export function styleFromId(id: string): CharStyle {
  return {
    skin: pick(SKINS, hash01(id, 1)),
    hair: pick(HAIRS, hash01(id, 2)),
    shirt: pick(SHIRTS, hash01(id, 3)),
    pants: pick(PANTS, hash01(id, 4)),
    hairStyle: pick([...HAIR_STYLES], hash01(id, 5)),
  };
}

// Named colors → palette hex, so selfie-derived attributes drive the in-world avatar.
const HAIR_NAMES: Record<string, string> = {
  black: "#1c1326", brown: "#7a4a2b", "dark brown": "#3a2a1a", blonde: "#d9b65a",
  blond: "#d9b65a", red: "#b5532e", ginger: "#b5532e", gray: "#cfcfcf", grey: "#cfcfcf",
  white: "#e8e8e8", purple: "#a06cd5", blue: "#5aa6d0", pink: "#d05a9a", green: "#5aa06c",
};
const SKIN_NAMES: Record<string, string> = {
  pale: "#f1c79b", fair: "#f1c79b", light: "#e8c8a0", medium: "#e0a87e",
  tan: "#c98a5e", olive: "#c98a5e", brown: "#a9704a", dark: "#7c4f33", deep: "#5e3a24",
};

function matchColor(value: string | undefined, table: Record<string, string>, fallback: string): string {
  if (!value) return fallback;
  const v = value.toLowerCase().trim();
  if (table[v]) return table[v];
  for (const key of Object.keys(table)) if (v.includes(key)) return table[key];
  // Accept raw hex too.
  if (/^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return fallback;
}

/** Map a free-form hair-style descriptor onto one of the renderable silhouettes. */
function hairStyleFromName(value: string | undefined): HairStyle | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/(bald|shaved|none)/.test(v)) return "buzz";
  if (/(buzz|crew|short|cropped)/.test(v)) return "buzz";
  if (/(long|flow|wavy|braid|ponytail)/.test(v)) return "long";
  if (/(bun|top ?knot|updo)/.test(v)) return "bun";
  return "short";
}

/** Build a deterministic CharStyle from selfie-derived attributes (§6). Falls back to
 *  id-seeded colors for any attribute the vision step didn't return. */
export function styleFromAttributes(
  attrs: import("@echo/shared").CharacterAttributes,
  seedId = "anon",
): CharStyle {
  const seeded = styleFromId(seedId);
  return {
    skin: matchColor(attrs.skinTone, SKIN_NAMES, seeded.skin),
    hair: matchColor(attrs.hairColor, HAIR_NAMES, seeded.hair),
    shirt: attrs.palette?.[0] ?? seeded.shirt,
    pants: attrs.palette?.[1] ?? seeded.pants,
    hairStyle: hairStyleFromName(attrs.hairStyle) ?? seeded.hairStyle,
  };
}

/** Render a full sprite sheet to a PNG data URL for upload to Storage (§6 post-process). */
export function sheetToDataUrl(style: CharStyle): string {
  return buildCharacterSheet(style).toDataURL("image/png");
}

const FW = SPRITE.FRAME_W;
const FH = SPRITE.FRAME_H;

/**
 * Build a full sprite sheet canvas: ROWS (facings) × FRAME_COUNT frames.
 * Each character: head (skin + hair), torso (shirt), legs (with walk bob).
 */
export function buildCharacterSheet(style: CharStyle): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FW * SPRITE.FRAME_COUNT;
  canvas.height = FH * SPRITE.ROWS;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  FACINGS.forEach((facing, row) => {
    for (let frame = 0; frame < SPRITE.FRAME_COUNT; frame++) {
      drawCharFrame(ctx, frame * FW, row * FH, style, facing, frame);
    }
  });
  return canvas;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/**
 * Draw one 16×24 frame. The character is built as a list of body "parts": every part is
 * first stamped as a 1px-larger dark rect (so the whole silhouette gets a clean unified
 * outline), then re-filled with its color on top. Details (eyes, shading, hair accents)
 * are painted last with no outline. Walk frames bob the upper body and swing limbs.
 */
function drawCharFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  s: CharStyle,
  facing: string,
  frame: number,
) {
  const p = (x: number, y: number, w: number, h: number, c: string) => px(ctx, ox + x, oy + y, w, h, c);
  const sil: Array<[number, number, number, number, string]> = [];
  const det: Array<[number, number, number, number, string]> = [];

  // Walk cycle: frame 0 idle, 1 left-step, 2 idle, 3 right-step.
  const stepL = frame === 1 ? 1 : 0;
  const stepR = frame === 3 ? 1 : 0;
  const bob = frame === 1 || frame === 3 ? 1 : 0; // upper body lifts a pixel mid-stride
  const shirtHi = shade(s.shirt, 0.14);
  const shirtLo = shade(s.shirt, -0.18);
  const hairHi = shade(s.hair, 0.18);

  // Ground shadow (under the feet, narrows while striding).
  px(ctx, ox + 5 - (bob ? 0 : 0), oy + 22, 6, 1, "rgba(0,0,0,0.22)");
  px(ctx, ox + 6, oy + 23, 4, 1, "rgba(0,0,0,0.14)");

  // ── Legs / feet (always front-facing blocks; alternate lift) ──
  const legTop = 18;
  sil.push([5, legTop + stepL, 2, 4 - stepL, s.pants]);
  sil.push([9, legTop + stepR, 2, 4 - stepR, s.pants]);
  det.push([5, legTop + stepL + (4 - stepL) - 1, 2, 1, OUTLINE]); // shoe
  det.push([9, legTop + stepR + (4 - stepR) - 1, 2, 1, OUTLINE]);

  const ty = 11 - bob; // torso top
  const hy = 3 - bob; // head top

  if (facing === "left" || facing === "right") {
    const dir = facing === "right" ? 1 : -1;
    const hx = dir; // nudge head toward facing direction
    // Torso (slightly narrower in profile)
    sil.push([5, ty, 6, 6, s.shirt]);
    det.push([5, ty, 6, 1, shirtHi]);
    det.push([5, ty + 5, 6, 1, shirtLo]);
    // Front arm swings opposite the same-side leg.
    const armLift = (dir > 0 ? stepL : stepR) ? 1 : 0;
    const ax = dir > 0 ? 10 : 5;
    sil.push([ax, ty + 1 - armLift, 2, 5, s.skin]);
    // Head
    sil.push([4 + hx, hy, 8, 7, s.skin]);
    // Hair sweeps over the back of the head (side away from facing).
    drawHair(sil, det, s, "side", hy, 4 + hx, hairHi, dir);
    // One eye + nose on the facing side.
    const ex = dir > 0 ? 9 : 6;
    det.push([ex + hx, hy + 4, 1, 1, OUTLINE]);
    det.push([dir > 0 ? 11 + hx : 4 + hx, hy + 4, 1, 1, shade(s.skin, -0.22)]); // nose hint
  } else {
    // Front (down) and back (up) share body; faces differ.
    sil.push([4, ty, 8, 6, s.shirt]);
    det.push([4, ty, 8, 1, shirtHi]);
    det.push([4, ty + 5, 8, 1, shirtLo]);
    // Arms at the sides, swinging opposite legs.
    const lArmLift = stepR ? 1 : 0;
    const rArmLift = stepL ? 1 : 0;
    sil.push([3, ty + 1 - lArmLift, 2, 5, s.skin]);
    sil.push([11, ty + 1 - rArmLift, 2, 5, s.skin]);
    // Head
    sil.push([4, hy, 8, 7, s.skin]);

    if (facing === "up") {
      // Back of the head: hair fills the whole skull, no face.
      drawHair(sil, det, s, "back", hy, 4, hairHi, 0);
    } else {
      drawHair(sil, det, s, "front", hy, 4, hairHi, 0);
      // Eyes + soft cheeks.
      det.push([6, hy + 4, 1, 1, OUTLINE]);
      det.push([9, hy + 4, 1, 1, OUTLINE]);
      det.push([5, hy + 5, 1, 1, shade(s.skin, -0.12)]);
      det.push([10, hy + 5, 1, 1, shade(s.skin, -0.12)]);
    }
  }

  // Outline pass (expand each silhouette part by 1px), then fills, then details.
  for (const [x, y, w, h] of sil) p(x - 1, y - 1, w + 2, h + 2, OUTLINE);
  for (const [x, y, w, h, c] of sil) p(x, y, w, h, c);
  for (const [x, y, w, h, c] of det) p(x, y, w, h, c);
}

/** Paint a hairstyle into the silhouette/detail lists for one head pose. */
function drawHair(
  sil: Array<[number, number, number, number, string]>,
  det: Array<[number, number, number, number, string]>,
  s: CharStyle,
  pose: "front" | "back" | "side",
  hy: number,
  hxLeft: number,
  hairHi: string,
  dir: number,
) {
  const style = s.hairStyle;
  if (pose === "back") {
    // Whole skull is hair; long flows onto the shoulders.
    sil.push([hxLeft, hy, 8, 7, s.hair]);
    det.push([hxLeft, hy, 8, 1, hairHi]);
    if (style === "long") sil.push([hxLeft, hy + 7, 8, 3, s.hair]);
    if (style === "bun") sil.push([hxLeft + 3, hy - 2, 3, 2, s.hair]);
    return;
  }
  if (pose === "side") {
    const back = dir > 0 ? hxLeft : hxLeft + 5; // hair clusters on the trailing side
    sil.push([hxLeft, hy, 8, 3, s.hair]); // top cap
    sil.push([back, hy, 3, style === "long" ? 8 : 5, s.hair]); // back mass
    det.push([hxLeft, hy, 8, 1, hairHi]);
    if (style === "bun") sil.push([back, hy - 1, 3, 2, s.hair]);
    return;
  }
  // Front pose.
  const cap = style === "buzz" ? 2 : 3;
  sil.push([hxLeft, hy, 8, cap, s.hair]);
  det.push([hxLeft + 1, hy, 6, 1, hairHi]);
  if (style === "buzz") {
    det.push([hxLeft, hy + cap, 1, 1, s.hair]); // tiny temples
    det.push([hxLeft + 7, hy + cap, 1, 1, s.hair]);
  } else if (style === "short") {
    sil.push([hxLeft, hy + cap, 1, 2, s.hair]); // sideburns
    sil.push([hxLeft + 7, hy + cap, 1, 2, s.hair]);
  } else if (style === "long") {
    sil.push([hxLeft - 1, hy + 1, 1, 8, s.hair]); // long sides framing the face
    sil.push([hxLeft + 8, hy + 1, 1, 8, s.hair]);
  } else if (style === "bun") {
    sil.push([hxLeft + 3, hy - 2, 3, 2, s.hair]); // top knot
    sil.push([hxLeft, hy + cap, 1, 1, s.hair]);
    sil.push([hxLeft + 7, hy + cap, 1, 1, s.hair]);
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt * 255)));
  g = Math.max(0, Math.min(255, Math.round(g + amt * 255)));
  b = Math.max(0, Math.min(255, Math.round(b + amt * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ── Tilemap textures ──────────────────────────────────────────────────────────

export function buildGrassTexture(tile: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = tile * 4;
  c.height = tile * 4;
  const ctx = c.getContext("2d")!;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const base = PALETTE.grass[(tx + ty) % PALETTE.grass.length];
      px(ctx, tx * tile, ty * tile, tile, tile, base);
      // sprinkle a few blades deterministically
      for (let i = 0; i < 5; i++) {
        const r1 = hash01(`${tx},${ty},${i}`, 11);
        const r2 = hash01(`${tx},${ty},${i}`, 22);
        px(ctx, tx * tile + Math.floor(r1 * tile), ty * tile + Math.floor(r2 * tile), 1, 2, PALETTE.grassBlade);
      }
    }
  }
  return c;
}

export function buildTreeTexture(tile: number): HTMLCanvasElement {
  const w = tile * 2,
    h = tile * 3;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // trunk
  px(ctx, w / 2 - 3, h - tile, 6, tile, PALETTE.treeTrunk);
  // canopy — layered circles
  blob(ctx, w / 2, tile + 4, tile, PALETTE.treeLeafA);
  blob(ctx, w / 2 - 5, tile + 2, tile - 3, PALETTE.treeLeafB);
  blob(ctx, w / 2 + 5, tile + 6, tile - 4, PALETTE.treeLeafB);
  return c;
}

export function buildBushTexture(tile: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = tile * 2;
  c.height = tile * 2;
  const ctx = c.getContext("2d")!;
  blob(ctx, tile, tile + 4, tile - 1, PALETTE.bushA);
  blob(ctx, tile - 4, tile + 2, tile - 5, PALETTE.bushB);
  blob(ctx, tile + 4, tile + 4, tile - 5, PALETTE.bushB);
  return c;
}

/**
 * A glowing stone-arch portal: a soft halo, a stone frame (arch cap + two pillars down
 * to the floor), and a shimmering cyan field filling the doorway. Anchored bottom-center,
 * it stands 3 tiles tall over a 2-tile-wide footprint and z-sorts with the entities.
 */
export function buildPortalTexture(tile: number): HTMLCanvasElement {
  const w = tile * 2;
  const h = tile * 3;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const frame = "#3f6f8f";
  const frameHi = "#6db3d6";
  const glow = "#7ec6e6";
  const core = "#bfe9ff";

  const cx = w / 2;
  const cyTop = tile; // center of the arch cap
  const rOuter = tile - 1; // stone-frame radius
  const rInner = tile - 5; // glowing-field radius
  const footY = h - 3; // pillars reach the floor here

  // Soft outer halo.
  ctx.globalAlpha = 0.18;
  blob(ctx, cx, cyTop, rOuter + 3, glow);
  ctx.globalAlpha = 1;

  // Stone frame: arch cap + two side pillars down to the floor, with a top highlight.
  blob(ctx, cx, cyTop, rOuter, frame);
  px(ctx, cx - rOuter, cyTop, 4, footY - cyTop, frame);
  px(ctx, cx + rOuter - 4, cyTop, 4, footY - cyTop, frame);
  blob(ctx, cx - 2, cyTop - 2, rOuter - 4, frameHi);

  // Glowing portal field: the arch cap plus the doorway column beneath it.
  blob(ctx, cx, cyTop, rInner, core);
  px(ctx, cx - rInner, cyTop, rInner * 2, footY - cyTop, core);
  // Diagonal shimmer bands within the doorway column.
  for (let y = cyTop; y < footY; y++) {
    for (let x = cx - rInner; x < cx + rInner; x++) {
      if ((x + y) % 5 === 0) {
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}
