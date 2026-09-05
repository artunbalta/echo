/**
 * The minimap's arithmetic: which way is up, what the image is made of, and which way the planet
 * inset is handed.
 *
 * THIS IS THE HALF THAT CAN RUN IN NODE, and it is deliberately not the whole guard. Nothing here
 * can see the wiring: the mapping could be perfect and the component could be reading the wrong
 * layer, or writing the transform onto the wrong element, and every assertion below would still
 * pass. tests/e2e/minimap.spec.ts is the other half; it walks the SHIPPED player 400 m north on a
 * real GPU and measures the marker moving up the shipped panel.
 *
 * EVERY EXPECTATION HERE IS DERIVED FROM SOMETHING OTHER THAN THE CODE UNDER TEST. The colour
 * assertions predict through BIOME_COLOUR, the authored sRGB byte table, and never through
 * BIOME_COLOUR_LINEAR, which is what the painter reads: deriving both from the same table is the
 * dud-guard shape DECISIONS C3 records preview-globe.ts having shipped once already. The frame
 * assertions are stated at the map's own edges rather than through its scale factor. The handedness
 * assertion is stated against `patch.east` and `patch.north` out of @echo/planet.
 *
 * Run:  node --import tsx --test apps/web/tests/minimap.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BIOME_COLOUR,
  BIOME_COLOUR_LINEAR,
  createTangentPatch,
  createTerrain,
  regionBound,
  type Calibration,
} from "@echo/planet";

import { PALETTE } from "../src/game/three/palette";
import {
  arrowRotationRad,
  halfFovRad,
  mapPixelOf,
  paintGroundMap,
  paintPlanetInset,
  planetInsetBasis,
  quantiseToCompass,
  type GroundSource,
  type WaterSpec,
} from "../src/components/world/Minimap";

const SEED = "echo-capacity-1";
const CALIBRATION: Calibration = {
  seaLevel: -0.0061377801938361206,
  peakElevation: 0.42423146978750087,
  landFraction: 0.6,
};
const RADIUS_KM = 200;
const field = createTerrain(SEED);

/** The ordinary parcel the third route opens, and the coastal demo cell. */
const INLAND = "8482589ffffffff";
const DEMO = "847b949ffffffff";

const EXTENT = 2073.4;
const SIZE = 112;

/** One vertex, at a place, a colour, a normal and a height. The painter bins vertices, not faces. */
function vertexAt(
  x: number,
  z: number,
  colour: readonly [number, number, number],
  height = 10,
  normal: readonly [number, number, number] = [0, 1, 0],
): GroundSource {
  return {
    positions: [x, height, z],
    normals: [normal[0], normal[1], normal[2]],
    colours: [colour[0], colour[1], colour[2]],
  };
}

const everywhere = () => true;
const nowhere = () => false;

function paint(chunks: GroundSource[], insideParcel = everywhere, water: WaterSpec | null = null) {
  return paintGroundMap(chunks, { size: SIZE, extentM: EXTENT, insideParcel, water });
}

/** The RGBA of the pixel a world position lands in. */
function pixelAt(image: Uint8ClampedArray, x: number, z: number): [number, number, number, number] {
  const [px, py] = mapPixelOf(x, z, EXTENT, SIZE);
  const o = (Math.floor(py) * SIZE + Math.floor(px)) * 4;
  return [image[o]!, image[o + 1]!, image[o + 2]!, image[o + 3]!];
}

// ── which way is up ─────────────────────────────────────────────────────────────

test("the map covers exactly the square the region fills, and north is its top edge", () => {
  // Stated at the edges, which is a property of "the map covers plus and minus extentM with north
  // at the top", not a restatement of the scale factor. Three's z is SOUTH, so -extentM is north.
  assert.deepEqual(mapPixelOf(0, -EXTENT, EXTENT, SIZE), [SIZE / 2, 0]);
  assert.deepEqual(mapPixelOf(0, EXTENT, EXTENT, SIZE), [SIZE / 2, SIZE]);
  assert.deepEqual(mapPixelOf(-EXTENT, 0, EXTENT, SIZE), [0, SIZE / 2]);
  assert.deepEqual(mapPixelOf(EXTENT, 0, EXTENT, SIZE), [SIZE, SIZE / 2]);
  assert.deepEqual(mapPixelOf(0, 0, EXTENT, SIZE), [SIZE / 2, SIZE / 2]);
});

