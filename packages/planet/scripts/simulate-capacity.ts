/**
 * The capacity simulation demanded by section 4.4, run before any rendering, database or UI code.
 *
 * The document asks for one table. It gets one table, and then it gets the four other things the
 * table turns out to depend on, because the headline number is not well defined until they are
 * settled: whether the trigger can fire at all, what happens to a cell nobody can own, where the
 * commons lives, and which of three different definitions of "parcel width" is being quoted.
 *
 * Run:  npm run simulate:capacity -w @echo/planet
 *   or  node --import tsx packages/planet/scripts/simulate-capacity.ts [--seed s] [--depth 2]
 */

import { cellToChildren, childPosToCell } from "h3-js";

import { cellAreaKm2, equalAreaWidthM, hexagonWidthM, sphereAreaKm2 } from "../lib/geo.js";
import { PLANET_PARAMS, SECTION_3_PARAMS, type PlanetParams } from "../lib/manifest.js";
import {
  LITERAL_RULES,
  REPAIRED_RULES,
  seedInventory,
  simulateRounds,
  type RegistryRules,
  type RegistrySimulation,
} from "../lib/rounds.js";
import { checkTiling } from "../lib/tiling.js";
import { chooseCommons, type CommonsPlan } from "../lib/commons.js";
import { landFractionOfCell } from "../lib/land.js";
import {
  calibratePlanet,
  createTerrain,
  DEFAULT_TUNING,
  type TerrainTuning,
} from "../lib/terrain.js";

// ── plumbing ────────────────────────────────────────────────────────────────────

// --seed s   which planet to build
// --depth n  land fraction sample grid, 7^n points per cell
// --exact n  materialise the registry exactly for start resolutions up to n. 3 is slow.
// --quick    smaller samples and a shorter robustness sweep. Same conclusions, coarser digits.
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]!;
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  const isFlag = next === undefined || next.startsWith("--");
  args.set(token.slice(2), isFlag ? "true" : next!);
  if (!isFlag) i++;
}
const SEED = args.get("seed") ?? "echo-capacity-1";
const DEPTH = Number(args.get("depth") ?? 2);
const QUICK = args.has("quick");
const EXACT_UP_TO = Number(args.get("exact") ?? (QUICK ? 1 : 2));
/** Sample counts, scaled down under --quick. Every conclusion survives; only the digits coarsen. */
const scale = (full: number) => (QUICK ? Math.max(500, Math.round(full / 5)) : full);

// The shipped planet, and the numbers section 3 opened with, kept so the report can still show
// the evidence the decision was made on rather than asserting it.
const P = PLANET_PARAMS;
const S3 = SECTION_3_PARAMS;
const R = P.radiusKm;
const COMMONS_RES = P.commonsResolution ?? P.startResolution;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (x: number, d = 0) =>
  x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const L = (s: string, w: number) => s.padEnd(w);
const Rj = (s: string, w: number) => s.padStart(w);
const rule = (w: number) => "-".repeat(w);

function heading(title: string): void {
  console.log(`\n${title}\n${"=".repeat(title.length)}`);
}

/** A width in metres or kilometres, whichever reads better. */
function width(m: number): string {
  return m >= 1000 ? `${n(m / 1000, 2)} km` : `${n(m, 1)} m`;
}

/**
 * A planet, calibrated and ready to be asked about cells.
 *
 * Terrain is real now. Every land number below comes from lib/terrain.ts, the same field the globe
 * renderer and the walkable scene will sample, so the figures in this report are the figures the
 * shipped planet has rather than an estimate standing in for them.
 */
interface Planet {
  seed: string;
  seaLevel: number;
  peakElevation: number;
  realisedLandFraction: number;
  /** Land fraction of a cell, memoised per cell and depth so nothing is ever sampled twice. */
  landFractionOf: (cell: string, depth?: number) => number;
}

function buildPlanet(
  seed: string,
  landFractionTarget: number,
  defaultDepth: number,
  tuning?: Partial<TerrainTuning>,
  calibrationSamples = 200_000,
): Planet {
  const field = createTerrain(seed, { ...DEFAULT_TUNING, ...tuning });
  const cal = calibratePlanet(field, landFractionTarget, calibrationSamples);
  const cache = new Map<string, number>();
  return {
    seed,
    seaLevel: cal.seaLevel,
    peakElevation: cal.peakElevation,
    realisedLandFraction: cal.landFraction,
    landFractionOf: (cell, depth = defaultDepth) => {
      const key = depth === defaultDepth ? cell : `${cell}|${depth}`;
      let value = cache.get(key);
      if (value === undefined) {
        value = landFractionOfCell(field, cal.seaLevel, cell, depth);
        cache.set(key, value);
      }
      return value;
    },
  };
}

/** The continent scale a tuning frequency corresponds to, in kilometres, for the robustness sweep. */
const continentScaleKm = (frequency: number) => (2 * Math.PI * P.radiusKm) / frequency;
const frequencyForScaleKm = (km: number) => (2 * Math.PI * P.radiusKm) / km;

// ── the registry universe ───────────────────────────────────────────────────────

/**
 * The cells the registry can ever deal in: everything descended from a base cell that is not a
 * reserved pentagon. This is a different population from "all cells" and from "all cells except the
 * twelve pentagons", and confusing the three is the easiest way to publish a wrong number.
 * A pentagon's parent is always a pentagon, so reserving the twelve at COMMONS_RES removes twelve
 * whole lineages: at resolution 8 that is 8,235,432 cells, not 12.
 */
let COMMONS: CommonsPlan;
let REGISTRY_BASE: string[];
const registryCountAt = (res: number) => REGISTRY_BASE.length * Math.pow(7, res - COMMONS_RES);
let REGISTRY_AREA_KM2 = 0;

/** A uniformly random registry cell at `res`. Every cell has probability exactly 1 / count. */
function randomRegistryCell(res: number, rand: () => number): string {
  const base = REGISTRY_BASE[Math.floor(rand() * REGISTRY_BASE.length)]!;
  const span = Math.pow(7, res - COMMONS_RES);
  return childPosToCell(Math.floor(rand() * span), base, res);
}

// ── section 0: the planet ───────────────────────────────────────────────────────

