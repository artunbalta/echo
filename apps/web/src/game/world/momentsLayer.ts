/**
 * Moments and hidden things (DECISIONS C86), drawn and played out for this viewer.
 *
 * Every minute or so, while nothing the director set out stands, something small happens a few strides
 * ahead of the stranger: its people walk in from the side, it happens, and they walk off when it is
 * over, whether the stranger did anything or not (`@echo/planet` `moments.ts` says which and where;
 * this layer keeps the clock and the choreography). What can be done to it is offered like anything
 * else within reach (`things`), and the act is measured like any other (`Interact.tsx`); walking past it
 * once it was in plain view is this layer's to notice (`onPassed`), as the director's is.
 *
 * The village's hidden things are drawn here too: the same for everyone, each found once by each
 * stranger (kept on this device), and once found it offers nothing more.
 *
 * PRESENTATION ONLY: nothing here is shared or stored by the server, and the village's own day (the
 * schedule everyone sees) is untouched. Its people are passers-by drawn by this layer, not villagers
 * taken out of their day.
 */
import * as THREE from "three";
import {
  MOMENT,
  MOMENTS,
  doorSpot,
  eggLine,
  eggsOf,
  entryPoint,
  momentPass,
  momentSpot,
  nextMoment,
  openGround,
  type Egg,
  type MomentGround,
  type MomentKind,
  householdOn,
  worldDayIndex,
  type Thing,
  type WorldClock,
} from "@echo/planet";

import { Crowd, hashUnit, lookFor, type Look } from "./crowd";
import type { DirectorLayer } from "./directorLayer";
import type { InteriorLayer } from "./interiorLayer";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";

export interface MomentsLayer extends WorldLayer {
  readonly name: "moments";
  /** What can be acted on near a point: the moment going on, and hidden things not yet found. */
  things(mx: number, my: number): Thing[];
  /** An act on one of them was finished: the moment plays out, a hidden thing is found. A line to say, or null. */
  acted(ref: string, verbId: string): string | null;
  /** Called once when the stranger has walked past a moment whose passing is data. */
  onPassed(fn: ((kind: MomentKind, ref: string, distM: number) => void) | null): void;
  /** The moment now (for tests and a played visit's log), or null. */
  current(): { kind: MomentKind; x: number; y: number; state: "arriving" | "live" | "ending" } | null;
  /** The hidden things, and which this stranger has found. */
  eggs(): readonly (Egg & { found: boolean })[];
}

type P = { x: number; y: number };

interface Live {
  id: string;
  kind: MomentKind;
  spot: P;
  facing: number;
  entry: P;
  exit: P;
  t0: number;
  arrive: number;
  near: boolean;
  outcome: { verb: string; at: number } | null;
  /** Where a ball was sent: the stranger's feet when it was thrown. */
  aim: P | null;
  looks: Look[];
  /** For the ball games: the throw that went to the stranger, and when it landed. */
  longAt: number | null;
}

interface Figure {
  x: number;
  y: number;
  heading: number;
  activity: "walk" | "stand" | "stoop" | "work" | "sit" | "play" | "mourn";
  speed: number;
  talk?: number;
  wave?: number;
}

const WALK_MPS = 1.4;
const RUN_MPS = 2.6;
const APPLES = 8;
const FOUND_KEY = (cell: string) => `echo.eggs.${cell}`;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const toward = (a: P, b: P) => Math.atan2(b.y - a.y, b.x - a.x);
const along = (p: P, a: number, d: number): P => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where someone walking from `a` to `b`, setting off at `t0` at `mps`, is at `t`, and whether they still walk. */
function walking(a: P, b: P, t0: number, mps: number, t: number): { p: P; heading: number; moving: boolean } {
  const d = dist(a, b);
  const k = d < 1e-6 ? 1 : Math.min(1, Math.max(0, ((t - t0) * mps) / d));
  return { p: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, heading: toward(a, b), moving: k > 0 && k < 1 };
}

/** A ball's flight from `a` to `b` over `s` seconds, `peak` metres at its highest: where it is at fraction k. */
function arc(a: P, b: P, k: number, peak: number): { p: P; h: number } {
  const c = Math.min(1, Math.max(0, k));
  return { p: { x: lerp(a.x, b.x, c), y: lerp(a.y, b.y, c) }, h: 1.1 + Math.sin(Math.PI * c) * peak - c * 0.9 };
}

