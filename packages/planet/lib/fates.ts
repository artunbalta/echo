/**
 * Meeting a death on its way (DECISIONS C66): when a stranger can, and whom it is for.
 *
 * - **Fetch the healer** (`fetch-healer`), at the door of a house where someone lies ill, when the
 *   village has a healer who is not the one lying ill.
 * - **Leave herbs** (`leave-herbs`), the same, with herbs carried; no healer needed, and it does less.
 * - **Ask them to stay ashore** (`ask-ashore`), to a fisher set on going out under a wrong sky: the
 *   evening before, when the village is already saying so, or that morning before the boat goes.
 *
 * The verbs are offered only then (the page asks this), and the act route asks the same before it
 * writes the change (`tend` or `ashore`) that `mortality.ts` weighs. Pure.
 */
import { present } from "./life.js";
import { isAiling, isSeaDay } from "./mortality.js";
import { SCHEDULE } from "./schedule.js";
import { ageYears, occupationOn, type Person, type Settlement } from "./society.js";
import { residentsOn, type VillagePlan } from "./village.js";

export const FATE_VERBS: ReadonlySet<string> = new Set(["fetch-healer", "leave-herbs", "ask-ashore"]);

/** The evening before a wrong sky, from when it is talked of. */
const EVENING = 0.55;

export interface FateTurn {
  /** Whose death it may turn. */
  person: Person;
  kind: "tend" | "ashore";
  by?: "healer" | "herbs";
  /** The day the change is for: today for a tending, the sea day for keeping ashore. */
  day: number;
}

/** A healer of the village who could come: grown, here, and not the one lying ill. */
export function healerFor(s: Settlement, day: number, not: string): Person | null {
  return s.people.find((p) => p.id !== not && present(s, p, day) && ageYears(p, day) >= 16 && occupationOn(p, day) === "healer" && !isAiling(p, day)) ?? null;
}

/** Whether a fate verb can be done to this thing now, and for whom; null when it cannot. */
export function fateTurn(verb: string, thing: string, s: Settlement, plan: VillagePlan, day: number, hour: number): FateTurn | null {
  if (verb === "ask-ashore") {
    if (!thing.startsWith("villager:")) return null;
    const p = s.people.find((x) => x.id === thing.slice(9));
    if (!p || !present(s, p, day)) return null;
    // That morning, before the boat goes (about `SCHEDULE.wake + 0.06`); or the evening before.
    if (isSeaDay(p, day) && hour < SCHEDULE.wake + 0.06) return { person: p, kind: "ashore", day };
    if (isSeaDay(p, day + 1) && hour >= EVENING) return { person: p, kind: "ashore", day: day + 1 };
    return null;
  }
  if (verb === "fetch-healer" || verb === "leave-herbs") {
    if (!thing.startsWith("house:")) return null;
    const plot = Number(thing.slice(6));
    const ill = residentsOn(s, plan, day).find((r) => r.plot.index === plot && isAiling(r.person, day))?.person;
    if (!ill) return null;
    if (verb === "fetch-healer" && !healerFor(s, day, ill.id)) return null;
    return { person: ill, kind: "tend", by: verb === "fetch-healer" ? "healer" : "herbs", day };
  }
  return null;
}
