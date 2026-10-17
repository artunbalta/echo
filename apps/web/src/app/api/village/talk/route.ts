/**
 * Talk to a villager (DECISIONS C42): one line from a stranger, one line back from someone who has
 * lived a life in that village.
 *
 * THE CLIENT NAMES A PERSON; IT NEVER DESCRIBES ONE. The request carries a cell and a `Person.id`, and
 * the village, the life, the family and the hour are rebuilt here from the seed (L1, L2). Nothing a
 * browser sends becomes a fact about the world, so a crafted request can change what the stranger
 * SAYS and nothing about who the villager IS. And nothing the villager says becomes a fact either
 * (L3): replies are text, never state.
 *
 * IT SPENDS, SO IT IS GUARDED LIKE THE ROUTES THAT SPEND (⚑30). A signed subject, before anything
 * else; caps on every string, answered 413 before any provider call; a zero-key run that answers from
 * the facts alone without spending; and a rate limit that fails CLOSED, because "the counter is down"
 * and "there is no limit" are the same sentence on a route that calls a model. The limiter sits after
 * the zero-key branch for the reason /api/vision gives: a deployment with nothing to spend has nothing
 * to fail closed about.
 *
 * WHAT IS KEPT: nothing. The stranger's words go to the model to be answered and are neither stored
 * nor logged — the log line counts tokens — and they are never read into anybody's echo: the consent
 * card promises the product reads "where you go and what you choose, never what you type", and this
 * route keeps that promise by not being part of the measurement chain at all.
 *
 * THE MODEL. `claude-opus-5-5` unless VILLAGER_MODEL names another, at low effort, with the
 * refusal fallback on (`fallbacks: "default"`). Choosing a cheaper model for villagers is an
 * operator's decision about money and voice, and the env var is where it is made.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ageYears, present, timeOfDay, villageAt, worldClock, worldDayIndex, WORLD_EPOCH } from "@echo/planet";

import { planet } from "@/lib/planet";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { VILLAGER_PREAMBLE, mockReply, nowLine, unknownNames, villagerContext } from "@/lib/villager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.VILLAGER_MODEL || "claude-opus-5-5";
/** Claude Haiku 5.5 has no server-side fallback; the parameter is only sent where it means something. */
const FALLBACKS = !MODEL.startsWith("claude-haiku");

/** The stranger's line, and the conversation so far: both bounded before anything is spent. */
export const TALK_LIMITS = { messageChars: 400, turns: 12, turnChars: 800, replyChars: 700 } as const;

const CELL = /^[0-9a-f]{15}$/;

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

  let body: { cell?: unknown; person?: unknown; message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person, message } = body;
  const history = (body.history ?? []) as Turn[];
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof person !== "string" || person.length > 64) return bad("bad_person");
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

  // The village, rebuilt from the seed. The client named a person; this decides who that is.
  const { field, calibration, commons, world } = planet();
  const clock = worldClock(WORLD_EPOCH);
  const now = Date.now();
  const day = worldDayIndex(clock, now);
  const hour = timeOfDay(clock, now);
  const village = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day });
  if (!village) return bad("no_village", 404);
  const s = village.settlement;
  const me = s.people.find((p) => p.id === person);
  if (!me || !present(s, me, day)) return bad("no_such_villager", 404);
  if (ageYears(me, day) < 4) return bad("too_young", 422);

  const turn = history.length / 2;
  if (!KEY) return NextResponse.json({ reply: mockReply(s, me, day, turn), source: "mock" });

  const rate = await rateLimit(req, { bucket: "villager", windowMs: 10 * 60 * 1000, max: 40, onUnavailable: "deny" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const { facts, names } = villagerContext(s, village.plan, me, day);
  const said = [message, ...history.filter((t) => t.role === "stranger").map((t) => t.text)];
  const conversation: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.role === "stranger" ? "user" : "assistant", content: t.text })),
    { role: "user", content: message },
  ];
  // Constructed per request, with fetch looked up at call time, so a test's recorder sees the call.
  const client = new Anthropic({ apiKey: KEY, timeout: 25_000, maxRetries: 1, fetch: (url, init) => globalThis.fetch(url, init) });

  const ask = (note: string) =>
    client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      ...(FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: { effort: "low" },
      // Two breakpoints: the preamble every villager shares, and this villager's life, which holds
      // all day. The hour changes every few minutes, so it rides after the conversation instead.
      system: [
        { type: "text", text: VILLAGER_PREAMBLE, cache_control: { type: "ephemeral" } },
        { type: "text", text: facts, cache_control: { type: "ephemeral" } },
      ],
      messages: [...conversation, { role: "system", content: note }],
    });

  try {
    const here = nowLine(s, village.plan, me, day, hour);
    let r = await ask(here);
    if (r.stop_reason === "refusal") {
      return NextResponse.json({ reply: `${me.given} looks at you for a long moment, and says nothing.`, source: "refusal" });
    }
    const textOf = (m: typeof r) =>
      m.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
    let reply = textOf(r);
    let unknown = unknownNames(reply, names, said);
    if (unknown.length > 0) {
      // Asked again, once, with the names it reached for. Not shown: the first reply never leaves.
      r = await ask(`${here}\n\nYou named ${unknown.join(", ")}, who are not anyone in ${s.name}. Answer again, using only the people in your facts.`);
      if (r.stop_reason !== "refusal") reply = textOf(r) || reply;
      unknown = unknownNames(reply, names, said);
    }
    const u = r.usage;
    console.info(`[villager] ${cell} ${me.id}: in ${u.input_tokens} cached ${u.cache_read_input_tokens ?? 0} written ${u.cache_creation_input_tokens ?? 0} out ${u.output_tokens}${unknown.length ? ` unverified ${unknown.length}` : ""}`);
    if (!reply) return NextResponse.json({ reply: mockReply(s, me, day, turn), source: "empty" });
    return NextResponse.json({
      reply: reply.slice(0, TALK_LIMITS.replyChars),
      source: "claude",
      ...(unknown.length ? { unverified: unknown } : {}),
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[villager] the model is rate limited");
    else if (err instanceof Anthropic.APIError) console.warn(`[villager] model error ${err.status}: ${err.message}`);
    else console.warn("[villager] failed:", (err as Error).message);
    // The villager does not vanish because the model did: they answer from their facts.
    return NextResponse.json({ reply: mockReply(s, me, day, turn), source: "unavailable" });
  }
}
