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

import { buildCharacter, poseCharacter, type CharacterParts } from "../three/character";
import { initialMover, jumpHeightM, MOVER, stepMover, type MoveInput, type MoverState } from "./controller";
import {
  initialFollowCamera,
  stepFollowCamera,
  type FollowCameraOptions,
  type FollowCameraState,
} from "./followCamera";
import { createInput, type WorldInput } from "./input";
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
}

/**
 * What the player needs from whatever knows where the props stand: the scatter layer satisfies it
 * and is found by name, the way the reactions layer finds the campfire. It is structural rather
 * than imported so a world with no scatter is not a world with a missing dependency, it is a world
 * where nothing is in your way, which is what the demo was before W2-3.
 */
interface ObstacleSource extends WorldLayer {
  blockedTile(x: number, y: number, radiusM: number): boolean;
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
  /** The prop gate, or null in a world with no scatter layer. Resolved once, at build. */
  let blocked: ((x: number, y: number) => boolean) | null = null;
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  return {
    name: "player",

    async build(ctx, signal) {
      state = initialMover(ctx.region.spawnTile[0], ctx.region.spawnTile[1]);
      cam = initialFollowCamera(options.camera);
      camOpts = { ...options.camera, tileM: ctx.frame.tileM, nearM: ctx.camera.near };
      animTime = 0;

      // The scatter layer builds before this one, so its colliders are ready. A world without it
      // keeps the old gate exactly: walkable ground, and nothing else.
      const obstacles = ctx.layer<ObstacleSource>("scatter");
      blocked =
        obstacles && typeof obstacles.blockedTile === "function"
          ? (x, y) => obstacles.blockedTile(x, y, bodyRadiusM)
          : null;

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
      input = createInput(ctx.renderer.domElement);
      input.setEnabled(inputEnabled);
    },

    update(dt, ctx) {
      if (!parts) return;
      const frame = input?.read(cam.yaw);
      const move = inputEnabled && frame ? frame.move : NEUTRAL;
      state = stepMover(state, move, dt, ctx.frame.walkableTile, blocked ?? undefined);

      // The pose. A run must look like a run, not a walk played over more ground: the cycle
      // accumulates at the speed ratio, so legs at MOVER.RUN swing 1.6 times as fast.
      const moving = state.state === "walk" || state.state === "run";
      if (moving) animTime += dt * (Math.hypot(state.vx, state.vy) / MOVER.WALK);
      ctx.frame.toScene(state.x, state.y, jumpHeightM(state), tmp);
      parts.root.position.copy(tmp);
      poseCharacter(parts, { facing: state.facing, moving, animTime, bob: 0, lean: 0, carrying: false, activity: null });
      parts.root.rotation.y = yawFromHeading(state.heading);

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
      );
      cam = result.state;
      ctx.camera.position.set(result.position[0], result.position[1], result.position[2]);
      ctx.camera.lookAt(look.set(result.lookAt[0], result.lookAt[1], result.lookAt[2]));
    },

    dispose() {
      input?.dispose();
      input = null;
      blocked = null;
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
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  p.root.removeFromParent();
}
