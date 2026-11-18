/**
 * A village room's copy has a world of its own (DECISIONS C102): what is changed, remembered, marked and
 * done in one copy is in that copy, and nowhere else, not in the open world and not in another copy; and
 * the routes answer for the room they are asked for, or refuse a room that is not one.
 *
 * Run:  node --import tsx --test apps/web/tests/roomWorlds.test.mts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { ROOM_VILLAGES, worldKey } from "@echo/shared";
import { signIdentity } from "@echo/shared/identity";

process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { GET: CHANGES } = await import("../src/app/api/village/changes/route");
const { GET: DEEDS } = await import("../src/app/api/village/deeds/route");
const { DELETE: FORGET } = await import("../src/app/api/village/memory/route");
const { signConversation, verifyConversation } = await import("../src/lib/villageTalk");

const D = ROOM_VILLAGES[0]!;
const SECRET = "rooms-secret-aaaa";
const ME = "e1f3e0fc-1111-4222-8333-444455550001";
const PERSON = "0123456789abcdef";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
});
after(() => {
  process.env.ECHO_IDENTITY_SECRET = saved.secret;
  process.env.VERCEL_ENV = saved.vercel;
});

const auth = () => ({ authorization: `Bearer ${signIdentity(ME, SECRET, Date.now())}` });
const stay = (madeDay: number) => ({ person: PERSON, kind: "stay" as const, madeDay, day: madeDay });
const deed = (thing: string) => ({ verb: "help", kind: "villager", thing, thingName: "someone", reading: "help" as const, weight: 1 as const, day: 10, hour: 0.5, witnesses: [], owners: [] });
const memory = (note: string) => ({ note, meetings: 1, firstDay: 10, lastDay: 10 });

test("a change made in a copy is that copy's alone", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.addChange(D, stay(1), ME);
  await villageStore()!.addChange(D, stay(2), ME);
  assert.deepEqual((await villageStore("ABCDE")!.changesFor(D))!.map((c) => c.madeDay), [1]);
  assert.deepEqual((await villageStore("XYZ23")!.changesFor(D))!.map((c) => c.madeDay), [], "another copy has none of it");
  assert.deepEqual((await villageStore()!.changesFor(D))!.map((c) => c.madeDay), [2], "the open world has only its own");
});

test("a villager in a copy remembers only what was said in that copy", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.remember(ME, D, PERSON, memory("met in the copy"));
  const kept = await villageStore("ABCDE")!.memoryOf(ME, D, PERSON);
  assert.ok(kept && kept !== "none" && kept.note === "met in the copy");
  assert.equal(await villageStore()!.memoryOf(ME, D, PERSON), "none");
  assert.equal(await villageStore("XYZ23")!.memoryOf(ME, D, PERSON), "none");
});

test("marks and deeds stay in their copy", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.addEffect(D, { thing: "field:1", kind: "trampled", day: 10, untilDay: 14 }, ME);
  await villageStore("ABCDE")!.addDeed(ME, D, deed("p1"));
  assert.equal((await villageStore("ABCDE")!.effectsFor(D, 11))!.length, 1);
  assert.equal((await villageStore()!.effectsFor(D, 11))!.length, 0);
  assert.equal((await villageStore("ABCDE")!.deedsFor(ME, D))!.length, 1);
  assert.equal((await villageStore()!.deedsFor(ME, D))!.length, 0);
});

test("who a stranger has met: a copy sees its own by cell, and the open world never reaches into a copy", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.remember(ME, D, PERSON, memory("copy"));
  await villageStore()!.remember(ME, "843f6a1ffffffff", "fedcba9876543210", memory("open"));
  const open = (await villageStore()!.metBy(ME, 10))!;
  assert.deepEqual(open.map((m) => m.cell), ["843f6a1ffffffff"]);
  const copy = (await villageStore("ABCDE")!.metBy(ME, 10))!;
  assert.deepEqual(copy.map((m) => [m.cell, m.person]), [[D, PERSON]], "a copy's own, named by its plain cell");
  assert.deepEqual(await villageStore("XYZ23")!.metBy(ME, 10), []);
});

test("the raw rows are filed under the world's key", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.addChange(D, stay(3), ME);
  // Read through the open world's store with the key itself: the row is there under `cell~CODE`.
  assert.equal((await villageStore()!.changesFor(worldKey(D, "ABCDE")))!.length, 1);
});

test("the changes route answers for the room asked, and refuses a room that is not one", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.addChange(D, stay(5), ME);
  const get = async (q: string) => {
    const res = await CHANGES(new Request(`https://echo.test/api/village/changes?${q}`));
    return { status: res.status, body: (await res.json()) as { changes?: { madeDay: number }[]; error?: string } };
  };
  assert.deepEqual((await get(`cell=${D}&room=ABCDE`)).body.changes!.map((c) => c.madeDay), [5]);
  assert.deepEqual((await get(`cell=${D}`)).body.changes, [], "without a room, the open world");
  assert.deepEqual(await get(`cell=${D}&room=abcde`), { status: 400, body: { error: "bad_room" } });
  assert.deepEqual(await get(`cell=843f6a1ffffffff&room=ABCDE`), { status: 400, body: { error: "bad_room" } }, "the pilot's village is never a copy");
});

test("your deeds in a copy, and forgetting in a copy, are that copy's", async () => {
  resetMemoryStore();
  await villageStore("ABCDE")!.addDeed(ME, D, deed("p2"));
  const deeds = async (q: string) => ((await (await DEEDS(new Request(`https://echo.test/api/village/deeds?${q}`, { headers: auth() }))).json()) as { deeds: unknown[] }).deeds.length;
  assert.equal(await deeds(`cell=${D}&room=ABCDE`), 1);
  assert.equal(await deeds(`cell=${D}`), 0);

  await villageStore("ABCDE")!.remember(ME, D, PERSON, memory("copy"));
  await villageStore()!.remember(ME, D, PERSON, memory("open"));
  const res = await FORGET(new Request("https://echo.test/api/village/memory", { method: "DELETE", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify({ cell: D, person: PERSON, room: "ABCDE" }) }));
  assert.equal(res.status, 200);
  assert.equal(await villageStore("ABCDE")!.memoryOf(ME, D, PERSON), "none", "forgotten in the copy");
  assert.notEqual(await villageStore()!.memoryOf(ME, D, PERSON), "none", "still remembered in the open world");
});

test("a conversation begun in a copy goes on in that copy, not in the open world or another copy", () => {
  const now = Date.now();
  const conv = signConversation(ME, worldKey(D, "ABCDE"), PERSON, now);
  assert.ok(conv);
  assert.equal(verifyConversation(conv, ME, worldKey(D, "ABCDE"), PERSON, now), true);
  assert.equal(verifyConversation(conv, ME, worldKey(D, null), PERSON, now), false);
  assert.equal(verifyConversation(conv, ME, worldKey(D, "XYZ23"), PERSON, now), false);
});
