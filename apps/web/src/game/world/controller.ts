/**
 * The character controller contract (plan §4).
 *
 * Three things are decided here and nowhere else:
 *
 *   1. The state machine: idle, walk, run, jump, turn, activity. What each means, and when one
 *      becomes another. The rig poses from `state`; the sampler reads position; neither invents
 *      a state of its own.
 *
 *   2. The frame. Gameplay is (x, y) in TILES on a flat plane, exactly as WorldCore has it: x east,
 *      y SOUTH (three's z). Tile (0, 0) is the anchor cell's centre. The planet is in local metres
 *      east and NORTH of the same centre, so the conversion flips y and scales by TILE_M. Height is
 *      never an input to movement; it is read for the rig's feet and the camera, nothing else.
 *
 *   3. What blocks. A step is refused only where `walkable` says so, per axis, so you slide along
 *      a shoreline instead of sticking to it, as in WorldCore.stepLocal and WorldRoom.integrate.
 *      Walkable means land (decision Q10): no slope rule, no grade scaling.
 *
 * The mover is a pure function of (state, input, dt, walkable), so it is unit tested in node and
 * the client and any future server integrator can share it byte for byte.
 */

import { TILE_M, WORLD, type EntitySnapshot, type Facing } from "@echo/shared";
import type { ActivityKind } from "../WorldCore";

export type MoveState = "idle" | "walk" | "run" | "jump" | "turn" | "activity";

/** What the player wants this frame. Direction is already in TILE space; the camera resolved it. */
export interface MoveInput {
  /** Desired direction east, -1..1. */
  dx: number;
  /** Desired direction south, -1..1. */
  dy: number;
  run: boolean;
  /** Held or pressed this frame; the mover latches the rising edge itself. */
  jump: boolean;
  /** The activity the loop has put the body into, or null. */
  activity: ActivityKind | null;
}

export interface MoverState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, atan2(vy, vx) in tile space; 0 faces east. Continuous, client side only. */
  heading: number;
  /** The 4-way facing the wire speaks. Derived from heading, never the other way round. */
  facing: Facing;
  state: MoveState;
  /** Seconds since the jump began, or -1 when not jumping. */
  jumpT: number;
  /** Set on the frame the jump key rose, so a held key does not chain jumps. */
  jumpHeld: boolean;
  activity: ActivityKind | null;
}

export const MOVER = {
  /** Tiles per second. The anchoring quantum: MOVE_SPEED is what the locomotion sampler expects. */
  WALK: WORLD.MOVE_SPEED,
  /**
   * Tiles per second when running. Above MOVE_SPEED on purpose, and flagged ⚑: the sampler's
   * speedVar is normalised by MOVE_SPEED and clips at 1, so a run is a different locomotion regime
   * from the one W was anchored on. Recorded in known-gaps by W5-5, not hidden here.
   */
  RUN: WORLD.MOVE_SPEED * 1.6,
  /** Tiles per second per second, toward the desired velocity. */
  ACCEL: 28,
  /** Tiles per second per second, when the stick is released. */
  DECEL: 36,
  /** Radians per second the heading turns toward the velocity. */
  TURN_RATE: 12,
  /** Below this speed the body is still. */
  STILL: 0.05,
  /** A heading change above this while still is a turn in place. */
  TURN_THRESHOLD: 0.6,
  /** Seconds a jump lasts. The jump is cosmetic: (x, y) keeps integrating. */
  JUMP_S: 0.45,
  /** Peak of the cosmetic jump, metres, for the rig and the camera. */
  JUMP_HEIGHT_M: 0.6,
} as const;

export function initialMover(x: number, y: number, heading = Math.PI / 2): MoverState {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    heading,
    facing: facingFromHeading(heading),
    state: "idle",
    jumpT: -1,
    jumpHeld: false,
    activity: null,
  };
}

/** The 4-way facing nearest a heading. 0 = east, π/2 = south (tile y grows south). */
export function facingFromHeading(heading: number): Facing {
  const a = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) return "right";
  if (a < (3 * Math.PI) / 4) return "down";
  if (a < (5 * Math.PI) / 4) return "left";
  return "up";
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * One step. Pure. `walkable` is asked in tiles and answers for the whole tile position, so it is
 * the caller's job to convert to the planet's metres (see tileToLocalM) and apply the region bound.
 *
 * `blocked` is the OPTIONAL second gate, and it is optional on purpose. Walkability is a property
 * of the GROUND and both sides of the wire agree about it: `WorldRoom.integrate` runs the same
 * separate-axis slide against the same land test, and this mover has to match it to the tile.
 * Props are not ground. They exist only where a client has built a scatter layer, the server has
 * never heard of them, and a mover that consulted them unconditionally would drift from the
 * authority the first time a player walked into a tree. So the default is no obstacles, which is
 * byte for byte the behaviour this function had before props existed, and a client that has a
 * scatter layer passes its collider query in. Same slide, one more predicate.
 */
