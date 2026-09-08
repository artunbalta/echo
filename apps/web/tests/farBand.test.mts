/**
 * `lod.farM` is a measurement, and this is where it is re-taken (DECISIONS C22).
 *
 * WHY THIS FILE EXISTS. Twenty-six distances in packages/planet/lib/assets.ts decide which of two
 * geometries the renderer draws for every instance in the world, and before C22 they were authored:
 * six of them said 900 m over a disk that `SCATTER_FALLOFF` ends at 500, so those six never entered
 * the far band from any camera a person can reach. A number that nobody can check goes stale in
 * silence, so the table is re-derived here from the forms themselves and compared to what shipped.
 * Widen a canopy blob, change a card's fit, move the fog, and this fails with the class and the two
 * distances rather than with a world that quietly costs more.
 *
 * WHAT IT IS NOT ALLOWED TO DO. It may not read `lod.farM` on its way to an answer, and it does
 * not: `deriveFarM` takes a class id, a scale and a viewport, and the only thing it touches from
 * the registry is `scale`. helpers/farBand.mts carries its own rasteriser for the same reason,
 * rather than the one scatterImpostor.ts derives the card with.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ASSET_CLASSES } from "@echo/planet";

import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import { impostorFor } from "../src/game/world/scatterImpostor";
import {
  CAMERA_FOV_DEG,
  CLASS_SWITCH_PIXELS,
  deriveFarM,
  FOG_FAR_M,
  FOG_NEAR_M,
  deriveFarMForPair,
  formPair,
  pixelsPerMetre,
  switchPixels,
  switchPixelsRaw,
  VIEWPORTS,
} from "./helpers/farBand.mjs";

/** How far a shipped value may stand from the derivation: one step of the 10 m grid it is on. */
const ROUNDING_M = 10;

test("every lod.farM is where its own form stops being worth its triangles, re-derived", () => {
  const wrong: string[] = [];
  for (const cls of ASSET_CLASSES) {
    const per = VIEWPORTS.map((h) => deriveFarM(cls.id, cls.scale[1], h));
    const want = Math.ceil(Math.max(...per) / ROUNDING_M) * ROUNDING_M;
    if (cls.lod.farM !== want) {
      wrong.push(
        `${cls.id}: assets.ts says farM ${cls.lod.farM} m; measured, the switch to its own card falls to ` +
          `${CLASS_SWITCH_PIXELS} pixels of the frame at ${per[0]!.toFixed(1)} m at 1280x800 and ${per[1]!.toFixed(1)} m ` +
          `at 1920x1080, so the value is ${want}`,
      );
    }
  }
  assert.deepEqual(
    wrong,
    [],
    `the shipped lod.farM no longer matches the forms it was measured against (DECISIONS C22):\n  ${wrong.join("\n  ")}\n` +
      `A form that changed shape changes the distance at which two triangles can stand in for it. Re-derive rather ` +
      `than widen this test.`,
  );
  console.log(
    `  all ${ASSET_CLASSES.length} farM values re-derived: ` +
      ASSET_CLASSES.slice(0, 3).map((c) => `${c.id} ${c.lod.farM} m`).join(", ") +
      `, ... shell ${ASSET_CLASSES.find((c) => c.id === "shell")!.lod.farM} m`,
  );
});

