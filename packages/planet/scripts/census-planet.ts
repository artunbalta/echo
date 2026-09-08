/**
 * How many people this planet has, and where (SOC-6.B).
 *
 * The sibling of `simulate-capacity.ts`: that one asks how many parcels the planet can ever sell,
 * this one asks how many people are standing on them. Both are properties of the generated world and
 * of nothing else, and both are re-measured when a dial moves.
 *
 * IT SAMPLES RATHER THAN SWEEPS, and says so in its output. A whole-planet pass is 284,004 cells at
 * 0.089 ms of geography plus 3.5-4.4 ms of society each — about 16.5 minutes — and nothing in the
 * design asks anyone to run one (L1: the seed is the prior, the database is the delta; a settlement
 * nobody has visited has zero rows and does not need to have been generated). So this takes a
 * uniform, hash-ordered sample of the real inventory and scales.
 *
 *   npm run census:planet -w @echo/planet -- [sample]
 */
import { chooseCommons } from "../lib/commons.js";
import { geographySampler } from "../lib/geography.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { census, settlementAt, type Occupation } from "../lib/society.js";
import { calibratePlanet, createTerrain, hashString } from "../lib/terrain.js";

const SEED = process.env.PLANET_SEED ?? "echo-capacity-1";
const SAMPLE = Number(process.argv[2] ?? 4000);
const RES = PLANET_PARAMS.startResolution;

const t0 = Date.now();
const field = createTerrain(SEED);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
const commons = chooseCommons(PLANET_PARAMS.commonsResolution ?? RES, landFraction, PLANET_PARAMS.minLandFraction);
const geography = geographySampler(field, calibration, PLANET_PARAMS.radiusKm, { commons: commons.cells });

const inventory = seedInventory(RES, commons.reserved);
console.log(`${SEED}: ${inventory.length.toLocaleString()} cells at resolution ${RES}, built in ${Date.now() - t0} ms`);

// A uniform sample of the real inventory, ordered by a hash of the cell so the choice is
// reproducible and is not a slice of one region.
const sample = [...inventory]
  .map((cell) => [hashString(`census/${cell}`), cell] as const)
  .sort((a, b) => a[0] - b[0])
  .slice(0, Math.min(SAMPLE, inventory.length))
  .map(([, cell]) => cell);

const t1 = Date.now();
let habitable = 0;
let settled = 0;
let alive = 0;
let dead = 0;
let capacitySum = 0;
let biggest = { cell: "", name: "", population: 0 };
const trades = new Map<Occupation, number>();
const sizes: number[] = [];

for (const cell of sample) {
  const geo = geography(cell);
  if (geo.habitability > 0) habitable++;
  const settlement = settlementAt(SEED, cell, geo, 0);
  if (settlement === null) continue;
  settled++;
  capacitySum += settlement.capacity;
  const c = census(settlement, 0);
  alive += c.population;
  dead += c.dead.length;
  sizes.push(c.population);
  if (c.population > biggest.population) {
    biggest = { cell, name: settlement.name, population: c.population };
  }
  for (const p of c.alive) trades.set(p.occupation, (trades.get(p.occupation) ?? 0) + 1);
}
const ms = Date.now() - t1;

const scale = inventory.length / sample.length;
sizes.sort((a, b) => a - b);
const q = (p: number) => (sizes.length === 0 ? 0 : sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))]);

console.log(`
sampled     ${sample.length.toLocaleString()} of ${inventory.length.toLocaleString()} cells (1 in ${scale.toFixed(1)}) in ${(ms / 1000).toFixed(1)} s, ${(ms / sample.length).toFixed(3)} ms per cell
habitable   ${habitable.toLocaleString()} (${((habitable / sample.length) * 100).toFixed(1)}% of cells)
settled     ${settled.toLocaleString()} (${((settled / sample.length) * 100).toFixed(1)}% of cells)  ->  ${Math.round(settled * scale).toLocaleString()} settlements on the planet
living      ${alive.toLocaleString()} in the sample  ->  ${Math.round(alive * scale).toLocaleString()} people on the planet
dead        ${dead.toLocaleString()} in the sample  ->  ${Math.round(dead * scale).toLocaleString()} graves
village     min ${q(0)} · p25 ${q(0.25)} · median ${q(0.5)} · p75 ${q(0.75)} · max ${sizes[sizes.length - 1] ?? 0}   (mean capacity ${(capacitySum / Math.max(1, settled)).toFixed(1)})
biggest     ${biggest.name} on ${biggest.cell}, ${biggest.population} living
trades      ${[...trades].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${((n / Math.max(1, alive)) * 100).toFixed(1)}%`).join(" · ")}
`);
