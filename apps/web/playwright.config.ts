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

/** The five spec files that are red for a recorded reason. See the quarantine note below. */
const QUARANTINE = [
  "**/scatterSplit.spec.ts",
  "**/scatterImpostor.spec.ts",
  "**/globePick.spec.ts",
  "**/slice.spec.ts",
  "**/spawnSea.spec.ts",
];

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/globalSetup.ts",
  // THE QUARANTINE, and it is a list of REASONS rather than a list of nuisances (SOC-2.H).
  //
  // Ten tests across five files are red on this tree. Every one fails on an ASSERTION and not on a
  // clock, and every one was verified pre-existing by stashing the day's render changes and
  // re-running. Three of the five are measurement paths, so this is not cosmetic debt:
  //
  //   scatterSplit.spec.ts   DECISIONS C28. The whole frame at the ordinary parcel spawn is 907,250
  //                          triangles against C16's 600,000 — worst of eight headings on an M4 Pro.
  //                          The spec is the meter and the meter is right; the overage is SOC-1.A
  //                          and SOC-4, measured in months.
  //   scatterImpostor.spec.ts  C21's far band at 390 m and 448 m, both routes.
  //   globePick.spec.ts      the parcel the landing names against the one it draws.
  //   slice.spec.ts          the walk into the cave ends 1.57-1.86 tiles short of a 1.3 threshold —
  //                          the demo's locomotion channel, which is a measurement path.
  //   spawnSea.spec.ts       a parcel with no sea is left exactly as it shipped.
  //
  // NOTHING HERE MOVES A THRESHOLD. The point of a quarantine is to keep a number visible while the
  // work happens, never to retune it until it passes — which is the failure mode SOCIETY-PLAN §3
  // exists to catch, and §3 item 7 is that plan doing it to itself. Unset, everything runs, which is
  // what a person at a terminal should see.
  ...(process.env.E2E_QUARANTINE === "skip"
    ? { testIgnore: QUARANTINE }
    : process.env.E2E_QUARANTINE === "only"
      ? { testMatch: QUARANTINE }
      : {}),
  // 120 s, and the reason is NOT that a world takes two minutes to build. Measured on an idle
  // machine, one browser, these launch args: the demo parcel reaches data-phase="ready" 1,440 ms
  // after goto, the ordinary parcel 1,745 ms, /dev/goldens 739 ms, and the landing's globe 3,780 ms.
  // The old 60 s was already 16x the largest of those, so SOC-1.D's premise — "heavy WebGL specs
  // exceed the 60 s default while the world builds" — is refuted by the world.
  //
  // The real reason is legibility. Six tests that rely on this default hold waits LONGER than the
  // test holding them — minimap.spec.ts (120 s), chain-live.spec.ts (120 s), goldens.spec.ts (90 s),
  // groundGrain.spec.ts (120 s) — and a wait that outlives its test can never print its own message:
  // the runner kills the spec at 60 s and says "Test timeout of 60000ms exceeded" instead of the
  // sentence the author wrote. That is how a starved dev server spent months looking like a slow
  // world. 120 s is the smallest number that lets each of them finish and speak.
  timeout: 120_000,
  // ONE WORKER, and the number was wrong twice before it was right.
  //
  // THE MECHANISM. `use.launchOptions` below sets --disable-gpu-vsync and
  // --disable-frame-rate-limit, so each browser spins the WebGL world as fast as the GPU allows --
  // measured through the host's own instrument, 534 fps on the ordinary parcel and 312 on the demo.
  // A worker is therefore not a process waiting on a page, it is a process burning every cycle it
  // can reach, and it is doing that on the same box as the `next dev` server it is talking to.
  // MEASURED: ONE worker takes the 12-core load average from 3.1 to 7.1 by itself.
  //
  // MEASURED, this tree, quarantine excluded (21 tests), reporter=line:
  //
  //   workers   wall     result                    load average, before -> after
  //   3         27.8m    6 FAILED / 15 passed      3.99 -> 62.10
  //   1          1.1m    21 passed, exit 0         3.08 ->  7.09
  //
  // Twenty-five times faster and green. Every one of the six failures at three workers was a
  // `Test timeout` or `page.goto: net::ERR_ABORTED` -- including smoke.spec.ts, whose entire body is
  // a goto and a title assertion and which passes ALONE IN 3.0 SECONDS on the same machine. Not one
  // was an assertion about the world. THE SUITE WAS NOT MEASURING THE WORLD; IT WAS MEASURING
  // ITSELF, and three workers is still that failure, just less of it than six.
  //
  // WHAT THIS COMMENT SAID BEFORE, and why it was wrong, because the correction is the point. It
  // carried a 6/3/1 table concluding "at three it is FASTER in wall time than at one, and nothing
  // times out at all". That table was taken on the PRE-MERGE tree; feat/f4-trust then added routes
  // and modules, and the number was carried forward without being re-measured. A constant quoted
  // from an old measurement is exactly the class of error SOCIETY-PLAN §3 exists to catch, and it
  // happened here in the commit that closed SOC-1.D. Re-measure after anything that changes what a
  // page loads, and put the new table in this comment rather than in a commit message.
  //
  // Do not raise this to "use the hardware": the hardware is already shared with the dev server, and
  // an uncapped browser will take all of it that it is given.
  workers: 1,
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
    //
    // AND VSYNC OFF, which is DECISIONS C16's own measuring condition: at 120 Hz a p50 of 8.3 ms
    // hides however much headroom there really is, so the budget is read on a loop that is allowed
    // to run as fast as it can. The triangle and draw-call counts these specs assert are unaffected
    // by it; what it changes is how long a spec that samples a run of frames at each of 24 headings
    // takes to finish, which is minutes.
    launchOptions: {
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-vsync",
        "--disable-frame-rate-limit",
      ],
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
