/**
 * POST /api/island/state must prove who it is — the half of the gate GET already passed
 * (SOC-2.E, `⚑27`, `⚑28`, C39).
 *
 * GET derived its subject with `subjectOf` and loaded under `caller.subject`; POST read `userId`
 * out of the body and handed it straight to `saveIslandState`. So the island day state was the one
 * user-keyed store in the tree that ANYBODY who knew an id could overwrite — a whole day, its
 * scarcity, its ties, the raft — while that id's owner could not read their own island back without
 * a token. Read-refused and write-open, exactly inverted.
 *
 * WHY THE RECORD SAID IT WAS CLOSED. "16 of 19 id-bearing routes are guarded" counts ROUTE FILES
 * containing `subjectOf`, and this is the only file in the tree that exports two verbs. The count
 * was arithmetically true the whole time the hole was open.
 *
 * THE ROUTE IS THE UNIT UNDER TEST, not a copy of its branch, for `renderDebug.ts`'s reason: a test
 * that writes its own branch is testing its own branch. The only thing standing between a node test
 * and a route handler is `server-only`, a marker package whose `index.js` throws on purpose outside
 * a React Server Component and which `lib/island-state.ts` imports; seeding the CJS cache with an
 * empty module for it is enough. `next/server` loads fine. `lib/subject.ts`, the pure `subjectFor`
 * and the in-memory island store are all REAL here — nothing about the gate is faked.
 *
 * (SOCIETY-PLAN.md:834-836 says a route "cannot be tested — it imports `next/server`, which refuses
 * to load outside a server component". Measured on this tree, that is not the blocker; `server-only`
 * is, and it is seedable. The plan's §3 is the place that correction belongs.)
 *
 * Run:  cd apps/web && node --import tsx --test tests/islandState.test.mts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { freshRaft, type IslandDayState } from "@echo/shared";

// This suite WRITES island state under two invented ids. The in-memory store is the intended
// target; a configured service role would put those rows in a real `island_state` table and make
// test 3's persistence reading environment-dependent besides. Refuse rather than do it quietly.
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "[islandState.test] refusing to run against a configured Supabase: this suite writes rows under " +
      "invented ids and is written for the in-memory store. Unset SUPABASE_SERVICE_ROLE_KEY to run it.",
  );
}

// Must happen before the route (→ lib/island-state) is loaded.
const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST } = await import("../src/app/api/island/state/route");
const { loadIslandState, saveIslandState } = await import("../src/lib/island-state");

const SECRET = "gate-secret-aaaa";
const VICTIM = "victim-1111-4222-8333-444455556666";
const ATTACKER = "attacker-9999-4888-8777-666655554444";
const IAT = 1_757_000_000_000;

const saved = { secret: process.env.ECHO_IDENTITY_SECRET, trust: process.env.ECHO_TRUST_CLIENT_ID, vercel: process.env.VERCEL_ENV };
before(() => {
  // A real deployment: a key to verify with, and neither relaxation signal.
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  delete process.env.ECHO_TRUST_CLIENT_ID;
  process.env.VERCEL_ENV = "production";
});
after(() => {
  if (saved.secret === undefined) delete process.env.ECHO_IDENTITY_SECRET; else process.env.ECHO_IDENTITY_SECRET = saved.secret;
  if (saved.trust === undefined) delete process.env.ECHO_TRUST_CLIENT_ID; else process.env.ECHO_TRUST_CLIENT_ID = saved.trust;
  if (saved.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercel;
});

const day = (dayCount: number, scarcityLevel: number): IslandDayState =>
  ({ dayCount, scarcityLevel, cropStage: "none", cropPlantedAt: null, raft: freshRaft(), tieWarmth: {}, promisedTo: null, vitalityCarry: 0.85, updatedAt: 1 } as IslandDayState);

const post = (body: unknown, token?: string) =>
  POST(new Request("https://echo.test/api/island/state", {
    method: "POST",
    headers: token
      ? { "content-type": "application/json", authorization: `Bearer ${token}` }
      : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

test("an unsigned POST cannot write another person's island", async () => {
  await saveIslandState(VICTIM, day(7, 0.15));
  const res = await post({ userId: VICTIM, state: day(99, 0.99) });
  assert.equal(res.status, 403, "a POST that proved nothing was accepted");
  assert.deepEqual(await res.json(), { error: "identity_required" });
  // The status is not the claim; the store is. Assert on what is actually there.
  const after_ = await loadIslandState(VICTIM, 2);
  assert.equal(after_.state.dayCount, 7, "the victim's day was overwritten by an unsigned request");
  assert.equal(after_.state.scarcityLevel, 0.15);
});

test("a signed POST naming SOMEONE ELSE is a mismatch, not a write", async () => {
  await saveIslandState(VICTIM, day(7, 0.15));
  const res = await post({ userId: VICTIM, state: day(99, 0.99) }, signIdentity(ATTACKER, SECRET, IAT));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "identity_mismatch" });
  assert.equal((await loadIslandState(VICTIM, 2)).state.dayCount, 7);
});

test("the owner's own signed POST still lands — the legitimate caller is not the casualty", async () => {
  const res = await post({ userId: VICTIM, state: day(12, 0.4) }, signIdentity(VICTIM, SECRET, IAT));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { ok?: boolean }).ok, true);
  assert.equal((await loadIslandState(VICTIM, 2)).state.dayCount, 12);
});

test("the day is stored under the DERIVED subject, never the asserted string", async () => {
  // `subjectFor` trims what a caller asserts — subject.test.mts pins "whitespace is not a different
  // person" — and GET loads under `caller.subject`. A POST that passed `userId` through verbatim
  // would guard correctly and still key the same person's island under "  id  ", and their next
  // GET would find a fresh shore. This is the assertion that separates a guard from a fix.
  const res = await post({ userId: `  ${VICTIM}  `, state: day(33, 0.66) }, signIdentity(VICTIM, SECRET, IAT));
  assert.equal(res.status, 200);
  assert.equal((await loadIslandState(VICTIM, 2)).state.dayCount, 33, "the write did not land under the subject GET reads");
});
