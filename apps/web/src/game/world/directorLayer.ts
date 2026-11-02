/**
 * What the director set out for this stranger (DECISIONS C63), drawn where it was set: a gull caught in
 * old netting at the water, a pouch dropped by a path, a stone with something cut into it, a narrow
 * dark gap in the rock. Only the stranger it was set out for sees it; it is theirs, not the world's.
 *
 * It is a thing like any other (`things`): the interact layer offers its verbs, and acting on it goes
 * through the director route. Nothing marks it out as set: no glow, no prompt until it is within reach,
 * as for anything else (Law 2).
 *
 * WALKING PAST is noticed here, for the two whose passing is data (the gull, the mark): once the body
 * has come within `DIRECTOR.noticeM` of it and then gone beyond `DIRECTOR.goneM` without acting, the
 * page is told (`onPassed`), once.
 *
 * THE PILOT'S PEOPLE (C75) are people: the world's own body (`three/character.ts`), on a log or a stone
 * where they sit, with what they have about them (a basket, nets, a fire). One standing turns to you as
 * you come near; one sitting turns their head. The overgrown path is an arch of brush with a way in.
 */
import * as THREE from "three";
import { DIRECTOR, SITUATIONS, passStep, type SituationId, type Thing } from "@echo/planet";

import { buildCharacter, poseCharacter, type CharacterParts } from "../three/character";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";

/** A staging as the page is given it: where and what, never why. */
export interface ShownStaging {
  id: string;
  cell: string;
  situation: SituationId;
  x: number;
  y: number;
  facing: number;
  ownerName: string | null;
}

export interface DirectorLayer extends WorldLayer {
  set(staging: ShownStaging | null): void;
  staging(): ShownStaging | null;
  things(mx: number, my: number): Thing[];
  /** Called once when the stranger has walked past one whose passing is data. */
  onPassed(fn: ((s: ShownStaging, distM: number) => void) | null): void;
}

const LOOK_M = 8;

function nameOf(s: ShownStaging): string {
  switch (s.situation) {
    case "netted_gull":
      return "a gull caught in the netting";
    case "lost_pouch":
      return s.ownerName ? `${s.ownerName}'s pouch` : "someone's pouch";
    case "carved_mark":
      return "a stone with something cut into it";
    case "dark_cleft":
      return "a dark gap in the rock";
    case "hungry_stranger":
      return s.ownerName ? `${s.ownerName}, thin, by the path` : "a thin stranger by the path";
    case "raft_borrower":
      return s.ownerName ? `${s.ownerName}, with nets and no boat` : "someone with nets and no boat";
    case "tide_fisher":
      return s.ownerName ? `${s.ownerName}, a fisher with a basket` : "a fisher with a basket";
    case "seed_offer":
      return s.ownerName ? `${s.ownerName}, a child with a pouch of seed` : "a child with a pouch of seed";
    case "overgrown_path":
      return "an overgrown path into the trees";
    case "lone_traveler":
      return s.ownerName ? `${s.ownerName}, a traveller by a fire` : "a traveller by a fire";
  }
}

/** A pilot person as built: their body, how they hold it, and which way they look now. */
interface Person {
  parts: CharacterParts;
  pose: "sit" | "kneel" | "stand" | "carry";
  /** Radians, the body's turn inside the staging (sitting ones turn only their head). */
  yaw: number;
  head: number;
}

/** The body faces the staging's +x at this turn: the rig looks down its own +z. */
const FACE_X = Math.PI / 2;

