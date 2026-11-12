/**
 * The village's count, over the wire (DECISIONS C91).
 *
 *   GET     whether the count is on, and what people did at each moment where enough have met it;
 *   POST    a visitor's settled envelopes, added under the random id their browser made for this;
 *   DELETE  everything that id added.
 *
 * NO IDENTITY, ON PURPOSE. A row is not tied to an echo's subject, so there is no token to check: the
 * visitor id is the only handle, it is made and kept in the browser, and whoever holds it may remove
 * its rows. What a stranger with no id can do is add made-up rows, which is why the count is only ever
 * a starting point and a bar on the page, never the study's (`known-gaps`), and why a cell says
 * nothing until `CROWD_MIN` people have met it.
 *
 * Switched off (`ECHO_OPEN_CROWD` unset, or nowhere to keep rows) GET and POST say `on: false` with a
 * 200: the page asks once, hears no, and never asks to add anything. DELETE is not behind the switch.
 */
import { NextResponse } from "next/server";

import { fromHere } from "@/lib/fromHere";
import { CROWD_MIN, crowdFrom, ROWS_MAX, validRow, VISITOR, type CountRow, type Crowd } from "@/lib/knowable/crowd";
import { openCount, openCountStore } from "@/lib/openCount";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** The count is read at most this often: it moves slowly, and every page asks. */
const FRESH_MS = 5 * 60 * 1000;
const cache = globalThis as unknown as { __echoCrowd?: { at: number; crowd: Crowd } };

const off = () => NextResponse.json({ on: false });

export async function GET() {
  const store = openCount();
  if (!store) return off();
  const kept = cache.__echoCrowd;
  if (kept && Date.now() - kept.at < FRESH_MS) return NextResponse.json({ on: true, min: CROWD_MIN, crowd: kept.crowd });
  const counted = await store.counted();
  // Unreadable (the switch on and migration 0040 not applied, or the database away): the count is OFF
  // for whoever asked. Saying "on" here put the count's sentence on the consent card and made an id for
  // rows that could be neither added nor removed, and an erasure then refused for want of the table.
  if (!counted) return off();
  const crowd = crowdFrom(counted);
  cache.__echoCrowd = { at: Date.now(), crowd };
  return NextResponse.json({ on: true, min: CROWD_MIN, crowd });
}

export async function POST(req: Request) {
  const store = openCount();
  if (!store) return off();
  if (!fromHere(req)) return NextResponse.json({ error: "not_from_here" }, { status: 403 });
  const limited = await rateLimit(req, { bucket: "calls", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!limited.ok) {
    const { body, status } = rateLimitRejection(limited);
    return NextResponse.json(body, { status });
  }
  const body = (await req.json().catch(() => null)) as { visitor?: unknown; rows?: unknown } | null;
  if (!body || typeof body.visitor !== "string" || !VISITOR.test(body.visitor)) return NextResponse.json({ error: "bad_visitor" }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > ROWS_MAX) return NextResponse.json({ error: "bad_rows" }, { status: 400 });
  // What can be counted is; what cannot is named, so the page stops offering it. One bad row used to
  // refuse the whole batch, and the page then sent the same batch again for ever.
  const rows: CountRow[] = [];
  const refused: string[] = [];
  for (const raw of body.rows) {
    const row = validRow(raw);
    if (row) rows.push(row);
    else if (raw && typeof raw === "object" && typeof (raw as { seal?: unknown }).seal === "string") refused.push((raw as { seal: string }).seal.slice(0, 64));
  }
  if (rows.length > 0 && !(await store.add(body.visitor, rows))) return NextResponse.json({ error: "not_kept" }, { status: 503 });
  return NextResponse.json({ on: true, taken: rows.map((r) => r.seal), refused });
}

export async function DELETE(req: Request) {
  // Not behind the switch: what was added while the count was on can be taken back after it is off.
  const store = openCountStore();
  if (!store) return off();
  if (!fromHere(req)) return NextResponse.json({ error: "not_from_here" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { visitor?: unknown } | null;
  if (!body || typeof body.visitor !== "string" || !VISITOR.test(body.visitor)) return NextResponse.json({ error: "bad_visitor" }, { status: 400 });
  if (!(await store.forgetVisitor(body.visitor))) return NextResponse.json({ error: "not_removed" }, { status: 503 });
  cache.__echoCrowd = undefined;
  return NextResponse.json({ on: true, removed: true });
}
