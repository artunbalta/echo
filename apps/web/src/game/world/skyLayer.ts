/**
 * The sky layer (contract W4-4): the air, the hour, and the one light in it.
 *
 * A person played the demo blind and said "the sky is orange". They were right, and they were
 * describing a bug: there was no sky, only `scene.background` set to a flat colour halfway between
 * the bible's dusk zenith and its dusk horizon. A wall of #955344 behind a world that never moved.
 * They also assumed the sky changed with the time of day, which is the assumption this file makes
 * true.
 *
 * ONE NUMBER DRIVES EVERYTHING. `timeOfDay` is in [0, 1): 0 is midnight, 0.25 sunrise, 0.5 midday,
 * 0.75 sunset. From it come the sun's azimuth and elevation, the key light's colour and strength,
 * the fill's colour and strength, the two gradient stops of the dome, the strength of the warm band
 * low in the sun's quarter, and the fog. Nothing here reads a clock or a frame counter for anything
 * else, so freezing the cycle (`rate: 0`) freezes the world's whole appearance, which is what makes
 * a screenshot comparable to another screenshot.
 *
 * THE FOG IS THE SKY AT THE HORIZON, always, exactly. The disk of ground is about 4 km across and it
 * ends; the bible would rather it dissolved. It dissolves only if the colour the far ground fades
 * INTO is the colour that is drawn immediately above it. One assignment keeps that true at every
 * hour, and sky.test.mts fails if it ever stops being true. The warm band is faded to nothing at the
 * horizon line itself for the same reason: it is a glow ABOVE the seam, never across it.
 *
 * THE BIBLE. "One low western dusk light, everything lit by it, long soft ink shadows, never black."
 * Dusk is still the hero hour: `DUSK` below is not a taste, it is the exact `t` whose sun direction
 * reproduces the vector the terrain layer used to hardwire, (-1, 0.3, 0.22) normalised, so the hour
 * the demo opens on is pixel-for-pixel the hour the art direction was written for. Midday is cool
 * and flat rather than bright, because this world is melancholic. Midnight is ink and never black:
 * the fill carries a floor derived from PALETTE.shadow, which is the darkest value the bible allows.
 *
 * Every colour here is a named palette entry or a documented interpolation between two of them.
 * There is not one hex literal below `blend`, on purpose: the palette is the vocabulary and mixing
 * is the only grammar.
 *
 * WHY THE GROUND WAS NEARLY BLACK. It was not tone mapping (the renderer is on NoToneMapping) and it
 * was not the hemisphere's ground colour (level ground takes the hemisphere's SKY colour at full
 * weight). It was the missing pi. three removed `useLegacyLights` in r165, and this repo is on
 * r169: light intensity is now used raw, while `MeshLambertMaterial` still divides by pi through
 * BRDF_Lambert. Intensities written for the old convention therefore arrive pi times too dark. The
 * terrain layer's key was 1.7 and its fill 0.9, and the key sits sixteen degrees up, so level ground
 * received 1.7 * sin(16.7 deg) / pi = 0.15 of the sun. Measured on the shipped frame, rainforest
 * ground rendered #323628; the model above predicts #343729, so the gap is fully accounted for and
 * nothing else is wrong. The intensities below are stated in the modern convention, which is why
 * they look about three times larger than a pre-r155 tutorial would write.
 *
 * AND WHY THEY MOVED AGAIN (A11, DECISIONS C3). That was one half of `albedo * E / pi`. This is the
 * other. packages/planet was writing sRGB bytes over 255 straight into a colour attribute three
 * reads as LINEAR, so the terrain's albedo was too bright by exactly what the transfer function
 * undoes: 3.57x on rainforest, 4.63x on ocean, 1.08x on snow. Fixing the seam is A11; re-deriving
 * `E` against the corrected albedo is this file's share of the same change, and the reasoning above
 * about the missing pi is untouched by it. See ALBEDO_FIX for the measurement.
 */

import * as THREE from "three";

import { WORLD_DAY_S, timeOfDay as hourAt, type WorldClock } from "@echo/planet";

import { PALETTE } from "../three/palette";
import type { LayerContext, WorldLayer } from "./PlanetWorld";

// ── the geometry of the day ─────────────────────────────────────────────────────

