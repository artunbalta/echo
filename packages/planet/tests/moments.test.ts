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
  LANE_KINDS,
  MOMENT,
  MOMENT_KINDS,
  MOMENTS,
  armOf,
  eggLine,
  eggsOf,
  entryPoint,
  errandHouse,
  fieldSpot,
  houseSpot,
  momentAt,
  momentFits,
  momentPass,
  momentSpot,
  doorSpot,
  nextMoment,
  openGround,
  passerPath,
  seaSpot,
  seaWithin,
  shoreSpot,
  waysideSpot,
  type MomentGround,
  type MomentLane,
} from "../lib/moments.js";
import { doorOf } from "../lib/schedule.js";

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

test("C86, C87: in each stream every moment comes once (a greeting thrice) before any comes again, in an order of the person's own", () => {
  for (const lane of ["people", "passer", "wayside"] as MomentLane[]) {
    const kinds = LANE_KINDS[lane];
    assert.ok(kinds.length >= 6, `${lane}: only ${kinds.length} kinds`);
    for (const seed of ["a", "b", "c"]) {
      const first = Array.from({ length: kinds.length }, (_, n) => momentAt(seed, n, lane));
      assert.deepEqual([...first].sort(), [...kinds].sort(), `${seed}/${lane}: a round is not every moment once`);
      const second = Array.from({ length: kinds.length }, (_, n) => momentAt(seed, n + kinds.length, lane));
      assert.deepEqual([...second].sort(), [...kinds].sort());
      assert.deepEqual(first, Array.from({ length: kinds.length }, (_, n) => momentAt(seed, n, lane)), "the same on every reload");
    }
  }
  // Every kind is in exactly one stream, or is only ever the second part of another.
  for (const kind of MOMENT_KINDS) {
    const def = MOMENTS[kind];
    const dealt = LANE_KINDS[def.lane].filter((k) => k === kind).length;
    assert.equal(dealt, def.followUp ? 0 : (def.weight ?? 1), `${kind} is dealt ${dealt} times a round`);
  }
  assert.equal(LANE_KINDS.passer.filter((k) => k === "greeting").length, 3, "a greeting is commoner than a quarrel");
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
  // In the dead of night only the night's own do: a hen got out, stars falling (C86); a man lying on the
  // path, someone crying alone (C87).
  for (let n = 0; n < 24; n++) {
    const night = nextMoment("seed", n, 0.05, atWell, plan)!;
    assert.ok(night && ["loose-hen", "falling-stars", "banging-door", "drunk-or-ill", "crying-alone"].includes(night.kind), `${night?.kind} at one in the morning`);
  }
  // A kind the caller has just had is passed over.
  const first = nextMoment("seed", 0, 0.45, far, plan)!;
  const other = nextMoment("seed", 0, 0.45, far, plan, "people", null, (k) => k === first.kind)!;
  assert.notEqual(other.kind, first.kind);
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

test("C87: an experiment's arms: each arm is met first by about as many strangers, and one stranger meets them all in turn", () => {
  for (const kind of MOMENT_KINDS) {
    const arms = MOMENTS[kind].arms;
    if (!arms) {
      assert.equal(armOf("x", kind, 0), null);
      continue;
    }
    assert.equal(new Set(arms.map((a) => a.id)).size, arms.length, `${kind}: two arms with one name`);
    const firsts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const a = armOf(`stranger-${i}`, kind, 0)!;
      firsts.set(a.id, (firsts.get(a.id) ?? 0) + 1);
    }
    for (const a of arms) {
      const share = (firsts.get(a.id) ?? 0) / 600;
      assert.ok(Math.abs(share - 1 / arms.length) < 0.08, `${kind}/${a.id} is met first by ${(share * 100).toFixed(0)}% of strangers`);
    }
    // One stranger, meeting it as many times as it has arms, meets every arm once.
    for (const seed of ["p", "q", "r"]) {
      const met = Array.from({ length: arms.length }, (_, k) => armOf(seed, kind, k)!.id);
      assert.deepEqual([...met].sort(), arms.map((a) => a.id).sort(), `${kind}: ${seed} does not meet every arm`);
    }
  }
});

test("C87: every new moment names the paradigm it is; an errand names how it ends, and a second part is never begun by itself", () => {
  for (const kind of MOMENT_KINDS) {
    const def = MOMENTS[kind];
    assert.ok(def.paradigm.length > 2, `${kind} cites nothing`);
    if (def.paradigm !== "C86") assert.match(def.paradigm, /\d{4}|cues? [A-K]\d+/, `${kind}: "${def.paradigm}" names no study and no cue`);
    for (const arm of def.arms ?? []) {
      for (const [k, v] of Object.entries(arm.context ?? {})) {
        if (k === "audience_size") assert.ok(typeof v === "number" && v >= 0 && v <= 8);
        else if (k === "time_pressure") assert.ok(typeof v === "number" && v >= 0 && v <= 1);
        else assert.ok(["counterpart_status", "stakes", "public_or_private"].includes(k), `${kind}/${arm.id}: ${k} is no context field`);
      }
    }
    if (def.errand) {
      assert.ok(verbsOf(kind).some((v) => v.id === def.errand!.on), `${kind}: its errand begins on a verb it does not have`);
      if (def.errand.kind === "carry") {
        assert.ok(def.errand.deliver && MOMENTS[def.errand.deliver].followUp, `${kind}: carried to nobody`);
      }
    }
  }
  assert.ok(!LANE_KINDS.people.includes("catch-share") && !LANE_KINDS.people.includes("bread-mother"));
});

test("C87: the shore, the sea, a house's side, a field's edge: each is set where it says, near the stranger", () => {
  assert.ok(plan.dock, "the test village is by the sea");
  // Along the shore near the dock: a shore moment is set on dry ground with the water beside it.
  const dock = plan.dock!.root;
  let shores = 0;
  let seas = 0;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const at = { x: dock.x + Math.cos(a) * 12, y: dock.y + Math.sin(a) * 12 };
    if (!openGround(ground, at.x, at.y)) continue;
    const toSea = Math.atan2(0 - at.y, 467 - at.x);
    const s = shoreSpot(at, toSea, `sh${i}`, ground);
    if (s) {
      shores++;
      assert.ok(openGround(ground, s.x, s.y) && seaWithin(ground, s, MOMENT.shoreWaterM), "a shore moment away from the water, or in it");
      const d = Math.hypot(s.x - at.x, s.y - at.y);
      assert.ok(d >= MOMENT.shoreM[0] - 1e-9 && d <= MOMENT.shoreM[1] + 1e-9);
    }
    const w = seaSpot(at, toSea, `se${i}`, ground);
    if (w) {
      seas++;
      assert.ok(SHORE.heightAt(w.x, w.y) < -0.5, "dolphins on dry land");
    }
    assert.equal(momentFits("asch-boats", 0.5, at, plan, ground), true, "a shore moment does not fit beside the dock");
  }
  assert.ok(shores > 5 && seas > 5, `${shores} shore and ${seas} sea places by the dock`);
  assert.equal(momentFits("asch-boats", 0.5, { x: plan.centre.x - 300, y: plan.centre.y }, plan, ground), false, "a shore moment far inland");
  assert.equal(momentFits("asch-boats", 0.5, dock, plan, null), false, "a shore moment with no ground to know the shore by");
  // Beside a house: at its gable, near the stranger.
  const at = { x: plan.centre.x + 4, y: plan.centre.y + 3 };
  const h = houseSpot(at, 0, plan, ground);
  assert.ok(h, "no house near the green");
  assert.ok(plan.plots.some((p) => Math.abs(Math.hypot(h!.x - p.x, h!.y - p.y) - (p.widthM / 2 + 1.1)) < 1e-6), "not at a house's side");
  assert.equal(houseSpot(at, 0, plan, ground, () => false), null, "a woodpile by a house nobody lives in");
  // At a field's edge.
  const f0 = plan.fields[0];
  if (f0) {
    const near = { x: f0.x + Math.cos(f0.heading) * (f0.lengthM / 2 + 8), y: f0.y + Math.sin(f0.heading) * (f0.lengthM / 2 + 8) };
    const f = fieldSpot(near, f0.heading + Math.PI, plan, ground);
    if (f) {
      const r = Math.hypot(f.x - near.x, f.y - near.y);
      assert.ok(r >= MOMENT.besideM[0] && r <= MOMENT.besideM[1]);
      assert.ok(openGround(ground, f.x, f.y));
    }
  }
});

