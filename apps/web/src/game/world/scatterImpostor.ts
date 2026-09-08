/**
 * The far-band impostor (DECISIONS C21): what a class becomes past its own `lod.farM`.
 *
 * WHAT IT IS FOR. The A7 split works when you stand INSIDE the scatter and fails when you look at
 * it from the rim. Measured on the real GPU at eighteen stand points on the ordinary parcel, the
 * worst frame is 704,644 triangles standing 390 m from the spawn looking back across the disk, and
 * four of the eighteen are over the 600,000 of DECISIONS C16; on 8477057ffffffff five are, and on
 * 8496a91ffffffff twelve, worst 772,275. The grid removes almost nothing out there, because from
 * the rim almost the whole disk is inside the cone. Roughly half of what it submits stands past its
 * own class's `lod.farM`, which nothing has ever read. This file is what that half becomes.
 *
 * THE FORM IS DERIVED FROM THE FORM, not authored beside it. A hand-drawn impostor is a second
 * piece of art that drifts from the first one silently: someone widens a thicket and its far-band
 * stand-in stays the old width, and nothing fails. So `deriveImpostor` RASTERISES the class's own
 * merged geometry from twelve azimuths at eye level and reads four things off the silhouette it
 * finds, all of them in metres and all of them the form's own:
 *
 *   its HEIGHT and where its foot is, so the far skyline keeps the same line
 *   its projected AREA, averaged over the twelve, so it covers the same number of pixels
 *   its area's VERTICAL CENTROID, so the mass sits where the form's mass sits
 *   its COLOUR, the projected-area-weighted mean of the form's own vertex colours
 *
 * Two triangles is exactly enough to satisfy the first three: a TRAPEZIUM with width `widthBottomM`
 * at the foot and `widthTopM` at the head has two free numbers, and area and centroid are two
 * equations. That is the whole reason the form is a trapezium and not a rectangle, and it is what
 * makes the far band still legible: a buttress-tree comes out 1.00 m wide at the ground and 3.09 m
 * at the crown, a conifer comes out the other way round at 1.46 m and 0.73 m, and a broadleaf is
 * 0.15 m under a 3.77 m dome. The silhouettes a stand of them draws against the dusk are the
 * silhouettes the forms drew, because they were measured off them.
 *
 * COLOUR COMES FROM THE FORM AND THEREFORE FROM PALETTE. Every part of every form is painted with a
 * PALETTE entry or a blend of two, and the impostor's colour is a weighted mean of the ones the eye
 * can actually see, in the linear space `merge` already converted them to. So it is a colour this
 * world already contains, by exactly the argument scatterGeometry's own `mix` makes, and
 * `tests/scatterImpostor.test.mts` pins it inside the convex hull of the class's own parts. A card
 * whose colour was picked by hand is how a tree becomes a bright rectangle.
 *
 * IT TURNS TO FACE YOU, in the vertex shader, and this is the anti-pop decision that costs nothing.
 * A card at a fixed yaw is invisible edge-on: turn ninety degrees and a third of the far field
 * would vanish, which is a worse pop than the one this file exists to prevent. So the card is
 * rotated about its own upright axis so its face is square to the lens, which makes the silhouette
 * it draws the same from every heading. NOT ONE INSTANCE MOVES to do it: the rotation is applied to
 * the card's local vertices, before three multiplies by `instanceMatrix`, so the matrix buffer that
 * reaches the GPU is the placer's own bytes and `scatterSplit.test.mts`'s matrix comparison still
 * holds. There is deliberately no TypeScript twin of the turn; {@link BILLBOARD_GLSL} says why, and
 * what guards it instead.
 *
 * AND ITS NORMALS ARE FITTED, which is the part that took the measuring. A card lit by its own flat
 * facing is far too directional: it is fully keyed when you look away from the sun and completely
 * unkeyed when you look into it, where the form it replaces keeps its fill and half its key,
 * because a blob's visible normals point every way at once. So the card's four corners carry
 * normals splayed over a spherical cap, the cap LEANS by the elevation of the form's own mean
 * visible normal (see {@link capNormals}), and the cap's RADIUS is fitted per class against the
 * form's own response over twelve azimuths and twelve hours of the day. It is the one number in
 * the whole derivation chosen by search rather than measured, and what it minimises is the worst
 * ratio and not the mean, because a card that is right on average and four times too dark with the
 * sun behind it is a far field that changes brightness as you turn.
 *
 * WHAT THE FIT IS WORTH, measured against the same derivation with the cap collapsed to a flat
 * facet, which is what an unfitted card is: nineteen of the twenty-six classes come inside a ratio
 * band of two, against ONE flat-faced, and the fit is no worse than flat on all twenty-six.
 * Thicket lands at 0.65x to 1.64x, fern at 0.63x to 1.71x, buttress-tree at 0.77x to 1.25x and
 * boulder at 0.83x to 1.17x, and the day-mean is inside 5% of 1 on twenty-two of the twenty-six.
 * What stays bad is the near-flat litter, fallen-log at 0.45x to 4.20x and dune-ripple at 0.49x to
 * 2.72x, because a thing lying on the ground faces the sky and an upright card cannot: at midday
 * the ground catches the key and the card does not. Those two are 36 and 16 triangles at a few
 * hundred instances against fern's 6 at twenty thousand, and the residual is reported rather than
 * hidden. tests/scatterImpostor.test.mts holds both bounds and both populations.
 *
 * WHAT IT COSTS. The derivation is 1 to 14 ms per class, memoised on the class id and paid once per
 * session inside the per-class yield the layer's instancing loop already takes; the whole table of
 * twenty-six is 48 ms. Per frame it costs nothing at all: the cull already swept the buckets, and
 * the far list falls out of the same sweep as one point-to-box distance per visible bucket. In the
 * scene it is one more InstancedMesh per class and therefore one more draw call per class that has
 * a far band, which on the shipped routes takes the whole frame from 37 calls to 41 at the parcel's
 * spawn and from 57 to 64 at the demo's rim, against the 120 of DECISIONS C16.
 *
 * AND IN THIS WORLD IT IS VERY NEARLY INVISIBLE, which was not expected and is the reason the pop
 * is as small as it is. Three's linear fog is exactly 1 at 420 m of view depth, so a prop past it
 * carries none of its own colour; in front of that the near forest stands. Measured on the shipped
 * page at seven stand points on the ordinary parcel and seven on the demo, drawing the far band as
 * cards rather than as full forms moves 0 or 1 pixels of 1,024,000 - and so does drawing it AT ALL
 * against not drawing it. The instrument was checked on the same frames against hiding the whole
 * scatter, which moves 886,306. Where the band IS visible is 847b959ffffffff, the one shipped route
 * with open ground: over 123 walkable views there the worst difference between cards and full forms
 * is 2,087 pixels, 1,230 of them by more than 8 levels of 255. For scale C20 moved 1.3% of a frame
 * by more than 8 and C17's closure moved 56.7%.
 *
 * IT DOES NOT POP, measured by holding the lens still and stepping only the classification: at each
 * 10.7 cm step, one frame of walking, the frame is drawn twice from the same camera, once with this
 * frame's level of detail and once with the previous frame's, so the walk cancels and what is left
 * is the buckets that changed side. Over a 32 m walk the worst single frame is 76 pixels of
 * 1,024,000 on the beach and 106 on the demo, and 0 on every one of 299 frames on the parcel with
 * 15,581 to 17,664 instances in the band the whole way. The frustum-only control reads 0 on the
 * same frames, so what moved was the switch and not a bucket entering the cone.
 *
 * WHAT IT DOES NOT DO. It never casts a shadow, and DECISIONS C22 changed why. It used to be that
 * no caster could reach the far band at all: the shortest casting `farM` was 700 m against the
 * 591 m a caster inside the 240 m shadow box can stand from the lens at a 16 degree sun, so the
 * case did not exist. C22 re-derived those distances against the 500 m disk the scatter fills and
 * the shortest casting `farM` is now cactus at 350 m, so a caster IS in the far band, and what it
 * casts is the shadow of its own FULL FORM, out of the twin the layer packs against the shadow
 * camera. That is deliberate: a card is two triangles seen edge-on from the sun, and the ground its
 * shadow lands on is at least 350 m away, further than any ground pixel the lens reaches. The
 * shadow pass never reads `farM`, so DECISIONS C20's numbers stand untouched whatever this file
 * does, which is checked rather than hoped: `tests/scatterImpostor.test.mts` culls one cell under
 * two `farM` tables three hundred metres apart and holds the shadow pass identical, triangle for
 * triangle, and separately holds it identical with the far band and without it at all 84 views
 * across five routes.
 */

