/**
 * Villagers' own voices, and hearing the stranger's (DECISIONS C60). Server-only: it holds the key.
 *
 * ONE VOICE A PERSON, FROM THE ACCOUNT'S OWN VOICES. ElevenLabs' voice list carries `gender` and `age`
 * labels. A villager gets one voice from the voices of their sex and age: each voice is given a
 * number from the person's id and its own, and the highest wins. The same person sounds the same on
 * every visit, two neighbours rarely sound alike, and a voice added to the account takes over only
 * the villagers it now wins, rather than reshuffling everyone (a voice removed, only its own).
 * Within that, a voice made for social media or advertising is passed over while another will do.
 *
 * NEVER A CLONED VOICE. A cloned voice is somebody's own: the account this was built on holds one.
 * No villager ever speaks in it, whatever else the list lacks.
 *
 * YOUR OWN VOICE, AND ONLY YOURS (C62). The account's owner asked for that cloned voice to be theirs
 * in the world: the lines they type to villagers, and later their echo's. It is bound on the server
 * to the subjects listed in `ECHO_OWNER_SUBJECTS`, and to the one voice named in
 * `ELEVENLABS_OWNER_VOICE_ID`; both must be set, nothing is guessed from the list. Anyone else
 * asking for it is refused, because a voice anyone could type into is a voice anyone could put words
 * in the mouth of. And the owner's voice is struck from the villagers' list whatever its labels say.
 *
 * The pace comes from the person: a child quicker, the old slower, and the lively quicker and less
 * even than the unhurried (the temperament's "lively and quick" axis, `life.ts` `temperamentOf`).
 * `pickVoice` is pure, and is what the tests pin; the list is read from the account and kept for an
 * hour.
 *
 * WHAT GOES WHERE, said in the panel before it is switched on:
 *
 * - **A villager's reply** goes to ElevenLabs to be spoken.
 * - **What the stranger says aloud** goes to ElevenLabs to be written down. It is recorded only while
 *   they hold the key, it is not kept here, and nothing about how they sound is measured. What comes
 *   back is text, sent like anything typed.
 *
 * Without a key or a reachable list, everything here answers null, and the panel falls back to the
 * browser's own local voices (C44) and to typing.
 */
import "server-only";

const API = "https://api.elevenlabs.io";
const KEY = () => process.env.ELEVENLABS_API_KEY ?? "";
const TTS_MODEL = () => process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";
const STT_MODEL = () => process.env.ELEVENLABS_STT_MODEL ?? "scribe_v2";

export interface Voice {
  id: string;
  name: string;
  sex: "f" | "m" | null;
  age: "young" | "middle" | "old" | null;
  /** A cloned voice: a real person's own, never a villager's. */
  cloned: boolean;
  /** False for a voice made to sell or to post (`use_case` social_media, advertisement). */
  fits: boolean;
}

/** Fewer voices than this for a sex and age, and the nearest age's voices join them. */
export const VOICE_POOL = 3;
const NEAR_AGE: Record<"young" | "middle" | "old", readonly Voice["age"][]> = { young: ["middle"], middle: ["young", "old"], old: ["middle"] };

/** Voices made for a feed or an advert, which a villager would not sound like while another will do. */
const UNFITTING = new Set(["social_media", "advertisement"]);

export interface VoiceChoice {
  voiceId: string;
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number };
}

/** A number in [0, 1) from a string: the same person, the same voice. */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** The labels as they come, to what a villager is. */
export function readVoice(v: { voice_id: string; name?: string; category?: string; labels?: Record<string, string> }): Voice {
  const g = (v.labels?.gender ?? "").toLowerCase();
  const a = (v.labels?.age ?? "").toLowerCase().replace(/[\s_-]+/g, " ");
  return {
    id: v.voice_id,
    name: v.name ?? v.voice_id,
    sex: g.startsWith("f") ? "f" : g.startsWith("m") ? "m" : null,
    age: a.includes("young") ? "young" : a.includes("middle") ? "middle" : a.includes("old") ? "old" : null,
    cloned: (v.category ?? "").toLowerCase() === "cloned",
    fits: !UNFITTING.has((v.labels?.use_case ?? "").toLowerCase()),
  };
}

