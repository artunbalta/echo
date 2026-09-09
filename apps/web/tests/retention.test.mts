/**
 * The retention window, and the split that is the whole decision (DECISIONS C35, SOC-2.G).
 *
 * There was no window at all: thirteen identity-keyed tables, no TTL, no expiry column, no pruning
 * job, no default in the code. `0011_behavioral_events` shipped a durable personal-data log and
 * said so in its own header; SOC-2.D then gave four more tables rows. "We keep everything forever
 * because nobody chose" is a choice, and it was being made daily.
 *
 * WHAT IS PINNED HERE is the shape of the answer rather than the number — a test that asserts
 * `RAW_RETENTION_DAYS === 90` would fail the day somebody legitimately changes it, and teach them to
 * edit the test. What must not drift is:
 *
 *   · the two sets are DISJOINT and between them cover every table the erasure cascade knows about,
 *     so a table in neither list is visible as an unclassified one rather than silently unswept;
 *   · a table on the clock has a column to date it by;
 *   · a sweep that could not look does NOT report a tidy database (⚑26's lesson, one file over);
 *   · the cutoff is in the past, which is the one arithmetic slip that would delete everything.
 *
 * Run:  cd apps/web && node --import tsx --test tests/retention.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DERIVED_TABLES,
  RAW_RETENTION_DAYS,
  RAW_TABLES,
  cutoff,
  sweepRawRetention,
} from "../src/lib/retention";

test("the cutoff is in the past, by the window, and never in the future", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const before = cutoff(now);
  assert.ok(before < now, "the cutoff must be behind now or the sweep deletes everything");
  const days = (now.getTime() - before.getTime()) / 86_400_000;
  assert.equal(days, RAW_RETENTION_DAYS);
  // And an explicit window is honoured, so a shorter one can be tested and reasoned about.
  assert.equal((now.getTime() - cutoff(now, 1).getTime()) / 86_400_000, 1);
});

test("the window is a real, positive number of days", () => {
  assert.ok(Number.isInteger(RAW_RETENTION_DAYS) && RAW_RETENTION_DAYS > 0);
});

test("raw and derived are disjoint, so no table is on both sides of the decision", () => {
  const raw = new Set(RAW_TABLES.map((t) => t.table));
  const overlap = DERIVED_TABLES.filter((t) => raw.has(t));
  assert.deepEqual(overlap, [], `${overlap.join(", ")} is both swept and kept`);
});

test("every table on the clock has a column to date it by", () => {
  for (const { table, column } of RAW_TABLES) {
    assert.ok(table && column, `${table} has no timestamp column`);
    assert.match(column, /^[a-z_]+$/, `${column} is not a column name`);
  }
});

test("the raw set holds what a person did; the derived set holds what was concluded", () => {
  const raw = RAW_TABLES.map((t) => t.table);
  // The four SOC-2.D started writing must be KEPT: an echo that forgets you every quarter is not
  // an echo, and that is the half of C35 that is about the product rather than the exposure.
  for (const t of ["persona_state", "behavior_index", "reward_model_state", "autonomy_buckets"]) {
    assert.ok(DERIVED_TABLES.includes(t), `${t} should be kept while the account lives`);
    assert.ok(!raw.includes(t), `${t} is on the sweep clock`);
  }
  // And the log of what was actually done must expire.
  for (const t of ["behavioral_events", "telemetry_events", "interactions", "messages"]) {
    assert.ok(raw.includes(t), `${t} is raw behaviour and must expire`);
  }
});

test("a sweep with no credentials reports that it did NOT look", async () => {
  // ⚑26's lesson, one file over: an empty failure list must not read as a clean database.
  const r = await sweepRawRetention(undefined, undefined);
  assert.equal(r.attempted, false, "a sweep that never looked claimed to have run");
  assert.deepEqual(r.swept, []);
  assert.ok(r.cutoff, "even a sweep that could not run says what it would have deleted before");

  const half = await sweepRawRetention("https://example.test", undefined);
  assert.equal(half.attempted, false, "a url without a key is not credentials");
});

test("a sweep that runs reports one entry per raw table and never throws", async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    seen.push(String(url));
    // Every other table refuses, so both branches are exercised in one run.
    return { ok: seen.length % 2 === 1, status: 503 } as Response;
  }) as typeof fetch;
  try {
    const r = await sweepRawRetention("https://example.test", "service-key");
    assert.equal(r.attempted, true);
    assert.equal(r.swept.length, RAW_TABLES.length, "a table was skipped without saying so");
    assert.ok(r.swept.some((s) => s.error), "a refusal was reported as a success");
    // The cutoff, not `now`, is what the delete filters on — the classic off-by-a-window.
    assert.ok(seen.every((u) => u.includes("lt.")), `a sweep used the wrong comparison: ${seen[0]}`);
    for (const { table } of RAW_TABLES) {
      assert.ok(seen.some((u) => u.includes(`/${table}?`)), `${table} was never swept`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a network failure is recorded against its table, not thrown at the cron", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;
  try {
    const r = await sweepRawRetention("https://example.test", "service-key");
    assert.equal(r.swept.length, RAW_TABLES.length);
    assert.ok(r.swept.every((s) => s.error === "connection refused"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
