/**
 * What passes between two people in a village room, and the voice a line said there is read in (DECISIONS
 * C110), through the routes as the real handlers, on the in-process store: only a room's signed hand-over is
 * made; a gift, a trade and an ask move exactly what they say between the two packs, or nothing; and a line
 * is read aloud only by the room's token for it, to the one it was said to.
 *
 * Run:  node --import tsx --test apps/web/tests/roomHand.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import type { HandRequest } from "@echo/shared";
import { signIdentity } from "@echo/shared/identity";
import { signHand, signSpeak, signToldVoice } from "@echo/shared/standin";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
delete process.env.ELEVENLABS_API_KEY;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const HAND = await import("../src/app/api/village/hand/route");
const VOICE = await import("../src/app/api/village/voice/route");
const { handOver, readHand } = await import("../src/lib/handOver");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "hand-secret-aaaa";
const A = "e1f3e0fc-1111-4222-8333-444455550021";
const B = "e1f3e0fc-1111-4222-8333-444455550022";
const D = "84dcee5ffffffff";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, fetch: globalThis.fetch };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  process.env.ECHO_IDENTITY_SECRET = saved.secret;
  globalThis.fetch = saved.fetch;
});
beforeEach(() => resetMemoryStore());

const json = { "content-type": "application/json" };
const hand = (over: Partial<HandRequest> = {}): HandRequest => ({ id: "o1", cell: D, room: "TAKES", kind: "give", from: A, to: B, item: "shell", back: null, at: Date.now(), ...over });
const send = (r: unknown, sign = (b: string) => signHand(b, SECRET)) => {
  const body = JSON.stringify(r);
  return HAND.POST(new Request("https://echo.test/api/village/hand", { method: "POST", headers: { ...json, "x-echo-room": sign(body) }, body }));
};

test("what each kind is: a gift something and nothing back, a trade one for one, an ask nothing held out", () => {
  assert.ok(readHand(hand()));
  assert.ok(readHand(hand({ kind: "trade", back: "reed" })));
  assert.ok(readHand(hand({ kind: "ask", item: null, back: "reed" })));
  for (const bad of [
    hand({ back: "reed" }),
    hand({ item: null }),
    hand({ kind: "trade" }),
    hand({ kind: "ask" }),
    hand({ kind: "ask", item: null }),
    hand({ item: "gold-bar" }),
    hand({ to: A }),
    hand({ room: "takes" }),
    hand({ cell: "8a2a1072b59ffff" }),
    hand({ kind: "steal" as never }),
  ])
    assert.equal(readHand(bad), null, JSON.stringify(bad));
});

test("a hand-over moves what it says, or nothing, and never needs a free place for one thing for one", () => {
  assert.deepEqual(handOver({ item: "shell", back: null }, { shell: 1 }, {}), { from: {}, to: { shell: 1 } });
  assert.deepEqual(handOver({ item: "shell", back: "reed" }, { shell: 1 }, { reed: 2 }), { from: { reed: 1 }, to: { shell: 1, reed: 1 } });
  assert.deepEqual(handOver({ item: null, back: "reed" }, {}, { reed: 1 }), { from: { reed: 1 }, to: {} });
  assert.deepEqual(handOver({ item: "shell", back: null }, {}, {}), { error: "not_carried" });
  assert.deepEqual(handOver({ item: null, back: "reed" }, {}, {}), { error: "not_theirs" });
  assert.deepEqual(handOver({ item: "shell", back: null }, { shell: 1 }, { stone: 8 }), { error: "pack_full" });
  // A full pack can still trade one thing for one.
  assert.deepEqual(handOver({ item: "shell", back: "stone" }, { shell: 1 }, { stone: 8 }), { from: { stone: 1 }, to: { stone: 7, shell: 1 } });
});

test("only a room's hand-over is made: signed for that, over exactly what it sent, just now", async () => {
  const s = villageStore()!;
  await s.setPack(A, { shell: 1 });
  assert.equal((await send(hand(), (b) => signHand(b, "another-key"))).status, 401);
  assert.equal((await send(hand(), (b) => signSpeak(b, SECRET))).status, 401, "a request to speak is not a hand-over");
  const unsigned = await HAND.POST(new Request("https://echo.test/api/village/hand", { method: "POST", headers: json, body: JSON.stringify(hand()) }));
  assert.equal(unsigned.status, 401);
  assert.equal((await send(hand({ at: Date.now() - 120_000 }))).status, 410);
  assert.deepEqual(await s.packOf(A), { shell: 1 }, "nothing moved");
  const res = await send(hand());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, packs: { from: {}, to: { shell: 1 } } });
  assert.deepEqual([await s.packOf(A), await s.packOf(B)], [{}, { shell: 1 }]);
});

test("a trade and an ask move both ways; what is not there, or has no room, moves nothing", async () => {
  const s = villageStore()!;
  await s.setPack(A, { shell: 1 });
  await s.setPack(B, { reed: 1 });
  assert.equal((await send(hand({ kind: "trade", back: "reed" }))).status, 200);
  assert.deepEqual([await s.packOf(A), await s.packOf(B)], [{ reed: 1 }, { shell: 1 }]);
  assert.equal((await send(hand({ kind: "ask", item: null, back: "shell" }))).status, 200);
  assert.deepEqual([await s.packOf(A), await s.packOf(B)], [{ reed: 1, shell: 1 }, {}]);
  const gone = await send(hand({ item: "fish" }));
  assert.equal(gone.status, 409);
  assert.equal(((await gone.json()) as { error: string }).error, "not_carried");
  await s.setPack(B, { stone: 8 });
  assert.equal((await send(hand({ item: "shell" }))).status, 409, "their pack is full");
  assert.deepEqual([await s.packOf(A), await s.packOf(B)], [{ reed: 1, shell: 1 }, { stone: 8 }], "and nothing moved");
});

test("a line said in a room is read aloud only by the room's token, to the one it was said to", async () => {
  const at = Date.now();
  const line = { cell: D, room: "TAKES", seed: "0a1b2c3d", sex: "f" as const, age: 33, text: "nice shell", at };
  const token = signToldVoice({ ...line, sub: B }, SECRET);
  const voice = (who: string, body: unknown) =>
    VOICE.POST(new Request("https://echo.test/api/village/voice", { method: "POST", headers: { authorization: `Bearer ${signIdentity(who, SECRET, Date.now())}`, ...json }, body: JSON.stringify(body) }));
  assert.equal((await voice(A, { ...line, token })).status, 403, "not to someone else");
  assert.equal((await voice(B, { ...line, text: "something else", token })).status, 403, "not another line");
  assert.equal((await voice(B, { ...line, seed: "ffffffff", token })).status, 403, "not in another body's voice");
  assert.equal((await voice(B, { ...line, at: at - 11 * 60_000, token: signToldVoice({ ...line, at: at - 11 * 60_000, sub: B }, SECRET) })).status, 403, "not a line from long ago");
  assert.equal((await voice(B, { ...line, room: "takes", token })).status, 400);
  // Its own: past the gate, and with no voices to be had here, the browser's own voice is the answer.
  const ok = await voice(B, { ...line, token });
  assert.equal(ok.status, 503);
  assert.equal(((await ok.json()) as { error: string }).error, "no_voice");
});
