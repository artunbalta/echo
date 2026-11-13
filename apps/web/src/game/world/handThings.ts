/**
 * What is in the hand, and what leaves it (DECISIONS C98).
 *
 * An act used to be a body going through a motion beside a thing that did nothing. Now a jar taken is
 * in the hand, a stone thrown leaves it and crosses the air to where it was sent, a pebble dropped
 * falls and the water closes over it in rings, and a rope hauled runs from the hands to what it is tied
 * to. This file is those few small things: made once, a few triangles each in the world's flat colours,
 * hidden until an act needs one. The player's layer says when (`playerLayer.ts`, from what the gesture
 * reports); nothing here knows about verbs.
 *
 * A thing a moment owns (its ball, its jars) is drawn here too while it is in the hand or in the air,
 * and the moment's own copy is hidden for that long (`momentsLayer.ts` asks the player's layer); so
 * there is never one ball lying in the grass and another in the hand.
 *
 * Sizes are metres times `s` (the frame's tile over 1.6), as the moments' props are.
 */
import * as THREE from "three";

export type HandItem =
  | "ball" | "pebble" | "snowball" | "grain" | "litter" | "jar" | "coin" | "loaf" | "jug" | "log" | "stone" | "hammer" | "pickaxe" | "brush"
  | "rod" | "note" | "berry" | "weed" | "apple" | "lump" | "cloth" | "seed" | "food" | "bucket" | "earth";

/** How a thing let go travels. */
export type Flight = "arc" | "roll" | "skip" | "fall" | "spray";

export interface HandThings {
  readonly group: THREE.Group;
  /**
   * Show a thing at the hand this frame (call each frame it is held), turned the way the body faces;
   * a tool (a hammer, a pick, a brush) lies `along` the forearm, its head past the hand.
   */
  hold(kind: HandItem, at: THREE.Vector3, yaw: number, along?: THREE.Vector3): void;
  /**
   * Let one go from `from` to `to`. `water` is whether it comes down on water; `restS` is how long it
   * lies where it lands before it is gone (0 for a thing its own layer draws again from there).
   */
  fly(kind: HandItem, from: THREE.Vector3, to: THREE.Vector3, how: Flight, water: boolean, restS?: number): void;
  /** A rope from one point to another this frame, or none. */
  rope(from: THREE.Vector3 | null, to?: THREE.Vector3): void;
  /** Rings on water at a point. */
  ripple(at: THREE.Vector3): void;
  /** Move what is in the air; hide what was held last frame and is not held now. */
  update(dt: number): void;
  /** How many things are in the air. */
  flying(): number;
  dispose(): void;
}

interface Shot {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  how: Flight;
  peak: number;
  water: boolean;
  hops: number;
  rest: number;
  landed: boolean;
}

/** Things held by a handle: they point the way the forearm does. */
const TOOLS: ReadonlySet<HandItem> = new Set<HandItem>(["hammer", "pickaxe", "brush"]);

