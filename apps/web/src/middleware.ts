/**
 * The landing in its reader's language from its first byte (DECISIONS C97, `lib/langOf.ts`).
 *
 * `/` is built twice, in English (`app/page.tsx`) and in Turkish (`app/tr/page.tsx`), and both are
 * static. A request for `/` whose reader reads Turkish is handed the Turkish one under the same
 * address; everyone else passes. Nothing else on the site goes through here.
 */
import { NextResponse, type NextRequest } from "next/server";

import { LANG_COOKIE, langOf } from "@/lib/langOf";

export function middleware(req: NextRequest) {
  if (langOf(req.cookies.get(LANG_COOKIE)?.value, req.headers.get("accept-language")) !== "tr") return NextResponse.next();
  return NextResponse.rewrite(new URL("/tr", req.url));
}

export const config = { matcher: ["/"] };
