/**
 * The minimap, on the shipped page, on a real GPU: which way is up, what it costs, and that it
 * cannot take a click or a key away from the world.
 *
 * WHY THIS FILE HAS TO EXIST, MEASURED. tests/minimap.test.mts proves the arithmetic and can see
 * none of the wiring. Swapping the marker's two axes in the transform Minimap.tsx writes leaves ALL
 * FIFTEEN node tests passing and turns the first test here red, at "expected < 98, received 98";
 * writing the marker with north DOWN does the same, at "received 116.91". A third break, repainting
 * the ground image every frame, is invisible to node and fails the last test here at 22,344
 * microseconds a frame against the 250 it allows.
 *
 * WHERE THE EXPECTATIONS COME FROM. Not from the component. The scale is derived here, from
 * `region.extentM`, which is the world's own statement of how much ground it built, and from the
 * map element's measured width in the DOM. The heading is derived from the player's OBSERVED
 * travel: the test holds a key, watches which way the tile position actually moved, and requires
 * the arrow to point that way. Nothing is predicted through a function this file is testing.
 *
 * THE PROBE is the fiber walk spawnSea.spec.ts uses, because only the demo route attaches a debug
 * handle and the map has to be measured on an ordinary parcel too.
 */
import { expect, test, type Page } from "@playwright/test";

/** 8482589ffffffff: 100% rainforest, no water mesh, the parcel a person actually opens. */
const INLAND = "/parcel/8482589ffffffff";
/** The demo cell: 45% ocean, and its sea is NORTH, which is what makes its map worth a picture. */
const DEMO = "/parcel/847b949ffffffff?stations=slice";

function installProbe(): void {
  const w = window as any;
  w.__mm = {
    world(): any {
      const node = document.querySelector("[data-phase]") as any;
      const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
      if (!key) throw new Error("no React fiber on the phase host; the page has not hydrated");
      let fiber = node[key];
      for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let i = 0; hook && i < 60; i++, hook = hook.next) {
          const state = hook.memoizedState;
          if (state && typeof state === "object" && "current" in state && state.current && typeof state.current.context === "function") {
            return state.current;
          }
        }
      }
      throw new Error("no PlanetWorld on the page");
    },
    player(): any {
      return w.__mm.world().context().layer("player");
    },
  };
}

async function ready(page: Page, href: string) {
  await page.addInitScript(installProbe);
  await page.goto(href);
  await page.waitForSelector('[data-phase="ready"]', { timeout: 120_000 });
  // The map is folded until asked for (DECISIONS C68), so the test asks, as a person would.
  await page.locator("[data-hud-map][aria-pressed='false']").click();
  await page.waitForSelector('[data-minimap="ready"]', { timeout: 60_000 });
}

/** Where the marker's own origin sits, in pixels inside the map box. */
async function markerIn(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate(() => {
    const map = document.querySelector("[data-minimap-map]")!.getBoundingClientRect();
    const marker = document.querySelector("[data-minimap-marker]")!.getBoundingClientRect();
    // The marker element is a zero-size anchor with its art hung off it, so its box is the art's;
    // its centre is the point the transform put it at.
    return {
      x: marker.left + marker.width / 2 - map.left,
      y: marker.top + marker.height / 2 - map.top,
      w: map.width,
      h: map.height,
    };
  });
}

