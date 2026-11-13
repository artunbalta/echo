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

import { buildCharacter, gaitFootTarget, poseCharacter, reachCharacter, SIT_SEAT, type CharacterParts } from "../three/character";
import { gestureCharacter, handAim, handPoint, type GestureState } from "../three/gestures";
import { handThings, type Flight, type HandItem, type HandThings } from "./handThings";
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
import { DYES, type Gesture, type Look } from "@echo/planet";

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
  perform(pose: ActivityKind, face: { x: number; y: number } | null, act?: Act): void;
  release(): void;
  /** The seat the body is on, or null: whoever sits beside it keeps clear of it. */
  seat(): Seat | null;
  wantsToMove(): boolean;
  /**
   * The act the body is in the middle of (C98), for whoever owns the thing it is done to: how far in
   * it is, whether the thing is in the hand, where the hand is, and how far a thing that answers the
   * body has come. Null when nothing is being done.
   */
  act(): ActNow | null;
  /** Seconds the body has been AT the act: 0 while it is still stepping up to the thing. Null when not acting. */
  actSeconds(): number | null;
  /** How many things the body let go are still in the air (a ball thrown back, a stone skipping). */
  inFlight(): number;
  /** Show something carried in the hands (C45). */
  setCarrying(on: boolean): void;
  /** Whether something is in the hands: what you hold decides what you are reaching for (C59). */
  holding(): boolean;
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
  /** Dress the body as the stranger has dyed their clothes (C59). */
  setLook(look: Look): void;
  /**
   * How many times a foot has come down since the page opened, as the gait draws it: a foot lands
   * each time the gait's phase passes a half turn (`gaitFootTarget`'s stance begins at 0.5 of the
   * cycle, and the two feet are half a cycle apart). The ears hear a step on each (C56).
   */
  footfalls(): number;
}

/**
 * An act, as the body is asked to do it (C98): the registry's gesture, and what the body needs to know
 * of the thing to do it for real.
 */
export interface Act {
  gesture: Gesture;
  /** The act's length in seconds; 0 lasts until the person gets up. */
  holdS: number;
  /** The thing's ref and the verb's id, for the thing's own layer to recognise the act as its own. */
  ref: string;
  verb: string;
  /** What is seen in the hand while it is held, and what flies when it is let go; null for bare hands. */
  item: HandItem | null;
  /**
   * How near the thing the body stands to do it, metres: it steps up to there before it begins, and
   * the act's clock starts when it has. Null does it from where the body is.
   */
  standM: number | null;
  /** How high off the ground the thing is where a hand meets it, metres. 0 leaves it to the gesture. */
  upM: number;
  /** Where a thing let go is sent, tiles, when that is not the thing itself; `upM` is how high it arrives. */
  aim?: { x: number; y: number; upM?: number } | null;
  /** A thing its own layer draws again once it has landed (a moment's ball): nothing is left lying here. */
  owned?: boolean;
  /** Sitting down ON something: the place. The body walks up to it and is then on it, facing the way it faces. */
  seat?: Seat | null;
}

/** An act in the middle of being done. */
export interface ActNow {
  ref: string;
  verb: string;
  gesture: Gesture;
  /** Seconds at it, and 0 to 1 through it (0 for an act with no length). */
  t: number;
  k: number;
  /** False while the body is still stepping up to the thing. */
  arrived: boolean;
  grip: boolean;
  released: number;
  progress: number;
  /** Where the hand (or the middle of both) is, in the scene. Read it at once: it is the layer's own vector. */
  hand: THREE.Vector3;
}

/** How each gesture that lets a thing go sends it. */
const FLIGHT: Partial<Record<Gesture, Flight>> = { throw: "arc", snowball: "arc", tidy: "arc", roll: "roll", skip: "skip", drop: "fall", scatter: "spray", dig: "arc", weed: "arc", bail: "spray" };

/**
 * A place to sit that is a place (a bench's seat, a gap in the ring round a fire): the body is put ON
 * it, facing the way a sitter there faces, and stood up in front of it when it gets up. Tiles, and
 * this layer's heading (atan2 of the south step against the east step), as `perform`'s `face` is.
 */
