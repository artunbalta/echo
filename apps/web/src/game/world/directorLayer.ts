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
 */
import * as THREE from "three";
import { DIRECTOR, SITUATIONS, passStep, type SituationId, type Thing } from "@echo/planet";

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
  }
}

const mat = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** The thing itself, in local metres round its own origin, +x the way it faces. */
function form(situation: SituationId): { group: THREE.Group; bob: THREE.Object3D | null } {
  const g = new THREE.Group();
  let bob: THREE.Object3D | null = null;
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
  return { group: g, bob };
}

export function directorLayer(): DirectorLayer {
  let shown: ShownStaging | null = null;
  let dirty = false;
  let built: { group: THREE.Group; bob: THREE.Object3D | null } | null = null;
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
    built = form(shown.situation);
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
      const sit = SITUATIONS[shown.situation];
      if (!sit.passed || told) return;
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      if (!player) return;
      const at = player.position();
      const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
      const d = Math.hypot(mx - shown.x, my - shown.y);
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
