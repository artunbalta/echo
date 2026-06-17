/**
 * Procedural prop sprites for the island (BUILD-PLAN §0.A/§0.C). The pet is a real four-legged
 * DOG (not a humanoid), and the day's choices live in the world as objects the player walks up
 * to — a grain patch that grows, a raft on the shore, tide pools, a forage bush, a study cairn,
 * a resting bedroll, a campfire to end the day. Each is rendered into the standard SPRITE sheet
 * layout (FRAME_COUNT × ROWS) so PixiWorld consumes them through the same texture seam as the
 * characters — selected by a `spriteUrl: "proc:<kind>"` convention on the entity snapshot.
 */
import { SPRITE, FACINGS, type Facing } from "@echo/shared";

const FW = SPRITE.FRAME_W; // 16
const FH = SPRITE.FRAME_H; // 24

type Draw = (ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: Facing, frame: number) => void;

/** The set of procedural prop kinds (the part after "proc:"). */
export const PROP_KINDS = [
  "dog",
  "grain_sprout",
  "grain_ripe",
  "raft",
  "tidepool",
  "berry_bush",
  "book_cairn",
  "bedroll",
  "campfire",
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export function isPropUrl(url: string | undefined): url is string {
  return !!url && url.startsWith("proc:");
}
export function propKindFromUrl(url: string): PropKind | null {
  const k = url.slice("proc:".length) as PropKind;
  return (PROP_KINDS as readonly string[]).includes(k) ? k : null;
}

/** Build a full sheet (4 facings × FRAME_COUNT frames) for a prop kind. */
export function buildPropSheet(kind: PropKind): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FW * SPRITE.FRAME_COUNT;
  canvas.height = FH * SPRITE.ROWS;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const draw = DRAW[kind];
  FACINGS.forEach((facing, row) => {
    for (let frame = 0; frame < SPRITE.FRAME_COUNT; frame++) {
      draw(ctx, frame * FW, row * FH, facing as Facing, frame);
    }
  });
  return canvas;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
/** A soft ground shadow so props sit on the grass instead of floating. */
function shadow(ctx: CanvasRenderingContext2D, ox: number, oy: number, w = 8) {
  rect(ctx, ox + 8 - w / 2, oy + 22, w, 1, "rgba(0,0,0,0.22)");
  rect(ctx, ox + 8 - w / 2 + 1, oy + 23, w - 2, 1, "rgba(0,0,0,0.12)");
}

// ── the dog ────────────────────────────────────────────────────────────────────────
const DOG = { body: "#b6814a", dark: "#8c5d31", belly: "#e0c596", nose: "#2b2018", eye: "#241a14", tongue: "#e07a86" };

function drawDog(ctx: CanvasRenderingContext2D, ox: number, oy: number, facing: Facing, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 9);
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0; // gentle leg/tail movement

  if (facing === "left" || facing === "right") {
    const dir = facing === "right" ? 1 : -1;
    const mx = (x: number) => (dir > 0 ? x : 15 - x); // mirror for left
    const P = (x: number, y: number, w: number, h: number, c: string) =>
      p(dir > 0 ? x : 16 - x - w, y, w, h, c);
    // tail (back, curls up), wags with frame
    P(1, 11 + (step > 0 ? -1 : 0), 2, 4, DOG.body);
    P(0, 10 + (step > 0 ? -1 : 0), 2, 2, DOG.dark);
    // body
    P(2, 13, 9, 5, DOG.body);
    P(2, 16, 9, 2, DOG.belly);
    // legs (front pair + back pair, alternate)
    P(3, 18, 2, 4 - Math.abs(step), DOG.dark);
    P(9, 18, 2, 4 - Math.abs(step === 1 ? 0 : 1), DOG.dark);
    P(5, 18 + step, 2, 3, DOG.body);
    P(11, 18 - step, 2, 3, DOG.body);
    // head + snout toward facing dir
    P(10, 9, 5, 6, DOG.body);
    P(13, 12, 3, 3, DOG.belly); // muzzle
    rect(ctx, ox + mx(dir > 0 ? 15 : 15), oy + 13, 1, 1, DOG.nose);
    P(15, 13, 1, 2, DOG.nose); // nose tip
    P(10, 7, 2, 3, DOG.dark); // ear
    rect(ctx, ox + (dir > 0 ? 13 : 2), oy + 11, 1, 1, DOG.eye); // eye
  } else if (facing === "up") {
    // back of the dog: ears + body + a wagging tail toward the camera
    p(5, 8, 2, 3, DOG.dark); // ears
    p(9, 8, 2, 3, DOG.dark);
    p(4, 10, 8, 6, DOG.body); // head/back
    p(4, 15, 8, 5, DOG.body); // body
    p(5, 19, 2, 3, DOG.dark); // legs
    p(9, 19, 2, 3, DOG.dark);
    p(7 + step, 14, 2, 5, DOG.belly); // tail wags
  } else {
    // facing the player (down): floppy ears, a clear snout, a curling tail — reads as a dog
    p(4, 15, 8, 5, DOG.body); // body (low + wide)
    p(5, 16, 6, 2, DOG.belly);
    p(12, 12 + (step > 0 ? -1 : 0), 2, 3, DOG.body); // tail poking up at the back-right
    p(13, 11 + (step > 0 ? -1 : 0), 1, 2, DOG.dark);
    p(5, 8, 6, 6, DOG.body); // head
    p(3, 9, 2, 4, DOG.dark); // floppy ears down the sides
    p(11, 9, 2, 4, DOG.dark);
    p(6, 12, 4, 3, DOG.belly); // snout
    p(7, 14, 2, 1, DOG.nose); // nose
    rect(ctx, ox + 6, oy + 10, 1, 1, DOG.eye);
    rect(ctx, ox + 9, oy + 10, 1, 1, DOG.eye);
    p(4, 19, 2, 3 - (step > 0 ? 1 : 0), DOG.dark); // front paws (shuffle)
    p(10, 19, 2, 3 - (step < 0 ? 1 : 0), DOG.dark);
  }
}

