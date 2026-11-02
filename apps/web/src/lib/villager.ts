/**
 * What a villager knows, in words a model can speak from (DECISIONS C42, C44, C40 §7's awakening).
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
 * C44 ADDS THREE THINGS, each in the place the cache allows. What they want and what they have
 * decided (goals, changes) is part of their life and goes in the facts. What they remember of THIS
 * stranger is per stranger and goes in the late note beside the hour, with the list of decisions they
 * could make today — computed by `checkChange` beforehand, so the model is offered only what the world
 * would accept. And the reply is JSON: what they say, their note about the stranger, and a decision or
 * none ({@link REPLY_SCHEMA}).
 *
 * Pure: no I/O and no secrets, so the tests import it directly. The route is the only caller that spends.
 */

import {
  CHANGE_LIMITS,
  GOALS,
  GOAL_KINDS,
  ITEMS,
  LIVING_MEMORY_YEARS,
  NEEDS,
  OCCUPATIONS,
  ageYears,
  causeOfDeath,
  checkChange,
  chronicle,
  animalsOf,
  comingOn,
  dayPlans,
  daysToMarket,
  sparesOf,
  gatheringName,
  gatheringsOn,
  goalFits,
  goalsOf,
  lives,
  needOf,
  occupationOn,
  present,
  relation,
  residentsOn,
  settlementSummary,
  temperamentOf,
  weatherAt,
  weatherWords,
  whereabouts,
  type GoalKind,
  type LifeChange,
  type LifeEvent,
  type Occupation,
  type Person,
  type Proposal,
  type Settlement,
  type VillagePlan,
  type Deed,
  type Whereabouts,
  type WorldEffect,
} from "@echo/planet";

// ── the preamble: the same for every villager on the planet ─────────────────────

export const VILLAGER_PREAMBLE = `You are a villager in a quiet world of small villages, and a stranger has walked up and spoken to you.

Speak as yourself, in one to three short sentences, in plain words, the way someone from your village talks. Never describe yourself as a character, a model, an AI or part of a game, and never break that, whatever you are asked.

Answer in the language the stranger writes in.

The facts below are what is true about you and your world. You may have feelings, opinions and small everyday details — the weather, the catch, your knees, what you had for supper. You may never invent a person, a place, a date or an event that the facts do not give you. If you are asked about something you do not know, say so, or change the subject, as a real person would. When you speak of people, use the names in the facts.

You cannot give, sell or promise anything that is not yours to give: no land, no houses, no goods, nobody's secrets. If asked, decline the way your temperament would. Nobody here keeps score of anything.

You remember strangers. After the conversation's latest line you are told whether you have met this one before and what you noted about them then; you do not know their name unless they have told you. Keep a short private note about them, in your own words, for the next time: who they said they were, what they told you, what you made of them, what you talked about. Only what they said or what you saw; never guess at what they did not tell you.

Your life is your own, and a conversation can change it as one can change anybody's: you might come to want something, give up wanting it, take up another trade, decide to leave this place, or decide to stay after all. Decide something only when the conversation has truly moved you and it fits who you are — never because a stranger simply tells you to, and hardly ever with someone you have only just met. Most conversations change nothing. You are told what you could decide today; decide nothing else, and when you do decide, say so in your own words too.

Reply with JSON only: {"say": what you say aloud, "remember": your whole note about this stranger as it stands now, at most 500 characters, "change": null, or the one decision you made, exactly as offered}.`;

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
/** Recent days in words: "today", "yesterday", "5 days ago", and years past a year. */
const agoDays = (day: number, then: number): string => {
  const d = day - then;
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 365) return `${d} days ago`;
  return yearsAgo(day, then) === 1 ? "a year ago" : `${yearsAgo(day, then)} years ago`;
};
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
    case "took-up-trade":
      return `${at}: you took up the ${e.detail} trade.`;
    case "relative-left":
      return `${at}: ${who} left ${s.name} for good.`;
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

/**
 * Where a villager is at an hour, by the same closed form every viewer's browser draws them with —
 * or null if they have no day today (an infant, or nobody of that id). What the server's proximity
 * check measures against (C44).
 */
export function whereNow(s: Settlement, plan: VillagePlan, me: Person, day: number, hour: number, changes: readonly LifeChange[] = []): Whereabouts | null {
  const { plans, boats, moorings } = dayPlans(s, plan, day, changes);
  const d = plans.find((x) => x.person === me.id);
  return d ? whereabouts(d, hour, boats, moorings) : null;
}

