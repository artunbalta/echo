/**
 * TTS provider layer for the narrator (§11). Server-only (holds keys). Returns audio as a
 * base64 data URL the client can play. When no provider/key is configured, returns null —
 * the client then falls back to the browser SpeechSynthesis API, so the spoken narrator
 * works even with zero keys.
 *
 * ElevenLabs and OpenAI TTS contracts are stable/well-documented; both are implemented
 * straightforwardly. Selected via TTS_PROVIDER.
 */
import "server-only";

const PROVIDER = (process.env.TTS_PROVIDER ?? "mock").toLowerCase();

export interface TtsResult {
  audioDataUrl: string | null;
  provider: string;
}

export async function synthesize(text: string): Promise<TtsResult> {
  try {
    if (PROVIDER === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
      return { audioDataUrl: await elevenlabs(text), provider: "elevenlabs" };
    }
    if (PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
      return { audioDataUrl: await openai(text), provider: "openai" };
    }
  } catch (err) {
    console.warn("[tts] synthesis failed, client will use browser voice:", (err as Error).message);
  }
  // mock / unconfigured → client uses SpeechSynthesis
  return { audioDataUrl: null, provider: "browser" };
}

async function elevenlabs(text: string): Promise<string> {
  const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // a default ElevenLabs voice
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.7 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}

async function openai(text: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", input: text, voice: "alloy", response_format: "mp3" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`openai tts ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}
