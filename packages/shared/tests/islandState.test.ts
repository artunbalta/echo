/**
 * Island day-state — the pure survival core (P1). Decay, day-close and scarcity dynamics
 * must be deterministic and clock-injected so the "soft-irreversible, compounding, never
 * game-over" rules (blueprint §I.6) are provable.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SURVIVAL,
  MIN_BUILD_MS,
  scarcityMultiplier,
  freshIslandState,
  freshRaft,
  structureProgress01,
  applyWallClockDecay,
  closeDay,
  tendTie,
  InMemoryIslandStateStore,
  type DaySummary,
} from "../src/index.js";

const T0 = 1_700_000_000_000;
const DAY = 24 * 3600 * 1000;

const baseSummary = (over: Partial<DaySummary> = {}): DaySummary => ({
  grain: null,
  harvested: false,
  bet: null,
  raft: null,
  alloc: { earn: 0.4, learn: 0.2, social: 0.2, leisure: 0.2, build: 0 },
  endVitality01: 0.6,
  collapse: false,
  ...over,
});

describe("scarcityMultiplier", () => {
  it("lerps NORMAL→LEAN over [0,1] and clamps outside", () => {
    assert.equal(scarcityMultiplier(0), SURVIVAL.SCARCITY.NORMAL);
    assert.equal(scarcityMultiplier(1), SURVIVAL.SCARCITY.LEAN);
    assert.equal(scarcityMultiplier(0.5), (SURVIVAL.SCARCITY.NORMAL + SURVIVAL.SCARCITY.LEAN) / 2);
    assert.equal(scarcityMultiplier(-3), SURVIVAL.SCARCITY.NORMAL);
    assert.equal(scarcityMultiplier(9), SURVIVAL.SCARCITY.LEAN);
  });
});

describe("applyWallClockDecay", () => {
  it("is a no-op for zero elapsed time", () => {
    const s = freshIslandState(T0);
    const { state, changes } = applyWallClockDecay(s, T0);
    assert.deepEqual(state, s);
    assert.equal(changes.length, 0);
  });

  it("ripens a planted crop on return, then wilts it past the window", () => {
    let s = { ...freshIslandState(T0), cropStage: "planted" as const, cropPlantedAt: T0 };
    const ripened = applyWallClockDecay(s, T0 + 2 * 3600 * 1000);
    assert.equal(ripened.state.cropStage, "ripe");
    assert.ok(ripened.changes.some((c) => c.includes("ripened")));

    s = { ...ripened.state };
    const wilted = applyWallClockDecay(s, T0 + SURVIVAL.DECAY.CROP_WILT_MS + 1000);
    assert.equal(wilted.state.cropStage, "wilted");
    assert.ok(wilted.changes.some((c) => c.includes("wilted")));
  });

  // The raft weathers on the quantity the hands actually put in (workMs — the lashings work
  // loose), not on a stored 0..1. Same three invariants this test has always protected: unfinished
  // work decays at STRUCT_WEATHER_PER_DAY, a finished thing never decays (§III.6), and it never
  // goes below zero. Wood hauled up the beach does not rot, so planks are untouched.
  it("weathers a half-built raft but never a launched one, never below 0", () => {
    const halfMs = 0.5 * MIN_BUILD_MS;
    const half = { ...freshIslandState(T0), raft: { ...freshRaft(), planks: 3, workMs: halfMs } };
    const aged = applyWallClockDecay(half, T0 + 2 * DAY);
    const expected = halfMs - 2 * SURVIVAL.DECAY.STRUCT_WEATHER_PER_DAY * MIN_BUILD_MS;
    assert.ok(Math.abs(aged.state.raft.workMs - expected) < 1e-9);
    assert.equal(aged.state.raft.planks, 3); // wood on the beach does not rot
    assert.ok(aged.changes.some((c) => c.includes("worked loose")));

    const done = { ...freshIslandState(T0), raft: { ...freshRaft(), planks: 5, workMs: MIN_BUILD_MS, launched: true } };
    const doneAged = applyWallClockDecay(done, T0 + 30 * DAY);
    assert.equal(doneAged.state.raft.workMs, MIN_BUILD_MS); // a launched raft is finished
    assert.equal(structureProgress01(doneAged.state.raft), 1);

    const sliver = { ...freshIslandState(T0), raft: { ...freshRaft(), workMs: 10 } };
    assert.equal(applyWallClockDecay(sliver, T0 + 30 * DAY).state.raft.workMs, 0);
  });

  // The day loop's 0..1 read is DERIVED from the raft, so it can never disagree with the wood
  // and the work it describes — the drift the old parallel counter invited.
  it("structureProgress01 is a pure read of the raft: begun > 0, launched = 1", () => {
    assert.equal(structureProgress01(freshRaft()), 0); // untouched shore
    assert.ok(structureProgress01({ ...freshRaft(), planks: 1 }) > 0); // the first plank IS beginning
    assert.equal(structureProgress01({ ...freshRaft(), planks: 5, workMs: MIN_BUILD_MS }), 1);
    assert.equal(structureProgress01({ ...freshRaft(), launched: true }), 1);
  });

  it("cools ties toward 0 and reports a bond crossing the felt threshold", () => {
    const s = { ...freshIslandState(T0), tieWarmth: { pet_1: 0.52, stranger: 0.1 } };
    const { state, changes } = applyWallClockDecay(s, T0 + DAY);
    assert.ok(Math.abs(state.tieWarmth.pet_1 - (0.52 - SURVIVAL.DECAY.TIE_COOL_PER_DAY)) < 1e-9);
    assert.ok(state.tieWarmth.stranger >= 0);
    assert.ok(changes.some((c) => c.includes("cooled")));
  });
});

describe("closeDay", () => {
  it("advances the day and plants a saved seed", () => {
    const s = freshIslandState(T0);
    const next = closeDay(s, baseSummary({ grain: "save" }), T0 + 1000);
    assert.equal(next.dayCount, 1);
    assert.equal(next.cropStage, "planted");
    assert.equal(next.cropPlantedAt, T0 + 1000);
    assert.ok(next.scarcityLevel < s.scarcityLevel + 0.001); // saving eases tomorrow
  });

  it("collapse compounds — higher scarcity, weakened wake — but never resets", () => {
    const s = { ...freshIslandState(T0), raft: { ...freshRaft(), planks: 2, workMs: 0.4 * MIN_BUILD_MS }, dayCount: 3 };
    const next = closeDay(s, baseSummary({ collapse: true, endVitality01: 0, alloc: { earn: 0, learn: 0, social: 0, leisure: 1, build: 0 } }), T0);
    assert.equal(next.dayCount, 4);
    assert.equal(next.vitalityCarry, 0.3); // wakes weakened, not erased
    assert.ok(next.scarcityLevel > s.scarcityLevel + 0.2); // the day is lost, the world advanced
    // The island is never taken from you: a day that collapsed reports no raft (summary.raft
    // null), and yesterday's raft must survive that untouched rather than be zeroed.
    assert.deepEqual(next.raft, s.raft);
  });

  it("harvest + good foraging ease scarcity; idle days lean it", () => {
    const lean = { ...freshIslandState(T0), scarcityLevel: 0.5 };
    const eased = closeDay(lean, baseSummary({ harvested: true }), T0);
    assert.ok(eased.scarcityLevel < 0.3);

    const idled = closeDay(lean, baseSummary({ alloc: { earn: 0, learn: 0.5, social: 0, leisure: 0.5, build: 0 } }), T0);
    assert.ok(idled.scarcityLevel > 0.5);
  });

  it("a lost risky wager leans tomorrow; a won one eases it", () => {
    const s = { ...freshIslandState(T0), scarcityLevel: 0.4 };
    const lost = closeDay(s, baseSummary({ bet: "risky", betWon: false }), T0);
    const won = closeDay(s, baseSummary({ bet: "risky", betWon: true }), T0);
    assert.ok(lost.scarcityLevel > won.scarcityLevel);
  });

  it("clamps: scarcity stays in [0,1], vitality carry floored for a playable tomorrow", () => {
    const famine = { ...freshIslandState(T0), scarcityLevel: 0.95 };
    const worse = closeDay(famine, baseSummary({ collapse: true, alloc: { earn: 0, learn: 0, social: 0, leisure: 1, build: 0 } }), T0);
    assert.ok(worse.scarcityLevel <= 1);
    const drained = closeDay(freshIslandState(T0), baseSummary({ endVitality01: 0.01 }), T0);
    assert.equal(drained.vitalityCarry, 0.15);
  });
});

describe("tendTie + store seam", () => {
  it("tendTie clamps warmth into [0,1]", () => {
    let s = freshIslandState(T0);
    s = tendTie(s, "pet_1", 0.7);
    s = tendTie(s, "pet_1", 0.7);
    assert.equal(s.tieWarmth.pet_1, 1);
    s = tendTie(s, "pet_1", -3);
    assert.equal(s.tieWarmth.pet_1, 0);
  });

  it("InMemoryIslandStateStore round-trips and hard-deletes", async () => {
    const store = new InMemoryIslandStateStore();
    assert.equal(await store.load("u1"), null);
    const s = freshIslandState(T0);
    await store.save("u1", s);
    assert.deepEqual(await store.load("u1"), s);
    await store.remove("u1");
    assert.equal(await store.load("u1"), null);
  });
});