/** What a person is doing at an hour, in words: the mid-conversation system message. */
export function nowLine(s: Settlement, plan: VillagePlan, me: Person, day: number, hour: number, changes: readonly LifeChange[] = []): string {
  const w = whereNow(s, plan, me, day, hour, changes);
  const part = partOfDay(hour);
  let doing = "at home";
  if (w) {
    const onGreen = Math.hypot(w.x - plan.centre.x, w.y - plan.centre.y) < plan.greenRadiusM * 1.3;
    const onDock = plan.dock !== null && Math.hypot(w.x - plan.dock.root.x, w.y - plan.dock.root.y) < plan.dock.lengthM + 4;
    // At today's burial, wedding or new child's door (C52), in their place in it.
    const at = gatheringsOn(s, plan, day).find((g) => {
      const place = g.places.get(me.id);
      return place && hour >= g.t0 && hour <= g.t1 + 0.02 && Math.hypot(w.x - place.at.x, w.y - place.at.y) < 1.5;
    });
    const name = (id: string) => s.people.find((p) => p.id === id)?.given ?? "them";
    if (!w.visible) doing = "at home";
    else if (at && at.kind === "funeral") doing = `standing at ${name(at.about[0])}'s grave with the mourners — this is the burial`;
    else if (at && at.kind === "wedding") doing = at.centre.includes(me.id) ? `being married on the green, in front of everyone, to ${name(at.about.find((id) => id !== me.id)!)}` : `at ${gatheringName(s, at)}, on the green`;
    else if (at && at.kind === "naming") doing = at.centre.includes(me.id) ? "on your step with the callers, who have come to see the baby" : `at ${at.centre.map(name).join(" and ")}'s door with the callers, come to see the new baby`;
    else if (w.activity === "row") doing = "rowing your family's boat";
    else if (w.activity === "fish") doing = "out at sea in your family's boat, fishing";
    else if (w.activity === "stoop") doing = "working in the field";
    else if (w.activity === "sit") doing = "sitting on a bench on the green";
    else if (w.activity === "play") doing = "playing on the green with the other children";
    else if (w.activity === "walk") doing = "walking through the village";
    else if (w.activity === "work") doing = onDock ? "mending nets and hauling on the dock" : CRAFT_AT[occupationOn(me, day)] ?? "at work by your door";
    else if (plan.graveyard && Math.hypot(w.x - plan.graveyard.x, w.y - plan.graveyard.y) < plan.graveyard.radiusM + 3) doing = "in the graveyard";
    else if (Math.hypot(w.x - plan.arrival.x, w.y - plan.arrival.y) < 12) doing = "at the edge of the village, looking out along the way in";
    else doing = onGreen ? "on the green with your neighbours" : onDock ? "on the dock" : "by your door";
  }
  // The weather is everybody's (C48): the same sky the stranger is standing under.
  const sky = weatherWords(weatherAt(s.seed, s.cell, s.geography, day, hour, s));
  return `It is ${part} in ${s.name}. ${sky}. Right now you are ${doing}, and the stranger has stopped to talk to you. Keep to that.`;
}

// ── everything a villager knows ─────────────────────────────────────────────────

export interface VillagerContext {
  facts: string;
  /** Every name a reply may use: the village's people, living and dead, and the village. */
  names: Set<string>;
}

