/**
 * A twin from a person's own words (DECISIONS C93): what a language model, given a paragraph someone
 * wrote about themselves and nothing else, says they will do at every moment of the village.
 *
 * WHY. The research this world rests on found that twins built from what people SAY about themselves
 * call individuals worse than plain baselines, while watching what they DO works. The envelopes
 * already hold the echo against six yes-or-no lines (`wordsCall`); that is the twin from words at its
 * plainest. This is the real thing, built the way such twins are built: a paragraph, a model, a guess
 * for every situation. It is sealed beside the echo's call and opened with it, so the finding is made
 * on the reader, with their own words.
 *
 * A CONTESTANT, NEVER AN INPUT. Nothing here reaches `callFor`: the echo's call is made from what was
 * watched, exactly as before, whether or not a twin exists.
 *
 * WHAT A TWIN IS, ONCE MADE. A table: for each situation (a kind of moment, and the arm of its
 * experiment where it has arms) one of the ways that moment can end (`outcomesOf`). No sentence the
 * person wrote and none the model wrote is in it: the paragraph goes to the model once
 * (`lib/twinModel.ts`) and is kept nowhere, and whatever comes back that is not a real ending of a real
 * situation is dropped here, on the server and again in the browser.
 *
 * Pure: no clock, no storage, no network.
 */
import { MOMENT_KINDS, MOMENTS, verbsOf, type MomentKind } from "@echo/planet";

import { armWords } from "./armWords";
import { ON, outcomesOf } from "./calls";

/** A paragraph, not a line and not a life story: its length once trimmed, in characters. */
export const TWIN_TEXT = { min: 20, max: 600 } as const;

export interface TwinOption {
  /** One of `outcomesOf(kind)`. */
  id: string;
  text: string;
}

/** One thing the twin is asked: a kind of moment as it can be met, and the ways it can end. */
export interface TwinSituation {
  /** `${kind}:${arm}`, or `${kind}:-` for a moment with no arms. */
  id: string;
  kind: MomentKind;
  arm: string | null;
  text: string;
  options: TwinOption[];
}

/** The twin, as the visitor's record keeps it: when it was made, by which model, and its calls. Never the words. */
export interface Twin {
  at: string;
  model: string;
  /** By situation id: one of that moment's endings. */
  calls: Record<string, string>;
}

export const twinKey = (kind: MomentKind, arm: string | null): string => `${kind}:${arm ?? "-"}`;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * An ending as the model reads it, in English: the verb as the world offers it. Walking on and the
 * tale heard out have no verb; their words are the envelopes' (`env.on`, `env.told`), held equal by a
 * test, and written here so that nothing on the server's side of this file reads the page's strings.
 */
function optionText(kind: MomentKind, outcome: string): string {
  if (outcome === ON) return "Walk on";
  if (outcome === "told") return "Stay to hear the end";
  return verbsOf(kind).find((v) => v.id === outcome)?.label ?? outcome;
}

/**
 * Everything the twin is asked: each moment that can begin by itself, once for each arm of its
 * experiment (two coins in the purse, or nine), with every way it can end. The same list, in the same
 * order, every time.
 */
export function twinSituations(): TwinSituation[] {
  const out: TwinSituation[] = [];
  for (const kind of MOMENT_KINDS) {
    const def = MOMENTS[kind];
    if (def.followUp) continue;
    const options = outcomesOf(kind).map((id) => ({ id, text: optionText(kind, id) }));
    const arms: (string | null)[] = def.arms?.length ? def.arms.map((a) => a.id) : [null];
    for (const arm of arms) {
      const differs = armWords("en", kind, arm);
      out.push({ id: twinKey(kind, arm), kind, arm, text: differs ? `${capital(def.name)} — ${differs}` : capital(def.name), options });
    }
  }
  return out;
}

/** Each situation's endings, by its id. */
const ENDINGS: ReadonlyMap<string, readonly string[]> = new Map(twinSituations().map((s) => [s.id, s.options.map((o) => o.id)]));

/**
 * A twin's calls, from anything: only a real situation, and only one of its own endings, is kept.
 * Whatever else was there (a situation nobody asked, a sentence where an ending should be, an ending
 * that belongs to another moment) is dropped, and that situation has no call.
 */
export function readTwinCalls(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, endings] of ENDINGS) {
    const choice = (raw as Record<string, unknown>)[id];
    if (typeof choice === "string" && endings.includes(choice)) out[id] = choice;
  }
  return out;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,79}$/;

/** A twin, from anything: its calls as `readTwinCalls` reads them, a time, a model's id. Null where no call is left. */
export function readTwin(raw: unknown): Twin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const calls = readTwinCalls(r.calls);
  if (Object.keys(calls).length === 0) return null;
  if (typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) return null;
  return { at: new Date(r.at).toISOString(), model: typeof r.model === "string" && MODEL_ID.test(r.model) ? r.model : "", calls };
}

/** The twin's call for a moment as it is met, or null: no twin, no call for it, or a call the moment cannot end in. */
export function twinCall(twin: Twin | null | undefined, kind: MomentKind, arm: string | null): string | null {
  const call: unknown = twin?.calls?.[twinKey(kind, arm)];
  return typeof call === "string" && !MOMENTS[kind].followUp && outcomesOf(kind).includes(call) ? call : null;
}
