/**
 * What the echo is told of a raft trip (DECISIONS C57).
 *
 * The travel stand, said in parcels (`crossing.ts`), and sent under the labels ingest.py already
 * routes by name. No ML change (C7):
 *
 * - **far** (ashore in another parcel): `travel_far`, the catalogue's A11, with the server's
 *   `dest_occupants`. ingest.py reads 0 as a bare shore, the purest novelty read, and a peopled one
 *   as novelty shared with sociality;
 * - **near** (back ashore in the parcel set out from): `travel_near`, K4, the known shore;
 * - **setting out with food in the pack**: `prepare_before_travel`, C7, planning before a crossing.
 *
 * Both sides of the stand come from the same trip at the same scale, so neither moves alone (⚑9,
 * C27).
 *
 * Pure.
 */
import { SOCIAL_CUES } from "@echo/shared";
import type { EmitActionOptions } from "@/game/world/measure";

/** What `POST /api/world/landing` answers. */
export interface LandingAnswer {
  side: "far" | "near" | null;
  rings: number;
  distanceM: number;
  destOccupants: number | null;
  village: string | null;
  seenBy: string[];
}

/** The things that are food for a crossing (`items.ts`). */
const PROVISIONS = new Set(["berries", "a handful of grain", "fish", "bread", "cheese"]);

/** Whether a pack set out with something to eat on the water. */
export function provisioned(pack: Record<string, number>): boolean {
  return Object.entries(pack).some(([id, n]) => n > 0 && PROVISIONS.has(id));
}

const row = (action: "travel_far" | "travel_near" | "prepare_before_travel") => {
  const r = SOCIAL_CUES[action]!;
  return { cue: r.cue as EmitActionOptions["cue"], channel: r.channel as EmitActionOptions["channel"], polarity: r.polarity as EmitActionOptions["polarity"] };
};

/** The landing, as the echo is told of it: an action and its envelope, or nothing for a non-trip. */
export function travelMeasurement(a: LandingAnswer, cell: string): { action: "travel_far" | "travel_near"; opts: EmitActionOptions } | null {
  if (a.side === null) return null;
  const action = a.side === "far" ? "travel_far" : "travel_near";
  return {
    action,
    opts: {
      ...row(action),
      raw: { dest_occupants: a.destOccupants ?? 0, distance_m: a.distanceM, rings: a.rings },
      target: { id: `parcel:${cell}`, kind: "place" },
      contextOverride: { stakes: a.side === "far" ? "high" : "low", public_or_private: a.seenBy.length > 0 ? "public" : "private", counterpart_status: "none" },
    },
  };
}

/** Setting out with food aboard. */
export function preparationMeasurement(cell: string): { action: "prepare_before_travel"; opts: EmitActionOptions } {
  return {
    action: "prepare_before_travel",
    opts: { ...row("prepare_before_travel"), raw: {}, target: { id: `parcel:${cell}`, kind: "place" }, contextOverride: { stakes: "low", public_or_private: "private", counterpart_status: "none" } },
  };
}

/** The line a landing is met with. */
export function landingLine(a: LandingAnswer): string {
  if (a.side === "near") return "You drag the raft up the shore you set out from.";
  const seen = a.seenBy.length === 0 ? "" : a.seenBy.length === 1 ? ` ${a.seenBy[0]} watched you come in.` : ` ${a.seenBy.slice(0, 2).join(" and ")}${a.seenBy.length > 2 ? " and others" : ""} watched you come in.`;
  if (a.village) return `You drag the raft up the shore below ${a.village}.${seen}`;
  return "You drag the raft up a shore with nobody on it.";
}
