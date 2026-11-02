/**
 * Moderation (DECISIONS C67): what an undo does and what it cannot, reports and their snapshots, the
 * moderators' gate, and a bar that keeps a stranger from changing the shared world.
 *
 * Run:  node --import tsx --test apps/web/tests/moderation.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { ageYears, goalId, present, villageAt, worldClock, worldDayIndex, WORLD_DAY_S, WORLD_EPOCH, type LifeChange, type SettledParcel } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { undoPlan, forgetBars } = await import("../src/lib/moderation");
const { POST: REPORT } = await import("../src/app/api/moderation/report/route");
const MOD = await import("../src/app/api/moderation/route");
const { POST: ACT } = await import("../src/app/api/world/act/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { resetMemoryStore, villageStore, MODERATION_SUBJECT } = await import("../src/lib/villageStore");
const { planet } = await import("../src/lib/planet");

const CELL = "843f6a1ffffffff";
const SECRET = "moderation-secret-aa";
const GRIEFER = "a0a0a0a0-1111-4222-8333-444455556667";
const REPORTER = "b0b0b0b0-1111-4222-8333-444455556667";
const MODERATOR = "c0c0c0c0-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const NOW = Math.round(CLOCK.epochMs + (DAY + 0.45) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, mods: process.env.ECHO_MODERATORS, fetch: globalThis.fetch, now: Date.now };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  process.env.ECHO_MODERATORS = ` ${MODERATOR} `;
  Date.now = () => NOW;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel], ["ECHO_MODERATORS", saved.mods]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  resetMemoryStore();
  forgetBars();
});

const village = (day = DAY, changes: readonly LifeChange[] = []): SettledParcel => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day, changes })!;
};
const as = (subject: string | null, body?: unknown) => ({
  method: body === undefined ? "GET" : "POST",
  headers: { "content-type": "application/json", ...(subject ? { authorization: `Bearer ${signIdentity(subject, SECRET, NOW)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// ── the plan ────────────────────────────────────────────────────────────────────

test("C67: an undo reverses plans the world's own way, withdraws what nobody has lived, lets go from today, and leaves history standing", () => {
  const today = 100;
  const c = (id: string, kind: LifeChange["kind"], day: number, extra: Partial<LifeChange> = {}): { cell: string; change: LifeChange } => ({ cell: "x", change: { id, person: `p-${id}`, kind, madeDay: Math.min(day, today - 1), day, ...extra } });
  const plan = undoPlan(
    {
      changes: [
        c("leave-planned", "leave", today + 5),
        c("leave-done", "leave", today - 2),
        c("pair-planned", "pair", today + 3, { target: "q" }),
        c("pair-done", "pair", today - 10, { target: "q" }),
        c("goal", "goal", today - 1, { goal: "own-boat" }),
        c("goal-about", "goal", today - 1, { goal: "look-after", target: "someone" }),
        c("trade", "trade", today - 4, { occupation: "miner" }),
        c("trade-same", "trade", today - 4, { occupation: "farmer" }),
        c("arrive-planned", "arrive", today + 2),
      ],
      marks: [
        { cell: "x", mark: { id: "e1", thing: "field:1", kind: "trampled", day: today - 1, untilDay: today + 3 } },
        { cell: "x", mark: { id: "e2", thing: "field:2", kind: "trampled", day: today - 9, untilDay: today - 2 } },
      ],
      deeds: [{ cell: "x", count: 4, wrongs: 3 }],
      home: { cell: "x" },
    },
    today,
    (_cell, person) => (person === "p-trade" ? "fisher" : "farmer"),
  );
  assert.deepEqual(plan.counter.map((x) => [x.change.person, x.change.kind, x.change.day, x.change.goalId ?? x.change.occupation ?? null]), [
    ["p-leave-planned", "stay", today, null],
    ["p-goal", "drop", today, goalId("own-boat", null, null)],
    ["p-goal-about", "drop", today, goalId("look-after", "someone", null)],
    ["p-trade", "trade", today + 1, "fisher"],
  ]);
  assert.deepEqual(plan.remove.map((r) => r.id).sort(), ["arrive-planned", "pair-planned"]);
  assert.deepEqual(plan.stands.map((r) => r.id).sort(), ["leave-done", "pair-done", "trade-same"]);
  assert.deepEqual(plan.heal.map((h) => h.id), ["e1"], "a healed mark healed again, or a fresh one left");
  assert.equal(plan.forgetDeeds, true);
  assert.equal(plan.removeHome, false, "a house taken down without the moderator saying so");
  for (const x of plan.counter) assert.ok(x.change.madeDay === today && x.change.day >= today, "a reversal dated into the past");
});

// ── the routes ──────────────────────────────────────────────────────────────────

/** A griefer's week in Senstrand: a planned leaving, a wish and a trade talked into people, marks, wrongs. */
async function grief() {
  const store = villageStore()!;
  const s = village().settlement;
  const adults = s.people.filter((p) => present(s, p, DAY) && ageYears(p, DAY) >= 25 && ageYears(p, DAY) < 50 && p.leftDay === Infinity);
  const [a, b, c] = adults;
  const leave = (await store.addChange(CELL, { person: a!.id, kind: "leave", madeDay: DAY - 1, day: DAY + 4 }, GRIEFER))!;
  const goal = (await store.addChange(CELL, { person: b!.id, kind: "goal", goal: "own-boat", madeDay: DAY - 2, day: DAY - 2 }, GRIEFER))!;
  const trade = (await store.addChange(CELL, { person: c!.id, kind: "trade", occupation: c!.occupation === "miner" ? "potter" : "miner", madeDay: DAY - 3, day: DAY - 2 }, GRIEFER))!;
  const mark = (await store.addEffect(CELL, { thing: "field:0", kind: "trampled", day: DAY - 1, untilDay: DAY + 5 }, GRIEFER))!;
  for (let i = 0; i < 3; i++) await store.addDeed(GRIEFER, CELL, { verb: "trample", kind: "field", thing: "field:0", thingName: "a field", reading: "harm", weight: 2, day: DAY - 1, hour: 0.5, witnesses: [], owners: [] });
  // The reporter has done something here too, which their own report must not name.
  await store.addEffect(CELL, { thing: "field:1", kind: "tended", day: DAY - 1, untilDay: DAY + 2 }, REPORTER);
  return { a: a!, b: b!, c: c!, leave, goal, trade, mark };
}

