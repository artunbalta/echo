/**
 * The village's count (`lib/knowable/crowd.ts`, `lib/openCount.ts`, `/api/calls`, DECISIONS C91): what
 * people did at each moment, with no names; what the page is given of it; how a call starts from it;
 * and that it is off unless switched on, takes only what it should, and gives a visitor's rows back.
 *
 * Run:  node --import tsx --test apps/web/tests/crowd.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { React: typeof React }).React = React;
const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

import { callFor, ON, tally, type Look } from "../src/lib/knowable/calls";
import { cellOf, CROWD_MIN, crowdCall, crowdFrom, priorOf, ROWS_MAX, validRow, type Counted, type CountRow, type Crowd } from "../src/lib/knowable/crowd";
import { asOpened, emptyBook, markSent, openAll, opened, sealMoment, settle, unsent } from "../src/lib/knowable/envelopes";
import { brokenAt } from "../src/lib/knowable/seal";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const row = (over: Partial<CountRow> = {}): CountRow => ({ seal: "a".repeat(64), cell: "84dcee5ffffffff", kind: "lost-purse", arm: "many", call: ON, did: "leave", same: 0, family: 2, at: "2026-11-12T03:00:00.000Z", ...over });

/** A count where the purse is mostly left for its owner, more so with two coins, and the fallen elder is mostly passed by. */
const COUNTED: Counted[] = [
  { kind: "lost-purse", arm: "few", did: "leave", n: 30, people: 28 },
  { kind: "lost-purse", arm: "few", did: ON, n: 10, people: 28 },
  { kind: "lost-purse", arm: "many", did: "leave", n: 12, people: 22 },
  { kind: "lost-purse", arm: "many", did: "take-all", n: 9, people: 22 },
  { kind: "lost-purse", arm: "many", did: ON, n: 4, people: 22 },
  { kind: "fallen-elder", arm: "alone", did: "help-up", n: 3, people: 6 },
  { kind: "fallen-elder", arm: "alone", did: ON, n: 4, people: 6 },
  { kind: "fallen-elder", arm: "onlookers", did: ON, n: 11, people: 12 },
  { kind: "fallen-elder", arm: "onlookers", did: "help-up", n: 2, people: 12 },
  { kind: "woodpile", arm: "-", did: "stack", n: 40, people: 30 },
  { kind: "woodpile", arm: "-", did: ON, n: 10, people: 30 },
  { kind: "litter", arm: "clean", did: "tidy", n: 3, people: 3 },
  { kind: "not-a-moment", arm: "-", did: "x", n: 99, people: 99 },
  { kind: "woodpile", arm: "-", did: "fly-away", n: 99, people: 99 },
];

test("a row is taken only if it is a real moment, an arm it has, endings it can have, a seal and a time", () => {
  assert.deepEqual(validRow(row()), row());
  assert.deepEqual(validRow({ ...row(), extra: "dropped", arm: undefined, kind: "woodpile", call: "stack", did: ON }), row({ kind: "woodpile", arm: null, call: "stack", did: ON }));
  for (const bad of [
    null, "x", {}, { ...row(), kind: "not-a-moment" }, { ...row(), kind: "bread-mother", arm: null, call: ON, did: ON }, { ...row(), arm: "nonsense" },
    { ...row(), did: "fly-away" }, { ...row(), call: "fly-away" }, { ...row(), seal: "abc" }, { ...row(), seal: "G".repeat(64) }, { ...row(), cell: "nowhere" },
    { ...row(), same: -1 }, { ...row(), family: 1.5 }, { ...row(), same: "2" }, { ...row(), at: "yesterday" }, { ...row(), at: 5 },
    // On every object, and no moment: a lookup would have found it and thrown further on.
    { ...row(), kind: "constructor" }, { ...row(), kind: "toString" }, { ...row(), kind: "__proto__" },
  ])
    assert.equal(validRow(bad), null, JSON.stringify(bad));
});

