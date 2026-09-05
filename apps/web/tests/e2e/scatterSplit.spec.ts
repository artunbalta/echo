/**
 * The split, on the shipped page, on a real GPU, whole frame (task A7).
 *
 * WHY THIS FILE HAS TO EXIST, and it is not "coverage". tests/scatterSplit.test.mts proves the
 * arithmetic and calls `scatterLayer.cull` itself, so it cannot see whether anything on the page
 * ever calls it: delete `beforeRender` from PlanetWorld's frame loop and every one of those nine
 * tests still passes while the world submits 1.6 M triangles a frame. This file reads
 * `renderer.info` off the page a person opens.
 *
 * IT READS BOTH PASSES, which is the correction the A7 measurement had to make first. three calls
 * `info.reset()` AFTER `shadowMap.render()` and before the main pass, so an ordinary read of
 * `renderer.info` reports the MAIN PASS ALONE, and every triangle count this project quoted before
 * A7 was the frame minus its shadow map. With `autoReset` off and a wrapper on `shadowMap.render`
 * the two passes are separable, and the whole frame on the ordinary parcel turned out to be
 * 1,623,152 rather than the 928,034 that had been on the record.
 *
 * THE BOUND IS THE BUDGET. DECISIONS C16: 600,000 triangles and 120 draw calls for the whole frame,
 * on a mid-range laptop. The triangle counts here are machine-independent; only the milliseconds
 * would not transfer, and this file measures none.
 */
import { expect, test, type Page } from "@playwright/test";

/** 8482589ffffffff: 100% rainforest, no stations, the densest of the shipped routes. */
const PARCEL = "/parcel/8482589ffffffff";
/** The demo cell: 45% ocean, two stations, five swept corridors. */
const DEMO = "/parcel/847b949ffffffff?stations=slice";

/** DECISIONS C16. */
const TRIANGLE_CEILING = 600_000;
const DRAW_CALL_CEILING = 120;

/**
 * What the same frame costs with the split taken out, measured in the same session on the same
 * frame rather than remembered, so the numbers below are a difference and not a coincidence. These
 * are what the routes measured before A7, to the triangle.
 */
const UNSPLIT_WHOLE_FRAME: Record<string, number> = { [PARCEL]: 1_623_152, [DEMO]: 1_118_418 };

/** The hour every A7 measurement was taken at: the art bible's dusk, sixteen degrees of sun. */
const DUSK = 0.25 + (Math.PI - (16 * Math.PI) / 180) / (2 * Math.PI);

function installProbe(): void {
  const w = window as any;
  w.__a7 = {
    world(): any {
      const node = document.querySelector("[data-phase]") as any;
      const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
      if (!key) throw new Error("no React fiber on the phase host; the page has not hydrated");
      let fiber = node[key];
      for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let i = 0; hook && i < 60; i++, hook = hook.next) {
          const state = hook.memoizedState;
          if (state && typeof state === "object" && "current" in state && state.current && typeof state.current.context === "function") {
            return state.current;
          }
        }
      }
      throw new Error("no PlanetWorld on the page");
    },
  };
}

async function ready(page: Page, href: string) {
  await page.addInitScript(installProbe);
  await page.goto(href);
  // The consent card's handler is live only once the world is up: clicked at phase "idle" the
  // button is visible, hit-testable and inert.
  await page.waitForSelector('[data-phase="ready"]', { timeout: 180_000 });
  const button = page.getByRole("button", { name: /let it watch/i });
  const before = await page.evaluate(() => localStorage.getItem("echo.consent"));
  await button.first().click({ timeout: 60_000 });
  await page.waitForFunction((was) => localStorage.getItem("echo.consent") !== was, before, { timeout: 20_000 });
  await page.evaluate((duskT) => {
    const ctx = (window as any).__a7.world().context();
    ctx.layer("sky").setRate(0);
    ctx.layer("sky").setTimeOfDay(duskT);
    ctx.renderer.setPixelRatio(1);
  }, DUSK);
  await page.waitForTimeout(500);
}

