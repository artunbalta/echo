/**
 * The player layer (plan W3-3): a visible third-person body, the mover, the input and the camera,
 * as one WorldLayer named "player".
 *
 * It decides nothing about movement. stepMover is the mover, walkableTile is the gate, and this
 * layer's job is to feed the one with the keys and the other with the frame, then put the body
 * where the mover says and the camera where the follow camera says. Since W2-3 there is a SECOND
 * gate, and it is optional for a reason spelled out in controller.ts: the ground is a fact both
 * sides of the wire agree on, and a tree is not, so props are an extra predicate the client passes
 * in when it has a scatter layer and the server never sees. The body is the same rig
 * ThreeWorld draws, so a returning player is the same person here; it is authored in TILE units
 * (BODY_H is a shade over one tile) and this world is in metres, so the root is scaled by the
 * frame's metres per tile and the person comes out about 1.7 m tall, as TILE_M promises.
 *
 * The camera. The layer drives ctx.camera itself from followCamera.ts every update, so orbit and
 * terrain collision are real here. PlanetWorld's own provisional boom runs AFTER the layers when
 * `setFollow` is set and would overwrite this camera every frame; a mount that wants this camera
 * must therefore not pass `follow`. `position()` is still exposed for anything that wants the
 * host's camera instead, or the player's tile for a label or a station.
 */

import * as THREE from "three";
import type { ColliderIndex } from "@echo/planet";
import { cylinderBoomLimit } from "./cameraObstacles";

import { buildCharacter, gaitFootTarget, poseCharacter, reachCharacter, type CharacterParts } from "../three/character";
import { initialMover, jumpHeightM, parcelMovement, stepMover, type MoveInput, type MoverState } from "./controller";
import {
  initialFollowCamera,
  stepFollowCamera,
  type FollowCameraOptions,
  type FollowCameraState,
  type BoomObstacleLimit,
} from "./followCamera";
import { createInput, type WorldInput } from "./input";
import type { TouchControlHandle } from "./touchInput";
import { SPAWN_HORIZON_MARGIN_DEG, spawnView } from "./spawnView";
import type { LayerContext, WorldLayer } from "./PlanetWorld";

export interface PlayerLayerOptions {
  /** Seeds the body's look, so it is the same person every visit. */
  id?: string;
  /** Start with the keys and pointer ignored, e.g. while the hero is still the globe. */
  inputEnabled?: boolean;
  /** Overrides for the follow camera's numbers. tileM and nearM come from the world. */
  camera?: Partial<FollowCameraOptions>;
  /**
   * Half the width of the body, metres, for bumping into props. A shoulder is about 0.35 m from
   * the spine; the rig is authored to TILE_M so this is in the same metres the colliders are.
   */
  bodyRadiusM?: number;
  /**
   * The HUD's thumbstick and jump button, where the mount has drawn them (DECISIONS C23). Passed
   * straight to createInput and never read here: this layer decides nothing about movement, and
   * choosing between a thumb and a keyboard is a decision. Absent is a world with no touch HUD,
   * which is every desktop mount and the landing preview.
   */
  touch?: TouchControlHandle;
}

/**
 * What the player needs from whatever knows where the props stand: the scatter layer satisfies it
 * and is found by name, the way the reactions layer finds the campfire. It is structural rather
 * than imported so a world with no scatter is not a world with a missing dependency, it is a world
 * where nothing is in your way, which is what the demo was before W2-3.
 */
interface ObstacleSource extends WorldLayer {
  blockedTile(x: number, y: number, radiusM: number): boolean;
  colliders?(): ColliderIndex | null;
}

export interface PlayerLayer extends WorldLayer {
  /** Put the body at a tile position, clearing its velocity. */
  setPosition(x: number, y: number): void;
  /** The player in tiles, plus the cosmetic jump. The shape setFollow takes. */
  position(): { x: number; y: number; liftM: number };
  mover(): MoverState;
  camera(): FollowCameraState;
  setInputEnabled(enabled: boolean): void;
}

const NEUTRAL: MoveInput = { dx: 0, dy: 0, run: false, jump: false, activity: null };

/**
 * The rig's yaw for a continuous heading. The rig faces +z at rotation 0 (its nose is at +z), and
 * heading h is atan2(south, east) in the tile frame, whose south is this world's +z. Rotating +z
 * about y by θ gives (sin θ, 0, cos θ), so the body faces (cos h, sin h) when θ = π/2 - h.
 * poseCharacter's 4-way FACING_YAW table is for the wire's facing; the heading is what the body
 * actually turns to, so this is applied on the line after the pose.
 */