/**
 * The art bible's key, as the terrain layer hardwired it: due west, a little up, a little south.
 * Everything about the cycle's geometry is derived from this vector rather than from taste, so the
 * hour the demo opens on is the hour the bible describes and not an approximation of it.
 */
const BIBLE_KEY = new THREE.Vector3(-1, 0.3, 0.22).normalize();

/** How far the sun's track leans south of straight overhead. About 11.9 degrees. */
const SOUTH_TILT = Math.asin(BIBLE_KEY.z);

/** How high the bible's key stands above the horizon, inside that leaning plane. About 16.7. */
const BIBLE_ELEVATION = Math.asin(BIBLE_KEY.y / Math.cos(SOUTH_TILT));

/**
 * The hour the demo opens on: the sun in the WEST at the bible's elevation. Solving
 * `2*pi*(t - 0.25) = pi - elevation` puts it at about 0.7036, a little before 17:00.
 */
export const DUSK = 0.25 + (Math.PI - BIBLE_ELEVATION) / (2 * Math.PI);

/** Its mirror: the same elevation in the EAST. The colours match; the shadows point the other way. */
export const DAWN = 1 - DUSK;

export const MIDDAY = 0.5;
export const MIDNIGHT = 0;

/**
 * How far back along the light's direction the sun sits from whatever it is aimed at. The terrain
 * layer sizes its shadow camera against this, which is why it is exported rather than copied: two
 * files disagreeing about where the sun is would show up as a shadow frustum that clips.
 */
export const KEY_DISTANCE_M = 420;

/**
 * A full turn of the sky, in seconds, at the default rate. Twelve minutes.
 *
 * IT IS THE WORLD'S DAY, and it is imported rather than written here (DECISIONS C24, L5). The number
 * lived in this file for as long as the sky was the only thing that had an hour; a society that ages
 * measures its lifespans in the same day, so there is one constant and it is in @echo/planet with
 * the rest of the world's arithmetic. Moving it now rewrites every birth day on the planet.
 */
const DEFAULT_CYCLE_S = WORLD_DAY_S;

// ── colour, and only colour that the bible already owns ─────────────────────────

/**
 * A colour between two named palette entries, mixed in the linear working space three renders in
 * (`THREE.Color` stores linear once colour management converted the hex on the way in, so this is
 * the same mix the terrain layer's old `skyDusk -> skyHorizon` blend performed).
 */
const blend = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k);

/** The top of the dome. */
const ZENITH_NIGHT = blend(PALETTE.shadow, PALETTE.skyDusk, 0.55); // ink with the dusk violet in it
const ZENITH_TWILIGHT = new THREE.Color(PALETTE.skyDusk); // the bible's own dusk zenith, untouched
const ZENITH_DAY = new THREE.Color(0x4e91cb);

/**
 * Where the fog starts and where it has taken everything, metres of VIEW DEPTH.
 *
 * Exported because they are read outside this file now: DECISIONS C22 derives every class's
 * `lod.farM` against the contrast the fog leaves at a distance, and a fog band that moved without
 * that derivation moving with it would leave twenty-six distances measured against a camera nobody
 * has. The reasons the two numbers are what they are live on `SkyLayerOptions.fogNearM`.
 */
export const FOG_NEAR_M = 150;
export const FOG_FAR_M = 420;

/** The bottom of the dome, and therefore the fog. */
const HORIZON_NIGHT = blend(PALETTE.skyDusk, PALETTE.duskFill, 0.42); // lighter than the night zenith
const HORIZON_TWILIGHT = new THREE.Color(PALETTE.skyHorizon); // the bible's own dusk horizon
const HORIZON_DAY = new THREE.Color(0xc5dce5);

/** The one light. The sun while it is up, the moon while it is not; never two suns. */
const KEY_NIGHT = blend(PALETTE.duskFill, PALETTE.seaFoam, 0.3); // moonlight: pale, cold, weak
const KEY_TWILIGHT = new THREE.Color(PALETTE.dusk); // the bible's key, exactly
const KEY_DAY = blend(PALETTE.dusk, PALETTE.seaFoam, 0.55); // the warmth cooled off toward neutral

