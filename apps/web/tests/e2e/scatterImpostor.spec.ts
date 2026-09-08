/**
 * The far band, on the shipped page, on a real GPU (DECISIONS C21).
 *
 * WHY THIS FILE HAS TO EXIST, and it is not "coverage". tests/scatterImpostor.test.mts proves the
 * arithmetic and calls `scatterLayer.cull` itself, so it cannot see whether anything on the page
 * ever engages the far band: take the impostor mesh out of the scene and every one of those nine
 * tests still passes while the world submits its full forms to the horizon. This file reads
 * `renderer.info` off the page a person opens, and it is also the only place the billboard's vertex
 * shader can be measured, because there is no GLSL in node.
 *
 * IT ASKS THREE QUESTIONS AND EACH HAS A CONTROL MEASURED IN THE SAME SESSION.
 *
 *   Does it engage, and what is it worth? The far band is put back to its FULL FORM in the same
 *   session, by appending whatever the cull packed into a class's far mesh onto the end of that
 *   class's own main mesh, and both frames are read off `renderer.info`. That is the world exactly
 *   as it was before C21: the same instances, the same order, the full geometry.
 *
 *   Does the card turn to face the lens? The patch is removed from the shipped material and the far
 *   band is re-rendered at the same camera. A card that keeps the placer's yaw shows the cosine of
 *   whatever angle the hash gave it, so it covers fewer pixels; a card that has stopped turning
 *   would read the same both ways.
 *
 *   Does the near field move? The lens is clipped to the shortest `lod.farM` of the classes this
 *   cell grows, and the two configurations are compared pixel for pixel. Inside that distance not
 *   one class has switched, so the answer has to be zero of 1,024,000.
 */
import { expect, test, type Page } from "@playwright/test";

/** 8482589ffffffff: 100% rainforest, no stations, the densest of the shipped routes. */
const PARCEL = "/parcel/8482589ffffffff";
/** The demo cell: 45% ocean, two stations, five swept corridors, and a long sightline. */
const DEMO = "/parcel/847b949ffffffff?stations=slice";

/** DECISIONS C16, whole frame, both passes. */
const TRIANGLE_CEILING = 600_000;
const DRAW_CALL_CEILING = 120;

/**
 * Where the guard stands, and THE SECOND DISTANCE IS THE LESSON OF DECISIONS C22.
 *
 * 390 m looking back across the disk is the view C21 was decided on: the grid culls almost nothing
 * there, because from out at the rim almost the whole disk is inside the cone. It is also where the
 * sampling stopped, and that is how six classes kept a `farM` of 900 m over a disk that ends at
 * 500 without any guard noticing. The disk is 500 m, a person can walk past it, and the frame gets
 * worse the further out the stand is: measured by radius, looking back, the share of views over
 * C16's ceiling ran 12.0% at 320 m, 42.2% at 440 m and 46.4% at 495 m. So the guard now stands at
 * 448 m as well, which is where the worst frame in the world was found.
 */
const RIM_M = [390, 448] as const;
const RIM_DEG = 60;

/** The hour every frame measurement in this project is taken at: the bible's dusk, 16 degrees. */
const DUSK = 0.25 + (Math.PI - (16 * Math.PI) / 180) / (2 * Math.PI);

/**
 * What the far band has to be worth at that camera, as a share of what the same instances would
 * have cost at their full forms.
 *
 * A ratio and not an absolute, because the absolute is a number about this seed and this cell and
 * would have to be rewritten whenever the ecology moved; the ratio is two triangles against the
 * class's own form and is the thing C21 promises. Measured on the real GPU at 4.8x on the parcel
 * and 4.5x on the demo.
 */
const IMPOSTOR_SAVING = 3;

