/**
 * A turn (DECISIONS C97, `lib/previewPass.ts`): the link that lets one person walk the whole village.
 *
 *   GET /in/<code>              a code on the deployment's list leaves the cookie and walks into the open
 *                               village; anything else leads to the waitlist, and says nothing of why.
 *   GET /in/<code>?room=<ROOM>  the same, into the copy of the village a group shares (C101, C106), with
 *                               its door open on the room: the one link a friend is sent.
 */
import { NextResponse } from "next/server";
import { ROOM_VILLAGES, normalizeRoomCode } from "@echo/shared";

import { OPEN_VILLAGE, OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { PASS_COOKIE, passFor } from "@/lib/previewPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const pass = passFor(code);
  if (!pass) return NextResponse.redirect(new URL("/#waitlist", req.url), 303);
  // A room is named as the door writes it, and only for a village that has rooms; any other is the village.
  const room = ROOM_VILLAGES.includes(OPEN_VILLAGE) ? normalizeRoomCode(new URL(req.url).searchParams.get("room")) : null;
  const res = NextResponse.redirect(new URL(room ? `${OPEN_VILLAGE_PATH}?room=${room}` : OPEN_VILLAGE_PATH, req.url), 303);
  res.cookies.set(PASS_COOKIE, pass, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  // A link with a code in it is not for a search engine or a cache.
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex");
  return res;
}