export interface Seat {
  x: number;
  y: number;
  heading: number;
  /** The top of what is sat on, metres above the sea, or null for the ground (the pose's own drop). */
  topM: number | null;
  /** Where the body stands when it gets up: in front of the seat, on ground it can walk on. */
  up: { x: number; y: number };
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

/** The user's shirt as `buildCharacter` makes it, undyed. */
const SHIRT = 0xe9e7db;

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
  let acting: { pose: ActivityKind; heading: number | null; act: Act | null; target: { x: number; y: number } | null; seat: Seat | null; arrived: boolean; waited: number; t: number; released: number } | null = null;
  /** The gesture just let go of, eased out over a fifth of a second so the body does not snap upright. */
  let easing: { act: Act; t: number; ahead: number; weight: number } | null = null;
  let now: GestureState | null = null;
  let things: HandThings | null = null;
  const hand = new THREE.Vector3();
  const sendTo = new THREE.Vector3();
  let advance = 0;
  let wants = false;
  let carrying = false;
  let boating = false;
  let rafting = false;
  let underSail = false;
  let boat: THREE.Mesh | null = null;
  /** The shirt's materials, found once the body is built, and the look to dress it in. */
  let shirt: THREE.MeshLambertMaterial[] = [];
  let worn: Look = {};
  const dress = () => {
    for (const m of shirt) m.color.setHex(worn.shirt && DYES[worn.shirt] ? DYES[worn.shirt]!.hex : SHIRT);
  };
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
      // And a house of your own, and what is set down in it (C59).
      const home = () => ctx.layer<ObstacleSource & { clears(x: number, y: number): boolean }>("home");
      // Where the house has cleared the ground, the trees that stood there stop nothing.
      const cleared = (x: number, y: number) => home()?.clears(x * ctx.frame.tileM, -y * ctx.frame.tileM) ?? false;
      blocked = (x, y) =>
        gates.some((g) => !(g === obstacles && cleared(x, y)) && g.blockedTile(x, y, bodyRadiusM)) ||
        (people()?.blockedTile(x, y, bodyRadiusM) ?? false) ||
        (stall()?.blockedTile(x, y, bodyRadiusM) ?? false) ||
        (home()?.blockedTile(x, y, bodyRadiusM) ?? false);

