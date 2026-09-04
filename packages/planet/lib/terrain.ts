/**
 * The terrain. One module, imported everywhere.
 *
 * This is the file the whole product rests on. The promise in section 1 is that the terrain
 * previewed on the globe is the terrain the player walks on, and that promise is kept by there
 * being exactly one implementation of these functions and no second copy anywhere. The globe
 * renderer, the in world scene builder and the server all call in here.
 *
 * Three rules govern everything below.
 *
 * 1. Pure. Same seed and same position give the same answer, forever, on a server and in a browser.
 *    No clock, no Math.random, no mutable state that reaches an output. The one piece of state is a
 *    per seed memo of the noise generators, which is a cache and cannot change an answer.
 *
 * 2. Sampled in 3D, on the sphere. Never as a 2D map wrapped onto lat/lng. A 2D field tears at the
 *    antimeridian and smears at the poles, and both faults are permanent once someone owns land on
 *    them. Sampling the 3D field at the point itself has neither problem and is less code.
 *
 * 3. Domain warped. The sample position is displaced by a second noise field before the main
 *    lookup. It is four lines and it is the difference between circular blobs and coastlines with
 *    inlets, peninsulas and bays. Everything else here is ordinary fBm.
 *
 * Sea level is NOT chosen here. It is calibrated once per planet by {@link calibrateSeaLevel},
 * written to the world manifest, and never recomputed. Elevation is a fixed field; sea level is
 * where we decided to put the water in it.
 */

import { createNoise3D, type NoiseFunction3D } from "simplex-noise";

import { latLngToVec3, vec3ToLatLng, type Vec3 } from "./geo.js";

/** The biome table's whole vocabulary. Small on purpose: eleven kinds a player can name on sight. */
export type Biome =
  | "ocean"
  | "beach"
  | "grassland"
  | "forest"
  | "rainforest"
  | "savanna"
  | "desert"
  | "tundra"
  | "taiga"
  | "bare-rock"
  | "snow";

export const BIOMES: readonly Biome[] = [
  "ocean", "beach", "grassland", "forest", "rainforest", "savanna",
  "desert", "tundra", "taiga", "bare-rock", "snow",
] as const;

/**
 * The shape of the land, as a set of dials rather than magic numbers scattered through the code.
 *
 * These are the planet's character. Changing any of them changes the terrain, which under section 3
 * means a new terrainVersion and a new world: never edit these for an existing planet.
 */
export interface TerrainTuning {
  /** Frequency of the continent field. Lower means fewer, larger landmasses. */
  continentFrequency: number;
  continentOctaves: number;
  /** Frequency of the field that displaces the sample position. Near the continent frequency. */
  warpFrequency: number;
  /** How far the sample position is displaced. This is the coastline quality dial. */
  warpStrength: number;
  detailFrequency: number;
  detailOctaves: number;
  /** How much the detail field contributes next to the continents. */
  detailAmplitude: number;
  /** Exponent applied to elevation. Above 1 it makes ground near sea level common and peaks rare. */
  redistribution: number;
  moistureFrequency: number;
  moistureOctaves: number;
  /** How much colder a unit of elevation makes a place. */
  lapseRate: number;
  /** How far latitude alone can be argued with. Small: the poles must stay cold. */
  temperatureVariation: number;
}

export const DEFAULT_TUNING: TerrainTuning = {
  continentFrequency: 1.2,
  continentOctaves: 4,
  warpFrequency: 0.9,
  warpStrength: 0.55,
  detailFrequency: 4.0,
  detailOctaves: 6,
  detailAmplitude: 0.28,
  redistribution: 1.6,
  moistureFrequency: 2.1,
  moistureOctaves: 4,
  lapseRate: 1.15,
  temperatureVariation: 0.05,
};

export interface TerrainField {
  readonly seed: string;
  readonly tuning: TerrainTuning;
  /** Height at a point on the unit sphere, in -1..1. Sea level is wherever calibration put it. */
  elevation(p: Vec3): number;
  /** How wet a place is, 0..1. */
  moisture(p: Vec3): number;
  /** How warm a place is, 0..1. Latitude and altitude, not a noise field. */
  temperature(p: Vec3): number;
}

// ── seeding ─────────────────────────────────────────────────────────────────────

