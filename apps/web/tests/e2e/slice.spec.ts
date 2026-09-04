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
  // The default 60 s is not enough. Building seven H3 chunks and placing 43,018 instances is most
  // of a minute on a cold route, and the steering loop below spends up to sixteen seconds on top.
  test.setTimeout(240_000);
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

  // Click, then CHECK. A click that lands on the server-rendered button before React has attached
  // its handler hits a real DOM node, does not throw, and does nothing at all. This test used to
  // assume the click took; it did not, on the first try, and everything downstream then measured a
  // world with consent unset, which correctly emits nothing. Retry until the store actually moves.
  const card = page.getByRole("button", { name: "Let it watch" });
  await expect
    .poll(async () => {
      await card.click({ timeout: 2000 }).catch(() => {});
      return page.evaluate(() => localStorage.getItem("echo.consent"));
    }, { timeout: 20_000, message: "the consent click never reached React" })
    .not.toBeNull();

  // The ground is built. The region is seven H3 cells of real terrain, so give it room.
  await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(100);

  // Walk to the cave, and COMMIT to it. Three things this test learned the hard way.
  //
  // One: the keys are camera-relative. It used to hold W and A on the comment that the cave is
  // north-west, but the default boom sits NORTH of the player looking south, so W and A walk
  // SOUTH-EAST, straight away from a cave at tile (-16, -7). Nine seconds of that ends against a
  // buttress tree, where a separate-axis slide against a circle refuses both axes at once. That is
  // the mover's documented corner and not a trap: measured, every other heading leaves it at 4.4
  // to 4.8 tiles in 1.2 s. So the approach is steered from the live distance and does not encode
  // the camera's current convention, which is free to change.
  //
  // Two: hesitating at the mouth is a REFUSAL, by the world's own rule. Dither inside the 3.4-tile
  // threshold for 700 ms and then leave it and the slice emits stay_safe, not enter_cave. So the
  // heading is chosen OUTSIDE the threshold and then held without release; 3.4 to 1.5 tiles at
  // four tiles a second is under half a second.
  //
  // Three: the whole approach runs inside ONE evaluate. Driven from node it is a hundred and sixty
  // traced keyboard actions on a page holding 43,018 instances, and the trace snapshots alone took
  // the test past four minutes.
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  const approach = await page.evaluate(async () => {
    type Demo = {
      player: { position(): { x: number; y: number } };
      slice: { stations(): Array<{ id: string; x: number; y: number }> };
      world: { context(): { region: { spawnTile: [number, number] } } };
    };
    const PAIRS = [["KeyW"], ["KeyW", "KeyD"], ["KeyD"], ["KeyS", "KeyD"], ["KeyS"], ["KeyS", "KeyA"], ["KeyA"], ["KeyW", "KeyA"]];
    const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const d = (window as unknown as { __demo: Demo }).__demo;
    const st = d.slice.stations().find((s) => s.id === "cave_mouth")!;
    // The station offset is relative to the spawn, exactly as the slice layer reads it. Taking it
    // as absolute happens to work on this cell because the spawn is (0, 0) and would silently
    // measure the wrong point on any other.
    const spawn = d.world.context().region.spawnTile;
    const cx = spawn[0] + st.x;
    const cy = spawn[1] + st.y;
    const dist = () => { const a = d.player.position(); return Math.hypot(a.x - cx, a.y - cy); };

    let pair = 0;
    let last = dist();
    for (let t = 0; t < 60 && last > 5; t++) {
      for (const k of PAIRS[pair]!) key("keydown", k);
      await sleep(350);
      for (const k of PAIRS[pair]!) key("keyup", k);
      await sleep(20);
      const now = dist();
      if (!(now < last - 0.15)) pair = (pair + 1) % PAIRS.length;
      last = now;
    }
    if (last > 5) return { reached: false, why: "never got within five tiles of the cave", at: last };

    let best: string[] | null = null;
    let bestGain = 0;
    for (const cand of PAIRS) {
      const from = dist();
      for (const k of cand) key("keydown", k);
      await sleep(110);
      for (const k of cand) key("keyup", k);
      await sleep(20);
      const gain = from - dist();
      if (gain > bestGain) { bestGain = gain; best = cand; }
    }
    if (!best) return { reached: false, why: "no heading reduced the distance to the cave", at: dist() };

    for (const k of best) key("keydown", k);
    let reached = false;
    for (let t = 0; t < 60; t++) { await sleep(60); if (dist() <= 1.3) { reached = true; break; } }
    for (const k of best) key("keyup", k);
    return { reached, why: reached ? "" : "held the best heading and never got inside 1.3 tiles", at: dist() };
  });
  expect(approach.reached, `${approach.why} (ended ${approach.at.toFixed(2)} tiles away)`).toBe(true);
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