export function momentsLayer(options: { clock: WorldClock }): MomentsLayer {
  let frame: WorldFrame | null = null;
  let ctxRef: LayerContext | null = null;
  let crowd: Crowd | null = null;
  const group = new THREE.Group();
  group.name = "moments";
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const mat = (hex: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
    materials.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };

  // Props, made once and moved about.
  let basket: THREE.Mesh | null = null;
  const apples: THREE.Mesh[] = [];
  let cart: THREE.Group | null = null;
  let ball: THREE.Mesh | null = null;
  const buckets: THREE.Mesh[] = [];
  let hen: THREE.Group | null = null;
  let lamp: THREE.Mesh | null = null;
  let streak: THREE.Mesh | null = null;
  let door: THREE.Group | null = null;
  const handAt = new THREE.Vector3();
  const eggMeshes = new Map<string, THREE.Object3D>();

  let live: Live | null = null;
  let count = 0;
  let nextAt = MOMENT.firstS;
  let started = -1;
  let seed = "anon";
  let eggs: Egg[] = [];
  let found = new Set<string>();
  let passedFn: ((kind: MomentKind, ref: string, distM: number) => void) | null = null;
  let me: P = { x: 0, y: 0 };

  const ground = (): MomentGround => ({
    height: (x, y) => {
      if (!frame) return -1;
      const [tx, ty] = frame.fromLocalM(x, y);
      return frame.heightAtTile(tx, ty);
    },
    plan: ctxRef?.region.village?.plan ?? null,
  });

  const place = (o: THREE.Object3D, p: P, lift = 0, yaw = 0) => {
    if (!frame) return;
    const [tx, ty] = frame.fromLocalM(p.x, p.y);
    o.position.set(tx * frame.tileM, Math.max(0, frame.heightAtTile(tx, ty)) + lift, ty * frame.tileM);
    // A local heading h points along (cos h, -sin h) in three's x-z, as the villagers' rig has it.
    o.rotation.y = yaw;
    o.visible = true;
  };
  const yawOf = (heading: number) => heading + Math.PI / 2;

  const keepFound = () => {
    try {
      if (ctxRef) localStorage.setItem(FOUND_KEY(ctxRef.region.cell), JSON.stringify([...found]));
    } catch {
      // kept for this page only
    }
  };

  /** Where the people of a moment stand once they are in it, by kind. */
  const spots = (l: Live): P[] => {
    const side = l.facing + Math.PI / 2;
    const plan = ctxRef?.region.village?.plan;
    switch (l.kind) {
      case "spilled-basket":
      case "stuck-cart":
      case "stray-ball":
        return [l.spot];
      case "ball-game":
        // Two who throw to each other, and one standing off on their own.
        return [along(l.spot, side, 1.7), along(l.spot, side + Math.PI, 1.7), along(along(l.spot, l.facing + Math.PI, 3), side, 3)];
      case "well-custom": {
        const c = plan?.centre ?? l.spot;
        return [along(c, l.facing + 1.2, 1.5), along(c, l.facing - 1.6, 1.5)];
      }
      case "well-queue": {
        const c = plan?.centre ?? l.spot;
        return [0, 1, 2].map((i) => along(c, l.facing, 1.7 + 1.25 * i));
      }
      case "village-dance":
        return [0, 1, 2, 3, 4, 5].map((i) => along(l.spot, (i / 6) * Math.PI * 2, 2.3));
      case "loose-hen":
        return [l.spot];
      case "falling-stars":
      case "banging-door":
        return [];
    }
  };

  /** Where the moment can be acted on now, or null (still arriving, or over). */
  const thingAt = (l: Live, t: number): P | null => {
    if (l.outcome) return null;
    const plan = ctxRef?.region.village?.plan;
    switch (l.kind) {
      case "spilled-basket":
      case "stuck-cart":
        return t >= l.arrive ? l.spot : null;
      case "ball-game":
      case "stray-ball":
        return l.longAt !== null && t >= l.longAt && l.aim ? l.aim : null;
      case "well-custom":
        return t >= l.arrive && plan ? along(plan.centre, toward(plan.centre, me), 0.2) : null;
      case "well-queue":
        return t >= l.arrive ? along(plan?.centre ?? l.spot, l.facing, 1.7 + 1.25 * 3) : null;
      case "village-dance":
      case "loose-hen":
        return t >= l.arrive ? l.spot : null;
      case "falling-stars":
        // The sky is over the stranger wherever they walk.
        return t >= 1 ? me : null;
      case "banging-door":
        return l.spot;
    }
  };

  const sizeOf = (kind: MomentKind) =>
    kind === "village-dance" ? 2.6 : kind === "loose-hen" ? 2 : kind === "well-custom" ? 1.6 : kind === "stuck-cart" ? 1.4 : kind === "spilled-basket" ? 1.8 : kind === "falling-stars" ? 0 : kind === "banging-door" ? 0.8 : 0.6;

  /** Start the next moment, if one fits here and now. */
  const begin = (ctx: LayerContext, now: number, hour: number) => {
    const plan = ctx.region.village?.plan ?? null;
    const next = nextMoment(seed, count, hour, me, plan);
    if (!next) {
      nextAt = now + 20;
      return;
    }
    const def = MOMENTS[next.kind];
    const g = ground();
    const staged = ctx.layer<DirectorLayer>("director")?.staging() ?? null;
    let spot: P | null = null;
    let facing = 0;
    // The way the camera looks, on the ground: what is ahead of the stranger is what they will see.
    const fwd = new THREE.Vector3();
    ctx.camera.getWorldDirection(fwd);
    const [ax, ay] = frame!.toLocalM((ctx.camera.position.x + fwd.x * 10) / frame!.tileM, (ctx.camera.position.z + fwd.z * 10) / frame!.tileM);
    const [cx, cy] = frame!.toLocalM(ctx.camera.position.x / frame!.tileM, ctx.camera.position.z / frame!.tileM);
    const heading = Math.atan2(ay - cy, ax - cx);
    if (def.where === "sky") {
      spot = me;
      facing = heading;
    } else if (def.where === "door" && plan) {
      // A lived-in house's door: a ruin's has nothing left to bang.
      const village = ctx.region.village!;
      const day = worldDayIndex(options.clock, Date.now());
      const d = doorSpot(me, heading, plan, (plot) => householdOn(village.settlement, plot, day) !== null);
      if (d) {
        spot = d;
        facing = d.facing;
      }
    } else if (def.where === "well" && plan) {
      spot = plan.centre;
      facing = toward(plan.centre, me);
    } else {
      const s = momentSpot(me, heading, `${seed}|${next.n}`, g, staged ? { x: staged.x, y: staged.y } : null);
      if (s && def.where === "green" && plan && dist(s, plan.centre) > plan.greenRadiusM) {
        // A dance is on the green: the stretch of it nearest the stranger.
        const on = along(plan.centre, toward(plan.centre, me), plan.greenRadiusM * 0.45);
        spot = openGround(g, on.x, on.y) ? on : null;
        facing = toward(spot ?? on, me);
      } else if (s) {
        spot = s;
        facing = s.facing;
      }
    }
    if (!spot) {
      nextAt = now + 8;
      return;
    }
    count = next.n;
    const id = `${seed}|${count}`;
    const entry = entryPoint(spot, me, id, g);
    const exit = along(spot, toward(entry, spot), MOMENT.entryM);
    const l: Live = { id, kind: next.kind, spot, facing, entry, exit, t0: now, arrive: 0, near: false, outcome: null, aim: null, looks: [], longAt: null };
    const people = l.kind === "village-dance" ? 6 : l.kind === "ball-game" || l.kind === "well-queue" ? 3 : l.kind === "well-custom" ? 2 : l.kind === "falling-stars" || l.kind === "banging-door" ? 0 : 1;
    l.looks = Array.from({ length: people }, (_, i) => {
      const k = hashUnit(`${id}|${i}`);
      const child = def.children;
      return lookFor(`moment:${id}:${i}`, child ? "farmer" : (["farmer", "fisher", "weaver", "potter", "labourer", "carter"] as const)[Math.floor(k * 6)], child ? 7 + k * 5 : 22 + k * 40, k < 0.5 ? "f" : "m");
    });
    const far = Math.max(0, ...spots(l).map((s) => dist(entry, s)));
    l.arrive = def.where === "sky" || def.where === "door" ? 0.5 : far / (def.children ? RUN_MPS : WALK_MPS);
    live = l;
  };

  /** End it: its people walk off, and the next comes about a minute later. */
  const close = (now: number) => {
    live = null;
    nextAt = now + MOMENT.gapS[0] + hashUnit(`${seed}|gap|${count}`) * (MOMENT.gapS[1] - MOMENT.gapS[0]);
  };

  /** Everyone in the moment at `t` seconds into it, and its props put where they are. */
  const play = (l: Live, t: number): Figure[] => {
    const where = spots(l);
    const done = l.outcome;
    const sinceDone = done ? t - (done.at - l.t0) : 0;
    const leaving = done ? sinceDone > 3.5 : t > MOMENTS[l.kind].lifeS;
    const leaveAt = done ? done.at - l.t0 + 3.5 : MOMENTS[l.kind].lifeS;
    const mps = MOMENTS[l.kind].children ? RUN_MPS : WALK_MPS;
    const out: Figure[] = [];
    const arriveOrLeave = (i: number, at: P): Figure | null => {
      const from = along(l.entry, l.facing + Math.PI / 2, (i - (where.length - 1) / 2) * 0.8);
      if (t < l.arrive) {
        const w = walking(from, at, 0, mps, t);
        return { x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? (MOMENTS[l.kind].children ? "play" : "walk") : "stand", speed: w.moving ? 1 : 0 };
      }
      if (leaving) {
        const to = along(l.exit, l.facing + Math.PI / 2, (i - (where.length - 1) / 2) * 0.8);
        const w = walking(at, to, leaveAt + i * 0.4, mps * 0.85, t);
        return { x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? (MOMENTS[l.kind].children ? "play" : "walk") : "stand", speed: w.moving ? 1 : 0 };
      }
      return null;
    };
    const hideProps = () => {
      if (basket) basket.visible = false;
      for (const a of apples) a.visible = false;
      if (cart) cart.visible = false;
      if (ball) ball.visible = false;
      for (const b of buckets) b.visible = false;
      if (hen) hen.visible = false;
      if (lamp) lamp.visible = false;
      if (streak) streak.visible = false;
      if (door) door.visible = false;
    };
    hideProps();

    switch (l.kind) {
      case "spilled-basket": {
        const f = arriveOrLeave(0, l.spot);
        const spill = l.arrive;
        // The apples: in the basket, then all over, then gathered up — slowly by her, at once with help.
        const gathered = done ? 1 : Math.min(1, Math.max(0, (t - spill) / 48));
        for (let i = 0; i < APPLES; i++) {
          const a = (hashUnit(`${l.id}|apple|${i}`) * 2 - 1) * Math.PI;
          const r = 0.6 + hashUnit(`${l.id}|appler|${i}`) * 1.6;
          const rest = along(l.spot, l.facing + a, r);
          const gone = i / APPLES < gathered || (done && sinceDone > 0.4 + i * 0.08);
          if (t < spill || gone) continue;
          const k = Math.min(1, (t - spill) / 0.5);
          place(apples[i]!, { x: lerp(l.spot.x, rest.x, k), y: lerp(l.spot.y, rest.y, k) }, 0.08 + Math.sin(Math.PI * k) * 0.35);
        }
        if (f) {
          // Carried in, and carried off again.
          out.push(f);
          place(basket!, along({ x: f.x, y: f.y }, f.heading + 0.6, 0.4), 0.75, yawOf(f.heading));
        } else {
          place(basket!, along(l.spot, l.facing + 0.4, 0.5), 0.12, yawOf(l.facing));
          if (done && sinceDone < 3.5) out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 0.6 && sinceDone < 2.6 ? Math.sin((Math.PI * (sinceDone - 0.6)) / 2) : 0, talk: 0.6 });
          else out.push({ x: l.spot.x, y: l.spot.y, heading: l.facing + Math.sin(t * 0.4) * 0.8, activity: "stoop", speed: 0 });
        }
        break;
      }
      case "stuck-cart": {
        const f = arriveOrLeave(0, along(l.spot, l.facing + Math.PI, 1.1));
        const rolled = done ? Math.min(1, sinceDone / 2) : 0;
        const cartAt = along(l.spot, l.facing + Math.PI / 2, rolled * 3);
        const stuck = t >= l.arrive && !done;
        if (cart) {
          const behind = f && t < l.arrive ? along({ x: f.x, y: f.y }, f.heading + Math.PI, 1.5) : f && leaving ? along({ x: f.x, y: f.y }, f.heading + Math.PI, 1.5) : cartAt;
          const yaw = f && (t < l.arrive || leaving) ? yawOf(f.heading) : yawOf(l.facing + Math.PI / 2);
          place(cart, behind, stuck ? -0.12 : 0, yaw);
          cart.rotation.z = stuck ? 0.22 + Math.sin(t * 6) * 0.03 : 0;
        }
        if (f) out.push(f);
        else if (done && sinceDone < 3.5) out.push({ x: cartAt.x - Math.cos(l.facing) * 1.1, y: cartAt.y - Math.sin(l.facing) * 1.1, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 2 ? Math.sin((Math.PI * (sinceDone - 2)) / 1.5) : 0 });
        else {
          const at = along(l.spot, l.facing + Math.PI, 1.1);
          // Straining at it, and, left to it too long, sitting down on the shaft.
          out.push({ x: at.x, y: at.y, heading: l.facing, activity: t - l.arrive > 30 ? "sit" : "work", speed: 0 });
        }
        break;
      }
      case "ball-game": {
        const throwEvery = 1.3;
        const longAt = l.arrive + 7;
        for (let i = 0; i < 3; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f) out.push(f);
          else {
            const lookAt = i === 2 ? along(l.spot, 0, 0) : where[1 - i]!;
            out.push({ x: where[i]!.x, y: where[i]!.y, heading: toward(where[i]!, lookAt), activity: "stand", speed: 0, talk: i < 2 ? 0.3 : 0, wave: l.longAt !== null && !done && i < 2 && t > l.longAt ? 0.6 : 0 });
          }
        }
        if (t >= l.arrive && !leaving) {
          // Back and forth between the two, then one goes long, to the stranger.
          if (l.longAt === null && t >= longAt) {
            l.aim = along(me, toward(me, l.spot), 0.9);
            l.longAt = t + 1.1;
          }
          let a: P;
          let b: P;
          let k: number;
          let peak = 1.4;
          if (l.longAt === null) {
            const n = Math.floor((t - l.arrive) / throwEvery);
            a = where[n % 2]!;
            b = where[(n + 1) % 2]!;
            k = ((t - l.arrive) % throwEvery) / throwEvery;
          } else if (!done) {
            a = where[1]!;
            b = l.aim!;
            k = (t - (l.longAt - 1.1)) / 1.1;
            peak = 2.6;
          } else {
            // Thrown back by the stranger: to the one on their own, or to the others; then the game goes on.
            const included = done.verb === "to-alone";
            const s = t - (done.at - l.t0);
            const players = included ? [where[2]!, where[0]!, where[1]!] : [where[0]!, where[1]!];
            if (s < 1) {
              a = l.aim!;
              b = players[0]!;
              k = s;
            } else {
              const n = Math.floor((s - 1) / throwEvery);
              a = players[n % players.length]!;
              b = players[(n + 1) % players.length]!;
              k = ((s - 1) % throwEvery) / throwEvery;
            }
          }
          const f = arc(a, b, k, peak);
          if (ball) place(ball, f.p, Math.max(0.12, f.h));
        }
        break;
      }
      case "stray-ball": {
        const f = arriveOrLeave(0, l.spot);
        const hitAt = l.arrive + 2.4;
        if (f) out.push(f);
        else {
          const guilty = l.longAt !== null && !done;
          out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: guilty ? "mourn" : "stand", speed: 0, wave: done?.verb === "laugh" && sinceDone > 1 && sinceDone < 3 ? 0.8 : 0 });
        }
        if (ball && !leaving) {
          if (t < hitAt) place(ball, along(l.spot, l.facing, 0.4), 0.3 + Math.abs(Math.sin(t * 4)) * 0.9);
          else {
            if (l.longAt === null) {
              l.aim = along(me, toward(l.spot, me), 1.1);
              l.longAt = t + 0.9;
            }
            if (t < l.longAt) {
              const k = (t - (l.longAt - 0.9)) / 0.9;
              const p = arc(l.spot, me, k, 0.6);
              place(ball, p.p, 0.6 + p.h);
            } else if (done?.verb === "laugh") {
              const k = Math.min(1, (t - (done.at - l.t0)) / 1.2);
              place(ball, { x: lerp(l.aim!.x, l.spot.x, k), y: lerp(l.aim!.y, l.spot.y, k) }, 0.12);
            } else place(ball, l.aim!, 0.12);
          }
        }
        break;
      }
      case "well-custom": {
        // Two people come by the well; each touches the rim with a bow, and walks on.
        for (let i = 0; i < 2; i++) {
          const t0 = i * 5;
          const from = along(l.entry, l.facing + Math.PI / 2, i * 3);
          const rim = where[i]!;
          const on = along(rim, toward(from, rim), 6 + i * 2);
          if (t < t0) continue;
          const reach = dist(from, rim) / WALK_MPS;
          if (t < t0 + reach) {
            const w = walking(from, rim, t0, WALK_MPS, t);
            out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
          } else if (t < t0 + reach + 2.2) {
            out.push({ x: rim.x, y: rim.y, heading: toward(rim, ctxRef?.region.village?.plan.centre ?? rim), activity: "mourn", speed: 0 });
          } else {
            const w = walking(rim, on, t0 + reach + 2.2, WALK_MPS, t);
            if (w.moving) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
          }
        }
        break;
      }
      case "well-queue": {
        const c = ctxRef?.region.village?.plan.centre ?? l.spot;
        const step = 7;
        for (let i = 0; i < 3; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f && t < l.arrive) {
            out.push(f);
            continue;
          }
          // The line moves along: the first draws water and goes, then the next steps up.
          const turnsGone = Math.max(0, Math.floor((t - l.arrive) / step));
          if (i < turnsGone) {
            const w = walking(along(c, l.facing, 1.7), along(c, l.facing + 1.4, 12), l.arrive + (i + 1) * step, WALK_MPS, t);
            if (w.moving) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
            continue;
          }
          const place_ = i - turnsGone;
          const at = along(c, l.facing, 1.7 + 1.25 * place_);
          out.push({ x: at.x, y: at.y, heading: toward(at, c), activity: place_ === 0 ? "work" : "stand", speed: 0, talk: done?.verb === "cut" && i === 2 && sinceDone < 3 ? 0.9 : 0 });
          if (buckets[i]) place(buckets[i]!, along(at, toward(at, c) + 0.9, 0.35), 0.5);
        }
        if (t > l.arrive + 3 * step + 6) close(l.t0 + t);
        break;
      }
      case "loose-hen": {
        const f = arriveOrLeave(0, l.spot);
        // The hen runs rings round the spot until it is caught; she goes after it, bent double.
        const caught = done && done.verb !== "passed" && done.verb !== "expired";
        const a = (t - l.arrive) * 2.1 + Math.sin(t * 3.3) * 0.6;
        const henAt = caught ? along(l.spot, l.facing, 0.5) : along(l.spot, a, 1.4 + Math.sin(t * 1.7) * 0.3);
        if (hen && t >= l.arrive && !(caught && sinceDone > 1.2) && !leaving) {
          place(hen, henAt, Math.abs(Math.sin(t * 9)) * (caught ? 0 : 0.08), yawOf(a + Math.PI / 2));
        }
        if (f) out.push(f);
        else if (caught && sinceDone < 3.5) out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 1.2 ? 0.7 : 0, talk: 0.5 });
        else {
          const chase = along(l.spot, a - 0.9, 0.9);
          out.push({ x: chase.x, y: chase.y, heading: a + Math.PI / 2, activity: Math.sin(t * 1.3) > 0 ? "stoop" : "walk", speed: 0.6 });
        }
        break;
      }
      case "falling-stars": {
        // A few at a time, high over the way the stranger looks, each across the sky in a second.
        const shots = [1, 5.5, 8, 12.5, 16, 19.5];
        const cam = ctxRef?.camera;
        if (streak && cam) {
          for (const [k, at] of shots.entries()) {
            const u = (t - at) / 1.1;
            if (u < 0 || u > 1) continue;
            const fwd = new THREE.Vector3();
            cam.getWorldDirection(fwd);
            fwd.y = 0;
            fwd.normalize();
            const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
            const lean = hashUnit(`${l.id}|star|${k}`) - 0.5;
            // Low enough to be in the frame of a camera looking along the ground: about fifteen degrees up.
            const from = cam.position.clone().addScaledVector(fwd, 150).addScaledVector(side, -55 + lean * 70).add(new THREE.Vector3(0, 40 + lean * 12, 0));
            const path = side.clone().multiplyScalar(80).add(new THREE.Vector3(0, -30, 0));
            streak.position.copy(from).addScaledVector(path, u);
            streak.lookAt(streak.position.clone().add(path));
            (streak.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * u) * 0.95;
            streak.visible = true;
          }
        }
        break;
      }
      case "banging-door": {
        // Banging open and shut in the gusts, until someone pulls it to.
        if (door) {
          const shut = done && done.verb === "shut";
          const gust = Math.max(0, Math.sin(t * 1.9) * Math.sin(t * 0.7 + 1)) * 0.9 + 0.15;
          place(door, l.spot, 0, yawOf(l.facing));
          (door.children[0] as THREE.Object3D).rotation.y = shut ? 0 : -gust;
        }
        break;
      }
      case "village-dance": {
        const turn = (t - l.arrive) * 0.45;
        for (let i = 0; i < 6; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f) {
            out.push(f);
            continue;
          }
          const a = (i / 6) * Math.PI * 2 + turn;
          const at = along(l.spot, a, 2.3);
          out.push({ x: at.x, y: at.y, heading: a + Math.PI / 2, activity: "walk", speed: 0.55, talk: hashUnit(`${l.id}|${i}|${Math.floor(t / 3)}`) < 0.3 ? 0.8 : 0 });
        }
        break;
      }
    }
    return out;
  };

  return {
    name: "moments",

    async build(ctx: LayerContext, signal: AbortSignal) {
      const village = ctx.region.village;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      ctxRef = ctx;
      try {
        seed = localStorage.getItem("echo.userId") ?? "anon";
        found = new Set(JSON.parse(localStorage.getItem(FOUND_KEY(ctx.region.cell)) ?? "[]") as string[]);
      } catch {
        // a page without storage plays the same, and finds them afresh
      }
      crowd = new Crowd(8, ctx.frame.tileM);
      group.add(crowd.group);

      const s = ctx.frame.tileM / 1.6;
      basket = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.22 * s, 8)), mat(0x8a6a3e));
      const appleGeo = geo(new THREE.SphereGeometry(0.075 * s, 6, 5));
      const appleMat = mat(0xb5352a);
      for (let i = 0; i < APPLES; i++) apples.push(new THREE.Mesh(appleGeo, appleMat));
      cart = new THREE.Group();
      const wood = mat(0x7a5a3a);
      const bed = new THREE.Mesh(geo(new THREE.BoxGeometry(1.1 * s, 0.35 * s, 0.75 * s)), wood);
      bed.position.y = 0.55 * s;
      const wheelGeo = geo(new THREE.CylinderGeometry(0.33 * s, 0.33 * s, 0.08 * s, 10));
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeo, mat(0x4e3a26));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.33 * s, side * 0.42 * s);
        cart.add(wheel);
      }
      const shaft = new THREE.Mesh(geo(new THREE.BoxGeometry(1.2 * s, 0.06 * s, 0.06 * s)), wood);
      shaft.position.set(1.05 * s, 0.6 * s, 0);
      cart.add(bed, shaft);
      ball = new THREE.Mesh(geo(new THREE.SphereGeometry(0.12 * s, 8, 6)), mat(0xd8c9a0));
      const bucketGeo = geo(new THREE.CylinderGeometry(0.14 * s, 0.11 * s, 0.24 * s, 8));
      for (let i = 0; i < 3; i++) buckets.push(new THREE.Mesh(bucketGeo, mat(0x6a5a44)));
      hen = new THREE.Group();
      const henBody = new THREE.Mesh(geo(new THREE.SphereGeometry(0.16 * s, 7, 5)), mat(0xe8e0cc));
      henBody.scale.set(1.25, 1, 0.9);
      henBody.position.y = 0.2 * s;
      const henHead = new THREE.Mesh(geo(new THREE.SphereGeometry(0.075 * s, 6, 5)), mat(0xe8e0cc));
      henHead.position.set(0, 0.36 * s, 0.14 * s);
      const comb = new THREE.Mesh(geo(new THREE.BoxGeometry(0.02 * s, 0.05 * s, 0.07 * s)), mat(0xc0302a));
      comb.position.set(0, 0.43 * s, 0.14 * s);
      hen.add(henBody, henHead, comb);
      // A lantern's flame, in the hand of whoever carries one after dark: drawn bright, lit by nothing.
      lamp = new THREE.Mesh(geo(new THREE.SphereGeometry(0.07 * s, 6, 5)), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
      materials.push(lamp.material as THREE.Material);
      // A door on its hinge: the group stands at the doorway, the leaf turns about its edge.
      door = new THREE.Group();
      const hinge = new THREE.Group();
      hinge.position.set(-0.45 * s, 0, 0);
      const leaf = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9 * s, 1.85 * s, 0.07 * s)), mat(0x6a4a30));
      leaf.position.set(0.45 * s, 0.93 * s, 0);
      hinge.add(leaf);
      door.add(hinge);
      streak = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9, 0.9, 22)), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      materials.push(streak.material as THREE.Material);
      streak.frustumCulled = false;
      for (const o of [basket, ...apples, cart, ball, ...buckets, hen, lamp, streak, door]) {
        o.visible = false;
        o.castShadow = o !== streak && o !== lamp;
        group.add(o);
      }

      // The village's hidden things.
      eggs = eggsOf(`${village.settlement.seed}|${ctx.region.cell}`, ground());
      const stumpMat = mat(0x5a4532);
      const hollowMat = mat(0x1c140e);
      const glass = mat(0x4f8a6a, { emissive: 0x1a3a2a, transparent: true, opacity: 0.9 });
      const poolMat = mat(0x22384a, { emissive: 0x0c1824 });
      const rockMat = mat(0x7d7a72);
      const earthMat = mat(0x5e4630);
      for (const e of eggs) {
        let o: THREE.Object3D;
        if (e.kind === "hollow-stump") {
          const g = new THREE.Group();
          const stump = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.42 * s, 0.55 * s, 0.9 * s, 9)), stumpMat);
          stump.position.y = 0.45 * s;
          const hole = new THREE.Mesh(geo(new THREE.CircleGeometry(0.26 * s, 9)), hollowMat);
          hole.rotation.x = -Math.PI / 2;
          hole.position.y = 0.905 * s;
          g.add(stump, hole);
          o = g;
        } else if (e.kind === "message-bottle") {
          const g = new THREE.Group();
          const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.26 * s, 8)), glass);
          body.rotation.z = Math.PI / 2;
          const neck = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.1 * s, 6)), glass);
          neck.rotation.z = Math.PI / 2;
          neck.position.x = 0.17 * s;
          g.add(body, neck);
          g.position.y = 0.06 * s;
          o = g;
        } else if (e.kind === "still-pool") {
          const pool = new THREE.Mesh(geo(new THREE.CircleGeometry(1.15 * s, 18)), poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.y = 0.03;
          o = pool;
        } else if (e.kind === "lookout-rock") {
          const rock = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1, 0)), rockMat);
          rock.scale.set(1.6 * s, 1.1 * s, 1.4 * s);
          rock.position.y = 0.6 * s;
          o = rock;
        } else {
          const g = new THREE.Group();
          const mound = new THREE.Mesh(geo(new THREE.SphereGeometry(0.6 * s, 8, 5)), earthMat);
          mound.scale.y = 0.25;
          const stick = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.7 * s, 5)), stumpMat);
          stick.position.set(0.35 * s, 0.35 * s, 0);
          stick.rotation.z = 0.2;
          g.add(mound, stick);
          o = g;
        }
        o.name = `egg:${e.id}`;
        const holder = new THREE.Group();
        holder.add(o);
        place(holder, e, 0, e.facing);
        group.add(holder);
        eggMeshes.set(e.id, holder);
      }
      ctx.scene.add(group);
    },

    update(_dt, ctx) {
      if (!frame || !crowd) return;
      const now = performance.now() / 1000;
      if (started < 0) {
        started = now;
        nextAt = now + MOMENT.firstS;
      }
      const player = ctx.layer<WorldLayer & { position(): P; aboard?(): boolean }>("player");
      if (!player) return;
      const at = player.position();
      const [mx, my] = frame.toLocalM(at.x, at.y);
      me = { x: mx, y: my };
      const hour = ctx.layer<SkyLayer>("sky")?.timeOfDay() ?? 0.5;
      const indoors = ctx.layer<InteriorLayer>("interior")?.inside() ?? null;
      const staged = ctx.layer<DirectorLayer>("director")?.staging() ?? null;

      // A new one, once the last is a minute gone, and never while the stranger is near something the
      // director set out (the pilot's six above all), nor indoors, nor at sea.
      if (!live && now >= nextAt) {
        const held = staged !== null && dist(me, staged) < MOMENT.holdForStagingM;
        if (held || indoors || player.aboard?.()) nextAt = now + 6;
        else begin(ctx, now, hour);
      }

      crowd.begin();
      if (live) {
        const l = live;
        const t = now - l.t0;
        const thing = thingAt(l, t);
        // Walking past it, once it was in plain view, is an answer too.
        if (thing && MOMENTS[l.kind].passed) {
          const step = momentPass(l.near, dist(me, thing));
          l.near = step.near;
          if (step.passed) {
            l.outcome = { verb: "passed", at: now };
            passedFn?.(l.kind, `moment:${l.id}`, dist(me, thing));
          }
        }
        if (!l.outcome && t > MOMENTS[l.kind].lifeS) l.outcome = { verb: "expired", at: now };
        const dark = hour > 0.8 || hour < 0.24;
        for (const [i, f] of play(l, t).entries()) {
          const [tx, ty] = frame.fromLocalM(f.x, f.y);
          const lantern = dark && l.kind === "loose-hen" && f.activity !== "stoop";
          crowd.pose(
            {
              x: tx * frame.tileM,
              y: Math.max(0, frame.heightAtTile(tx, ty)),
              z: ty * frame.tileM,
              yaw: f.heading + Math.PI / 2,
              activity: f.activity,
              speed: f.speed,
              time: now,
              phase0: hashUnit(`${l.id}|${i}`) * Math.PI * 2,
              talk: f.talk,
              wave: f.wave,
              lantern,
            },
            l.looks[i] ?? l.looks[0]!,
          );
          if (lantern && lamp && crowd.lanternAt(handAt)) {
            lamp.position.copy(handAt);
            lamp.visible = true;
          }
        }
        // Over once its people have walked off: a few seconds after the end, or its life and a walk.
        if (live === l && l.outcome && now - l.outcome.at > 3.5 + MOMENT.entryM / WALK_MPS) close(now);
      }
      crowd.end();
    },

    things(mx, my) {
      const out: Thing[] = [];
      if (live) {
        const t = performance.now() / 1000 - live.t0;
        const at = thingAt(live, t);
        if (at && Math.hypot(at.x - mx, at.y - my) < 16) out.push({ ref: `moment:${live.id}`, kind: live.kind, x: at.x, y: at.y, sizeM: sizeOf(live.kind), owners: [], name: MOMENTS[live.kind].name });
      }
      for (const e of eggs) {
        if (found.has(e.id) || Math.hypot(e.x - mx, e.y - my) > 12) continue;
        out.push({ ref: `egg:${e.id}`, kind: e.kind, x: e.x, y: e.y, sizeM: e.kind === "lookout-rock" ? 1.6 : e.kind === "still-pool" ? 1.1 : 0.5, owners: [], name: EGG_NAMES[e.kind] });
      }
      return out;
    },

    acted(ref, verbId) {
      if (ref.startsWith("moment:")) {
        if (live && ref === `moment:${live.id}` && !live.outcome) live.outcome = { verb: verbId, at: performance.now() / 1000 };
        return null;
      }
      if (ref.startsWith("egg:")) {
        const e = eggs.find((x) => `egg:${x.id}` === ref);
        if (!e) return null;
        // Sitting on the lookout can be done again; looking out from it, once.
        if (!(e.kind === "lookout-rock" && verbId === "sit")) {
          found.add(e.id);
          keepFound();
        }
        return verbId === "sit" ? null : eggLine(e);
      }
      return null;
    },

    onPassed(fn) {
      passedFn = fn;
    },

    current() {
      if (!live) return null;
      const t = performance.now() / 1000 - live.t0;
      return { kind: live.kind, x: live.spot.x, y: live.spot.y, state: t < live.arrive ? "arriving" : live.outcome ? "ending" : "live" };
    },

    eggs: () => eggs.map((e) => ({ ...e, found: found.has(e.id) })),

    dispose() {
      crowd?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.removeFromParent();
      crowd = null;
      live = null;
    },
  };
}

/** What a hidden thing is called over it. */
const EGG_NAMES: Record<Egg["kind"], string> = {
  "hollow-stump": "a hollow stump",
  "message-bottle": "a bottle half in the sand",
  "still-pool": "a still pool",
  "lookout-rock": "a big rock with a flat top",
  "buried-box": "a patch of soft earth",
};
