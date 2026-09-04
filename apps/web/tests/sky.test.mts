/**
 * The sky and the day cycle (plan W4-4), proven without a GPU.
 *
 * A person played the demo blind and reported two things: "everywhere is empty" and "the sky is
 * orange". The second was a bug with a one-line cause, and the four assertions below are the four
 * ways that bug could come back:
 *
 *   1. DETERMINISM. One `t`, one sky. If the hour drifted with frame count or wall clock, no
 *      screenshot would be comparable to another and nobody could ever say a change looked better.
 *   2. GEOMETRY. The sun is highest at midday and under the ground at midnight. A cycle that got
 *      this backwards would still animate, which is exactly why it needs asserting rather than
 *      eyeballing.
 *   3. THE SEAM. Fog colour is the sky's horizon colour, exactly, at every hour. The disk of ground
 *      is finite; it dissolves only into the colour drawn immediately above it. Let these two drift
 *      apart by a hair and the world grows a visible rim. This is compared against the DOME's own
 *      uniform, not against an intermediate, so it is the colour that is really painted.
 *   4. NEVER BLACK. The bible bans 0x000000 outright and floors the world at PALETTE.shadow. The
 *      shipped build rendered the ground as a silhouette, so "there is still a world at 3 a.m." is
 *      a claim that gets a test rather than a comment.
 *
 * No WebGL: `THREE.Scene`, `Fog`, `Color`, lights and `ShaderMaterial` are all plain objects until
 * a renderer touches them, and the sky layer's build path never asks for one.
 *
 * Run:  node --import tsx --test apps/web/tests/sky.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "three";

import { PALETTE } from "../src/game/three/palette";
import {
  DAWN,
  DUSK,
  MIDDAY,
  MIDNIGHT,
  sceneLuminance,
  skyLayer,
  skyState,
  type SkyLayer,
} from "../src/game/world/skyLayer";
import type { LayerContext } from "../src/game/world/PlanetWorld";

// ── the smallest world a sky can be built into ──────────────────────────────────

/**
 * The sky layer reads exactly two things off the context: the scene it hangs the dome in and the
 * camera it re-centres the dome on. Everything else in `LayerContext` is terrain's business, so the
 * stub carries nothing else and the cast is honest rather than a way to dodge a type.
 */
function stubContext(scene: THREE.Scene): LayerContext {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
  return { scene, camera } as unknown as LayerContext;
}

interface Built {
  scene: THREE.Scene;
  sky: SkyLayer;
  key: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  fog: THREE.Fog;
  dome: THREE.Mesh;
  uniforms: Record<string, { value: THREE.Color & THREE.Vector3 & number }>;
}

async function build(options: Parameters<typeof skyLayer>[0] = {}): Promise<Built> {
  const scene = new THREE.Scene();
  // A host that has already made its provisional key, exactly as PlanetWorld does, so the test
  // exercises the "found by name" path rather than the "made one myself" path.
  const provisional = new THREE.DirectionalLight();
  provisional.name = "key";
  scene.add(provisional);

  const sky = skyLayer({ rate: 0, ...options });
  await sky.build(stubContext(scene), new AbortController().signal);

  const key = scene.getObjectByName("key") as THREE.DirectionalLight;
  const fill = scene.getObjectByName("fill") as THREE.HemisphereLight;
  const dome = scene.getObjectByName("sky") as THREE.Mesh;
  const fog = scene.fog as THREE.Fog;
  assert.ok(key?.isDirectionalLight, "the key light is found by name, not duplicated");
  assert.ok(fill?.isHemisphereLight, "the hemisphere fill is named 'fill'");
  assert.ok(dome, "there is a dome named 'sky'");
  // Duck-typed, not `instanceof`. This file is .mts and the layer is .ts, so under tsx the two end
  // up holding different module records of three (the ESM build and the CJS one) and `instanceof`
  // is false across them even though there is one copy of three installed. three's own internals
  // test the `isFog` / `isDirectionalLight` flags for exactly this reason; so does this test.
  assert.ok((fog as THREE.Fog | null)?.isFog, "the layer owns the fog");

  const material = dome.material as THREE.ShaderMaterial;
  return { scene, sky, key, fill, fog, dome, uniforms: material.uniforms as Built["uniforms"] };
}

