/**
 * What the demo cell actually holds (plan B4d: which constraint is binding).
 *
 * Places the real registry over the real disk with the real falloff and reports the near field,
 * the pan, the disk total, the density, and what the draw-call and triangle budgets would be under
 * the chunk-and-impostor plan. This is the number B1's perceptibility test is run against, and the
 * evidence for whether the density constant, the instance ceiling or the biome content is what
 * makes a world look bare.
 *
 * Run:  node --import tsx packages/planet/scripts/measure-demo-cell.ts [cutoffM] [farFactor]
 */
import {
  ASSET_CLASSES,
  classesForBiomes,
  INSTANCE_CEILING,
  NO_EXCLUSIONS,
  placeAssets,
  spawnFalloff,
} from "../lib/assets.js";
import { sampleBiomeMask } from "../lib/biome-mask.js";
import { DEMO_CELL, DEMO_LAND_BIOMES, DEMO_NEAR_FIELD_M } from "../lib/demo-cell.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { PARCEL_REGION_K } from "../lib/parcel.js";
import { createTangentPatch, DEFAULT_SCENE_OPTIONS } from "../lib/scene.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { regionBound, spawnPointFor } from "../lib/walkable.js";

const CUTOFF = Number(process.argv[2] ?? 900);
const FAR = Number(process.argv[3] ?? 0.06);
const seed = process.env.PLANET_SEED ?? "echo-capacity-1";

const field = createTerrain(seed);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const bound = regionBound(DEMO_CELL, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
const registry = classesForBiomes(DEMO_LAND_BIOMES);

const t0 = Date.now();
const mask = sampleBiomeMask(patch, field, calibration, bound.radiusM, 10);
const maskMs = Date.now() - t0;

const t1 = Date.now();
const { placed, truncated, byClass } = placeAssets(mask, registry, seed, NO_EXCLUSIONS, {
  heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM,
  bound,
  densityScale: spawnFalloff(spawn.x, spawn.y, 150, 700, FAR, CUTOFF),
});
const placeMs = Date.now() - t1;

const d = (p: { x: number; y: number }) => Math.hypot(p.x - spawn.x, p.y - spawn.y);
const near = placed.filter((p) => d(p) <= DEMO_NEAR_FIELD_M);
const pan = placed.filter((p) => d(p) <= 400);
const area = Math.PI * DEMO_NEAR_FIELD_M * DEMO_NEAR_FIELD_M;

console.log(`${DEMO_CELL}  registry ${registry.length}/${ASSET_CLASSES.length} classes  falloff cutoff ${CUTOFF} m, far factor ${FAR}`);
console.log(`  region radius ${bound.radiusM.toFixed(0)} m, mask ${mask.size}x${mask.size} in ${maskMs} ms, placement ${placeMs} ms`);
console.log(`  near field (${DEMO_NEAR_FIELD_M} m): ${near.length} instances, ${((near.length / area) * 100).toFixed(2)} per 100 m2, ${new Set(near.map((p) => p.classId)).size} classes`);
console.log(`  pan (400 m):     ${pan.length} instances, ${new Set(pan.map((p) => p.classId)).size} classes`);
console.log(`  disk total:      ${placed.length}${truncated ? "  TRUNCATED at the ceiling" : ""} of a ceiling of ${INSTANCE_CEILING}`);
console.log(`  by class:`, byClass);

// What the renderer would owe, under the chunk-and-impostor plan (plan W2-3). Each class carries
// its OWN lod.nearM and lod.farM, so "full mesh" is not "everything in the pan": a fern is a full
// mesh for 70 m and an impostor after that.
const CHUNKS = 7; // one per cell of the k=1 disk
const byIdMap = new Map(registry.map((c) => [c.id, c] as const));
let full = 0;
let impostor = 0;
const nearIds = new Set<string>();
const farIds = new Set<string>();
for (const p of placed) {
  const cls = byIdMap.get(p.classId)!;
  const dist = d(p);
  if (dist <= cls.lod.nearM) {
    full++;
    nearIds.add(p.classId);
  } else if (dist <= cls.lod.farM) {
    impostor++;
    farIds.add(p.classId);
  }
}
const NEAR_TRIS = 40;
const FAR_TRIS = 2;
const drawNear = CHUNKS * nearIds.size;
const drawFar = farIds.size;
const tris = full * NEAR_TRIS + impostor * FAR_TRIS;
console.log(
  `  renderer estimate: ${full.toLocaleString()} full meshes + ${impostor.toLocaleString()} impostors, ` +
    `${placed.length - full - impostor} culled beyond their far band\n` +
    `                     ${drawNear} near draw calls + ${drawFar} far + 8 ground and water = ${drawNear + drawFar + 8}  (budget 120)\n` +
    `                     ${tris.toLocaleString()} triangles in view at ${NEAR_TRIS} per near mesh and ${FAR_TRIS} per impostor  (budget 600,000)`,
);
