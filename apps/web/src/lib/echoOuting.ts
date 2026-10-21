/**
 * The echo's body, out in the world while the stranger is away (DECISIONS C64). Server-only.
 *
 * WHEN. There is no worker and no presence anywhere, so an absence is found when the stranger comes
 * back: the page says when it was last open (`markSeen`), and on return the gap since is the absence.
 * One of at least `OUTING.awayMs`, and no outing in the last `OUTING.gapMs`, is filled in then, in
 * the world as it was at those times. The world is a function of the seed and the clock, so "then" is
 * exact: who was out, where, doing what.
 *
 * WHERE AND WHOM. The village the stranger was last in, else the one their house stands in, else the
 * last they talked in. Up to `OUTING.meetings` people, out of doors at some hour of the absence: those
 * the stranger already knows there first, then people they have not met.
 *
 * WHAT IT SAYS: the old world's copilot, unchanged in kind. Every line is the engine's
 * (`/agent/turn`): spoken AS the stranger, from their posterior and their own past, and put to the
 * autonomy gate. `auto` is said. `ask` or `copilot` is held back and kept, so the stranger can say on
 * return whether they would have said it. Buckets: `first_greeting` for someone never met,
 * `smalltalk` after that, the old world's own two. Stakes are low.
 *
 * WHAT THE VILLAGER HEARS: the stranger. They are told what they would know of the stranger
 * (`strangerNotes`, the talk route's own), and they remember the meeting as one with the stranger, in
 * their own note. That is what an echo living one's life is. But no decision is offered to them in it:
 * the echo never moves anyone's life (no leaving, courting, trading, no invitation). The echo does
 * nothing to anything else, and nothing it does is measured: its lines are not the person.
 *
 * WHAT IT COSTS: two engine turns (each four small-model drafts) and up to two villager replies a
 * person, three people at most, and nothing at all without an engine that can speak (a mocked
 * engine fills no outing). A deadline stops new calls before the route's own runs out.
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { ageYears, dayPlans, present, timeOfDay, whereabouts, worldClock, worldDayIndex, WORLD_DAY_S, WORLD_EPOCH, type LifeChange, type Person, type SettledParcel } from "@echo/planet";

import type { EchoLine, EchoTurn, Encounter, Outing } from "@/lib/echoTypes";
import { agentTurn } from "@/lib/ml";
import { villageNamed } from "@/lib/moves";
import { strangerNotes } from "@/lib/strangerNotes";
import { REPLY_SCHEMA, VILLAGER_PREAMBLE, decisionsLine, mockReply, needLine, nowLine, parseReply, strangerLine, unknownNames, villagerContext, type StrangerMemory } from "@/lib/villager";
import { loadVillage } from "@/lib/villageTalk";
import type { VillageStore } from "@/lib/villageStore";

export const OUTING = {
  /** An absence shorter than this is a pause, not an absence. */
  awayMs: 30 * 60 * 1000,
  /** At most one outing in this long. */
  gapMs: 3 * 60 * 60 * 1000,
  /** People met in one outing, at most; of whom at most this many already known. */
  meetings: 3,
  known: 2,
  /** Lines the echo would say to one person, at most. */
  lines: 2,
  /** An unread outing is told for this long. */
  unreadMs: 7 * 24 * 60 * 60 * 1000,
  /**
   * No new model call is begun after this long into making one. A meeting already begun runs on
   * (about fourteen seconds more), and a cold start costs about ten, inside the route's sixty.
   */
  deadlineMs: 30_000,
} as const;

const CLOCK = worldClock(WORLD_EPOCH);

function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Shorter waits for trying it out, never in production: `ECHO_AWAY_MS` and `ECHO_OUTING_GAP_MS`.
 * Read at call time, so a check run can set them for its own server.
 */