test("C87: something lying by the way is ahead and apart; someone coming along passes a stride to the side; an errand goes to another house", () => {
  let set = 0;
  let passed = 0;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const at = { x: plan.centre.x + Math.cos(a) * 40, y: plan.centre.y + Math.sin(a) * 40 };
    if (!openGround(ground, at.x, at.y)) continue;
    const heading = a + Math.PI / 2;
    const other = { x: at.x + Math.cos(heading + 0.6) * 14, y: at.y + Math.sin(heading + 0.6) * 14 };
    const w = waysideSpot(at, heading, `w${i}`, ground, [other]);
    if (w) {
      set++;
      const d = Math.hypot(w.x - at.x, w.y - at.y);
      assert.ok(d >= MOMENT.wayside.aheadM[0] - 1e-9 && d <= MOMENT.wayside.aheadM[1] + 1e-9, `set ${d.toFixed(1)} m away`);
      const off = Math.atan2(Math.sin(Math.atan2(w.y - at.y, w.x - at.x) - heading), Math.cos(Math.atan2(w.y - at.y, w.x - at.x) - heading));
      assert.ok(Math.abs(off) <= Math.PI * 0.2 + 1e-9, "not ahead");
      assert.ok(Math.hypot(w.x - other.x, w.y - other.y) >= MOMENT.wayside.apartM, "on top of another");
    }
    const p = passerPath(at, heading, `p${i}`, ground);
    if (p) {
      passed++;
      assert.ok(Math.abs(Math.hypot(p.meet.x - at.x, p.meet.y - at.y) - MOMENT.passer.sideM) < 1e-6, "passes too near or too far");
      const ahead = (p.from.x - at.x) * Math.cos(heading) + (p.from.y - at.y) * Math.sin(heading);
      assert.ok(ahead > MOMENT.passer.startM[0] * 0.8, "sets out from behind the stranger");
      const behind = (p.to.x - at.x) * Math.cos(heading) + (p.to.y - at.y) * Math.sin(heading);
      assert.ok(behind < -MOMENT.passer.endM * 0.8, "does not go on past");
    }
    const head = passerPath(at, heading, `p${i}`, ground, 0);
    if (head) assert.ok(Math.hypot(head.meet.x - at.x, head.meet.y - at.y) < 1e-9, "someone who walks straight into you passes beside you");
  }
  assert.ok(set > 20 && passed > 20, `${set} wayside, ${passed} passers`);
  const at = { x: plan.centre.x + 2, y: plan.centre.y };
  const door = doorOf(plan.plots[0]!);
  const e = errandHouse(at, door, plan, "e1");
  if (e) {
    const r = Math.hypot(e.x - at.x, e.y - at.y);
    assert.ok(r >= MOMENT.errandM[0] && r <= MOMENT.errandM[1], `an errand ${r.toFixed(0)} m away`);
    assert.ok(Math.hypot(e.x - door.x, e.y - door.y) > 6, "an errand to the house it began at");
  }
  assert.equal(errandHouse(at, door, plan, "e1", () => false), null);
});
