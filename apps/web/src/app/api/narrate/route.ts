/**
 * Narrator debrief endpoint (§11). Takes a grounded session/encounter digest → produces a
 * sparse, specific observation (or stays silent) → synthesizes audio → persists to
 * `narrations`. Returns { text, audioDataUrl }. The client shows a caption and plays the
 * audio (falling back to browser speech when no TTS provider is configured).
 */
import { NextResponse } from "next/server";
import { narrate, type SessionDigest } from "@/lib/narrator";
import { synthesize } from "@/lib/tts";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  let body: { userId?: string; sessionId?: string; digest?: SessionDigest };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const digest = body.digest;
  if (!digest) return NextResponse.json({ error: "digest required" }, { status: 400 });

  const text = await narrate(digest);
  if (!text) return NextResponse.json({ text: "", audioDataUrl: null, silent: true });

  const tts = await synthesize(text);

  // Persist (best-effort; never blocks the response).
  if (SUPABASE_URL && SERVICE_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/narrations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        session_id: null, // session UUIDs are created when Supabase sessions are wired (P8)
        text,
        observations_json: digest,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ text, audioDataUrl: tts.audioDataUrl, provider: tts.provider, silent: false });
}