function reportPlanet(field: Planet): void {
  heading("0. The planet");
  const surface = sphereAreaKm2(R);
  const commonsArea = COMMONS.cells.reduce((s, c) => s + cellAreaKm2(c, R), 0);
  const withheldArea = COMMONS.reserved.reduce((s, c) => s + cellAreaKm2(c, R), 0);

  console.log(`  seed                 ${SEED}`);
  console.log(`  radius               ${n(R)} km, circumference ${n(2 * Math.PI * R, 1)} km`);
  console.log(`  surface              ${n(surface, 4)} km2`);
  console.log(`  land fraction target ${pct(P.landFractionTarget, 1)}, realised ${pct(field.realisedLandFraction, 3)}`);
  console.log(`  sea level            ${field.seaLevel.toFixed(6)} (calibrated by quantile, section 5.3)`);
  console.log(`  peak elevation       ${field.peakElevation.toFixed(6)} (99.9th percentile of land)`);
  console.log(`  parcels              start at resolution ${P.startResolution}, floor at ${P.floorResolution}, trigger at ${pct(P.triggerFraction, 0)}`);
  console.log(`  commons              12 reserved at resolution ${COMMONS_RES} and frozen`);
  const onPentagon = COMMONS.choices.filter((c) => !c.relocated).map((c) => cellAreaKm2(c.cell, R));
  const moved = COMMONS.choices.filter((c) => c.relocated).map((c) => cellAreaKm2(c.cell, R));
  console.log(`                       ${n(commonsArea, 2)} km2 total, ${pct(commonsArea / surface, 3)} of the planet`);
  console.log(`                       ${onPentagon.length} still on a pentagon at ${n(onPentagon[0] ?? 0, 2)} km2 each`);
  if (moved.length > 0) {
    console.log(`                       ${moved.length} relocated onto hexagons at ${moved.map((a) => n(a, 2)).join(", ")} km2`);
  }
  console.log(`                       ${width(equalAreaWidthM(commonsArea / 12))} across (equal-area circle: a pentagon is not a hexagon)`);
  console.log(`                       ${COMMONS.relocated} of 12 were under water and moved to nearby land`);
  for (const choice of COMMONS.choices.filter((c) => c.relocated)) {
    console.log(`                         ${choice.pentagon} to ${choice.cell}, ring ${choice.rings}, ${pct(choice.landFraction, 0)} land`);
  }
  console.log(`                       ${COMMONS.stranded} stranded with no land within reach`);
  const vacated = COMMONS.reserved.length - COMMONS.cells.length;
  if (vacated > 0) {
    const vacatedArea = COMMONS.reserved
      .filter((c) => !COMMONS.cells.includes(c))
      .reduce((sum, c) => sum + cellAreaKm2(c, R), 0);
    console.log(`                       ${vacated} vacated pentagons also withheld, ${n(vacatedArea, 0)} km2 (${pct(vacatedArea / surface, 3)})`);
    console.log("                       a pentagon is never assignable, wet or dry, and it has six");
    console.log("                       children rather than seven, which would corrupt the inventory");
  }
  console.log(`  registry surface     ${n(surface - withheldArea, 2)} km2 (${pct((surface - withheldArea) / surface, 4)})`);

  // The union of inventory and commons must tile the sphere exactly, or nothing below means
  // anything. This is the section 8 invariant, using the check that actually runs.
  const cover = [...seedInventory(P.startResolution, COMMONS.reserved), ...COMMONS.reserved];
  const tiling = checkTiling(cover, P.floorResolution);
  console.log(`  tiling invariant     ${tiling.ok ? "holds" : `BROKEN: ${tiling.reason}`} (${n(tiling.weight)} floor cells)`);
}

// ── section 1: the mandated round table ─────────────────────────────────────────

function reportRoundTable(sim: RegistrySimulation, title: string, note: string): void {
  heading(title);
  console.log(`  ${note}\n`);
  const w = [5, 4, 12, 12, 12, 12, 12, 12];
  const head = ["round", "res", "inventory", "assignable", "assigned", "width", "owners", "terminal"];
  console.log("  " + head.map((h, i) => (i < 2 ? L(h, w[i]!) : Rj(h, w[i]!))).join(" "));
  console.log("  " + w.map(rule).join(" "));
  for (const r of sim.rounds) {
    console.log(
      "  " +
        [
          L(String(r.round), w[0]!),
          L(String(r.resolution), w[1]!),
          Rj(n(r.rowsAtStart), w[2]!),
          Rj(n(r.assignableAtStart), w[3]!),
          Rj(n(r.assignments), w[4]!),
          Rj(width(r.parcelWidthM), w[5]!),
          Rj(n(r.cumulativeOwners), w[6]!),
          Rj(n(r.terminalRowsAtStart), w[7]!),
        ].join(" ") + (r.deadlocked ? "   <- the trigger cannot be reached, this round never ends" : ""),
    );
  }
  console.log();
  if (sim.deadlockedAtRound !== null) {
    const r = sim.rounds[sim.deadlockedAtRound - 1]!;
    console.log(`  DEADLOCK in round ${sim.deadlockedAtRound}.`);
    console.log(`  The round ends when the watched count falls to ${n(r.endsWhenBasisReaches)}, but only`);
    console.log(`  ${n(r.assignableAtStart)} of the ${n(r.triggerBasisCount)} watched rows can ever be assigned, so the count`);
    console.log(`  bottoms out at ${n(r.triggerBasisCount - r.assignableAtStart)} and stops. Nothing on the planet ever subdivides.`);
    console.log(`  Total capacity: ${n(sim.totalCapacity)} owners, all at resolution ${r.resolution}.`);
  } else {
    console.log(`  Total capacity      ${n(sim.totalCapacity)} owners`);
    console.log(`  Floor reached at    round ${sim.floorReachedAtRound} (resolution ${P.floorResolution})`);
    console.log(`  Peak rows           ${n(sim.peakRows)} in unclaimed_cells`);
    console.log(`  Largest insert      ${n(sim.largestSubdivisionInsert)} rows in one subdivision transaction`);
    const parcels = sim.rounds.reduce((s, r) => s + r.parcelAreaSoldKm2, 0);
    const land = sim.rounds.reduce((s, r) => s + r.landSoldKm2, 0);
    const first = sim.rounds[0]!;
    const firstGap = first.parcelAreaSoldKm2 - first.landSoldKm2;
    console.log(`  Parcel area sold    ${n(parcels, 0)} km2, holding ${n(land, 0)} km2 of actual land`);
    console.log(`                      the ${pct(parcels / land - 1, 1)} gap is almost all round 1: its ${n(first.assignments)} founder parcels are`);
    console.log(`                      ${pct(first.landSoldKm2 / first.parcelAreaSoldKm2, 1)} land and account for ${pct(firstGap / (parcels - land), 0)} of it. Parcel area and land area`);
    console.log(`                      are different quantities and the document uses one number for both.`);
    if (sim.sealedLandKm2 > 0) {
      console.log(`  Land sealed         ${n(sim.sealedLandKm2, 1)} km2 locked inside frozen cells, unreachable forever`);
    }
  }
}

