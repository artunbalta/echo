/**
 * "You can stop it at any time from the inspector" — on the page that makes that promise (SOC-1.E).
 *
 * WHY THIS FILE EXISTS AND NOT ONLY THE NODE TEST. `tests/inspectorRevoke.test.mts` renders the
 * panel and asserts the control is there, and it would keep passing if the one line in
 * ParcelCanvas.tsx that connects the control to `chain.revoke()` were deleted. That is precisely the
 * hole recognitionMeter.spec.ts was written for after a reviewer found the meter could be taken out
 * of the world with nothing going red. `chain.revoke()` had a test and no caller for months for the
 * same reason. So the wire is asserted here, against a page a person opens, through a real click.
 *
 * WHAT IT PROVES, in order: the control does not exist before consent (there is nothing to stop);
 * it exists after; clicking it flips the shared `echo.consent` key to declined, which is the same
 * key /play's own gate reads; and the panel then says what stopped WITHOUT claiming that anything
 * already sent was recalled, because it was not.
 */
import { expect, test } from "@playwright/test";

import { ORDINARY_CELL } from "./demoUrl";

const PARCEL = `/parcel/${ORDINARY_CELL}`;

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

test("the inspector really stops the measurement, on the page that promises it will", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(PARCEL, { waitUntil: "domcontentloaded" });

  // Before an answer there is nothing running, so there must be nothing offering to stop it.
  await page.keyboard.press("`");
  await expect(page.locator("[data-consent-revoke]")).toHaveCount(0);
  await page.keyboard.press("`");

  await answerConsent(page, true);
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });

  await page.keyboard.press("`");
  const panel = page.locator("aside[data-consent]");
  await expect(panel).toHaveAttribute("data-consent", "accepted");

  const stop = page.getByRole("button", { name: /stop the measurement/i });
  await expect(stop, "the promise in ConsentCard has no control behind it").toHaveCount(1);
  await stop.click();

  // THE WIRE. This is the assertion the node test cannot make: the click reached `chain.revoke()`,
  // which wrote the shared key that /play's gate reads too. The key holds a RECORD and not a word —
  // `writeConsent` merges `{ telemetry }` into whatever is already there, so `/play` and this page
  // read the same field and neither clobbers the other's.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          try {
            return (JSON.parse(localStorage.getItem("echo.consent") ?? "{}") as { telemetry?: unknown }).telemetry;
          } catch {
            return "unparseable";
          }
        }),
      { timeout: 15_000 },
    )
    .toBe(false);

  await expect(panel).toHaveAttribute("data-consent", "declined");
  await expect(page.locator("[data-consent-revoke]"), "it must stop offering to stop").toHaveCount(0);

  // And the panel is honest about the half it cannot undo.
  const stopped = page.locator("[data-consent-stopped]");
  await expect(stopped).toHaveCount(1);
  await expect(stopped).toContainText(/erase it at \/account/i);
});
