/**
 * The grain in the ground (task A28): the metre-scale mottle of the floor, drawn per fragment
 * because the 12 m lattice groundColour.ts paints on cannot reach it.
 *
 * WHY THERE HAS TO BE A SECOND INSTRUMENT AT ALL, measured rather than asserted. Casting 128 by 80
 * rays through the real camera on the frozen dusk frame and reading the ALBEDO each one lands on,
 * interpolated off the very BufferAttribute the mesh is drawn from:
 *
 *   distance band          0-10 m   10-20   20-30   30-45   45-90
 *   share of ground rays    43.4%   39.8%   12.4%    3.6%    0.8%
 *   albedo sd, levels/255    0.23    0.70    0.80    1.08    2.26
 *
 * and the whole frame's ground touches 25 distinct 12 m lattice cells. Eighty-three percent of the
 * ground a person looks at is inside twenty metres, and inside ten metres the floor is one triangle
 * with a Gouraud gradient across it. That is not an amplitude that can be turned up. Measured the
 * same way, the frame sd a UNIT value field delivers into the 0 to 10 m band by its wavelength is
 *
 *   0.5 m 0.202   1 m 0.193   2 m 0.187   4 m 0.171   8 m 0.096   12 m 0.053   18 m 0.027
 *   24 m 0.016   36 m 0.007   72 m 0.002
 *
 * against the field's own sd of 0.204. The finest thing the vertex lattice can carry without
 * aliasing is three lattice steps, 36 m, and it delivers 3.6% of itself to the ground under a
 * person's feet. A field at a metre delivers 95%. The gap is a factor of 26, so no re-weighting of
 * the vertex paint reaches the near field and A10's own header said as much before it was measured:
 * "the last ten metres would need a finer mesh or a fragment shader."
 *
 * WHAT IT DRAWS, and why it is not a texture. Every ground in this world is a mixture of two
 * materials at the metre scale: leaf drift over bare mould, shell lag over sand, tussock over
 * clay, hoar over wind slab. {@link GRAIN_PAIRS} names both for each biome out of the palette, and
 * the fragment moves the ground along the axis between them by a zero-mean amount. It does not add
 * a colour of its own, it does not lighten the floor on average, and it cannot introduce a hue that
 * is not already in the two materials the recipe blends. What is drawn is the RATIO of the two,
 * which the vertex colour already carries as an area average over 144 square metres.
 *
 * SO THE FORM IS A RELATIVE SWING, AND THAT IS WHAT RESPECTS THE CANOPY CLOSURE (DECISIONS C17).
 * By the time this runs, `diffuseColor` is the vertex colour, which is the paint blended towards
 * PALETTE.shadow by the closure: c = ink + (albedo - ink) * T. The grain is applied as
 *
 *     c += (c - ink) * axis * swing
 *
 * so it carries the same factor T as the ground it sits on. A floor under a closed canopy keeps 46%
 * of its sky and gets 46% of its mottle; open sand gets all of it. Adding a fixed colour instead
 * would have made the grain GLOW under the trees, brightening exactly the ground C17 spent a layer
 * darkening. It also means the floor cannot be pushed below the ink: the swing is bounded at
 * {@link GRAIN_CLAMP} times {@link GRAIN_SWING} times the axis, which is 0.34 at the widest pair in
 * the table, so (c - ink) is scaled by at least 0.66 and never turns negative.
 *
 * THE OCTAVE LADDER, and the hole it exists to fill. The vertex paint's finest field is 36 m. Three
 * octaves at 12, 2.7 and 0.6 m carry the ground from there down to the scale of a foot, at ratios
 * of 4.4 and 4.5, which is the same spacing the vertex ladder uses. Leaving the 12 m octave out was
 * tried and rejected: 2.7 m grain against 36 m paint is four octaves of nothing in between, and the
 * floor reads as fine grit sprinkled over big soft blobs rather than as one surface.
 *
 * EACH OCTAVE FADES OUT WHERE THE SCREEN CAN NO LONGER RESOLVE IT, which is the whole defence
 * against fizz and it is not a distance dial. `fwidth` of the world position gives the metres of
 * ground one pixel covers AT THIS FRAGMENT, which already accounts for the grazing angle a floor is
 * always seen at; an octave is at full strength while its period covers {@link GRAIN_FULL_PX}
 * pixels and gone by {@link GRAIN_CUT_PX}. This is texture LOD selection done by hand, and it is
 * the physics as well: detail smaller than a pixel averages to its own mean, which is exactly what
 * the vertex colour already holds. It is also why the grain does not fight the paint at the
 * crossover: as the fine octaves fade with distance the 36 m field is taking over.
 *
 * WHAT IT COSTS. Twelve integer hashes and three smoothsteps per ground fragment, no texture, no
 * second material, no second draw call and nothing at build. Measured on the shipped routes at
 * 1280 by 800 with vsync off (DECISIONS C16), as the best of five blocks of 400 back-to-back
 * renders with a gl.finish at the end of each: 0.840 ms a frame on the ordinary parcel against
 * 0.824 with the patch not installed, and 0.458 against 0.457 on the demo. That is 16 microseconds
 * and 1, against the 8.3 ms p50 the reference laptop has to hit. Comparing against GRAIN_SWING = 0
 * instead was rejected as a measurement: the driver is free to fold a multiply by zero away and
 * delete the whole ladder with it, so the baseline is the material with no patch on it at all.
 *
 * AND WHAT IT ADDS, at the pixels, through the real camera on the real GPU: the same frame re-lit
 * with both lights at zero under one white ambient at PI, which is what a Lambert BRDF's 1/PI
 * cancels, so every ground pixel comes back as its own albedo. Albedo sd by distance band, without
 * the grain and with it:
 *
 *   ordinary parcel   0-10 m  0.53 -> 2.01   10-20  0.95 -> 2.36   20-30  1.85 -> 1.87
 *                     30-45   1.62 -> 1.57   45-90  1.46 -> 1.69
 *   the demo          0-10 m  0.60 -> 1.92   10-20  1.02 -> 2.61   20-30  1.78 -> 2.31
 *
 * The near bands move by 3.2 to 3.8x and the bands past twenty metres do not move at all, which is
 * the ladder doing exactly what the fwidth fade says it should: the grain fills the band the vertex
 * lattice cannot reach and hands over where the lattice takes it.
 *
 * THE TWIN IS PINNED, NOT TRUSTED. {@link grainAt} is this file's TypeScript statement of the same
 * arithmetic, and it exists so a node test can measure the grain without a GPU. Both halves are
 * built from the constants in this file, and tests/e2e/groundGrain.spec.ts renders the real shader
 * under flat white light and compares it against the twin at the pixels it actually drew, so a
 * divergence between the two is a failing test rather than a silent lie.
 */