/**
 * A villager's voice from a list: their sex and age where the list has it, widened to the nearest
 * age when it has fewer than `VOICE_POOL` (so the old do not all share the one old voice, and an old
 * woman is given a middle-aged voice before a girl's), their sex where it has neither, anyone's at the
 * last. Within an age, a fitting voice before an unfitting one. Never a cloned voice. Children take
 * the young voices of their sex, spoken quicker. `lively` is the temperament's "lively and quick"
 * axis, −1 … 1: a little quicker and less even for the lively, slower and steadier for the unhurried.
 */
export function pickVoice(p: { id: string; sex: "f" | "m"; ageYears: number; lively?: number }, voices: readonly Voice[]): VoiceChoice | null {
  const age: "young" | "middle" | "old" = p.ageYears < 30 ? "young" : p.ageYears < 60 ? "middle" : "old";
  const usable = voices.filter((v) => !v.cloned);
  if (usable.length === 0) return null;
  const fitting = (vs: Voice[]) => (vs.some((v) => v.fits) ? vs.filter((v) => v.fits) : vs);
  const theirs = usable.filter((v) => v.sex === p.sex);
  const exact = fitting(theirs.filter((v) => v.age === age));
  const near = exact.length >= VOICE_POOL ? exact : [...exact, ...fitting(theirs.filter((v) => v.age !== null && NEAR_AGE[age].includes(v.age)))];
  const pool = [near, fitting(theirs), fitting(usable)].find((x) => x.length > 0)!;
  let voice = pool[0]!;
  for (const v of pool) if (unit(`${p.id}|${v.id}`) > unit(`${p.id}|${voice.id}`)) voice = v;
  const lively = Math.max(-1, Math.min(1, p.lively ?? 0));
  const pace = (p.ageYears < 13 ? 1.08 : p.ageYears >= 65 ? 0.9 : 0.97 + (unit(`${p.id}/pace`) - 0.5) * 0.06) + 0.05 * lively;
  return {
    voiceId: voice.id,
    settings: { stability: Math.round((0.5 - 0.15 * lively) * 100) / 100, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: Math.round(Math.max(0.7, Math.min(1.2, pace)) * 100) / 100 },
  };
}

let catalogue: { at: number; voices: Voice[] } | null = null;

const ownerVoiceId = () => (process.env.ELEVENLABS_OWNER_VOICE_ID ?? "").trim();

/**
 * People's own voices beyond the owner's (C71): `ECHO_VOICES`, as `subject=voiceId` pairs separated by
 * commas. Each is a voice that person cloned of themselves, bound to their identity here and to nobody
 * else's, exactly as the owner's is by `ELEVENLABS_OWNER_VOICE_ID` and `ECHO_OWNER_SUBJECTS` (C62).
 */
function boundVoices(): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (process.env.ECHO_VOICES ?? "").split(",")) {
    const [subject, voice] = pair.split("=").map((x) => x.trim());
    if (subject && voice) out.set(subject, voice);
  }
  const id = ownerVoiceId();
  if (id) for (const s of (process.env.ECHO_OWNER_SUBJECTS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) out.set(s, id);
  return out;
}

/**
 * A person's own voice (C62, C71), or null: the one bound to their identity, and only theirs. Steadier
 * than a villager's: it is a person's voice, and it should sound like them. Who may HEAR it is the
 * caller's to decide: the person themselves (`/api/voice/self`), or the one they paired their echo with,
 * for what their echo said to that person's (`/api/echo/meet`).
 */
export function voiceOf(subject: string): VoiceChoice | null {
  const id = boundVoices().get(subject);
  if (!id) return null;
  return { voiceId: id, settings: { stability: 0.55, similarity_boost: 0.85, style: 0, use_speaker_boost: true, speed: 1 } };
}

/** The caller's own voice (C62): `voiceOf` asked by the person it belongs to. */
export const ownVoice = voiceOf;

