/**
 * How far people come, over the wire (DECISIONS C92).
 *
 *   POST  one page reached one step: a day's number for that step goes up by one. Always 204, counted or
 *         not: the page never learns, and never waits.
 *   GET   the last sixty days' numbers, for the owner (the pilot's admin token, `x-pilot-admin`).
 *
 * Nothing of the request is kept: no id, no address, no agent. With no database, or before migration
 * 0041, a step is simply not counted.
 */
import { NextResponse } from "next/server";

import { fromHere } from "@/lib/fromHere";
import { isStep } from "@/lib/steps";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const none = () => new NextResponse(null, { status: 204 });

export async function POST(req: Request) {
  // Counted only when our own page says so (`lib/fromHere.ts`); anything else gets the same silence.
  if (!fromHere(req)) return none();
  const body = (await req.json().catch(() => null)) as { step?: unknown } | null;
  if (!body || !isStep(body.step)) return none();
  const admin = adminClient();
  if (!admin) return none();
  try {
    const { error } = await admin.rpc("step_hit", { p_step: body.step });
    if (error) console.warn(`[steps] not counted (${error.message})`);
  } catch (err) {
    console.warn(`[steps] not counted (${(err as Error).message})`);
  }
  return none();
}

export async function GET(req: Request) {
  const token = process.env.ECHO_PILOT_ADMIN ?? "";
  // The same door as the pilot's export: no token set, or the wrong one, and there is no such page.
  if (token.length < 12 || req.headers.get("x-pilot-admin") !== token) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "no_store" }, { status: 503 });
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("step_days").select("day, step, n").gte("day", since).order("day", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: "unreadable" }, { status: 503 });
  return NextResponse.json({ since, days: data ?? [] });
}
