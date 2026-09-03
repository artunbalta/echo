/**
 * Rank candidate demo cells by what the player actually stands in (plan B4, re-scan).
 *
 * The first scan ranked by biome COUNT, which was the wrong criterion: four sparse biomes read
 * emptier than two dense ones, and the complaint that started this work was emptiness. This ranks
 * by the number of instances `placeAssets` really puts within 120 m of the best spawn point, using
 * the real registry, which is the number a visitor's eyes report.
 *
 * Three stages, cheapest first.
 *   1. Every assignable res-4 cell: coastal, mostly land, ranked by the mean vegetation density of
 *      a coarse biome sample. A proxy, and only used to choose who gets measured properly.
 *   2. The shortlist: the real spawn, a fine mask over a 150 m square around it, the real registry
 *      and the real placer. This is the near-field count, exactly, because the placer's lattice is
 *      absolute (it is anchored at the patch centre, not at the mask corner), so a small mask
 *      yields the same instances the full disk would in that square.
 *   3. The finalists: the whole k=1 disk, for the pan count, the disk total and the ceiling check.
 *
 * Run:  node --import tsx packages/planet/scripts/rank-demo-cells.ts [seed] [shortlist] [finalists]
 */
import { cellToLatLng, gridDisk } from "h3-js";

import { latLngToVec3, type Vec3 } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { chooseCommons } from "../lib/commons.js";
import { seedInventory } from "../lib/rounds.js";
import { createTangentPatch, DEFAULT_SCENE_OPTIONS } from "../lib/scene.js";
import { sampleBiomeMask, VEGETATION_DENSITY } from "../lib/biome-mask.js";
import {
  ASSET_CLASSES,
  classesForBiomes,
  INSTANCE_CEILING,
  NO_EXCLUSIONS,
  placeAssets,
  spawnFalloff,
} from "../lib/assets.js";
import {
  biome,
  calibratePlanet,
  createTerrain,
  isLand,
  normalisedHeight,
  type Biome,
} from "../lib/terrain.js";
import { regionBound, spawnPointFor } from "../lib/walkable.js";

const seed = process.argv[2] ?? "echo-capacity-1";
const SHORTLIST = Number(process.argv[3] ?? 400);
const FINALISTS = Number(process.argv[4] ?? 6);
const NEAR_M = 120;
const PAN_M = 400;
/**
 * The shore has to be somewhere the player can walk to, not merely somewhere in the disk. The
 * first re-scan's winner was 85% rainforest with a beach at the far rim: the spawn sat a kilometre
 * inland and no shore was reachable in any direction, which fails the brief's "a real shoreline"
 * and strands the F5 gull beat. A candidate now has to put water within this radius of its spawn.
 */
const SHORE_M = Number(process.env.SHORE_M ?? 260);

const t0 = Date.now();
const field = createTerrain(seed);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
const commons = chooseCommons(
  PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution,
  landFraction,
  PLANET_PARAMS.minLandFraction,
);
const inventory = seedInventory(PLANET_PARAMS.startResolution, commons.reserved);
console.log(`${seed}: ${inventory.length} cells, calibrated in ${Date.now() - t0} ms`);

const kindAt = (d: Vec3): Biome =>
  biome(normalisedHeight(field.elevation(d), calibration), field.moisture(d), field.temperature(d));
const centreOf = (cell: string): Vec3 => {
  const [lat, lng] = cellToLatLng(cell);
  return latLngToVec3(lat, lng);
};

// ── stage 1: who is worth measuring ─────────────────────────────────────────────
interface Short {
  cell: string;
  lf: number;
  lush: number;
  kinds: Set<Biome>;
  water: boolean;
}
const shortlist: Short[] = [];
let assignable = 0;
for (const cell of inventory) {
  const lf = landFraction(cell);
  if (lf < PLANET_PARAMS.minLandFraction) continue;
  assignable++;
  // A band, not a floor. Below 0.45 the walk is mostly sea; above 0.85 the coast does not cross
  // the cell at all and the spawn, which sits at the cell centre, is a kilometre inland. The first
  // re-scan had no upper bound and every winner was interior rainforest with an unreachable shore.
  if (lf < 0.45 || lf > 0.85) continue;
  const kinds = new Set<Biome>();
  let lush = 0;
  let n = 0;
  let water = false;
  for (const c of gridDisk(cell, 1)) {
    const k = kindAt(centreOf(c));
    kinds.add(k);
    lush += VEGETATION_DENSITY[k];
    n++;
    if (k === "ocean") water = true;
  }
  // A coast is part of the brief: the disk must touch water somewhere.
  if (!water && !kinds.has("beach")) continue;
  kinds.delete("ocean");
  if (kinds.size === 0) continue;
  shortlist.push({ cell, lf, lush: lush / n, kinds, water });
}
shortlist.sort((a, b) => b.lush - a.lush);
console.log(`stage 1: ${assignable} assignable, ${shortlist.length} coastal candidates, top lushness ${shortlist[0]?.lush.toFixed(3)} (${Date.now() - t0} ms)`);