/** The hemisphere opposite it. */
const FILL_NIGHT = blend(PALETTE.skyDusk, PALETTE.duskFill, 0.5);
const FILL_TWILIGHT = new THREE.Color(PALETTE.duskFill); // the bible's cool sky fill
const FILL_DAY = blend(PALETTE.duskFill, PALETTE.seaFoam, 0.4);

/**
 * The warm band low in the sun's quarter. Hotter than the horizon stop it sits on, which is what
 * makes it read as a sun rather than as a lighter sky.
 */
const GLOW = blend(PALETTE.skyHorizon, PALETTE.dusk, 0.55);

/**
 * The ink the hemisphere shines UP from below. The old value was PALETTE.shadow neat, which is
 * within a hair of black, so every downward-facing facet in the world (a branch's underside, a rock
 * overhang, the shaded face of a hut) fell off a cliff. A breath of the hour's own sky in it keeps
 * those facets as ink, which is the bible's word, rather than as holes.
 */
const GROUND_BOUNCE_MIX = 0.3;

// ── how strong, hour by hour ────────────────────────────────────────────────────

/**
 * How much of the world's light the colour-space bug was standing in for.
 *
 * NOT a guess at "about 4x" and not a per-biome table. Measured end to end on the two shipped
 * routes with the seam fixed and every light in this file left exactly as F14 set it: rendered
 * ground fell from luma 48.52 to 22.23 on the rainforest parcel and from 75.56 to 37.64 on the
 * coastal demo, which is 3.70x and 3.75x once both are taken back into linear. Two routes with
 * different biome mixes agreeing to 1.5% is what says one exposure serves both, so the anchors
 * below are the F14 numbers times this and nothing else was touched.
 *
 * The key-to-fill RATIO is the art direction, which is to say how deep a shadow is, and it does not
 * appear here at all: only the albedo moved, so only the exposure moves.
 */
export const ALBEDO_FIX = 3.7;

/**
 * Intensities in three's post-r165 convention: raw, unscaled by pi. The pi that used to be applied
 * for you is the whole reason the shipped world rendered as a silhouette, so these numbers are
 * about three times the ones a pre-r155 tutorial would tell you to write. See the file header.
 *
 * `KEY_ANCHOR` is not the intensity, it is the irradiance the sun lands on LEVEL ground, which is
 * the number that decides whether the world reads. Intensity is then whatever it takes to deliver
 * it from the elevation the sun happens to be at, so a sun sixteen degrees up burns bright and a
 * sun overhead does not have to. That is what stops midday from becoming a different, happier game.
 */
const KEY_ANCHOR = 1.7 * ALBEDO_FIX;
const MOON_ANCHOR = 0.35 * ALBEDO_FIX;

/**
 * The fill's intensity by hour. Night's number is the LARGEST because night's colour is the
 * DARKEST: what lights the ground is the product, and the product at night is about a fifth of the
 * product at dusk. Reading the number alone will mislead you; read it against FILL_NIGHT.
 */
const FILL_NIGHT_I = 4.3 * ALBEDO_FIX;
const FILL_TWILIGHT_I = 0.9 * Math.PI * ALBEDO_FIX; // the terrain layer's old 0.9, through both fixes
const FILL_DAY_I = 2.0 * ALBEDO_FIX;

/** Rec. 709 relative luminance, on linear components. The one scalar "how bright is this". */
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * The floor under the whole world. PALETTE.shadow is the darkest value the bible permits and
 * 0x000000 is banned outright, so the fill is never allowed to deliver less irradiance than
 * `shadow`'s own luminance. At midnight the ramp is already well clear of it; the floor is here so
 * that a later tuning pass cannot quietly turn the night off and call it atmosphere.
 *
 * It carries ALBEDO_FIX for the same reason the ramp does. This is an IRRADIANCE, and the albedo it
 * lands on is now about 3.7x darker, so leaving the number alone would have quietly made the one
 * guard the night has 3.7x weaker while looking untouched.
 */
const SHADOW_LUMA = luminance(new THREE.Color(PALETTE.shadow)) * ALBEDO_FIX;

/** Below this the key delivers nothing worth a shadow pass, so the pass is skipped. */
const SHADOW_CUTOFF = 0.02;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** t into [0, 1), for a rate that has been running for an hour and for a caller who passed -0.3. */
export const wrapTime = (t: number) => ((t % 1) + 1) % 1;

