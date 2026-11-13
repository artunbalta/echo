/**
 * The landing's pixel layer (DECISIONS C100): a place at dusk and the few things that stand in it.
 *
 * WHERE IT COMES FROM. The film (`public/film`) is drawn by a painter of its own: a sky in ordered
 * dither, a moon, two lines of hill, houses with a lit window each, grass to the bottom edge that
 * leans in the wind, a pouch of gold, an envelope with a wax seal. The owner kept that film through
 * three cuts and then asked for the page to be written "in pixels a little more". So the page is
 * drawn by the same hand: this file is that painter, moved here unchanged where it could be, so the
 * film and the page it sits on are one place.
 *
 * HOW IT IS USED. Everything draws onto a small canvas, one unit a pixel of the picture, which the
 * stylesheet then enlarges whole (`image-rendering: pixelated`): see `PixelScene.tsx`. A place is made
 * once for a size (`makePlace`, the costly part: every pixel of the sky), and drawn every frame as a
 * pure function of the seconds (`drawPlace`).
 *
 * Nothing here reads the clock, the language or the page.
 */

type G = CanvasRenderingContext2D;
type RGB = [number, number, number];

export const INK = { void: "#07040b", deep: "#120c19", ink: "#1c1326", parch: "#f4e9d0", echo: "#a06cd5", soft: "#c9b0ea", ember: "#e8c98a" } as const;

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** The same number for the same `i`, every time: where a star is, how tall a blade. */
export const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** A filled circle in whole pixels. */
export function disc(g: G, cx: number, cy: number, r: number, col: string): void {
  g.fillStyle = col;
  for (let j = -r; j <= r; j++) {
    const hw = Math.floor(Math.sqrt(r * r - j * j) + 0.4);
    g.fillRect(cx - hw, cy + j, hw * 2 + 1, 1);
  }
}

interface Row {
  y: number;
  depth: number;
  list: [x: number, h: number, alt: boolean][];
  col: string;
  alt: string;
  tip: string;
  lit: string;
}

export interface Place {
  W: number;
  H: number;
  /** The horizon's row. */
  HZ: number;
  sky: HTMLCanvasElement;
  blades: Row[];
  windows: { x: number; y: number }[];
}

/** Something standing in the grass: drawn between the rows behind it and the rows in front. */
export interface Standing {
  /** Its middle, and the row its foot is on. */
  x: number;
  y: number;
  /** The grass in front of it is kept short from `x + clear[0]` to `x + clear[1]`, so it is seen. */
  clear: [number, number];
  /** The grass near it catches its light. */
  glow?: boolean;
  draw(g: G, t: number): void;
}

/**
 * A place at dusk, `W` by `H` pixels: the horizon `hz` of the way down, the moon at `moon` (fractions
 * of the picture), a house at each `[x as a fraction, width in pixels]` on the far hill.
 */
