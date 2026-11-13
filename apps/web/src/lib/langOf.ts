/**
 * Which language to SERVE a page in (DECISIONS C97): the half of `lib/lang.ts` that runs before React
 * does, in the middleware.
 *
 * The site's language is English (C99, the owner's words: "the main language must be English"). It
 * knows Turkish too, and Turkish is a CHOICE: the header's switch, kept in a cookie by `setLang`. The
 * landing is built once in each language, and the middleware hands a request the Turkish one only when
 * its reader chose Turkish here before (`middleware.ts`), so that a page they will read in Turkish is
 * Turkish from its first byte and its words do not all change a moment after they appear.
 *
 * For a week (C97) the browser's own language decided where nobody had chosen: a phone set to Turkish
 * was handed the Turkish page. That is gone. What a browser asks for is not what a reader asked for.
 *
 * It imports nothing, so the middleware that runs on every arrival carries nothing but this.
 */
export type ServedLang = "en" | "tr";

/** The reader's own choice, as the server can see it. `setLang` writes it; the browser keeps its copy in storage too. */
export const LANG_COOKIE = "echo.lang";

/** The language the reader chose here, and English where they have chosen none. Anything else in the cookie is not a choice. */
export function langOf(cookie: string | undefined): ServedLang {
  return cookie === "tr" ? "tr" : "en";
}
