/**
 * Who in a village is close to whom, and what they say to each other (DECISIONS C49).
 *
 * THE GRAPH. Four kinds of tie, from what the substrate already knows, strongest first:
 *   family    (3) partner, parents, children, brothers and sisters;
 *   friend    (2) the close friendships C40's lives record (`befriended`);
 *   neighbour (1) the households on the next plots;
 *   workmate  (1) the nearest in age in the same trade.
 * Nothing is drawn here: the graph is a reading of lives already lived. Memoised per settlement and day.
 *
 * WORD TRAVELS ALONG IT (`deeds.ts`). What a stranger did reaches people one tie a day: a small thing
 * stays among family, a thing that matters goes on to friends, and a thing nobody will forget — a door
 * forced, a crop trampled — goes round the whole village in a few days. That replaces C45's rule
 * that word never went past family, and C49 records why.
 *
 * WHAT THEY SAY (`chatter`). Two people standing together on the green talk, and a passing stranger
 * hears a line: the weather, the work, the village's news (a birth, a death, someone leaving), and the
 * stranger — if what the stranger did has reached them. Lines are chosen deterministically from the
 * pair, the day and the hour, so two strangers passing the same pair hear the same thing. No model is
 * asked: there are thousands of pairs, and what they say is a reading of what is true.
 *
 * Pure.
 */

import { WRONGS } from "./affordances.js";
import type { LifeChange } from "./changes.js";
import { ITEMS } from "./items.js";
import { lives, present } from "./life.js";
import { ageYears, hash01, occupationOn, type Person, type Settlement } from "./society.js";
import type { VillagePlan } from "./village.js";
import type { Deed } from "./deeds.js";
import type { Weather } from "./weather.js";

export type TieKind = "family" | "friend" | "neighbour" | "workmate";

export interface Tie {
  other: string;
  kind: TieKind;
  strength: 1 | 2 | 3;
}

export const SOCIAL = {
  /** Plots whose centres are this close are neighbours. */
  neighbourM: 15,
  /** How many workmates a person counts: the nearest in age in their trade. */
  workmates: 3,
} as const;

const memo = new WeakMap<Settlement, Map<string, Map<string, Tie[]>>>();

