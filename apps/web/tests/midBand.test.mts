/**
 * Where the MID form can stand in for the detail form — the third band C37 named but did not have
 * (DECISIONS C36, C37).
 *
 * C36 measured the shape of the problem: ordinary forms are 4-36 triangles, detail forms 38-1,376,
 * and there is nothing in between. `detailLayer` therefore had a two-way choice for the whole
 * 180 m — an impostor's budget or arm's-reach budget — and picked arm's reach, which is why detail
 * alone is 1,077,608 triangles in eight draw calls, 68% of a frame at 2.6x C16's ceiling.
 *
 * `MID_GEOMETRY` fills that gap without new art: the same 26 builders, run against primitives at
 * half their segment budget. This file asks the only question that decides where it may be drawn —
 * AT WHAT DISTANCE DOES THE COARSER FORM STOP DIFFERING FROM THE ONE IT REPLACES?
 *
 * THE METHOD IS C22'S, UNCHANGED, exactly as `detailBand` applied it: same rasteriser, same twelve
 * azimuths, same fog weighting, same bisection, same 2 px budget. Only the pair differs. So the
 * handoff derived here is comparable by construction to the far band and to the detail band, which
 * is the whole reason not to invent a third method for the third boundary.
 *
 * Run:  cd apps/web && node --import tsx --test tests/midBand.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { ASSET_CLASSES } from "@echo/planet";

import { DETAIL_GEOMETRY, MID_BAND_INNER_M, MID_GEOMETRY, MID_COARSENING, coarsened } from "../src/game/world/scatterDetail";
import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import { CLASS_SWITCH_PIXELS, VIEWPORTS, deriveFarMForPair, fog, signedSwitchPixels, switchPixels, type FormPair } from "./helpers/farBand.mjs";

/** The radii `detailLayer` ships today, restated so a drift shows up here (as in `detailBand`). */
const TREES = ["broadleaf", "buttress-tree", "conifer", "acacia", "canopy-palm", "dead-tree"];
const ROCKS = ["boulder", "shore-rock", "lichen-rock", "thicket", "berry-bush"];
const shipped = (id: string) => (TREES.includes(id) ? 180 : ROCKS.includes(id) ? 75 : 34);

/** Two forms of one class at one scale, windowed to hold both — `detailBand`'s `detailPair`, over
 *  an arbitrary pair so the same construction serves detail-vs-mid and mid-vs-ordinary alike. */
function pairOf(expensive: () => THREE.BufferGeometry, cheap: () => THREE.BufferGeometry, scale: number): FormPair {
  const d = expensive();
  const o = cheap();
  const f = (d.getAttribute("position").array as Float32Array).slice();
  const c = (o.getAttribute("position").array as Float32Array).slice();
  for (let i = 0; i < f.length; i++) f[i] = f[i]! * scale;
  for (let i = 0; i < c.length; i++) c[i] = c[i]! * scale;

  const box = new THREE.Box3();
  for (const g of [d, o]) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const reachM =
    Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * scale * 1.05 + 0.01;
  const pair: FormPair = { form: f, card: c, reachM, yLowM: box.min.y * scale - 0.01, yHighM: box.max.y * scale + 0.01 };
  d.dispose();
  o.dispose();
  return pair;
}

/** Whether two builders produce the same vertex positions, to the byte. */
function identical(a: () => THREE.BufferGeometry, b: () => THREE.BufferGeometry): boolean {
  const ga = a(), gb = b();
  const pa = ga.getAttribute("position").array as Float32Array;
  const pb = gb.getAttribute("position").array as Float32Array;
  let same = pa.length === pb.length;
  for (let i = 0; same && i < pa.length; i++) if (pa[i] !== pb[i]) same = false;
  ga.dispose();
  gb.dispose();
  return same;
}

function triangles(build: (() => THREE.BufferGeometry) | undefined): number {
  if (!build) return 0;
  const g = build();
  const n = (g.getIndex()?.count ?? g.getAttribute("position").count) / 3;
  g.dispose();
  return Math.round(n);
}

