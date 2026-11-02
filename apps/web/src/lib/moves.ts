/**
 * Moves between villages, on the server (DECISIONS C53): where someone goes, and writing a move into
 * both villages' changes.
 *
 * WHERE THEY GO is a village that is there to go to: the nearest settled cells round the one they
 * leave (`nearCells`, three rings), the nearest ring with any, one of those by a draw on who they are
 * and the day. Nobody goes nowhere if there is somewhere; if there is nowhere, they go "far away", as
 * C44 had everyone do.
 *
 * TWO WRITES. A move is a `leave` in one village and an `arrive` per person in the other (`moves.ts`
 * in the planet says why). They are two rows in two cells and are not one transaction: if the second
 * fails, the person has left and arrived nowhere, which is C44's world and not a broken one (⚑43).
 */
import "server-only";

import {
  cellDistanceKm,
  couldMarry,
  hash01,
  mayCourt,
  nearCells,
  villageAt,
  type LifeChange,
  type Person,
  type SettledParcel,
} from "@echo/planet";

import { planet } from "@/lib/planet";
import type { VillageStore } from "@/lib/villageStore";

export interface Elsewhere {
  cell: string;
  name: string;
  km: number;
}

const settled = new Map<string, { name: string } | null>();

/** A village by cell, without its changes: whether it is there, and its name. Cached: neither moves. */
export function villageNamed(cell: string): { name: string } | null {
  if (settled.has(cell)) return settled.get(cell)!;
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day: 0 });
  const out = v ? { name: v.settlement.name } : null;
  settled.set(cell, out);
  return out;
}

/** Where someone leaving `cell` goes: a settled village round it, or null for far away. */
export function destinationFor(cell: string, person: string, day: number): Elsewhere | null {
  const { world } = planet();
  const near = nearCells(cell);
  for (let ring = 1; ring <= Math.max(...near.map((n) => n.ring)); ring++) {
    const found = near.filter((n) => n.ring === ring && villageNamed(n.cell) !== null);
    if (found.length === 0) continue;
    const pick = found[Math.floor(hash01(`${person}/goes/${day}`) * found.length)];
    return { cell: pick.cell, name: villageNamed(pick.cell)!.name, km: cellDistanceKm(cell, pick.cell, world.radiusKm) };
  }
  return null;
}

/** Write both halves of a move. The `leave` first: a person may be gone and arrive nowhere, never the other way. */
export async function writeMove(
  store: VillageStore,
  from: string,
  to: string,
  move: { here: Omit<LifeChange, "id">[]; there: Omit<LifeChange, "id">[] },
  subject: string,
): Promise<{ here: LifeChange[]; there: LifeChange[] } | null> {
  const here: LifeChange[] = [];
  for (const c of move.here) {
    const r = await store.addChange(from, c, subject);
    if (!r) return null;
    here.push(r);
  }
  const there: LifeChange[] = [];
  for (const c of move.there) {
    const r = await store.addChange(to, c, subject);
    if (r) there.push(r);
  }
  return { here, there };
}

/** Someone the stranger has met who could marry this villager, and where they are. */
export interface Single {
  cell: string;
  village: string;
  km: number;
  person: Person;
  /** Their village as it now is, for the route to read them in, and its changes. */
  parcel: SettledParcel;
  changes: readonly LifeChange[];
}

/**
 * The unmarried people this stranger has talked to — here or in other villages — whom this villager
 * could marry. Only people the stranger has actually met: a stranger cannot introduce a name they
 * made up, because the list is the store's, not the conversation's.
 */
export async function singlesMet(
  store: VillageStore,
  subject: string,
  me: Person,
  myCell: string,
  day: number,
  load: (cell: string) => Promise<{ village: SettledParcel; changes: readonly LifeChange[] } | null>,
): Promise<Single[]> {
  const met = (await store.metBy(subject, 40)) ?? [];
  const { world } = planet();
  // Only villages near enough to marry into: this one and those round it (C53). A woman of Senstrand
  // does not marry a smith three hundred kilometres off whom she has never seen — the real model said
  // so, in as many words, the one time the list reached that far.
  const nearby = new Set([myCell, ...nearCells(myCell).map((n) => n.cell)]);
  const out: Single[] = [];
  const villages = new Map<string, { village: SettledParcel; changes: readonly LifeChange[] } | null>();
  for (const m of met) {
    if (m.person === me.id || out.some((x) => x.person.id === m.person) || !nearby.has(m.cell)) continue;
    if (!villages.has(m.cell)) villages.set(m.cell, await load(m.cell));
    const v = villages.get(m.cell);
    if (!v) continue;
    const s = v.village.settlement;
    const them = s.people.find((p) => p.id === m.person);
    // Their own word to THIS villager does not count against them: that is the word being answered.
    const theirs = v.changes.filter((c) => !(c.kind === "court" && c.person === m.person && c.target === me.id));
    if (!them || !mayCourt(s, them, day, theirs) || !couldMarry(me, them)) continue;
    out.push({ cell: m.cell, village: s.name, km: m.cell === myCell ? 0 : cellDistanceKm(myCell, m.cell, world.radiusKm), person: them, parcel: v.village, changes: v.changes });
    if (out.length >= 4) break;
  }
  return out;
}
