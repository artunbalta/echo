/**
 * A stranger's own house on their own land (`lib/homes.ts`, DECISIONS C59).
 *
 * Run:  node --import tsx --test packages/planet/tests/homes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ARRANGEMENT, canBuild, DYES, fromHouse, HOME, inWall, insideHome, nextStage, orderliness, PLACEABLE, placeLoose, placeSquare, siteProblem, spend, STAGES, toHouse, type Placed, type SiteGround } from "../lib/homes.js";
import { ITEMS } from "../lib/items.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { createTangentPatch } from "../lib/scene.js";
import { settlementAt, type SettlementGeography } from "../lib/society.js";
import { villagePlan, type VillageGround } from "../lib/village.js";

const CELL = "84dcee5ffffffff";
const patch = createTangentPatch(CELL, PLANET_PARAMS.radiusKm);
const h = { x: 120, y: -40, facing: 0.6, stage: 4 };

test("C59: a house has its own frame, a floor inside its walls, and a doorway in the front one", () => {
  for (const [u, v] of [[1, 0.5], [-2, 1.3], [0, 0]]) {
    const p = fromHouse(h, u, v);
    const back = toHouse(h, p.x, p.y);
    assert.ok(Math.abs(back.u - u) < 1e-9 && Math.abs(back.v - v) < 1e-9);
  }
  assert.ok(insideHome(h, h.x, h.y));
  const door = fromHouse(h, HOME.depthM / 2 - HOME.wallM / 2, 0);
  const wall = fromHouse(h, HOME.depthM / 2 - HOME.wallM / 2, HOME.widthM / 2 - 0.4);
  const back = fromHouse(h, -HOME.depthM / 2 + 0.05, 0);
  assert.equal(inWall(h, door.x, door.y, 0.3), false, "the doorway is a wall");
  assert.equal(inWall(h, wall.x, wall.y, 0.3), true, "walked through the front wall beside the door");
  assert.equal(inWall(h, back.x, back.y, 0.3), true, "walked through the back wall");
  assert.equal(inWall(h, h.x, h.y, 0.3), false, "the middle of the floor is a wall");
  assert.equal(inWall({ ...h, stage: 1 }, wall.x, wall.y, 0.3), false, "a wall before the walls are up");
});

test("C59: a house goes up on your own dry, level ground, clear of the village", () => {
  const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.6, wooded: 0.3, mountain: 0.3, tradeAccess: 0.6 };
  const GROUND: VillageGround = { heightAt: () => 10, standable: (x, y) => Math.hypot(x, y) < 600 };
  const s = settlementAt("echo-planet-0001", "home-0", GEO, 4960)!;
  const plan = villagePlan(s, GROUND, { origin: { x: 0, y: 0 }, shore: null })!;
  const g = (over: Partial<SiteGround> = {}): SiteGround => ({ cell: CELL, patch, standable: (x) => x < 400, heightAt: () => 10, plan: null, ...over });
  assert.equal(siteProblem(g(), 120, -40, 0.6), null);
  assert.equal(siteProblem(g(), 398, -40, 0), "water", "a house half in the sea");
  assert.equal(siteProblem(g({ heightAt: (x) => x * 0.6 }), 120, -40, 0), "steep");
  assert.equal(siteProblem(g(), 5000, 0, 0), "not-yours", "a house on the next parcel");
  const withVillage = g({ plan, standable: () => true });
  assert.equal(siteProblem(withVillage, plan.centre.x, plan.centre.y, 0), "village", "a house on the green");
  const plot = plan.plots[0]!;
  assert.equal(siteProblem(withVillage, plot.x + 2, plot.y, 0), "village", "a house in somebody's house");
  // Far enough out, the village is no obstacle.
  let clear: { x: number; y: number } | null = null;
  for (let r = 60; r < 400 && !clear; r += 10) for (let k = 0; k < 16 && !clear; k++) {
    const x = Math.cos((k / 16) * 6.283) * r;
    const y = Math.sin((k / 16) * 6.283) * r;
    if (siteProblem(withVillage, x, y, 0) === null) clear = { x, y };
  }
  assert.ok(clear, "nowhere on the land clear of the village");
});

test("C59: four stages, each from what you carry, used up as it goes in", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["foundation", "walls", "roof", "door"]);
  assert.equal(nextStage({ stage: 0 })!.id, "foundation");
  assert.equal(nextStage({ stage: 4 }), null);
  const pack = { stone: 5, shell: 1 };
  assert.equal(canBuild(pack, STAGES[0]!), true);
  assert.deepEqual(spend(pack, STAGES[0]!), { stone: 1, shell: 1 });
  assert.equal(spend({ stone: 3 }, STAGES[0]!), null);
  for (const st of STAGES) for (const id of Object.keys(st.needs)) assert.ok(ITEMS[id], `${st.id} needs ${id}, which is not an item`);
  for (const id of [...Object.keys(DYES), ...Object.keys(PLACEABLE)]) assert.ok(ITEMS[id], `${id} is not an item`);
});

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("C59: set down square, a thing turns with the walls and goes flush to the nearest; as it is, it stays where it fell", () => {
  const sq = placeSquare("table", { u: 1.2, v: 1.1, turn: 0.4 });
  assert.ok(Math.abs(sq.turn) < 1e-9, `turned ${sq.turn}`);
  // Flush to whichever wall is nearest: here the front, 7 cm off before it was pushed.
  const innerU = HOME.depthM / 2 - HOME.wallM;
  const innerV = HOME.widthM / 2 - HOME.wallM;
  const gaps = [innerU - (sq.u + 0.55), sq.u - 0.55 + innerU, innerV - (sq.v + 0.35), sq.v - 0.35 + innerV];
  assert.ok(Math.min(...gaps) < 0.05, `not flush to any wall: ${gaps.map((g) => g.toFixed(2)).join(" ")}`);
  const loose = placeLoose("table", { u: -0.5, v: 0, turn: 0.4 });
  assert.ok(Math.abs(loose.turn - 0.4) < 1e-9);
  // Whatever the body does, nothing goes through a wall.
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const body = { u: (r() - 0.5) * 4, v: (r() - 0.5) * 3, turn: r() * 6.28 };
    for (const p of [placeSquare("bed", body), placeLoose("bed", body)]) {
      const c = Math.abs(Math.cos(p.turn));
      const s = Math.abs(Math.sin(p.turn));
      const eu = (c * PLACEABLE.bed!.du + s * PLACEABLE.bed!.dv) / 2;
      const ev = (s * PLACEABLE.bed!.du + c * PLACEABLE.bed!.dv) / 2;
      assert.ok(Math.abs(p.u) + eu <= HOME.depthM / 2 - HOME.wallM + 1e-6 && Math.abs(p.v) + ev <= HOME.widthM / 2 - HOME.wallM + 1e-6, "a bed through a wall");
    }
  }
});

test("C59: a room set square against the walls reads orderly; one set down as things fell reads organic; one thing is no arrangement", () => {
  const iu = HOME.depthM / 2 - HOME.wallM;
  const iv = HOME.widthM / 2 - HOME.wallM;
  const orderly: Placed[] = [
    { kind: "bed", u: -iu + 0.98, v: -iv + 0.46, turn: 0 },
    { kind: "bed", u: -iu + 0.98, v: iv - 0.46, turn: 0 },
    { kind: "table", u: 0, v: 0, turn: 0 },
    { kind: "stool", u: 0, v: -0.6, turn: 0 },
    { kind: "stool", u: 0, v: 0.6, turn: 0 },
    { kind: "shelf", u: iu - 0.16, v: iv - 0.5, turn: Math.PI / 2 },
    { kind: "shelf", u: iu - 0.16, v: -iv + 0.5, turn: Math.PI / 2 },
  ];
  const o = orderliness(orderly)!;
  assert.ok(o >= ARRANGEMENT.orderly, `an orderly room read ${o.toFixed(2)}`);
  const r = rng(3);
  let organic = 0;
  for (let k = 0; k < 20; k++) {
    const room: Placed[] = ["bed", "table", "stool", "stool", "pot", "basket"].map((kind) => placeLoose(kind, { u: (r() - 0.5) * 1.2, v: (r() - 0.5) * 0.8, turn: r() * 6.28 }));
    organic += orderliness(room)!;
  }
  assert.ok(organic / 20 <= ARRANGEMENT.organic, `rooms set down as things fell read ${(organic / 20).toFixed(2)}`);
  assert.equal(orderliness([orderly[0]!]), null);
  // A twin is the same thing mirrored: a bed across from a table is not a pair.
  const unlike = orderliness([{ kind: "bed", u: 0, v: 0.5, turn: 0 }, { kind: "table", u: 0, v: -0.5, turn: 0 }])!;
  assert.ok(Math.abs(unlike - 0.45) < 1e-9, `a bed and a table read as twins: ${unlike}`);
  // The same things, squared up by the verb from the same places, read more orderly than left loose.
  const bodies = Array.from({ length: 6 }, () => ({ u: (r() - 0.5) * 3, v: (r() - 0.5) * 2.4, turn: r() * 6.28 }));
  const kinds = ["bed", "table", "stool", "pot", "shelf", "basket"];
  assert.ok(orderliness(kinds.map((k, i) => placeSquare(k, bodies[i]!)))! > orderliness(kinds.map((k, i) => placeLoose(k, bodies[i]!)))!);
});