/** The distance beyond which `cheap` is within budget of `expensive`, or 0 if it always is. */
function handoffM(expensive: () => THREE.BufferGeometry, cheap: () => THREE.BufferGeometry, id: string, scale: number): number {
  const pair = pairOf(expensive, cheap, scale);
  if (switchPixels(pair, VIEWPORTS[1], 10) <= CLASS_SWITCH_PIXELS) return 0;
  return Math.max(...VIEWPORTS.map((h) => deriveFarMForPair(pair, id, h)));
}

test("every mid form costs less than the detail form it would stand in for", () => {
  // COST ONLY. Being between the two in triangles is necessary and NOT sufficient, and this test
  // exists partly to show that: `shell` passes it comfortably while being perceptually farther from
  // the detail form than the ordinary form is (k = 4.96, measured below). A cheaper form that looks
  // less like the thing it replaces is not a middle, and a triangle count cannot tell you so.
  const rows: string[] = [];
  for (const cls of ASSET_CLASSES) {
    if (!DETAIL_GEOMETRY[cls.id]) continue;
    const detail = triangles(DETAIL_GEOMETRY[cls.id]);
    const mid = triangles(MID_GEOMETRY[cls.id]);
    const plain = triangles(SCATTER_GEOMETRY[cls.id]);
    rows.push(`  ${cls.id.padEnd(15)} ${String(detail).padStart(5)} -> ${String(mid).padStart(4)} -> ${String(plain).padStart(4)}   ${(detail / Math.max(1, mid)).toFixed(1)}x cheaper than detail`);
    assert.ok(mid <= detail, `${cls.id}: mid ${mid} is not cheaper than detail ${detail}`);
    assert.ok(mid > 0, `${cls.id}: mid form is empty`);
  }
  console.log(`\n  TRIANGLES, detail -> mid -> ordinary at ${MID_COARSENING}x segment budget:\n${rows.join("\n")}\n`);
});

test("2 px is unreachable for a coarsening, so the mid band cannot be derived the way the far band was", () => {
  // THE NEGATIVE RESULT, KEPT because it is the reason the rule below is not C22's rule.
  //
  // `CLASS_SWITCH_PIXELS` is a TOTAL COUNT of differing pixels over the whole silhouette, not a
  // per-edge displacement. A coarser form perturbs the entire rim by a sub-pixel amount, and a
  // sub-pixel error summed around a long rim still counts hundreds of pixels — so bisecting for
  // "within 2 px" puts the detail->mid handoff at 240-396 m for the tree classes, beyond the 180 m
  // at which the layer stops drawing detail at all.
  //
  // That is not a fact about the mid form. detail-vs-ORDINARY derives to ~404 m by the same method
  // while the layer ships 180 m, and every shipped detail radius is 0.1x-0.7x of its derived one:
  // THE RENDERER ALREADY SHIPS FAR INSIDE THIS BUDGET, deliberately. Re-deriving against it would
  // only re-discover that.
  //
  // I had the reason wrong, and the correction is the test below. The first hypothesis WAS that
  // coarsening shrinks the forms, and I talked myself out of it with bounding boxes: mid/detail
  // envelope ratios are 0.93-1.00, so I wrote that the envelope was intact and the difference was
  // rim rather than size. A BOUNDING BOX CANNOT SEE A COARSENING. three puts a primitive's vertices
  // on the circumscribing radius and cuts the chord between them, so the extremes that set the box
  // are exactly the points that survive. Measured by covered area instead, the mid form loses 1-22%
  // of its silhouette, one-sided, at every distance. The shrink was real and my instrument was not.
  const scale = ASSET_CLASSES.find((c) => c.id === "broadleaf")!.scale[1];
  const toMid = handoffM(DETAIL_GEOMETRY.broadleaf!, MID_GEOMETRY.broadleaf!, "broadleaf", scale);
  const toPlain = handoffM(DETAIL_GEOMETRY.broadleaf!, SCATTER_GEOMETRY.broadleaf!, "broadleaf", scale);
  assert.ok(toMid > 180, `detail->mid derived ${toMid.toFixed(0)} m; if this is now under the shipped 180 m the budget is reachable and the rule should be revisited`);
  assert.ok(toPlain > 180, `detail->ordinary derived ${toPlain.toFixed(0)} m, so the SHIPPED band is itself inside the budget`);
  console.log(`\n  broadleaf at ${CLASS_SWITCH_PIXELS} px: detail->mid ${toMid.toFixed(0)} m, detail->ordinary ${toPlain.toFixed(0)} m, layer ships 180 m\n`);
});

