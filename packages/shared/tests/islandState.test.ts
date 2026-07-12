/**
 * Island day-state — the pure survival core (P1). Decay, day-close and scarcity dynamics
 * must be deterministic and clock-injected so the "soft-irreversible, compounding, never
 * game-over" rules (blueprint §I.6) are provable.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SURVIVAL,
  scarcityMultiplier,
  freshIslandState,
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
  buildDelta01: 0,
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

  it("weathers a half-built structure but never a finished one, never below 0", () => {
    const half = { ...freshIslandState(T0), structureProgress: 0.5 };
    const aged = applyWallClockDecay(half, T0 + 2 * DAY);
    assert.ok(Math.abs(aged.state.structureProgress - (0.5 - 2 * SURVIVAL.DECAY.STRUCT_WEATHER_PER_DAY)) < 1e-9);

    const done = { ...freshIslandState(T0), structureProgress: 1 };
    assert.equal(applyWallClockDecay(done, T0 + 30 * DAY).state.structureProgress, 1);

    const sliver = { ...freshIslandState(T0), structureProgress: 0.01 };
    assert.equal(applyWallClockDecay(sliver, T0 + 30 * DAY).state.structureProgress, 0);
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
    const s = { ...freshIslandState(T0), structureProgress: 0.4, dayCount: 3 };
    const next = closeDay(s, baseSummary({ collapse: true, endVitality01: 0, alloc: { earn: 0, learn: 0, social: 0, leisure: 1, build: 0 } }), T0);
    assert.equal(next.dayCount, 4);
    assert.equal(next.vitalityCarry, 0.3); // wakes weakened, not erased
    assert.ok(next.scarcityLevel > s.scarcityLevel + 0.2); // the day is lost, the world advanced
    assert.equal(next.structureProgress, 0.4); // the island is never taken from you
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
