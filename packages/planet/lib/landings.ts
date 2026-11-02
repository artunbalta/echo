/**
 * A stranger coming in from the sea on a raft, and who knows it (DECISIONS C57).
 *
 * NOT A DEED. A deed is something done to somebody, and is read as help or harm (C45). Coming
 * ashore is neither. It is news: a raft nobody built here, out of the sea. So a landing has its own
 * small record and its own rule for who knows:
 *
 * - **who saw it**: everyone out of doors within {@link LANDINGS}.sightM, by the same closed form as
 *   a deed's witnesses. A raft on open water is seen from much further off than a hand on a fence;
 * - **everyone, the next day**: a stranger out of the sea is what a village talks about;
 * - **a stranger coming back** to the shore they set out from is not news. Only those who saw it
 *   know.
 *
 * Pure. The landing route records a landing; the talk route asks who knows of it.
 */

import type { LifeChange } from "./changes.js";
import { dayPlans, whereabouts } from "./schedule.js";
import type { Person, Settlement } from "./society.js";
import type { VillagePlan } from "./village.js";

export const LANDINGS = {
  /** How far off a person out of doors sees a raft come in, metres. */
  sightM: 150,
  /** Children under this age see it and are not asked. */
  minAge: 8,
} as const;

export interface Landing {
  id: string;
  day: number;
  hour: number;
  /** The parcel the raft set out from. */
  fromCell: string;
  /** That parcel's village, if it had one: what "from the direction of" can name. */
  fromName: string | null;
  /** The travel stand's side (`crossing.ts` `tripVerdict`): from elsewhere, or back home. */
  side: "far" | "near";
  /** How many parcels it crossed, as the crow flies. */
  rings: number;
  /** `Person.id`s of everyone who saw it come in. */
  witnesses: string[];
}

/** Who saw a raft come ashore at a place and an hour. */
export function landingWitnesses(
  s: Settlement,
  plan: VillagePlan,
  day: number,
  hour: number,
  at: { x: number; y: number },
  changes: readonly LifeChange[] = [],
): string[] {
  const { plans, boats, moorings } = dayPlans(s, plan, day, changes);
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const d of plans) {
    const p = byId.get(d.person);
    if (!p || (day - p.birthDay) / 365 < LANDINGS.minAge) continue;
    const w = whereabouts(d, hour, boats, moorings);
    if (w.visible && Math.hypot(w.x - at.x, w.y - at.y) <= LANDINGS.sightM) out.push(p.id);
  }
  return out;
}

export interface KnownLanding {
  landing: Landing;
  how: "saw" | "heard";
}

/** What one villager knows today of a stranger's landings here, oldest first. */
export function knownLandings(me: Person, landings: readonly Landing[], day: number): KnownLanding[] {
  const out: KnownLanding[] = [];
  for (const l of [...landings].sort((a, b) => a.day - b.day || a.hour - b.hour)) {
    if (l.day > day) continue;
    if (l.witnesses.includes(me.id)) out.push({ landing: l, how: "saw" });
    else if (l.side === "far" && day > l.day) out.push({ landing: l, how: "heard" });
  }
  return out;
}

/** A known landing, in the words a villager's facts carry. */
export function landingWords(s: Settlement, k: KnownLanding, day: number): string {
  const l = k.landing;
  const ago = day - l.day <= 0 ? "today" : day - l.day === 1 ? "yesterday" : `${day - l.day} days ago`;
  if (l.side === "near") return `You saw them bring a raft back in to the shore here, ${ago}: they had been out on the water.`;
  const whence = l.fromName && l.fromName !== s.name ? `from the direction of ${l.fromName}` : "from across the water";
  return k.how === "saw"
    ? `You saw them come in out of the sea on a raft, ${whence}, ${ago}. Nobody here built it.`
    : `Word went round that they came in out of the sea on a raft, ${whence}, ${ago}.`;
}