test("which classes a coarsening actually gives a middle for, measured rather than assumed", () => {
  // THE MEASUREMENT THE BAND IS PLACED BY, and the one that refutes the obvious premise.
  //
  // Rather than ask where mid becomes perfect (unreachable, above), ask how wrong it is compared to
  // the form the renderer ALREADY draws past the same radius. Two properties make one number per
  // class enough, and both are asserted here rather than assumed:
  //   1. error falls as 1/d^2 -- it is a projected area, so error at one distance predicts the rest
  //   2. k = mid_error / ordinary_error is CONSTANT with distance
  //
  // AND COARSENING IS NOT ALWAYS A MIDDLE. `shell` comes back k = 4.8: its coarsened form is five
  // times FARTHER from the detail form than the plain ordinary form is, because the ordinary form
  // is purpose-built low-poly art that approximates the shape, while dropping segments off a curved
  // shell distorts it into neither. `cactus` comes back k = 1.00 -- coarsening lands exactly on the
  // ordinary form. A triangle count cannot see either case: both are dutifully "between" the two
  // forms in cost, and the test above says so while being perceptually wrong. Only k sees it.
  const useful: string[] = [], pointless: string[] = [], harmful: string[] = [], inert: string[] = [];

  for (const cls of ASSET_CLASSES) {
    if (!DETAIL_GEOMETRY[cls.id] || !SCATTER_GEOMETRY[cls.id]) continue;

    // The two degenerate ends are settled by BYTES, not by a ratio — k is a quotient of differing
    // pixel counts and both ends make it 0/0. `fern` coarsens to itself (its cards are already at
    // the segment floor), and a class that coarsens onto its ordinary form has no middle either.
    if (identical(MID_GEOMETRY[cls.id]!, DETAIL_GEOMETRY[cls.id]!)) {
      inert.push(`  ${cls.id.padEnd(15)} coarsens to itself — already at the segment floor`);
      continue;
    }
    if (identical(MID_GEOMETRY[cls.id]!, SCATTER_GEOMETRY[cls.id]!)) {
      pointless.push(`  ${cls.id.padEnd(15)} coarsens exactly onto the ordinary form`);
      continue;
    }
    const scale = cls.scale[1];
    const mid = pairOf(DETAIL_GEOMETRY[cls.id]!, MID_GEOMETRY[cls.id]!, scale);
    const ord = pairOf(DETAIL_GEOMETRY[cls.id]!, SCATTER_GEOMETRY[cls.id]!, scale);
    const R = shipped(cls.id);

    const ks: number[] = [];
    const resolved: number[] = [];
    let quarter = 0;
    for (const frac of [0.25, 0.5, 0.75, 1]) {
      const d = R * frac;
      const o = switchPixels(ord, VIEWPORTS[1], d);
      if (o <= 0) continue;
      if (frac === 0.25) quarter = o;
      const k = switchPixels(mid, VIEWPORTS[1], d) / o;
      ks.push(k);
      // Constancy is checked at the NEAR end only, where the counts are large enough to resolve it.
      // It is the MID count that quantises, not the ordinary one: `conifer` differs from its detail
      // form by nine pixels at 135 m and five at 180 m, and nine-versus-five is a 12% swing that is
      // entirely the integer. The 1/d^2 law asserted below is exactly what licenses reading k off
      // the near end and carrying it outward, so the far end need not carry the assertion too.
      if (frac <= 0.5) resolved.push(k);
    }
    if (ks.length < 4) continue;

    // 1/d^2: the error at R must be a sixteenth of the error at R/4.
    const atR = switchPixels(ord, VIEWPORTS[1], R);
    assert.ok(Math.abs(atR / (quarter / 16) - 1) < 0.08, `${cls.id}: error does not fall as 1/d^2 (${atR} vs ${(quarter / 16).toFixed(0)})`);

    assert.equal(resolved.length, 2, `${cls.id}: the near end did not measure`);
    const rlo = Math.min(...resolved), rhi = Math.max(...resolved);
    const k = (rlo + rhi) / 2;
    assert.ok((rhi - rlo) / k < 0.06, `${cls.id}: k drifts with distance, ${rlo.toFixed(4)}-${rhi.toFixed(4)} over ${ks.map((v) => v.toFixed(4)).join(" ")}`);

    const line =
      `  ${cls.id.padEnd(15)} k = ${k.toFixed(3).padStart(6)}   ${(triangles(DETAIL_GEOMETRY[cls.id]) / Math.max(1, triangles(MID_GEOMETRY[cls.id]))).toFixed(1)}x fewer triangles than detail`;
    (k > 1.1 ? harmful : k > 0.9 ? pointless : useful).push(line);
  }

  console.log(
    `\n  A COARSENING IS A MIDDLE FOR ${useful.length} OF ${useful.length + pointless.length + harmful.length + inert.length} CLASSES.\n` +
      `\n  USEFUL -- mid is closer to detail than ordinary is, so it can hold a band:\n${useful.join("\n")}\n` +
      `\n  POINTLESS -- coarsening lands on (or beside) the ordinary form, which is already the mid form:\n${pointless.join("\n")}\n` +
      `\n  HARMFUL -- the coarsened form is FARTHER from detail than the ordinary form is:\n${harmful.join("\n")}\n` +
      `\n  INERT -- coarsening changes nothing:\n${inert.join("\n")}\n`,
  );

  // The six classes on the 180 m band carry the triangles C36 measured, so they are where a mid
  // band has to earn its mesh. If one of them stops qualifying, the scheme is worth less than the
  // draw call it costs, and that is a decision to retake rather than a number to nudge.
  for (const id of TREES) {
    if (!DETAIL_GEOMETRY[id] || !SCATTER_GEOMETRY[id] || id === "dead-tree") continue;
    assert.ok(useful.some((r) => r.startsWith(`  ${id.padEnd(15)}`)), `${id} is on the 180 m band but a coarsening is no middle for it`);
  }
  assert.ok(harmful.length > 0, "the harmful case is the reason this is measured per class; if it is empty the measurement stopped working");
});

