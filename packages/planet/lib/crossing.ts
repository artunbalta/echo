/**
 * From one parcel to the next across the water (DECISIONS C57).
 *
 * ONE PLANET, MANY FRAMES. Every parcel is drawn in its own tangent frame (`scene.ts`), centred on its
 * own cell. The ground is the same ground in all of them — one height field on one sphere — so a point
 * on the sea has an exact place in the next parcel's frame too: out of this frame to the sphere, and
 * into that one (`carry`). That is what lets a raft go from one parcel's world into the next without
 * a seam. The world it leaves and the world it enters agree on where the raft is, which way it is
 * pointing and how fast it is going, to well under a centimetre.
 *
 * WHEN. A raft is in the next parcel once it is past the edge of this one by `CROSSING.intoM`. That
 * is far enough that rowing along the line does not build the next world and throw it away again.
 *
 * THE TRAVEL STAND, RE-DERIVED (C27). The old archipelago called a sail "far" past 24 ocean tiles,
 * 38 m. That distance means nothing here, where a parcel is a kilometre and a half across. So the stand
 * is said in parcels instead, and both of its sides together (⚑9's rule, which C27 applies to this
 * pair):
 *
 * - **far**: the stranger comes ashore in a parcel other than the one they launched from;
 * - **near**: they come back ashore in the one they left.
 *
 * A trip under `CROSSING.tripM` is not a trip at all.
 *
 * Pure.
 */

import { getResolution, gridDistance, latLngToCell } from "h3-js";

import { vec3ToLatLng, type Vec3 } from "./geo.js";
import type { TangentPatch } from "./scene.js";
import { isLand, type Calibration, type TerrainField } from "./terrain.js";

export const CROSSING = {
  /** Metres past the edge of the parcel before the next one is built. */
  intoM: 40,
  /** A launch and a landing closer than this are not a trip. */
  tripM: 30,
  /** How near the water a landing must be: a raft is dragged up a beach, not carried inland. */
  shoreM: 12,
} as const;

/** The parcel a point of this frame lies in, at the frame's own resolution. */
export function cellAtLocal(patch: TangentPatch, x: number, y: number): string {
  const [lat, lng] = vec3ToLatLng(...patch.toDirection(x, y));
  return latLngToCell(lat, lng, getResolution(patch.cell));
}

/** How far outside the frame's own parcel a point is, metres; 0 inside it. */
export function outsideBy(patch: TangentPatch, x: number, y: number): number {
  const b = patch.boundary;
  if (b.length < 3) return 0;
  let inside = true;
  let sign = 0;
  let best = Infinity;
  for (let i = 0; i < b.length; i++) {
    const [ax, ay] = b[i]!;
    const [bx, by] = b[(i + 1) % b.length]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) inside = false;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * k), y - (ay + dy * k)));
  }
  return inside ? 0 : best;
}

export interface Carried {
  x: number;
  y: number;
  /** The direction of travel, radians from east toward north, in the new frame. */
  angle: number;
  /** How much the new frame's east is turned from the old one's at this point, radians. */
  turn: number;
}

/**
 * A point and a direction in one frame, in another frame: through the sphere. `angle` is radians from
 * east toward north in the frame it is given in.
 */
export function carry(from: TangentPatch, to: TangentPatch, x: number, y: number, angle: number): Carried | null {
  const p = to.toLocal(from.toDirection(x, y));
  const q = to.toLocal(from.toDirection(x + Math.cos(angle), y + Math.sin(angle)));
  if (!p || !q) return null;
  const next = Math.atan2(q[1] - p[1], q[0] - p[0]);
  let turn = next - angle;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return { x: p[0], y: p[1], angle: next, turn };
}

/** Metres along the sphere between two points given as directions. */
export function sphereDistanceM(radiusM: number, a: Vec3, b: Vec3): number {
  // From the chord, not acos of the dot product, which loses a millimetre at the scale of a raft.
  const chord = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return 2 * Math.asin(Math.min(1, chord / 2)) * radiusM;
}

/** Can a raft be dragged up here: dry ground with open water within `CROSSING.shoreM`. */
export function onShore(patch: TangentPatch, field: TerrainField, calibration: Calibration, x: number, y: number): boolean {
  const land = (px: number, py: number) => isLand(field, calibration.seaLevel, patch.toDirection(px, py));
  if (!land(x, y)) return false;
  for (let r = 3; r <= CROSSING.shoreM; r += 3) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (!land(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
  }
  return false;
}

export interface TripVerdict {
  /** Far: ashore in another parcel; near: back in the one launched from; null: not a trip. */
  side: "far" | "near" | null;
  /** How many parcels apart the launch and the landing are (0 for near). */
  rings: number;
}

/** The travel stand's verdict on a raft trip, from where it was launched to where it came ashore. */
export function tripVerdict(launchCell: string, landCell: string, distanceM: number): TripVerdict {
  if (distanceM < CROSSING.tripM && launchCell === landCell) return { side: null, rings: 0 };
  if (launchCell === landCell) return { side: "near", rings: 0 };
  return { side: "far", rings: gridDistance(launchCell, landCell) };
}
