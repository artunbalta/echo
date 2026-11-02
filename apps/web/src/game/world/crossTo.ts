/**
 * One body carried from one parcel's world into the next (DECISIONS C57).
 *
 * The two worlds are drawn in two tangent frames, each centred on its own cell (`crossing.ts`). The
 * body's place, its heading, its velocity and the camera behind it are all carried through the
 * sphere into the new frame. So the first frame drawn in the new world shows what the last frame of
 * the old one showed: the same water, from the same eye, at the same speed.
 *
 * Conventions, all of them this directory's:
 *
 * - tiles run x east, y SOUTH, and the mover's heading is atan2(south, east) in tiles;
 * - local metres run x east, y NORTH, so a heading h is the local angle −h;
 * - three's scene is x east, z SOUTH, so a scene point (x, y, z) is local (x, −z) at height y;
 * - the follow camera's yaw goes the other way to the heading (`yawBehindHeading`). A frame that
 *   turns the local axes by `turn` turns the heading by −turn and the yaw by +turn.
 *
 * Pure, given the two frames.
 */
import { carry } from "@echo/planet";

import type { WorldFrame } from "./PlanetWorld";
import type { PlayerHandoff } from "./playerLayer";

type Frame = Pick<WorldFrame, "patch" | "tileM" | "toLocalM" | "fromLocalM">;

export function carryHandoff(h: PlayerHandoff, from: Frame, to: Frame): PlayerHandoff | null {
  const m = h.mover;
  const [xm, ym] = from.toLocalM(m.x, m.y);
  const c = carry(from.patch, to.patch, xm, ym, -m.heading);
  if (!c) return null;
  const [x, y] = to.fromLocalM(c.x, c.y);
  // The velocity, tiles a second → local metres a second, turned with the frame, and back.
  const vxl = m.vx * from.tileM;
  const vyl = -m.vy * from.tileM;
  const cos = Math.cos(c.turn);
  const sin = Math.sin(c.turn);
  const vx = (vxl * cos - vyl * sin) / to.tileM;
  const vy = -(vxl * sin + vyl * cos) / to.tileM;
  // The camera's sprung look-at point, a scene point, carried the same way.
  let anchor = h.camera.anchor;
  if (anchor) {
    const a = carry(from.patch, to.patch, anchor[0], -anchor[2], 0);
    anchor = a ? [a.x, anchor[1], -a.y] : null;
  }
  return {
    ...h,
    mover: { ...m, x, y, vx, vy, heading: -c.angle },
    camera: { ...h.camera, yaw: h.camera.yaw + c.turn, anchor },
  };
}