// ── the state of the sky at one instant ─────────────────────────────────────────

export interface SkyState {
  /** The normalised hour this state was computed for. */
  timeOfDay: number;
  /** Unit vector pointing TO the sun. `y > 0` while it is above the horizon. */
  sun: THREE.Vector3;
  /** Unit vector pointing TO whatever is the key this hour: the sun by day, the moon by night. */
  keyFrom: THREE.Vector3;
  keyColour: THREE.Color;
  keyIntensity: number;
  fillSky: THREE.Color;
  fillGround: THREE.Color;
  fillIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  glowColour: THREE.Color;
  /** 0 at midday and at deep night, 1 with the sun on the horizon. */
  glow: number;
  /**
   * Linear irradiance on level, upward-facing ground, before albedo. This is the number the
   * "never black" rule is actually about, so it is carried in the state where a test can read it
   * rather than being an implicit consequence of two other numbers.
   */
  groundIrradiance: THREE.Vector3;
}

export const createSkyState = (): SkyState => ({
  timeOfDay: 0,
  sun: new THREE.Vector3(),
  keyFrom: new THREE.Vector3(),
  keyColour: new THREE.Color(),
  keyIntensity: 0,
  fillSky: new THREE.Color(),
  fillGround: new THREE.Color(),
  fillIntensity: 0,
  zenith: new THREE.Color(),
  horizon: new THREE.Color(),
  glowColour: new THREE.Color(),
  glow: 0,
  groundIrradiance: new THREE.Vector3(),
});

/** Three anchors, three weights, one colour. The weights always sum to one. */
function mix3(
  out: THREE.Color,
  night: THREE.Color,
  twilight: THREE.Color,
  day: THREE.Color,
  wNight: number,
  wTwilight: number,
  wDay: number,
): THREE.Color {
  return out.setRGB(
    night.r * wNight + twilight.r * wTwilight + day.r * wDay,
    night.g * wNight + twilight.g * wTwilight + day.g * wDay,
    night.b * wNight + twilight.b * wTwilight + day.b * wDay,
    THREE.LinearSRGBColorSpace,
  );
}

/**
 * The whole day cycle, as a pure function of one number. Nothing in here touches the scene, reads a
 * clock, or allocates when handed an `out`, so a test can walk twenty-four hours in a loop and the
 * frame loop can call it sixty times a second without noticing.
 */
