/**
 * Moments and hidden things, as the page plays them (DECISIONS C86): the moments layer run on a village
 * of hand-written ground with a clock the test holds. A moment begins about half a minute in, ahead of
 * the stranger; its people arrive and it can be acted on; an act plays it out and the next comes about a
 * minute later; walking past one is reported once; nothing begins while the director has something out;
 * a hidden thing is found once and says what was found. And every choice and line has its Turkish.
 *
 * Run:  node --import tsx --test apps/web/tests/moments.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { EGG_KINDS, EGG_LINES, MOMENT, MOMENT_KINDS, MOMENTS, settlementAt, villagePlan, verbsOf, worldClock, WORLD_EPOCH, type SettlementGeography, type VillageGround } from "@echo/planet";

import { momentsLayer } from "../src/game/world/momentsLayer";
import { beatText, nameText, verbLabel } from "../src/lib/i18n";

const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};

function village() {
  for (let i = 0; i < 400; i++) {
    const s = settlementAt("echo-planet-0001", `moments-${i}`, COAST, 0);
    const plan = s && villagePlan(s, SHORE, { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } });
    if (s && plan && s.people.filter((p) => p.birthDay <= 0 && p.deathDay > 0).length >= 10) return { settlement: s, plan, changes: [] };
  }
  throw new Error("no village");
}

const TILE = 1.6;
/** A world the layer can run in: tiles are local metres over 1.6, and the camera looks the way the stranger faces. */
function world(start: { x: number; y: number }) {
  let ms = 0;
  const realNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", { value: () => ms, configurable: true });
  const v = village();
  const me = { x: start.x, y: start.y, heading: 0 };
  let staged: { x: number; y: number } | null = null;
  const camera = new THREE.PerspectiveCamera();
  const frame = {
    tileM: TILE,
    fromLocalM: (x: number, y: number) => [x / TILE, y / TILE] as [number, number],
    toLocalM: (tx: number, ty: number) => [tx * TILE, ty * TILE] as [number, number],
    heightAtTile: (tx: number, ty: number) => SHORE.heightAt(tx * TILE, ty * TILE),
  };
  const layers: Record<string, unknown> = {
    player: { position: () => ({ x: me.x / TILE, y: me.y / TILE }), aboard: () => false },
    sky: { timeOfDay: () => 0.45 },
    director: { staging: () => staged },
    interior: { inside: () => null },
  };
  const ctx = { region: { village: v, cell: "843f6a1ffffffff" }, frame, scene: new THREE.Scene(), camera, layer: (name: string) => layers[name] ?? null };
  const aim = () => {
    // Behind the stranger, looking along their heading (scene x = tile x · 1.6, z = tile y · 1.6).
    camera.position.set(me.x - Math.cos(me.heading) * 4, 3, me.y - Math.sin(me.heading) * 4);
    camera.lookAt(me.x + Math.cos(me.heading) * 6, 1, me.y + Math.sin(me.heading) * 6);
    camera.updateMatrixWorld();
  };
  return {
    v,
    me,
    ctx,
    setStaged: (s: { x: number; y: number } | null) => (staged = s),
    /** Run the world on for `s` seconds, a tenth at a time. */
    run(layer: ReturnType<typeof momentsLayer>, s: number, until?: () => boolean) {
      for (let k = 0; k < s * 10; k++) {
        ms += 100;
        aim();
        layer.update!(0.1, ctx as never);
        if (until?.()) return true;
      }
      return false;
    },
    restore: () => Object.defineProperty(performance, "now", { value: realNow, configurable: true }),
  };
}

/** A place 30 m out from the green on open, dry ground, facing round the village. */
function startOf(plan: { centre: { x: number; y: number } }) {
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const x = plan.centre.x + Math.cos(a) * 30;
    const y = plan.centre.y + Math.sin(a) * 30;
    if (SHORE.heightAt(x, y) > 2) return { x, y, heading: a + Math.PI / 2 };
  }
  throw new Error("no dry start");
}

test("C86: a moment begins ahead after half a minute, can be acted on once its people are there, and an act plays it out", async () => {
  const probe = village();
  const start = startOf(probe.plan);
  const w = world(start);
  w.me.heading = start.heading;
  const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
  try {
    await layer.build(w.ctx as never, new AbortController().signal);
    assert.equal(w.run(layer, MOMENT.firstS - 2, () => layer.current() !== null), false, "a moment before the stranger had time to look around");
    assert.ok(w.run(layer, 6, () => layer.current() !== null), "no moment half a minute in");
    const m = layer.current()!;
    assert.equal(MOMENTS[m.kind].where, "ahead", "a moment of the well or the green, thirty metres from either");
    const ahead = Math.atan2(m.y - w.me.y, m.x - w.me.x) - w.me.heading;
    assert.ok(Math.abs(Math.atan2(Math.sin(ahead), Math.cos(ahead))) < Math.PI / 3, "set behind the stranger");
    // Its people walk in, and then (for a ball game, once the ball is at the stranger's feet) it can be acted on.
    let thing = null as ReturnType<typeof layer.things>[number] | null;
    assert.ok(w.run(layer, 40, () => (thing = layer.things(w.me.x, w.me.y).find((t) => t.ref.startsWith("moment:")) ?? null) !== null), `${m.kind} never offered anything`);
    assert.equal(thing!.kind, m.kind);
    assert.ok(verbsOf(thing!.kind).length > 0);
    assert.equal(layer.acted(thing!.ref, verbsOf(thing!.kind)[0]!.id), null, "a moment says its verb's beat, not a line of its own");
    assert.equal(layer.current()!.state, "ending");
    assert.equal(layer.things(w.me.x, w.me.y).filter((t) => t.ref.startsWith("moment:")).length, 0, "it can be done twice");
    // Its people walk off, and the next comes about a minute after.
    assert.ok(w.run(layer, 20, () => layer.current() === null), "it never ended");
    assert.equal(w.run(layer, MOMENT.gapS[0] - 1, () => layer.current() !== null), false, "the next came at once");
    assert.ok(w.run(layer, MOMENT.gapS[1] - MOMENT.gapS[0] + 4, () => layer.current() !== null), "the next never came");
  } finally {
    layer.dispose?.();
    w.restore();
  }
});

