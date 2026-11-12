/**
 * The envelopes on the page (DECISIONS C89): what the opening shows, the friend's link, the words for
 * every arm, and the village a newcomer walks into.
 *
 * The record itself, the calls and the seals are in `calls.test.mts`; this is what a person reads.
 *
 * Run:  node --import tsx --test apps/web/tests/envelopes.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MOMENT_KINDS, MOMENTS } from "@echo/planet";

// tsx compiles the components' JSX to a bare `React.createElement` (the same shim as worldHud.test.mts).
(globalThis as unknown as { React: typeof React }).React = React;
const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

import { ARM_WORDS_FOR_TEST, armWords } from "../src/lib/knowable/armWords";
import { ON, outcomesOf } from "../src/lib/knowable/calls";
import { emptyBook, openAll, sealMoment, settle, type Book } from "../src/lib/knowable/envelopes";
import { encodeGuess, GUESS_MAX, pickForFriend, type GuessLink } from "../src/lib/knowable/guessLink";
import { decodeGuess } from "../src/lib/knowable/guessPage";
import { momentWords, outcomeWords } from "../src/lib/knowable/say";
import { OPEN_VILLAGE, OPEN_VILLAGE_PATH } from "../src/lib/openVillage";

const EnvModule = await import("../src/components/world/Envelopes");
type Env = import("../src/components/world/Envelopes").Envelopes;
const { EnvelopeChip, EnvelopesPanel, EnvelopeAsides } = EnvModule;

const env = (book: Book, over: Partial<Env> = {}): Env => ({
  book,
  ready: book.chain.filter((e) => e.did !== null && !e.open).length,
  open: false,
  setOpen: () => undefined,
  apply: () => undefined,
  count: { on: false, adding: false, left: false },
  twinOn: false,
  setAdding: async () => true,
  forgetAll: async () => true,
  ...over,
});

/** A short visit: a basket helped with, a purse a coin was taken from, an elder walked past, and one never seen. */
async function visited(): Promise<Book> {
  let b = emptyBook();
  const at = (s: number) => `2026-11-12T03:00:${String(s).padStart(2, "0")}.000Z`;
  b = await sealMoment(b, { ref: "p:moment:a", kind: "spilled-basket", arm: null }, at(1));
  b = settle(b, { ref: "p:moment:a", kind: "spilled-basket", outcome: "help" });
  b = await sealMoment(b, { ref: "p:moment:b", kind: "lost-purse", arm: "many" }, at(9));
  b = settle(b, { ref: "p:moment:b", kind: "lost-purse", outcome: "take-one" });
  b = await sealMoment(b, { ref: "p:moment:c", kind: "fallen-elder", arm: "onlookers" }, at(20));
  b = settle(b, { ref: "p:moment:c", kind: "fallen-elder", outcome: "passed" });
  b = await sealMoment(b, { ref: "p:moment:d", kind: "honey-stall", arm: "eye" }, at(31));
  b = await sealMoment(b, { ref: "p:moment:e", kind: "spilled-basket", arm: null }, at(40));
  b = settle(b, { ref: "p:moment:e", kind: "spilled-basket", outcome: "help" });
  return b;
}

test("the envelope under the meter counts what is waiting, and is not there when nothing is", async () => {
  assert.equal(renderToStaticMarkup(createElement(EnvelopeChip, { env: env(emptyBook()) })), "");
  const b = await visited();
  const html = renderToStaticMarkup(createElement(EnvelopeChip, { env: env(b) }));
  assert.match(html, /data-envelopes-chip="4"/);
  assert.match(html, />4<\/button>/);
  // Opened, nothing waits; the one never seen never did.
  assert.equal(renderToStaticMarkup(createElement(EnvelopeChip, { env: env(openAll(b)) })), "");
});

test("closed, the panel draws nothing; with nothing sealed it says why, and says so differently unwatched", () => {
  assert.equal(renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(emptyBook()), consent: "accepted" })), "");
  const watched = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(emptyBook(), { open: true }), consent: "accepted" }));
  assert.match(watched, /data-envelopes-empty/);
  assert.doesNotMatch(watched, /data-envelopes-saw/, "something was said of a record with nothing in it");
  assert.match(watched, /Nothing is sealed yet/);
  const unwatched = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(emptyBook(), { open: true }), consent: "declined" }));
  assert.match(unwatched, /not watching, so it seals nothing/);
  // Nothing to check or forget where nothing was kept.
  assert.doesNotMatch(watched, /data-envelopes-check|data-envelopes-forget/);
});

