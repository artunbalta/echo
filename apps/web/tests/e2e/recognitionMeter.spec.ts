/**
 * The recognition meter, on the page that ships it.
 *
 * This file exists because of a hole a reviewer found rather than because of a feature. The
 * meter's fifteen node tests import the component and render it themselves, so deleting the one
 * line in ParcelCanvas.tsx that mounts it left typecheck at exit 0, all 140 node tests green
 * including all fifteen of its own, and every browser spec green. The meter could be taken out of
 * the world with nothing going red. That is the ninth time this project has produced a test which
 * passes while measuring something that is not what ships, and the fix is always the same: assert
 * against the page.
 *
 * It also pins the one honesty rule the component exists for. A person who declines is told that
 * nothing is being measured, and no fill is drawn, because a bar at zero reads as a measurement and
 * "not measuring" is not zero.
 */
import { expect, test } from "@playwright/test";

const PARCEL = "/parcel/8482589ffffffff";

/** The consent click has to reach React, not just a DOM node; this project has been bitten by that. */
async function answerConsent(page: import("@playwright/test").Page, accept: boolean): Promise<void> {
  const button = page.getByRole("button", { name: accept ? /let it watch/i : /not this time/i });
  await button.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 40; i++) {
    await button.click().catch(() => {});
    if (await page.evaluate(() => localStorage.getItem("echo.consent"))) return;
    await page.waitForTimeout(250);
  }
  throw new Error("the consent click never reached React");
}

test("the meter is on the parcel a person actually opens", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(PARCEL, { waitUntil: "domcontentloaded" });

  // Before any answer. Unset means off, and off is not zero.
  const before = page.locator("[data-recognition]");
  await expect(before, "no recognition meter on the page before consent").toHaveCount(1);
  await expect(before).toHaveAttribute("data-recognition", "off");

  await answerConsent(page, true);
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });
  await expect(page.locator("[data-recognition]")).toHaveCount(1);
  // Accepted, so it must have left the off state: waiting, offline, no_variance or measured are
  // all honest answers here and which one depends on whether echo-ml is up.
  await expect(page.locator("[data-recognition]")).not.toHaveAttribute("data-recognition", "off");
});

test("a person who declines is told nothing is measured, and no fill is drawn", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(PARCEL, { waitUntil: "domcontentloaded" });
  await answerConsent(page, false);
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });

  const meter = page.locator("[data-recognition]");
  await expect(meter).toHaveAttribute("data-recognition", "off");
  // And it stays off after walking, because declining stops the sampler and the collector but the
  // posterior a previous session left behind is still in hand: measure.ts's decline() calls
  // disarm(), which nulls both of those and NOT the posterior. A gate that asked only whether a
  // posterior existed would print a confident percentage to somebody who has just said no.
  await page.locator("canvas").click({ position: { x: 400, y: 400 } });
  for (const key of ["KeyW", "KeyD"]) await page.keyboard.down(key);
  await page.waitForTimeout(4000);
  for (const key of ["KeyW", "KeyD"]) await page.keyboard.up(key);
  await expect(meter).toHaveAttribute("data-recognition", "off");
  await expect(meter, "a percentage was drawn for somebody who declined").not.toContainText(/%/);
});
