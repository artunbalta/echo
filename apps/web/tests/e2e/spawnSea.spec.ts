/**
 * From the spawn of a coastal parcel, can you see the sea. In pixels, on a real GPU (bug 2).
 *
 * WHAT WAS WRONG. Nothing about the water. The mesh is built whenever the region has ocean, it is
 * 6,259 m across against a 2,084 m region so it overruns the fog on every side, it sits at sea
 * level, it is submitted on every frame, and at the shore it reads 116 levels of 255 away from the
 * sand beside it. What shipped was a spawn that faced a fixed compass heading, PI / 2 south, with
 * the horizon pinned to the top edge of the frame, and on both coastal routes the sea is north. The
 * sea contributed 0 pixels of 1,024,000 to the frame a person is given.
 *
 * THE INSTRUMENT is the one that diagnosis used, and it is not a colour match: render the frozen
 * frame twice, once with `terrain:water` visible and once without, and count the pixels that move.
 * That counts pixels the sea OCCUPIES, whatever colour it is drawn in, so it cannot be fooled by
 * the water being repainted and it cannot be satisfied by blue sky.
 *
 * A zero is worth nothing until it has been watched moving, so this file moves it three ways: the
 * same measurement at the heading that used to ship, on a parcel with no ocean at all, and with the
 * water hidden.
 */
import { expect, test } from "@playwright/test";

/** 847b959ffffffff: a beach cell beside the demo, its shore 78 m from the spawn. */
/**
 * Four coastal parcels, not one, and a threshold that separates what was MEASURED.
 *
 * This guard used to drive the single cell SPAWN_HORIZON_MARGIN_DEG had been swept on, at a floor
 * of 0.02. A reviewer swapped only the cell and it failed twice over: on 84031c1ffffffff, an
 * ordinary 40% ocean parcel whose shore is 391 m out, the frame holds 0.099% sea with nothing above
 * 8 levels of 255, which is the real bug; and on 8455421ffffffff, whose shore at 160 m IS a visible
 * strip, it holds 1.77% and the floor of 0.02 rejected it anyway. So the guard could not tell a
 * failure from a pass.
 *
 * Measured shares at the spawn, GPU, default camera, 1280x800: 73 m shore 5.96%, 78 m 5.74%, the
 * demo's 226 m 6.10%, 160 m 1.77%; and past the new sight limit, 391 m 0.099% and 411 m 0.010%.
 * 0.005 sits 3.5x under the tightest pass and 5x over the loosest failure.
 */
const COASTAL_CELLS = [
  "/parcel/847b959ffffffff", // 78 m shore, the cell the heading was swept on
  "/parcel/842af61ffffffff", // 73 m, a cell the sweep never saw
  "/parcel/8455421ffffffff", // 160 m, a thin strip: the case the old floor wrongly rejected
];
const SEA_FLOOR = 0.005;
const COASTAL = COASTAL_CELLS[0]!;
/** The demo, whose 45% ocean is 226 m away through full-density rainforest. */
const DEMO = "/parcel/847b949ffffffff?stations=slice";
/** 8482589ffffffff: 100% rainforest, nearest water 6.9 km, no water mesh is built at all. */
const INLAND = "/parcel/8482589ffffffff";

/**
 * Installed before the page loads. Everything here reads the world the route built: the fiber walk
 * finds ParcelCanvas's own `world` ref, which is the object the route made, because only the demo
 * route attaches a debug handle and the sea has to be measured on both.
 */
function installProbe(): void {
  const w = window as any;
  w.__spawnSea = {
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
    water(scene: any): any {
      let found: any = null;
      scene.traverse((o: any) => {
        if (o.name === "terrain:water") found = o;
      });
      return found;
    },
    /** The share of the frame the sea occupies: the frame with it, minus the frame without it. */
    share(): { share: number; pixels: number; topRow: number | null; bottomRow: number | null; rows: number } | null {
      const ctx = w.__spawnSea.world().context();
      const water = w.__spawnSea.water(ctx.scene);
      if (!water) return null;
      const read = () => {
        ctx.renderer.render(ctx.scene, ctx.camera);
        const gl = ctx.renderer.getContext();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return { pixels, width, height };
      };
      const was = water.visible;
      const on = read();
      water.visible = false;
      const off = read();
      water.visible = was;
      let changed = 0;
      let top = Infinity;
      let bottom = -Infinity;
      for (let i = 0, p = 0; p < on.pixels.length; p += 4, i++) {
        if (on.pixels[p] === off.pixels[p] && on.pixels[p + 1] === off.pixels[p + 1] && on.pixels[p + 2] === off.pixels[p + 2]) continue;
        changed++;
        const row = on.height - 1 - Math.floor(i / on.width);
        if (row < top) top = row;
        if (row > bottom) bottom = row;
      }
      return {
        share: changed / (on.width * on.height),
        pixels: changed,
        topRow: Number.isFinite(top) ? top : null,
        bottomRow: Number.isFinite(bottom) ? bottom : null,
        rows: on.height,
      };
    },
  };
}

