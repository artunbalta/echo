/**
 * Whether what you say is kept, for your echo to learn to talk as you do (DECISIONS C108).
 *
 * A yes of its own, apart from watching (which never reads what you type) and apart from letting your echo
 * keep your place (C103). With it, the lines you type to villagers and to people in village rooms are kept
 * (`echo_lines`), and before each of your answers to a villager your echo seals a guess of it, settled once
 * you have answered (`/api/echo/guess`, `/api/echo/settle`). Those guesses are what it earns the right to
 * talk from. Other people's words are never kept.
 *
 * GET: `{ on, kept, guesses }`: the yes, how many of your lines are kept, and the last guesses with what you
 * said and whether they were taken for the same, newest first, for "When you leave" to show.
 *
 * POST `{ on }`: yes, or no. No deletes the yes, every line and every guess, then and there, and says so only
 * if it happened (⚑26).
 *
 * PRIVATE. Signed subject.
 */
import { NextResponse } from "next/server";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guesses shown under "When you leave". */
const SHOWN = 6;
/** Lines counted: past this the panel says "500+", which is all anyone needs to know. */
const COUNTED = 500;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return NextResponse.json({ on: false, kept: 0, guesses: [], available: false });
  const on = await store.wordsOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return NextResponse.json({ on: false, kept: 0, guesses: [] }, { headers: { "cache-control": "no-store" } });
  const [lines, looks] = await Promise.all([store.linesOf(caller.subject, COUNTED), store.talkLooksOf(caller.subject)]);
  if (lines === null || looks === null) return bad("store_unavailable", 503);
  const guesses = looks
    .slice(-SHOWN)
    .reverse()
    .map((l) => ({ heard: l.heard, guess: l.guess, said: l.said, hit: l.hit, why: l.why, at: l.sealedAt }));
  return NextResponse.json({ on: true, kept: lines.length, guesses }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { on?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  if (typeof body.on !== "boolean") return bad("bad_on");
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  if (!(await store.setWords(caller.subject, body.on))) return bad("store_unavailable", 503);
  return NextResponse.json({ on: body.on, ...(body.on ? {} : { erased: true }) });
}
