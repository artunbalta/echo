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
import type { ActivityKind } from "../WorldCore";
import { raftSpeed } from "../../lib/raft";
import { boatForm, raftForm, sailForm } from "./villageGeometry";
import { facingFromHeading, initialMover, jumpHeightM, parcelMovement, stepMover, type MoveInput, type MoverState } from "./controller";
import {
  initialFollowCamera,
  stepFollowCamera,
  type FollowCameraOptions,
  type FollowCameraState,
  type BoomObstacleLimit,
} from "./followCamera";
import { createInput, type WorldInput } from "./input";
import type { TouchControlHandle } from "./touchInput";
import { SPAWN_HORIZON_MARGIN_DEG, spawnView, yawBehindHeading } from "./spawnView";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { WeatherLayer } from "./weatherLayer";

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
  /**
   * Do an act (C45): the body takes a pose, turns to face the thing (tile coordinates), and stops
   * walking until `release`. Walking is how a person stops doing something, so the input is still
   * read: `wantsToMove` says when they have asked to go, and the act ends there.
   */
  perform(pose: ActivityKind, face: { x: number; y: number } | null): void;
  release(): void;
  wantsToMove(): boolean;
  /** Show something carried in the hands (C45). */
  setCarrying(on: boolean): void;
  /**
   * Into a boat (C45): the body sits in it at a tile position, facing `heading` (the boat's, in this
   * layer's convention), and moves on water only, at a rower's speed, until `ashore`.
   */
  board(at: { x: number; y: number }, heading: number, kind?: "boat" | "raft"): void;
  /** Out of the boat, onto the tile given. */
  ashore(at: { x: number; y: number }): void;
  aboard(): boolean;
  /** Aboard the stranger's own raft (C57), not a village boat: the one that can cross to other parcels. */
  onRaft(): boolean;
  /** Under sail: on the raft with Shift held (C57). */
  sailing(): boolean;
  /** Everything the next parcel's world needs to carry on as this body (C57), in this world's tiles. */
  handOff(): PlayerHandoff;
  /** Carry on as the body a hand-off describes, already in this world's tiles. */
  adopt(h: PlayerHandoff): void;
  /**
   * How many times a foot has come down since the page opened, as the gait draws it: a foot lands
   * each time the gait's phase passes a half turn (`gaitFootTarget`'s stance begins at 0.5 of the
   * cycle, and the two feet are half a cycle apart). The ears hear a step on each (C56).
   */
  footfalls(): number;
}

/** One body passed from one parcel's world to the next (C57). */
export interface PlayerHandoff {
  mover: MoverState;
  camera: FollowCameraState;
  boating: boolean;
  raft: boolean;
  /** The keys held down at the crossing: a sail held across the line stays up. */
  keys?: string[];
}