/** FNV-1a. A string seed becomes a number without reaching for a dependency. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32, the generator the rest of the repo uses. Feeds simplex-noise, never called after. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractal Brownian motion: octaves of the same noise at doubling frequency and halving weight. */
function fbm(noise: NoiseFunction3D, x: number, y: number, z: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x * frequency, y * frequency, z * frequency);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ── the field ───────────────────────────────────────────────────────────────────

export function createTerrain(seed: string, tuning: TerrainTuning = DEFAULT_TUNING): TerrainField {
  // Every generator is drawn from one seeded stream, in a fixed order, so the whole planet is a
  // function of the seed string and nothing else.
  const rand = mulberry32(hashSeed(seed));
  const continents = createNoise3D(rand);
  const warpX = createNoise3D(rand);
  const warpY = createNoise3D(rand);
  const warpZ = createNoise3D(rand);
  const detail = createNoise3D(rand);
  const wetness = createNoise3D(rand);
  const weather = createNoise3D(rand);

  const t = tuning;

  const elevation = (p: Vec3): number => {
    const [x, y, z] = p;

    // Domain warping. The sample position is pushed sideways by a second low frequency field
    // before the continents are looked up, which is what turns a smooth blob boundary into a
    // coastline with bays and headlands. Three independent fields so the displacement is a real
    // 3D vector rather than the same offset in every axis.
    const wf = t.warpFrequency;
    const qx = x * t.continentFrequency + t.warpStrength * warpX(x * wf, y * wf, z * wf);
    const qy = y * t.continentFrequency + t.warpStrength * warpY(x * wf, y * wf, z * wf);
    const qz = z * t.continentFrequency + t.warpStrength * warpZ(x * wf, y * wf, z * wf);

    const base = fbm(continents, qx, qy, qz, t.continentOctaves);
    const rough = fbm(detail, x * t.detailFrequency, y * t.detailFrequency, z * t.detailFrequency, t.detailOctaves);

    // Both parts are roughly -1..1, so dividing by their combined weight keeps the sum in range.
    let e = (base + rough * t.detailAmplitude) / (1 + t.detailAmplitude);

    // Redistribution. Raising the magnitude to a power above 1 pulls values toward the middle of
    // the range, so once sea level is calibrated most land sits near it and high ground is scarce.
    // Applied symmetrically, before sea level exists, because sea level is a quantile of this field
    // and cannot be an input to it without the definition chasing its own tail.
    e = Math.sign(e) * Math.pow(Math.abs(e), t.redistribution);
    return clamp(e, -1, 1);
  };

  const moisture = (p: Vec3): number => {
    const [x, y, z] = p;
    const f = t.moistureFrequency;
    const n = fbm(wetness, x * f, y * f, z * f, t.moistureOctaves);

    // A latitude term, so deserts land where deserts land: wet at the equator, dry around 27
    // degrees, wet again around 55, dry at the poles. This is circulation, not noise, so it is
    // written as a function of latitude rather than hidden in another octave.
    const lat = Math.abs(vec3ToLatLng(x, y, z)[0]);
    const band = 0.15 * Math.cos((lat / 27.5) * Math.PI);

    // 0.52 rather than a half: four octaves of fBm have a standard deviation near 0.25, not 1, so
    // an unscaled sum leaves every moisture reading bunched around the middle and the table never
    // reaches desert or rainforest. Measured spread after scaling is a standard deviation of 0.19.
    return clamp(0.5 + 0.52 * n + band, 0, 1);
  };

  const temperature = (p: Vec3): number => {
    const [x, y, z] = p;

    // Latitude sets it, but measured as sin(latitude), which is the y component itself. That makes
    // temperature uniform in AREA rather than in degrees, so a threshold reads directly as "this
    // fraction of the planet is colder than that". Using degrees instead puts 74% of the surface
    // above 0.6 and gives a planet that is tropical almost everywhere, because half the area of a
    // sphere lies within 30 degrees of its equator.
    let temp = 1 - Math.abs(clamp(y, -1, 1));

    // Altitude takes it away. The lapse is driven by raw elevation above zero rather than above the
    // calibrated sea level, because the signature the design document specifies has no sea level in
    // it. Since calibration puts sea level a little below zero, the effect is that coastal lowland
    // gets no penalty and only real high ground is cold, which is the behaviour we wanted anyway.
    temp -= t.lapseRate * Math.max(0, elevation(p));

    // A small local term so isotherms are not perfect circles. Deliberately too weak to make a pole
    // warm or a tropic cold: latitude is not up for negotiation, section 5.5.
    const f = 1.7;
    temp += t.temperatureVariation * weather(x * f, y * f, z * f);

    return clamp(temp, 0, 1);
  };

  return { seed, tuning, elevation, moisture, temperature };
}

