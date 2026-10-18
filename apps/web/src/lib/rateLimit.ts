/**
 * The rate limiter, in one place, with the fail posture as an argument rather than an assumption.
 *
 * WHY THIS EXISTS RATHER THAN A SECOND COPY. `api/waitlist/route.ts` had the only rate limit in the
 * repo, and its `hashIp`/`clientIp` were route-private. Reusing them meant either importing from a
 * route — which drags `next/server` into every caller — or copying them, which is two IP-hashing
 * policies and two salts, and the copy that gets it wrong is the one nobody re-reads (L5). They live
 * here now and the waitlist calls the same ones.
 *
 * **THE FAIL POSTURE IS THE WHOLE DESIGN DECISION, AND IT IS NOT THE SAME FOR EVERY CALLER.**
 * 0007's limiter fails OPEN, with a stated reason: "if the counter is unavailable a real person must
 * still be able to join". That is right for a signup. It is the expensive answer for a route that
 * spends at a paid provider on every call, because "the counter is unavailable" and "there is no
 * limit" become the same sentence — and on a zero-key deployment they are the permanent state. So
 * the posture is chosen per caller: `onUnavailable: "allow"` keeps the waitlist exactly as it was,
 * `onUnavailable: "deny"` is what the paid routes take (⚑30, and the user's call).
 *
 * WHAT THIS DOES NOT BOUND. It counts requests per (bucket, ip, window) and knows nothing about what
 * a request costs. `COST_DAILY_USD_BUDGET` still enforces nothing. And it is keyed on IP rather than
 * on subject deliberately: the routes it protects are reached before a person has a durable identity
 * worth counting against, and `/api/identity/session` mints one for anybody who asks — so a
 * per-subject limit would be a limit per mint, which is no limit.
 */
import "server-only";

import { createHash } from "node:crypto";

import { adminClient } from "@/lib/supabaseAdmin";

/** One short name per protected surface. Kept here so the set is enumerable from one file. */
export type RateBucket = "waitlist" | "vision" | "portrait" | "villager" | "world" | "voice";

export interface RateLimitOptions {
  bucket: RateBucket;
  /** Fixed window length in ms. */
  windowMs: number;
  /** Requests permitted within one window before the next one is refused. */
  max: number;
  /**
   * What to do when the counter cannot be reached — no Supabase, migration not applied, an outage.
   * "allow" is 0007's posture and is right where refusing costs a real person something a retry
   * cannot recover. "deny" is right where allowing costs money, which is every paid provider call.
   */
  onUnavailable: "allow" | "deny";
}

export type RateLimitVerdict =
  | { ok: true; hits: number | null }
  | { ok: false; reason: "limit" | "unavailable" };

/**
 * Salted SHA-256 of the client IP. We count requests; we do not keep a network identifier for
 * everyone who visits. The salt makes the hashes non-reversible against the trivially small IPv4
 * space — an unsalted SHA-256 of an IP is brute-forceable in seconds. Falls back to a constant so
 * local dev works keyless; set WAITLIST_IP_SALT in production.
 *
 * The variable keeps its 0007 name on purpose: renaming it would silently re-bucket every existing
 * counter on a deployment that has one set, and a rate limiter that resets on deploy is not one.
 */
export function hashIp(ip: string): string {
  const salt = process.env.WAITLIST_IP_SALT || "echo-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Vercel terminates TLS upstream, so the socket address is a proxy. `x-forwarded-for` is
 * client-controlled in general, but on Vercel the platform overwrites/appends the real client IP as
 * the LEFTMOST entry, so that is the one to read. Never trust it outside a trusted proxy.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** The start of the fixed window a moment falls in. Exported so a test can state the whole key. */
export function windowStart(now: number, windowMs: number): string {
  return new Date(Math.floor(now / windowMs) * windowMs).toISOString();
}

/**
 * Count this request and say whether it may proceed.
 *
 * Never throws: a limiter that can 500 is a worse outage than the one it prevents, so every failure
 * resolves to the caller's declared `onUnavailable` posture and says which it took.
 */
export async function rateLimit(req: Request, opts: RateLimitOptions, now = Date.now()): Promise<RateLimitVerdict> {
  const unavailable = (): RateLimitVerdict =>
    opts.onUnavailable === "allow" ? { ok: true, hits: null } : { ok: false, reason: "unavailable" };

  const admin = adminClient();
  if (!admin) return unavailable();

  try {
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: opts.bucket,
      p_ip: hashIp(clientIp(req)),
      p_window: windowStart(now, opts.windowMs),
    });
    if (error) {
      console.warn(`[rate] ${opts.bucket} counter unavailable (${error.message}); ${opts.onUnavailable}`);
      return unavailable();
    }
    if (typeof data !== "number") return unavailable();
    if (data > opts.max) return { ok: false, reason: "limit" };
    return { ok: true, hits: data };
  } catch (err) {
    console.warn(`[rate] ${opts.bucket} counter threw (${(err as Error).message}); ${opts.onUnavailable}`);
    return unavailable();
  }
}

/** The HTTP answer for a refusal, so callers do not each invent one. */
export function rateLimitRejection(verdict: { ok: false; reason: "limit" | "unavailable" }): {
  body: { error: string };
  status: number;
} {
  // 503, not 429, when the counter itself is down: 429 tells the caller to slow down, which is a
  // lie about what happened and would have them retry into the same wall.
  return verdict.reason === "limit"
    ? { body: { error: "rate_limited" }, status: 429 }
    : { body: { error: "rate_limiter_unavailable" }, status: 503 };
}
