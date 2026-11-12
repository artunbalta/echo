/**
 * The echo's calls, their seals, and the envelopes (`lib/knowable/{calls,seal,envelopes}.ts`,
 * DECISIONS C89): what the echo says a stranger will do at a moment before they meet it, that the call
 * cannot be changed afterwards, and that only a moment seen and settled is ever counted.
 *
 * Run:  node --import tsx --test apps/web/tests/calls.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MOMENT_KINDS, MOMENTS, verbsOf, type MomentKind } from "@echo/planet";

import { actsOf, callFor, FAMILIES, FAMILY_NAMES, familyOf, ON, outcomeClass, outcomesOf, STABILITY, tally, wasAct, wordsCall, type Look, type Opened } from "../src/lib/knowable/calls";
import { asOpened, BOOK_KEY, emptyBook, forget, loadBook, looksOf, openAll, opened, saveBook, sealMoment, settle, waiting } from "../src/lib/knowable/envelopes";
import { brokenAt, GENESIS, seal, type SealBody } from "../src/lib/knowable/seal";

const look = (kind: MomentKind, outcome: string): Look => ({ kind, outcome });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test("the families are the registered analysis's, verb for verb", () => {
  // One list in two languages (L5): the Python the paper's analysis runs, and this.
  const py = readFileSync(fileURLToPath(new URL("../../../research/pilot/echo_pilot/moments.py", import.meta.url)), "utf8");
  const block = py.slice(py.indexOf("FAMILIES: dict"), py.indexOf("def moments_of"));
  const theirs: Record<string, Record<string, string[]>> = {};
  for (const fam of block.matchAll(/"(\w+)": \{([\s\S]*?)\n    \},|"(\w+)": \{(.*?)\},\n/g)) {
    const name = fam[1] ?? fam[3]!;
    const body = fam[2] ?? fam[4]!;
    theirs[name] = Object.fromEntries([...body.matchAll(/"([\w-]+)": frozenset\(\{([^}]*)\}\)/g)].map((m) => [m[1]!, [...m[2]!.matchAll(/"([\w-]+)"/g)].map((v) => v[1]!).sort()]));
  }
  const ours = Object.fromEntries(FAMILY_NAMES.map((f) => [f, Object.fromEntries(Object.entries(FAMILIES[f]).map(([k, v]) => [k, [...(v as readonly string[])].sort()]))]));
  assert.deepEqual(ours, theirs);
  assert.equal(Object.keys(theirs).length, 6);
});

test("every family's act is something its moment can end in", () => {
  for (const f of FAMILY_NAMES)
    for (const [kind, acts] of Object.entries(FAMILIES[f]) as [MomentKind, readonly string[]][]) {
      assert.ok(MOMENTS[kind], kind);
      for (const a of acts) assert.ok(outcomesOf(kind).includes(a), `${kind} cannot end in ${a}`);
      assert.equal(familyOf(kind), f);
    }
});

test("a moment ends in one of its verbs or in walking on, and the record's words are read as that", () => {
  for (const kind of MOMENT_KINDS) {
    const outs = outcomesOf(kind);
    assert.equal(outs[outs.length - 1], ON);
    assert.equal(new Set(outs).size, outs.length);
    for (const v of verbsOf(kind)) assert.equal(outcomeClass(kind, v.id), MOMENTS[kind].followUp ? null : v.id);
    if (MOMENTS[kind].followUp) continue;
    for (const o of ["passed", "left", "expired", "none"]) assert.equal(outcomeClass(kind, o), ON);
    // Still going as the page closed, or an errand's own ending: nothing a call can be held to.
    for (const o of ["open", "kept", "broken", "arrived", "gone", "nonsense"]) assert.equal(outcomeClass(kind, o), null);
  }
  assert.equal(outcomeClass("unfinished-tale", "told"), "told");
  assert.equal(outcomeClass("spilled-basket", "told"), null);
  // The far end of an errand is never begun by itself, so it is never called.
  assert.equal(outcomeClass("bread-mother", "give-bread"), null);
});

test("with nothing seen the call is a coin's, and it says so", () => {
  for (const kind of MOMENT_KINDS) {
    const c = callFor([], kind);
    assert.deepEqual(c.looks, { same: 0, family: 0, anywhere: 0 });
    near(Object.values(c.dist).reduce((s, x) => s + x, 0), 1);
    near(c.dist[ON]!, 0.5);
    near(c.chance, 1 / outcomesOf(kind).length);
    // One thing to do: done or not is even, and the heat goes to doing it. More than one: walking on leads.
    assert.equal(c.outcome, verbsOf(kind).length === 1 && kind !== "unfinished-tale" ? verbsOf(kind)[0]!.id : ON);
  }
});

test("what the echo expects of the family's act agrees with its call, also at an even heat", () => {
  // Where every verb is the family's act (a greeting, tea, the tale) a first look is even: walking on
  // leads, so the call is walking on, and "expects the act" must not say yes beside it.
  for (const kind of ["greeting", "tea-invite", "unfinished-tale"] as const) {
    const c = callFor([], kind);
    assert.equal(c.outcome, ON);
    assert.equal(c.act, false, `${kind}: called walking on and expected the act`);
  }
  // And once it expects them to answer, both say so.
  const c = callFor([look("greeting", "nod"), look("greeting", "greet-warm")], "greeting");
  assert.notEqual(c.outcome, ON);
  assert.equal(c.act, true);
});

test("one look at the same moment moves the call ρ of the way, as the debrief's echo does", () => {
  for (const [kind, verb] of [["spilled-basket", "help"], ["ball-game", "to-alone"], ["musician", "listen"]] as const) {
    const before = 1 - callFor([look("campfire", ON)], kind).dist[ON]!;
    const after = 1 - callFor([look("campfire", ON), look(kind, verb)], kind).dist[ON]!;
    // The one new look is also one more look anywhere, so compare with the prior it would have had.
    const a0 = (1 - STABILITY.anywhere) / STABILITY.anywhere;
    const prior = (a0 * 0.5 + 1) / (a0 + 2);
    near(after - prior, STABILITY.same * (1 - prior));
    assert.ok(after > before);
  }
  // n looks: nρ / (nρ + 1 − ρ) of the way.
  const three = [look("woodpile", ON), look("woodpile", ON), look("woodpile", ON)];
  const c = callFor(three, "woodpile");
  assert.equal(c.outcome, ON);
  assert.deepEqual(c.looks, { same: 3, family: 0, anywhere: 3 });
  assert.ok(c.p > 0.9);
});

test("what was seen at a family's other moments carries to one never met", () => {
  const walksPast = (["fallen-elder", "spilled-basket", "stuck-cart", "heavy-jugs", "caught-lamb"] as const).map((k) => look(k, ON));
  const stops = [look("fallen-elder", "help-up"), look("spilled-basket", "help"), look("stuck-cart", "push"), look("heavy-jugs", "carry"), look("caught-lamb", "free-lamb")];
  const a = callFor(walksPast, "crying-alone");
  const b = callFor(stops, "crying-alone");
  assert.equal(a.outcome, ON);
  assert.equal(a.act, false);
  assert.equal(b.outcome, "sit-with");
  assert.equal(b.act, true);
  assert.deepEqual(b.looks, { same: 0, family: 5, anywhere: 5 });
  // And it carries less to a moment of no family than to one of its own.
  assert.ok(1 - callFor(stops, "ball-game").dist[ON]! < 1 - b.dist[ON]!);
});

test("which way a decision goes is learned across the family's decisions", () => {
  const honest = [look("lost-purse", "leave"), look("wrong-basket", "not-mine"), look("honey-stall", "one-jar")];
  const takes = [look("lost-purse", "take-all"), look("wrong-basket", "take-it"), look("honey-stall", "three-jars")];
  assert.equal(callFor(honest, "knucklebones").outcome, "say-true");
  assert.equal(callFor(honest, "knucklebones").act, true);
  assert.equal(callFor(takes, "knucklebones").outcome, "say-tava");
  assert.equal(callFor(takes, "knucklebones").act, false);
  // What was done here before outweighs the family.
  assert.equal(callFor([...honest, look("knucklebones", "say-tava")], "knucklebones").outcome, "say-tava");
});

test("on strangers who are steady, the echo learns; on coins, it cannot", () => {
  // Simulated people (a rehearsal, never a result): each has a share for doing anything at a family's
  // moments; `steady` people keep theirs, coins have one half everywhere.
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const kinds = MOMENT_KINDS.filter((k) => !MOMENTS[k].followUp);
  const run = (steady: boolean) => {
    let firstHit = 0, firstN = 0, laterHit = 0, laterN = 0, chance = 0;
    for (let person = 0; person < 150; person++) {
      const share = Object.fromEntries([...FAMILY_NAMES, "none"].map((f) => [f, steady ? (rnd() < 0.5 ? 0.12 : 0.88) : 0.5]));
      const history: Look[] = [];
      for (let i = 0; i < 40; i++) {
        const kind = kinds[Math.floor(rnd() * kinds.length)]!;
        const call = callFor(history, kind);
        const verbs = outcomesOf(kind).filter((o) => o !== ON);
        const did = rnd() < share[familyOf(kind) ?? "none"]! ? verbs[0]! : ON;
        const hit = call.outcome === did ? 1 : 0;
        if (call.looks.family + call.looks.same === 0) (firstHit += hit), firstN++;
        else if (call.looks.family + call.looks.same >= 3) (laterHit += hit), laterN++, (chance += call.chance);
        history.push(look(kind, did));
      }
    }
    return { first: firstHit / firstN, later: laterHit / laterN, chance: chance / laterN };
  };
  const steady = run(true);
  const coins = run(false);
  assert.ok(steady.later > 0.8, `steady people, three looks in: ${steady.later.toFixed(3)}`);
  assert.ok(steady.later > steady.first + 0.15, `learning: ${steady.first.toFixed(3)} -> ${steady.later.toFixed(3)}`);
  assert.ok(steady.later > steady.chance + 0.3);
  assert.ok(Math.abs(coins.later - 0.5) < 0.04, `nothing to learn from a coin: ${coins.later.toFixed(3)}`);
});

test("a person's own words call the family's act or its absence, and nothing else", () => {
  assert.equal(wordsCall({ help: "yes" }, "fallen-elder"), true);
  assert.equal(wordsCall({ help: "no" }, "fallen-elder"), false);
  assert.equal(wordsCall({ help: "depends" }, "fallen-elder"), null);
  assert.equal(wordsCall({ help: "yes" }, "lost-purse"), null);
  assert.equal(wordsCall({ help: "yes", honesty: "yes" }, "ball-game"), null);
  assert.equal(wasAct("lost-purse", "leave"), true);
  assert.equal(wasAct("lost-purse", "take-one"), false);
  assert.equal(wasAct("lost-purse", ON), false);
  assert.equal(wasAct("greeting", "nod"), true);
  assert.equal(wasAct("ball-game", "to-alone"), null);
  for (const f of FAMILY_NAMES) for (const kind of Object.keys(FAMILIES[f]) as MomentKind[]) assert.ok(actsOf(kind).length > 0);
});

test("the count holds words and echo to the same moments and the same question", () => {
  const rows: Opened[] = [
    { kind: "fallen-elder", call: "help-up", chance: 0.5, act: true, words: true, crowd: "help-up", twin: null, did: "help-up" },
    { kind: "lost-purse", call: ON, chance: 0.25, act: false, words: true, crowd: "leave", twin: null, did: "take-one" },
    { kind: "greeting", call: "greet-warm", chance: 1 / 3, act: true, words: null, crowd: "nod", twin: null, did: "nod" },
    { kind: "ball-game", call: ON, chance: 1 / 3, act: null, words: null, crowd: null, twin: null, did: ON },
  ];
  const t = tally(rows);
  assert.equal(t.n, 4);
  assert.equal(t.echo, 2); // the elder, and the ball game left alone
  near(t.chance, 0.5 + 0.25 + 1 / 3 + 1 / 3);
  // Only the elder and the purse had both: the echo read both right (helped; not the honest thing), the words one.
  assert.deepEqual(t.both, { n: 2, echo: 2, words: 1 });
  // The village's count spoke at three of the four: it had the elder and the greeting, the echo only the elder.
  assert.deepEqual(t.crowd, { n: 3, echo: 1, crowd: 2 });
  assert.deepEqual(tally([]), { n: 0, echo: 0, chance: 0, both: { n: 0, echo: 0, words: 0 }, crowd: { n: 0, echo: 0, crowd: 0 }, twin: { n: 0, echo: 0, twin: 0 } });
});

// ── seals ──────────────────────────────────────────────────────────────────────

const body = (n: number, over: Partial<SealBody> = {}): SealBody => ({ n, ref: `moment:t|people|${n}`, kind: "spilled-basket", arm: null, call: "help", p: 0.5, chance: 0.5, act: true, words: null, crowd: null, twin: null, looks: { same: 0, family: 0, anywhere: n }, at: `2026-11-12T03:00:0${n}.000Z`, ...over });

test("a chain of seals is whole, and any change after the fact breaks it where it was made", async () => {
  const chain = [];
  let prev = GENESIS;
  for (let i = 0; i < 5; i++) {
    const s = await seal(prev, body(i));
    chain.push(s);
    prev = s.hash;
  }
  assert.equal(await brokenAt(chain), null);
  assert.equal(await brokenAt([]), null);
  assert.match(chain[0]!.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(chain[0]!.hash, chain[1]!.hash);

  // The call changed once the outcome was known.
  assert.equal(await brokenAt(chain.map((s, i) => (i === 2 ? { ...s, call: ON } : s))), 2);
  // What most people did, rewritten to flatter the echo.
  assert.equal(await brokenAt(chain.map((s, i) => (i === 4 ? { ...s, crowd: ON } : s))), 4);
  // The hour moved.
  assert.equal(await brokenAt(chain.map((s, i) => (i === 3 ? { ...s, at: "2026-11-12T02:00:00.000Z" } : s))), 3);
  // A miss dropped from the middle.
  assert.equal(await brokenAt(chain.filter((_, i) => i !== 1)), 1);
  // A chain that does not start where chains start.
  assert.equal(await brokenAt([{ ...chain[0]!, prev: "f".repeat(64) }, ...chain.slice(1)]), 0);
  // Its oldest let go: still whole from the first it kept.
  assert.equal(await brokenAt(chain.slice(2)), null);
});

// ── envelopes ──────────────────────────────────────────────────────────────────

test("an envelope is sealed as a moment begins, settled when it was seen, and counted only once opened", async () => {
  let book = emptyBook();
  book = await sealMoment(book, { ref: "moment:a", kind: "spilled-basket", arm: null }, "2026-11-12T03:00:00.000Z");
  book = await sealMoment(book, { ref: "moment:b", kind: "lost-purse", arm: "many" }, "2026-11-12T03:00:05.000Z");
  // The same moment again changes nothing; the errand's far end is never sealed.
  book = await sealMoment(book, { ref: "moment:a", kind: "spilled-basket", arm: null }, "2026-11-12T03:00:06.000Z");
  book = await sealMoment(book, { ref: "moment:m", kind: "bread-mother", arm: null }, "2026-11-12T03:00:07.000Z");
  assert.equal(book.chain.length, 2);
  assert.equal(await brokenAt(book.chain), null);
  assert.deepEqual(waiting(book), []);
  assert.deepEqual(looksOf(book), []);
  assert.equal(book.chain[1]!.arm, "many");

  // The basket was seen and helped with; the purse was never seen, so nothing is ever said of it.
  book = settle(book, { ref: "moment:a", kind: "spilled-basket", outcome: "help" });
  assert.deepEqual(looksOf(book), [{ kind: "spilled-basket", outcome: "help" }]);
  assert.equal(waiting(book).length, 1);
  assert.equal(opened(book).length, 0);
  // Settled once: a second word about it changes nothing. Neither does one about a moment never sealed.
  assert.equal(settle(book, { ref: "moment:a", kind: "spilled-basket", outcome: "passed" }), book);
  assert.equal(settle(book, { ref: "moment:zz", kind: "litter", outcome: "tidy" }), book);
  // Still going as the page closed: left sealed.
  assert.equal(settle(book, { ref: "moment:b", kind: "lost-purse", outcome: "open" }), book);

  // The next call is made from what was settled, and its seal follows the chain.
  book = await sealMoment(book, { ref: "moment:c", kind: "spilled-basket", arm: null }, "2026-11-12T03:01:00.000Z");
  assert.deepEqual(book.chain[2]!.looks, { same: 1, family: 0, anywhere: 1 });
  assert.equal(book.chain[2]!.call, "help");
  assert.ok(book.chain[2]!.p > book.chain[0]!.p);
  assert.equal(await brokenAt(book.chain), null);

  book = openAll(book);
  assert.deepEqual(waiting(book), []);
  assert.equal(opened(book).length, 1);
  assert.deepEqual(tally(opened(book).map(asOpened)), { n: 1, echo: 1, chance: 0.5, both: { n: 0, echo: 0, words: 0 }, crowd: { n: 0, echo: 0, crowd: 0 }, twin: { n: 0, echo: 0, twin: 0 } });
  // Opening changed no seal.
  assert.equal(await brokenAt(book.chain), null);
});

test("words given before the walk ride in the seal; given after, they cannot reach back", async () => {
  let book = emptyBook();
  book = await sealMoment(book, { ref: "moment:a", kind: "fallen-elder", arm: "alone" }, "2026-11-12T03:00:00.000Z");
  book = { ...book, words: { help: "no", honesty: "yes" } };
  book = await sealMoment(book, { ref: "moment:b", kind: "stuck-cart", arm: null }, "2026-11-12T03:00:09.000Z");
  book = await sealMoment(book, { ref: "moment:c", kind: "ball-game", arm: null }, "2026-11-12T03:00:19.000Z");
  assert.equal(book.chain[0]!.words, null);
  assert.equal(book.chain[1]!.words, false);
  assert.equal(book.chain[2]!.words, null);
  // The words are under the seal with the call.
  assert.equal(await brokenAt(book.chain.map((e, i) => (i === 1 ? { ...e, words: true } : e))), 1);
});

test("the envelopes are kept in the browser, survive a bad record, and are gone when forgotten", async () => {
  const kept = new Map<string, string>();
  const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  assert.deepEqual(loadBook(storage), emptyBook());
  let book = await sealMoment(emptyBook(), { ref: "moment:a", kind: "litter", arm: "clean" }, "2026-11-12T03:00:00.000Z");
  book = { ...settle(book, { ref: "moment:a", kind: "litter", outcome: "tidy" }), words: { order: "yes" } };
  saveBook(book, storage);
  assert.deepEqual(loadBook(storage), book);
  kept.set(BOOK_KEY, "{not json");
  assert.deepEqual(loadBook(storage), emptyBook());
  kept.set(BOOK_KEY, JSON.stringify({ v: 7, chain: "x" }));
  assert.deepEqual(loadBook(storage), emptyBook());
  saveBook(book, storage);
  forget(storage);
  assert.equal(kept.has(BOOK_KEY), false);
  assert.deepEqual(loadBook(null), emptyBook());
});
