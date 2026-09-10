/**
 * WHO A REQUEST IS FOR — the one gate, and the only place a route learns a user id (SOC-2.E, `⚑27`).
 *
 * Every id-bearing route used to read its subject out of the thing being authenticated: a `?uid=`
 * query parameter, a `{userId}` body field, a join option. `/api/auth/sync` was the single exception,
 * and it is the shape everything else now copies — **derive the subject from a credential, never
 * accept it as a field.**
 *
 * The pure `subjectFor` is separated from the request-reading `subjectOf` for the reason
 * `renderDebug.ts` separates them: a test drives the actual branch, not a copy of its shape. And
 * NOTHING outside this file reads `ECHO_TRUST_CLIENT_ID` or parses an Authorization header, so a
 * later author cannot route around the gate by reading the env again somewhere else — the discipline
 * `services/ml/echo_ml/config.py` uses for its own single `persist_enabled` property.
 *
 * THE RELAXATION TAKES TWO SIGNALS, NEITHER SUFFICIENT ALONE (C39). The harnesses compose their own
 * ids — `cap_tessa`, `f4sil…_twin`, eight cells per f5 run — and `?u=` is the only mechanism in the
 * tree that yields two distinct identities inside one browser profile, which
 * `verify-3d-render.md` depends on. So an asserted id stays honoured where those run, and nowhere
 * else. The lesson is `⚑24`'s: credentials alone must never be enough, because a shared `.env`
 * nobody chose can supply them.
 */
import { bearerToken, identitySecretsFor, subjectFor } from "@echo/shared/identity";

export type { SubjectEnv, SubjectVerdict } from "@echo/shared/identity";
export { subjectFor, trustsAssertedId } from "@echo/shared/identity";

/** The signing keys, newest first. Rotation keeps the outgoing key in `ECHO_IDENTITY_SECRET_OLD`. */
export function identitySecrets(): string[] {
  return identitySecretsFor({
    secret: process.env.ECHO_IDENTITY_SECRET,
    previous: process.env.ECHO_IDENTITY_SECRET_OLD,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function subjectEnv(): import("@echo/shared/identity").SubjectEnv {
  return {
    trustClientId: process.env.ECHO_TRUST_CLIENT_ID,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    secrets: identitySecrets(),
  };
}

/** The thin reader every route calls. One line at the call site, one place to change the policy. */
export function subjectOf(req: Request, asserted?: string | null): import("@echo/shared/identity").SubjectVerdict {
  return subjectFor(subjectEnv(), bearerToken(req.headers.get("authorization")), asserted);
}

/** The HTTP answer for a verdict that failed, so seventeen routes do not each invent one. */
export function subjectRejection(verdict: { ok: false; reason: "no-identity" | "mismatch" | "unconfigured" }): { body: { error: string }; status: number } {
  if (verdict.reason === "unconfigured") {
    return { body: { error: "identity_unconfigured" }, status: 503 };
  }
  // 403 rather than 401: there is no challenge a browser could usefully answer, and a WWW-Authenticate
  // round trip would be a lie about what is on offer.
  return { body: { error: verdict.reason === "mismatch" ? "identity_mismatch" : "identity_required" }, status: 403 };
}