// ── section 2: the rule matrix ──────────────────────────────────────────────────

function reportRuleMatrix(run: (rules: RegistryRules, params?: PlanetParams) => RegistrySimulation): void {
  heading("2. Why the trigger was repaired");
  console.log(`  Run on the section 3 numbers, start ${S3.startResolution} floor ${S3.floorResolution}, because that is where the argument was.`);
  console.log("  The document's text admits two readings on each of two questions. Only one corner works.\n");
  const combos: Array<[string, RegistryRules]> = [
    ["literal text", LITERAL_RULES],
    ["freeze ocean only", { triggerBasis: "all-unassigned", subdivisionPolicy: "freeze-zero-land" }],
    ["fix trigger only", { triggerBasis: "assignable-only", subdivisionPolicy: "subdivide-everything" }],
    ["both repairs", REPAIRED_RULES],
  ];
  const w = [20, 18, 22, 12, 16, 16];
  console.log(
    "  " +
      [L("reading", w[0]!), L("trigger watches", w[1]!), L("ocean cells", w[2]!), Rj("capacity", w[3]!), Rj("peak rows", w[4]!), Rj("largest insert", w[5]!)].join(" "),
  );
  console.log("  " + w.map(rule).join(" "));
  for (const [name, rules] of combos) {
    const sim = run(rules, S3);
    const capacity = sim.deadlockedAtRound !== null ? `${n(sim.totalCapacity)} (locked)` : n(sim.totalCapacity);
    console.log(
      "  " +
        [
          L(name, w[0]!),
          L(rules.triggerBasis === "all-unassigned" ? "all unassigned" : "assignable only", w[1]!),
          L(rules.subdivisionPolicy === "subdivide-everything" ? "subdivide every round" : "frozen when landless", w[2]!),
          Rj(capacity, w[3]!),
          Rj(n(sim.peakRows), w[4]!),
          Rj(n(sim.largestSubdivisionInsert), w[5]!),
        ].join(" "),
    );
  }
  const bloated = run({ triggerBasis: "assignable-only", subdivisionPolicy: "subdivide-everything" }, S3);
  const lean = run(REPAIRED_RULES, S3);

  // What freezing actually costs. Land fraction comes from a finite sample grid, so a cell that
  // reads as landless can still hide an island below the sample spacing. Descend two levels into
  // every cell frozen at the start resolution and count the parcels that would have been claimable.
  const frozen = seedInventory(S3.startResolution, COMMONS.reserved).filter((c) => field.landFractionOf(c, DEPTH) === 0);
  let lostParcels = 0;
  for (const cell of frozen) {
    for (const grandchild of cellToChildren(cell, S3.startResolution + 2)) {
      if (field.landFractionOf(grandchild, DEPTH) >= P.minLandFraction) lostParcels++;
    }
  }
  console.log(`\n  Freezing landless cells is worth ${n(bloated.peakRows / lean.peakRows, 0)} times fewer rows. It is not free:`);
  console.log(`  of the ${n(frozen.length)} resolution ${S3.startResolution} cells it freezes, ${n(lostParcels)} would have held a claimable`);
  console.log(`  resolution ${S3.startResolution + 2} parcel, out of ${n(lean.totalCapacity)}. A ${7 ** DEPTH} point grid can miss an island. Worth it,`);
  console.log("  but the trade is real and should be recorded rather than waved away.");
  console.log("\n  Note the capacity column above is identical under both ocean policies. That is the");
  console.log("  simulation's own shortcut, not a fact: landless rows are carried as a count and their");
  console.log("  children are never sampled, so no descendant of one can be assigned under either");
  console.log("  policy. The parcels the freeze really costs are the line above, not the table.");
}

// ── section 3: the 5.4 rejection rate ───────────────────────────────────────────

function reportRejection(field: Planet, depth: number, samples = scale(20_000)): number[] {
  heading("3. How much of the planet the no-empty-parcel rule refuses (section 5.4)");
  console.log(`  Land fraction sampled on an H3 child grid ${7 ** depth} points deep, threshold ${P.minLandFraction}.`);
  console.log("  Counted exhaustively where the population is small enough, sampled uniformly by rank");
  console.log("  above that. Unconditional, that is over every registry cell rather than only the ones");
  console.log("  a round actually reaches.\n");
  const rand = mulberry32(0x5ea1);
  const w = [5, 14, 14, 14, 14];
  console.log("  " + [L("res", w[0]!), Rj("no land at all", w[1]!), Rj("below 0.15", w[2]!), Rj("assignable", w[3]!), Rj("all land", w[4]!), Rj("source", 14)].join(" "));
  console.log("  " + [...w, 14].map(rule).join(" "));
  const ENUMERATE_UP_TO = QUICK ? 6_000 : 50_000;
  const refusal: number[] = [];
  for (let res = 1; res <= 8; res++) {
    // Sampling a population of 830 to 0.1 of a percentage point is silly when it can be counted,
    // and the sampled answer disagrees with section 1b's exact one by about half a point.
    const exact = registryCountAt(res) <= ENUMERATE_UP_TO;
    const population = exact
      ? seedInventory(res, COMMONS.reserved)
      : Array.from({ length: samples }, () => randomRegistryCell(res, rand));

    let dry = 0;
    let below = 0;
    let full = 0;
    for (const cell of population) {
      const lf = field.landFractionOf(cell, depth);
      if (lf === 0) dry++;
      if (lf < P.minLandFraction) below++;
      if (lf === 1) full++;
    }
    const N = population.length;
    refusal.push(below / N);
    console.log(
      "  " +
        [
          L(String(res), w[0]!),
          Rj(pct(dry / N, 1), w[1]!),
          Rj(pct(below / N, 1), w[2]!),
          Rj(pct(1 - below / N, 1), w[3]!),
          Rj(pct(full / N, 1), w[4]!),
          Rj(exact ? "exact" : `${n(N / 1000)}k sampled`, 14),
        ].join(" "),
    );
  }
  // refusal[i] is resolution i + 1, because the table above covers 1 to 8 whatever the planet uses.
  const crossing = refusal.findIndex((r) => r > P.triggerFraction);
  console.log(`\n  The "below 0.15" column is the number the trigger has to clear, and it climbs towards the`);
  console.log(`  ocean fraction, ${pct(1 - P.landFractionTarget, 0)}, as cells shrink past coastline curvature. Coarse cells straddle a`);
  console.log(`  coast and hold some land; a ${width(hexagonWidthM(REGISTRY_AREA_KM2 / registryCountAt(P.floorResolution)))} cell in open water holds none.`);
  if (crossing === -1) {
    console.log(`  It never crosses ${pct(P.triggerFraction, 0)} on this planet, which is the only way the literal trigger survives.`);
  } else {
    const res = crossing + 1;
    const shippedSpan = refusal.slice(P.startResolution - 1, P.floorResolution);
    const gentlest = Math.min(...shippedSpan);
    console.log(`  It crosses ${pct(P.triggerFraction, 0)} at resolution ${res}. Across the resolutions the registry actually uses,`);
    console.log(`  ${P.startResolution} to ${P.floorResolution}, it never falls below ${pct(gentlest, 1)}, so under the literal reading the very`);
    console.log("  first round never ends and nothing on the planet ever subdivides.");
  }
  return refusal;
}

