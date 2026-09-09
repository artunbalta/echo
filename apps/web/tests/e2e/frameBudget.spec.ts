/**
 * Where the frame that BREAKS the budget goes, per layer (SOC-1.A, DECISIONS C28 and C31).
 *
 * C28 measured what the shipped frame costs — 907,250 triangles on an ordinary parcel against
 * C16's ceiling of 600,000, worst of a full turn. C31 measured where a frame goes, per layer — but
 * at the SPAWN VIEW, standing still, which is the cheapest frame either route ever draws (559,380).
 *
 * So the split exists for a frame that fits and does not exist for the frame that does not, and the
 * gap between them is 348,000 triangles nobody has attributed. Every plan for making the frame fit
 * is currently aimed at the spawn view's biggest layers, which may not be the worst heading's
 * biggest layers at all — the shadow pass alone goes from 71,191 at the spawn to 242,445 at the
 * worst, more than tripling, while the main pass grows by a third.
 *
 * THIS FILE ASSERTS ALMOST NOTHING AND PRINTS A TABLE, on purpose. It is a measuring instrument:
 * the ceiling it would assert against is C16's and `scatterSplit.spec.ts` already fails on it, so a
 * second red spec saying the same thing adds noise and no information. What it does assert is that
 * the instrument itself is sound — the circle closed, and the layers add up to the frame — because
 * a table that does not add up is worse than no table.
 *
 * Run:  cd apps/web && npx playwright test tests/e2e/frameBudget.spec.ts --project=chromium
 */
import { expect, test } from "@playwright/test";

import { ORBIT_RAD_PER_PX, TURN_STEPS, readyWorld, sweep } from "./turn";
import { ORDINARY_CELL, SLICE_HREF } from "./demoUrl";

interface LayerCost {
  calls: number;
  triangles: number;
  shadowCalls: number;
  shadowTriangles: number;
}

interface Frame {
  triangles: number;
  calls: number;
  main: number;
  shadow: number;
  layers: Record<string, LayerCost>;
}

async function readFrame(page: import("@playwright/test").Page): Promise<Frame> {
  const host = page.locator("[data-world-layers]");
  // ONE evaluation. The host rewrites every attribute on a one-second interval, so eleven separate
  // round-trips straddle a sample and report two frames as one — measured, once, as `whole` 628,043
  // against `main + shadow` 628,636.
  const raw = await host.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const n = (k: string) => Number(raw[k]);
  return {
    triangles: n("worldTriangles"),
    calls: n("worldCalls"),
    main: n("worldMainTriangles"),
    shadow: n("worldShadowTriangles"),
    layers: JSON.parse(raw.worldLayers ?? "{}") as Record<string, LayerCost>,
  };
}

/**
 * BOTH ordinary cells, named, because "the ordinary parcel" is not one place.
 *
 * `scatterSplit.spec.ts` measures `8482589ffffffff` and `demoUrl.ORDINARY_CELL` is
 * `847db45ffffffff`, and MEASURED they were 921,050 and 1,580,189 triangles at their worst headings —
 * a factor of 1.7 between two parcels the suite calls by the same name. DECISIONS C28 and C31 both
 * say "the ordinary parcel" as though it were singular; C28's 907,250 is the first cell. A frame
 * budget quoted without its cell is a frame budget about one parcel of 284,004.
 *
 * SINCE C38 the second cell is 1,029,768 and the first is unchanged, which is the same point made
 * twice: `broadleaf` grows on `847db45` and on neither of the others, so the mid band that halves
 * its detail layer is INERT on the two routes that do not have the class. The demo came back
 * byte-identical, 867,015 triangles and 119 calls, which is how that inertness was checked.
 */
for (const [label, href] of [
  ["ordinary 8482589 (C28's cell)", "/parcel/8482589ffffffff?debug=layers"],
  [`ordinary ${ORDINARY_CELL.slice(0, 7)} (demoUrl's)`, `/parcel/${ORDINARY_CELL}?debug=layers`],
  ["demo", `${SLICE_HREF}&debug=layers`],
] as const) {
  test(`${label}: where the worst heading's frame goes`, async ({ page }) => {
    test.setTimeout(600_000);
    // Freezes the sky at DUSK and pins the pixel ratio, without which the shadow half of the table
    // is a fact about what time it is (C31).
    await readyWorld(page, href);
    await page.locator("[data-world-layers]").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2_500); // two sampling windows: the first can straddle the build

    const turned = await sweep(page, async () => {
      // The host samples once a second and the attributes are rewritten then, so a heading has to
      // be stood at for longer than one window or the table describes the heading before it.
      await page.waitForTimeout(1_200);
      return readFrame(page);
    });

    // The circle really closed. Without this the table is about an arc, which is the exact failure
    // turn.ts exists to prevent.
    expect(Math.abs(turned.sweptDeg), `swept ${turned.sweptDeg.toFixed(1)} degrees`).toBeGreaterThan(300);

    const worst = turned.headings.reduce((a, b) => (b.sample.triangles > a.sample.triangles ? b : a));
    const best = turned.headings.reduce((a, b) => (b.sample.triangles < a.sample.triangles ? b : a));
    const f = worst.sample;

    const rows = Object.entries(f.layers).sort(
      (a, b) => b[1].triangles + b[1].shadowTriangles - (a[1].triangles + a[1].shadowTriangles),
    );
    const sum = (pick: (c: LayerCost) => number) => rows.reduce((n, [, c]) => n + pick(c), 0);

    console.log(
      `\n  ${label} — worst of ${TURN_STEPS} headings (${ORBIT_RAD_PER_PX} rad/px, swept ${turned.sweptDeg.toFixed(0)}°)\n` +
        `  worst heading ${worst.deg.toFixed(0)}°: ${f.triangles.toLocaleString()} tri / ${f.calls} calls` +
        `   (main ${f.main.toLocaleString()}, shadow ${f.shadow.toLocaleString()})\n` +
        `  best  heading ${best.deg.toFixed(0)}°: ${best.sample.triangles.toLocaleString()} tri\n` +
        `  ${"layer".padEnd(16)}${"main tri".padStart(11)}${"calls".padStart(7)}${"shadow tri".padStart(13)}${"calls".padStart(7)}\n` +
        rows
          .map(
            ([nme, c]) =>
              `  ${nme.padEnd(16)}${c.triangles.toLocaleString().padStart(11)}${String(c.calls).padStart(7)}` +
              `${c.shadowTriangles.toLocaleString().padStart(13)}${String(c.shadowCalls).padStart(7)}`,
          )
          .join("\n") +
        `\n  ${"— attributed —".padEnd(16)}${sum((c) => c.triangles).toLocaleString().padStart(11)}` +
        `${" ".repeat(7)}${sum((c) => c.shadowTriangles).toLocaleString().padStart(13)}\n`,
    );

    // The instrument is sound: the parts are the whole. Not a budget assertion — C16's ceiling is
    // scatterSplit.spec.ts's to fail on, and a second spec failing the same way is noise.
    expect(sum((c) => c.triangles)).toBe(f.main);
    expect(sum((c) => c.shadowTriangles)).toBe(f.shadow);
    expect(f.triangles).toBe(f.main + f.shadow);
  });
}
