/**
 * The chain, with the measurement service actually running (plan Section A / S11, invariant I2).
 *
 * This is the check that separates a demo from a mock-up: an act reaches the posterior, the
 * posterior comes back with a version and a real move, and the campfire's reading names the event
 * that moved it. Skipped when echo-ml is not reachable, because a green tick against a mocked
 * service would be the exact lie the invariant forbids.
 */
import { expect, test } from "@playwright/test";

test("walking into the cave moves the posterior, and the fire's reading names that event", async ({ page, request }) => {
  const health = await request.get("/api/health/ml").then((r) => r.json());
  test.skip(!health.reachable, `echo-ml is not reachable from the dev server (${health.mlServiceUrlHost})`);

  const responses: Array<Record<string, unknown>> = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/observe/behavioral") && r.request().method() === "POST") {
      responses.push(await r.json().catch(() => ({})));
    }
  });

  await page.goto("/demo");
  await page.getByRole("button", { name: "Let it watch" }).click();
  await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });

  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

  // Step into the mouth. The test places the body there rather than guessing which key points
  // at a cave it cannot see; the walking itself is what slice.spec.ts covers. The act being
  // measured is entering, and entering is what happens here.
  const placed = await page.evaluate(async () => {
    const demo = (window as unknown as {
      __demo?: {
        player: { setPosition(x: number, y: number): void };
        slice: { stations(): Array<{ id: string; x: number; y: number }>; reading(): unknown };
        world: { region: { spawnTile: [number, number] } };
      };
    }).__demo;
    if (!demo) return null;
    const cave = demo.slice.stations().find((s) => s.id === "cave_mouth");
    if (!cave) return null;
    const [sx, sy] = demo.world.region.spawnTile;
    demo.player.setPosition(sx + cave.x, sy + cave.y);
    await new Promise((r) => setTimeout(r, 2500));
    return { reading: demo.slice.reading() };
  });
  expect(placed, "the demo exposed no test handle").not.toBeNull();

  const behavioral = responses.filter((r) => Array.isArray(r.results) && (r.results as unknown[]).length > 0);
  expect(behavioral.length, "no behavioral event reached the route").toBeGreaterThan(0);
  const last = behavioral[behavioral.length - 1]!;
  expect(last.mocked, "the service answered mocked, so nothing was really measured").toBeFalsy();

  const result = (last.results as Array<Record<string, unknown>>)[0]!;
  const persona = result.persona as { mu: number[]; version?: number } | undefined;
  expect(persona, "the response carried no posterior").toBeTruthy();
  expect(Array.isArray(persona!.mu) && persona!.mu.length === 8).toBe(true);
  expect(typeof result.delta_mu).toBe("number");
  expect(result.delta_mu as number, "the posterior did not move").toBeGreaterThan(0);

  // The fire answered a specific event at a specific posterior version. That trace is the whole
  // claim of the slice, so it is asserted rather than eyeballed.
  const reading = (placed as { reading: { channel: string; base: number; offset: number; result: number; eventId: string | null; version: number | null } | null }).reading;
  expect(reading, "the campfire never read the posterior").not.toBeNull();
  expect(reading!.channel).toBe("campfire_size");
  expect(reading!.version).toBe(persona!.version);
  expect(reading!.eventId, "the reading names no event").toBeTruthy();
  expect(Math.abs(reading!.offset), "the fire did not move").toBeGreaterThan(0.01);

  // And the inspector says the same thing on screen.
  await page.keyboard.press("`");
  const panel = page.locator("body");
  await expect(panel.getByText(/campfire[ _]size/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(/enter_cave|stay_safe/i).first()).toBeVisible();
});
