/**
 * A user id that the server minted and signed, so the client can carry it but cannot choose it.
 *
 * WHAT THIS IS FOR. Every `BehavioralEvent` is written under a user id, and until now that id was
 * whatever the client said it was — a localStorage UUID the browser generated, or a `?u=` query
 * parameter honoured verbatim. In a solo world that is a convenience. In ONE SHARED WORLD it is a
 * way to author another person's persona, and a posterior written under a borrowed id is
 * indistinguishable from real evidence afterwards (`⚑27`, SOC-2.E).
 *
 * WHAT IT IS NOT. This is not a session, an account or an expiry. It does not make an anonymous
 * person recoverable — clearing site data still orphans an echo, exactly as it did before, which is
 * the decision recorded as `C39`. The single property it adds is that the subject is **derived from
 * a signature rather than asserted in a field**, which is the inversion `/api/auth/sync` already
 * performs for signed-in users and no other route performed for anyone.
 *
 * WHY IT LIVES IN `@echo/shared`, AND NOT IN `index.ts`. Both `apps/web` (route handlers) and
 * `apps/realtime` (the room join) must verify the same token, and `@echo/shared` is already a
 * dependency of both. It is reached by the `@echo/shared/identity` subpath rather than the barrel
 * because this module imports `node:crypto`: `index.ts` is pulled into client components, and a
 * browser bundle that reaches for `node:crypto` fails at build time in one workspace for a reason
 * written in another.
 *
 * ROTATION TAKES A LIST, NOT A STRING. `verifyIdentity` accepts several secrets and tries each, so a
 * key can be replaced with an overlap window instead of orphaning every anonymous person at once —
 * they hold the only copy of their identity and have nothing to re-present if it stops verifying.
 * Put the new key first: it is the one that signs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

// The FORMAT lives in `identityFormat.ts`, which imports no crypto and is therefore reachable from a
// browser bundle (L5). The browser has one honest question about a token it already holds — is this
// a signature over the id beside it — and answering it needs the shape, not the key. Keeping the
// shape here as well would be the same description written twice, and the copy that drifts is the
// one nobody re-reads. This module owns SIGNING and VERIFYING; that one owns what a token looks like.
import { IDENTITY_TOKEN_VERSION as VERSION, parseIdentityToken } from "./identityFormat.js";

export type { IdentityClaim } from "./identityFormat.js";
import type { IdentityClaim } from "./identityFormat.js";

const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * `issuedAt` is a parameter and not a `Date.now()` so that a test can state the whole token, and so
 * that signing is a pure function of its inputs — the same reason `worldClock` takes its time.
 */
export function signIdentity(subject: string, secret: string, issuedAt: number): string {
  if (!subject) throw new Error("[identity] refusing to sign an empty subject");
  if (!secret) throw new Error("[identity] refusing to sign with an empty secret");
  const payload = `${VERSION}.${b64u(subject)}.${issuedAt.toString(36)}`;
  return `${payload}.${signature(payload, secret)}`;
}

/**
 * The claim this token carries, or `null` — and **`null` is the only failure**, deliberately.
 *
 * A caller that can distinguish "malformed" from "bad signature" from "unknown key version" will
 * eventually report the difference to whoever presented the token, which turns a verifier into an
 * oracle. The routes need one bit: is this subject usable.
 */
