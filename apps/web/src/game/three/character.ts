/** A continuous, rounded body with shoulder/elbow/wrist and hip/knee/ankle chains.
 * All game hosts use this rig. Locomotion targets the soles, rather than swinging rigid legs.
 */
import * as THREE from "three";
import { PALETTE, hashStr } from "./palette";
export const UNITS_PER_TILE = 1;
export const BODY_H = 1.05;
const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
const shape = (w: number, h: number, d: number) => {
  const g = new THREE.SphereGeometry(0.5, 24, 16);
  g.scale(w, h, d);
  return g;
};
export interface CharacterParts {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; torso: THREE.Group; hips: THREE.Group;
  armL: THREE.Bone; armR: THREE.Bone; legL: THREE.Bone; legR: THREE.Bone;
  elbowL: THREE.Bone; elbowR: THREE.Bone; kneeL: THREE.Bone; kneeR: THREE.Bone;
  footL: THREE.Bone; footR: THREE.Bone; handL: THREE.Bone; handR: THREE.Bone;
  carry: THREE.Mesh; skinMats: THREE.MeshLambertMaterial[];
}
export function buildCharacter(id: string, isUser: boolean): CharacterParts {
  const skin = mat([0xc98f6a, 0xa8724f, 0xe0b088, 0x8a5a3c, 0xd9a173][Math.floor(hashStr(id + 'b') * 5) % 5]);
  const cloth = mat(isUser ? 0xe9e7db : [0x799b89, 0xb9a17c, 0x819aad][Math.floor(hashStr(id) * 3) % 3]);
  const shorts = mat(0x554633), sole = mat(0x847663), eye = mat(0x302d27);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const joint = (parent: THREE.Object3D, name: string, x: number, y: number, z = 0) => {
    const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); parent.add(group); return group;
  };
  const mesh = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(shape(w, h, d), material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const hinge = (parent: THREE.Object3D, name: string, x: number, y: number) => {
    const bone = new THREE.Bone(); bone.name = name; bone.position.set(x,y,0); parent.add(bone); return bone;
  };
  // A single weighted skin spans each limb. The elbow/knee bends the surface continuously,
  // instead of exposing disconnected spheres where two rigid segments meet.
  const limbSkin = (bones: THREE.Bone[], first: number, second: number, radius: number) => {
    const length = first + second;
    const geometry = new THREE.CylinderGeometry(radius * .84, radius * .72, length, 16, 16);
    geometry.translate(0, -length / 2, 0);
    const positions = geometry.attributes.position;
    const indices: number[] = [], weights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const distance = -positions.getY(i);
      const t = THREE.MathUtils.smoothstep(distance, first - .045, first + .045);
      indices.push(0,1,0,0); weights.push(1-t,t,0,0);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const surface = new THREE.SkinnedMesh(geometry,skin);
    surface.name = 'continuous-limb-skin'; surface.castShadow = true; surface.receiveShadow = true;
    bones[0]!.add(surface); root.updateMatrixWorld(true);
    surface.bind(new THREE.Skeleton(bones));
  };
  const hips = joint(body, 'pelvis', 0, .455);
  mesh(hips, .30, .17, .21, shorts, 0, -.025);
  const leg = (side: number) => {
    const upper = hinge(hips, 'hip', side * .087, 0);
    mesh(upper, .145, .255, .155, shorts, 0, -.09);
    const knee = hinge(upper, 'knee', 0, -.205);
    const foot = hinge(knee, 'ankle', 0, -.205);
    mesh(foot, .13, .09, .22, sole, 0, -.005, .045);
    limbSkin([upper,knee,foot], .205, .205, .064);
    return { upper, knee, foot };
  };
  const l = leg(-1), r = leg(1);
  const torso = joint(body, 'spine', 0, .43);
  mesh(torso, .35, .39, .235, cloth, 0, .16);
  mesh(torso, .10, .13, .105, skin, 0, .335);
  const head = joint(torso, 'neck', 0, .36);
  mesh(head, .34, .355, .325, skin, 0, .155);
  for (const side of [-1, 1]) {
    mesh(head, .067, .095, .062, skin, side * .166, .12);
    mesh(head, .025, .036, .018, eye, side * .061, .157, .157);
  }
  mesh(head, .049, .05, .07, skin, 0, .112, .163);
  const arm = (side: number) => {
    const upper = hinge(torso, 'shoulder', side * .15, .275);
    mesh(upper, .145, .18, .15, cloth, 0, -.036);
    const elbow = hinge(upper, 'elbow', 0, -.17);
    const hand = hinge(elbow, 'wrist', 0, -.15);
    mesh(hand, .09, .107, .065, skin, 0, -.018);
    mesh(hand, .035, .06, .039, skin, -side * .037, -.01, .015);
    limbSkin([upper,elbow,hand], .17, .15, .054);
    return { upper, elbow, hand };
  };
  const a = arm(-1), b = arm(1);
  const carry = new THREE.Mesh(new THREE.BoxGeometry(.5, .07, .12), mat(PALETTE.wood));
  carry.position.set(0, .13, .28); carry.visible = false; carry.castShadow = true; torso.add(carry);
  return { root, body, head, torso, hips, armL: a.upper, armR: b.upper, elbowL: a.elbow, elbowR: b.elbow,
    handL: a.hand, handR: b.hand, legL: l.upper, legR: r.upper, kneeL: l.knee, kneeR: r.knee,
    footL: l.foot, footR: r.foot, carry, skinMats: [skin, cloth, shorts] };
}
const FACING_YAW: Record<string, number> = { down: 0, up: Math.PI, right: -Math.PI / 2, left: Math.PI / 2 };
export interface PoseInput {
  facing: string; moving: boolean; animTime: number; bob: number; lean: number; carrying: boolean; activity: string | null;
  /** Actual velocity / walking velocity: stride blends smoothly when accelerating or stopping. */
  speed?: number; runBlend?: number; airborne?: boolean; groundL?: number; groundR?: number;
}
/** Linear backward travel during stance cancels forward travel of the body.
 * The return stroke uses eased forward travel and lifts the sole off the ground. */