import { BIOMES, linearRgb, type Biome } from "@echo/planet";

import { PALETTE } from "../three/palette";

/**
 * The two materials each ground is a mixture of at the metre scale.
 *
 * Each pair is taken from the recipe that paints that biome in groundColour.ts, so the grain moves
 * the ground between materials it is already made of and can never introduce one it is not. A
 * biome with no entry gets no grain at all, which is the honest answer for the sea floor.
 *
 * The pairs are ordered bright-first only so the axis below has a consistent sign; the swing is
 * symmetric, so the order does not change what is drawn.
 */
export const GRAIN_PAIRS: Partial<Record<Biome, readonly [number, number]>> = {
  // Leaf drift over the wet mould underneath it: the recipe's own two ends.
  rainforest: [PALETTE.litter, PALETTE.humus],
  forest: [PALETTE.litter, PALETTE.humus],
  // A boreal floor is a mat: needle litter where it is dry, feather moss where it is not.
  taiga: [PALETTE.litter, PALETTE.conifer],
  // Frost-heaved gravel through the lichen mat, at the scale of a boot rather than of a polygon.
  tundra: [PALETTE.rockLight, PALETTE.lichen],
  // Tussock and the bare hard-baked ground between the tussocks.
  savanna: [PALETTE.thatch, PALETTE.clay],
  grassland: [PALETTE.thatch, PALETTE.grass],
  // The coarse pale shell and quartz lag the wind works out of a beach, against the sand under it.
  beach: [PALETTE.sandDry, PALETTE.sand],
  // Desert pavement: a lag of varnished stone lying on pale sand, which is the commonest desert
  // surface there is and the reason a desert is not one colour at any scale.
  desert: [PALETTE.sandDry, PALETTE.clay],
  "bare-rock": [PALETTE.rockLight, PALETTE.rock],
  // Wind slab against the hoar in its lee. This pair is the one that is NOT a value axis: snowLit
  // and snowShade differ in hue at almost the same value, so a snowfield mottles warm to cool while
  // a forest floor mottles light to dark. That is the reason the axis is per vertex and not one
  // constant: a single warm axis would have put a brown mottle on snow and nobody would have seen
  // it in a screenshot of the two shipped routes, neither of which has any.
  snow: [PALETTE.snowLit, PALETTE.snowShade],
};

