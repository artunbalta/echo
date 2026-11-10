/**
 * Moments and hidden things, as the page plays them (DECISIONS C86, C87): the moments layer run on a
 * village of hand-written ground with a clock the test holds. A moment begins a few seconds in, ahead of
 * the stranger; its people arrive and it can be acted on; an act plays it out and the next comes a few
 * seconds later; walking past one is reported once; nothing begins while the director has something out;
 * a hidden thing is found once and says what was found. Three streams run at once, so that something is
 * near nearly all the time (C87); someone coming along stops to meet the stranger, and a greeting let go
 * unanswered is reported once; a loaf taken to someone's mother is a promise, kept at her door or broken
 * by never coming; an act on an experiment's arm carries the arm. And every choice and line has its
 * Turkish.
 *
 * Run:  node --import tsx --test apps/web/tests/moments.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { EGG_KINDS, EGG_LINES, MOMENT, MOMENT_KINDS, MOMENTS, settlementAt, villagePlan, verbsOf, worldClock, WORLD_EPOCH, type MomentKind, type SettlementGeography, type VillageGround } from "@echo/planet";

import { MOMENT_LINES, momentsLayer } from "../src/game/world/momentsLayer";
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
    assert.ok(w.run(layer, 6, () => layer.current() !== null), "no moment a quarter of a minute in");
    const m = layer.current()!;
    assert.notEqual(MOMENTS[m.kind].where, "well", "a moment of the well, thirty metres from it");
    assert.notEqual(MOMENTS[m.kind].where, "green", "a moment of the green, thirty metres from it");
    if (MOMENTS[m.kind].where === "ahead") {
      const ahead = Math.atan2(m.y - w.me.y, m.x - w.me.x) - w.me.heading;
      assert.ok(Math.abs(Math.atan2(Math.sin(ahead), Math.cos(ahead))) < Math.PI / 3, "set behind the stranger");
    }
    // Its people walk in, and then (for a ball game, once the ball is at the stranger's feet) it can be acted on.
    let thing = null as ReturnType<typeof layer.things>[number] | null;
    assert.ok(w.run(layer, 40, () => (thing = layer.things(w.me.x, w.me.y).find((t) => t.ref.startsWith("moment:")) ?? null) !== null), `${m.kind} never offered anything`);
    assert.equal(thing!.kind, m.kind);
    assert.ok(verbsOf(thing!.kind).length > 0);
    assert.equal(layer.acted(thing!.ref, verbsOf(thing!.kind)[0]!.id), null, "a moment says its verb's beat, not a line of its own");
    assert.equal(layer.current()!.state, "ending");
    assert.equal(layer.things(w.me.x, w.me.y).filter((t) => t.ref.startsWith("moment:")).length, 0, "it can be done twice");
    // Its people walk off, and the next comes a few seconds after (C87; a minute in C86).
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
    // Walked away from (it stands on, far behind: C87 holds within 60 m), it holds nothing back.
    w.setStaged({ x: w.me.x - Math.cos(w.me.heading) * 80, y: w.me.y - Math.sin(w.me.heading) * 80 });
    assert.ok(w.run(layer, 10, () => layer.current() !== null), "a staging eighty metres behind still held every moment back");
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

/** A stranger walking slowly on round the village, as someone looking about does. */
function stroll(w: ReturnType<typeof world>, layer: ReturnType<typeof momentsLayer>, s: number, each: (t: number) => void) {
  const c = w.v.plan.centre;
  for (let k = 0; k < s; k++) {
    // Round the green at thirty metres, half a metre a second, facing the way they go.
    const a = Math.atan2(w.me.y - c.y, w.me.x - c.x) + 0.5 / 30;
    w.me.x = c.x + Math.cos(a) * 30;
    w.me.y = c.y + Math.sin(a) * 30;
    w.me.heading = a + Math.PI / 2;
    w.run(layer, 1);
    each(k);
  }
}

test("C87: three streams at once: something ahead, someone coming along, something by the way, and nothing near is rare and short", async () => {
  const probe = village();
  const start = startOf(probe.plan);
  const w = world(start);
  w.me.heading = start.heading;
  const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
  try {
    await layer.build(w.ctx as never, new AbortController().signal);
    w.run(layer, 20);
    const lanes = new Set<string>();
    let busy = 0;
    let gap = 0;
    let longest = 0;
    const kinds = new Set<MomentKind>();
    stroll(w, layer, 240, () => {
      const all = layer.all();
      for (const m of all) {
        lanes.add(m.lane);
        kinds.add(m.kind);
      }
      const near = all.some((m) => m.state !== "ending" && Math.hypot(m.x - w.me.x, m.y - w.me.y) < 15);
      if (near) busy++;
      gap = near ? 0 : gap + 1;
      longest = Math.max(longest, gap);
    });
    assert.ok(lanes.has("people") && lanes.has("passer") && lanes.has("wayside"), `streams seen: ${[...lanes].join(", ")}`);
    assert.ok(busy / 240 >= 0.8, `something near only ${((busy / 240) * 100).toFixed(0)}% of four minutes`);
    assert.ok(longest <= 25, `${longest} s with nothing near`);
    assert.ok(kinds.size >= 8, `only ${kinds.size} kinds in four minutes: ${[...kinds].join(", ")}`);
  } finally {
    layer.dispose?.();
    w.restore();
  }
});

