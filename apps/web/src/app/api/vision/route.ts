/**
 * Vision attribute extraction (§6.2, §13). Receives a selfie data URL, asks Claude
 * (vision) for STYLE attributes only — never identity recognition — and returns
 * structured JSON. The raw image is used transiently for this one call and then
 * discarded: it is never written to disk, logged, or persisted (biometric minimization).
 *
 * Falls back to neutral mock attributes when ANTHROPIC_API_KEY is unset, so onboarding
 * works with no keys.
 */
import { NextResponse } from "next/server";
import type { CharacterAttributes } from "@echo/shared";

import { subjectOf, subjectRejection } from "@/lib/subject";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";

export const runtime = "nodejs";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL_STRONG ?? "claude-opus-4-8";

const INSTRUCTION = `Extract ONLY stylistic appearance attributes from this selfie to drive a
pixel-art game avatar. Do NOT identify the person, guess their name, age, ethnicity, or any
identity. Return ONLY a JSON object with these optional keys:
{"hairColor","hairStyle","skinTone","glasses"(bool),"facialHair","accessories"(string[]),"vibe"(string[])}.
Use simple words (e.g. hairColor:"brown", skinTone:"medium"). Omit anything not clearly visible.`;

function mockAttributes(): CharacterAttributes {
  return { hairColor: "brown", skinTone: "medium", glasses: false, vibe: ["calm"] };
}

function parseJson(text: string): CharacterAttributes {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return mockAttributes();
  try {
    return JSON.parse(m[0]) as CharacterAttributes;
  } catch {
    return mockAttributes();
  }
}

/**
 * The most a selfie may be, and why there is a number here at all.
 *
 * `onboard/page.tsx` draws the capture into a 384x384 canvas and calls `toDataURL("image/jpeg", 0.9)`
 * — MEASURED at roughly 20-40 KB. This cap is an order of magnitude above the largest thing the
 * product sends and still bounds what a caller can put on the bill: every byte here is an input
 * token at Anthropic, and there was no limit at all. MEASURED before this: a 5 MB base64 string was
 * forwarded verbatim, a 5,243,524-byte request body to api.anthropic.com.
 *
 * A cap, not a rate limit. The guard below says WHO is spending; this says HOW MUCH per call.
 * Neither is a budget — see ⚑30.
 */
const MAX_SELFIE_CHARS = 512 * 1024;

export async function POST(req: Request) {
  // THE CALLER MUST BE SOMEBODY (SOC-2.E, C39, `⚑30`). This route spends real money at a paid
  // provider and had no gate of any kind. The subject is not asserted anywhere in the body, so this
  // is the tree's first `subjectOf` with no claimed id: a valid token answers with its own subject,
  // and no token answers `no-identity`. `/onboard` mints before it gets here, which is why this can
  // be closed now and could not be before (⚑28 left it as the named remainder).
  //
  // THIS IS NOT A COST CONTROL AND MUST NOT BE READ AS ONE. The minter hands an identity to anyone
  // who asks, so a determined caller mints one and spends anyway. What it buys is that the spend is
  // ATTRIBUTABLE and that a casual unauthenticated script is refused. The cap below and the limit
  // ⚑30 records are the parts that bound the bill.
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }


  let selfie: string | undefined;
  try {
    ({ selfie } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!selfie || !selfie.startsWith("data:image/")) {
    return NextResponse.json({ error: "selfie data URL required" }, { status: 400 });
  }
  if (selfie.length > MAX_SELFIE_CHARS) {
    // 413 before any provider call, so an oversized body costs nothing.
    return NextResponse.json({ error: "selfie too large" }, { status: 413 });
  }

  if (!KEY) {
    return NextResponse.json({ attributes: mockAttributes(), source: "mock" });
  }

  // AND A LIMIT, FAIL-CLOSED — BUT ONLY ONCE THERE IS SOMETHING TO SPEND.
  //
  // The guard says WHO is spending and the cap says how much per call; neither bounds a loop,
  // because `/api/identity/session` mints for anybody who asks. This is the part that does.
  // `onUnavailable: "deny"` is the opposite of the waitlist's posture and is the point: for a
  // signup, refusing a real person costs more than letting one through, and for a paid provider
  // call "the counter is unavailable" and "there is no limit" are the same sentence.
  //
  // THE ORDER IS LOAD-BEARING and the first version of this had it wrong. Placed before the
  // no-provider short circuit above, a deny-on-unavailable limiter closed the ZERO-KEY LOCAL RUN:
  // with no Supabase there is no counter, so every call answered 503 — including the ones that
  // would only ever have returned a mock. A deployment with nothing to spend has nothing to fail
  // closed about. Reached only from here, this refuses to spend when it cannot count and leaves
  // "works with no keys" exactly as it was. MEASURED: five tests caught the inversion.
  const rate = await rateLimit(req, { bucket: "vision", windowMs: 60 * 60 * 1000, max: 10, onUnavailable: "deny" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  // Parse the data URL into media type + base64 payload (kept only in memory).
  const match = selfie.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "unsupported image" }, { status: 400 });
  const [, mediaType, b64] = match;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: INSTRUCTION },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const data = (await res.json()) as { content?: { text?: string }[] };
    const attributes = parseJson(data.content?.[0]?.text ?? "");
    // Note: `selfie`/`b64` go out of scope here and are never persisted.
    return NextResponse.json({ attributes, source: "claude" });
  } catch (err) {
    console.warn("[vision] failed, using mock:", (err as Error).message);
    return NextResponse.json({ attributes: mockAttributes(), source: "mock" });
  }
}
