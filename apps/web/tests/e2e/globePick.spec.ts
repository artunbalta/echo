/**
 * The landing's one promise, as a measurement: the parcel it NAMES under your pointer is the
 * parcel it DRAWS under your pointer.
 *
 * WHY IT EXISTS. Picking raycast an invisible unit sphere while the planet was drawn displaced by
 * relief, so the two hits on one ray were two different points on the globe. Measured over 3,041
 * live rays that came to a median 0.264 and a p95 2.177 degrees on a resolution 4 parcel 0.40
 * degrees wide: 77.8% of pixels showing land were answered with some other cell, and 4.9% of
 * pixels showing SEA were offered as an assignable parcel. The page told people savanna was open
 * water, and the marker drawn beside the answer was lifted 1.5 km into the air, which shifted it
 * back over the land the cursor was on and made the wrong answer look right.
 *
 * WHAT IT MEASURES, AND WHAT IT REFUSES TO. Three instruments, and none of them is the pick:
 *
 *   THE PAGE'S ANSWER is read out of the card the page puts up after a real click at a real screen
 *   position. Not a call into PlanetGlobe: the shipped chain is pointermove, parcelAt, React state,
 *   copy, and an href somebody presses, so that is the chain under test.
 *
 *   THE GROUND is taken by raycasting the terrain mesh the GPU actually drew, through the page's
 *   own camera, in the page. `window.__globeProbe` is a dev-build read handle that exists for this
 *   and is not in the production bundle. This owes nothing to raycastGlobe: it hits triangles.
 *
 *   THE LIBRARY is @echo/planet in this process, asked about the coordinates the page printed.
 *
 * The planet is a function of a seed and the seed is not written down here: the world's parameters
 * come from the same /api/planet/world the hero itself reads, so this cannot pass against a planet
 * nobody ships.
 *
 * THE TOLERANCE IS DERIVED, NOT DIALLED. Three terms, each one measurable on its own:
 *   - the drawn mesh is not the continuous surface it samples. Its flat triangles stand above or
 *     below that surface, and for THIS ray the difference is `|psi(drawn radius) - psi(surface
 *     radius))|`, where `psi(R) = acos(b/R)` is where a ray passing `b` from the centre sits at
 *     radius R. That is computed per sample from the hit itself, and doubled, because the field
 *     also moves across the gap being bounded.
 *   - the card prints coordinates with toFixed(2), so the point it names is quantised to a
 *     0.01 degree grid: up to 0.00708 degrees from the point it means.
 *   - a thousandth of a degree for the march's own bisection, which stops at 1e-6 radians.
 * Nothing in that list is a number chosen to make the test pass; the sum is about a fiftieth of a
 * parcel, and the bug this file was written for missed by five to five hundred times it.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  createTerrain,
  globeRadiusAt,
  landFractionOfCell,
  latLngToVec3,
  vec3ToLatLng,
  type Calibration,
} from "@echo/planet";
import { cellToBoundary, cellToLatLng, cellToParent, getResolution, latLngToCell } from "h3-js";

/** Half the diagonal of the 0.01 degree grid the card's toFixed(2) rounds coordinates onto. */
const PRINT_HALF_STEP_DEG = Math.SQRT1_2 * 0.01;
/** The bisection in raycastGlobe stops at 1e-6 radians, which is 5.7e-5 degrees. Rounded up. */
const SOLVER_SLACK_DEG = 0.001;

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The angle between two unit directions, in degrees. */
function angleBetween(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return degrees(Math.acos(dot));
}

/** How far a point on the sphere is from the nearest edge of a cell, in degrees of arc. */
function degreesInsideCell(cell: string, lat: number, lng: number): number {
  const point = latLngToVec3(lat, lng);
  let nearest = Infinity;
  const ring = cellToBoundary(cell).map(([la, ln]) => latLngToVec3(la, ln));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    // The plane of the great circle through a and b; the distance to it is the angle to the edge.
    const nx = a[1] * b[2] - a[2] * b[1];
    const ny = a[2] * b[0] - a[0] * b[2];
    const nz = a[0] * b[1] - a[1] * b[0];
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    const sin = (point[0] * nx + point[1] * ny + point[2] * nz) / len;
    nearest = Math.min(nearest, degrees(Math.asin(Math.min(1, Math.abs(sin)))));
  }
  return nearest;
}