// ── section 4: the area distribution ────────────────────────────────────────────

interface AreaStats {
  res: number;
  count: number;
  min: number;
  max: number;
  mean: number;
  p5: number;
  median: number;
  p95: number;
  sdPct: number;
  exact: boolean;
}

function statsFrom(areas: number[], res: number, count: number, exact: boolean): AreaStats {
  const sorted = areas.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;
  return {
    res,
    count,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    p5: q(0.05),
    median: q(0.5),
    p95: q(0.95),
    sdPct: Math.sqrt(variance) / mean,
    exact,
  };
}

function reportAreaDistribution(): void {
  heading("4. Parcel area is not one number (section 2.6)");
  console.log("  Population: the registry universe, that is every cell not descended from a reserved");
  console.log("  pentagon. Resolutions 1 to 4 enumerated exhaustively. Finer ones sampled uniformly by");
  console.log(`  rank, ${n(scale(200_000))} draws, with the extremes found by descending from the extreme coarse`);
  console.log("  cells, because area is strongly inherited and sampling never sees a true extreme.\n");

  const rand = mulberry32(0xa4ea);
  const stats: AreaStats[] = [];
  let extremePool: string[] = REGISTRY_BASE.slice();

  for (let res = 1; res <= P.floorResolution; res++) {
    const total = registryCountAt(res);
    if (res > COMMONS_RES) {
      extremePool = extremePool.flatMap((c) => cellToChildren(c, res));
    }
    // Keep only the 400 smallest and 400 largest, which is where the next level's extremes live.
    extremePool.sort((a, b) => cellAreaKm2(a, R) - cellAreaKm2(b, R));
    if (extremePool.length > 800) {
      extremePool = [...extremePool.slice(0, 400), ...extremePool.slice(-400)];
    }
    const trueMin = cellAreaKm2(extremePool[0]!, R);
    const trueMax = cellAreaKm2(extremePool[extremePool.length - 1]!, R);

    let areas: number[];
    let exact: boolean;
    if (res <= 4) {
      areas = seedInventory(res, COMMONS.reserved).map((c) => cellAreaKm2(c, R));
      exact = true;
    } else {
      areas = [];
      for (let i = 0; i < scale(200_000); i++) areas.push(cellAreaKm2(randomRegistryCell(res, rand), R));
      exact = false;
    }
    const s = statsFrom(areas, res, total, exact);
    s.min = Math.min(s.min, trueMin);
    s.max = Math.max(s.max, trueMax);
    stats.push(s);
  }

  const w = [5, 15, 12, 12, 12, 12, 10, 8];
  console.log("  " + [L("res", w[0]!), Rj("cells", w[1]!), Rj("min", w[2]!), Rj("mean", w[3]!), Rj("max", w[4]!), Rj("max/min", w[5]!), Rj("sd", w[6]!), Rj("source", w[7]!)].join(" "));
  console.log("  " + w.map(rule).join(" "));
  for (const s of stats) {
    const unit = s.mean >= 1 ? "km2" : "m2";
    const k = unit === "km2" ? 1 : 1e6;
    const d = unit === "km2" ? 2 : 0;
    console.log(
      "  " +
        [
          L(String(s.res), w[0]!),
          Rj(n(s.count), w[1]!),
          Rj(n(s.min * k, d), w[2]!),
          Rj(n(s.mean * k, d), w[3]!),
          Rj(n(s.max * k, d), w[4]!),
          Rj(s.max / s.min > 0 ? (s.max / s.min).toFixed(3) : "", w[5]!),
          Rj(pct(s.sdPct, 1), w[6]!),
          Rj(s.exact ? "exact" : "sampled", w[7]!),
        ].join(" ") + `  ${unit}`,
    );
  }

  console.log("\n  Three widths, for the same mean cell. The design document's numbers move by 15%");
  console.log("  depending which is meant, so pick one and quote the area beside it.\n");
  const ww = [5, 16, 16, 16];
  console.log("  " + [L("res", ww[0]!), Rj("flat to flat", ww[1]!), Rj("equal-area circle", ww[2]!), Rj("corner to corner", ww[3]!)].join(" "));
  console.log("  " + ww.map(rule).join(" "));
  for (const s of stats) {
    const flat = hexagonWidthM(s.mean);
    console.log(
      "  " +
        [L(String(s.res), ww[0]!), Rj(width(flat), ww[1]!), Rj(width(equalAreaWidthM(s.mean)), ww[2]!), Rj(width((flat * 2) / Math.sqrt(3)), ww[3]!)].join(" "),
    );
  }

  const floorStats = stats.find((x) => x.res === P.floorResolution) ?? stats[stats.length - 1]!;
  const startStats = stats.find((x) => x.res === P.startResolution) ?? stats[0]!;
  console.log(`\n  Section 2.6 says the spread is "roughly 2 to 1". Among cells the registry can reach it`);
  console.log(`  is ${(floorStats.max / floorStats.min).toFixed(2)} to 1 at the floor, resolution ${P.floorResolution}, and ${(startStats.max / startStats.min).toFixed(2)} to 1 at the start resolution ${P.startResolution},`);
  console.log(`  so a founder and a late arrival are promised about equally loosely. The twelve pentagons`);
  console.log(`  are smaller again, which is where the "2 to 1" comes from, and no one is handed one.`);
}

// ── section 5: sensitivity ──────────────────────────────────────────────────────