test("C67: a report keeps who left what there, never the reporter; only moderators read it; a stranger with no identity is heard too", async () => {
  await grief();
  assert.equal((await REPORT(new Request("https://echo.test/api/moderation/report", as(REPORTER, { cell: CELL, reason: "ruining", note: "Half the village says they are leaving." })))).status, 200);
  assert.equal((await REPORT(new Request("https://echo.test/api/moderation/report", as(null, { cell: CELL, reason: "offensive" })))).status, 200);
  assert.equal((await REPORT(new Request("https://echo.test/api/moderation/report", as(REPORTER, { cell: CELL, reason: "because" })))).status, 400);
  // Not a moderator, or nobody: nothing.
  assert.equal((await MOD.GET(new Request("https://echo.test/api/moderation", as(REPORTER)))).status, 403);
  assert.ok([401, 403].includes((await MOD.GET(new Request("https://echo.test/api/moderation", as(null)))).status));
  const res = await MOD.GET(new Request("https://echo.test/api/moderation", as(MODERATOR)));
  assert.equal(res.status, 200);
  const { reports } = (await res.json()) as { reports: { reporter: string | null; reason: string; note: string | null; snapshot: { subject: string; changes: unknown[]; marks: unknown[]; deeds: number; wrongs: number }[] }[] };
  assert.equal(reports.length, 2);
  const mine = reports.find((r) => r.reporter === REPORTER)!;
  assert.equal(mine.note, "Half the village says they are leaving.");
  assert.deepEqual(mine.snapshot.map((t) => [t.subject, t.changes.length, t.marks.length, t.deeds, t.wrongs]), [[GRIEFER, 3, 1, 3, 3]], "the reporter's own traces in their report");
  const anon = reports.find((r) => r.reporter === null)!;
  assert.ok(anon.snapshot.some((t) => t.subject === REPORTER), "a stranger with no identity cannot have their own traces left out");
});

