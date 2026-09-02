/**
 * The whole planet, on one equal area map, so the coastlines can be looked at before anything
 * depends on them (build order step 3).
 *
 * Equal area is the requirement and it is not cosmetic. On an equirectangular map the poles are
 * stretched across the full width and a polar island looks like a continent, which is exactly the
 * misreading this image exists to prevent. Mollweide keeps every square kilometre the same number
 * of pixels, so what looks big is big.
 *
 * Two images come out. The biome map is the one to judge the planet by. The elevation map, with the
 * sea level contour drawn on it, is the one to judge the COASTLINES by, which is what step 3 is
 * really asking you to check.
 *
 * Run:  npm run preview:planet -w @echo/planet
 *   or  node --import tsx packages/planet/scripts/preview-planet.ts [--seed s] [--width 2048]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { latLngToVec3 } from "../lib/geo.js";
import {
  BIOME_COLOUR,
  BIOMES,
  biome,
  calibratePlanet,
  createTerrain,
  normalisedHeight,
  type Biome,
  type Calibration,
  type Rgb,
  type TerrainField,
} from "../lib/terrain.js";
import { encodePng } from "./png.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]!;
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  const isFlag = next === undefined || next.startsWith("--");
  args.set(token.slice(2), isFlag ? "true" : next!);
  if (!isFlag) i++;
}

const SEED = args.get("seed") ?? "echo-planet-1";
const WIDTH = Number(args.get("width") ?? 2048);
const HEIGHT = Math.round(WIDTH / 2);
const LAND_TARGET = Number(args.get("land") ?? 0.6);
const OUT_DIR = resolve(args.get("out") ?? "packages/planet/preview");

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ROOT2 = Math.SQRT2;

/**
 * Mollweide, inverted: pixel to latitude and longitude.
 *
 * `nx` and `ny` are in -1..1 with ny increasing northward. Returns null outside the ellipse, which
 * is roughly a fifth of the frame and is left transparent.
 */
function unprojectMollweide(nx: number, ny: number): [number, number] | null {
  const y = ny * ROOT2;
  if (Math.abs(y) > ROOT2) return null;
  const theta = Math.asin(clamp(y / ROOT2, -1, 1));
  const sinLat = clamp((2 * theta + Math.sin(2 * theta)) / Math.PI, -1, 1);
  const lat = (Math.asin(sinLat) * 180) / Math.PI;

  const cosTheta = Math.cos(theta);
  if (cosTheta < 1e-12) return Math.abs(nx) < 1e-9 ? [lat, 0] : null;

  const x = nx * 2 * ROOT2;
  const lng = ((Math.PI * x) / (2 * ROOT2 * cosTheta)) * (180 / Math.PI);
  if (lng < -180 || lng > 180) return null;
  return [lat, lng];
}

/** Relief shading from the elevation gradient, lit from the north west, as on a printed map. */
function relief(field: TerrainField, lat: number, lng: number, step: number): number {
  const east = field.elevation(latLngToVec3(lat, lng + step));
  const west = field.elevation(latLngToVec3(lat, lng - step));
  const north = field.elevation(latLngToVec3(clamp(lat + step, -90, 90), lng));
  const south = field.elevation(latLngToVec3(clamp(lat - step, -90, 90), lng));
  // Scaled by cos(lat) so a degree of longitude near a pole is not treated as a degree at the
  // equator, which would make the poles look like cliffs.
  const dx = (east - west) / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const dy = north - south;
  return clamp(1 + 55 * (dy * 0.7 - dx * 0.7), 0.62, 1.42);
}