export function gaitFootTarget(phase: number, speed: number, runBlend: number) {
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const amplitude = (.18 + .087 * runBlend) * Math.min(1, Math.max(0, speed));
  if (cycle < .5) {
    const t = cycle * 2, ease = t * t * (3 - 2 * t);
    return { forward: amplitude * (ease * 2 - 1), lift: Math.sin(t * Math.PI) * (.065 + .115 * runBlend) * Math.min(1, speed), stance: false };
  }
  return { forward: amplitude * (3 - cycle * 4), lift: 0, stance: true };
}

/** Two-bone sagittal IK. Soles remain horizontal through stance, knees fold during recovery. */
export function solveLeg(forward: number, height: number): { hip: number; knee: number; ankle: number } {
  const length = .205;
  const distance = Math.min(length * 1.998, Math.max(.08, Math.hypot(forward, height)));
  const knee = Math.acos(THREE.MathUtils.clamp((distance * distance - 2 * length * length) / (2 * length * length), -1, 1));
  const hip = Math.atan2(-forward, -height) - knee / 2;
  return { hip, knee, ankle: -hip - knee };
}
export function poseCharacter(p: CharacterParts, s: PoseInput) {
  p.root.rotation.y = FACING_YAW[s.facing] ?? 0;
  const now = performance.now() / 1000;
  const speed = s.speed ?? (s.moving ? 1 : 0), amount = Math.min(1, speed);
  const run = s.runBlend ?? THREE.MathUtils.clamp((speed - 1) / .6, 0, 1);
  const phase = s.animTime * 9;
  p.body.position.y = s.bob / 16 - .035 * amount - .055 * run + (s.moving ? Math.cos(phase * 2) * .009 * amount : Math.sin(now * 1.7) * .002);
  p.body.rotation.set(0, 0, s.lean + Math.sin(phase) * .022 * amount);
  p.hips.rotation.y = Math.sin(phase) * .055 * amount;
  p.torso.rotation.set(run * .12, -Math.sin(phase) * .065 * amount, 0);
  p.head.rotation.set(-run * .06, Math.sin(phase) * .025 * amount, 0);
  const leg = (upper: THREE.Bone, knee: THREE.Bone, foot: THREE.Bone, ph: number, ground: number) => {
    const target = gaitFootTarget(ph, speed, run);
    const pose = solveLeg(target.forward, -.397 + target.lift + THREE.MathUtils.clamp(ground, -.09, .12) - p.body.position.y);
    upper.rotation.x = s.airborne ? -.48 : pose.hip;
    knee.rotation.x = s.airborne ? 1.05 : pose.knee;
    foot.rotation.x = s.airborne ? -.3 : pose.ankle;
  };
  leg(p.legL, p.kneeL, p.footL, phase, s.groundL ?? 0);
  leg(p.legR, p.kneeR, p.footR, phase + Math.PI, s.groundR ?? 0);
  p.armL.rotation.set(Math.sin(phase) * .4 * amount, 0, .065);
  p.armR.rotation.set(-Math.sin(phase) * .4 * amount, 0, -.065);
  p.elbowL.rotation.x = -.18 - run * .8 - Math.max(0, Math.cos(phase)) * .2 * amount;
  p.elbowR.rotation.x = -.18 - run * .8 - Math.max(0, -Math.cos(phase)) * .2 * amount;
  p.handL.rotation.x = p.handR.rotation.x = .08;
  // C45's acts. Seated and kneeling bodies are lowered by the hip; the root stays on the ground. They
  // return early, so whatever is carried is shown first.
  p.carry.visible = s.carrying;
  if (s.activity === 'sit' || s.activity === 'row') {
    p.body.position.y -= .16;
    p.legL.rotation.x = p.legR.rotation.x = -1.45;
    p.kneeL.rotation.x = p.kneeR.rotation.x = 1.5;
    p.footL.rotation.x = p.footR.rotation.x = -.05;
    p.torso.rotation.x = .04;
    if (s.activity === 'row') {
      const pull = Math.sin(now * Math.PI * 2 * .7);
      p.torso.rotation.x = .1 + pull * .22;
      p.armL.rotation.x = p.armR.rotation.x = -1.1 - pull * .5;
      p.elbowL.rotation.x = p.elbowR.rotation.x = -.6 + pull * .4;
    } else {
      p.armL.rotation.x = p.armR.rotation.x = -.35;
      p.elbowL.rotation.x = p.elbowR.rotation.x = -.5;
    }
    return;
  }
  if (s.activity === 'kneel') {
    p.body.position.y -= .14;
    p.legL.rotation.x = -.15; p.kneeL.rotation.x = 1.75; p.footL.rotation.x = .3;
    p.legR.rotation.x = -1.35; p.kneeR.rotation.x = 1.45; p.footR.rotation.x = -.1;
    p.torso.rotation.x = .28; p.head.rotation.x = .3;
    p.armL.rotation.x = p.armR.rotation.x = -.5; p.elbowL.rotation.x = p.elbowR.rotation.x = -.6;
    return;
  }
  if (s.activity === 'push') {
    const shove = Math.sin(now * Math.PI * 2 * 1.1);
    p.torso.rotation.x = .38 + shove * .06;
    p.armL.rotation.x = p.armR.rotation.x = -1.35 + shove * .1;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -.25;
    p.legL.rotation.x = -.35; p.kneeL.rotation.x = .45;
    p.legR.rotation.x = .3; p.kneeR.rotation.x = .1;
    return;
  }
  if (s.activity === 'climb') {
    const reach = Math.sin(now * Math.PI * 2 * .9);
    p.body.position.y += .05 + Math.max(0, reach) * .04;
    p.armL.rotation.x = -2.7 + reach * .3; p.armR.rotation.x = -2.7 - reach * .3;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -.3;
    p.legL.rotation.x = -.6 - reach * .4; p.kneeL.rotation.x = .9 + reach * .4;
    p.legR.rotation.x = -.6 + reach * .4; p.kneeR.rotation.x = .9 - reach * .4;
    p.torso.rotation.x = -.05;
    return;
  }
  if (s.activity && s.activity !== 'still') {
    const work = Math.sin(now * Math.PI * 2 * (s.activity === 'dig' ? 1.8 : 1.3));
    const low = ['plant', 'gather', 'dig'].includes(s.activity);
    p.torso.rotation.x = low ? .25 + work * .1 : .08;
    p.head.rotation.x = .2;
    p.armL.rotation.x = p.armR.rotation.x = -.55 + work * .35;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -.7 - work * .3;
  }
  p.carry.visible = s.carrying;
  if (s.carrying || s.activity === 'carry') {
    p.armL.rotation.x = p.armR.rotation.x = -.65;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -.85;
  }
}