function installProbe(): void {
  const w = window as any;
  w.__c21 = {
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
    ctx(): any {
      return w.__c21.world().context();
    },
    /** Stop the frame loop, so a measurement is of one state and not of whatever the loop did next. */
    pause() {
      const wd = w.__c21.world();
      cancelAnimationFrame(wd.raf);
      wd.raf = -1;
    },
    resume() {
      const wd = w.__c21.world();
      if (wd.raf === -1) wd.loop();
    },
    /**
     * Put the far band back to the full form, in this session: whatever the cull packed into a
     * class's far mesh is appended to the end of that class's own main mesh and the far mesh is
     * zeroed. Same instances, same order, full geometry.
     */
    setImpostors(on: boolean) {
      const scatter = w.__c21.ctx().layer("scatter");
      w.__c21.orig ??= scatter.beforeRender;
      const orig = w.__c21.orig;
      scatter.beforeRender = on
        ? orig
        : (c: unknown) => {
            orig(c);
            for (const [id, far] of scatter.impostorMeshes) {
              if (far.count === 0) continue;
              const main = scatter.meshes.get(id);
              const dst = main.instanceMatrix.array as Float32Array;
              dst.set((far.instanceMatrix.array as Float32Array).subarray(0, far.count * 16), main.count * 16);
              main.count += far.count;
              main.instanceMatrix.clearUpdateRanges();
              main.instanceMatrix.addUpdateRange(0, main.count * 16);
              main.instanceMatrix.needsUpdate = true;
              far.count = 0;
            }
          };
      scatter.invalidate();
    },
    /** Render once and read the framebuffer back before it is swapped. */
    shoot() {
      const ctx = w.__c21.ctx();
      ctx.camera.updateMatrixWorld();
      ctx.layer("scatter").beforeRender(ctx);
      ctx.renderer.render(ctx.scene, ctx.camera);
      const gl = ctx.renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const px = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { px, width, height };
    },
    /** How many pixels differ at all, and how far the worst one moved. */
    compare(a: any, b: any) {
      let changed = 0;
      let worst = 0;
      let over8 = 0;
      for (let p = 0; p < a.px.length; p += 4) {
        const d = Math.max(Math.abs(a.px[p] - b.px[p]), Math.abs(a.px[p + 1] - b.px[p + 1]), Math.abs(a.px[p + 2] - b.px[p + 2]));
        if (d === 0) continue;
        changed++;
        if (d > 8) over8++;
        if (d > worst) worst = d;
      }
      return { changed, over8, worst, total: a.width * a.height };
    },
    /** How many pixels the far band paints here, with everything else in the scatter hidden. */
    farBandPixels() {
      const scatter = w.__c21.ctx().layer("scatter");
      const was = [...scatter.meshes.values()].map((m: any) => m.visible);
      for (const m of scatter.meshes.values()) (m as any).visible = false;
      const withBand = w.__c21.shoot();
      for (const m of scatter.impostorMeshes.values()) (m as any).visible = false;
      const without = w.__c21.shoot();
      for (const m of scatter.impostorMeshes.values()) (m as any).visible = true;
      [...scatter.meshes.values()].forEach((m: any, i: number) => (m.visible = was[i]));
      return w.__c21.compare(withBand, without).changed;
    },
    /** renderer.info split by pass, at the current camera, for one configuration. */
    counts(on: boolean) {
      const ctx = w.__c21.ctx();
      w.__c21.setImpostors(on);
      const r = ctx.renderer;
      r.info.autoReset = false;
      if (!w.__c21.wrapped) {
        w.__c21.wrapped = true;
        const sm = r.shadowMap;
        const inner = sm.render.bind(sm);
        sm.render = (...a: unknown[]) => {
          r.info.reset();
          (inner as any)(...a);
          w.__c21.shadow = { calls: r.info.render.calls, triangles: r.info.render.triangles };
        };
      }
      r.info.reset();
      w.__c21.shadow = { calls: 0, triangles: 0 };
      ctx.camera.updateMatrixWorld();
      ctx.layer("scatter").beforeRender(ctx);
      r.render(ctx.scene, ctx.camera);
      const whole = { calls: r.info.render.calls, triangles: r.info.render.triangles };
      const cull = ctx.layer("scatter").lastCull();
      return {
        whole,
        shadow: w.__c21.shadow,
        main: { calls: whole.calls - w.__c21.shadow.calls, triangles: whole.triangles - w.__c21.shadow.triangles },
        cull: {
          impostorInstances: cull.impostorInstances,
          impostorTriangles: cull.impostorTriangles,
          farBandFullTriangles: cull.farBandFullTriangles,
          impostorMeshes: cull.impostorMeshes,
          mainTriangles: cull.mainTriangles,
          mainMeshes: cull.mainMeshes,
        },
      };
    },
    stand(x: number, y: number, yaw: number) {
      const p = w.__c21.ctx().layer("player");
      p.setPosition(x, y);
      p.camera().yaw = yaw;
    },
    /**
     * The nearest instance the far band is drawing, per class, against that class's own farM.
     *
     * The pixel comparison below is the one requirement 1 of C21 asks for, and on a dense route it
     * is VACUOUS: measured, the whole far band on the ordinary parcel is hidden behind the near
     * forest, so a switch forty metres too early moves no pixel there either. This reads the packed
     * buffers instead and is never vacuous.
     */
    nearestCard() {
      const ctx = w.__c21.ctx();
      // The measurement before this one left the far meshes zeroed, so cull again with the far band
      // on: reading a buffer somebody else emptied would answer "nothing is too near" every time.
      w.__c21.setImpostors(true);
      ctx.camera.updateMatrixWorld();
      ctx.layer("scatter").beforeRender(ctx);
      const scatter = ctx.layer("scatter");
      const eye = ctx.camera.position;
      let worst: any = null;
      for (const cls of scatter.classes()) {
        const far = scatter.impostorMeshes.get(cls.id);
        if (!far || far.count === 0) continue;
        const a = far.instanceMatrix.array as Float32Array;
        for (let i = 0; i < far.count; i++) {
          const d = Math.hypot(a[i * 16 + 12] - eye.x, a[i * 16 + 13] - eye.y, a[i * 16 + 14] - eye.z);
          if (!worst || d - cls.lod.farM < worst.slack) worst = { id: cls.id, d, farM: cls.lod.farM, slack: d - cls.lod.farM };
        }
      }
      return worst;
    },
    /** The shortest `lod.farM` of the classes this cell actually grew: inside it nothing switches. */
    shortestFarM() {
      const scatter = w.__c21.ctx().layer("scatter");
      return Math.min(...scatter.classes().filter((c: any) => scatter.buckets.has(c.id)).map((c: any) => c.lod.farM));
    },
    home() {
      const ctx = w.__c21.ctx();
      return { spawn: ctx.region.spawnTile, tileM: ctx.frame.tileM };
    },
  };
}