export function makePlace(W: number, H: number, hz: number, moon: [number, number], houses: [number, number][]): Place {
  const sky = document.createElement("canvas");
  sky.width = W;
  sky.height = H;
  const HZ = Math.round(H * hz);
  const p: Place = { W, H, HZ, sky, blades: [], windows: [] };
  const s = sky.getContext("2d")!;
  const im = s.createImageData(W, H);
  const d = im.data;
  const stops: RGB[] = [[10, 7, 16], [16, 11, 26], [26, 17, 41], [43, 28, 63], [70, 45, 86], [112, 70, 102]];
  const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const mx = Math.round(W * moon[0]);
  const my = Math.round(H * moon[1]);
  const mr = Math.max(4, Math.round(Math.min(W, H) * 0.05));
  const farY = (x: number) => HZ - H * 0.05 - Math.sin(x * 0.043 + 1.2) * H * 0.022 - Math.sin(x * 0.117 + 0.4) * H * 0.008;
  const nearY = (x: number) => HZ - H * 0.012 - Math.sin(x * 0.031 + 4.1) * H * 0.016;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const th = (B[y & 3]![x & 3]! + 0.5) / 16;
      let col: RGB;
      if (y < HZ + 3) {
        const f = Math.pow(clamp(y / HZ), 1.7) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(f));
        col = stops[f - i > th ? i + 1 : i]!;
        const dm = Math.hypot(x - mx, y - my);
        if (dm <= mr) col = x - mx + (y - my) > mr * 0.75 ? [205, 193, 176] : [244, 233, 208];
        else if (dm < mr * 3 && (1 - (dm - mr) / (mr * 2)) * 0.5 > th) col = [col[0] + 26, col[1] + 20, col[2] + 30];
        if (y >= farY(x)) col = [27, 19, 41];
        if (y >= nearY(x)) col = [19, 13, 30];
      } else col = [15, 12, 24];
      const o = (y * W + x) * 4;
      d[o] = col[0];
      d[o + 1] = col[1];
      d[o + 2] = col[2];
      d[o + 3] = 255;
    }
  }
  s.putImageData(im, 0, 0);
  // Two marks on the moon's face.
  s.fillStyle = "rgb(214,202,182)";
  s.fillRect(mx - Math.round(mr * 0.4), my - Math.round(mr * 0.3), 2, 1);
  s.fillRect(mx + 1, my + Math.round(mr * 0.35), 1, 1);
  for (const [fx, wd] of houses) {
    const hx = Math.round(W * fx);
    const hy = Math.round(farY(hx + wd / 2)) + 1;
    s.fillStyle = "rgb(13,9,21)";
    s.fillRect(hx, hy - 6, wd, 7);
    for (let j = 0; j < 4; j++) s.fillRect(hx - 1 + j, hy - 7 - j, wd + 2 - 2 * j, 1);
    s.fillRect(hx + wd - 3, hy - 12, 1, 4);
    p.windows.push({ x: hx + 2, y: hy - 4 });
    if (wd >= 10) p.windows.push({ x: hx + wd - 4, y: hy - 4 });
  }
  // The grass: rows from the horizon down, taller and further apart toward the eye.
  let y = HZ + 2;
  let i = 0;
  while (y < H + 10) {
    const depth = clamp((y - HZ) / Math.max(1, H - HZ));
    const hMax = 3 + depth * 9;
    const mix = (a: RGB, b: RGB) => `rgb(${a.map((v, j) => Math.round(lerp(v, b[j]!, depth))).join(",")})`;
    const row: Row = { y, depth, list: [], col: mix([25, 23, 40], [40, 46, 64]), alt: mix([29, 30, 44], [47, 61, 70]), tip: mix([46, 45, 66], [86, 98, 114]), lit: mix([84, 80, 104], [150, 158, 160]) };
    for (let x = -2; x <= W + 1; x++) {
      if (rnd(x * 7.13 + i * 91.7) > 0.8) continue;
      row.list.push([x, Math.max(2, Math.round(hMax * (0.45 + 0.55 * rnd(x * 3.7 + i * 13.3)))), rnd(x * 1.9 + i * 5.3) < 0.3]);
    }
    p.blades.push(row);
    y += 3 + Math.floor(i * 0.3);
    i++;
  }
  return p;
}

/**
 * The place, `t` seconds on: stars that come and go, windows as lit as `lit` says (0 to 1 each), the
 * grass leaning, whatever stands in it, and the fireflies over it.
 */