const armDown = new THREE.Vector3(0,-1,0);
const reachTarget = new THREE.Vector3(), reachDirection = new THREE.Vector3(), reachPole = new THREE.Vector3();
const elbowPoint = new THREE.Vector3(), lowerDirection = new THREE.Vector3();
const shoulderRotation = new THREE.Quaternion(), elbowRotation = new THREE.Quaternion();
/** Reach a world-space contact with a connected two-bone arm. Returns false outside arm's reach. */
export function reachCharacter(p: CharacterParts, side: -1 | 1, worldTarget: THREE.Vector3, weight = 1): boolean {
  p.root.updateMatrixWorld(true);
  const shoulder = side < 0 ? p.armL : p.armR, elbow = side < 0 ? p.elbowL : p.elbowR;
  reachTarget.copy(worldTarget); p.torso.worldToLocal(reachTarget); reachTarget.sub(shoulder.position);
  const distance=reachTarget.length(), upper=.17, lower=.15;
  if (distance > upper+lower || distance < .025) return false;
  reachDirection.copy(reachTarget).normalize();
  reachPole.set(side*.75,-.5,-.2).addScaledVector(reachDirection,-reachPole.dot(reachDirection)).normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const bend=Math.sqrt(Math.max(0,upper*upper-along*along));
  elbowPoint.copy(reachDirection).multiplyScalar(along).addScaledVector(reachPole,bend);
  shoulderRotation.setFromUnitVectors(armDown,lowerDirection.copy(elbowPoint).normalize());
  lowerDirection.copy(reachTarget).sub(elbowPoint).normalize().applyQuaternion(elbowRotation.copy(shoulderRotation).invert());
  elbowRotation.setFromUnitVectors(armDown,lowerDirection);
  const blend=THREE.MathUtils.clamp(weight,0,1);
  shoulder.quaternion.slerp(shoulderRotation,blend); elbow.quaternion.slerp(elbowRotation,blend);
  return true;
}