test("a coarsening ERODES, and k is only a like-for-like ratio where the ordinary form erodes too", () => {
  // WHY THIS EXISTS: the quotient k compares two error magnitudes, and a magnitude has no sign. If
  // the mid form loses area while the ordinary form GAINS it, k divides unlike quantities and the
  // number is not a comparison at all, however stable it looks. That is not hypothetical here — the
  // ordinary forms of seven classes are dilations, `fern`'s covering nearly nine times the detail
  // form's silhouette, because a hand-made low-poly stand-in is under no obligation to be inscribed.
  //
  // It is also how the bounding-box mistake above gets caught: area sees what an envelope cannot.
  const eroding: string[] = [], mismatched: string[] = [];

  for (const cls of ASSET_CLASSES) {
    if (!DETAIL_GEOMETRY[cls.id] || !SCATTER_GEOMETRY[cls.id]) continue;
    if (identical(MID_GEOMETRY[cls.id]!, DETAIL_GEOMETRY[cls.id]!)) continue;
    const R = shipped(cls.id), scale = cls.scale[1];
    const m = signedSwitchPixels(pairOf(DETAIL_GEOMETRY[cls.id]!, MID_GEOMETRY[cls.id]!, scale), VIEWPORTS[1], R);
    const o = signedSwitchPixels(pairOf(DETAIL_GEOMETRY[cls.id]!, SCATTER_GEOMETRY[cls.id]!, scale), VIEWPORTS[1], R);
    if (m.eroded + m.dilated === 0) continue;

    // Every coarsening is an erosion. Not a style rule — it is what inscribing a primitive DOES,
    // and if a mid form ever comes back dilating, the knob has stopped meaning what it means.
    assert.ok(m.cardArea <= m.formArea, `${cls.id}: the mid form covers MORE than the detail form (${(m.cardArea / m.formArea).toFixed(3)})`);
    assert.ok(m.eroded > m.dilated, `${cls.id}: the mid form's error is not an erosion (${m.eroded.toFixed(0)} vs ${m.dilated.toFixed(0)})`);

    const line = `  ${cls.id.padEnd(15)} mid keeps ${(m.cardArea / m.formArea).toFixed(3)} of the silhouette, ordinary keeps ${(o.cardArea / o.formArea).toFixed(3)}`;
    (o.dilated > o.eroded ? mismatched : eroding).push(line);
  }

  console.log(
    `\n  SIGNED ERROR at each class's shipped radius.\n` +
      `\n  COMPARABLE -- both forms erode, so k divides like with like:\n${eroding.join("\n")}\n` +
      `\n  NOT COMPARABLE -- the ORDINARY form dilates while the mid form erodes, so k is a ratio of\n` +
      `  unlike errors and a band for these classes needs a picture, not arithmetic:\n${mismatched.join("\n")}\n`,
  );

  // The claim the whole scheme rests on, stated where it can fail: a coarsening is a middle because
  // it erodes LESS than the purpose-built low-poly form does, not because it erodes little.
  const R = 180, scale = ASSET_CLASSES.find((c) => c.id === "broadleaf")!.scale[1];
  const m = signedSwitchPixels(pairOf(DETAIL_GEOMETRY.broadleaf!, MID_GEOMETRY.broadleaf!, scale), VIEWPORTS[1], R);
  const o = signedSwitchPixels(pairOf(DETAIL_GEOMETRY.broadleaf!, SCATTER_GEOMETRY.broadleaf!, scale), VIEWPORTS[1], R);
  assert.ok(m.cardArea / m.formArea > 0.9 && o.cardArea / o.formArea < 0.7,
    `broadleaf: mid keeps ${(m.cardArea / m.formArea).toFixed(3)} and ordinary ${(o.cardArea / o.formArea).toFixed(3)}`);
  assert.ok(mismatched.length > 0, "the sign check found nothing; if every ordinary form now erodes, this test has stopped working");
});

