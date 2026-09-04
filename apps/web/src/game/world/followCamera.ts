/**
 * The follow camera, as a pure function (plan W3-4). Replaces PlanetWorld's provisional boom.
 *
 * Renderer-free on purpose: no THREE.Vector3, no camera object, no DOM. Positions are plain
 * triples in three's world metres (x east, y up, z south) and the target is the same tile-space
 * getter the host's `setFollow` takes, so the player layer can hand one getter to both. The frame
 * conversion is the one WorldFrame.toScene and fromScene use, restated here in numbers because a
 * function that must run in node cannot ask a scene for it: scene x = tile x * tileM, scene z =
 * tile y * tileM, and height is whatever `heightAtTile` says. Nothing else about the frame is
 * assumed.
 *
 * Three ideas, in the order they are applied each step:
 *
 *   1. Orbit. Yaw and pitch come from drag pixels, the wanted distance from the wheel, all clamped.
 *      These are the player's wishes and are stored as such; collision never overwrites them, so
 *      the camera returns to where you put it once there is room.
 *
 *   2. Follow. The look target is the player's chest, but the camera does not sit rigidly on it: an
 *      anchor point springs toward the chest (a first-order spring, exponential ease, frame-rate
 *      independent), and the boom hangs off the anchor. Walking reads as walking instead of the
 *      world jerking with every step.
 *
 *   3. Terrain collision. The boom is walked outward from the anchor and the ground is sampled
 *      under each point; the first sample that comes within the clearance of the ground stops the
 *      boom there (bisected between the last clear sample and the blocked one, so the camera does
 *      not pop between sample lengths). Shortening is instant, because a camera inside a hill is
 *      wrong for every frame it lasts; lengthening is eased, because a camera snapping back out is
 *      a jolt. If the boom would end inside the player, the pitch is lifted until there is room:
 *      a camera looking down from above a person with their back to a cliff beats a camera in the
 *      cliff or in the person.
 *
 * Every rule here is checked by tests/followCamera.test.mts over ten thousand deterministic walks.
 */

import { TILE_M } from "@echo/shared";

export interface FollowCameraOptions {
  /** Metres per tile, WorldFrame.tileM. */
  tileM: number;
  /** The camera's near plane, metres. The ground must stay at least this far from the lens. */
  nearM: number;
  /** Metres the camera keeps above the ground along the boom, on top of the near plane. */
  clearanceM: number;
  /** Height of the look target above the player's feet, metres. About a chest. */
  chestM: number;
  /** The wheel's range for the wanted boom length, metres. */
  minDistanceM: number;
  maxDistanceM: number;
  /** Closer than this and the camera is inside the person. Collision lifts the pitch instead. */
  minBoomM: number;
  /** Radians above the horizontal. Negative looks up from below the chest. */
  pitchMin: number;
  pitchMax: number;
  /** Radians of orbit per dragged pixel. */
  orbitRadPerPx: number;
  /** Boom length multiplier per 100 wheel pixels; a notch on most mice. */
  zoomPerNotch: number;
  /** Per second: how fast the anchor closes on the chest. */
  followRate: number;
  /** Per second: how fast the boom grows back after a collision or a zoom out. */
  lengthenRate: number;
  /** Radians per second the collision lift relaxes once there is room. Raising is instant. */
  liftRelaxRate: number;
  /** Metres between ground samples along the boom. */
  sampleSpacingM: number;
}

/**
 * NOTHING HERE MOVED UNDER DECISIONS C1, which was measured before it was decided.
 *
 * Every length below is in metres and describes the camera's relationship to the PLAYER, not to the
 * landscape, so tripling the height scale can only reach them through one door: the boom's terrain
 * collision. Ten thousand deterministic steps per configuration were walked over 40 parcels on both
 * the old ground and the shipped one, with the pitch held rather than left to drift, because a
 * collision rate averaged over a random walk hides the case that breaks.
 *
 *   pitch 0.42 (where the camera starts) and 0.15   the boom NEVER collides, at either height
 *   pitch -0.2 (the lowest a drag can reach)        it collides on every frame at either height,
 *                                                   which is structural: a boom below the chest
 *                                                   line enters the ground whatever the relief
 *
 * At that bottom pitch the taller ground shortens the boom from 2.50 m to 2.39 m and starts using
 * the pitch lift, which peaks at 0.15 rad where the old ground never needed any. That is the
 * collision mechanism doing its job on steeper ground, not a number that wants changing.
 */
