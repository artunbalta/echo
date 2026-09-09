/**
 * Turning the camera all the way round, so a measurement is about the WORLD and not about the one
 * heading the world happened to be facing.
 *
 * Not a spec: the runner's `testMatch` only collects `*.spec.ts`, so this is a shared helper, the
 * same way `demoUrl.ts` is.
 *
 * WHY THIS IS NOT A `for` LOOP WITH A DRAG IN IT. `scatterSplit.spec.ts` records what happened when
 * it was: the drag is in PIXELS and the orbit dial is in RADIANS, and the two got confused — degrees
 * were fed into a radians-per-pixel dial with a `/10` beside it, so six steps swept **97 degrees,
 * 27% of the circle**, under a comment claiming every heading a drag can reach. The parcel's worst
 * heading was not in that arc, and nothing said so.
 *
 * So two rules, and the second is the one that matters. The pixels are DERIVED from the radians
 * wanted, rather than guessed. And the result is NOT TRUSTED: the yaw is read back off the camera
 * after every step, the steps are unwrapped and summed, and `sweptDeg` comes back to the caller so a
 * test can assert the circle actually closed. A drag that stops moving the camera, a dial constant
 * that changes, and a page that swallows the pointer all show up as an arc that is not 360 degrees.
 *
 * ⚠️ `scatterSplit.spec.ts` still carries its own copy of this. It was left alone deliberately: that
 * file is one of the ten known-red specs (DECISIONS C28) and its version is welded to an external
 * probe it installs itself, which this one does not need because the host now instruments itself
 * (`?debug=layers`, SOC-1.A). Whoever next touches that spec should adopt this and delete theirs.
 */
import type { Page } from "@playwright/test";

/**
 * A handle on the live `PlanetWorld`, reached through the React fiber on the phase host.
 *
 * Copied from `scatterSplit.spec.ts`, which needs it for the same reason and cannot export it (that
 * file has no exports, and importing a spec re-runs its tests). There is no cleaner route: the world
 * is a ref inside a component and the page publishes no global of its own.
 */
export function installWorldProbe(): void {
  const w = window as unknown as { __a7?: { world(): unknown } };
  w.__a7 = {
    world(): unknown {
      const node = document.querySelector("[data-phase]") as unknown as Record<string, unknown>;
      const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
      if (!key) throw new Error("no React fiber on the phase host; the page has not hydrated");
      let fiber = node[key] as { memoizedState?: unknown; return?: unknown } | undefined;
      for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return as typeof fiber) {
        let hook = fiber.memoizedState as { memoizedState?: unknown; next?: unknown } | undefined;
        for (let i = 0; hook && i < 60; i++, hook = hook.next as typeof hook) {
          const state = hook.memoizedState as { current?: { context?: unknown } } | undefined;
          if (state && typeof state === "object" && "current" in state && state.current && typeof state.current.context === "function") {
            return state.current;
          }
        }
      }
      throw new Error("no PlanetWorld on the page");
    },
  };
}

/**
 * The hour the sky is held at while a frame is measured.
 *
 * NOT a preference. C31 found the shadow pass MOVES with the world clock now (C24 made the sun's
 * elevation a function of the epoch), measured at 81,247 triangles at one hour and 193,777 at
 * another on an identical view. A frame measured at an unstated hour is not comparable to any other
 * frame, so every measuring spec freezes the sky at the same one. This is the value
 * `scatterSplit.spec.ts` uses: the `t` whose sun direction reproduces the vector the terrain layer
 * used to hardwire, which is the hour the art direction was written for.
 */
export const DUSK = 0.25 + (Math.PI - (16 * Math.PI) / 180) / (2 * Math.PI);

/**
 * Open a world, answer the consent card, and hold the hour and the pixel ratio still.
 *
 * The consent click is retried against `localStorage` rather than awaited once: the card's handler
 * is live only after the world is up, and clicked at phase "idle" the button is visible,
 * hit-testable and completely inert.
 */
export async function readyWorld(page: Page, href: string): Promise<void> {
  await page.addInitScript(installWorldProbe);
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-phase="ready"]', { timeout: 180_000 });

  const button = page.getByRole("button", { name: /let it watch/i });
  if (await button.count()) {
    const before = await page.evaluate(() => localStorage.getItem("echo.consent"));
    await button.first().click({ timeout: 60_000 });
    await page.waitForFunction((was) => localStorage.getItem("echo.consent") !== was, before, { timeout: 20_000 });
  }

  await page.evaluate((duskT) => {
    const ctx = (window as unknown as { __a7: { world(): { context(): { layer(n: string): { setRate(r: number): void; setTimeOfDay(t: number): void }; renderer: { setPixelRatio(r: number): void } } } } })
      .__a7.world().context();
    ctx.layer("sky").setRate(0);
    ctx.layer("sky").setTimeOfDay(duskT);
    ctx.renderer.setPixelRatio(1);
  }, DUSK);
  await page.waitForTimeout(500);
}

/**
 * Radians of orbit per pixel of drag.
 *
 * RESTATED RATHER THAN IMPORTED because Playwright compiles these files to CJS and the module that
 * owns it reaches `@echo/shared`, which is ESM only — `demoUrl.ts` carries the same admission. A
 * restated constant is the thing that goes stale, so it is not trusted: the sweep reads the camera's
 * own yaw back after every drag and hands `sweptDeg` to the caller, which is exactly the check that
 * catches this number drifting.
 */
export const ORBIT_RAD_PER_PX = 0.006;

/**
 * How many headings a sweep stops at. 24 is one every 15 degrees — close enough together that a
 * wall of trees cannot stand between two of them and be missed.
 */
export const TURN_STEPS = 24;

/** The camera's heading in degrees, read off the matrix the renderer is actually using. */
export async function yawDeg(page: Page): Promise<number> {
  return page.evaluate(() => {
    const e = (window as unknown as { __a7: { world(): { context(): { camera: { matrixWorld: { elements: number[] } } } } } })
      .__a7.world().context().camera.matrixWorld.elements;
    const fx = -e[8]!;
    const fz = -e[10]!;
    return (Math.atan2(-fx, -fz) * 180) / Math.PI;
  });
}

export interface Heading<T> {
  deg: number;
  sample: T;
}

export interface Sweep<T> {
  headings: Heading<T>[];
  /** Total degrees actually turned. A caller that does not check this is measuring one arc. */
  sweptDeg: number;
}

/**
 * Turn the full circle in `steps` stops, calling `sample` at each one.
 *
 * The sampler decides what a heading means — triangles, a per-layer table, a screenshot. This
 * function only guarantees that the camera really visited the headings it says it did.
 */
export async function sweep<T>(
  page: Page,
  sample: (deg: number) => Promise<T>,
  steps: number = TURN_STEPS,
): Promise<Sweep<T>> {
  const dragPx = (2 * Math.PI) / steps / ORBIT_RAD_PER_PX;
  const headings: Heading<T>[] = [];
  let previous = await yawDeg(page);
  let swept = 0;

  await page.mouse.move(640, 400);
  for (let k = 0; k < steps; k++) {
    await page.mouse.down();
    await page.mouse.move(640 + dragPx, 400, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(640, 400);

    const now = await yawDeg(page);
    // Unwrapped, so a 15 degree step across the +-180 seam reads as 15 and not as 345.
    let step = now - previous;
    while (step > 180) step -= 360;
    while (step <= -180) step += 360;
    swept += step;
    previous = now;

    headings.push({ deg: now, sample: await sample(now) });
  }
  return { headings, sweptDeg: swept };
}
