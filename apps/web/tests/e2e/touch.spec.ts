/**
 * A phone can play the parcel (DECISIONS C23).
 *
 * THE HALF tests/touchInput.test.mts CANNOT SEE. That file proves the arithmetic — what a
 * separation is worth in wheel pixels, which finger owns which part of a two-finger gesture, that a
 * thumb and a keyboard arrive at the same direction. None of it proves that a real PointerEvent
 * reaches those functions, that the controls are on the screen, or that the panel the consent card
 * promises can be opened without a key no phone has. That is what is here, and there is nothing
 * here that node could have run instead.
 *
 * IT HAS ITS OWN CONTEXT rather than relying on the `mobile` project, which only exists behind
 * E2E_ALL_ENGINES=1 and runs WebKit. `test.use` puts a phone in front of the default chromium
 * project, so the touch path is guarded on every `npm run test:e2e` instead of behind a flag nobody
 * sets. Measured from this repo's own Playwright: `hasTouch: true` is what makes
 * `(pointer: coarse)` true, which is the predicate the controls are drawn on.
 *
 * IT DISPATCHES ITS OWN MOVE PHASE, because Playwright's touchscreen API is `tap(x, y)` and nothing
 * else — no swipe, no second finger — and neither gesture this file cares about is a tap. A
 * dispatched PointerEvent reaches a listener in both engines, and it carries a pointer id the
 * browser does not own, so `setPointerCapture` on it throws NotFoundError. Both the world's input
 * and the stick pad swallow that throw on purpose: without it, driving this page from a harness
 * would raise a page error, and slice.spec.ts asserts there are none.
 *
 * IT RUNS ON THE DEMO CELL, for its `window.__demo` handle. The input path is the same list of
 * layers on every parcel — parcelWorld.ts is the one place it is composed — so nothing about touch
 * is demo-specific; what the demo has is a door for a test to read the mover and the camera through
 * without a fifth copy of the React-fiber probe the other four specs each carry.
 */
import { expect, test, type Page } from "@playwright/test";

import { SLICE_HREF } from "./demoUrl";