interface DiskRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the drawn planet is on the screen, by walking outward from its centre until the terrain
 * mesh stops being hit. Sample positions are then fractions of the planet rather than pixels of a
 * viewport. The radius is the SMALLEST over sixteen headings, because a planet drawn with relief
 * has a ragged silhouette: on the shipped hero it measures 351 px one way and 361 another, and a
 * lattice laid out on the larger one puts its outer ring in space.
 */
async function findDisk(page: Page): Promise<{ cx: number; cy: number; radius: number; largest: number; rect: DiskRect }> {
  return page.evaluate(() => {
    const probe = (window as any).__globeProbe;
    const THREE = (window as any).__THREE;
    const canvas = probe.host.querySelector("canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const centre = probe.planet.position.clone().project(probe.camera);
    const cx = rect.left + ((centre.x + 1) / 2) * rect.width;
    const cy = rect.top + ((1 - centre.y) / 2) * rect.height;
    const mesh = probe.planet.children.find((c: any) => c.name === "globe:terrain");
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hits = (x: number, y: number) => {
      ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, probe.camera);
      return ray.intersectObject(mesh, false).length > 0;
    };
    let smallest = Infinity;
    let largest = 0;
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2;
      let lo = 0;
      let hi = Math.min(rect.width, rect.height);
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (hits(cx + Math.cos(angle) * mid, cy + Math.sin(angle) * mid)) lo = mid;
        else hi = mid;
      }
      smallest = Math.min(smallest, lo);
      largest = Math.max(largest, lo);
    }
    return { cx, cy, radius: smallest, largest, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  });
}

/**
 * The ground the page DRAWS at a list of screen positions: three's own raycaster, the page's own
 * camera, the terrain mesh the GPU was handed. Nothing here calls the pick.
 */
async function drawnAt(
  page: Page,
  points: Array<{ x: number; y: number }>,
  rect: DiskRect,
): Promise<Array<{ direction: [number, number, number]; radius: number; b: number } | null>> {
  return page.evaluate(
    ({ points, rect }: { points: Array<{ x: number; y: number }>; rect: DiskRect }) => {
      const probe = (window as any).__globeProbe;
      const THREE = (window as any).__THREE;
      const mesh = probe.planet.children.find((c: any) => c.name === "globe:terrain");
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const inverse = new THREE.Matrix4().copy(probe.planet.matrixWorld).invert();
      return points.map(({ x, y }) => {
        ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(ndc, probe.camera);
        const hit = ray.intersectObject(mesh, false)[0];
        if (!hit) return null;
        const local = hit.point.clone().applyMatrix4(inverse);
        const origin = ray.ray.origin.clone().applyMatrix4(inverse);
        const along = ray.ray.origin.clone().add(ray.ray.direction).applyMatrix4(inverse).sub(origin).normalize();
        const closest = origin.clone().addScaledVector(along, -origin.dot(along));
        return {
          direction: local.clone().normalize().toArray() as [number, number, number],
          radius: local.length(),
          b: closest.length(),
        };
      });
    },
    { points, rect },
  );
}

test.use({ viewport: { width: 1440, height: 900 } });

