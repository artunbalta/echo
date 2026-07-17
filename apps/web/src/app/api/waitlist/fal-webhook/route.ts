import { NextResponse } from "next/server";
import { createHash, verify as edVerify, createPublicKey } from "node:crypto";
import { adminClient } from "@/lib/supabaseAdmin";
import { finishPortraitJob } from "@/lib/waitlist-portrait";

export const runtime = "nodejs";
/** Generation is done by the time this fires, but the pipeline + email still need room. */
export const maxDuration = 60;

/**
 * FAL's webhook: a portrait job finished.
 *
 * THE CALLER IS VERIFIED, NOT TRUSTED. This endpoint is public and it triggers a paid email plus a
 * database write, so "a POST arrived claiming to be FAL" is not evidence of anything. FAL signs
 * every webhook with ED25519 over a fixed message and publishes its public keys as a JWKS; the
 * signature is checked against those keys before a single byte of the body is acted on. An
 * unverified request is refused, and refused with 401 so a genuine FAL retry is still possible.
 *
 * Docs: https://docs.fal.ai/model-endpoints/webhooks
 *   message = sha256(request_id . user_id . timestamp . sha256_hex(body))  signed with ED25519
 */

// The documented endpoint. rest.alpha.fal.ai also answers, but alpha is not the contract.
const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
/** Replay window. FAL's own guidance is to reject stale timestamps; 5 minutes is their example. */
const MAX_SKEW_S = 300;

let jwksCache: { keys: string[]; at: number } | null = null;

/** FAL's public keys, cached briefly. Fetched over TLS from FAL, never configured by us — a key we
 *  could set is a key an attacker could set. */
async function falKeys(): Promise<string[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const j = (await res.json()) as { keys: { x: string }[] };
  const keys = (j.keys ?? []).map((k) => k.x).filter(Boolean);
  jwksCache = { keys, at: Date.now() };
  return keys;
}

function verifySignature(h: Headers, body: Buffer, keys: string[]): boolean {
  const id = h.get("x-fal-webhook-request-id");
  const user = h.get("x-fal-webhook-user-id");
  const ts = h.get("x-fal-webhook-timestamp");
  const sig = h.get("x-fal-webhook-signature");
  if (!id || !user || !ts || !sig) return false;

  // Reject stale timestamps: without this, a captured webhook could be replayed forever.
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_S) return false;

  // ED25519 signs the MESSAGE ITSELF, not a hash of it — the algorithm hashes internally. An
  // earlier version of this verified over sha256(message) and therefore rejected every genuine
  // webhook, which is exactly what happened in production: FAL completed the job, called back, got
  // 401 on every retry, and the row sat in 'claimed' forever with no error to show for it. The spec
  // is literal (docs.fal.ai/model-endpoints/webhooks):
  //     "\n".join([request_id, user_id, timestamp, sha256(body).hexdigest()]).encode("utf-8")
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from(`${id}\n${user}\n${ts}\n${bodyHash}`, "utf8");
  const signature = Buffer.from(sig, "hex");

  for (const x of keys) {
    try {
      // JWKS gives the ED25519 public key base64url-encoded. Node's JWK import wants unpadded
      // base64url, so strip any '=' padding rather than trusting the provider's formatting.
      const key = createPublicKey({
        key: {
          kty: "OKP",
          crv: "Ed25519",
          x: x.replace(/=+$/, ""),
        } as unknown as import("node:crypto").JsonWebKey,
        format: "jwk",
      });
      if (edVerify(null, message, key, signature)) return true;
    } catch {
      /* try the next key */
    }
  }
  return false;
}

export async function POST(req: Request) {
  const body = Buffer.from(await req.arrayBuffer());

  let ok = false;
  try {
    ok = verifySignature(req.headers, body, await falKeys());
  } catch (e) {
    // Could not reach the JWKS: FAIL CLOSED. An unverifiable webhook must not be honoured just
    // because our key fetch had a bad minute. The sweeper is the safety net — it polls FAL directly
    // and needs no webhook at all, so refusing here costs a little latency, never the job.
    console.error("[fal-webhook] jwks unavailable, refusing:", e);
    return NextResponse.json({ error: "cannot verify" }, { status: 503 });
  }
  if (!ok) {
    console.warn("[fal-webhook] REJECTED: bad or missing signature");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = JSON.parse(body.toString("utf8") || "{}");
  const requestId: string | undefined = payload?.request_id;
  if (!requestId) return NextResponse.json({ error: "no request_id" }, { status: 400 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data: row } = await admin
    .from("waitlist")
    .select("id, email, name, seat, portrait_status, selfie_fal_url")
    .eq("fal_request_id", requestId)
    .maybeSingle();

  if (!row) {
    // 200, not 404: an unmatched request id is not FAL's problem to retry. Answering with an error
    // would make it redeliver forever.
    console.warn("[fal-webhook] no row for request", requestId);
    return NextResponse.json({ ok: true, matched: false });
  }
  // Idempotent: FAL retries on non-2xx, and a duplicate delivery must not send a second email.
  if (row.portrait_status === "done" || row.portrait_status === "failed") {
    return NextResponse.json({ ok: true, already: true });
  }

  const status = await finishPortraitJob({
    admin,
    rowId: row.id as string,
    email: row.email as string,
    name: row.name as string,
    seat: (row.seat as number) ?? null,
    payload,
    requestId,
    selfieUrl: (row.selfie_fal_url as string) ?? null,
  });

  // Always 200 once we own the outcome: the row records success or failure, and a retry would only
  // duplicate the email.
  return NextResponse.json({ ok: true, status });
}
