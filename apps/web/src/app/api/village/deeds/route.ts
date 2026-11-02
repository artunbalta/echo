/**
 * Your own deeds in a village (DECISIONS C49), for your browser only: so that the villagers you pass
 * can be heard talking about what you did, once word of it has reached them (`social.ts` `chatter`).
 *
 * PRIVATE. Signed subject, your deeds and nobody else's. Another visitor's browser never asks for
 * yours, so nobody hears gossip about a stranger they are not.
 */
import { NextResponse } from "next/server";

import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const cell = new URL(req.url).searchParams.get("cell") ?? "";
  if (!CELL.test(cell)) return NextResponse.json({ error: "bad_cell" }, { status: 400 });
  const store = villageStore();
  const deeds = store ? await store.deedsFor(caller.subject, cell) : [];
  return NextResponse.json({ deeds: deeds ?? [] }, { headers: { "cache-control": "no-store" } });
}