test("the count says nothing of a moment until enough people have met it", () => {
  const crowd = crowdFrom(COUNTED);
  assert.equal(CROWD_MIN, 10);
  // The purse: both arms, and pooled.
  assert.deepEqual(crowd["lost-purse"]!.arms.few, { people: 28, did: { leave: 30, [ON]: 10 } });
  assert.deepEqual(crowd["lost-purse"]!.all, { people: 28, did: { leave: 42, [ON]: 14, "take-all": 9 } });
  // The elder: six people met him alone, so that arm says nothing; pooled, twelve had.
  assert.equal(crowd["fallen-elder"]!.arms.alone, undefined);
  assert.equal(crowd["fallen-elder"]!.arms.onlookers!.people, 12);
  assert.equal(crowd["fallen-elder"]!.all!.people, 12);
  // Three people and some litter: nothing. What is no moment, or no ending of one, is dropped.
  assert.equal(crowd.litter, undefined);
  assert.equal((crowd as Record<string, unknown>)["not-a-moment"], undefined);
  assert.deepEqual(crowd.woodpile!.all, { people: 30, did: { stack: 40, [ON]: 10 } });
  assert.deepEqual(crowdFrom([]), {});
  // A stricter bar keeps more back.
  assert.equal(crowdFrom(COUNTED, 25)["fallen-elder"], undefined);
  assert.equal(crowdFrom(COUNTED, 25)["lost-purse"]!.arms.many, undefined);
});

test("what most people did is read by the arm that was met, then by the moment, then not at all", () => {
  const crowd = crowdFrom(COUNTED);
  assert.equal(crowdCall(crowd, "lost-purse", "few"), "leave");
  assert.equal(crowdCall(crowd, "fallen-elder", "onlookers"), ON);
  // Alone, too few have met him: the moment's own count stands in.
  assert.equal(cellOf(crowd, "fallen-elder", "alone"), crowd["fallen-elder"]!.all);
  assert.equal(crowdCall(crowd, "fallen-elder", "alone"), ON);
  assert.equal(crowdCall(crowd, "woodpile", null), "stack");
  assert.equal(crowdCall(crowd, "litter", "clean"), null);
  assert.equal(crowdCall(null, "lost-purse", "few"), null);
  assert.equal(crowdCall({}, "lost-purse", "few"), null);
});

test("a call starts from what people do there, and moves by how this person has differed from people", () => {
  const crowd = crowdFrom(COUNTED);
  const of = (arm: string | null) => (k: Parameters<typeof priorOf>[1]) => priorOf(crowd, k, k === "lost-purse" || k === "fallen-elder" ? arm : null);

  // Nobody seen: the echo says what most people do, with their share.
  const elder = callFor([], "fallen-elder", of("onlookers"));
  assert.equal(elder.outcome, ON);
  near(elder.dist[ON]!, 1 - (2 + 0.5) / (13 + 1));
  const purse = callFor([], "lost-purse", of("few"));
  assert.equal(purse.outcome, "leave");
  assert.ok(purse.dist.leave! > 0.7 && purse.dist["take-all"]! < 0.02);
  // With nine coins people take more, and the call says so.
  assert.ok(callFor([], "lost-purse", of("many")).dist["take-all"]! > 0.3);

  // Someone who stops where most walk on (the elder, twice) is expected to do more than most elsewhere too.
  const stops: Look[] = [{ kind: "fallen-elder", outcome: "help-up" }, { kind: "fallen-elder", outcome: "help-up" }];
  const lifted = callFor(stops, "woodpile", of(null));
  const plain = callFor([], "woodpile", of(null));
  assert.ok(1 - lifted.dist[ON]! > 1 - plain.dist[ON]!, "stopping where few do should lift the call elsewhere");
  // And someone who walks past what most people do is expected to do less.
  const passes: Look[] = [{ kind: "woodpile", outcome: ON }, { kind: "woodpile", outcome: ON }];
  assert.ok(1 - callFor(passes, "lost-purse", of("few")).dist[ON]! < 1 - purse.dist[ON]!);
  // Doing what everyone does says little: the lift is by the difference, not the deed.
  const usual: Look[] = [{ kind: "woodpile", outcome: "stack" }];
  const rare: Look[] = [{ kind: "fallen-elder", outcome: "help-up" }];
  const liftOf = (h: Look[]) => 1 - callFor(h, "lost-purse", of("few")).dist[ON]! - (1 - purse.dist[ON]!);
  assert.ok(liftOf(rare) > liftOf(usual) * 2);

  // No count is the same as everyone doing a thing half the time, each thing alike.
  for (const h of [[], stops, passes, [...stops, ...passes, { kind: "lost-purse", outcome: "leave" } as Look]]) {
    const a = callFor(h, "lost-purse");
    const b = callFor(h, "lost-purse", () => null);
    const c = callFor(h, "lost-purse", () => ({ engage: 0.5, verbs: null }));
    for (const o of Object.keys(a.dist)) (near(a.dist[o]!, b.dist[o]!), near(a.dist[o]!, c.dist[o]!));
  }
  // However far a person is from people, a share stays a share.
  const never = Array.from({ length: 30 }, () => ({ kind: "woodpile", outcome: ON }) as Look);
  const d = callFor(never, "fallen-elder", of("onlookers")).dist;
  near(Object.values(d).reduce((s, x) => s + x, 0), 1);
  for (const x of Object.values(d)) assert.ok(x >= 0 && x <= 1);
});