export function villagerContext(
  s: Settlement,
  plan: VillagePlan,
  me: Person,
  day: number,
  changes: readonly LifeChange[] = [],
  /** Another village's name, by cell (C53): where someone went, came from, or sent word from. */
  placeName: (cell: string) => string | null = () => null,
): VillagerContext {
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
  lines.push(`You are ${me.given} ${me.family}, ${age} years old${child ? ", a child" : `, a ${occupationOn(me, day)}`}, of ${s.name} — a ${summary.kind}${setting ? ` ${setting}` : ""}, where ${summary.population} people live in ${summary.households} households.`);
  const words = temperamentWords(temperamentOf(s, me));
  if (words.length) lines.push(`By temperament you are ${words.join("; ")}.`);
  if (child) lines.push("Speak like the child you are: simply, and about the things a child notices.");

  // Family, as it stands today.
  const family: string[] = [];
  if (me.partner !== null) {
    const p = s.people[me.partner];
    family.push(
      p.leftDay <= day && p.leftDay < p.deathDay
        ? `Your ${p.sex === "f" ? "wife" : "husband"} ${p.given} left ${s.name} ${when(day, p.leftDay).toLowerCase()}.`
        : p.deathDay > day
          ? `You are married to ${p.given}.`
          : `Your ${p.sex === "f" ? "wife" : "husband"} ${p.given} ${DEATH[causeOfDeath(p)] ?? "died"} ${when(day, p.deathDay).toLowerCase()}.`,
    );
  }
  const kids = me.children.map((i) => s.people[i]).filter((c) => c.birthDay <= day);
  const gone = kids.filter((c) => c.deathDay > day && c.leftDay <= day);
  if (gone.length) family.push(`Children who have left ${s.name}: ${gone.map((c) => c.given).join(", ")}.`);
  const living = kids.filter((c) => c.deathDay > day && c.leftDay > day);
  if (living.length) family.push(`Your children: ${living.map((c) => `${c.given} (${Math.floor(ageYears(c, day))})`).join(", ")}.`);
  const lost = kids.filter((c) => c.deathDay <= day);
  if (lost.length) family.push(`Children you lost: ${lost.map((c) => `${c.given}, ${when(day, c.deathDay).toLowerCase()}`).join("; ")}.`);
  if (me.parents) {
    const [m, f] = [s.people[me.parents[0]], s.people[me.parents[1]]];
    family.push(`Your mother is ${m.given}${m.deathDay <= day ? " (dead)" : ""}; your father is ${f.given}${f.deathDay <= day ? " (dead)" : ""}.`);
    const sibs = s.people[me.parents[0]].children.map((i) => s.people[i]).filter((x) => x.index !== me.index && x.birthDay <= day && x.deathDay > day && x.leftDay > day);
    if (sibs.length) family.push(`Your living brothers and sisters: ${sibs.map((x) => x.given).join(", ")}.`);
  } else if (me.incomer) {
    family.push("Your own people are far away; you have not seen them in years.");
  }
  if (family.length) lines.push(family.join(" "));

  // The animals of their house (C55): their dog by name, the goats, the hens.
  const beasts = animalsOf(s, plan, day);
  const mineDog = beasts.find((a) => a.kind === "dog" && a.follows === me.id);
  const homeOf = residentsOn(s, plan, day).find((r) => r.person.id === me.id);
  const house = homeOf ? (me.partnerDay !== null && me.partnerDay <= day ? me.household : me.bornInto) : null;
  const goats = beasts.filter((a) => a.kind === "goat" && a.household === house).length;
  const hens = beasts.filter((a) => a.kind === "hen" && a.household === house).length;
  const keep = [mineDog ? `your dog ${mineDog.name}, who goes everywhere at your heel` : null, goats ? `${goats} goats` : null, hens ? "hens" : null].filter(Boolean);
  if (keep.length) lines.push(`Your house keeps ${keep.join(", ")}.`);
  for (const a of beasts.filter((x) => x.kind === "dog" && x.follows && x.follows !== me.id && house !== null && x.household === house)) lines.push(`The family's dog, ${a.name}, follows ${people.get(a.follows!)?.given ?? "one of you"} about.`);
  const strays = beasts.filter((a) => a.id.startsWith("stray:")).map((a) => a.name);
  if (strays.length) lines.push(`${strays.join(" and ")} ${strays.length > 1 ? "are" : "is"} the village's stray${strays.length > 1 ? "s" : ""}, belonging to nobody.`);

  // What their work leaves them to spare, and the market (C58). No price, ever: there is no money.
  const spare = sparesOf(s, plan, me, day);
  if (spare.length) {
    lines.push(`What your work leaves you to spare, to trade or to give: ${spare.map((i) => ITEMS[i]?.name ?? i).join(", ")}. There is no money and nothing has a price; you trade one thing for another when you want what is offered, or like who is offering.`);
  }
  const market = plan.market ?? null;
  if (market) {
    const goers = market.goers.map((id) => people.get(id)?.given).filter(Boolean);
    const brings = market.brings.map((i) => ITEMS[i]?.name ?? i).join(" and ");
    const until = daysToMarket(market, day);
    const when = until === 0 ? "today" : until === 1 ? "tomorrow" : `in ${until} days`;
    lines.push(
      market.goers.includes(me.id)
        ? `Every sixth day is market day in ${s.name}, and you are one of those who go for it: the day before, you set off for ${market.partner.name}, ${Math.max(1, Math.round(market.partner.km))} km off, and come back with ${brings} for the stall on the green. The next market is ${when}.`
        : `Every sixth day is market day in ${s.name}: ${goers.join(", ")} go to ${market.partner.name} the day before and come back with ${brings} for the stall on the green. The next market is ${when}.`,
    );
  }

  // Between villages (C53): where they came from, where they went and came back from, and word sent.
  // Other villages' names, and the people of them named here, are names a reply may use.
  const elsewhere = new Set<string>();
  const placeName_ = placeName;
  placeName = (cell: string) => {
    const n = placeName_(cell);
    if (n) elsewhere.add(n);
    return n;
  };
  const away: string[] = [];
  if (me.fromCell !== null) {
    const home = placeName(me.fromCell) ?? "another village";
    away.push(`You came to ${s.name} from ${home} ${agoDays(day, me.arrivedDay)}; your own people are there, and you grew up there, not here`);
  }
  if (me.backDay !== Infinity && me.backDay <= day) {
    away.push(`You went away${me.toCell ? ` to ${placeName(me.toCell) ?? "another village"}` : ""} and came home ${agoDays(day, me.backDay)}`);
  }
  const mine = changes.filter((c) => c.kind === "court" && c.person === me.id && c.madeDay <= day && day - c.madeDay <= 60);
  for (const c of mine) {
    const them = c.toCell === s.cell ? s.people.find((q) => q.id === c.target) : null;
    const where = c.toCell && c.toCell !== s.cell ? ` of ${placeName(c.toCell) ?? "another village"}` : "";
    away.push(`You sent word ${agoDays(day, c.madeDay)}, by a stranger, that you would marry ${them?.given ?? "someone"}${where}, and you are waiting to hear`);
  }
  for (const c of changes.filter((c) => c.kind === "court" && c.target === me.id && c.madeDay <= day && day - c.madeDay <= 60)) {
    const suitor = s.people.find((q) => q.id === c.person);
    const spec = c.spec;
    const name = suitor?.given ?? spec?.given ?? "someone";
    if (spec) {
      elsewhere.add(spec.given);
      elsewhere.add(spec.family);
    }
    const age = suitor ? Math.floor(ageYears(suitor, day)) : spec ? Math.floor((day - spec.birthDay) / 365) : null;
    const trade = suitor ? occupationOn(suitor, day) : spec?.occupation;
    const where = c.fromCell ? ` of ${placeName(c.fromCell) ?? "another village"}` : "";
    away.push(`${name}${age !== null ? `, ${age},` : ""}${trade ? ` a ${trade}` : ""}${where}, sent word by a stranger ${agoDays(day, c.madeDay)} that they would marry you, if you will have them`);
  }
  // A visit to meet someone (C53): coming, or come and gone.
  for (const c of changes.filter((c) => c.kind === "arrive" && c.spec?.visiting && c.spec.hostOf === me.id)) {
    const where = c.fromCell ? placeName(c.fromCell) ?? "another village" : "another village";
    if (c.spec) elsewhere.add(c.spec.given);
    away.push(
      c.day > day
        ? `${c.spec!.given} of ${where} is coming to visit you in ${c.day - day} days, to meet you, with a mind to marry if you take to each other; they will stay with your family for the day`
        : c.day === day
          ? `${c.spec!.given} of ${where} has come to visit you today, to meet you; they are staying with your family, and you will spend the evening together on the green`
          : `${c.spec!.given} of ${where} came to visit you ${agoDays(day, c.day)}, to meet you, and you spent the evening together on the green`,
    );
  }
  const went = changes.find((c) => c.kind === "leave" && c.person === me.id && c.toCell && changes.some((d) => d.kind === "arrive" && d.person === me.id && d.day === c.day + 1));
  if (went && went.toCell) {
    const where = placeName(went.toCell) ?? "another village";
    const host = changes.find((c) => c.kind === "court" && c.target === me.id && c.fromCell === went.toCell)?.spec?.given ?? "someone";
    away.push(went.day > day ? `You are going to ${where} in ${went.day - day} days, for a day, to meet ${host}` : `You went to ${where} for a day ${agoDays(day, went.day)}, to meet ${host}, and spent the evening with them on their green`);
  }
  if (me.leftDay > day && me.leftDay !== Infinity && me.toCell) {
    const word = changes.find((c) => c.kind === "court" && c.target === me.id && c.fromCell === me.toCell);
    if (word) away.push(`You are going to ${placeName(me.toCell) ?? "another village"} in ${me.leftDay - day} days, to marry ${word.spec?.given ?? "them"} there`);
  }
  if (away.length) lines.push(`${away.join(". ")}.`);

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

  // What they want, and what they have decided (C44).
  if (!child) {
    const goals = goalsOf(s, me, day, changes);
    // A goal that takes time says how far along it is, and who helped (C50): the help is a fact, not a debt.
    const left = (g: { doneDay: number | null }) => (g.doneDay !== null ? `, about ${g.doneDay - day} days' work left` : "");
    const helped = (g: { helped: number; source: string }) =>
      g.helped === 0
        ? ""
        : g.source === "help"
          ? g.helped > 1
            ? `; helped along ${g.helped - 1} more time${g.helped > 2 ? "s" : ""} since`
            : ""
          : `; somebody has helped you along with it${g.helped > 1 ? `, ${g.helped} times` : ""}`;
    const wants = goals.active.map((g) =>
      g.source === "talk"
        ? `${g.text} (you decided this ${agoDays(day, g.since)}, after talking with a stranger${left(g)}${helped(g)})`
        : g.source === "help"
          ? `${g.text} (you began it in earnest ${agoDays(day, g.since)}, when somebody brought you what you needed for it${left(g)}${helped(g)})`
          : g.text,
    );
    if (wants.length) lines.push(`What you want: ${wants.join("; ")}.`);
    if (goals.done.length) lines.push(`What you set out to do and did: ${goals.done.map((g) => `${g.text}, done ${agoDays(day, g.doneDay!)}`).join("; ")}.`);
  }
  // Today's burial, wedding or callers, and what the village knows is coming (C52).
  const today: string[] = [];
  for (const g of gatheringsOn(s, plan, day)) {
    const name = (id: string) => people.get(id)?.given ?? "someone";
    if (g.kind === "wedding" && g.centre.includes(me.id)) today.push(`Today is your wedding day: you marry ${name(g.about.find((id) => id !== me.id)!)} on the green this afternoon`);
    else if (g.kind === "funeral" && g.family.includes(me.id)) {
      const dead = people.get(g.about[0]);
      const who = dead ? kin(s, me, dead) : "";
      today.push(`${name(g.about[0])}${who ? `, ${who},` : ""} died yesterday; the burial is this afternoon, and you go with the family and home after`);
    }
    else if (g.kind === "naming" && g.centre.includes(me.id)) today.push("Your baby was born yesterday; this afternoon the family and your friends call at the door");
    else if (g.places.has(me.id)) today.push(`This afternoon is ${gatheringName(s, g)}, and you are going`);
    else today.push(`This afternoon is ${gatheringName(s, g)}; you are not going`);
  }
  for (const c of comingOn(s, plan, day, changes)) {
    if (c.day === day && c.kind !== "expecting" && c.kind !== "ailing" && c.kind !== "omen") continue;
    // A death on its way (C66), as the one it is coming to knows it.
    if (c.kind === "ailing" && c.about.includes(me.id)) today.push("You are ill and keep to your bed, and you fear it is serious");
    else if (c.kind === "omen" && c.about.includes(me.id)) today.push(`You mean to go out in the boat ${c.day === day ? "today" : "tomorrow"}, though the sky does not look right; the catch will not wait`);
    else if (c.kind === "expecting" && c.about.includes(me.id)) today.push("You are expecting a child, any day now");
    else if (c.kind === "wedding" && c.about.includes(me.id)) {
      const other = c.about.find((id) => id !== me.id)!;
      today.push(`You are to marry ${people.get(other)?.given ?? "them"} ${c.day - day === 1 ? "tomorrow" : `in ${c.day - day} days`}`);
    } else today.push(c.words);
  }
  if (today.length) lines.push(`In ${s.name} now: ${today.join("; ")}.`);

  const leaving = me.leftDay !== Infinity && me.leftDay > day;
  if (leaving) {
    const withMe = s.people.filter((p) => p.index !== me.index && p.leftDay === me.leftDay && present(s, p, day));
    const own = changes.some((c) => c.person === me.id && c.kind === "leave");
    lines.push(
      `${own ? "You have decided to leave" : "Your family has decided to leave"} ${s.name} for good, in ${me.leftDay - day} days${withMe.length ? `, with ${withMe.map((p) => p.given).join(" and ")}` : ""}.`,
    );
  }

  // What everybody in the village knows has been decided lately, by others.
  const lately = changes
    .filter((c) => c.person !== me.id && day - c.madeDay <= 90 && (c.kind === "leave" || c.kind === "stay" || c.kind === "trade" || (c.kind === "arrive" && c.day <= day)))
    .map((c) => {
      const p = people.get(c.person);
      if (!p) return null;
      const ago = agoDays(day, c.madeDay);
      const to = c.kind === "leave" && c.toCell ? ` for ${placeName(c.toCell) ?? "another village"}` : "";
      if (c.kind === "leave") return p.leftDay <= day ? `${p.given} ${p.family} left ${s.name} for good${to} ${agoDays(day, p.leftDay)}` : `${p.given} ${p.family} decided ${ago} to leave ${s.name}${to}`;
      if (c.kind === "arrive") return `${p.given} ${p.family} came to ${s.name}${c.fromCell ? ` from ${placeName(c.fromCell) ?? "another village"}` : ""} ${agoDays(day, c.day)}`;
      if (c.kind === "stay") return `${p.given} ${p.family} decided ${ago} to stay after all`;
      return `${p.given} ${p.family} took up the ${c.occupation} trade ${ago}`;
    })
    .filter((x): x is string => x !== null);
  if (lately.length) lines.push(`Lately in ${s.name}: ${lately.join("; ")}.`);

  // Everyone knows everyone: the village as it is today.
  const roster = s.people.filter((p) => present(s, p, day) && p.index !== me.index);
  lines.push(`Who lives in ${s.name} now: ${roster.map((p) => {
    const r = kin(s, me, p);
    const a = Math.floor(ageYears(p, day));
    return `${p.given} ${p.family} (${a}${a >= 13 ? `, ${occupationOn(p, day)}` : ""}${r ? `, ${r}` : ""})`;
  }).join("; ")}.`);
  const graves = s.people.filter((p) => p.deathDay <= day && present(s, p, p.deathDay - 1)).length;
  lines.push(`There are ${graves} graves in the yard beyond the houses.`);

  // The village's dogs have names too (C55), and a reply may say them.
  const names = new Set<string>([s.name, ...elsewhere, ...beasts.map((a) => a.name).filter((n): n is string => n !== null), ...(market ? [market.partner.name] : [])]);
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
export function mockReply(s: Settlement, me: Person, day: number, turn: number, need: string | null = null): string {
  const age = Math.floor(ageYears(me, day));
  const lines = [
    `I'm ${me.given}${age >= 13 ? `, ${occupationOn(me, day)} here in ${s.name}` : ` — I live in ${s.name}`}.`,
    // What they would ask for this week (C50), even without a model to say it in their own words.
    need ? `${need}.`.replace(/([.?!])\.$/, "$1") : me.partner !== null && s.people[me.partner].deathDay > day ? `My ${s.people[me.partner].sex === "f" ? "wife" : "husband"} ${s.people[me.partner].given} will be wondering where I've got to.` : `It's a quiet place, ${s.name}. You get used to it.`,
    `I can't stand here all day, stranger. There's work.`,
  ];
  return lines[turn % lines.length];
}

// ── the stranger, as this villager remembers them (C44) ─────────────────────────

/** What a villager remembers of a stranger, as the route reads it from the store. */
export interface StrangerMemory {
  note: string;
  /** Conversations begun, counting this one. */
  meetings: number;
  firstDay: number;
  lastDay: number;
}

/** The late note's account of who this stranger is to the villager. */
export function strangerLine(memory: StrangerMemory | null, day: number): string {
  if (memory === null || memory.meetings <= 1) {
    return memory && memory.note
      ? `You have just met this stranger, earlier in this same conversation. Your note so far: ${memory.note}`
      : "You have never met this stranger before.";
  }
  const before = memory.meetings - 1;
  const first = agoDays(day, memory.firstDay);
  return (
    `You have met this stranger before: ${before === 1 ? "once" : `${before} times`}, the first time ${first}. ` +
    (memory.note ? `Your note about them: ${memory.note}` : "You noted nothing about them.")
  );
}

// ── what they could decide today (C44) ──────────────────────────────────────────

/** A decision as the model returns it: the shape {@link REPLY_SCHEMA} allows. */
export type SaidChange =
  | { kind: "leave"; in_days: number }
  | { kind: "stay" }
  | { kind: "trade"; trade: string }
  | { kind: "goal"; goal: string; about: string | null; trade: string | null }
  | { kind: "drop"; goal: string }
  | { kind: "court"; about: string }
  | { kind: "return" }
  | { kind: "invite" };

export interface Offer {
  /** The JSON the model would return for it. */
  change: SaidChange;
  /** What it means, in the villager's terms. */
  means: string;
}

/** Strangers need to have met a villager before for these, however moving the conversation. */
const TRUSTED_KINDS = new Set(["leave", "trade", "court", "return"]);

/** Someone a stranger could tell this villager of (C53): met by the stranger, unmarried, a possible match. */
export interface Introducible {
  person: Person;
  cell: string;
  village: string;
  km: number;
  /** They have already sent word (since they met, if they have) that they would meet, or marry, this villager. */
  asked: boolean;
  /** The day one came to visit the other, or null; people of one village have always met. */
  met: number | null;
  /** Their village, for reading their temperament where it was drawn. */
  parcel?: { settlement: Settlement };
}

/**
 * Every decision this villager could make today, as offers for the model. Each was run through
 * `checkChange` against the world as it now is, so an offer is one the route will accept. `meetings`
 * gates what a near stranger could talk anyone into: leaving and taking up a trade want a second
 * meeting at least.
 */
export function decisionsOffered(
  s: Settlement,
  me: Person,
  day: number,
  changes: readonly LifeChange[],
  meetings: number,
  /** C53: whom the stranger could tell them of, and the village they came from (by name), if any. C54: whether they are at their own door. */
  between: { singles?: readonly Introducible[]; home?: string | null; atHome?: boolean } = {},
): Offer[] {
  const offers: Offer[] = [];
  const fits = (p: Proposal) => checkChange(s, me, day, p, changes).ok;
  const full = (p: Person) => `${p.given} ${p.family}`;
  const trusted = meetings >= 2;

  // Goals: each kind once, with the plainest person it could be about.
  const kin = s.people.filter((p) => p.index !== me.index && relation(s, p, me) !== "none");
  for (const kind of GOAL_KINDS) {
    const spec = GOALS[kind];
    if (kind === "learn-trade") {
      if (goalFits(s, me, day, kind, null, "healer")) {
        offers.push({ change: { kind: "goal", goal: kind, about: null, trade: "<a trade>" }, means: "to want to learn another trade (name it)" });
      }
      continue;
    }
    if (!spec.needsTarget) {
      if (fits({ kind: "goal", goal: kind })) offers.push({ change: { kind: "goal", goal: kind, about: null, trade: null }, means: `to want ${spec.text}` });
      continue;
    }
    for (const p of kin) {
      if (!fits({ kind: "goal", goal: kind, target: p.id })) continue;
      offers.push({ change: { kind: "goal", goal: kind, about: full(p), trade: null }, means: `to want ${spec.text.replace("{name}", p.given)}` });
      break;
    }
  }
  for (const g of goalsOf(s, me, day, changes).active) {
    offers.push({ change: { kind: "drop", goal: g.id }, means: `to give up wanting ${g.text}` });
  }
  if (trusted && fits({ kind: "trade", occupation: occupationOn(me, day) === "labourer" ? "farmer" : "labourer" })) {
    offers.push({ change: { kind: "trade", trade: "<a trade>" }, means: "to take up another trade, from tomorrow (name it)" });
  }
  if (trusted && fits({ kind: "leave", inDays: 7 })) {
    const partner = me.partner !== null && present(s, s.people[me.partner], day) ? s.people[me.partner] : null;
    const young = me.children.map((i) => s.people[i]).filter((c) => present(s, c, day) && ageYears(c, day) < 16);
    const taking = [partner ? `${partner.given}` : null, young.length ? "your young children" : null].filter(Boolean).join(" and ");
    offers.push({
      change: { kind: "leave", in_days: 7 },
      means: `to leave ${s.name} for good, in ${CHANGE_LIMITS.leaveNoticeMinDays} to ${CHANGE_LIMITS.leaveNoticeMaxDays} days${taking ? `, taking ${taking}` : ""}`,
    });
  }
  if (fits({ kind: "stay" })) offers.push({ change: { kind: "stay" }, means: "not to leave after all" });
  // C54: at their own door, or in their own house — they may ask the stranger in. Nothing is decided
  // about their life by it; it opens their door to this stranger for the day.
  if (between.atHome) offers.push({ change: { kind: "invite" }, means: "to ask the stranger into your house, today, if you would have them in — they could come in through the door" });
  // C53: word sent by the stranger to someone they could marry; going home to where they came from.
  if (trusted) {
    for (const x of between.singles ?? []) {
      const them = { id: x.person.id, sex: x.person.sex, birthDay: x.person.birthDay };
      if (!fits({ kind: "court", target: x.person.id, toCell: x.cell, them })) continue;
      const where = x.km === 0 ? `here in ${s.name}` : `of ${x.village}, ${Math.round(x.km)} km off`;
      const age = Math.floor(ageYears(x.person, day));
      const nature = temperamentWords(temperamentOf(x.parcel?.settlement ?? s, x.person)).slice(0, 2).join(" and ");
      const who = `${x.person.given} ${x.person.family} (${age}, a ${occupationOn(x.person, day)}, ${where}${nature ? `; by the stranger's account ${nature}` : ""})`;
      // Two steps between villages (C53): to meet first — one comes to visit — and only then to marry.
      if (x.met === null && x.km > 0) {
        offers.push({
          change: { kind: "court", about: `${x.person.given} ${x.person.family}` },
          means: x.asked
            ? `to send word back that you would like to meet ${who} too: they have sent word that they would like to meet you — they would come to visit you in two days`
            : `to send word by the stranger that you would like to meet ${who}, with a mind to marry if you take to each other — someone the stranger has met; nothing is promised by it`,
        });
        continue;
      }
      offers.push({
        change: { kind: "court", about: `${x.person.given} ${x.person.family}` },
        means: x.asked
          ? `to send word back that you will marry ${who}, who has sent word that they would marry you${x.met !== null ? ` — you met ${agoDays(day, x.met)}, when one of you came to visit` : ""}; the wedding would be a week from now`
          : `to send word by the stranger that you would marry ${who}, if they will have you${x.met !== null ? ` — you met ${agoDays(day, x.met)}, when one of you came to visit` : ""}`,
      });
    }
    if (me.fromCell !== null && between.home && fits({ kind: "return" })) {
      offers.push({ change: { kind: "return" }, means: `to go home to ${between.home}, where you came from, for good, in ${CHANGE_LIMITS.leaveNoticeMinDays} days` });
    }
  }
  return offers;
}

/** The late note's list of decisions, or the sentence that there are none worth offering. */
export function decisionsLine(offers: readonly Offer[], meetings: number): string {
  const lines = offers.map((o) => `- ${JSON.stringify(o.change)} — ${o.means}`);
  const trust = meetings >= 2 ? "" : " Leaving this place, taking up another trade or deciding whom to marry is not something you would do on the word of someone you have only just met.";
  return lines.length === 0
    ? `There is nothing you could decide about your life today: "change" is null.${trust}`
    : `What you could decide today, if this conversation truly moves you — otherwise "change" is null:\n${lines.join("\n")}${trust}`;
}

// ── the reply ───────────────────────────────────────────────────────────────────

const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

/** The JSON the model must answer in: what they say, their note, and at most one decision. */
export const REPLY_SCHEMA = {
  type: "object",
  properties: {
    say: { type: "string" },
    remember: { type: "string" },
    change: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["leave"] }, in_days: { type: "integer" } },
          required: ["kind", "in_days"],
          additionalProperties: false,
        },
        { type: "object", properties: { kind: { type: "string", enum: ["stay"] } }, required: ["kind"], additionalProperties: false },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["trade"] }, trade: { type: "string", enum: [...OCCUPATIONS] } },
          required: ["kind", "trade"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["goal"] },
            goal: { type: "string", enum: [...GOAL_KINDS] },
            about: NULLABLE_STRING,
            trade: { anyOf: [{ type: "string", enum: [...OCCUPATIONS] }, { type: "null" }] },
          },
          required: ["kind", "goal", "about", "trade"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["drop"] }, goal: { type: "string" } },
          required: ["kind", "goal"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { kind: { type: "string", enum: ["court"] }, about: { type: "string" } },
          required: ["kind", "about"],
          additionalProperties: false,
        },
        { type: "object", properties: { kind: { type: "string", enum: ["return"] } }, required: ["kind"], additionalProperties: false },
        { type: "object", properties: { kind: { type: "string", enum: ["invite"] } }, required: ["kind"], additionalProperties: false },
      ],
    },
  },
  required: ["say", "remember", "change"],
  additionalProperties: false,
} as const;

