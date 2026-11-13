"use client";

/**
 * The language a page was built in (DECISIONS C97), for everything under it.
 *
 * A page built in Turkish (`app/tr/page.tsx`) wraps itself in `ServedLang`, and `useLang` reads it for
 * what the server renders and what hydration expects. It is a file of its own, marked for the client,
 * because `lib/lang.ts` is also read by the server's own code (through `lib/i18n.ts`), where a context
 * cannot be made.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { ServedLang as Lang } from "./langOf";

const Served = createContext<Lang>("en");

export function ServedLang({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Served.Provider value={lang}>{children}</Served.Provider>;
}

/** English unless the page says otherwise. */
export const useServedLang = (): Lang => useContext(Served);
