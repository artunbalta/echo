/**
 * What the body does (DECISIONS C98): every act's own motion, for the rig in `character.ts`.
 *
 * WHY THIS FILE EXISTS. A verb had a stance and nothing else, and `poseCharacter` moved both arms
 * back and forth the same way for every stance that was not sitting, kneeling, pushing or climbing.
 * So a person took a jar, drew water, weeded a field and threw a ball back with one motion, standing
 * wherever they happened to be, while the jar, the bucket and the ball did nothing until the bar had
 * filled. The owner's words: every job is the same back and forth; it must be the job's own, and it
 * must really be done, not shown as if done.
 *
 * WHAT A GESTURE IS. A pure function of how far into the act the body is and where the thing is,
 * answering three questions a frame:
 *   the body    how low it is, how it leans and turns, what the legs do;
 *   the hands   where each one is, as a POINT IN SPACE, which the arm is then solved to reach
 *               (`stretchCharacter`). A hand that takes a jar goes to where the jar is;
 *   the thing   whether something is in the hand now (`grip`), how many things have left it so far
 *               (`released`: the layer lets one fly for each), and how far a thing that answers the
 *               body has come (`progress`: the bucket up the well, the door pulled to).
 * Nothing here knows what a jar is. The layer that owns the body puts the thing in the hand and lets
 * it go (`world/playerLayer.ts`); the layer that owns the thing moves it to match (`momentsLayer`).
 *
 * The names are `@echo/planet`'s (`GESTURES`), and `gestures.test.mts` holds this file to that list:
 * a gesture named there and not moved here fails the build.
 *
 * UNITS. The rig's own: one unit is one tile (1.6 m in the parcel world), the feet are at the origin,
 * +z is the way the body faces, +y is up, and side +1 is the arm at +x. Shoulders are 0.705 up and
 * 0.15 out; an arm is 0.32 long.
 */
import * as THREE from "three";

import type { Gesture } from "@echo/planet";

import { SIT_DROP, gaitFootTarget, solveLeg, stretchCharacter, type CharacterParts } from "./character";

export interface GestureFrame {
  /** Seconds into the act, and its length (0: it lasts until the person gets up). */
  t: number;
  holdS: number;
  /** Where the thing is from the feet, in the rig's units: ahead, to the side, and up. */
  ahead: number;
  side: number;
  up: number;
  /** The verb's own id, for the few gestures two verbs share and do a little differently. */
  variant?: string;
  /** 0 to 1: how much of the gesture the body has taken on (it eases in, and out again when let go). */
  weight?: number;
  /** Sitting ON something (a bench's seat). Without one a body that sits, sits on the ground. */
  seated?: boolean;
}

export interface GestureState {
  /** Something is in the hand, or in both. */
  grip: boolean;
  twoHanded: boolean;
  /** How many things have left the hand so far in this act. */
  released: number;
  /** 0 to 1: how far the thing the body is working has come (a bucket up a well, a door pulled to). */
  progress: number;
  /** Rig units a second the body should travel the way it faces (walking on, wading in). */
  advance: number;
}

type V = [number, number, number];
type Leg = [hip: number, knee: number, foot: number];

/** One frame of a body: everything is optional, and what is left out is the standing body. */
interface Spec {
  crouch?: number;
  kneel?: number;
  sit?: number;
  /** Down on the ground: hips on it, knees up in front, feet flat. */
  floor?: number;
  lie?: number;
  /** Torso: forward lean, turn, and the whole body's sideways lean and turn. */
  pitch?: number;
  twist?: number;
  roll?: number;
  yaw?: number;
  /** Head: down (+), and to the side. */
  nod?: number;
  look?: number;
  /** The body moved off its feet, in units: forward, sideways, up. */
  shift?: V;
  /** Legs walking on the spot at this pace (1 is a walk), or set outright. */
  gait?: number;
  legs?: { L: Leg; R: Leg };
  /** Where each hand is, or null for an arm left hanging. */
  R?: V | null;
  L?: V | null;
  grip?: boolean;
  two?: boolean;
  released?: number;
  progress?: number;
  advance?: number;
}

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};
/** 0 before `a`, 1 after `b`, eased between. */
const seg = (k: number, a: number, b: number) => ease((k - a) / (b - a));
/** Up from `a` to `m`, down again to `b`. */
const hill = (k: number, a: number, m: number, b: number) => seg(k, a, m) * (1 - seg(k, m, b));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixV = (a: V, b: V, k: number): V => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
/** A point reached through several, by `k` in 0..1 over the list. */
const path = (k: number, ...pts: V[]): V => {
  const n = pts.length - 1;
  const f = clamp(k) * n;
  const i = Math.min(n - 1, Math.floor(f));
  return mixV(pts[i]!, pts[i + 1]!, ease(f - i));
};
/** Which turn of a repeated motion this is, and how far through it. */
const cycle = (t: number, periodS: number): [n: number, u: number] => [Math.floor(t / periodS), (t % periodS) / periodS];

// Where a hand is when it is somewhere a hand often is.
const HIP: V = [0.19, 0.4, 0.03];
const CHEST: V = [0.08, 0.62, 0.2];
const MOUTH: V = [0.03, 0.87, 0.15];
const BELLY: V = [0.05, 0.5, 0.15];
const mirror = (v: V): V => [-v[0], v[1], v[2]];

/** The thing itself, kept within what a body that has walked up to it can reach. */
const thing = (f: GestureFrame, upDefault: number): V => [clamp(f.side, -0.3, 0.3), f.up > 0.02 ? f.up : upDefault, clamp(f.ahead, 0.24, 0.5)];

type Motion = (f: GestureFrame, k: number) => Spec;

/** Bend to something on the ground, close a hand on it, and stand with it. */
const pickUp = (k: number, at: V, a = 0, b = 1): Spec => {
  const u = (k - a) / (b - a);
  const down = hill(u, 0, 0.42, 1);
  return { crouch: down, pitch: 0.85 * down, nod: 0.3 * down, R: path(u, HIP, at, at, CHEST), grip: u > 0.44 };
};