test("the parcel the landing names is the parcel it draws under the pointer", async ({ page, request }) => {
  test.setTimeout(300_000);

  const world = (await (await request.get("/api/planet/world")).json()) as {
    seed: string;
    seaLevel: number;
    peakElevation: number;
    startResolution: number;
    minLandFraction: number;
    commonsResolution: number;
    commons: Record<string, string>;
  };
  const status = (await (await request.get("/api/planet/status")).json()) as { status?: { resolution: number } };
  const resolution = status.status?.resolution ?? world.startResolution;
  const field = createTerrain(world.seed);
  const calibration: Calibration = {
    seaLevel: world.seaLevel,
    peakElevation: world.peakElevation,
    landFraction: 0.6,
  };

  // Before the page loads: the hero reads prefers-reduced-motion to decide whether to spin, and a
  // turning planet has no stable answer for any pixel. Set here rather than in the config so this
  // file says out loud what it depends on.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const probe = (window as any).__globeProbe;
      return !!probe && probe.planet.children.some((c: any) => c.name === "globe:terrain");
    },
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1200);

  // The planet has to be still, or the pixel and the answer belong to different frames. Reduced
  // motion is what stops the idle spin; this checks it actually did rather than assuming it.
  const before = await page.evaluate(() => [...(window as any).__globeProbe.planet.matrixWorld.elements] as number[]);
  await page.waitForTimeout(600);
  const still = await page.evaluate(() => [...(window as any).__globeProbe.planet.matrixWorld.elements] as number[]);
  expect(still, "the planet is still turning, so no pixel has a stable answer").toEqual(before);

  const disk = await findDisk(page);
  expect(disk.radius, "the planet is not on the screen").toBeGreaterThan(100);

  // A fixed lattice over the disk, in units of its own radius, so the same points are tested on any
  // viewport. Points the page's own copy sits on top of are dropped: a click there never reaches
  // the globe, and a sample that silently does nothing is worse than no sample.
  const wanted: Array<{ x: number; y: number; f: number }> = [];
  for (let j = -4; j <= 4; j++) {
    for (let i = -4; i <= 4; i++) {
      const fx = i / 4.2;
      const fy = j / 4.2;
      const f = Math.hypot(fx, fy);
      if (f > 0.96) continue;
      wanted.push({ x: Math.round(disk.cx + fx * disk.radius), y: Math.round(disk.cy + fy * disk.radius), f });
    }
  }
  const samples = await page.evaluate((points: Array<{ x: number; y: number; f: number }>) => {
    const probe = (window as any).__globeProbe;
    return points.filter((p) => probe.host.contains(document.elementFromPoint(p.x, p.y)));
  }, wanted);
  expect(samples.length, "every sample pixel is under the page's own copy").toBeGreaterThan(20);

  // What the page DRAWS at each of them. Triangles, through the page's own camera.
  const drawn = await drawnAt(page, samples, disk.rect);

  // What the page SAYS about each of them: a real click at that pixel, then its own card.
  const said: Array<{ text: string; href: string | null } | null> = [];
  for (const point of samples) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(50);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(120);
    said.push(
      await page.evaluate(() => {
        const label = [...document.querySelectorAll("p")].find((p) => /^(A parcel|Open water), at /.test(p.textContent ?? ""));
        const commons = [...document.querySelectorAll("p")].find((p) => /One of twelve public commons/.test(p.textContent ?? ""));
        const card = (label ?? commons)?.closest("div");
        if (!card) return null;
        return { text: card.innerText, href: card.querySelector("a[href^='/parcel/']")?.getAttribute("href") ?? null };
      }),
    );
    const dismiss = page.getByRole("button", { name: /Keep looking|Point somewhere else/ });
    if (await dismiss.count()) await dismiss.first().click();
    await page.waitForTimeout(60);
  }

  const after = await page.evaluate(() => [...(window as any).__globeProbe.planet.matrixWorld.elements] as number[]);
  expect(after, "the planet ended the run somewhere else, so the drawn ground was read against another frame").toEqual(before);

  // ── the comparison ──────────────────────────────────────────────────────────
  const gaps: number[] = [];
  let commons = 0;
  let landAnswers = 0;
  let waterAnswers = 0;
  let cellChecked = 0;
  const failures: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const point = samples[i]!;
    const ground = drawn[i];
    const card = said[i];
    const where = `pixel (${point.x}, ${point.y}), ${(point.f * 100).toFixed(0)}% of the way out`;
    // Collected rather than thrown, all of them, because the first failure is rarely the clearest
    // one: a pick that has come off the drawn surface reports nothing at the limb, the wrong cell
    // in the middle and the wrong verdict on water, and one line of that tells nobody which.
    if (!ground) failures.push(`${where}: nothing is drawn there, so the sample lattice is wrong`);
    if (!card) failures.push(`${where}: the page answered a click with no card at all`);
    if (!ground || !card) continue;
    if (/One of twelve public commons/.test(card.text)) {
      commons++;
      continue;
    }

    const printed = /at (-?\d+\.\d+), (-?\d+\.\d+)/.exec(card.text);
    if (!printed) {
      failures.push(`${where}: the card named no coordinates: ${JSON.stringify(card.text)}`);
      continue;
    }
    const lat = Number(printed[1]);
    const lng = Number(printed[2]);
    const says = /Open water/.test(card.text) ? "water" : "parcel";
    if (says === "water") waterAnswers++;
    else landAnswers++;

    // 1. The point the page names is the point it draws, to within what the mesh itself is worth.
    const gap = angleBetween(latLngToVec3(lat, lng), ground.direction);
    gaps.push(gap);
    const psi = (radius: number) => Math.acos(Math.min(1, ground.b / radius));
    const meshBound = degrees(Math.abs(psi(ground.radius) - psi(globeRadiusAt(field, calibration, ground.direction))));
    const tolerance = meshBound * 2 + PRINT_HALF_STEP_DEG + SOLVER_SLACK_DEG;
    if (!(gap <= tolerance)) {
      failures.push(
        `${where}: the card says ${lat}, ${lng} and the ground drawn there is ` +
          `${vec3ToLatLng(ground.direction[0], ground.direction[1], ground.direction[2]).map((v) => v.toFixed(4)).join(", ")}, ` +
          `${gap.toFixed(4)} degrees apart against a tolerance of ${tolerance.toFixed(4)} (mesh ${meshBound.toFixed(4)})`,
      );
    }

    // 2. The cell it names contains the coordinates it printed.
    const cellFromPrinted = latLngToCell(lat, lng, resolution);
    if (card.href) {
      const named = card.href.replace("/parcel/", "");
      const namedResolution = getResolution(named);
      const containing = namedResolution === resolution ? cellFromPrinted : cellToParent(cellFromPrinted, namedResolution);
      if (named !== containing) failures.push(`${where}: the card offers ${named} but names a point in ${containing}`);
    }

    // 3. The land it claims is the land the library measures in that same cell, and the verdict
    //    the copy gives follows from it. This is the sentence the complaint was about.
    const fraction = landFractionOfCell(field, calibration.seaLevel, cellFromPrinted, 2);
    const percent = /(\d+)% (?:of it is dry land|land)/.exec(card.text);
    if (!percent) failures.push(`${where}: the card printed no land percentage`);
    if (percent && Number(percent[1]) !== Math.round(fraction * 100)) {
      failures.push(`${where}: the card says ${percent[1]}% land in ${cellFromPrinted}, the library says ${Math.round(fraction * 100)}%`);
    }
    const shouldBeWater = fraction < world.minLandFraction;
    if (shouldBeWater !== (says === "water")) {
      failures.push(`${where}: the card calls it ${says} and ${cellFromPrinted} is ${(fraction * 100).toFixed(1)}% land`);
    }

    // 4. Where the drawn point is comfortably inside the cell the page named, the two must be the
    //    same cell outright. Skipped within the mesh's own error of a boundary, because there the
    //    two answers may legitimately differ and a flake would teach nobody anything.
    const drawnLatLng = vec3ToLatLng(ground.direction[0], ground.direction[1], ground.direction[2]);
    const drawnCell = latLngToCell(drawnLatLng[0], drawnLatLng[1], resolution);
    if (degreesInsideCell(drawnCell, drawnLatLng[0], drawnLatLng[1]) > tolerance) {
      cellChecked++;
      if (drawnCell !== cellFromPrinted) {
        failures.push(`${where}: the page answered ${cellFromPrinted} and the ground drawn there is ${drawnCell}`);
      }
    }
  }

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  console.log(
    `globe pick: ${gaps.length} pixels, ${landAnswers} answered as parcels and ${waterAnswers} as water, ` +
      `${commons} commons skipped; gap median ${median.toFixed(4)} p95 ${gaps[Math.floor(gaps.length * 0.95)]!.toFixed(4)} ` +
      `max ${gaps[gaps.length - 1]!.toFixed(4)} degrees; ${cellChecked} cells compared outright`,
  );

  expect(failures.length, `${failures.length} of ${samples.length} sample pixels disagree:\n${failures.slice(0, 12).join("\n")}`).toBe(0);
  expect(gaps.length, "no sample produced a comparable answer").toBeGreaterThan(15);
  // The lattice has to keep meeting both kinds of ground, or this stops being a test of the
  // sentence people complained about.
  expect(landAnswers, "no sample landed on ground the page would give away").toBeGreaterThan(0);
  expect(waterAnswers, "no sample landed on water, so the water verdict was never checked").toBeGreaterThan(0);
  expect(cellChecked, "every sample sat on a cell boundary, so no cell was compared outright").toBeGreaterThan(gaps.length / 2);
  // A quarter of a hundredth of a parcel. The failure this file exists to catch measured 0.264.
  expect(median, "the answers have drifted off the ground they name").toBeLessThan(0.01);
});


