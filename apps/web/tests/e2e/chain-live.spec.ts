/**
 * The chain, with the measurement service actually running (plan Section A / S11, invariant I2).
 *
 * This is the check that separates a demo from a mock-up: an act reaches the posterior, the
 * posterior comes back with a version and a real move, and the campfire's reading names the event
 * that moved it. Skipped when echo-ml is not reachable, because a green tick against a mocked
 * service would be the exact lie the invariant forbids.
 *
 * It asserts on the CHAIN'S OWN STATE rather than on sniffed network responses. Two reasons: the
 * chain is what the campfire reads, so it is the thing whose correctness matters; and reading a
 * response body from the test side is racy in a way that made this check fail on a cold compile
 * while the app underneath was working perfectly.
 */
import { expect, test } from "@playwright/test";

interface LogEntry {
  id: string;
  action: string;
  route: string;
  delta_mu: number | null;
  version: number | null;
  mocked: boolean;
  durable: boolean;
}
interface Post {
  mu: number[];
  var: number[] | null;
  version: number | null;
  mocked: boolean;
  reason?: string;
}
interface Reading {
  channel: string;
  base: number;
  offset: number;
  result: number;
  eventId: string | null;
  version: number | null;
}
interface DemoHandle {
  player: { setPosition(x: number, y: number): void };
  slice: { stations(): Array<{ id: string; x: number; y: number }>; reading(): Reading | null };
  chain: { posterior(): Post | null; log(): LogEntry[] };
  world: { region: { spawnTile: [number, number] } };
}

test("walking into the cave moves the posterior, and the fire's reading names that event", async ({ page, request }) => {
  const health = await request.get("/api/health/ml").then((r) => r.json());
  test.skip(!health.reachable, `echo-ml is not reachable from the dev server (${health.mlServiceUrlHost})`);

  await page.goto("/demo");
  await page.getByRole("button", { name: "Let it watch" }).click();
  await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });

  // Step into the mouth. The test places the body there rather than guessing which key points at
  // a cave it cannot see; the walking itself is what slice.spec.ts covers. The act being measured
  // is entering, and entering is what happens here.
  const seen = await page.evaluate(async () => {
    const demo = (window as unknown as { __demo?: DemoHandle }).__demo;
    if (!demo) return null;
    const cave = demo.slice.stations().find((s) => s.id === "cave_mouth");
    if (!cave) return null;
    const [sx, sy] = demo.world.region.spawnTile;
    demo.player.setPosition(sx + cave.x, sy + cave.y);

    // Wait for the act to be measured, not for a guessed number of milliseconds: on a cold Next
    // compile the first frame is seconds late and a fixed wait turns a real check into a coin toss.
    const deadline = Date.now() + 40000;
    let entry: LogEntry | null = null;
    let post: Post | null = null;
    let reading: Reading | null = null;
    while (Date.now() < deadline) {
      entry = demo.chain.log().find((e) => e.action === "enter_cave" || e.action === "stay_safe") ?? null;
      post = demo.chain.posterior();
      reading = demo.slice.reading();
      if (entry && post && !post.mocked && post.version !== null && reading) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return { entry, posterior: post, reading };
  });

  expect(seen, "the demo exposed no test handle").not.toBeNull();
  const { entry, posterior, reading } = seen!;

  // The act was measured.
  expect(entry, "no enter_cave or stay_safe reached the chain").toBeTruthy();
  expect(entry!.route).toBe("behavioral");
  expect(entry!.mocked, `the service answered mocked (${posterior?.reason ?? "no reason given"}), so nothing was really measured`).toBe(false);
  expect(typeof entry!.delta_mu).toBe("number");
  expect(entry!.delta_mu as number, "the posterior did not move").toBeGreaterThan(0);

  // A real posterior came back, over the eight axes.
  expect(posterior, "no posterior").toBeTruthy();
  expect(posterior!.mocked).toBe(false);
  expect(posterior!.mu.length).toBe(8);
  expect(posterior!.version).not.toBeNull();

  // And the fire answered THAT event at THAT version. This trace is the whole claim of the slice.
  expect(reading, "the campfire never read the posterior").not.toBeNull();
  expect(reading!.channel).toBe("campfire_size");
  expect(reading!.version).toBe(posterior!.version);
  expect(reading!.eventId).toBe(entry!.id);
  expect(Math.abs(reading!.offset), "the fire did not move").toBeGreaterThan(0.01);

  // And the inspector says the same thing on screen.
  await page.keyboard.press("`");
  const panel = page.locator("body");
  await expect(panel.getByText(/campfire[ _]size/i).first()).toBeVisible({ timeout: 10000 });
  await expect(panel.getByText(/enter_cave|stay_safe/i).first()).toBeVisible();
});