test("opened, each envelope says what was called and what was done, and the count is of those only", async () => {
  const b = openAll(await visited());
  const html = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(b, { open: true }), consent: "accepted" }));
  // Earlier ones (opened before this opening) are under the fold, and the whole count is given.
  assert.match(html, /data-envelopes-all[^>]*>Everything so far: 2 of 4\./);
  // First looks against a moment it had seen them at: the basket the second time.
  assert.match(html, /data-envelopes-curve[^>]*>Its first time at a moment: 1 of 3\. Where it had seen you before: 1 of 1\./);
  // The purse with its arm, the call and the deed in the world's own words.
  assert.match(html, /A purse lying in the grass/);
  assert.match(html, /nine coins in it/);
  assert.match(html, /Take a coin/);
  assert.match(html, /Help gather the apples/);
  assert.equal((html.match(/data-envelope="hit"/g) ?? []).length, 2);
  assert.equal((html.match(/data-envelope="miss"/g) ?? []).length, 2);
  // The moment never seen is nowhere.
  assert.doesNotMatch(html, /stall of honey/);
  // The record said back as what happened: the two in trouble (a basket twice, an elder once) and no more,
  // since a single purse is not yet enough to speak of honesty, and four things are not yet five.
  assert.match(html, /data-envelopes-saw/);
  assert.match(html, /You gave your time to 2 of the 3 you met in trouble\./);
  assert.doesNotMatch(html, /honesty was yours|took part in/);
  // The offer to say one's own words stands until they are given; then the line of who did better.
  assert.match(html, /data-words-open/);
  assert.match(html, /data-envelopes-check/);
  assert.match(html, /data-envelopes-forget/);
  assert.match(html, /data-friend-link/);
});

test("the village's count is not spoken of where it is off; where it is on the panel asks, and says when it is adding", async () => {
  const b = openAll(await visited());
  const offHtml = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(b, { open: true }), consent: "accepted" }));
  assert.doesNotMatch(offHtml, /data-envelopes-counting|village&#x27;s count|Most people/);
  assert.match(offHtml, /Kept in this browser only/);
  const asked = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(b, { open: true, count: { on: true, adding: false, left: false } }), consent: "accepted" }));
  assert.match(asked, /data-envelopes-counting="asked"/);
  assert.match(asked, /Add mine/);
  assert.match(asked, /Kept in this browser only/);
  const adding = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(b, { open: true, count: { on: true, adding: true, left: false } }), consent: "accepted" }));
  assert.match(adding, /data-envelopes-counting="adding"/);
  assert.match(adding, /Stop, and remove mine/);
  // The promise changes with it: the envelopes stay, the count leaves.
  assert.doesNotMatch(adding, /Kept in this browser only/);
  assert.match(adding, /only the count above leaves it/);
  // Switched off after this person added to it: their rows are still there, and still theirs to remove.
  const left = renderToStaticMarkup(createElement(EnvelopesPanel, { env: env(b, { open: true, count: { on: false, adding: false, left: true } }), consent: "accepted" }));
  assert.match(left, /data-envelopes-counting="left"/);
  assert.match(left, /still in it/);
  assert.match(left, /Remove mine/);
  assert.doesNotMatch(left, /Kept in this browser only/, "it said nothing had left the browser while rows of theirs were in the count");
});

test("on the way out the page asks once, with the number waiting, and offers both ways", async () => {
  // (The line at the foot once four are waiting is an effect: a static render cannot show it. The
  // browser's spec is where the page's own wires are held: tests/e2e/envelopes.spec.ts.)
  const b = await visited();
  const quiet = renderToStaticMarkup(createElement(EnvelopeAsides, { env: env(b), coarse: false, leaving: false, onStay: () => undefined, onLeave: () => undefined }));
  assert.equal(quiet, "");
  const leaving = renderToStaticMarkup(createElement(EnvelopeAsides, { env: env(b), coarse: false, leaving: true, onStay: () => undefined, onLeave: () => undefined }));
  assert.match(leaving, /data-envelopes-leaving/);
  assert.match(leaving, /sealed 4 guesses about you/);
  assert.match(leaving, /data-leaving-open/);
  assert.match(leaving, /data-leaving-go/);
});

