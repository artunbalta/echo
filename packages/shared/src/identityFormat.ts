/**
 * The SHAPE of an identity token, parsed without a key — and the reason that is a separate file.
 *
 * `identityToken.ts` imports `node:crypto`, which is why it is reached by the `@echo/shared/identity`
 * subpath and never by the barrel: a browser bundle that reaches for `node:crypto` fails at build
 * time in one workspace for a reason written in another. But the browser has one honest question
 * about a token it is holding — **is this a signature over the id I think it is?** — and answering
 * it needs the format, not the key.
 *
 * **WHAT THIS IS NOT.** `parseIdentityToken` VERIFIES NOTHING. Anyone can write four dot-separated
 * fields, and this will read the subject out of them. It is a consistency check against a token this
 * browser already holds, never a trust decision: the only thing that decides who a request is for is
 * `verifyIdentity`, on a server, with a secret. The one caller is `lib/identity.ts`, asking whether
 * the token in localStorage still belongs to the id in localStorage — a question about two local
 * keys that drifted apart, not about an attacker.
 *
 * **WHY IT LIVES HERE AND NOT IN THE CLIENT.** The format would otherwise be written twice: once in
 * the verifier and once in whatever decodes it in the browser, and the copy that gets it wrong is
 * the one nobody re-reads (L5). `identityToken.ts` parses through this module, so there is exactly
 * one description of what a token looks like and both runtimes share it.
 *
 * `atob` and `TextDecoder` are globals in both Node (18+) and every browser this ships to, so this
 * module needs no `Buffer` and no branch on the runtime.
 */

/** The current format. A version prefix so a future change is a rejection and not a mis-parse. */
export const IDENTITY_TOKEN_VERSION = "v1";

export interface IdentityClaim {
  /** The canonical user id every write is attributed to. */
  subject: string;
  /** When the token was minted, epoch ms. Recorded for audit; NOT enforced as an expiry. */
  issuedAt: number;
}

/** The pieces a token splits into. `payload` is exactly the bytes the signature covers. */
export interface IdentityTokenParts extends IdentityClaim {
  /** `v1.<subject>.<issuedAt>` — what `signature()` is computed over. */
  payload: string;
  /** The base64url signature as presented, unchecked. */
  signature: string;
}

/** base64url → string, in whatever runtime this is loaded into. Returns "" on anything malformed. */
function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 === 0 ? base64 : base64 + "=".repeat(4 - (base64.length % 4));
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/**
 * The claim a token CLAIMS to carry, with no signature check at all, or `null` if it is not even
 * the right shape.
 *
 * Read the module header before calling this. A non-null result means "these four fields parse",
 * and nothing whatsoever about whether the server would accept them.
 */
export function parseIdentityToken(token: string): IdentityTokenParts | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, encodedSubject, encodedIat, signature] = parts as [string, string, string, string];
  if (version !== IDENTITY_TOKEN_VERSION) return null;

  // `parseInt` STOPS at the first character it cannot read and returns what it got, so
  // parseInt("zzzz!!", 36) is 1679615 and `Number.isFinite` says yes — a malformed field parsing as
  // a plausible number. `signIdentity` only ever writes `issuedAt.toString(36)`, so requiring that
  // shape rejects nothing this repo mints and stops the parse from inventing a timestamp.
  if (!/^-?[0-9a-z]+$/.test(encodedIat)) return null;
  const issuedAt = parseInt(encodedIat, 36);
  if (!Number.isFinite(issuedAt)) return null;

  const subject = fromBase64Url(encodedSubject);
  // An empty subject cannot be produced by `signIdentity`, which refuses to sign one.
  if (!subject) return null;

  return { subject, issuedAt, payload: `${version}.${encodedSubject}.${encodedIat}`, signature };
}

/**
 * Whether a token this browser is holding is a signature over the id it is holding beside it.
 *
 * FALSE MEANS THE TWO LOCAL KEYS DISAGREE, which is a state a browser can genuinely reach: erasing
 * an account removed `echo.userId` and left `echo.identityToken` behind, and `resolveUserId` then
 * minted a fresh anonymous id under the dead signature. Every write from that browser is refused
 * with `identity_mismatch` and no reload heals it, because the mint short-circuits on "I have both
 * keys". This is the predicate that makes that short-circuit honest.
 */
export function tokenMatchesSubject(token: string, subject: string): boolean {
  if (!token || !subject) return false;
  const parsed = parseIdentityToken(token);
  return parsed !== null && parsed.subject === subject;
}
