/**
 * The landing in the language its reader chose, from its first byte (DECISIONS C97, C99; `lib/langOf.ts`).
 *
 * `/` is built twice, in English (`app/page.tsx`) and in Turkish (`app/tr/page.tsx`), and both are
 * static. A request for `/` from a reader who chose Turkish here is handed the Turkish one under the
 * same address; everyone else gets the English page, whatever their browser is set to. Nothing else on
 * the site goes through here.
 */
import { NextResponse, type NextRequest } from "next/server";

import { LANG_COOKIE, langOf } from "@/lib/langOf";

export function middleware(req: NextRequest) {
  if (langOf(req.cookies.get(LANG_COOKIE)?.value) !== "tr") return NextResponse.next();
  return NextResponse.rewrite(new URL("/tr", req.url));
}

export const config = { matcher: ["/"] };