// ── the seed, and the one land predicate ────────────────────────────────────────

/**
 * The seed. A plain string, hashed by FNV-1a into the generators above. It is named as a type so
 * that a function taking a Seed says what it wants, and so that the day a seed becomes anything
 * more than a string there is one place to change.
 */
export type Seed = string;

/**
 * FNV-1a of a string, as a number in [0, 1). The spawn search and asset placement use it to put
 * candidates in a fixed order that does not depend on the order H3 happens to list them in.
 * `salt` mixes in a second value so one string can order several independent draws.
 */
export function hashString(s: string, salt = 0): number {
  let h = hashSeed(s);
  let v = salt | 0;
  for (let byte = 0; byte < 4; byte++) {
    h ^= (v & 0xff) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    v >>= 8;
  }
  return (h >>> 0) / 4294967296;
}

/**
 * THE land predicate. Every "is this water" question on the planet goes through here: the registry
 * (land.ts), the walkable scene and the biome table (elevation above sea level is what `ocean`
 * means in `biome`), the globe, walkability and the spawn search. One function, so assignability
 * and walkability can never disagree about a point.
 *
 * It is deliberately NOT quantised. A 1-ulp difference between engines would flip this predicate
 * only for a point whose elevation sits within 1e-16 of sea level; rounding to a coarser grid first
 * would flip it for any point within 1e-16 of a rounding boundary instead, which is no rarer. The
 * cross-engine guarantee is a golden test (plan I-4), not arithmetic here.
 */
export function isLand(field: TerrainField, seaLevel: number, direction: Vec3): boolean {
  return isLandHeight(field.elevation(direction) - seaLevel);
}

/**
 * The sign test itself, on a height above sea level (raw or normalised: normalisation is a
 * positive scale, so the sign survives it exactly). `biome` decides "ocean" with this, so the
 * biome table, the registry and walkability cannot be split by a future epsilon in one of them.
 */
export function isLandHeight(heightAboveSea: number): boolean {
  return heightAboveSea > 0;
}

// ── the contract from section 5.1, function for function ────────────────────────

const fields = new Map<string, TerrainField>();

/** The field for a seed, built once. A memo cannot change an answer, only how fast it arrives. */
export function terrainFor(seed: string): TerrainField {
  let field = fields.get(seed);
  if (!field) {
    field = createTerrain(seed);
    fields.set(seed, field);
  }
  return field;
}

/** Height at a point on the unit sphere, in -1..1. */
export function elevation(seed: string, p: Vec3): number {
  return terrainFor(seed).elevation(p);
}

/** How wet a place is, 0..1. */
export function moisture(seed: string, p: Vec3): number {
  return terrainFor(seed).moisture(p);
}

/** How warm a place is, 0..1. */
export function temperature(seed: string, p: Vec3): number {
  return terrainFor(seed).temperature(p);
}

/**
 * Which biome a place is.
 *
 * `elev` is height ABOVE SEA LEVEL, not the raw field: pass `field.elevation(p) - manifest.seaLevel`.
 * The signature in section 5.1 has no sea level in it, so water has to be decided by the sign, and
 * that only works if the caller has already subtracted it.
 *
 * The order of these tests is the table. Water first, then the shoreline, then the two things that
 * override climate entirely, cold and altitude, then temperature bands split by moisture.
 */
export function biome(elev: number, moist: number, temp: number): Biome {
  if (!isLandHeight(elev)) return "ocean";

  // A shoreline, not every plain. Redistribution deliberately piles land up near sea level, so a
  // generous band here would paint a third of the planet as beach: at 0.022 it was 11% of the
  // surface. This is a thin strip and the coastal plain behind it is whatever its climate says.
  if (elev < 0.006) return "beach";

  // Rock and ice beat climate. A summit is a summit at any latitude, and the lapse rate has
  // already made it cold, so the height test and the temperature test agree rather than fight.
  if (elev > 0.58) return temp < 0.30 ? "snow" : "bare-rock";
  if (temp < 0.09) return elev > 0.40 ? "snow" : "tundra";

  // The temperature bands are read as area, because temperature is 1 - |sin(latitude)|: a cut at
  // 0.22 is the coldest 22% of the planet before altitude is taken into account.
  if (temp < 0.22) return moist > 0.42 ? "taiga" : "tundra";
  if (temp < 0.62) {
    if (moist > 0.60) return "forest";
    if (moist > 0.34) return "grassland";
    return "desert";
  }
  if (moist > 0.70) return "rainforest";
  if (moist > 0.52) return "forest";
  if (moist > 0.30) return "savanna";
  return "desert";
}