      const colliderIndex = obstacles?.colliders?.();
      colliders = colliderIndex ?? null;
      contactWeight = 0;
      cameraObstacles = colliderIndex ? (anchor, direction, wanted) => {
        const endX = anchor[0] + direction[0] * wanted, endZ = anchor[2] + direction[2] * wanted;
        const nearby = colliderIndex.querySegment([anchor[0], -anchor[2]], [endX, -endZ], .18).filter((c) => !(ctx.layer<ObstacleSource & { clears(x: number, y: number): boolean }>("home")?.clears(c.x, c.y) ?? false));
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
      // The stranger's own shirt is the one material the rig colours for the user (`buildCharacter`).
      shirt = [];
      built.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (m && !Array.isArray(m) && m.color?.getHex() === SHIRT && !shirt.includes(m)) shirt.push(m);
      });
      dress();
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
      // What is in the hand and what leaves it (C98).
      things = handThings(ctx.frame.tileM / 1.6);
      ctx.scene.add(things.group);
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
      let move = acting ? { ...NEUTRAL, activity: acting.pose } : boating ? { ...asked, jump: false, run: rafting && asked.run } : asked;
      // An act begins by stepping up to the thing (C98): a hand that takes a jar has to be where the
      // jar is. The act's clock waits for the feet. A body that cannot get there (something in the
      // way, or a second and a half gone) does it from where it stands.
      if (acting?.act && acting.target && !acting.arrived) {
        const dx = acting.target.x - state.x;
        const dy = acting.target.y - state.y;
        const d = Math.hypot(dx, dy);
        // To a seat: up to it, and the last half step is sitting down on it.
        const want = acting.seat ? 0.45 / ctx.frame.tileM : acting.act.standM === null ? Infinity : acting.act.standM / ctx.frame.tileM;
        acting.waited += dt;
        const stuck = acting.waited > 0.35 && Math.hypot(state.vx, state.vy) < 0.05;
        if (d > want + 0.05 && acting.waited < 1.5 && !stuck && !boating) move = { dx: dx / d, dy: dy / d, run: false, jump: false, activity: null };
        else {
          acting.arrived = true;
          acting.t = 0;
          if (acting.seat) {
            // On it, facing the way a sitter there faces.
            state = { ...state, x: acting.seat.x, y: acting.seat.y, vx: 0, vy: 0, heading: acting.seat.heading };
            acting.heading = acting.seat.heading;
          } else if (d > 1e-4) acting.heading = Math.atan2(dy, dx);
        }
      } else if (acting?.act && acting.arrived) {
        acting.t += dt;
        // A gesture that goes somewhere (walking on, wading in) takes the body with it.
        if (advance > 0 && !boating) move = { dx: Math.cos(state.heading) * (advance / movement.walk), dy: Math.sin(state.heading) * (advance / movement.walk), run: false, jump: false, activity: null };
      }
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
      // On a seat the hips are on ITS top, wherever the ground under it is: the root is set so that
      // the seat the pose sits on (`SIT_SEAT`) is the seat that is there.
      if (acting?.seat && acting.arrived && acting.seat.topM !== null) tmp.y = acting.seat.topM - SIT_SEAT * ctx.frame.tileM;
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
      // An act with a gesture is moved by the gesture, over the standing body; the old stances are for an
      // act that has none (the boat's own rowing and sitting).
      const gestured = !!acting?.act;
      poseCharacter(parts, { facing: state.facing, moving: moving && !boating, animTime, bob: 0, lean: 0, carrying: carrying && !gestured,
        activity: boating && !acting ? (moving && !underSail ? "row" : "sit") : gestured ? null : state.activity, speed: boating ? 0 : speed, runBlend,
        airborne: state.jumpT >= 0, groundL: footGround(-1), groundR: footGround(1) });
      parts.root.rotation.y = yawFromHeading(state.heading);
      parts.body.position.x = 0;
      parts.body.position.z = 0;

      // ── the act itself (C98) ──
      now = null;
      advance = 0;
      if (acting?.act && acting.arrived && acting.target) {
        const a = acting.act;
        const ahead = Math.hypot(acting.target.x - state.x, acting.target.y - state.y);
        now = gestureCharacter(parts, a.gesture, { t: acting.t, holdS: a.holdS, ahead, side: 0, up: a.upM / ctx.frame.tileM, variant: a.verb, weight: Math.min(1, acting.t / 0.16), seated: acting.seat?.topM != null });
        advance = now.advance;
        handPoint(parts, now.twoHanded, hand);
        if (things) {
          if (now.grip && a.item) things.hold(a.item, hand, parts.root.rotation.y, handAim(parts, sendTo));
          // A rope from the hands to what is hauled; at the well, to the bucket coming up.
          if (a.gesture === "haul") things.rope(hand, ctx.frame.toScene(acting.target.x, acting.target.y, 0.35 * (ctx.frame.tileM / 1.6), sendTo));
          if (a.gesture === "draw-water") {
            const rim = Math.max(0.5, a.upM);
            const lift = rim - 1.4 * (1 - now.progress) + 0.14;
            ctx.frame.toScene(acting.target.x, acting.target.y, lift, sendTo);
            if (acting.t < a.holdS * 0.76) {
              things.hold("bucket", sendTo, 0);
              things.rope(hand, sendTo);
            }
          }
          // Each thing let go since the last frame goes where it was sent.
          const how = FLIGHT[a.gesture];
          while (acting.released < now.released) {
            acting.released++;
            if (!how) continue;
            const item: HandItem | null = a.gesture === "dig" ? "earth" : a.gesture === "weed" ? "weed" : a.gesture === "bail" ? "grain" : a.item;
            if (!item) continue;
            const reach = ctx.frame.tileM;
            // Where it goes: where the act says; failing that the thing itself, or for what is flung aside, aside.
            let tx = a.aim?.x ?? acting.target.x;
            let ty = a.aim?.y ?? acting.target.y;
            if (how === "skip") {
              tx = state.x + Math.cos(state.heading) * (7 / reach);
              ty = state.y + Math.sin(state.heading) * (7 / reach);
            } else if (a.gesture === "dig" || a.gesture === "weed" || a.gesture === "bail") {
              tx = state.x + Math.cos(state.heading - 1.9) * (0.9 / reach);
              ty = state.y + Math.sin(state.heading - 1.9) * (0.9 / reach);
            } else if (how === "spray" && !a.aim) {
              tx = state.x + Math.cos(state.heading) * (1.5 / reach);
              ty = state.y + Math.sin(state.heading) * (1.5 / reach);
            }
            const water = ctx.frame.heightAtTile(tx, ty) < -0.02;
            ctx.frame.toScene(tx, ty, a.aim?.upM ?? (how === "roll" ? 0.12 * (reach / 1.6) : 0.03), sendTo);
            things.fly(item, hand, sendTo, how, water, a.owned ? 0 : 0.7);
          }
        }
      } else if (easing) {
        easing.weight -= dt / 0.2;
        if (easing.weight <= 0) easing = null;
        else gestureCharacter(parts, easing.act.gesture, { t: easing.t, holdS: easing.act.holdS, ahead: easing.ahead, side: 0, up: easing.act.upM / ctx.frame.tileM, variant: easing.act.verb, weight: easing.weight, seated: easing.act.seat?.topM != null });
      }
      things?.update(dt);

      // A hand braces against a reachable solid when movement meets it. The target is on the
      // collider surface; the arm solver preserves both segment lengths through the contact.
      let contact = false;
      if (colliders && blocked && !gestured && !easing && state.jumpT < 0 && Math.hypot(move.dx, move.dy) > 0 &&
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
      if (contactWeight > .01 && !gestured && !easing) reachCharacter(parts,contactSide,contactTarget,contactWeight);

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

    perform(pose, face, act) {
      easing = null;
      // Sitting down on something is going to it: the body walks to the seat, and is then on it.
      const seat = act?.seat ?? null;
      const target = seat ? { x: seat.x, y: seat.y } : face;
      acting = { pose, heading: target ? Math.atan2(target.y - state.y, target.x - state.x) : null, act: act ?? null, target, seat, arrived: !act || !target || (!seat && act.standM === null), waited: 0, t: 0, released: 0 };
    },
    release() {
      if (acting?.act && acting.arrived && acting.target) easing = { act: acting.act, t: acting.t, ahead: Math.hypot(acting.target.x - state.x, acting.target.y - state.y), weight: 1 };
      // Up off a seat is onto your feet in front of it, not inside the plank.
      if (acting?.seat && acting.arrived) state = { ...state, x: acting.seat.up.x, y: acting.seat.up.y, vx: 0, vy: 0 };
      acting = null;
      now = null;
    },
    seat: () => (acting?.arrived ? acting.seat : null),
    wantsToMove: () => wants,
    act() {
      const a = acting?.act;
      if (!acting || !a) return null;
      return { ref: a.ref, verb: a.verb, gesture: a.gesture, t: acting.t, k: a.holdS > 0 ? Math.min(1, acting.t / a.holdS) : 0, arrived: acting.arrived, grip: now?.grip ?? false, released: now?.released ?? 0, progress: now?.progress ?? 0, hand };
    },
    actSeconds: () => (acting ? (acting.act ? (acting.arrived ? acting.t : 0) : null) : null),
    inFlight: () => things?.flying() ?? 0,
    setCarrying(on) {
      carrying = on;
    },
    holding: () => carrying,
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
      things?.dispose();
      things = null;
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
    setLook(next) {
      worn = { ...next };
      dress();
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
