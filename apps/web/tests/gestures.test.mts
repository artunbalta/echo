/**
 * Every act is its own motion, and is really done (DECISIONS C98): the rig's gestures against the
 * registry's list, what each does with the hand, where the body stands to do it, and the villagers'
 * own tasks.
 *
 * The complaint this holds against: "every job is the same back and forth". So the test that matters
 * measures it: the rig is moved through each gesture and no two of them may put the body and the hands
 * through the same path.
 *
 * Run:  node --import tsx --test apps/web/tests/gestures.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { GESTURES, GESTURE_HANDS, OCCUPATIONS, allThingKinds, verbsOf, type Gesture } from "@echo/planet";

import { buildCharacter, poseCharacter } from "../src/game/three/character";
import { MOVED, gestureCharacter, handPoint } from "../src/game/three/gestures";
import { Crowd, TASK_OF_TRADE, lookFor, taskPose, type Task } from "../src/game/world/crowd";
import { workThings } from "../src/game/world/workThings";
import { actFor } from "../src/lib/actSites";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const read = (path: string) => readFileSync(resolve(SRC, path), "utf8");

/** The rig taken through a gesture: where the hands and the body are at sixteen moments of it. */
function travel(g: Gesture, holdS: number, variant?: string): { path: number[]; grip: boolean; released: number; progress: number } {
  const p = buildCharacter("test", true);
  const hand = new THREE.Vector3();
  const other = new THREE.Vector3();
  const path: number[] = [];
  let grip = false;
  let released = 0;
  let progress = 0;
  const length = holdS > 0 ? holdS : 3;
  for (let i = 1; i <= 16; i++) {
    const t = (i / 16) * length * 0.999;
    poseCharacter(p, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
    p.body.position.x = 0;
    p.body.position.z = 0;
    const s = gestureCharacter(p, g, { t, holdS, ahead: 0.34, side: 0, up: 0, variant });
    handPoint(p, false, hand);
    p.handL.getWorldPosition(other);
    path.push(hand.x, hand.y, hand.z, other.x, other.y, other.z, p.body.position.y, p.torso.rotation.x, p.body.rotation.y, p.legR.rotation.x, p.head.rotation.x * 0.3, p.head.rotation.y * 0.3);
    grip ||= s.grip;
    released = Math.max(released, s.released);
    progress = Math.max(progress, s.progress);
    for (const v of path.slice(-12)) assert.ok(Number.isFinite(v), `${g}: the rig went somewhere that is not a number at t=${t.toFixed(2)}`);
  }
  return { path, grip, released, progress };
}

const firstVerb = new Map<Gesture, { holdS: number; id: string }>();
for (const k of allThingKinds()) for (const v of verbsOf(k)) if (!firstVerb.has(v.gesture)) firstVerb.set(v.gesture, { holdS: v.holdS, id: v.id });

test("the rig moves every gesture the registry names, and nothing else", () => {
  assert.deepEqual([...MOVED].sort(), [...GESTURES].sort());
});

test("no two acts are the same motion: every gesture takes the body and the hands its own way", () => {
  const travelled = new Map<Gesture, number[]>();
  for (const g of GESTURES) {
    const v = firstVerb.get(g)!;
    travelled.set(g, travel(g, v.holdS > 0 ? Math.max(1.5, v.holdS) : 0, v.id).path);
  }
  const apart = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]!) ** 2, 0) / a.length);
  let nearest = { d: Infinity, a: "", b: "" };
  for (const [a, pa] of travelled) {
    for (const [b, pb] of travelled) {
      if (a >= b) continue;
      const d = apart(pa, pb);
      if (d < nearest.d) nearest = { d, a, b };
      // Root-mean-square distance over the whole path, in rig units: a hand's width at every moment, or more.
      assert.ok(d > 0.02, `"${a}" and "${b}" are one motion (${d.toFixed(4)} apart)`);
    }
  }
  assert.ok(nearest.d > 0.02, `${nearest.a}/${nearest.b}`);
});

