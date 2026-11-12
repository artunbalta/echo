/**
 * Erasing the envelopes, in one place (`lib/knowable/erase.ts`, DECISIONS C94 second reading).
 *
 * Two readings of this code in one night each found a page that erased a person and left the envelopes:
 * first the mirror and the demo's end (the page wrote them back), then `/account` (its list of keys had
 * none of theirs). So what is held here is the helper itself, with a browser made of three fakes, and
 * the fact that every erasing page goes through it and keeps no list of its own.
 *
 * Run:  node --import tsx --test apps/web/tests/erase.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BOOK_KEY, emptyBook, sealMoment, type Book } from "../src/lib/knowable/envelopes";
import { ADDING_KEY, eraseEnvelopes, eraseFromCount, VISITOR_KEY } from "../src/lib/knowable/erase";
import { FORGET_EVENT, keeper } from "../src/lib/knowable/keeper";
import { IDENTITY_TOKEN_KEY, refusedUnsigned } from "../src/lib/identity";

const SRC = resolve(import.meta.dirname, "../src");
type Asked = { url: string; method: string; body: unknown };

/** A browser: a store, a window that hears events, and a count that answers as told. */
function browser(count: "ok" | "down" | "refuses", kept: Record<string, string> = {}) {
  const store = new Map(Object.entries(kept));
  const heard: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const asked: Asked[] = [];
  const g = globalThis as Record<string, unknown>;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  g.window = {
    location: { search: "" },
    addEventListener: (name: string, fn: () => void) => void (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn),
    dispatchEvent: (e: Event) => {
      heard.push(e.type);
      for (const fn of listeners.get(e.type) ?? []) fn();
      return true;
    },
  };
  g.fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    asked.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
    if (count === "down") throw new Error("no route to the count");
    return new Response(count === "ok" ? '{"removed":3}' : '{"error":"unavailable"}', { status: count === "ok" ? 200 : 503 });
  };
  return { store, heard, asked };
}

const RECORD = { [BOOK_KEY]: '{"v":1,"chain":[],"words":null,"twin":null}', [ADDING_KEY]: "1", [VISITOR_KEY]: "abcdefghij0123456789" };

test("everything goes: the count's rows by their id, then the id, the yes, the record, and the page is told", async () => {
  const b = browser("ok", { ...RECORD, "echo.userId": "u-1" });
  assert.equal(await eraseEnvelopes(), "removed");
  assert.deepEqual(b.asked, [{ url: "/api/calls", method: "DELETE", body: { visitor: "abcdefghij0123456789" } }]);
  assert.deepEqual([...b.store.keys()], ["echo.userId"], "it cleared a key that is not the envelopes', or left one that is");
  assert.deepEqual(b.heard, [FORGET_EVENT]);
});

test("a count that cannot be reached keeps the id its rows are under, and says they are left", async () => {
  for (const how of ["down", "refuses"] as const) {
    const b = browser(how, RECORD);
    assert.equal(await eraseEnvelopes(), "left", how);
    // The id is the only handle on those rows: cleared, nobody could ever ask for them to go.
    assert.equal(b.store.get(VISITOR_KEY), "abcdefghij0123456789", how);
    // Nothing more is added, and the record here is gone whatever the count said.
    assert.equal(b.store.has(ADDING_KEY), false, how);
    assert.equal(b.store.has(BOOK_KEY), false, how);
    assert.deepEqual(b.heard, [FORGET_EVENT], how);
    // Asked again once it answers, the rows go and so does the id.
    browser("ok", Object.fromEntries(b.store));
    assert.equal(await eraseFromCount(), "removed", how);
  }
});

test("someone who never added to the count asks nothing of it", async () => {
  const b = browser("down", { [BOOK_KEY]: RECORD[BOOK_KEY] });
  assert.equal(await eraseEnvelopes(), "none");
  assert.deepEqual(b.asked, []);
  assert.equal(b.store.size, 0);
});

test("a demo's end erases the guest's envelopes and leaves the owner's count alone", async () => {
  const b = browser("ok", RECORD);
  assert.equal(await eraseEnvelopes({ count: false }), "none");
  assert.deepEqual(b.asked, [], "a guest on someone else's machine removed the owner's rows from the count");
  assert.deepEqual([...b.store.keys()].sort(), [ADDING_KEY, VISITOR_KEY].sort());
  assert.deepEqual(b.heard, [FORGET_EVENT]);
});

test("a page that is open hears the erasure and keeps nothing more (the helper and the keeper, joined as the page joins them)", async () => {
  const b = browser("ok", RECORD);
  const k = keeper(() => undefined, globalThis.localStorage);
  await k.apply((book: Book) => sealMoment(book, { ref: "p.1:moment:a", kind: "spilled-basket", arm: null }, "2026-11-12T05:00:00.000Z"));
  assert.equal(JSON.parse(b.store.get(BOOK_KEY)!).chain.length, 1);
  // What `useEnvelopes` does on the event.
  window.addEventListener(FORGET_EVENT, () => void k.forget({ stop: true }));
  await eraseEnvelopes();
  // The world goes on: the next moment begins. Nothing is sealed, and nothing is written back.
  await k.apply((book: Book) => sealMoment(book, { ref: "p.1:moment:b", kind: "woodpile", arm: null }, "2026-11-12T05:00:20.000Z"));
  assert.deepEqual(k.book(), emptyBook());
  assert.equal(b.store.has(BOOK_KEY), false, "a moment after the erasure wrote the record back");
});

test("every page that erases a person goes through the helper, and keeps no list of the envelopes' keys", () => {
  for (const file of ["components/world/Mirror.tsx", "app/account/page.tsx", "components/demo/DemoOverlay.tsx"]) {
    const src = readFileSync(resolve(SRC, file), "utf8");
    assert.match(src, /eraseEnvelopes\(/, `${file} erases a person and not their envelopes`);
    assert.doesNotMatch(src, /["']echo\.calls/, `${file} names the envelopes' keys itself: a list kept in two places is wrong in one of them`);
    assert.doesNotMatch(src, /echo:envelopes-forget/, `${file} tells the keeper itself and not through the helper`);
  }
  // And the hook's own removal is the helper's, so "remove mine" and an erasure cannot come apart.
  const hook = readFileSync(resolve(SRC, "components/world/Envelopes.tsx"), "utf8");
  assert.match(hook, /eraseFromCount\(\)/);
  assert.doesNotMatch(hook, /method: "DELETE"/, "the hook removes rows from the count with a request of its own");
});

test("a refusal for want of a signature means nothing was kept, only for a browser that holds none", () => {
  browser("ok");
  assert.equal(refusedUnsigned("identity_unconfigured"), true);
  assert.equal(refusedUnsigned("identity_required"), true);
  // A signature the server would not take is a person the server may know: that is a failure, and the id is kept.
  assert.equal(refusedUnsigned("identity_mismatch"), false);
  assert.equal(refusedUnsigned(undefined), false);
  browser("ok", { [IDENTITY_TOKEN_KEY]: "signed.token" });
  assert.equal(refusedUnsigned("identity_unconfigured"), false, "a browser with a signature was told there was nothing of it to erase");
  assert.equal(refusedUnsigned("identity_required"), false);
});