/** Which way the key light actually shines from, read off the scene rather than off the layer. */
function keyFrom(built: Built): THREE.Vector3 {
  return built.key.position.clone().sub(built.key.target.position).normalize();
}

/** Every hour on the hour: the sampling the seam and the darkness are argued over. */
const HOURS = Array.from({ length: 24 }, (_, h) => h / 24);

// ── 1. one t, one sky ───────────────────────────────────────────────────────────

test("setTimeOfDay is deterministic: the same hour gives the same key, colour and fog", async () => {
  const built = await build();

  const read = () => ({
    dir: keyFrom(built).toArray(),
    intensity: built.key.intensity,
    keyColour: built.key.color.getHexString(),
    fillColour: built.fill.color.getHexString(),
    fillGround: built.fill.groundColor.getHexString(),
    fillIntensity: built.fill.intensity,
    fog: built.fog.color.getHexString(),
  });

  for (const t of [0.03, DAWN, 0.42, MIDDAY, DUSK, 0.91]) {
    built.sky.setTimeOfDay(t);
    const first = read();
    // Walk the cycle somewhere else entirely and come back. Nothing may carry over.
    built.sky.setTimeOfDay(t + 0.37);
    built.sky.setTimeOfDay(0.0);
    built.sky.setTimeOfDay(t);
    assert.deepEqual(read(), first, `t=${t} must render identically every time it is asked for`);
  }

  // And the wrap is a wrap, not a clamp: five whole days later is the same hour. Compared to a
  // tolerance rather than bit for bit, because `(t + 5) % 1` cannot round-trip a double exactly and
  // the last ulp of the sun's azimuth is not what this test is about.
  built.sky.setTimeOfDay(DUSK);
  const dusk = read();
  built.sky.setTimeOfDay(DUSK + 5);
  const later = read();
  assert.ok(Math.abs(built.sky.timeOfDay() - DUSK) < 1e-12, "t + 5 normalises back onto t");
  assert.equal(later.keyColour, dusk.keyColour);
  assert.equal(later.fog, dusk.fog);
  assert.ok(Math.abs(later.intensity - dusk.intensity) < 1e-9);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(later.dir[i]! - dusk.dir[i]!) < 1e-9);
});

test("the demo's default hour reproduces the art bible's key exactly", async () => {
  const built = await build();
  // (-1, 0.3, 0.22) normalised is the vector the terrain layer used to hardwire. DUSK is derived
  // from it rather than guessed at, so the hour the demo opens on IS the hour the bible describes.
  const bible = new THREE.Vector3(-1, 0.3, 0.22).normalize();
  assert.ok(
    keyFrom(built).distanceTo(bible) < 1e-9,
    `default hour points the key at ${keyFrom(built).toArray()}, bible says ${bible.toArray()}`,
  );
  assert.equal(built.key.color.getHexString(), new THREE.Color(PALETTE.dusk).getHexString());
  assert.equal(built.fog.color.getHexString(), new THREE.Color(PALETTE.skyHorizon).getHexString());

  // Dawn is its mirror: the same elevation, the other side of the sky.
  const sun = skyState(DUSK).sun.clone();
  const dawnSun = skyState(DAWN).sun;
  assert.ok(Math.abs(dawnSun.y - sun.y) < 1e-9, "dawn and dusk stand at the same height");
  assert.ok(dawnSun.x > 0 && sun.x < 0, "dawn is east, dusk is west");
});

// ── 2. the sun goes where a sun goes ────────────────────────────────────────────

test("the sun is highest at midday and below the horizon at midnight", () => {
  const midday = skyState(MIDDAY).sun.y;
  const midnight = skyState(MIDNIGHT).sun.y;

  assert.ok(midnight < 0, `midnight sun elevation must be under the ground, got ${midnight}`);
  assert.ok(midday > 0.9, `midday sun must be near overhead, got ${midday}`);

  // Not just higher than midnight: higher than every other hour of the day, sampled finely enough
  // that a cycle running backwards or half a turn out of phase cannot slip through.
  for (let i = 0; i < 1000; i++) {
    const t = i / 1000;
    if (Math.abs(t - MIDDAY) < 1e-9) continue;
    assert.ok(
      skyState(t).sun.y < midday,
      `t=${t} put the sun above midday (${skyState(t).sun.y} >= ${midday})`,
    );
  }

  // The sun is up for half the day and down for the other half, which is the sanity check that
  // catches a cycle that never sets.
  const up = HOURS.filter((t) => skyState(t).sun.y > 0).length;
  assert.equal(up, 12, `the sun should be up for twelve of the twenty-four sampled hours, got ${up}`);
});