import * as THREE from "three";
import type { AssetClassId } from "@echo/planet";

import { SCATTER_GEOMETRY } from "./scatterGeometry";
import { skyState, type SkyState } from "./skyLayer";

/** Two triangles, whatever the class. The whole point of the far band. */
export const IMPOSTOR_TRIANGLES = 2;

/**
 * How many azimuths the silhouette is measured from, and how many pixels wide the raster is.
 *
 * TWELVE AND SIXTY-FOUR, and both are a cost decision measured against a build that is already
 * 400 ms. The derivation runs once per class per session (it is memoised on the class id, and the
 * form is a pure function of the id), inside the same per-class yield the layer's instancing loop
 * already takes. At 24 azimuths and a 128 px raster the worst class, vine-tangle, took 42 ms on its
 * own and the whole table 105 ms; at 12 and 64, with the shading moved out of the pixel loop, the
 * table is 48 ms and the worst class is 14, and the profile numbers agree with the finer sweep to
 * within 2% of area, which is under the pixel quantisation of the raster itself.
 */
const AZIMUTHS = 12;
const RASTER = 64;

/** Hours of the day the normal fit is scored over: the key swings from a 16 degree sun to a moon. */
const FIT_HOURS = 12;

/**
 * The cap radii the fit searches, as the sine of the half angle.
 *
 * The upper limit is not a taste: a corner normal is `(r * right, r * up, sqrt(1 - 2 r^2))` and the
 * z component goes imaginary past 1/sqrt(2), so 0.70 is the widest splay four corners of a quad can
 * carry while still facing the way the card faces.
 */