test("walking north moves up the map, walking east moves right, and twice as far is twice as far", () => {
  const centre = mapPixelOf(0, 0, EXTENT, SIZE);
  const north = mapPixelOf(0, -400, EXTENT, SIZE);
  const further = mapPixelOf(0, -800, EXTENT, SIZE);
  const east = mapPixelOf(400, 0, EXTENT, SIZE);

  assert.ok(north[1] < centre[1], `north must be up the map: ${north[1]} vs ${centre[1]}`);
  assert.equal(north[0], centre[0], "walking north must not move the marker sideways");
  assert.ok(east[0] > centre[0], `east must be right: ${east[0]} vs ${centre[0]}`);
  assert.equal(east[1], centre[1], "walking east must not move the marker up or down");

  const near = centre[1] - north[1];
  const far = centre[1] - further[1];
  assert.ok(Math.abs(far - 2 * near) < 1e-9, `800 m must be twice 400 m: ${far} vs ${2 * near}`);
});

// ── what the image is made of ───────────────────────────────────────────────────

test("flat ground comes out at the vertex colour it was given, in the display's own space", () => {
  // Predicted through BIOME_COLOUR, the sRGB bytes the world's colours are authored as. The painter
  // is handed BIOME_COLOUR_LINEAR, which is that table converted; if the sRGB encode on the way out
  // were missing, rainforest's (50, 94, 66) would arrive as roughly (10, 33, 16).
  const image = paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.rainforest)]);
  const [r, g, b, a] = pixelAt(image, 0, 0);
  const want = BIOME_COLOUR.rainforest;
  assert.equal(a, 255);
  for (const [i, got] of [r, g, b].entries()) {
    assert.ok(Math.abs(got - want[i]!) <= 1, `channel ${i}: ${got} against the table's ${want[i]}`);
  }
});

test("relief is read off the chunks' own normals, and it darkens as well as brightens", () => {
  const flat = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.grassland)]), 0, 0);
  // The map's light is from the north west, so a slope whose normal leans north west catches it and
  // one leaning south east loses it. Three's frame: -x is west, -z is north.
  const toLight = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.grassland, 10, normalise([-0.6, 0.6, -0.6]))]), 0, 0);
  const away = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.grassland, 10, normalise([0.6, 0.6, 0.6]))]), 0, 0);

  assert.ok(toLight[0]! > flat[0]! + 2, `a north-west slope must be brighter: ${toLight[0]} vs ${flat[0]}`);
  assert.ok(away[0]! < flat[0]! - 2, `a south-east slope must be darker: ${away[0]} vs ${flat[0]}`);
  // The bible's law: no shade may reach black. PALETTE.shadow's own red is 0x0b.
  assert.ok(away[0]! > 0x0b, `the darkest slope must stay clear of the ink: ${away[0]}`);
});