test("the key light is the sun by day and the moon by night, and never two lights", async () => {
  const built = await build();
  for (const t of HOURS) {
    built.sky.setTimeOfDay(t);
    const sun = built.sky.sunDirection();
    const key = keyFrom(built);
    const facing = key.dot(sun);
    // Above the horizon the key IS the sun; below it, it is the anti-sun. Never anything else.
    // The horizon itself counts as day, and it is where the key's strength is zero anyway, so
    // nothing pops as the two swap over.
    if (sun.y >= 0) assert.ok(facing > 0.999, `t=${t}: by day the key must be the sun (${facing})`);
    else assert.ok(facing < -0.999, `t=${t}: by night the key must be the moon (${facing})`);
  }
  const suns = built.scene.children.filter((o) => (o as THREE.DirectionalLight).isDirectionalLight);
  assert.equal(suns.length, 1, "the bible allows exactly one key light; a second sun is the one ban");
});

// ── 3. the seam that must never show ────────────────────────────────────────────

test("fog is the sky's horizon colour, exactly, at every hour of the day", async () => {
  const built = await build();
  for (const t of HOURS) {
    built.sky.setTimeOfDay(t);
    const painted = built.uniforms.uHorizon!.value as unknown as THREE.Color;
    const fogged = built.fog.color;
    assert.ok(
      fogged.equals(painted),
      `t=${t}: fog #${fogged.getHexString()} against sky horizon #${painted.getHexString()}. ` +
        "Any difference at all is a visible rim where the disk of ground ends.",
    );
    // The background clear colour is the same colour again, so a frame that somehow misses the
    // dome still shows air rather than a hole.
    assert.ok((built.scene.background as THREE.Color).equals(painted), `t=${t}: background matches`);
  }
});

test("the horizon is never the zenith, so the gradient is a gradient", async () => {
  const built = await build();
  for (const t of HOURS) {
    built.sky.setTimeOfDay(t);
    const horizon = built.uniforms.uHorizon!.value as unknown as THREE.Color;
    const zenith = built.uniforms.uZenith!.value as unknown as THREE.Color;
    const spread =
      Math.abs(horizon.r - zenith.r) + Math.abs(horizon.g - zenith.g) + Math.abs(horizon.b - zenith.b);
    assert.ok(spread > 0.01, `t=${t}: the sky is a flat wall again, spread ${spread}`);
  }
});

// ── 4. never black ──────────────────────────────────────────────────────────────

test("no hour of the day leaves the ground unlit", () => {
  // The floor: what PALETTE.shadow itself is worth. The bible calls it ink and bans 0x000000, so
  // the world at its darkest may not fall below the darkest colour the world is allowed to contain.
  const ink = new THREE.Color(PALETTE.shadow);
  const floor = 0.2126 * ink.r + 0.7152 * ink.g + 0.0722 * ink.b;

  let darkest = Infinity;
  let darkestAt = 0;
  for (let i = 0; i < 480; i++) {
    const t = i / 480;
    const lit = sceneLuminance(skyState(t));
    if (lit < darkest) {
      darkest = lit;
      darkestAt = t;
    }
  }
  assert.ok(darkest > 0, "some hour renders a black world");
  assert.ok(
    darkest > floor,
    `the darkest hour (t=${darkestAt}) lights level ground to ${darkest}, at or under ` +
      `PALETTE.shadow's own ${floor}. That is a silhouette, not a night.`,
  );
});