const knob = (name: string, fallback: number) => {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return fallback;
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** The absence to fill, from when the stranger was last seen: null when it was too short, or never. */
export function absenceOf(seen: { at: string; cell: string } | null, now: number): { from: number; to: number; cell: string } | null {
  if (!seen) return null;
  const from = Date.parse(seen.at);
  return now - from >= knob("ECHO_AWAY_MS", OUTING.awayMs) ? { from, to: now, cell: seen.cell } : null;
}

/** Whether another outing may be made now. */
export function mayGoOut(outings: readonly Outing[], now: number): boolean {
  return !outings.some((o) => now - Date.parse(o.madeAt) < knob("ECHO_OUTING_GAP_MS", OUTING.gapMs));
}

/** The unread outing to tell, if any. */
export function untold(outings: readonly Outing[], now: number): Outing | null {
  return outings.filter((o) => o.readAt === null && now - Date.parse(o.madeAt) < OUTING.unreadMs).sort((a, b) => b.madeAt.localeCompare(a.madeAt))[0] ?? null;
}

/** Whom to meet: the known first (most recently met first), then people never met, chosen by the seed. */
export function whomToMeet(s: SettledParcel["settlement"], day: number, known: readonly string[], seed: string): Person[] {
  const alive = (p: Person, age: number) => present(s, p, day) && ageYears(p, day) >= age;
  const knownPeople = known.map((id) => s.people.find((p) => p.id === id)).filter((p): p is Person => !!p && alive(p, 13)).slice(0, OUTING.known);
  const fresh = s.people
    .filter((p) => alive(p, 16) && !known.includes(p.id))
    .map((p) => ({ p, k: unit(`${seed}|${p.id}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
  return [...knownPeople, ...fresh].slice(0, OUTING.meetings);
}

/**
 * When, in the absence, someone could be met: out of doors, ashore, by day. Each person has a slot,
 * spread across the absence in order, and is looked for from there over at most a world day.
 */
export function whenOut(
  village: SettledParcel,
  changes: readonly LifeChange[],
  person: string,
  from: number,
  to: number,
  slot: number,
  slots: number,
  seed = "",
): { at: number; day: number; hour: number; x: number; y: number; activity: string } | null {
  // Spread across the absence in order, and across the hours of a day: not every meeting at one hour.
  const start = from + ((to - from) * (slot + 0.5)) / slots - unit(`${seed}|${slot}`) * WORLD_DAY_S * 1000 * 0.5;
  const step = (WORLD_DAY_S * 1000) / 48;
  const plansOf = new Map<number, ReturnType<typeof dayPlans>>();
  for (let t = start; t <= Math.min(to, start + WORLD_DAY_S * 1000); t += step) {
    const day = worldDayIndex(CLOCK, t);
    const hour = timeOfDay(CLOCK, t);
    if (hour < 0.3 || hour > 0.8) continue;
    if (!plansOf.has(day)) plansOf.set(day, dayPlans(village.settlement, village.plan, day, changes));
    const { plans, boats, moorings } = plansOf.get(day)!;
    const d = plans.find((p) => p.person === person);
    if (!d) continue;
    const w = whereabouts(d, hour, boats, moorings);
    if (w.visible && w.boat === null) return { at: Math.round(t), day, hour, x: w.x, y: w.y, activity: w.activity };
  }
  return null;
}

const hourWords = (h: number) => (h < 0.42 ? "in the morning" : h < 0.58 ? "around midday" : h < 0.7 ? "in the afternoon" : "towards evening");

/** What the echo is told before it speaks: where, who, what they are doing, and whether they have met. */
export function contextFor(village: string, p: Person, age: number, activity: string, hour: number, memory: StrangerMemory | null, heard: string | null, earlier: readonly string[] = []): string {
  const met = memory ? `You have met ${p.given} ${memory.meetings === 1 ? "once" : `${memory.meetings} times`} before.` : `You have never met ${p.given}.`;
  const what = activity ? `, ${activity.replace(/_/g, " ")}` : "";
  const line = heard ? ` ${p.given} has just said to you: "${heard}"` : "";
  const before = earlier.length ? ` Earlier on this outing: ${earlier.join(" ")}` : "";
  return (
    `You are the stranger, a newcomer in ${village}, a village by the sea, ${hourWords(hour)}. ${p.given} ${p.family} is one of the villagers: ${age}, a ${p.occupation}${what}. ` +
    `You are not ${p.given}; you are speaking to ${p.given}.${before} ${met}${line} ` +
    "Answer with only the words you would say aloud to them, a sentence or two: no actions, no narration, no quotation marks."
  );
}

/** What the echo says, as words only: what is in quotation marks if it wrote more round it, and no stage directions. */
export function spokenOnly(line: string): string {
  const quoted = [...line.matchAll(/["“]([^"”]{2,})["”]/g)].map((m) => m[1]!.trim());
  const bare = line.replace(/\*[^*]*\*/g, " ").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const said = quoted.length && quoted.join(" ").length >= bare.length * 0.3 ? quoted.join(" ") : bare;
  return said.replace(/^["“]|["”]$/g, "").trim();
}

/** What the echo walks up with: the old world's own opening. */
export const OPENING = (given: string) => `(You walk up to ${given}, who looks up at you.)`;

/** The most telling sentence a villager said in a meeting: the longest of their first sentences. */
export function gistOf(e: Pick<Encounter, "lines">): string | null {
  const firsts = e.lines.filter((l) => l.who === "villager").map((l) => (l.text.match(/^.{1,160}?[.!?](\s|$)/)?.[0] ?? l.text.slice(0, 160)).trim());
  return firsts.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** The outing in the echo's own words, first person, for the stranger: short, and only what happened. */
export function narration(o: Outing): string {
  if (!o.village || o.encounters.length === 0) {
    return o.reason === "no_village" ? "I walked your land while you were away. There was nobody to meet." : "I went out while you were away, but nobody was about.";
  }
  const parts = [`While you were away I went to ${o.village}.`];
  for (const e of o.encounters) {
    if (!e.spoke) {
      parts.push(`I saw ${e.given}, but I held back: I was not sure what you would say.`);
      continue;
    }
    const gist = gistOf(e);
    parts.push(`I talked with ${e.given}${gist ? `, who said: "${gist}"` : "."}`);
    if (e.turns.length > 1 && e.turns.at(-1)!.decision !== "auto") parts.push(`There was more I could have said to ${e.given}; I left it for you.`);
  }
  return parts.join(" ");
}

// ── the villager's side ─────────────────────────────────────────────────────────

const MODEL = () => process.env.VILLAGER_MODEL || "claude-opus-5-5";

/** A villager's reply to the echo, exactly as to the stranger, but with no decision offered. */
async function villagerReply(args: {
  store: VillageStore | null;
  subject: string;
  cell: string;
  village: SettledParcel;
  changes: readonly LifeChange[];
  me: Person;
  day: number;
  hour: number;
  memory: StrangerMemory | null;
  meetings: number;
  history: EchoLine[];
  message: string;
}): Promise<{ say: string; remember: string | null }> {
  const { store, subject, cell, village, changes, me, day, hour } = args;
  const s = village.settlement;
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) return { say: mockReply(s, me, day, args.history.length / 2), remember: null };
  const placeName = (c: string) => villageNamed(c)?.name ?? null;
  const { facts, names } = villagerContext(s, village.plan, me, day, changes, placeName);
  const notes = await strangerNotes(store, subject, cell, village, me, day, names);
  const effects = store ? ((await store.effectsFor(cell, day)) ?? []) : [];
  const wanting = needLine(s, village.plan, me, day, changes, effects, notes.deeds);
  const late = [nowLine(s, village.plan, me, day, hour, changes), strangerLine(args.memory, day), notes.doings, notes.came, notes.homeLine, notes.seenTalking, wanting, decisionsLine([], args.meetings)].filter(Boolean).join("\n\n");
  const model = MODEL();
  const client = new Anthropic({ apiKey: key, timeout: 25_000, maxRetries: 1, fetch: (url, init) => globalThis.fetch(url, init) });
  const conversation: Anthropic.Beta.BetaMessageParam[] = [
    ...args.history.map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.who === "echo" ? "user" : "assistant", content: t.text })),
    { role: "user", content: args.message },
  ];
  const ask = (note: string) =>
    client.beta.messages.create({
      model,
      max_tokens: 1500,
      ...(!model.startsWith("claude-haiku") ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA as unknown as Record<string, unknown> } },
      system: [
        { type: "text", text: VILLAGER_PREAMBLE, cache_control: { type: "ephemeral" } },
        { type: "text", text: facts, cache_control: { type: "ephemeral" } },
      ],
      messages: [...conversation, { role: "system", content: note }],
    });
  const textOf = (m: Anthropic.Beta.BetaMessage) =>
    m.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  try {
    let r = await ask(late);
    if (r.stop_reason === "refusal") return { say: `${me.given} looks at you for a long moment, and says nothing.`, remember: null };
    let reply = parseReply(textOf(r));
    const said = [args.message, ...args.history.filter((t) => t.who === "echo").map((t) => t.text)];
    const unknown = reply ? unknownNames(reply.say, names, said) : [];
    if (reply && unknown.length) {
      r = await ask(`${late}\n\nYou named ${unknown.join(", ")}, who are not anyone in ${s.name}. Answer again, using only the people in your facts.`);
      const again = r.stop_reason === "refusal" ? null : parseReply(textOf(r));
      if (again) reply = again;
    }
    if (!reply?.say) return { say: mockReply(s, me, day, args.history.length / 2), remember: null };
    // A decision is never taken from an echo's conversation, whatever came back.
    return { say: reply.say.slice(0, 700), remember: reply.remember.slice(0, 600) };
  } catch (e) {
    console.warn(`[echo] villager reply failed: ${(e as Error).message}`);
    return { say: mockReply(s, me, day, args.history.length / 2), remember: null };
  }
}

// ── the outing ──────────────────────────────────────────────────────────────────

/** Where the echo goes: the last village, else the house's, else the last talked in. */
async function villageFor(store: VillageStore, subject: string, last: string, at: number): Promise<{ cell: string; village: SettledParcel; changes: LifeChange[] } | null> {
  const tried = new Set<string>();
  const candidates = [last, (await store.homeOf(subject))?.cell ?? null, ...((await store.metBy(subject, 5)) ?? []).map((m) => m.cell)];
  for (const c of candidates) {
    if (!c || tried.has(c)) continue;
    tried.add(c);
    const l = await loadVillage(c, at);
    if (l) return { cell: c, village: l.village, changes: l.changes };
  }
  return null;
}

/**
 * Fill one absence. Never throws; an outing that could not be made says why (`reason`), and one the
 * engine cannot speak for is not made at all (null).
 */
export async function makeOuting(store: VillageStore, subject: string, away: { from: number; to: number; cell: string }, now = Date.now()): Promise<Outing | null> {
  const began = Date.now();
  const base: Outing = {
    id: `out_${away.from.toString(36)}_${subject.slice(0, 8)}`,
    subject,
    cell: null,
    village: null,
    awayFrom: new Date(away.from).toISOString(),
    awayTo: new Date(away.to).toISOString(),
    madeAt: new Date(now).toISOString(),
    readAt: null,
    encounters: [],
    waits: null,
    reason: null,
  };
  const where = await villageFor(store, subject, away.cell, away.to);
  if (!where) return { ...base, reason: "no_village" };
  const name = where.village.settlement.name;
  const known = ((await store.metBy(subject, 20)) ?? []).filter((m) => m.cell === where.cell).map((m) => m.person);
  const people = whomToMeet(where.village.settlement, worldDayIndex(CLOCK, away.to), known, base.id);
  const encounters: Encounter[] = [];
  /** What earlier people on this outing said, so the echo does not ask everyone the same thing. */
  const told: string[] = [];
  let slot = 0;
  for (const p of people) {
    if (Date.now() - began > OUTING.deadlineMs) break;
    const when = whenOut(where.village, where.changes, p.id, away.from, away.to, slot++, people.length, base.id);
    if (!when) continue;
    // The world on that day, with every change made to it by then.
    const then = (await loadVillage(where.cell, when.at)) ?? { village: where.village, changes: where.changes };
    const me = then.village.settlement.people.find((x) => x.id === p.id);
    if (!me || !present(then.village.settlement, me, when.day)) continue;
    const age = Math.floor(ageYears(me, when.day));
    const stored = await store.memoryOf(subject, where.cell, me.id);
    const before = stored && stored !== "none" ? stored : null;
    const encounter: Encounter = {
      cell: where.cell,
      village: name,
      person: me.id,
      given: me.given,
      family: me.family,
      age,
      occupation: age >= 13 ? me.occupation : "child",
      day: when.day,
      hour: when.hour,
      x: when.x,
      y: when.y,
      activity: when.activity,
      spoke: false,
      lines: [],
      turns: [],
      feedback: [],
    };
    const meetings = (before?.meetings ?? 0) + 1;
    let note: string | null = null;
    let heard: string | null = null;
    for (let k = 0; k < OUTING.lines; k++) {
      if (Date.now() - began > OUTING.deadlineMs) break;
      const context = contextFor(name, me, age, when.activity, when.hour, before, heard, told);
      const bucket = before || k > 0 ? "smalltalk" : "first_greeting";
      const t = await agentTurn({ userId: subject, context, userMessage: heard ?? OPENING(me.given), bucket, stakes: "low" });
      // An engine that cannot speak for the stranger fills no outing: a stand-in's words are nobody's.
      if (t.mocked) return null;
      const words = spokenOnly(t.action);
      const turn: EchoTurn = { line: words, bucket, context, confidence: t.confidence, p_hat: t.p_hat, tau: t.tau, decision: t.decision, explored: t.explored };
      encounter.turns.push(turn);
      encounter.feedback.push(null);
      if (t.decision !== "auto" || !words) break;
      encounter.spoke = true;
      const reply = await villagerReply({
        store,
        subject,
        cell: where.cell,
        village: then.village,
        changes: then.changes,
        me,
        day: when.day,
        hour: when.hour,
        memory: before ? { ...before, meetings } : encounter.lines.length ? { note: note ?? "", meetings: 1, firstDay: when.day, lastDay: when.day } : null,
        meetings,
        history: encounter.lines,
        message: words,
      });
      encounter.lines.push({ who: "echo", text: words }, { who: "villager", text: reply.say });
      note = reply.remember ?? note;
      heard = reply.say;
    }
    const gist = gistOf(encounter);
    if (gist) told.push(`${me.given} told you: "${gist}"`);
    // They remember meeting the stranger, as they would: in their own words, the meeting counted.
    if (encounter.spoke) await store.remember(subject, where.cell, me.id, { note: (note ?? before?.note ?? "").slice(0, 600), meetings, firstDay: before?.firstDay ?? when.day, lastDay: when.day });
    encounters.push(encounter);
  }
  const last = [...encounters].reverse().find((e) => e.spoke) ?? encounters.at(-1);
  return {
    ...base,
    cell: where.cell,
    village: name,
    encounters,
    waits: last ? { cell: last.cell, x: last.x + 1.5, y: last.y } : null,
    reason: encounters.length ? null : "nobody_out",
  };
}