test.use({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

/** The mover and the camera, as the shipped page holds them. */
const readWorld = (page: Page) =>
  page.evaluate(() => {
    const demo = (window as unknown as { __demo?: { player: { position(): { x: number; y: number }; mover(): { jumpT: number; state: string }; camera(): { yaw: number; distance: number } } } }).__demo;
    if (!demo) throw new Error("no __demo handle: is this the demo cell, in a dev build?");
    const at = demo.player.position();
    const cam = demo.player.camera();
    return { x: at.x, y: at.y, yaw: cam.yaw, distance: cam.distance, jumpT: demo.player.mover().jumpT };
  });

/** One finger, on one element. The element is the target, so the coordinates may be outside it. */
async function finger(page: Page, selector: string, type: string, id: number, x: number, y: number) {
  await page.locator(selector).dispatchEvent(type, {
    pointerId: id,
    pointerType: "touch",
    isPrimary: id === 1,
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
}

test("the parcel is playable with a thumb", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(SLICE_HREF);

  // The controls wait for the consent question, because the card stands in the bottom band of a
  // phone screen, which is exactly where the thumb goes. Same click-then-check idiom as
  // slice.spec.ts: a click that lands before React has attached does nothing at all.
  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: "Let it watch" }).click({ timeout: 2000 }).catch(() => {});
        return page.evaluate(() => localStorage.getItem("echo.consent"));
      },
      { timeout: 20_000, message: "the consent click never reached React" },
    )
    .not.toBeNull();

  await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });

  // The whole HUD is DOM. An on-screen stick drawn into a second <canvas> would break
  // minimap.spec.ts and, through the bare locator("canvas") in two other specs, those as well.
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-touch-controls]")).toBeVisible();

  // ── the stick walks ───────────────────────────────────────────────────────────────────────────
  const pad = page.locator("[data-touch-stick]");
  const box = (await pad.boundingBox())!;
  const originX = box.x + box.width / 2;
  const originY = box.y + box.height / 2;

  const before = await readWorld(page);
  await finger(page, "[data-touch-stick]", "pointerdown", 1, originX, originY);
  // Full deflection north, then held. The pad is the event's target, so a coordinate above its own
  // box is exactly what a thumb pushed to the top of the pad produces.
  for (const step of [20, 45, 70]) await finger(page, "[data-touch-stick]", "pointermove", 1, originX, originY - step);
  await page.waitForTimeout(1500);
  const walked = await readWorld(page);
  await finger(page, "[data-touch-stick]", "pointerup", 1, originX, originY - 70);

  const travelled = Math.hypot(walked.x - before.x, walked.y - before.y);
  expect(travelled, `a held stick moved the player ${travelled.toFixed(2)} tiles`).toBeGreaterThan(1);

  // And it stops. A stick that latched would keep walking with nothing on the glass, which is the
  // failure the handle's clear() exists for.
  await page.waitForTimeout(600);
  const stopped = await readWorld(page);
  await page.waitForTimeout(600);
  const stillStopped = await readWorld(page);
  const drift = Math.hypot(stillStopped.x - stopped.x, stillStopped.y - stopped.y);
  expect(drift, `the player kept walking ${drift.toFixed(3)} tiles after the thumb came off`).toBeLessThan(0.2);

  // ── one finger on the world looks, and does not walk ──────────────────────────────────────────
  const held = await readWorld(page);
  await finger(page, "canvas", "pointerdown", 2, 200, 300);
  for (const x of [230, 260, 290]) await finger(page, "canvas", "pointermove", 2, x, 300);
  await finger(page, "canvas", "pointerup", 2, 290, 300);
  await page.waitForTimeout(400);
  const looked = await readWorld(page);
  expect(Math.abs(looked.yaw - held.yaw), "a drag on the world did not turn the camera").toBeGreaterThan(0.05);
  expect(Math.hypot(looked.x - held.x, looked.y - held.y), "looking around walked the player").toBeLessThan(0.2);

  // ── two fingers pinch the boom ────────────────────────────────────────────────────────────────
  const framed = await readWorld(page);
  await finger(page, "canvas", "pointerdown", 3, 140, 320);
  await finger(page, "canvas", "pointerdown", 4, 250, 320);
  // Squeezing them together zooms out, which is a longer boom.
  for (const gap of [40, 30, 20, 12] as const) {
    await finger(page, "canvas", "pointermove", 3, 195 - gap, 320);
    await finger(page, "canvas", "pointermove", 4, 195 + gap, 320);
  }
  await finger(page, "canvas", "pointerup", 3, 183, 320);
  await finger(page, "canvas", "pointerup", 4, 207, 320);
  await page.waitForTimeout(400);
  const pinched = await readWorld(page);
  expect(pinched.distance, `the boom stayed at ${framed.distance.toFixed(2)} m through a pinch`).toBeGreaterThan(
    framed.distance + 0.5,
  );

  // ── the jump button ───────────────────────────────────────────────────────────────────────────
  // Read while the button is down: the jump is 0.45 s of cosmetic arc and jumpT returns to -1.
  const jump = page.locator("[data-touch-jump]");
  const jumpBox = (await jump.boundingBox())!;
  await page.touchscreen.tap(jumpBox.x + jumpBox.width / 2, jumpBox.y + jumpBox.height / 2);
  await expect
    .poll(async () => (await readWorld(page)).jumpT, { timeout: 3000, message: "the jump button did not jump" })
    .toBeGreaterThanOrEqual(0);

  // ── the inspector, without a backtick ─────────────────────────────────────────────────────────
  // ConsentCard promises the measurement can be stopped at any time from the inspector. Before
  // C23 that sentence was false on a phone, because the panel answered only to a key.
  const panel = page.getByLabel("measurement inspector");
  await expect(panel).toHaveCount(0);
  // It is a line of the HUD's menu now (C68), so the thumb opens the menu first.
  const menu = page.locator("[data-hud-menu]");
  const menuBox = (await menu.boundingBox())!;
  await page.touchscreen.tap(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
  const opener = page.locator("[data-touch-inspector]");
  const openerBox = (await opener.boundingBox())!;
  await page.touchscreen.tap(openerBox.x + openerBox.width / 2, openerBox.y + openerBox.height / 2);
  await expect(panel).toBeVisible();
  // The panel must fit the phone it is on, not the desktop it was sized for.
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.width).toBeLessThanOrEqual(390 - 12);

  // And the key still works, on the same piece of state, so the two doors cannot disagree.
  await page.keyboard.press("`");
  await expect(panel).toHaveCount(0);

  expect(errors, "the page raised errors while being driven by touch").toEqual([]);
});
