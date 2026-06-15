import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Real sign-up against Supabase Auth. We create the user already email-confirmed
 * (via the service role) so the landing's login works end-to-end without the
 * email round-trip, then link a row in public.users. Both are genuine writes.
 */
export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password)
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  if (String(password).length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  const admin = adminClient();
  if (!admin)
    return NextResponse.json({ error: "Auth backend is not configured." }, { status: 500 });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    const already = /already|registered|exists|duplicate/i.test(error.message);
    return NextResponse.json(
      { error: already ? "That email is already registered." : error.message, already },
      { status: already ? 409 : 400 },
    );
  }

  const authId = data.user?.id;
  if (authId) {
    // Link an identity row (real table data). Best-effort — auth already succeeded.
    await admin
      .from("users")
      .upsert({ auth_ref: authId, locale: "en" }, { onConflict: "auth_ref" });
  }

  return NextResponse.json({ ok: true });
}
