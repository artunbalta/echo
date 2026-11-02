/**
 * Between villages (DECISIONS C53): going to another one, coming home, and marrying someone from
 * elsewhere that a stranger told you of.
 *
 * TWO VILLAGES, TWO LEDGERS, ONE PERSON. Every village is generated from its own seed and its own
 * changes, and none of them can ask another to generate itself — that way lies simulating the planet.
 * So a move is written into both: the village left gets a `leave` that names where they went, and the
 * village gone to gets an `arrive` per person that CARRIES them (`PortablePerson`: their name, their
 * dates, their trade, the temperament their own village drew). The village they come to has them from
 * the day they come without knowing anything else about where they came from — and the village they
 * left goes on without them, as C44 already made it.
 *
 * COMING HOME is the same move the other way, for someone who came: the `arrive` written into their
 * old village names a person it already has, who is simply there again (`Person.backDay`).
 *
 * A MARRIAGE A STRANGER BROUGHT ABOUT. A stranger who has met two unmarried people can tell each of
 * the other. Each decides for themselves (a `court` change, held to the same rules as any decision);
 * when both have, the one who spoke first goes to the other's village two days before the wedding,
 * lodges with that family, and the wedding is a week after the second word — on the green, where
 * C52 shows it and the whole village knows it is coming.
 *
 * Pure. The route chooses the village gone to (it needs the planet) and writes what this returns.
 */

import { cellToLatLng, gridDisk } from "h3-js";

import type { LifeChange, PortablePerson } from "./changes.js";
import { present, temperamentOf } from "./life.js";
import { LEAVE_WITH_FAMILY_YEARS, PAIRING, ageYears, occupationOn, type Person, type Settlement } from "./society.js";
import { daysToYears } from "./worldclock.js";

export const MOVES = {
  /** How far a village gone to may be, in H3 rings at the village's resolution. */
  rings: 3,
  /** The wedding is this many days after the second of the two said yes... */
  weddingNoticeDays: 7,
  /** ...and the one who goes comes this many days before it. */
  comesBeforeDays: 2,
  /** Who may court: unmarried, and of these ages. */
  minCourtYears: PAIRING.minAgeYears,
  maxCourtYears: 50,
} as const;

/** Who goes with someone who leaves on a day: their partner, and their children under sixteen. */
export function partyOf(s: Settlement, p: Person, day: number): Person[] {
  const out = [p];
  if (p.partner !== null) {
    const q = s.people[p.partner];
    if (present(s, q, day)) out.push(q);
  }
  for (const i of p.children) {
    const c = s.people[i];
    if (present(s, c, day) && daysToYears(day - c.birthDay) < LEAVE_WITH_FAMILY_YEARS) out.push(c);
  }
  return out;
}

/** A person as another village will need them, on the day they go. */
export function portable(s: Settlement, p: Person, day: number, party: readonly Person[] = [p]): PortablePerson {
  const ids = new Set(party.map((q) => q.id));
  const partner = p.partner !== null ? s.people[p.partner] : null;
  const parents = p.parents ? ([s.people[p.parents[0]], s.people[p.parents[1]]] as const) : null;
  return {
    id: p.id,
    seedKey: p.seedKey,
    given: p.given,
    family: p.family,
    sex: p.sex,
    birthDay: p.birthDay,
    deathDay: p.deathDay,
    pairAgeDays: p.pairAgeDays,
    occupation: occupationOn(p, day),
    temperament: [...temperamentOf(s, p)],
    ...(partner && ids.has(partner.id) ? { partner: partner.id, partnerDay: p.partnerDay ?? day } : {}),
    ...(parents && ids.has(parents[0].id) && ids.has(parents[1].id) ? { parents: [parents[0].id, parents[1].id] as const } : {}),
    children: p.children.filter((i) => s.people[i].birthDay <= day).length,
  };
}

/**
 * The changes a move writes: a `leave` here for the one who decided (C44 takes their family with
 * them), and an `arrive` there for each of them. Ids are the store's; `madeDay` is today.
 */
export function moveChanges(
  home: Settlement,
  p: Person,
  day: number,
  madeDay: number,
  toCell: string,
  hostOf?: string,
): { here: Omit<LifeChange, "id">[]; there: Omit<LifeChange, "id">[] } {
  const party = partyOf(home, p, day);
  return {
    here: [{ person: p.id, kind: "leave", madeDay, day, toCell }],
    there: party.map((q) => ({
      person: q.id,
      kind: "arrive" as const,
      madeDay,
      day,
      fromCell: home.cell,
      spec: { ...portable(home, q, day, party), ...(hostOf && q.id === p.id ? { hostOf } : {}) },
    })),
  };
}

