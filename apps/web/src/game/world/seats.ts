/**
 * Where a body that sits down is put: ON the seat, facing the way a sitter there faces, at the height
 * the seat is. One place for it, because it was three: the stranger sat wherever they stood facing the
 * thing, a moment's sitter was set in front of the bench turned along it, and the old on their seats
 * were pushed off them by the stranger coming near.
 *
 * A bench is `BENCH` (@echo/planet): two seats of the village's own, and room beside them. Everything
 * here is in the planet's local metres (east, north) and its own heading, as the plan is; `toSeat`
 * turns a place into the player layer's tiles.
 */
import { BENCH, alongBench, benchPlace, benchSeat, type VillagePlan } from "@echo/planet";

import type { MomentsLayer } from "./momentsLayer";
import type { LayerContext, WorldFrame } from "./PlanetWorld";
import type { PlayerLayer, Seat } from "./playerLayer";
import type { VillagersLayer } from "./villagersLayer";

/** A place to sit. `topM` is the top of what is sat on, metres above the sea; null is the ground. */
export interface SeatAt {
  x: number;
  y: number;
  heading: number;
  topM: number | null;
}

/** How far in front of a seat a body stands when it gets up, metres. */
const STAND_UP_M = 0.55;

/** Who is on a bench now, as metres along it, from where people are sitting. */
export function takenOn(b: VillagePlan["benches"][number], sitters: readonly { x: number; y: number }[]): number[] {
  const out: number[] = [];
  for (const p of sitters) {
    const a = alongBench(b, p);
    if (a.off < 0.45 && Math.abs(a.along) < BENCH.lengthM / 2 + 0.3) out.push(a.along);
  }
  return out;
}

/** A place on bench `i`, `along` it: facing out, its top where the mesh has it (level, at the bench's middle). */
export function benchSeatAt(frame: WorldFrame, plan: VillagePlan, i: number, along: number): SeatAt {
  const b = plan.benches[i]!;
  const [tx, ty] = frame.fromLocalM(b.x, b.y);
  return { ...benchSeat(plan, b, along), topM: Math.max(0, frame.heightAtTile(tx, ty)) + BENCH.seatTopM };
}

/** A place as the player layer takes it: tiles, its heading, and where to stand up from it. */
export function toSeat(frame: WorldFrame, s: SeatAt): Seat {
  const [x, y] = frame.fromLocalM(s.x, s.y);
  const [ux, uy] = frame.fromLocalM(s.x + Math.cos(s.heading) * STAND_UP_M, s.y + Math.sin(s.heading) * STAND_UP_M);
  // Off a bench, onto the ground in front of it; off the ground, where one sat.
  const up = s.topM !== null && frame.walkableTile(ux, uy) ? { x: ux, y: uy } : { x, y };
  // A local heading (north up) is minus the player's (south down): see `yawFromHeading`.
  return { x, y, heading: -s.heading, topM: s.topM, up };
}

/**
 * What a sitter leans on: nothing to sit ON (no top anyone measured), so one sits down by it on the
 * ground with the back to it, looking out. Facing it, as every act faces its thing, was sitting with
 * the knees against a rock and the eyes on a trunk.
 */
const LEANT_ON = new Set(["conifer", "broadleaf", "buttress-tree", "canopy-palm", "acacia", "fallen-log", "boulder", "lichen-rock", "driftwood", "shore-rock", "ruin"]);

/**
 * Where sitting down at a thing puts the stranger, or null for where they stand (the sand, the moss).
 * A moment says where its own place is (`seatFor`: beside them, the far end, the gap by the fire); a
 * bench gives one of its two seats if one is free, the nearer first, or the nearest room on the plank;
 * a tree, a rock or a log is leant on, from where one stands.
 */
export function seatOf(ctx: LayerContext, thing: { ref: string; kind: string; x: number; y: number }, verbId: string): Seat | null {
  const moments = ctx.layer<MomentsLayer>("moments");
  if (thing.ref.startsWith("moment:")) {
    const s = moments?.seatFor(thing.ref, verbId) ?? null;
    return s && toSeat(ctx.frame, s);
  }
  const plan = ctx.region.village?.plan;
  const player = ctx.layer<PlayerLayer>("player");
  if (LEANT_ON.has(thing.kind) && player) {
    const at = player.position();
    const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
    if (Math.hypot(mx - thing.x, my - thing.y) < 0.05) return null;
    return toSeat(ctx.frame, { x: mx, y: my, heading: Math.atan2(my - thing.y, mx - thing.x), topM: null });
  }
  if (thing.kind !== "bench" || !plan || !player) return null;
  const i = Number(thing.ref.split(":")[1]);
  const b = plan.benches[i];
  if (!b) return null;
  const taken = takenOn(b, [...(ctx.layer<VillagersLayer>("villagers")?.seated() ?? []), ...(moments?.seated() ?? [])]);
  const at = player.position();
  const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
  const me = alongBench(b, { x: mx, y: my }).along;
  const own = [...BENCH.seats].sort((p, q) => Math.abs(p - me) - Math.abs(q - me)).find((a) => benchPlace(taken, a) === a);
  const along = own ?? benchPlace(taken, me);
  return along === null ? null : toSeat(ctx.frame, benchSeatAt(ctx.frame, plan, i, along));
}
