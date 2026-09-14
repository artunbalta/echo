/**
 * THE ONLY PLACE A SERVER-TRUSTED ID IS MINTED (SOC-2.E, C39).
 *
 * An anonymous visitor gets a fresh subject generated HERE and a signature over it. The browser then
 * carries the token and can neither choose the subject nor edit it, which is the single property
 * that separates this from the `crypto.randomUUID()` in `lib/identity.ts` that it replaces.
 *
 * IT DOES NOT SIGN AN ID YOU HAND IT, and that is not an oversight to be fixed later by a helpful
 * `{ existingId }` parameter. Signing a subject the caller supplies is exactly the hole this closes:
 * it would let anyone mint a valid token for anyone else's id, and the ids are not secret — the
 * shared world used to broadcast them (`⚑27`).
 *
 * WHAT THAT COSTS, said plainly: a visitor who already has an unsigned id in localStorage gets a NEW
 * one the first time this runs, and their previous echo is orphaned under the old id. The rows still
 * exist; nothing on the site can reunite them. This is the same loss as clearing site data, which
 * C39 accepted as the standing posture for anonymous people — but it happens ONCE TO EVERYONE at
 * rollout rather than to one person at a time, and that is worth knowing before deploying it. The
 * alternative, a grandfathering window that signs whatever id is presented, is the hole left open
 * with a date on it.
 *
 * SIGNED-IN USERS DO NOT COME HERE. `/api/auth/sync` already verifies a Supabase access token and
 * resolves it to a `public.users` id; it returns a token for that id, so there is one verification
 * of a Supabase session in the tree and not two.
 *
 * CONSENT: this route MINTS, so it must only ever be called after the consent card is answered —
 * `lib/identity.ts` argues why (`peekUserId` exists so nothing mints before the question). The rule
 * is *after the answer*; "called from `arm()`, never from a render" was this sentence's earlier
 * wording and named the mechanism that happened to be true rather than the rule (⚑28). There are
 * three callers now, and each satisfies the rule differently: `arm()` is the parcel chain's accept
 * path; `/play`'s connect effect is behind a render gate that will not mount `WorldClient` until
 * `echo.character` exists, and `/onboard` writes `echo.consent` before it writes that; and `/claim`
 * asks no consent question a stamped key would answer early and already promises the identifier is
 * permanent. **If you add a fourth, say which of those three it is.**
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { signIdentity } from "@echo/shared/identity";

import { identitySecrets } from "@/lib/subject";

export const runtime = "nodejs";

export async function POST() {
  const [signing] = identitySecrets();
  if (!signing) {
    // Fail closed and legibly. A route that quietly returned an unsigned id would put the system
    // back exactly where it started, and the deployment that did it would look healthy.
    return NextResponse.json({ error: "identity_unconfigured" }, { status: 503 });
  }

  // The SAME bare-UUID shape `identity.ts` mandates: no "u_" prefix, so an anonymous subject and an
  // auth-linked one are one form and a read can never miss the writer's row.
  const subject = randomUUID();
  return NextResponse.json({ userId: subject, token: signIdentity(subject, signing, Date.now()) });
}