test("two pixels is a choice the table does not hinge on: 1, 2 and 4 px, printed", () => {
  // "A few pixels" is a small integer somebody has to pick, so the picking is shown rather than
  // hidden. What must not depend on it is the SHAPE of the table: a tighter budget may push every
  // distance out, but it may not push one class out and another in, and the spread from the
  // smallest form to the largest has to survive at every budget or the answer was the fog's.
  const table = (budget: number) =>
    new Map(ASSET_CLASSES.map((c) => [c.id, Math.max(...VIEWPORTS.map((h) => deriveFarM(c.id, c.scale[1], h, 1, budget)))] as const));
  const one = table(1);
  const two = table(CLASS_SWITCH_PIXELS);
  const four = table(4);
  let widest = { id: "", ratio: 0 };
  let narrowest = { id: "", ratio: Infinity };
  for (const cls of ASSET_CLASSES) {
    const a = one.get(cls.id)!;
    const b = two.get(cls.id)!;
    const c = four.get(cls.id)!;
    assert.ok(a >= b && b >= c, `${cls.id}: a tighter pixel budget did not push the distance out (${a}, ${b}, ${c})`);
    const ratio = a / c;
    if (ratio > widest.ratio) widest = { id: cls.id, ratio };
    if (ratio < narrowest.ratio) narrowest = { id: cls.id, ratio };
  }
  const span = (t: Map<string, number>) => Math.max(...t.values()) / Math.min(...t.values());
  // AND THE SPREAD WIDENS AS THE BUDGET DOES, which is the fog's signature and is worth pinning.
  // A tighter budget pushes every class further out, and out there the fog has already taken every
  // form equally, so the classes converge: 1.94x at 1 px, 2.62x at 2, 3.77x at 4. If that ordering
  // ever inverted, the far end of the table would have stopped being fog-limited and the whole
  // argument in DECISIONS C22 for why the answers are not in the ratio of the forms' heights would
  // need re-deriving.
  assert.ok(
    span(one) < span(two) && span(two) < span(four),
    `the table spans ${span(one).toFixed(2)}x at a 1 px budget, ${span(two).toFixed(2)}x at 2 and ${span(four).toFixed(2)}x ` +
      `at 4. A tighter budget must compress the table, not widen it: it pushes every class out to where the fog has ` +
      `already taken all of them.`,
  );
  console.log(
    `  1 px: ${Math.min(...one.values()).toFixed(0)} to ${Math.max(...one.values()).toFixed(0)} m (${span(one).toFixed(2)}x); ` +
      `2 px: ${Math.min(...two.values()).toFixed(0)} to ${Math.max(...two.values()).toFixed(0)} (${span(two).toFixed(2)}x); ` +
      `4 px: ${Math.min(...four.values()).toFixed(0)} to ${Math.max(...four.values()).toFixed(0)} (${span(four).toFixed(2)}x). ` +
      `The budget moves a class by ${narrowest.ratio.toFixed(2)}x (${narrowest.id}) to ${widest.ratio.toFixed(2)}x (${widest.id}) ` +
      `between 1 px and 4 px`,
  );
});

test("the derivation answers a distance because of the form, not because of the fog alone", () => {
  // If the fog were doing all of the work every class would land at the same metre, which is the
  // single shared ceiling DECISIONS C22 rejected. Two things have to be true: the smallest and the
  // largest form must differ by a real margin, and the ordering must follow the forms.
  const byId = new Map(ASSET_CLASSES.map((c) => [c.id, c] as const));
  const shell = byId.get("shell")!.lod.farM;
  const buttress = byId.get("buttress-tree")!.lod.farM;
  assert.ok(
    buttress >= shell * 2,
    `a shell is carded at ${shell} m and a buttress-tree at ${buttress} m, only ${(buttress / shell).toFixed(2)}x apart. ` +
      `A table that close is a shared ceiling wearing per-class numbers, which is what C22 refused.`,
  );
  // And the tallest six, the ones C22 exists for, must all be inside the disk the scatter fills.
  const tall = ["buttress-tree", "canopy-palm", "conifer", "broadleaf", "acacia", "boulder"];
  for (const id of tall) {
    const farM = byId.get(id)!.lod.farM;
    assert.ok(
      farM < 500,
      `${id} carries farM ${farM} m against a scatter disk that ends 500 m from the spawn. Past 500 m no camera a ` +
        `person can reach sees an instance of it at all, so the far band cannot touch it: that is the whole of what ` +
        `DECISIONS C22 was opened to fix.`,
    );
  }
});

test("nearM stayed where it was, and is still inside farM on every class", () => {
  // C22 moved farM and deliberately not nearM: they are different facts, and only one of them is
  // read. What must hold is the ordering, because a nearM past farM would describe a middle band
  // that starts after the far one.
  for (const cls of ASSET_CLASSES) {
    assert.ok(
      cls.lod.nearM < cls.lod.farM,
      `${cls.id} has nearM ${cls.lod.nearM} m at or past farM ${cls.lod.farM} m. The class stops being worth its ` +
        `detail after it has already stopped being drawn.`,
    );
  }
  const tightest = [...ASSET_CLASSES].sort((a, b) => a.lod.farM - a.lod.nearM - (b.lod.farM - b.lod.nearM))[0]!;
  console.log(
    `  the closest pair after C22 is ${tightest.id}, nearM ${tightest.lod.nearM} m inside farM ${tightest.lod.farM} m`,
  );
});

