/**
 * Where a class's DETAIL form stops being worth its triangles — the derivation `detailLayer` never
 * got (DECISIONS C36, and C22's method applied to the number C22 did not cover).
 *
 * `detailLayer` picks its radius from a bare ternary: 180 m for the six tree classes, 75 m for
 * larger rocks and shrubs, 34 m for everything else. The only record of those numbers anywhere is a
 * descriptive sentence in `living-world-rendering.md` — "Trees retain detail to 180 m" — which says
 * what the code does and not why. Meanwhile C22 derived `lod.farM` for every class against a
 * measured pixel budget, and `helpers/farBand.mts` exists as *"the measurement DECISIONS C22 asks
 * for"*, kept so the shipped table is falsifiable rather than remembered.
 *
 * SO ONE LOD BOUNDARY IN THIS RENDERER IS MEASURED AND THE OTHER IS A LITERAL — and C36 measured
 * which one costs: at the worst heading of the denser ordinary parcel, `detailLayer` is **1,077,608
 * triangles in eight draw calls, 68% of a frame that is 2.6x C16's ceiling**, while meadow, scatter,
 * terrain and the player's rig together are 259,788.
 *
 * THE METHOD IS C22'S, UNCHANGED, and only the pair is different. `farBand` asks at what distance a
 * class's own form and its impostor CARD stop differing by more than a pixel budget; this asks the
 * same of a class's DETAIL form and its ORDINARY form. Same rasteriser, same twelve azimuths, same
 * fog weighting, same bisection, same `CLASS_SWITCH_PIXELS` budget — so the answer is comparable to
 * the far band's by construction, which is the whole reason not to invent a second method.
 *
 * THIS FILE DOES NOT CHANGE THE RADII. It prints what the method says they would be and asserts only
 * that the derivation is sound. Whether to move a shipped LOD distance is a fidelity decision with a
 * screenshot attached, and C21/C22 are the precedent for taking it deliberately.
 *
 * Run:  cd apps/web && node --import tsx --test tests/detailBand.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { ASSET_CLASSES } from "@echo/planet";

import { DETAIL_GEOMETRY } from "../src/game/world/scatterDetail";
import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import { CLASS_SWITCH_PIXELS, VIEWPORTS, deriveFarMForPair, switchPixels, type FormPair } from "./helpers/farBand.mjs";

/** The radii `detailLayer` ships, restated so a drift shows up as a failure here. */
const TREES = ["broadleaf", "buttress-tree", "conifer", "acacia", "canopy-palm", "dead-tree"];
const ROCKS = ["boulder", "shore-rock", "lichen-rock", "thicket", "berry-bush"];
const shipped = (id: string) => (TREES.includes(id) ? 180 : ROCKS.includes(id) ? 75 : 34);

/**
 * A class's detail form against its ordinary form, at the class's largest instance scale.
 *
 * `form` is the expensive one and `card` the cheap one, which is the orientation `switchPixels`
 * expects — it measures pixels one covers and the other does not, in either direction, so the names
 * carry the far band's meaning and the arithmetic does not care.
 */
function detailPair(id: string, scale: number): FormPair | null {
  const detail = DETAIL_GEOMETRY[id];
  const ordinary = SCATTER_GEOMETRY[id];
  if (!detail || !ordinary) return null;

  const d = detail();
  const o = ordinary();
  const f = (d.getAttribute("position").array as Float32Array).slice();
  const c = (o.getAttribute("position").array as Float32Array).slice();
  for (let i = 0; i < f.length; i++) f[i] = f[i]! * scale;
  for (let i = 0; i < c.length; i++) c[i] = c[i]! * scale;

  // The raster window has to hold BOTH forms, or the one that sticks out is silently cropped and
  // the pixels it differs by are never counted.
  const box = new THREE.Box3();
  for (const g of [d, o]) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const reachM =
    Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * scale * 1.05 + 0.01;
  const pair: FormPair = {
    form: f,
    card: c,
    reachM,
    yLowM: box.min.y * scale - 0.01,
    yHighM: box.max.y * scale + 0.01,
  };
  d.dispose();
  o.dispose();
  return pair;
}

function triangles(build: (() => THREE.BufferGeometry) | undefined): number {
  if (!build) return 0;
  const g = build();
  const n = (g.getIndex()?.count ?? g.getAttribute("position").count) / 3;
  g.dispose();
  return Math.round(n);
}

