/**
 * A moment and its endings in the reader's words (DECISIONS C89): the name the world gives it, what
 * differed that time, and each way it can end, in English or Turkish. One place, so the envelopes in
 * the world and the friend's page say the same thing about the same moment.
 */
import { MOMENTS, verbOf, type MomentKind } from "@echo/planet";

import { nameText, t, verbLabel, type Lang } from "@/lib/i18n";

import { armWords } from "./armWords";
import { ON } from "./calls";

// In the words' own language, whatever the browser's: a Turkish "i" becomes "İ" for a Turkish line
// even on an English machine (it was "Iki ağır testi…" there).
const capital = (s: string, lang: Lang) => s.charAt(0).toLocaleUpperCase(lang === "tr" ? "tr-TR" : "en-US") + s.slice(1);

/** The moment as a heading: "A purse lying in the grass", and "nine coins in it" where an arm says so. */
export function momentWords(lang: Lang, kind: MomentKind, arm: string | null): { name: string; arm: string | null } {
  return { name: capital(nameText(lang, MOMENTS[kind].name), lang), arm: armWords(lang, kind, arm) };
}

/** One way a moment can end, as its verb reads in the world; walking on and the tale told have their own words. */
export function outcomeWords(lang: Lang, kind: MomentKind, outcome: string): string {
  if (outcome === ON) return capital(t(lang, "env.on"), lang);
  if (outcome === "told") return capital(t(lang, "env.told"), lang);
  const verb = verbOf(kind, outcome);
  return verb ? verbLabel(lang, verb.label) : outcome;
}
