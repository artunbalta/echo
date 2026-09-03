import { expect, test } from "@playwright/test";

/** The harness works at all: the landing answers and carries its name. */
test("the landing responds", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/echo/i);
});