// ── static stations ──────────────────────────────────────────────────────────────
function drawGrainSprout(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 7);
  p(5, 13, 1, 8, "#5b8f3a");
  p(8, 12, 1, 9, "#6aa345");
  p(11, 14, 1, 7, "#5b8f3a");
  p(4, 15, 2, 1, "#7cb84f");
  p(9, 13, 2, 1, "#7cb84f");
  p(11, 16, 1, 1, "#7cb84f");
  p(3, 21, 10, 1, "#6b4a2b"); // soil mound
}
function drawGrainRipe(ctx: CanvasRenderingContext2D, ox: number, oy: number, _f: Facing, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 9);
  const sway = frame === 1 ? 1 : frame === 3 ? -1 : 0; // wheat sways a touch in the breeze
  const stalks = [4, 7, 10, 12];
  for (const sx of stalks) {
    p(sx, 9, 1, 12, "#caa64a"); // stalk
    p(sx - 1 + sway, 7, 3, 3, "#f0cf5e"); // grain head
    p(sx + sway, 6, 1, 1, "#fbe88a");
  }
  p(3, 21, 11, 1, "#6b4a2b");
}
function drawRaft(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 12);
  // crossbars + planks lying on the shore
  for (let i = 0; i < 5; i++) p(2 + i * 2.4, 15, 2, 6, i % 2 ? "#7a4a2b" : "#8a5733");
  p(1, 14, 14, 1, "#5d3a22"); // top rail
  p(1, 20, 14, 1, "#5d3a22"); // bottom rail
  p(4, 11, 1, 4, "#caa873"); // a half-raised mast
  p(4, 10, 4, 1, "#caa873");
}
function drawTidepool(ctx: CanvasRenderingContext2D, ox: number, oy: number, _f: Facing, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 11);
  // rock ring
  p(2, 14, 12, 7, "#8a8780");
  p(2, 14, 12, 1, "#a9a59c");
  // water inside
  p(4, 16, 8, 4, "#2f93dd");
  p(5, 17, 6, 2, "#54aef0");
  if (frame === 1 || frame === 3) p(6, 17, 3, 1, "#bfe9fb"); // foam glint flickers
}
function drawBerryBush(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 10);
  p(3, 12, 10, 9, "#3fae4c");
  p(3, 12, 10, 2, "#5fce5f");
  p(2, 16, 12, 4, "#37a043");
  // bright berries
  for (const [bx, by] of [[5, 15], [9, 14], [7, 18], [11, 17], [4, 18]] as const) p(bx, by, 1, 1, "#e2466a");
}
function drawBookCairn(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 10);
  // a leaning stack of coloured books on a flat stone
  p(2, 20, 12, 2, "#8a8780"); // stone
  p(3, 17, 10, 3, "#7a55a0"); // book 1
  p(3, 17, 10, 1, "#9a78c0");
  p(4, 14, 9, 3, "#b9543f"); // book 2
  p(4, 14, 9, 1, "#d6745c");
  p(5, 11, 8, 3, "#41699e"); // book 3
  p(5, 11, 8, 1, "#6a93c4");
  p(6, 9, 2, 2, "#e8d49a"); // a ribbon/bookmark
}
function drawBedroll(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 12);
  p(2, 17, 12, 4, "#b07a86"); // blanket
  p(2, 17, 12, 1, "#caa0a8");
  p(2, 16, 5, 3, "#e0d2c0"); // pillow / rolled end
  p(2, 16, 5, 1, "#f0e6d8");
}
function drawCampfire(ctx: CanvasRenderingContext2D, ox: number, oy: number, _f: Facing, frame: number) {
  const p = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, oy + y, w, h, c);
  shadow(ctx, ox, oy, 11);
  // ring of stones + crossed logs
  for (const sx of [2, 5, 8, 11]) p(sx, 19, 2, 2, "#8a8780");
  p(3, 17, 10, 2, "#7a4a2b");
  p(5, 15, 6, 3, "#8a5733");
  // flame flickers with the frame
  const tall = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  p(6, 11 - tall, 4, 5 + tall, "#f08a2c"); // outer flame
  p(7, 9 - tall, 2, 4 + tall, "#f7c948"); // inner flame
  p(7, 8 - tall, 1, 2, "#fde6a0"); // tip
}

const DRAW: Record<PropKind, Draw> = {
  dog: drawDog,
  grain_sprout: (c, x, y) => drawGrainSprout(c, x, y),
  grain_ripe: drawGrainRipe,
  raft: (c, x, y) => drawRaft(c, x, y),
  tidepool: drawTidepool,
  berry_bush: (c, x, y) => drawBerryBush(c, x, y),
  book_cairn: (c, x, y) => drawBookCairn(c, x, y),
  bedroll: (c, x, y) => drawBedroll(c, x, y),
  campfire: drawCampfire,
};
