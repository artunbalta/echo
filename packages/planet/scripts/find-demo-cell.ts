/**
 * Find the demo cell (plan §4, B4).
 *
 * The landing demo walks one res-4 cell and its six neighbours (a k=1 disk, about 4.3 km across).
 * This script ranks every assignable res-4 cell on the shipped seed by how many distinct LAND biomes
 * its disk contains, so the demo transect crosses as much of the planet's vocabulary as one disk
 * can. It also reports what the winner actually contains, because the plan's original criterion
 * ("at least 5 biomes") was written before anyone measured what a disk holds.
 *
 * Two passes. The first is cheap (49 land samples for assignability, 14 biome samples for a
 * shortlist) and runs over all 284,004 cells. The second samples each shortlisted disk on a fine
 * grid in the cell's own tangent frame, which is the frame the walkable scene uses.
 *
 * Run:  node --import tsx packages/planet/scripts/find-demo-cell.ts [seed] [top]
 */
import { cellToLatLng, gridDisk, cellToChildren } from "h3-js";

import { latLngToVec3, type Vec3 } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { chooseCommons } from "../lib/commons.js";
import { seedInventory } from "../lib/rounds.js";
import { createTangentPatch } from "../lib/scene.js";
import {
  BIOMES,
  biome,
  calibratePlanet,
  createTerrain,
  normalisedHeight,
  type Biome,
} from "../lib/terrain.js";

const seed = process.argv[2] ?? "echo-capacity-1";
const top = Number(process.argv[3] ?? 12);
// MIN_OCEAN=0.05 keeps only disks with that much open water in view, i.e. a coast you can see.
const minOcean = Number(process.env.MIN_OCEAN ?? 0);

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
console.log(`${seed}: ${inventory.length} res-${PLANET_PARAMS.startResolution} cells, calibrated in ${Date.now() - t0} ms`);

const commonsDirections: Vec3[] = commons.cells.map((c) => {
  const [lat, lng] = cellToLatLng(c);
  return latLngToVec3(lat, lng);
});

const biomeAtDirection = (d: Vec3): Biome =>
  biome(normalisedHeight(field.elevation(d), calibration), field.moisture(d), field.temperature(d));

const centreOf = (cell: string): Vec3 => {
  const [lat, lng] = cellToLatLng(cell);
  return latLngToVec3(lat, lng);
};

// ── pass 1: shortlist ───────────────────────────────────────────────────────────
const shortlist: Array<{ cell: string; lf: number; kinds: Set<Biome> }> = [];
let assignable = 0;
for (const cell of inventory) {
  const lf = landFraction(cell);
  if (lf < PLANET_PARAMS.minLandFraction) continue;
  assignable++;
  // The spawn cell should be mostly land, so the walk starts on ground and not on a beach spit.
  if (lf < 0.5) continue;
  const kinds = new Set<Biome>();
  for (const c of gridDisk(cell, 1)) kinds.add(biomeAtDirection(centreOf(c)));
  for (const c of cellToChildren(cell, PLANET_PARAMS.startResolution + 1)) kinds.add(biomeAtDirection(centreOf(c)));
  kinds.delete("ocean");
  // A coast and a dry band are the two things the brief names; anything else is a bonus.
  if (!kinds.has("beach")) continue;
  if (kinds.size < 3) continue;
  shortlist.push({ cell, lf, kinds });
}
console.log(`pass 1: ${assignable} assignable, ${shortlist.length} shortlisted in ${Date.now() - t0} ms`);

