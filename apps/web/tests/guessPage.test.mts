/**
 * The friend's page and its catalogue (DECISIONS C89): `/guess` names its moments from a small written-out
 * copy (`lib/knowable/data/moments.json`, read through `guessPage.ts`) so that a phone opening a link
 * does not load the planet and every string in the app to read five headings.
 *
 * A copy can go stale, so this holds it to what it copies:
 *
 *   - the file is exactly what `scripts/moment-catalogue.mjs` derives today;
 *   - every moment, arm and ending reads on the page as `say.ts` and `calls.ts` have it in the world;
 *   - the page's strings are `lib/i18n.ts`'s, word for word;
 *   - the page imports neither the planet nor the table, itself or through anything it imports;
 *   - the page opens every link the village can write, and nothing else.
 *
 * Run (from apps/web):  node --import tsx --test tests/guessPage.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MOMENT_KINDS, MOMENTS } from "@echo/planet";

import { t, type Key } from "../src/lib/i18n";
import * as Calls from "../src/lib/knowable/calls";
import { encodeGuess, GUESS_MAX, GUESS_MIN, type GuessItem as Sent, type GuessLink as SentLink } from "../src/lib/knowable/guessLink";
import { decodeGuess, momentWords, outcomesOf, outcomeWords, say, type GuessKey, type GuessKind } from "../src/lib/knowable/guessPage";
import * as Say from "../src/lib/knowable/say";
import { LANGS, type Lang } from "../src/lib/lang";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../src");
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8");
const RUN = "run: node --import tsx apps/web/scripts/moment-catalogue.mjs";

interface Catalogue {
  items: { min: number; max: number };
  moments: Record<string, { name: Record<Lang, string>; arms: Record<string, Record<Lang, string> | null>; outcomes: { id: string }[] }>;
  strings: Record<Lang, Record<string, string>>;
}
const { catalogueOf, KEYS } = (await import("../scripts/moment-catalogue.mjs" as string)) as { catalogueOf(): Catalogue; KEYS: string[] };

/** The moments a call is made at: all but those never begun by themselves. */
const CALLED = MOMENT_KINDS.filter((k) => !MOMENTS[k].followUp);
const armsOf = (kind: (typeof CALLED)[number]) => (MOMENTS[kind].arms ?? []).map((a) => a.id);

/**
 * `say.ts` capitalises a name in the locale of whoever runs it: "iki ağır testi" begins "İki" in a
 * Turkish browser, and "Iki" in an English one or in this process. The catalogue is written once, for
 * everyone, so it capitalises in the language of the words. So `say.ts` is read here as a browser in
 * that language reads it.
 */
function asReadIn<T>(lang: Lang, reading: () => T): T {
  const real = String.prototype.toLocaleUpperCase;
  String.prototype.toLocaleUpperCase = function (this: string, locales?: Intl.LocalesArgument) {
    return real.call(this, locales ?? lang);
  };
  try {
    return reading();
  } finally {
    String.prototype.toLocaleUpperCase = real;
  }
}

test("moments.json is what the script derives from the planet and the app's words today", () => {
  const derived = catalogueOf();
  const file = read("../src/lib/knowable/data/moments.json");
  assert.deepEqual(JSON.parse(file), derived, RUN);
  assert.ok(file === JSON.stringify(derived, null, 1) + "\n", `moments.json is not spelled as the script spells it; ${RUN}`);

  // Every moment a call is made at, in the planet's order, and none that is never called.
  assert.deepEqual(Object.keys(derived.moments), CALLED);
  assert.ok(CALLED.length < MOMENT_KINDS.length && !("bread-mother" in derived.moments));
  // Every arm of each, with words or without; and as many moments to a link as the village sends.
  for (const kind of CALLED) assert.deepEqual(Object.keys(derived.moments[kind]!.arms), armsOf(kind), kind);
  assert.deepEqual(derived.items, { min: GUESS_MIN, max: GUESS_MAX });
  // Every `guess.*` string the table has, so a new one cannot be left behind.
  const inTable = new Set([...read("../src/lib/i18n.ts").matchAll(/^\s*"(guess\.[\w.]+)":/gm)].map((m) => m[1]!));
  assert.deepEqual([...KEYS].sort(), [...inTable].sort());
  for (const lang of LANGS) assert.deepEqual(Object.keys(derived.strings[lang]), KEYS);
});

