/**
 * Where the frame goes, per layer, on the page a person opens (SOC-1.A, DECISIONS C28).
 *
 * C28 established WHAT the shipped frame costs — 907,250 triangles on an ordinary parcel against
 * C16's ceiling of 600,000 — by reading a spec that had been red for months. It did not establish
 * WHERE, and nothing could: `parcelWorld.ts` composes a flat list of layers into one scene, so no
 * name downstream says whose mesh is whose. `?debug=layers` makes the host stamp each object with
 * the layer that added it and bracket its draws with three's own hooks, and this spec is what reads
 * the result off the real page.
 *
 * WHY THE ASSERTIONS ARE SHAPED THIS WAY. It does NOT assert a fixed set of layer names. Two of the
 * seven layers add nothing to the scene at all — `canopy-closure` edits the terrain's colours in
 * place and `walk` allocates nothing, saying so in its own header — so they have no row, and a zero
 * row for them would imply they were measured and found free. What it asserts instead is the
 * accounting identity: the per-layer rows plus whatever is unattributed equal the whole frame. An
 * instrument whose parts do not sum to its total is not measuring the thing it names.
 *
 * IT PRINTS. The point of this file is the table in its output; the assertions only stop that table
 * from being fiction.
 */
import { expect, test } from "@playwright/test";

import { ORDINARY_CELL, SLICE_HREF } from "./demoUrl";

interface LayerCost {
  calls: number;
  triangles: number;
  shadowCalls: number;
  shadowTriangles: number;
}

async function readFrame(page: import("@playwright/test").Page, href: string) {
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });
  // The host samples on a one-second interval, so wait for the attribute rather than for a duration.
  const host = page.locator("[data-world-layers]");
  await host.waitFor({ timeout: 30_000 });
  // Two windows: the first can straddle the build, where a half-built scene is not the frame.
  await page.waitForTimeout(2_500);

  // ONE EVALUATION, and it has to be one. The host rewrites every attribute on a one-second
  // interval, so reading them with eleven separate `getAttribute` round-trips straddles a sample:
  // measured, `whole` came back 628,043 while `main + shadow` came back 628,636, which is not an
  // instrument that disagrees with itself, it is two frames read as one. `dataset` is snapshotted
  // inside a single synchronous callback, which the interval's own write cannot interleave with.
  const raw = await host.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const n = (name: string) => Number(raw[name]);
  return {
    layers: JSON.parse(raw.worldLayers ?? "{}") as Record<string, LayerCost>,
    triangles: n("worldTriangles"),
    calls: n("worldCalls"),
    mainTriangles: n("worldMainTriangles"),
    shadowTriangles: n("worldShadowTriangles"),
    worstTriangles: n("worldWorstTriangles"),
    fps: n("worldFps"),
    ratio: n("worldPixelRatio"),
    buffer: raw.worldBuffer ?? "",
  };
}

for (const [label, href] of [
  ["ordinary parcel", `/parcel/${ORDINARY_CELL}?debug=layers`],
  ["demo", `${SLICE_HREF}&debug=layers`],
] as const) {
  test(`${label}: the frame is attributed to the layers that drew it`, async ({ page }) => {
    test.setTimeout(240_000);
    const f = await readFrame(page, href);

    const rows = Object.entries(f.layers).sort((a, b) => b[1].triangles - a[1].triangles);
    expect(rows.length, "no layer was attributed anything at all").toBeGreaterThan(2);

    const sum = (pick: (c: LayerCost) => number) => rows.reduce((n, [, c]) => n + pick(c), 0);
    const attributedMain = sum((c) => c.triangles);
    const attributedShadow = sum((c) => c.shadowTriangles);

    console.log(
      `\n  ${label} — ${f.buffer} @${f.ratio}, ${f.fps.toFixed(1)} fps\n` +
        `  whole ${f.triangles.toLocaleString()} tri / ${f.calls} calls   ` +
        `(main ${f.mainTriangles.toLocaleString()}, shadow ${f.shadowTriangles.toLocaleString()}, ` +
        `worst ${f.worstTriangles.toLocaleString()})\n` +
        rows
          .map(
            ([n, c]) =>
              `    ${n.padEnd(16)}${c.triangles.toLocaleString().padStart(10)} tri /${String(c.calls).padStart(4)}` +
              `   shadow ${c.shadowTriangles.toLocaleString().padStart(10)} /${String(c.shadowCalls).padStart(4)}`,
          )
          .join("\n") +
        `\n    ${"— attributed —".padEnd(16)}${attributedMain.toLocaleString().padStart(10)} tri` +
        `   shadow ${attributedShadow.toLocaleString().padStart(10)}\n`,
    );

    // THE ACCOUNTING IDENTITY. Every triangle the main pass drew belongs to some layer or to
    // nothing; an instrument whose parts exceed its total is double-counting, which is exactly what
    // a hook that REPLACED scatterLayer's shadow-twin pair instead of chaining it would do.
    expect(
      attributedMain,
      `attributed ${attributedMain} of a ${f.mainTriangles} main pass — the hooks are double counting`,
    ).toBeLessThanOrEqual(f.mainTriangles);
    expect(attributedShadow).toBeLessThanOrEqual(f.shadowTriangles);
    // And it accounts for most of it: a large unattributed remainder means `scene.add` was bypassed.
    expect(
      attributedMain / Math.max(1, f.mainTriangles),
      "most of the main pass is unattributed, so scene.add is not the only way objects arrive",
    ).toBeGreaterThan(0.8);

    // The whole frame really is both passes, which is the half C28 found nobody was reading.
    // NOTE the shadow half is no longer stable between runs, and that is C24 working as intended:
    // the sun's elevation is derived from the world clock now, so the same camera at a different
    // world hour casts a different shadow pass — measured 81,247 at one hour and 193,777 at
    // another, on an identical view. The MAIN pass is camera-bound and does not move. So this file
    // asserts the identity and prints the numbers; it does not pin either total.
    expect(f.triangles).toBe(f.mainTriangles + f.shadowTriangles);
    expect(f.shadowTriangles, "a world with no shadow pass is a world with the wrong lights").toBeGreaterThan(0);
  });
}

test("a production-shaped page reports nothing until the URL asks", async ({ page }) => {
  // The dev server always reports, so this asserts the branch rather than the build: without the
  // parameter, `renderDebugFor("production", search)` is "off" — pinned in tests/renderDebug.test.mts
  // — and here we assert the visible half, that the readout is not drawn where nothing asked for it.
  await page.goto(`/parcel/${ORDINARY_CELL}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });
  await page.waitForTimeout(1_500);
  // In development the readout IS drawn; what must never happen is a layers table nobody asked for,
  // because that is the expensive instrument.
  const layers = JSON.parse((await page.locator("[data-world-layers]").getAttribute("data-world-layers")) ?? "{}");
  expect(Object.keys(layers), "the per-object instrument ran without being asked").toEqual([]);
});
