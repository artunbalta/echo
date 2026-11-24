/**
 * The village room's pure rules (DECISIONS C101, C107): codes, lines, poses, looks and who hears.
 *
 * Run:  node --import tsx --test packages/shared/tests/village.test.ts  (or npm run test -w @echo/shared)
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ROOM,
  ROOM_ALPHABET,
  ROOM_VILLAGES,
  cleanSaid,
  hearersOf,
  newRoomCode,
  normalizeRoomCode,
  readPose,
  roomLookOf,
  stepToward,
  typingMs,
  yawToward,
} from "../src/village.js";

test("a code is five readable characters, and typing it loosely still finds it", () => {
  let i = 0;
  const seq = [0, 0.2, 0.4, 0.6, 0.99];
  const code = newRoomCode(() => seq[i++]!);
  assert.equal(code.length, ROOM.codeLength);
  for (const ch of code) assert.ok(ROOM_ALPHABET.includes(ch));
  assert.equal(normalizeRoomCode(code.toLowerCase()), code);
  assert.equal(normalizeRoomCode(` ${code.slice(0, 2)}-${code.slice(2)} `), code);
  for (const bad of ["ABCD", "ABCDEF", "ABC0E", "ABCIE", "ABCLE", "", 12345, null]) assert.equal(normalizeRoomCode(bad), null, String(bad));
});

test("the alphabet has nothing that reads as something else", () => {
  for (const ch of "01OIL") assert.ok(!ROOM_ALPHABET.includes(ch), ch);
});

test("only the reference village can be copied", () => {
  assert.deepEqual([...ROOM_VILLAGES], ["84dcee5ffffffff"]);
});

test("a line is one line, never empty, and cut at the limit", () => {
  assert.equal(cleanSaid("  hello\nthere  "), "hello there");
  assert.equal(cleanSaid("y".repeat(ROOM.sayMaxChars + 50))?.length, ROOM.sayMaxChars);
  for (const bad of ["", " \n\t ", 5, null]) assert.equal(cleanSaid(bad), null, String(bad));
});

test("a pose is read only when every part is a number, inside the village, doing something the crowd can draw", () => {
  const ok = readPose({ x: 10, y: -4, yaw: 7, speed: 99, activity: "walk" });
  assert.ok(ok);
  assert.equal(ok.speed, ROOM.maxSpeedMps, "speed held to the limit");
  assert.ok(ok.yaw > -Math.PI && ok.yaw <= Math.PI, "yaw wrapped");
  assert.equal(readPose({ x: 0, y: 0, yaw: 0, speed: -3, activity: "stand" })?.speed, 0);
  for (const bad of [
    null,
    { x: NaN, y: 0, yaw: 0, speed: 0, activity: "walk" },
    { x: 0, y: 0, yaw: 0, speed: 0, activity: "fly" },
    { x: ROOM.boundM + 1, y: 0, yaw: 0, speed: 0, activity: "walk" },
    { x: "1", y: 0, yaw: 0, speed: 0, activity: "walk" },
  ]) assert.equal(readPose(bad), null, JSON.stringify(bad));
});

test("a body moves as far as a body can, and no further", () => {
  assert.deepEqual(stepToward(null, { x: 500, y: 500 }, 100), { x: 500, y: 500 }, "the first pose is where it came in");
  assert.deepEqual(stepToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 100), { x: 1, y: 0 }, "a walk is taken as sent");
  const jumped = stepToward({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100);
  const allowed = ROOM.maxSpeedMps * 0.1 * 1.5 + 0.5;
  assert.ok(Math.abs(jumped.x - allowed) < 1e-9 && jumped.y === 0, `teleport pulled back to ${allowed} m, got ${jumped.x}`);
});

test("a look is the same person every time in one copy and another in the next, from the villagers' own range, with no subject in it", () => {
  const a = roomLookOf("subject-a", "ABCDE");
  assert.deepEqual(roomLookOf("subject-a", "ABCDE"), a, "the same in the same copy");
  assert.notEqual(roomLookOf("subject-a", "FGHJK").seed, a.seed, "another in the next copy (C107)");
  assert.notEqual(roomLookOf("subject-b", "ABCDE").seed, a.seed);
  assert.match(a.seed, /^[0-9a-f]{8}$/);
  assert.ok(!a.seed.includes("subject"));
  const looks = Array.from({ length: 400 }, (_, i) => roomLookOf(`s${i}`, "ABCDE"));
  assert.ok(looks.every((l) => l.age >= 19 && l.age <= 60));
  const women = looks.filter((l) => l.sex === "f").length;
  assert.ok(women > 150 && women < 250, `about half are women: ${women}`);
});

test("a line is heard by those near enough who are in the village, never by the speaker", () => {
  const people = [
    { id: "me", x: 0, y: 0, here: true },
    { id: "near", x: ROOM.hearM - 1, y: 0, here: true },
    { id: "far", x: ROOM.hearM + 1, y: 0, here: true },
    { id: "away", x: 1, y: 1, here: false },
  ];
  assert.deepEqual(hearersOf("me", { x: 0, y: 0 }, people).map((p) => p.id), ["near"]);
});

test("a copy's world has a key of its own; the open world's key is the cell", async () => {
  const { worldKey, worldOf, ROOM_WORLD_SEP } = await import("../src/village.js");
  const cell = ROOM_VILLAGES[0]!;
  assert.equal(worldKey(cell, null), cell);
  assert.equal(worldKey(cell, "ABCDE"), `${cell}${ROOM_WORLD_SEP}ABCDE`);
  assert.deepEqual(worldOf(worldKey(cell, "ABCDE")), { cell, room: "ABCDE" });
  assert.deepEqual(worldOf(cell), { cell, room: null });
  assert.ok(!/[0-9a-f]/i.test(ROOM_WORLD_SEP) && !ROOM_ALPHABET.includes(ROOM_WORLD_SEP), "the separator is in neither a cell nor a code");
});

test("a route's room is none, or a code as the page writes it for a village that can be copied", async () => {
  const { roomOfRequest } = await import("../src/village.js");
  const cell = ROOM_VILLAGES[0]!;
  assert.deepEqual(roomOfRequest(cell, undefined), { ok: true, room: null });
  assert.deepEqual(roomOfRequest(cell, ""), { ok: true, room: null });
  assert.deepEqual(roomOfRequest(cell, "ABCDE"), { ok: true, room: "ABCDE" });
  for (const bad of ["abcde", "ABC0E", 5, "ABCDEF"]) assert.deepEqual(roomOfRequest(cell, bad), { ok: false }, String(bad));
  assert.deepEqual(roomOfRequest("843f6a1ffffffff", "ABCDE"), { ok: false }, "the pilot's village is never copied");
});

test("typing a line takes as long as a person would (C109, C110), and a test can say no waiting", () => {
  assert.equal(typingMs("ok", () => 0), 1400 + 55 * 2);
  assert.equal(typingMs("x".repeat(240), () => 1), 12_000, "never longer than twelve seconds");
  assert.ok(typingMs("a longer line than that", () => 0) > typingMs("ok", () => 0));
  assert.equal(typingMs("anything", () => 0.5, 0), 0);
  assert.equal(typingMs("ok", () => 0, 2), 2 * (1400 + 110));
});

test("facing someone is the yaw a pose carries for the heading toward them (C110)", () => {
  // Planet-local metres are (east, north); a body's yaw is pi/2 - heading, the heading atan2(south, east).
  const close = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;
  assert.ok(close(yawToward({ x: 0, y: 0 }, { x: 5, y: 0 }), Math.PI / 2), "east: heading 0");
  assert.ok(close(yawToward({ x: 0, y: 0 }, { x: 0, y: -5 }), 0), "south: heading pi/2");
  assert.ok(close(yawToward({ x: 0, y: 0 }, { x: 0, y: 5 }), Math.PI), "north: heading -pi/2");
  assert.ok(close(yawToward({ x: 2, y: 2 }, { x: -3, y: 2 }), -Math.PI / 2), "west: heading pi");
});