/** The account's voices, kept for an hour; null without a key or when the list cannot be read. */
export async function voiceList(): Promise<Voice[] | null> {
  if (!KEY()) return null;
  if (catalogue && Date.now() - catalogue.at < 60 * 60 * 1000) return catalogue.voices;
  try {
    const res = await fetch(`${API}/v2/voices?page_size=100&include_total_count=false`, { headers: { "xi-api-key": KEY() }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { voices?: { voice_id: string; name?: string; category?: string; labels?: Record<string, string> }[] };
    // No villager is ever given a person's own voice, cloned or not: the owner's, or any bound in ECHO_VOICES.
    const people = new Set(boundVoices().values());
    const voices = (data.voices ?? []).map(readVoice).filter((v) => !v.cloned && !people.has(v.id));
    if (voices.length === 0) return null;
    catalogue = { at: Date.now(), voices };
    return voices;
  } catch {
    return null;
  }
}

/** Forget the list, for tests. */
export function resetVoices(): void {
  catalogue = null;
  spoken.clear();
}

const spoken = new Map<string, ArrayBuffer>();

/** A line spoken in a voice, as mp3; kept for the next time the same voice says the same words. */
export async function speakLine(text: string, choice: VoiceChoice): Promise<ArrayBuffer | null> {
  if (!KEY()) return null;
  const key = `${choice.voiceId}|${choice.settings.speed}|${choice.settings.stability}|${text}`;
  const kept = spoken.get(key);
  if (kept) return kept;
  try {
    const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(choice.voiceId)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": KEY(), "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL(), voice_settings: choice.settings }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[voice] text to speech answered ${res.status}`);
      return null;
    }
    const audio = await res.arrayBuffer();
    if (spoken.size >= 64) spoken.delete(spoken.keys().next().value!);
    spoken.set(key, audio);
    return audio;
  } catch (e) {
    console.warn(`[voice] text to speech failed: ${(e as Error).message}`);
    return null;
  }
}

/** What was said in a recording, as text; null when it could not be heard. */
export async function hearSpeech(audio: ArrayBuffer, type: string, language: string | null): Promise<string | null> {
  if (!KEY()) return null;
  try {
    const form = new FormData();
    form.append("model_id", STT_MODEL());
    if (language) form.append("language_code", language);
    form.append("file", new Blob([audio], { type }), `speech.${type.includes("ogg") ? "ogg" : type.includes("mp4") ? "mp4" : type.includes("wav") ? "wav" : "webm"}`);
    const res = await fetch(`${API}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": KEY() }, body: form, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      console.warn(`[voice] speech to text answered ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { text?: string };
    return typeof data.text === "string" ? data.text.trim() : null;
  } catch (e) {
    console.warn(`[voice] speech to text failed: ${(e as Error).message}`);
    return null;
  }
}

// ── a visitor's own voice, for a day (C72) ──────────────────────────────────────

/**
 * Clone a voice from one recording (ElevenLabs instant voice cloning). Only for a demo visitor who has
 * just said yes to exactly this, and the caller deletes it within a day (`removeVoice`). Null when it
 * could not be made; the reason is logged, never shown.
 */
export async function addVoice(name: string, audio: ArrayBuffer, type: string, description: string): Promise<string | null> {
  if (!KEY()) return null;
  try {
    const form = new FormData();
    form.append("name", name);
    form.append("description", description);
    form.append("remove_background_noise", "true");
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") ? "mp3" : "webm";
    form.append("files", new Blob([audio], { type }), `voice.${ext}`);
    const res = await fetch(`${API}/v1/voices/add`, { method: "POST", headers: { "xi-api-key": KEY() }, body: form, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) {
      console.warn(`[voice] cloning answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { voice_id?: string };
    return data.voice_id ?? null;
  } catch (e) {
    console.warn(`[voice] cloning failed: ${(e as Error).message}`);
    return null;
  }
}

/** Delete a cloned voice at ElevenLabs. True when it is gone (or was never there). */
export async function removeVoice(voiceId: string): Promise<boolean> {
  if (!KEY()) return false;
  try {
    const res = await fetch(`${API}/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": KEY() }, signal: AbortSignal.timeout(20_000) });
    // Already gone counts as gone.
    if (res.ok || res.status === 404) return true;
    const text = await res.text().catch(() => "");
    if (res.status === 400 && /not.?found|does not exist|voice_not_found/i.test(text)) return true;
    console.warn(`[voice] deleting ${voiceId} answered ${res.status}: ${text.slice(0, 200)}`);
    return false;
  } catch (e) {
    console.warn(`[voice] deleting ${voiceId} failed: ${(e as Error).message}`);
    return false;
  }
}
