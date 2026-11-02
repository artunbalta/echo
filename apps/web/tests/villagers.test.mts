/**
 * The village's people and lights on the client (DECISIONS C41): the pieces that are pure enough to
 * test without a GL context — the window light's curve, the nameplate's sentence, the crowd's yaw
 * convention and its instance bookkeeping.
 *
 * Run:  node --import tsx --test apps/web/tests/villagers.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import type { LifeEvent, Person } from "@echo/planet";
import { windowLight } from "../src/game/world/settlementLayer";
import { lifeLine } from "../src/game/world/villagersLayer";
import { Crowd, lookFor } from "../src/game/world/crowd";

test("windows are dark by day, lit through the night, and do not switch on in one frame", () => {
  assert.equal(windowLight(0.5), 0);
  assert.equal(windowLight(0.4), 0);
  assert.equal(windowLight(0.0), 1);
  assert.equal(windowLight(0.9), 1);
  assert.ok(windowLight(0.75) > 0 && windowLight(0.75) < 1, "dusk should be part-way");
  assert.ok(windowLight(0.245) > 0 && windowLight(0.245) < 1, "dawn should be part-way");
  for (let t = 0.6; t < 0.85; t += 0.005) assert.ok(windowLight(t + 0.005) >= windowLight(t) - 1e-12, "the evening ramp goes backwards");
});

const ev = (kind: LifeEvent["kind"], day: number, other?: string, detail: string | null = null): LifeEvent => ({
  key: `${kind}/${day}`,
  day,
  kind,
  subject: "me",
  with: other ? [other] : [],
  detail,
});
const names = new Map([["a", "Haim"], ["b", "Meirnas"], ["c", "Jeir"]]);

test("a nameplate says the most telling thing, in English a person would say", () => {
  const day = 365 * 50;
  assert.equal(lifeLine([ev("married", day - 365 * 15, "a")], day, names), "Married to Haim for 15 years.");
  assert.equal(lifeLine([ev("married", day - 100, "a")], day, names), "Married to Haim this past year.");
  // Widowhood outranks the marriage it ended.
  assert.equal(
    lifeLine([ev("married", day - 365 * 40, "a"), ev("widowed", day - 365 * 7, "a")], day, names),
    "Widowed 7 years ago; Haim lies in the graveyard.",
  );
  // A child lost long ago stops being the first thing said.
  assert.equal(lifeLine([ev("married", day - 365 * 30, "a"), ev("child-died", day - 365 * 3, "b")], day, names), "Lost a child, Meirnas, 3 years ago.");
  assert.equal(lifeLine([ev("married", day - 365 * 60, "a"), ev("child-died", day - 365 * 40, "b")], day, names), "Married to Haim for 60 years.");
  assert.equal(lifeLine([ev("learned-trade", day - 365 * 20, "c", "fisher")], day, names), "Learned the trade from Jeir.");
  assert.equal(lifeLine([], day, names), "Born here, and has never lived anywhere else.");
  // Nothing from the future is told.
  assert.equal(lifeLine([ev("widowed", day + 10, "a")], day, names), "Born here, and has never lived anywhere else.");
});

test("the crowd's yaw is the schedule's heading plus a quarter turn: walking east faces east", () => {
  // The rig faces +z. A local heading h (0 east, π/2 north) is three's (cos h, -sin h) in x-z.
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const yaw = h + Math.PI / 2;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    assert.ok(Math.abs(forward.x - Math.cos(h)) < 1e-9 && Math.abs(forward.z + Math.sin(h)) < 1e-9, `heading ${h}`);
  }
});

test("a crowd places what it is asked to and hides every instance it was not", () => {
  const crowd = new Crowd(5, 1.6);
  const look = lookFor("someone", "fisher", 40);
  crowd.begin();
  for (let i = 0; i < 3; i++) crowd.pose({ x: i, y: 0, z: 0, yaw: 0, activity: "walk", speed: 0.8, time: 1, phase0: 0 }, look);
  crowd.end();
  assert.equal(crowd.placed(), 3);
  const thigh = crowd.meshes.get("thigh")!;
  const m = new THREE.Matrix4();
  // Three bodies are six thighs, instances 0-5; the seventh is the first that should be hidden.
  thigh.getMatrixAt(6, m);
  assert.ok(m.elements.every((e) => e === 0 || e === 1) && m.elements[0] === 0, "instance 6 (a fourth body's thigh) should be hidden");
  thigh.getMatrixAt(5, m);
  assert.ok(Math.abs(m.determinant()) > 1e-6, "instance 5 (the third body's right thigh) should be placed");
  thigh.getMatrixAt(0, m);
  assert.ok(m.elements.every(Number.isFinite) && Math.abs(m.determinant()) > 1e-6, "a placed thigh has a real transform");
  // More bodies than it holds: the rest are dropped, never written past the end.
  crowd.begin();
  for (let i = 0; i < 9; i++) crowd.pose({ x: i, y: 0, z: 0, yaw: 0, activity: "sit", speed: 0, time: 1, phase0: 0 }, look);
  crowd.end();
  assert.equal(crowd.placed(), 5);
  crowd.dispose();
});

test("children are small, the old are grey and stooped, and nobody is dressed in violet", () => {
  const child = lookFor("kid", "farmer", 7);
  const adult = lookFor("kid", "farmer", 35);
  const elder = lookFor("kid", "farmer", 80);
  assert.ok(child.scale < adult.scale * 0.85);
  assert.ok(elder.stoop > 0 && adult.stoop === 0);
  assert.equal(elder.hair.getHex(), new THREE.Color(0x9a958c).getHex());
  for (const trade of ["fisher", "farmer", "smith", "trader", "healer", "weaver", "miner"]) {
    const hsl = { h: 0, s: 0, l: 0 };
    lookFor(`p/${trade}`, trade, 30).cloth.getHSL(hsl);
    // Echo violet is h ≈ 0.75; the art bible keeps it for live humans.
    assert.ok(Math.abs(hsl.h - 0.75) > 0.06 || hsl.s < 0.15, `${trade} is dressed in violet`);
  }
});

test("C44: a changed village is swapped in without a rebuild, and the change moves that person's evening", async () => {
  // The server's planet, for the same village the server builds; "server-only" is a no-op here.
  const { createRequire } = await import("node:module");
  const require_ = createRequire(import.meta.url);
  const SERVER_ONLY = require_.resolve("server-only");
  require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;
  const { planet } = await import("../src/lib/planet");
  const P = await import("@echo/planet");
  const { villagersLayer } = await import("../src/game/world/villagersLayer");
  const clock = P.worldClock(P.WORLD_EPOCH);
  const { field, calibration, commons, world } = planet();
  const cell = "843f6a1ffffffff";
  // A dry day, pinned: a wet evening is cut short (C48), so on the real clock this test failed on any
  // stormy day — it did, on day 4966. The layer reads the clock, so the clock is what is pinned.
  const probe = P.villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day: 4960 })!;
  let day = 4960;
  while (!["clear", "cloudy"].includes(P.weatherOn(world.seed, cell, probe.settlement.geography, day, probe.settlement).kind)) day++;
  const realNow = Date.now;
  Date.now = () => clock.epochMs + (day + 0.3) * P.WORLD_DAY_S * 1000;
  const v0 = P.villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day })!;
  const s = v0.settlement;
  // Someone grown, with a parent of sixty-five or more living in another house.
  const people = P.residentsOn(s, v0.plan, day);
  const homeOf = new Map(people.map((r) => [r.person.id, r.plot.index]));
  let pick: { me: Person; elder: Person } | null = null;
  for (const { person: me } of people) {
    if (P.ageYears(me, day) < 20 || P.ageYears(me, day) >= 60 || me.parents === null) continue;
    const elder = me.parents.map((i) => s.people[i]).find((q) => P.present(s, q, day) && P.ageYears(q, day) >= 65 && homeOf.get(q.id) !== homeOf.get(me.id));
    if (elder) {
      pick = { me, elder };
      break;
    }
  }
  assert.ok(pick, "nobody in Senstrand has an old parent in another house");
  const verdict = P.checkChange(s, pick.me, day, { kind: "goal", goal: "look-after", target: pick.elder.id }, []);
  assert.ok(verdict.ok);
  const change = { id: "c000000000001", ...verdict.change };
  const v1 = P.villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day, changes: [change] })!;

  const layer = villagersLayer({ clock });
  const ctx = { region: { village: v0 }, frame: {}, scene: new THREE.Scene(), renderer: { domElement: { parentElement: null } } };
  await layer.build(ctx as never, new AbortController().signal);
  const evening = () => layer.plans().find((d) => d.person === pick!.me.id)!.stays.find((st) => st.t0 > 0.55 && st.t1 > 0.75)!.at;
  const before = evening();
  layer.apply(v1);
  const after = evening();
  const door = P.doorOf(people.find((r) => r.person.id === pick!.elder.id)!.plot);
  assert.ok(Math.hypot(after.x - door.x, after.y - door.y) < 2, `after the change the evening is ${Math.hypot(after.x - door.x, after.y - door.y).toFixed(1)} m from ${pick.elder.given}'s door`);
  assert.ok(Math.hypot(before.x - door.x, before.y - door.y) > 2, "the evening was at the door before anyone decided anything");
  layer.dispose?.();
  Date.now = realNow;
});

test("women wear dresses and their hair long, men neither — and it costs instances, not draw calls", () => {
  const woman = lookFor("w", "fisher", 34, "f");
  const man = lookFor("w", "fisher", 34, "m");
  const girl = lookFor("g", "farmer", 6, "f");
  const baby = lookFor("b", "farmer", 1, "f");
  assert.ok(woman.skirt && woman.longHair, "a woman in trousers with cropped hair");
  assert.ok(!man.skirt && !man.longHair);
  assert.ok(girl.skirt && girl.longHair, "a girl of six dressed as a boy");
  assert.ok(!baby.skirt, "a baby in a skirt");
  const crowd = new Crowd(4, 1.6);
  assert.equal(crowd.meshes.size, 9, "a dress or long hair added a mesh, and a draw call with it");
  crowd.begin();
  crowd.pose({ x: 0, y: 0, z: 0, yaw: 0, activity: "walk", speed: 0.8, time: 1, phase0: 0 }, woman);
  crowd.pose({ x: 2, y: 0, z: 0, yaw: 0, activity: "walk", speed: 0.8, time: 1, phase0: 0 }, man);
  crowd.end();
  const hair = crowd.meshes.get("hair")!;
  assert.equal(hair.count, 3, "her hair is the cap and what falls behind it; his is the cap");
  // Her skirt is the pelvis drawn long: from the waist to below the knee.
  const pelvis = crowd.meshes.get("pelvis")!;
  const [hers, his] = [0, 1].map((i) => {
    const m = new THREE.Matrix4();
    pelvis.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixScale(m);
  });
  assert.ok(hers.y > his.y * 1.8, `her skirt is ${(hers.y / his.y).toFixed(2)}× his trousers' top`);
  crowd.dispose();
});

test("half of every village is women, and nobody's dress is echo-violet", () => {
  for (const trade of ["fisher", "farmer", "smith", "trader", "healer", "weaver", "miner", "potter", "innkeeper", "teacher"]) {
    for (let i = 0; i < 12; i++) {
      const hsl = { h: 0, s: 0, l: 0 };
      lookFor(`p/${trade}/${i}`, trade, 30, "f").cloth.getHSL(hsl);
      assert.ok(Math.abs(hsl.h - 0.75) > 0.06 || hsl.s < 0.15, `a ${trade}'s dress is violet (h ${hsl.h.toFixed(2)}, s ${hsl.s.toFixed(2)})`);
    }
  }
});