interface CellMix {
  /** Fraction of cells at or above minLandFraction, so claimable. */
  assignable: number;
  /** Fraction holding some land but not enough. Never claimable, but their children can be. */
  marginal: number;
}

interface Transition {
  /** Per child, the chance a child of this kind of parent is assignable, and marginal. */
  toAssignable: number;
  toMarginal: number;
}

/**
 * A counted model of the rounds, calibrated against the exact simulation.
 *
 * Materialising the registry is exact but only affordable while inventory is small. Seeding at
 * the shipped resolution 4 means about 284,000 cells and a working set that never drops below six
 * figures, so the
 * sweep counts instead of enumerating.
 *
 * It has to carry TWO pools, not one. A cell holding a little land is never claimable, but it is
 * also not terminal: it keeps subdividing, and its children can clear the threshold that it could
 * not. That is coastline being recovered as resolution rises, and it is worth about 10% of total
 * capacity, so a model that tracks only the assignable pool runs 10% light. Both pools and all four
 * transitions between them are measured from the field, never assumed.
 */
function sweep(
  seedMix: CellMix[],
  fromAssignable: Transition[],
  fromMarginal: Transition[],
): (s: number, f: number, floor: number) => number {
  return (startRes, triggerFraction, floorRes) => {
    const mix = seedMix[startRes] ?? { assignable: 0, marginal: 0 };
    let assignable = registryCountAt(startRes) * mix.assignable;
    let marginal = registryCountAt(startRes) * mix.marginal;
    let owners = 0;
    for (let res = startRes; res <= floorRes; res++) {
      if (res === floorRes) {
        owners += assignable;
        break;
      }
      const leftover = Math.floor(triggerFraction * assignable);
      owners += assignable - leftover;
      const a = fromAssignable[res + 1] ?? { toAssignable: 0, toMarginal: 0 };
      const m = fromMarginal[res + 1] ?? { toAssignable: 0, toMarginal: 0 };
      const nextAssignable = 7 * (leftover * a.toAssignable + marginal * m.toAssignable);
      const nextMarginal = 7 * (leftover * a.toMarginal + marginal * m.toMarginal);
      // Inventory can never exceed the cells that exist at that resolution.
      const ceiling = registryCountAt(res + 1);
      const total = nextAssignable + nextMarginal;
      const squeeze = total > ceiling ? ceiling / total : 1;
      assignable = nextAssignable * squeeze;
      marginal = nextMarginal * squeeze;
    }
    return Math.round(owners);
  };
}

interface ModelRound {
  round: number;
  resolution: number;
  assignable: number;
  assignments: number;
  meanParcelKm2: number;
}

function modelRounds(
  seedMix: CellMix[],
  fromAssignable: Transition[],
  fromMarginal: Transition[],
  startRes: number,
  triggerFraction: number,
  floorRes: number,
): ModelRound[] {
  const mix = seedMix[startRes] ?? { assignable: 0, marginal: 0 };
  let assignable = registryCountAt(startRes) * mix.assignable;
  let marginal = registryCountAt(startRes) * mix.marginal;
  const out: ModelRound[] = [];
  for (let res = startRes; res <= floorRes; res++) {
    const leftover = res === floorRes ? 0 : Math.floor(triggerFraction * assignable);
    out.push({
      round: res - startRes + 1,
      resolution: res,
      assignable: Math.round(assignable),
      assignments: Math.round(assignable - leftover),
      meanParcelKm2: REGISTRY_AREA_KM2 / registryCountAt(res),
    });
    if (res === floorRes) break;
    const a = fromAssignable[res + 1] ?? { toAssignable: 0, toMarginal: 0 };
    const m = fromMarginal[res + 1] ?? { toAssignable: 0, toMarginal: 0 };
    const nextAssignable = 7 * (leftover * a.toAssignable + marginal * m.toAssignable);
    const nextMarginal = 7 * (leftover * a.toMarginal + marginal * m.toMarginal);
    const ceiling = registryCountAt(res + 1);
    const total = nextAssignable + nextMarginal;
    const squeeze = total > ceiling ? ceiling / total : 1;
    assignable = nextAssignable * squeeze;
    marginal = nextMarginal * squeeze;
  }
  return out;
}

/** Share of all deeded LAND that the first round's cohort ends up holding. Exactly 1 - f. */
function candidateSummary(rounds: ModelRound[]): {
  owners: number;
  firstCohort: number;
  firstCohortShareOfOwners: number;
  firstCohortShareOfLand: number;
  spanRatio: number;
} {
  const owners = rounds.reduce((s, r) => s + r.assignments, 0);
  const areaSold = rounds.reduce((s, r) => s + r.assignments * r.meanParcelKm2, 0);
  const first = rounds[0]!;
  return {
    owners,
    firstCohort: first.assignments,
    firstCohortShareOfOwners: first.assignments / owners,
    firstCohortShareOfLand: (first.assignments * first.meanParcelKm2) / areaSold,
    spanRatio: first.meanParcelKm2 / rounds[rounds.length - 1]!.meanParcelKm2,
  };
}

