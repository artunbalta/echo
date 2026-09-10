import { NextResponse } from "next/server";

import { signIdentity } from "@echo/shared/identity";

import { adminClient, anonServer } from "@/lib/supabaseAdmin";
import { identitySecrets } from "@/lib/subject";
import { assignIslandForUser } from "@/lib/island-registry";

export const runtime = "nodejs";

/**
 * After a successful sign-in, ensure a public.users row exists for this auth user
 * and return its id (used as echo.userId across the app). Verifies the caller's
 * access token before writing.
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 401 });

  const anon = anonServer();
  if (!anon) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const {
    data: { user },
    error,
  } = await anon.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let userId: string = user.id;
  const admin = adminClient();
  if (admin) {
    const { data: row } = await admin
      .from("users")
      .upsert({ auth_ref: user.id, locale: "en" }, { onConflict: "auth_ref" })
      .select("id")
      .single();
    if (row?.id) userId = row.id as string;
  }

  // Place this user on their home island in the shared archipelago (the 7-flow front door):
  // the empty slot nearest the most-recently-joined arrival, stable across returns (§2).
  const island = await assignIslandForUser(userId);

  // THE ONE VERIFICATION OF A SUPABASE SESSION IN THE TREE, so this is where a signed-in user's
  // identity token comes from too (SOC-2.E). The subject is `userId` — the public.users row this
  // route just resolved — and NOT the JWT's own `sub`, because every write in the app is attributed
  // to the former. Signing the wrong one would produce a valid token for a subject nothing reads.
  //
  // A deployment with no ECHO_IDENTITY_SECRET still signs in; it just cannot hand out a token, and
  // the caller finds `token` absent rather than empty. Sign-in and identity fail independently.
  const [signing] = identitySecrets();
  const identityToken = signing ? signIdentity(userId, signing, Date.now()) : undefined;

  return NextResponse.json({ userId, email: user.email, island, token: identityToken });
}