export const FOLLOW_CAMERA: FollowCameraOptions = {
  tileM: TILE_M,
  nearM: 0.1,
  clearanceM: 0.6,
  chestM: 1.2,
  minDistanceM: 2.5,
  maxDistanceM: 18,
  minBoomM: 1.5,
  pitchMin: -0.2,
  pitchMax: 1.35,
  orbitRadPerPx: 0.006,
  zoomPerNotch: 1.15,
  followRate: 10,
  lengthenRate: 4,
  liftRelaxRate: 1.5,
  sampleSpacingM: 0.5,
};

export type Vec3 = [number, number, number];

export interface FollowCameraState {
  /** Azimuth of the boom, radians. 0 puts the camera south of the player, looking north. */
  yaw: number;
  /** Elevation of the boom above the horizontal, radians. The player's wish, never collision's. */
  pitch: number;
  /** The wanted boom length, metres: what the wheel set. */
  distance: number;
  /** The boom length actually in use after collision and easing. */
  boom: number;
  /** Extra pitch collision has added so the boom fits. Zero when there is room. */
  lift: number;
  /** Where the camera looks: the sprung chest point, in scene metres. Null before the first step. */
  anchor: Vec3 | null;
}

/** What the camera follows, in TILES, plus the cosmetic jump. The same shape setFollow takes. */
export interface FollowTarget {
  x: number;
  y: number;
  liftM?: number;
}

/** What the pointer did since the last step. */
export interface FollowInput {
  /** Pixels dragged. Right is positive. */
  orbitDx: number;
  /** Pixels dragged. Down is positive. */
  orbitDy: number;
  /** Wheel pixels. Scrolling down (positive) zooms out. */
  zoom: number;
}

export interface FollowResult {
  position: Vec3;
  lookAt: Vec3;
  state: FollowCameraState;
}

export type HeightAtTile = (tileX: number, tileY: number) => number;

/**
 * The starting state. Yaw π puts the camera NORTH of the player looking south, which is the way a
 * fresh mover faces (initialMover's default heading is π/2, south), so the first frame is over the
 * player's shoulder rather than into their face.
 */
export function initialFollowCamera(opts: Partial<FollowCameraOptions> = {}): FollowCameraState {
  const o = { ...FOLLOW_CAMERA, ...opts };
  const distance = Math.min(o.maxDistanceM, Math.max(o.minDistanceM, 8));
  return { yaw: Math.PI, pitch: 0.42, distance, boom: distance, lift: 0, anchor: null };
}