test("what most people did is sealed beside the echo's call, as the count stood, and counted on the same moments", async () => {
  const crowd = crowdFrom(COUNTED);
  let book = emptyBook();
  book = await sealMoment(book, { ref: "p:a", kind: "lost-purse", arm: "few" }, "2026-11-12T03:00:00.000Z", crowd);
  book = await sealMoment(book, { ref: "p:b", kind: "fallen-elder", arm: "onlookers" }, "2026-11-12T03:00:10.000Z", crowd);
  book = await sealMoment(book, { ref: "p:c", kind: "litter", arm: "clean" }, "2026-11-12T03:00:20.000Z", crowd);
  assert.deepEqual(book.chain.map((e) => [e.call, e.crowd]), [["leave", "leave"], [ON, ON], ["tidy", null]]);
  book = settle(book, { ref: "p:a", kind: "lost-purse", outcome: "leave" });
  book = settle(book, { ref: "p:b", kind: "fallen-elder", outcome: "help-up" });
  book = settle(book, { ref: "p:c", kind: "litter", outcome: "tidy" });
  book = openAll(book);
  const t = tally(opened(book).map(asOpened));
  assert.deepEqual(t.crowd, { n: 2, echo: 1, crowd: 1 });
  assert.equal(t.echo, 2);
  // The crowd's call is under the seal: it cannot be made to look worse afterwards.
  assert.equal(await brokenAt(book.chain.map((e, i) => (i === 0 ? { ...e, crowd: ON } : e))), 0);
  assert.equal(await brokenAt(book.chain), null);

  // What goes to the count is what was settled and not yet sent, once.
  const rows = unsent(book, "84dcee5ffffffff");
  assert.equal(rows.length, 3);
  for (const r of rows) assert.deepEqual(validRow(r), r);
  assert.deepEqual(rows[1], { seal: book.chain[1]!.hash, cell: "84dcee5ffffffff", kind: "fallen-elder", arm: "onlookers", call: ON, did: "help-up", same: 0, family: 0, at: "2026-11-12T03:00:10.000Z" });
  const sent = markSent(book, [rows[0]!.seal, rows[2]!.seal]);
  assert.deepEqual(unsent(sent, "84dcee5ffffffff").map((r) => r.kind), ["fallen-elder"]);
  // Marking as sent changes no seal.
  assert.equal(await brokenAt(sent.chain), null);
});