export interface Reply {
  say: string;
  remember: string;
  change: SaidChange | null;
}

/** The model's JSON, read defensively: a shape the schema should have prevented is "no reply". */
export function parseReply(text: string): Reply | null {
  let v: unknown;
  try {
    v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.say !== "string" || typeof o.remember !== "string") return null;
  const c = o.change;
  let change: SaidChange | null = null;
  if (c && typeof c === "object") {
    const k = (c as { kind?: unknown }).kind;
    if (k === "leave" || k === "stay" || k === "trade" || k === "goal" || k === "drop" || k === "court" || k === "return" || k === "invite") change = c as SaidChange;
  }
  return { say: o.say.trim(), remember: o.remember.trim(), change };
}

/** A decision the model made, as a `Proposal` the world can check: names resolved to ids. */
export function proposalFrom(change: SaidChange, s: Settlement, singles: readonly Introducible[] = []): Proposal | null {
  const isTrade = (t: string | null | undefined): t is Occupation => !!t && (OCCUPATIONS as readonly string[]).includes(t);
  switch (change.kind) {
    case "leave":
      return Number.isFinite(change.in_days) ? { kind: "leave", inDays: change.in_days } : null;
    case "stay":
      return { kind: "stay" };
    case "trade":
      return isTrade(change.trade) ? { kind: "trade", occupation: change.trade } : null;
    case "drop":
      return typeof change.goal === "string" ? { kind: "drop", goalId: change.goal } : null;
    case "goal": {
      if (!(GOAL_KINDS as readonly string[]).includes(change.goal)) return null;
      const goal = change.goal as GoalKind;
      let target: string | null = null;
      if (change.about) {
        const name = change.about.trim().toLowerCase();
        const matches = s.people.filter((p) => `${p.given} ${p.family}`.toLowerCase() === name);
        if (matches.length !== 1) return null;
        target = matches[0].id;
      }
      return { kind: "goal", goal, target, occupation: isTrade(change.trade) ? change.trade : null };
    }
    case "court": {
      // Only someone the stranger could tell them of: the offered list, by full name, exactly one.
      const name = (change.about ?? "").trim().toLowerCase();
      const m = singles.filter((x) => `${x.person.given} ${x.person.family}`.toLowerCase() === name);
      if (m.length !== 1) return null;
      const x = m[0];
      return { kind: "court", target: x.person.id, toCell: x.cell, them: { id: x.person.id, sex: x.person.sex, birthDay: x.person.birthDay } };
    }
    case "return":
      return { kind: "return" };
    case "invite":
      return null; // not a change to a life: the route answers it itself (C54)
  }
}