test("every moment, arm and ending reads on the friend's page as it does in the world", () => {
  let said = 0;
  for (const kind of CALLED as GuessKind[]) {
    assert.deepEqual(outcomesOf(kind), Calls.outcomesOf(kind), kind);
    for (const lang of LANGS) {
      for (const arm of [null, ...armsOf(kind)]) {
        assert.deepEqual(momentWords(lang, kind, arm), asReadIn(lang, () => Say.momentWords(lang, kind, arm)), `${kind}/${arm} in ${lang}`);
        said++;
      }
      for (const o of Calls.outcomesOf(kind)) {
        assert.equal(outcomeWords(lang, kind, o), asReadIn(lang, () => Say.outcomeWords(lang, kind, o)), `${kind}/${o} in ${lang}`);
        said++;
      }
    }
  }
  assert.ok(said > 300, `only ${said} readings compared`);

  assert.deepEqual(momentWords("en", "lost-purse", "few"), { name: "A purse lying in the grass", arm: "two coins in it" });
  assert.deepEqual(momentWords("tr", "fallen-elder", "alone"), { name: "Kayıp düşmüş, kalkamayan yaşlı bir adam", arm: "etrafta başka kimse yok" });
  assert.equal(outcomeWords("en", "unfinished-tale", "told"), "Stay to hear the end");
  assert.equal(outcomeWords("tr", "lost-purse", Calls.ON), "Yürüyüp geçmek");
  // The one name the locale matters for today: a dotted capital, whatever the machine or the browser.
  assert.equal(momentWords("tr", "heavy-jugs", null).name, "İki ağır testiyle zorlanan yaşlı bir kadın");
  // An arm that adds nothing, an arm that is not one, and an ending that is not one.
  assert.equal(momentWords("en", "wrong-basket", "one-basket").arm, null);
  assert.equal(momentWords("en", "lost-purse", "constructor").arm, null);
  assert.equal(outcomeWords("en", "lost-purse", "fly-away"), "fly-away");
});

test("the page's strings are the app's, word for word", () => {
  const vars = { name: "Deniz", you: 3, echo: 2, n: 5, i: 1 };
  for (const lang of LANGS)
    for (const key of KEYS as GuessKey[]) {
      // As the table holds it, `{name}` and all; then filled.
      assert.equal(say(lang, key), t(lang, key as Key), `${key} in ${lang}`);
      assert.equal(say(lang, key, vars), t(lang, key as Key, vars), `${key} in ${lang}`);
      assert.doesNotMatch(say(lang, key, vars), /[{}]/, `${key} in ${lang} asks for something the page does not give`);
    }
  assert.equal(say("en", "guess.result", vars), "You knew Deniz: 3 of 5. Their echo: 2 of 5.");
  assert.equal(say("tr", "guess.of", vars), "5 sorunun 1.");
});

/** What a file imports, as written: `kept` is false for `import type`, which is gone before a bundle is made. */
function importsOf(file: string): { from: string; kept: boolean }[] {
  const text = readFileSync(file, "utf8");
  const lines = [...text.matchAll(/^[ \t]*(?:import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm)].map((m) => ({ from: m[2]!, kept: !m[1] }));
  const calls = [...text.matchAll(/\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)].map((m) => ({ from: m[1]!, kept: true }));
  return [...lines, ...calls];
}

/** Everything a page's bundle holds, from one file down: the app's own files, and the packages they name. */
function bundleOf(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const walk = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    if (file.endsWith(".json")) return;
    for (const { from, kept } of importsOf(file)) {
      if (!kept) continue;
      if (!from.startsWith(".") && !from.startsWith("@/")) {
        packages.add(from);
        continue;
      }
      const base = from.startsWith("@/") ? resolve(SRC, from.slice(2)) : resolve(dirname(file), from);
      const found = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")].find((f) => existsSync(f) && /\.\w+$/.test(f));
      assert.ok(found, `${relative(SRC, file)} imports ${from}, which was not found`);
      walk(found);
    }
  };
  walk(entry);
  return { files: [...files].map((f) => relative(SRC, f)), packages: [...packages] };
}

test("the friend's page imports neither the planet nor the table of strings, itself or through another", () => {
  // The two files themselves, `import type` included: none of what the page used to name its moments with.
  const heavy = /^@echo\/|(^|\/)(i18n|calls|say|armWords|guessLink)(\.ts)?$/;
  for (const file of ["lib/knowable/guessPage.ts", "components/guess/GuessClient.tsx"]) {
    const named = importsOf(resolve(SRC, file)).map((i) => i.from);
    assert.ok(named.length >= 2, `${file}: its imports could not be read`);
    assert.deepEqual(named.filter((from) => heavy.test(from)), [], file);
  }
  assert.deepEqual(importsOf(resolve(SRC, "lib/knowable/guessPage.ts")).map((i) => i.from).sort(), ["./data/moments.json", "@/lib/lang"]);

  // And everything they bring with them, from the page down.
  const { files, packages } = bundleOf(resolve(SRC, "app/guess/page.tsx"));
  assert.ok(files.includes("lib/knowable/guessPage.ts") && files.includes("lib/knowable/data/moments.json") && files.includes("lib/lang.ts"), files.join(", "));
  assert.deepEqual(files.filter((f) => /^lib\/(i18n|knowable\/(calls|say|armWords|guessLink))\.ts$/.test(f)), []);
  assert.deepEqual(packages.filter((p) => p.startsWith("@echo/")), []);
  // The reader can find them: the same walk from the village's panel does reach the planet and the table.
  const village = bundleOf(resolve(SRC, "components/world/Envelopes.tsx"));
  assert.ok(village.packages.includes("@echo/planet") && village.files.includes("lib/i18n.ts"), "the walk no longer sees what it is there to refuse");
});

