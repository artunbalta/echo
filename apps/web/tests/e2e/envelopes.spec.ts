/**
 * The envelopes, on the page a person opens (DECISIONS C89).
 *
 * WHY THIS FILE EXISTS AND NOT ONLY THE NODE TESTS. `tests/envelopes.test.mts` renders the panel with
 * a record handed to it, and would keep passing if ParcelCanvas stopped mounting it, if the page
 * stopped reading the record from the browser, or if `O` reached nothing. So the wires are asserted
 * here, against the open village, through real keys and clicks:
 *
 *   - the page reads the visitor's record and the small envelope counts what is waiting;
 *   - `O` opens them, and the count on the page is the record's own;
 *   - "check the seals" is the page's own code, and it finds a call rewritten after the fact;
 *   - a friend's link is made, carries the moments after the `#`, which no request ever carries, and
 *     the friend's page reads it and counts their guesses against the echo's;
 *   - someone who said no has no envelopes, and is told why;
 *   - a moment that happens ON THIS PAGE is sealed as it begins and settled once it is over, under a
 *     name with the page and the layer in it; and after an erasure the page keeps nothing more, though
 *     the world goes on (the defect a review found: the next moment wrote the erased record back).
 *
 * The record is made by the app's own code (`envelopeBook.mts`), never spelled out here.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/** `lib/openVillage.ts`'s, as a browser types it; pinned by envelopes.test.mts ("a village, and not the study's"). */
const OPEN_VILLAGE = "/parcel/84dcee5ffffffff";

const bookOf = (which: "whole" | "tampered"): string =>
  execFileSync(process.execPath, ["--import", "tsx", path.join(__dirname, "envelopeBook.mts"), ...(which === "tampered" ? ["tampered"] : [])], { cwd: path.join(__dirname, "../.."), encoding: "utf8" });

/** A browser that has already said yes or no, with a record (or none) kept in it. */
async function arrive(page: Page, opts: { book?: string; consent: boolean }): Promise<void> {
  await page.addInitScript(
    ({ book, consent }) => {
      localStorage.setItem("echo.consent", JSON.stringify({ telemetry: consent }));
      localStorage.setItem("echo.lang", "en");
      localStorage.setItem("echo.controls.seen", "1");
      if (book && !localStorage.getItem("echo.calls")) localStorage.setItem("echo.calls", book);
    },
    { book: opts.book ?? null, consent: opts.consent },
  );
  await page.goto(OPEN_VILLAGE, { waitUntil: "domcontentloaded" });
  await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });
}

test("the page reads the record, O opens it, and the count is the record's", async ({ page }) => {
  test.setTimeout(240_000);
  await arrive(page, { book: bookOf("whole"), consent: true });

  // Six settled (the honey stall was never seen), none opened: the envelope under the meter says six.
  const chip = page.locator("[data-envelopes-chip]");
  await expect(chip, "the page never read the record, or the chip is not mounted").toHaveAttribute("data-envelopes-chip", /^[6-9]$/, { timeout: 30_000 });
  await expect(page.locator("[data-envelopes-panel]")).toHaveCount(0);

  await page.keyboard.press("o");
  const panel = page.locator("[data-envelopes-panel]");
  await expect(panel, "O reached nothing").toBeVisible();
  // The six of the record are among those opened (a moment of this page's own may have settled meanwhile).
  await expect(panel.getByText("A purse lying in the grass")).toBeVisible();
  await expect(panel.getByText("nine coins in it")).toBeVisible();
  await expect(panel.getByText("Take a coin", { exact: true })).toBeVisible();
  await expect(panel.getByText("An old man telling children a Nasreddin Hoca tale")).toBeVisible();
  await expect(panel.getByText(/stall of honey/)).toHaveCount(0);
  await expect(panel.locator("[data-envelopes-count]")).toContainText(/\d+ of \d+ right/);
  // First time at a moment against one it had seen them at: the basket, the second time.
  await expect(panel.locator("[data-envelopes-curve]")).toContainText(/Where it had seen you before: \d+ of \d+/);

  // Opened is kept: the record in the browser now says so, and the small envelope has nothing to count.
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("echo.calls") ?? "{}").chain ?? []).filter((e: { ref: string; open: boolean }) => e.ref.startsWith("e2e:") && e.open).length)).toBe(6);

  // The seals, checked by the page's own code.
  await panel.locator("[data-envelopes-check]").click();
  await expect(panel.locator("[data-envelopes-note]")).toContainText(/All \d+ seals are whole/);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("a call rewritten after the fact is found, and the page says where", async ({ page }) => {
  test.setTimeout(240_000);
  await arrive(page, { book: bookOf("tampered"), consent: true });
  await page.keyboard.press("o");
  const panel = page.locator("[data-envelopes-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-envelopes-check]").click();
  // The purse was the second seal.
  await expect(panel.locator("[data-envelopes-note]")).toContainText("The chain breaks at seal 2");
});