/** Unit vector from the look target toward the camera, for a yaw and pitch. */
export function boomDirection(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

/** The way the camera looks, flattened: (east, south), unit length. The opposite of the boom. */
export function cameraForward(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/**
 * Stick axes to a tile-space direction. `forward` is 1 for W, `right` is 1 for D; the result is
 * (dx east, dy south) ready for stepMover, so W always walks the way the camera looks and D walks
 * to the viewer's right, whatever the orbit. Right is forward turned a quarter turn clockwise seen
 * from above, which in an (east, south) frame is (-south, east).
 */
export function cameraRelativeMove(yaw: number, forward: number, right: number): { dx: number; dy: number } {
  const [fx, fy] = cameraForward(yaw);
  const rx = -fy;
  const ry = fx;
  return { dx: fx * forward + rx * right, dy: fy * forward + ry * right };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The longest boom, up to `wanted`, along which every sample clears the ground. Walks outward
 * from the anchor at `spacing`; at the first blocked sample, bisects between the last clear length
 * and the blocked one and keeps the clear side. Distances are metres along the boom.
 */
function allowedBoom(
  anchor: Vec3,
  dir: Vec3,
  wanted: number,
  ground: (x: number, z: number) => number,
  floorM: number,
  spacing: number,
): number {
  const margin = (len: number) => {
    const x = anchor[0] + dir[0] * len;
    const y = anchor[1] + dir[1] * len;
    const z = anchor[2] + dir[2] * len;
    return y - (ground(x, z) + floorM);
  };
  const steps = Math.max(4, Math.ceil(wanted / spacing));
  let good = 0;
  for (let i = 1; i <= steps; i++) {
    const len = (wanted * i) / steps;
    if (margin(len) >= 0) {
      good = len;
      continue;
    }
    // Blocked between `good` and `len`. Eight halvings of a half-metre bracket is two millimetres,
    // finer than any motion the eye can catch, and the clear side is kept so the invariant holds.
    let bad = len;
    for (let k = 0; k < 8; k++) {
      const mid = (good + bad) / 2;
      if (margin(mid) >= 0) good = mid;
      else bad = mid;
    }
    return good;
  }
  return wanted;
}

/**
 * One step. Pure: returns the new state along with the camera position and look target in scene
 * metres. `heightAtTile` is THE ground, whatever the caller wants the camera to stay above; the
 * player layer passes the sea-clamped height so the camera treats the water sheet as ground, the
 * way WorldFrame.toScene places feet on it.
 */
export function stepFollowCamera(
  state: FollowCameraState,
  target: FollowTarget,
  input: FollowInput,
  dt: number,
  heightAtTile: HeightAtTile,
  opts: Partial<FollowCameraOptions> = {},
): FollowResult {
  const o = { ...FOLLOW_CAMERA, ...opts };
  const step = clamp(dt, 0, 0.1);
  const ground = (x: number, z: number) => heightAtTile(x / o.tileM, z / o.tileM);
  const floorM = o.clearanceM + o.nearM;

  // 1. Orbit and zoom: the wishes. Dragging right turns the view right, so the camera swings to
  //    the viewer's left, which is a falling yaw; the yaw is kept wrapped to (-π, π].
  const rawYaw = state.yaw - input.orbitDx * o.orbitRadPerPx;
  const yaw = Math.atan2(Math.sin(rawYaw), Math.cos(rawYaw));
  const pitch = clamp(state.pitch + input.orbitDy * o.orbitRadPerPx, o.pitchMin, o.pitchMax);
  const distance = clamp(state.distance * Math.pow(o.zoomPerNotch, input.zoom / 100), o.minDistanceM, o.maxDistanceM);

  // 2. Follow: the anchor closes on the chest. It starts on it, so the first frame is not a swoop
  //    in from the origin. The chest is never allowed under the ground it hangs over, which can
  //    only happen while the anchor lags across a ledge; it is the s = 0 sample of the boom.
  const chest: Vec3 = [
    target.x * o.tileM,
    heightAtTile(target.x, target.y) + (target.liftM ?? 0) + o.chestM,
    target.y * o.tileM,
  ];
  let anchor: Vec3;
  if (state.anchor) {
    const k = 1 - Math.exp(-o.followRate * step);
    anchor = [
      state.anchor[0] + (chest[0] - state.anchor[0]) * k,
      state.anchor[1] + (chest[1] - state.anchor[1]) * k,
      state.anchor[2] + (chest[2] - state.anchor[2]) * k,
    ];
  } else {
    anchor = chest;
  }
  anchor[1] = Math.max(anchor[1], ground(anchor[0], anchor[2]) + floorM);

  // 3. Collision. First at the pitch the player asked for; if that leaves the boom inside the
  //    person, lift the pitch in steps until it does not. The lift is remembered so it can relax
  //    smoothly, but a relaxed lift is trusted only if it still fits: hills are not monotone in
  //    pitch, so the fresh search is the authority whenever the relaxed one fails.
  let needLift = 0;
  let allowed = 0;
  const maxLift = Math.max(0, o.pitchMax + 0.2 - pitch);
  for (;;) {
    allowed = allowedBoom(anchor, boomDirection(yaw, pitch + needLift), distance, ground, floorM, o.sampleSpacingM);
    if (allowed >= o.minBoomM || needLift >= maxLift) break;
    needLift = Math.min(maxLift, needLift + 0.15);
  }
  let lift = needLift;
  if (state.lift > needLift) {
    const relaxed = Math.max(needLift, state.lift - o.liftRelaxRate * step);
    const relaxedAllowed = allowedBoom(anchor, boomDirection(yaw, pitch + relaxed), distance, ground, floorM, o.sampleSpacingM);
    if (relaxedAllowed >= o.minBoomM) {
      lift = relaxed;
      allowed = relaxedAllowed;
    }
  }
  const dir = boomDirection(yaw, pitch + lift);

  // Shorten now, lengthen later. A boom shorter than allowed is always clear: its samples are a
  // prefix of the allowed boom's.
  let boom: number;
  if (allowed <= state.boom) boom = allowed;
  else boom = Math.min(allowed, state.boom + (allowed - state.boom) * (1 - Math.exp(-o.lengthenRate * step)));

  const position: Vec3 = [anchor[0] + dir[0] * boom, anchor[1] + dir[1] * boom, anchor[2] + dir[2] * boom];
  // The lens itself, one more time, exactly: the bisection keeps the clear side but never checks
  // the eased length, and a raised endpoint only raises the segment behind it.
  position[1] = Math.max(position[1], ground(position[0], position[2]) + floorM);

  return {
    position,
    lookAt: anchor,
    state: { yaw, pitch, distance, boom, lift, anchor },
  };
}
