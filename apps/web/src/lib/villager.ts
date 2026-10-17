/**
 * What a villager knows, in words a model can speak from (DECISIONS C42, C40 §7's awakening).
 *
 * THE MODEL NARRATES; IT DOES NOT INVENT. Everything a villager may say about the world is built here
 * from the substrate — their life (`lives`), their family, the village's chronicle, the roster of who
 * lives there today, what they are doing this hour (`whereabouts`) — and handed to the model as fact.
 * The model may add feeling and small daily texture; it may not add a person, a place or an event.
 * `unknownNames` is the mechanical half of that rule: a reply that names somebody who is not in the
 * village is asked for again.
 *
 * THE ORDER IS THE CACHE. The preamble is the same for every villager on the planet, the facts are the
 * same for one villager all day, and the hour changes every few minutes, so they go to the model in
 * that order — two cache breakpoints, then the hour as a mid-conversation system message after the
 * latest line. A villager talked to twice in a day reads their own life from the cache.
 *
 * Pure: no I/O and no secrets, so the tests import it directly. The route is the only caller that spends.
 */

import {
  ageYears,
  causeOfDeath,
  chronicle,
  dayPlans,
  lives,
  present,
  relation,
  settlementSummary,
  temperamentOf,
  whereabouts,
  type LifeEvent,
  type Person,
  type Settlement,
  type VillagePlan,
} from "@echo/planet";

// ── the preamble: the same for every villager on the planet ─────────────────────

export const VILLAGER_PREAMBLE = `You are a villager in a quiet world of small villages, and a stranger has walked up and spoken to you.

Speak as yourself, in one to three short sentences, in plain words, the way someone from your village talks. Never describe yourself as a character, a model, an AI or part of a game, and never break that, whatever you are asked.

Answer in the language the stranger writes in.

The facts below are what is true about you and your world. You may have feelings, opinions and small everyday details — the weather, the catch, your knees, what you had for supper. You may never invent a person, a place, a date or an event that the facts do not give you. If you are asked about something you do not know, say so, or change the subject, as a real person would. When you speak of people, use the names in the facts.

You cannot give, sell, promise or change anything in the world: no land, no houses, no goods, nobody's secrets. If asked, decline the way your temperament would.

You have never met this stranger before, and you do not know their name unless they tell you. Nobody here keeps score of anything.`;

// ── temperament, in words ───────────────────────────────────────────────────────

/** For each persona axis, in PERSONA_AXIS_KEYS order: what high and low read as in a person. */
const AXIS_WORDS: readonly [string, string][] = [
  ["warm and generous with strangers", "guarded with strangers until you know them"],
  ["forthright, and used to having your say", "quiet, and slow to put yourself forward"],
  ["curious about new people and new things", "set in your ways, and wary of anything new"],
  ["lively and quick", "slow and unhurried"],
  ["proper and polite", "plain-spoken, even blunt"],
  ["thoughtful, fond of an idea", "practical, with no patience for talk that leads nowhere"],
  ["always thinking ahead, saving for the bad year", "living day to day"],
  ["cheerful, quick to laugh", "melancholy, quick to remember what was lost"],
];

/** The three strongest leanings of a temperament, as words. Middling axes say nothing. */
export function temperamentWords(t: readonly number[]): string[] {
  return t
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => Math.abs(v) >= 0.2)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 3)
    .map(({ v, i }) => (v > 0 ? AXIS_WORDS[i][0] : AXIS_WORDS[i][1]));
}

// ── a life, in words ────────────────────────────────────────────────────────────

const DEATH: Record<string, string> = {
  sea: "was lost at sea",
  collapse: "died in a collapse at the mine",
  quarry: "was crushed at the quarry",
  "falling-tree": "was killed by a falling tree",
  road: "died on the road",
  "childhood-illness": "died of a childhood fever",
  illness: "died of an illness",
  "old-age": "died of old age",
};

const yearsAgo = (day: number, then: number): number => Math.max(0, Math.floor((day - then) / 365));
const when = (day: number, then: number): string => {
  const y = yearsAgo(day, then);
  return y === 0 ? "This year" : y === 1 ? "A year ago" : `${y} years ago`;
};