test("a friend's link carries the moments where no request does, and the friend's page counts their guesses", async ({ page, context }) => {
  test.setTimeout(300_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await arrive(page, { book: bookOf("whole"), consent: true });
  await page.keyboard.press("o");
  const panel = page.locator("[data-envelopes-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-friend-name]").fill("Deniz");
  await panel.locator("[data-friend-link]").click();
  await expect(panel.locator("[data-envelopes-note]")).toContainText("Link copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/guess#[A-Za-z0-9_-]{40,}$/);
  const payload = link.split("#")[1]!;

  const friend = await context.newPage();
  const asked: string[] = [];
  friend.on("request", (r) => asked.push(r.url() + (r.postData() ?? "")));
  await friend.goto(link, { waitUntil: "domcontentloaded" });
  await expect(friend.getByRole("heading", { name: "What did Deniz do?" })).toBeVisible({ timeout: 60_000 });
  await friend.locator("[data-guess-begin]").click();
  // Answer every one with its last option (walking on), and count how many there were.
  let questions = 0;
  for (; questions < 12; questions++) {
    const options = friend.locator("[data-guess-option]");
    if ((await options.count()) === 0) break;
    await options.last().click();
    await friend.waitForTimeout(150);
  }
  // One of each kind met: the basket, the purse, the elder, the greeting, the tale.
  expect(questions).toBe(5);
  const result = friend.locator("[data-guess-result]");
  await expect(result).toContainText(/You knew Deniz: \d of 5\. Their echo: \d of 5\./);
  // The elder was walked past, and the friend said so: at least that one is theirs.
  await expect(result).toContainText(/You knew Deniz: [1-5] of 5/);
  await expect(friend.locator("[data-guess-yours]")).toHaveAttribute("href", OPEN_VILLAGE);
  // What the link carried was read in the browser: no request, and no request's body, ever held it.
  expect(asked.filter((u) => u.includes(payload))).toEqual([]);

  // A link that is not one says so and shows nothing.
  await friend.goto("/guess#not-a-link", { waitUntil: "domcontentloaded" });
  await friend.reload({ waitUntil: "domcontentloaded" });
  await expect(friend.locator("[data-guess-bad]")).toBeVisible({ timeout: 30_000 });
});

test("someone who said no has no envelopes, and opening them says why", async ({ page }) => {
  test.setTimeout(240_000);
  await arrive(page, { consent: false });
  // Long enough for the first moments to have begun, had anything been sealing them.
  await page.waitForTimeout(25_000);
  await expect(page.locator("[data-envelopes-chip]")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("echo.calls"))).toBeNull();
  await page.keyboard.press("o");
  await expect(page.locator("[data-envelopes-empty]")).toContainText("not watching, so it seals nothing");
});

/** Stand a few strides short of whatever moment is going on, and act on it. True once an act's line has shown. */
async function meetOne(page: Page): Promise<boolean> {
  for (let tries = 0; tries < 30; tries++) {
    const found = await page.evaluate(() => {
      type M = { kind: string; lane: string; x: number; y: number; state: string };
      const w = (window as unknown as { __world: { context(): { layer(n: string): unknown; frame: { toLocalM(x: number, y: number): [number, number]; fromLocalM(x: number, y: number): [number, number] } } } }).__world;
      const c = w.context();
      const layer = c.layer("moments") as { all(): M[] } | undefined;
      const player = c.layer("player") as { position(): { x: number; y: number }; setPosition(x: number, y: number): void } | undefined;
      if (!layer || !player) return false;
      const at = player.position();
      const [mx, my] = c.frame.toLocalM(at.x, at.y);
      const all = layer.all().filter((m) => m.lane !== "errand" && m.state !== "ending");
      all.sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my));
      const m = all[0];
      if (!m) return false;
      const d = Math.hypot(m.x - mx, m.y - my) || 1;
      player.setPosition(...c.frame.fromLocalM(m.x - ((m.x - mx) / d) * 2.2, m.y - ((m.y - my) / d) * 2.2));
      return true;
    });
    if (!found) {
      await page.waitForTimeout(2000);
      continue;
    }
    // The prompt for what is near, then its first verb, then the line that says it was done.
    const prompt = page.locator("[data-interact-prompt]");
    if (!(await prompt.isVisible().catch(() => false))) {
      await page.waitForTimeout(1200);
      if (!(await prompt.isVisible().catch(() => false))) continue;
    }
    await page.keyboard.press("e");
    try {
      await page.locator("[data-act-line]").waitFor({ timeout: 14_000 });
      return true;
    } catch {
      // It was a person to talk to, or the moment walked off: the next one.
      await page.keyboard.press("Escape");
    }
  }
  return false;
}

