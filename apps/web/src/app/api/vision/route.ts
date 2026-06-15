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

export async function POST(req: Request) {
  let selfie: string | undefined;
  try {
    ({ selfie } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!selfie || !selfie.startsWith("data:image/")) {
    return NextResponse.json({ error: "selfie data URL required" }, { status: 400 });
  }

  if (!KEY) {
    return NextResponse.json({ attributes: mockAttributes(), source: "mock" });
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