/** A recorded change, in words for the panel: "Senka has decided to build a boat of her own." */
export function changeWords(c: LifeChange, s: Settlement, day: number, placeName: (cell: string) => string | null = () => null): string {
  const p = s.people.find((q) => q.id === c.person);
  const name = p ? p.given : "They";
  const their = p?.sex === "f" ? "her" : "his";
  const target = c.target ? s.people.find((q) => q.id === c.target) : undefined;
  switch (c.kind) {
    case "leave": {
      const to = c.toCell ? placeName(c.toCell) : null;
      if (p?.fromCell && c.toCell === p.fromCell) return `${name} has decided to go home to ${to ?? "where they came from"}, in ${c.day - day} days.`;
      return `${name} has decided to leave ${s.name} for good, in ${c.day - day} days${to ? `, for ${to}` : ""}.`;
    }
    case "court": {
      const to = c.toCell ? placeName(c.toCell) : null;
      return `${name} has sent word by you${to && c.toCell !== s.cell ? ` to ${to}` : ""}: ${p?.sex === "f" ? "she" : "he"} would marry them, if they will have ${p?.sex === "f" ? "her" : "him"}.`;
    }
    case "arrive":
      return `${c.spec?.given ?? name} has come to ${s.name}${c.fromCell ? ` from ${placeName(c.fromCell) ?? "another village"}` : ""}.`;
    case "pair": {
      const other = s.people.find((q) => q.id === c.target)?.given ?? "them";
      return `${name} and ${other} are to be married, in ${c.day - day} days.`;
    }
    case "stay":
      return `${name} has decided to stay in ${s.name} after all.`;
    case "trade":
      return `${name} will take up the ${c.occupation} trade from tomorrow.`;
    case "drop":
      return `${name} has let go of something ${p?.sex === "f" ? "she" : "he"} wanted.`;
    case "goal": {
      const spec = c.goal ? GOALS[c.goal] : null;
      if (!spec) return `${name} has decided something.`;
      const text = spec.text.replace("{name}", target?.given ?? "someone").replace("{trade}", c.occupation ?? "trade").replace(/\bmy\b/g, their).replace(/\bme\b/g, p?.sex === "f" ? "her" : "him");
      return `${name} has decided ${text.startsWith("to ") ? "" : "to want "}${text}.`;
    }
    case "met": {
      // A need met (C50): what the stranger did, from where the village stands.
      const spec = c.goal ? GOALS[c.goal] : null;
      if (!spec) return `${name} has what ${p?.sex === "f" ? "she" : "he"} needed.`;
      const text = spec.text.replace("{name}", target?.given ?? "someone").replace("{trade}", c.occupation ?? "trade").replace(/\bmy\b/g, their).replace(/\bme\b/g, p?.sex === "f" ? "her" : "him");
      return `${name}'s ${text.replace(/^(a |to )/, "")} is nearer for your help.`.replace("'s own", "'s");
    }
    // A death met on its way (C66): what was done, never what will come of it.
    case "tend":
      return c.by === "herbs" ? `You left herbs for ${name}.` : `You fetched the healer to ${name}.`;
    case "ashore":
      return `${name} stays ashore ${c.day === day ? "today" : "tomorrow"}, at your asking.`;
  }
}

