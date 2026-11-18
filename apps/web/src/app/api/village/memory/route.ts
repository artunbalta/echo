/**
 * "Forget me" (DECISIONS C44): one villager's memory of you, erased on request, from the talk panel.
 *
 * Erasing everything — every villager's memory of you, and your name off every change you were part
 * of — is §13's, in `api/account/delete`. This is the small, local version of the same right, where
 * the memory is made: you can ask a villager to forget you without erasing yourself.
 */
import { NextResponse } from "next/server";
import { roomOfRequest } from "@echo/shared";

import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;

export async function DELETE(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; person?: unknown; room?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.cell !== "string" || !CELL.test(body.cell)) return NextResponse.json({ error: "bad_cell" }, { status: 400 });
  if (typeof body.person !== "string" || !PERSON.test(body.person)) return NextResponse.json({ error: "bad_person" }, { status: 400 });
  // A villager of a village room's copy (C102) remembers you in that copy; forgetting there is forgetting there.
  const room = roomOfRequest(body.cell, body.room);
  if (!room.ok) return NextResponse.json({ error: "bad_room" }, { status: 400 });
  const store = villageStore(room.room);
  if (!store) return NextResponse.json({ forgotten: true, kept: false });
  const ok = await store.forget(caller.subject, body.cell, body.person);
  // Not "ok: true" unless it is: a forgetting that failed must not read as one that worked (⚑26).
  return ok ? NextResponse.json({ forgotten: true }) : NextResponse.json({ error: "store_unavailable" }, { status: 503 });
}