test("C87: someone coming along stops to meet the stranger and says their line; let go unanswered, it is reported once, with its arm", async () => {
  const lines: string[] = [];
  const target = new EventTarget();
  target.addEventListener("echo:moment-line", (e) => lines.push((e as CustomEvent<{ text: string }>).detail.text));
  (globalThis as { window?: unknown }).window = target;
  const probe = village();
  const start = startOf(probe.plan);
  const w = world(start);
  w.me.heading = start.heading;
  const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
  const passed: { kind: string; arm: string | null }[] = [];
  layer.onPassed((kind, _ref, _d, arm) => passed.push({ kind, arm: arm?.id ?? null }));
  try {
    await layer.build(w.ctx as never, new AbortController().signal);
    // Standing still: whoever comes along meets the stranger where they stand.
    let met = false;
    for (let k = 0; k < 400 && !met; k++) {
      w.run(layer, 1);
      const p = layer.all().find((m) => m.lane === "passer");
      if (p && Math.hypot(p.x - w.me.x, p.y - w.me.y) < 3.6) met = true;
    }
    assert.ok(met, "nobody came along in four minutes and more");
    const p = layer.all().find((m) => m.lane === "passer")!;
    // They stand a while, offering what can be done, then go on; a greeting unanswered is data.
    const offered = layer.things(w.me.x, w.me.y).find((t) => t.kind === p.kind);
    assert.ok(offered, `${p.kind} stopped and offered nothing`);
    if (MOMENTS[p.kind].arms) assert.equal(offered!.arm?.id, p.arm, "the arm it carries is not its own");
    const said = lines.length;
    w.run(layer, 12);
    if (MOMENTS[p.kind].passed) {
      assert.equal(passed.filter((x) => x.kind === p.kind).length, 1, `${p.kind} let go unanswered was not reported once`);
      assert.equal(passed.find((x) => x.kind === p.kind)!.arm, p.arm);
    }
    assert.ok(said > 0 || p.kind === "narrow-way", `${p.kind} said nothing as it met the stranger`);
  } finally {
    layer.dispose?.();
    w.restore();
    delete (globalThis as { window?: unknown }).window;
  }
});

test("C87: a loaf taken to someone's mother is a promise: handed over at her door it is kept; never brought, it is broken once", async () => {
  for (const keep of [true, false]) {
    const probe = village();
    const start = startOf(probe.plan);
    const w = world(start);
    w.me.heading = start.heading;
    const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
    const broken: string[] = [];
    layer.onBroken((kind) => broken.push(kind));
    try {
      await layer.build(w.ctx as never, new AbortController().signal);
      // Moments come one after another: answer each, until the woman with the loaf is at her door.
      let found = false;
      for (let round = 0; round < 60 && !found; round++) {
        w.run(layer, 30, () => layer.things(w.me.x, w.me.y).some((t) => t.ref.startsWith("moment:") && MOMENTS[t.kind as MomentKind]?.lane === "people"));
        const t = layer.things(w.me.x, w.me.y).find((x) => x.ref.startsWith("moment:") && MOMENTS[x.kind as MomentKind]?.lane === "people");
        if (!t) continue;
        if (t.kind === "bread-errand") {
          found = true;
          layer.acted(t.ref, "take");
          break;
        }
        layer.acted(t.ref, verbsOf(t.kind)[0]!.id);
      }
      assert.ok(found, "no loaf to take in sixty moments");
      const e = layer.errand();
      assert.ok(e && e.kind === "carry" && e.from === "bread-errand", "taking the loaf sent the stranger nowhere");
      const d = Math.hypot(e!.x - w.me.x, e!.y - w.me.y);
      assert.ok(d >= MOMENT.errandM[0] - 2 && d <= MOMENT.errandM[1] + 6, `her mother's door is ${d.toFixed(0)} m off`);
      if (keep) {
        // Walk there; she is offered as someone to hand the loaf to, and taking it is the promise kept.
        w.me.x = e!.x + 1.5;
        w.me.y = e!.y;
        w.run(layer, 1);
        const mother = layer.things(w.me.x, w.me.y).find((t) => t.kind === "bread-mother");
        assert.ok(mother, "no one waiting at the door");
        assert.equal(verbsOf("bread-mother")[0]!.measure.action, "promise_kept");
        layer.acted(mother!.ref, "give-bread");
        assert.equal(layer.errand(), null, "the errand went on after the loaf was handed over");
        w.run(layer, MOMENT.errandWaitS + 10);
        assert.deepEqual(broken, [], "a promise kept was reported broken");
      } else {
        w.run(layer, MOMENT.errandWaitS + 10);
        assert.deepEqual(broken, ["bread-errand"], "a promise never kept was not reported broken once");
        assert.equal(layer.errand(), null);
      }
    } finally {
      layer.dispose?.();
      w.restore();
    }
  }
});