test("the sea is the shipped water material, composited where the ground is below sea level", () => {
  const water: WaterSpec = { r: 0.02, g: 0.18, b: 0.42, opacity: 0.86 };
  const dryGround = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.beach, 10)], everywhere, water), 0, 0);
  const seabed = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.beach, -10)], everywhere, water), 0, 0);
  const noWaterMesh = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.beach, -10)], everywhere, null), 0, 0);

  assert.deepEqual(dryGround, pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.beach, 10)]), 0, 0),
    "ground above sea level must not be touched by the water plane");
  assert.deepEqual(noWaterMesh, dryGround, "a region with no water mesh has no sea to composite");
  // Sand is redder than it is blue and the sea is the other way round, so the test is the swap,
  // not a threshold: this water is dark as well as blue, so its red falls further than its blue
  // rises and a "blue went up by N" assertion would be about the sand rather than the sea.
  assert.ok(dryGround[0]! > dryGround[2]! + 40, `the beach must read red-over-blue: ${dryGround}`);
  assert.ok(seabed[2]! > seabed[0]! + 40, `the sea must read blue-over-red: ${seabed}`);
  assert.ok(seabed[0]! < dryGround[0]! - 40, `and the sea must darken the sand: ${seabed} vs ${dryGround}`);

  // The material's own opacity is what is read, not a number of this file's own: at half the
  // opacity the pixel sits half way between the bare ground and the fully covered one, in LINEAR,
  // which is where the blend happens, so the bytes land inside the two ends rather than on the mean.
  const half = pixelAt(paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.beach, -10)], everywhere, { ...water, opacity: 0.43 }), 0, 0);
  assert.ok(half[2]! > dryGround[2]! && half[2]! < seabed[2]!, `half the opacity must land between: ${half[2]}`);
});

test("a coast fades over one pixel, because sub-pixel water coverage is the vertices that are wet", () => {
  const water: WaterSpec = { r: 0.02, g: 0.18, b: 0.42, opacity: 1 };
  const colour = BIOME_COLOUR_LINEAR.beach;
  const allDry = pixelAt(paint([vertexAt(0, 0, colour, 10), vertexAt(1, 1, colour, 10)], everywhere, water), 0, 0);
  const halfWet = pixelAt(paint([vertexAt(0, 0, colour, 10), vertexAt(1, 1, colour, -10)], everywhere, water), 0, 0);
  const allWet = pixelAt(paint([vertexAt(0, 0, colour, -10), vertexAt(1, 1, colour, -10)], everywhere, water), 0, 0);

  assert.ok(halfWet[2]! > allDry[2]! && halfWet[2]! < allWet[2]!,
    `a half-wet pixel must sit between dry and wet: ${allDry[2]}, ${halfWet[2]}, ${allWet[2]}`);
});

test("the deed line is what dims: the parcel is lit and its neighbours are pulled toward the ink", () => {
  const colour = BIOME_COLOUR_LINEAR.savanna;
  const inside = pixelAt(paint([vertexAt(0, 0, colour)], everywhere), 0, 0);
  const outside = pixelAt(paint([vertexAt(0, 0, colour)], nowhere), 0, 0);

  assert.ok(outside[0]! < inside[0]! - 8, `outside the deed line must be dimmer: ${outside[0]} vs ${inside[0]}`);
  // Toward PALETTE.shadow, never toward black: the dimmed pixel keeps the ink's own blue bias.
  assert.ok(outside[2]! > (PALETTE.shadow & 0xff) - 1, `the dim must not undercut the ink: ${outside[2]}`);
  assert.equal(outside[3], 255, "dimmed ground is still ground");
});

test("a pixel with no vertex in it is transparent, because there is no ground there", () => {
  const image = paint([vertexAt(0, 0, BIOME_COLOUR_LINEAR.forest)]);
  assert.equal(pixelAt(image, 0, 0)[3], 255, "the pixel the vertex is in must be opaque");
  assert.equal(pixelAt(image, -EXTENT + 1, -EXTENT + 1)[3], 0, "a corner with no ground must be transparent");
  let opaque = 0;
  for (let i = 3; i < image.length; i += 4) if (image[i]! > 0) opaque++;
  assert.equal(opaque, 1, `exactly one pixel was fed a vertex, ${opaque} came out opaque`);
});

