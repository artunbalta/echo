import { expect, test } from "@playwright/test";

/**
 * The landing's "try one" (DECISIONS C100), played as a visitor plays it: two answers, and the card out
 * of the envelope says what was written from the first and whether the second bore it out. Nothing is
 * sent for either answer.
 */
for (const [first, second, call, right] of [
  ["leave", "one", "one", "true"],
  ["take", "one", "three", "false"],
  ["owner", "pass", "one", "false"],
] as const) {
  test(`someone who chose "${first}" is called to take ${call}, and "${second}" is ${right === "true" ? "what was written" : "not"}`, async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" && !r.url().includes("/api/steps")) sent.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto("/");
    const how = page.locator("#how");
    await how.scrollIntoViewIfNeeded();
    await how.locator(`[data-choice="${first}"]`).click();
    await expect(how.locator(`[data-saw="${first}"]`)).toBeVisible();
    await how.locator("[data-next]").click();
    await how.locator(`[data-choice="${second}"]`).click();
    const card = how.locator("[data-call]");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-call", call);
    await expect(card).toHaveAttribute("data-right", right);
    // And again from the start.
    await how.locator("[data-again]").click();
    await expect(how.locator('[data-choice="take"]')).toBeVisible();
    expect(sent).toEqual([]);
  });
}

test("the finding is the audit's own count, and every twin has a row", async ({ page }) => {
  await page.goto("/");
  const evidence = page.locator("#evidence");
  await expect(evidence.locator("[data-finding]")).toHaveText(/^\d+ of \d+$/);
  const [below, total] = (await evidence.locator("[data-finding]").innerText()).split(" of ").map(Number);
  expect(below).toBeLessThanOrEqual(total!);
  await expect(evidence.locator(".twin-row")).toHaveCount(total!);
  await expect(evidence.locator("table tbody tr")).toHaveCount(total!);
});