export function skyState(t: number, out: SkyState = createSkyState()): SkyState {
  const time = wrapTime(t);
  out.timeOfDay = time;

  // The sun rides a circle that leans SOUTH_TILT to the south: east at 0.25, up at 0.5, west at
  // 0.75. `s` is the sine of its elevation and is the only variable the rest of the file needs.
  const phi = 2 * Math.PI * (time - 0.25);
  const lean = Math.cos(SOUTH_TILT);
  out.sun.set(Math.cos(phi) * lean, Math.sin(phi) * lean, Math.sin(SOUTH_TILT));
  const s = out.sun.y;

  // Three hours of the day, blended. The bands are disjoint, so the twilight weight is whatever the
  // other two leave behind and the three always sum to one. Twilight reaches from a little under
  // the horizon (afterglow) to a good way above it, which is why DUSK lands on pure twilight and
  // midday on pure day.
  const wNight = 1 - smoothstep(-0.25, 0, s);
  const wDay = smoothstep(0.3, 0.75, s);
  const wTwilight = Math.max(0, 1 - wNight - wDay);

  mix3(out.zenith, ZENITH_NIGHT, ZENITH_TWILIGHT, ZENITH_DAY, wNight, wTwilight, wDay);
  mix3(out.horizon, HORIZON_NIGHT, HORIZON_TWILIGHT, HORIZON_DAY, wNight, wTwilight, wDay);
  mix3(out.keyColour, KEY_NIGHT, KEY_TWILIGHT, KEY_DAY, wNight, wTwilight, wDay);
  mix3(out.fillSky, FILL_NIGHT, FILL_TWILIGHT, FILL_DAY, wNight, wTwilight, wDay);
  out.glowColour.copy(GLOW);

  // The warm band is a horizon effect: strongest with the sun ON the horizon, gone by the time it
  // is twenty-eight degrees either side of it. Below the horizon it is the afterglow, which is why
  // it is measured on |s| and not on s.
  out.glow = 1 - smoothstep(0, 0.75, Math.abs(s));

  // The key: the sun while it is up, the moon while it is not. One light, as the bible asks, whose
  // direction and colour change rather than a second light switched on at dusk.
  const sunUp = Math.max(s, 0);
  const moonUp = Math.max(-s, 0);
  const elevation = s >= 0 ? sunUp : moonUp;
  if (s >= 0) out.keyFrom.copy(out.sun);
  else out.keyFrom.copy(out.sun).multiplyScalar(-1);

  // What the key must LAND on level ground. The smoothstep takes the last degrees down to nothing
  // so nothing pops at the horizon crossing, and it falls faster than `elevation` does, so the
  // intensity below stays finite as the divisor goes to zero.
  const received =
    s >= 0
      ? KEY_ANCHOR * smoothstep(0, 0.12, sunUp) * (0.75 + 0.55 * sunUp)
      : MOON_ANCHOR * smoothstep(0, 0.15, moonUp) * (0.6 + 0.4 * moonUp);
  out.keyIntensity = elevation > 1e-4 ? received / elevation : 0;

  // The fill, floored. `shadow` is the floor, not the value: see SHADOW_LUMA.
  const fillRamp = FILL_NIGHT_I * wNight + FILL_TWILIGHT_I * wTwilight + FILL_DAY_I * wDay;
  const skyLuma = luminance(out.fillSky);
  out.fillIntensity = Math.max(fillRamp, skyLuma > 0 ? SHADOW_LUMA / skyLuma : 0);
  out.fillGround.copy(new THREE.Color(PALETTE.shadow)).lerp(out.fillSky, GROUND_BOUNCE_MIX);

  // A level, white, upward-facing facet: the key at its incidence plus the hemisphere at full sky
  // weight. The one number that says whether there is a world to see.
  out.groundIrradiance.set(
    out.keyColour.r * received + out.fillSky.r * out.fillIntensity,
    out.keyColour.g * received + out.fillSky.g * out.fillIntensity,
    out.keyColour.b * received + out.fillSky.b * out.fillIntensity,
  );

  return out;
}

/** The scalar the "never black" rule is tested on. */
export const sceneLuminance = (state: SkyState): number =>
  0.2126 * state.groundIrradiance.x + 0.7152 * state.groundIrradiance.y + 0.0722 * state.groundIrradiance.z;

// ── the dome ────────────────────────────────────────────────────────────────────

/**
 * The dome is centred on the camera and never rotated, so a vertex's own position IS the direction
 * you look to see it. No matrices, no inverse-view, no cost.
 */
const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Two stops and a band.
 *
 * The vertical mix is `pow(up, 0.42)` rather than a straight lerp because a straight lerp puts the
 * halfway colour forty-five degrees up, which is where a person actually looks, and the result is
 * the orange wall the playtester complained about. The power pulls the horizon stop down into a
 * band and lets the zenith own the dome.
 *
 * The band fades to nothing at `dir.y == 0`. That is not a taste either: the fogged ground meets
 * the sky along that line in exactly `uHorizon`, and anything warmer on the sky side of it would
 * draw the seam the fog exists to hide. So the glow lives just ABOVE the horizon, which is also
 * where a real sunset is brightest.
 */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSun;