/** Coming home: a `leave` here, and an `arrive` there that names someone the village already has. */
export function homeChanges(here: Settlement, p: Person, day: number, madeDay: number): { here: Omit<LifeChange, "id">[]; there: Omit<LifeChange, "id">[] } | null {
  if (p.fromCell === null) return null;
  return {
    here: [{ person: p.id, kind: "leave", madeDay, day, toCell: p.fromCell }],
    there: [{ person: p.id, kind: "arrive", madeDay, day, fromCell: here.cell, spec: portable(here, p, day) }],
  };
}

/**
 * May this person court someone today: unmarried, of an age, here, not going, not promised — and not
 * waiting on word sent to somebody ELSE. (Word again to the same person is how a meeting becomes a
 * marriage: `target` is who they would court.)
 */
export function mayCourt(s: Settlement, p: Person, day: number, changes: readonly LifeChange[] = [], target: string | null = null): boolean {
  const age = ageYears(p, day);
  if (!present(s, p, day) || age < MOVES.minCourtYears || age > MOVES.maxCourtYears) return false;
  if (p.partner !== null || p.visiting) return false;
  if (p.leftDay !== Infinity && p.leftDay > day) return false;
  if (changes.some((c) => c.kind === "pair" && (c.person === p.id || c.target === p.id) && c.day > day)) return false;
  if (changes.some((c) => c.kind === "court" && c.person === p.id && c.target !== target && c.madeDay > day - 60)) return false;
  return true;
}

/**
 * A visit, to meet someone (C53): gone from home for a day and back the next morning, and there for
 * the day, lodging with the family of whoever they came to meet. Four changes, two in each village.
 */
export function visitChanges(home: Settlement, p: Person, day: number, madeDay: number, toCell: string, hostOf: string): { here: Omit<LifeChange, "id">[]; there: Omit<LifeChange, "id">[] } {
  const spec = portable(home, p, day);
  return {
    here: [
      { person: p.id, kind: "leave", madeDay, day, toCell },
      { person: p.id, kind: "arrive", madeDay, day: day + 1, fromCell: toCell, spec },
    ],
    there: [
      { person: p.id, kind: "arrive", madeDay, day, fromCell: home.cell, spec: { ...spec, hostOf, visiting: true } },
      { person: p.id, kind: "leave", madeDay, day: day + 1, toCell: home.cell },
    ],
  };
}

/** Have these two met — has one of them come to visit the other (C53)? The day they did, or null. */
export function metOn(changes: readonly LifeChange[], a: string, b: string, day: number): number | null {
  let out: number | null = null;
  for (const c of changes) {
    if (c.kind !== "arrive" || !c.spec?.visiting || c.day >= day) continue;
    if ((c.person === a && c.spec.hostOf === b) || (c.person === b && c.spec.hostOf === a)) out = Math.max(out ?? -Infinity, c.day);
  }
  return out;
}

/** Could these two marry: a man and a woman, near enough in age, not kin? (The generator's own rules.) */
export function couldMarry(a: { sex: "f" | "m"; birthDay: number; id: string }, b: { sex: "f" | "m"; birthDay: number; id: string }): boolean {
  if (a.sex === b.sex || a.id === b.id) return false;
  return Math.abs(daysToYears(a.birthDay - b.birthDay)) <= PAIRING.maxAgeGapYears;
}

/** When two who have both said yes marry, and when the one who goes arrives. */
export function weddingDays(secondWordDay: number): { arrive: number; wedding: number } {
  const wedding = secondWordDay + MOVES.weddingNoticeDays;
  return { arrive: wedding - MOVES.comesBeforeDays, wedding };
}

/** The cells round a village a person might go to, nearest first (the route keeps the settled ones). */
export function nearCells(cell: string): { cell: string; ring: number }[] {
  const out: { cell: string; ring: number }[] = [];
  const seen = new Set([cell]);
  for (let k = 1; k <= MOVES.rings; k++) {
    for (const c of gridDisk(cell, k)) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push({ cell: c, ring: k });
    }
  }
  return out;
}

/** Great-circle distance between two cells' centres on a planet of this radius, kilometres. */
export function cellDistanceKm(a: string, b: string, radiusKm: number): number {
  const [la1, lo1] = cellToLatLng(a).map((d) => (d * Math.PI) / 180);
  const [la2, lo2] = cellToLatLng(b).map((d) => (d * Math.PI) / 180);
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}
