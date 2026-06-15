import { NextResponse } from "next/server";
import { hasTTS } from "@/lib/venue/capabilities";

export const dynamic = "force-dynamic";

const PROVIDER = process.env.TTS_PROVIDER ?? "elevenlabs";
const KEY = process.env.TTS_API_KEY ?? "";

/**
 * Salesperson voice (§11). Gated entirely behind the capability check: no key → 404 and
 * the client stays text-only. Provider isolated so it's swappable. Turkish output.
 */
export async function POST(req: Request) {
  if (!hasTTS) return NextResponse.json({ error: "voice disabled" }, { status: 404 });
  const { text } = (await req.json()) as { text?: string };
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  try {
    if (PROVIDER === "openai") {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.TTS_MODEL ?? "tts-1", voice: process.env.TTS_VOICE ?? "alloy", input: text }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return NextResponse.json({ error: "tts failed" }, { status: 502 });
      return new NextResponse(r.body, { headers: { "content-type": "audio/mpeg" } });
    }
    // ElevenLabs (default)
    const voice = process.env.TTS_VOICE ?? "21m00Tcm4TlvDq8ikWAM";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.TTS_MODEL ?? "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return NextResponse.json({ error: "tts failed" }, { status: 502 });
    return new NextResponse(r.body, { headers: { "content-type": "audio/mpeg" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