/** The ink. The grain is a swing about `c - SHADOW`, so this is where the floor bottoms out. */
const SHADOW = linearRgb([(PALETTE.shadow >> 16) & 0xff, (PALETTE.shadow >> 8) & 0xff, PALETTE.shadow & 0xff]);

const lin = (hex: number): readonly [number, number, number] =>
  linearRgb([(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]);

/**
 * The axis a biome's ground swings along, per channel, as the RELATIVE contrast of its two
 * materials: (A - B) / (A + B) in linear.
 *
 * Relative rather than absolute because the swing multiplies the ground's own colour: a dark hollow
 * and a pale crest painted from the same two materials should mottle by the same PROPORTION, which
 * is what a mixture of two albedos does, and not by the same number of levels, which is what an
 * additive difference would do and which would wash the dark end out.
 *
 * Measured, the eleven axes: rainforest and forest (0.69, 0.66, 0.70), a value axis with almost no
 * hue in it; beach (0.10, 0.16, 0.24), a much gentler one because dry sand and damp sand are close;
 * snow (0.09, 0.00, -0.10), which has no value in it at all and is purely warm against cool.
 */
export function grainAxis(biome: Biome): readonly [number, number, number] {
  const pair = GRAIN_PAIRS[biome];
  if (!pair) return [0, 0, 0];
  const a = lin(pair[0]);
  const b = lin(pair[1]);
  return [0, 1, 2].map((i) => {
    const sum = a[i]! + b[i]!;
    return sum > 0 ? (a[i]! - b[i]!) / sum : 0;
  }) as unknown as readonly [number, number, number];
}

/** Every biome's axis, as the Int8 the attribute carries. Built once; the paint reads it per vertex. */
export const GRAIN_AXIS_BYTES: Int8Array = (() => {
  const out = new Int8Array(BIOMES.length * 3);
  BIOMES.forEach((b, i) => {
    const axis = grainAxis(b);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(-127, Math.min(127, Math.round(axis[c]! * 127)));
  });
  return out;
})();

/**
 * The octaves, in metres, and their weights.
 *
 * 12 m is where the vertex paint's own finest field, 36 m, stops being drawable and this one starts;
 * 2.7 and 0.6 continue at the same 4.4x spacing down to the scale of a boot. Equal weights, because
 * a natural surface's albedo is close to scale invariant over this range and there is no
 * measurement in this project that says otherwise; the ladder's SHAPE is what was chosen, and the
 * one number that sets how loud it is lives in GRAIN_SWING below.
 */
export const GRAIN_OCTAVES: readonly { readonly lambdaM: number; readonly weight: number }[] = [
  { lambdaM: 12, weight: 1 },
  { lambdaM: 2.7, weight: 1 },
  { lambdaM: 0.6, weight: 1 },
];

/**
 * The standard deviation of the summed, weight-normalised octaves, so `grainAt` can return a signal
 * of unit spread and {@link GRAIN_SWING} can be read as a relative standard deviation rather than
 * as an arbitrary gain. One value-noise field has sd 0.2041 over the plane; three independent ones
 * averaged have 0.2041 / sqrt(3) = 0.1179, which is what the constant is and what a test measures.
 */
export const GRAIN_UNIT_SD = 0.1179;

/**
 * How far the ground swings along its own axis, as a relative standard deviation in linear.
 *
 * DERIVED AGAINST THE FRAME, not chosen. The band this exists for is 0 to 10 m, where 43% of the
 * ground rays land and where the vertex paint delivers an albedo sd of 0.23 levels of 255. The
 * paint's own spread over the ground beyond twenty metres, which is the part of the floor it CAN
 * draw, is 0.8 to 2.3 levels; a floor whose near half is flatter than its far half reads as a
 * gradient toward the camera rather than as one surface, and a floor whose near half is louder
 * reads as fizz laid over ground. So the near band is matched to the far band and not exceeded.
 *
 * On the rainforest axis, 0.69, a relative linear sd of 0.16 * 0.69 = 0.110 is an sRGB albedo sd of
 * 0.110 * 55.5 / 2.4 = 2.5 levels of 255 on a floor whose mean is 55.5, since sRGB compresses a
 * relative change by about the 2.4 of its exponent. Measured, it comes out at 2.6. That is inside
 * the 0.8 to 2.3 the paint draws beyond twenty metres, and it is about a twentieth of the 48 levels
 * between litter and humus, which is a floor with grain in it and not a floor made of grain.
 *
 * MEASURED, not predicted: through the real camera at 1280 by 800, the 0 to 10 m band's albedo sd
 * goes from 0.53 levels to 2.01 on the ordinary parcel and 0.60 to 1.92 on the demo, against the
 * 1.87 and 2.31 the paint draws at 20 to 30 m. Front to back the floor now reads 2.01 / 2.36 /
 * 1.87 / 1.57 / 1.69, which is one surface rather than a gradient toward the camera.
 *
 * 0.24 was rendered and looked at side by side with this and REJECTED, and the reason is the
 * criterion above rather than taste: it takes the near band to about 3.0 against the far band's
 * 1.87, so the floor underfoot becomes the loudest thing in the frame. At dusk, where this world
 * spends its time, neither is conspicuous: DECISIONS C18's own measurement is that 94% of the
 * rendered floor is light, and a 12% swing in albedo on a floor at sRGB 24 is about 1.2 levels of
 * rendered luminance against the 10.4 the shadow bands already put there. At midday it is plainly
 * visible and it reads as leaf litter. That asymmetry is correct for a world whose art bible asks
 * for value-muted and melancholic, and it is why the amplitude is set against the albedo, which
 * this file controls, rather than against the pixels, which the hour controls.
 */
export const GRAIN_SWING = 0.16;

/**
 * The swing is clamped at this many standard deviations.
 *
 * Three octaves summed give a bell, so |m| over 3 is about three parts in a thousand, and the clamp
 * costs nothing at the middle of the distribution. What it buys is a hard guarantee at the tail: the
 * widest axis in the table is 0.70, so the worst swing any fragment can take is 3 * 0.16 * 0.70 =
 * 0.336, and `c - ink` is therefore multiplied by at least 0.664 and can never change sign. The art
 * bible's ban on black holds by construction rather than by a bound somebody measured once.
 */
export const GRAIN_CLAMP = 3;

/**
 * An octave is at full strength while one period covers this many pixels, and gone at the other.
 *
 * The measure is `fwidth` of the world position: the metres of ground one pixel covers at this
 * fragment, which already carries the grazing angle a floor is always seen at, so the same two
 * numbers hold at the bottom of the frame and at the horizon and on any viewport. Eight pixels a
 * period is four to a lobe, which is where a value field stops being a shape and starts being a
 * shimmer as the camera eases; three is where it is indistinguishable from per-pixel noise. Nothing
 * is drawn between those two: the octave is faded out across them and the vertex paint's own 36 m
 * field is what is left, which is the crossover this ladder was built to make invisible.
 */
export const GRAIN_FULL_PX = 8;
export const GRAIN_CUT_PX = 3;

// ── the arithmetic, twice: once for the GPU and once for a test ─────────────────

/**
 * The hash. Integer, and written the same way on both sides: `Math.imul` and `| 0` give exactly the
 * 32-bit wrap `uint` does in GLSL ES 3.00, which three's renderer has been the only target for
 * since r163. A float hash was rejected for exactly this reason: `fract(sin(x) * 43758.5453)` is a
 * different number in float32 and float64 and the twin could not have been pinned to the shader.
 *
 * THE ADDED CONSTANT IS LOAD-BEARING AND IT WAS CAUGHT BY THE PIXELS, not by reasoning. Without it
 * every multiply-and-xor mixer returns exactly zero for the cell (0, 0, salt 0), and small
 * coordinates mix badly for several cells around it. The camera sits at the origin of the region's
 * own frame, so that is precisely the ground a person is standing on: measured over the 6,045
 * ground rays of the parcel's frame, the signal's mean came back at -0.83 of a standard deviation
 * where the same function over a 1.6 km patch gives -0.001, and the whole near floor was 4.3% darker
 * than the paint said it should be. A hash that is wrong at the origin is wrong exactly where this
 * world is looked at.
 *
 * `salt` separates the octaves. Without it the three of them share a cell index wherever
 * floor(x/l1) equals floor(x/l2), which is most of the ground near the origin, and the ladder
 * collapses into one field with steps in it.
 */
function hash01(ix: number, iy: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(salt, 1013904223) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Value noise on a square lattice of side `lambda`, the same curve scene.ts interpolates with. */
function valueNoise(x: number, z: number, lambda: number, salt: number): number {
  const fx = x / lambda;
  const fz = z / lambda;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = ease(fx - ix);
  const tz = ease(fz - iz);
  const a = hash01(ix, iz, salt);
  const b = hash01(ix + 1, iz, salt);
  const c = hash01(ix, iz + 1, salt);
  const d = hash01(ix + 1, iz + 1, salt);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * tz;
}

/**
 * The grain signal at a point on the ground, in standard deviations, with each octave weighted by
 * how many pixels of screen its period covers.
 *
 * `metresPerPixel` is what `fwidth(worldPosition.xz)` measures in the shader: pass the same thing
 * and this returns the same number the GPU computed, which is what the e2e guard checks.
 */
export function grainAt(x: number, z: number, metresPerPixel: number): number {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < GRAIN_OCTAVES.length; i++) {
    const o = GRAIN_OCTAVES[i]!;
    const px = o.lambdaM / Math.max(metresPerPixel, 1e-4);
    const lod = px <= GRAIN_CUT_PX ? 0 : px >= GRAIN_FULL_PX ? 1 : ease((px - GRAIN_CUT_PX) / (GRAIN_FULL_PX - GRAIN_CUT_PX));
    weight += o.weight;
    if (lod <= 0) continue;
    sum += o.weight * lod * (valueNoise(x, z, o.lambdaM, i + 1) - 0.5);
  }
  const m = (weight > 0 ? sum / weight : 0) / GRAIN_UNIT_SD;
  return m < -GRAIN_CLAMP ? -GRAIN_CLAMP : m > GRAIN_CLAMP ? GRAIN_CLAMP : m;
}

/**
 * The grained colour, given the ground's own colour and its axis. The one line the shader draws,
 * and the one a test can call.
 */
export function grainedColour(
  c: readonly [number, number, number],
  axis: readonly [number, number, number],
  m: number,
): [number, number, number] {
  return [0, 1, 2].map((i) => c[i]! + (c[i]! - SHADOW[i]!) * axis[i]! * (GRAIN_SWING * m)) as [number, number, number];
}

// ── the patch ───────────────────────────────────────────────────────────────────

const glslFloat = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/**
 * The fragment patch, built from the constants above so the two halves cannot drift apart in their
 * NUMBERS. That they cannot drift apart in their FORM is what the e2e guard is for.
 */
export const GROUND_GRAIN_FRAGMENT = `
float grainHash( ivec2 c, int salt ) {
  uint h = uint( c.x ) * 374761393u + uint( c.y ) * 668265263u + uint( salt ) * 1013904223u + 2654435769u;
  h = ( h ^ ( h >> 13u ) ) * 1274126177u;
  h = ( h ^ ( h >> 15u ) ) * 668265263u;
  h ^= h >> 16u;
  return float( h ) * ( 1.0 / 4294967296.0 );
}
float grainNoise( vec2 p, float lambda, int salt ) {
  vec2 f = p / lambda;
  ivec2 i = ivec2( floor( f ) );
  vec2 t = fract( f );
  t = t * t * ( 3.0 - 2.0 * t );
  float a = grainHash( i, salt );
  float b = grainHash( i + ivec2( 1, 0 ), salt );
  float c = grainHash( i + ivec2( 0, 1 ), salt );
  float d = grainHash( i + ivec2( 1, 1 ), salt );
  return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
float grainSignal( vec2 p, float mpp ) {
  float sum = 0.0;
  float weight = 0.0;
${GRAIN_OCTAVES.map(
  (o, i) => `  {
    float px = ${glslFloat(o.lambdaM)} / max( mpp, 1e-4 );
    float lod = smoothstep( ${glslFloat(GRAIN_CUT_PX)}, ${glslFloat(GRAIN_FULL_PX)}, px );
    weight += ${glslFloat(o.weight)};
    sum += ${glslFloat(o.weight)} * lod * ( grainNoise( p, ${glslFloat(o.lambdaM)}, ${i + 1} ) - 0.5 );
  }`,
).join("\n")}
  float m = ( sum / weight ) / ${GRAIN_UNIT_SD};
  return clamp( m, -${glslFloat(GRAIN_CLAMP)}, ${glslFloat(GRAIN_CLAMP)} );
}
`;

/**
 * Install the grain on the ground material.
 *
 * onBeforeCompile rather than a ShaderMaterial of our own: the ground is a MeshLambertMaterial and
 * it must stay one, because the shadow map, the fog, the two lights and the vertex colours are all
 * three's and none of them are worth reimplementing to add twelve hashes. The patch takes the
 * colour AFTER `color_fragment`, which is where `diffuseColor` has just been multiplied by the
 * vertex colour and is therefore the paint with DECISIONS C17's closure already in it.
 */
export function patchGroundGrain(material: import("three").Material): void {
  // A mark the SHIPPED world can be asked about. Without it the only way to see the grain was to
  // build a plane and patch it yourself, which is exactly what the browser spec did: it used the
  // app for a GL context and nothing else, so deleting the two lines in terrainChunks.ts that put
  // the grain on the real ground left 106 web tests, the GPU spec, the goldens and the relief
  // suite all green on a world with no grain at all.
  material.userData.groundGrain = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <color_pars_vertex>",
        `#include <color_pars_vertex>
attribute vec3 grainAxis;
varying vec3 vGrainAxis;
varying vec3 vGrainWorld;`,
      )
      .replace(
        "vViewPosition = - mvPosition.xyz;",
        `vViewPosition = - mvPosition.xyz;
	vGrainAxis = grainAxis;
	vGrainWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <color_pars_fragment>",
        `#include <color_pars_fragment>
varying vec3 vGrainAxis;
varying vec3 vGrainWorld;
const vec3 grainInk = vec3( ${SHADOW.map((v) => v.toFixed(8)).join(", ")} );
${GROUND_GRAIN_FRAGMENT}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
	{
		// The metres of ground one pixel covers here, grazing angle included: this is the mip level
		// the grain would have picked if it were a texture, and it is what keeps the far floor from
		// shimmering without a distance dial anywhere in the file.
		float grainMpp = length( fwidth( vGrainWorld.xz ) );
		float grainM = grainSignal( vGrainWorld.xz, grainMpp );
		diffuseColor.rgb += ( diffuseColor.rgb - grainInk ) * vGrainAxis * ( ${glslFloat(GRAIN_SWING)} * grainM );
	}`,
      );
  };
  // One material, one program, but a cache key is what tells three that this material is not the
  // same as an unpatched MeshLambertMaterial with the same parameters.
  material.customProgramCacheKey = () => "ground-grain-a28";
  material.needsUpdate = true;
}