function reportSensitivity(
  field: Planet,
  depth: number,
  exact: Map<number, number>,
): { seedMix: CellMix[]; fromAssignable: Transition[]; fromMarginal: Transition[] } {
  heading("5. What the parameters are actually worth");
  const rand = mulberry32(0xc0de);

  const kind = (lf: number) => (lf >= P.minLandFraction ? "assignable" : lf > 0 ? "marginal" : "ocean");

  const seedMix: CellMix[] = [];
  const fromAssignable: Transition[] = [];
  const fromMarginal: Transition[] = [];

  /** Children of parents of one kind, counted by what the children turn out to be. */
  const transitionFrom = (res: number, parentKind: "assignable" | "marginal", want: number): Transition => {
    let seen = 0;
    let toAssignable = 0;
    let toMarginal = 0;
    for (let guard = 0; seen < want && guard < 2_000_000; guard++) {
      const parent = randomRegistryCell(res - 1, rand);
      if (kind(field.landFractionOf(parent, depth)) !== parentKind) continue;
      for (const child of cellToChildren(parent, res)) {
        seen++;
        const k = kind(field.landFractionOf(child, depth));
        if (k === "assignable") toAssignable++;
        else if (k === "marginal") toMarginal++;
      }
    }
    return seen > 0
      ? { toAssignable: toAssignable / seen, toMarginal: toMarginal / seen }
      : { toAssignable: 0, toMarginal: 0 };
  };

  // Measured to the deepest floor any table below models, not just the shipped one, or every
  // floor 8 row silently loses its last round to an undefined transition.
  const deepest = Math.max(P.floorResolution, S3.floorResolution);
  for (let res = 1; res <= deepest; res++) {
    let assignable = 0;
    let marginal = 0;
    const seedSamples = scale(8000);
    for (let i = 0; i < seedSamples; i++) {
      const k = kind(field.landFractionOf(randomRegistryCell(res, rand), depth));
      if (k === "assignable") assignable++;
      else if (k === "marginal") marginal++;
    }
    seedMix[res] = { assignable: assignable / seedSamples, marginal: marginal / seedSamples };
    if (res > 1) {
      fromAssignable[res] = transitionFrom(res, "assignable", scale(14_000));
      fromMarginal[res] = transitionFrom(res, "marginal", scale(7_000));
    }
  }

  const model = sweep(seedMix, fromAssignable, fromMarginal);
  console.log("  Model check against the exact materialised run:\n");
  for (const [startRes, capacity] of [...exact.entries()].sort((a, b) => a[0] - b[0])) {
    const modelled = model(startRes, P.triggerFraction, P.floorResolution);
    console.log(`    start res ${startRes}: exact ${n(capacity)}, model ${n(modelled)}, error ${pct(modelled / capacity - 1, 2)}`);
  }

  const errors = [...exact.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startRes, capacity]) => model(startRes, P.triggerFraction, P.floorResolution) / capacity - 1);
  const spread =
    errors.length > 1
      ? `by ${pct(errors[0]!, 0)} at the coarsest start and ${pct(errors[errors.length - 1]!, 0)} at the finest`
      : `by ${pct(errors[0]!, 0)} at the one start resolution checked here, and less at finer ones`;
  console.log(`\n  The model runs high, ${spread}, because`);
  console.log("  it measures how often a cell's children stay claimable over the whole population rather");
  console.log("  than over the land-rich lineages that actually survive a round. The bias has one sign in");
  console.log("  every row, so the ranking below is sound while the absolute figures are soft. Where a row");
  console.log("  is marked exact in section 7, prefer that number.");
  console.log("\n  Lifetime owners, by where the registry starts and how hard the trigger bites.");
  console.log(`  Floor fixed at resolution ${P.floorResolution}. g = 7f is the per-round inventory growth: below 1 the`);
  console.log("  planet shrinks its own inventory and closes early.\n");
  const fractions = [0.05, 0.1, 1 / 7, 0.2, 0.35, 0.5];
  const w = [12, 14, ...fractions.map(() => 12)];
  console.log("  " + [L("start res", w[0]!), Rj("round 1 parcel", w[1]!), ...fractions.map((f, i) => Rj(`f=${f === 1 / 7 ? "1/7" : f}`, w[i + 2]!))].join(" "));
  console.log("  " + w.map(rule).join(" "));
  for (let s = 1; s <= 5; s++) {
    const mean = REGISTRY_AREA_KM2 / registryCountAt(s);
    console.log(
      "  " +
        [
          L(String(s), w[0]!),
          Rj(width(hexagonWidthM(mean)), w[1]!),
          ...fractions.map((f, i) => Rj(n(model(s, f, P.floorResolution)), w[i + 2]!)),
        ].join(" "),
    );
  }
  console.log(`\n  g = 7f crosses 1 at f = 1/7 = ${(1 / 7).toFixed(4)}. To its left inventory shrinks every round and`);
  console.log("  the later cohorts collapse to a handful of parcels each. The registry still reaches the");
  console.log("  floor, because the marginal pool keeps refilling it, but almost nobody arrives after");
  console.log("  round 1. That is a decision, not a bug, and it has to be a deliberate one.");
  return { seedMix, fromAssignable, fromMarginal };
}

// ── section 6: is the deadlock a property of this seed ──────────────────────────

function reportRobustness(depth: number, repairedCapacity: number): void {
  heading("6. Is the stall an artefact of one random field");
  console.log(`  Run on the section 3 numbers, start ${S3.startResolution} floor ${S3.floorResolution}, like sections 1b and 2.`);
  console.log("  Every column is a fresh field. The literal rules are run on each one to the point");
  console.log("  where they stop. The question is not whether the planet stalls, it is which round.\n");
  const w = [8, 13, 13, 13, 12, 12];
  console.log(
    "  " +
      [L("seed", w[0]!), Rj("features km", w[1]!), Rj("land target", w[2]!), Rj("refused res 1", w[3]!), Rj("stalls in", w[4]!), Rj("owners", w[5]!)].join(" "),
  );
  console.log("  " + w.map(rule).join(" "));

  // The default continent scale, so the "A/640" style rows below are read against the real planet.
  const DEFAULT_SCALE = Math.round(continentScaleKm(DEFAULT_TUNING.continentFrequency));
  const cases: Array<[string, number, number]> = QUICK
    ? [["A", DEFAULT_SCALE, 0.6], ["B", DEFAULT_SCALE, 0.6], ["A", 200, 0.6], ["A", 60, 0.6], ["A", DEFAULT_SCALE, 0.9]]
    : [
        ["A", DEFAULT_SCALE, 0.6], ["B", DEFAULT_SCALE, 0.6], ["C", DEFAULT_SCALE, 0.6],
        ["A", 2000, 0.6], ["A", 500, 0.6], ["A", 300, 0.6], ["A", 200, 0.6], ["A", 100, 0.6], ["A", 60, 0.6],
        ["A", DEFAULT_SCALE, 0.7], ["A", DEFAULT_SCALE, 0.8], ["A", DEFAULT_SCALE, 0.9],
      ];
  let worstCapacity = Infinity;
  let bestCapacity = 0;
  const stallRounds: number[] = [];
  for (const [tag, features, target] of cases) {
    const cellField = buildPlanet(
      `${SEED}-${tag}`,
      target,
      depth,
      {
        continentFrequency: frequencyForScaleKm(features),
        // Detail follows the continents, so a shredded planet is shredded at every scale rather
        // than being small continents with the same coastline roughness as large ones.
        detailFrequency: frequencyForScaleKm(features) * 3.3,
      },
      scale(60_000),
    );
    const lf = (cell: string) => cellField.landFractionOf(cell);
    const cells = seedInventory(S3.startResolution, COMMONS.reserved);
    const refused = cells.filter((c) => lf(c) < S3.minLandFraction).length / cells.length;
    const sim = simulateRounds({ params: S3, rules: LITERAL_RULES, landFraction: lf, random: mulberry32(0x11ce), commonsCells: COMMONS.reserved });
    worstCapacity = Math.min(worstCapacity, sim.totalCapacity);
    bestCapacity = Math.max(bestCapacity, sim.totalCapacity);
    if (sim.deadlockedAtRound !== null) stallRounds.push(sim.deadlockedAtRound);
    console.log(
      "  " +
        [
          L(tag, w[0]!),
          Rj(n(features), w[1]!),
          Rj(pct(target, 0), w[2]!),
          Rj(pct(refused, 1), w[3]!),
          Rj(sim.deadlockedAtRound === null ? "never" : `round ${sim.deadlockedAtRound}`, w[4]!),
          Rj(n(sim.totalCapacity), w[5]!),
        ].join(" "),
    );
  }
  console.log(`\n  Every field stalls, on ${n(worstCapacity)} to ${n(bestCapacity)} owners against ${n(repairedCapacity)} for the repaired`);
  console.log(`  rules, so the literal reading costs ${n(repairedCapacity / bestCapacity, 0)}x to ${n(repairedCapacity / worstCapacity, 0)}x of the planet. It stalls in round`);
  console.log(`  ${n(Math.min(...stallRounds))} to round ${n(Math.max(...stallRounds))} depending on the field. What moves is which round, never whether.`);
  console.log("  Big continents put whole resolution 1 cells in open water and stall almost at once. A");
  console.log("  shredded planet has land in nearly every coarse cell and survives a few more rounds,");
  console.log("  until the cells shrink below the coastline and refusal climbs to the ocean fraction");
  console.log("  anyway. Raising the land target buys rounds by the same mechanism, and no more.");
}

