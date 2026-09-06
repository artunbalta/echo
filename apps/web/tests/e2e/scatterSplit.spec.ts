/**
 * The split, on the shipped page, on a real GPU, whole frame (task A7).
 *
 * WHY THIS FILE HAS TO EXIST, and it is not "coverage". tests/scatterSplit.test.mts proves the
 * arithmetic and calls `scatterLayer.cull` itself, so it cannot see whether anything on the page
 * ever calls it: delete `beforeRender` from PlanetWorld's frame loop and every one of those eleven
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
 * The orbit dial the page is actually driven by: `FOLLOW_CAMERA.orbitRadPerPx` in
 * src/game/world/followCamera.ts, radians of yaw per pixel of drag.
 *
 * RESTATED RATHER THAN IMPORTED because Playwright compiles these files to CJS and that module
 * reaches @echo/shared, which is ESM only; demoUrl.ts carries the same admission. A restated
 * constant is the thing that goes stale, so it is not trusted: `turn` reads the camera's own yaw
 * back after every drag and the test asserts the circle closed, which is exactly the check that
 * catches this number drifting.
 */
const ORBIT_RAD_PER_PX = 0.006;

/**
 * How many headings a turn stops at. 24 is one every 15 degrees, three times the eight headings
 * tests/scatterSplit.test.mts samples off the same drag, and close enough together that a wall of
 * trees cannot stand between two of them.
 */
const TURN_STEPS = 24;

/**
 * What the same frame costs with the split taken out, measured in the same session on the same
 * frame rather than remembered, so the numbers below are a difference and not a coincidence.
 *
 * THESE MOVED WITH DECISIONS C20 and the old pair is kept beside them, because this constant's only
 * job is to say "this session is not comparable" and a stale one says it about a healthy session.
 * A7 measured 1,623,152 and 1,118,418 with every class the registry flagged casting a shadow; C20
 * stopped the five classes under 1.7 m casting, which takes 290,884 out of the parcel's unsplit
 * frame and 193,880 out of the demo's, all of it from the shadow pass. Measured on the real GPU in
 * the same session as everything else here.
 */
const UNSPLIT_WHOLE_FRAME: Record<string, number> = { [PARCEL]: 1_332_268, [DEMO]: 924_538 };

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

/**
 * The camera's own yaw, in degrees, read off the lens.
 *
 * The camera looks down its local -Z, so its world forward is the negated third column of
 * `matrixWorld`; followCamera's `cameraForward(yaw)` is [-sin yaw, -cos yaw], so the yaw that
 * produced that forward is `atan2(-fx, -fz)`. `matrixWorld.elements` is a plain array of sixteen
 * numbers, which is the only reason this can be read inside `evaluate` with no three on the page.
 *
 * It is the CAMERA that is asked and not the follow-camera state, because the question is which
 * way the frame being measured is looking, and a state that had stopped reaching the lens would
 * answer the question wrongly and confidently.
 */
async function yawDeg(page: Page): Promise<number> {
  return page.evaluate(() => {
    const e = (window as any).__a7.world().context().camera.matrixWorld.elements as number[];
    const fx = -e[8];
    const fz = -e[10];
    return (Math.atan2(-fx, -fz) * 180) / Math.PI;
  });
}

/**
 * Turn the camera all the way round by dragging, sampling every frame at every heading.
 *
 * THE DRAG IS IN PIXELS AND THE DIAL IS IN RADIANS, and this function used to confuse the two: it
 * fed DEGREES into a radians-per-pixel dial with a /10 beside it, so `turn(page, 6)` dragged
 * 1,000 px, which is 6.0 radians, 343.8 degrees, netting 16.2 degrees a step. Instrumented, its six
 * steps reached 0, 16.2, 32.5, 48.7, 64.9, 81.1 and 97.4 degrees: a 97 degree arc, 27% of the
 * circle, sampled under a comment that claimed every heading a drag can reach. The parcel's worst
 * heading is not in that arc.
 *
 * So the pixels are derived from the radians wanted, and the result is not trusted either: the
 * yaw is READ BACK off the camera after every step, the steps are unwrapped and summed, and the
 * caller asserts the circle closed. A drag that stops moving the camera, a dial that changes and a
 * page that swallows the pointer all show up as an arc that is not 360 degrees.
 */