test("C86: walking past a moment is reported once; nothing begins while the stranger is near what the director set out", async () => {
  const probe = village();
  const start = startOf(probe.plan);
  const w = world(start);
  w.me.heading = start.heading;
  const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
  const passed: string[] = [];
  layer.onPassed((kind) => passed.push(kind));
  try {
    await layer.build(w.ctx as never, new AbortController().signal);
    // With something set out by the director nearby, the half minute comes and goes with nothing.
    w.setStaged({ x: w.me.x - 30, y: w.me.y });
    assert.equal(w.run(layer, MOMENT.firstS + 10, () => layer.current() !== null), false, "a moment beside the director's");
    // Walked away from (it stands on, far behind), it holds nothing back.
    w.setStaged({ x: w.me.x - Math.cos(w.me.heading) * 60, y: w.me.y - Math.sin(w.me.heading) * 60 });
    assert.ok(w.run(layer, 10, () => layer.current() !== null), "a staging sixty metres behind still held every moment back");
    w.run(layer, 90, () => layer.current() === null);
    w.setStaged(null);
    // Then moments come; walk away from each one that can be walked past, until one is reported.
    for (let round = 0; round < 8 && passed.length === 0; round++) {
      assert.ok(w.run(layer, 70, () => layer.current() !== null), "no moment came");
      const kind = layer.current()!.kind;
      const offered = w.run(layer, 40, () => layer.things(w.me.x, w.me.y).some((t) => t.ref.startsWith("moment:")));
      if (offered && MOMENTS[kind].passed) {
        // Walk off the other way, briskly.
        for (let k = 0; k < 40; k++) {
          w.me.x -= Math.cos(w.me.heading) * 0.7;
          w.me.y -= Math.sin(w.me.heading) * 0.7;
          w.run(layer, 0.4);
        }
        assert.deepEqual(passed, [kind], `walking off from ${kind} was not reported once`);
      }
      w.run(layer, 25, () => layer.current() === null);
      // Back to where the stranger began, for the next.
      w.me.x = start.x;
      w.me.y = start.y;
    }
    assert.equal(passed.length, 1, "no moment that can be walked past came in eight rounds");
  } finally {
    layer.dispose?.();
    w.restore();
  }
});

test("C86: a hidden thing is offered near, found once, and says what was found", async () => {
  const probe = village();
  const w = world(startOf(probe.plan));
  const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
  try {
    await layer.build(w.ctx as never, new AbortController().signal);
    const eggs = layer.eggs();
    assert.ok(eggs.length >= 6, `only ${eggs.length} hidden things`);
    const e = eggs.find((x) => x.kind === "hollow-stump")!;
    assert.equal(layer.things(e.x + 40, e.y).filter((t) => t.ref === `egg:${e.id}`).length, 0, "offered from forty metres");
    const thing = layer.things(e.x + 1, e.y).find((t) => t.ref === `egg:${e.id}`)!;
    assert.ok(thing, "not offered beside it");
    const line = layer.acted(thing.ref, verbsOf(thing.kind)[0]!.id)!;
    assert.ok(EGG_LINES["hollow-stump"].includes(line), `found "${line}"`);
    assert.equal(layer.things(e.x + 1, e.y).filter((t) => t.ref === `egg:${e.id}`).length, 0, "found twice");
    assert.equal(layer.eggs().find((x) => x.id === e.id)!.found, true);
    // The lookout can be sat on again and again.
    const rock = eggs.find((x) => x.kind === "lookout-rock")!;
    assert.equal(layer.acted(`egg:${rock.id}`, "sit"), null);
    assert.ok(layer.things(rock.x + 1, rock.y).some((t) => t.ref === `egg:${rock.id}`), "sitting on the rock used it up");
  } finally {
    layer.dispose?.();
    w.restore();
  }
});

test("C86: every choice a moment or a hidden thing offers, and every line it says, has its Turkish", () => {
  for (const kind of [...MOMENT_KINDS, ...EGG_KINDS]) {
    for (const v of verbsOf(kind)) {
      assert.notEqual(verbLabel("tr", v.label), v.label, `${kind}/${v.id}: "${v.label}" has no Turkish`);
      if (v.beat) assert.notEqual(beatText("tr", v.beat), v.beat, `${kind}/${v.id}: its beat has no Turkish`);
    }
  }
  for (const lines of Object.values(EGG_LINES)) for (const l of lines) assert.notEqual(beatText("tr", l), l, `"${l}" has no Turkish`);
  for (const kind of MOMENT_KINDS) assert.notEqual(nameText("tr", MOMENTS[kind].name), MOMENTS[kind].name, `${kind}: "${MOMENTS[kind].name}" has no Turkish`);
});

test("C86: every hidden thing has a Turkish name over it", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/game/world/momentsLayer.ts", import.meta.url), "utf8");
  const names = [...src.matchAll(/^  "(?:hollow-stump|message-bottle|still-pool|lookout-rock|buried-box)": "([^"]+)",$/gm)].map((m) => m[1]!);
  assert.equal(names.length, EGG_KINDS.length);
  for (const n of names) assert.notEqual(nameText("tr", n), n, `"${n}" has no Turkish`);
});