test("what a gesture does with the hand is what the registry says it does", () => {
  for (const g of GESTURES) {
    const v = firstVerb.get(g)!;
    const went = travel(g, v.holdS > 0 ? Math.max(1.5, v.holdS) : 0, v.id);
    const hands = GESTURE_HANDS[g];
    if (hands === "takes") assert.ok(went.grip, `"${g}" takes a thing and the hand never closes on one`);
    if (hands === "flies" || hands === "leaves") assert.ok(went.released >= 1, `"${g}" lets a thing go and nothing leaves the hand`);
    assert.ok(went.progress >= 0 && went.progress <= 1.0001, `"${g}" progress ${went.progress}`);
  }
  // One reach for each jar: three jars are three reaches, and one jar is one.
  const reaches = (variant: string, holdS: number) => {
    const p = buildCharacter("jars", true);
    let n = 0;
    let was = false;
    for (let i = 0; i <= 200; i++) {
      poseCharacter(p, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
      const s = gestureCharacter(p, "take", { t: (i / 200) * holdS, holdS, ahead: 0.38, side: 0, up: 0.56, variant });
      if (s.grip && !was) n++;
      was = s.grip;
    }
    return n;
  };
  assert.equal(reaches("one-jar", 1.2), 1);
  assert.equal(reaches("three-jars", 1.8), 3);
});

test("a hand that takes a thing goes to where the thing is", () => {
  // A jar on a stall 0.9 m up and 0.6 m ahead: at the moment the hand closes, it is within a hand's width of it.
  const p = buildCharacter("reach", true);
  p.root.scale.setScalar(1.6);
  const hand = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 0; i <= 120; i++) {
    poseCharacter(p, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
    gestureCharacter(p, "take", { t: (i / 120) * 1.2, holdS: 1.2, ahead: 0.6 / 1.6, side: 0, up: 0.9 / 1.6, variant: "one-jar" });
    handPoint(p, false, hand);
    nearest = Math.min(nearest, hand.distanceTo(new THREE.Vector3(0, 0.9, 0.6)));
  }
  assert.ok(nearest < 0.16, `the hand came no nearer the jar than ${nearest.toFixed(2)} m`);
  // And something on the ground is picked up from the ground: the hand comes down to it.
  let lowest = Infinity;
  for (let i = 0; i <= 120; i++) {
    poseCharacter(p, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
    gestureCharacter(p, "pick-up", { t: (i / 120) * 1.2, holdS: 1.2, ahead: 0.5 / 1.6, side: 0, up: 0 });
    lowest = Math.min(lowest, handPoint(p, false, hand).y);
  }
  assert.ok(lowest < 0.22, `the hand came no lower than ${lowest.toFixed(2)} m`);
});

test("the body steps up to what it does by hand, and does the rest from where it stands", () => {
  const verb = (kind: Parameters<typeof verbsOf>[0], id: string) => verbsOf(kind).find((v) => v.id === id)!;
  const jar = actFor(verb("honey-stall", "one-jar"), { ref: "moment:x", kind: "honey-stall", sizeM: 1.2 }, null);
  assert.deepEqual({ gesture: jar.gesture, item: jar.item, standM: jar.standM, upM: jar.upM, owned: jar.owned }, { gesture: "take", item: "jar", standM: 0.62, upM: 0.9, owned: true });
  // A ball is thrown back from where it lies, to where the moment says.
  const ball = actFor(verb("ball-game", "to-alone"), { ref: "moment:y", kind: "ball-game", sizeM: 0.7 }, null, { x: 3, y: 4, upM: 0.8 });
  assert.equal(ball.gesture, "throw");
  assert.equal(ball.item, "ball");
  assert.equal(ball.standM, 0.5);
  assert.deepEqual(ball.aim, { x: 3, y: 4, upM: 0.8 });
  // What is said is said from where one is.
  for (const v of verbsOf("greeting")) assert.equal(actFor(v, { ref: "moment:z", kind: "greeting", sizeM: 0.7 }, null).standM, null, v.id);
  // The well is drunk from at its rim.
  const well = actFor(verb("well", "drink"), { ref: "well", kind: "well", sizeM: 1.2 }, null);
  assert.equal(well.gesture, "draw-water");
  assert.ok(well.standM !== null && well.standM <= 1.1 && well.upM > 0.6);
  // Every verb of every thing gives the body an act, and one that moves a thing has the thing to show.
  for (const k of allThingKinds()) {
    for (const v of verbsOf(k)) {
      const act = actFor(v, { ref: `${k}:0`, kind: k, sizeM: 0.5 }, v.needs === "carrying" ? "bread" : null);
      assert.equal(act.gesture, v.gesture);
      if (GESTURE_HANDS[v.gesture]) assert.ok(act.item, `${k}/${v.id}: "${v.gesture}" moves a thing and there is nothing to draw in the hand`);
      if (act.standM !== null) assert.ok(act.standM >= 0.4 && act.standM <= 1.1, `${k}/${v.id} stands ${act.standM} m off`);
    }
  }
});

test("the village's work is each trade's own: no two tasks are the same motion, and every trade has one", () => {
  for (const o of OCCUPATIONS) assert.ok(TASK_OF_TRADE[o], `a ${o} at work has no task`);
  const tasks = [...new Set(Object.values(TASK_OF_TRADE)), "lay", "draw", "push", "knead", "hoe"] as Task[];
  const sig = (task: Task) => {
    const out: number[] = [];
    for (let i = 0; i < 24; i++) {
      const s = taskPose(task, i * 0.11);
      out.push(s.torso, s.twist, s.knee, ...s.L, ...s.R);
    }
    return out;
  };
  const sigs = new Map(tasks.map((x) => [x, sig(x)] as const));
  for (const [a, pa] of sigs) {
    for (const [b, pb] of sigs) {
      if (a >= b) continue;
      const d = Math.sqrt(pa.reduce((sum, x, i) => sum + (x - pb[i]!) ** 2, 0) / pa.length);
      assert.ok(d > 0.05, `the tasks "${a}" and "${b}" are one motion (${d.toFixed(3)})`);
    }
  }
});

test("someone at work has the thing they work at under their hands, and the tool in the hand", () => {
  const scene = new THREE.Scene();
  const work = workThings(scene);
  const crowd = new Crowd(1, 1.6);
  const grip = new THREE.Matrix4();
  const right = new THREE.Vector3();
  const left = new THREE.Vector3();
  const at = new THREE.Vector3();
  const box = new THREE.Box3();
  const kit = () => scene.getObjectByName("villagers:work")!.children.filter((o) => o.visible);
  /** One body at `task`, `t` seconds in, facing +z at the origin, with its things. */
  const frame = (task: Task | null, t: number) => {
    crowd.begin();
    work.begin();
    if (task) {
      crowd.pose({ x: 0, y: 0, z: 0, yaw: 0, activity: task === "weed" ? "stoop" : "work", speed: 0, time: t, phase0: 0, task }, { ...lookFor("t", "farmer", 30, "m"), scale: 1 });
      crowd.hands(grip, right, left);
      work.put(task, { x: 0, y: 0, z: 0 }, 0, 1, t, grip, right, left);
    }
    crowd.end();
    work.end();
    scene.updateMatrixWorld(true);
  };
  // Every trade's work has something to it.
  for (const task of new Set(Object.values(TASK_OF_TRADE))) {
    frame(task, 0.3);
    assert.ok(kit().length > 0, `"${task}" is done to nothing and with nothing`);
    frame(null, 0.3);
    assert.equal(kit().length, 0, `"${task}": its things stay when nobody is at it`);
  }
  // The pot is between the potter's palms, at their height.
  frame("turn", 0.3);
  box.setFromObject(kit()[0]!.children.find((o) => o.type === "Group")!);
  const palms = right.clone().add(left).multiplyScalar(0.5);
  assert.ok(Math.hypot(box.getCenter(at).x - palms.x, at.z - palms.z) < 0.08, "the pot is not between the potter's hands");
  assert.ok(palms.y > box.min.y && palms.y < box.max.y + 0.02, `palms at ${palms.y.toFixed(2)}, the pot from ${box.min.y.toFixed(2)} to ${box.max.y.toFixed(2)}`);
  assert.ok(Math.abs(right.x) > box.max.x - 0.02, "a hand is inside the pot's wall");
  // A tool is where the hand is, all the way through the stroke; and the hammer's head comes down onto the anvil.
  let lowest = Infinity;
  for (let i = 0; i < 40; i++) {
    for (const task of ["hammer", "saw", "pick", "grind"] as const) {
      frame(task, i * 0.05);
      const tool = kit().find((o) => !o.matrixAutoUpdate)!;
      assert.ok(at.setFromMatrixPosition(tool.matrixWorld).distanceTo(right) < 1e-6, `the ${task}'s tool is not in the hand`);
      if (task !== "hammer") continue;
      box.setFromObject(tool);
      lowest = Math.min(lowest, box.min.y);
    }
  }
  frame("hammer", 0);
  const anvil = box.setFromObject(kit().find((o) => o.matrixAutoUpdate)!).max.y;
  assert.ok(Math.abs(lowest - anvil) < 0.08, `the hammer stops ${(lowest - anvil).toFixed(2)} m from the anvil's top`);
  // The saw is in the log at every moment of the stroke, and the pick's point reaches the rock.
  for (let i = 0; i < 40; i++) {
    frame("saw", i * 0.05);
    const log = new THREE.Box3().setFromObject(kit().find((o) => o.matrixAutoUpdate)!.children[2]!);
    const blade = box.setFromObject(kit().find((o) => !o.matrixAutoUpdate)!.children[0]!);
    assert.ok(blade.min.z < log.min.z && blade.max.z > log.max.z - 0.02, "the saw's blade is not across the log");
    assert.ok(blade.min.y < log.max.y + 0.02 && blade.min.y > log.min.y, `the blade's edge at ${blade.min.y.toFixed(2)}, the log from ${log.min.y.toFixed(2)} to ${log.max.y.toFixed(2)}`);
  }
  let nearest = Infinity;
  for (let i = 0; i < 60; i++) {
    frame("pick", i * 0.03);
    const rock = new THREE.Box3().setFromObject(kit().find((o) => o.matrixAutoUpdate)!.children[0]!);
    nearest = Math.min(nearest, rock.distanceToPoint(box.setFromObject(kit().find((o) => !o.matrixAutoUpdate)!.children[1]!).getCenter(at)));
  }
  assert.ok(nearest < 0.25, `the pick's head never comes within ${nearest.toFixed(2)} m of the rock`);
  // Left alone, the anvil stands where it stood and the hammer has gone with the hand; a rope nobody holds is not in the air.
  for (const task of ["hammer", "haul", "sweep"] as const) {
    frame(task, 0.2);
    const whole = box.setFromObject(scene.getObjectByName("villagers:work")!).getSize(at).length();
    work.begin();
    work.rest(task, { x: 0, y: 0, z: 0 }, 0, 1);
    work.end();
    scene.updateMatrixWorld(true);
    assert.equal(kit().filter((o) => !o.matrixAutoUpdate).length, 0, `the ${task}'s tool stays in the air with nobody holding it`);
    assert.equal(kit().length, task === "sweep" ? 0 : 1, task);
    if (task === "haul") assert.ok(kit()[0]!.children.some((o) => !o.visible), "the rope hangs from no hands");
    assert.ok(whole > 0);
  }
  work.dispose();
  crowd.dispose();
});

test("the act is the body's and the thing's together: who asks whom", () => {
  const interact = read("components/world/Interact.tsx");
  // The act is begun with the verb's own gesture, and its clock is the body's.
  assert.match(interact, /player\.perform\(verb\.pose, \{ x: tx, y: ty \}, \{ \.\.\.actFor\(verb, thing, carryingRef\.current, aim\), seat: verb\.gesture === "sit" \? seatOf\(ctx, thing, verb\.id\) : null \}\)/);
  assert.match(interact, /player\?\.actSeconds\(\) \?\? \(performance\.now\(\) - a\.startedAt\) \/ 1000/);
  // On a look there is no card: the act is not refused for want of an answer to it.
  assert.match(interact, /const carded = consent === "unset" && !look;/);
  assert.match(interact, /touchesTheWorld\(verb\) && carded\)/);
  // One press is one act: a key held down does not begin it again, a moment answered is not begun
  // again, and an act begun without letting go of the walking keys is not walked away from.
  assert.match(interact, /if \(typing\(\) \|\| talking \|\| e\.repeat\) return;/);
  assert.match(interact, /if \(actingRef\.current \|\| answered\.current\.has\(thing\.ref\)\) return;/);
  assert.match(interact, /if \(!wants\) walkedIn\.current = false;\n\s+else if \(!walkedIn\.current\) finish\(a\.verb\.holdS > 0\);/);
  // And the bar and the line stand clear of the card while it is up.
  assert.match(interact, /data-acting=\{acting\.verb\.id\} className=\{`[^`]*\$\{carded \? "bottom-64" : "bottom-32"\}`\}/);
  // The thing's own layer moves the thing as far as the body has got.
  const moments = read("game/world/momentsLayer.ts");
  assert.match(moments, /const mine = \(l: Live\): ActNow \| null =>/);
  for (const kind of ["honey-stall", "woodpile", "open-gate", "litter", "lost-purse", "net-haul"]) {
    const from = moments.indexOf(`case "${kind}": {`, moments.indexOf("playC87"));
    assert.ok(from > 0, kind);
    assert.match(moments.slice(from, from + 1600), /mine\(l\)/, `${kind} waits for the act to be over`);
  }
  // The rig's old shared motion is nobody's act any more: an act with a gesture is posed with no activity.
  assert.match(read("game/world/playerLayer.ts"), /gestured \? null : state\.activity/);
});
