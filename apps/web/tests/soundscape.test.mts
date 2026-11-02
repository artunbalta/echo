/**
 * The sound of the place (DECISIONS C56): what each bed's level is for where and when the stranger
 * is (`lib/soundscape.ts`), and the sound layer itself against a stand-in WebAudio — silent until a
 * key or a click, the water found from the ground, the walls muffling, steps only when moving, a blow
 * heard from the side it is on, and the person's mute kept.
 *
 * Run:  node --import tsx --test apps/web/tests/soundscape.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { atDistance, darkness, earshotOf, groundAt, mixFor, toolOf, toolOfPose, type Hearing } from "../src/lib/soundscape";
import { soundLayer } from "../src/game/world/soundLayer";
import type { LayerContext } from "../src/game/world/PlanetWorld";

const DAY: Hearing = { hour: 0.5, seaM: null, weather: { kind: "clear", wind: 0.3, fall: 0 }, inside: false, fire: false, people: 0, talking: 0, coastal: true };

// ── the mix ─────────────────────────────────────────────────────────────────────

test("C56: the sea is loud at its edge, fainter up the beach, gone inland — and a storm makes it roar", () => {
  const at = (seaM: number | null, kind = "clear", wind = 0.3) => mixFor({ ...DAY, seaM, weather: { kind, wind, fall: 0 } }).sea;
  assert.equal(at(null), 0);
  assert.ok(at(2) > at(30) && at(30) > at(80) && at(80) > 0, `${at(2)} ${at(30)} ${at(80)}`);
  assert.equal(at(120), 0, "the sea heard from a hundred and twenty metres inland");
  assert.ok(at(10, "storm", 0.9) > at(10, "clear", 0.1), "a storm's sea no louder than a calm one's");
});

test("C56: the wind follows the weather's wind; rain its fall; snow falls nearly silent", () => {
  const w = (wind: number) => mixFor({ ...DAY, weather: { kind: "clear", wind, fall: 0 } }).wind;
  assert.ok(w(0.9) > w(0.4) && w(0.4) > w(0.05) && w(0.05) > 0);
  const rain = (kind: string, fall: number) => mixFor({ ...DAY, weather: { kind, wind: 0.3, fall } }).rain;
  assert.equal(rain("clear", 0), 0);
  assert.ok(rain("rain", 0.8) > rain("rain", 0.3) && rain("rain", 0.3) > 0);
  assert.ok(rain("snow", 0.8) < rain("rain", 0.8) / 4, "snow drumming like rain");
});

test("C56: the village murmurs with the people near and the talking, louder on the evening green, sent in by rain and by night", () => {
  const m = (h: Partial<Hearing>) => mixFor({ ...DAY, ...h }).murmur;
  assert.equal(m({ people: 0, talking: 0 }), 0, "a murmur with nobody there");
  assert.ok(m({ people: 6 }) > m({ people: 2 }));
  assert.ok(m({ people: 2, talking: 2 }) > m({ people: 2 }), "talking no louder than standing");
  assert.ok(m({ people: 3, talking: 1, hour: 0.72 }) > m({ people: 3, talking: 1 }), "the evening green is no livelier than noon");
  assert.ok(m({ people: 3, talking: 1, weather: { kind: "rain", wind: 0.3, fall: 0.9 } }) < m({ people: 3, talking: 1 }));
  assert.ok(m({ people: 3, talking: 1, hour: 0.02 }) < m({ people: 3, talking: 1 }) * 0.3, "midnight as loud as the day");
  assert.ok(m({ people: 30, talking: 3 }) > m({ people: 12, talking: 3 }), "thirty on the green no louder than a dozen");
  assert.ok(m({ people: 60, talking: 8 }) <= 1);
});

test("C56: what is heard of people is who is near — the nearer the more — and only the talk within earshot", () => {
  const people = [
    { id: "a", x: 1, y: 0, activity: "walk" },
    { id: "b", x: 20, y: 0, activity: "work" },
    { id: "c", x: 0, y: 45, activity: "work" },
  ];
  const e = earshotOf(people, [{ x: 3, y: 3 }, { x: 0, y: 80 }], 0, 0, 30);
  assert.ok(Math.abs(e.people - ((1 - 1 / 30) + (1 - 20 / 30))) < 1e-9, `${e.people}`);
  assert.equal(e.talking, 1, "a pair talking eighty metres off heard on the green");
  assert.deepEqual(e.working.map((p) => p.id), ["b"], "a worker out of earshot heard");
  assert.deepEqual(earshotOf([], [], 0, 0, 30), { people: 0, talking: 0, working: [] });
});

test("C56: insects by night (more inland), none in the rain or the snow; birds at first light", () => {
  const ins = (h: Partial<Hearing>) => mixFor({ ...DAY, ...h }).insects;
  assert.equal(ins({ hour: 0.5 }), 0, "crickets at noon");
  assert.ok(ins({ hour: 0.9, coastal: false }) > ins({ hour: 0.9, coastal: true }) && ins({ hour: 0.9, coastal: true }) > 0);
  assert.equal(ins({ hour: 0.9, weather: { kind: "rain", wind: 0.3, fall: 1 } }), 0);
  assert.equal(ins({ hour: 0.9, weather: { kind: "snow", wind: 0.3, fall: 0.4 } }), 0);
  const dawn = (hour: number) => mixFor({ ...DAY, hour }).dawn;
  assert.ok(dawn(0.27) > dawn(0.5) && dawn(0.5) > dawn(0.02), `${dawn(0.27)} ${dawn(0.5)} ${dawn(0.02)}`);
  assert.equal(darkness(0.5), 0);
  assert.equal(darkness(0.0), 1);
});

test("C56: indoors the outside comes through the walls, and the fire is in the room", () => {
  const out = mixFor({ ...DAY, seaM: 10 });
  const inn = mixFor({ ...DAY, seaM: 10, inside: true, fire: true });
  assert.equal(out.through, 1);
  assert.ok(inn.through < 0.4, "a house's walls let the whole outside in");
  assert.ok(inn.hearth > 0 && out.hearth === 0, "a hearth out of doors, or none inside");
  assert.equal(mixFor({ ...DAY, inside: true, fire: false }).hearth, 0, "a fire in an empty house");
});

test("C56: what is underfoot is the ground's: the dock's boards and a house's floor, the shallows, the beach, the grass, the snow", () => {
  assert.equal(groundAt({ heightM: 4, onDock: true, inside: false, nearSea: true, snow: false }), "wood");
  assert.equal(groundAt({ heightM: 9, onDock: false, inside: true, nearSea: false, snow: false }), "wood");
  assert.equal(groundAt({ heightM: 0.01, onDock: false, inside: false, nearSea: true, snow: false }), "water");
  assert.equal(groundAt({ heightM: 1.2, onDock: false, inside: false, nearSea: true, snow: false }), "sand");
  assert.equal(groundAt({ heightM: 1.2, onDock: false, inside: false, nearSea: false, snow: false }), "grass");
  assert.equal(groundAt({ heightM: 6, onDock: false, inside: false, nearSea: false, snow: true }), "snow");
  assert.equal(groundAt({ heightM: 6, onDock: false, inside: true, nearSea: false, snow: true }), "wood", "snow on a house's floor");
});

test("C56: a trade is heard by its tool, and only while at work; a near blow is louder than a far one", () => {
  assert.equal(toolOf("smith", "work"), "anvil");
  assert.equal(toolOf("smith", "eat"), null, "an anvil rung at supper");
  assert.equal(toolOf("farmer", "stoop"), "hoe");
  assert.equal(toolOf("farmer", "work"), null);
  assert.equal(toolOf("forester", "work"), "axe");
  assert.equal(toolOf("fisher", "work"), null);
  assert.equal(toolOfPose("dig"), "hoe");
  assert.equal(toolOfPose(null), null);
  assert.ok(atDistance(1) > atDistance(8) && atDistance(8) > atDistance(20) && atDistance(20) > 0);
  assert.equal(atDistance(25), 0);
  assert.ok(atDistance(0) > 0.85);
});

// ── the layer, against a stand-in WebAudio ─────────────────────────────────────

class Param {
  constructor(public value = 0) {}
  setTargetAtTime(v: number) { this.value = v; return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
}
class Node {
  out: Node[] = [];
  connect<T extends Node>(n: T): T { this.out.push(n); return n; }
  disconnect() {}
  start() {}
  stop() {}
}
class Biquad extends Node { type = "lowpass"; frequency = new Param(350); Q = new Param(1); }
class Gain extends Node { gain = new Param(1); }
class Panner extends Node { pan = new Param(0); }
class Osc extends Node { type = "sine"; frequency = new Param(440); }
class Source extends Node { buffer: unknown = null; loop = false; loopStart = 0; }
let contexts: FakeAudio[] = [];
class FakeAudio {
  currentTime = 0;
  sampleRate = 8000;
  state = "running";
  destination = new Node();
  biquads: Biquad[] = [];
  panners: Panner[] = [];
  constructor() { contexts.push(this); }
  createGain() { return new Gain(); }
  createBiquadFilter() { const b = new Biquad(); this.biquads.push(b); return b; }
  createStereoPanner() { const p = new Panner(); this.panners.push(p); return p; }
  createOscillator() { return new Osc(); }
  createBufferSource() { return new Source(); }
  createAnalyser() {
    return Object.assign(new Node(), { fftSize: 2048, getFloatTimeDomainData: (b: Float32Array) => b.fill(0) });
  }
  createDynamicsCompressor() { return new Node(); }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d }; }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() { return Promise.resolve(); }
}

const handlers = new Map<string, () => void>();
const kept = new Map<string, string>();
const page = { hidden: false, handlers: new Map<string, () => void>() };
const saved = { document: (globalThis as { document?: unknown }).document, window: (globalThis as { window?: unknown }).window, storage: (globalThis as { localStorage?: unknown }).localStorage, random: Math.random };

// The ground: land west of x = 60 m, the sea east of it. One tile is a metre; tiles run south.
const SEA_X = 60;
type World = { me: { x: number; y: number }; vx: number; vy: number; anim: number; jumpT: number; aboard: boolean; activity: string | null; hour: number; house: boolean; flashes: number; working: { id: string; occupation: string; activity: string; x: number; y: number }[] };
let w: World;
const ctx = {
  camera: new THREE.PerspectiveCamera(), // looks down −z: north
  seed: "echo-planet-0001",
  region: { cell: "test", village: { plan: { dock: null }, settlement: null }, geography: null },
  frame: {
    tileM: 1,
    fromLocalM: (x: number, y: number) => [x, -y] as [number, number],
    toLocalM: (x: number, y: number) => [x, -y] as [number, number],
    heightAtTile: (x: number) => (x > SEA_X ? -2 : 1 + (SEA_X - x) * 0.05),
  },
  layer: (name: string) =>
    ({
      sky: { timeOfDay: () => w.hour },
      villagers: { playerPosition: () => w.me, earshot: () => ({ people: 0, talking: 0, working: w.working }) },
      // The gait as the player layer keeps it: a foot lands each half turn of animTime × 9.
      player: { mover: () => ({ vx: w.vx, vy: w.vy, activity: w.activity, jumpT: w.jumpT }), footfalls: () => Math.floor((w.anim * 9) / Math.PI), aboard: () => w.aboard },
      settlement: { houseAt: () => (w.house ? { plot: 3 } : null) },
      interior: { inside: () => (w.house ? { plot: 3, room: { empty: false } } : null) },
      animals: { audible: () => [] },
      weather: { lightning: () => w.flashes },
    })[name],
} as unknown as LayerContext;

before(() => {
  (globalThis as { window?: unknown }).window = {
    AudioContext: FakeAudio,
    addEventListener: (type: string, fn: () => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  (globalThis as { document?: unknown }).document = {
    get hidden() {
      return page.hidden;
    },
    addEventListener: (type: string, fn: () => void) => page.handlers.set(type, fn),
    removeEventListener: (type: string) => page.handlers.delete(type),
  };
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) };
  Math.random = () => 0.99; // nothing by chance: no dawn chirp, no crackle, no call
});
after(() => {
  (globalThis as { window?: unknown }).window = saved.window;
  (globalThis as { document?: unknown }).document = saved.document;
  (globalThis as { localStorage?: unknown }).localStorage = saved.storage;
  Math.random = saved.random;
});
beforeEach(() => {
  contexts = [];
  handlers.clear();
  page.hidden = false;
  page.handlers.clear();
  kept.clear();
  w = { me: { x: 0, y: 0 }, vx: 0, vy: 0, anim: 0, jumpT: -1, aboard: false, activity: null, hour: 0.5, house: false, flashes: 0, working: [] };
});

const run = (layer: ReturnType<typeof soundLayer>, seconds: number, dt = 0.05) => {
  for (let s = 0; s < seconds; s += dt) {
    const speed = Math.hypot(w.vx, w.vy);
    if (speed > 0.1 && !w.activity) w.anim += dt * (1 + Math.min(1, Math.max(0, (speed - 1.65) / 2.55)) * 0.7);
    layer.update!(dt, ctx);
    if (contexts[0]) contexts[0].currentTime += dt;
  }
};
const started = async () => {
  const layer = soundLayer({ clock: { epochMs: 0, daySeconds: 720 } as never });
  await layer.build(ctx, new AbortController().signal);
  handlers.get("pointerdown")!();
  return layer;
};

test("C56: with no WebAudio there is no sound and nothing else changes; with it, nothing plays before a key or a click", async () => {
  const bare = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = undefined;
  const silent = soundLayer({ clock: { epochMs: 0, daySeconds: 720 } as never });
  await silent.build(ctx, new AbortController().signal);
  silent.update!(0.1, ctx);
  assert.equal(silent.debug().started, false);
  silent.dispose!();
  (globalThis as { window?: unknown }).window = bare;

  const layer = soundLayer({ clock: { epochMs: 0, daySeconds: 720 } as never });
  await layer.build(ctx, new AbortController().signal);
  run(layer, 1);
  assert.equal(layer.debug().started, false, "the page made a sound before anyone touched it");
  assert.equal(contexts.length, 0);
  handlers.get("keydown")!();
  run(layer, 1.2);
  assert.equal(layer.debug().started, true);
  layer.dispose!();
  assert.equal(handlers.size, 0, "the layer still listens after it is gone");
});

test("C56: the water is found from the ground: near the shore the sea is loud, inland it is gone", async () => {
  const layer = await started();
  w.me = { x: SEA_X - 6, y: 0 };
  run(layer, 1.5);
  const near = layer.debug();
  assert.ok(near.seaM !== null && near.seaM <= 14, `the sea is ${near.seaM} m away from a stranger six metres from it`);
  w.me = { x: -300, y: 0 };
  run(layer, 1.5);
  const far = layer.debug();
  assert.equal(far.seaM, null);
  assert.ok(near.mix!.sea > 0.3 && far.mix!.sea === 0, `${near.mix!.sea} ${far.mix!.sea}`);
  assert.equal(near.ground, "sand");
  assert.equal(far.ground, "grass");
});

test("C56: inside a house the outside is muffled and the floor is wood", async () => {
  const layer = await started();
  w.me = { x: SEA_X - 6, y: 0 };
  run(layer, 1.5);
  const walls = contexts[0].biquads[0];
  assert.ok(walls.frequency.value > 10000, "the walls muffle the outside out of doors");
  w.house = true;
  run(layer, 0.6);
  assert.ok(walls.frequency.value < 1000, `the walls let ${walls.frequency.value} Hz through`);
  assert.ok(layer.debug().mix!.through < 0.4 && layer.debug().mix!.hearth > 0);
  assert.equal(layer.debug().ground, "wood");
});

test("C56: a step is heard each time the gait puts a foot down — none standing still, more running; the oars every third stroke; a jump lands", async () => {
  const layer = await started();
  run(layer, 0.5);
  const base = layer.debug().shots;
  run(layer, 3);
  assert.equal(layer.debug().shots, base, "steps from a body standing still");
  const falls = () => Math.floor((w.anim * 9) / Math.PI);
  w.vx = 1.4;
  let f0 = falls();
  run(layer, 3);
  const walked = layer.debug().shots - base;
  assert.equal(walked, falls() - f0, "a step heard that no foot made, or a foot that made no sound");
  w.vx = 5;
  const before = layer.debug().shots;
  f0 = falls();
  run(layer, 3);
  const ran = layer.debug().shots - before;
  assert.equal(ran, falls() - f0);
  assert.ok(walked >= 6 && ran > walked * 1.4, `walked ${walked}, ran ${ran}`);
  w.aboard = true;
  const rowing = layer.debug().shots;
  f0 = falls();
  run(layer, 3);
  const strokes = layer.debug().shots - rowing;
  assert.ok(strokes > 0 && strokes <= Math.ceil((falls() - f0) / 3), `${strokes} splashes for ${falls() - f0} strokes`);
  w.aboard = false;
  w.vx = 0;
  run(layer, 0.5);
  const still = layer.debug().shots;
  w.jumpT = 0.2;
  run(layer, 0.1);
  w.jumpT = -1;
  run(layer, 0.1);
  assert.equal(layer.debug().shots, still + 1, "a jump that lands without a sound");
});

test("C56: a smith at work to the east is heard on the right as the camera faces north, to the west on the left, and not at all at supper", async () => {
  const layer = await started();
  w.working = [{ id: "p:4", occupation: "smith", activity: "work", x: 6, y: 0 }];
  run(layer, 0.4);
  const panners = contexts[0].panners;
  const firstBlow = panners.length;
  run(layer, 1.5);
  assert.ok(panners.length > firstBlow, "no anvil rang");
  const pan = panners[panners.length - 1].pan.value;
  assert.ok(pan > 0.3, `a blow to the east heard at pan ${pan}`);
  w.working = [{ id: "p:4", occupation: "smith", activity: "work", x: -6, y: 0 }];
  const west = panners.length;
  run(layer, 1.5);
  assert.ok(panners.length > west && panners[panners.length - 1].pan.value < -0.3, "a blow to the west not heard on the left");
  w.working = [{ id: "p:4", occupation: "smith", activity: "eat", x: 6, y: 0 }];
  const supper = layer.debug().shots;
  run(layer, 2);
  assert.equal(layer.debug().shots, supper, "the anvil rang through supper");
});

test("C56: thunder follows a flash", async () => {
  const layer = await started();
  run(layer, 0.5);
  const base = layer.debug().shots;
  w.flashes = 1;
  run(layer, 0.5);
  assert.ok(layer.debug().shots >= base + 2, "lightning with no thunder");
});

test("C56: the person's mute is theirs, kept in this browser, and heard at once", async () => {
  const layer = await started();
  layer.setMuted(true);
  assert.equal(layer.muted(), true);
  assert.equal(kept.get("echo.sound"), "off");
  const again = soundLayer({ clock: { epochMs: 0, daySeconds: 720 } as never });
  assert.equal(again.muted(), true, "the mute forgotten on the next visit");
  layer.setMuted(false);
  assert.equal(kept.get("echo.sound"), "on");
});

test("C56: a hidden tab and a muted page stop the sound entirely, and it comes back when shown or unmuted", async () => {
  const layer = await started();
  run(layer, 0.5);
  const ac = contexts[0];
  page.hidden = true;
  page.handlers.get("visibilitychange")!();
  assert.equal(ac.state, "suspended", "the sea goes on breaking in a tab nobody is looking at");
  page.hidden = false;
  page.handlers.get("visibilitychange")!();
  assert.equal(ac.state, "running");
  layer.setMuted(true);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(ac.state, "suspended", "a muted page still running its sound");
  page.hidden = true;
  page.handlers.get("visibilitychange")!();
  page.hidden = false;
  page.handlers.get("visibilitychange")!();
  assert.equal(ac.state, "suspended", "showing the tab again unmuted a muted page");
  layer.setMuted(false);
  assert.equal(ac.state, "running");
  layer.dispose!();
  assert.equal(page.handlers.size, 0);
});
