/**
 * The demo has one address, and only one parcel answers to it (tasks A3 and A5, DECISIONS.md C15).
 *
 * Three claims, and the middle one is the one that matters on launch day: at launch every parcel is
 * unclaimed, so a rule that is not "this exact cell" puts a cave and a campfire on all 284,004 of
 * them. A person can type ?stations=slice onto any parcel in the registry, and this is the check
 * that typing it changes nothing anywhere but the demo cell.
 *
 * It reads `data-stations` off the HUD rather than looking for a cave, on purpose. The attribute is
 * the server's answer rendered into the markup, so these assertions land in the first paint and do
 * not wait on a seven-cell terrain build or need a GPU to be trustworthy. What the answer then
 * BUILDS is slice.spec.ts's subject, and it drives this same URL.
 */
import { expect, test } from "@playwright/test";

import { ORDINARY_CELL, SLICE_HREF } from "./demoUrl";

const DEMO_PARCEL = SLICE_HREF.split("?")[0]!;

test("/demo is not a world any more, it is the way to the parcel that is one", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "domcontentloaded" });
  const at = new URL(page.url());
  expect(at.pathname + at.search, "/demo went somewhere other than the demo parcel").toBe(SLICE_HREF);
  await expect(page.locator("[data-stations='slice']")).toBeAttached();
});

test("the demo parcel without the parameter is an ordinary parcel", async ({ page }) => {
  await page.goto(DEMO_PARCEL, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-stations='none']")).toBeAttached();
});

test("the parameter on another parcel is ignored, and that parcel stays bare", async ({ page }) => {
  await page.goto(`/parcel/${ORDINARY_CELL}?stations=slice`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-stations='none']"), "a URL put the demo's stations on another parcel").toBeAttached();
});

test("a value that names no set is refused on the demo cell too", async ({ page }) => {
  await page.goto(`${DEMO_PARCEL}?stations=campfire`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-stations='none']")).toBeAttached();
});