const mat = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** The thing itself, in local metres round its own origin, +x the way it faces. */
function form(situation: SituationId, tileM: number): { group: THREE.Group; bob: THREE.Object3D | null; person: Person | null; flame: THREE.Mesh | null } {
  const g = new THREE.Group();
  let bob: THREE.Object3D | null = null;
  let person: Person | null = null;
  let flame: THREE.Mesh | null = null;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, s?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    if (s) mesh.scale.set(...s);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (situation === "netted_gull") {
    const gull = new THREE.Group();
    const white = mat(0xf2f0e8);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), white);
    body.scale.set(1.5, 0.85, 0.9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), white);
    head.position.set(0.3, 0.12, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), mat(0xe8b23a));
    beak.position.set(0.43, 0.1, 0);
    beak.rotation.z = -Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.5), mat(0xb9bec4));
    wing.position.set(-0.04, 0.12, 0);
    wing.rotation.x = 0.35;
    gull.add(body, head, beak, wing);
    gull.position.y = 0.17;
    for (const m of gull.children) m.castShadow = true;
    g.add(gull);
    bob = gull;
    // The netting, draped over it: a few strands either way.
    const strand = mat(0x5b5448);
    for (let i = -2; i <= 2; i++) {
      add(new THREE.BoxGeometry(0.9, 0.012, 0.012), strand, 0, 0.3 - Math.abs(i) * 0.03, i * 0.12).rotation.y = 0.15;
      add(new THREE.BoxGeometry(0.012, 0.012, 0.75), strand, i * 0.16, 0.3 - Math.abs(i) * 0.03, 0);
    }
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), mat(0xc9a86a), -0.45, 0.03, 0.2); // a float
  } else if (situation === "lost_pouch") {
    add(new THREE.SphereGeometry(0.15, 8, 6), mat(0x7a5536), 0, 0.11, 0, [1.1, 0.8, 1]);
    add(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 7), mat(0x5a3d26), 0, 0.24, 0);
    add(new THREE.TorusGeometry(0.06, 0.012, 5, 10), mat(0xd8c08a), 0, 0.2, 0).rotation.x = Math.PI / 2;
  } else if (situation === "carved_mark") {
    const stone = add(new THREE.DodecahedronGeometry(0.5, 0), mat(0x8d8a82), 0, 0.35, 0, [0.8, 1.1, 0.6]);
    stone.rotation.y = 0.4;
    // The mark: a spiral's worth of rings, a shade lighter, on the face it turns towards.
    for (const r of [0.07, 0.13, 0.19]) {
      const ring = add(new THREE.TorusGeometry(r, 0.012, 4, 18), mat(0xc4bfb2), 0.31, 0.42, 0);
      ring.rotation.y = Math.PI / 2;
    }
  } else if (SITUATIONS[situation].person) {
    // A pilot person (C75): the world's own body, scaled from rig units to metres.
    const how = SITUATIONS[situation].person!;
    const parts = buildCharacter(`staged:${situation}`, false);
    const scale = tileM * (how.child ? 0.68 : 1);
    parts.root.scale.setScalar(scale);
    parts.root.rotation.y = FACE_X;
    g.add(parts.root);
    person = { parts, pose: how.pose, yaw: FACE_X, head: 0 };
    if (how.pose === "sit") {
      // Something to sit on: the rig's seated hips are a bench's height off the ground.
      const seatH = 0.27 * scale;
      const seat = add(new THREE.CylinderGeometry(0.16, 0.18, 0.62, 8), mat(0x6b4f35), -0.02, seatH - 0.15, 0);
      seat.rotation.x = Math.PI / 2;
    }
    if (how.pose === "carry" || how.child) {
      // What is held out: nets in a bundle, or a pouch of seed.
      const held = parts.carry;
      held.scale.set(how.child ? 0.32 : 1.1, how.child ? 1.9 : 2.4, how.child ? 1.1 : 1.6);
      (held.material as THREE.MeshLambertMaterial).color.set(how.child ? 0x8a6a45 : 0x6d725e);
    }
    if (situation === "hungry_stranger") {
      add(new THREE.CylinderGeometry(0.11, 0.07, 0.06, 10), mat(0x9a7b55), 0.5, 0.03, 0.18); // an empty bowl
    } else if (situation === "raft_borrower") {
      add(new THREE.TorusGeometry(0.22, 0.06, 6, 14), mat(0x6d725e), 0.1, 0.05, 0.55).rotation.x = Math.PI / 2; // more nets, coiled
    } else if (situation === "tide_fisher") {
      add(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 10, 1, true), mat(0x9c7a4a, { side: THREE.DoubleSide }), 0.45, 0.15, 0.4); // the basket
      const silver = mat(0xb8c4c8);
      add(new THREE.SphereGeometry(0.09, 7, 5), silver, 0.42, 0.29, 0.38, [1.8, 0.5, 0.7]);
      add(new THREE.SphereGeometry(0.09, 7, 5), silver, 0.5, 0.31, 0.44, [1.7, 0.5, 0.7]).rotation.y = 0.6;
    } else if (situation === "lone_traveler") {
      // A small fire in front of them: three sticks and a flame.
      const wood = mat(0x4a3424);
      for (let i = 0; i < 3; i++) {
        const stick = add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), wood, 1.1, 0.05, 0);
        stick.rotation.set(Math.PI / 2 - 0.25, (i / 3) * Math.PI * 2, 0);
      }
      flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 7), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 }));
      flame.position.set(1.1, 0.24, 0);
      g.add(flame);
    }
  } else if (situation === "overgrown_path") {
    // An arch of brush, a dark way through it, and flat stones leading in.
    const leaf = mat(0x4f6b3a);
    const dark = mat(0x3c5530);
    add(new THREE.DodecahedronGeometry(0.75, 0), leaf, 0.2, 0.7, -0.95, [1, 1.3, 0.8]).rotation.y = 0.3;
    add(new THREE.DodecahedronGeometry(0.8, 0), dark, 0.1, 0.75, 0.95, [1, 1.35, 0.8]).rotation.y = -0.2;
    add(new THREE.DodecahedronGeometry(0.7, 0), leaf, 0.15, 1.75, 0, [0.9, 0.45, 1.6]).rotation.y = 0.1;
    add(new THREE.PlaneGeometry(1.1, 1.5), mat(0x15200f, { side: THREE.DoubleSide }), 0.55, 0.78, 0).rotation.y = Math.PI / 2;
    const stone = mat(0x9a948a);
    for (const [x, z] of [[-1.4, 0.1], [-0.8, -0.12], [-0.25, 0.08]] as const) add(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 7), stone, x, 0.025, z);
  } else {
    // Two rough boulders leaning together, a third across their tops, and the dark between them.
    const rock = mat(0x857e72);
    const left = add(new THREE.DodecahedronGeometry(1, 0), rock, -0.1, 1.0, -0.95, [0.9, 1.35, 0.75]);
    left.rotation.set(0.12, 0.4, 0.1);
    const right = add(new THREE.DodecahedronGeometry(1, 0), rock, 0.05, 1.1, 0.95, [0.95, 1.45, 0.8]);
    right.rotation.set(-0.15, -0.3, -0.08);
    add(new THREE.DodecahedronGeometry(1, 0), mat(0x7a7468), -0.15, 2.35, 0, [0.85, 0.45, 1.5]).rotation.set(0.1, 0.2, 0.05);
    add(new THREE.PlaneGeometry(0.7, 1.9), mat(0x060606, { side: THREE.DoubleSide }), 0.45, 0.95, 0).rotation.y = Math.PI / 2;
  }
  return { group: g, bob, person, flame };
}