test("the mid form is derived from the detail form, not authored beside it", () => {
  // The reason this coarsening is safe to ship is that it cannot drift: MID_GEOMETRY runs the same
  // builder. If someone adds a class to DETAIL_GEOMETRY, it gets a mid form for free, and if they
  // add one only to MID_GEOMETRY, that is the bug this catches.
  assert.deepEqual(Object.keys(MID_GEOMETRY).sort(), Object.keys(DETAIL_GEOMETRY).sort());
});

test("the coarsening knob never leaks into a detail form", () => {
  // COARSE is module state that EVERY primitive reads. If it were left down — by a builder that
  // threw, or by a caller that forgot to restore it — every DETAIL form built afterwards would come
  // back quietly coarse. That is a fidelity regression with no failing test anywhere near it, so
  // the guarantee is asserted here at both doors: after a clean run, and after a throwing one.
  const before = new Map<string, number>();
  for (const id of Object.keys(DETAIL_GEOMETRY)) before.set(id, triangles(DETAIL_GEOMETRY[id]));

  for (const id of Object.keys(MID_GEOMETRY)) MID_GEOMETRY[id]!().dispose();
  for (const id of Object.keys(DETAIL_GEOMETRY)) {
    assert.equal(triangles(DETAIL_GEOMETRY[id]), before.get(id), `${id} came back coarse after the mid forms were built`);
  }

  assert.throws(() => coarsened(0.25, () => { throw new Error("boom"); }), /boom/);
  for (const id of Object.keys(DETAIL_GEOMETRY)) {
    assert.equal(triangles(DETAIL_GEOMETRY[id]), before.get(id), `${id} came back coarse after a builder threw`);
  }
});

