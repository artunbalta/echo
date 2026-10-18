/**
 * Talk to a villager (DECISIONS C42, C44): one line from a stranger, one line back from someone who
 * has lived a life in that village — and who remembers you, and whose life a conversation can change.
 *
 * THE CLIENT NAMES A PERSON; IT NEVER DESCRIBES ONE. The request carries a cell, a `Person.id` and the
 * conversation token `begin` signed; the village, the life, the family, the hour and every change ever
 * made to them are rebuilt here from the seed and the store (L1, L2). Nothing a browser sends becomes a
 * fact about the world.
 *
 * WHAT A CONVERSATION CAN CHANGE (C44, which amends L3). The model answers in JSON: what the villager
 * says, their private note about this stranger, and at most one decision about their own life. The
 * decision is not taken because the model said so. It must be one of the decisions the villager was
 * OFFERED (each pre-checked against the world), it is checked again here by `checkChange` against the
 * world as it now is, leaving and taking up a trade need a stranger the villager has met before, and
 * only then is it written — as a structured row with no free text, which is what lets every other
 * visitor see it. Free text still changes nothing directly: it can only move a person to decide one
 * of a few things the world already allows.
 *
 * WHAT IS KEPT, AND WHERE. The stranger's words go to the model and are never stored or logged. What
 * the villager makes of them — a note in the villager's voice, at most 600 characters — is kept,
 * privately, keyed on this stranger (`villager_memories`), erased with them (§13), and never read
 * into their echo: the consent card's "never what you type" holds because this route is still not part
 * of the measurement chain. The panel says what is kept before anything is typed.
 *
 * IT SPENDS, SO IT IS GUARDED LIKE THE ROUTES THAT SPEND (⚑30): a signed subject first, the
 * conversation token, caps answered 413 before any provider call, a zero-key path, and a rate limit
 * that fails CLOSED.
 *
 * THE MODEL. `claude-opus-5-5` unless VILLAGER_MODEL names another, at low effort, with the refusal
 * fallback on (`fallbacks: "default"`), and the reply constrained to {@link REPLY_SCHEMA}.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ageYears, checkChange, deedWords, doorOf, homeChanges, knownDeeds, metOn, moveChanges, needOf, portable, present, residentsOn, visitChanges, weddingDays, type LifeChange, type SettledParcel } from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import {
  REPLY_SCHEMA,
  VILLAGER_PREAMBLE,
  changeWords,
  decisionsLine,
  decisionsOffered,
  mockReply,
  needLine,
  nowLine,
  parseReply,
  proposalFrom,
  strangerLine,
  unknownNames,
  villagerContext,
  whereNow,
  type Introducible,
  type StrangerMemory,
} from "@/lib/villager";
import { destinationFor, singlesMet, villageNamed, writeMove } from "@/lib/moves";
import { loadVillage, verifyConversation } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.VILLAGER_MODEL || "claude-opus-5-5";
/** Claude Haiku 5.5 has no server-side fallback; the parameter is only sent where it means something. */
const FALLBACKS = !MODEL.startsWith("claude-haiku");

/** The stranger's line, and the conversation so far: both bounded before anything is spent. */
const TALK_LIMITS = { messageChars: 400, turns: 12, turnChars: 800, replyChars: 700, noteChars: 600 } as const;

/** Leaving, a trade, a marriage, going home: not decided with someone you met five minutes ago (C44, C53). */
const TRUSTED = new Set(["leave", "trade", "court", "return"]);

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;