test("the parcel that ships is a hexagon inside the square, and the map covers all of it", () => {
  // Not a synthetic polygon: the real deed line of the ordinary parcel, through the same
  // regionBound the component and walkability both use.
  const patch = createTangentPatch(INLAND, RADIUS_KM);
  const deed = regionBound(INLAND, 0, RADIUS_KM);
  for (const [east, north] of patch.boundary) {
    const [px, py] = mapPixelOf(east, -north, EXTENT, SIZE);
    assert.ok(px >= 0 && px <= SIZE && py >= 0 && py <= SIZE, `corner (${east}, ${north}) fell off the map`);
  }
  assert.ok(deed.contains(0, 0), "the anchor cell must contain its own centre");
  assert.ok(!deed.contains(EXTENT, EXTENT), "the corner of the map is not in the parcel");
});

// ── the marker ──────────────────────────────────────────────────────────────────

test("the heading arrow points where the heading points, on a surface whose y grows down", () => {
  // The art points north, at screen (0, -1). Rotating it clockwise by the returned angle must land
  // on the heading's own screen direction, which is (cos h, sin h) because the tile frame's y is
  // SOUTH and a screen's y is DOWN, so the two agree with no sign.
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.3]) {
    const a = arrowRotationRad(heading);
    const x = 0 * Math.cos(a) - -1 * Math.sin(a);
    const y = 0 * Math.sin(a) + -1 * Math.cos(a);
    assert.ok(Math.abs(x - Math.cos(heading)) < 1e-12, `heading ${heading}: x ${x} vs ${Math.cos(heading)}`);
    assert.ok(Math.abs(y - Math.sin(heading)) < 1e-12, `heading ${heading}: y ${y} vs ${Math.sin(heading)}`);
  }
});

test("prefers-reduced-motion snaps the heading to eight points and never further than half a step", () => {
  const step = Math.PI / 4;
  for (let i = -8; i <= 8; i++) {
    assert.ok(Math.abs(quantiseToCompass(i * step) - i * step) < 1e-12, "a compass point must survive exactly");
  }
  const seen = new Set<number>();
  for (let a = -Math.PI; a < Math.PI; a += 0.0037) {
    const q = quantiseToCompass(a);
    assert.ok(Math.abs(q - a) <= step / 2 + 1e-12, `${a} moved to ${q}, more than half a step`);
    assert.ok(Math.abs(q / step - Math.round(q / step)) < 1e-9, `${q} is not a compass point`);
    // Modulo eight, because -pi and +pi are the same direction and the sweep crosses both.
    seen.add(((Math.round(q / step) % 8) + 8) % 8);
  }
  assert.equal(seen.size, 8, `eight points must be reachable, ${seen.size} were`);
});

test("the view cone is the camera's real horizontal field, aspect and all", () => {
  // 36.7 degrees is the shipped frame's own half angle, at fov 50 and 1280 by 800; DECISIONS
  // records it under C4, revisited, and it is where this number comes from.
  const shipped = (halfFovRad(50, 1280 / 800) * 180) / Math.PI;
  assert.ok(Math.abs(shipped - 36.7) < 0.1, `the shipped frame's half angle is 36.7, got ${shipped}`);
  // A square viewport sees exactly the vertical field, which is the one three's `fov` names.
  assert.ok(Math.abs((halfFovRad(50, 1) * 180) / Math.PI - 25) < 1e-9, "at aspect 1 the two fields agree");
  assert.ok(halfFovRad(50, 2) > halfFovRad(50, 1), "a wider window sees more, not less");
});

// ── the planet inset ────────────────────────────────────────────────────────────