const FIT_RADII = Array.from({ length: 15 }, (_, i) => i / 20);

/** What the derivation measured, in the class's own metres. Everything a test needs to check it. */
export interface ImpostorProfile {
  /** The silhouette's height, and the height of its foot above the instance origin. */
  heightM: number;
  footM: number;
  /** Mean projected area over the azimuths, square metres. */
  areaM2: number;
  /** Height of the area's centroid above the foot. */
  centroidM: number;
  widthBottomM: number;
  widthTopM: number;
  /** Linear RGB, the projected-area-weighted mean of the form's own vertex colours. */
  colour: readonly [number, number, number];
  /**
   * How the card is lit: the measured lean of the form's own mean visible normal out of the card's
   * face, and the fitted spread of the four corners about it.
   */
  capTiltRad: number;
  capRadius: number;
  ratioLow: number;
  ratioHigh: number;
  ratioMean: number;
  /** True when the centroid could not be matched because it lies outside the middle third. */
  centroidClamped: boolean;
}

export interface Impostor {
  geometry: THREE.BufferGeometry;
  profile: ImpostorProfile;
}

/** Rec. 709 luminance, the one weighting used everywhere a colour has to become a number here. */
const luma = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

/**
 * One hour of the day, flattened to the six numbers the response below needs.
 *
 * Flattened rather than read off `SkyState` in the loop because the loop runs twelve times for
 * every one of four thousand raster pixels for every one of twelve azimuths, and a `THREE.Color`
 * field read and a `Vector3.dot` in there cost more than the whole derivation is allowed to.
 */
interface Hour {
  ground: number;
  sky: number;
  fill: number;
  key: number;
  lx: number;
  ly: number;
  lz: number;
}

function hourOf(sky: SkyState): Hour {
  return {
    ground: luma(sky.fillGround.r, sky.fillGround.g, sky.fillGround.b),
    sky: luma(sky.fillSky.r, sky.fillSky.g, sky.fillSky.b),
    fill: sky.fillIntensity,
    key: sky.keyIntensity * luma(sky.keyColour.r, sky.keyColour.g, sky.keyColour.b),
    lx: sky.keyFrom.x,
    ly: sky.keyFrom.y,
    lz: sky.keyFrom.z,
  };
}

/**
 * three's own Lambert response for one normal, as a multiplier on albedo luminance.
 *
 * It is the two lights the sky layer hangs and nothing else: a hemisphere whose weight is
 * `0.5 * n.y + 0.5` and a directional whose term is `max(0, n . keyFrom)`. Specular, ambient
 * occlusion and the shadow map are all absent, and deliberately: the fit is a comparison between
 * two pieces of geometry standing in the same place under the same lights, so every term they
 * SHARE cancels out of the ratio it minimises.
 *
 * The hemisphere is evaluated on LUMINANCE rather than per channel, which is exact because
 * luminance is linear in colour and the weight is a scalar.
 */
function response(nx: number, ny: number, nz: number, h: Hour): number {
  const w = 0.5 * ny + 0.5;
  const dot = nx * h.lx + ny * h.ly + nz * h.lz;
  return h.fill * (h.ground * (1 - w) + h.sky * w) + h.key * (dot > 0 ? dot : 0);
}

/** One azimuth's reading of the form: what it covers, where, in what colour, and how lit. */
interface Silhouette {
  dir: THREE.Vector3;
  areaM2: number;
  centroidM: number;
  footM: number;
  headM: number;
  /** Mean albedo-luminance times response, one per fitted hour. */
  lit: Float64Array;
  /** Sum of the visible pixels' linear vertex colours, and how many there were. */
  colourSum: [number, number, number];
  covered: number;
  /** The mean of the visible pixels' own normals, unnormalised: its length is how agreed they are. */
  normalSum: [number, number, number];
}

/**
 * Rasterise one form from `AZIMUTHS` horizontal directions and read its silhouette off the pixels.
 *
 * HORIZONTAL, and that is a measurement rather than a convenience. The far band starts at 200 m for
 * a bromeliad and 450 m for a thicket, and the eye stands about eight metres above the ground it is
 * looking across, so the line of sight to anything in the band is within two degrees of level. A
 * derivation taken from above would give a moss patch a large silhouette and a tree a small one,
 * which is the opposite of what the frame contains.
 *
 * The z buffer is what makes the area a SILHOUETTE and not a sum of triangles: a fern is three
 * crossed quads whose projected areas add to more than the shape they draw, and a closed solid has
 * a back half that must not count at all. Nothing is back-face culled, because a third of the forms
 * are double-sided cards and the front-most fragment is the visible one either way.
 */