export function drawPlace(g: G, p: Place, t: number, lit: (i: number, t: number) => number, things: readonly Standing[] = []): void {
  g.drawImage(p.sky, 0, 0);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd(i) * p.W);
    const y = Math.floor(rnd(i + 50) * p.HZ * 0.62);
    const a = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.5 + rnd(i + 7) * 1.3) + i));
    g.fillStyle = rgba(INK.parch, a * (0.35 + 0.65 * rnd(i + 3)));
    g.fillRect(x, y, 1, 1);
  }
  p.windows.forEach((w, i) => {
    const on = lit(i, t);
    if (on <= 0) return;
    g.fillStyle = rgba(INK.ember, 0.16 * on);
    g.fillRect(w.x - 2, w.y - 2, 6, 6);
    g.fillStyle = rgba(INK.ember, 0.3 * on);
    g.fillRect(w.x - 1, w.y - 1, 4, 4);
    g.fillStyle = rgba("#f6dc9c", on);
    g.fillRect(w.x, w.y, 2, 2);
  });
  const waiting = [...things].sort((a, b) => a.y - b.y);
  for (let r = 0; r < p.blades.length; r++) {
    const row = p.blades[r]!;
    while (waiting.length && row.y > waiting[0]!.y) waiting.shift()!.draw(g, t);
    for (const [x, h0, alt] of row.list) {
      let h = h0;
      let near = false;
      for (const th of things) {
        if (row.y > th.y && row.y < th.y + 7 && x > th.x + th.clear[0] && x < th.x + th.clear[1]) h = Math.min(h, 3);
        if (th.glow && Math.abs(row.y - th.y) < 9 && Math.abs(x - th.x - 8) < 34) near = true;
      }
      const lean = Math.round(Math.sin(t * 1.5 + x * 0.16 + r * 0.9) * (0.55 + row.depth * 1.25));
      const half = Math.ceil(h * 0.5);
      g.fillStyle = alt ? row.alt : row.col;
      g.fillRect(x, row.y - half, 1, half + 1);
      g.fillRect(x + lean, row.y - h, 1, h - half);
      g.fillStyle = near ? row.lit : row.tip;
      g.fillRect(x + lean, row.y - h, 1, 1);
    }
  }
  while (waiting.length) waiting.shift()!.draw(g, t);
  for (let i = 0; i < 8; i++) {
    const x = Math.round(p.W * (0.1 + 0.8 * rnd(i + 20)) + Math.sin(t * 0.45 + i * 2.1) * 7);
    const y = Math.round(p.HZ + (p.H - p.HZ) * (0.05 + 0.55 * rnd(i + 31)) - 5 + Math.cos(t * 0.6 + i) * 4);
    const b = Math.max(0, Math.sin(t * 1.6 + i * 1.9));
    if (b < 0.05) continue;
    g.fillStyle = rgba(INK.ember, b * 0.22);
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = rgba("#fff3cf", b);
    g.fillRect(x, y, 1, 1);
  }
}

// ── what stands in the grass ──────────────────────────────────────────────────────────────────

const PURSE = [
  "......oo........",
  ".....o..o.......",
  "....kkoookk.....",
  "...kbbkookbk....",
  "....kbbbbbk.....",
  "...kbbBbbbbk....",
  "..kbbBBbbbbdk...",
  ".kbbbBbbbbbbdk..",
  ".kbbbbbbbbbbdk..",
  ".kbbbbbbbbbddk..",
  ".kbbbbbbbbbddk..",
  "..kbbbbbbbddk...",
  "...kkkkkkkkk....",
];
const PURSE_COL: Record<string, string> = { k: "#0d0914", b: "#7a4a2b", B: "#a9703f", d: "#56321e", o: "#e8c98a" };
/** The gold that slipped out of it: a small heap, so that nobody has to be told what is in the pouch. */
const HEAP: [number, number][] = [[5, 1], [11, 2], [17, 1], [8, -3], [14, -3], [11, -7], [23, 2]];

