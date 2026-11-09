/**
 * Moments and hidden things (`lib/moments.ts`, DECISIONS C86): which comes when and where, against the
 * same hand-written grounds as `schedule.test.ts`, and that everything a moment measures by walking past
 * it is read by ingest.py (C7) and named in the cue catalogue.
 *
 * Run:  node --import tsx --test packages/planet/tests/moments.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { settlementAt, type SettlementGeography } from "../lib/society.js";
import { villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";
import { inVillage, PILOT_SITUATIONS, SITUATIONS } from "../lib/director.js";
import { verbsOf } from "../lib/affordances.js";
import {
  EGG_KINDS,
  MOMENT,
  MOMENT_KINDS,
  MOMENTS,
  eggLine,
  eggsOf,
  entryPoint,
  momentAt,
  momentFits,
  momentPass,
  momentSpot,
  doorSpot,
  nextMoment,
  openGround,
  type MomentGround,
} from "../lib/moments.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };

function village(prefix: string) {
  for (let i = 0; i < 400; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, COAST, 0);
    const plan = s && villagePlan(s, SHORE, SHORE_SITE);
    if (s && plan && s.people.filter((p) => p.birthDay <= 0 && p.deathDay > 0).length >= 10) return { s, plan };
  }
  throw new Error("no village");
}

const { plan } = village("moments");
const ground: MomentGround = { height: SHORE.heightAt, plan };
const catalog = readFileSync(new URL("../../../docs/world-design/cue-catalog.md", import.meta.url), "utf8");
const ingest = readFileSync(new URL("../../../services/ml/echo_ml/ingest.py", import.meta.url), "utf8");

test("C86: every moment comes once before any comes twice, in an order of the person's own", () => {
  for (const seed of ["a", "b", "c"]) {
    const first = Array.from({ length: MOMENT_KINDS.length }, (_, n) => momentAt(seed, n));
    assert.deepEqual([...first].sort(), [...MOMENT_KINDS].sort(), `${seed}: a round is not every moment once`);
    const second = Array.from({ length: MOMENT_KINDS.length }, (_, n) => momentAt(seed, n + MOMENT_KINDS.length));
    assert.deepEqual([...second].sort(), [...MOMENT_KINDS].sort());
    assert.deepEqual(first, Array.from({ length: MOMENT_KINDS.length }, (_, n) => momentAt(seed, n)), "the same on every reload");
  }
  assert.notDeepEqual(
    Array.from({ length: 7 }, (_, n) => momentAt("a", n)),
    Array.from({ length: 7 }, (_, n) => momentAt("b", n)),
    "two people meet them in the same order",
  );
});

test("C86: a moment happens only in its hours and its place, and the next that fits is found", () => {
  const far = { x: plan.centre.x + 200, y: plan.centre.y };
  const atWell = { x: plan.centre.x + 3, y: plan.centre.y };
  assert.equal(momentFits("well-queue", 0.45, far, plan), false, "a line at the well, away from the well");
  assert.equal(momentFits("well-queue", 0.45, atWell, plan), true);
  assert.equal(momentFits("village-dance", 0.45, atWell, plan), false, "a ring dance at noon");
  assert.equal(momentFits("village-dance", 0.78, atWell, plan), true);
  assert.equal(momentFits("spilled-basket", 0.02, far, plan), false, "apples spilled at two in the morning");
  // At noon, far from the well and the green, the rotation skips to what can happen there.
  for (let n = 0; n < 20; n++) {
    const next = nextMoment("seed", n, 0.45, far, plan)!;
    assert.ok(next, "nothing at all fits at noon in the fields");
    assert.equal(MOMENTS[next.kind].where, "ahead");
    assert.ok(next.n > n);
  }
  // In the dead of night only the night's own do: a hen got out, stars falling (C86).
  for (let n = 0; n < 12; n++) {
    const night = nextMoment("seed", n, 0.05, atWell, plan)!;
    assert.ok(night && ["loose-hen", "falling-stars", "banging-door"].includes(night.kind), `${night?.kind} at one in the morning`);
  }
  assert.equal(momentFits("falling-stars", 0.45, far, plan), false, "falling stars at noon");
  assert.equal(momentFits("falling-stars", 0.95, far, plan), true, "the hours run over midnight");
  assert.equal(momentFits("loose-hen", 0.5, far, plan), false);
});

test("C86: a moment ahead is set in front of the stranger, on open ground, clear of what the director set out", () => {
  let set = 0;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const at = { x: plan.centre.x + Math.cos(a) * 30, y: plan.centre.y + Math.sin(a) * 30 };
    if (!openGround(ground, at.x, at.y)) continue;
    const heading = a + Math.PI / 2;
    // Something the director set out right ahead: nothing is set beside it.
    assert.equal(momentSpot(at, heading, `s${i}`, ground, { x: at.x + Math.cos(heading) * 8, y: at.y + Math.sin(heading) * 8 }), null);
    // And one behind the stranger leaves the way ahead free.
    const staging = { x: at.x - Math.cos(heading) * 10, y: at.y - Math.sin(heading) * 10 };
    const spot = momentSpot(at, heading, `s${i}`, ground, staging);
    if (!spot) continue;
    set++;
    const d = Math.hypot(spot.x - at.x, spot.y - at.y);
    assert.ok(d >= MOMENT.aheadM[0] - 1e-9 && d <= MOMENT.aheadM[1] + 1e-9, `set ${d.toFixed(1)} m away`);
    const off = Math.atan2(Math.sin(Math.atan2(spot.y - at.y, spot.x - at.x) - heading), Math.cos(Math.atan2(spot.y - at.y, spot.x - at.x) - heading));
    assert.ok(Math.abs(off) <= Math.PI * 0.23, `set ${((off * 180) / Math.PI).toFixed(0)}° off the way ahead`);
    assert.ok(openGround(ground, spot.x, spot.y), "set on a house, the well or the water");
    assert.ok(Math.hypot(spot.x - staging.x, spot.y - staging.y) >= MOMENT.clearOfStagingM, "set beside what the director set out");
    const entry = entryPoint(spot, at, `s${i}`, ground);
    assert.ok(Math.hypot(entry.x - spot.x, entry.y - spot.y) > 5, "its people do not walk in from where it is");
  }
  assert.ok(set > 20, `only ${set} of the ring's places took a moment`);
});

test("C86: the door that bangs is a house's own, near, and ahead when one is", () => {
  const at = { x: plan.centre.x + 2, y: plan.centre.y + 2 };
  for (let k = 0; k < 8; k++) {
    const heading = (k / 8) * Math.PI * 2;
    const door = doorSpot(at, heading, plan);
    assert.ok(door, "no door within reach of the green");
    const r = Math.hypot(door.x - at.x, door.y - at.y);
    assert.ok(r >= MOMENT.doorM[0] && r <= MOMENT.doorM[1], `a door ${r.toFixed(1)} m away`);
    assert.ok(plan.plots.some((p) => Math.abs(p.facing - door.facing) < 1e-9), "faces no house's way");
  }
  assert.equal(doorSpot({ x: plan.centre.x + 500, y: plan.centre.y }, 0, plan), null, "a door out in the fields");
  // Only a lived-in house's door: with none lived in, none bangs.
  assert.equal(doorSpot(at, 0, plan, () => false), null, "a ruin's door banging");
  const one = plan.plots[3]!;
  const only = doorSpot(at, 0, plan, (p) => p === one);
  assert.ok(only === null || Math.abs(only.facing - one.facing) < 1e-9, "a door of a house that was ruled out");
  assert.equal(momentFits("banging-door", 0.95, at, plan), true);
  assert.equal(momentFits("banging-door", 0.95, { x: plan.centre.x + 500, y: plan.centre.y }, plan), false);
});

test("C86: walking past is noticed near and counted only once far", () => {
  assert.deepEqual(momentPass(false, 12), { near: false, passed: false });
  assert.deepEqual(momentPass(false, 6), { near: true, passed: false });
  assert.deepEqual(momentPass(true, 15), { near: true, passed: false });
  assert.deepEqual(momentPass(true, 25), { near: true, passed: true });
  assert.deepEqual(momentPass(false, 25), { near: false, passed: false }, "never seen, never passed");
});

test("C86: no moment is one of the pilot's six, and each is read by ingest.py under a catalogued cue", () => {
  const six = new Set(PILOT_SITUATIONS.map((id) => SITUATIONS[id].kind as string));
  const sixLabels = new Set(PILOT_SITUATIONS.flatMap((id) => verbsOf(SITUATIONS[id].kind).map((v) => v.measure.action)));
  const cues = new Set([...catalog.matchAll(/\*\*([A-K]\d+)\*\*/g)].map((x) => x[1]));
  for (const kind of MOMENT_KINDS) {
    assert.ok(!six.has(kind));
    const verbs = verbsOf(kind);
    assert.ok(verbs.length > 0, `${kind} has no verb`);
    for (const v of verbs) {
      assert.equal(v.measure.route, "named", `${kind}/${v.id} is not read by name`);
      assert.ok(!sixLabels.has(v.measure.action), `${kind}/${v.id} is sent under a label of the six (${v.measure.action})`);
    }
    const passed = MOMENTS[kind].passed;
    if (passed) {
      assert.ok(new RegExp(`"${passed.action}"`).test(ingest), `${kind}: walking past is sent as "${passed.action}", which ingest.py does not read`);
      assert.ok(cues.has(passed.cue), `${kind}: ${passed.cue} is not in the catalogue`);
      assert.equal(passed.channel, passed.cue[0]);
    }
  }
});