uniform float uGlowAmount;
uniform float uCloudTime;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(cloudHash(i), cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);
}
float clouds(vec2 p) {
  float n = 0., a = .55;
  for (int i=0; i<5; i++) { n += cloudNoise(p) * a; p = p*2.03 + vec2(13.2, 7.1); a *= .48; }
  return n;
}
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.42));

  // Bearing only, so the warm quarter is a quarter of the sky and not a disc pinned to the sun.
  vec2 bearing = normalize(vec2(dir.x, dir.z) + vec2(1e-6));
  vec2 sunBearing = normalize(vec2(uSun.x, uSun.z) + vec2(1e-6));
  float toward = max(dot(bearing, sunBearing), 0.0);
  float band = smoothstep(0.0, 0.05, dir.y) * (1.0 - smoothstep(0.05, 0.42, dir.y));
  col = mix(col, uGlow, uGlowAmount * band * pow(toward, 2.5));

  if (dir.y > .015) {
    vec2 uv = dir.xz / (dir.y + .12) * 1.8 + vec2(uCloudTime * .006, 0.);
    float density = clouds(uv);
    float cloud = smoothstep(.43, .65, density) * smoothstep(.015, .12, dir.y);
    float edge = clouds(uv + vec2(.12, .09)) - density;
    vec3 cloudColour = mix(uHorizon * .68, vec3(1., .98, .91), clamp(.62 + edge * 3., 0., 1.));
    float daylight = smoothstep(-.08, .25, uSun.y);
    col = mix(col, cloudColour, cloud * daylight * .94);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ── the layer ───────────────────────────────────────────────────────────────────

export interface SkyLayerOptions {
  /** The hour to start at, in [0, 1). Defaults to the bible's dusk. Ignored when `clock` is given. */
  timeOfDay?: number;
  /**
   * The world's clock (DECISIONS C24). Given one, the hour is DERIVED from the epoch every frame
   * rather than accumulated from a starting value.
   *
   * This is the difference between a sky and a shared sky. Accumulation is per mount: two people
   * standing on the same ground each start their own morning and drift apart from there, which was
   * survivable while a parcel held one person and is a fork the moment it holds two. Derivation has
   * nothing to drift — the hour is a fact about the difference between two instants.
   *
   * `rate: 0` still freezes the sky, clock or no clock, because a screenshot has to be comparable
   * to another screenshot and a test has to be able to hold an hour still.
   */
  clock?: WorldClock;
  /**
   * Cycles per second. The default is a full turn in twelve minutes, which is slow enough not to
   * strobe and fast enough that two minutes of play visibly moves the sun. Zero freezes the sky,
   * which is what a screenshot or a test wants.
   */
  rate?: number;
  /**
   * The dome's radius, metres. Well inside the camera's 6000 m far plane, and well outside the
   * ~2 km disk of ground, so it is never clipped and never intersects anything.
   */
  radiusM?: number;
  /**
   * Where the fog takes the ground, and where it has taken all of it. The terrain layer's own
   * fallback keeps the same two numbers for the same reason: the disk is about 4 km across and the
   * scatter dresses only the first 500 m, so 420 m is far enough for a headland and near enough
   * that the rim and the undressed middle distance never show.
   *
   * NEITHER MOVED UNDER DECISIONS C1, and the reason is worth writing down so the next re-derivation
   * does not start from scratch. A taller landscape would push ground into the fog only if the eye
   * could reach it, and it cannot: over 2,560 rays cast through the frozen frame on each shipped
   * route, the FARTHEST ground pixel is 66 m away on the ordinary parcel and 70 m on the demo, at a
   * median of 11 m and a 95th percentile of 30 m. Not one ray of the four thousand reaches even the
   * near at 150 m, before OR after the height scale tripled. What closes the view is the canopy and
   * an 8 m camera boom, not the air, so the fog band is doing nothing to the ground a person sees
   * and there is nothing in it to re-derive. It is still earning its keep on the sky dome and on
   * the rim of the disk, which is what it was put there for.
   */
  fogNearM?: number;
  fogFarM?: number;
}

export interface SkyLayer extends WorldLayer {
  readonly name: "sky";
  /** Jump the cycle to an hour in [0, 1). Deterministic: one `t`, one sky. */
  setTimeOfDay(t: number): void;
  timeOfDay(): number;
  /** Cycles per second. Zero freezes the sky where it stands. */
  setRate(cyclesPerSecond: number): void;
  /** The current hour's whole state. The returned object is reused; copy what you keep. */
  state(): SkyState;
  /** Unit vector TO the sun. The terrain layer asks so its shadow box faces the right way. */
  sunDirection(out?: THREE.Vector3): THREE.Vector3;
  /** Unit vector TO the key light, which is the moon after dark. */
  keyDirection(out?: THREE.Vector3): THREE.Vector3;
  /**
   * The weather over the hour (C48): cloud greys the sky and dims the sun, fog pulls the air in,
   * and a flash is lightning. Each is 0…1. The hour's own colours are computed first and these only
   * lean on them, so night is still night under a cloud.
   */
  setWeather(w: { cloud: number; fog: number; flash?: number }): void;
}

export function skyLayer(options: SkyLayerOptions = {}): SkyLayer {
  const radius = options.radiusM ?? 3000;
  const fogNear = options.fogNearM ?? FOG_NEAR_M;
  const fogFar = options.fogFarM ?? FOG_FAR_M;
  let rate = options.rate ?? 1 / DEFAULT_CYCLE_S;
  const clock = options.clock ?? null;
  const derived = () => hourAt(clock as WorldClock, Date.now());
  let time = wrapTime(clock !== null ? derived() : options.timeOfDay ?? DUSK);

  const current = createSkyState();
  let dome: THREE.Mesh | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let scene: THREE.Scene | null = null;
  let key: THREE.DirectionalLight | null = null;
  let fill: THREE.HemisphereLight | null = null;
  let fog: THREE.Fog | null = null;
  const weather = { cloud: 0, fog: 0, flash: 0 };
  const overcast = new THREE.Color();

  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3() },
    uGlowAmount: { value: 0 },
    uCloudTime: { value: 0 },
  };

  /**
   * Push the current hour into everything that draws. Called on every frame the cycle moves and on
   * every `setTimeOfDay`, so there is exactly one path from `time` to the screen and no way for the
   * lights and the dome to disagree about what hour it is.
   */
  const apply = () => {
    skyState(time, current);
    // Weather leans on the hour (C48): an overcast sky is the hour's colours drawn toward their own
    // grey, and the sun behind it is dimmer; lightning is a moment of white.
    if (weather.cloud > 0 || weather.flash > 0) {
      const lum = (c: THREE.Color) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
      for (const c of [current.zenith, current.horizon]) {
        const l = lum(c) * 0.92;
        overcast.setRGB(l, l, l * 1.04);
        c.lerp(overcast, Math.min(0.8, weather.cloud * 0.8));
        if (weather.flash > 0) c.lerp(overcast.setRGB(0.92, 0.94, 1), weather.flash * 0.7);
      }
      current.keyIntensity *= 1 - 0.65 * weather.cloud;
      current.fillIntensity *= 1 - 0.2 * weather.cloud;
      current.keyIntensity += weather.flash * 2.5;
      current.glow *= 1 - weather.cloud;
    }

    uniforms.uZenith.value.copy(current.zenith);
    uniforms.uHorizon.value.copy(current.horizon);
    uniforms.uGlow.value.copy(current.glowColour);
    uniforms.uSun.value.copy(current.sun);
    uniforms.uGlowAmount.value = current.glow;

    if (key) {
      key.color.copy(current.keyColour);
      key.intensity = current.keyIntensity;
      // A sun on the horizon casts nothing worth a 2048-square depth pass, and a moon casts less.
      key.castShadow = current.keyIntensity > SHADOW_CUTOFF;
    }
    if (fill) {
      fill.color.copy(current.fillSky);
      fill.groundColor.copy(current.fillGround);
      fill.intensity = current.fillIntensity;
    }
    // The invariant the whole layer exists to keep: fog IS the sky's horizon stop.
    if (fog) {
      fog.color.copy(current.horizon);
      // Fog weather pulls the air in toward the body (C48); clear air leaves the band where it was.
      fog.near = Math.max(6, fogNear * (1 - 0.92 * weather.fog));
      fog.far = Math.max(45, fogFar * (1 - 0.9 * weather.fog));
    }
    // Duck-typed rather than `instanceof`, the way three tests its own objects: a scene handed in
    // from a different module record of three would fail the constructor check and silently stop
    // getting its clear colour.
    const background = scene?.background as THREE.Color | null | undefined;
    if (background?.isColor) background.copy(current.horizon);
  };

  const build = async (ctx: LayerContext, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return;
    scene = ctx.scene;

    // The air, before any layer after this one puts anything into it. The colour handed to the
    // constructor is replaced by `apply()` below before a single frame is drawn; `shadow` is here
    // only because this file is not allowed to write a hex literal.
    fog = new THREE.Fog(PALETTE.shadow, fogNear, fogFar);
    ctx.scene.fog = fog;
    // A background as well as a dome. The dome covers every pixel, so this is only the clear colour
    // behind it, but it is also the flag the terrain layer's fallback reads: a non-null background
    // means somebody owns the air already and terrain must not paint over it.
    ctx.scene.background = new THREE.Color();

    // The host makes a provisional key named "key" and the terrain layer names the hemisphere
    // "fill". Both are found by name rather than created, because a second sun is the one thing the
    // bible forbids outright. If neither has been made yet, this layer makes them, and whoever
    // comes later finds them under the same names.
    let foundKey = ctx.scene.getObjectByName("key") as THREE.DirectionalLight | undefined;
    if (!foundKey?.isDirectionalLight) {
      foundKey = new THREE.DirectionalLight();
      foundKey.name = "key";
      ctx.scene.add(foundKey);
    }
    key = foundKey;
    // A directional light only tracks its target while the target is in the graph. The terrain
    // layer moves that target to follow the camera; this layer only decides which way the light
    // comes from, so the two never fight over the same property.
    if (!key.target.parent) ctx.scene.add(key.target);

    let foundFill = ctx.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as
      | THREE.HemisphereLight
      | undefined;
    if (!foundFill) {
      foundFill = new THREE.HemisphereLight();
      ctx.scene.add(foundFill);
    }
    foundFill.name = "fill";
    fill = foundFill;

    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      // Behind everything, and it must not be fogged: the sky is what the fog fades TO.
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
    dome.name = "sky";
    // Drawn first, so every opaque thing in the world paints over it, and never culled, because it
    // is re-centred on the camera every frame and a stale bounding sphere would blink it away.
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    dome.position.copy(ctx.camera.position);
    ctx.scene.add(dome);

    apply();
    place();
  };

  /**
   * Put the sun where the hour says, at a fixed distance from whatever the shadow box is aimed at.
   *
   * The sky layer runs BEFORE the terrain layer, so on a frame where the camera moved this reads
   * the target the terrain layer set on the previous frame. The target is snapped to whole metres
   * and the light stands 420 m off it, so a one-frame lag is at most about a seventh of a degree of
   * direction: less than the shadow map's own snapping, and gone by the next frame.
   */
  const place = () => {
    if (!key) return;
    key.position.copy(key.target.position).addScaledVector(current.keyFrom, KEY_DISTANCE_M);
  };

  const update = (dt: number, ctx: LayerContext) => {
    uniforms.uCloudTime.value += dt;
    if (rate !== 0) {
      // With a clock, READ the hour; without one, advance it. `dt` never touches `time` on the
      // shared path, so a dropped frame, a backgrounded tab and a slow phone all agree on the hour.
      time = clock !== null ? wrapTime(derived()) : wrapTime(time + rate * dt);
      apply();
    }
    // The dome rides the camera, so a player who walks two kilometres never reaches the edge of the
    // sky and the gradient never shears.
    dome?.position.copy(ctx.camera.position);
    // Every frame, not only when the hour changes: the terrain layer moves the light's TARGET as
    // the camera moves, and the light's position has to follow it to keep the direction fixed.
    place();
  };

  const dispose = () => {
    if (dome) {
      dome.removeFromParent();
      dome.geometry.dispose();
    }
    material?.dispose();
    dome = null;
    material = null;
    // Hand the air back the way it was found, so a rebuild starts from a scene with no owner and
    // the terrain layer's fallback can see that for itself.
    if (scene) {
      scene.fog = null;
      scene.background = null;
    }
    fog = null;
    key = null;
    fill = null;
    scene = null;
  };

  return {
    name: "sky",
    build,
    update,
    dispose,
    setTimeOfDay(t: number) {
      time = wrapTime(t);
      apply();
      place();
    },
    timeOfDay: () => time,
    setRate(cyclesPerSecond: number) {
      rate = cyclesPerSecond;
    },
    state: () => current,
    setWeather(w) {
      weather.cloud = Math.max(0, Math.min(1, w.cloud));
      weather.fog = Math.max(0, Math.min(1, w.fog));
      weather.flash = Math.max(0, Math.min(1, w.flash ?? 0));
      apply();
    },
    sunDirection: (out = new THREE.Vector3()) => out.copy(current.sun),
    keyDirection: (out = new THREE.Vector3()) => out.copy(current.keyFrom),
  };
}