const MOTIONS: Record<Gesture, Motion> = {
  // ── a thing and a hand ────────────────────────────────────────────────────────────────────
  "pick-up": (f, k) => pickUp(k, thing(f, 0.04)),
  take: (f, k) => {
    // One reach for each thing taken: a hand out to it, closed on it, back to the body, put away.
    const reps = f.variant === "three-jars" ? 3 : f.variant === "bet-safe" ? 2 : Math.max(1, Math.round(f.holdS / 0.9));
    const u = (k * reps) % 1 || (k >= 1 ? 1 : 0);
    const at = thing(f, 0.56);
    const n = Math.min(reps - 1, Math.floor(k * reps));
    const jar: V = [at[0] + (n - (reps - 1) / 2) * 0.1, at[1], at[2]];
    return { pitch: 0.28 * hill(u, 0, 0.4, 0.8), nod: 0.15, R: path(u, HIP, jar, jar, CHEST, HIP), grip: u > 0.42 && u < 0.9, progress: (n + (u > 0.42 ? 1 : 0)) / reps };
  },
  give: (f, k) => ({ pitch: 0.18 * hill(k, 0.1, 0.5, 0.9), nod: 0.2 * hill(k, 0.2, 0.5, 0.9), R: path(k, CHEST, [0.05, 0.62, 0.44], [0.05, 0.62, 0.44], HIP), grip: k < 0.58, released: k >= 0.58 ? 1 : 0 }),
  offer: (f, k) => ({ pitch: 0.12, nod: 0.1, R: mixV(CHEST, [0.07, 0.56 + Math.sin(f.t * 2.2) * 0.012, 0.42], seg(k, 0, 0.35)), L: [-0.12, 0.5, 0.2], grip: true }),
  feed: (f, k) => ({ kneel: seg(k, 0, 0.3), pitch: 0.35 * seg(k, 0, 0.3), nod: 0.3, R: path(k, CHEST, [0.08, 0.2, 0.42], [0.08, 0.2, 0.42], [0.08, 0.24, 0.4]), L: [-0.14, 0.3, 0.12], grip: k < 0.7, released: k >= 0.7 ? 1 : 0 }),
  "set-down": (f, k) => {
    const down = hill(k, 0, 0.5, 1);
    const at = thing(f, 0.05);
    // Set down square: the other hand comes to it, and it is nudged straight before the hands leave.
    const square = f.variant === "place-square";
    const nudge = square ? Math.sin(seg(k, 0.5, 0.8) * TAU * 2) * 0.03 : 0;
    return { kneel: down, pitch: 0.55 * down, nod: 0.35 * down, R: path(k, CHEST, [at[0] + nudge, at[1], at[2]], [at[0] + nudge, at[1], at[2]], HIP), L: square ? path(k, mirror(HIP), [at[0] - 0.14 - nudge, at[1], at[2]], [at[0] - 0.14, at[1], at[2]], mirror(HIP)) : null, grip: k < (square ? 0.8 : 0.55), released: k >= (square ? 0.8 : 0.55) ? 1 : 0 };
  },
  "pick-place": (f, k) => {
    if (k < 0.5) return pickUp(k, thing(f, 0.04), 0, 0.5);
    const up: V = [0.04, 0.66, 0.44];
    return { pitch: 0.15 * hill(k, 0.5, 0.75, 1), R: path((k - 0.5) / 0.5, CHEST, up, up, HIP), grip: k < 0.8, released: k >= 0.8 ? 1 : 0 };
  },
  "leave-be": (f, k) => ({ crouch: 0.35 * hill(k, 0, 0.35, 0.7), pitch: 0.4 * hill(k, 0, 0.35, 0.7), nod: 0.4 * hill(k, 0, 0.35, 0.75), look: Math.sin(seg(k, 0.7, 1) * TAU) * 0.3, R: path(k, HIP, mixV(HIP, thing(f, 0.2), 0.7), HIP, HIP), shift: [-0.1 * seg(k, 0.65, 1), 0, 0] }),
  touch: (f, k) => {
    const at = thing(f, 0.56);
    return { pitch: 0.2 * hill(k, 0.1, 0.5, 0.9), nod: f.variant === "touch" && f.up > 0.4 ? 0.35 * hill(k, 0.3, 0.55, 0.85) : 0.15, R: path(k, HIP, at, at, at, HIP) };
  },
  lift: (f, k) => {
    // Both hands under it, the legs do the lifting, and it goes up onto the shoulder.
    const down = hill(k, 0, 0.35, 0.7);
    const at = thing(f, 0.16);
    const sh: V = [0.2, 0.76, 0.04];
    return { crouch: down, pitch: 0.6 * down, R: path(k, HIP, [at[0] + 0.1, at[1], at[2]], [at[0] + 0.1, at[1] + 0.2, at[2] - 0.1], sh, sh), L: path(k, mirror(HIP), [at[0] - 0.1, at[1], at[2]], [at[0] - 0.1, at[1] + 0.2, at[2] - 0.1], [0.06, 0.7, 0.16], [0.06, 0.7, 0.16]), grip: k > 0.36, two: true, progress: seg(k, 0.36, 0.8) };
  },
  "gather-up": (f) => {
    // One after another: each lies somewhere else, and each goes into the basket on the other arm.
    const [n, u] = cycle(f.t, 0.85);
    const a = n * 2.4;
    const at: V = [Math.cos(a) * 0.2, 0.04, 0.34 + Math.sin(a) * 0.08];
    const down = hill(u, 0, 0.4, 0.8);
    const basket: V = [-0.16, 0.42, 0.16];
    return { crouch: 0.9 * down, pitch: 0.8 * down, twist: at[0] * 1.2 * down, nod: 0.3 * down, R: path(u, basket, at, at, basket), L: [-0.2, 0.42, 0.12], grip: u > 0.42 && u < 0.92, released: n + (u >= 0.92 ? 1 : 0), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  pluck: (f) => {
    const [n, u] = cycle(f.t, 0.55);
    const at: V = [((n * 7) % 5) * 0.07 - 0.14, 0.52 + ((n * 3) % 4) * 0.08, 0.36];
    const cup: V = [-0.04, 0.56, 0.2];
    return { pitch: 0.18, nod: -0.05 + at[1] * 0.1, look: at[0], R: path(u, [0.04, 0.56, 0.22], at, at, [0.04, 0.56, 0.22]), L: cup, grip: u > 0.42 && u < 0.9, released: n + (u >= 0.9 ? 1 : 0) };
  },
  tidy: (f, k) => {
    // Picked up, and thrown underarm into the basket.
    if (k < 0.5) return pickUp(k, thing(f, 0.04), 0, 0.5);
    const u = (k - 0.5) / 0.5;
    return { pitch: 0.2 * hill(u, 0, 0.5, 1), R: path(u, CHEST, [0.16, 0.36, -0.12], [0.1, 0.5, 0.42], HIP), grip: u < 0.55, released: u >= 0.55 ? 1 : 0 };
  },
  search: (f) => {
    // Down among the stones, turning them over, one hand then the other.
    const s = Math.sin(f.t * 2.6);
    const c = Math.cos(f.t * 2.6);
    return { crouch: 0.75, pitch: 0.7, nod: 0.3, look: s * 0.35, twist: s * 0.25, R: [0.1 + Math.max(0, s) * 0.18, 0.1 + Math.max(0, c) * 0.08, 0.34], L: [-0.1 + Math.min(0, s) * 0.18, 0.1 + Math.max(0, -c) * 0.08, 0.34] };
  },
  catch: (f, k) => {
    // Bent double after it, arms wide; three goes, and on the last the hands close.
    const reps = 3;
    const u = (k * reps) % 1;
    const last = k >= (reps - 1) / reps;
    const lunge = hill(u, 0.2, 0.6, 1);
    const got = last && u > 0.6;
    const wide = got ? 0.05 : 0.3 - 0.22 * seg(u, 0.4, 0.62);
    const h = got ? mix(0.12, 0.5, seg(u, 0.7, 1)) : 0.12;
    return { crouch: got ? 0.8 * (1 - seg(u, 0.7, 1)) : 0.75, pitch: 0.75 * (got ? 1 - seg(u, 0.7, 1) * 0.8 : 1), shift: [0.14 * lunge, 0, 0], gait: got ? 0 : 0.9, R: [wide, h, 0.34], L: [-wide, h, 0.34], grip: got, two: true };
  },

  // ── a thing let go ─────────────────────────────────────────────────────────────────────────
  throw: (f, k) => {
    // It is picked up from where it lies, drawn back over the shoulder, and let go at the top.
    if (k < 0.34) return pickUp(k, thing(f, 0.04), 0, 0.34);
    const u = (k - 0.34) / 0.66;
    const back: V = [0.24, 0.96, -0.16];
    const fore: V = [0.1, 0.82, 0.4];
    return { twist: mix(-0.55, 0.45, seg(u, 0.35, 0.6)) * hill(u, 0, 0.5, 1), pitch: 0.3 * hill(u, 0.4, 0.62, 1), shift: [mix(-0.05, 0.09, seg(u, 0.35, 0.6)) * hill(u, 0, 0.5, 1), 0, 0], R: path(u, CHEST, back, back, fore, HIP), L: [-0.2, 0.62, 0.2], grip: u < 0.56, released: u >= 0.56 ? 1 : 0 };
  },
  roll: (f, k) => {
    if (k < 0.38) return pickUp(k, thing(f, 0.04), 0, 0.38);
    const u = (k - 0.38) / 0.62;
    const low = hill(u, 0, 0.5, 1);
    return { crouch: 0.65 * low, pitch: 0.6 * low, R: path(u, CHEST, [0.16, 0.24, -0.2], [0.1, 0.07, 0.38], HIP), L: [-0.14, 0.34, 0.14], grip: u < 0.55, released: u >= 0.55 ? 1 : 0 };
  },
  scatter: (f, k) => {
    // Out of the fist in a low sweep across the ground, twice.
    const u = (k * 2) % 1;
    const n = Math.min(1, Math.floor(k * 2));
    return { pitch: 0.16, twist: mix(-0.35, 0.35, seg(u, 0.3, 0.7)), R: path(u, [-0.1, 0.48, 0.16], [-0.12, 0.42, 0.3], [0.3, 0.46, 0.34], [0.2, 0.46, 0.12]), L: [-0.18, 0.5, 0.14], grip: u < 0.5, released: n + (u >= 0.5 ? 1 : 0) };
  },
  skip: (f, k) => {
    // Low and sideways: the arm comes round level with the water.
    if (k < 0.3) return pickUp(k, [0.1, 0.04, 0.26], 0, 0.3);
    const u = (k - 0.3) / 0.7;
    const low = hill(u, 0, 0.5, 1);
    return { crouch: 0.4 * low, twist: mix(-0.7, 0.5, seg(u, 0.4, 0.62)) * low, roll: -0.12 * low, R: path(u, CHEST, [0.32, 0.36, -0.18], [0.3, 0.34, -0.1], [0.2, 0.32, 0.4], HIP), L: [-0.22, 0.56, 0.16], grip: u < 0.6, released: u >= 0.6 ? 1 : 0 };
  },
  drop: (f, k) => {
    const out: V = [0.05, 0.62, 0.44];
    return { pitch: 0.3 * seg(k, 0.1, 0.5) * (1 - seg(k, 0.9, 1)), nod: 0.5 * seg(k, 0.3, 0.6) * (1 - seg(k, 0.9, 1)), R: path(k, CHEST, out, out, out, HIP), grip: k < 0.45, released: k >= 0.45 ? 1 : 0 };
  },
  snowball: (f, k) => {
    // Scooped with both hands, packed between them, thrown.
    if (k < 0.3) {
      const down = hill(k, 0, 0.16, 0.3);
      return { crouch: down, pitch: 0.8 * down, R: path(k / 0.3, HIP, [0.06, 0.05, 0.32], BELLY), L: path(k / 0.3, mirror(HIP), [-0.06, 0.05, 0.32], mirror(BELLY)), grip: k > 0.16, two: true };
    }
    if (k < 0.6) {
      const a = (k - 0.3) * 40;
      return { nod: 0.3, R: [0.04 + Math.cos(a) * 0.02, 0.56 + Math.sin(a) * 0.02, 0.2], L: [-0.04 - Math.cos(a) * 0.02, 0.56 - Math.sin(a) * 0.02, 0.2], grip: true, two: true };
    }
    const u = (k - 0.6) / 0.4;
    const back: V = [0.24, 0.96, -0.16];
    return { twist: mix(-0.5, 0.4, seg(u, 0.3, 0.6)) * hill(u, 0, 0.5, 1), pitch: 0.25 * hill(u, 0.3, 0.6, 1), R: path(u, CHEST, back, [0.1, 0.82, 0.4], HIP), L: [-0.2, 0.6, 0.2], grip: u < 0.52, released: u >= 0.52 ? 1 : 0 };
  },

  // ── to the mouth ───────────────────────────────────────────────────────────────────────────
  eat: (f) => {
    const [n, u] = cycle(f.t, 0.9);
    const bush: V = [0.1 - (n % 2) * 0.16, 0.5, 0.34];
    return { pitch: 0.2 * hill(u, 0, 0.25, 0.5), nod: -0.1 * hill(u, 0.55, 0.75, 1), R: path(u, MOUTH, bush, bush, MOUTH, MOUTH), grip: u > 0.28 && u < 0.72, released: n + (u >= 0.72 ? 1 : 0) };
  },
  "draw-water": (f, k) => {
    // Hand over hand on the rope until the bucket is up, the bucket to the rim, and then the drink.
    const up = seg(k, 0.04, 0.62);
    if (k < 0.64) {
      const a = f.t * 5.2;
      const hand = (ph: number): V => [0.05, 0.6 + Math.cos(a + ph) * 0.14, 0.36 - Math.max(0, Math.sin(a + ph)) * 0.06];
      return { pitch: 0.2 - Math.max(0, Math.sin(a)) * 0.1, crouch: 0.12, nod: 0.2, R: hand(0), L: mirror(hand(Math.PI)), grip: true, two: true, progress: up };
    }
    if (k < 0.76) {
      const u = (k - 0.64) / 0.12;
      return { pitch: 0.25, R: path(u, [0.08, 0.6, 0.36], [0.1, 0.62, 0.4]), L: path(u, [-0.08, 0.6, 0.36], [-0.1, 0.62, 0.4]), grip: true, two: true, progress: 1 };
    }
    const u = (k - 0.76) / 0.24;
    const sip = hill(u, 0, 0.5, 1);
    return { pitch: 0.25 * (1 - seg(u, 0, 0.3)), nod: -0.22 * sip, R: path(u, [0.1, 0.62, 0.4], [0.05, 0.86, 0.16], [0.05, 0.86, 0.16], HIP), L: path(u, [-0.1, 0.62, 0.4], [-0.05, 0.86, 0.16], [-0.05, 0.86, 0.16], mirror(HIP)), progress: 1 };
  },

  // ── a rope, a door, a weight ───────────────────────────────────────────────────────────────
  haul: (f, k) => {
    // Feet set, weight back, and the rope comes in a hand at a time.
    const a = f.t * 4.4;
    const hand = (ph: number): V => {
      const reach = (Math.sin(a + ph) + 1) / 2;
      return [0.04, 0.54 + reach * 0.06, 0.14 + reach * 0.26];
    };
    const heave = Math.max(0, Math.sin(a));
    const seated = f.variant === "moor";
    return { sit: seated ? 1 : 0, crouch: seated ? 0 : 0.22, pitch: (seated ? 0.1 : -0.12) - heave * 0.14, shift: [-0.05 * heave, 0, 0], legs: seated ? undefined : { L: [-0.5, 0.5, 0], R: [0.25, 0.35, -0.3] }, R: hand(0), L: mirror(hand(Math.PI)), grip: true, two: true, progress: k };
  },
  knock: (f, k) => {
    // The knuckles on the door, three times.
    const rap = Math.max(0, Math.sin(clamp((k - 0.22) / 0.6) * Math.PI * 3)) ** 3;
    const at = thing(f, 0.84);
    return { pitch: 0.08, R: k < 0.2 ? mixV(HIP, [0.08, at[1], at[2] - 0.12], seg(k, 0, 0.2)) : k > 0.85 ? mixV([0.08, at[1], at[2] - 0.12], HIP, seg(k, 0.85, 1)) : [0.08, at[1], at[2] - 0.12 + rap * 0.1], released: Math.min(3, Math.floor(clamp((k - 0.22) / 0.6) * 3 + 0.5)) };
  },
  push: (f, k) => {
    // Shoulders down behind it and the legs driving.
    const heave = Math.max(0, Math.sin(f.t * 5.5));
    const at = thing(f, 0.6);
    return { pitch: 0.5 + heave * 0.06, crouch: 0.18, shift: [0.06 + heave * 0.03, 0, 0], gait: 0.55, R: [0.12, at[1], at[2] + 0.04], L: [-0.12, at[1], at[2] + 0.04], two: true, progress: k };
  },
  shoulder: (f) => {
    // Back a step, and into it with the shoulder; again.
    const [n, u] = cycle(f.t, 1.25);
    const hit = seg(u, 0.5, 0.62) * (1 - seg(u, 0.72, 1));
    return { twist: -0.75 * seg(u, 0.2, 0.6) * (1 - seg(u, 0.8, 1)), pitch: 0.25 * hit, roll: -0.12 * hit, shift: [mix(-0.14, 0.16, seg(u, 0.5, 0.62)) * (1 - seg(u, 0.75, 1)), 0, 0], R: [0.0, 0.62, 0.14], L: [-0.16, 0.5, 0.1], released: n + (u >= 0.62 ? 1 : 0), progress: hit };
  },
  pull: (f, k) => {
    // A hand out to it, closed on it, and the body goes back with it.
    const at = thing(f, 0.62);
    const back = seg(k, 0.32, 0.8);
    return { pitch: 0.2 * hill(k, 0, 0.3, 0.6) - 0.1 * back * (1 - seg(k, 0.85, 1)), shift: [-0.16 * back, 0, 0], R: path(k, HIP, at, [at[0], at[1], at[2] - 0.2], [at[0], at[1], at[2] - 0.2], HIP), grip: k > 0.3 && k < 0.85, progress: back };
  },
  swing: (f, k) => {
    // A hand on its top rail, and it is walked shut.
    const at = thing(f, 0.62);
    const go = seg(k, 0.2, 0.85);
    return { pitch: 0.15, twist: 0.3 * go, shift: [0.18 * go, 0, 0], gait: go > 0 && go < 1 ? 0.7 : 0, R: path(k, HIP, at, [at[0] - 0.12, at[1], at[2]], [at[0] - 0.12, at[1], at[2]], HIP), grip: k > 0.18 && k < 0.88, progress: go };
  },
  "push-open": (f, k) => {
    const at = thing(f, 0.62);
    const go = seg(k, 0.3, 1);
    return { pitch: 0.12, shift: [0.3 * go, 0, 0], gait: go > 0 && go < 1 ? 0.6 : 0, R: path(k, HIP, at, [0.2, at[1], at[2]], HIP), nod: 0.15 * hill(k, 0.3, 0.6, 1), progress: seg(k, 0.1, 0.4) };
  },
  "push-through": (f) => {
    // One arm then the other parting what is in the way, head down, feet finding the ground.
    const a = f.t * 3.4;
    const part = (ph: number): V => {
      const s = (Math.sin(a + ph) + 1) / 2;
      return [0.03 + s * 0.28, 0.72 - s * 0.06, 0.34 - s * 0.14];
    };
    return { pitch: 0.28, nod: 0.25, crouch: 0.15, gait: 0.5, R: part(0), L: mirror(part(Math.PI)) };
  },
  turn: (f) => {
    const a = f.t * 6;
    return { pitch: 0.2, R: [0.08 + Math.cos(a) * 0.09, 0.58 + Math.sin(a) * 0.09, 0.36], L: [-0.14, 0.56, 0.3], progress: (a / TAU) % 1 };
  },

  // ── the ground, and what is built on it ────────────────────────────────────────────────────
  weed: (f) => {
    // A weed taken at the root, pulled, and thrown to one side.
    const [n, u] = cycle(f.t, 0.95);
    const at: V = [0.02 + ((n * 5) % 3) * 0.08, 0.04, 0.34];
    const up: V = [0.14, 0.3, 0.22];
    return { kneel: 1, pitch: 0.5 - 0.2 * seg(u, 0.4, 0.6), nod: 0.35, twist: 0.35 * seg(u, 0.6, 0.85), R: path(u, [0.3, 0.26, 0.06], at, at, up, [0.34, 0.28, 0.02]), L: [-0.14, 0.28, 0.14], grip: u > 0.3 && u < 0.85, released: n + (u >= 0.85 ? 1 : 0) };
  },
  untie: (f) => {
    // Both hands at one knot: the small, close work of fingers.
    const a = f.t * 7;
    const tug = Math.max(0, Math.sin(f.t * 1.7)) ** 6;
    const at = thing(f, 0.24);
    return { kneel: 1, pitch: 0.5, nod: 0.45, R: [0.04 + Math.cos(a) * 0.015 + tug * 0.06, at[1] + Math.sin(a) * 0.015, 0.34 - tug * 0.04], L: [-0.04 - Math.cos(a + 1) * 0.015 - tug * 0.06, at[1] + Math.sin(a + 1) * 0.015, 0.34 - tug * 0.04], progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  dig: (f) => {
    // Both hands into the earth, and what they bring out thrown behind to the side.
    const [n, u] = cycle(f.t, 1.05);
    const scoop = (s: number): V => path(u, [s * 0.08, 0.3, 0.26], [s * 0.07, 0.03, 0.38], [s * 0.07, 0.03, 0.3], [0.26 + s * 0.06, 0.26, 0.1], [s * 0.08, 0.3, 0.26]);
    return { kneel: 1, pitch: 0.55 - 0.15 * seg(u, 0.45, 0.7), nod: 0.35, twist: 0.4 * hill(u, 0.5, 0.75, 1), R: scoop(1), L: scoop(-1), grip: u > 0.3 && u < 0.72, two: true, released: n + (u >= 0.72 ? 1 : 0), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  plant: (f, k) => {
    // A hole made with the fingers, the seed set in it, and the earth pressed back over.
    if (k < 0.4) {
      const u = (k / 0.4) * 2 % 1;
      return { kneel: 1, pitch: 0.55, nod: 0.4, R: path(u, [0.06, 0.2, 0.3], [0.05, 0.03, 0.36], [0.2, 0.14, 0.26]), L: [-0.12, 0.26, 0.18], grip: true };
    }
    if (k < 0.62) {
      const u = (k - 0.4) / 0.22;
      return { kneel: 1, pitch: 0.55, nod: 0.4, R: path(u, [0.06, 0.2, 0.3], [0.05, 0.04, 0.36], [0.06, 0.12, 0.32]), L: [-0.12, 0.26, 0.18], grip: u < 0.55, released: u >= 0.55 ? 1 : 0 };
    }
    const a = (k - 0.62) * 50;
    return { kneel: 1, pitch: 0.55, nod: 0.4, R: [0.07, 0.05 + Math.max(0, Math.sin(a)) * 0.05, 0.36], L: [-0.03, 0.05 + Math.max(0, -Math.sin(a)) * 0.05, 0.36], released: 1, progress: seg(k, 0.62, 1) };
  },
  stake: (f) => {
    // One hand holds it upright, the other drives it in with a stone.
    const [n, u] = cycle(f.t, 0.7);
    return { kneel: 1, pitch: 0.4, nod: 0.3, L: [-0.03, 0.3, 0.34], R: path(u, [0.14, 0.72, 0.2], [0.03, 0.44, 0.34], [0.1, 0.56, 0.26], [0.14, 0.72, 0.2]), grip: true, released: n + (u >= 0.34 ? 1 : 0), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  pick: (f) => {
    // Up over the shoulder with both hands, and down into the rock.
    const [n, u] = cycle(f.t, 1.4);
    const top: V = [0.12, 1.0, -0.08];
    const bottom: V = [0.03, 0.36, 0.42];
    const r = path(u, bottom, top, top, bottom, bottom);
    const down = seg(u, 0.5, 0.72);
    return { pitch: u < 0.3 ? mix(0.5, -0.12, seg(u, 0, 0.3)) : mix(-0.12, 0.55, down), crouch: 0.3 * down, legs: { L: [-0.35, 0.45, -0.1], R: [0.25, 0.3, -0.25] }, R: r, L: [r[0] - 0.08, r[1] - 0.04, r[2]], grip: true, two: true, released: n + (u >= 0.72 ? 1 : 0) };
  },
  hammer: (f) => {
    // Three blows and a look at it; the other hand keeps the piece where it belongs.
    const [n, u] = cycle(f.t, 1.6);
    const blow = Math.max(0, Math.sin(clamp(u / 0.7) * Math.PI * 3));
    const at = thing(f, 0.62);
    return { pitch: 0.18, nod: 0.2, look: u > 0.75 ? Math.sin((u - 0.75) * 4 * Math.PI) * 0.2 : 0, L: [-0.1, at[1], at[2]], R: [0.1, at[1] + 0.03 + blow * 0.22, at[2] - blow * 0.12], grip: true, released: n * 3 + Math.min(3, Math.floor(clamp(u / 0.7) * 3)), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  lay: (f) => {
    // A stone from the heap, both hands, set on the course and bedded with the palms.
    const [n, u] = cycle(f.t, 2.5);
    const heap: V = [0.26, 0.12, 0.16];
    const course: V = [0.02, 0.5 + (n % 3) * 0.04, 0.4];
    const down = hill(u, 0, 0.18, 0.4);
    const r = path(u, HIP, heap, heap, CHEST, course, course, course, HIP);
    const pat = u > 0.62 && u < 0.86 ? Math.max(0, Math.sin((u - 0.62) * 26)) * 0.04 : 0;
    return { crouch: 0.9 * down, pitch: 0.75 * down + 0.2 * hill(u, 0.5, 0.7, 0.9), twist: 0.5 * down, R: [r[0], r[1] + pat, r[2]], L: [r[0] - 0.14, r[1] + pat, r[2]], grip: u > 0.2 && u < 0.62, two: true, released: n + (u >= 0.62 ? 1 : 0), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  stack: (f) => {
    // A log from where it fell onto the pile, and the next.
    const [n, u] = cycle(f.t, 1.5);
    const a = n * 2.1;
    const fallen: V = [Math.cos(a) * 0.24, 0.06, 0.3 + Math.sin(a) * 0.06];
    const pile: V = [0, 0.14 + Math.min(3, Math.floor(n / 3)) * 0.09, 0.4];
    const down = hill(u, 0, 0.25, 0.5);
    const set = hill(u, 0.55, 0.75, 0.95);
    const r = path(u, HIP, fallen, fallen, BELLY, pile, pile, HIP);
    return { crouch: 0.9 * down + 0.6 * set, pitch: 0.8 * down + 0.6 * set, twist: fallen[0] * 1.5 * down, R: [r[0] + 0.08, r[1], r[2]], L: [r[0] - 0.08, r[1], r[2]], grip: u > 0.26 && u < 0.76, two: true, released: n + (u >= 0.76 ? 1 : 0), progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  paint: (f, k) => {
    // Long strokes down and up, moving along; every few, the brush goes back to the pot.
    const [n, u] = cycle(f.t, 0.8);
    const dip = n % 4 === 3;
    const x = mix(-0.14, 0.24, k);
    const pot: V = [-0.16, 0.46, 0.16];
    return { pitch: dip ? 0.2 : 0.1, nod: dip ? 0.3 : -0.1 + u * 0.3, L: [-0.2, 0.46, 0.14], R: dip ? path(u, [x, 0.6, 0.4], pot, pot, [x, 0.9, 0.4]) : [x + Math.sin(u * Math.PI) * 0.02, mix(0.92, 0.46, (1 - Math.cos(u * TAU)) / 2), 0.42], grip: true, progress: k };
  },
  wring: (f) => {
    // Down into the dye, up, and the two hands turn against each other.
    const [, u] = cycle(f.t, 1.7);
    const down = hill(u, 0, 0.25, 0.5);
    const twist = u > 0.55 ? Math.sin((u - 0.55) * 14) * 0.05 : 0;
    return { crouch: 0.55, pitch: 0.45 + 0.25 * down, nod: 0.35, R: [0.07, mix(0.42, 0.12, down) + twist, 0.32], L: [-0.07, mix(0.42, 0.12, down) - twist, 0.32], grip: true, two: true, progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },
  bail: (f) => {
    // A scoop from between the feet, and it goes over the side.
    const [n, u] = cycle(f.t, 1.1);
    const r = path(u, [0.06, 0.3, 0.26], [0.04, 0.06, 0.3], [0.04, 0.1, 0.3], [0.34, 0.5, 0.06], [0.06, 0.3, 0.26]);
    return { crouch: 0.6, pitch: 0.6 - 0.3 * seg(u, 0.4, 0.7), twist: 0.6 * hill(u, 0.45, 0.72, 1), R: r, L: [r[0] - 0.1, r[1], r[2]], grip: u > 0.25 && u < 0.72, two: true, released: n + (u >= 0.72 ? 1 : 0) };
  },
  draw: (f) => {
    // One finger in the sand: a round, a line through it, and round again.
    const a = f.t * 1.8;
    return { kneel: 1, pitch: 0.55, nod: 0.45, look: Math.cos(a) * 0.15, R: [0.06 + Math.cos(a) * 0.1, 0.035, 0.36 + Math.sin(a * 2) * 0.05], L: [-0.14, 0.05, 0.26], progress: clamp(f.t / Math.max(0.01, f.holdS)) };
  },

  // ── an animal, a person ────────────────────────────────────────────────────────────────────
  stroke: (f) => {
    // The length of its back, slowly; or, at its head, the fingers working behind an ear.
    if (f.variant === "scratch") {
      const a = f.t * 11;
      return { kneel: 1, pitch: 0.4, nod: 0.3, R: [0.06 + Math.cos(a) * 0.02, 0.36 + Math.sin(a) * 0.02, 0.4], L: [-0.14, 0.28, 0.14] };
    }
    const [, u] = cycle(f.t, 1.0);
    const along = u < 0.7 ? ease(u / 0.7) : 1 - ease((u - 0.7) / 0.3);
    return { kneel: 1, pitch: 0.42, nod: 0.3, R: [0.06, 0.3 + (u >= 0.7 ? 0.06 : 0), mix(0.44, 0.24, along)], L: [-0.14, 0.28, 0.14] };
  },
  tussle: (f) => {
    // Down at its level, both hands in its coat, and a hop back when it springs.
    const a = f.t * 9;
    const hop = Math.max(0, Math.sin(f.t * 2.2)) ** 8;
    return { crouch: 0.6, pitch: 0.5, shift: [-0.08 * hop, 0, 0.05 * hop], R: [0.1 + Math.sin(a) * 0.04, 0.24 + Math.cos(a) * 0.04, 0.36], L: [-0.1 + Math.sin(a + 2) * 0.04, 0.24 + Math.cos(a + 2) * 0.04, 0.36] };
  },
  shoo: (f) => {
    // Arms wide and driven forward at it, with a step.
    const [, u] = cycle(f.t, 0.6);
    const drive = hill(u, 0, 0.5, 1);
    return { pitch: 0.22, shift: [0.08 * drive, 0, 0], gait: 0.8, R: [0.34 - drive * 0.1, 0.56, 0.12 + drive * 0.26], L: [-0.34 + drive * 0.1, 0.56, 0.12 + drive * 0.26] };
  },
  "help-up": (f, k) => {
    // Down beside him, an arm under his, and both come up together.
    const down = 1 - seg(k, 0.45, 0.9);
    const settle = seg(k, 0, 0.25);
    return { kneel: settle * down, pitch: 0.45 * settle * down, R: path(k, HIP, [0.1, 0.3, 0.38], [0.1, 0.34, 0.36], [0.12, 0.62, 0.3], [0.12, 0.62, 0.3]), L: path(k, mirror(HIP), [-0.1, 0.26, 0.32], [-0.1, 0.3, 0.32], [-0.1, 0.56, 0.28], [-0.1, 0.56, 0.28]), grip: k > 0.25, two: true, progress: seg(k, 0.45, 0.9) };
  },

  // ── getting somewhere ──────────────────────────────────────────────────────────────────────
  climb: (f) => {
    const r = Math.sin(f.t * TAU * 0.9);
    return { shift: [0, 0, 0.05 + Math.max(0, r) * 0.04], pitch: -0.05, R: [0.14, 1.0 - r * 0.1, 0.22], L: [-0.14, 1.0 + r * 0.1, 0.22], legs: { L: [-0.6 - r * 0.4, 0.9 + r * 0.4, 0], R: [-0.6 + r * 0.4, 0.9 - r * 0.4, 0] } };
  },
  "step-in": (f, k) => {
    // One foot over the side, the weight after it, arms out for the boat's sake.
    const up = hill(k, 0.1, 0.45, 0.8);
    return { shift: [0.12 * seg(k, 0.3, 0.8), 0, 0.05 * up - 0.06 * seg(k, 0.7, 1)], legs: { L: [0.15 * up, 0.1, 0], R: [-1.1 * up, 1.2 * up, 0] }, R: [0.34, 0.6, 0.08], L: [-0.34, 0.6, 0.08], roll: Math.sin(k * 9) * 0.04 };
  },
  creep: (f) => {
    // Low, a hand out ahead in the dark and one on the wall.
    return { crouch: 0.45, pitch: 0.3, gait: 0.3, look: Math.sin(f.t * 1.3) * 0.45, nod: 0.1, R: [0.1, 0.52 + Math.sin(f.t * 2) * 0.03, 0.42], L: [-0.3, 0.56, 0.12], advance: 0.12 };
  },
  wade: (f, k) => {
    // Knees high out of the water, arms out, and in a step at a time.
    const a = f.t * 4;
    const lift = (ph: number): Leg => {
      const s = Math.max(0, Math.sin(a + ph));
      return [-0.9 * s, 1.1 * s, 0];
    };
    return { shift: [0, 0, -0.03 * seg(k, 0, 1)], legs: { L: lift(0), R: lift(Math.PI) }, R: [0.32, 0.6, 0.1], L: [-0.32, 0.6, 0.1], roll: Math.sin(a) * 0.04, advance: 0.2 };
  },
  "walk-on": () => ({ gait: 1, advance: 0.7, nod: 0.05 }),
  "step-aside": (f, k) => {
    // A step off the way, half a turn toward them, and an open hand to it.
    const go = seg(k, 0, 0.5);
    return { shift: [0, 0.3 * go, 0], yaw: -0.5 * go, gait: go > 0 && go < 1 ? 0.6 : 0, nod: 0.2 * hill(k, 0.4, 0.7, 1), R: null, L: mixV(mirror(HIP), [-0.3, 0.5, 0.24], seg(k, 0.4, 0.75)) };
  },
  "stand-by": (f, k) => {
    // Over to them, and standing there: turned outward, an arm half out between them and the rest.
    const go = seg(k, 0, 0.45);
    return { gait: go < 1 ? 0.8 : 0, advance: go < 1 ? 0.35 : 0, yaw: 0.4 * seg(k, 0.4, 0.7), R: mixV(HIP, [0.3, 0.52, 0.14], seg(k, 0.5, 0.8)), L: null };
  },
  stomp: (f) => {
    // Feet down hard, one and then the other.
    const a = f.t * 9;
    const leg = (ph: number): Leg => {
      const s = Math.max(0, Math.sin(a + ph)) ** 0.6;
      return [-1.0 * s, 1.3 * s, 0];
    };
    return { legs: { L: leg(0), R: leg(Math.PI) }, shift: [0, 0, Math.abs(Math.sin(a)) * 0.02], pitch: 0.1, R: [0.22, 0.44, 0.06 + Math.sin(a) * 0.1], L: [-0.22, 0.44, 0.06 - Math.sin(a) * 0.1], advance: f.variant === "trample" ? 0.1 : 0 };
  },
  dance: (f) => {
    // Arms out to the shoulders on either side, step and step and a lift of the knee, round with the ring.
    const beat = f.t * 2.2;
    const [n, u] = cycle(beat, 1);
    const kick = n % 4 === 3 ? Math.sin(u * Math.PI) : 0;
    const step = Math.sin(u * Math.PI);
    return { shift: [0, Math.sin(beat * Math.PI * 0.5) * 0.08, step * 0.03], roll: Math.sin(beat * Math.PI) * 0.05, legs: { L: [n % 2 === 0 ? -0.35 * step : 0, n % 2 === 0 ? 0.5 * step : 0, 0], R: [n % 4 === 3 ? -1.0 * kick : n % 2 === 1 ? -0.35 * step : 0, n % 4 === 3 ? 0.9 * kick : n % 2 === 1 ? 0.5 * step : 0, 0] }, R: [0.36, 0.74, 0.04], L: [-0.36, 0.74, 0.04] };
  },
  fish: (f, k) => {
    // The cast, back over the shoulder and out; then the waiting, and a lift of the tip now and then.
    if (f.t < 1.1) {
      const u = f.t / 1.1;
      return { twist: mix(-0.4, 0.3, seg(u, 0.4, 0.7)) * hill(u, 0, 0.5, 1), R: path(u, CHEST, [0.2, 0.98, -0.14], [0.12, 0.8, 0.4], [0.1, 0.6, 0.36]), L: [-0.02, 0.5, 0.26], grip: true, two: true, released: u >= 0.6 ? 1 : 0 };
    }
    const twitch = Math.max(0, Math.sin(f.t * 0.9 + 1)) ** 20;
    return { pitch: 0.06, nod: 0.12, R: [0.1, 0.6 + twitch * 0.1, 0.36 - twitch * 0.06], L: [-0.02, 0.5, 0.26], grip: true, two: true, released: 1, progress: k };
  },

  // ── looking ────────────────────────────────────────────────────────────────────────────────
  peer: (f, k) => {
    const in_ = seg(k, 0, 0.25) * (1 - seg(k, 0.9, 1));
    return { crouch: 0.3 * in_, pitch: 0.5 * in_, nod: -0.15 * in_, look: Math.sin(f.t * 1.6) * 0.25 * in_, R: mixV(HIP, [0.13, 0.36, 0.12], in_), L: mixV(mirror(HIP), [-0.13, 0.36, 0.12], in_) };
  },
  peep: (f, k) => {
    // Up to the glass, hands round the eyes.
    const in_ = seg(k, 0, 0.3) * (1 - seg(k, 0.9, 1));
    return { pitch: 0.2 * in_, shift: [0.04 * in_, 0, 0.02 * in_], look: Math.sin(f.t * 1.4) * 0.3 * in_, R: mixV(HIP, [0.08, 0.92, 0.2], in_), L: mixV(mirror(HIP), [-0.08, 0.92, 0.2], in_) };
  },
  read: (f, k) => {
    // Held in both hands, and the head goes along the lines.
    const up = seg(k, 0, 0.2) * (1 - seg(k, 0.92, 1));
    const lineT = (f.t * 0.9) % 1;
    return { nod: 0.38 * up + Math.floor(f.t * 0.9) * 0.012 * up, look: mix(0.14, -0.14, lineT) * up, R: mixV(HIP, [0.08, 0.66, 0.26], up), L: mixV(mirror(HIP), [-0.08, 0.66, 0.26], up), grip: up > 0.5, two: true };
  },
  reflect: (f, k) => {
    const in_ = seg(k, 0, 0.3) * (1 - seg(k, 0.88, 1));
    return { kneel: in_, pitch: 0.75 * in_, nod: 0.3 * in_, look: Math.sin(f.t * 0.8) * 0.12, R: mixV(HIP, [0.14, 0.04, 0.3], in_), L: mixV(mirror(HIP), [-0.14, 0.04, 0.3], in_) };
  },
  "look-up": (f, k) => {
    // Head back, a hand over the eyes against the light.
    const up = seg(k, 0, 0.25) * (1 - seg(k, 0.9, 1));
    return { pitch: -0.1 * up, nod: -0.6 * up, look: Math.sin(f.t * 0.7) * 0.15 * up, R: mixV(HIP, [0.1, 1.0, 0.14], up), L: null };
  },
  watch: (f, k) => {
    // Arms folded, the weight on one leg and then the other.
    const in_ = seg(k, 0, 0.2);
    return { roll: Math.sin(f.t * 0.9) * 0.035 * in_, look: Math.sin(f.t * 0.6) * 0.2 * in_, R: mixV(HIP, [-0.07, 0.6, 0.17], in_), L: mixV(mirror(HIP), [0.07, 0.56, 0.18], in_) };
  },
  listen: (f, k) => {
    // Still, the head a little on one side, moving with it.
    const in_ = seg(k, 0, 0.25);
    return { roll: Math.sin(f.t * 1.5) * 0.03 * in_, nod: 0.1 * in_ + Math.sin(f.t * 3) * 0.03 * in_, look: 0.2 * in_, R: mixV(HIP, [0.03, 0.44, 0.15], in_), L: mixV(mirror(HIP), [-0.03, 0.42, 0.15], in_) };
  },

  // ── said with the body ─────────────────────────────────────────────────────────────────────
  wave: (f, k) => {
    const up = seg(k, 0, 0.25) * (1 - seg(k, 0.85, 1));
    return { roll: -0.04 * up, R: mixV(HIP, [0.28 + Math.sin(f.t * 9) * 0.07, 1.02, 0.1], up), L: null, nod: -0.05 * up };
  },
  nod: (f, k) => ({ nod: Math.max(0, Math.sin(clamp(k) * Math.PI * 2)) * 0.4, pitch: 0.05 * hill(k, 0, 0.5, 1), R: null, L: null }),
  point: (f, k) => {
    // The arm out along it, and the head goes from them to it and back.
    const out = seg(k, 0, 0.3) * (1 - seg(k, 0.88, 1));
    const sideways = f.variant === "point" ? 0.26 : 0.06;
    return { twist: sideways * 1.2 * out, look: sideways * 2 * hill(k, 0.2, 0.5, 0.8), R: mixV(HIP, [sideways, 0.74, 0.46], out), L: null };
  },
  talk: (f) => {
    // A hand that goes with the words.
    const a = f.t * 3.1;
    return { nod: Math.sin(f.t * 2.3) * 0.05, R: [0.16 + Math.cos(a) * 0.03, 0.58 + Math.sin(a) * 0.04, 0.26], L: Math.sin(f.t * 0.7) > 0.6 ? [-0.16, 0.56, 0.24] : null };
  },
  ask: (f, k) => {
    // Both palms up, and a tilt of the head.
    const up = seg(k, 0, 0.3) * (1 - seg(k, 0.88, 1));
    return { shift: [0, 0, 0.012 * up], roll: 0.05 * up, nod: -0.05 * up, R: mixV(HIP, [0.17, 0.52, 0.26], up), L: mixV(mirror(HIP), [-0.17, 0.52, 0.26], up) };
  },
  scold: (f, k) => {
    // Leaning in, one hand on the hip, a finger going.
    const on = seg(k, 0, 0.2) * (1 - seg(k, 0.9, 1));
    return { pitch: 0.16 * on, nod: -0.05 * on, R: mixV(HIP, [0.1 + Math.sin(f.t * 13) * 0.035, 0.84, 0.3], on), L: mixV(mirror(HIP), [-0.2, 0.5, 0.0], on) };
  },
  refuse: (f, k) => {
    // A palm up between them, close in, the weight going back from it, and the head from side to side.
    const on = seg(k, 0, 0.25) * (1 - seg(k, 0.88, 1));
    return { pitch: -0.1 * on, shift: [-0.05 * on, 0, 0], look: Math.sin(clamp(k) * TAU * 2) * 0.3 * on, R: mixV(HIP, [0.16, 0.8, 0.24], on), L: mixV(mirror(HIP), [-0.2, 0.5, 0.0], on) };
  },
  halt: (f, k) => {
    // A step toward them and both palms out.
    const on = seg(k, 0, 0.25) * (1 - seg(k, 0.9, 1));
    return { shift: [0.08 * on, 0, 0], look: Math.sin(clamp(k) * TAU) * 0.2 * on, R: mixV(HIP, [0.14, 0.74, 0.38], on), L: mixV(mirror(HIP), [-0.14, 0.74, 0.38], on) };
  },
  bow: (f, k) => {
    // A hand to the chest and the head down.
    const down = hill(k, 0.1, 0.5, 0.95);
    return { pitch: 0.45 * down, nod: 0.3 * down, R: mixV(HIP, [0.0, 0.62, 0.14], seg(k, 0, 0.25) * (1 - seg(k, 0.85, 1))), L: null };
  },
  laugh: (f, k) => {
    // Head back, shoulders going, hands to the belly.
    const on = seg(k, 0, 0.2) * (1 - seg(k, 0.9, 1));
    const shake = Math.sin(f.t * 22) * 0.012 * on;
    return { shift: [0, 0, shake], pitch: -0.12 * on + Math.abs(shake) * 2, nod: -0.3 * on, R: mixV(HIP, [0.08, 0.5, 0.16], on), L: mixV(mirror(HIP), [-0.08, 0.5, 0.16], on) };
  },
  lead: (f, k) => {
    // Half turned to go, an arm offered and the other showing the way.
    const on = seg(k, 0, 0.4);
    return { yaw: 0.5 * on, look: -0.5 * on, R: mixV(HIP, [0.32, 0.6, 0.22], on), L: mixV(mirror(HIP), [-0.18, 0.56, 0.2], on), gait: k > 0.6 ? 0.5 : 0 };
  },
  beckon: (f, k) => {
    // A hand to the mouth and a shout, an arm up; then off at a run.
    if (k < 0.3) {
      const on = seg(k, 0, 0.1);
      return { R: mixV(HIP, [0.26 + Math.sin(f.t * 10) * 0.08, 1.02, 0.08], on), L: mixV(mirror(HIP), [-0.06, 0.86, 0.17], on), nod: -0.12 * on };
    }
    return { yaw: 2.4 * seg(k, 0.3, 0.42), gait: 1.5, pitch: 0.2 };
  },
  queue: (f, k) => {
    // In line: a hand on the hip, the weight from one leg to the other, a look past the one in front,
    // and a step up when the line moves.
    const in_ = seg(k, 0, 0.15);
    const up = seg(k, 0.6, 0.75);
    return { roll: Math.sin(f.t * 1.1) * 0.07 * in_, look: Math.max(0, Math.sin(f.t * 0.9)) ** 4 * 0.5 * in_, shift: [0.1 * up, Math.max(0, Math.sin(f.t * 0.9)) ** 4 * 0.06 * in_, 0], gait: up > 0 && up < 1 ? 0.5 : 0, R: mixV(HIP, [0.21, 0.5, -0.02], in_), L: null };
  },
  respect: (f, k) => {
    // Down on a knee, head bowed, a hand on the chest.
    const in_ = seg(k, 0, 0.3) * (1 - seg(k, 0.9, 1));
    return { kneel: in_, pitch: 0.3 * in_, nod: 0.5 * in_, R: mixV(HIP, [0.0, 0.5, 0.14], in_), L: mixV(mirror(HIP), [-0.14, 0.3, 0.14], in_) };
  },

  // ── at rest ────────────────────────────────────────────────────────────────────────────────
  // On a seat, as on a chair, hands on the thighs. With nothing to sit on, on the ground: it used to
  // be the chair either way, so a body by a fire or on the sand sat on a chair nobody could see.
  sit: (f) =>
    f.seated
      ? { sit: 1, R: [0.13, 0.38, 0.2], L: [-0.13, 0.38, 0.2], look: Math.sin(f.t * 0.4) * 0.2, nod: Math.sin(f.t * 0.27) * 0.04 }
      : { floor: 1, pitch: 0.22, R: [0.12, 0.23, 0.24], L: [-0.12, 0.23, 0.24], look: Math.sin(f.t * 0.4) * 0.2, nod: Math.sin(f.t * 0.27) * 0.04 },
  lie: (f) => ({ lie: 1, R: null, L: null, nod: Math.sin(f.t * 0.3) * 0.03 }),
};

/** Every gesture this file moves: what the test holds against `GESTURES`. */
export const MOVED: readonly Gesture[] = Object.keys(MOTIONS) as Gesture[];

const local = new THREE.Vector3();
const STAND: Leg = [0, 0, 0];
const KNEEL: { L: Leg; R: Leg } = { L: [-0.15, 1.75, 0.3], R: [-1.35, 1.45, -0.1] };
const SIT: Leg = [-1.45, 1.5, -0.05];
/** On the ground: how far the hips come down to it, and the legs drawn up with the soles flat. */
const FLOOR_DROP = 0.37;
const FLOOR: Leg = [-1.95, 2.25, -0.3];
const mixLeg = (a: Leg, b: Leg, k: number): Leg => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/**
 * Move the rig as a gesture has it at this moment, over the standing body `poseCharacter` has just
 * made, and say what the hands hold. The root's place and heading are the caller's; this moves what is
 * inside it.
 */
export function gestureCharacter(p: CharacterParts, gesture: Gesture, f: GestureFrame): GestureState {
  const k = f.holdS > 0 ? clamp(f.t / f.holdS) : 0;
  const s = MOTIONS[gesture](f, k);
  const w = f.weight ?? 1;

  // ── the body ──
  const crouch = (s.crouch ?? 0) * w;
  const kneel = (s.kneel ?? 0) * w;
  const sit = (s.sit ?? 0) * w;
  const floor = (s.floor ?? 0) * w;
  const lie = (s.lie ?? 0) * w;
  const [ahead, aside, lift] = s.shift ?? [0, 0, 0];
  p.body.position.y += lift * w - 0.3 * crouch - 0.14 * kneel - SIT_DROP * sit - FLOOR_DROP * floor;
  p.body.position.z = ahead * w;
  p.body.position.x = aside * w;
  p.body.rotation.z += (s.roll ?? 0) * w;
  p.body.rotation.y = (s.yaw ?? 0) * w;
  p.torso.rotation.x += (s.pitch ?? 0) * w;
  p.torso.rotation.y += (s.twist ?? 0) * w;
  p.head.rotation.x += (s.nod ?? 0) * w;
  p.head.rotation.y += (s.look ?? 0) * w - (s.twist ?? 0) * w * 0.6;
  if (lie > 0) {
    // On the back: the whole body goes over backward about the heels, and rests on the ground.
    p.body.rotation.x = -Math.PI / 2 * lie;
    p.body.position.y += 0.1 * lie;
    p.body.position.z += 0.5 * lie;
    p.legR.rotation.x = -0.5 * lie;
    p.kneeR.rotation.x = 1.0 * lie;
    p.armL.rotation.set(0.2 * lie, 0, 0.5 * lie);
    p.armR.rotation.set(0.2 * lie, 0, -0.5 * lie);
  }

  // ── the legs: set outright, walking on the spot, or folded under a body that has gone down ──
  const set = (upper: THREE.Bone, knee: THREE.Bone, foot: THREE.Bone, leg: Leg) => {
    upper.rotation.x = leg[0];
    knee.rotation.x = leg[1];
    foot.rotation.x = leg[2];
  };
  if (lie <= 0) {
    const fold = (side: -1 | 1): Leg => {
      if (s.legs) return side < 0 ? s.legs.L : s.legs.R;
      const height = -0.397 + 0.3 * crouch - lift * w;
      if (s.gait) {
        const g = gaitFootTarget(f.t * 9 * s.gait + (side > 0 ? Math.PI : 0), Math.min(1, s.gait), 0);
        const pose = solveLeg(g.forward * 0.6 - ahead * w * 0.5, height + g.lift);
        return [pose.hip, pose.knee, pose.ankle];
      }
      // The feet stay where they were: a body that has leaned forward has its feet behind it.
      const pose = solveLeg(-ahead * w, height);
      return [pose.hip, pose.knee, pose.ankle];
    };
    let L = fold(-1);
    let R = fold(1);
    if (!s.legs) {
      if (kneel > 0) {
        L = mixLeg(L, KNEEL.L, kneel);
        R = mixLeg(R, KNEEL.R, kneel);
      }
      if (sit > 0) {
        L = mixLeg(L, SIT, sit);
        R = mixLeg(R, SIT, sit);
      }
      if (floor > 0) {
        L = mixLeg(L, FLOOR, floor);
        R = mixLeg(R, FLOOR, floor);
      }
    } else if (w < 1) {
      L = mixLeg(STAND, L, w);
      R = mixLeg(STAND, R, w);
    }
    set(p.legL, p.kneeL, p.footL, L);
    set(p.legR, p.kneeR, p.footR, R);
  }

  // ── the hands: each to its point, the arm solved to it ──
  if (lie <= 0) {
    const hand = (side: -1 | 1, at: V | null | undefined) => {
      if (!at) return;
      local.set(at[0], at[1], at[2]);
      p.root.localToWorld(local);
      stretchCharacter(p, side, local, w);
    };
    p.root.updateMatrixWorld(true);
    hand(1, s.R);
    hand(-1, s.L);
  }
  p.root.updateMatrixWorld(true);
  return { grip: (s.grip ?? false) && w > 0.5, twoHanded: s.two ?? false, released: s.released ?? 0, progress: s.progress ?? k, advance: (s.advance ?? 0) * w };
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
/** The way the forearm points, elbow to wrist: how a tool held by its handle lies. */
export function handAim(p: CharacterParts, out: THREE.Vector3): THREE.Vector3 {
  p.handR.getWorldPosition(a);
  p.elbowR.getWorldPosition(b);
  return out.copy(a).sub(b).normalize();
}
/** Where the thing in the hand is: at the fingers of the one hand, or between the two. */
export function handPoint(p: CharacterParts, twoHanded: boolean, out: THREE.Vector3): THREE.Vector3 {
  p.handR.getWorldPosition(a);
  if (!twoHanded) {
    // A little past the wrist, the way the forearm points.
    p.elbowR.getWorldPosition(b);
    return out.copy(a).addScaledVector(b.sub(a).normalize(), -0.05 * p.root.scale.y);
  }
  p.handL.getWorldPosition(b);
  return out.copy(a).add(b).multiplyScalar(0.5);
}