// ── stage 2: the near field, measured ───────────────────────────────────────────
interface Near {
  cell: string;
  lf: number;
  spawnX: number;
  spawnY: number;
  near: number;
  classes: number;
  kinds: Biome[];
}
const measured: Near[] = [];
const heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM;
for (const s of shortlist.slice(0, SHORTLIST)) {
  const spawn = spawnPointFor(s.cell, field, calibration, PLANET_PARAMS.radiusKm);
  if (!spawn) continue;
  const patch = createTangentPatch(s.cell, PLANET_PARAMS.radiusKm);
  // A square that contains the near-field circle, sampled at 5 m so the water bands are honest.
  // Wide enough to see the shore test's radius as well as the near field.
  const mask = sampleBiomeMask(patch, field, calibration, Math.max(NEAR_M + 30, SHORE_M + 20), 5);
  const registry = classesForBiomes([...s.kinds]);
  const { placed } = placeAssets(mask, registry, seed, NO_EXCLUSIONS, {
    heightScaleM,
    maxInstances: 400_000,
    densityScale: spawnFalloff(spawn.x, spawn.y, 150, 1200, 0.08),
  });
  // The shore test, on the same mask: is there water within SHORE_M of the spawn?
  let shoreM = Infinity;
  for (let j = 0; j < mask.size; j++) {
    for (let i = 0; i < mask.size; i++) {
      const x = -mask.extentM + i * mask.stepM;
      const y = -mask.extentM + j * mask.stepM;
      if (mask.isLandAt(x, y)) continue;
      shoreM = Math.min(shoreM, Math.hypot(x - spawn.x, y - spawn.y));
    }
  }
  if (shoreM > SHORE_M) continue;

  const near = placed.filter((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) <= NEAR_M);
  measured.push({
    cell: s.cell,
    lf: s.lf,
    spawnX: spawn.x,
    spawnY: spawn.y,
    near: near.length,
    classes: new Set(near.map((p) => p.classId)).size,
    kinds: [...s.kinds],
  });
}
measured.sort((a, b) => b.near - a.near);
console.log(`stage 2: ${measured.length} measured (${Date.now() - t0} ms)`);

// ── stage 3: the finalists, over the whole disk ─────────────────────────────────
interface Final extends Near {
  diskTotal: number;
  panClasses: number;
  composition: Array<[Biome, number]>;
  perHundredM2: number;
  truncated: boolean;
  landBiomes: Biome[];
  classesPerBiome: Record<string, number>;
}
const finals: Final[] = [];
const current = "8414debffffffff";
const toMeasure = measured.slice(0, FINALISTS).map((m) => m.cell);
if (!toMeasure.includes(current)) toMeasure.push(current);

for (const cell of toMeasure) {
  const m = measured.find((x) => x.cell === cell) ?? { cell, lf: landFraction(cell), spawnX: 0, spawnY: 0, near: 0, classes: 0, kinds: [] as Biome[] };
  const spawn = spawnPointFor(cell, field, calibration, PLANET_PARAMS.radiusKm);
  if (!spawn) continue;
  const patch = createTangentPatch(cell, PLANET_PARAMS.radiusKm);
  const bound = regionBound(cell, 1, PLANET_PARAMS.radiusKm);
  const mask = sampleBiomeMask(patch, field, calibration, bound.radiusM, 10);

  // Composition and the land biomes actually present, from the disk itself.
  const counts = new Map<Biome, number>();
  let total = 0;
  for (let j = 0; j < mask.size; j++) {
    for (let i = 0; i < mask.size; i++) {
      const x = -mask.extentM + i * mask.stepM;
      const y = -mask.extentM + j * mask.stepM;
      if (!bound.contains(x, y)) continue;
      const k = mask.biomeAt(x, y);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      total++;
    }
  }
  const composition = [...counts.entries()].map(([k, v]) => [k, v / total] as [Biome, number]).sort((a, b) => b[1] - a[1]);
  const landBiomes = composition.filter(([k, v]) => k !== "ocean" && v > 0.01).map(([k]) => k);
  const registry = classesForBiomes(landBiomes);

  const { placed, truncated } = placeAssets(mask, registry, seed, NO_EXCLUSIONS, {
    heightScaleM,
    bound,
    maxInstances: 400_000,
    densityScale: spawnFalloff(spawn.x, spawn.y, 150, 1200, 0.08),
  });
  const near = placed.filter((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) <= NEAR_M);
  const pan = placed.filter((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) <= PAN_M);
  const classesPerBiome: Record<string, number> = {};
  for (const b of landBiomes) classesPerBiome[b] = new Set(placed.filter((p) => p.biome === b).map((p) => p.classId)).size;

  finals.push({
    ...m,
    cell,
    spawnX: spawn.x,
    spawnY: spawn.y,
    near: near.length,
    classes: new Set(near.map((p) => p.classId)).size,
    kinds: landBiomes,
    diskTotal: placed.length,
    panClasses: new Set(pan.map((p) => p.classId)).size,
    composition,
    perHundredM2: (near.length / (Math.PI * NEAR_M * NEAR_M)) * 100,
    truncated,
    landBiomes,
    classesPerBiome,
  });
}
finals.sort((a, b) => b.near - a.near);

console.log(`\n=== finalists (near field = instances within ${NEAR_M} m of the spawn) ===`);
for (const f of finals) {
  const comp = f.composition.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ");
  console.log(
    `${f.cell}${f.cell === current ? "  [current]" : ""}\n` +
      `  near ${f.near}  classes near ${f.classes}  pan(${PAN_M}m) classes ${f.panClasses}  disk ${f.diskTotal}${f.truncated ? " TRUNCATED" : ""}\n` +
      `  density ${f.perHundredM2.toFixed(2)} instances / 100 m2   cell land ${(f.lf * 100).toFixed(0)}%\n` +
      `  ${comp}\n` +
      `  classes per land biome: ${JSON.stringify(f.classesPerBiome)}  registry ${classesForBiomes(f.landBiomes).length}/${ASSET_CLASSES.length}`,
  );
}
console.log(`\ninstance ceiling ${INSTANCE_CEILING}; done in ${Date.now() - t0} ms`);
