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

/** The current format. A version prefix so a future change is a rejection and not a mis-parse. */
const VERSION = "v1";

export interface IdentityClaim {
  /** The canonical user id every write is attributed to. */
  subject: string;
  /** When the token was minted, epoch ms. Recorded for audit; NOT enforced as an expiry. */
  issuedAt: number;
}

const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url").toString("utf8");

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
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, encodedSubject, encodedIat, provided] = parts as [string, string, string, string];
  if (version !== VERSION) return null;

  const payload = `${version}.${encodedSubject}.${encodedIat}`;
  const offered = Buffer.from(provided, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(signature(payload, secret), "base64url");
    // Length is checked first because timingSafeEqual THROWS on a mismatch rather than returning
    // false, and an exception here would be a rejection that looks like an outage.
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  if (!matched) return null;

  const issuedAt = parseInt(encodedIat, 36);
  if (!Number.isFinite(issuedAt)) return null;
  let subject: string;
  try {
    subject = unb64u(encodedSubject);
  } catch {
    return null;
  }
  // A signature over an empty subject cannot be produced by `signIdentity`, so reaching this means
  // a secret leaked or the format changed underneath us. Either way it is not a usable identity.
  return subject ? { subject, issuedAt } : null;
}

/** The `Authorization: Bearer <token>` value, or "" — one place, so no route re-parses a header. */
export function bearerToken(header: string | null | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : "";
}
