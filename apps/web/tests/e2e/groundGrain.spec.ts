/**
 * The half of the A28 guard that tests/groundGrain.test.mts cannot be: the SHADER, on a real GPU,
 * against the TypeScript twin, pixel for pixel.
 *
 * groundGrain.ts states the same arithmetic twice, once as GLSL for the fragment and once as
 * `grainAt` / `grainedColour` for a node test, and builds both from the same constants. That the
 * numbers match is checked there; that the two FORMS match cannot be, and a twin that had drifted
 * from the shader would pass every assertion in that file while the ground drew something else
 * entirely. This is the file that stops that.
 *
 * THE SCENE IS A RULER, not a screenshot of the world. One flat plane, one known vertex colour, one
 * known grain axis, the SHIPPED `patchGroundGrain` on the material, an orthographic camera looking
 * straight down and a white ambient at PI, which is exactly what a Lambert BRDF's 1/PI cancels, so
 * every pixel comes back as its own albedo. Under an orthographic camera over a plane the metres of
 * ground one pixel covers is a constant this file chooses, which is the one thing a scene
 * measurement could never give: the comparison needs no estimate of `fwidth` at all when the pixels
 * are small enough that every octave is at full strength, and that is how the near render is set up.
 */
import { expect, test } from "@playwright/test";

const ROUTE = "/parcel/8482589ffffffff";

/** The pixel sizes the two renders use: everything on, and everything faded out. */
const NEAR_MPP = 0.02;
const FAR_MPP = 4;
const SIDE = 256;

