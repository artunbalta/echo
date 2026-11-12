/**
 * A twin from a person's words, over the wire (DECISIONS C93).
 *
 *   GET   whether a twin can be made here: `{ on }`. Off without a key, and on a deployment until its
 *         owner switches it on (`ECHO_TWIN=1`); the page then says nothing of it.
 *   POST  a paragraph a person wrote about themselves (20 to 600 characters); back come the model's id
 *         and one call for each situation of the village, each checked against the endings that
 *         moment can have (`readTwinCalls`). Nothing else the model wrote is in the answer.
 *
 * THE PARAGRAPH IS TYPED, AND THE CONSENT CARD SAYS THE ECHO NOTICES "NEVER WHAT YOU TYPE". Both hold:
 * the page says, above the button, where the paragraph goes (once, to a language model run by
 * Anthropic) and that it is not kept; this route does not store it, log it, or send it back; and what
 * the model makes of it is sealed beside the echo's call as a contestant, never read into the echo.
 *
 * NO IDENTITY, ON PURPOSE, as the village's count: the envelopes work with nothing behind the page,
 * and a twin is nobody's but the browser's that asked for it.
 *
 * IT SPENDS, SO IT IS GUARDED LIKE THE ROUTES THAT SPEND (⚑30): the length is checked before anything
 * is spent, one model call a press, five presses an hour from one address, and a counter that fails
 * CLOSED on any deployment (open only under `next dev`, as the villagers').
 */
import { NextResponse } from "next/server";

import { fromHere } from "@/lib/fromHere";
import { TWIN_TEXT } from "@/lib/knowable/twin";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { askTwin, twinDeployed, twinOn } from "@/lib/twinModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  return NextResponse.json({ on: twinOn() });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  // No key, or a deployment whose owner has not switched the twin on: nothing is spent.
  if (!key || !twinOn()) return NextResponse.json({ on: false }, { status: 503 });
  // Only our own page may ask: a press is paid for, and another site must not be able to make its
  // visitors press (`lib/fromHere.ts`).
  if (!fromHere(req)) return bad("not_from_here", 403);

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return bad("bad_text");
  const text = body.text.trim();
  if (text.length < TWIN_TEXT.min) return bad("too_short");
  if (text.length > TWIN_TEXT.max) return bad("too_long");

  // A paid call is refused when it cannot be counted, on any deployment. Under `next dev`, on the
  // developer's own machine and key, it goes ahead (C65).
  const rate = await rateLimit(req, { bucket: "twin", windowMs: 60 * 60 * 1000, max: 5, onUnavailable: twinDeployed() ? "deny" : "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const twin = await askTwin(text, key);
  if (!twin.ok) return bad(`twin_${twin.why}`, twin.why === "busy" ? 503 : 502);
  return NextResponse.json({ on: true, model: twin.model, calls: twin.calls });
}
