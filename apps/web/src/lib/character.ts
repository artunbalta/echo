/**
 * Client-side character creation orchestration (§6). Ties together vision attribute
 * extraction, the attribute-driven sprite sheet, optional high-fidelity portrait, and
 * upload. Keeps the raw selfie in memory only for the duration of the calls (§13).
 */
import type { CharacterAttributes } from "@echo/shared";
import { config } from "./config";
import { getSupabase } from "./supabase";
import { styleFromAttributes, styleFromId, buildCharacterSheet } from "@/game/art";

export interface CharacterResult {
  attributes: CharacterAttributes;
  spriteUrl: string; // http(s) URL (uploaded) or data URL fallback
  portraitUrl: string; // may be "" when no art provider configured
  source: "selfie" | "premade";
}

/** Extract style attributes from a selfie data URL. Raw image is discarded server-side. */
export async function extractAttributes(selfieDataUrl: string): Promise<CharacterAttributes> {
  const res = await fetch("/api/vision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selfie: selfieDataUrl }),
  });
  if (!res.ok) throw new Error("vision failed");
  const data = (await res.json()) as { attributes: CharacterAttributes };
  return data.attributes;
}

/** Ask the server to generate a high-fidelity portrait (provider holds the key). */
async function fetchPortrait(attributes: CharacterAttributes): Promise<string> {
  try {
    const res = await fetch("/api/portrait", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attributes }),
    });
    const data = (await res.json()) as { url: string; placeholder: boolean };
    return data.placeholder ? "" : data.url;
  } catch {
    return "";
  }
}

/** Render the sprite sheet to a PNG blob and upload to Supabase Storage; fall back to a
 *  data URL when Storage isn't configured so multiplayer still shares the avatar. */
async function uploadSheet(canvas: HTMLCanvasElement, key: string): Promise<string> {
  const supabase = getSupabase();
  const dataUrl = canvas.toDataURL("image/png");
  if (!supabase) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `sheets/${key}.png`;
    // config.artStorageBucket defaults to "characters" — the name this used to hardcode in two
    // places — so this is a no-op unless NEXT_PUBLIC_ART_STORAGE_BUCKET is set. See config.ts for
    // why the documented `ART_STORAGE_BUCKET` could never have worked.
    const bucket = config.artStorageBucket;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: "image/png" });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn("[character] storage upload failed, using data URL:", err);
    return dataUrl;
  }
}

/** Full selfie → character pipeline. */
export async function createFromSelfie(
  selfieDataUrl: string,
  userId: string,
): Promise<CharacterResult> {
  const attributes = await extractAttributes(selfieDataUrl);
  const style = styleFromAttributes(attributes, userId);
  const sheet = buildCharacterSheet(style);
  const [spriteUrl, portraitUrl] = await Promise.all([
    uploadSheet(sheet, `${userId}_${Date.now()}`),
    fetchPortrait(attributes),
  ]);
  return { attributes, spriteUrl, portraitUrl, source: "selfie" };
}

/** Premade gallery: deterministic styles from the same generator (consistent art). */
export function premadeStyles(count = 8): { id: string; dataUrl: string }[] {
  const out: { id: string; dataUrl: string }[] = [];
  for (let i = 0; i < count; i++) {
    const id = `premade_${i}`;
    out.push({ id, dataUrl: buildCharacterSheet(styleFromId(id)).toDataURL("image/png") });
  }
  return out;
}

export async function createFromPremade(premadeId: string, userId: string): Promise<CharacterResult> {
  const style = styleFromId(premadeId);
  const sheet = buildCharacterSheet(style);
  const spriteUrl = await uploadSheet(sheet, `${userId}_${premadeId}`);
  return { attributes: {}, spriteUrl, portraitUrl: "", source: "premade" };
}
