/**
 * Which language the page is in (DECISIONS C69), apart from the words themselves.
 *
 * WHY IT IS APART. `lib/i18n.ts` holds every string of the world's chrome in two languages: ninety
 * kilobytes that a page needs only if it says those strings. The landing says its own (`app/page.tsx`),
 * and needs to know only which language to say them in. Importing the hook from the table's file put
 * the whole table in the landing's first load. So the choice lives here, the table imports it, and
 * every existing import from `lib/i18n` still finds it there.
 *
 * WHICH LANGUAGE. English (C99): it is the site's language. Turkish is the person's own choice, made
 * with the switch and kept in this browser. Before they have made one, a page is read in the language
 * it was built in, which is English everywhere but at `/tr`, the address for a link meant to be read
 * in Turkish. The browser's own language decides nothing: it used to (C69, C97), and a phone set to
 * Turkish opened a Turkish site nobody had asked for.
 *
 * WHAT THE SERVER RENDERS. English, unless the page was built in another language and says so with
 * `ServedLang` (C97): the landing is built in both, and a reader who chose Turkish is handed the
 * Turkish one (`middleware.ts`, `lib/langOf.ts`), so its words do not all change a moment after they
 * appear. A page with no `ServedLang` renders English on the server and switches on the client.
 */
import { useEffect, useSyncExternalStore } from "react";

import { LANG_COOKIE } from "./langOf";
import { useServedLang } from "./servedLang";

export type Lang = "en" | "tr";
export const LANGS: readonly Lang[] = ["en", "tr"];
export const LANG_NAME: Record<Lang, string> = { en: "English", tr: "Türkçe" };

const KEY = "echo.lang";

/** The person's choice, once it has been read or made; `undefined` until this browser has been asked. */
let chosen: Lang | null | undefined;
const listeners = new Set<() => void>();

/** What the person chose here, or null if they have chosen nothing. */
function choice(): Lang | null {
  if (chosen !== undefined) return chosen;
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(KEY);
  } catch {
    // nothing kept
  }
  chosen = kept === "tr" || kept === "en" ? kept : null;
  return chosen;
}

export function setLang(lang: Lang): void {
  chosen = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // kept for this page only
  }
  // And where the server can see it, so the next page it builds for this reader is in this language.
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // no cookies: the next page is built in English, and turns on arriving
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const l of listeners) l();
}

/**
 * The language, for a component: the person's choice, and the one the page was built in where they
 * have made none (English unless the page says). On the server and during hydration, the page's.
 */
export function useLang(): Lang {
  const served = useServedLang();
  const lang = useSyncExternalStore<Lang>(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => choice() ?? served,
    () => served,
  );
  // The page says which language it is in, for a screen reader's voice and the browser's hyphenation.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return lang;
}
