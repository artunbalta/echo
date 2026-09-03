/**
 * The vertical slice, in a browser (plan Section A / S11).
 *
 * It proves the two things the slice exists to prove: the world builds and draws, and walking into
 * the cave puts a real event through the chain. It does NOT assert that a person notices the
 * campfire; that is I-5, and a test cannot stand in for it.
 */
import { expect, test } from "@playwright/test";

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

  await page.goto("/demo");

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

  // The inspector opens and names what happened.
  await page.keyboard.press("`");
  await expect(page.getByText(/dominance/i).first()).toBeVisible({ timeout: 10_000 });

  expect(errors.filter((e) => !/favicon|WebGL|SwiftShader/i.test(e)), "console errors").toEqual([]);
});