test("the shipped inner radius is what the measurement says it is", () => {
  // THE ONE NUMBER THE LAYER SHIPS, checked against the live measurement rather than remembered —
  // the far band's arrangement, and the reason `detailBand` exists at all.
  //
  //   Rin = R * sqrt( k / (1 - fog(R)) )
  //
  // The premise is that the renderer ALREADY accepts E_ord(R) differing pixels at the outer edge,
  // because that is the substitution it makes there today. Error falls as 1/d^2 and the mid form's
  // is k times the ordinary form's, so the nearest distance at which the mid form is no worse than
  // what is already accepted at R is R*sqrt(k). The fog term is the correction for the fact that
  // the accepted error at R is fog-weighted and the mid band sits nearer, where less fog hides it;
  // it is worth 1.75% at 180 m, and it is in the formula because it is cheap to be right.
  //
  // THE CURRENCY IS DIFFERING PIXEL AREA, which is what `switchPixels` returns and what C22's far
  // band and C37's detail band are both denominated in. Read as a proportion the same premise would
  // say 0 m and read as a mean edge displacement it would say R*k = 33.5 m; the exponent is a choice
  // and this is the one every other band in this renderer already makes.
  const R = 180;
  const scale = ASSET_CLASSES.find((c) => c.id === "broadleaf")!.scale[1];
  const mid = pairOf(DETAIL_GEOMETRY.broadleaf!, MID_GEOMETRY.broadleaf!, scale);
  const ord = pairOf(DETAIL_GEOMETRY.broadleaf!, SCATTER_GEOMETRY.broadleaf!, scale);
  const k = switchPixels(mid, VIEWPORTS[1], R / 4) / switchPixels(ord, VIEWPORTS[1], R / 4);
  const derived = R * Math.sqrt(k / (1 - fog(R)));

  console.log(`\n  broadleaf: k = ${k.toFixed(4)}, fog(${R}) = ${fog(R).toFixed(4)}, derived inner edge ${derived.toFixed(1)} m, ships ${MID_BAND_INNER_M.broadleaf} m\n`);
  assert.ok(Math.abs(derived - MID_BAND_INNER_M.broadleaf!) < 1.5,
    `the shipped inner radius ${MID_BAND_INNER_M.broadleaf} m has drifted from the derived ${derived.toFixed(1)} m`);

  // The band must have room to exist, and its dither must clear the outer one — two smoothsteps
  // that overlap are not complementary, so fragments in the overlap are discarded by every mesh.
  const inner = { r: MID_BAND_INNER_M.broadleaf!, t: Math.max(3, MID_BAND_INNER_M.broadleaf! * 0.08) };
  const outer = { r: R, t: Math.max(3, R * 0.08) };
  assert.ok(inner.r + inner.t <= outer.r - outer.t, `the dither bands overlap: ${inner.r + inner.t} > ${outer.r - outer.t}`);
});

test("the mid band is exactly the classes the draw-call budget can pay for", () => {
  // C16's ceiling is 600,000 triangles AND 120 DRAW CALLS, and the demo parcel measures 119 of 120.
  // A mid mesh is +1 unavoidable call for any class with instances — detailLayer hands it the
  // source's whole-disk bounding sphere, which is never frustum-culled — so the call budget, not
  // the triangle budget, is what decides how many classes may have one.
  //
  // `broadleaf` is the class that is free: the most expensive form in the registry, on the 180 m
  // band, and absent from the demo parcel entirely (rainforest and beach, whose largest tree is
  // buttress-tree at 361 triangles). If a second class is ever added here, the demo's worst-heading
  // call count has to be re-measured first, because it has room for exactly one.
  assert.deepEqual(Object.keys(MID_BAND_INNER_M), ["broadleaf"]);
  const detail = triangles(DETAIL_GEOMETRY.broadleaf), mid = triangles(MID_GEOMETRY.broadleaf), plain = triangles(SCATTER_GEOMETRY.broadleaf);
  assert.ok(mid <= 0.6 * detail, `the mid form saves too little to be worth a draw call: ${mid} of ${detail}`);
  assert.ok(mid > plain, `the mid form is not dearer than the ordinary form (${mid} vs ${plain}), so it would be a coarser form drawn NEARER than a finer one`);
});