test("the switch cost falls with distance, and the two viewports disagree by their own ratio", () => {
  // The bisection is only sound while the cost is monotone, and the 1920x1080 answer must be the
  // 1280x800 one scaled by the pixels a metre buys, or the derivation is not reading the lens.
  for (const cls of ASSET_CLASSES) {
    const pair = formPair(cls.id, cls.scale[1]);
    let previous = Infinity;
    for (const d of [60, 120, 200, 300, 400, 500]) {
      const now = switchPixels(pair, 1080, d);
      assert.ok(now <= previous, `${cls.id}: the switch cost rose from ${previous.toFixed(2)} to ${now.toFixed(2)} px at ${d} m`);
      previous = now;
    }
    // Same object, same pixel count, two viewports: the distances must stand in the ratio of the
    // viewport heights, because pixels per metre is linear in both.
    const raw = switchPixelsRaw(pair, 800, 300);
    const same = switchPixelsRaw(pair, 1080, 300 * (1080 / 800));
    assert.ok(
      Math.abs(raw - same) <= 0.06 * Math.max(raw, same, 1),
      `${cls.id}: 1280x800 at 300 m reads ${raw.toFixed(2)} px and 1920x1080 at ${(300 * 1080) / 800} m reads ` +
        `${same.toFixed(2)}. The same object at the same angular size must cost the same pixels.`,
    );
  }
});

test("the lens and the fog the derivation uses are the ones the page ships", () => {
  // The derivation imports both from the modules that build them rather than repeating the
  // numbers, so this is not a restatement: it fails if the shipped fog or the shipped lens moves,
  // which is exactly when the whole table has to be re-derived.
  assert.equal(CAMERA_FOV_DEG, 50, "the world's camera is no longer 50 degrees, so every farM below is stale");
  assert.equal(FOG_NEAR_M, 150);
  assert.equal(FOG_FAR_M, 420);
  assert.deepEqual([...VIEWPORTS], [800, 1080]);
  // 50 degrees vertical over 800 px: one metre standing 100 m away is 8.58 px, both axes, because
  // the pixels are square and the horizontal field is the vertical one times the aspect.
  assert.ok(Math.abs(pixelsPerMetre(800, 100) - 8.578) < 0.01, `pixels per metre is ${pixelsPerMetre(800, 100)}`);
  assert.ok(Math.abs(pixelsPerMetre(1080, 100) / pixelsPerMetre(800, 100) - 1080 / 800) < 1e-9);
});

test("a card that is bound to the wrong geometry cannot pass the derivation", () => {
  // The RULE: break it on purpose. If `deriveFarM` were comparing a form against itself it would
  // answer "0 pixels differ" at every distance and hand back the near end of the bracket for every
  // class, which is a table of ones. This is the same substitution the guard is meant to catch.
  for (const id of ["buttress-tree", "fern"]) {
    const g = SCATTER_GEOMETRY[id]!();
    const form = (g.getAttribute("position").array as Float32Array).slice();
    g.dispose();
    const self = { form, card: form, reachM: 12, yLowM: -0.5, yHighM: 26 };
    assert.equal(switchPixelsRaw(self, 1080, 100), 0, `${id} compared against itself must cost nothing`);
    const real = formPair(id, 1);
    assert.ok(
      switchPixelsRaw(real, 1080, 100) > 10,
      `${id}: its own form and its own card differ by ${switchPixelsRaw(real, 1080, 100).toFixed(1)} px at 100 m, which ` +
        `is too little for this file to be measuring anything`,
    );
    void impostorFor(id);
  }
});

test("a card that is bound to the form makes the derivation FAIL, and not hang", () => {
  // THE RULE, applied to the bisection itself rather than to one distance of it.
  //
  // The test above proves `switchPixelsRaw` reads 0 when a form is compared with itself. What that
  // does to `deriveFarM` is the thing worth guarding: a cost that is 0 everywhere never raises the
  // bracket's floor, so the search walks toward the near end, and the raster it builds grows as
  // 1/d^2. Measured with `impostorFor` returning `form.clone()`: 27 ms at 200 m, 2.3 s at 20 m, and
  // over 600 s to finish the twenty-two steps. That is a hang, and a guard that hangs on the one
  // substitution the far band's whole derivation is meant to catch has not caught it.
  //
  // So the near end of the bracket is asserted, and this is that assertion failing on purpose.
  const pair = formPair("buttress-tree", 1.6);
  const degenerate = { ...pair, card: pair.form };
  const started = Date.now();
  assert.throws(
    () => deriveFarMForPair(degenerate, "buttress-tree", 1080),
    /differ by 0\.00 px even at 10 m/,
    "a card bound to its own form must be refused by the derivation, not bisected into",
  );
  const ms = Date.now() - started;
  assert.ok(ms < 60_000, `the refusal took ${ms} ms; it is supposed to be the cheap end of the bracket, not the dear one`);
  // And the control: the real pair, through the same entry point, still answers.
  assert.ok(Math.abs(deriveFarMForPair(pair, "buttress-tree", 1080) - 409) < 2, "the honest pair stopped answering 409 m");
  console.log(`  a form bound as its own card is refused in ${ms} ms instead of bisecting toward 1 m`);
});
