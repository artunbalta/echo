/**
 * The pack and the recipes (`lib/items.ts`, DECISIONS C47).
 *
 * Run:  node --import tsx --test packages/planet/tests/items.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { allThingKinds, verbsOf } from "../lib/affordances.js";
import { ITEMS, PACK_SIZE, RECIPES, add, canMake, gladOf, make, packCount, remove, type Pack } from "../lib/items.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const ingest = readFileSync(`${root}services/ml/echo_ml/ingest.py`, "utf8");

test("C47: everything a verb gives is an item, and everything a recipe uses or makes is too", () => {
  for (const k of allThingKinds()) for (const v of verbsOf(k)) if (v.gives) assert.ok(ITEMS[v.gives], `${k}/${v.id} gives "${v.gives}", which is not an item`);
  for (const r of RECIPES) {
    assert.ok(ITEMS[r.makes], `${r.id} makes "${r.makes}"`);
    for (const id of Object.keys(r.needs)) assert.ok(ITEMS[id], `${r.id} needs "${id}"`);
    if (r.measure.route === "named") assert.ok(new RegExp(`"${r.measure.action}"`).test(ingest), `${r.id}: ingest.py has no "${r.measure.action}"`);
    else assert.ok(!new RegExp(`"${r.measure.action}"`).test(ingest), `${r.id}: "${r.measure.action}" has a handler; call it named`);
  }
});

test("C47: every recipe can be made from things the world gives", () => {
  const given = new Set<string>();
  for (const k of allThingKinds()) for (const v of verbsOf(k)) if (v.gives) given.add(v.gives);
  for (const r of RECIPES) for (const id of Object.keys(r.needs)) assert.ok(given.has(id), `${r.id} needs "${id}", which nothing in the world gives`);
});

test("C47: a pack holds eight things, gives what it has, and makes what it can", () => {
  let pack: Pack = {};
  for (let i = 0; i < PACK_SIZE; i++) pack = add(pack, "reed")!;
  assert.equal(packCount(pack), PACK_SIZE);
  assert.equal(add(pack, "shell"), null, "a ninth thing went in");
  assert.equal(remove({}, "shell"), null, "gave what it did not have");
  const basket = RECIPES.find((r) => r.id === "basket")!;
  assert.ok(canMake(pack, basket));
  const after = make(pack, basket)!;
  assert.deepEqual(after, { reed: 4, basket: 1 });
  assert.equal(make({ reed: 3 }, basket), null);
  assert.equal(add({}, "a diamond"), null, "something not in the list went in");
});

test("C47: a fisher is glad of a hook, a child of a shell, the old of berries — and nobody of a price", () => {
  assert.ok(gladOf("hook and line", "fisher", 40));
  assert.ok(gladOf("shell", "labourer", 7));
  assert.ok(gladOf("berries", "farmer", 70));
  assert.ok(!gladOf("stone", "farmer", 40));
  for (const spec of Object.values(ITEMS)) assert.deepEqual(Object.keys(spec).filter((k) => !["id", "name", "gladdens"].includes(k)), [], `${spec.id} has a field that could be a price`);
});