// ── the route ──────────────────────────────────────────────────────────────────

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const route = await import("../src/app/api/calls/route");
const post = (body: unknown) => route.POST(new Request("http://x/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const del = (body: unknown) => route.DELETE(new Request("http://x/api/calls", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const visitor = (i: number) => `visitor${String(i).padStart(4, "0")}aaaaaaaaaaaaaaaa`;
const fresh = () => ((globalThis as unknown as { __echoCrowd?: unknown }).__echoCrowd = undefined);

test("switched off, the count takes nothing, gives nothing, and says so plainly", async () => {
  delete process.env.ECHO_OPEN_CROWD;
  assert.deepEqual(await (await route.GET()).json(), { on: false });
  const res = await post({ visitor: visitor(1), rows: [row()] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { on: false });
  // Taking one's rows back is not behind the switch: there are none, and it says they are gone.
  assert.deepEqual(await (await del({ visitor: visitor(1) })).json(), { on: true, removed: true });
  // And nothing was kept while it was off.
  process.env.ECHO_OPEN_CROWD = "1";
  fresh();
  assert.deepEqual(await (await route.GET()).json(), { on: true, min: CROWD_MIN, crowd: {} });
});

test("switched on, it takes a visitor's rows once, says nothing until enough people have come, and gives a visitor's rows back", async () => {
  process.env.ECHO_OPEN_CROWD = "1";
  const seal = (i: number, j = 0) => `${i.toString(16).padStart(4, "0")}${j.toString(16).padStart(4, "0")}`.padEnd(64, "0");
  // Nine people leave the nine-coin purse; nothing is said yet.
  for (let i = 0; i < 9; i++) {
    const res = await post({ visitor: visitor(i), rows: [row({ seal: seal(i) })] });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).taken, [seal(i)]);
  }
  fresh();
  assert.deepEqual((await (await route.GET()).json()).crowd, {});
  // The same row again changes nothing; a tenth person, and the count speaks.
  await post({ visitor: visitor(0), rows: [row({ seal: seal(0) })] });
  await post({ visitor: visitor(9), rows: [row({ seal: seal(9), did: "take-all" }), row({ seal: seal(9, 1), kind: "woodpile", arm: null, call: "stack", did: "stack" })] });
  fresh();
  const crowd = (await (await route.GET()).json()).crowd as Crowd;
  assert.deepEqual(crowd["lost-purse"]!.arms.many, { people: 10, did: { leave: 9, "take-all": 1 } });
  assert.equal(crowd.woodpile, undefined, "one person's woodpile was told to everyone");
  // Read again within minutes, it is the kept answer: one more row does not show yet.
  await post({ visitor: visitor(10), rows: [row({ seal: seal(10) })] });
  assert.equal(((await (await route.GET()).json()).crowd as Crowd)["lost-purse"]!.arms.many!.people, 10);

  // Someone takes theirs back: the count is read afresh and is short of them.
  assert.deepEqual(await (await del({ visitor: visitor(9) })).json(), { on: true, removed: true });
  const after = (await (await route.GET()).json()).crowd as Crowd;
  assert.deepEqual(after["lost-purse"]!.arms.many, { people: 10, did: { leave: 10 } });
});

test("rows added while the count was on can be taken back after it is switched off", async () => {
  process.env.ECHO_OPEN_CROWD = "1";
  const v = "takenbackvisitor0000aaaaaaaa";
  await post({ visitor: v, rows: [row({ seal: "b".repeat(64), kind: "woodpile", arm: null, call: "stack", did: "stack" })] });
  const store = (globalThis as unknown as { __echoOpenCount: Map<string, unknown> }).__echoOpenCount;
  assert.ok([...store.keys()].some((k) => k.startsWith(v)));
  delete process.env.ECHO_OPEN_CROWD;
  assert.deepEqual(await (await route.GET()).json(), { on: false });
  assert.deepEqual(await (await del({ visitor: v })).json(), { on: true, removed: true });
  assert.ok(![...store.keys()].some((k) => k.startsWith(v)), "switched off, the rows could not be removed");
  process.env.ECHO_OPEN_CROWD = "1";
});

test("it refuses what is not a visitor, not rows, or too many", async () => {
  process.env.ECHO_OPEN_CROWD = "1";
  const status = async (body: unknown) => (await post(body)).status;
  assert.equal(await status("{not json"), 400);
  assert.equal(await status({ rows: [row()] }), 400);
  assert.equal(await status({ visitor: "short", rows: [row()] }), 400);
  assert.equal(await status({ visitor: "u_SOMEONES-SUBJECT-ID-0000000", rows: [row()] }), 400, "an id that is not the count's own");
  assert.equal(await status({ visitor: visitor(50), rows: [] }), 400);
  assert.equal(await status({ visitor: visitor(50), rows: "all of them" }), 400);
  assert.equal(await status({ visitor: visitor(50), rows: Array.from({ length: ROWS_MAX + 1 }, () => row()) }), 400);
  // One bad row no longer refuses the rest: what can be counted is, and what cannot is named, so the
  // page stops offering it (a refused batch used to be sent again for ever).
  const mixed = await post({ visitor: visitor(50), rows: [row({ seal: "c".repeat(64) }), { ...row({ seal: "d".repeat(64) }), did: "fly-away" }, { ...row({ seal: "e".repeat(64) }), kind: "constructor" }, "nonsense"] });
  assert.equal(mixed.status, 200);
  assert.deepEqual(await mixed.json(), { on: true, taken: ["c".repeat(64)], refused: ["d".repeat(64), "e".repeat(64)] });
  const none = await post({ visitor: visitor(51), rows: [{ ...row({ seal: "f".repeat(64) }), did: "fly-away" }] });
  assert.deepEqual(await none.json(), { on: true, taken: [], refused: ["f".repeat(64)] });
  assert.equal((await del({ visitor: 5 })).status, 400);
  assert.equal((await del({})).status, 400);
});

test("only our own page may add to the count or take from it: another site's form is refused", async () => {
  process.env.ECHO_OPEN_CROWD = "1";
  const ask = (method: "POST" | "DELETE", headers: Record<string, string>, body: unknown) =>
    route[method](new Request("https://echovirtualworld.com/api/calls", { method, headers, body: JSON.stringify(body) }));
  const body = { visitor: visitor(70), rows: [row({ seal: "9".repeat(64) })] };
  // A form on another site can post text/plain without asking; it cannot post JSON.
  assert.equal((await ask("POST", { "content-type": "text/plain" }, body)).status, 403);
  assert.equal((await ask("POST", {}, body)).status, 403);
  // A browser says where a request came from.
  assert.equal((await ask("POST", { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body)).status, 403);
  assert.equal((await ask("POST", { "content-type": "application/json", origin: "https://elsewhere.example", host: "echovirtualworld.com" }, body)).status, 403);
  assert.equal((await ask("DELETE", { "content-type": "text/plain" }, { visitor: visitor(70) })).status, 403);
  // Nothing of theirs was kept.
  const store = (globalThis as unknown as { __echoOpenCount: Map<string, unknown> }).__echoOpenCount;
  assert.ok(![...store.keys()].some((k) => k.startsWith(visitor(70))));
  // Our own page, and a script with no browser behind it, are heard.
  assert.equal((await ask("POST", { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "https://echovirtualworld.com", host: "echovirtualworld.com" }, body)).status, 200);
  assert.equal((await ask("DELETE", { "content-type": "application/json" }, { visitor: visitor(70) })).status, 200);
});

test("switched on with nowhere to read the count from, the count is off: no sentence, no id, nothing to refuse later", () => {
  // The switch set and migration 0040 not applied (or the database away). Its own process: the store
  // is chosen as the module loads.
  const script = `
    const { createRequire } = require("node:module");
    const r = createRequire(process.cwd() + "/tests/x.cjs");
    const so = r.resolve("server-only");
    r.cache[so] = { id: so, filename: so, path: so, loaded: true, exports: {}, children: [], paths: [] };
    import("./src/app/api/calls/route.ts").then(async (m) => console.log(JSON.stringify(await (await (m.GET ?? m.default.GET)()).json())));
  `;
  const out = execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    // A database that refuses every connection at once.
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ECHO_OPEN_CROWD: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "service-role-stub" } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  }).trim().split("\n").pop();
  assert.equal(out, '{"on":false}');
});

test("the consent card names the count only where it is on", async () => {
  const CardModule = await import("../src/components/world/ConsentCard");
  const Card = ((CardModule as unknown as { default: { default?: unknown } }).default.default ?? CardModule.default) as typeof CardModule.default;
  const draw = (crowd: boolean) => renderToStaticMarkup(createElement(Card, { consent: "unset", onAccept: () => undefined, onDecline: () => undefined, crowd }));
  assert.doesNotMatch(draw(false), /data-consent-crowd|count of what people do/);
  assert.match(draw(true), /data-consent-crowd[^>]*>With no name on it, what you choose is also added to the count of what people do here\./);
  // Every promise the card made before is still made, word for word.
  for (const html of [draw(false), draw(true)]) {
    assert.match(html, /never what you type/);
    assert.match(html, /Stop it any time from the menu/);
    assert.match(html, /Saying no changes nothing here/);
  }
  assert.equal(renderToStaticMarkup(createElement(Card, { consent: "accepted", onAccept: () => undefined, onDecline: () => undefined, crowd: true })), "");
});