function render(field: TerrainField, cal: Calibration, mode: "biome" | "elevation") {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  const step = 180 / HEIGHT / 2;
  const counts = new Map<Biome, number>();
  let inside = 0;

  for (let py = 0; py < HEIGHT; py++) {
    const ny = 1 - ((py + 0.5) / HEIGHT) * 2;
    for (let px = 0; px < WIDTH; px++) {
      const nx = ((px + 0.5) / WIDTH) * 2 - 1;
      const here = unprojectMollweide(nx, ny);
      const o = (py * WIDTH + px) * 4;
      if (!here) continue;

      const [lat, lng] = here;
      const p = latLngToVec3(lat, lng);
      const raw = field.elevation(p);
      const height = normalisedHeight(raw, cal);
      inside++;

      let colour: Rgb;
      if (mode === "biome") {
        const b = biome(height, field.moisture(p), field.temperature(p));
        counts.set(b, (counts.get(b) ?? 0) + 1);
        if (b === "ocean") {
          // Depth shading, so shelf and abyss read differently and the coast has somewhere to sit.
          const depth = clamp(-height, 0, 1);
          colour = [
            Math.round(70 - 42 * depth),
            Math.round(112 - 58 * depth),
            Math.round(146 - 62 * depth),
          ];
        } else {
          const shade = relief(field, lat, lng, step);
          const base = BIOME_COLOUR[b];
          colour = [
            Math.round(clamp(base[0] * shade, 0, 255)),
            Math.round(clamp(base[1] * shade, 0, 255)),
            Math.round(clamp(base[2] * shade, 0, 255)),
          ];
        }
      } else if (height <= 0) {
        const depth = clamp(-height, 0, 1);
        colour = [Math.round(28 + 34 * (1 - depth)), Math.round(52 + 54 * (1 - depth)), Math.round(84 + 58 * (1 - depth))];
      } else {
        // A hypsometric ramp: green lowland, tan, brown, then white above the snow line.
        const t = clamp(height, 0, 1);
        const stops: Array<[number, Rgb]> = [
          [0.0, [96, 132, 92]],
          [0.25, [166, 172, 108]],
          [0.5, [176, 140, 96]],
          [0.75, [140, 116, 104]],
          [1.0, [246, 246, 248]],
        ];
        let i = 0;
        while (i < stops.length - 2 && t > stops[i + 1]![0]) i++;
        const [t0, c0] = stops[i]!;
        const [t1, c1] = stops[i + 1]!;
        const f = (t - t0) / (t1 - t0);
        const shade = relief(field, lat, lng, step);
        const mix = (k: 0 | 1 | 2) => Math.round(clamp((c0[k] + (c1[k] - c0[k]) * f) * shade, 0, 255));
        colour = [mix(0), mix(1), mix(2)];
        // The sea level contour, drawn on top. This is the line step 3 asks you to look at.
        if (height < 0.004) colour = [26, 26, 30];
      }

      pixels[o] = colour[0];
      pixels[o + 1] = colour[1];
      pixels[o + 2] = colour[2];
      pixels[o + 3] = 255;
    }
  }
  return { pixels, counts, inside };
}

const started = Date.now();
console.log(`Planet preview, seed ${SEED}, Mollweide equal area, ${WIDTH} by ${HEIGHT}.`);

const field = createTerrain(SEED);
const cal = calibratePlanet(field, LAND_TARGET);
console.log(`  sea level      ${cal.seaLevel.toFixed(6)}`);
console.log(`  peak elevation ${cal.peakElevation.toFixed(6)} (99.9th percentile of land)`);
console.log(`  land fraction  ${(cal.landFraction * 100).toFixed(3)}% against a ${(LAND_TARGET * 100).toFixed(0)}% target`);

mkdirSync(OUT_DIR, { recursive: true });
const biomeRender = render(field, cal, "biome");
const biomePath = resolve(OUT_DIR, `${SEED}-biomes.png`);
writeFileSync(biomePath, encodePng(WIDTH, HEIGHT, biomeRender.pixels));

const elevationRender = render(field, cal, "elevation");
const elevationPath = resolve(OUT_DIR, `${SEED}-elevation.png`);
writeFileSync(elevationPath, encodePng(WIDTH, HEIGHT, elevationRender.pixels));

console.log("\n  biome shares, by area (the projection is equal area, so pixels are area):");
for (const b of BIOMES) {
  const share = (biomeRender.counts.get(b) ?? 0) / biomeRender.inside;
  console.log(`    ${b.padEnd(11)} ${(share * 100).toFixed(2).padStart(6)}%  ${"#".repeat(Math.round(share * 70))}`);
}

console.log(`\n  ${biomePath}`);
console.log(`  ${elevationPath}`);
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
void dirname;
