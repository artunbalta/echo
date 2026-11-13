/**
 * Which language to SERVE a page in (DECISIONS C97): the half of `lib/lang.ts` that runs before React
 * does, in the middleware.
 *
 * The site knows two languages and a page was always served in English: a reader whose browser is
 * Turkish saw the English page for as long as the script took to arrive, and then every word on it
 * changed. So the landing is built once in each language, and the middleware hands a request the one
 * its reader will read (`middleware.ts`): the language they chose here before, kept in a cookie by
 * `setLang`; failing that, the first language their browser asks for that we have.
 *
 * It imports nothing, so the middleware that runs on every arrival carries nothing but this.
 */
export type ServedLang = "en" | "tr";

/** The reader's own choice, as the server can see it. `setLang` writes it; the browser keeps its copy in storage too. */
export const LANG_COOKIE = "echo.lang";

/** The first language of an `Accept-Language` header that we have, in the order the browser gave. */
export function langOf(cookie: string | undefined, acceptLanguage: string | null): ServedLang {
  if (cookie === "tr" || cookie === "en") return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const base = part.split(";")[0]!.trim().toLowerCase().split("-")[0];
    if (base === "tr") return "tr";
    if (base === "en") return "en";
  }
  return "en";
}
