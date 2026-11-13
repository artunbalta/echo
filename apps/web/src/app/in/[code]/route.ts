/**
 * A turn (DECISIONS C97, `lib/previewPass.ts`): the link that lets one person walk the whole village.
 *
 *   GET /in/<code>   a code on the deployment's list leaves the cookie and walks into the open
 *                    village; anything else leads to the waitlist, and says nothing of why.
 */
import { NextResponse } from "next/server";

import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { PASS_COOKIE, passFor } from "@/lib/previewPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const pass = passFor(code);
  if (!pass) return NextResponse.redirect(new URL("/#waitlist", req.url), 303);
  const res = NextResponse.redirect(new URL(OPEN_VILLAGE_PATH, req.url), 303);
  res.cookies.set(PASS_COOKIE, pass, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  // A link with a code in it is not for a search engine or a cache.
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex");
  return res;
}
