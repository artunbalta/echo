/**
 * Cross-engine determinism (plan I-4, invariant I4). The browser computes the shipped planet at
 * /dev/goldens; this compares it with the fixture node wrote. Run with E2E_ALL_ENGINES=1 to cover
 * WebKit and Firefox as well as Chromium, which is the point.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "../../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8")) as {
  calibration: { seaLevel: number; peakElevation: number };
  demoSpawn: { childCell: string; x: number; y: number } | null;
  sphere: Array<{ elevation: number; moisture: number; temperature: number; height: number }>;
  local: Array<{ height: number }>;
};

test("this engine computes the shipped planet to the goldens", async ({ page }) => {
  await page.goto("/dev/goldens");
  await page.locator("#goldens[data-ready='1']").waitFor({ timeout: 90_000 });
  const got = JSON.parse(await page.locator("#goldens").innerText()) as typeof golden & { engine: string };
  expect(Math.abs(got.calibration.seaLevel - golden.calibration.seaLevel)).toBeLessThan(1e-9);
  expect(Math.abs(got.calibration.peakElevation - golden.calibration.peakElevation)).toBeLessThan(1e-9);
  expect(got.sphere.length).toBe(golden.sphere.length);
  for (let i = 0; i < golden.sphere.length; i++) {
    expect(Math.abs(got.sphere[i]!.elevation - golden.sphere[i]!.elevation)).toBeLessThan(1e-12);
    expect(Math.abs(got.sphere[i]!.moisture - golden.sphere[i]!.moisture)).toBeLessThan(1e-12);
    expect(Math.abs(got.sphere[i]!.temperature - golden.sphere[i]!.temperature)).toBeLessThan(1e-12);
    expect(Math.abs(got.sphere[i]!.height - golden.sphere[i]!.height)).toBeLessThan(1e-9);
  }
  for (let i = 0; i < golden.local.length; i++) {
    expect(Math.abs(got.local[i]!.height - golden.local[i]!.height)).toBeLessThan(1e-9);
  }
  expect(got.demoSpawn?.childCell).toBe(golden.demoSpawn?.childCell);
  expect(Math.abs((got.demoSpawn?.x ?? 0) - (golden.demoSpawn?.x ?? 0))).toBeLessThan(1e-6);
  expect(Math.abs((got.demoSpawn?.y ?? 0) - (golden.demoSpawn?.y ?? 0))).toBeLessThan(1e-6);
});
