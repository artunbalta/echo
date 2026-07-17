import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extract, fetchResult } from "./fal-portrait";
import { toRosterPortrait } from "./portrait-pipeline";
import { sendWaitlistEmail } from "./waitlist-email";

/**
 * Finishing a portrait job: pipeline, store, email, mark done. Shared by the FAL webhook (which
 * arrives with the payload) and the cron sweeper (which has to go and ask for it).
 *
 * ONE PLACE, because the two callers must not drift: the webhook is the fast path and the sweeper is
 * the safety net for when the webhook never comes, and if they finished jobs differently then which
 * one ran would change what the person receives.
 */

/** How long a claimed job may run before the sweeper presumes it dead. Generation measured at ~60s;
 *  this leaves room for a queue backlog without leaving a crashed job stuck for an hour. */
export const LEASE_SECONDS = 300;
/** After this many attempts, stop paying for images and send the honest no-portrait email. */
export const MAX_ATTEMPTS = 3;

/** Best-effort delete of the selfie from FAL's storage once the portrait is derived.
 *
 *  There is no documented storage-delete in @fal-ai/client, so this is a direct REST call and it is
 *  allowed to fail: the row is still marked, and the honest position is recorded in the report
 *  rather than pretended away. FAL's uploads are unguessable-URL and expire on their own schedule.
 */
async function deleteSelfie(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { authorization: `Key ${process.env.FAL_KEY}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface FinishArgs {
  admin: SupabaseClient;
  rowId: string;
  email: string;
  name: string;
  seat: number | null;
  /** The webhook's payload, if this is the webhook path. Omit and the result is fetched. */
  payload?: unknown;
  requestId?: string | null;
  selfieUrl?: string | null;
}

/**
 * Run a finished FAL job to completion. Returns the terminal status it wrote.
 *
 * Never throws: this is called from a webhook FAL will retry and from a cron that must keep going.
 * A thrown error would either trigger a duplicate delivery or abort the rest of the sweep.
 */
export async function finishPortraitJob(a: FinishArgs): Promise<"done" | "failed"> {
  const { admin, rowId, email, name, seat } = a;

  const fail = async (why: string) => {
    console.error(`[portrait] ${rowId} failed: ${why}`);
    // The email STILL goes out, with no portrait, saying so plainly. Never a premade dressed as
    // theirs — that is the one thing this flow must not do. The seat was taken long before this and
    // is unaffected.
    const sent = await sendWaitlistEmail({ to: email, name, seat, portraitPng: null });
    await admin
      .from("waitlist")
      .update({
        portrait_status: "failed",
        portrait_error: why.slice(0, 500),
        portrait_lease_until: null,
        email_sent_at: sent ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);
    return "failed" as const;
  };

  try {
    const payload = a.payload ?? (a.requestId ? await fetchResult(a.requestId) : null);
    if (!payload) return await fail("no payload and no request id");

    const { imageUrl, nsfw } = extract(payload);

    // A safety-checker hit fails LOUDLY. A false positive on someone's face is entirely possible,
    // and the answer is an honest email plus a logged reason, never a silent nothing.
    if (nsfw) return await fail("safety checker flagged the generation");
    if (!imageUrl) return await fail("fal returned no image");

    const res = await fetch(imageUrl);
    if (!res.ok) return await fail(`could not fetch result: ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());

    // THE PIPELINE. Not optional and not a nicety: without it this is a painterly image with a
    // pixel filter, at the wrong scale, on the wrong palette, next to eight that are none of those.
    const png = await toRosterPortrait(raw, 0.9);

    const sent = await sendWaitlistEmail({ to: email, name, seat, portraitPng: png });

    // The selfie is dropped the moment the portrait exists. It is not needed again: a retry would
    // regenerate from scratch anyway, and keeping a face around for a retry we may never run is not
    // a trade worth making.
    let deleted: string | null = null;
    if (a.selfieUrl && (await deleteSelfie(a.selfieUrl))) deleted = new Date().toISOString();

    await admin
      .from("waitlist")
      .update({
        portrait_status: "done",
        portrait_png_b64: png.toString("base64"),
        portrait_lease_until: null,
        portrait_error: null,
        selfie_fal_url: deleted ? null : a.selfieUrl ?? null,
        selfie_deleted_at: deleted,
        email_sent_at: sent ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);

    console.log(`[portrait] ${rowId} done (${png.length}b, email=${sent})`);
    return "done";
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}