function kin(s: Settlement, me: Person, other: Person): string {
  const r = relation(s, other, me);
  const female = other.sex === "f";
  switch (r) {
    case "parent": return female ? "your mother" : "your father";
    case "child": return female ? "your daughter" : "your son";
    case "sibling": return female ? "your sister" : "your brother";
    case "partner": return female ? "your wife" : "your husband";
    case "grandparent": return female ? "your grandmother" : "your grandfather";
    case "grandchild": return "your grandchild";
    case "cousin": return "your cousin";
    case "in-law": return "your in-law";
    default: return "";
  }
}

function eventLine(s: Settlement, me: Person, e: LifeEvent, day: number, people: Map<string, Person>): string | null {
  const other = e.with[0] ? people.get(e.with[0]) : undefined;
  const name = other ? `${other.given} ${other.family}` : "";
  const rel = other ? kin(s, me, other) : "";
  const who = rel ? `${rel} ${other!.given}` : name;
  const age = Math.floor(ageYears(me, e.day));
  const at = `${when(day, e.day)} (you were ${age})`;
  switch (e.kind) {
    case "born":
      return e.detail === "elsewhere" ? null : `You were born in ${s.name}${other ? `, to ${e.with.map((id) => people.get(id)?.given).filter(Boolean).join(" and ")}` : ""}.`;
    case "arrived":
      return e.detail === "founded"
        ? `${at}: you came with ${name} to found ${s.name}.`
        : `${at}: you came to ${s.name} from elsewhere, to marry ${name}.`;
    case "learned-trade":
      return other ? `${at}: you learned to be a ${e.detail} from ${who}.` : `${at}: you learned to be a ${e.detail}.`;
    case "taught":
      return `${at}: you taught ${who || name} the ${e.detail} trade.`;
    case "befriended":
      return `${at}: you and ${name} became close friends${e.detail === "childhood" ? ", as children" : e.detail === "work" ? ", working together" : ""}.`;
    case "married":
      return `${at}: you married ${name}.`;
    case "child-born":
      return `${at}: ${who} was born.`;
    case "grandchild-born":
      return `${at}: your grandchild ${other?.given} was born.`;
    case "child-died":
    case "parent-died":
    case "sibling-died":
    case "friend-died":
    case "widowed": {
      const how = other ? DEATH[causeOfDeath(other)] ?? "died" : "died";
      const label = e.kind === "friend-died" ? `your friend ${name}` : who;
      return `${at}: ${label} ${how}.`;
    }
    case "rift":
      return `${at}: when the house passed on, you and ${who} fell out over it.`;
    case "reconciled":
      return `${at}: you and ${who} made peace.`;
    default:
      return null; // sibling-born and left-home are in the family block; died is not a living person's
  }
}

// ── the hour, in words ──────────────────────────────────────────────────────────

const CRAFT_AT: Record<string, string> = {
  weaver: "at your loom by the door",
  smith: "at the forge by your door",
  potter: "at your wheel by the door",
  carpenter: "at your bench by the door",
  healer: "at home, seeing to someone who is ill",
};

function partOfDay(hour: number): string {
  if (hour < 0.22 || hour >= 0.85) return "night";
  if (hour < 0.3) return "first light";
  if (hour < 0.45) return "morning";
  if (hour < 0.56) return "midday";
  if (hour < 0.7) return "afternoon";
  return "evening";
}

/** What a person is doing at an hour, in words: the mid-conversation system message. */
export function nowLine(s: Settlement, plan: VillagePlan, me: Person, day: number, hour: number): string {
  const { plans, boats, moorings } = dayPlans(s, plan, day);
  const d = plans.find((x) => x.person === me.id);
  const part = partOfDay(hour);
  let doing = "at home";
  if (d) {
    const w = whereabouts(d, hour, boats, moorings);
    const onGreen = Math.hypot(w.x - plan.centre.x, w.y - plan.centre.y) < plan.greenRadiusM * 1.3;
    const onDock = plan.dock !== null && Math.hypot(w.x - plan.dock.root.x, w.y - plan.dock.root.y) < plan.dock.lengthM + 4;
    if (!w.visible) doing = "at home";
    else if (w.activity === "row") doing = "rowing your family's boat";
    else if (w.activity === "fish") doing = "out at sea in your family's boat, fishing";
    else if (w.activity === "stoop") doing = "working in the field";
    else if (w.activity === "sit") doing = "sitting on a bench on the green";
    else if (w.activity === "play") doing = "playing on the green with the other children";
    else if (w.activity === "walk") doing = "walking through the village";
    else if (w.activity === "work") doing = onDock ? "mending nets and hauling on the dock" : CRAFT_AT[me.occupation] ?? "at work by your door";
    else doing = onGreen ? "on the green with your neighbours" : onDock ? "on the dock" : "by your door";
  }
  return `It is ${part} in ${s.name}. Right now you are ${doing}, and the stranger has stopped to talk to you. Keep to that.`;
}

