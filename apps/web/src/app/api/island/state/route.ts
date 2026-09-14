/**
 * Island day-state endpoint (P1 / blueprint VII.4). GET loads (applying wall-clock decay
 * exactly once — crops wilt, structures weather, ties cool while you're away) and returns
 * the honest "what changed while you were gone" lines; POST persists a closed day.
 * Zero-key path: backed by the process-lifetime in-memory store when Supabase is unset.
 */
import { NextResponse } from "next/server";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadIslandState, saveIslandState } from "@/lib/island-state";
import type { IslandDayState } from "@echo/shared";

export const runtime = "nodejs";

/**
 * THE HARNESS CLOCK HOOK, AND WHAT MAKES IT UNREACHABLE IN PRODUCTION.
 *
 * Why it exists. Crop wilt decays from `cropPlantedAt`, which the client supplies in the state body,
 * so it can already be aged over the wire. Tie cooling and raft weathering decay from
 * `now - state.updatedAt`, and POST re-stamped `updatedAt` to Date.now() on every save, so between
 * two back-to-back harness sessions a tie could never cool. `tieWarmth` is the exact substrate F4
 * rides on, so the one cross-session mechanism the harness could demonstrate was the one F4 does not
 * use. This makes the injected clock the pure core already takes reachable at the seam.
 *
 * Why it is gated. A client-injectable clock in production is a cheat surface: lie about the time and
 * you skip crop wilt and keep every tie warm forever. That would sit beside the `sea` scalar the
 * server already trusts, and one of those is enough. So the hook opens only when BOTH of these
 * server-side signals agree, and a request can set, forge or influence neither:
 *
 *   ECHO_TEST_CLOCK === "1"      An explicit opt-in read from process.env inside the Node runtime.
 *                                It is set by harness/f4/run_f4_acceptance.sh and by nothing else:
 *                                it is absent from .env, .env.example, .env.production, next.config
 *                                and the Vercel project settings, so on the deployed app it is
 *                                undefined and this test is false.
 *   VERCEL_ENV !== "production"  Vercel injects VERCEL_ENV into the server runtime of every
 *                                production deployment. It is not a header and not a query
 *                                parameter, so no request can change it. Even if the opt-in above
 *                                were somehow set on the project, this closes the hook on
 *                                production specifically.
 *
 * What a production client sending `?now=` gets: nothing. The parameter is read ONLY inside this
 * function, and the function returns before reading it when the gate is shut, so the request is
 * served with the real Date.now() and no error, byte-identically to before the hook existed.
 */
function testClock(raw: string | number | null | undefined): number | undefined {
  if (process.env.ECHO_TEST_CLOCK !== "1") return undefined;
  if (process.env.VERCEL_ENV === "production") return undefined;
  const n = typeof raw === "number" ? raw : raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asserted = url.searchParams.get("userId");
  if (!asserted) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const caller = subjectOf(req, asserted);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const injected = testClock(url.searchParams.get("now"));
  const loaded = await loadIslandState(caller.subject, injected ?? Date.now());
  // Echoed back only when the hook actually opened, so a harness asserts that it is live rather
  // than assuming it, and a production response carries no trace of the field at all.
  return NextResponse.json(injected === undefined ? loaded : { ...loaded, testClock: injected });
}

export async function POST(req: Request) {
  let body: { userId?: string; state?: IslandDayState; now?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { userId, state } = body;
  if (!userId || !state || typeof state !== "object") {
    return NextResponse.json({ error: "userId and state required" }, { status: 400 });
  }
  // THE HALF C39 MISSED, and the reason it was missable: the guard count in the record is a count of
  // ROUTE FILES containing `subjectOf`, and this is the only file in the tree that exports two verbs.
  // The GET above was gated; this POST kept writing under whatever string arrived in the body — so
  // the surface was READ-REFUSED AND WRITE-OPEN, exactly inverted, while `16 of 19` stayed
  // arithmetically true. Anyone holding a user id could overwrite that person's day: their crop,
  // their raft, their scarcity, their tie warmth (⚑28).
  const caller = subjectOf(req, String(userId));
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  // Minimal shape guard — the pure core owns semantics; reject obviously foreign payloads.
  if (typeof state.dayCount !== "number" || typeof state.scarcityLevel !== "number") {
    return NextResponse.json({ error: "malformed state" }, { status: 400 });
  }
  const injected = testClock(body.now);
  // The DERIVED subject, never the asserted string — the same inversion the GET performs at :57.
  // Writing under `userId` here would leave the guard as decoration: it would refuse an unsigned
  // caller and then still let a signed one write wherever they pointed.
  const persistence = await saveIslandState(caller.subject, { ...state, updatedAt: injected ?? Date.now() });
  return NextResponse.json(
    injected === undefined ? { ok: true, persistence } : { ok: true, persistence, testClock: injected },
  );
}