test.use({ viewport: { width: 1280, height: 800 } });

async function arrive(page: import("@playwright/test").Page, route: string): Promise<void> {
  await page.addInitScript(installProbe);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  // The consent card sits over the world. A click before React hydrates lands on a real DOM node,
  // does not throw, and does nothing, so this checks the storage rather than the click.
  const button = page.getByRole("button", { name: /let it watch/i });
  await button.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 40; i++) {
    await button.click().catch(() => {});
    if (await page.evaluate(() => localStorage.getItem("echo.consent"))) break;
    await page.waitForTimeout(250);
  }
  await page.locator("[data-phase='ready']").waitFor({ timeout: 240_000 });
  // The sky runs at one turn in twelve minutes, so an unpinned frame is a different hour each run.
  await page.evaluate(() => {
    const sky = (window as any).__spawnSea.world().context().layer("sky");
    sky.setRate(0);
  });
  await page.waitForTimeout(2000);
}

test("every coastal parcel puts the sea in its first frame, not just the one this was tuned on", async ({ page }) => {
  test.setTimeout(360_000);
  const shares: string[] = [];
  for (const route of COASTAL_CELLS.slice(1)) {
    await arrive(page, route);
    // The page's own probe, the same one the single-cell test below reads, so the two cannot
    // measure different things and disagree about which cells pass.
    const sea = await page.evaluate(() => (window as any).__spawnSea.share());
    shares.push(`${route.slice(8, 23)} ${(sea ? sea.share * 100 : 0).toFixed(2)}%`);
    expect(sea, `${route}: this route drew no water at all`).not.toBeNull();
    expect(sea.share, `${route}: the sea is not in the frame a person is given`).toBeGreaterThan(SEA_FLOOR);
  }
  console.log(`coastal spawns: ${shares.join(", ")}`);
});

test("the sea is in the first frame of a coastal parcel", async ({ page }) => {
  test.setTimeout(300_000);
  await arrive(page, COASTAL);

  const first = await page.evaluate(() => {
    const probe = (window as any).__spawnSea;
    const ctx = probe.world().context();
    const player = ctx.layer("player");
    return {
      cell: ctx.region.cell,
      ocean: ctx.layer("terrain").region.composition.ocean ?? 0,
      heading: player.mover().heading,
      yaw: player.camera().yaw,
      pitch: player.camera().pitch,
      fov: ctx.camera.fov,
      sea: probe.share(),
    };
  });
  expect(first.sea, "this route drew no water at all, so it cannot stand for a coastal parcel").not.toBeNull();
  console.log(
    `spawn sea: ${first.cell} is ${(first.ocean * 100).toFixed(0)}% ocean; the first frame is ` +
      `${(first.sea!.share * 100).toFixed(2)}% sea, in rows ${first.sea!.topRow} to ${first.sea!.bottomRow} of ${first.sea!.rows}; ` +
      `heading ${first.heading.toFixed(4)}, yaw ${first.yaw.toFixed(4)}, pitch ${first.pitch.toFixed(4)}`,
  );

  // The claim, in the form a person would make it. Measured 6.24% on this route; the threshold is
  // a third of that, which is still forty times what the whole frame used to contain.
  expect(first.sea!.share, "the sea is not in the frame a person is given").toBeGreaterThan(SEA_FLOOR);
  // And it is not jammed under the top edge: there is sky above it. At the pitch that shipped the
  // top of the frame sat 0.94 degrees above the horizon and the sea lived in rows 38 to 126.
  expect(first.sea!.topRow!, "the sea starts at the very top of the frame, with no sky over it").toBeGreaterThan(
    first.sea!.rows * 0.1,
  );

  // ── three ways to watch the same instrument move ─────────────────────────────
  const controls = await page.evaluate(() => {
    const probe = (window as any).__spawnSea;
    const ctx = probe.world().context();
    const player = ctx.layer("player");
    const water = probe.water(ctx.scene);
    // stepFollowCamera returns a NEW state every frame, so the live object has to be fetched each
    // time rather than held: writing to yesterday's state changes nothing and reads as a pass.
    const aim = (yaw: number, pitch: number) => {
      for (let i = 0; i < 60; i++) {
        const camera = player.camera();
        camera.yaw = yaw;
        camera.pitch = pitch;
        player.update(1 / 60, ctx);
      }
    };
    const keptYaw = player.camera().yaw;
    const keptPitch = player.camera().pitch;

    // 1. The heading that used to ship: yaw PI and pitch 0.42, the camera north of the player
    //    looking south with the horizon on the top edge of the frame.
    aim(Math.PI, 0.42);
    const shippedHeading = probe.share();

    aim(keptYaw, keptPitch);
    const restored = probe.share();

    // 2. The water taken out of the scene entirely.
    water.visible = false;
    const withoutWater = probe.share();
    water.visible = true;

    return { shippedHeading, restored, withoutWater };
  });
  console.log(
    `spawn sea controls: at the shipped heading ${(controls.shippedHeading.share * 100).toFixed(2)}%, ` +
      `restored ${(controls.restored.share * 100).toFixed(2)}%, water hidden ${(controls.withoutWater.share * 100).toFixed(2)}%`,
  );
  expect(controls.shippedHeading.share, "the heading makes no difference, so this test is not measuring the heading").toBeLessThan(
    first.sea!.share / 10,
  );
  expect(controls.withoutWater.share, "the instrument reports sea with the sea hidden").toBe(0);
  expect(Math.abs(controls.restored.share - first.sea!.share), "the frame did not come back after being moved").toBeLessThan(0.005);
});

