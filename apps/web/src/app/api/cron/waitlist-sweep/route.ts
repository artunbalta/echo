import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabaseAdmin";
import { hasFal, submitPortrait, fetchResult, extract } from "@/lib/fal-portrait";
import { finishPortraitJob, LEASE_SECONDS, MAX_ATTEMPTS } from "@/lib/waitlist-portrait";
import { sendWaitlistEmail } from "@/lib/waitlist-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The sweeper. Everything the webhook cannot be relied on for.
 *
 * A webhook is a best-effort delivery from someone else's infrastructure to ours. It can be dropped,
 * it can arrive while we are redeploying, it can be rejected by our own signature check during a
 * JWKS blip, and the function that submitted the job can die before the job is even registered. None
 * of those may cost a person their character, so nothing in this flow depends on the webhook
 * arriving. The webhook is the fast path; this is the guarantee.
 *
 * Three jobs, in order:
 *   1. exhausted -> anyone past MAX_ATTEMPTS gets the honest no-portrait email and is closed out.
 *   2. claim     -> take one due row under a lease (pending, or claimed-with-an-expired-lease,
 *                   which IS the dropped-webhook / crashed-worker case).
 *   3. drive     -> submit it if it has never been submitted, or finish it if FAL says it is done.
 *
 * One row per invocation on purpose. maxDuration is 60s and finishing a job means a pipeline pass
 * plus an email; a batch would risk being killed halfway and leaving a row claimed-but-unfinished.
 *
 * SCHEDULE: DAILY (vercel.json). Not a preference — Vercel's Hobby plan permits at most one cron run
 * per day and rejects the whole DEPLOYMENT, not just the cron, if the schedule is more frequent. A
 * per-minute schedule silently stopped a production deploy dead for 12 hours. So: the WEBHOOK is the
 * delivery path and it is immediate; this sweep is the safety net that catches strays, and on a
 * daily cadence a dropped webhook means a slow character, never a lost one. If the plan allows more,
 * raise the schedule in vercel.json and it costs nothing.
 *
 * It also only claims ONE row per run. A daily cron alone would therefore clear one stray per day,
 * which is why GET /api/waitlist nudges this endpoint on every read: the landing polls that on load,
 * so in practice a stray is rescued within a page view. The cron is the floor, not the mechanism.
 * Trigger by hand with the CRON_SECRET to drain faster, or raise the schedule on a paid plan.
 */

function authorized(req: Request): boolean {
  // Vercel Cron signs its calls with CRON_SECRET. Without this the endpoint is a free "spend money"
  // button for anyone who can guess the path.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function webhookUrl(): Promise<string> {
  const base =
    process.env.WAITLIST_PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  return `${base}/api/waitlist/fal-webhook`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: true, skipped: "no supabase" });

  const out: Record<string, unknown> = {};

  // 1. Close out anyone who has run out of attempts. They still get an email; it just says, plainly,
  //    that the character could not be made. Their seat was never at risk.
  const { data: dead } = await admin.rpc("waitlist_exhausted", { p_max_attempts: MAX_ATTEMPTS });
  if (Array.isArray(dead) && dead.length) {
    for (const r of dead) {
      const sent = await sendWaitlistEmail({
        to: r.email,
        name: r.name,
        seat: r.seat ?? null,
        portraitPng: null,
      });
      await admin
        .from("waitlist")
        .update({
          portrait_status: "failed",
          portrait_error: "exhausted attempts",
          portrait_lease_until: null,
          email_sent_at: sent ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
    }
    out.closed = dead.length;
  }

  // 2. Claim one due row. SKIP LOCKED inside the function means two overlapping sweeps cannot both
  //    take it and pay for the same image twice.
  const { data: claimed, error } = await admin.rpc("waitlist_claim_portrait", {
    p_lease_seconds: LEASE_SECONDS,
    p_max_attempts: MAX_ATTEMPTS,
  });
  if (error) {
    console.error("[sweep] claim failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const job = Array.isArray(claimed) ? claimed[0] : null;
  if (!job) return NextResponse.json({ ok: true, ...out, claimed: 0 });

  const { data: row } = await admin
    .from("waitlist")
    .select("id, email, name, seat, fal_request_id, selfie_fal_url")
    .eq("id", job.id)
    .single();
  if (!row) return NextResponse.json({ ok: true, ...out, claimed: 0 });

  if (!hasFal()) {
    // No key: do not leave them hanging in a queue that will never run.
    await finishPortraitJob({
      admin,
      rowId: row.id as string,
      email: row.email as string,
      name: row.name as string,
      seat: (row.seat as number) ?? null,
      payload: null,
      requestId: null,
      selfieUrl: (row.selfie_fal_url as string) ?? null,
    });
    return NextResponse.json({ ok: true, ...out, claimed: 1, note: "no FAL_KEY, failed honestly" });
  }

  // 3a. Never submitted (the submit-time crash case). We still have the selfie on fal.storage, which
  //     is exactly why it is uploaded synchronously and recorded before anything else.
  if (!row.fal_request_id) {
    if (!row.selfie_fal_url) {
      await finishPortraitJob({
        admin,
        rowId: row.id as string,
        email: row.email as string,
        name: row.name as string,
        seat: (row.seat as number) ?? null,
        payload: null,
        requestId: null,
        selfieUrl: null,
      });
      return NextResponse.json({ ok: true, ...out, claimed: 1, note: "no selfie to submit" });
    }
    try {
      const { requestId } = await submitPortrait(
        Buffer.from(await (await fetch(row.selfie_fal_url as string)).arrayBuffer()),
        await webhookUrl(),
      );
      await admin
        .from("waitlist")
        .update({ fal_request_id: requestId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      return NextResponse.json({ ok: true, ...out, claimed: 1, submitted: requestId });
    } catch (e) {
      // Leave it claimed; the lease will expire and the next sweep retries, up to MAX_ATTEMPTS.
      console.error("[sweep] submit failed:", e);
      return NextResponse.json({ ok: true, ...out, claimed: 1, submitError: String(e).slice(0, 200) });
    }
  }

  // 3b. Submitted already: ask FAL directly rather than waiting for a webhook that may never come.
  try {
    const result = await fetchResult(row.fal_request_id as string);
    const { imageUrl } = extract(result);
    if (!imageUrl) {
      // Still running. Leave the lease to expire and check again next sweep.
      return NextResponse.json({ ok: true, ...out, claimed: 1, note: "still running" });
    }
    const status = await finishPortraitJob({
      admin,
      rowId: row.id as string,
      email: row.email as string,
      name: row.name as string,
      seat: (row.seat as number) ?? null,
      payload: result,
      requestId: row.fal_request_id as string,
      selfieUrl: (row.selfie_fal_url as string) ?? null,
    });
    return NextResponse.json({ ok: true, ...out, claimed: 1, status });
  } catch (e) {
    console.error("[sweep] fetch/finish failed:", e);
    return NextResponse.json({ ok: true, ...out, claimed: 1, error: String(e).slice(0, 200) });
  }
}
