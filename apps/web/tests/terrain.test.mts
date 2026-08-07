/**
 * Terrain regression tests: the two defects that shipped invisible.
 *
 * Both of these are things a green build, a passing ML suite and an empty protected diff are all
 * fully compatible with, because the measurement spine is renderer-independent by design: a player
 * can walk the island, perform every Flow-1 beat and emit a perfectly valid cue stream through a
 * world in which the land is not drawn at all. These tests are renderer-free (no WebGL, no canvas,
 * no `three`) precisely so they can run in CI, where headless WebGL is not trustworthy and where a
 * screenshot would not have caught either bug.
 *
 * 1. WINDING (P0). `buildIsland()` wound every triangle so its geometric normal pointed at -Y.
 *    `computeVertexNormals()` derived the normals from that winding, and MeshLambertMaterial
 *    defaults to `THREE.FrontSide`, so the entire landmass was back-face culled from a camera
 *    above it. Production rendered bare sea with the per-island flora apparently floating on it.
 *
 * 2. THE TERRAIN WINDOW (P1). `buildTerrain(centerX, centerY, radius)` only builds islands whose
 *    centre lies within `radius` of the given point, and `ThreeWorld.init()` ran it once, before
 *    `net.connect()` resolved, around the pre-connect spawn default. Any archipelago slot further
 *    out than that window stood on bare sea.
 *
 * Run:  npm run test -w @echo/web
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  OCEAN_ISLAND_R,
  OCEAN_BEACH_W,
  oceanIslandCenter,
  oceanIslandCenters,
  WORLD,
} from "@echo/shared";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TERRAIN_SRC = readFileSync(path.join(HERE, "..", "src", "game", "three", "terrain.ts"), "utf8");
const THREEWORLD_SRC = readFileSync(path.join(HERE, "..", "src", "game", "ThreeWorld.ts"), "utf8");

// ── the reconstruction ────────────────────────────────────────────────────────────
// Everything below replays buildIsland() over the REAL constants, read out of the real source
// file rather than copied, so the test tracks the file instead of drifting away from it.

/** Read a `const NAME = <number>;` out of a source file. */
function constNum(src: string, name: string): number {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*;`));
  assert.ok(m, `terrain.ts should still declare a numeric ${name}`);
  return Number(m![1]);
}

/**
 * The actual triangle order shipped in buildIsland's index loop, parsed out of the source.
 * The loop pushes six indices per quad, each an expression over the corner `a` (this ring, this
 * segment) and `b` (next ring, this segment): `a`, `a + 1`, `b`, `b + 1`. Reading them rather
 * than hardcoding them is what makes this a regression test on the file and not a restatement
 * of the fix.
 */
function shippedTriangleOrder(src: string): ((a: number, b: number) => number)[] {
  const loop = src.match(/for \(let r = 0; r < RINGS; r\+\+\) \{[\s\S]*?idx\.push\(([^)]*)\);/);
  assert.ok(loop, "buildIsland should still push its indices from a rings x segments loop");
  const terms = loop![1].split(",").map((t) => t.trim());
  assert.equal(terms.length, 6, "two triangles per quad, six indices");
  return terms.map((t) => {
    const m = t.match(/^([ab])(?:\s*\+\s*(\d+))?$/);
    assert.ok(m, `unrecognised index term ${JSON.stringify(t)}, teach this test the new form`);
    const off = m![2] ? Number(m![2]) : 0;
    return m![1] === "a" ? (a: number) => a + off : (_a: number, b: number) => b + off;
  });
}

/** hash01, verbatim from game/three/palette.ts. The rim wobble's seed. */
function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The cosmetic dome exaggeration, read from the file so a tweak to it cannot silently
 *  desynchronise this reconstruction from the geometry it is checking. */
const DOME_H = constNum(TERRAIN_SRC, "DOME_H");

/** groundHeight(), replicated from terrain.ts. Cosmetic dome; the silhouette is OCEAN_ISLAND_R. */
function groundHeight(x: number, y: number): number {
  let best = 0;
  for (const c of oceanIslandCenters()) {
    const dx = x - c.x;
    if (dx > OCEAN_ISLAND_R || dx < -OCEAN_ISLAND_R) continue;
    const dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > OCEAN_ISLAND_R * OCEAN_ISLAND_R) continue;
    const d = Math.sqrt(d2) / OCEAN_ISLAND_R;
    const h = Math.cos(d * Math.PI * 0.5) ** 1.6 * DOME_H;
    if (h > best) best = h;
  }
  return best;
}

/** The (x, h, z) vertex grid buildIsland lays down for one island. */
function islandVertices(cx: number, cy: number, seed: number, rings: number, segs: number) {
  const R = OCEAN_ISLAND_R + OCEAN_BEACH_W;
  const pos: [number, number, number][] = [];
  for (let r = 0; r <= rings; r++) {
    const rr = (r / rings) * R;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const wob = (hash01(seed * 131 + s) - 0.5) * OCEAN_BEACH_W * 0.5 * (rr / R);
      const x = Math.cos(a) * (rr + wob);
      const z = Math.sin(a) * (rr + wob);
      pos.push([x, groundHeight(cx + x, cy + z), z]);
    }
  }
  return pos;
}

/**
 * Count how each triangle's geometric normal points. Only the sign of the j (Y) component of
 * AB x AC matters: > 0 faces the sky, < 0 faces the sea floor. `computeVertexNormals()` averages
 * exactly these, so a triangle that counts as "down" here is a triangle FrontSide will cull.
 */
function normalCensus(pos: [number, number, number][], idx: number[]) {
  let up = 0;
  let down = 0;
  let degenerate = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const A = pos[idx[i]];
    const B = pos[idx[i + 1]];
    const C = pos[idx[i + 2]];
    assert.ok(A && B && C, `index ${i} is out of range: the loop addresses vertices that do not exist`);
    const abx = B[0] - A[0];
    const abz = B[2] - A[2];
    const acx = C[0] - A[0];
    const acz = C[2] - A[2];
    const j = abz * acx - abx * acz; // the Y component of AB x AC
    if (Math.abs(j) < 1e-12) degenerate++;
    else if (j > 0) up++;
    else down++;
  }
  return { up, down, degenerate, triangles: idx.length / 3 };
}

/** Build the shipped index array for one island's grid. */
function shippedIndices(rings: number, segs: number, order: ((a: number, b: number) => number)[]) {
  const idx: number[] = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      for (const term of order) idx.push(term(a, b));
    }
  }
  return idx;
}

// ── P0 ────────────────────────────────────────────────────────────────────────────

test("P0: every island triangle faces the sky, so FrontSide cannot cull the landmass", () => {
  const rings = constNum(TERRAIN_SRC, "RINGS");
  const segs = constNum(TERRAIN_SRC, "SEGS");
  const order = shippedTriangleOrder(TERRAIN_SRC);
  const idx = shippedIndices(rings, segs, order);

  // Every island the radius-90 window around the pre-connect spawn builds, not just island 0,
  // the rim wobble is seeded per island, so each has its own vertex grid.
  const home = oceanIslandCenter(0);
  const centres = oceanIslandCenters();
  let checked = 0;
  const total = { up: 0, down: 0, degenerate: 0, triangles: 0 };

  centres.forEach((c, i) => {
    if (Math.hypot(c.x - home.x, c.y - home.y) > 90) return;
    checked++;
    const pos = islandVertices(c.x, c.y, i * 997 + 13, rings, segs);
    const census = normalCensus(pos, idx);
    assert.equal(
      census.down,
      0,
      `island ${i}: ${census.down}/${census.triangles} triangles wound downward. ` +
        "computeVertexNormals() would derive -Y normals from them and FrontSide would cull the land.",
    );
    total.up += census.up;
    total.down += census.down;
    total.degenerate += census.degenerate;
    total.triangles += census.triangles;
  });

  assert.ok(checked >= 7, `expected the radius-90 window to hold at least 7 islands, got ${checked}`);
  // The degenerate ones are the innermost ring, where rr = 0 collapses every segment onto the
  // centre point: one of each quad's two triangles has two coincident vertices. They contribute
  // no normal either way and have always been there. Everything else must face up.
  assert.equal(total.degenerate, checked * segs, "only the collapsed centre ring may be degenerate");
  assert.equal(total.up, total.triangles - total.degenerate, "every non-degenerate triangle faces up");
  assert.equal(total.down, 0);
});

test("P0: the fix is the winding, not DoubleSide", () => {
  // DoubleSide would make the disc visible while leaving the normals pointing at the sea floor,
  // so the single western key light would light the land from underneath and it would render near
  // black. The winding itself has to be right so computeVertexNormals() produces +Y.
  assert.ok(
    !/DoubleSide|BackSide/.test(TERRAIN_SRC),
    "terrain.ts must not paper over a winding bug with a material side flag",
  );
  assert.ok(
    /computeVertexNormals\(\)/.test(TERRAIN_SRC),
    "the island normals are still derived from the winding, which is why the winding must be right",
  );
});

test("P0: the reversed winding is what the bug looked like (the census is a real discriminator)", () => {
  // Sanity on the instrument: flipping the shipped order must flip the census completely. If this
  // ever passed for both orders, the test above would be proving nothing.
  const rings = constNum(TERRAIN_SRC, "RINGS");
  const segs = constNum(TERRAIN_SRC, "SEGS");
  const home = oceanIslandCenter(0);
  const pos = islandVertices(home.x, home.y, 13, rings, segs);

  const shipped = shippedTriangleOrder(TERRAIN_SRC);
  const flipped = [shipped[0], shipped[2], shipped[1], shipped[3], shipped[5], shipped[4]];
  const bad = normalCensus(pos, shippedIndices(rings, segs, flipped));

  assert.equal(bad.up, 0, "the reversed winding faces nothing at the sky");
  assert.ok(bad.down > 0, "the reversed winding is the shipped bug: every real triangle wound down");
});

// ── P1 ────────────────────────────────────────────────────────────────────────────

test("P1: slot 7 sits outside the terrain window built around the pre-connect spawn", () => {
  // This is the fact that makes the bug real. buildTerrain only builds islands whose centre lies
  // within `radius` of the point it is given, and ThreeWorld.init() runs before net.connect()
  // resolves, so it built around WorldCore's pre-connect default (map.width / 2). Offline that is
  // accidentally correct, because island slot 0 sits at exactly that point. Online, onWelcome
  // teleports the player to their assigned archipelago slot and the terrain was never rebuilt.
  // assignIslandForUser hands out the empty slot nearest the most recently joined island, starting
  // at slot 0, so assignments reach index 7 within roughly the first dozen players. The terrain
  // window must therefore follow the player rather than the spawn default.
  const r = Number(THREEWORLD_SRC.match(/TERRAIN_R\s*=\s*(\d+)\s*;/)?.[1]);
  assert.equal(r, 90, "the window radius is the number this test is about; keep them together");

  const home = oceanIslandCenter(0);
  const preConnectSpawn = { x: WORLD.MAP_WIDTH / 2, y: WORLD.MAP_HEIGHT / 2 };
  assert.ok(
    Math.hypot(home.x - preConnectSpawn.x, home.y - preConnectSpawn.y) < 1e-9,
    "slot 0 is exactly the pre-connect spawn, which is why an offline run hides this bug entirely",
  );

  const slot7 = oceanIslandCenter(7);
  const d = Math.hypot(slot7.x - home.x, slot7.y - home.y);
  assert.ok(
    d > r,
    `slot 7 is ${d.toFixed(2)} tiles from slot 0, which must exceed the ${r}-tile window`,
  );

  // And it is not a lone outlier: everything from 7 outward is out of the window too.
  for (const i of [7, 8, 12, 20, 50, 99]) {
    const c = oceanIslandCenter(i);
    assert.ok(
      Math.hypot(c.x - home.x, c.y - home.y) > r,
      `slot ${i} should also lie outside the window built around slot 0`,
    );
  }
});

test("P1: the terrain window follows the player rather than being built once", () => {
  // The renderer-side guarantee, asserted on the source because the rebuild itself needs a GL
  // context. draw() must consult ensureTerrain, and ensureTerrain must rebuild around the player.
  assert.ok(
    /private draw\([\s\S]{0,200}?this\.ensureTerrain\(self\);/.test(THREEWORLD_SRC),
    "draw() must call ensureTerrain(self) so the window can follow the player",
  );
  assert.ok(
    /ensureTerrain\([\s\S]*?buildTerrain\(self\.x, self\.y, ThreeWorld\.TERRAIN_R\)/.test(THREEWORLD_SRC),
    "ensureTerrain must rebuild the window around the player's current position",
  );
  assert.ok(
    /ensureTerrain\([\s\S]*?this\.terrain\.dispose\(\)/.test(THREEWORLD_SRC),
    "the old window must be disposed, or rebuilding leaks a few thousand triangles per crossing",
  );
});