// ── sea level ───────────────────────────────────────────────────────────────────

/**
 * Points spread evenly over the sphere by the Fibonacci spiral.
 *
 * Evenly matters: a lat/lng grid piles samples at the poles and would calibrate sea level against a
 * population that is mostly Arctic.
 */
export function fibonacciSphere(count: number): Vec3[] {
  const points: Vec3[] = new Array(count);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points[i] = [Math.cos(theta) * r, y, Math.sin(theta) * r];
  }
  return points;
}

/**
 * The elevation that puts exactly `landFractionTarget` of the surface above water.
 *
 * Sampled, sorted, and read off at the quantile. Section 5.3 is emphatic that this is not guessed,
 * and it is right to be: Earth is 29% land, and a planet where 71% of assignments land in open
 * ocean has nothing to sell. Run once at planet creation, written to the manifest, never again.
 */
export interface Calibration {
  /** The elevation that divides water from land. */
  seaLevel: number;
  /**
   * The height the biome table treats as "the top of this planet", taken at the 99.9th percentile
   * of land rather than the sample maximum, which would move every time the sample count changed.
   * Ground above it exists and simply reads as fully mountainous.
   */
  peakElevation: number;
  /** The land fraction actually realised at that sea level. Should sit on the target. */
  landFraction: number;
}

/**
 * Where to put the water, and how high this planet's high ground is.
 *
 * Sampled, sorted, and read off at the quantile. Section 5.3 is emphatic that sea level is not
 * guessed, and it is right to be: Earth is 29% land, and a planet where 71% of assignments land in
 * open ocean has nothing to sell. Run once at planet creation, written to the manifest, never again.
 */
export function calibratePlanet(
  field: TerrainField,
  landFractionTarget: number,
  samples = 200_000,
): Calibration {
  if (landFractionTarget <= 0 || landFractionTarget >= 1) {
    throw new RangeError(`land fraction target must be between 0 and 1, got ${landFractionTarget}`);
  }
  const heights = fibonacciSphere(samples).map((p) => field.elevation(p));
  heights.sort((a, b) => a - b);

  const index = Math.min(Math.floor((1 - landFractionTarget) * heights.length), heights.length - 1);
  const seaLevel = heights[index]!;

  const land = heights.slice(index + 1);
  const peakElevation = land.length > 0 ? land[Math.floor(0.999 * (land.length - 1))]! : seaLevel;

  let above = 0;
  for (const h of heights) if (h > seaLevel) above++;

  return { seaLevel, peakElevation, landFraction: above / heights.length };
}

/** Just the sea level, for callers that want only that. */
export function calibrateSeaLevel(
  field: TerrainField,
  landFractionTarget: number,
  samples = 200_000,
): number {
  return calibratePlanet(field, landFractionTarget, samples).seaLevel;
}

/**
 * Height above sea level on a 0 to 1 scale, where 0 is the shoreline and 1 is this planet's high
 * ground. This is what {@link biome} expects, and normalising here is what lets the biome table be
 * a statement about landscape rather than a set of constants tied to one set of noise frequencies.
 */
export function normalisedHeight(elevation: number, calibration: Calibration): number {
  const span = calibration.peakElevation - calibration.seaLevel;
  if (span <= 0) return 0;
  return clamp((elevation - calibration.seaLevel) / span, -1, 1);
}

/** The fraction of an evenly spread sample of the whole sphere that sits above `seaLevel`. */
export function measureLandFraction(field: TerrainField, seaLevel: number, samples = 200_000): number {
  let land = 0;
  const points = fibonacciSphere(samples);
  for (const p of points) if (field.elevation(p) > seaLevel) land++;
  return land / points.length;
}

/** The biome at a position, with the height normalisation applied for you. */
export function biomeAt(field: TerrainField, calibration: Calibration, p: Vec3): Biome {
  return biome(normalisedHeight(field.elevation(p), calibration), field.moisture(p), field.temperature(p));
}