export function directorLayer(): DirectorLayer {
  let shown: ShownStaging | null = null;
  let dirty = false;
  let built: ReturnType<typeof form> | null = null;
  let near = false;
  let told = false;
  let passed: ((s: ShownStaging, distM: number) => void) | null = null;
  let t = 0;
  const root = new THREE.Group();
  root.name = "director";

  const clear = () => {
    if (!built) return;
    built.group.removeFromParent();
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    built = null;
  };

  const rebuild = (ctx: LayerContext) => {
    clear();
    if (!shown) return;
    built = form(shown.situation, ctx.frame.tileM);
    const [tx, ty] = ctx.frame.fromLocalM(shown.x, shown.y);
    built.group.position.set(tx * ctx.frame.tileM, Math.max(0, ctx.frame.heightAtTile(tx, ty)), ty * ctx.frame.tileM);
    // Facing in the plane: local +x east, +y north; scene z is south.
    built.group.rotation.y = shown.facing;
    built.group.name = `director:${shown.situation}`;
    root.add(built.group);
  };

  return {
    name: "director",

    async build(ctx, signal) {
      if (signal.aborted) return;
      ctx.scene.add(root);
      if (shown) rebuild(ctx);
    },

    update(dt, ctx) {
      if (dirty) {
        dirty = false;
        rebuild(ctx);
      }
      if (!shown) return;
      t += dt;
      if (built?.bob) {
        // A netted bird does not lie still.
        built.bob.rotation.z = Math.sin(t * 7) * 0.12 * (Math.sin(t * 0.9) > 0.4 ? 1 : 0.2);
        built.bob.position.y = 0.17 + Math.abs(Math.sin(t * 3.1)) * 0.03;
      }
      if (built?.flame) {
        built.flame.scale.set(1 + Math.sin(t * 11) * 0.08, 1 + Math.sin(t * 7.3) * 0.18, 1 + Math.cos(t * 9) * 0.08);
      }
      const sit = SITUATIONS[shown.situation];
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      if (!player) return;
      const at = player.position();
      const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
      const d = Math.hypot(mx - shown.x, my - shown.y);
      if (built?.person) {
        // A person keeps breathing, and looks at you as you come near: the body if standing, the head if sitting.
        const p = built.person;
        const activity = p.pose === "sit" ? "sit" : p.pose === "kneel" ? "kneel" : null;
        poseCharacter(p.parts, { facing: "down", moving: false, animTime: t, bob: 0, lean: 0, carrying: p.pose === "carry" || !!sit.person?.child, activity });
        const rel = Math.atan2(my - shown.y, mx - shown.x) - shown.facing;
        const near = d < 14;
        const ease = 1 - Math.exp(-dt * 3);
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
        if (p.pose === "sit") {
          const want = near ? Math.max(-1, Math.min(1, wrap(rel))) : 0;
          p.head += (want - p.head) * ease;
          p.parts.head.rotation.y = p.head;
          p.parts.root.rotation.y = FACE_X;
        } else {
          const want = near ? FACE_X + rel : FACE_X;
          p.yaw += wrap(want - p.yaw) * ease;
          p.parts.root.rotation.y = p.yaw;
        }
      }
      if (!sit.passed || told) return;
      const step = passStep(near, d);
      near = step.near;
      if (step.passed) {
        told = true;
        passed?.(shown, d);
      }
    },

    set(staging) {
      if (staging?.id === shown?.id && staging?.situation === shown?.situation) return;
      shown = staging;
      near = false;
      told = false;
      dirty = true;
    },
    staging: () => shown,
    things(mx, my) {
      if (!shown || Math.hypot(shown.x - mx, shown.y - my) > LOOK_M + DIRECTOR.noticeM) return [];
      const sit = SITUATIONS[shown.situation];
      return [{ ref: `staged:${shown.id}`, kind: sit.kind, x: shown.x, y: shown.y, sizeM: sit.sizeM, owners: [], name: nameOf(shown) }];
    },
    onPassed(fn) {
      passed = fn;
    },

    dispose() {
      clear();
      root.removeFromParent();
    },
  };
}