export function verifyIdentity(token: string, secrets: readonly string[]): IdentityClaim | null {
  // Shape first, and it is the shared parse rather than a second copy of it. A malformed token and
  // a badly signed one both leave here as `null`, which is the one bit the routes need — the order
  // the two checks happen in is not observable from outside this function.
  const parsed = parseIdentityToken(token);
  if (!parsed) return null;

  const offered = Buffer.from(parsed.signature, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(signature(parsed.payload, secret), "base64url");
    // Length is checked first because timingSafeEqual THROWS on a mismatch rather than returning
    // false, and an exception here would be a rejection that looks like an outage.
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  if (!matched) return null;

  return { subject: parsed.subject, issuedAt: parsed.issuedAt };
}

/** The `Authorization: Bearer <token>` value, or "" — one place, so no route re-parses a header. */
export function bearerToken(header: string | null | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : "";
}


// ── who a request is for ────────────────────────────────────────────────────────

/**
 * THE POLICY LIVES HERE, ONCE, because two runtimes enforce it (L5).
 *
 * `apps/web` gates its route handlers and `apps/realtime` gates the room join, and a policy written
 * twice is a policy that drifts — the version that relaxes by accident is the one nobody re-reads.
 * Both call `subjectFor`; only the plumbing that reads a header or a join option differs.
 */
export interface SubjectEnv {
  /** `ECHO_TRUST_CLIENT_ID`. Only the literal "1" counts. */
  trustClientId?: string | undefined;
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
  /** Signing keys, newest first. Empty means this process can verify nothing, and says so. */
  secrets: readonly string[];
}

export type SubjectVerdict =
  | { ok: true; subject: string; source: "token" | "asserted" }
  | { ok: false; reason: "no-identity" | "mismatch" | "unconfigured" };

/**
 * Whether a deployment may honour an id the client simply asserted.
 *
 * Production is anything that does not PROVE it is not production, and BOTH signals are required.
 * The harnesses compose their own ids and `?u=` is the only mechanism that yields two identities in
 * one browser profile, so the relaxation has to exist; `⚑24`'s lesson is that credentials alone must
 * never be enough to switch it on, because a shared `.env` nobody chose can supply them.
 */
export function trustsAssertedId(env: SubjectEnv): boolean {
  if (env.trustClientId !== "1") return false;
  if (env.vercelEnv === "production") return false;
  if (env.nodeEnv === "production") return false;
  return true;
}

/** The subject a caller is, or why they are nobody. `asserted` is whatever they claimed to be. */
export function subjectFor(env: SubjectEnv, token: string, asserted?: string | null): SubjectVerdict {
  const claimed = (asserted ?? "").trim();
  const relaxed = trustsAssertedId(env);
  const usableSecrets = env.secrets.filter(Boolean);
  const verified = usableSecrets.length && token ? verifyIdentity(token, usableSecrets) : null;

  if (verified) {
    // An asserted id may AGREE with the token — every existing call site sends both — but never win.
    if (claimed && claimed !== verified.subject) return { ok: false, reason: "mismatch" };
    return { ok: true, subject: verified.subject, source: "token" };
  }
  if (relaxed && claimed) return { ok: true, subject: claimed, source: "asserted" };
  if (!usableSecrets.length && !relaxed) return { ok: false, reason: "unconfigured" };
  return { ok: false, reason: "no-identity" };
}


/**
 * The key a NON-PRODUCTION process signs with when none is configured.
 *
 * WHY THIS EXISTS: without it, a developer running `npm run dev` with no `.env` gets a dead
 * measurement chain — minting answers 503, every guarded route refuses, and the posterior never
 * moves. That is fail-closed working correctly and it is also unusable, and the e2e gate proved it:
 * `chain-live.spec.ts` went red the moment the routes started checking, because CI has no secret.
 *
 * IT IS NOT A FALLBACK IN PRODUCTION, and that asymmetry is the whole design. A production process
 * with no key gets an EMPTY list and refuses everything, because a well-known constant that signed
 * real identities would be worse than no signature at all — it would look like authentication.
 */
export const DEV_IDENTITY_SECRET = "echo-dev-identity-secret-not-for-production";

/**
 * The signing keys for a process, newest first — configured if any are, the dev key if not and this
 * is demonstrably not production, and NOTHING if it is.
 *
 * Both runtimes call this rather than reading env twice: a browser token signed by `apps/web` has to
 * verify in `apps/realtime`, and two independent guesses at "am I production" is how they end up
 * disagreeing about which key that is.
 */
export function identitySecretsFor(env: {
  secret?: string | undefined;
  previous?: string | undefined;
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
}): string[] {
  const configured = [env.secret ?? "", env.previous ?? ""].filter(Boolean);
  if (configured.length) return configured;
  const production = env.vercelEnv === "production" || env.nodeEnv === "production";
  return production ? [] : [DEV_IDENTITY_SECRET];
}
