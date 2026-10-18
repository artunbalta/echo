/**
 * A village's people, drawn as a crowd (DECISIONS C41, SOC-4.A's problem from the other end).
 *
 * WHY NOT `buildCharacter` N TIMES. The player's rig is 23 meshes and 15,856 triangles, every one of
 * them casting, so one body is 46 draw calls of whole frame (C31) and an ordinary parcel spends 103
 * of C16's 120 before anyone lives on it. Forty villagers drawn that way would be eighteen hundred
 * calls. So the crowd is drawn BY PART: every head in the village is one InstancedMesh, every torso
 * another, every left-and-right thigh a third, and so on — nine meshes for everybody, whether the
 * village holds eight people or eighty, and only the torso and the head cast a shadow.
 *
 * THE SAME BODY AND THE SAME WALK. The proportions are character.ts's own, in its own units (scaled
 * by TILE_M exactly as the player's root is), and the legs are posed by its `gaitFootTarget` and
 * `solveLeg`, so a villager walks with the player's gait at a villager's pace. The limbs are rigid
 * low-poly segments where the player's are skinned: at the distance a crowd is seen from, that is the
 * only difference, and it is the one that makes forty of them affordable.
 *
 * WOMEN AND MEN, FOR NO EXTRA CALL. A village is half women (the society draws them so), and for a
 * while every one of them was drawn in trousers with a cropped head, so a village read as all men.
 * A woman here wears a dress and her hair long, and neither is a mesh of its own: the long hair is a
 * SECOND instance of the hair part, stretched down the back of the head, and the skirt is the pelvis
 * part, which is a short flared frustum for everyone and, for her, drawn long and wide to below the
 * knee. Same nine meshes, same draw calls; only instances and their matrices differ.
 *
 * COLOUR IS PER INSTANCE. Every part geometry carries a vertex colour that is a MULTIPLIER — white
 * for the part's own material, dark for the eyes — and the instance colour supplies the person's skin,
 * clothes or hair. So a face has eyes without an eye mesh, and nobody's clothes need a material.
 */

import * as THREE from "three";

import { gaitFootTarget, solveLeg } from "../three/character";

// ── the parts ───────────────────────────────────────────────────────────────────

export type PartName = "torso" | "head" | "hair" | "pelvis" | "thigh" | "shin" | "foot" | "upperArm" | "forearm";

/** How many of each part a body has, at most: hair is two for long hair (the cap, and what falls behind). */
const PER_BODY: Record<PartName, 1 | 2> = {
  torso: 1, head: 1, hair: 2, pelvis: 1, thigh: 2, shin: 2, foot: 2, upperArm: 2, forearm: 2,
};
/** Only the big masses cast: the shadow of a shin is a cost nobody would see paid. */
const CASTS: ReadonlySet<PartName> = new Set(["torso", "head"]);

function paint(g: THREE.BufferGeometry, shade: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const colours = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = shade(v);
    colours[i * 3] = colours[i * 3 + 1] = colours[i * 3 + 2] = k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return g;
}

const ellipsoid = (w: number, h: number, d: number, x = 0, y = 0, z = 0, seg = 8): THREE.BufferGeometry =>
  new THREE.SphereGeometry(0.5, seg, Math.max(4, seg - 2)).scale(w, h, d).translate(x, y, z);

