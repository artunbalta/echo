import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabaseAdmin";
import { hasFal, submitPortrait } from "@/lib/fal-portrait";
import { photoPathReady } from "@/lib/photo-path-ready";

export const runtime = "nodejs";
/** The selfie upload to fal.storage happens inside the request (see below), so this needs more than
 *  the default. Generation itself is NOT waited on. */
export const maxDuration = 60;

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
 * Selfie limits. Enforced HERE and not only in the browser: client-side validation is a courtesy to
 * the person, never a control — anyone can POST this endpoint directly, and this one costs money.
 */
const MAX_SELFIE_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_SELFIE_PX = 384; // FAL rejects references under 384x384 outright
const MAX_SELFIE_PX = 5000;

/**
 * THE CAP. The landing says spots are limited and shows the real remaining count, so this number
 * has to mean something: past it, the endpoint REFUSES rather than the form quietly disappearing.
 * Enforced atomically in Postgres by waitlist_join() under an advisory lock, because a
 * count-then-insert from here would let two simultaneous requests both take the last seat.
 *
 * 500 is a real first-cohort size for a world where every arrival is meant to be met, not a number
 * chosen to look scarce. Raising it later is a one-line change and an honest one — the count on
 * screen is always `taken` out of this, straight from the row count. Nothing here is theatre:
 * no countdown, no invented signups, no decay.
 */
const CAP = Number(process.env.WAITLIST_CAP ?? 500);

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

/**
 * Decode and check the uploaded selfie.
 *
 * JPEG/PNG only, and PNG must have NO alpha: a transparent selfie composites unpredictably at the
 * generator and the "background" the pipeline later measures would be whatever showed through.
 * Dimensions are read from the file's own header rather than trusted from the client.
 */
