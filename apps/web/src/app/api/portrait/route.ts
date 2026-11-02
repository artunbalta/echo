/**
 * High-fidelity portrait generation (§6.3). Server-side so provider secret keys
 * (FAL_KEY / HF_*) never reach the browser. Returns a portrait URL in the reference
 * pixel-art style, or a placeholder when no provider is configured. The in-world sprite
 * sheet itself is composed client-side from attributes — this is the onboarding "reveal"
 * portrait and profile image.
 */
import { NextResponse } from "next/server";
import type { CharacterAttributes } from "@echo/shared";
import { generatePortrait } from "@/lib/art";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Above anything `styleFromAttributes` produces, and far below a prompt worth paying for. */
const MAX_ATTRIBUTE_CHARS = 4 * 1024;

export async function POST(req: Request) {
  // THE CALLER MUST BE SOMEBODY (SOC-2.E, C39, `⚑30`) — see the note in api/vision/route.ts for why
  // this is attribution rather than a cost control, and for why it can be closed now.
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }

  let body: { attributes?: CharacterAttributes };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const attributes = body.attributes ?? {};
  // The attributes are caller-supplied and are interpolated into the generation prompt, so they are
  // an input the caller controls the size of. `art/types.ts` builds the prompt from these fields.
  if (JSON.stringify(attributes).length > MAX_ATTRIBUTE_CHARS) {
    return NextResponse.json({ error: "attributes too large" }, { status: 413 });
  }
  const styleReferenceUrl = process.env.ART_STYLE_REFERENCE;

  // AND A LIMIT, FAIL-CLOSED — BUT ONLY WHERE THERE IS SOMETHING TO SPEND.
  //
  // The guard says WHO is spending and the cap says how much per call; neither bounds a loop,
  // because `/api/identity/session` mints for anybody who asks. This is the part that does.
  // `onUnavailable: "deny"` is the opposite of the waitlist's posture and is the point: for a
  // signup, refusing a real person costs more than letting one through, and for a paid provider
  // call "the counter is unavailable" and "there is no limit" are the same sentence.
  //
  // THE CONDITION IS LOAD-BEARING and the first version of this did not have it. `lib/art/index.ts`
  // builds its chain from ART_PROVIDER and falls back to a `mock` provider that returns a
  // placeholder without calling out — so with it unset this route spends nothing, and a
  // deny-on-unavailable limiter in front of it closed the ZERO-KEY LOCAL RUN: no Supabase means no
  // counter, so every call answered 503 including the ones that would only ever have returned a
  // placeholder. A deployment with nothing to spend has nothing to fail closed about. MEASURED:
  // five tests caught the inversion.
  if (process.env.ART_PROVIDER) {
    const rate = await rateLimit(req, { bucket: "portrait", windowMs: 60 * 60 * 1000, max: 10, onUnavailable: "deny" });
    if (!rate.ok) {
      const { body: error, status } = rateLimitRejection(rate);
      return NextResponse.json(error, { status });
    }
  }

  // `selfieUrl` IS GONE FROM THE ACCEPTED BODY, and it had no sender. This route read
  // `body.selfieUrl` and handed it to `generatePortrait`, which sets `input.image_url = req.selfieUrl`
  // (lib/art/fal.ts:43) or `InputImage.fromUrl(req.selfieUrl)` (lib/art/higgsfield.ts:43-44) — so an
  // unauthenticated caller could make this project's paid image-generation account fetch an
  // arbitrary URL of their choosing and generate from it, on this project's credentials. MEASURED:
  // `lib/character.ts`'s `fetchPortrait` sends `{ attributes }` and nothing else, and a tree-wide
  // grep finds no other sender — every other `selfieUrl` in the repo belongs to the waitlist
  // portrait pipeline, which is server-side and uploads to fal storage itself. The parameter was
  // dead and wired straight through. The style anchor a portrait legitimately needs is
  // ART_STYLE_REFERENCE, which is server-side and stays.
  const result = await generatePortrait({ attributes, styleReferenceUrl });
  return NextResponse.json(result);
}