test("C67: undone, the planned leaving is cancelled with a stay, the wish dropped, the trade given back, the mark healed, the deeds forgotten — and Senstrand's past is the same past", async () => {
  const g = await grief();
  const store = villageStore()!;
  const beforeChanges = (await store.changesFor(CELL))!;
  const yesterday = village(DAY - 1, beforeChanges).settlement;
  // A preview first: nothing done yet.
  const preview = (await (await MOD.GET(new Request(`https://echo.test/api/moderation?subject=${GRIEFER}`, as(MODERATOR)))).json()) as { plan: { counter: unknown[]; heal: unknown[]; remove: unknown[] } };
  assert.deepEqual([preview.plan.counter.length, preview.plan.heal.length], [3, 1]);
  assert.equal((await store.changesFor(CELL))!.length, beforeChanges.length, "a preview changed the world");
  const res = await MOD.POST(new Request("https://echo.test/api/moderation", as(MODERATOR, { op: "undo", subject: GRIEFER })));
  assert.equal(res.status, 200, await res.clone().text());
  const after = (await store.changesFor(CELL))!;
  const by = (p: string, k: string) => after.filter((x) => x.person === p && x.kind === k);
  assert.equal(by(g.a.id, "stay").length, 1);
  assert.equal(by(g.b.id, "drop")[0]?.goalId, goalId("own-boat", null, null));
  assert.equal(by(g.c.id, "trade").at(-1)?.occupation, g.c.occupation);
  const v = village(DAY + 6, after).settlement;
  const a = v.people.find((p) => p.id === g.a.id)!;
  assert.equal(a.leftDay, Infinity, "they left anyway");
  assert.equal(v.people.find((p) => p.id === g.c.id)!.trades.at(-1)?.occupation, g.c.occupation);
  assert.ok(!((await store.effectsFor(CELL, DAY)) ?? []).some((e) => e.id === g.mark.id), "the mark still there");
  assert.deepEqual(await store.deedsFor(GRIEFER, CELL), []);
  // The reversals are the moderators', and their own are never a stranger's traces to undo.
  assert.ok(!((await store.tracesIn(CELL, 0)) ?? []).some((t) => t.subject === MODERATION_SUBJECT));
  // L2: yesterday, as everyone saw it, is yesterday still.
  const again = village(DAY - 1, after).settlement;
  // Only what had happened by then: a leaving still planned for later was a plan, not the past.
  const face = (s: typeof yesterday) =>
    s.people
      .filter((p) => p.birthDay <= DAY - 1)
      .map((p) => `${p.id}:${p.deathDay}:${p.partnerDay !== null && p.partnerDay <= DAY - 1 ? p.partner : "-"}:${p.leftDay <= DAY - 1 ? p.leftDay : "-"}:${p.trades.filter((t) => t.day <= DAY - 1).map((t) => t.occupation).join("/")}`)
      .join("|");
  assert.equal(face(again), face(yesterday), "an undo moved the past");
  // Logged, by whom, with what was done.
  const { log } = (await (await MOD.GET(new Request("https://echo.test/api/moderation", as(MODERATOR)))).json()) as { log: { moderator: string; subject: string; action: string; detail: Record<string, number> }[] };
  assert.deepEqual([log[0]!.moderator, log[0]!.subject, log[0]!.action, log[0]!.detail.countered, log[0]!.detail.healed], [MODERATOR, GRIEFER, "undo", 3, 1]);
  assert.equal((await MOD.POST(new Request("https://echo.test/api/moderation", as(MODERATOR, { op: "undo", subject: MODERATOR })))).status, 409, "a moderator undoing themself");
  assert.equal((await MOD.POST(new Request("https://echo.test/api/moderation", as(REPORTER, { op: "undo", subject: GRIEFER })))).status, 403);
});

test("C67: barred, a stranger changes nothing — no act, no talk — until the bar is lifted", async () => {
  const s = village().settlement;
  const someone = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) > 20)!;
  const actBody = { cell: CELL, thing: `villager:${someone.id}`, kind: "villager", verb: "talk", at: { x: 0, y: 0 } };
  const act = () => ACT(new Request("https://echo.test/api/world/act", as(GRIEFER, actBody)));
  assert.notEqual((await act()).status, 403);
  const bar = await MOD.POST(new Request("https://echo.test/api/moderation", as(MODERATOR, { op: "bar", subject: GRIEFER, days: 3, reason: "trampling" })));
  assert.equal(bar.status, 200);
  const refused = await act();
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as { error: string }).error, "barred");
  const talk = await BEGIN(new Request("https://echo.test/api/village/talk/begin", as(GRIEFER, { cell: CELL, person: someone.id, at: { x: 0, y: 0 } })));
  assert.deepEqual([talk.status, ((await talk.json()) as { error: string }).error], [403, "barred"], "refused talk, but not for being barred");
  // Anyone else is untouched.
  assert.notEqual((await ACT(new Request("https://echo.test/api/world/act", as(REPORTER, actBody)))).status, 403);
  assert.equal((await MOD.POST(new Request("https://echo.test/api/moderation", as(MODERATOR, { op: "lift", subject: GRIEFER })))).status, 200);
  assert.notEqual((await act()).status, 403);
});

test("C67: what a reporter filed and a bar on them go with an erasure; what moderators did stays answerable, nameless", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(src, /\["moderation_reports", "reporter"\]/);
  assert.match(src, /\["barred_subjects", "subject"\]/);
  assert.match(src, /USER_NAMED[\s\S]*\["moderation_actions", "subject"\]/);
  assert.ok(worldDayIndex(CLOCK, NOW) === DAY);
});
