/**
 * A village's animals, drawn (DECISIONS C55): goats, hens, dogs, birds and fish.
 *
 * WHERE THEY ARE is the planet's (`animalAt`): the same goat in the same place for every viewer, a
 * dog a step behind its person as the villagers layer draws them. What this layer adds is what an
 * animal does about THIS stranger, and only for this viewer: hens and goats get out of the way of
 * someone walking at them, and a dog that has taken to the stranger (`setBonds`) comes to their side
 * and follows them about — waiting at the door when they go into a house.
 *
 * TWO DRAWS FOR EVERY ANIMAL IN THE VILLAGE. Every body, head, wing and fish is an instance of one
 * unit sphere, and every leg, tail and horn of one unit cylinder, each coloured per instance — the
 * crowd's trick (C41), so a herd costs no more calls than a hen. Only the spheres cast a shadow.
 */

import * as THREE from "three";
import { ANIMALS, animalAt, animalsOf, worldDayIndex, type Animal, type AnimalAt, type WorldClock } from "@echo/planet";

import { hashUnit } from "./crowd";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SettlementLayer } from "./settlementLayer";
import type { SkyLayer } from "./skyLayer";
import type { VillagersLayer } from "./villagersLayer";

export interface NearAnimal {
  id: string;
  kind: "dog" | "goat" | "hen";
  name: string | null;
  x: number;
  y: number;
  distanceM: number;
}

export interface AnimalsLayer extends WorldLayer {
  /** The nearest animal a stranger could act on within `r` metres of a local point. */
  nearest(x: number, y: number, r: number): NearAnimal | null;
  /** How much each dog has taken to this stranger, by animal id (0 … 1); from their deeds. */
  setBonds(bonds: ReadonlyMap<string, number>): void;
  /** The dog following the stranger now, if one is. */
  following(): string | null;
  /** How many animals were drawn last frame, for tests and the frame budget. */
  drawn(): number;
  /** Every animal drawn last frame within `r` of a local point, birds and all: what can be heard (C56). */
  audible(x: number, y: number, r: number): { id: string; kind: Animal["kind"]; x: number; y: number; d: number; coastal: boolean }[];
}

const SPHERES_PER = 6;
const CYLINDERS_PER = 6;
/** How close a stranger gets before hens and goats move off, metres. */
const SHY_M = 2.6;

const PALETTE = {
  goat: [0xe8e2d4, 0x8a6a4a, 0x3a3430, 0xb8a888],
  hen: [0x9a5a30, 0xe8e0d0, 0x6a4a30],
  dog: [0x6a4a30, 0x2e2a28, 0xb08850, 0x8a7a68],
  gull: [0xeeeeea, 0xc8ccd0],
  crow: [0x2a2a2e, 0x3a3a40],
  fish: [0x2e3a40],
} as const;