export function handThings(s: number): HandThings {
  const group = new THREE.Group();
  group.name = "player:hand";
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const mat = (hex: number) => {
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    materials.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo(g), m);
    o.position.set(x * s, y * s, z * s);
    o.castShadow = true;
    return o;
  };
  const wood = mat(0x7a5a3a);
  const iron = mat(0x55524c);
  const stone = mat(0x8d8a80);

  /** One of each kind, built the first time it is asked for. */
  const make: Record<HandItem, () => THREE.Object3D> = {
    ball: () => mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), mat(0xd8c9a0)),
    pebble: () => mesh(new THREE.IcosahedronGeometry(0.04 * s, 0), stone),
    snowball: () => mesh(new THREE.IcosahedronGeometry(0.07 * s, 1), mat(0xf2f4f6)),
    grain: () => mesh(new THREE.IcosahedronGeometry(0.022 * s, 0), mat(0xd9c27a)),
    earth: () => mesh(new THREE.IcosahedronGeometry(0.05 * s, 0), mat(0x5e4a36)),
    litter: () => mesh(new THREE.BoxGeometry(0.13 * s, 0.05 * s, 0.1 * s), mat(0xb0a58f)),
    jar: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.06 * s, 0.065 * s, 0.13 * s, 8), mat(0xc98a2b)), mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.03 * s, 8), mat(0xe8dcc0), 0, 0.08, 0));
      return g;
    },
    coin: () => mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.01 * s, 8), mat(0xd9b24a)),
    loaf: () => {
      const o = mesh(new THREE.SphereGeometry(0.1 * s, 8, 5), mat(0xb9824a));
      o.scale.set(1.5, 0.7, 0.9);
      return o;
    },
    jug: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.13 * s, 8, 6), mat(0x9a5a3a)), mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.14 * s, 8), mat(0x9a5a3a), 0, 0.15, 0));
      return g;
    },
    log: () => {
      const o = mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.55 * s, 7), wood);
      o.rotation.z = Math.PI / 2;
      return o;
    },
    stone: () => mesh(new THREE.BoxGeometry(0.28 * s, 0.16 * s, 0.2 * s), stone),
    hammer: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.3 * s, 5), wood, 0, 0.12, 0), mesh(new THREE.BoxGeometry(0.11 * s, 0.05 * s, 0.05 * s), iron, 0, 0.27, 0));
      return g;
    },
    pickaxe: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.018 * s, 0.018 * s, 0.8 * s, 5), wood, 0, 0.3, 0), mesh(new THREE.BoxGeometry(0.5 * s, 0.04 * s, 0.04 * s), iron, 0, 0.7, 0));
      return g;
    },
    brush: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.22 * s, 5), wood, 0, 0.08, 0), mesh(new THREE.BoxGeometry(0.08 * s, 0.07 * s, 0.025 * s), mat(0xe8dcc0), 0, 0.22, 0));
      return g;
    },
    rod: () => {
      // The rod out over the water, and its line down to it.
      const g = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.008 * s, 0.016 * s, 2.2 * s, 5), wood, 0, 0.55, 0.9);
      pole.rotation.x = 1.0;
      const line = mesh(new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 1.3 * s, 3), mat(0xe8e4d8), 0, 0.5, 1.82);
      const float = mesh(new THREE.IcosahedronGeometry(0.03 * s, 0), mat(0xc0302a), 0, -0.14, 1.82);
      g.add(pole, line, float);
      return g;
    },
    note: () => mesh(new THREE.BoxGeometry(0.18 * s, 0.13 * s, 0.004 * s), mat(0xf0e6cc)),
    berry: () => mesh(new THREE.IcosahedronGeometry(0.022 * s, 0), mat(0x7a2a52)),
    weed: () => mesh(new THREE.ConeGeometry(0.04 * s, 0.16 * s, 5), mat(0x6f8f4a)),
    apple: () => mesh(new THREE.SphereGeometry(0.075 * s, 6, 5), mat(0xb5352a)),
    lump: () => mesh(new THREE.IcosahedronGeometry(0.06 * s, 0), mat(0x8a7a66)),
    cloth: () => mesh(new THREE.BoxGeometry(0.2 * s, 0.04 * s, 0.12 * s), mat(0xd9d2c0)),
    seed: () => mesh(new THREE.IcosahedronGeometry(0.018 * s, 0), mat(0x6a4a2a)),
    food: () => mesh(new THREE.IcosahedronGeometry(0.04 * s, 0), mat(0xb9824a)),
    bucket: () => mesh(new THREE.CylinderGeometry(0.14 * s, 0.11 * s, 0.24 * s, 8), mat(0x6a5a44)),
  };
  const held = new Map<HandItem, THREE.Object3D>();
  const one = (kind: HandItem): THREE.Object3D => {
    let o = held.get(kind);
    if (!o) {
      o = make[kind]();
      o.visible = false;
      group.add(o);
      held.set(kind, o);
    }
    return o;
  };
  let showing: HandItem | null = null;
  let shown = false;

  // The rope: one thin length, stretched between two points.
  const cord = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 1, 4)), mat(0xb9a17c));
  cord.visible = false;
  group.add(cord);
  let roped = false;
  const up = new THREE.Vector3(0, 1, 0);
  const span = new THREE.Vector3();

  // Rings on water: three, used in turn.
  const ringGeo = geo(new THREE.RingGeometry(0.82, 1, 20));
  const rings = Array.from({ length: 4 }, () => {
    const m = new THREE.MeshBasicMaterial({ color: 0xe8f0f4, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    materials.push(m);
    const o = new THREE.Mesh(ringGeo, m);
    o.rotation.x = -Math.PI / 2;
    o.visible = false;
    group.add(o);
    return { o, m, t: 1 };
  });
  let ringNext = 0;

  const shots: Shot[] = [];

  const ripple = (at: THREE.Vector3) => {
    const r = rings[ringNext++ % rings.length]!;
    r.t = 0;
    r.o.position.set(at.x, 0.03, at.z);
    r.o.visible = true;
  };

  return {
    group,
    hold(kind, at, yaw, along) {
      if (showing && showing !== kind) one(showing).visible = false;
      const o = one(kind);
      o.position.copy(at);
      if (along && TOOLS.has(kind)) o.quaternion.setFromUnitVectors(up, along);
      else o.rotation.set(0, yaw, 0);
      o.visible = true;
      showing = kind;
      shown = true;
    },
    fly(kind, from, to, how, water, restS = 0.7) {
      const n = how === "spray" ? 5 : 1;
      for (let i = 0; i < n; i++) {
        const mesh = one(kind).clone();
        mesh.visible = true;
        group.add(mesh);
        const end = to.clone();
        if (how === "spray") end.add(new THREE.Vector3((Math.sin(i * 2.4) * 0.5 + (i - 2) * 0.12) * s, 0, Math.cos(i * 1.7) * 0.45 * s));
        const d = from.distanceTo(end);
        shots.push({ mesh, from: from.clone(), to: end, t: 0, dur: how === "roll" ? Math.max(0.5, d / (3.5 * s)) : how === "fall" ? Math.max(0.25, Math.sqrt((2 * Math.max(0.05, from.y - end.y)) / (9.8 * s))) : how === "skip" ? 1.5 : Math.min(1.2, Math.max(0.4, d / (8 * s))), how, peak: how === "arc" ? 0.3 * s + d * 0.16 : how === "spray" ? 0.25 * s : 0, water, hops: 0, rest: restS, landed: false });
      }
    },
    rope(from, to) {
      if (!from || !to) return;
      span.copy(to).sub(from);
      const len = span.length();
      if (len < 1e-4) return;
      cord.position.copy(from).addScaledVector(span, 0.5);
      cord.scale.set(1, len, 1);
      cord.quaternion.setFromUnitVectors(up, span.multiplyScalar(1 / len));
      cord.visible = true;
      roped = true;
    },
    ripple,
    update(dt) {
      if (!shown && showing) {
        one(showing).visible = false;
        showing = null;
      }
      shown = false;
      if (!roped) cord.visible = false;
      roped = false;
      for (const r of rings) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / 1.1);
        const size = (0.12 + r.t * 0.75) * s;
        r.o.scale.set(size, size, size);
        r.m.opacity = (1 - r.t) * 0.7;
        if (r.t >= 1) r.o.visible = false;
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const a = shots[i]!;
        a.t += dt;
        const u = Math.min(1, a.t / a.dur);
        const p = a.mesh.position;
        if (a.how === "arc" || a.how === "spray") {
          p.lerpVectors(a.from, a.to, u);
          p.y += a.peak * 4 * u * (1 - u);
        } else if (a.how === "roll") {
          const e = 1 - (1 - u) * (1 - u);
          p.lerpVectors(a.from, a.to, e);
          p.y = a.to.y + Math.max(0, a.from.y - a.to.y) * Math.max(0, 1 - u * 5);
          a.mesh.rotation.x += dt * 9 * (1 - u);
        } else if (a.how === "fall") {
          p.lerpVectors(a.from, a.to, u);
          p.y = a.from.y + (a.to.y - a.from.y) * u * u;
        } else {
          // Skipping: out along the water in shorter and shorter hops, a ring at each touch.
          const hops = [0, 0.42, 0.7, 0.88, 1];
          let h = 0;
          while (h < hops.length - 2 && u > hops[h + 1]!) h++;
          const v = (u - hops[h]!) / (hops[h + 1]! - hops[h]!);
          p.lerpVectors(a.from, a.to, u);
          p.y = Math.max(0.02, (h === 0 ? a.from.y * (1 - v) : 0) + Math.sin(Math.PI * v) * (0.35 - h * 0.09) * s);
          if (h > a.hops) {
            a.hops = h;
            ripple(p);
          }
        }
        if (u >= 1) {
          if (!a.landed && a.water) ripple(a.to);
          a.landed = true;
          a.rest -= dt;
          if (a.water) a.mesh.visible = false;
          if (a.rest <= 0) {
            group.remove(a.mesh);
            shots.splice(i, 1);
          }
        }
      }
    },
    flying: () => shots.filter((a) => a.t < a.dur).length,
    dispose() {
      for (const m of materials) m.dispose();
      for (const g of geometries) g.dispose();
      group.removeFromParent();
    },
  };
}