async function readSelfie(
  dataUri: string,
): Promise<{ buf: Buffer; error?: undefined } | { buf?: undefined; error: string }> {
  const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri.trim());
  if (!m) return { error: "That photo must be a JPEG or PNG." };
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) return { error: "That photo did not arrive. Try again." };
  if (buf.length > MAX_SELFIE_BYTES) return { error: "That photo is over 10MB." };

  const sharp = (await import("sharp")).default;
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return { error: "That file is not an image we can read." };
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return { error: "That file is not an image we can read." };
  if (Math.min(w, h) < MIN_SELFIE_PX)
    return { error: `That photo is too small. It needs to be at least ${MIN_SELFIE_PX}px on each side.` };
  if (Math.max(w, h) > MAX_SELFIE_PX)
    return { error: `That photo is too large. Keep it under ${MAX_SELFIE_PX}px on a side.` };
  if (meta.hasAlpha) return { error: "That photo has transparency. Send a plain JPEG or PNG." };
  return { buf };
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

  // The photo path. Validated here, before the rate limit and long before anything is paid for.
  let selfie: Buffer | null = null;
  if (source === "selfie") {
    // Consent is a precondition, not a checkbox we record after the fact. No consent, no upload,
    // and the request is refused rather than quietly downgraded to a premade.
    if (body.selfieConsent !== true)
      return NextResponse.json(
        { error: "We need your say-so before sending your photo to be drawn." },
        { status: 400 },
      );
    if (typeof body.selfie !== "string" || !body.selfie)
      return NextResponse.json({ error: "No photo arrived. Try again." }, { status: 400 });
    const r = await readSelfie(body.selfie);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    selfie = r.buf ?? null;
  }

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

  // 3a. Can the photo path actually deliver? Checked BEFORE the seat and BEFORE any spend.
  //     If migration 0007 is missing, or FAL, or Resend, this flow cannot keep its promise: it would
  //     take a seat, pay for an image, and then go silent because there is nowhere to record the job
  //     or no way to hand it over. Refuse honestly instead. The premade path is untouched.
  if (source === "selfie") {
    const gate = await photoPathReady(admin);
    if (!gate.ready) {
      console.warn(`[waitlist] photo path unavailable: ${gate.reason}`);
      return NextResponse.json(
        {
          error:
            "Photo characters are not available right now. Your place is still yours: pick someone from the roster and join.",
          photoPath: false,
        },
        { status: 503 },
      );
    }
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

  // 4. The write. One RPC, not an upsert: waitlist_join() takes the advisory lock, counts confirmed
  //    seats, refuses past the cap and assigns the seat number in a single atomic transaction. A
  //    repeat signup updates in place and keeps its original seat (§3), consuming no second seat.
  const { data, error } = await admin.rpc("waitlist_join", {
    p_email: email,
    p_name: name,
    p_cap: CAP,
    p_source: source,
    p_ref: characterRef,
    p_sprite_url: spriteUrl,
    p_attributes: attributes,
    p_ip_hash: hashIp(clientIp(req)),
    p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 512),
  });

  if (error) {
    console.error("[waitlist] join failed:", error.message);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  const r = (data ?? {}) as {
    ok?: boolean;
    already?: boolean;
    full?: boolean;
    seat?: number | null;
    taken?: number;
    remaining?: number;
  };

  // The list being full is a real answer, so it gets a real refusal — 409, not a hidden form. If we
  // say spots are limited, the limit has to bite.
  if (r.full) {
    return NextResponse.json(
      { error: "Every spot is taken.", full: true, taken: r.taken ?? CAP, cap: CAP, remaining: 0 },
      { status: 409 },
    );
  }

  // 5. The photo path. THE SEAT IS ALREADY TAKEN and nothing below can lose it.
  //
  //    The selfie upload is synchronous and the submit is not. That split is deliberate: the selfie
  //    is the ONE thing that cannot be recreated — it lives only in this request's memory — so it is
  //    put on fal.storage and recorded before we risk anything. Once selfie_fal_url exists, a failed
  //    submit is just a retry for the sweeper. Doing it the other way round would mean a transient
  //    FAL blip at submit time permanently costs someone their character.
  if (selfie && source === "selfie") {
    const nowIso = new Date().toISOString();
    if (!hasFal()) {
      // No key: mark it pending anyway. The sweeper will close it out with an honest email rather
      // than leaving them waiting for a character that was never coming.
      await admin
        .from("waitlist")
        .update({ portrait_status: "pending", selfie_consent_at: nowIso, updated_at: nowIso })
        .eq("email", email);
    } else {
      try {
        const base =
          process.env.WAITLIST_PUBLIC_URL ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : new URL(req.url).origin);
        const hook = `${base}/api/waitlist/fal-webhook`;

        const { requestId, selfieUrl } = await submitPortrait(selfie, hook);
        await admin
          .from("waitlist")
          .update({
            portrait_status: "claimed",
            portrait_attempts: 1,
            portrait_lease_until: new Date(Date.now() + 300_000).toISOString(),
            fal_request_id: requestId,
            selfie_fal_url: selfieUrl,
            selfie_consent_at: nowIso,
            updated_at: nowIso,
          })
          .eq("email", email);
      } catch (e) {
        // Pending, not failed: the sweeper retries. Their seat is untouched either way.
        console.error("[waitlist] portrait submit failed, leaving pending:", e);
        await admin
          .from("waitlist")
          .update({
            portrait_status: "pending",
            selfie_consent_at: nowIso,
            portrait_error: String(e).slice(0, 500),
            updated_at: nowIso,
          })
          .eq("email", email);
      }
    }
    // The selfie is out of scope from here. It was never written to our storage and never touches
    // the waitlist row.
    selfie = null;
  }

  return NextResponse.json({
    ok: true,
    already: Boolean(r.already),
    portraitPending: source === "selfie",
    seat: r.seat ?? null,
    taken: r.taken ?? 0,
    cap: CAP,
    remaining: r.remaining ?? 0,
  });
}

/**
 * The true remaining count for the landing's scarcity line. Real row count, confirmed rows only,
 * no PII — the one thing about this table the world may know. Never cached: a stale "3 left" is a
 * lie with extra steps, and this is a single indexed count.
 */
export async function GET() {
  const admin = adminClient();
  if (!admin) {
    // Honest null over a comforting number. The UI renders the cap without a count rather than
    // inventing one; an invented count is exactly the growth-hack pattern the brief forbids.
    return NextResponse.json({ cap: CAP, taken: null, remaining: null, available: false });
  }
  const { data, error } = await admin.rpc("waitlist_taken");
  if (error) {
    console.warn("[waitlist] count unavailable:", error.message);
    return NextResponse.json({ cap: CAP, taken: null, remaining: null, available: false, photoPath: false });
  }
  const taken = Number(data ?? 0);
  // photoPath tells the UI whether to offer the photo option at all. The reason is deliberately NOT
  // returned: it names our infrastructure, and a browser has no business knowing which migration is
  // outstanding.
  const gate = await photoPathReady(admin);
  return NextResponse.json({
    cap: CAP,
    taken,
    remaining: Math.max(0, CAP - taken),
    available: true,
    photoPath: gate.ready,
  });
}
