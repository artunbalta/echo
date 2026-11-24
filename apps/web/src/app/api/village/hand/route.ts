/**
 * Something passed from one person to another in a village room (DECISIONS C110): `POST /api/village/hand`.
 *
 * FROM A ROOM ONLY. A person offered someone at arm's length what they carry (a gift, or a trade), or asked
 * them for something for their help, as they can a villager; the other said yes in their own panel; the room
 * asks this route, signed with the identity secret both hold (`x-echo-room`, `@echo/shared/standin`
 * `signHand`), to move the things. Nobody's page can ask it: a page could otherwise take from any pack.
 *
 * WHAT IT DOES. It reads both packs (a pack is a person's, not a world's, C47) and checks that the giver
 * still has what they held out, that the one answering has what they give back, and that each has room for
 * what comes to them (`PACK_SIZE`). Then it writes the giver's pack and the other's; should the second write
 * fail, the first is put back. It answers with both packs as they now are, which the room hands each page.
 *
 * NOTHING ELSE. No deed is recorded and nothing is measured: what passes between two people in a room is
 * theirs (C107). A request older than a minute is not an answer just given, and is refused.
 */
import { NextResponse } from "next/server";
import type { HandAnswer } from "@echo/shared";
import { verifyHand } from "@echo/shared/standin";

import { handOver, readHand } from "@/lib/handOver";
import { identitySecrets } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A request older than this is not an answer just given, ms. */
const FRESH_MS = 60_000;
const answer = (a: HandAnswer, status = 200) => NextResponse.json(a, { status });
const no = (error: string, status = 400) => answer({ ok: false, error }, status);

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 4000) return no("too_long", 413);
  if (!verifyHand(raw, req.headers.get("x-echo-room"), identitySecrets())) return no("not_a_room", 401);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return no("bad_request");
  }
  const h = readHand(parsed);
  if (!h) return no("bad_request");
  if (Math.abs(Date.now() - h.at) > FRESH_MS) return no("stale", 410);

  const store = villageStore();
  if (!store) return no("store_unavailable", 503);
  const [from, to] = await Promise.all([store.packOf(h.from), store.packOf(h.to)]);
  if (!from || !to) return no("store_unavailable", 503);
  const next = handOver(h, from, to);
  if ("error" in next) return no(next.error, 409);
  if (!(await store.setPack(h.from, next.from))) return no("store_unavailable", 503);
  if (!(await store.setPack(h.to, next.to))) {
    await store.setPack(h.from, from);
    return no("store_unavailable", 503);
  }
  return answer({ ok: true, packs: { from: next.from, to: next.to } });
}
