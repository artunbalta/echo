/**
 * Who keeps the envelopes while a page is open (`lib/knowable/keeper.ts`, DECISIONS C89 after review),
 * and the two defects it was written for: an erasure that the next moment undid, and a raft crossing
 * after which outcomes settled the wrong envelopes.
 *
 * Run:  node --import tsx --test apps/web/tests/keeper.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { BOOK_KEY, emptyBook, sealMoment, settle, type Book } from "../src/lib/knowable/envelopes";
import { keeper, refOf } from "../src/lib/knowable/keeper";
import { brokenAt } from "../src/lib/knowable/seal";

const storage = () => {
  const kept = new Map<string, string>();
  return { kept, getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
};
const at = (s: number) => `2026-11-12T03:00:${String(s).padStart(2, "0")}.000Z`;
const sealed = (ref: string, kind: Parameters<typeof sealMoment>[1]["kind"], s: number) => (b: Book) => sealMoment(b, { ref, kind, arm: null }, at(s));

test("changes run one after another, each on what the one before left, and each is written", async () => {
  const store = storage();
  const seen: number[] = [];
  const k = keeper((b) => seen.push(b.chain.length), store);
  // Asked for at once, as two moments beginning in the same frame are: the second must see the first.
  void k.apply(sealed("p.1:moment:a", "spilled-basket", 1));
  void k.apply(sealed("p.1:moment:b", "woodpile", 2));
  await k.apply((b) => settle(b, { ref: "p.1:moment:a", kind: "spilled-basket", outcome: "help" }));
  assert.deepEqual(seen, [1, 2, 2]);
  assert.equal(k.book().chain[1]!.prev, k.book().chain[0]!.hash);
  assert.equal(await brokenAt(k.book().chain), null);
  assert.deepEqual(JSON.parse(store.kept.get(BOOK_KEY)!), k.book());
  // A change that changes nothing writes nothing, and a change that throws breaks nothing after it.
  store.kept.delete(BOOK_KEY);
  await k.apply((b) => b);
  assert.equal(store.kept.has(BOOK_KEY), false);
  await k.apply(() => { throw new Error("no seal could be made"); });
  await k.apply(sealed("p.1:moment:c", "litter", 3));
  assert.equal(k.book().chain.length, 3);
  // A page opened later reads what was kept.
  assert.deepEqual(keeper(() => undefined, store).book(), k.book());
});

test("forgetting empties the record here and in the browser, and the echo starts again from nothing", async () => {
  const store = storage();
  const k = keeper(() => undefined, store);
  await k.apply(sealed("p.1:moment:a", "spilled-basket", 1));
  await k.forget();
  assert.deepEqual(k.book(), emptyBook());
  assert.equal(store.kept.has(BOOK_KEY), false);
  assert.equal(k.stopped(), false);
  await k.apply(sealed("p.1:moment:b", "woodpile", 2));
  assert.equal(k.book().chain.length, 1);
  assert.equal(k.book().chain[0]!.n, 0, "the new record carried on from the forgotten one");
});

test("an erasure ends the keeping: what begins afterwards is not written back (the defect: six envelopes returned)", async () => {
  const store = storage();
  const seen: number[] = [];
  const k = keeper((b) => seen.push(b.chain.length), store);
  for (let i = 0; i < 6; i++) await k.apply(sealed(`p.1:moment:${i}`, "spilled-basket", i));
  assert.equal(JSON.parse(store.kept.get(BOOK_KEY)!).chain.length, 6);

  // A seal is under way as the erasure is asked for (its hash is being made), and more are waiting.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const underWay = k.apply(async (b) => {
    await held;
    return sealMoment(b, { ref: "p.1:moment:late", kind: "woodpile", arm: null }, at(30));
  });
  const waiting = k.apply(sealed("p.1:moment:later", "litter", 31));
  const erased = k.forget({ stop: true });
  release();
  await Promise.all([underWay, waiting, erased]);
  assert.equal(store.kept.has(BOOK_KEY), false, "the seal under way wrote the record back after the erasure");
  assert.deepEqual(k.book(), emptyBook());
  assert.equal(k.stopped(), true);

  // The world goes on behind the page: moments begin and end, and nothing of them is kept.
  await k.apply(sealed("p.1:moment:after", "spilled-basket", 40));
  await k.apply((b) => settle(b, { ref: "p.1:moment:after", kind: "spilled-basket", outcome: "help" }));
  assert.equal(store.kept.has(BOOK_KEY), false, "a moment after the erasure brought the record back");
  assert.deepEqual(k.book(), emptyBook());
  assert.equal(seen[seen.length - 1], 0);
});

test("a moment is named by its layer as well as its page: after a raft crossing, an outcome settles its own envelope", async () => {
  // The layer names its moments `moment:<id>|<lane>|<n>` with n from zero, in every world a page builds.
  const first = "moment:u|wayside|0";
  assert.notEqual(refOf("page", 1, first), refOf("page", 2, first));
  assert.notEqual(refOf("page", 1, first), refOf("other", 1, first));

  const k = keeper(() => undefined, storage());
  // In the first village a purse lay ahead and was never seen; then the raft crossed.
  await k.apply((b) => sealMoment(b, { ref: refOf("page", 1, first), kind: "lost-purse", arm: "few" }, at(1)));
  // In the second village the first thing by the way has the layer's same name. It is a greeting, and it is answered.
  await k.apply((b) => sealMoment(b, { ref: refOf("page", 2, first), kind: "greeting", arm: "peer" }, at(20)));
  await k.apply((b) => settle(b, { ref: refOf("page", 2, first), kind: "greeting", outcome: "greet-warm" }));
  const [purse, greeting] = k.book().chain;
  assert.equal(k.book().chain.length, 2, "the second village's first moment got no envelope");
  assert.equal(purse!.did, null, "the first village's purse was settled by something that happened in the second");
  assert.equal(greeting!.did, "greet-warm");
  // With one name for both (the defect), the purse would have been "answered warmly".
  const same = keeper(() => undefined, storage());
  await same.apply((b) => sealMoment(b, { ref: `page:${first}`, kind: "lost-purse", arm: "few" }, at(1)));
  await same.apply((b) => sealMoment(b, { ref: `page:${first}`, kind: "greeting", arm: "peer" }, at(20)));
  assert.equal(same.book().chain.length, 1);
});