test("C86: a village hides its things outside its houses and fields, apart, each on the ground it needs, the same every time", () => {
  const eggs = eggsOf("v1", ground);
  assert.deepEqual(eggs, eggsOf("v1", ground), "not the same twice");
  assert.ok(eggs.length >= 6, `only ${eggs.length} hidden things`);
  for (const kind of EGG_KINDS) if (kind !== "message-bottle") assert.ok(eggs.some((e) => e.kind === kind), `no ${kind}`);
  assert.ok(plan.dock, "the test village is by the sea");
  assert.ok(eggs.some((e) => e.kind === "message-bottle"), "a coastal village with no bottle on its shore");
  assert.equal(new Set(eggs.map((e) => e.id)).size, eggs.length);
  for (const e of eggs) {
    assert.ok(e.kind === "message-bottle" ? SHORE.heightAt(e.x, e.y) > 0 : openGround(ground, e.x, e.y), `${e.id} is in the water or on something`);
    assert.ok(!inVillage(plan, e.x, e.y, 2), `${e.id} is inside the village's own things`);
    for (const f of eggs) if (f !== e) assert.ok(Math.hypot(f.x - e.x, f.y - e.y) > 14, `${e.id} and ${f.id} are on top of each other`);
    assert.ok(eggLine(e).length > 10);
    assert.ok(verbsOf(e.kind).length > 0);
  }
  const lookout = eggs.find((e) => e.kind === "lookout-rock")!;
  const others = eggs.filter((e) => e.kind !== "lookout-rock" && e.kind !== "message-bottle");
  assert.ok(others.every((e) => SHORE.heightAt(e.x, e.y) <= SHORE.heightAt(lookout.x, lookout.y) + 3), "the lookout is not on high ground");
  assert.notDeepEqual(eggs.map((e) => [e.x, e.y]), eggsOf("v2", ground).map((e) => [e.x, e.y]), "every village hides them in the same places");
});
