/**
 * What an arbitrary cell holds, and which asset classes its biomes call for.
 * Run:  node --import tsx packages/planet/scripts/cell-info.ts <cell> [k]
 */
import { ASSET_CLASSES, classesForBiomes } from "../lib/assets.js";
import { sampleBiomeMask, LAND_BIOMES } from "../lib/biome-mask.js";
import { BIOMES } from "../lib/terrain.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { createTangentPatch } from "../lib/scene.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { regionBound, spawnPointFor } from "../lib/walkable.js";
import type { Biome } from "../lib/terrain.js";

const cell = process.argv[2] ?? "8482589ffffffff";
const k = Number(process.argv[3] ?? 1);
const seed = process.env.PLANET_SEED ?? "echo-capacity-1";

const field = createTerrain(seed);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const patch = createTangentPatch(cell, PLANET_PARAMS.radiusKm);
const bound = regionBound(cell, k, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(cell, field, calibration, PLANET_PARAMS.radiusKm);
const mask = sampleBiomeMask(patch, field, calibration, bound.radiusM, 10);

const counts = new Map<Biome, number>();
for (const i of mask.biomes) { const b = BIOMES[i] as Biome; counts.set(b, (counts.get(b) ?? 0) + 1); }
const total = mask.biomes.length;
const sorted = [...counts].sort((a, b) => b[1] - a[1]);

console.log(`cell ${cell}  k=${k}  seed ${seed}`);
console.log(`spawn ${spawn ? `${spawn.childCell} at (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) m` : "NONE (no walkable descendant)"}`);
console.log("composition:");
for (const [b, n] of sorted) console.log(`  ${String(b).padEnd(12)} ${(n / total * 100).toFixed(1)}%`);

const land = sorted.map(([b]) => b).filter((b) => (LAND_BIOMES as readonly string[]).includes(b as string));
const classes = classesForBiomes(land as Biome[]);
console.log(`land biomes: ${land.join(", ")}`);
console.log(`classes called for (${classes.length} of ${ASSET_CLASSES.length}): ${classes.map((c) => c.id).join(", ")}`);