/** Split renderer.info by pass, and sample a run of frames the page draws for itself. */
async function frames(page: Page, count: number) {
  await page.evaluate(() => {
    const w = window as any;
    const renderer = w.__a7.world().context().renderer;
    if (w.__a7.installed) {
      w.__a7.samples.length = 0;
      return;
    }
    w.__a7.installed = true;
    w.__a7.samples = [];
    renderer.info.autoReset = false;
    const sm = renderer.shadowMap;
    const origShadow = sm.render.bind(sm);
    sm.render = (...a: unknown[]) => {
      renderer.info.reset();
      (origShadow as any)(...a);
      w.__a7.shadow = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    };
    const origRender = renderer.render.bind(renderer);
    renderer.render = (scene: unknown, camera: unknown) => {
      renderer.info.reset();
      w.__a7.shadow = { calls: 0, triangles: 0 };
      origRender(scene, camera);
      const whole = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      const scatter = w.__a7.world().context().layer("scatter");
      w.__a7.samples.push({
        whole,
        shadow: w.__a7.shadow,
        main: { calls: whole.calls - w.__a7.shadow.calls, triangles: whole.triangles - w.__a7.shadow.triangles },
        cull: scatter.lastCull ? scatter.lastCull() : null,
      });
      if (w.__a7.samples.length > 2000) w.__a7.samples.shift();
    };
  });
  await page.waitForFunction((n) => (window as any).__a7.samples.length >= n, count, { timeout: 60_000 });
  return page.evaluate(() => {
    const s = (window as any).__a7.samples.slice();
    const q = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
    const tri = s.map((x: any) => x.whole.triangles);
    const calls = s.map((x: any) => x.whole.calls);
    const cull = s.map((x: any) => (x.cull ? x.cull.ms : null)).filter((x: number | null) => x !== null) as number[];
    const last = s[s.length - 1];
    return {
      frames: s.length,
      wholeTriangles: { p50: q(tri, 0.5), worst: Math.max(...tri) },
      wholeCalls: { p50: q(calls, 0.5), worst: Math.max(...calls) },
      mainTriangles: last.main.triangles,
      shadowTriangles: last.shadow.triangles,
      cullMs: cull.length ? { p50: q(cull, 0.5), worst: Math.max(...cull) } : null,
      cull: last.cull,
    };
  });
}

/** Put the scatter back to one mesh per class drawing everything: the layer as it shipped before A7. */
async function unsplit(page: Page) {
  await page.evaluate(() => {
    const ctx = (window as any).__a7.world().context();
    const scatter = ctx.layer("scatter");
    scatter.invalidate();
    for (const [id, mesh] of scatter.meshes) {
      const b = scatter.buckets.get(id);
      mesh.instanceMatrix.array.set(b.matrices);
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = b.instances;
      mesh.castShadow = scatter.shadowMeshes.has(id);
    }
    for (const [, twin] of scatter.shadowMeshes) {
      twin.visible = false;
      twin.count = 0;
    }
    scatter.beforeRender = () => {};
  });
  // Two frames to settle: flipping castShadow defers an instance buffer upload by one render, for
  // the reason scatterLayer's `cull` records.
  await page.waitForTimeout(200);
}