test("every arm of every experiment has its few words, in both languages", () => {
  for (const kind of MOMENT_KINDS) {
    const arms = MOMENTS[kind].arms ?? [];
    if (arms.length < 2) continue;
    for (const arm of arms) {
      for (const lang of ["en", "tr"] as const) assert.ok(armWords(lang, kind, arm.id), `${kind}:${arm.id} has no words in ${lang}`);
      assert.notEqual(armWords("en", kind, arm.id), armWords("tr", kind, arm.id));
    }
  }
  // And no words for an arm that does not exist.
  for (const key of Object.keys(ARM_WORDS_FOR_TEST)) {
    const [kind, arm] = key.split(":") as [keyof typeof MOMENTS, string];
    assert.ok((MOMENTS[kind]?.arms ?? []).some((a) => a.id === arm), `${key} names no arm`);
  }
  assert.equal(armWords("en", "lost-purse", null), null);
  assert.equal(armWords("en", "spilled-basket", "nonsense"), null);
});

test("every way every moment can end reads as words, in both languages", () => {
  for (const kind of MOMENT_KINDS)
    for (const o of outcomesOf(kind))
      for (const lang of ["en", "tr"] as const) {
        const words = outcomeWords(lang, kind, o);
        assert.ok(words.length > 2 && words !== o, `${kind}/${o} in ${lang}: "${words}"`);
      }
  assert.equal(outcomeWords("en", "lost-purse", ON), "Walk on");
  assert.equal(outcomeWords("tr", "lost-purse", ON), "Yürüyüp geçmek");
  assert.deepEqual(momentWords("en", "lost-purse", "few"), { name: "A purse lying in the grass", arm: "two coins in it" });
  assert.equal(momentWords("tr", "fallen-elder", "alone").arm, "etrafta başka kimse yok");
});

test("a friend's link carries a handful of moments, whole, and anything else does not open", async () => {
  const b = openAll(await visited());
  const items = pickForFriend(b.chain.filter((e) => e.did !== null));
  // One of each kind (the basket's latest), a family's before the rest, never the one unseen.
  assert.deepEqual(items.map((i) => i.k).sort(), ["fallen-elder", "lost-purse", "spilled-basket"]);
  assert.ok(items.length <= GUESS_MAX);
  const link: GuessLink = { v: 1, n: "Artun", items };
  const text = encodeGuess(link);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeGuess(text), link);
  assert.deepEqual(decodeGuess(`#${text}`), link);
  // A name with letters outside Latin-1 survives.
  assert.equal(decodeGuess(encodeGuess({ ...link, n: "Gülşah Çağrı" }))?.n, "Gülşah Çağrı");

  const tamper = (f: (l: GuessLink) => unknown) => decodeGuess(encodeGuess(f(structuredClone(link)) as GuessLink));
  assert.equal(decodeGuess(""), null);
  assert.equal(decodeGuess("#nonsense"), null);
  assert.equal(tamper((l) => ({ ...l, v: 2 })), null);
  assert.equal(tamper((l) => ({ ...l, items: l.items.slice(0, 2) })), null, "too few to be a game");
  assert.equal(tamper((l) => ((l.items[0]!.k = "not-a-moment" as never), l)), null);
  assert.equal(tamper((l) => ((l.items[0]!.d = "fly-away"), l)), null, "an ending the moment does not have");
  assert.equal(tamper((l) => ((l.items[0]!.c = "fly-away"), l)), null);
  assert.equal(tamper((l) => ((l.items[0]!.a = "nonsense"), l)), null, "an arm the moment does not have");
  assert.equal(tamper((l) => ((l.items[0]!.k = "bread-mother"), l)), null, "a kind never called");
  // A long name is cut, not refused; nothing but the four fields rides along.
  const long = tamper((l) => ({ ...l, n: "x".repeat(200), extra: "y", items: l.items.map((i) => ({ ...i, z: 1 })) }));
  assert.equal(long?.n.length, 40);
  assert.deepEqual(Object.keys(long!.items[0]!), ["k", "a", "c", "d"]);
});

test("a newcomer walks into a village with people in it, and not the study's", () => {
  const index = JSON.parse(readFileSync(fileURLToPath(new URL("../public/planet/villages-echo-capacity-1.json", import.meta.url)), "utf8")) as { cells: string[] };
  assert.ok(index.cells.includes(OPEN_VILLAGE), "the open village is not a village of this seed");
  assert.equal(OPEN_VILLAGE_PATH, `/parcel/${OPEN_VILLAGE}`);
  const pilot = readFileSync(fileURLToPath(new URL("../src/lib/pilot.ts", import.meta.url)), "utf8");
  const pilotCell = /DEFAULT_CELL\s*=\s*"([0-9a-f]{15})"|"(8[0-9a-f]{14})"/.exec(pilot);
  assert.ok(pilotCell, "the pilot's default cell could not be read");
  assert.notEqual(OPEN_VILLAGE, pilotCell![1] ?? pilotCell![2], "strangers would be let into the study's village");
});