function rasterise(geometry: THREE.BufferGeometry, hours: readonly Hour[]): Silhouette[] {
  const pos = geometry.getAttribute("position").array as Float32Array;
  const col = geometry.getAttribute("color").array as Float32Array;
  const triangles = pos.length / 9;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  // The raster has to hold the form at every azimuth, so its half width is the largest horizontal
  // reach and not the box's own x extent: a form 3 m long in z would be clipped by an x-sized page.
  const reach = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 1.02 + 1e-3;
  const yLow = bb.min.y;
  const yHigh = bb.max.y + 1e-4;
  const pxM = (2 * reach) / RASTER;
  const pyM = (yHigh - yLow) / RASTER;
  const pixelAreaM2 = pxM * pyM;

  // The face normals, once. They are a property of the form and not of the eye; only their SIGN
  // depends on which way the eye is, and that is one comparison per triangle per azimuth.
  const normals = new Float64Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const o = t * 9;
    const ax = pos[o]!;
    const ay = pos[o + 1]!;
    const az = pos[o + 2]!;
    const nx = (pos[o + 4]! - ay) * (pos[o + 8]! - az) - (pos[o + 5]! - az) * (pos[o + 7]! - ay);
    const ny = (pos[o + 5]! - az) * (pos[o + 6]! - ax) - (pos[o + 3]! - ax) * (pos[o + 8]! - az);
    const nz = (pos[o + 3]! - ax) * (pos[o + 7]! - ay) - (pos[o + 4]! - ay) * (pos[o + 6]! - ax);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[t * 3] = nx / len;
    normals[t * 3 + 1] = ny / len;
    normals[t * 3 + 2] = nz / len;
  }

  const depth = new Float64Array(RASTER * RASTER);
  const face = new Int32Array(RASTER * RASTER);
  const hits = new Int32Array(triangles);
  const out: Silhouette[] = [];
  const sx = [0, 0, 0];
  const sy = [0, 0, 0];
  const sd = [0, 0, 0];

  for (let a = 0; a < AZIMUTHS; a++) {
    const phi = (a / AZIMUTHS) * Math.PI * 2;
    // The eye sits along `dir`; `right` is the screen x axis and world up is the screen y axis.
    const dir = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
    const rx = -Math.sin(phi);
    const rz = Math.cos(phi);
    depth.fill(-Infinity);
    face.fill(-1);

    for (let t = 0; t < triangles; t++) {
      const o = t * 9;
      for (let k = 0; k < 3; k++) {
        const x = pos[o + k * 3]!;
        const y = pos[o + k * 3 + 1]!;
        const z = pos[o + k * 3 + 2]!;
        sx[k] = (x * rx + z * rz + reach) / pxM;
        sy[k] = (y - yLow) / pyM;
        sd[k] = x * dir.x + z * dir.z;
      }
      const den = (sy[1]! - sy[2]!) * (sx[0]! - sx[2]!) + (sx[2]! - sx[1]!) * (sy[0]! - sy[2]!);
      if (Math.abs(den) < 1e-12) continue;
      const iLow = Math.max(0, Math.floor(Math.min(sx[0]!, sx[1]!, sx[2]!)));
      const iHigh = Math.min(RASTER - 1, Math.ceil(Math.max(sx[0]!, sx[1]!, sx[2]!)));
      const jLow = Math.max(0, Math.floor(Math.min(sy[0]!, sy[1]!, sy[2]!)));
      const jHigh = Math.min(RASTER - 1, Math.ceil(Math.max(sy[0]!, sy[1]!, sy[2]!)));
      for (let j = jLow; j <= jHigh; j++) {
        for (let i = iLow; i <= iHigh; i++) {
          const gx = i + 0.5;
          const gy = j + 0.5;
          const l0 = ((sy[1]! - sy[2]!) * (gx - sx[2]!) + (sx[2]! - sx[1]!) * (gy - sy[2]!)) / den;
          const l1 = ((sy[2]! - sy[0]!) * (gx - sx[2]!) + (sx[0]! - sx[2]!) * (gy - sy[2]!)) / den;
          const l2 = 1 - l0 - l1;
          if (l0 < 0 || l1 < 0 || l2 < 0) continue;
          const z = l0 * sd[0]! + l1 * sd[1]! + l2 * sd[2]!;
          const at = j * RASTER + i;
          if (z > depth[at]!) {
            depth[at] = z;
            face[at] = t;
          }
        }
      }
    }

    // The pixel loop counts and nothing else. Colour, normal and twelve hours of lighting are all
    // constant across a triangle, so they are done once per triangle afterwards rather than four
    // thousand times per azimuth; that alone took the whole table from 105 ms to 48.
    let covered = 0;
    let moment = 0;
    let foot = Infinity;
    let head = -Infinity;
    hits.fill(0);
    for (let j = 0; j < RASTER; j++) {
      const y = yLow + (j + 0.5) * pyM;
      for (let i = 0; i < RASTER; i++) {
        const t = face[j * RASTER + i]!;
        if (t < 0) continue;
        covered++;
        moment += y;
        if (y < foot) foot = y;
        if (y > head) head = y;
        hits[t] = hits[t]! + 1;
      }
    }
    const lit = new Float64Array(hours.length);
    const colourSum: [number, number, number] = [0, 0, 0];
    const normalSum: [number, number, number] = [0, 0, 0];
    for (let t = 0; t < triangles; t++) {
      const n = hits[t]!;
      if (n === 0) continue;
      const o = t * 9;
      colourSum[0] += col[o]! * n;
      colourSum[1] += col[o + 1]! * n;
      colourSum[2] += col[o + 2]! * n;
      // The face normal, flipped toward the eye. That flip is not a convenience: three's flat
      // shading takes the normal from `cross(dFdx, dFdy)` of the view position, which faces the
      // lens whatever the winding, and a double-sided card's `gl_FrontFacing` does the same thing
      // by hand. So this IS the normal the renderer lights the pixel with, including the leaf
      // undersides that end up pointing at the ground.
      let nx = normals[t * 3]!;
      let ny = normals[t * 3 + 1]!;
      let nz = normals[t * 3 + 2]!;
      if (nx * dir.x + nz * dir.z < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      normalSum[0] += nx * n;
      normalSum[1] += ny * n;
      normalSum[2] += nz * n;
      const albedo = luma(col[o]!, col[o + 1]!, col[o + 2]!);
      for (let h = 0; h < hours.length; h++) lit[h] += albedo * response(nx, ny, nz, hours[h]!) * n;
    }
    if (covered === 0) continue;
    for (let h = 0; h < hours.length; h++) lit[h]! /= covered;
    out.push({
      dir,
      areaM2: covered * pixelAreaM2,
      centroidM: moment / covered,
      footM: foot - pyM / 2,
      headM: head + pyM / 2,
      lit,
      colourSum,
      covered,
      normalSum,
    });
  }
  return out;
}