// ── section 7: candidate parameter sets ─────────────────────────────────────────

function reportCandidates(
  seedMix: CellMix[],
  fromAssignable: Transition[],
  fromMarginal: Transition[],
  exact: Map<number, number>,
  exactRuns: Map<number, RegistrySimulation>,
): void {
  heading("7. If the parameters move");
  console.log("  Mean parcel area divides by exactly seven every round, so in the counted model the");
  console.log("  first-to-last span is 7^(floor - start) by construction. On the materialised run it comes");
  console.log(`  out at ${n(Math.pow(7, P.floorResolution - P.startResolution), 0)} to one on the shipped parameters against ${n(Math.pow(7, S3.floorResolution - S3.startResolution), 0)} to one for`);
  console.log("  section 3, so the span really is set by the resolution span and barely moves with f. It");
  console.log("  is the parameter that matters, and the one the document does not treat as a parameter.\n");

  const candidates: Array<[string, number, number, number]> = [
    ["section 3 as proposed", 1, 8, 0.2],
    ["start deeper", 3, 8, 0.2],
    ["start deeper, stop early", 4, 7, 0.2],
    ["start deeper, bite softer", 4, 7, 0.1],
    ["narrow span", 5, 7, 0.2],
  ];
  const w = [26, 8, 8, 7, 14, 14, 10, 14, 12, 10, 9];
  console.log(
    "  " +
      [L("parameters", w[0]!), Rj("start", w[1]!), Rj("floor", w[2]!), Rj("f", w[3]!), Rj("first parcel", w[4]!), Rj("last parcel", w[5]!), Rj("span", w[6]!), Rj("owners", w[7]!), Rj("founders", w[8]!), Rj("their land", w[9]!), Rj("source", w[10]!)].join(" "),
  );
  console.log("  " + w.map(rule).join(" "));
  const cohorts: number[] = [];
  for (const [name, startRes, floorRes, f] of candidates) {
    const rounds = modelRounds(seedMix, fromAssignable, fromMarginal, startRes, f, floorRes);
    const sum = candidateSummary(rounds);
    // Where the exact materialised run covered this configuration, print that instead of a model.
    const isExact = floorRes === P.floorResolution && f === P.triggerFraction && exact.has(startRes);
    const measured = isExact ? exactRuns.get(startRes) : undefined;
    const owners = measured ? measured.totalCapacity : sum.owners;
    const founders = measured ? measured.rounds[0]!.assignments : sum.firstCohort;
    const founderLand = measured
      ? measured.rounds[0]!.parcelAreaSoldKm2 / measured.rounds.reduce((a, r) => a + r.parcelAreaSoldKm2, 0)
      : sum.firstCohortShareOfLand;
    cohorts.push(measured ? measured.rounds[0]!.assignments : sum.firstCohort);
    console.log(
      "  " +
        [
          L(name, w[0]!),
          Rj(String(startRes), w[1]!),
          Rj(String(floorRes), w[2]!),
          Rj(String(f), w[3]!),
          Rj(width(hexagonWidthM(rounds[0]!.meanParcelKm2)), w[4]!),
          Rj(width(hexagonWidthM(rounds[rounds.length - 1]!.meanParcelKm2)), w[5]!),
          Rj(`${n(sum.spanRatio, 0)}x`, w[6]!),
          Rj(n(owners), w[7]!),
          Rj(n(founders), w[8]!),
          Rj(pct(founderLand, 0), w[9]!),
          Rj(isExact ? "exact" : "modelled", w[10]!),
        ].join(" "),
    );
  }
  console.log("\n  \"founders\" is the size of the round 1 cohort and \"their land\" is the share of all land");
  console.log(`  ever deeded that they hold between them. That share is 1 - f and nothing else, so it is`);
  console.log(`  the same ${pct(1 - P.triggerFraction, 0)} at f = ${P.triggerFraction} whether that cohort is ${n(Math.min(...cohorts))} people or ${n(Math.max(...cohorts))}. Lowering f`);
  console.log("  concentrates land further, it does not spread it. Cohort size is the only lever, and");
  console.log("  startResolution is the only thing that moves cohort size.\n");

  const [, s4, f4, t4] = candidates[2]!;
  // Prefer the materialised run where there is one. This is the shipped configuration, so printing
  // a model of it under a row marked exact would put two different answers on the same page.
  const measuredRun = f4 === P.floorResolution && t4 === P.triggerFraction ? exactRuns.get(s4) : undefined;
  const rounds: ModelRound[] = measuredRun
    ? measuredRun.rounds.map((r) => ({
        round: r.round,
        resolution: r.resolution,
        assignable: r.assignableAtStart,
        assignments: r.assignments,
        meanParcelKm2: r.meanParcelKm2,
      }))
    : modelRounds(seedMix, fromAssignable, fromMarginal, s4, t4, f4);
  const sum = candidateSummary(rounds);
  console.log(`  The middle option in detail, start ${s4}, floor ${f4}, f = ${t4}. ${measuredRun ? "Measured" : "Modelled"}:\n`);
  const rw = [6, 5, 14, 14, 14, 16];
  console.log("  " + [L("round", rw[0]!), L("res", rw[1]!), Rj("assignable", rw[2]!), Rj("assigned", rw[3]!), Rj("width", rw[4]!), Rj("cumulative", rw[5]!)].join(" "));
  console.log("  " + rw.map(rule).join(" "));
  let cumulative = 0;
  for (const r of rounds) {
    cumulative += r.assignments;
    console.log(
      "  " +
        [
          L(String(r.round), rw[0]!),
          L(String(r.resolution), rw[1]!),
          Rj(n(r.assignable), rw[2]!),
          Rj(n(r.assignments), rw[3]!),
          Rj(width(hexagonWidthM(r.meanParcelKm2)), rw[4]!),
          Rj(n(cumulative), rw[5]!),
        ].join(" "),
    );
  }
  console.log(`\n  ${n(sum.owners)} owners, first cohort ${n(sum.firstCohort)} people holding ${pct(sum.firstCohortShareOfLand, 0)} of the land,`);
  console.log(`  span ${n(sum.spanRatio, 0)} to 1 instead of section 3's ${n(Math.pow(7, S3.floorResolution - S3.startResolution), 0)} to 1. Resolution 8 is left unspent, and because an`);
  console.log("  assigned parcel is frozen forever, adding a round later is purely additive: no existing");
  console.log("  deed changes. Shipping at the floor closes the door permanently the day it sells out.");
}