/** Everyone's ties on a day. The plan adds neighbours; without it there are none. */
export function socialGraph(s: Settlement, day: number, plan: VillagePlan | null = null): Map<string, Tie[]> {
  let byDay = memo.get(s);
  if (!byDay) {
    byDay = new Map();
    memo.set(s, byDay);
  }
  const key = `${day}/${plan ? "plan" : "none"}`;
  const known = byDay.get(key);
  if (known) return known;

  const here = s.people.filter((p) => present(s, p, day));
  const isHere = new Set(here.map((p) => p.index));
  const out = new Map<string, Tie[]>(here.map((p) => [p.id, []]));
  const seen = new Set<string>();
  const tie = (a: Person, b: Person, kind: TieKind, strength: 1 | 2 | 3) => {
    if (a.index === b.index || !isHere.has(a.index) || !isHere.has(b.index)) return;
    const k = a.index < b.index ? `${a.index}-${b.index}` : `${b.index}-${a.index}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.get(a.id)!.push({ other: b.id, kind, strength });
    out.get(b.id)!.push({ other: a.id, kind, strength });
  };

  for (const p of here) {
    if (p.partner !== null) tie(p, s.people[p.partner], "family", 3);
    for (const c of p.children) tie(p, s.people[c], "family", 3);
    if (p.parents) for (const sib of s.people[p.parents[0]].children) tie(p, s.people[sib], "family", 3);
  }
  const byId = new Map(s.people.map((p) => [p.id, p]));
  for (const [id, events] of lives(s)) {
    const a = byId.get(id);
    if (!a) continue;
    for (const e of events) if (e.kind === "befriended" && e.day <= day) for (const o of e.with) tie(a, byId.get(o)!, "friend", 2);
  }
  if (plan) {
    const home = new Map<number, { x: number; y: number }>();
    for (const plot of plan.plots) for (const h of plot.households) home.set(h, plot);
    const houseOf = (p: Person) => home.get(p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto);
    for (let i = 0; i < here.length; i++) {
      const hi = houseOf(here[i]);
      if (!hi || ageYears(here[i], day) < 13) continue;
      for (let j = i + 1; j < here.length; j++) {
        const hj = houseOf(here[j]);
        if (!hj || hj === hi || ageYears(here[j], day) < 13) continue;
        if (Math.hypot(hi.x - hj.x, hi.y - hj.y) <= SOCIAL.neighbourM) tie(here[i], here[j], "neighbour", 1);
      }
    }
  }
  const adults = here.filter((p) => ageYears(p, day) >= 16);
  for (const p of adults) {
    const trade = occupationOn(p, day);
    adults
      .filter((q) => q.index !== p.index && occupationOn(q, day) === trade)
      .sort((a, b) => Math.abs(a.birthDay - p.birthDay) - Math.abs(b.birthDay - p.birthDay))
      .slice(0, SOCIAL.workmates)
      .forEach((q) => tie(p, q, "workmate", 1));
  }
  byDay.set(key, out);
  return out;
}

/**
 * The day each person comes to know of a deed, and from whom: the witnesses at once, the people it
 * was done to the next morning, and then one tie a day — through family only for a small thing
 * (weight 1), through family and friends for a thing that matters (2), through everyone for a thing
 * nobody forgets (3).
 */
export function spread(s: Settlement, d: Deed, day: number, plan: VillagePlan | null = null): Map<string, { day: number; from: string | null }> {
  const graph = socialGraph(s, day, plan);
  const minStrength = d.weight === 1 ? 3 : d.weight === 2 ? 2 : 1;
  const maxHops = d.weight === 1 ? 1 : d.weight === 2 ? 2 : Infinity;
  const known = new Map<string, { day: number; from: string | null; hops: number }>();
  const queue: string[] = [];
  for (const w of d.witnesses) {
    known.set(w, { day: d.day, from: null, hops: 0 });
    queue.push(w);
  }
  for (const o of d.owners) {
    if (!known.has(o)) {
      known.set(o, { day: d.day + 1, from: null, hops: 0 });
      queue.push(o);
    }
  }
  // Earliest day first: a plain BFS is right because every hop costs the same day.
  queue.sort((a, b) => known.get(a)!.day - known.get(b)!.day);
  for (let i = 0; i < queue.length; i++) {
    const at = known.get(queue[i])!;
    if (at.hops >= maxHops) continue;
    for (const t of graph.get(queue[i]) ?? []) {
      if (t.strength < minStrength) continue;
      const next = at.day + 1;
      const was = known.get(t.other);
      if (!was || next < was.day) {
        known.set(t.other, { day: next, from: queue[i], hops: at.hops + 1 });
        queue.push(t.other);
      }
    }
  }
  const out = new Map<string, { day: number; from: string | null }>();
  for (const [id, k] of known) if (k.day <= day) out.set(id, { day: k.day, from: k.from });
  return out;
}

/**
 * Friends' circles on the green: who stands with whom in the evening. Greedy and deterministic: in id
 * order, each person not yet in a circle starts one and grows it along friendship, breadth first, up to
 * {@link CIRCLE_MAX}. Friendship is transitive enough to join half a village into one
 * ring, which nobody stands in; this keeps each circle a person and their friends. Each person's
 * circle is named by its first member's id. Only grown people under the bench age are put in circles
 * (`schedule.ts` sends no one else to the evening green).
 */
export const CIRCLE_MAX = 7;

export function friendCircles(s: Settlement, day: number): Map<string, string> {
  const graph = socialGraph(s, day);
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const gathers = (id: string) => {
    const p = byId.get(id);
    const age = p ? ageYears(p, day) : 0;
    return age >= 13 && age < 68;
  };
  const friends = (id: string) =>
    (graph.get(id) ?? [])
      .filter((t) => t.kind === "friend" && gathers(t.other))
      .map((t) => t.other)
      .sort();
  const out = new Map<string, string>();
  for (const id of [...graph.keys()].sort()) {
    if (out.has(id) || !gathers(id)) continue;
    // Grow the circle along friendship, breadth first from this person, up to the limit: friendships
    // run in chains (A and B, B and C), and a circle that follows the chain keeps most of them whole.
    const circle = [id];
    out.set(id, id);
    for (let i = 0; i < circle.length && circle.length < CIRCLE_MAX; i++) {
      for (const f of friends(circle[i])) {
        if (circle.length >= CIRCLE_MAX) break;
        if (out.has(f)) continue;
        out.set(f, id);
        circle.push(f);
      }
    }
  }
  return out;
}

// ── what they say ───────────────────────────────────────────────────────────────

export interface ChatterContext {
  weather: Weather | null;
  /** The stranger's deeds here, if this browser has them: what the village may be saying about you. */
  deeds?: readonly Deed[];
  changes?: readonly LifeChange[];
  plan?: VillagePlan | null;
}

const pickOf = <T>(xs: readonly T[], u: number): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))];

/**
 * One line one of a pair says to the other, at an hour of a day, or null for a pair that is quiet
 * just now. The same pair, day and hour always say the same thing.
 */
export function chatter(s: Settlement, speaker: Person, listener: Person, day: number, hour: number, ctx: ChatterContext): string | null {
  const slot = Math.floor(hour * 48); // a new line every half hour of the world's day
  const key = speaker.index < listener.index ? `${speaker.id}+${listener.id}` : `${listener.id}+${speaker.id}`;
  const u = hash01(`${key}/chatter/${day}/${slot}`);
  if (u < 0.35) return null; // not every pair talks every half hour
  const v = hash01(`${key}/chatter/${day}/${slot}/what`);
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const options: string[] = [];

  // The stranger, if what they did has reached the speaker.
  for (const d of ctx.deeds ?? []) {
    const k = spread(s, d, day, ctx.plan ?? null).get(speaker.id);
    if (!k || day - d.day > 20) continue;
    const name = d.thingName.replace(/^the /, "the ");
    const line: Record<string, string> = {
      "force-door": `That stranger forced the door of ${name}. In broad day.`,
      trample: d.kind === "grave" ? `The stranger walked right over ${name}. Can you credit it?` : `Someone saw the stranger trampling ${name}.`,
      "pick-up": `The stranger's been helping themselves, I hear.`,
      board: `The stranger took ${name} out. Didn't ask.`,
      moor: `The stranger brought ${name} back, at least.`,
      tend: `The stranger helped weed ${name}. Without being asked.`,
      tidy: `Someone's been tending ${name}. The stranger, they say.`,
      give: `The stranger left ${ITEMS[d.item ?? ""]?.name ?? "a gift"} at ${name}.`,
      work: `The stranger did a shift at the mine. Not bad at it, either.`,
      "peer-in": `I saw the stranger looking in at windows.`,
    };
    const l = line[d.verb];
    if (l) options.push(l, l); // the stranger is the news, when there is news
    if (WRONGS.has(d.reading) && d.weight >= 3) options.push(l ?? "That stranger. I don't like it.");
  }
  // The sky.
  if (ctx.weather) {
    const sky: Record<string, string[]> = {
      storm: ["Nobody's going out in that.", "The boats stayed in, at least.", "Listen to it.", "My roof won't last another one of these."],
      rain: ["It's set in for the day.", "The fields could use it.", "Wet again.", "I'll not get my washing dry."],
      fog: ["Can't see the end of the dock.", "Thick as wool, this.", "Mind you don't walk into the well."],
      snow: ["Snow, already.", "The little ones will be out in it.", "Cold enough for you?"],
      cloudy: ["It'll rain before dark.", "Grey old day."],
      clear: ["Fine day for it.", "Warm, for once.", "You don't get many like this."],
    };
    // One line of the sky per speaker, not per pair: two pairs on one green say different things.
    const lines = sky[ctx.weather.kind] ?? sky.clear;
    options.push(lines[Math.floor(hash01(`${speaker.id}/sky/${day}`) * lines.length)]);
  }
  // The work.
  const trade = occupationOn(speaker, day);
  if (ageYears(speaker, day) >= 16) {
    if (trade === "fisher") options.push("Poor catch today.", "The nets need mending again.");
    else if (trade === "farmer") options.push("The barley's coming on.", "My back, after today.");
    else if (trade === "miner" || trade === "stonecutter") options.push("Another seam gone dry.");
    else if (trade === "smith") options.push("The forge went out twice.");
  }
  // The village's news: who has decided to leave, who is new, who is gone.
  for (const c of ctx.changes ?? []) {
    const p = byId.get(c.person);
    if (!p || day - c.madeDay > 30 || p.id === speaker.id) continue;
    if (c.kind === "leave" && p.leftDay > day) options.push(`${p.given}'s leaving, they say.`);
    if (c.kind === "trade") options.push(`${p.given}'s gone and taken up the ${c.occupation}'s trade, of all things.`);
  }
  const recent = s.people.filter((p) => p.deathDay <= day && day - p.deathDay < 30 && present(s, p, p.deathDay - 1));
  for (const p of recent.slice(-2)) options.push(`I keep thinking about ${p.given}.`);
  const born = s.people.filter((p) => p.birthDay <= day && day - p.birthDay < 30 && p.parents !== null);
  for (const p of born.slice(-2)) options.push(`Have you seen ${s.people[p.parents![0]].given}'s little one?`);
  if (options.length === 0) return null;
  return pickOf(options, v);
}
