import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasFal } from "./fal-portrait";
import { hasResend } from "./waitlist-email";

/**
 * Is the photo path actually able to deliver, right now, end to end?
 *
 * WHY THIS EXISTS. The photo path has three prerequisites that live outside the code: migration
 * 0007, FAL_KEY, and RESEND_API_KEY. Without all three the flow does not fail loudly — it fails
 * SILENTLY and in the worst possible order:
 *
 *   no 0007  -> the seat is taken, FAL is paid, then the portrait_status write hits a column that
 *               does not exist. supabase-js returns {error} rather than throwing, so nothing stops.
 *               fal_request_id is never stored, so the webhook cannot match the row, so no email is
 *               ever sent. The person uploaded their face, spent our money, holds a seat, and hears
 *               nothing back. Ever.
 *   no FAL   -> same seat, no generation.
 *   no Resend-> portrait generated and stored, and no way to hand it over. Also silence.
 *
 * "Never left with silence" is the rule, so the path checks whether it can keep that promise BEFORE
 * it takes a seat or spends anything, and closes itself honestly when it cannot. The alternative is
 * shipping a button that quietly eats faces.
 *
 * It is a capability probe, not config: nothing has to be flipped when the migration lands. Run
 * 0007, set the keys, and the path opens by itself on the next cold start.
 */

let cache: { ready: boolean; reason: string | null; at: number } | null = null;
/** Short enough that enabling it is a redeploy-free change, long enough not to probe every request. */
const TTL_MS = 60_000;

export interface PhotoPathState {
  ready: boolean;
  /** Server-side only. Never returned to a browser: it names our infrastructure. */
  reason: string | null;
}

export async function photoPathReady(admin: SupabaseClient | null): Promise<PhotoPathState> {
  if (cache && Date.now() - cache.at < TTL_MS) return { ready: cache.ready, reason: cache.reason };

  const miss = (reason: string) => {
    cache = { ready: false, reason, at: Date.now() };
    return { ready: false, reason };
  };

  if (!admin) return miss("supabase not configured");
  if (!hasFal()) return miss("FAL_KEY not set");
  if (!hasResend()) return miss("RESEND_API_KEY not set — a portrait with no way to deliver it");

  // The one that cannot be inferred from env: does the schema actually have the job columns?
  const { error } = await admin.from("waitlist").select("portrait_status").limit(1);
  if (error) {
    // 42703 = undefined_column, i.e. migration 0007 has not been applied.
    return miss(
      error.code === "42703"
        ? "migration 0007_waitlist_portrait.sql not applied"
        : `waitlist unreadable: ${error.message}`,
    );
  }

  cache = { ready: true, reason: null, at: Date.now() };
  return { ready: true, reason: null };
}