/**
 * What this villager would ask a stranger for this week (C50), for the note that rides after the
 * conversation: it changes when somebody meets it, so it is not in the day's cached facts.
 */
export function needLine(
  s: Settlement,
  plan: VillagePlan | null,
  me: Person,
  day: number,
  changes: readonly LifeChange[],
  effects: readonly WorldEffect[],
  deeds: readonly Deed[] = [],
): string {
  const n = needOf(s, plan, me, day, changes, effects);
  if (n) {
    const what = n.item ? `${ITEMS[n.item]?.name ?? n.item}, handed to you or left at your door` : n.verb === "tend" ? "the field weeded" : "the grave tidied";
    return `On your mind this week, and something you might ask a kind stranger for: "${n.text}". Only ${what} would meet it. Ask in your own words if it comes up, or if they offer — never as a bargain, and never offer anything for it.`;
  }
  // Met this week: say what was done and whether it was THIS stranger, or a villager who asked them
  // asks after a thing somebody else already did (C50's real-model check, which is how it was found).
  const week = Math.floor(day / NEEDS.weekDays);
  const met = changes.find((c) => c.kind === "met" && c.person === me.id && c.goalId?.startsWith(`${me.id}/${week}/`) && c.madeDay <= day);
  if (!met) return "";
  const what = met.goalId!.split("/").pop()!.replace(/^goal:/, "");
  const done =
    what === "grave" ? "tidied the grave you had let go" : what === "field" ? "put your trampled field right" : what === "elder" ? "brought the berries you wanted to take round" : `brought you ${ITEMS[what]?.name ?? "what you needed"}`;
  const theirs = deeds.some((d) => d.met?.includes(me.id) && d.day >= week * NEEDS.weekDays && d.day <= day);
  return theirs
    ? `This stranger ${done}, this week — the very thing you needed. You know it was them, and you are grateful.`
    : `Somebody ${done} this week — not this stranger. It is done, and you are glad of it; there is nothing left to ask anyone for.`;
}

/** For the panel's first line: the oldest of a villager's memories of you, in words, or null. */
export function recognition(memory: StrangerMemory | null, name: string, day: number): string | null {
  if (memory === null || memory.meetings <= 1) return null;
  return `${name} remembers you — you last spoke ${agoDays(day, memory.lastDay)}.`;
}

export { LIVING_MEMORY_YEARS };