test.describe("A28 ground grain", () => {
  /**
   * The shipped ground, not a plane this file built.
   *
   * The test below renders its own PlaneGeometry with its own material and calls patchGroundGrain
   * itself, which pins the shader against its TypeScript twin and is worth doing. But it uses the
   * app for a GL context and nothing else: deleting the two lines in terrainChunks.ts that put the
   * grain on the REAL ground left all 106 web tests, that spec, the goldens and the relief suite
   * green on a world drawing no grain at all. This asks the ground the app actually built.
   *
   * It drives the demo URL rather than the bare parcel because only that route exposes a handle to
   * the world, and the grain is the same on both.
   */
  test("the ground the app built carries the grain, not just a plane this file patched", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/parcel/847b949ffffffff?stations=slice", { waitUntil: "domcontentloaded" });
    const button = page.getByRole("button", { name: /let it watch/i });
    await button.waitFor({ timeout: 60_000 });
    for (let i = 0; i < 40; i++) {
      await button.click().catch(() => {});
      if (await page.evaluate(() => localStorage.getItem("echo.consent"))) break;
      await page.waitForTimeout(250);
    }
    await page.locator("[data-phase='ready']").waitFor({ timeout: 180_000 });

    const shipped = await page.evaluate(() => {
      const found = { chunks: 0, withAxis: 0, patched: 0, materials: 0 };
      const seen = new Set<unknown>();
      const visit = (o: any): void => {
        if (typeof o?.name === "string" && o.name.startsWith("terrain:") && o.name !== "terrain:water") {
          found.chunks++;
          if (o.geometry?.getAttribute?.("grainAxis")) found.withAxis++;
          const m = o.material;
          if (m && !seen.has(m)) {
            seen.add(m);
            found.materials++;
            if (m.userData?.groundGrain === true) found.patched++;
          }
        }
        for (const c of o?.children ?? []) visit(c);
      };
      const scene = (window as any).__demo?.world?.scene;
      if (scene) visit(scene);
      return found;
    });
    expect(shipped.chunks, "no terrain chunks in the shipped scene, so nothing was checked").toBeGreaterThan(0);
    expect(shipped.withAxis, "a terrain chunk the app drew carries no grainAxis attribute").toBe(shipped.chunks);
    expect(shipped.materials, "the terrain chunks share no material to check").toBeGreaterThan(0);
    expect(shipped.patched, "the ground material the app drew was never given the grain patch").toBe(shipped.materials);
  });

  test("the fragment shader draws exactly what the TypeScript twin says it does", async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    const button = page.getByRole("button", { name: /let it watch/i });
    await button.waitFor({ timeout: 60_000 });
    // The consent click has to reach React, not just a DOM node: this project has been bitten by a
    // click that landed before hydration, did not throw, and did nothing.
    for (let i = 0; i < 40; i++) {
      await button.click().catch(() => {});
      if (await page.evaluate(() => localStorage.getItem("echo.consent"))) break;
      await page.waitForTimeout(250);
    }
    expect(await page.evaluate(() => localStorage.getItem("echo.consent"))).toBeTruthy();
    await page.locator("[data-phase='ready']").waitFor({ timeout: 120_000 });

    const result = await page.evaluate(
      async ({ nearMpp, farMpp, side }) => {
        // three and groundGrain, out of the app's own bundle: the shipped modules, not copies.
        let probe = 0;
        const moduleWhere = (test: (e: Record<string, unknown>) => boolean): Record<string, unknown> | null => {
          let req: { c: Record<string, { exports?: Record<string, unknown> }> } | null = null;
          (self as unknown as { webpackChunk_N_E: unknown[] }).webpackChunk_N_E.push([
            [`__a28_${probe++}`],
            {},
            (r: unknown) => (req = r as never),
          ] as never);
          if (!req) return null;
          for (const id in (req as { c: Record<string, { exports?: Record<string, unknown> }> }).c) {
            const e = (req as { c: Record<string, { exports?: Record<string, unknown> }> }).c[id]?.exports;
            if (e && test(e)) return e;
          }
          return null;
        };
        const THREE = moduleWhere((e) => Boolean(e.Raycaster && e.Vector3 && e.REVISION)) as never as typeof import("three");
        const grain = moduleWhere(
          (e) => typeof e.GRAIN_SWING === "number" && typeof e.grainAt === "function" && typeof e.patchGroundGrain === "function",
        ) as never as typeof import("../../src/game/world/groundGrain");
        if (!THREE || !grain) return { error: "could not reach three or groundGrain in the bundle" };

        const findRenderer = (): import("three").WebGLRenderer | null => {
          const node = document.querySelector("[data-phase]");
          if (!node) return null;
          const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
          let fiber = (node as unknown as Record<string, { return?: unknown; memoizedState?: unknown }>)[key!];
          for (let d = 0; fiber && d < 80; d++, fiber = (fiber as { return?: never }).return!) {
            let hook = (fiber as { memoizedState?: { memoizedState?: unknown; next?: unknown } }).memoizedState;
            for (let i = 0; hook && i < 60; i++, hook = hook.next as never) {
              const s = (hook as { memoizedState?: { current?: { context?: unknown; addLayer?: unknown } } }).memoizedState;
              if (s && typeof s === "object" && "current" in s && s.current && typeof s.current.context === "function" && typeof s.current.addLayer === "function") {
                return (s.current.context() as { renderer: import("three").WebGLRenderer }).renderer;
              }
            }
          }
          return null;
        };
        const renderer = findRenderer();
        if (!renderer) return { error: "could not reach the world's renderer" };

        // A plane on the ground plane, its own colour and its own grain axis, both constant.
        const BASE: [number, number, number] = [0.14, 0.085, 0.037];
        const AXIS = grain.grainAxis("rainforest");
        const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
        geometry.rotateX(-Math.PI / 2);
        const count = geometry.getAttribute("position").count;
        const colour = new Float32Array(count * 3);
        const axis = new Int8Array(count * 3);
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < 3; c++) {
            colour[i * 3 + c] = BASE[c]!;
            axis[i * 3 + c] = Math.round(AXIS[c]! * 127);
          }
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colour, 3));
        geometry.setAttribute("grainAxis", new THREE.BufferAttribute(axis, 3, true));
        const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        grain.patchGroundGrain(material);
        const mesh = new THREE.Mesh(geometry, material);
        const scene = new THREE.Scene();
        scene.add(mesh);
        scene.add(new THREE.AmbientLight(0xffffff, Math.PI));

        const target = new THREE.WebGLRenderTarget(side, side, { type: THREE.UnsignedByteType });
        target.texture.colorSpace = THREE.SRGBColorSpace;
        const previousTarget = renderer.getRenderTarget();
        const previousTone = renderer.toneMapping;
        renderer.toneMapping = THREE.NoToneMapping;

        const shoot = (mpp: number) => {
          // The plane is exactly as wide as the frame, so one pixel is `mpp` metres of ground and
          // the world position of pixel (px, py) is known to the millimetre.
          const span = mpp * side;
          mesh.scale.set(span, 1, span);
          mesh.position.set(0, 0, 0);
          const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.1, 100);
          camera.position.set(0, 20, 0);
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          const buf = new Uint8Array(side * side * 4);
          renderer.readRenderTargetPixels(target, 0, 0, side, side, buf);
          return buf;
        };
        const near = shoot(nearMpp);
        const far = shoot(farMpp);
        renderer.setRenderTarget(previousTarget);
        renderer.toneMapping = previousTone;
        target.dispose();
        geometry.dispose();
        material.dispose();

        const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
        // The axis the shader saw is the Int8 attribute's, not the float: quantise the same way.
        const quantised = AXIS.map((v) => Math.round(v * 127) / 127) as unknown as readonly [number, number, number];

        const compare = (buf: Uint8Array, mpp: number, twinMpp: number) => {
          let worst = 0;
          let n = 0;
          let sum = 0;
          const span = mpp * side;
          const spread: number[] = [];
          for (let py = 8; py < side - 8; py += 3) {
            for (let px = 8; px < side - 8; px += 3) {
              // readRenderTargetPixels is bottom-up; the plane spans [-span/2, span/2] in x and z,
              // and the camera looks down -y with +z toward the bottom of the image.
              const x = (px + 0.5 - side / 2) * mpp;
              const z = -(py + 0.5 - side / 2) * mpp;
              const m = grain.grainAt(x, z, twinMpp);
              const want = grain.grainedColour(BASE, quantised, m);
              const o = (py * side + px) * 4;
              for (let c = 0; c < 3; c++) {
                const d = Math.abs(buf[o + c]! - toSrgb(want[c]!));
                worst = Math.max(worst, d);
                sum += d;
                n++;
              }
              spread.push(0.2126 * buf[o]! + 0.7152 * buf[o + 1]! + 0.0722 * buf[o + 2]!);
            }
          }
          const mean = spread.reduce((s, v) => s + v, 0) / spread.length;
          const sd = Math.sqrt(spread.reduce((s, v) => s + (v - mean) * (v - mean), 0) / spread.length);
          return { worst, mean: sum / n, samples: n / 3, pixelMean: mean, pixelSd: sd };
        };

        const flat = grain.grainedColour(BASE, quantised, 0).map(toSrgb);
        return {
          // Every octave at full strength: the twin needs no `fwidth` estimate here, because any
          // pixel size under the finest octave's cut gives the same answer.
          near: compare(near, nearMpp, nearMpp),
          // Every octave faded out: the shader must be drawing the ungrained colour exactly.
          far: compare(far, farMpp, farMpp),
          flat,
        };
      },
      { nearMpp: NEAR_MPP, farMpp: FAR_MPP, side: SIDE },
    );

    expect(result.error, result.error ?? "").toBeUndefined();
    const near = result.near!;
    const far = result.far!;

    // The whole point. Every sampled fragment of a mottled floor, against the twin, in sRGB levels.
    expect(
      near.worst,
      `the shader and the TypeScript twin disagree by up to ${near.worst.toFixed(2)} levels of 255 over ${near.samples} fragments (mean ${near.mean.toFixed(3)}). One of them is not what groundGrain.ts's header describes, and every node test of the grain is measuring the wrong one.`,
    ).toBeLessThan(2.5);
    expect(near.mean).toBeLessThan(0.8);

    // And it is not agreeing because both draw nothing: the near render has to be mottled.
    expect(
      near.pixelSd,
      `the near render's spread is ${near.pixelSd.toFixed(3)} levels, so the shader drew a flat plane and the agreement above is vacuous`,
    ).toBeGreaterThan(2);

    // The far render is the fade's own end: every octave under GRAIN_CUT_PX pixels a period, so the
    // ground must come back at exactly the colour it would have with no grain at all.
    expect(
      far.pixelSd,
      `at ${FAR_MPP} m of ground per pixel the floor still has a spread of ${far.pixelSd.toFixed(3)} levels; the fade is not switching the octaves off and the far ground will shimmer as the camera eases`,
    ).toBeLessThan(0.6);
    const flatLuma = 0.2126 * result.flat![0]! + 0.7152 * result.flat![1]! + 0.0722 * result.flat![2]!;
    expect(Math.abs(far.pixelMean - flatLuma)).toBeLessThan(1.5);
  });
});