test("a moment met on this page is sealed and settled under its own name, and after an erasure nothing more is kept", async ({ page }) => {
  test.setTimeout(480_000);
  await arrive(page, { consent: true });
  test.skip(!(await page.evaluate(() => "__world" in window)), "this build has no handle to stand the player at a moment with");

  type Kept = { chain: { ref: string; kind: string; did: string | null; at: string; n: number }[] } | null;
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("echo.calls") ?? "null")) as Promise<Kept>;
  const settled = async () => ((await kept())?.chain ?? []).filter((e) => e.did !== null);

  expect(await meetOne(page), "no moment could be met in this village").toBe(true);
  // Acted on, it ends a few seconds later, and its envelope learns what was done.
  await expect.poll(async () => (await settled()).length, { timeout: 90_000, message: "a moment was acted on and no envelope ever settled: the layer's wires to the page are dead" }).toBeGreaterThan(0);
  const first = (await settled())[0]!;
  // Named by the page and by which of its layers it came from, then the layer's own name for it.
  // (What was done is whatever it was: the nearest thing to act on may not have been the moment, and a
  // moment seen and left settles too. That it settled at all is the wire.)
  expect(first.ref).toMatch(/^[0-9a-z]+\.1:moment:/);
  await expect(page.locator("[data-envelopes-chip]")).toBeVisible();

  // Erased, as the mirror and the demo's end erase: the record goes at once.
  await page.evaluate(() => window.dispatchEvent(new Event("echo:envelopes-forget")));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("echo.calls"))).toBeNull();
  await expect(page.locator("[data-envelopes-chip]")).toHaveCount(0);

  // The world goes on. Another moment is met and acted on, and long enough passes for it to end.
  expect(await meetOne(page), "no second moment could be met").toBe(true);
  await page.waitForTimeout(20_000);
  expect(await page.evaluate(() => localStorage.getItem("echo.calls")), "a moment after the erasure wrote the record back").toBeNull();
  await expect(page.locator("[data-envelopes-chip]")).toHaveCount(0);
});
