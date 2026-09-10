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
import { bearerToken, verifyIdentity } from "@echo/shared/identity";

export interface SubjectEnv {
  /** `ECHO_TRUST_CLIENT_ID`. Only the literal "1" counts. */
  trustClientId?: string | undefined;
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
  /** Signing keys, newest first. Empty means the gate cannot verify anything and says so. */
  secrets: readonly string[];
}

export type SubjectVerdict =
  | { ok: true; subject: string; source: "token" | "asserted" }
  | { ok: false; reason: "no-identity" | "mismatch" | "unconfigured" };

/**
 * Whether a deployment may honour an id the client simply asserted.
 *
 * Production is anything that does not PROVE it is not production. An unset `VERCEL_ENV` on a
 * machine with `NODE_ENV=production` is production; so is an unset everything with the flag on,
 * because the flag is an opt-in for a developer's laptop and a laptop has neither set to
 * "production" by accident.
 */
export function trustsAssertedId(env: SubjectEnv): boolean {
  if (env.trustClientId !== "1") return false;
  if (env.vercelEnv === "production") return false;
  if (env.nodeEnv === "production") return false;
  return true;
}

/**
 * The subject a request is about, or why it does not have one.
 *
 * `asserted` is whatever the route used to trust — `?uid=`, `{userId}`, `event.actor_id`. It is kept
 * in the signature rather than deleted from the callers so that the QUERY SHAPES DO NOT CHANGE:
 * `chain.test.mts` asserts the literal `/api/agent/persona?uid=u-test`, and the harnesses pass
 * `?userId=` from Python. What changes is that production now checks the asserted id against the
 * signature instead of believing it.
 */
export function subjectFor(env: SubjectEnv, authorization: string | null | undefined, asserted?: string | null): SubjectVerdict {
  const claimed = (asserted ?? "").trim();
  const relaxed = trustsAssertedId(env);

  const usableSecrets = env.secrets.filter(Boolean);
  const token = bearerToken(authorization);
  const verified = usableSecrets.length && token ? verifyIdentity(token, usableSecrets) : null;

  if (verified) {
    // An asserted id is allowed to AGREE with the token — that is every existing call site, which
    // sends both — but never to override it.
    if (claimed && claimed !== verified.subject) return { ok: false, reason: "mismatch" };
    return { ok: true, subject: verified.subject, source: "token" };
  }

  if (relaxed && claimed) return { ok: true, subject: claimed, source: "asserted" };

  // A deployment with no signing key can neither mint nor verify, and saying "no-identity" would
  // send whoever is debugging it looking at the browser. It is the server that is misconfigured.
  if (!usableSecrets.length && !relaxed) return { ok: false, reason: "unconfigured" };
  return { ok: false, reason: "no-identity" };
}

/** The signing keys, newest first. Rotation keeps the outgoing key in `ECHO_IDENTITY_SECRET_OLD`. */
export function identitySecrets(): string[] {
  return [process.env.ECHO_IDENTITY_SECRET ?? "", process.env.ECHO_IDENTITY_SECRET_OLD ?? ""].filter(Boolean);
}

export function subjectEnv(): SubjectEnv {
  return {
    trustClientId: process.env.ECHO_TRUST_CLIENT_ID,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    secrets: identitySecrets(),
  };
}

/** The thin reader every route calls. One line at the call site, one place to change the policy. */
export function subjectOf(req: Request, asserted?: string | null): SubjectVerdict {
  return subjectFor(subjectEnv(), req.headers.get("authorization"), asserted);
}

/** The HTTP answer for a verdict that failed, so seventeen routes do not each invent one. */
export function subjectRejection(verdict: Extract<SubjectVerdict, { ok: false }>): { body: { error: string }; status: number } {
  if (verdict.reason === "unconfigured") {
    return { body: { error: "identity_unconfigured" }, status: 503 };
  }
  // 403 rather than 401: there is no challenge a browser could usefully answer, and a WWW-Authenticate
  // round trip would be a lie about what is on offer.
  return { body: { error: verdict.reason === "mismatch" ? "identity_mismatch" : "identity_required" }, status: 403 };
}