interface Turn {
  role: "stranger" | "villager";
  text: string;
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }

  let body: { cell?: unknown; person?: unknown; message?: unknown; history?: unknown; conv?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person, message } = body;
  const history = (body.history ?? []) as Turn[];
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof person !== "string" || !PERSON.test(person)) return bad("bad_person");
  if (typeof message !== "string" || message.trim() === "") return bad("bad_message");
  if (message.length > TALK_LIMITS.messageChars) return bad("message_too_long", 413);
  if (!Array.isArray(history)) return bad("bad_history");
  if (history.length > TALK_LIMITS.turns) return bad("history_too_long", 413);
  for (let i = 0; i < history.length; i++) {
    const t = history[i];
    const expected = i % 2 === 0 ? "stranger" : "villager";
    if (!t || t.role !== expected || typeof t.text !== "string") return bad("bad_history");
    if (t.text.length > TALK_LIMITS.turnChars) return bad("history_too_long", 413);
  }
  if (history.length % 2 !== 0) return bad("bad_history");

  const now = Date.now();
  // A conversation begins where the villager is (`begin`); a line without one is refused unspent.
  if (!verifyConversation(body.conv, caller.subject, cell, person, now)) return bad("no_conversation", 403);

  // The village as it now is: the seed's, with every change made to it.
  const loaded = await loadVillage(cell, now);
  if (!loaded) return bad("no_village", 404);
  const { village, changes, readable, store, day, hour } = loaded;
  const s = village.settlement;
  const me = s.people.find((p) => p.id === person);
  if (!me || !present(s, me, day)) return bad("no_such_villager", 404);
  if (ageYears(me, day) < 4) return bad("too_young", 422);

  const turn = history.length / 2;
  if (!KEY) {
    const effects = store ? ((await store.effectsFor(cell, day)) ?? []) : [];
    return NextResponse.json({ reply: mockReply(s, me, day, turn, needOf(s, village.plan, me, day, changes, effects)?.text ?? null), source: "mock" });
  }

  const rate = await rateLimit(req, { bucket: "villager", windowMs: 10 * 60 * 1000, max: 40, onUnavailable: "deny" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  // What this villager remembers of this stranger. `begin` has already counted this meeting.
  const known = store ? await store.memoryOf(caller.subject, cell, person) : null;
  const memory: StrangerMemory | null = known && known !== "none" ? known : null;
  const meetings = memory?.meetings ?? 1;
  // Nothing is offered against a world the server could not read, or into a store it cannot write.
  const canDecide = store !== null && readable;
  // Between villages (C53): whom the stranger could tell them of — people the stranger has met — and home.
  const placeName = (c: string) => villageNamed(c)?.name ?? null;
  let singles: (Introducible & { parcel: SettledParcel })[] = [];
  if (canDecide && meetings >= 2) {
    const found = await singlesMet(store!, caller.subject, me, cell, day, async (c) => {
      if (c === cell) return { village, changes };
      const l = await loadVillage(c, now);
      return l ? { village: l.village, changes: l.changes } : null;
    });
    singles = found.map((f) => {
      // Met: one came to visit the other (the visit is written in the village visited). One village: always.
      const met = f.cell === cell ? day - 1 : metOn([...changes, ...f.changes], me.id, f.person.id, day);
      // Their word to this villager counts if it was sent since they met — to meet first, then to marry.
      const asked = changes.some((c) => c.kind === "court" && c.person === f.person.id && c.target === me.id && (met === null || f.cell === cell || c.madeDay > met));
      return { person: f.person, cell: f.cell, village: f.village, km: f.km, asked, met: f.cell === cell ? null : met, parcel: f.parcel };
    });
  }
  // At their own door, or inside their own house, by day (C54): they may ask the stranger in.
  const homePlot = residentsOn(s, village.plan, day).find((r) => r.person.id === me.id)?.plot ?? null;
  const w0 = whereNow(s, village.plan, me, day, hour, changes);
  const atHome =
    homePlot !== null &&
    hour > 0.28 &&
    hour < 0.9 &&
    (!w0 || !w0.visible || Math.hypot(w0.x - doorOf(homePlot).x, w0.y - doorOf(homePlot).y) < 15);
  const offered = canDecide || atHome ? decisionsOffered(s, me, day, changes, meetings, { singles, home: me.fromCell ? placeName(me.fromCell) : null, atHome }) : [];
  // Nothing is offered that cannot be kept: without a store, only asking the stranger in (which writes nothing).
  const offers = canDecide ? offered : offered.filter((o) => o.change.kind === "invite");

  /** The panel's sentence: word sent to meet, or to marry, says which (C53); anything else as `changeWords`. */
  const decidedWords = (c: LifeChange): string => {
    const t = c.kind === "court" ? singles.find((x) => x.person.id === c.target) : undefined;
    if (!t) return changeWords(c, s, day, placeName);
    const pronoun = me.sex === "f" ? "she" : "he";
    const to = t.cell !== cell ? ` to ${t.village}` : "";
    return t.cell !== cell && t.met === null
      ? `${me.given} has sent word by you${to}: ${pronoun} would like to meet ${t.person.given}.`
      : `${me.given} has sent word by you${to}: ${pronoun} would marry ${t.person.given}, if ${t.person.sex === "f" ? "she" : "he"} will have ${me.sex === "f" ? "her" : "him"}.`;
  };

  /**
   * The other village's half of a decision (C53), once this village's is written: the family's arrival
   * where they go, the arrival home, or the word sent — and, if it answers word already sent, the move
   * and the wedding. Returns a sentence for the panel when a wedding came of it.
   */
  const between = async (c: LifeChange, kind: string, dest: string | null): Promise<string | null> => {
    if (kind === "leave" && dest) {
      for (const a of moveChanges(s, me, c.day, day, dest).there) await store!.addChange(dest, a, caller.subject);
      return null;
    }
    if (kind === "return" && me.fromCell) {
      const back = homeChanges(s, me, c.day, day);
      if (back) for (const a of back.there) await store!.addChange(me.fromCell, a, caller.subject);
      return null;
    }
    if (kind !== "court" || !c.target || !c.toCell) return null;
    const them = singles.find((x) => x.person.id === c.target);
    if (!them) return null;
    // The word reaches them: in their own village, a note of who sent it.
    if (c.toCell !== cell) {
      await store!.addChange(c.toCell, { person: me.id, kind: "court", madeDay: day, day, target: them.person.id, fromCell: cell, spec: portable(s, me, day) }, caller.subject);
    }
    if (!them.asked) return null;
    // Both would like to meet, and they never have: the one who spoke first comes to visit, in two days.
    if (them.cell !== cell && them.met === null) {
      const visit = visitChanges(them.parcel.settlement, them.person, day + 2, day, cell, me.id);
      if (!(await writeMove(store!, them.cell, cell, visit, caller.subject))) return null;
      return `${them.person.given} will come from ${them.village} to visit in two days, and they will spend the evening together on the green.`;
    }
    // Both have said yes. The one who spoke first goes to the other: they come here, and marry in a week.
    const { arrive, wedding } = weddingDays(day);
    if (them.cell !== cell) {
      const move = moveChanges(them.parcel.settlement, them.person, arrive, day, cell, me.id);
      if (!(await writeMove(store!, them.cell, cell, move, caller.subject))) return null;
    }
    await store!.addChange(cell, { person: them.person.id, kind: "pair", madeDay: day, day: wedding, target: me.id }, caller.subject);
    return `${them.person.given} will come${them.cell !== cell ? ` from ${them.village}` : ""}, and they will be married on the green in ${wedding - day} days.`;
  };

  const { facts, names } = villagerContext(s, village.plan, me, day, changes, placeName);
  // Whom the stranger could tell them of, and where those live, are names they may say (C53).
  for (const x of singles) for (const n of [x.person.given, x.person.family, x.village]) names.add(n);
  if (me.fromCell) {
    const home = placeName(me.fromCell);
    if (home) names.add(home);
  }
  const said = [message, ...history.filter((t) => t.role === "stranger").map((t) => t.text)];
  const conversation: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.role === "stranger" ? "user" : "assistant", content: t.text })),
    { role: "user", content: message },
  ];
  // What this villager knows of what the stranger has DONE here (C45): seen, found, or heard from family.
  const deeds = store ? ((await store.deedsFor(caller.subject, cell)) ?? []) : [];
  const seen = knownDeeds(s, me, deeds, day, village.plan).slice(-8);
  const doings = seen.length
    ? `What you know of this stranger's doings in ${s.name}:\n- ${seen.map((k) => deedWords(s, me, k, day)).join("\n- ")}\nLet it colour how you speak to them, as it would anyone's.`
    : "";
  // What they would ask for this week (C50), which a stranger may already have met.
  const effects = store ? ((await store.effectsFor(cell, day)) ?? []) : [];
  const wanting = needLine(s, village.plan, me, day, changes, effects, deeds);
  const late = [nowLine(s, village.plan, me, day, hour, changes), strangerLine(memory, day), doings, wanting, decisionsLine(offers, meetings)].filter(Boolean).join("\n\n");
  // Constructed per request, with fetch looked up at call time, so a test's recorder sees the call.
  const client = new Anthropic({ apiKey: KEY, timeout: 25_000, maxRetries: 1, fetch: (url, init) => globalThis.fetch(url, init) });

  const ask = (note: string) =>
    client.beta.messages.create({
      model: MODEL,
      max_tokens: 1500,
      ...(FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA as unknown as Record<string, unknown> } },
      // Two breakpoints: the preamble every villager shares, and this villager's life, which holds
      // all day. The hour, the stranger and the offers change, so they ride after the conversation.
      system: [
        { type: "text", text: VILLAGER_PREAMBLE, cache_control: { type: "ephemeral" } },
        { type: "text", text: facts, cache_control: { type: "ephemeral" } },
      ],
      messages: [...conversation, { role: "system", content: note }],
    });

  try {
    let r = await ask(late);
    if (r.stop_reason === "refusal") {
      return NextResponse.json({ reply: `${me.given} looks at you for a long moment, and says nothing.`, source: "refusal" });
    }
    const textOf = (m: typeof r) =>
      m.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    let reply = parseReply(textOf(r));
    let unknown = reply ? unknownNames(reply.say, names, said) : [];
    if (reply && unknown.length > 0) {
      // Asked again, once, with the names it reached for. Not shown: the first reply never leaves.
      r = await ask(`${late}\n\nYou named ${unknown.join(", ")}, who are not anyone in ${s.name}. Answer again, using only the people in your facts.`);
      const again = r.stop_reason === "refusal" ? null : parseReply(textOf(r));
      if (again) reply = again;
      unknown = unknownNames(reply.say, names, said);
    }
    if (!reply || !reply.say) {
      console.info(`[villager] ${cell} ${me.id}: no usable reply (${r.stop_reason})`);
      return NextResponse.json({ reply: mockReply(s, me, day, turn), source: "empty" });
    }

    // The decision, if there was one: offered, possible, and trusted — or not taken.
    let recorded: LifeChange | null = null;
    let declined: string | null = null;
    let married: string | null = null;
    let invited: string | null = null;
    // Asked in (C54): offered, and it is their own house. Nothing is written; the door opens to this stranger today.
    if (reply.change?.kind === "invite") {
      if (atHome && homePlot) invited = `house:${homePlot.index}`;
      else declined = "not-at-home";
    } else if (reply.change && canDecide) {
      const proposal = proposalFrom(reply.change, s, singles);
      if (proposal === null) declined = "unreadable";
      else if (TRUSTED.has(proposal.kind) && meetings < 2) declined = "first-meeting";
      else {
        const verdict = checkChange(s, me, day, proposal, changes);
        if (!verdict.ok) declined = verdict.reason;
        else {
          // Leaving goes somewhere (C53): the village it goes to is chosen before the change is written.
          const dest = proposal.kind === "leave" ? destinationFor(cell, me.id, verdict.change.day) : null;
          if (dest) verdict.change.toCell = dest.cell;
          recorded = await store!.addChange(cell, verdict.change, caller.subject);
          if (recorded === null) declined = "not-recorded";
          else married = await between(recorded, proposal.kind, dest?.cell ?? null);
        }
      }
    } else if (reply.change) declined = "store-unavailable";

    if (store) {
      await store.remember(caller.subject, cell, person, {
        note: reply.remember.slice(0, TALK_LIMITS.noteChars),
        meetings,
        firstDay: memory?.firstDay ?? day,
        lastDay: day,
      });
    }

    const u = r.usage;
    console.info(
      `[villager] ${cell} ${me.id}: in ${u.input_tokens} cached ${u.cache_read_input_tokens ?? 0} written ${u.cache_creation_input_tokens ?? 0} out ${u.output_tokens}` +
        `${unknown.length ? ` unverified ${unknown.length}` : ""}${recorded ? ` decided ${recorded.kind}` : ""}${declined ? ` declined ${declined}` : ""}`,
    );
    return NextResponse.json({
      reply: reply.say.slice(0, TALK_LIMITS.replyChars),
      source: "claude",
      ...(unknown.length ? { unverified: unknown } : {}),
      ...(recorded ? { change: recorded, decided: `${decidedWords(recorded)}${married ? ` ${married}` : ""}` } : {}),
      ...(invited ? { invited, decided: `${me.given} asks you in.` } : {}),
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[villager] the model is rate limited");
    else if (err instanceof Anthropic.APIError) console.warn(`[villager] model error ${err.status}: ${err.message}`);
    else console.warn("[villager] failed:", (err as Error).message);
    // The villager does not vanish because the model did: they answer from their facts.
    return NextResponse.json({ reply: mockReply(s, me, day, turn), source: "unavailable" });
  }
}