async function turn(page: Page, steps: number) {
  const dragPx = (2 * Math.PI) / steps / ORBIT_RAD_PER_PX;
  const at: Array<{ deg: number; triangles: number; calls: number; main: number; shadow: number; cull: any }> = [];
  let previous = await yawDeg(page);
  let swept = 0;
  await page.mouse.move(640, 400);
  for (let k = 0; k < steps; k++) {
    await page.mouse.down();
    await page.mouse.move(640 + dragPx, 400, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(640, 400);
    const s = await frames(page, 12);
    const now = await yawDeg(page);
    // Unwrapped, so a 15 degree step across the +-180 seam reads as 15 and not as 345.
    let step = now - previous;
    while (step > 180) step -= 360;
    while (step <= -180) step += 360;
    swept += step;
    previous = now;
    // `main` and `shadow` are the last frame of the twelve rather than the worst, because
    // `renderer.info` is only separable by pass at the moment the wrapper reads it; at a heading
    // the camera is standing still at, the twelve differ by hundreds of triangles.
    at.push({
      deg: now,
      triangles: s.wholeTriangles.worst,
      calls: s.wholeCalls.worst,
      main: s.mainTriangles,
      shadow: s.shadowTriangles,
      // The layer's own account of the same frame, kept so the saving below can be measured against
      // what the split had to work with rather than against the whole frame.
      cull: s.cull,
    });
  }
  const worst = at.reduce((a, b) => (b.triangles > a.triangles ? b : a), at[0]!);
  return {
    at,
    worst,
    sweptDeg: swept,
    triangles: worst.triangles,
    atDeg: worst.deg,
    calls: Math.max(...at.map((h) => h.calls)),
  };
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

    // AND AT EVERY HEADING, all 24 of them, because the spawn view is one view and the cheapest one
    // on the parcel. The 622,210 this file used to quote as "the worst view a drag can reach" was
    // the worst of a 97 degree arc, 27% of the circle, which is all the old turn could reach; what
    // the other 73% costs is measured below and it is worse.
    const turnedSplit = await turn(page, TURN_STEPS);

    // The turn turned. Asserted before anything is concluded from it, because every number this
    // block prints is a number about headings, and a drag that has stopped moving the camera would
    // report the spawn view 24 times and call it a circle.
    expect(
      Math.abs(turnedSplit.sweptDeg),
      `the drag swept ${turnedSplit.sweptDeg.toFixed(1)} degrees of the camera's own yaw over ${TURN_STEPS} steps, ` +
        `not 360. Headings reached: ${turnedSplit.at.map((h) => h.deg.toFixed(0)).join(", ")}. A turn that does not ` +
        `turn measures one view and reports it as the worst of many.`,
    ).toBeGreaterThan(350);
    expect(Math.abs(turnedSplit.sweptDeg), `the drag swept ${turnedSplit.sweptDeg.toFixed(1)} degrees, more than one turn`).toBeLessThan(370);

    expect(
      turnedSplit.calls,
      `turning reached ${turnedSplit.calls} draw calls against the ${DRAW_CALL_CEILING} of DECISIONS C16`,
    ).toBeLessThan(DRAW_CALL_CEILING);

    // THE TRIANGLE CEILING OVER THE WHOLE TURN. Soft on purpose, and it is soft for a reason that
    // has not stopped applying now that both routes pass it: the rest of this test is the
    // measurement that says by how much a failing heading missed and against what, and a hard stop
    // here would hide the very numbers the failure needs to be read with. Soft still fails the test.
    //
    // BOTH ROUTES NOW FIT AT ALL 24 HEADINGS. Before DECISIONS C20 the parcel was over at eleven of
    // them, worst 629,366, of which 345,107 was the shadow pass. C20 stopped the classes under
    // 1.7 m casting and the worst heading is 497,080, main 270,338 and shadow 226,742.
    const over = turnedSplit.at.filter((h) => h.triangles >= TRIANGLE_CEILING);
    expect.soft(
      over.length,
      `${over.length} of ${TURN_STEPS} headings are over the ${TRIANGLE_CEILING.toLocaleString()} of DECISIONS C16, ` +
        `worst ${turnedSplit.triangles.toLocaleString()} at ${turnedSplit.atDeg.toFixed(0)} degrees (main ` +
        `${turnedSplit.worst.main.toLocaleString()}, shadow ${turnedSplit.worst.shadow.toLocaleString()}). Over: ` +
        `${over.map((h) => `${h.deg.toFixed(0)} deg ${h.triangles.toLocaleString()}`).join("; ")}`,
    ).toBe(0);

    await unsplit(page);
    const before = await frames(page, 30);
    expect(
      before.wholeTriangles.worst,
      `with the split taken out the frame is ${before.wholeTriangles.worst.toLocaleString()} triangles; it was ` +
        `${UNSPLIT_WHOLE_FRAME[href]!.toLocaleString()} when A7 was measured, so this session is not comparable`,
    ).toBeGreaterThan(UNSPLIT_WHOLE_FRAME[href]! * 0.9);
    const turnedFlat = await turn(page, TURN_STEPS);

    expect(
      spawn.wholeTriangles.worst * 2,
      `at the spawn the split submits ${spawn.wholeTriangles.worst.toLocaleString()} where no split submits ` +
        `${before.wholeTriangles.worst.toLocaleString()}, which is less than half again. The grid has stopped culling.`,
    ).toBeLessThan(before.wholeTriangles.worst);
    // OVER A WHOLE TURN THE BOUND IS ON THE SAVING, NOT ON THE RATIO, and the difference is what
    // DECISIONS C20 exposed. This used to read `split * 2 < flat`, which asks the split to halve the
    // WHOLE FRAME. The frame is the scatter plus a floor the split does not touch: seven terrain
    // chunks over a 4 km disk with one bounding sphere each, the sea, the sky and the character.
    // Take a fixed number of triangles out of the scatter, as C20 did, and both sides of that ratio
    // fall by the same amount, so the ratio falls too, and an optimisation that makes the frame
    // cheaper makes the guard angrier: the demo came out at 476,959 against 945,366, 1.98x, and
    // failed a bound it had been passing at 2.02x while submitting 87,000 fewer triangles.
    //
    // So the question is asked the way it can be answered: of the triangles the split COULD remove,
    // which is the scatter's own unsplit total, how many did it actually remove from the frame. The
    // opportunity is the layer's own report and the saving is `renderer.info`'s, two sources, and
    // half of the opportunity is the same demand the old line made of the frame.
    const opportunity = turnedSplit.worst.cull
      ? turnedSplit.worst.cull.unsplitMainTriangles + turnedSplit.worst.cull.unsplitShadowTriangles
      : 0;
    expect(opportunity, "the cull reports no unsplit total, so there is nothing to measure the saving against").toBeGreaterThan(0);
    const saved = turnedFlat.triangles - turnedSplit.triangles;
    expect(
      saved,
      `over a whole turn the split's worst frame is ${turnedSplit.triangles.toLocaleString()} against the ` +
        `${turnedFlat.triangles.toLocaleString()} of the same turn with no split, a saving of ${saved.toLocaleString()} ` +
        `out of the ${opportunity.toLocaleString()} triangles the scatter would submit unsplit. The grid culls at the ` +
        `spawn and stops culling when you look at the forest.`,
    ).toBeGreaterThan(opportunity / 2);

    console.log(
      `${name}: spawn ${spawn.wholeTriangles.worst.toLocaleString()} tri / ${spawn.wholeCalls.worst} calls ` +
        `(main ${spawn.mainTriangles.toLocaleString()}, shadow ${spawn.shadowTriangles.toLocaleString()}); ` +
        `worst over a ${turnedSplit.sweptDeg.toFixed(0)} degree turn ${turnedSplit.triangles.toLocaleString()} tri at ` +
        `${turnedSplit.atDeg.toFixed(0)} deg (main ${turnedSplit.worst.main.toLocaleString()}, shadow ` +
        `${turnedSplit.worst.shadow.toLocaleString()}) / ${turnedSplit.calls} calls, ${over.length} of ${TURN_STEPS} headings ` +
        `over ${TRIANGLE_CEILING.toLocaleString()}. ` +
        `With no split: ${before.wholeTriangles.worst.toLocaleString()} at the spawn, ` +
        `${turnedFlat.triangles.toLocaleString()} over the turn, so the turn's worst frame keeps ` +
        `${((100 * saved) / opportunity).toFixed(1)}% of the ${opportunity.toLocaleString()} the scatter offered. ` +
        `Cull ${spawn.cullMs ? spawn.cullMs.p50.toFixed(3) : "?"} ms p50, ${spawn.cullMs ? spawn.cullMs.worst.toFixed(3) : "?"} ms worst.`,
    );
  });
}
