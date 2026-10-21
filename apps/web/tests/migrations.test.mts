/**
 * What db/migrations declares, read as text, for the two defects that only a real Postgres showed
 * (DECISIONS C70). These tests run on the in-process store, which enforces no check and builds no
 * index, so neither defect could fail anything here until the folder itself was read.
 *
 * Run:  node --import tsx --test apps/web/tests/migrations.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../../../db/migrations/", import.meta.url);
const FILES = readdirSync(DIR)
  .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
  .sort()
  .map((f) => ({ f, sql: readFileSync(new URL(f, DIR), "utf8").replace(/--[^\n]*/g, "") }));

/** Every `create index`, in the order the runner applies them, with its definition normalised. */
function indexes() {
  const out: { f: string; name: string; def: string }[] = [];
  const re = /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+([^;]+);/gi;
  for (const { f, sql } of FILES) {
    for (const m of sql.matchAll(re)) out.push({ f, name: m[2]!.toLowerCase(), def: `${m[1] ? "unique " : ""}${m[3]!.replace(/\s+/g, " ").trim().toLowerCase()}` });
  }
  return out;
}

/**
 * Names already declared twice with different definitions, in files that are applied and cannot be
 * edited. Each is listed with what superseded it; anything new here is a defect.
 */
const KNOWN: Record<string, string> = {
  // 0019 made it on (subject); 0023 asked for (subject, updated_at desc) under the same name, and
  // `if not exists` skipped it. 0032 built that one as villager_memories_subject_recent_idx.
  villager_memories_subject_idx: "0032_heal_today_and_recent_index.sql",
};

test("no index name is declared twice with two different definitions: `if not exists` would keep the first and skip the second", () => {
  const byName = new Map<string, Set<string>>();
  for (const i of indexes()) byName.set(i.name, (byName.get(i.name) ?? new Set()).add(i.def));
  const clashes = [...byName].filter(([name, defs]) => defs.size > 1 && !(name in KNOWN));
  assert.deepEqual(
    clashes.map(([name, defs]) => `${name}: ${[...defs].join(" | ")}`),
    [],
    "a second definition under a name already taken is silently skipped by Postgres; give the new index its own name",
  );
  for (const [name, by] of Object.entries(KNOWN)) {
    assert.ok((byName.get(name)?.size ?? 0) > 1, `${name} no longer clashes; take it out of KNOWN`);
    assert.ok(FILES.some((x) => x.f === by), `${name} says ${by} superseded it, and there is no such file`);
  }
});

test("the newest-first index metBy reads is built under a name of its own", () => {
  const recent = indexes().filter((i) => i.def === "villager_memories (subject, updated_at desc)");
  assert.ok(recent.length > 0, "nothing builds villager_memories (subject, updated_at desc)");
  const builds = recent.filter((i) => !(i.name in KNOWN));
  assert.ok(builds.length > 0, "every (subject, updated_at desc) declaration uses a name that was already taken, so none of them is built");
});

test("a mark can be healed on the day it was made: the last word on world_effects' days allows until_day = day", () => {
  const checks: { f: string; op: string }[] = [];
  for (const { f, sql } of FILES) for (const m of sql.matchAll(/until_day\s*(>=|>)\s*day\b/gi)) checks.push({ f, op: m[1]! });
  assert.ok(checks.length > 0, "no check on world_effects' days found at all; this test has lost its subject");
  const last = checks[checks.length - 1]!;
  // C67's undo heals a mark by setting until_day to today (lib/moderation.ts applyUndo, store.healMark),
  // and for a mark made today that is until_day = day. With `>` the database refuses it.
  assert.equal(last.op, ">=", `${last.f} leaves the check at until_day ${last.op} day, which refuses a mark healed the day it was made`);
});
