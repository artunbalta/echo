import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Waitlist signup (landing §1b/§3). Server-side insert only, via the service role — the anon key
 * must never be able to read this table back (db/migrations/0006_waitlist.sql enables RLS with zero
 * policies to guarantee that). Returns { ok: true, already } on success.
 *
 * Deliberately NOT /api/auth/signup: that endpoint creates a real Supabase Auth user with a
 * password and claims an island. A waitlist row is an intent to be invited, nothing more.
 *
 * Abuse protection, in the order it runs (cheapest first, so a bot pays before the DB does):
 *   1. honeypot   — a hidden field no human fills in. Answered 200 OK, silently discarded.
 *   2. validation — hand-rolled; zod is not a dependency of this repo and is not worth adding.
 *   3. rate limit — a fixed window per hashed IP, counted in Postgres (waitlist_rate_hit).
 * Rate limiting matters more here than it looks: the selfie path spends real image-generation money
 * per submit, so an unlimited endpoint is a budget hole, not just a spam hole.
 */

// Fixed window rather than a sliding one: it costs a single atomic statement and one row per IP per
// window. The worst case is a burst straddling a boundary letting through ~2x MAX_PER_WINDOW, which
// is an acceptable price for a landing page. Tighten to a sliding window only if that shows up.
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

const MAX_NAME = 80;
const MAX_EMAIL = 254; // RFC 5321 maximum length of a forward-path

/**
 * Deliberately stricter than the RFC and deliberately not a clever regex. The full grammar allows
 * quoted local parts and bracketed IP literals that no real signup uses, and every "perfect" email
 * regex is a well-known catastrophic-backtracking hazard. This is a linear-time shape check; the
 * only real proof an address exists is sending mail to it.
 */
function validEmail(s: string): boolean {
  if (s.length > MAX_EMAIL || s.length < 3) return false;
  if (/\s/.test(s)) return false;
  const at = s.indexOf("@");
  if (at < 1 || at !== s.lastIndexOf("@") || at === s.length - 1) return false;
  const domain = s.slice(at + 1);
  if (domain.length > 253 || !domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return /^[^@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s);
}

/**
 * Salted SHA-256 of the client IP. We count requests; we do not keep a network identifier for
 * everyone who visits the landing page. The salt makes the hashes non-reversible against the
 * trivially small IPv4 space — an unsalted SHA-256 of an IP is brute-forceable in seconds.
 * Falls back to a constant so local dev works keyless; set WAITLIST_IP_SALT in production.
 */
function hashIp(ip: string): string {
  const salt = process.env.WAITLIST_IP_SALT || "echo-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Vercel terminates TLS upstream, so the socket address is a proxy. x-forwarded-for is
 *  client-controlled in general, but on Vercel the platform overwrites/appends the real client IP as
 *  the LEFTMOST entry, so that is the one to read. Never trust it outside a trusted proxy. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // 1. Honeypot. A bot fills every field it finds; a human never sees this one. Answer 200 so the
  //    bot has no signal to adapt to, but write nothing. Returning 400 would just teach it.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, already: false });
  }

  // 2. Validation.
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) return NextResponse.json({ error: "Tell us what to call you." }, { status: 400 });
  if (name.length > MAX_NAME)
    return NextResponse.json({ error: "That name is too long." }, { status: 400 });
  if (!validEmail(email))
    return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });

  const source = body.characterSource === "selfie" ? "selfie" : "premade";
  const characterRef = typeof body.characterRef === "string" ? body.characterRef.slice(0, 64) : null;
  // Never persist a data URL: uploadSheet() returns one inline when Storage is unconfigured, and a
  // base64 sprite sheet does not belong in a text column. Null means "no art persisted", which the
  // premade path can always rebuild from character_ref anyway (styleFromId is deterministic).
  const rawSprite = typeof body.characterSpriteUrl === "string" ? body.characterSpriteUrl : "";
  const spriteUrl = /^https?:\/\//i.test(rawSprite) ? rawSprite.slice(0, 2048) : null;
  const attributes =
    body.characterAttributes && typeof body.characterAttributes === "object"
      ? body.characterAttributes
      : null;

  const admin = adminClient();
  if (!admin) {
    // Honest failure over a comforting lie: never tell someone they are on a list that does not
    // exist. Zero-key dev renders the whole form and roster; only the write needs Supabase.
    console.warn("[waitlist] SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL unset — refusing.");
    return NextResponse.json(
      { error: "The waitlist is not available right now. Please try again later." },
      { status: 503 },
    );
  }

  // 3. Rate limit. After validation so a malformed flood does not consume a window, before the
  //    write so a valid flood does not. Fail OPEN: if the counter is unavailable (e.g. migration
  //    0006 not yet applied) a real person must still be able to join.
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS).toISOString();
  const { data: hits, error: rateErr } = await admin.rpc("waitlist_rate_hit", {
    p_ip: hashIp(clientIp(req)),
    p_window: windowStart,
  });
  if (rateErr) {
    console.warn("[waitlist] rate counter unavailable, allowing:", rateErr.message);
  } else if (typeof hits === "number" && hits > MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many signups from here. Try again a little later." },
      { status: 429 },
    );
  }

  // 4. The write. Upsert on the unique lower(email) index so a repeat signup updates rather than
  //    erroring out ugly (§3) — someone changing their mind about their character should just work.
  const { data, error } = await admin
    .from("waitlist")
    .upsert(
      {
        email,
        name,
        character_source: source,
        character_ref: characterRef,
        character_sprite_url: spriteUrl,
        character_attributes: attributes,
        ip_hash: hashIp(clientIp(req)),
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 512),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("created_at, updated_at")
    .single();

  if (error) {
    console.error("[waitlist] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  // `already` lets the UI say "we updated your place" rather than implying a fresh signup. A row
  // whose timestamps differ was created by an earlier request.
  const already = Boolean(
    data && data.created_at && data.updated_at && data.created_at !== data.updated_at,
  );
  return NextResponse.json({ ok: true, already });
}