/** A pouch of gold in the grass at `(x, y)`, its coins catching the light now and then. */
export function purse(x: number, y: number): Standing {
  return {
    x,
    y,
    clear: [15, 44],
    glow: true,
    draw(g, t) {
      const k = 2;
      const w = PURSE[0]!.length * k;
      const h = PURSE.length * k;
      const x0 = x - w / 2;
      const y0 = y - h + 2;
      g.fillStyle = "rgba(7,4,11,.55)";
      g.fillRect(x0 + 2, y - 1, w + 22, 3);
      PURSE.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const ch = row[i]!;
          if (ch === ".") continue;
          g.fillStyle = PURSE_COL[ch]!;
          g.fillRect(x0 + i * k, y0 + j * k, k, k);
        }
      });
      const coins = HEAP.map(([dx, dy]) => [x + w / 2 + dx, y + dy] as const);
      g.fillStyle = "rgba(232,201,138,.1)";
      g.fillRect(x + w / 2 + 1, y - 12, 28, 17);
      for (const [cx, cy] of coins) {
        disc(g, cx, cy, 3, "#6b4f24");
        disc(g, cx, cy - 1, 2, "#e8c98a");
        g.fillStyle = "#b98f47";
        g.fillRect(cx - 1, cy, 3, 1);
        g.fillStyle = "#fff3cf";
        g.fillRect(cx - 1, cy - 2, 2, 1);
      }
      for (const [ci, off] of [[5, 0], [3, 0.5]] as const) {
        const gl = (t * 0.6 + off) % 1;
        if (gl > 0.2) continue;
        const [cx, cy] = coins[ci]!;
        const n = gl < 0.06 || gl > 0.14 ? 1 : 3;
        g.fillStyle = "#fffbea";
        g.fillRect(cx - n, cy - 2, n * 2 + 1, 1);
        g.fillRect(cx, cy - 2 - n, 1, n * 2 + 1);
      }
    },
  };
}

/**
 * A stall of honey at `(x, y)` with `jars` of its five still on it, and the board beside it that says
 * one each. It is the village's own stall (`@echo/planet` `honey-stall`), as the pouch is its purse.
 */
export function stall(x: number, y: number, jars: number): Standing {
  return {
    x,
    y,
    clear: [-26, 34],
    glow: true,
    draw(g, t) {
      g.fillStyle = "rgba(7,4,11,.55)";
      g.fillRect(x - 24, y - 1, 52, 3);
      // The legs, then the top over them.
      g.fillStyle = "#3d2416";
      g.fillRect(x - 21, y - 12, 3, 12);
      g.fillRect(x + 18, y - 12, 3, 12);
      g.fillStyle = "#56321e";
      g.fillRect(x - 20, y - 12, 1, 12);
      g.fillRect(x + 19, y - 12, 1, 12);
      g.fillStyle = "#0d0914";
      g.fillRect(x - 25, y - 16, 50, 5);
      g.fillStyle = "#7a4a2b";
      g.fillRect(x - 24, y - 15, 48, 3);
      g.fillStyle = "#a9703f";
      g.fillRect(x - 24, y - 15, 48, 1);
      // The jars, from the left; one that has gone leaves its ring on the wood.
      for (let i = 0; i < 5; i++) {
        const jx = x - 21 + i * 9;
        if (i >= jars) {
          g.fillStyle = "#56321e";
          g.fillRect(jx + 1, y - 15, 4, 1);
          continue;
        }
        g.fillStyle = "#0d0914";
        g.fillRect(jx - 1, y - 24, 8, 9);
        g.fillStyle = "#d9952e";
        g.fillRect(jx, y - 22, 6, 6);
        g.fillStyle = "#f0bd55";
        g.fillRect(jx, y - 22, 2, 5);
        g.fillStyle = "#a86a1c";
        g.fillRect(jx + 5, y - 22, 1, 6);
        g.fillStyle = "#e9dcc0";
        g.fillRect(jx, y - 24, 6, 2);
        const gl = (t * 0.5 + i * 0.23) % 1;
        if (gl < 0.07) {
          g.fillStyle = "#fffbea";
          g.fillRect(jx + 1, y - 21, 1, 2);
        }
      }
      // The board on its post: one jar, one stroke.
      g.fillStyle = "#3d2416";
      g.fillRect(x + 30, y - 27, 2, 27);
      g.fillStyle = "#0d0914";
      g.fillRect(x + 23, y - 39, 16, 13);
      g.fillStyle = "#f4e9d0";
      g.fillRect(x + 24, y - 38, 14, 11);
      g.fillStyle = "#d9952e";
      g.fillRect(x + 26, y - 35, 4, 5);
      g.fillStyle = "#5a4a6a";
      g.fillRect(x + 26, y - 36, 4, 1);
      g.fillStyle = "#231731";
      g.fillRect(x + 34, y - 36, 1, 7);
      g.fillRect(x + 33, y - 35, 1, 1);
      g.fillRect(x + 33, y - 30, 3, 1);
    },
  };
}