test("C87: every line a moment's people say has its Turkish", () => {
  assert.ok(MOMENT_LINES.length >= 20);
  for (const l of MOMENT_LINES) assert.notEqual(beatText("tr", l), l, `"${l}" has no Turkish`);
});

/** Answer each moment ahead in turn until one of `kind` is offered; null if none came in `rounds`. */
function meetKind(w: ReturnType<typeof world>, layer: ReturnType<typeof momentsLayer>, kind: MomentKind, rounds = 80) {
  for (let round = 0; round < rounds; round++) {
    w.run(layer, 30, () => layer.all().some((m) => m.lane === "people" && m.kind === kind) || layer.things(w.me.x, w.me.y).some((t) => t.ref.startsWith("moment:") && MOMENTS[t.kind as MomentKind]?.lane === "people"));
    const m = layer.all().find((x) => x.lane === "people" && x.kind === kind);
    if (m) return m;
    const t = layer.things(w.me.x, w.me.y).find((x) => x.ref.startsWith("moment:") && MOMENTS[x.kind as MomentKind]?.lane === "people");
    if (t) layer.acted(t.ref, verbsOf(t.kind)[0]!.id);
  }
  return null;
}

test("C87: the old man stops his tale before the end and tells it to whoever waits; the knucklebone is answered only once thrown, and a lie the children saw is known", async () => {
  const lines: string[] = [];
  const target = new EventTarget();
  target.addEventListener("echo:moment-line", (e) => lines.push((e as CustomEvent<{ text: string }>).detail.text));
  (globalThis as { window?: unknown }).window = target;
  const probe = village();
  const start = startOf(probe.plan);
  try {
    // The tale: its beginning as the stranger comes near, the pause, and the end for one who stays.
    {
      const w = world(start);
      w.me.heading = start.heading;
      const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
      await layer.build(w.ctx as never, new AbortController().signal);
      const m = meetKind(w, layer, "unfinished-tale");
      assert.ok(m, "no tale in eighty moments");
      w.me.x = m!.x + 3;
      w.me.y = m!.y;
      lines.length = 0;
      w.run(layer, 40, () => lines.length > 0);
      assert.ok(lines[0]?.startsWith("…"), `the tale began "${lines[0]}"`);
      w.run(layer, 12);
      assert.ok(lines.includes("Wait, wait — let me light my pipe."), "he never stopped before the end");
      assert.ok(layer.things(w.me.x, w.me.y).some((t) => t.kind === "unfinished-tale"), "nobody could ask him how it ends");
      w.run(layer, 50);
      // Others about speak too (someone coming along); the tale's own end comes after its pause.
      const pause = lines.indexOf("Wait, wait — let me light my pipe.");
      assert.ok(lines.slice(pause + 1).some((l) => /Hoca/.test(l)), `the end was never told to one who waited: ${lines.join(" | ")}`);
      layer.dispose?.();
      w.restore();
    }
    // The knucklebone: nothing to answer until it is thrown; then the truth or tava; a seen lie is known.
    for (let attempt = 0; attempt < 3; attempt++) {
      const w = world(start);
      w.me.heading = start.heading;
      const layer = momentsLayer({ clock: worldClock(WORLD_EPOCH) });
      await layer.build(w.ctx as never, new AbortController().signal);
      const m = meetKind(w, layer, "knucklebones");
      assert.ok(m, "no knucklebones in eighty moments");
      w.run(layer, 20, () => layer.all().find((x) => x.kind === "knucklebones")?.state === "live");
      lines.length = 0;
      w.me.x = m!.x + 2;
      w.me.y = m!.y;
      w.run(layer, 0.5);
      if (lines.length === 0) w.run(layer, 1);
      assert.ok(!layer.things(w.me.x, w.me.y).some((t) => t.kind === "knucklebones"), "answerable before it was thrown");
      w.run(layer, 4);
      assert.ok(lines.some((l) => l.includes("Not tava")), `never thrown: ${lines.join(" | ")}`);
      const thing = layer.things(w.me.x, w.me.y).find((t) => t.kind === "knucklebones")!;
      assert.ok(thing, "not answerable once thrown");
      const said = layer.acted(thing.ref, "say-tava");
      assert.equal(said !== null, thing.arm?.id === "seen", `a lie ${thing.arm?.id} was ${said ? "" : "not "}known`);
      layer.dispose?.();
      w.restore();
      break;
    }
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
