/**
 * How far people come (`lib/steps.ts`, `/api/steps`, DECISIONS C92): a number per day per step, nothing
 * of who; the page never waits on it and never learns whether it was counted.
 *
 * Run:  node --import tsx --test apps/web/tests/steps.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

import { isStep, step, STEPS } from "../src/lib/steps";

const route = await import("../src/app/api/steps/route");
const post = (body: unknown) => route.POST(new Request("http://x/api/steps", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

test("a step is one of a closed list, and the table would take every name on it", () => {
  assert.ok(STEPS.length >= 12);
  assert.equal(new Set(STEPS).size, STEPS.length);
  for (const s of STEPS) assert.ok(isStep(s) && /^[a-z_]{1,32}$/.test(s), s);
  for (const bad of ["", "LANDING", "drop table", 5, null, undefined, { step: "landing" }]) assert.equal(isStep(bad), false);
});

test("the route answers 204 whatever it is sent, counted or not, and keeps nothing where there is nowhere to keep it", async () => {
  for (const body of [{ step: "landing" }, { step: "nonsense" }, {}, "{not json", { step: 7 }]) {
    const res = await post(body);
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
  }
});

test("the numbers are the owner's: no token set, or the wrong one, and there is no such page", async () => {
  const get = (token?: string) => route.GET(new Request("http://x/api/steps", { headers: token ? { "x-pilot-admin": token } : {} }));
  delete process.env.ECHO_PILOT_ADMIN;
  assert.equal((await get()).status, 404);
  assert.equal((await get("anything-at-all")).status, 404);
  process.env.ECHO_PILOT_ADMIN = "short";
  assert.equal((await get("short")).status, 404, "a token too short to be one opened the door");
  process.env.ECHO_PILOT_ADMIN = "a-long-enough-token";
  assert.equal((await get()).status, 404);
  assert.equal((await get("a-long-enough-tokeN")).status, 404);
  // The right token, and nowhere to read from: it says so rather than pretending to zero.
  assert.equal((await get("a-long-enough-token")).status, 503);
  delete process.env.ECHO_PILOT_ADMIN;
});

test("a page counts a step once, sends only its name, and never throws", async () => {
  const sent: { url: string; body: string }[] = [];
  const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  // Not a browser: nothing is counted, nothing is sent.
  step("landing");
  g.window = {};
  g.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body) });
    throw new Error("offline");
  }) as never;
  try {
    step("landing");
    step("landing");
    step("walk_in");
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(sent, [
      { url: "/api/steps", body: '{"step":"landing"}' },
      { url: "/api/steps", body: '{"step":"walk_in"}' },
    ]);
  } finally {
    g.fetch = realFetch;
    delete g.window;
  }
});

test("the table holds a day, a name and a number, and nothing that could say who", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../../db/migrations/0041_steps.sql", import.meta.url)), "utf8");
  const table = /create table if not exists step_days \(([\s\S]*?)\n\);/.exec(sql)![1]!;
  const columns = [...table.matchAll(/^\s+(\w+) (?:date|text|integer)/gm)].map((m) => m[1]);
  assert.deepEqual(columns, ["day", "step", "n"]);
  assert.match(sql, /alter table step_days enable row level security;/);
  assert.match(sql, /revoke all on function step_hit\(text\) from public, anon, authenticated;/);
});