/**
 * The four corner normals of a card facing +Z, as a spherical cap of radius `r` about an axis
 * leaning `tiltRad` up out of the card's own face.
 *
 * TWO NUMBERS, AND ONLY ONE OF THEM IS SEARCHED FOR. The lean is MEASURED: it is the elevation of
 * the form's own projected-area-weighted mean visible normal, which is where a distant version of
 * this thing actually faces. A bromeliad is six leaves fanned outward and tilted back, so half of
 * what the eye sees is a leaf's UNDERSIDE, and flat shading gives an underside a downward normal
 * that catches ground fill and no key at all; a card standing square to the lens with no lean came
 * out 1.65x too bright on average because of it. The spread `r` is the one number the fit chooses,
 * and it is what turns a facet into a blob: at 0 all four corners point the same way and the card
 * is fully keyed looking away from the sun and unkeyed looking into it, where the form it replaces
 * keeps its fill and half its key.
 *
 * The axis component is `sqrt(1 - 2 r^2)`, which goes imaginary past 1 / sqrt(2), and that is the
 * only reason {@link FIT_RADII} stops at 0.70.
 */
export function capNormals(r: number, tiltRad: number): Array<[number, number, number]> {
  const z = Math.sqrt(Math.max(1e-6, 1 - 2 * r * r));
  const ct = Math.cos(tiltRad);
  const st = Math.sin(tiltRad);
  // The cap's own frame: the axis leans out of the face about the card's x, and the in-plane "up"
  // leans with it, so the splay stays perpendicular to the axis instead of shearing across it.
  const out: Array<[number, number, number]> = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const nx = r * sx;
    const ny = st * z + ct * (r * sy);
    const nz = ct * z - st * (r * sy);
    const len = Math.hypot(nx, ny, nz) || 1;
    out.push([nx / len, ny / len, nz / len]);
  }
  return out;
}

/**
 * What the card emits, averaged across its face the way the fragment shader would sample it.
 *
 * Nine samples of the bilinear interpolation between the four corners, renormalised each time,
 * which is what three does per fragment. Nine rather than one because the whole point of the splay
 * is that the corners disagree, and a fit scored on the mean of the four corner normals would score
 * a normal no fragment ever has.
 *
 * The billboard turns the card's local +Z onto the horizontal direction to the lens and its local
 * +X onto (dir.z, 0, -dir.x); local +Y is world up either way.
 */
