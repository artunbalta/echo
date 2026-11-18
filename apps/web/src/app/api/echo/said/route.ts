/**
 * One line you said, kept for your echo to learn to talk from (DECISIONS C108).
 *
 * POST `{ cell, room?, to, said, heard? }`: a line you typed to someone in a village room (`to: "person"`),
 * aloud in one (`"aloud"`), or to a villager when no guess was waiting for it (`"villager"`, your first line
 * to them, say). `heard` is taken only with a villager: what they had just said. What a person said to you
 * is theirs, and is never sent here or kept. A line that answered a sealed guess is kept by
 * `/api/echo/settle` instead.
 *
 * Only while you have said yes to keeping your words (409 otherwise). Spends nothing.
 *
 * PRIVATE. Signed subject.
 */
import { NextResponse } from "next/server";
import { roomOfRequest } from "@echo/shared";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore, type KeptLine } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const TO: readonly KeptLine["to"][] = ["villager", "person", "aloud"];
const SAID_MAX = 400;
const HEARD_MAX = 700;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; room?: unknown; to?: unknown; said?: unknown; heard?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, to } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  const room = roomOfRequest(cell, body.room);
  if (!room.ok) return bad("bad_room");
  if (typeof to !== "string" || !TO.includes(to as KeptLine["to"])) return bad("bad_to");
  if (typeof body.said !== "string" || body.said.trim() === "") return bad("bad_said");
  if (body.said.length > SAID_MAX) return bad("said_too_long", 413);
  const heard = to === "villager" && typeof body.heard === "string" && body.heard.trim() ? body.heard.trim() : null;
  if (heard && heard.length > HEARD_MAX) return bad("heard_too_long", 413);

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 200, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.wordsOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);
  const kept = await store.keepLine(caller.subject, { at: new Date().toISOString(), cell, room: room.room, to: to as KeptLine["to"], heard, said: body.said.trim() });
  if (!kept) return bad("store_unavailable", 503);
  return NextResponse.json({ kept: true });
}