/** A limb segment hanging from its joint: top at the origin, `len` long down -y. */
const segment = (len: number, rTop: number, rBottom: number): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rTop, rBottom, len, 7, 1).translate(0, -len / 2, 0);

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // A small merge for indexed primitives: concatenate, re-index. Avoids importing examples/jsm for
  // the one place in the game that would use it.
  const non = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const attrs = ["position", "normal", "color"] as const;
  const out = new THREE.BufferGeometry();
  for (const name of attrs) {
    const arrays = non.map((p) => p.getAttribute(name).array as Float32Array);
    const total = arrays.reduce((a, b) => a + b.length, 0);
    const data = new Float32Array(total);
    let at = 0;
    for (const a of arrays) {
      data.set(a, at);
      at += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  out.computeBoundingSphere();
  return out;
}

const WHITE = () => 1;

/** Every part's geometry, in character.ts's units and in the frame of the joint it hangs from. */
function partGeometry(name: PartName): THREE.BufferGeometry {
  switch (name) {
    case "torso":
      return paint(ellipsoid(0.35, 0.39, 0.235, 0, 0.16, 0), WHITE);
    case "head": {
      // The head hangs from the neck, with character.ts's ears, nose and eyes where it puts them. The
      // eyes are painted 0.12 so that the instance's skin colour, which multiplies, leaves them dark.
      const head = paint(ellipsoid(0.34, 0.355, 0.325, 0, 0.155, 0, 10), WHITE);
      const neck = paint(ellipsoid(0.1, 0.13, 0.105, 0, -0.025, 0, 6), WHITE);
      const ears = [-1, 1].map((s) => paint(ellipsoid(0.067, 0.095, 0.062, s * 0.166, 0.12, 0, 6), WHITE));
      const eyes = [-1, 1].map((s) => paint(ellipsoid(0.03, 0.04, 0.03, s * 0.061, 0.157, 0.152, 5), () => 0.12));
      const nose = paint(ellipsoid(0.049, 0.05, 0.07, 0, 0.112, 0.163, 6), WHITE);
      return merged([head, neck, ...ears, ...eyes, nose]);
    }
    case "hair":
      // A cap over the crown and the back of the head.
      return paint(ellipsoid(0.36, 0.22, 0.345, 0, 0.27, -0.015, 9), WHITE);
    case "pelvis":
      // A short flared frustum where the trousers meet the shirt — and, drawn long, a skirt.
      return paint(new THREE.CylinderGeometry(0.135, 0.16, 0.17, 9, 1).scale(1, 1, 0.72).translate(0, -0.025, 0), WHITE);
    case "thigh":
      return paint(segment(0.205, 0.072, 0.062), WHITE);
    case "shin":
      return paint(segment(0.205, 0.06, 0.05), WHITE);
    case "foot":
      return paint(ellipsoid(0.13, 0.09, 0.22, 0, -0.005, 0.045, 6), WHITE);
    case "upperArm":
      return merged([paint(segment(0.17, 0.056, 0.05), WHITE), paint(ellipsoid(0.145, 0.18, 0.15, 0, -0.036, 0, 6), WHITE)]);
    case "forearm":
      return merged([paint(segment(0.15, 0.048, 0.042), WHITE), paint(ellipsoid(0.09, 0.107, 0.065, 0, -0.168, 0, 6), WHITE)]);
  }
}

// ── who looks like what ─────────────────────────────────────────────────────────

export interface Look {
  skin: THREE.Color;
  cloth: THREE.Color;
  trousers: THREE.Color;
  hair: THREE.Color;
  /** Body scale, 1 for an adult of ordinary height. */
  scale: number;
  /** A forward stoop, radians, for the old. */
  stoop: number;
  /** Hair to the shoulders and below, behind. */
  longHair: boolean;
  /** A skirt to below the knee: the pelvis drawn long, in `cloth`. */
  skirt: boolean;
}

/** The pose a body is in. Everything here is the crowd's own short list, never the player's input. */
export interface Pose {
  /** three's world position of the feet. */
  x: number;
  y: number;
  z: number;
  /** Yaw, three's rotation.y: 0 faces +z. */
  yaw: number;
  activity: "walk" | "work" | "stoop" | "sit" | "stand" | "play" | "row" | "fish";
  /** Gait speed relative to the player's walk; 0 stands. */
  speed: number;
  /** Seconds, for the gait and the working arms. */
  time: number;
  /** Per-person offset so a crowd does not move in step. */
  phase0: number;
}

// ── the crowd ───────────────────────────────────────────────────────────────────

const PARTS: PartName[] = ["torso", "head", "hair", "pelvis", "thigh", "shin", "foot", "upperArm", "forearm"];

export class Crowd {
  readonly meshes = new Map<PartName, THREE.InstancedMesh>();
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly capacity: number;
  private count = 0;
  private readonly cursor = new Map<PartName, number>();
  // Scratch, reused every frame: the hook this runs from may not allocate.
  private readonly m = new THREE.Matrix4();
  private readonly root = new THREE.Matrix4();
  private readonly body = new THREE.Matrix4();
  private readonly hips = new THREE.Matrix4();
  private readonly spine = new THREE.Matrix4();
  private readonly neck = new THREE.Matrix4();
  private readonly j1 = new THREE.Matrix4();
  private readonly j2 = new THREE.Matrix4();
  private readonly j3 = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly scaleV = new THREE.Vector3();
  private readonly at0 = new THREE.Vector3();
  private readonly k = new THREE.Matrix4();
  /** Long hair: the cap, stretched to fall from the crown to below the nape and set back off the face. */
  private static readonly LONG_HAIR = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.404, -0.06), new THREE.Quaternion(), new THREE.Vector3(1.05, 2.09, 1));
  /** A skirt: the pelvis frustum from the waist to below the knee, wide enough for a stride. */
  private static readonly SKIRT = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.067, 0), new THREE.Quaternion(), new THREE.Vector3(1.18, 2.12, 1.35));
  private static readonly HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(capacity: number, private readonly unitM: number) {
    this.capacity = Math.max(1, capacity);
    for (const name of PARTS) {
      const mesh = new THREE.InstancedMesh(partGeometry(name), this.material, this.capacity * PER_BODY[name]);
      mesh.name = `villagers:${name}`;
      mesh.castShadow = CASTS.has(name);
      mesh.receiveShadow = true;
      // Instances move every frame; a bounding sphere computed once would cull a walking crowd.
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes.set(name, mesh);
      this.group.add(mesh);
    }
  }

  /** Start a frame: every instance hidden until `pose` places it. */
  begin(): void {
    this.count = 0;
    for (const name of PARTS) this.cursor.set(name, 0);
  }

  private put(name: PartName, matrix: THREE.Matrix4, colour: THREE.Color): void {
    const mesh = this.meshes.get(name)!;
    const i = this.cursor.get(name)!;
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, colour);
    this.cursor.set(name, i + 1);
  }

  private at(parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.e.set(rx, ry, rz, "YXZ");
    this.q.setFromEuler(this.e);
    this.t.compose(this.v.set(x, y, z), this.q, this.one);
    return out.multiplyMatrices(parent, this.t);
  }

  /** Place one body. The arithmetic of poseCharacter, applied to matrices instead of bones. */
  pose(p: Pose, look: Look): void {
    if (this.count >= this.capacity) return;
    this.count++;
    const speed = p.activity === "walk" || p.activity === "play" ? p.speed : 0;
    const amount = Math.min(1, speed);
    const run = THREE.MathUtils.clamp((speed - 1) / 0.6, 0, 1);
    const phase = p.time * 9 + p.phase0;
    const work = Math.sin(p.time * Math.PI * 2 * 1.3 + p.phase0);
    const sitting = p.activity === "sit" || p.activity === "row";

    // Root: feet on the ground, facing `yaw`, at the body's own scale.
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.yaw);
    const s = this.unitM * look.scale;
    this.root.compose(this.at0.set(p.x, p.y, p.z), this.q, this.scaleV.set(s, s, s));

    const bobY = (speed > 0 ? Math.cos(phase * 2) * 0.009 * amount : Math.sin(p.time * 1.7 + p.phase0) * 0.002) - 0.035 * amount - 0.055 * run - (sitting ? 0.2 : 0);
    this.at(this.root, 0, bobY, 0, 0, 0, Math.sin(phase) * 0.022 * amount, this.body);
    this.at(this.body, 0, 0.455, 0, 0, Math.sin(phase) * 0.055 * amount, 0, this.hips);
    if (look.skirt) this.put("pelvis", this.k.multiplyMatrices(this.hips, Crowd.SKIRT), look.cloth);
    else this.put("pelvis", this.hips, look.trousers);

    let torsoX = run * 0.12 + look.stoop;
    let headX = -run * 0.06;
    if (p.activity === "work") torsoX += 0.08;
    if (p.activity === "stoop") torsoX += 0.5 + work * 0.06;
    if (p.activity === "row") torsoX += 0.25 + Math.sin(p.time * 3) * 0.25;
    if (p.activity === "stoop" || p.activity === "work") headX = 0.2;
    this.at(this.body, 0, 0.43, 0, torsoX, -Math.sin(phase) * 0.065 * amount, 0, this.spine);
    this.put("torso", this.spine, look.cloth);
    this.at(this.spine, 0, 0.36, 0, headX, Math.sin(phase) * 0.025 * amount, 0, this.neck);
    this.put("head", this.neck, look.skin);
    this.put("hair", this.neck, look.hair);
    if (look.longHair) this.put("hair", this.k.multiplyMatrices(this.neck, Crowd.LONG_HAIR), look.hair);

    // Legs: the player's gait and the player's solver, or folded under for sitting and rowing.
    for (const side of [-1, 1]) {
      let hip: number;
      let knee: number;
      let ankle: number;
      if (sitting) {
        hip = -1.45;
        knee = 1.5;
        ankle = 0;
      } else {
        const target = gaitFootTarget(phase + (side > 0 ? Math.PI : 0), speed, run);
        const leg = solveLeg(target.forward, -0.397 + target.lift - bobY);
        hip = leg.hip;
        knee = leg.knee;
        ankle = leg.ankle;
        if (p.activity === "stoop") {
          hip -= 0.35;
          knee += 0.45;
          ankle -= 0.1;
        }
      }
      this.at(this.hips, side * 0.087, 0, 0, hip, 0, 0, this.j1);
      this.put("thigh", this.j1, look.skirt ? look.cloth : look.trousers);
      this.at(this.j1, 0, -0.205, 0, knee, 0, 0, this.j2);
      this.put("shin", this.j2, look.trousers);
      this.at(this.j2, 0, -0.205, 0, ankle, 0, 0, this.j3);
      this.put("foot", this.j3, look.trousers);
    }

    // Arms: the walking swing, or the work in hand.
    for (const side of [-1, 1]) {
      let arm = (side < 0 ? 1 : -1) * Math.sin(phase) * 0.4 * amount;
      let elbow = -0.18 - run * 0.8 - Math.max(0, side < 0 ? Math.cos(phase) : -Math.cos(phase)) * 0.2 * amount;
      if (p.activity === "work") {
        arm = -0.55 + work * 0.35 * side;
        elbow = -0.7 - work * 0.3;
      } else if (p.activity === "stoop") {
        arm = -0.95 + work * 0.25;
        elbow = -0.4;
      } else if (p.activity === "row") {
        arm = -1.1 + Math.sin(p.time * 3) * 0.45;
        elbow = -0.5 - Math.cos(p.time * 3) * 0.3;
      } else if (p.activity === "fish") {
        arm = -0.9;
        elbow = -0.6;
      } else if (p.activity === "sit") {
        arm = -0.35;
        elbow = -0.9;
      }
      this.at(this.spine, side * 0.15, 0.275, 0, arm, 0, side * 0.065, this.j1);
      this.put("upperArm", this.j1, look.cloth);
      this.at(this.j1, 0, -0.17, 0, elbow, 0, 0, this.j2);
      this.put("forearm", this.j2, look.skin);
    }
  }

  /** End a frame: hide what was not placed, and tell the GPU what moved. */
  end(): void {
    for (const name of PARTS) {
      const mesh = this.meshes.get(name)!;
      const used = this.cursor.get(name)!;
      for (let i = used; i < this.capacity * PER_BODY[name]; i++) mesh.setMatrixAt(i, Crowd.HIDDEN);
      mesh.count = Math.max(used, 1);
      if (used === 0) mesh.setMatrixAt(0, Crowd.HIDDEN);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** How many bodies the last frame placed. */
  placed(): number {
    return this.count;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
  }
}

// ── looks ───────────────────────────────────────────────────────────────────────

const SKIN = [0xc98f6a, 0xa8724f, 0xe0b088, 0x8a5a3c, 0xd9a173] as const;
/** What a dress is dyed with, before the trade's own colour is mixed in: madder, woad, weld, undyed linen. */
const DRESS = [0x8a4f45, 0x4f5f7a, 0x7a7a4a, 0xa89a7e, 0x7a5a40] as const;
/** A kerchief over the hair, for some grown women: linen. */
const KERCHIEF = [0xd8ccb2, 0xc9b99a, 0x8a4f45] as const;
const HAIR = [0x2e2620, 0x4a3426, 0x6b4a2e, 0x8a6a3a, 0x3a3a3a] as const;
/**
 * Clothes by trade, muted to sit inside the art bible's palette. Never echo-violet: §8 keeps violet
 * for live humans and the doppelgänger, and a villager is neither.
 */
const TRADE_CLOTH: Record<string, number> = {
  fisher: 0x4e6d7a, farmer: 0x7a6a4a, herder: 0x7d6b52, labourer: 0x6e624f,
  forester: 0x5d6b4a, carpenter: 0x6a6040, miner: 0x5a5550, stonecutter: 0x6a6660, smith: 0x4f4844,
  potter: 0x8a5a4a, weaver: 0x9a6a50, trader: 0x7a5a3a, innkeeper: 0x7a4e3e, carter: 0x6b5a44,
  healer: 0xb9a17c, teacher: 0xa89878,
};

/** A small deterministic number from a string, in [0, 1). The same FNV the palette module uses. */
export function hashUnit(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return (h >>> 0) / 4294967296;
}

export function lookFor(id: string, occupation: string, age: number, sex: "f" | "m" = "m"): Look {
  const female = sex === "f";
  const skin = new THREE.Color(SKIN[Math.floor(hashUnit(`${id}/skin`) * SKIN.length)]);
  const cloth = new THREE.Color(TRADE_CLOTH[occupation] ?? 0x7a6a50).offsetHSL(0, 0, (hashUnit(`${id}/cloth`) - 0.5) * 0.1);
  // A dress is its own dye with the trade's colour in it, so a fisherwoman still reads as the sea's.
  if (female) cloth.lerp(new THREE.Color(DRESS[Math.floor(hashUnit(`${id}/dress`) * DRESS.length)]), 0.55);
  // Woad over a madder-brown trade makes mauve, and violet is the echo's (art bible §8): turn it blue.
  const hsl = { h: 0, s: 0, l: 0 };
  cloth.getHSL(hsl);
  if (Math.abs(hsl.h - 0.75) <= 0.08 && hsl.s >= 0.12) cloth.setHSL(0.62, hsl.s, hsl.l);
  const trousers = new THREE.Color(female ? 0x3a302a : 0x4a3e30).offsetHSL(0, 0, (hashUnit(`${id}/trousers`) - 0.5) * 0.08);
  let hair = new THREE.Color(age >= 60 ? 0x9a958c : HAIR[Math.floor(hashUnit(`${id}/hair`) * HAIR.length)]);
  // Some grown women cover their hair: a kerchief is the hair part in linen.
  if (female && age >= 18 && hashUnit(`${id}/kerchief`) < 0.3) hair = new THREE.Color(KERCHIEF[Math.floor(hashUnit(`${id}/kerchief/colour`) * KERCHIEF.length)]);
  let scale = (female ? 0.91 : 0.95) + hashUnit(`${id}/height`) * 0.11;
  if (age < 13) scale *= 0.5 + age * 0.038;
  else if (age < 17) scale *= 0.92 + (age - 13) * 0.02;
  if (age < 13) cloth.offsetHSL(0, 0.05, 0.08);
  const stoop = age >= 68 ? 0.12 + (age - 68) * 0.006 : 0;
  return { skin, cloth, trousers, hair, scale, stoop, longHair: female && age >= 3, skirt: female && age >= 3 };
}
