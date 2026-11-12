/**
 * Everything the friend's page knows (DECISIONS C89): how to read a link's fragment, and the words for
 * each moment, each way it can end, and the page itself, in English and Turkish.
 *
 * WHY ITS OWN MODULE. `/guess` is what a friend opens from a link, often on a phone, and it shows a
 * handful of moments. To name them it imported `MOMENTS` and `verbsOf` from `@echo/planet` (the whole
 * planet: terrain, society, navigation) and `t` from `lib/i18n.ts` (every string in the app): 290 kB
 * of first load against the 103 kB every page shares. So the page reads a small catalogue instead,
 * `data/moments.json`, written by `scripts/moment-catalogue.mjs` from the planet, `say.ts`'s wording,
 * `armWords.ts` and the `guess.*` strings, and held to all of them by `tests/guessPage.test.mts`.
 *
 * WHAT IT MAY IMPORT. The catalogue and `@/lib/lang`, and nothing else: not the planet, not the
 * strings' table, not `calls.ts`, `say.ts` or `armWords.ts`, which bring those with them. The same test
 * reads this file's imports and fails on any other.
 *
 * The link is made in the village (`guessLink.ts`: `pickForFriend`, `encodeGuess`) and read here, and
 * only here.
 */
import type { Lang } from "@/lib/lang";

import catalogue from "./data/moments.json";

type Words = Record<Lang, string>;

interface Moment {
  name: Words;
  /** Every arm of its experiment; null where an arm adds nothing to the moment's name. */
  arms: Record<string, Words | null>;
  /** The ways it can end, in the order `calls.ts` gives them: its verbs, the tale told, walking on. */
  outcomes: ({ id: string } & Words)[];
}

/** A moment a call can be made at: every kind but those never begun by themselves. */
export type GuessKind = keyof typeof catalogue.moments;
/** One of the page's own strings. */
export type GuessKey = keyof typeof catalogue.strings.en;

const MOMENTS: Record<GuessKind, Moment> = catalogue.moments;
const STRINGS: Record<Lang, Record<GuessKey, string>> = catalogue.strings;

export interface GuessItem {
  /** The moment, the arm met, the echo's call, and what was done. */
  k: GuessKind;
  a: string | null;
  c: string;
  d: string;
}

export interface GuessLink {
  v: 1;
  /** The name they chose to go by, or empty. */
  n: string;
  items: GuessItem[];
}

/** The ways a moment can end that a guess can name. */
export function outcomesOf(kind: GuessKind): string[] {
  return MOMENTS[kind].outcomes.map((o) => o.id);
}

/** The moment as a heading: "A purse lying in the grass", and "nine coins in it" where an arm says so. */
export function momentWords(lang: Lang, kind: GuessKind, arm: string | null): { name: string; arm: string | null } {
  const moment = MOMENTS[kind];
  return { name: moment.name[lang], arm: arm !== null && Object.hasOwn(moment.arms, arm) ? (moment.arms[arm]?.[lang] ?? null) : null };
}

/** One way a moment can end, in words. */
export function outcomeWords(lang: Lang, kind: GuessKind, outcome: string): string {
  return MOMENTS[kind].outcomes.find((o) => o.id === outcome)?.[lang] ?? outcome;
}

/** A string of the page, with `{name}` filled from `vars`: `lib/i18n.ts`'s `t`, over the page's own few. */
export function say(lang: Lang, key: GuessKey, vars: Record<string, string | number | undefined> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

const fromB64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Read a link's fragment. Anything that is not a whole, sensible link is null: the page says so and shows nothing. */
export function decodeGuess(fragment: string): GuessLink | null {
  try {
    const link = JSON.parse(new TextDecoder().decode(fromB64Url(fragment.replace(/^#/, "")))) as GuessLink;
    if (link?.v !== 1 || typeof link.n !== "string" || !Array.isArray(link.items)) return null;
    if (link.items.length < catalogue.items.min || link.items.length > catalogue.items.max) return null;
    for (const it of link.items) {
      // `hasOwn`: "constructor" is not a moment. A kind never begun by itself is not in the catalogue.
      if (typeof it?.k !== "string" || !Object.hasOwn(MOMENTS, it.k)) return null;
      const outs = outcomesOf(it.k);
      if (!outs.includes(it.c) || !outs.includes(it.d)) return null;
      if (it.a !== null && !(typeof it.a === "string" && Object.hasOwn(MOMENTS[it.k].arms, it.a))) return null;
    }
    return { v: 1, n: link.n.slice(0, 40), items: link.items.map((it) => ({ k: it.k, a: it.a, c: it.c, d: it.d })) };
  } catch {
    return null;
  }
}
