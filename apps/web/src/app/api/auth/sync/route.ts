import { NextResponse } from "next/server";
import { adminClient, anonServer } from "@/lib/supabaseAdmin";

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

  return NextResponse.json({ userId, email: user.email });
}