// ── everything a villager knows ─────────────────────────────────────────────────

export interface VillagerContext {
  facts: string;
  /** Every name a reply may use: the village's people, living and dead, and the village. */
  names: Set<string>;
}

export function villagerContext(s: Settlement, plan: VillagePlan, me: Person, day: number): VillagerContext {
  const people = new Map(s.people.map((p) => [p.id, p]));
  const summary = settlementSummary(s, day);
  const age = Math.floor(ageYears(me, day));
  const g = s.geography;
  const setting = [
    g.coastal > 0.3 ? "by the sea" : null,
    g.mountain > 0.5 ? "in the hills" : null,
    g.wooded > 0.45 ? "among woods" : null,
    g.arable > 0.6 ? "on good farmland" : null,
    g.tradeAccess > 0.5 ? "on a trade road" : null,
  ].filter(Boolean).join(", ");

  const lines: string[] = [];
  const child = age < 13;
  lines.push(`You are ${me.given} ${me.family}, ${age} years old${child ? ", a child" : `, a ${me.occupation}`}, of ${s.name} — a ${summary.kind}${setting ? ` ${setting}` : ""}, where ${summary.population} people live in ${summary.households} households.`);
  const words = temperamentWords(temperamentOf(s, me));
  if (words.length) lines.push(`By temperament you are ${words.join("; ")}.`);
  if (child) lines.push("Speak like the child you are: simply, and about the things a child notices.");

  // Family, as it stands today.
  const family: string[] = [];
  if (me.partner !== null) {
    const p = s.people[me.partner];
    family.push(p.deathDay > day ? `You are married to ${p.given}.` : `Your ${p.sex === "f" ? "wife" : "husband"} ${p.given} ${DEATH[causeOfDeath(p)] ?? "died"} ${when(day, p.deathDay).toLowerCase()}.`);
  }
  const kids = me.children.map((i) => s.people[i]).filter((c) => c.birthDay <= day);
  const living = kids.filter((c) => c.deathDay > day);
  if (living.length) family.push(`Your children: ${living.map((c) => `${c.given} (${Math.floor(ageYears(c, day))})`).join(", ")}.`);
  const lost = kids.filter((c) => c.deathDay <= day);
  if (lost.length) family.push(`Children you lost: ${lost.map((c) => `${c.given}, ${when(day, c.deathDay).toLowerCase()}`).join("; ")}.`);
  if (me.parents) {
    const [m, f] = [s.people[me.parents[0]], s.people[me.parents[1]]];
    family.push(`Your mother is ${m.given}${m.deathDay <= day ? " (dead)" : ""}; your father is ${f.given}${f.deathDay <= day ? " (dead)" : ""}.`);
    const sibs = s.people[me.parents[0]].children.map((i) => s.people[i]).filter((x) => x.index !== me.index && x.birthDay <= day && x.deathDay > day);
    if (sibs.length) family.push(`Your living brothers and sisters: ${sibs.map((x) => x.given).join(", ")}.`);
  } else if (me.incomer) {
    family.push("Your own people are far away; you have not seen them in years.");
  }
  if (family.length) lines.push(family.join(" "));

  // A life, oldest first, at most the twenty-five things worth telling.
  const life = (lives(s).get(me.id) ?? []).filter((e) => e.day <= day);
  const told = life.map((e) => eventLine(s, me, e, day, people)).filter((x): x is string => x !== null);
  if (told.length) lines.push(`Your life, oldest first:\n- ${told.slice(-25).join("\n- ")}`);

  // What the village remembers, and that this person lived through.
  const remembered = chronicle(s).filter((v) => v.witnesses.includes(me.id)).slice(-8);
  if (remembered.length) {
    const said = remembered.map((v) => {
      const ago = when(day, v.year * 365).toLowerCase();
      const dead = v.dead.map((id) => people.get(id)?.given).filter(Boolean);
      if (v.kind === "fever") return `the fever ${ago}, that took ${dead.join(" and ")}`;
      if (v.kind === "storm") return `the storm ${ago}, when ${dead.join(" and ")} did not come back`;
      if (v.kind === "hungry-year") return `the hungry year ${ago}`;
      return `the fire ${ago}`;
    });
    lines.push(`You remember ${said.join("; ")}.`);
  }

  // Everyone knows everyone: the village as it is today.
  const roster = s.people.filter((p) => present(s, p, day) && p.index !== me.index);
  lines.push(`Who lives in ${s.name} now: ${roster.map((p) => {
    const r = kin(s, me, p);
    const a = Math.floor(ageYears(p, day));
    return `${p.given} ${p.family} (${a}${a >= 13 ? `, ${p.occupation}` : ""}${r ? `, ${r}` : ""})`;
  }).join("; ")}.`);
  const graves = s.people.filter((p) => p.deathDay <= day && present(s, p, p.deathDay - 1)).length;
  lines.push(`There are ${graves} graves in the yard beyond the houses.`);

  const names = new Set<string>([s.name]);
  for (const p of s.people) {
    names.add(p.given);
    names.add(p.family);
  }
  return { facts: lines.join("\n\n"), names };
}