test("a parcel with no sea is left exactly as it shipped", async ({ page }) => {
  test.setTimeout(300_000);
  await arrive(page, INLAND);
  const first = await page.evaluate(() => {
    const probe = (window as any).__spawnSea;
    const ctx = probe.world().context();
    const player = ctx.layer("player");
    return {
      hasWater: ctx.layer("terrain").region.hasWater,
      waterInScene: !!probe.water(ctx.scene),
      heading: player.mover().heading,
      yaw: player.camera().yaw,
      pitch: player.camera().pitch,
    };
  });
  // 86.7% of assignable parcels have no sea within 1,600 m. Nothing about them changed.
  expect(first.hasWater, "the parcel this test uses as its dry one has water").toBe(false);
  expect(first.waterInScene, "a water mesh was built for a region with no ocean").toBe(false);
  expect(first.heading, "an inland spawn no longer faces the way a fresh mover faces").toBeCloseTo(Math.PI / 2, 9);
  expect(Math.abs(first.yaw), "an inland spawn's camera is no longer behind the player").toBeCloseTo(Math.PI, 9);
  expect(first.pitch, "an inland spawn's pitch moved").toBeCloseTo(0.42, 9);
});

test("the demo's sea is 226 m through rainforest, and this says how far the walk is", async ({ page }) => {
  test.setTimeout(300_000);
  await arrive(page, DEMO);
  const walk = await page.evaluate(async () => {
    const probe = (window as any).__spawnSea;
    const ctx = probe.world().context();
    const player = ctx.layer("player");
    const mover = player.mover();
    const home = { x: mover.x, y: mover.y };
    const tileM = ctx.frame.tileM;
    const rows: Array<{ metres: number; share: number }> = [];
    for (const metres of [0, 60, 120, 180, 240]) {
      player.setPosition(home.x + (Math.cos(mover.heading) * metres) / tileM, home.y + (Math.sin(mover.heading) * metres) / tileM);
      player.update(1 / 60, ctx);
      // The follow camera springs toward the body, so it needs more than one step to arrive.
      for (let i = 0; i < 120; i++) player.update(1 / 60, ctx);
      rows.push({ metres, share: probe.share().share });
    }
    player.setPosition(home.x, home.y);
    for (let i = 0; i < 120; i++) player.update(1 / 60, ctx);
    return rows;
  });
  console.log(`spawn sea walk: ${walk.map((r) => `${r.metres} m ${(r.share * 100).toFixed(2)}%`).join(", ")}`);
  // On this route the fix is the heading and not the frame: 226 m of full-density rainforest is
  // between the spawn and the shore, so what a person gets at the spawn is slivers between trunks
  // and what they get after a walk is a coast. Both are asserted, because a version of this page
  // that showed nothing until the shore would be the bug again.
  expect(walk[0]!.share, "not one pixel of sea at the demo's spawn").toBeGreaterThan(0);
  expect(walk[walk.length - 1]!.share, "walking the spawn heading for 240 m does not reach the sea").toBeGreaterThan(0.1);
  for (let i = 1; i < walk.length; i++) {
    expect(walk[i]!.share, `the sea shrank between ${walk[i - 1]!.metres} m and ${walk[i]!.metres} m`).toBeGreaterThan(walk[i - 1]!.share);
  }
});
