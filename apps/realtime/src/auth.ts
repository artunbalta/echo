/**
 * Who a joining client is allowed to be (SOC-2.E, ⚑27), for every room in this process.
 *
 * The policy is `subjectFor` from `@echo/shared/identity`, the same function apps/web's routes use.
 * What lived inline in `WorldRoom.onAuth` was the environment it reads; with a second room, that would
 * have been the same plumbing written twice, and the copy that relaxes by accident is the one nobody
 * re-reads (L5). So it is here once, and both rooms call it.
 *
 * It THROWS on refusal, and the rooms must let it: Colyseus frees the reserved seat when `onAuth`
 * rejects, and a refused join that went on as a guest would both leak a seat and keep writing.
 */
import { identitySecretsFor, subjectFor } from "@echo/shared/identity";

export function authSubject(token: string | undefined, asserted: string | null | undefined): { uid: string } {
  const verdict = subjectFor(
    {
      trustClientId: process.env.ECHO_TRUST_CLIENT_ID,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
      secrets: identitySecretsFor({
        secret: process.env.ECHO_IDENTITY_SECRET,
        previous: process.env.ECHO_IDENTITY_SECRET_OLD,
        vercelEnv: process.env.VERCEL_ENV,
        nodeEnv: process.env.NODE_ENV,
      }),
    },
    token || "",
    asserted ?? null,
  );
  if (!verdict.ok) throw new Error(`identity_${verdict.reason}`);
  return { uid: verdict.subject };
}