// ── who stands in it ──────────────────────────────────────────────────────────────────────────

const FIGURE = [
  "....hhh....",
  "...hhhhh...",
  "..hhfffhh..",
  "..hhfefeh..",
  "..hhhfhhh..",
  "...ccccc...",
  "..ccccccc..",
  ".ccccscccc.",
  ".ccccccccc.",
  ".ccccccccc.",
  ".ccccccccc.",
  "..ccccccc..",
  "..ccccccc..",
  "..ddddddd..",
];
/** Someone in a hooded cloak, and the same someone as their echo: the cloak's own shape in the echo's colour. */
const CLOAK: Record<string, string> = { h: "#8f7f66", f: "#2a1d33", e: "#f4e9d0", c: "#cdbf9f", s: "#e8c98a", d: "#a8997a" };
const ECHOED: Record<string, string> = { h: "#74489f", f: "#1c1326", e: "#e3d4f7", c: "#a06cd5", s: "#e3d4f7", d: "#8556b6" };

/**
 * A figure standing at `(x, y)`: the stranger, or (`echo`) their echo, a little see-through. `stride`
 * is how far along a walk they are, in steps: the legs go with it, and the body rises on each.
 */
export function figure(x: number, y: number, o: { echo?: boolean; alpha?: number; stride?: number; left?: boolean } = {}): Standing {
  return {
    x,
    y,
    clear: [0, 0],
    draw(g) {
      const alpha = o.alpha ?? 1;
      if (alpha <= 0.02) return;
      const k = 2;
      const col = o.echo ? ECHOED : CLOAK;
      const w = FIGURE[0]!.length * k;
      const stride = o.stride ?? 0;
      const walking = stride % 1 !== 0;
      const up = walking && Math.floor(stride * 2) % 2 === 0 ? 1 : 0;
      const x0 = Math.round(x - w / 2);
      const y0 = y - FIGURE.length * k - 4 - up;
      g.save();
      g.globalAlpha = alpha;
      if (!o.echo) {
        g.fillStyle = "rgba(7,4,11,.5)";
        g.fillRect(x0 + 2, y - 1, w - 2, 2);
      }
      FIGURE.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const ch = row[o.left ? row.length - 1 - i : i]!;
          if (ch === ".") continue;
          g.fillStyle = col[ch]!;
          g.fillRect(x0 + i * k, y0 + j * k, k, k);
        }
      });
      // Two legs under the cloak's hem: together when standing, one forward and one back on a step.
      const open = walking ? (Math.floor(stride * 2) % 2 === 0 ? 2 : 0) : 0;
      g.fillStyle = o.echo ? "#4a2f6b" : "#3a2a4a";
      g.fillRect(x0 + 6 - open, y - 4 - up, 3, 4 + up);
      g.fillRect(x0 + 13 + open, y - 4 - up, 3, 4 + up);
      g.restore();
    },
  };
}

// ── the envelope ──────────────────────────────────────────────────────────────────────────────

function seal(g: G, cx: number, cy: number, r: number): void {
  if (r >= 3) disc(g, cx, cy, r + 1, "#231731");
  disc(g, cx, cy, r, "#74489f");
  if (r >= 2) disc(g, cx, cy, r - 1, "#a06cd5");
  if (r >= 5) {
    g.fillStyle = "#8556b6";
    const q = Math.round(r * 0.45);
    for (let a = 0; a < 16; a++) g.fillRect(cx + Math.round(Math.cos((a / 16) * TAU) * q), cy + Math.round(Math.sin((a / 16) * TAU) * q), 1, 1);
  }
  if (r >= 2) {
    g.fillStyle = "#c9b0ea";
    g.fillRect(cx - Math.round(r * 0.5), cy - Math.round(r * 0.55), Math.max(1, Math.round(r * 0.3)), 1);
  }
}