async function placeAt(page: Page, tileX: number, tileY: number) {
  await page.evaluate(([x, y]) => (window as any).__mm.player().setPosition(x, y), [tileX, tileY]);
  // Two frames: one for the mover to commit the position, one for the map's own loop to read it.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe("the minimap", () => {
  test("north is up and east is right, measured on the shipped panel", async ({ page }) => {
    await ready(page, INLAND);

    const world = await page.evaluate(() => {
      const ctx = (window as any).__mm.world();
      return { extentM: ctx.context().region.extentM, tileM: ctx.frame.tileM };
    });

    await placeAt(page, 0, 0);
    const centre = await markerIn(page);
    // The map covers the built region, so its scale is the region's own extent over the box the
    // browser laid out. Derived here, not read off the component.
    const pxPerMetre = centre.w / (2 * world.extentM);
    expect(Math.abs(centre.x - centre.w / 2)).toBeLessThan(1.5);
    expect(Math.abs(centre.y - centre.h / 2)).toBeLessThan(1.5);

    const metres = 400;
    const tiles = metres / world.tileM;

    // Tile y is SOUTH, so -tiles is north.
    await placeAt(page, 0, -tiles);
    const north = await markerIn(page);
    expect(north.y).toBeLessThan(centre.y);
    expect(Math.abs(centre.y - north.y - metres * pxPerMetre)).toBeLessThan(1.5);
    expect(Math.abs(north.x - centre.x)).toBeLessThan(1.5);

    await placeAt(page, 0, tiles);
    const south = await markerIn(page);
    expect(south.y).toBeGreaterThan(centre.y);
    expect(Math.abs(south.y - centre.y - metres * pxPerMetre)).toBeLessThan(1.5);

    await placeAt(page, tiles, 0);
    const east = await markerIn(page);
    expect(east.x).toBeGreaterThan(centre.x);
    expect(Math.abs(east.x - centre.x - metres * pxPerMetre)).toBeLessThan(1.5);
    expect(Math.abs(east.y - centre.y)).toBeLessThan(1.5);
  });

  test("the arrow points the way the player actually travelled", async ({ page }) => {
    await ready(page, DEMO);
    await placeAt(page, 0, 0);

    const before = await page.evaluate(() => {
      const p = (window as any).__mm.player().position();
      return [p.x, p.y];
    });
    // Keys are read on the window, so no click is needed and no focus is taken.
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => {
      const p = (window as any).__mm.player().position();
      return [p.x, p.y];
    });
    const arrow = await page.evaluate(() => document.querySelector("[data-minimap-arrow]")!.getAttribute("transform"));
    await page.keyboard.up("KeyW");

    const dx = after[0]! - before[0]!;
    const dy = after[1]! - before[1]!;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1); // it walked somewhere

    // The observed travel, as a screen direction: tile x is east and tile y is SOUTH, and a screen's
    // y grows down, so the two agree with no sign.
    const travelled = Math.atan2(dy, dx);
    const degrees = Number(/rotate\(([-\d.]+)/.exec(arrow ?? "")?.[1]);
    expect(Number.isFinite(degrees)).toBe(true);
    // The art points north before it is rotated. Rotating (0, -1) clockwise by the attribute must
    // land on the travelled direction.
    const a = (degrees * Math.PI) / 180;
    const drawn = Math.atan2(-Math.cos(a), Math.sin(a));
    const gap = Math.abs(Math.atan2(Math.sin(drawn - travelled), Math.cos(drawn - travelled)));
    expect(gap).toBeLessThan(0.2);
  });

  test("a click on it reaches the world, and nothing in it is in the tab order", async ({ page }) => {
    await ready(page, INLAND);

    const result = await page.evaluate(() => {
      const map = document.querySelector("[data-minimap-map]")!.getBoundingClientRect();
      const x = map.left + map.width / 2;
      const y = map.top + map.height / 2;
      const panel = document.querySelector("[data-minimap]")!;
      return {
        // pointer-events: none means the point in the middle of the map belongs to whatever is
        // under it, which is the renderer's canvas.
        under: (document.elementFromPoint(x, y) as HTMLElement)?.tagName ?? null,
        insidePanel: panel.contains(document.elementFromPoint(x, y)),
        focusable: panel.querySelectorAll("a, button, input, select, textarea, [tabindex]").length,
        x,
        y,
      };
    });
    expect(result.focusable).toBe(0);
    expect(result.insidePanel).toBe(false);
    expect(result.under).toBe("CANVAS");

    // Clicking the middle of the map focuses the RENDERER'S CANVAS, which is the whole point: the
    // click went through, and it is the world that ends up owning the keyboard, not the panel. An
    // earlier draft of this test asserted that focus did not move at all, which was wrong about
    // what "does not steal focus" means here and would have failed a correct implementation.
    await page.mouse.click(result.x, result.y);
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? null,
        inPanel: document.querySelector("[data-minimap]")!.contains(el),
      };
    });
    expect(focused.tag).toBe("CANVAS");
    expect(focused.inPanel).toBe(false);

    // And nothing in it can be reached with the tab key either, from anywhere on the page.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const landed = await page.evaluate(() =>
        document.querySelector("[data-minimap]")!.contains(document.activeElement),
      );
      expect(landed).toBe(false);
    }
  });

  test("the page still has exactly one canvas, and it is the renderer's", async ({ page }) => {
    // The page's single canvas is the WebGL context PlanetWorld shares with the landing globe, and
    // every browser test on this route reaches for it by tag. An earlier draft of the panel drew
    // its two pictures into canvas elements, which turned `locator("canvas")` into three elements
    // and failed tests/e2e/slice.spec.ts at "strict mode violation: locator('canvas') resolved to
    // 3 elements". They are <img> now. This is the guard that keeps them that way.
    await ready(page, DEMO);
    const canvases = await page.evaluate(() =>
      [...document.querySelectorAll("canvas")].map((c) => c.getAttribute("data-engine")),
    );
    expect(canvases).toEqual(["three.js r169"]);
    // And the two pictures really are on the page, painted, rather than merely absent.
    const images = await page.evaluate(() =>
      [...document.querySelectorAll("[data-minimap] img")].map((i) => ({
        src: (i as HTMLImageElement).src.slice(0, 22),
        wide: (i as HTMLImageElement).naturalWidth,
      })),
    );
    expect(images.length).toBe(2);
    for (const image of images) {
      expect(image.src).toBe("data:image/png;base64,");
      expect(image.wide).toBeGreaterThan(64);
    }
  });

  test("it costs almost nothing a frame, and the ground is painted once", async ({ page }) => {
    await ready(page, DEMO);
    // Let it run long enough for the mean to be a mean rather than a first frame.
    await page.waitForTimeout(3000);
    const stats = await page.evaluate(() => (window as any).__minimap);
    expect(stats.frames).toBeGreaterThan(60);
    // The whole point of painting once: no per-frame budget of any size is spent on the image.
    // A map that re-rendered the world from a second camera would not fit here at all; C16's
    // budget is already exceeded by the ground alone.
    expect(stats.meanUpdateUs).toBeLessThan(250);
    expect(stats.buildMs).toBeLessThan(120);
    console.log(
      `[minimap] build ${stats.buildMs.toFixed(1)} ms (ground ${stats.groundMs.toFixed(1)}, planet ${stats.planetMs.toFixed(1)}, encode ${stats.encodeMs.toFixed(1)}), ` +
        `update ${stats.meanUpdateUs.toFixed(1)} us/frame over ${stats.frames} frames`,
    );
  });
});