async function ready(page: Page, href: string) {
  await page.addInitScript(installProbe);
  await page.goto(href);
  // The consent card's handler is live only once the world is up: clicked at phase "idle" the
  // button is visible, hit-testable and inert.
  await page.waitForSelector('[data-phase="ready"]', { timeout: 180_000 });
  const before = await page.evaluate(() => localStorage.getItem("echo.consent"));
  await page.getByRole("button", { name: /let it watch/i }).first().click({ timeout: 60_000 });
  await page.waitForFunction((was) => localStorage.getItem("echo.consent") !== was, before, { timeout: 20_000 });
  await page.evaluate((t) => {
    const ctx = (window as any).__c21.ctx();
    ctx.layer("sky").setRate(0);
    ctx.layer("sky").setTimeOfDay(t);
    ctx.renderer.setPixelRatio(1);
  }, DUSK);
  await page.waitForTimeout(600);
}

/** Stand at the rim looking back across the disk, and let the follow camera settle before pausing. */
async function standAtRim(page: Page, rimM: number) {
  const home = await page.evaluate(() => (window as any).__c21.home());
  const a = (RIM_DEG * Math.PI) / 180;
  const x = home.spawn[0] + (rimM * Math.cos(a)) / home.tileM;
  const y = home.spawn[1] + (rimM * Math.sin(a)) / home.tileM;
  // `cameraForward(yaw)` is [-sin yaw, -cos yaw] in tiles, so this is the yaw that looks home.
  const yaw = Math.atan2(-(home.spawn[0] - x), -(home.spawn[1] - y));
  await page.evaluate(([X, Y, Z]) => {
    (window as any).__c21.resume();
    (window as any).__c21.stand(X, Y, Z);
  }, [x, y, yaw]);
  await page.waitForTimeout(900);
  await page.evaluate(() => (window as any).__c21.pause());
}