/**
 * An envelope of any size, its middle at `(cx, cy)`: closed or `open` (0 to 1, the flap), sealed or
 * not, a `card` part-way out of it (0 to 1).
 */
export function envelope(g: G, cx: number, cy: number, w: number, h: number, o: { open?: number; card?: number; seal?: boolean } = {}): void {
  w = Math.max(5, Math.round(w));
  h = Math.max(4, Math.round(h));
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const mid = x + w / 2;
  const tip = Math.max(2, Math.round(h * 0.54));
  const open = o.open ?? 0;
  const P = "#f4e9d0";
  const FOLD = "#e0d2b3";
  const LN = "#b3a283";
  const DK = "#231731";
  const IN = "#cdbf9f";
  g.fillStyle = DK;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  if (open > 0) {
    const fh = Math.max(1, Math.round(tip * open));
    for (let j = 0; j <= fh; j++) {
      const hw = (w / 2) * (1 - j / (fh + 1));
      g.fillStyle = DK;
      g.fillRect(Math.round(mid - hw) - 1, y - j - 1, Math.round(hw * 2) + 2, 1);
    }
    for (let j = 0; j < fh; j++) {
      const hw = (w / 2) * (1 - j / (fh + 1));
      g.fillStyle = IN;
      g.fillRect(Math.round(mid - hw), y - j - 1, Math.round(hw * 2), 1);
    }
  }
  if (o.card && o.card > 0) {
    const cw = w - Math.max(2, Math.round(w * 0.12));
    const ch = Math.round(h * 0.86);
    const rise = Math.round(o.card * h * 0.62);
    const cx0 = Math.round(mid - cw / 2);
    g.fillStyle = DK;
    g.fillRect(cx0 - 1, y - rise - 1, cw + 2, ch + 2);
    g.fillStyle = "#fff8e6";
    g.fillRect(cx0, y - rise, cw, ch);
    if (w > 24) {
      g.fillStyle = "#9a8aa2";
      g.fillRect(cx0 + 3, y - rise + 3, Math.round(cw * 0.5), 1);
      g.fillRect(cx0 + 3, y - rise + 6, Math.round(cw * 0.34), 1);
    }
  }
  g.fillStyle = P;
  g.fillRect(x, y, w, h);
  g.fillStyle = FOLD;
  for (let j = 0; j < h - tip; j++) {
    const fx = Math.round((w / 2 - 1) * (j / Math.max(1, h - tip)));
    g.fillRect(x + fx, y + h - 1 - j, 1, 1);
    g.fillRect(x + w - 1 - fx, y + h - 1 - j, 1, 1);
  }
  for (let j = 0; j < tip; j++) {
    const hw = (w / 2) * (1 - j / tip);
    const a = Math.round(mid - hw);
    const b = Math.round(mid + hw) - 1;
    if (open <= 0) {
      g.fillStyle = "#fbf3de";
      g.fillRect(a, y + j, b - a + 1, 1);
    }
    g.fillStyle = LN;
    g.fillRect(a, y + j, 1, 1);
    g.fillRect(b, y + j, 1, 1);
  }
  if (open > 0) {
    g.fillStyle = "#3a2a4a";
    g.fillRect(x, y, w, Math.max(1, Math.round(h * 0.05)));
  }
  if (o.seal) seal(g, Math.round(mid), y + tip, Math.max(1, Math.round(h * 0.17)));
}

/** Bits of wax thrown off a seal as it is pressed: `a` runs 0 to 0.6 and they are gone. */
export function wax(g: G, cx: number, cy: number, a: number, n = 9): void {
  if (a < 0 || a > 0.6) return;
  for (let i = 0; i < n; i++) {
    const ang = rnd(i + 5) * TAU;
    const sp = 16 + rnd(i + 9) * 30;
    const d = sp * a * (1 - a * 0.6);
    g.fillStyle = i % 3 ? "#a06cd5" : "#c9b0ea";
    g.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d * 0.7 + a * a * 26), 1, 1);
  }
}