/** A rower's pace on open water, metres per second: slower than a walk, and it does not run. */
const ROW_MPS = 1.4;

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
  let acting: { pose: ActivityKind; heading: number | null } | null = null;
  let wants = false;
  let carrying = false;
  let boating = false;
  let rafting = false;
  let underSail = false;
  let boat: THREE.Mesh | null = null;
  let raft: THREE.Mesh | null = null;
  let sail: THREE.Mesh | null = null;
  let boatMovement = parcelMovement(1.6);

  return {
    name: "player",

    async build(ctx, signal) {
      // Which way a person is facing when they arrive, and how far down the camera looks: toward
      // the sea when there is one in sight, and the shipped heading otherwise. See spawnView.
      let view = spawnView(
        ctx.frame.patch,
        ctx.field,
        ctx.calibration.seaLevel,
        ctx.region.spawn.x,
        ctx.region.spawn.y,
        { ...initialFollowCamera(options.camera), pitch: 0.14, distance: 5.8, boom: 5.8 },
        { fovDegrees: ctx.camera.fov, horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG },
      );
      // On a settled parcel you arrive at the village's edge, and you face the village (C41). The
      // heading is in spawnView's own convention — atan2 of minus the north step against the east
      // step — so the camera that follows it is the one spawnView would have built for that heading.
      const facing = ctx.region.village?.plan.arrivalFacing;
      if (facing) {
        const heading = Math.atan2(-facing.y, facing.x);
        view = { ...view, heading, camera: { ...view.camera, yaw: yawBehindHeading(heading) } };
      }
      state = initialMover(ctx.region.spawnTile[0], ctx.region.spawnTile[1], view.heading);
      cam = view.camera;
      camOpts = { chestM: 1.6, ...options.camera, tileM: ctx.frame.tileM, nearM: ctx.camera.near };
      animTime = 0;
      movement = parcelMovement(ctx.frame.tileM);

      // The scatter layer builds before this one, so its colliders are ready. A world without it
      // keeps the old gate exactly: walkable ground, and nothing else.
      const obstacles = ctx.layer<ObstacleSource>("scatter");
      // The village's walls stop a body too (C41). Both are asked; either can say no.
      const gates = [obstacles, ctx.layer<ObstacleSource>("settlement")].filter(
        (o): o is ObstacleSource => !!o && typeof o.blockedTile === "function",
      );
      // People stop a body too (C46). The villagers layer is built after this one, so it is asked for
      // by name at each step rather than found now.
      const people = () => ctx.layer<ObstacleSource>("villagers");
      // And a market stall, on market day (C58): built after this layer too.
      const stall = () => ctx.layer<ObstacleSource>("market");
      blocked = (x, y) =>
        gates.some((g) => g.blockedTile(x, y, bodyRadiusM)) || (people()?.blockedTile(x, y, bodyRadiusM) ?? false) || (stall()?.blockedTile(x, y, bodyRadiusM) ?? false);

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
      // The boat a person can take out (C45): one hull, the villagers' own form, hidden until boarded.
      boat = new THREE.Mesh(boatForm(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      boat.name = "player:boat";
      boat.visible = false;
      boat.castShadow = true;
      ctx.scene.add(boat);
      // The stranger's own raft and its sail (C57), the same way: hidden until launched.
      const wood = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      raft = new THREE.Mesh(raftForm(), wood);
      raft.name = "player:raft";
      raft.visible = false;
      raft.castShadow = true;
      sail = new THREE.Mesh(sailForm(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      sail.name = "player:sail";
      sail.visible = false;
      raft.add(sail);
      ctx.scene.add(raft);
      boatMovement = { ...parcelMovement(ctx.frame.tileM), walk: ROW_MPS / ctx.frame.tileM, run: ROW_MPS / ctx.frame.tileM };
      input = createInput(ctx.renderer.domElement, { touch: options.touch });
      input.setEnabled(inputEnabled);
    },

    update(dt, ctx) {
      if (!parts) return;
      const frame = input?.read(cam.yaw);
      const asked = inputEnabled && frame ? frame.move : NEUTRAL;
      wants = Math.hypot(asked.dx, asked.dy) > 0.1 || asked.jump;
      // While acting the body holds its pose and the mover is told so; the ask is kept for wantsToMove.
      // In a boat the ground is the water: anything deep enough, inside the region, and no jumping.
      // A village boat is rowed and never runs; the raft is paddled, and Shift puts up its sail (C57).
      const move = acting ? { ...NEUTRAL, activity: acting.pose } : boating ? { ...asked, jump: false, run: rafting && asked.run } : asked;
      if (boating && rafting) {
        const wind = ctx.layer<WeatherLayer>("weather")?.weather()?.wind ?? 0.3;
        boatMovement = { ...boatMovement, walk: raftSpeed(wind, false) / ctx.frame.tileM, run: raftSpeed(wind, true) / ctx.frame.tileM };
        underSail = move.run && Math.hypot(move.dx, move.dy) > 0.1;
      } else underSail = false;
      if (boating) {
        const extent = ctx.region.extentM / ctx.frame.tileM;
        // Any water floats a small boat; a mooring in a hand's depth of it is still afloat.
        const water = (x: number, y: number) => ctx.frame.heightAtTile(x, y) < -0.02 && Math.hypot(x, y) < extent;
        state = stepMover(state, move, dt, water, undefined, boatMovement);
      } else {
        state = stepMover(state, move, dt, ctx.frame.walkableTile, blocked ?? undefined, movement);
      }
      if (acting && acting.heading !== null) state = { ...state, heading: acting.heading };

      const moving = state.state === "walk" || state.state === "run";
      const velocity = Math.hypot(state.vx, state.vy);
      const speed = velocity / movement.walk;
      const runBlend = THREE.MathUtils.clamp((velocity - movement.walk) / (movement.run - movement.walk), 0, 1);
      // Cadence and stride are paired: the stance foot retreats at the body's forward speed.
      if (moving) animTime += dt * (1 + runBlend * .7);
      ctx.frame.toScene(state.x, state.y, jumpHeightM(state), tmp);
      parts.root.position.copy(tmp);
      const hull = rafting ? raft : boat;
      if (boating && hull) {
        // The hull rides the sea sheet; the rower sits on its thwart, or on the raft's logs.
        const t = performance.now() / 1000;
        hull.position.set(tmp.x, (rafting ? 0.02 : 0.08) + Math.sin(t * 1.3) * 0.03, tmp.z);
        hull.rotation.set(rafting ? Math.sin(t * 0.9) * 0.025 : 0, -state.heading, rafting ? Math.sin(t * 1.1 + 1) * 0.02 : 0);
        parts.root.position.y = (rafting ? 0.3 : 0.32) + Math.sin(t * 1.3) * 0.03;
        if (sail) sail.visible = underSail;
      }
      const yaw = yawFromHeading(state.heading);
      const footGround = (side: number) => {
        const foot = gaitFootTarget(animTime * 9 + (side > 0 ? Math.PI : 0), speed, runBlend);
        const x = state.x + Math.cos(yaw) * side * .087 + Math.sin(yaw) * foot.forward;
        const y = state.y - Math.sin(yaw) * side * .087 + Math.cos(yaw) * foot.forward;
        return (ctx.frame.heightAtTile(x, y) - ctx.frame.heightAtTile(state.x, state.y)) / ctx.frame.tileM;
      };
      poseCharacter(parts, { facing: state.facing, moving: moving && !boating, animTime, bob: 0, lean: 0, carrying,
        activity: boating && !acting ? (moving && !underSail ? "row" : "sit") : state.activity, speed: boating ? 0 : speed, runBlend,
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

    perform(pose, face) {
      acting = { pose, heading: face ? Math.atan2(face.y - state.y, face.x - state.x) : null };
    },
    release() {
      acting = null;
    },
    wantsToMove: () => wants,
    setCarrying(on) {
      carrying = on;
    },
    board(at, heading, kind = "boat") {
      boating = true;
      rafting = kind === "raft";
      acting = null;
      state = { ...initialMover(at.x, at.y, heading) };
      if (boat) boat.visible = !rafting;
      if (raft) raft.visible = rafting;
    },
    ashore(at) {
      boating = false;
      rafting = false;
      underSail = false;
      state = { ...initialMover(at.x, at.y, state.heading) };
      if (boat) boat.visible = false;
      if (raft) raft.visible = false;
      if (sail) sail.visible = false;
    },
    aboard: () => boating,
    onRaft: () => boating && rafting,
    sailing: () => underSail,
    handOff: () => ({ mover: { ...state }, camera: { ...cam, anchor: cam.anchor ? [...cam.anchor] as typeof cam.anchor : null }, boating, raft: rafting, keys: input?.heldKeys() ?? [] }),
    adopt(h) {
      boating = h.boating;
      rafting = h.raft;
      acting = null;
      state = { ...h.mover, facing: facingFromHeading(h.mover.heading) };
      cam = { ...h.camera };
      if (boat) boat.visible = boating && !rafting;
      if (raft) raft.visible = boating && rafting;
      // Whatever the pointer did while this world was asleep is not a turn of the camera now; the
      // keys still down are still down.
      input?.read(cam.yaw);
      if (h.keys) input?.hold(h.keys);
    },

    dispose() {
      if (boat) {
        boat.geometry.dispose();
        (boat.material as THREE.Material).dispose();
        boat = null;
      }
      for (const m of [sail, raft]) {
        if (!m) continue;
        m.removeFromParent();
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      raft = null;
      sail = null;
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
    footfalls: () => Math.floor((animTime * 9) / Math.PI),
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
