/**
 * Which language the page is in (DECISIONS C69), apart from the words themselves.
 *
 * WHY IT IS APART. `lib/i18n.ts` holds every string of the world's chrome in two languages: ninety
 * kilobytes that a page needs only if it says those strings. The landing says its own (`app/page.tsx`),
 * and needs to know only which language to say them in. Importing the hook from the table's file put
 * the whole table in the landing's first load. So the choice lives here, the table imports it, and
 * every existing import from `lib/i18n` still finds it there.
 *
 * WHICH LANGUAGE. The person's own choice, kept in this browser; before they have made one, the
 * browser's first language if it is Turkish, and English otherwise.
 *
 * WHAT THE SERVER RENDERS. English, unless the page was built in another language and says so with
 * `ServedLang` (C97): the landing is built in both, and a Turkish reader is handed the Turkish one
 * (`middleware.ts`, `lib/langOf.ts`), so its words do not all change a moment after they appear. A
 * page with no `ServedLang` renders English on the server and switches on the client, as before.
 */
import { useEffect, useSyncExternalStore } from "react";

import { LANG_COOKIE } from "./langOf";
import { useServedLang } from "./servedLang";

export type Lang = "en" | "tr";
export const LANGS: readonly Lang[] = ["en", "tr"];
export const LANG_NAME: Record<Lang, string> = { en: "English", tr: "Türkçe" };

const KEY = "echo.lang";

/** The browser's first choice, read as a language we have. */
export function detectLang(languages: readonly string[]): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "tr") return "tr";
    if (base === "en") return "en";
  }
  return "en";
}

let current: Lang | null = null;
const listeners = new Set<() => void>();

function read(): Lang {
  if (current) return current;
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(KEY);
  } catch {
    // nothing kept
  }
  current = kept === "tr" || kept === "en" ? kept : detectLang(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // kept for this page only
  }
  // And where the server can see it, so the next page it builds for this reader is in this language.
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // no cookies: the browser's own language decides, as on a first visit
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const l of listeners) l();
}

/** The language, for a component. On the server and during hydration, the one the page was built in (English unless it says). */
export function useLang(): Lang {
  const served = useServedLang();
  const lang = useSyncExternalStore<Lang>(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    read,
    () => served,
  );
  // The page says which language it is in, for a screen reader's voice and the browser's hyphenation.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return lang;
}