test("the detail band is derivable by the same method as the far band, and here is what it says", () => {
  const rows: string[] = [];
  let derivedAny = 0;

  for (const cls of ASSET_CLASSES) {
    const pair = detailPair(cls.id, cls.scale[1]);
    if (!pair) continue;

    // The two forms must actually differ up close, or there is no boundary to find — the same
    // near-end guard farBand makes, and the reason `deriveFarMForPair` throws rather than hangs.
    const near = switchPixels(pair, VIEWPORTS[1], 10);
    if (near <= CLASS_SWITCH_PIXELS) {
      rows.push(`  ${cls.id.padEnd(15)} ships ${String(shipped(cls.id)).padStart(4)} m   —  the two forms are already within ${CLASS_SWITCH_PIXELS} px at 10 m`);
      continue;
    }

    const derived = Math.max(...VIEWPORTS.map((h) => deriveFarMForPair(pair, cls.id, h)));
    derivedAny++;
    const ship = shipped(cls.id);
    const detailTri = triangles(DETAIL_GEOMETRY[cls.id]);
    const plainTri = triangles(SCATTER_GEOMETRY[cls.id]);
    rows.push(
      `  ${cls.id.padEnd(15)} ships ${String(ship).padStart(4)} m   derived ${derived.toFixed(0).padStart(4)} m` +
        `   ${(ship / derived).toFixed(1)}x   ${String(detailTri).padStart(5)} tri vs ${String(plainTri).padStart(4)}` +
        `  (${(detailTri / Math.max(1, plainTri)).toFixed(1)}x)`,
    );
  }

  console.log(
    `\n  DETAIL BAND, derived by C22's method at ${CLASS_SWITCH_PIXELS} px over viewports ${VIEWPORTS.join(" and ")}:\n` +
      rows.join("\n") +
      "\n",
  );
  assert.ok(derivedAny >= 5, `only ${derivedAny} classes produced a derivation; the method did not run`);
});

test("the derivation is sound: identical forms have no boundary, and it says so instead of hanging", () => {
  // farBand's own lesson, re-checked for this pair: a degenerate pair made the bisection walk
  // toward the near end while the raster grew as 1/d^2, so the derivation HUNG on the one
  // substitution it exists to catch. A guard that hangs reads, to whoever is waiting, as a slow test.
  const pair = detailPair("boulder", 1)!;
  const degenerate: FormPair = { ...pair, card: pair.form };
  assert.equal(switchPixels(degenerate, VIEWPORTS[1], 10), 0, "a form differs from itself");
  assert.throws(() => deriveFarMForPair(degenerate, "boulder", VIEWPORTS[1]), /differ by/);
});

test("two classes ship a detail form that IS their ordinary form, and the layer now skips them", () => {
  // Found by the derivation above: `dead-tree` and `driftwood` came back "already within 2 px at
  // 10 m", which is not a marginal LOD — the two builders are byte-identical between
  // scatterDetail.ts and scatterGeometry.ts, the same `merge` entries and the same triangle count.
  //
  // Building a pair for them allocated a second InstancedMesh at the full class count, compiled two
  // extra crossfade shader variants, partitioned every instance into it every frame and drew it, to
  // produce exactly the same pixels — and installed the crossfade on the ORDINARY mesh too, so the
  // pair dithered one form against itself.
  //
  // MEASURED HONESTLY: removing them changed the three measured routes by nothing outside the noise
  // floor (1,580,189 tri / 109 calls before and after on 847db45). These two forms are 22 and 24
  // triangles, so a triangle win was never available; what is removed is two meshes, two shader
  // variants and a per-frame partition. The fix is right because the work is pointless, not because
  // it was expensive.
  const identical: string[] = [];
  for (const cls of ASSET_CLASSES) {
    const d = DETAIL_GEOMETRY[cls.id];
    const o = SCATTER_GEOMETRY[cls.id];
    if (!d || !o) continue;
    const a = d();
    const b = o();
    const pa = a.getAttribute("position").array as Float32Array;
    const pb = b.getAttribute("position").array as Float32Array;
    let same = pa.length === pb.length;
    for (let i = 0; same && i < pa.length; i++) if (pa[i] !== pb[i]) same = false;
    if (same) identical.push(cls.id);
    a.dispose();
    b.dispose();
  }
  assert.deepEqual(identical.sort(), ["dead-tree", "driftwood"], `${identical.join(", ")}`);
});

test("the shipped radii are exactly the three the layer hardcodes, so a drift is visible here", () => {
  // detailLayer picks its radius from a ternary over two hardcoded id lists. If a class moves
  // between them, or a fourth band appears, this restatement goes stale — and a restated constant
  // that nothing checks is how the record drifts from the code (SOCIETY-PLAN §3).
  const bands = new Set(ASSET_CLASSES.map((c) => shipped(c.id)));
  assert.deepEqual([...bands].sort((a, b) => a - b), [34, 75, 180]);
  for (const id of [...TREES, ...ROCKS]) {
    assert.ok(ASSET_CLASSES.some((c) => c.id === id), `${id} is named by detailLayer but is not a class`);
  }
});
