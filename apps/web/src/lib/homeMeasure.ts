/**
 * What the echo is told of a house of your own (DECISIONS C59). No ML change (C7):
 *
 * - **Building**: `build_home`, F6, with the time worked as `dwell_ms` at a `structure`. ingest.py's
 *   dwell branch reads that as `ts_build`, the share of time spent building, which is what it is.
 * - **Staking a site**: `stake_home`, F6, unrouted: the label embedding only.
 * - **Customising** (the catalogue's J1): `customize_home` for a door or walls painted,
 *   `customize_self` for a shirt dyed. Unrouted, because nothing anchored reads J1. Each one costs a
 *   dye, which is the catalogue's "cost-weight it".
 * - **Arranging** (J5): read off the whole room when the stranger steps out after setting things
 *   down, never per thing. An orderly room is `stack_tidy` taken, and a room left as things fell is
 *   `stack_tidy` refused. That is ingest.py's own handler for ordering objects as against leaving
 *   them scattered: persistence and edits on the one side, none on the other. A room in between says
 *   nothing either way, so nothing is sent.
 *
 * Pure.
 */
import { ARRANGEMENT, orderliness, type Placed } from "@echo/planet";
import type { EmitActionOptions } from "@/game/world/measure";

type Measured = { action: string; opts: EmitActionOptions };
const quiet = { stakes: "low", public_or_private: "private", counterpart_status: "none" } as const;

/** One act on a house, as the echo hears it. */
export function homeMeasurement(op: "stake" | "build" | "paint" | "dress", heldMs = 0): Measured {
  switch (op) {
    case "stake":
      return { action: "stake_home", opts: { cue: "F6", channel: "F", polarity: "take", raw: {}, target: { id: "home", kind: "structure" }, contextOverride: quiet } };
    case "build":
      return { action: "build_home", opts: { cue: "F6", channel: "F", polarity: "take", raw: { dwell_ms: Math.round(heldMs) }, target: { id: "structure", kind: "structure" }, contextOverride: quiet } };
    case "paint":
      return { action: "customize_home", opts: { cue: "J1", channel: "J", polarity: "take", raw: {}, target: { id: "home", kind: "structure" }, contextOverride: quiet } };
    case "dress":
      return { action: "customize_self", opts: { cue: "J1", channel: "J", polarity: "take", raw: {}, target: { id: "self", kind: "self" }, contextOverride: quiet } };
  }
}

/** The room, read when the stranger steps out after arranging it: orderly, as things fell, or nothing. */
export function arrangementMeasurement(items: readonly Placed[]): Measured | null {
  const o = orderliness(items);
  if (o === null || (o > ARRANGEMENT.organic && o < ARRANGEMENT.orderly)) return null;
  const orderly = o >= ARRANGEMENT.orderly;
  return {
    action: "stack_tidy",
    opts: {
      cue: "J5",
      channel: "J",
      polarity: orderly ? "take" : "refuse",
      raw: { orderliness: Math.round(o * 100) / 100, items: items.length },
      target: { id: "home", kind: "structure" },
      contextOverride: quiet,
    },
  };
}