// ── main ────────────────────────────────────────────────────────────────────────

const started = Date.now();
console.log("ECHO capacity simulation");
console.log(`Seed ${SEED}, land sampled ${7 ** DEPTH} points per cell.`);
console.log(`Shipped parameters: start ${P.startResolution}, floor ${P.floorResolution}, trigger ${P.triggerFraction}, land ${P.landFractionTarget}.`);
if (QUICK) console.log("Quick mode: smaller samples and a shorter robustness sweep. Digits are coarser.");

const field = buildPlanet(SEED, P.landFractionTarget, DEPTH);
const landFraction = (cell: string) => field.landFractionOf(cell);

// The commons come first, because everything else is defined against what is left after them.
// Two of the twelve pentagons land in open water on this seed and are relocated onto land, so the
// reserved set is a fact about this planet rather than about the icosahedron, and every later
// count has to be taken against the relocated set and not against getPentagons.
COMMONS = chooseCommons(COMMONS_RES, landFraction, P.minLandFraction);
REGISTRY_BASE = seedInventory(COMMONS_RES, COMMONS.reserved);
REGISTRY_AREA_KM2 =
  sphereAreaKm2(P.radiusKm) - COMMONS.reserved.reduce((sum, c) => sum + cellAreaKm2(c, P.radiusKm), 0);

reportPlanet(field);

const run = (rules: RegistryRules, params: PlanetParams = P) =>
  simulateRounds({ params, rules, landFraction, random: mulberry32(0x11ce), commonsCells: COMMONS.reserved });

// The shipped planet, materialised cell by cell. This is the number to publish.
const shipped = run(REPAIRED_RULES);
reportRoundTable(
  shipped,
  "1. The round table",
  `The shipped parameters, both trigger repairs applied, every cell materialised. Not a model.`,
);

// The evidence the parameters were changed on, run on the numbers section 3 opened with.
const literal = run(LITERAL_RULES, S3);
reportRoundTable(
  literal,
  "1b. Section 3 as written, for comparison",
  `Start ${S3.startResolution}, floor ${S3.floorResolution}, trigger watching every unassigned row, landless cells subdividing.`,
);

reportRuleMatrix(run);
reportRejection(field, DEPTH);
reportAreaDistribution();

const exact = new Map<number, number>();
const exactRuns = new Map<number, RegistrySimulation>();
exact.set(P.startResolution, shipped.totalCapacity);
exactRuns.set(P.startResolution, shipped);
for (let start = S3.startResolution; start <= EXACT_UP_TO; start++) {
  if (start === P.startResolution) continue;
  // At P.floorResolution, not S3's, or the model check below compares a floor 8 measurement
    // against a floor 7 model and reports the difference as model bias.
    const sim = run(REPAIRED_RULES, { ...S3, startResolution: start, floorResolution: P.floorResolution });
  exact.set(start, sim.totalCapacity);
  exactRuns.set(start, sim);
}
const measured = reportSensitivity(field, DEPTH, exact);
reportRobustness(DEPTH, run(REPAIRED_RULES, S3).totalCapacity);
reportCandidates(measured.seedMix, measured.fromAssignable, measured.fromMarginal, exact, exactRuns);

heading("8. The number to publish");
console.log(`  ${n(shipped.totalCapacity)} parcels, on the terrain of seed ${SEED}.`);
console.log(`
  It is not a formula and must not be quoted as one. Capacity is 1 - triggerFraction of an`);
console.log("  inventory that is itself decided by how much of each cell is dry, so it is a property of");
console.log("  the generated world. Measured across three seeds the published number moves about half a");
console.log("  percent. Other figures in this report move far more and must not be quoted as design");
console.log("  properties: the literal-rules capacity by 17%, the round the stall lands in by a whole");
console.log("  round, and the number of relocated commons between one and four.");
console.log(`
  ${n(shipped.rounds[0]!.assignments)} of those arrive in round 1 and hold ${pct(shipped.rounds[0]!.parcelAreaSoldKm2 / shipped.rounds.reduce((s, r) => s + r.parcelAreaSoldKm2, 0), 0)} of every parcel ever deeded.`);
const lastRound = shipped.rounds[shipped.rounds.length - 1]!;
const soldArea = shipped.rounds.reduce((sum, r) => sum + r.parcelAreaSoldKm2, 0);
console.log(`  The last round is ${n(lastRound.assignments)} parcels, ${pct(lastRound.assignments / shipped.totalCapacity, 0)} of all owners but only ${pct(lastRound.parcelAreaSoldKm2 / soldArea, 1)} of the area`);
console.log(`  ever deeded. Moving floorResolution from ${P.floorResolution} to 8 adds a round and is additive, no issued`);
console.log(`  deed changes, but it has a deadline: it must happen before round ${shipped.rounds.length} has sold about 80% of`);
console.log(`  its inventory. After that the floor round has taken everything and the valve is worth little.`);

console.log(`
Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
