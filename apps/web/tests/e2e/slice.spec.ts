/**
 * The vertical slice, in a browser (plan Section A / S11).
 *
 * It proves the two things the slice exists to prove: the world builds and draws, and walking into
 * the cave puts a real event through the chain. It does NOT assert that a person notices the
 * campfire; that is I-5, and a test cannot stand in for it.
 *
 * It drives the parcel URL, not /demo. There is no /demo world any longer: the demo is a parcel
 * with `?stations=slice` on it (task A5), and driving the redirect instead would make every
 * failure here ambiguous between the world and the hop. That the hop lands exactly on this URL is
 * stations.spec.ts's first assertion.
 */
import { expect, test } from "@playwright/test";

import { SLICE_HREF } from "./demoUrl";

test("the demo builds, draws, and measures a walk into the cave", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  const posts: Array<{ url: string; body: string }> = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(observe\/behavioral|telemetry)/.test(r.url())) {
      posts.push({ url: r.url(), body: r.postData() ?? "" });
    }
  });

  await page.goto(SLICE_HREF);

  // Nothing is emitted before consent: that is the landing's rule, and the opposite of /play's.
  await expect(page.getByText("Your echo can learn from how you move here.")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(posts, "the world emitted before anyone consented").toHaveLength(0);

  await page.getByRole("button", { name: "Let it watch" }).click();

  // The ground is built. The region is seven H3 cells of real terrain, so give it room.
  await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(100);

  // Walk. The cave sits north-west of the spawn, so hold the two keys that go there and let the
  // controller do the rest; the trigger volume is generous enough not to need pixel accuracy.
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  for (const key of ["KeyW", "KeyA"]) await page.keyboard.down(key);
  await page.waitForTimeout(9000);
  for (const key of ["KeyW", "KeyA"]) await page.keyboard.up(key);
  await page.waitForTimeout(1500);

  // The locomotion channel is the least fakeable one and it should have fired on its own.
  const telemetry = posts.filter((p) => p.url.includes("/api/telemetry"));
  expect(telemetry.length, "walking produced no passive_locomotion").toBeGreaterThan(0);
  expect(telemetry.some((p) => p.body.includes("passive_locomotion"))).toBe(true);
  expect(telemetry.some((p) => p.body.includes('"session_mode":"landing"'))).toBe(true);

  // EVERY assertion above this line also passes on a bare parcel with no slice at all: the consent
  // card, the ready phase, the canvas and passive_locomotion are all the ordinary parcel's. When
  // `feedPosition` moved from sliceLayer into walkLayer, this file stopped requiring the thing it
  // is named for, and a demo cell that built no slice would have passed it green under a header
  // claiming it proved a walk into the cave. So the slice has to be asserted directly.
  const stations = await page.evaluate(() => {
    const w = (window as unknown as { __demo?: { world?: { scene?: { getObjectByName(n: string): unknown } } } }).__demo;
    return {
      campfire: Boolean(w?.world?.scene?.getObjectByName("campfire")),
      cave: Boolean(w?.world?.scene?.getObjectByName("cave_mouth")),
      slice: Boolean((window as unknown as { __demo?: { slice?: unknown } }).__demo?.slice),
    };
  });
  expect(stations.slice, "no slice layer was built, so this is not the demo").toBe(true);
  expect(stations.campfire, "the campfire is not in the scene").toBe(true);
  expect(stations.cave, "the cave mouth is not in the scene").toBe(true);

  // And the one act the slice exists for. This is the assertion the file was always supposed to
  // carry: without it, nothing here distinguishes the demo from any other piece of ground.
  const behavioral = posts.filter((p) => p.url.includes("/api/observe/behavioral"));
  expect(
    behavioral.some((p) => p.body.includes("enter_cave")),
    "nine seconds of walking north-west produced no enter_cave, so the cave was never reached",
  ).toBe(true);

  // The inspector opens and names what happened.
  await page.keyboard.press("`");
  await expect(page.getByText(/dominance/i).first()).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !/favicon|WebGL|SwiftShader/i.test(e)), "console errors").toEqual([]);
});