export function yawFromHeading(heading: number): number {
  return Math.PI / 2 - heading;
}

export function playerLayer(options: PlayerLayerOptions = {}): PlayerLayer {
  const id = options.id ?? "you";
  let inputEnabled = options.inputEnabled ?? true;
  let state = initialMover(0, 0);
  let cam = initialFollowCamera(options.camera);
  let camOpts: Partial<FollowCameraOptions> = { ...options.camera };
  const bodyRadiusM = options.bodyRadiusM ?? 0.35;
  let parts: CharacterParts | null = null;
  let input: WorldInput | null = null;
  let animTime = 0;
  let movement = parcelMovement(1.6);
  /** The prop gate, or null in a world with no scatter layer. Resolved once, at build. */
  let blocked: ((x: number, y: number) => boolean) | null = null;
  let cameraObstacles: BoomObstacleLimit | undefined;
  let colliders: ColliderIndex | null = null;
  let contactWeight = 0;
  const contactTarget = new THREE.Vector3();
  let contactSide: -1 | 1 = 1;
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  return {
    name: "player",

    async build(ctx, signal) {
      // Which way a person is facing when they arrive, and how far down the camera looks: toward
      // the sea when there is one in sight, and the shipped heading otherwise. See spawnView.
      const view = spawnView(
        ctx.frame.patch,
        ctx.field,
        ctx.calibration.seaLevel,
        ctx.region.spawn.x,
        ctx.region.spawn.y,
        { ...initialFollowCamera(options.camera), pitch: 0.14, distance: 5.8, boom: 5.8 },
        { fovDegrees: ctx.camera.fov, horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG },
      );
      state = initialMover(ctx.region.spawnTile[0], ctx.region.spawnTile[1], view.heading);
      cam = view.camera;
      camOpts = { chestM: 1.6, ...options.camera, tileM: ctx.frame.tileM, nearM: ctx.camera.near };
      animTime = 0;
      movement = parcelMovement(ctx.frame.tileM);

      // The scatter layer builds before this one, so its colliders are ready. A world without it
      // keeps the old gate exactly: walkable ground, and nothing else.
      const obstacles = ctx.layer<ObstacleSource>("scatter");
      blocked =
        obstacles && typeof obstacles.blockedTile === "function"
          ? (x, y) => obstacles.blockedTile(x, y, bodyRadiusM)
          : null;

      const colliderIndex = obstacles?.colliders?.();
      colliders = colliderIndex ?? null;
      contactWeight = 0;
      cameraObstacles = colliderIndex ? (anchor, direction, wanted) => {
        const endX = anchor[0] + direction[0] * wanted, endZ = anchor[2] + direction[2] * wanted;
        const nearby = colliderIndex.querySegment([anchor[0], -anchor[2]], [endX, -endZ], .18);
        return cylinderBoomLimit(anchor, direction, wanted, nearby.map(c => ({
          x: c.x, z: -c.y, y: ctx.frame.heightAtTile(c.x / ctx.frame.tileM, -c.y / ctx.frame.tileM),
          radius: c.radiusM, height: c.heightM,
        })));
      } : undefined;

      const built = buildCharacter(id, true);
      built.root.name = "player";
      built.root.scale.setScalar(ctx.frame.tileM);
      ctx.frame.toScene(state.x, state.y, 0, tmp);
      built.root.position.copy(tmp);
      poseCharacter(built, { facing: state.facing, moving: false, animTime, bob: 0, lean: 0, carrying: false, activity: null });
      built.root.rotation.y = yawFromHeading(state.heading);

      // Nothing above awaited, but the contract is the contract: no scene mutation after abort.
      if (signal.aborted) {
        disposeParts(built);
        return;
      }
      ctx.scene.add(built.root);
      parts = built;
      input = createInput(ctx.renderer.domElement, { touch: options.touch });
      input.setEnabled(inputEnabled);
    },

    update(dt, ctx) {
      if (!parts) return;
      const frame = input?.read(cam.yaw);
      const move = inputEnabled && frame ? frame.move : NEUTRAL;
      state = stepMover(state, move, dt, ctx.frame.walkableTile, blocked ?? undefined, movement);

      const moving = state.state === "walk" || state.state === "run";
      const velocity = Math.hypot(state.vx, state.vy);
      const speed = velocity / movement.walk;
      const runBlend = THREE.MathUtils.clamp((velocity - movement.walk) / (movement.run - movement.walk), 0, 1);
      // Cadence and stride are paired: the stance foot retreats at the body's forward speed.
      if (moving) animTime += dt * (1 + runBlend * .7);
      ctx.frame.toScene(state.x, state.y, jumpHeightM(state), tmp);
      parts.root.position.copy(tmp);
      const yaw = yawFromHeading(state.heading);
      const footGround = (side: number) => {
        const foot = gaitFootTarget(animTime * 9 + (side > 0 ? Math.PI : 0), speed, runBlend);
        const x = state.x + Math.cos(yaw) * side * .087 + Math.sin(yaw) * foot.forward;
        const y = state.y - Math.sin(yaw) * side * .087 + Math.cos(yaw) * foot.forward;
        return (ctx.frame.heightAtTile(x, y) - ctx.frame.heightAtTile(state.x, state.y)) / ctx.frame.tileM;
      };
      poseCharacter(parts, { facing: state.facing, moving, animTime, bob: 0, lean: 0, carrying: false,
        activity: state.activity, speed, runBlend,
        airborne: state.jumpT >= 0, groundL: footGround(-1), groundR: footGround(1) });
      parts.root.rotation.y = yawFromHeading(state.heading);

      // A hand braces against a reachable solid when movement meets it. The target is on the
      // collider surface; the arm solver preserves both segment lengths through the contact.
      let contact = false;
      if (colliders && blocked && state.jumpT < 0 && Math.hypot(move.dx, move.dy) > 0 &&
          blocked(state.x + move.dx * .25, state.y + move.dy * .25)) {
        const [xm, ym] = ctx.frame.toLocalM(state.x, state.y);
        let best = Infinity;
        for (const c of colliders.queryCircle(xm, ym, .62)) {
          if (c.heightM < .6) continue;
          const dx=xm-c.x, dy=ym-c.y, d=Math.hypot(dx,dy), gap=d-c.radiusM;
          if (gap >= best || d < 1e-6) continue;
          const x=c.x+dx/d*(c.radiusM+.025), z=-c.y-dy/d*(c.radiusM+.025);
          const ground=ctx.frame.heightAtTile(c.x/ctx.frame.tileM,-c.y/ctx.frame.tileM);
          look.set(x,ground+Math.min(c.heightM*.8,.705*ctx.frame.tileM),z);
          const side: -1 | 1 = (x-tmp.x)*Math.cos(yaw)-(z-tmp.z)*Math.sin(yaw)<0 ? -1 : 1;
          if (reachCharacter(parts,side,look,0)) {
            best=gap; contactTarget.copy(look); contactSide=side; contact=true;
          }
        }
      }
      contactWeight += ((contact ? 1 : 0)-contactWeight)*(1-Math.exp(-12*dt));
      if (contactWeight > .01) reachCharacter(parts,contactSide,contactTarget,contactWeight);

      // The camera. The ground it must stay above is the ground the feet stand on: the sea sheet
      // counts, exactly as toScene clamps the feet to it.
      const ground = (x: number, y: number) => Math.max(0, ctx.frame.heightAtTile(x, y));
      const orbit = frame ?? { orbitDx: 0, orbitDy: 0, zoom: 0 };
      const result = stepFollowCamera(
        cam,
        { x: state.x, y: state.y, liftM: jumpHeightM(state) },
        { orbitDx: orbit.orbitDx, orbitDy: orbit.orbitDy, zoom: orbit.zoom },
        dt,
        ground,
        camOpts,
        cameraObstacles,
      );
      cam = result.state;
      ctx.camera.position.set(result.position[0], result.position[1], result.position[2]);
      ctx.camera.lookAt(look.set(result.lookAt[0], result.lookAt[1], result.lookAt[2]));
    },

    dispose() {
      input?.dispose();
      input = null;
      blocked = null;
      cameraObstacles = undefined;
      colliders = null;
      if (parts) {
        disposeParts(parts);
        parts = null;
      }
    },

    position() {
      return { x: state.x, y: state.y, liftM: jumpHeightM(state) };
    },
    /**
     * Put the body somewhere, in tiles. For tests and for a future tap-to-walk; it does not skip
     * the walkability check, so it can never place you in the sea, and it clears the velocity so
     * the mover does not keep the momentum of wherever you were.
     */
    setPosition(x: number, y: number) {
      state = { ...state, x, y, vx: 0, vy: 0 };
    },
    mover() {
      return state;
    },
    camera() {
      return cam;
    },
    setInputEnabled(enabled) {
      inputEnabled = enabled;
      input?.setEnabled(enabled);
    },
  };
}

/** The host disposes what it finds in the scene; a root removed first would slip past it. */
function disposeParts(p: CharacterParts) {
  p.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.dispose();
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  p.root.removeFromParent();
}
