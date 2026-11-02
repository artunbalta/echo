/**
 * The two routes that spend real money had no gate of any kind (`⚑30`).
 *
 * `POST /api/vision` forwarded a caller-supplied base64 image to api.anthropic.com and
 * `POST /api/portrait` sent a caller-supplied prompt to a paid image generator. Neither called
 * `subjectOf`; neither bounded its input. MEASURED before this: a 5 MB base64 selfie produced a
 * 5,243,524-byte request body to Anthropic, from a request that proved nothing about who sent it.
 * The repo's only rate limit is the waitlist's, and its own comment says why it is there —
 * "the selfie path spends real image-generation money" — about this exact path.
 *
 * WHAT THESE TESTS DO AND DO NOT PROVE. They prove the guard and the cap: a caller who cannot prove
 * a subject is refused before a provider is reached, and an oversized body is refused before a
 * provider is reached. They do NOT prove a spend limit — the minter hands an identity to anyone who
 * asks, so a determined caller mints one. What the guard buys is attribution and the refusal of a
 * casual unauthenticated script. The limit is `⚑30`'s open half.
 *
 * THE OUTBOUND ASSERTION IS THE ONE THAT MATTERS. A route can answer 403 and still have called the
 * provider, and `/api/vision` degrades to a mock on any error — so a test that only reads the status
 * would pass on a route that refuses AFTER spending. `globalThis.fetch` is replaced with a recorder
 * and every test asserts on what it recorded.
 *
 * AND A RECORDER THAT CAN NEVER SEE A CALL PROVES NOTHING. The first version of this file left
 * ART_PROVIDER unset, so `lib/art/index.ts` built a chain containing only its `mock` provider, which
 * returns a placeholder without touching fetch — every `deepEqual(outbound, [])` on the portrait half
 * passed whether or not the guard existed. Review caught it. Both providers are configured above and
 * the last test asserts a forward DOES happen, which is what makes an empty recorder elsewhere
 * evidence of a refusal rather than of a provider that was never wired.
 *
 * THE PORTRAIT PASSTHROUGH IS NOT TESTED HERE, DELIBERATELY. `selfieUrl` was removed from
 * `PortraitRequest` and from both providers rather than filtered at the route, so the guarantee is
 * a TYPE and `npm run typecheck` is what enforces it — the move `⚑27` made for `ownerId`. A runtime
 * test for it would have to assert that an absent field stays absent, which passes whether or not
 * the fix is there. Writing one would be this repo's most-repeated mistake, so there isn't one.
 *
 * Run:  cd apps/web && node --import tsx --test tests/paidRoutes.test.mts
 */
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";

// `@/lib/art` imports `server-only`, a marker package whose index.js throws on purpose outside a
// React Server Component. Seeding the CJS cache with an empty module for it is what lets a node test
// drive the REAL handler instead of a copy of its branch — the same seam islandState.test.mts uses,
// and the correction SOCIETY-PLAN §3 item 11 records (the blocker is this, not `next/server`).
// SET BEFORE THE IMPORT, NOT IN `before()`. `vision/route.ts` reads `ANTHROPIC_API_KEY` into a
// module-level `KEY` at load, and with it empty the handler answers a mock and never reaches the
// forward — so the outbound assertions below would have passed on a route that does not forward at
// all. That is the failure this file's own header warns about, and it happened here first: the
// suite was green on the guard tests and red on the one that proves a real caller still gets
// through, which is the only reason it was caught.
process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
// AND THE ART PROVIDER, for the same reason and a sharper one. `lib/art/index.ts` builds its chain
// from ART_PROVIDER and falls back to a `mock` provider that returns a placeholder WITHOUT touching
// fetch — so with it unset the portrait half never calls out at all, and every
// `deepEqual(outbound, [])` below would pass whether the guard existed or not. Review caught that:
// the assertions were unfalsifiable in exactly the way this file's header warns about. With a
// provider in the chain the recorder can see a forward, so the absence of one means something.
process.env.ART_PROVIDER = "fal";
process.env.FAL_KEY = "not-a-real-fal-key";
// AND A COUNTER, because a configured provider without one is now a REFUSAL by design (⚑30, the
// fail-closed posture). `lib/supabaseAdmin.ts` reads these at module load into `hasAdmin`, so they
// have to be here rather than in before(). The rpc itself is answered by the recorder below —
// supabase-js goes out over fetch like everything else, so nothing leaves the process.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: VISION } = await import("../src/app/api/vision/route");
const { POST: PORTRAIT } = await import("../src/app/api/portrait/route");

const SECRET = "paid-route-secret-aaaa";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556666";
const IAT = 1_757_000_000_000;

const saved = {
  secret: process.env.ECHO_IDENTITY_SECRET,
  trust: process.env.ECHO_TRUST_CLIENT_ID,
  vercel: process.env.VERCEL_ENV,
  anthropic: process.env.ANTHROPIC_API_KEY,
  artProvider: process.env.ART_PROVIDER,
  falKey: process.env.FAL_KEY,
  supaUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supaKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetch: globalThis.fetch,
};

/** Every outbound request the handlers attempted. Nothing leaves the process. */
let outbound: string[] = [];
/** What the rate-limit rpc answers. A number is a hit count; "error" makes the counter unavailable. */
let rateAnswer: number | "error" = 1;
/** Provider calls only — the rate-limit rpc is plumbing, not spending, so it is excluded. */
const spend = () => outbound.filter((u) => !u.includes("/rpc/rate_limit_hit"));

