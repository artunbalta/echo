/**
 * Capability detection (§2). Read once at runtime from env; every external dependency
 * has a live + mock implementation behind one interface, selected here. A missing key
 * NEVER crashes — it only changes which implementation a factory returns. Server-only:
 * keys must never reach the PixiJS client.
 */
import "server-only";
import type { ModeSummary } from "./types";

export const hasLLM = !!process.env.ANTHROPIC_API_KEY;
// Accept the spec's names and the existing ECHO art/tts env names interchangeably.
export const hasArt = !!(process.env.HIGGSFIELD_API_KEY || process.env.FAL_API_KEY || process.env.FAL_KEY);
export const hasTTS = !!process.env.TTS_API_KEY;
export const hasDB = !!process.env.DATABASE_URL;

export function modeSummary(): ModeSummary {
  const dialogue = hasLLM ? "live" : "mock";
  const live = [hasLLM && "dialogue", hasArt && "art", hasTTS && "voice"].filter(Boolean);
  const label =
    live.length === 0
      ? "mock mode · no keys"
      : `live: ${live.join("+")}${live.length < 3 ? " · rest mock" : ""}`;
  return {
    dialogue,
    art: hasArt ? "live" : "mock",
    voice: hasTTS ? "live" : "mock",
    persistence: hasDB ? "db" : "memory",
    label,
  };
}

let logged = false;
/** Log the active mode exactly once per server process. */
export function logModeOnce() {
  if (logged) return;
  logged = true;
  // eslint-disable-next-line no-console
  console.log(`[venue] ${modeSummary().label} (dialogue=${hasLLM ? "LLM" : "scripted"}, ` +
    `art=${hasArt ? "generated" : "committed"}, voice=${hasTTS ? "on" : "off"}, ` +
    `store=${hasDB ? "db" : "memory"})`);
}