export function stepMover(
  s: MoverState,
  input: MoveInput,
  dt: number,
  walkable: (x: number, y: number) => boolean,
  blocked?: (x: number, y: number) => boolean,
): MoverState {
  const step = Math.max(0, Math.min(0.1, dt));
  const len = Math.hypot(input.dx, input.dy);
  const wantSpeed = len > 0 && !input.activity ? (input.run ? MOVER.RUN : MOVER.WALK) : 0;
  const ux = len > 0 ? input.dx / len : 0;
  const uy = len > 0 ? input.dy / len : 0;

  // Accelerate toward the wanted velocity, or brake toward rest.
  const rate = wantSpeed > 0 ? MOVER.ACCEL : MOVER.DECEL;
  let vx = s.vx;
  let vy = s.vy;
  const tx = ux * wantSpeed;
  const ty = uy * wantSpeed;
  const ddx = tx - vx;
  const ddy = ty - vy;
  const dlen = Math.hypot(ddx, ddy);
  const maxDelta = rate * step;
  if (dlen <= maxDelta) {
    vx = tx;
    vy = ty;
  } else {
    vx += (ddx / dlen) * maxDelta;
    vy += (ddy / dlen) * maxDelta;
  }

  // Separate-axis slide: X against the old Y, then Y against the new X. The order WorldCore and
  // WorldRoom use, so a future server integrator agrees to the tile. A prop refuses an axis the
  // same way a shoreline does, which is what makes you slide along a tree rather than stick to it.
  const free = blocked ? (x: number, y: number) => walkable(x, y) && !blocked(x, y) : walkable;
  let x = s.x;
  let y = s.y;
  const nx = x + vx * step;
  if (free(nx, y)) x = nx;
  else vx = 0;
  const ny = y + vy * step;
  if (free(x, ny)) y = ny;
  else vy = 0;

  const speed = Math.hypot(vx, vy);
  const moving = speed > MOVER.STILL;

  // Heading follows the velocity, eased. When still it holds, and the wanted direction alone can
  // turn it (a turn in place).
  let heading = s.heading;
  let turned = 0;
  const target = moving ? Math.atan2(vy, vx) : len > 0 ? Math.atan2(uy, ux) : heading;
  const delta = wrapAngle(target - heading);
  const maxTurn = MOVER.TURN_RATE * step;
  const applied = Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn;
  heading = wrapAngle(heading + applied);
  turned = Math.abs(delta);

  // Jump: rising edge only; integration never pauses (the jump is a visual on the rig).
  let jumpT = s.jumpT;
  let jumpHeld = input.jump;
  if (jumpT >= 0) {
    jumpT += step;
    if (jumpT >= MOVER.JUMP_S) jumpT = -1;
  } else if (input.jump && !s.jumpHeld && !input.activity) {
    jumpT = 0;
  }
  if (!input.jump) jumpHeld = false;

  const state = nextState({ moving, running: input.run && moving && speed > MOVER.WALK + 0.01, jumping: jumpT >= 0, activity: input.activity, turned });

  return {
    x,
    y,
    vx,
    vy,
    heading,
    facing: facingFromHeading(heading),
    state,
    jumpT,
    jumpHeld,
    activity: input.activity,
  };
}

export interface StateCues {
  moving: boolean;
  running: boolean;
  jumping: boolean;
  activity: ActivityKind | null;
  /** Radians of heading change asked for this frame. */
  turned: number;
}

/** The state machine, as a table. Activity beats everything; a jump beats locomotion. */
export function nextState(c: StateCues): MoveState {
  if (c.activity) return "activity";
  if (c.jumping) return "jump";
  if (c.moving) return c.running ? "run" : "walk";
  if (c.turned > MOVER.TURN_THRESHOLD) return "turn";
  return "idle";
}

/** The cosmetic jump's height above the ground this frame, metres. Zero when not jumping. */
export function jumpHeightM(s: MoverState): number {
  if (s.jumpT < 0) return 0;
  const t = s.jumpT / MOVER.JUMP_S;
  return 4 * MOVER.JUMP_HEIGHT_M * t * (1 - t);
}

// ── the frame ───────────────────────────────────────────────────────────────────

/** Tile (x east, y south) to planet-local metres (east, north), on the anchor patch. */
export function tileToLocalM(x: number, y: number, tileM = TILE_M): [number, number] {
  return [x * tileM, -y * tileM];
}

/** Planet-local metres (east, north) to tile (x east, y south). */
export function localMToTile(xm: number, ym: number, tileM = TILE_M): [number, number] {
  return [xm / tileM, -ym / tileM];
}

/**
 * A polygon given in tiles from a spawn, as planet-local metres. The y axis flips, and this is the
 * one place it flips for a polygon.
 *
 * It lives here rather than beside either of its two callers because it had two of them and grew a
 * second copy: stations.ts owns the shapes a table of stations asks for and scatterLayer.ts owns
 * the parcel's, and because the exclusion type flows from the layer to the stations, the layer
 * could not import back without a cycle and quietly wrote its own. A duplicated sign flip is the
 * exact failure stations.ts's header warns about, and it is invisible: the mirror image of a
 * footprint excludes real ground and every test stays green. controller.ts already owns
 * tileToLocalM, so it is the seam both sides can reach.
 */
export function footprintToLocalM(
  origin: { x: number; y: number },
  tiles: ReadonlyArray<readonly [number, number]>,
  tileM = TILE_M,
): Array<[number, number]> {
  return tiles.map(([dx, dy]) => {
    const [xm, ym] = tileToLocalM(dx, dy, tileM);
    return [origin.x + xm, origin.y + ym] as [number, number];
  });
}

// ── the host the activities depend on ───────────────────────────────────────────

/**
 * What an activity controller (flow1Beats, flow5Probes) may ask of whatever is drawing the world.
 * ThreeWorld satisfies it structurally today; PlanetWorld's loop layer satisfies it on the planet.
 * The activities are re-pointed at this interface (W4-1) so they no longer name a renderer.
 */
export interface FlowHost {
  getSelfTile(): { x: number; y: number };
  setSelfActivityState(
    kind: ActivityKind | null,
    opts?: { carrying?: boolean; intensity?: number; owner?: string },
  ): void;
  addEntity(snap: EntitySnapshot): void;
  removeEntity(id: string): void;
  setEntitySprite(id: string, spriteUrl: string): void;
  setEntityDisplayHeight(id: string, px: number): void;
}