test("the planet inset takes the landing globe's handedness, which puts east to the LEFT", () => {
  // This is a DECISION being pinned, not a preference. geo.ts sends latitude to +Y and longitude to
  // +Z from +X, which is an odd permutation of the Earth convention, so on this planet
  // east x north . outward = -1 and a north-up view from outside draws east to the left. The landing
  // globe draws that way because PlanetGlobe and preview-globe.ts both use three's lookAt basis,
  // right = up x view, and the inset follows it so that it is a picture of the SAME planet.
  // patch.east and patch.north come from @echo/planet and are the independent statement of which
  // way east is.
  for (const cell of [INLAND, DEMO]) {
    const patch = createTangentPatch(cell, RADIUS_KM);
    const { right, up, view } = planetInsetBasis(patch.centre);
    const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

    assert.ok(dot(right, patch.east) < -0.99, `${cell}: east must draw left, dot was ${dot(right, patch.east)}`);
    assert.ok(dot(up, patch.north) > 0.99, `${cell}: north must draw up, dot was ${dot(up, patch.north)}`);
    // The view is the parcel's own meridian taken to the equator, so the parcel can never hide
    // behind the limb and its height on the disk is the sine of its latitude alone.
    assert.ok(Math.abs(view[1]) < 1e-12, `${cell}: the view must sit on the equator, y was ${view[1]}`);
    assert.ok(Math.abs(dot(view, patch.centre)) > 0.9, `${cell}: the view must face the parcel`);
    assert.ok(Math.abs(dot(right, view)) < 1e-12, "the basis must be orthogonal");
  }
});

test("the inset draws a planet, marks the parcel on it, and leaves the sky alone", () => {
  const patch = createTangentPatch(DEMO, RADIUS_KM);
  const size = 64;
  const inset = paintPlanetInset({ field, calibration: CALIBRATION, at: patch.centre, size });

  // A disk in a square is pi/4 of it. Anything much off that is a projection that has stopped
  // filling the frame, or one that has started painting the sky.
  let opaque = 0;
  for (let i = 3; i < inset.pixels.length; i += 4) if (inset.pixels[i]! > 0) opaque++;
  const share = opaque / (size * size);
  assert.ok(Math.abs(share - Math.PI / 4) < 0.02, `the disk must be pi/4 of the square, got ${share.toFixed(4)}`);

  // The corners are sky and the centre is planet.
  assert.equal(inset.pixels[3], 0, "the top left corner is off the limb");
  assert.equal(inset.pixels[((size / 2) * size + size / 2) * 4 + 3], 255, "the middle is the planet");

  // The marker is on the central meridian, by construction of the view, and at the sine of its
  // latitude. Both are stated against the cell's own lat/lng out of @echo/planet.
  assert.ok(Math.abs(inset.marker[0] - size / 2) < 1e-9, `the parcel must sit on the central meridian, x ${inset.marker[0]}`);
  const wantY = size / 2 - Math.sin((inset.lat * Math.PI) / 180) * (size / 2);
  assert.ok(Math.abs(inset.marker[1] - wantY) < 1e-9, `latitude must set the marker's height: ${inset.marker[1]} vs ${wantY}`);
  assert.ok(Math.abs(inset.equatorY - size / 2) < 1e-9, "the equator is the middle row under this projection");

  // Nothing may be black: the night side is a blend toward PALETTE.shadow, not toward zero.
  let darkest = 255;
  for (let i = 0; i < inset.pixels.length; i += 4) {
    if (inset.pixels[i + 3] === 0) continue;
    darkest = Math.min(darkest, Math.max(inset.pixels[i]!, inset.pixels[i + 1]!, inset.pixels[i + 2]!));
  }
  assert.ok(darkest > 0, `the night side must not be black, darkest channel was ${darkest}`);
});

test("a parcel north of the equator marks above the middle and one south of it marks below", () => {
  // The two shipped routes are both within two degrees of the equator, so this uses directions
  // rather than cells: the sign is the whole claim.
  const north = paintPlanetInset({ field, calibration: CALIBRATION, at: normalise([1, 1, 0]), size: 32 });
  const south = paintPlanetInset({ field, calibration: CALIBRATION, at: normalise([1, -1, 0]), size: 32 });
  assert.ok(north.lat > 44 && north.lat < 46, `45 degrees north, got ${north.lat}`);
  assert.ok(north.marker[1] < 16, `north must mark above the middle, got ${north.marker[1]}`);
  assert.ok(south.marker[1] > 16, `south must mark below the middle, got ${south.marker[1]}`);
});

function normalise(v: readonly [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
}