const ITEMS: Sent[] = [
  { k: "spilled-basket", a: null, c: "help", d: "help" },
  { k: "lost-purse", a: "many", c: "leave", d: "take-one" },
  { k: "fallen-elder", a: "onlookers", c: "help-up", d: "on" },
];
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

test("the page reads what the village wrote, whole, and anything else does not open", () => {
  const link: SentLink = { v: 1, n: "Artun", items: ITEMS };
  const text = encodeGuess(link);
  // What the page reads is what the village sent, to the compiler as well.
  const back: SentLink | null = decodeGuess(text);
  assert.deepEqual(back, link);
  assert.deepEqual(decodeGuess(`#${text}`), link);
  // A name with letters outside Latin-1 survives.
  assert.equal(decodeGuess(encodeGuess({ ...link, n: "Gülşah Çağrı" }))?.n, "Gülşah Çağrı");

  const tamper = (f: (l: SentLink) => unknown) => decodeGuess(encodeGuess(f(structuredClone(link)) as SentLink));
  assert.deepEqual(tamper((l) => l), link);
  assert.equal(decodeGuess(""), null);
  assert.equal(decodeGuess("#nonsense"), null);
  for (const json of ["null", "5", "[]", '"x"', "{}", "{not json"]) assert.equal(decodeGuess(b64(json)), null, json);
  assert.equal(tamper((l) => ({ ...l, v: 2 })), null);
  assert.equal(tamper((l) => ({ ...l, n: 5 })), null);
  assert.equal(tamper((l) => ({ ...l, items: "abc" })), null);
  assert.equal(tamper((l) => ({ ...l, items: l.items.slice(0, 2) })), null, "too few to be a game");
  assert.equal(tamper((l) => ((l.items[0]!.k = "not-a-moment" as never), l)), null);
  // A name every object answers to is not a moment, nor an arm.
  for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(tamper((l) => ((l.items[0]!.k = k as never), l)), null, k);
    assert.equal(tamper((l) => ((l.items[1]!.a = k), l)), null, k);
  }
  assert.equal(tamper((l) => ((l.items[0]!.d = "fly-away"), l)), null, "an ending the moment does not have");
  assert.equal(tamper((l) => ((l.items[0]!.c = "fly-away"), l)), null);
  assert.equal(tamper((l) => ((l.items[0]!.c = "told"), l)), null, "only the tale is told");
  assert.equal(tamper((l) => ((l.items[0]!.a = "nonsense"), l)), null, "an arm the moment does not have");
  assert.equal(tamper((l) => ((l.items[1]!.a = ["many"] as never), l)), null, "an arm that is not a word");
  assert.equal(tamper((l) => (delete (l.items[1] as Partial<Sent>).a, l)), null, "no arm said at all");
  assert.equal(tamper((l) => ((l.items[0]!.k = "bread-mother"), l)), null, "a kind never called");
  assert.equal(tamper((l) => ((l.items[2] = null as never), l)), null);
  // A long name is cut, not refused; nothing but the four fields rides along.
  const long = tamper((l) => ({ ...l, n: "x".repeat(200), extra: "y", items: l.items.map((i) => ({ ...i, z: 1 })) }));
  assert.equal(long?.n.length, 40);
  assert.deepEqual(Object.keys(long!), ["v", "n", "items"]);
  assert.deepEqual(Object.keys(long!.items[0]!), ["k", "a", "c", "d"]);

  // As many as the village sends, and no more or fewer.
  const many = (n: number) => decodeGuess(encodeGuess({ ...link, items: Array.from({ length: n }, (_, i) => ITEMS[i % ITEMS.length]!) }));
  assert.equal(many(GUESS_MIN - 1), null);
  assert.equal(many(GUESS_MIN)?.items.length, GUESS_MIN);
  assert.equal(many(GUESS_MAX)?.items.length, GUESS_MAX);
  assert.equal(many(GUESS_MAX + 1), null);
});

test("every link the village can write opens on the friend's page", () => {
  let opened = 0;
  for (const kind of MOMENT_KINDS) {
    const outs = Calls.outcomesOf(kind);
    for (const a of [null, ...armsOf(kind)])
      for (const c of outs)
        for (const d of outs) {
          const link: SentLink = { v: 1, n: "", items: [ITEMS[0]!, { k: kind, a, c, d }, ITEMS[2]!] };
          // Arms without words among them (the fishwife's one basket); never a kind that is not begun by itself.
          assert.deepEqual(decodeGuess(encodeGuess(link)), MOMENTS[kind].followUp ? null : link, `${kind}/${a}/${c}/${d}`);
          opened++;
        }
  }
  assert.ok(opened > 500, `only ${opened} links tried`);
});
