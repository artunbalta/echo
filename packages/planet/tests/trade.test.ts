/**
 * A stranger trading with a villager, and labour for labour (`lib/trade.ts`, DECISIONS C58).
 *
 * Run:  node --import tsx --test packages/planet/tests/trade.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { Deed } from "../lib/deeds.js";
import { deedWords } from "../lib/deeds.js";
import { ITEMS } from "../lib/items.js";
import { present } from "../lib/life.js";
import { marketOf, lacksOf, isMarketDay, TRADE_GOODS, type MarketCandidate } from "../lib/markets.js";
import { TRADE_WANTS, type Need } from "../lib/needs.js";
import { ageYears, occupationOn, settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { owes, sparesOf, tradeAnswer, tradeWords, TRADING, type TradeAnswer, type TradeWhy } from "../lib/trade.js";
import { villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.6, wooded: 0.3, mountain: 0.3, tradeAccess: 0.9 };
const GROUND: VillageGround = { heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37), standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4960;

let s!: Settlement;
let plan!: VillagePlan;
const of = (trade: string) => s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) >= 20 && ageYears(p, DAY) < 60 && occupationOn(p, DAY) === trade);
for (let i = 0; i < 120 && !s; i++) {
  const t = settlementAt(SEED, `tr-${i}`, GEO, DAY);
  const p = t && villagePlan(t, GROUND, SITE);
  if (!t || !p) continue;
  s = t;
  plan = p;
  if (!of("fisher") || !of("farmer") || !(of("trader") || of("carter"))) {
    s = undefined as never;
  }
}
const householdOf = (p: Person) => (p.partnerDay !== null && p.partnerDay <= DAY ? p.household : p.bornInto);
const family = (p: Person) => s.people.filter((q) => householdOf(q) === householdOf(p)).map((q) => q.id);
let n = 0;
const deed = (over: Partial<Deed>): Deed => ({ id: `d${n++}`, verb: "tend", kind: "field", thing: "field:0", thingName: "the field", reading: "help", weight: 2, day: DAY - 2, hour: 0.4, witnesses: [], owners: [], ...over });
const ask = (offered: string | null, asked: string | null = null) => ({ offered, asked });

test("C58: what a villager can spare is what their work leaves — a fish from a fisher, nothing from a child, the market's goods from a trader", () => {
  assert.ok(s, "no village with a fisher, a farmer and a trader");
  assert.deepEqual(sparesOf(s, plan, of("fisher")!, DAY), ["fish"]);
  assert.deepEqual(sparesOf(s, plan, of("farmer")!, DAY), ["a handful of grain"]);
  const child = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) < 12)!;
  assert.deepEqual(sparesOf(s, plan, child, DAY), []);
  // Even a child already set to a trade that has goods has none of its own to give.
  const apprentice = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) < TRADING.minAgeYears && TRADE_GOODS[occupationOn(p, DAY)]);
  assert.ok(apprentice, "no child set to a trade with goods");
  assert.deepEqual(sparesOf(s, plan, apprentice!, DAY), [], "a child with goods of their own to spare");
  const cand: MarketCandidate = { cell: "x", name: "Elsewhere", goods: lacksOf(s, DAY).slice(0, 2), x: 0, y: 1500, km: 1.5 };
  const withMarket = { ...plan, market: marketOf(s, [cand], DAY) };
  const goer = s.people.find((p) => withMarket.market!.goers.includes(p.id))!;
  let day = DAY;
  while (!isMarketDay(withMarket.market!, day)) day++;
  assert.deepEqual(sparesOf(s, withMarket, goer, day - 2), [], "a trader with stock before the market");
  assert.deepEqual(sparesOf(s, withMarket, goer, day), withMarket.market!.brings);
});

test("C58: they take what they need, are glad of, or work with — and turn down what they make themselves or have no use for", () => {
  const fisher = of("fisher")!;
  const need: Need = { id: "n", person: fisher.id, item: "shell", text: "", since: DAY - 1, until: DAY + 6 };
  const cases: [string | null, Need | null, boolean, TradeWhy][] = [
    ["shell", need, true, "need"],
    ["hook and line", null, true, "glad"],
    ["fish", null, false, "own"],
    ["dry twigs", null, false, "no-use"],
  ];
  for (const [offered, nd, ok, why] of cases) {
    const a = tradeAnswer(s, plan, fisher, DAY, ask(offered), [], nd);
    assert.deepEqual([a.ok, a.why], [ok, why], `${offered}`);
    if (ok) assert.equal(a.gives, "fish");
  }
  // Whatever a trade works with is welcome to anyone at it (a farmer's basket, a miner's torch).
  let tried = 0;
  for (const [trade, want] of Object.entries(TRADE_WANTS)) {
    const p = of(trade);
    if (!p) continue;
    tried++;
    const a = tradeAnswer(s, plan, p, DAY, ask(want!), []);
    assert.ok(a.ok && (a.why === "wants" || a.why === "glad"), `a ${trade} turned down ${want}: ${a.why}`);
  }
  assert.ok(tried >= 2);
});
const pick = (a: TradeAnswer) => [a.ok, a.why];

test("C58: a kindness known makes them oblige; a wrong known makes them refuse; once a day is enough", () => {
  const fisher = of("fisher")!;
  const kind = deed({ verb: "give", kind: "villager", thing: `villager:${fisher.id}`, reading: "kindness", weight: 2, owners: family(fisher), item: "shell" });
  assert.deepEqual(pick(tradeAnswer(s, plan, fisher, DAY, ask("dry twigs"), [kind])), [true, "friend"]);
  const harm = deed({ verb: "trample", reading: "harm", weight: 2, owners: family(fisher) });
  assert.deepEqual(pick(tradeAnswer(s, plan, fisher, DAY, ask("hook and line"), [harm])), [false, "wronged"]);
  const today = deed({ verb: "trade", kind: "villager", reading: "respect", weight: 1, day: DAY, owners: family(fisher), item: "shell", got: "fish" });
  assert.deepEqual(pick(tradeAnswer(s, plan, fisher, DAY, ask("hook and line"), [today])), [false, "busy"]);
  assert.deepEqual(pick(tradeAnswer(s, plan, fisher, DAY + 1, ask("hook and line"), [today])), [true, "glad"], "busy for good");
  // Asked for something they have none of.
  const a = tradeAnswer(s, plan, fisher, DAY, ask("hook and line", "knife"), []);
  assert.deepEqual([a.ok, a.why, a.spares], [false, "spare", ["fish"]]);
  const child = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) < 12)!;
  assert.equal(tradeAnswer(s, plan, child, DAY, ask("shell"), []).why, "young");
});

test("C58: labour for labour — help is owed back once, until it is returned, and not for ever", () => {
  const farmer = of("farmer")!;
  const help = deed({ owners: family(farmer), day: DAY - 3 });
  assert.equal(owes(s, farmer, [], DAY), false);
  assert.equal(owes(s, farmer, [help], DAY), true);
  assert.deepEqual(pick(tradeAnswer(s, plan, farmer, DAY, ask(null), [help])), [true, "owed"]);
  assert.deepEqual(pick(tradeAnswer(s, plan, farmer, DAY, ask(null), [])), [false, "not-owed"]);
  const back = deed({ verb: "ask-back", kind: "villager", reading: "respect", weight: 1, day: DAY - 1, owners: family(farmer), got: "a handful of grain" });
  assert.equal(owes(s, farmer, [help, back], DAY), false, "repaid help still owed");
  const again = deed({ owners: family(farmer), day: DAY });
  assert.equal(owes(s, farmer, [help, back, again], DAY), true, "help after a return is not owed");
  assert.equal(owes(s, farmer, [deed({ owners: family(farmer), day: DAY - TRADING.owedDays - 1 })], DAY), false, "a debt forever");
  // Somebody else's household is owed nothing for help to this one.
  const other = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) > 20 && householdOf(p) !== householdOf(farmer))!;
  assert.equal(owes(s, other, [help], DAY), false);
});

test("C58: what they say is a reason in words, never a price — and a trader without stock names the next market", () => {
  const forbidden = /\b(price|worth|value|cost|coin|money|pay|paid|cheap|dear)\b/i;
  const all: TradeWhy[] = ["need", "glad", "wants", "friend", "owed", "young", "wronged", "busy", "spare", "own", "no-use", "not-owed"];
  for (const why of all) {
    const ok = ["need", "glad", "wants", "friend", "owed"].includes(why);
    const w = tradeWords({ ok, why, gives: ok ? "fish" : null, spares: ["fish"] }, { offered: "shell", asked: null });
    assert.ok(w.length > 8 && !forbidden.test(w), `${why}: ${w}`);
  }
  const m = tradeWords({ ok: false, why: "spare", gives: null, spares: [] }, { offered: "shell", asked: null }, { partner: "Tulmarket", brings: ["cheese", "herbs"], daysTo: 1 });
  assert.match(m, /market tomorrow — I'll have cheese and herbs from Tulmarket/);
  for (const id of Object.values(TRADE_GOODS)) assert.ok(ITEMS[id!], `${id} is not an item`);
});

test("C58: the village says a trade as one thing for another", () => {
  const fisher = of("fisher")!;
  const t = deed({ verb: "trade", kind: "villager", thing: `villager:${fisher.id}`, thingName: fisher.given, reading: "respect", weight: 1, owners: family(fisher), item: "shell", got: "fish" });
  assert.match(deedWords(s, fisher, { deed: t, how: "theirs" }, DAY), /traded a shell with you for a fish/);
  const other = s.people.find((p) => present(s, p, DAY) && !family(fisher).includes(p.id))!;
  assert.match(deedWords(s, other, { deed: t, how: "saw" }, DAY), new RegExp(`traded a shell with ${fisher.given} for a fish`));
  const r = deed({ verb: "ask-back", kind: "villager", thing: `villager:${fisher.id}`, thingName: fisher.given, reading: "respect", weight: 1, owners: family(fisher), got: "fish" });
  assert.match(deedWords(s, fisher, { deed: r, how: "theirs" }, DAY), /asked you for something for their help, and was given a fish/);
});