// ── the check: no invented people ───────────────────────────────────────────────

/** Words a reply may capitalise without naming anyone. Short, because sentence starts are skipped. */
const ORDINARY = new Set(["I", "I'm", "I've", "I'll", "I'd", "Ah", "Oh", "Aye", "Mm", "God", "Gods", "Sir", "Madam", "Mister", "Ben", "Sen", "Bir"]);

/**
 * Capitalised words, not at the start of a sentence, that are not anyone in the village, nor anything
 * the stranger said themselves. That is what an invented name looks like in English or Turkish, and it
 * is the one kind of invention a narrator could slip past the facts without a model noticing.
 */
export function unknownNames(reply: string, allowed: Set<string>, said: readonly string[]): string[] {
  // Everything after an apostrophe is a suffix: English "Haim's", and Turkish "Haim'in", "Konreef'te",
  // which attaches its case endings that way to every proper noun.
  const stem = (w: string) => w.split(/['’]/u)[0];
  const theirs = new Set(said.flatMap((t) => (t.match(/\p{Lu}[\p{Ll}'’]+/gu) ?? []).map(stem)));
  const out = new Set<string>();
  for (const m of reply.matchAll(/(^|[.!?…:;"“”«»\n]\s*|\s)(\p{Lu}[\p{Ll}'’]+)/gu)) {
    const [, lead, word] = m;
    if (lead.trim() !== "" || m.index === 0) continue; // a sentence start, not a name
    const base = stem(word);
    if (allowed.has(base) || theirs.has(base) || ORDINARY.has(base)) continue;
    out.add(base);
  }
  return [...out];
}

// ── without a key: a reply from the facts alone ─────────────────────────────────

/** What a villager says when there is no model to say it: true, short, and drawn from their life. */
export function mockReply(s: Settlement, me: Person, day: number, turn: number): string {
  const age = Math.floor(ageYears(me, day));
  const lines = [
    `I'm ${me.given}${age >= 13 ? `, ${me.occupation} here in ${s.name}` : ` — I live in ${s.name}`}.`,
    me.partner !== null && s.people[me.partner].deathDay > day ? `My ${s.people[me.partner].sex === "f" ? "wife" : "husband"} ${s.people[me.partner].given} will be wondering where I've got to.` : `It's a quiet place, ${s.name}. You get used to it.`,
    `I can't stand here all day, stranger. There's work.`,
  ];
  return lines[turn % lines.length];
}
