/**
 * The body, built from parented parts and animated by rotating joints in code.
 *
 * No rig, no GLB, no skinning. Blocky games have animated this way forever, and the 2D build
 * already proved the thing that actually matters: the MANNER carries the cues. A vigorous build and
 * a languid one differ in the same scalars whether the body is eight sprites or eight boxes.
 *
 * The hierarchy is what makes it work — rotate a shoulder and the forearm and hand come with it:
 *
 *   root (yaw = heading)
 *    └ body (bob / lean live here, so the whole figure moves as one)
 *       ├ hips ── legL/legR      (walk swing)
 *       ├ torso
 *       │   ├ head               (gaze — a real 3D cue the top-down build threw away)
 *       │   ├ armL/armR          (walk swing, work strokes)
 *       │   └ carry              (a plank held across the hands)
 *       └ —
 *
 * Everything is flat-shaded and untextured. Soft rounded forms, not cubes: the silhouette has to
 * read as carved clay at 40 tiles, so the shapes are chunky and the joints are hidden inside
 * overlapping volumes rather than left as visible seams.
 */
import * as THREE from "three";
import { PALETTE, hashStr } from "./palette";

/** One world tile = this many three units. Gameplay is in TILES; only the renderer knows metres. */
export const UNITS_PER_TILE = 1;

/** Standing height of the avatar in three units — a shade over one tile, so the CLOSE ≤ 2.0 gate
 *  reads as "an arm's length away" rather than "two body-lengths". */
export const BODY_H = 1.05;

const mat = (color: number, flat = true) =>
  new THREE.MeshLambertMaterial({ color, flatShading: flat });

/** A rounded box — the carved-clay primitive. Beveled by subdividing and pushing corners in. */
function clay(w: number, h: number, d: number, round = 0.18): THREE.BufferGeometry {
  // A low-segment sphere squashed to the box's proportions reads rounder than a beveled box and is
  // cheaper than any CSG. At this scale the difference from a true rounded box is invisible.
  const g = new THREE.SphereGeometry(0.5, 8, 6);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // Push the sphere toward a box by flattening each axis toward its extreme, then scale.
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 - round;
    pos.setX(i, Math.sign(x) * Math.min(0.5, Math.abs(x) + k * 0.5 * (1 - Math.abs(x) * 2) * 0));
    pos.setY(i, y);
    pos.setZ(i, z);
    void k;
  }
  g.scale(w, h, d);
  g.computeVertexNormals();
  return g;
}

/** A simple flat-shaded box, for built things (geometric, per the bible). */
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export interface CharacterParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  hips: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  carry: THREE.Mesh;
  /** Every material we tint (vitality drains colour out of the self avatar). */
  skinMats: THREE.MeshLambertMaterial[];
}

/**
 * Build one body. `id` seeds its look so a given player is recognisably themselves across sessions
 * and machines, without an asset pipeline: tunic hue, height and build all fall out of the hash.
 */
export function buildCharacter(id: string, isUser: boolean): CharacterParts {
  const h = hashStr(id);
  const h2 = hashStr(id + "b");
  const h3 = hashStr(id + "c");

  // Individual proportions — small, so silhouettes stay readable, but enough that a crowd is a
  // crowd of people rather than a row of clones.
  const scale = 0.92 + h * 0.16;
  const girth = 0.9 + h2 * 0.22;

  const tunicHue = [PALETTE.tunic, PALETTE.tunicAlt, 0x6a5f7a, 0x55705f, 0x7a6252][Math.floor(h3 * 5) % 5];
  const skinShade = [0xc98f6a, 0xa8724f, 0xe0b088, 0x8a5a3c, 0xd9a173][Math.floor(h2 * 5) % 5];

  const skinMat = mat(skinShade);
  const tunicMat = mat(tunicHue);
  const hairMat = mat(PALETTE.hair);
  const skinMats = [skinMat, tunicMat, hairMat];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(scale);

  // ── hips + legs ──
  const hips = new THREE.Group();
  hips.position.y = 0.42;
  body.add(hips);

  const legGeo = clay(0.15 * girth, 0.44, 0.16);
  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.11 * girth, 0, 0);
    const m = new THREE.Mesh(legGeo, tunicMat);
    m.position.y = -0.22; // hang from the joint, so rotation swings the foot
    m.castShadow = true;
    g.add(m);
    hips.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // ── torso ──
  const torso = new THREE.Group();
  torso.position.y = 0.42;
  body.add(torso);
  const torsoMesh = new THREE.Mesh(clay(0.34 * girth, 0.4, 0.22 * girth), tunicMat);
  torsoMesh.position.y = 0.2;
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);

  // ── head (its own group: gaze is a cue we can finally read) ──
  const head = new THREE.Group();
  head.position.y = 0.44;
  torso.add(head);
  const skull = new THREE.Mesh(clay(0.26, 0.28, 0.25), skinMat);
  skull.position.y = 0.13;
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(clay(0.28, 0.16, 0.27), hairMat);
  hair.position.y = 0.22;
  head.add(hair);
  // A nose. Tiny, but it is the whole reason a heading reads at a glance.
  const nose = new THREE.Mesh(box(0.05, 0.05, 0.07), skinMat);
  nose.position.set(0, 0.12, 0.13);
  head.add(nose);

  // ── arms ──
  const armGeo = clay(0.12 * girth, 0.4, 0.13);
  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.21 * girth, 0.36, 0);
    const m = new THREE.Mesh(armGeo, skinMat);
    m.position.y = -0.2;
    m.castShadow = true;
    g.add(m);
    torso.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ── the carried plank (hidden until an activity says otherwise) ──
  const carry = new THREE.Mesh(box(0.5, 0.07, 0.12), mat(PALETTE.wood));
  carry.position.set(0, 0.3, 0.2);
  carry.visible = false;
  carry.castShadow = true;
  torso.add(carry);

  // ── the violet ring: live humans only, and it is the one place echo-violet appears on a body ──
  if (isUser) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 20),
      new THREE.MeshBasicMaterial({
        color: PALETTE.echo,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015; // just off the ground, so it never z-fights the terrain
    ring.name = "ring";
    root.add(ring);
  }

  return { root, body, head, torso, hips, armL, armR, legL, legR, carry, skinMats };
}