export function animalsLayer(options: { clock: WorldClock }): AnimalsLayer {
  let spheres: THREE.InstancedMesh | null = null;
  let cylinders: THREE.InstancedMesh | null = null;
  let frame: WorldFrame | null = null;
  let animals: Animal[] = [];
  let day = -1;
  let bonds: ReadonlyMap<string, number> = new Map();
  let follower: string | null = null;
  let drawnCount = 0;
  /** Each animal's offset from where the hour has it, for shying away and following: this viewer's. */
  const offset = new Map<string, { x: number; y: number }>();
  const lastPos = new Map<string, { x: number; y: number; kind: Animal["kind"]; name: string | null }>();
  /** Everything drawn last frame, for the ears. */
  const heard: { id: string; kind: Animal["kind"]; x: number; y: number }[] = [];
  const m = new THREE.Matrix4();
  const root = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const colour = new THREE.Color();
  let si = 0;
  let ci = 0;

  const sphere = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, rx = 0, ry = 0, rz = 0) => {
    if (!spheres || si >= spheres.instanceMatrix.count) return;
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    part.compose(v.set(x, y, z), q, sc.set(sx, sy, sz));
    m.multiplyMatrices(root, part);
    spheres.setMatrixAt(si, m);
    spheres.setColorAt(si, colour.set(hex));
    si++;
  };
  /** A limb hanging from (x, y, z), `len` long, swung `swing` about the side axis. */
  const limb = (x: number, y: number, z: number, len: number, r: number, hex: number, swing = 0, tilt = 0) => {
    if (!cylinders || ci >= cylinders.instanceMatrix.count) return;
    e.set(tilt, 0, swing);
    q.setFromEuler(e);
    // The cylinder is centred; hang it from its top.
    const dx = Math.sin(swing) * len * 0.5;
    const dy = -Math.cos(swing) * len * 0.5;
    part.compose(v.set(x + dx, y + dy, z), q, sc.set(r, len, r));
    m.multiplyMatrices(root, part);
    cylinders.setMatrixAt(ci, m);
    cylinders.setColorAt(ci, colour.set(hex));
    ci++;
  };

  const drawOne = (a: Animal, at: AnimalAt, x: number, y: number, ground: number, t: number, near: boolean) => {
    if (!frame) return;
    const s = frame.tileM / 1.6;
    const [tx, ty] = frame.fromLocalM(x, y);
    q.setFromAxisAngle(v.set(0, 1, 0), at.heading);
    root.compose(v.set(tx * frame.tileM, ground + at.z, ty * frame.tileM), q, sc.set(s, s, s));
    const shade = (list: readonly number[]) => list[Math.floor(hashUnit(a.id) * list.length)];
    const moving = at.activity === "walk";
    const step = Math.sin(t * 9 + a.phase) * (moving ? 0.5 : 0);
    if (a.kind === "dog") {
      const c = shade(PALETTE.dog);
      const lying = at.activity === "lie";
      const h = lying ? 0.16 : 0.36;
      sphere(0, h, 0, 0.72, 0.28, 0.26, c);
      sphere(0.42, h + (lying ? 0.02 : 0.14), 0, 0.24, 0.22, 0.2, c);
      sphere(0.56, h + (lying ? 0 : 0.11), 0, 0.14, 0.09, 0.1, 0x2a2420);
      sphere(0.38, h + (lying ? 0.12 : 0.27), 0.08, 0.06, 0.12, 0.05, c);
      sphere(0.38, h + (lying ? 0.12 : 0.27), -0.08, 0.06, 0.12, 0.05, c);
      if (!lying) for (const [lx, lz, ph] of [[0.24, 0.08, 0], [0.24, -0.08, Math.PI], [-0.24, 0.08, Math.PI], [-0.24, -0.08, 0]] as const) limb(lx, h - 0.05, lz, 0.32, 0.03, c, Math.sin(t * 9 + a.phase + ph) * (moving ? 0.5 : 0));
      // The tail: up, and wagging hard when its stranger is close.
      limb(-0.34, h + 0.06, 0, 0.26, 0.022, c, -2.3, Math.sin(t * (near ? 22 : 4)) * (near ? 0.7 : 0.2));
    } else if (a.kind === "goat") {
      const c = shade(PALETTE.goat);
      const lying = at.activity === "lie";
      const grazing = at.activity === "graze";
      const h = lying ? 0.22 : 0.55;
      sphere(0, h, 0, 0.78, 0.4, 0.32, c);
      const hx = grazing ? 0.48 : 0.44;
      const hy = grazing ? h - 0.3 : h + 0.2;
      sphere(hx, hy, 0, 0.24, 0.22, 0.17, c);
      limb(hx - 0.02, hy + 0.1, 0.05, 0.16, 0.025, 0x5a5048, -2.6);
      limb(hx - 0.02, hy + 0.1, -0.05, 0.16, 0.025, 0x5a5048, -2.6);
      if (!lying) for (const [lx, lz, ph] of [[0.26, 0.1, 0], [0.26, -0.1, Math.PI], [-0.26, 0.1, Math.PI], [-0.26, -0.1, 0]] as const) limb(lx, h - 0.1, lz, 0.46, 0.032, c, Math.sin(t * 7 + a.phase + ph) * (moving ? 0.4 : 0));
    } else if (a.kind === "hen") {
      const c = shade(PALETTE.hen);
      const peck = at.activity === "peck" ? Math.max(0, Math.sin(t * 14 + a.phase)) : 0;
      sphere(0, 0.25, 0, 0.32, 0.26, 0.22, c);
      sphere(0.15, 0.4 - peck * 0.25, 0, 0.13, 0.13, 0.11, c);
      sphere(0.16, 0.48 - peck * 0.25, 0, 0.07, 0.07, 0.03, 0xc0302a);
      limb(0.04, 0.14, 0.05, 0.15, 0.015, 0xd8a040, step * 0.6);
      limb(0.04, 0.14, -0.05, 0.15, 0.015, 0xd8a040, -step * 0.6);
    } else if (a.kind === "bird") {
      const c = shade(a.id.startsWith("bird:0") && animals.some((x) => x.kind === "fish") ? PALETTE.gull : PALETTE.crow);
      const flap = Math.sin(t * 16 + a.phase * 7) * 0.7;
      sphere(0, 0, 0, 0.32, 0.1, 0.12, c);
      sphere(0.14, 0.03, 0, 0.1, 0.09, 0.09, c);
      sphere(0, 0.02, 0.2, 0.2, 0.02, 0.36, c, flap, 0, 0);
      sphere(0, 0.02, -0.2, 0.2, 0.02, 0.36, c, -flap, 0, 0);
    } else {
      // A fish: a dark back at the surface, or arched in the air when it leaps.
      sphere(0, 0.02, 0, 0.36, 0.07, 0.12, PALETTE.fish[0], 0, 0, at.z > 0 ? 0.6 : 0);
    }
  };

  return {
    name: "animals",

    async build(ctx: LayerContext, signal: AbortSignal) {
      const village = ctx.region.village;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      day = worldDayIndex(options.clock, Date.now());
      animals = animalsOf(village.settlement, village.plan, day);
      const capacity = Math.max(1, animals.length);
      const material = new THREE.MeshLambertMaterial({ flatShading: true });
      spheres = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), material, capacity * SPHERES_PER);
      spheres.name = "animals:spheres";
      spheres.castShadow = true;
      spheres.receiveShadow = true;
      spheres.frustumCulled = false;
      cylinders = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1), material, capacity * CYLINDERS_PER);
      cylinders.name = "animals:limbs";
      cylinders.frustumCulled = false;
      ctx.scene.add(spheres, cylinders);
    },

    update(dt, ctx) {
      const village = ctx.region.village;
      if (!village || !spheres || !cylinders || !frame) return;
      const today = worldDayIndex(options.clock, Date.now());
      if (today !== day) {
        day = today;
        animals = animalsOf(village.settlement, village.plan, day);
      }
      const hour = ctx.layer<SkyLayer>("sky")?.timeOfDay() ?? 0.5;
      const villagers = ctx.layer<VillagersLayer>("villagers");
      const settlement = ctx.layer<SettlementLayer>("settlement");
      const me = villagers?.playerPosition() ?? null;
      const inside = me && settlement ? settlement.houseAt(me.x, me.y) !== null : false;
      const t = performance.now() / 1000;
      const ownerAt = (id: string) => villagers?.whereIs(id) ?? null;
      si = 0;
      ci = 0;
      drawnCount = 0;
      heard.length = 0;
      // The dog most taken to this stranger, if any has taken to them enough, comes to their side.
      let best: string | null = null;
      for (const [id, b] of bonds) if (b >= ANIMALS.follows && (!best || b > (bonds.get(best) ?? 0))) best = id;
      follower = me && best ? best : null;
      for (const a of animals) {
        const at = animalAt(a, hour, ownerAt);
        if (at.activity === "hidden") {
          lastPos.delete(a.id);
          continue;
        }
        let x = at.x;
        let y = at.y;
        const off = offset.get(a.id) ?? { x: 0, y: 0 };
        let near = false;
        if (me && a.id === follower) {
          // At the stranger's heel: toward a point a step behind them, at a dog's trot — and at the door, waiting, while they are inside.
          const goal = inside ? { x: x + off.x, y: y + off.y } : { x: me.x - 1.2, y: me.y - 0.4 };
          const cur = { x: x + off.x, y: y + off.y };
          const k = Math.min(1, dt * 2.5);
          off.x += (goal.x - cur.x) * k;
          off.y += (goal.y - cur.y) * k;
          near = Math.hypot(me.x - (x + off.x), me.y - (y + off.y)) < 3;
          at.activity = Math.hypot(goal.x - cur.x, goal.y - cur.y) > 0.3 ? "walk" : "lie";
          if (at.activity === "walk") at.heading = Math.atan2(goal.y - cur.y, goal.x - cur.x);
        } else if (me && (a.kind === "hen" || a.kind === "goat")) {
          // Out of the way of someone walking at them, and back again after.
          const dx = x + off.x - me.x;
          const dy = y + off.y - me.y;
          const d = Math.hypot(dx, dy);
          if (d < SHY_M && d > 1e-6) {
            off.x += (dx / d) * (SHY_M - d) * Math.min(1, dt * 6);
            off.y += (dy / d) * (SHY_M - d) * Math.min(1, dt * 6);
          } else {
            off.x *= 1 - Math.min(1, dt * 0.5);
            off.y *= 1 - Math.min(1, dt * 0.5);
          }
        } else {
          off.x *= 1 - Math.min(1, dt * 1.5);
          off.y *= 1 - Math.min(1, dt * 1.5);
          if (a.kind === "dog" && me) near = Math.hypot(me.x - x, me.y - y) < 3 && (bonds.get(a.id) ?? 0) > 0;
        }
        offset.set(a.id, off);
        x += off.x;
        y += off.y;
        const [tx, ty] = frame.fromLocalM(x, y);
        const ground = a.kind === "fish" ? 0.02 : a.kind === "bird" ? Math.max(0, frame.heightAtTile(tx, ty)) : Math.max(0, frame.heightAtTile(tx, ty));
        drawOne(a, at, x, y, ground, t, near);
        drawnCount++;
        heard.push({ id: a.id, kind: a.kind, x, y });
        if (a.kind === "dog" || a.kind === "goat" || a.kind === "hen") lastPos.set(a.id, { x, y, kind: a.kind, name: a.name });
      }
      spheres.count = si;
      cylinders.count = ci;
      spheres.instanceMatrix.needsUpdate = true;
      cylinders.instanceMatrix.needsUpdate = true;
      if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true;
      if (cylinders.instanceColor) cylinders.instanceColor.needsUpdate = true;
    },

    nearest(x, y, r) {
      let best: NearAnimal | null = null;
      for (const [id, p] of lastPos) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > r || (best && d >= best.distanceM)) continue;
        best = { id, kind: p.kind === "hen" ? "hen" : p.kind === "goat" ? "goat" : "dog", name: p.name, x: p.x, y: p.y, distanceM: d };
      }
      return best;
    },
    setBonds(list) {
      bonds = list;
    },
    following: () => follower,
    audible(x, y, r) {
      const coastal = animals.some((a) => a.kind === "fish");
      const out: { id: string; kind: Animal["kind"]; x: number; y: number; d: number; coastal: boolean }[] = [];
      for (const h of heard) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d <= r) out.push({ ...h, d, coastal });
      }
      return out;
    },
    drawn: () => drawnCount,

    dispose() {
      for (const o of [spheres, cylinders]) {
        if (!o) continue;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      spheres = null;
      cylinders = null;
    },
  };
}
