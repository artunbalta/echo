/**
 * A visitor's record of envelopes, made by the app's own code, for `envelopes.spec.ts`.
 *
 * Not a spec. The runner compiles spec files to CJS and `@echo/planet` is ESM only (see demoUrl.ts),
 * so the spec cannot import the library that seals a call; it runs this file with tsx and reads what
 * it prints. That way the record the page is handed was sealed by the same code the page checks it
 * with, and there is no second copy of how a seal is spelled.
 *
 * Run:  node --import tsx apps/web/tests/e2e/envelopeBook.mts [tampered]
 */
import { emptyBook, sealMoment, settle } from "../../src/lib/knowable/envelopes";

const at = (s: number) => `2026-11-12T03:00:${String(s).padStart(2, "0")}.000Z`;

let book = emptyBook();
// A short walk: a basket helped with, a nine-coin purse a coin was taken from, an old man walked past
// with others watching, a honey stall never seen, the basket again, a greeting answered, a tale stayed for.
book = await sealMoment(book, { ref: "e2e:moment:a", kind: "spilled-basket", arm: null }, at(1));
book = settle(book, { ref: "e2e:moment:a", kind: "spilled-basket", outcome: "help" });
book = await sealMoment(book, { ref: "e2e:moment:b", kind: "lost-purse", arm: "many" }, at(9));
book = settle(book, { ref: "e2e:moment:b", kind: "lost-purse", outcome: "take-one" });
book = await sealMoment(book, { ref: "e2e:moment:c", kind: "fallen-elder", arm: "onlookers" }, at(20));
book = settle(book, { ref: "e2e:moment:c", kind: "fallen-elder", outcome: "passed" });
book = await sealMoment(book, { ref: "e2e:moment:d", kind: "honey-stall", arm: "eye" }, at(31));
book = await sealMoment(book, { ref: "e2e:moment:e", kind: "spilled-basket", arm: null }, at(40));
book = settle(book, { ref: "e2e:moment:e", kind: "spilled-basket", outcome: "help" });
book = await sealMoment(book, { ref: "e2e:moment:f", kind: "greeting", arm: "high" }, at(48));
book = settle(book, { ref: "e2e:moment:f", kind: "greeting", outcome: "greet-warm" });
book = await sealMoment(book, { ref: "e2e:moment:g", kind: "unfinished-tale", arm: "short-pause" }, at(55));
book = settle(book, { ref: "e2e:moment:g", kind: "unfinished-tale", outcome: "told" });

// The same record with one miss rewritten as a hit after the fact: the purse's call changed to what was done.
if (process.argv[2] === "tampered") book = { ...book, chain: book.chain.map((e) => (e.ref === "e2e:moment:b" ? { ...e, call: "take-one" } : e)) };

process.stdout.write(JSON.stringify(book));