/**
 * The two things drawn BESIDE the answer, which are what made the wrong answer look right.
 *
 * The hexagon the page outlines under the pointer was lifted 0.0075 of the radius off the planet,
 * 1.5 km, and the circle the inset draws its line to was projected off a sphere the height of the
 * highest peak on the planet whatever the cell's own height. Both are seen from off to one side, so
 * both landed OUTWARD from the middle of the disk, which is back toward the cursor and onto the
 * land beside the answer. Measured on the shipped page the circle sat 11.0 px from its cell at rest
 * and 21.0 at worst, and in one captured frame it was off the planet in black space.
 *
 * This casts a ray back through each drawn thing and asks the drawn ground what is under it.
 */
test("the hexagon and the arrow are over the ground the card names", async ({ page, request }) => {
  test.setTimeout(300_000);
  const world = (await (await request.get("/api/planet/world")).json()) as {
    seed: string;
    seaLevel: number;
    peakElevation: number;
    startResolution: number;
  };
  const status = (await (await request.get("/api/planet/status")).json()) as { status?: { resolution: number } };
  const resolution = status.status?.resolution ?? world.startResolution;
  const field = createTerrain(world.seed);
  const calibration: Calibration = { seaLevel: world.seaLevel, peakElevation: world.peakElevation, landFraction: 0.6 };

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const probe = (window as any).__globeProbe;
      return !!probe && probe.planet.children.some((c: any) => c.name === "globe:terrain");
    },
    null,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1200);
  const disk = await findDisk(page);

  // Two thirds of the way to the silhouette, where a parcel is still two pixels wide and the old
  // lift was already costing most of one.
  const at = { x: Math.round(disk.cx + disk.radius * 0.66), y: Math.round(disk.cy - disk.radius * 0.24) };
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(250);

  // What the page DREW: every vertex of the hexagon it put under the pointer, and the ground the
  // camera sees through each one. Both come out of the scene; neither goes near the pick.
  const marker = await page.evaluate(
    ({ rect }: { rect: { left: number; top: number; width: number; height: number } }) => {
      const probe = (window as any).__globeProbe;
      const THREE = (window as any).__THREE;
      const mesh = probe.planet.children.find((c: any) => c.name === "globe:terrain");
      let line: any = null;
      probe.planet.traverse((o: any) => {
        if (o.type === "LineSegments" && o.geometry?.getAttribute("position")) line = o;
      });
      if (!line) return null;
      const position = line.geometry.getAttribute("position");
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const world = new THREE.Vector3();
      const inverse = new THREE.Matrix4().copy(probe.planet.matrixWorld).invert();
      const seen = new Set<string>();
      const out: Array<{ vertex: [number, number, number]; radius: number; ground: [number, number, number] | null; groundRadius: number; b: number }> = [];
      for (let i = 0; i < position.count; i++) {
        const local = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        const key = `${local.x.toFixed(6)},${local.y.toFixed(6)},${local.z.toFixed(6)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        world.copy(local).applyMatrix4(probe.planet.matrixWorld);
        const projected = world.clone().project(probe.camera);
        const x = rect.left + ((projected.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - projected.y) / 2) * rect.height;
        ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(ndc, probe.camera);
        const hit = ray.intersectObject(mesh, false)[0];
        const origin = ray.ray.origin.clone().applyMatrix4(inverse);
        const along = ray.ray.origin.clone().add(ray.ray.direction).applyMatrix4(inverse).sub(origin).normalize();
        const closest = origin.clone().addScaledVector(along, -origin.dot(along));
        const groundLocal = hit ? hit.point.clone().applyMatrix4(inverse) : null;
        out.push({
          vertex: local.clone().normalize().toArray() as [number, number, number],
          radius: local.length(),
          ground: groundLocal ? (groundLocal.clone().normalize().toArray() as [number, number, number]) : null,
          groundRadius: groundLocal ? groundLocal.length() : 0,
          b: closest.length(),
        });
      }
      return out;
    },
    { rect: disk.rect },
  );
  expect(marker, "the pointer produced no hexagon on the globe").not.toBeNull();
  expect(marker!.length, "the hexagon has too few corners to be a hexagon").toBeGreaterThan(5);

  // Where the inset's line ends: the circle the page draws, read out of its own SVG.
  const arrow = await page.evaluate(() => {
    const circle = document.querySelector("svg circle[r='7']") as SVGCircleElement | null;
    if (!circle) return null;
    const box = (circle.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    return { x: box.left + Number(circle.getAttribute("cx")), y: box.top + Number(circle.getAttribute("cy")) };
  });
  expect(arrow, "the inset drew no line back to the planet").not.toBeNull();
  const [arrowGround] = await drawnAt(page, [arrow!], disk.rect);

  // And what the page SAYS, from the same pixel.
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(200);
  const card = await page.evaluate(() => {
    const label = [...document.querySelectorAll("p")].find((p) => /^(A parcel|Open water), at /.test(p.textContent ?? ""));
    const box = label?.closest("div");
    return box ? { text: box.innerText, href: box.querySelector("a[href^='/parcel/']")?.getAttribute("href") ?? null } : null;
  });
  expect(card, "the click produced no card, so there is nothing to compare against").not.toBeNull();
  const printed = /at (-?\d+\.\d+), (-?\d+\.\d+)/.exec(card!.text)!;
  const cell = latLngToCell(Number(printed[1]), Number(printed[2]), resolution);

  // A parcel's own width, in degrees, off its own boundary rather than out of a table.
  const ring = cellToBoundary(cell).map(([la, ln]) => latLngToVec3(la, ln));
  const centre = latLngToVec3(...(cellToLatLng(cell) as [number, number]));
  const parcelDeg = 2 * Math.max(...ring.map((p) => angleBetween(p, centre)));

  // 1. Every corner of the drawn hexagon is over the ground it is drawn on. The lift is what this
  //    costs and the lift is a length on a planet: at the old 0.0075 this ran 0.35 to 2.5 degrees.
  let worst = 0;
  for (const corner of marker!) {
    expect(corner.ground, "a corner of the hexagon is drawn over nothing at all").not.toBeNull();
    if (!corner.ground) continue;
    worst = Math.max(worst, angleBetween(corner.vertex, corner.ground));
  }
  console.log(
    `globe marker: hexagon ${parcelDeg.toFixed(3)} degrees across, corners stand ${worst.toFixed(4)} degrees ` +
      `off their ground (${(worst / parcelDeg).toFixed(2)} parcels)`,
  );
  expect(worst, "the hexagon is drawn over land that is not the parcel it outlines").toBeLessThan(parcelDeg / 5);

  // 2. The arrow lands on ground inside the parcel the card named. It used to be projected off a
  //    sphere the height of the planet's highest peak, for every cell whatever its own height.
  expect(arrowGround, "the arrow points at nothing the page draws").not.toBeNull();
  const arrowLatLng = vec3ToLatLng(arrowGround!.direction[0], arrowGround!.direction[1], arrowGround!.direction[2]);
  const arrowCell = latLngToCell(arrowLatLng[0], arrowLatLng[1], resolution);
  const arrowOff = angleBetween(arrowGround!.direction, centre);
  console.log(`globe marker: the arrow lands ${arrowOff.toFixed(4)} degrees from the cell centre, in ${arrowCell}`);
  expect(arrowCell, `the arrow points at ${arrowCell} and the card names ${cell}`).toBe(cell);
  // Belt and braces on the same claim, in case the two happen to share a boundary: the drawn ground
  // under the circle is inside the hexagon's own circumradius of its centre.
  expect(arrowOff).toBeLessThan(parcelDeg / 2);
  // The surface radius at the cell centre is not 1 + reliefScale unless this cell is the planet's
  // summit, which is the assumption screenPositionOf used to make about every cell on the globe.
  const summit = 1 + 0.05;
  expect(
    globeRadiusAt(field, calibration, centre),
    "this cell is drawn at the height of the highest peak, so it cannot tell the two rules apart",
  ).toBeLessThan(summit - 0.005);
});