before(() => {
  // A real deployment: a key to verify with, and neither relaxation signal.
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  delete process.env.ECHO_TRUST_CLIENT_ID;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    outbound.push(href);
    // Anthropic's shape for vision; fal's queue submit answers with a request id. Neither response
    // has to be realistic past the point the handler stops reading it — what is asserted is the
    // CALL, not the answer.
    if (href.includes("/rpc/rate_limit_hit")) {
      return rateAnswer === "error"
        ? new Response(JSON.stringify({ message: "counter down" }), { status: 500, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify(rateAnswer), { status: 200, headers: { "content-type": "application/json" } });
    }
    const body = href.includes("queue.fal.run")
      ? { request_id: "r", status_url: "https://queue.fal.run/s", response_url: "https://queue.fal.run/r", status: "COMPLETED", images: [{ url: "https://img" }] }
      : { content: [{ text: "{}" }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

after(() => {
  for (const [k, v] of [
    ["ECHO_IDENTITY_SECRET", saved.secret],
    ["ECHO_TRUST_CLIENT_ID", saved.trust],
    ["VERCEL_ENV", saved.vercel],
    ["ANTHROPIC_API_KEY", saved.anthropic],
    ["ART_PROVIDER", saved.artProvider],
    ["FAL_KEY", saved.falKey],
    ["NEXT_PUBLIC_SUPABASE_URL", saved.supaUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", saved.supaKey],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
});

beforeEach(() => {
  outbound = [];
  rateAnswer = 1;
});

const token = () => signIdentity(SUBJECT, SECRET, IAT);

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown, bearer?: string) =>
  handler(
    new Request(url, {
      method: "POST",
      headers: bearer
        ? { "content-type": "application/json", authorization: `Bearer ${bearer}` }
        : { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const selfie = (chars: number) => "data:image/jpeg;base64," + "A".repeat(chars);

test("an unsigned caller cannot spend the project's vision budget", async () => {
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(1_000) });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "identity_required" });
  assert.deepEqual(spend(), [], "a refused request still reached the provider");
});

test("an oversized selfie is refused BEFORE the provider, even from a signed caller", async () => {
  // The guard is not the cap. A signed caller passes the gate and then has to pass this: the body
  // is what is billed, and it was unbounded. 5 MB is the size measured going out before the cap.
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(5 * 1024 * 1024) }, token());
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "selfie too large" });
  assert.deepEqual(spend(), [], "an oversized selfie was forwarded and billed");
});

test("the legitimate caller is not the casualty — a signed, ordinary selfie still reaches the provider", async () => {
  // True either way, and that is the point: it is a regression guard, not a gate. A cap that
  // refuses the product's own 384x384 JPEG would be a worse defect than the one being fixed.
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(40 * 1024) }, token());
  assert.equal(res.status, 200);
  assert.equal(spend().length, 1);
  assert.match(spend()[0]!, /api\.anthropic\.com/);
});

test("a token for someone else is still a token, which is what the guard can and cannot do", async () => {
  // `subjectOf(req)` with no asserted id answers with the TOKEN's subject, so any valid signature
  // passes. That is deliberate — this route has no per-user resource to scope to — and it is why
  // the entry says attribution rather than cost control: minting is open to anyone who asks.
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(1_000) }, signIdentity("someone-else", SECRET, IAT));
  assert.equal(res.status, 200);
  assert.equal(spend().length, 1, "any valid signature spends, which is the point being made");
});

test("an unsigned caller cannot spend the project's image-generation budget", async () => {
  const res = await post(PORTRAIT, "https://echo.test/api/portrait", { attributes: {} });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "identity_required" });
  assert.deepEqual(spend(), []);
});

test("oversized attributes are refused before a prompt is built", async () => {
  const huge = { hair: "x".repeat(8 * 1024) };
  const res = await post(PORTRAIT, "https://echo.test/api/portrait", { attributes: huge }, token());
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "attributes too large" });
  assert.deepEqual(spend(), []);
});

test("a signed, ordinary portrait request still reaches the provider", async () => {
  // The twin of the vision test above, and the one that makes the portrait `outbound` assertions
  // mean something: it proves the recorder CAN see a forward on this path, so an empty recorder in
  // the two tests above is evidence of a refusal rather than of a provider that was never wired.
  const res = await post(PORTRAIT, "https://echo.test/api/portrait", { attributes: { hair: "dark" } }, token());
  assert.equal(res.status, 200);
  assert.ok(spend().length >= 1, "the portrait path never called a provider, so the guard tests prove nothing");
  assert.match(spend()[0]!, /queue\.fal\.run/);
});

test("a counter that is down means NO SPENDING, which is the posture this route chose", async () => {
  // The decision, asserted. The waitlist's limiter fails OPEN because refusing a real signup costs
  // more than letting one through; a paid provider call is the other way round, and "the counter is
  // unavailable" and "there is no limit" are the same sentence. Flip `onUnavailable` to "allow" in
  // either route and this goes red.
  rateAnswer = "error";
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(1_000) }, token());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "rate_limiter_unavailable" });
  assert.deepEqual(spend(), [], "the provider was called despite the limiter being unavailable");
});

test("past the limit is 429, and the provider is not reached", async () => {
  rateAnswer = 11; // max is 10
  const res = await post(VISION, "https://echo.test/api/vision", { selfie: selfie(1_000) }, token());
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  assert.deepEqual(spend(), []);
});