function cardResponse(
  dirX: number,
  dirZ: number,
  corners: ReadonlyArray<readonly [number, number, number]>,
  h: Hour,
): number {
  let acc = 0;
  for (let j = 0; j <= 2; j++) {
    for (let i = 0; i <= 2; i++) {
      const u = i / 2;
      const v = j / 2;
      const w0 = (1 - u) * (1 - v);
      const w1 = u * (1 - v);
      const w2 = u * v;
      const w3 = (1 - u) * v;
      const lx = corners[0]![0] * w0 + corners[1]![0] * w1 + corners[2]![0] * w2 + corners[3]![0] * w3;
      const ly = corners[0]![1] * w0 + corners[1]![1] * w1 + corners[2]![1] * w2 + corners[3]![1] * w3;
      const lz = corners[0]![2] * w0 + corners[1]![2] * w1 + corners[2]![2] * w2 + corners[3]![2] * w3;
      const wx = dirZ * lx + dirX * lz;
      const wz = -dirX * lx + dirZ * lz;
      const len = Math.hypot(wx, ly, wz) || 1;
      acc += response(wx / len, ly / len, wz / len, h);
    }
  }
  return acc / 9;
}

/**
 * Two triangles as a trapezium standing on the ground, facing +Z, one colour and four cap normals.
 *
 * The winding is counter-clockwise seen from +Z, so the card is front-facing to a lens it has just
 * turned toward and `FrontSide` is free rather than a risk. A width of zero leaves one of the two
 * triangles degenerate and the other drawing the whole shape; the count stays two so that the
 * triangle arithmetic in the cull is one multiplication and not a table.
 */