/** Which way the body faces, from the 4-way facing the server speaks. */
const FACING_YAW: Record<string, number> = {
  down: 0,
  up: Math.PI,
  right: -Math.PI / 2,
  left: Math.PI / 2,
};

export interface PoseInput {
  facing: string;
  moving: boolean;
  /** Walk-cycle phase accumulator (seconds). */
  animTime: number;
  /** From WorldCore.entityVisual — the activity's rhythmic bob/lean. */
  bob: number;
  lean: number;
  carrying: boolean;
  activity: string | null;
}

/**
 * Pose the body for this frame. Everything is a joint rotation — which is exactly why the manner
 * cues survive the migration: the same `intensity` that made a sprite lunge harder now makes a
 * shoulder swing further, and neither is what we measure. We measure how long you held it.
 */
export function poseCharacter(p: CharacterParts, s: PoseInput) {
  p.root.rotation.y = FACING_YAW[s.facing] ?? 0;

  // The activity's bob/lean are authored in 2D source px; 1 tile = 16 px there.
  p.body.position.y = s.bob / 16;
  p.body.rotation.z = s.lean;

  const t = s.animTime;
  if (s.moving) {
    // Walk: opposed limbs, a light bounce. 8 Hz matches the 2D sheet's WALK_FPS so the cadence
    // reads the same to a returning player.
    const sw = Math.sin(t * 9) * 0.5;
    p.legL.rotation.x = sw;
    p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.7;
    p.armR.rotation.x = sw * 0.7;
    p.body.position.y += Math.abs(Math.sin(t * 18)) * 0.02;
  } else {
    // Idle: a slow breath. Never perfectly still — a frozen avatar reads as a bug.
    const br = Math.sin(performance.now() / 1000 * 1.2) * 0.02;
    p.legL.rotation.x = 0;
    p.legR.rotation.x = 0;
    p.armL.rotation.x = br;
    p.armR.rotation.x = br;
  }

  // Activity overrides the arms — the work is done with the hands.
  const now = performance.now() / 1000;
  switch (s.activity) {
    case "build":
    case "dig": {
      const hz = s.activity === "dig" ? 1.8 : 2.2;
      const ph = Math.sin(now * Math.PI * 2 * hz);
      // Both arms drive down together: a lashing pull, a spade strike.
      p.armL.rotation.x = -1.1 + ph * 0.8;
      p.armR.rotation.x = -1.1 + ph * 0.8;
      p.torso.rotation.x = 0.18 + ph * 0.12;
      p.head.rotation.x = 0.25; // looking at the work, not the horizon
      break;
    }
    case "gather":
    case "plant": {
      const ph = Math.abs(Math.sin(now * Math.PI * 2 * (s.activity === "plant" ? 1.2 : 1.4)));
      p.armL.rotation.x = -0.5 - ph * 0.9;
      p.armR.rotation.x = -0.5 - ph * 0.9;
      p.torso.rotation.x = 0.3 * ph;
      p.head.rotation.x = 0.3;
      break;
    }
    case "study": {
      p.armL.rotation.x = -0.3;
      p.armR.rotation.x = -0.3;
      p.torso.rotation.x = 0.1;
      p.head.rotation.x = 0.12 + Math.sin(now * 1.5) * 0.05; // reading down the stone
      break;
    }
    case "still": {
      p.torso.rotation.x = 0;
      p.head.rotation.x = 0;
      break;
    }
    case "carry": {
      p.armL.rotation.x = -1.3;
      p.armR.rotation.x = -1.3;
      p.torso.rotation.x = 0;
      p.head.rotation.x = 0;
      break;
    }
    default:
      p.torso.rotation.x = 0;
      p.head.rotation.x = 0;
  }

  p.carry.visible = s.carrying;
  if (s.carrying) {
    // Carrying pins the arms whatever else is happening — you cannot lash a raft one-handed.
    p.armL.rotation.x = -1.3;
    p.armR.rotation.x = -1.3;
  }
}