/** A colour per biome, so the globe, the preview plate and any legend cannot drift apart. */
export type Rgb = readonly [number, number, number];

export const BIOME_COLOUR: Record<Biome, Rgb> = {
  ocean: [38, 68, 96],
  beach: [214, 199, 160],
  grassland: [151, 165, 100],
  forest: [88, 122, 78],
  rainforest: [50, 94, 66],
  savanna: [186, 168, 105],
  desert: [204, 175, 128],
  tundra: [150, 148, 137],
  taiga: [82, 106, 96],
  "bare-rock": [138, 132, 124],
  snow: [238, 240, 242],
};

/**
 * One sRGB component, 0 to 1, as the linear number a renderer works in.
 *
 * This is the exact IEC 61966-2-1 piecewise transfer function, not `pow(c, 2.2)`, because it is
 * the same curve `THREE.Color` runs on every colour that does NOT come through this file. The two
 * disagree by up to 0.0085 in linear terms (at byte 191), and the disagreement is worst where this
 * planet lives: read back out through the display transfer, gamma 2.2 lands 5.0 of 255 away on
 * `ocean`'s 38 and 3.6 away on `rainforest`'s 50, against 0.5 on `snow`'s 238. Since the whole
 * point of this function is that the ground and the tree standing on it are in ONE space, an
 * approximation here would shrink the seam rather than close it, which DECISIONS C3 rejected.
 */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/**
 * An {@link Rgb} as a vertex-colour attribute must carry it: linear, 0 to 1.
 *
 * THE SEAM (DECISIONS C3). `BIOME_COLOUR` is stated in sRGB bytes because that is how a colour is
 * chosen, and because the preview plate draws it into a 2D canvas where bytes are exactly right.
 * A `color` attribute is different: three reads it as LINEAR and converts nothing on the way in.
 * Dividing by 255 and stopping there therefore handed the shader an sRGB number where a linear one
 * belongs, while every prop in the same frame reached the shader through `THREE.Color`, which does
 * convert. Measured on the shipped frame, that made rainforest ground 3.57x too bright in
 * luminance and ocean 4.63x, which is why the trees on it read as silhouettes.
 *
 * Every writer into a colour attribute goes through here, on both sides of the shared contract, so
 * the globe and the walked world cannot end up telling different stories about the same colour.
 */
export const linearRgb = (colour: Rgb): [number, number, number] => [
  srgbToLinear(colour[0] / 255),
  srgbToLinear(colour[1] / 255),
  srgbToLinear(colour[2] / 255),
];

/**
 * The inverse of {@link srgbToLinear}: a linear number back as the sRGB component a byte carries.
 *
 * WHO NEEDS THIS AND WHO DOES NOT. Nothing that hands a colour to a renderer, because a renderer
 * wants the linear number and encodes it itself on the way to the display. It exists for the one
 * direction that has no shader in it: code that has SHADED in linear and now has to write image
 * BYTES. That is scripts/preview-globe.ts, which rasterises the very buffers a WebGL layer would
 * take and writes a PNG, and it is the only such caller today.
 *
 * Leaving it out is not a subtle error. When `buildParcelMesh` moved to linear under DECISIONS C3
 * and that rasteriser was not touched, its ocean fell from (43, 78, 109) to (6, 17, 34) at full
 * lambert and its rainforest from (57, 107, 75) to (9, 33, 16): the sea rendered black.
 *
 * The knee is 0.0031308 rather than 0.04045 because that is the same piecewise curve read from the
 * linear side, 0.04045 / 12.92. terrain.test.ts asserts the pair round-trips every one of the 256
 * bytes back to itself.
 */
export const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** {@link BIOME_COLOUR}, converted once, for the inner loops that fill a mesh. */
export const BIOME_COLOUR_LINEAR: Record<Biome, Rgb> = (() => {
  const table = {} as Record<Biome, Rgb>;
  for (const b of BIOMES) table[b] = linearRgb(BIOME_COLOUR[b]);
  return table;
})();

/** Convenience for callers holding a lat/lng rather than a position. */
export function biomeAtLatLng(
  field: TerrainField,
  calibration: Calibration,
  lat: number,
  lng: number,
): Biome {
  return biomeAt(field, calibration, latLngToVec3(lat, lng));
}