// ── pass 2: sample each shortlisted disk finely ─────────────────────────────────
interface Candidate {
  cell: string;
  lf: number;
  landKinds: number;
  composition: Partial<Record<Biome, number>>;
  centreIsLand: boolean;
  maxHeight: number;
  minHeight: number;
  diskLand: number;
  commonsKm: number;
  hasDesert: boolean;
  hasHigh: boolean;
}
const candidates: Candidate[] = [];
const GRID = 64;
for (const s of shortlist) {
  const patch = createTangentPatch(s.cell, PLANET_PARAMS.radiusKm);
  // A k=1 disk spans about three cell radii from the centre.
  const extent = patch.extentM * 3;
  const step = (extent * 2) / (GRID - 1);
  const counts = new Map<Biome, number>();
  let maxH = -Infinity;
  let minH = Infinity;
  let land = 0;
  let total = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = -extent + i * step;
      const y = -extent + j * step;
      if (x * x + y * y > extent * extent) continue; // the disk, not its bounding square
      const d = patch.toDirection(x, y);
      const h = normalisedHeight(field.elevation(d), calibration);
      const kind = biome(h, field.moisture(d), field.temperature(d));
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      total++;
      if (kind !== "ocean") {
        land++;
        if (h > maxH) maxH = h;
        if (h < minH) minH = h;
      }
    }
  }
  const composition: Partial<Record<Biome, number>> = {};
  for (const [k, v] of counts) composition[k] = Number((v / total).toFixed(3));
  const landKinds = [...counts.keys()].filter((k) => k !== "ocean").length;
  const centre = patch.centre;
  let best = Infinity;
  for (const c of commonsDirections) {
    const dot = centre[0] * c[0] + centre[1] * c[1] + centre[2] * c[2];
    const km = Math.acos(Math.min(1, Math.max(-1, dot))) * PLANET_PARAMS.radiusKm;
    if (km < best) best = km;
  }
  candidates.push({
    cell: s.cell,
    lf: s.lf,
    landKinds,
    composition,
    centreIsLand: normalisedHeight(field.elevation(centre), calibration) > 0,
    maxHeight: maxH,
    minHeight: minH,
    diskLand: land / total,
    commonsKm: best,
    hasDesert: (counts.get("desert") ?? 0) > 0,
    hasHigh: (counts.get("bare-rock") ?? 0) + (counts.get("snow") ?? 0) + (counts.get("tundra") ?? 0) > 0,
  });
}
console.log(`pass 2: ${candidates.length} disks sampled at ${GRID}x${GRID} in ${Date.now() - t0} ms`);

// Rank: most distinct land biomes; then a coast, a dry band and high ground all present; then the
// disk's own land fraction (a walk should not be mostly sea); then nearness to a commons.
candidates.sort((a, b) =>
  b.landKinds - a.landKinds ||
  Number(b.hasDesert && b.hasHigh) - Number(a.hasDesert && a.hasHigh) ||
  Number(b.centreIsLand) - Number(a.centreIsLand) ||
  b.diskLand - a.diskLand ||
  a.commonsKm - b.commonsKm,
);

const kept = candidates.filter((c) => (c.composition.ocean ?? 0) >= minOcean);
candidates.length = 0;
candidates.push(...kept);
console.log(`ocean >= ${minOcean}: ${candidates.length} disks`);
const histogram = new Map<number, number>();
for (const c of candidates) histogram.set(c.landKinds, (histogram.get(c.landKinds) ?? 0) + 1);
console.log("distinct land biomes per shortlisted disk:", [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join("  "));

console.log(`\ntop ${top}:`);
for (const c of candidates.slice(0, top)) {
  const comp = (Object.entries(c.composition) as Array<[Biome, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
    .join(", ");
  console.log(
    `${c.cell}  land biomes ${c.landKinds}  cell land ${(c.lf * 100).toFixed(0)}%  disk land ${(c.diskLand * 100).toFixed(0)}%  ` +
      `height ${c.minHeight.toFixed(3)}..${c.maxHeight.toFixed(3)}  centre ${c.centreIsLand ? "land" : "WATER"}  commons ${c.commonsKm.toFixed(0)} km\n    ${comp}`,
  );
}
console.log(`\ndone in ${Date.now() - t0} ms`);
void BIOMES;