test("the hemisphere's downward colour is ink with the hour in it, never black", async () => {
  const built = await build();
  for (const t of HOURS) {
    built.sky.setTimeOfDay(t);
    const g = built.fill.groundColor;
    assert.ok(g.r + g.g + g.b > 0, `t=${t}: the hemisphere shines pure black up from below`);
    // It must also stay DARKER than the sky half, or it stops being a bounce and starts being a
    // second fill that flattens every slope in the world.
    const s = built.fill.color;
    assert.ok(g.r + g.g + g.b < s.r + s.g + s.b, `t=${t}: the ground bounce outshines the sky`);
  }
});

test("midday is cooler and flatter than dusk, because this world is melancholic", () => {
  const dusk = skyState(DUSK);
  const midday = skyState(MIDDAY);
  const warmth = (c: THREE.Color) => c.r - c.b;
  assert.ok(warmth(midday.keyColour) < warmth(dusk.keyColour), "midday's key is cooler than dusk's");
  // Flatter: the sun's share of the total light is smaller, so shadows are shallower.
  const share = (s: ReturnType<typeof skyState>) =>
    s.keyIntensity * Math.max(s.keyFrom.y, 0) * s.keyColour.g /
    (s.keyIntensity * Math.max(s.keyFrom.y, 0) * s.keyColour.g + s.fillIntensity * s.fillSky.g);
  assert.ok(share(midday) < share(dusk), "midday leans on the fill more than dusk does");
  // And it is brighter than dusk without being a different game: under two and a half times.
  const ratio = sceneLuminance(midday) / sceneLuminance(dusk);
  assert.ok(ratio > 1 && ratio < 2.5, `midday/dusk luminance ratio is ${ratio}`);
});

// ── the cycle actually turns ────────────────────────────────────────────────────

test("the cycle runs at the rate it is given, and rate 0 freezes it", async () => {
  const frozen = await build({ timeOfDay: DUSK, rate: 0 });
  const ctx = stubContext(frozen.scene);
  for (let i = 0; i < 600; i++) frozen.sky.update?.(1 / 60, ctx);
  assert.equal(frozen.sky.timeOfDay(), DUSK, "rate 0 must hold the hour still for a screenshot");

  // The default is a full turn in twelve minutes: slow enough not to strobe, fast enough that two
  // minutes of play visibly moves the sun. Two minutes is a sixth of a turn.
  const running = await build({ timeOfDay: DUSK, rate: undefined });
  const ctx2 = stubContext(running.scene);
  for (let i = 0; i < 120 * 60; i++) running.sky.update?.(1 / 60, ctx2);
  const moved = running.sky.timeOfDay() - DUSK;
  assert.ok(
    Math.abs(moved - 1 / 6) < 1e-6,
    `two minutes should move the sky a sixth of a turn, moved ${moved}`,
  );
});

test("the dome sits inside the camera's far plane and draws behind everything", async () => {
  const built = await build();
  const geometry = built.dome.geometry as THREE.SphereGeometry;
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere!.radius;
  const far = new THREE.PerspectiveCamera(50, 1, 0.1, 6000).far;
  assert.ok(radius < far, `a ${radius} m dome would be clipped by a ${far} m far plane`);
  // Bigger than the ~2 km disk of ground, or the world would poke through its own sky.
  assert.ok(radius > 2200, `a ${radius} m dome is inside the disk of ground`);

  const material = built.dome.material as THREE.ShaderMaterial;
  assert.equal(material.side, THREE.BackSide, "seen from inside");
  assert.equal(material.depthWrite, false, "the sky must not occlude the world");
  assert.equal(material.fog, false, "fogging the sky would fade it into the colour it defines");
  assert.ok(built.dome.renderOrder < 0, "drawn before everything it sits behind");
  assert.equal(built.dome.frustumCulled, false, "it rides the camera, so it must never be culled");
});

test("dispose hands the air back, so a rebuild starts with nobody owning it", async () => {
  const built = await build();
  assert.notEqual(built.scene.background, null);
  built.sky.dispose?.();
  assert.equal(built.scene.background, null, "a null background is how terrain knows the air is free");
  assert.equal(built.scene.fog, null);
  assert.equal(built.scene.getObjectByName("sky"), undefined, "the dome is gone");
  assert.ok(built.scene.getObjectByName("key"), "the key light is the host's and stays");
});
