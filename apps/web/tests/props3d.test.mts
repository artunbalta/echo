/**
 * Guard: never assign to a three.js transform property.
 *
 * `Object3D`'s constructor defines `position`, `rotation`, `scale` and `quaternion` through
 * `Object.defineProperties` with a `value` descriptor and no `writable`, so `writable` defaults to
 * false. Every ES module is strict mode, so assigning to one of them does not fail silently, it
 * THROWS `TypeError: Cannot assign to read only property`.
 *
 * That is not a cosmetic slip, because of where the throw lands. `buildProp3D` is called from
 * `ThreeWorld.addView`, which is the `onEntityAdded` hook, which `WorldCore.ensureEntity` fires
 * AFTER it has already done `this.entities.set(snap.id, e)`. So the entity stays registered in the
 * core while its view is never created, and `ensureEntity` returns early on every later tick, so the
 * view is never retried. Proximity, the `CLOSE <= 2.0` gate and interaction all read `core.entities`
 * and none of them need a view. The result is an entity that is fully interactive and completely
 * invisible, forever.
 *
 * That is exactly what happened to `stn_food`, the cookfire stall (a shipped Flow-3 clearing station,
 * `WorldRoom.ts:994`), from the 2D to 3D migration on 2026-07-18 until 2026-08-07. Players walked up
 * to and interacted with an object that was not drawn.
 *
 * This test asserts on the SOURCE rather than on a rendered result, so it needs no WebGL and stays
 * trustworthy in CI. See known-gaps 11 for why that is the pattern to reach for here.
 *
 * Run:  npm run test -w @echo/web
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.join(HERE, "..", "src", "game");

/** Every .ts under src/game, recursively. These are the files that touch three.js objects. */
function gameSources(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) gameSources(p, out);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** The four read-only transform properties on THREE.Object3D. */
const LOCKED = ["position", "rotation", "scale", "quaternion"];

/**
 * Find assignments to a locked transform property. Two shapes, because the bug arrived as the
 * second one and a guard that only knew the first would have missed it:
 *
 *   1. direct        `foo.position = new THREE.Vector3(...)`
 *   2. Object.assign `Object.assign(foo, { position: ... })`
 *
 * Deliberately NOT flagged: `foo.position.set(...)`, `.copy(...)`, `.x =`, and object literals that
 * are plainly not Object3D (a CSS style bag, a snapshot record). The `Object.assign` form is only
 * flagged when the assigned key is one of the four, which is what makes it specific.
 */
function findViolations(src: string, file: string) {
  const hits: { line: number; text: string; kind: string }[] = [];
  const lines = src.split("\n");

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("*") || line.startsWith("//")) return; // comments and doc blocks

    for (const prop of LOCKED) {
      // 1. `<expr>.<prop> = ` but not `.<prop>.<something> =` and not `==`/`===`.
      const direct = new RegExp(`[\\w\\)\\]]\\.${prop}\\s*=(?!=)`);
      if (direct.test(raw) && !new RegExp(`\\.${prop}\\.`).test(raw)) {
        hits.push({ line: i + 1, text: line, kind: `direct assignment to .${prop}` });
      }
    }

    // 2. Object.assign(target, { position: ... }) and friends.
    if (/Object\.assign\s*\(/.test(raw)) {
      for (const prop of LOCKED) {
        if (new RegExp(`\\{[^}]*\\b${prop}\\s*:`).test(raw)) {
          hits.push({ line: i + 1, text: line, kind: `Object.assign onto .${prop}` });
        }
      }
    }
  });

  return hits.map((h) => ({ ...h, file: path.relative(path.join(HERE, ".."), file) }));
}

test("no assignment to a read-only three.js transform property, anywhere in src/game", () => {
  const files = gameSources(GAME_DIR);
  assert.ok(files.length > 5, `expected to find the game sources, got ${files.length}`);

  const violations = files.flatMap((f) => findViolations(readFileSync(f, "utf8"), f));

  assert.deepEqual(
    violations,
    [],
    "Object3D.position/rotation/scale/quaternion are non-writable, so assigning to them throws in " +
      "strict mode and the throw escapes buildProp3D into onEntityAdded, leaving an entity registered " +
      "with no view: interactive and invisible. Use .set(...) or .copy(...) instead. Offenders:\n" +
      violations.map((v) => `  ${v.file}:${v.line}  ${v.kind}\n    ${v.text}`).join("\n"),
  );
});

test("the guard actually catches both shapes (it is a real gate, not a tautology)", () => {
  // The exact line that shipped, and the direct form it could have taken instead. If either of
  // these stopped being detected, the test above would be quietly proving nothing.
  const shipped =
    "      out.push(Object.assign(f, { position: new THREE.Vector3(-0.36 + i * 0.24, 0.72, 0.1) }));";
  const direct = "      f.position = new THREE.Vector3(1, 2, 3);";

  assert.equal(findViolations(shipped, "x.ts").length, 1, "the shipped Object.assign form is caught");
  assert.equal(findViolations(direct, "x.ts").length, 1, "the direct assignment form is caught");

  // And the correct forms must NOT trip it, or the guard would be unusable.
  for (const ok of [
    "      f.position.set(-0.36 + i * 0.24, 0.72, 0.1);",
    "      mesh.position.copy(v);",
    "      trunk.position.y = hgt / 2;",
    "      cone.rotation.y = hash01(seed) * Math.PI;",
    "      Object.assign(style, { display: 'none' });",
  ]) {
    assert.equal(findViolations(ok, "x.ts").length, 0, `must not flag: ${ok.trim()}`);
  }
});
