#!/usr/bin/env node
/**
 * The debt register has to be readable by whoever inherits it (SOCIETY-PLAN SOC-0.E).
 *
 * WHAT THIS EXISTS TO CATCH, stated as the failure. `docs/known-gaps.md` on `main` cited "⚑18's
 * eight" from a file whose headers ran 16b -> 19 -> 20: ⚑17 and ⚑18 had been written on
 * `feat/f4-trust` and ⚑21/⚑22 on `feat/measurement-corpus`, and neither branch was merged. So the
 * register on the only branch anyone reads was internally unresolvable, and ⚑17 — NPC-partner
 * versus human-partner construct validity, the single most relevant entry to a peopled world —
 * was invisible to any planner reading main. Merging the docs never required merging the code.
 *
 * Two rules, and both are about a reader rather than about a schema:
 *   1. ⚑-flag headers ascend. A register you cannot binary-search is a register nobody searches.
 *   2. Every ⚑N mentioned in the prose resolves to a header that exists in this file. This is the
 *      one that was broken, and it is the one that matters: a dangling cross-reference sends a
 *      reader looking for a decision that is not there and lets them conclude it was never taken.
 *
 * Run:  node scripts/check-register.mjs
 */
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/known-gaps.md";
const text = readFileSync(path, "utf8");
const lines = text.split("\n");

const defined = new Set();
for (const line of lines) {
  const m = /^## (?:⚑ )?(\d+b?)\./.exec(line);
  if (m) defined.add(m[1]);
}

const failures = [];

let previous = 0;
for (const line of lines) {
  const m = /^## ⚑ (\d+)b?\./.exec(line);
  if (!m) continue;
  const n = Number(m[1]);
  if (n < previous) failures.push(`out of order: ⚑${n} follows ⚑${previous}`);
  previous = Math.max(previous, n);
}

for (const raw of text.matchAll(/⚑\s?(\d+b?)/g)) {
  if (!defined.has(raw[1])) failures.push(`dangling reference: ⚑${raw[1]} is cited but has no header`);
}

const flags = [...defined].filter((d) => /^\d+b?$/.test(d));
if (failures.length > 0) {
  console.error(`${path}: ${failures.length} problem(s)`);
  for (const f of [...new Set(failures)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`${path}: ${lines.length} lines, ${flags.length} entries, every ⚑ reference resolves`);