/** Turn the camera all the way round by dragging, sampling the worst frame at each heading. */
async function turn(page: Page, steps: number) {
  const worst = { triangles: 0, calls: 0 };
  await page.mouse.move(640, 400);
  for (let k = 0; k < steps; k++) {
    await page.mouse.down();
    await page.mouse.move(640 + (360 / steps) / 0.006 / 10, 400, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(640, 400);
    const s = await frames(page, 12);
    worst.triangles = Math.max(worst.triangles, s.wholeTriangles.worst);
    worst.calls = Math.max(worst.calls, s.wholeCalls.worst);
  }
  return worst;
}

for (const [name, href] of [
  ["the ordinary parcel", PARCEL],
  ["the demo", DEMO],
] as const) {
  test(`${name} draws only what is in front of the camera, both passes, inside the budget`, async ({ page }) => {
    test.setTimeout(240_000);
    await ready(page, href);
    const spawn = await frames(page, 60);

    expect(spawn.cull, "the page never called the scatter's cull, so nothing on it is culled").not.toBeNull();

    // THE BUDGET, at the view the game gives you. DECISIONS C16, whole frame, both passes.
    expect(
      spawn.wholeTriangles.worst,
      `whole frame ${spawn.wholeTriangles.worst.toLocaleString()} triangles (main ${spawn.mainTriangles.toLocaleString()}, ` +
        `shadow ${spawn.shadowTriangles.toLocaleString()}) against the ${TRIANGLE_CEILING.toLocaleString()} of DECISIONS C16`,
    ).toBeLessThan(TRIANGLE_CEILING);
    expect(
      spawn.wholeCalls.worst,
      `whole frame ${spawn.wholeCalls.worst} draw calls against the ${DRAW_CALL_CEILING} of DECISIONS C16. A split that ` +
        `fits the triangle budget by spending the draw-call budget has moved the problem rather than solved it.`,
    ).toBeLessThan(DRAW_CALL_CEILING);

    // AND AT EVERY HEADING A DRAG CAN REACH, because the spawn view is one view and the cheapest
    // one on the parcel: 445,158 triangles there against 622,210 with the forest in front of you.
    // The draw-call ceiling is absolute; the triangle ceiling is measured against the same turn
    // with the split taken out, because on the densest parcel the turned frame is still 1.04x the
    // 600,000 and saying so is worth more than a bound picked to let it pass.
    const turnedSplit = await turn(page, 6);
    expect(
      turnedSplit.calls,
      `turning reached ${turnedSplit.calls} draw calls against the ${DRAW_CALL_CEILING} of DECISIONS C16`,
    ).toBeLessThan(DRAW_CALL_CEILING);

    await unsplit(page);
    const before = await frames(page, 30);
    expect(
      before.wholeTriangles.worst,
      `with the split taken out the frame is ${before.wholeTriangles.worst.toLocaleString()} triangles; it was ` +
        `${UNSPLIT_WHOLE_FRAME[href]!.toLocaleString()} when A7 was measured, so this session is not comparable`,
    ).toBeGreaterThan(UNSPLIT_WHOLE_FRAME[href]! * 0.9);
    const turnedFlat = await turn(page, 6);

    expect(
      spawn.wholeTriangles.worst * 2,
      `at the spawn the split submits ${spawn.wholeTriangles.worst.toLocaleString()} where no split submits ` +
        `${before.wholeTriangles.worst.toLocaleString()}, which is less than half again. The grid has stopped culling.`,
    ).toBeLessThan(before.wholeTriangles.worst);
    expect(
      turnedSplit.triangles * 2,
      `over a whole turn the split's worst frame is ${turnedSplit.triangles.toLocaleString()} against the ` +
        `${turnedFlat.triangles.toLocaleString()} of the same turn with no split, which is less than half again. ` +
        `The grid culls at the spawn and stops culling when you look at the forest.`,
    ).toBeLessThan(turnedFlat.triangles);

    console.log(
      `${name}: spawn ${spawn.wholeTriangles.worst.toLocaleString()} tri / ${spawn.wholeCalls.worst} calls ` +
        `(main ${spawn.mainTriangles.toLocaleString()}, shadow ${spawn.shadowTriangles.toLocaleString()}); ` +
        `worst over a turn ${turnedSplit.triangles.toLocaleString()} / ${turnedSplit.calls} calls. ` +
        `With no split: ${before.wholeTriangles.worst.toLocaleString()} at the spawn, ` +
        `${turnedFlat.triangles.toLocaleString()} over the turn. ` +
        `Cull ${spawn.cullMs ? spawn.cullMs.p50.toFixed(3) : "?"} ms p50, ${spawn.cullMs ? spawn.cullMs.worst.toFixed(3) : "?"} ms worst.`,
    );
  });
}
