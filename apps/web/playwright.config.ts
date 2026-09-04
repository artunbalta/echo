/**
 * The browser acceptance harness (plan C0-2, INT). Every e2e criterion in the plan runs here:
 * the ten-second playability check, the scripted named sequence, the mobile emulation, the
 * cross-engine goldens.
 *
 * `npm run test:e2e` starts the web app itself unless one is already listening on :3000 (the
 * usual case during `npm run demo`). Browsers are installed once with `npx playwright install`;
 * chromium alone runs by default, and E2E_ALL_ENGINES=1 adds WebKit, Firefox and the phone
 * emulation, which the cross-engine goldens need.
 */
import { defineConfig, devices } from "@playwright/test";

const all = process.env.E2E_ALL_ENGINES === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // Real GPU, not SwiftShader. Headless chromium falls back to software rendering, and this app
    // draws 43,018 instanced props: measured, a frame costs 568 ms that way against 8.3 ms on the
    // GPU. That is not merely slow, it breaks correctness in the harness, because Playwright's
    // actionability check needs an element's box to be unchanged across two consecutive animation
    // frames before it will click. At half a second a frame the consent card never settles inside
    // a click timeout, so every click times out on a button that is visible, unobstructed and the
    // top element at its own centre. The suite was testing a machine nobody has.
    launchOptions: {
      args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(all
      ? [
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "mobile", use: { ...devices["iPhone 13"] } },
        ]
      : []),
  ],
});
