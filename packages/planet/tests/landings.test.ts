/**
 * A stranger come in from the sea, and who knows it (`lib/landings.ts`, DECISIONS C57).
 *
 * Run:  node --import tsx --test packages/planet/tests/landings.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DEEDS, witnessesOf } from "../lib/deeds.js";
import { knownLandings, landingWitnesses, landingWords, LANDINGS, type Landing } from "../lib/landings.js";
import { present } from "../lib/life.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.6, wooded: 0.3, mountain: 0.3, tradeAccess: 0.6 };
const GROUND: VillageGround = { heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37), standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4960;

let s!: Settlement;
let plan!: VillagePlan;
for (let i = 0; i < 40; i++) {
  const t = settlementAt(SEED, `land-${i}`, GEO, DAY);
  const p = t && villagePlan(t, GROUND, SITE);
  if (t && p && p.dock && t.people.filter((q) => present(t, q, DAY)).length > 30) {
    s = t;
    plan = p;
    break;
  }
}

const landing = (over: Partial<Landing>): Landing => ({ id: "l1", day: DAY, hour: 0.45, fromCell: "84dcee5ffffffff", fromName: "Drurnscree", side: "far", rings: 1, witnesses: [], ...over });

test("C57: a raft coming in is seen from much further off than a hand on a fence — and by nobody indoors or under eight", () => {
  assert.ok(s && plan?.dock, "no coastal village to land at");
  const at = plan.dock!.root;
  let more = 0;
  for (const hour of [0.3, 0.45, 0.6, 0.72]) {
    const raft = landingWitnesses(s, plan, DAY, hour, at);
    const fence = witnessesOf(s, plan, DAY, hour, at);
    for (const id of fence) assert.ok(raft.includes(id), `${id} saw a hand on a fence and not a raft at the same spot`);
    more += raft.length - fence.length;
    const { plans, boats, moorings } = dayPlans(s, plan, DAY);
    const byId = new Map(s.people.map((p) => [p.id, p]));
    for (const id of raft) {
      const p = byId.get(id)!;
      assert.ok((DAY - p.birthDay) / 365 >= LANDINGS.minAge, `a child of ${((DAY - p.birthDay) / 365).toFixed(1)} counted`);
      const w = whereabouts(plans.find((d) => d.person === id)!, hour, boats, moorings);
      assert.ok(w.visible && Math.hypot(w.x - at.x, w.y - at.y) <= LANDINGS.sightM, `${id} saw it from indoors or from ${Math.hypot(w.x - at.x, w.y - at.y).toFixed(0)} m`);
    }
  }
  assert.ok(LANDINGS.sightM > DEEDS.sightM * 3);
  assert.ok(more > 0, "a raft on open water seen by nobody a fence was not");
});

test("C57: who saw it knows at once; a stranger out of the sea is round the village the next day; coming home is nobody's news", () => {
  const [a, b] = s.people.filter((p) => present(s, p, DAY) && (DAY - p.birthDay) / 365 > 20);
  const far = landing({ witnesses: [a.id] });
  assert.deepEqual(knownLandings(a, [far], DAY).map((k) => k.how), ["saw"]);
  assert.deepEqual(knownLandings(b, [far], DAY), [], "heard of it the same hour");
  assert.deepEqual(knownLandings(b, [far], DAY + 1).map((k) => k.how), ["heard"]);
  const home = landing({ side: "near", rings: 0, witnesses: [a.id] });
  assert.equal(knownLandings(b, [home], DAY + 5).length, 0, "the whole village heard someone came back from a paddle");
  assert.equal(knownLandings(a, [home], DAY + 5).length, 1);
  assert.equal(knownLandings(a, [landing({ day: DAY + 2, witnesses: [a.id] })], DAY).length, 0, "knew of a landing before it happened");
});

test("C57: what a villager says of it — where from, when, and that nobody here built the raft", () => {
  const [a] = s.people.filter((p) => present(s, p, DAY) && (DAY - p.birthDay) / 365 > 20);
  const seen = landingWords(s, { landing: landing({ witnesses: [a.id] }), how: "saw" }, DAY);
  assert.match(seen, /from the direction of Drurnscree/);
  assert.match(seen, /today/);
  assert.match(seen, /Nobody here built it/);
  const heard = landingWords(s, { landing: landing({ fromName: null, day: DAY - 3 }), how: "heard" }, DAY);
  assert.match(heard, /^Word went round/);
  assert.match(heard, /from across the water, 3 days ago/);
  assert.match(landingWords(s, { landing: landing({ side: "near", rings: 0 }), how: "saw" }, DAY + 1), /back in to the shore here, yesterday/);
  // Their own village is not "the direction of" itself.
  assert.doesNotMatch(landingWords(s, { landing: landing({ fromName: s.name }), how: "saw" }, DAY), new RegExp(`direction of ${s.name}`));
});
