/**
 * Venue prop art. Each prop tries a Higgsfield-generated PNG in /assets/venue/ first and
 * falls back to a styled procedural canvas, so the scene always renders (mock art mode).
 * Characters reuse the world's procedural sprite system (art.ts) for consistency + scale.
 */
import { Assets, Texture } from "pixi.js";

const PAL = {
  plazaA: "#3b3450",
  plazaB: "#443c5c",
  plazaLine: "#2c263d",
  stage: "#241a2e",
  stageTop: "#3a2c4a",
  light: "#ffd98a",
  booth: "#e7eef5",
  boothTrim: "#c0392b", // THY-ish red trim (logo/wordmark stays a UI overlay)
  counter: "#b9c4cf",
  portal: "#5aa6d0",
  portalCore: "#bfe9ff",
  banner: "#7a55a0",
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
const r = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
};

export function buildPlazaTile(tile = 16): HTMLCanvasElement {
  const [c, ctx] = canvas(tile * 2, tile * 2);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      r(ctx, tx * tile, ty * tile, tile, tile, (tx + ty) % 2 ? PAL.plazaA : PAL.plazaB);
      r(ctx, tx * tile, ty * tile, tile, 1, PAL.plazaLine);
      r(ctx, tx * tile, ty * tile, 1, tile, PAL.plazaLine);
    }
  return c;
}

export function buildStage(): HTMLCanvasElement {
  const w = 240,
    h = 96;
  const [c, ctx] = canvas(w, h);
  // stage deck
  r(ctx, 0, 28, w, h - 28, PAL.stage);
  r(ctx, 0, 28, w, 6, PAL.stageTop);
  // backdrop + truss
  r(ctx, 10, 0, w - 20, 30, "#19121f");
  // stage lights
  for (let i = 0; i < 7; i++) {
    const x = 24 + i * ((w - 48) / 6);
    r(ctx, x - 3, 2, 6, 6, "#0d0a12");
    r(ctx, x - 2, 6, 4, 3, PAL.light);
    // light beam
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = PAL.light;
    ctx.beginPath();
    ctx.moveTo(x, 9);
    ctx.lineTo(x - 16, h);
    ctx.lineTo(x + 16, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // speakers
  r(ctx, 4, 34, 16, h - 40, "#0d0a12");
  r(ctx, w - 20, 34, 16, h - 40, "#0d0a12");
  return c;
}

export function buildBooth(): HTMLCanvasElement {
  const w = 112,
    h = 96;
  const [c, ctx] = canvas(w, h);
  // back banner (blank — wordmark is a UI overlay, never baked)
  r(ctx, 14, 4, w - 28, 34, PAL.banner);
  r(ctx, 14, 4, w - 28, 4, "#9a6cc0");
  // kiosk body
  r(ctx, 8, 40, w - 16, h - 46, PAL.booth);
  r(ctx, 8, 40, w - 16, 4, "#ffffff");
  // red trim
  r(ctx, 8, 52, w - 16, 4, PAL.boothTrim);
  // counter
  r(ctx, 4, h - 16, w - 8, 12, PAL.counter);
  r(ctx, 4, h - 16, w - 8, 2, "#dfe8f0");
  // roll-up sign
  r(ctx, w - 26, 8, 14, 60, PAL.booth);
  r(ctx, w - 26, 8, 14, 4, PAL.boothTrim);
  return c;
}

export function buildPortal(): HTMLCanvasElement {
  const w = 48,
    h = 80;
  const [c, ctx] = canvas(w, h);
  // arch
  ctx.fillStyle = "#2a2440";
  ctx.fillRect(4, 8, w - 8, h - 8);
  // glowing core
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.3 + i * 0.12;
    r(ctx, 10 + i * 2, 14 + i * 2, w - 20 - i * 4, h - 22 - i * 4, i % 2 ? PAL.portal : PAL.portalCore);
  }
  ctx.globalAlpha = 1;
  r(ctx, w / 2 - 4, 16, 8, h - 28, PAL.portalCore);
  return c;
}

export interface VenueTextures {
  plaza: Texture;
  stage: Texture;
  booth: Texture;
  portal: Texture;
}

function nearest(t: Texture): Texture {
  t.source.scaleMode = "nearest";
  return t;
}

/** Load a generated prop PNG; fall back to the procedural canvas on any failure. */
async function loadProp(name: string, fallback: () => HTMLCanvasElement): Promise<Texture> {
  try {
    return nearest(await Assets.load(`/assets/venue/${name}.png`));
  } catch {
    return nearest(Texture.from(fallback()));
  }
}

export async function loadVenueArt(): Promise<VenueTextures> {
  const [plaza, stage, booth, portal] = await Promise.all([
    loadProp("plaza", () => buildPlazaTile()),
    loadProp("stage", buildStage),
    loadProp("booth", buildBooth),
    loadProp("portal", buildPortal),
  ]);
  return { plaza, stage, booth, portal };
}