test.use({ viewport: { width: 1280, height: 800 } });

for (const [name, href] of [
  ["the ordinary parcel", PARCEL],
  ["the demo", DEMO],
] as const) {
 for (const rimM of RIM_M) {
  test(`${name} at ${rimM} m draws its far band as two triangles an instance, and the near field does not move`, async ({ page }) => {
    test.setTimeout(240_000);
    await ready(page, href);
    await standAtRim(page, rimM);

    // ── the guard: TRIANGLES SUBMITTED at a named camera, both configurations, one session ──
    const on = await page.evaluate(() => (window as any).__c21.counts(true));
    const off = await page.evaluate(() => (window as any).__c21.counts(false));

    expect(
      on.cull.impostorTriangles,
      `standing ${rimM} m from the spawn at ${RIM_DEG} degrees and looking back, the far band submitted no triangles ` +
        `at all. DECISIONS C21 is not engaging on the page: every instance in the cone is drawn at its full form. ` +
        `Whole frame ${on.whole.triangles.toLocaleString()} triangles in ${on.whole.calls} draw calls.`,
    ).toBeGreaterThan(0);

    const saving = on.cull.farBandFullTriangles / on.cull.impostorTriangles;
    expect(
      saving,
      `the far band cost ${on.cull.impostorTriangles.toLocaleString()} triangles where the same instances at their full ` +
        `forms cost ${on.cull.farBandFullTriangles.toLocaleString()}, only ${saving.toFixed(2)}x`,
    ).toBeGreaterThan(IMPOSTOR_SAVING);

    // The whole frame, off the renderer rather than off the layer's own bookkeeping. Two sources.
    expect(
      on.whole.triangles,
      `the whole frame is ${on.whole.triangles.toLocaleString()} triangles with the far band and ` +
        `${off.whole.triangles.toLocaleString()} without it. The impostor has stopped changing what the RENDERER ` +
        `submits, whatever the layer reports.`,
    ).toBeLessThan(off.whole.triangles - on.cull.impostorTriangles);

    // AND THE BUDGET, at the view that used to be the worst in the world. DECISIONS C16.
    expect(
      on.whole.triangles,
      `whole frame ${on.whole.triangles.toLocaleString()} triangles at the rim (main ${on.main.triangles.toLocaleString()}, ` +
        `shadow ${on.shadow.triangles.toLocaleString()}) against the ${TRIANGLE_CEILING.toLocaleString()} of DECISIONS C16`,
    ).toBeLessThan(TRIANGLE_CEILING);
    expect(
      on.whole.calls,
      `whole frame ${on.whole.calls} draw calls against the ${DRAW_CALL_CEILING} of DECISIONS C16. The far band spends ` +
        `one call per class that has one, and a level of detail that fits the triangle budget by spending the ` +
        `draw-call budget has moved the problem rather than solved it.`,
    ).toBeLessThan(DRAW_CALL_CEILING);

    // ── the near field ──
    // First at the instance level, because the pixel comparison that follows is the one the task
    // asks for and is vacuous on a route dense enough to hide its own far band.
    const nearest = await page.evaluate(() => (window as any).__c21.nearestCard());
    expect(nearest, "the far band is drawing nothing, so there is no card to be too near").not.toBeNull();
    expect(
      nearest.slack,
      `a ${nearest.id} standing ${nearest.d.toFixed(1)} m from the lens is drawn as a card, inside its own lod.farM of ` +
        `${nearest.farM} m. This is the failure requirement 1 of DECISIONS C21 is about: the near field changed.`,
    ).toBeGreaterThanOrEqual(0);

    // Then pixel for pixel, with the lens clipped to where nothing has switched.
    const shortest = await page.evaluate(() => (window as any).__c21.shortestFarM());
    const near = await page.evaluate((clip) => {
      const w = (window as any).__c21;
      const ctx = w.ctx();
      const was = ctx.camera.far;
      ctx.camera.far = clip;
      ctx.camera.updateProjectionMatrix();
      w.setImpostors(true);
      const a = w.shoot();
      w.setImpostors(false);
      const b = w.shoot();
      w.setImpostors(true);
      const clipped = w.compare(a, b);
      ctx.camera.far = was;
      ctx.camera.updateProjectionMatrix();
      w.setImpostors(true);
      const c = w.shoot();
      w.setImpostors(false);
      const d = w.shoot();
      w.setImpostors(true);
      return { clipped, whole: w.compare(c, d) };
    }, shortest - 1);

    expect(
      near.clipped.changed,
      `with the lens clipped to ${shortest - 1} m, one metre inside the shortest lod.farM this cell grows, ` +
        `${near.clipped.changed} of ${near.clipped.total.toLocaleString()} pixels differ between the far band and the ` +
        `full forms (worst ${near.clipped.worst} levels). Nothing inside that distance has switched, so the only way a ` +
        `pixel can move is a card drawn where the near field should be.`,
    ).toBe(0);

    // ── the card turns to face the lens ──
    const band = await page.evaluate(() => {
      const w = (window as any).__c21;
      w.setImpostors(true);
      const material = [...w.ctx().layer("scatter").impostorMeshes.values()][0]?.material;
      if (!material) return null;
      const turning = w.farBandPixels();
      const patch = material.onBeforeCompile;
      const keyed = material.customProgramCacheKey;
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => "scatter-impostor-unpatched";
      material.needsUpdate = true;
      const fixed = w.farBandPixels();
      material.onBeforeCompile = patch;
      material.customProgramCacheKey = keyed;
      material.needsUpdate = true;
      return { turning, fixed, marked: material.userData.scatterImpostor === true };
    });

    expect(band, "the layer built no far mesh at all, so there is no shader to measure").not.toBeNull();
    expect(band!.marked, "the far band's material is not the one scatterImpostor.ts makes").toBe(true);
    expect(
      band!.turning,
      `with everything else in the scatter hidden the far band paints ${band!.turning} pixels, so this view cannot see ` +
        `it and the shader below is being measured against nothing`,
    ).toBeGreaterThan(500);
    expect(
      band!.turning,
      `the far band paints ${band!.turning} pixels with the billboard patch and ${band!.fixed} without it. A card that ` +
        `keeps the yaw the placer gave it shows the cosine of that angle and covers about two thirds as much; reading ` +
        `the same both ways means the patch is not reaching the shipped material.`,
    ).toBeGreaterThan(band!.fixed * 1.15);

    console.log(
      `${name} at ${rimM} m, ${RIM_DEG} deg looking back: whole frame ${on.whole.triangles.toLocaleString()} tri / ` +
        `${on.whole.calls} calls against ${off.whole.triangles.toLocaleString()} / ${off.whole.calls} with the far band ` +
        `drawn in full, ${(100 * (1 - on.whole.triangles / off.whole.triangles)).toFixed(1)}% off the whole frame. ` +
        `Far band ${on.cull.impostorInstances.toLocaleString()} instances, ${on.cull.impostorTriangles.toLocaleString()} ` +
        `triangles against ${on.cull.farBandFullTriangles.toLocaleString()} at full form (${saving.toFixed(2)}x) in ` +
        `${on.cull.impostorMeshes} calls. Near field inside ${shortest} m: ${near.clipped.changed} pixels differ; whole ` +
        `frame unclipped: ${near.whole.changed} of ${near.whole.total.toLocaleString()} (${near.whole.over8} by more ` +
        `than 8 levels, worst ${near.whole.worst}). Far band paints ${band!.turning} px turning, ${band!.fixed} fixed.`,
    );
  });
 }
}