function cardGeometry(profile: ImpostorProfile): THREE.BufferGeometry {
  const wb = profile.widthBottomM / 2;
  const wt = profile.widthTopM / 2;
  const y0 = profile.footM;
  const y1 = profile.footM + profile.heightM;
  const corner = capNormals(profile.capRadius, profile.capTiltRad);
  const quad: Array<[number, number, number]> = [
    [-wb, y0, 0],
    [wb, y0, 0],
    [wt, y1, 0],
    [-wt, y1, 0],
  ];
  const order = [0, 1, 2, 0, 2, 3];
  const position = new Float32Array(18);
  const normal = new Float32Array(18);
  const colour = new Float32Array(18);
  for (let i = 0; i < 6; i++) {
    const v = quad[order[i]!]!;
    const n = corner[order[i]!]!;
    position[i * 3] = v[0];
    position[i * 3 + 1] = v[1];
    position[i * 3 + 2] = v[2];
    normal[i * 3] = n[0];
    normal[i * 3 + 1] = n[1];
    normal[i * 3 + 2] = n[2];
    colour[i * 3] = profile.colour[0];
    colour[i * 3 + 1] = profile.colour[1];
    colour[i * 3 + 2] = profile.colour[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  // The sphere the renderer culls this mesh by, and the sphere `bucketise` measures a bucket's box
  // from. It has to hold the card at EVERY yaw, because the yaw is chosen in the shader after the
  // boxes are built: the card sweeps a cylinder of radius max(wb, wt) about the upright axis, so
  // the sphere is taken over the corners of the widest of the two ends at both heights.
  const half = Math.max(wb, wt);
  const centre = new THREE.Vector3(0, (y0 + y1) / 2, 0);
  geometry.boundingSphere = new THREE.Sphere(centre, Math.hypot(half, (y1 - y0) / 2));
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Measure one form and build the two triangles that stand in for it past `lod.farM`.
 *
 * PURE: every number is read off the vertex buffer and the sky's own closed-form day cycle, so the
 * same form gives the same card on every machine, every reload and on a server that never renders.
 * Nothing hashes and nothing is random.
 */
export function deriveImpostor(geometry: THREE.BufferGeometry, forceCapRadius?: number): Impostor {
  const hours: Hour[] = [];
  for (let h = 0; h < FIT_HOURS; h++) hours.push(hourOf(skyState(h / FIT_HOURS)));
  const views = rasterise(geometry, hours);
  if (views.length === 0) throw new Error("[scatter] a form with no silhouette at any azimuth cannot have an impostor");

  const mean = (pick: (s: Silhouette) => number) => views.reduce((a, s) => a + pick(s), 0) / views.length;
  const areaM2 = mean((s) => s.areaM2);
  const footM = mean((s) => s.footM);
  const heightM = mean((s) => s.headM) - footM;
  const centroidM = mean((s) => s.centroidM) - footM;

  // THE TRAPEZIUM, and it is the solution of two equations rather than a shape somebody liked. Its
  // area is (wb + wt) / 2 * h and its centroid stands h (wb + 2 wt) / (3 (wb + wt)) above the foot,
  // so with the area and the centroid both measured off the form the two widths fall out. A
  // centroid outside the middle third has no solution with both widths positive, which is the form
  // saying it is a triangle and not a trapezium: the width that would go negative is pinned at zero,
  // the centroid lands on the nearest third, and `centroidClamped` says so out loud. No shipped
  // class reaches it; the narrowest are broadleaf at 0.16 m and dead-tree at 0.15 m.
  const sum = (2 * areaM2) / heightM;
  const wanted = (3 * centroidM) / heightM;
  const k = Math.min(2, Math.max(1, wanted));

  let covered = 0;
  const colourSum = [0, 0, 0];
  // The lean is the elevation of the form's own mean visible normal, taken over every azimuth. Its
  // horizontal part points at the eye by symmetry and carries no information; its elevation is the
  // whole of what a card standing square to the lens gets wrong.
  let tiltSum = 0;
  for (const v of views) {
    covered += v.covered;
    colourSum[0] += v.colourSum[0];
    colourSum[1] += v.colourSum[1];
    colourSum[2] += v.colourSum[2];
    const horizontal = Math.hypot(v.normalSum[0], v.normalSum[2]);
    tiltSum += Math.atan2(v.normalSum[1], horizontal);
  }
  const capTiltRad = tiltSum / views.length;
  const colour: [number, number, number] = [colourSum[0]! / covered, colourSum[1]! / covered, colourSum[2]! / covered];
  const albedo = luma(colour[0], colour[1], colour[2]);

  // THE FIT. One number, chosen by search over the cap radii, scoring the WORST ratio between what
  // the card would emit and what the form does, over every azimuth measured and every hour of the
  // day. The worst rather than the mean because a card that is right on average and four times too
  // dark with the sun behind it is a far field that changes brightness as you turn, which is the
  // failure this whole file is about; and over the whole day rather than at dusk because the world
  // has a clock in it and a card fitted to a sixteen degree sun is wrong at noon.
  //
  // `forceCapRadius` is the control the fit is measured against and nothing else uses it: passing 0
  // is the flat-faced card, which is what every class looked like before the fit existed, and
  // tests/scatterImpostor.test.mts derives the whole table both ways so the fit's worth is a
  // difference in one process rather than a number in this comment.
  let best = { capRadius: 0, cost: Infinity, low: 0, high: 0, mean: 1 };
  for (const r of forceCapRadius === undefined ? FIT_RADII : [forceCapRadius]) {
    const corners = capNormals(r, capTiltRad);
    let low = Infinity;
    let high = 0;
    let logSum = 0;
    let n = 0;
    for (let h = 0; h < hours.length; h++) {
      for (const v of views) {
        // Total light, not radiance: the card's area and the form's differ by the raster's own
        // quantisation, and what a three-pixel object delivers to the eye is area times radiance.
        const ratio = (albedo * cardResponse(v.dir.x, v.dir.z, corners, hours[h]!) * areaM2) / (v.lit[h]! * v.areaM2);
        if (ratio < low) low = ratio;
        if (ratio > high) high = ratio;
        logSum += Math.log(ratio);
        n++;
      }
    }
    const cost = Math.max(Math.log(high), -Math.log(low));
    if (cost < best.cost) best = { capRadius: r, cost, low, high, mean: Math.exp(logSum / n) };
  }

  const profile: ImpostorProfile = {
    heightM,
    footM,
    areaM2,
    centroidM,
    widthBottomM: sum * (2 - k),
    widthTopM: sum * (k - 1),
    colour,
    capTiltRad,
    capRadius: best.capRadius,
    ratioLow: best.low,
    ratioHigh: best.high,
    ratioMean: best.mean,
    centroidClamped: k !== wanted,
  };
  return { geometry: cardGeometry(profile), profile };
}

/**
 * The impostor of a class, built once and kept.
 *
 * Memoised on the id because the form is a pure function of the id and the derivation is 1 to 14 ms
 * of rasterising: a second parcel, a remount, or a route change pays nothing. The geometry is
 * SHARED between every InstancedMesh that draws this class, which is why `dispose` in the layer
 * must not dispose it; two triangles times twenty-six classes is 4 KB and it outlives any world.
 */
const cache = new Map<AssetClassId, Impostor>();

export function impostorFor(id: AssetClassId): Impostor {
  const held = cache.get(id);
  if (held) return held;
  const builder = SCATTER_GEOMETRY[id];
  if (!builder) throw new Error(`[scatter] no form for class "${id}", so no impostor either`);
  const form = builder();
  try {
    const made = deriveImpostor(form);
    cache.set(id, made);
    return made;
  } finally {
    form.dispose();
  }
}

/**
 * The radius, about `about`, of the cylinder the card sweeps as it turns to face the lens.
 *
 * WHY IT IS NOT THE CARD'S OWN BOUNDING SPHERE. The bucket boxes the split culls with are built
 * from ONE sphere per class, the form's, and both meshes are culled by them; a box that held only
 * the form could cull a bucket whose card was still on screen. Taking the union of the two spheres
 * the loose way, centre distance plus radius, widened buttress-tree's from 7.91 m to 8.21 m, and a
 * 4% wider box is 0.3% more buckets through the SHADOW frustum as well, which would have moved
 * DECISIONS C20's numbers for nothing.
 *
 * So this is the exact answer instead: the card turns about the upright axis, so a vertex at
 * (x, y, z) sweeps a circle of radius |x| at height y, and its furthest point from `about` is
 * `hypot(horizontal(about) + |x|, y - about.y)`. Measured over the whole table it leaves twenty-five
 * of the twenty-six classes' spheres untouched, and widens conifer's by 0.06 m of 4.52.
 */
export function sweptRadius(geometry: THREE.BufferGeometry, about: THREE.Vector3): number {
  const pos = geometry.getAttribute("position").array as ArrayLike<number>;
  const horizontal = Math.hypot(about.x, about.z);
  let worst = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const r = Math.hypot(horizontal + Math.abs(pos[i]!), pos[i + 1]! - about.y);
    if (r > worst) worst = r;
  }
  return worst;
}

// ── turning to face the lens ────────────────────────────────────────────────────

/**
 * The same arithmetic as GLSL, injected before `begin_vertex` so both the position and the normal
 * are turned by it.
 *
 * IT IS A PRE-ROTATION, not a replacement of the instance matrix, and that is what keeps the layer
 * honest: three still multiplies by `instanceMatrix` in `project_vertex` and by its rotation in
 * `defaultnormal_vertex`, so the buffer the GPU reads is the placer's own matrices and every test
 * that compares packed matrices against the placement still means what it says.
 *
 * `cameraPosition` is a world-space uniform three declares in every vertex shader, and the
 * instance's translation is in the MESH's local space. The two are the same space only while the
 * mesh's world matrix is the identity, which it is: scatterLayer adds every InstancedMesh straight
 * to the scene and never transforms one.
 *
 * THERE IS NO TYPESCRIPT TWIN OF THIS, and that is deliberate rather than an omission. groundGrain
 * states its arithmetic twice because the CPU needs the same answer the shader gives; nothing on
 * the CPU needs this yaw, so a twin would exist only to be compared against, which is the shape of
 * a guard that cannot fail. What guards it instead is a pair of pixel readings in
 * `tests/e2e/scatterImpostor.spec.ts`, on the shipped material, and between them they catch every
 * way this can be wrong. The far band is rendered alone and its covered pixels counted: with the
 * patch removed the cards keep the yaw the placer gave them and cover about two thirds as much, so
 * a patch that never reached the material reads the same both ways and fails; a sign error turns
 * every card away from the lens, where `FrontSide` culls it and the count goes to nothing; and
 * leaving out the subtraction of the instance's own yaw leaves the cards at arbitrary headings,
 * which reads the same as no patch at all.
 */
const BILLBOARD_GLSL = `
	vec3 impostorRow = instanceMatrix[ 0 ].xyz;
	float impostorScale = length( impostorRow );
	float impostorCosA = impostorRow.x / impostorScale;
	float impostorSinA = - impostorRow.z / impostorScale;
	vec2 impostorToEye = cameraPosition.xz - instanceMatrix[ 3 ].xz;
	float impostorLen = length( impostorToEye );
	float impostorCosT = impostorLen > 1e-6 ? impostorToEye.y / impostorLen : impostorCosA;
	float impostorSinT = impostorLen > 1e-6 ? impostorToEye.x / impostorLen : impostorSinA;
	float impostorCos = impostorCosT * impostorCosA + impostorSinT * impostorSinA;
	float impostorSin = impostorSinT * impostorCosA - impostorCosT * impostorSinA;
	mat3 impostorTurn = mat3(
		impostorCos, 0.0, - impostorSin,
		0.0, 1.0, 0.0,
		impostorSin, 0.0, impostorCos );
`;

/**
 * The one material every impostor mesh shares.
 *
 * ONE, and shared across classes on purpose: the colour rides on the vertices, so a fern's card and
 * a thicket's differ only in their buffers. That is one program for the whole far band rather than
 * one per class, which matters because a program is compiled on the frame it is first used and this
 * one is first used the moment somebody turns round.
 *
 * `flatShading` is OFF here where every other scatter material has it on, and it is the only reason
 * the fitted normals mean anything: flat shading throws the normal attribute away and takes the
 * facet's own screen-space derivative instead, which for a card facing the lens is exactly the
 * flat-faced case the fit was measured rejecting. `FrontSide` is safe because the card has just
 * turned to face the lens.
 */
export function impostorMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, side: THREE.FrontSide });
  // A mark the shipped world can be asked about, exactly as groundGrain.ts carries one: without it
  // the only way to know the far band is patched is to read the pixels.
  material.userData.scatterImpostor = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <beginnormal_vertex>", `${BILLBOARD_GLSL}\n#include <beginnormal_vertex>\n	objectNormal = impostorTurn * objectNormal;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n	transformed = impostorTurn * transformed;`);
  };
  material.customProgramCacheKey = () => "scatter-impostor-c21";
  return material;
}
