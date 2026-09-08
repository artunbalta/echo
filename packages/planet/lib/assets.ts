/**
 * The asset registry and the placer (contract, plan §4).
 *
 * An asset class is a kind of thing that stands on the ground: a cactus, a boulder, a reed bed. The
 * registry says where each may stand, how thickly, and what it collides with. The placer turns a
 * biome mask plus the registry into positions, and it does so by hashing world positions, never by
 * drawing random numbers, so the same seed and the same registry give the same world on a server,
 * in a browser and next year.
 *
 * What this file decides and the renderer does not: density, biome affinity, altitude and water
 * bands, clustering, exclusions, LOD distances and colliders. What the renderer decides: the mesh.
 *
 * Content lives in DEMO_ASSET_CLASSES at the bottom and is deliberately small: only the classes the
 * chosen demo cell's biomes call for (plan B4). Densities there are provisional and A2 tunes them
 * against the instance ceiling; the rules are the contract, the numbers are not.
 */

import type { BiomeMask } from "./biome-mask.js";
import { hashPosition } from "./scene.js";
import type { RegionBound } from "./walkable.js";
import { hashString, type Biome, type Seed } from "./terrain.js";
import { DEMO_LAND_BIOMES } from "./demo-cell.js";

export type AssetClassId = string;

export type ExclusionKind = "path" | "water" | "footprint" | "sightline";

export interface AssetClass {
  id: AssetClassId;
  /** Relative weight per biome, 0..1. Absent or zero means never placed there. */
  biomes: Partial<Record<Biome, number>>;
  /** Candidates per square kilometre before the biome weight and the bands thin them. */
  densityPerKm2: number;
  /** Normalised height band (0 is the shoreline, 1 this planet's high ground). */
  altitude?: { min: number; max: number };
  /** Distance to water band, metres. `max` Infinity means anywhere inland. */
  waterDistanceM?: { min: number; max: number };
  /** When set, each accepted candidate is a cluster centre with `count` members within `radiusM`. */
  cluster?: { radiusM: number; count: number };
  excludes: readonly ExclusionKind[];
  /**
   * Where the renderer may stop drawing the whole form, metres from the lens.
   *
   * WHAT THIS COMMENT USED TO SAY, and it was authored before anything read either number: "full
   * mesh within `nearM`, impostor to `farM`, culled beyond". DECISIONS C21 built the far band and
   * that sentence describes a scheme this world cannot have. `farM` as a CULL distance would delete
   * ferns at 220 m and shells at 120, which is well inside the 420 m the client's fog takes a
   * fragment at, so a player would watch the ground go bare in front of them. And `nearM` as the
   * impostor distance is 60 to 200 m, where a thicket is thirty pixels tall and a card standing in
   * for it is plainly a card.
   *
   * WHAT IT MEANS NOW, which is the two bands the renderer actually draws: the full form within
   * `farM`, and one cheap stand-in past it, never culled. `nearM` is STILL READ BY NOBODY and is
   * kept because it is the distance at which a class stops being worth its detail, which is a fact
   * about the class that a future third band would want; it is not a promise the renderer keeps.
   *
   * AND `farM` IS NOW MEASURED RATHER THAN AUTHORED (DECISIONS C22). The values under
   * ASSET_CLASSES were chosen before anything read them, for a world bigger than the one that
   * ships, and six classes carried 900 m against a scatter disk `SCATTER_FALLOFF` cuts dead at
   * 500 m: not one instance of those six was ever past its own far distance from any camera a
   * person can reach. Each value is now the nearest distance at which the switch to the class's own
   * card costs no more than two pixels of the shipped frame, bisected off the form's own geometry;
   * `apps/web/tests/farBand.test.mts` re-derives the whole table and fails if a number here drifts
   * from the form it was measured against.
   *
   * `nearM` DID NOT MOVE WITH IT, and the question was asked rather than skipped. It is a different
   * fact: `farM` is where the form stops being DISTINGUISHABLE from two triangles, `nearM` is where
   * it stops being worth its detail, which is nearer by construction and is where a third band
   * would begin. Nothing reads it, so moving it would move nothing; what it must not do is overtake
   * `farM`, and after C22 the narrowest gap left is shell's 40 m inside 160 m.
   *
   * Neither number moves an instance: `placeAssets` does not read them, so an edit here is a
   * renderer change and not a placement one. It is still a REGISTRY-VERSION change under DECISIONS
   * C5, because ASSET_CLASSES is shared with the server by contract and a client and a server that
   * disagree about which form is drawn disagree about the registry; see ASSET_REGISTRY_VERSION.
   */
  lod: { nearM: number; farM: number };
  /**
   * Null for things you walk over (a dune ripple, a shell).
   *
   * These two are TRUE METRES and are not touched by DECISIONS C1's height scale. A collider is a
   * property of the thing standing on the ground, not of the ground: `heightScaleM` scales the
   * terrain, every instance is then seated on it by `frame.toScene`, and the trunk stays the same
   * trunk. The one number downstream that reads `heightM` against a threshold is the scatter
   * layer's `blockingHeightM`, which is the same true metres, so it is unmoved for the same reason.
   */
  collider: { radiusM: number; heightM: number } | null;
  /** Uniform scale range; the value for a position is a hash of the position. */
  scale: [number, number];
  castsShadow: boolean;
}

export interface PlacedAsset {
  classId: AssetClassId;
  /** Local metres east and north of the anchor centre. */
  x: number;
  y: number;
  /**
   * How high this instance's GROUND stands on the planet. Not the ground it is drawn on.
   *
   * WHAT IT IS. The macro height under (x, y): `max(0, mask.heightAt(x, y)) * heightScaleM`. That
   * is the field the globe draws and the registry assigns parcels from, read off the biome mask by
   * NEAREST NEIGHBOUR on the mask's own grid, 10 m in every shipped build, and floored at sea level
   * so a candidate over water reports 0 rather than a depth.
   *
   * WHAT IT IS NOT. The surface anything is drawn on. Two things stand in between. The mask grid is
   * the smaller: 0.163 m in the mean and 0.818 m at worst. DECISIONS C2's detail displacement is
   * the larger and it did not exist when this field was documented as "metres above sea level":
   * `createSceneHeight` adds up to 4 m of walking-scale relief that a placer sampling the macro
   * field cannot see. Measured together over the 43,108 instances of the demo cell, z sits 1.150 m
   * in the mean, 2.410 m at p95 and 3.799 m at worst from the height the scene builder draws.
   * (Seed echo-capacity-1, cell 847b949ffffffff, mask 10 m, resolution 12 m, heightScaleM 2,700.)
   *
   * WHO MAY RELY ON IT. Anything reasoning about ALTITUDE rather than about contact: which height
   * band a class fell in, how high up the parcel an instance sits, bucketing or sorting by
   * elevation, a server asking whether two placements are on the same terrace. It is the same macro
   * field on both sides of the wire and it is a pure function of position, so two processes agree
   * on it to the last bit, which is the property this contract is for.
   *
   * WHO MAY NOT. Anything that SEATS the instance. The authoritative ground is the scene's own
   * height function, `RegionScene.heightAt`, which is `createSceneHeight`, and a renderer must put
   * the instance on that and not on this. The client does: every scatter instance goes through
   * `frame.toScene`, and `apps/web/tests/scatter.test.mts` measures the result against the
   * triangles the terrain layer uploaded. Seating on z instead would float a fern most of a storey
   * off the ground at the far end of that 3.799 m.
   */
  z: number;
  biome: Biome;
  scale: number;
  /** Radians, stable for the position. */
  rotation: number;
  /** Cluster index, carried by the members of a cluster; absent for singletons and for centres. */
  cluster?: number;
}

export interface Segment {
  a: readonly [number, number];
  b: readonly [number, number];
  /** Full width of the band to keep clear, metres. */
  widthM: number;
}

export interface Exclusions {
  /** Path centrelines. */
  paths: readonly Segment[];
  /** Convex polygons in local metres, e.g. the parcel's buildable footprint. */
  footprints: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** Lines of sight to keep clear, e.g. spawn to the other presence. */
  sightlines: readonly Segment[];
}

export const NO_EXCLUSIONS: Exclusions = { paths: [], footprints: [], sightlines: [] };

/**
 * The most instances a built region may hold. An acceptance number (plan §0), not a suggestion.
 *
 * Raised from 25,000 on B4d's evidence: at 25,000 over a 15 km2 disk the ground within 120 m of
 * the player held about fifty things, which is what "the world reads as empty" means numerically.
 * The near field is now dressed at its biome's real density and thinned outward by spawnFalloff;
 * the cost is instances, which one InstancedMesh per class and chunk absorbs, not draw calls.
 */
export const INSTANCE_CEILING = 120_000;

export interface PlaceOptions {
  /**
   * Metres of height per unit of normalised elevation. It must be the scene builder's own
   * `heightScaleM`, 2,700 under DECISIONS C1, because that is the only thing putting `z` and the
   * scene's ground in the same units on the same planet.
   *
   * Matching it does NOT make `z` the ground the scene draws, and the old one-line version of this
   * comment was read as promising that it did. Since C2 the scene adds a displacement on its own
   * lattice that a placer sampling the macro field has no way to reach. PlacedAsset.z carries what
   * that costs, who may rely on the number and who may not.
   *
   * HOW TO SEAT A PROP, in one sentence, because forbidding the wrong way and not stating the right
   * one is half a contract. Build `createSceneHeight` with the SAME `heightScaleM`, the SAME
   * `resolution` and the SAME `detail` the scene builder used, and read the ground from that.
   *
   * All three, and this was measured rather than assumed. Five authors were written from these
   * comments alone and checked against the client's own ground over 120,000 instances: matching all
   * three lands every instance exactly; the mask's 10 m step, which these comments name twice,
   * costs 126 mm at worst and still passes; a server choosing its own 24 m step misses by 364 mm
   * and fails on 18.5% of instances; and reading `detail` as a rendering flourish and passing null
   * misses by 3.334 m and fails on 90.5%. That last author recovers 89 percent of the error this
   * comment exists to prevent, and nothing here used to say the word `detail` at all.
   */
  heightScaleM: number;
  /** Stop placing at this many instances and say so. */
  maxInstances?: number;
  /** Place only inside the region the scene actually builds (walkable.ts regionBound). */
  bound?: RegionBound;
  /**
   * A multiplier on every class's acceptance, by position. `densityPerKm2` is the NEAR FIELD
   * density; this thins it with distance so the ground around the player is dressed without the
   * whole disk paying for it. Rejection can only thin, never thicken, so the lattice is always at
   * the full density and this decides how much of it survives.
   */
  densityScale?: (x: number, y: number) => number;
}

/**
 * The falloff every parcel is dressed with: full density out to `fullM`, then a smooth decay to
 * `farFactor` by `farM`. A pure function of position, so the layout stays deterministic.
 */
export function spawnFalloff(
  cx: number,
  cy: number,
  fullM: number,
  farM: number,
  farFactor: number,
  /** Nothing is dressed past here. Set it beyond the fog: what is never seen is never placed. */
  cutoffM = Infinity,
): (x: number, y: number) => number {
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d >= cutoffM) return 0;
    if (d <= fullM) return 1;
    if (d >= farM) return farFactor;
    const t = (d - fullM) / (farM - fullM);
    // Smoothstep, so there is no visible ring where the density steps down.
    const e = t * t * (3 - 2 * t);
    return 1 + (farFactor - 1) * e;
  };
}

export interface Placement {
  placed: PlacedAsset[];
  /** True when the ceiling stopped placement early. Never silent (plan: no silent caps). */
  truncated: boolean;
  byClass: Record<AssetClassId, number>;
}

function distanceToSegment(p: readonly [number, number], s: Segment): number {
  const [px, py] = p;
  const [ax, ay] = s.a;
  const [bx, by] = s.b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideConvex(polygon: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return polygon.length >= 3;
}

/** Is a candidate position excluded for this class. */
export function excluded(cls: AssetClass, mask: BiomeMask, ex: Exclusions, x: number, y: number): boolean {
  for (const kind of cls.excludes) {
    // The grid gate first (cheap), then the exact predicate: a shoreline can run between two grid
    // points, and a shell standing in the sea is a fake (I2).
    if (kind === "water" && (!mask.isLandAt(x, y) || !mask.isLandExactAt(x, y))) return true;
    if (kind === "path" && ex.paths.some((s) => distanceToSegment([x, y], s) < s.widthM / 2)) return true;
    if (kind === "sightline" && ex.sightlines.some((s) => distanceToSegment([x, y], s) < s.widthM / 2)) return true;
    if (kind === "footprint" && ex.footprints.some((poly) => insideConvex(poly, x, y))) return true;
  }
  return false;
}

/** Does the class allow this biome, height and water distance. The rules, in one place. */
export function allowed(cls: AssetClass, biomeHere: Biome, height: number, waterM: number): boolean {
  const w = cls.biomes[biomeHere] ?? 0;
  if (w <= 0) return false;
  if (cls.altitude && (height < cls.altitude.min || height > cls.altitude.max)) return false;
  if (cls.waterDistanceM && (waterM < cls.waterDistanceM.min || waterM > cls.waterDistanceM.max)) return false;
  return true;
}

/**
 * Place every class of the registry over the mask.
 *
 * For each class: a lattice at the class's density, jittered by a hash of the lattice point, gated
 * by a hash against the biome weight, then the bands and the exclusions. A clustered class treats
 * each accepted lattice point as a centre and puts `count` members around it, each re-validated.
 * The seed salts every hash so two planets never share a layout.
 */
export function placeAssets(
  mask: BiomeMask,
  registry: readonly AssetClass[],
  seed: Seed,
  exclusions: Exclusions,
  options: PlaceOptions,
): Placement {
  const placed: PlacedAsset[] = [];
  const byClass: Record<AssetClassId, number> = {};
  const ceiling = options.maxInstances ?? INSTANCE_CEILING;
  let truncated = false;
  const seedSalt = Math.floor(hashString(seed) * 0x7fffffff);

  const tryPlace = (cls: AssetClass, salt: number, x: number, y: number, cluster?: number): boolean => {
    if (x < -mask.extentM || x > mask.extentM || y < -mask.extentM || y > mask.extentM) return false;
    if (options.bound && !options.bound.contains(x, y)) return false;
    const biomeHere = mask.biomeAt(x, y);
    const height = mask.heightAt(x, y);
    if (!allowed(cls, biomeHere, height, mask.waterDistanceAt(x, y))) return false;
    const scale = options.densityScale ? options.densityScale(x, y) : 1;
    if (hashPosition(x, y, salt + 3) > (cls.biomes[biomeHere] ?? 0) * scale) return false;
    if (excluded(cls, mask, exclusions, x, y)) return false;
    if (placed.length >= ceiling) {
      truncated = true;
      return false;
    }
    placed.push({
      classId: cls.id,
      x,
      y,
      z: Math.max(0, height) * options.heightScaleM,
      biome: biomeHere,
      scale: cls.scale[0] + hashPosition(x, y, salt + 4) * (cls.scale[1] - cls.scale[0]),
      rotation: hashPosition(x, y, salt + 5) * Math.PI * 2,
      ...(cluster !== undefined ? { cluster } : {}),
    });
    byClass[cls.id] = (byClass[cls.id] ?? 0) + 1;
    return true;
  };

  for (const cls of registry) {
    if (!(cls.densityPerKm2 > 0)) continue;
    const salt = (seedSalt ^ Math.floor(hashString(cls.id) * 0x7fffffff)) | 0;
    const spacing = Math.sqrt(1e6 / cls.densityPerKm2);
    const lattice = Math.max(1, Math.ceil((2 * mask.extentM) / spacing));
    let clusterId = 0;
    for (let j = 0; j < lattice && !truncated; j++) {
      for (let i = 0; i < lattice && !truncated; i++) {
        const baseX = -mask.extentM + (i + 0.5) * spacing;
        const baseY = -mask.extentM + (j + 0.5) * spacing;
        const x = baseX + (hashPosition(baseX, baseY, salt + 1) - 0.5) * spacing;
        const y = baseY + (hashPosition(baseX, baseY, salt + 2) - 0.5) * spacing;
        if (!cls.cluster) {
          tryPlace(cls, salt, x, y);
          continue;
        }
        if (!tryPlace(cls, salt, x, y)) continue;
        for (let m = 0; m < cls.cluster.count; m++) {
          const r = cls.cluster.radiusM * Math.sqrt(hashPosition(x, y, salt + 10 + m * 2));
          const a = hashPosition(x, y, salt + 11 + m * 2) * Math.PI * 2;
          tryPlace(cls, salt, x + r * Math.cos(a), y + r * Math.sin(a), clusterId);
        }
        clusterId++;
      }
    }
  }
  return { placed, truncated, byClass };
}

// ── colliders ───────────────────────────────────────────────────────────────────

export interface Collider {
  x: number;
  y: number;
  radiusM: number;
  heightM: number;
  classId: AssetClassId;
}

/**
 * A grid hash over colliders, so the camera boom and the mover can ask "what is near this point"
 * without touching every placed asset. Cells are `cellM` wide; a query visits the cells its
 * radius covers and nothing else.
 */
export class ColliderIndex {
  private readonly cells = new Map<string, Collider[]>();
  readonly count: number;
  /** The largest collider radius in the index. Every query widens its cell range by this, because
   *  a collider is binned by its centre and its disc can reach into the next cell. */
  readonly maxRadiusM: number;

  constructor(
    placed: readonly PlacedAsset[],
    registry: readonly AssetClass[],
    readonly cellM = 8,
  ) {
    const byId = new Map(registry.map((c) => [c.id, c] as const));
    let n = 0;
    let maxR = 0;
    for (const p of placed) {
      const cls = byId.get(p.classId);
      if (!cls || !cls.collider) continue;
      const c: Collider = {
        x: p.x,
        y: p.y,
        radiusM: cls.collider.radiusM * p.scale,
        heightM: cls.collider.heightM * p.scale,
        classId: p.classId,
      };
      const key = this.key(p.x, p.y);
      const list = this.cells.get(key);
      if (list) list.push(c);
      else this.cells.set(key, [c]);
      if (c.radiusM > maxR) maxR = c.radiusM;
      n++;
    }
    this.count = n;
    this.maxRadiusM = maxR;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellM)},${Math.floor(y / this.cellM)}`;
  }

  /** Colliders whose disc overlaps the circle (x, y, r). */
  queryCircle(x: number, y: number, r: number): Collider[] {
    const out: Collider[] = [];
    const reach = r + this.maxRadiusM;
    const i0 = Math.floor((x - reach) / this.cellM);
    const i1 = Math.floor((x + reach) / this.cellM);
    const j0 = Math.floor((y - reach) / this.cellM);
    const j1 = Math.floor((y + reach) / this.cellM);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const c of list) {
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < r + c.radiusM) out.push(c);
        }
      }
    }
    return out;
  }

  /** Colliders within `r` of the segment a-b (a capsule query, for a camera boom). */
  querySegment(a: readonly [number, number], b: readonly [number, number], r: number): Collider[] {
    const reach = r + this.maxRadiusM;
    const minX = Math.min(a[0], b[0]) - reach;
    const maxX = Math.max(a[0], b[0]) + reach;
    const minY = Math.min(a[1], b[1]) - reach;
    const maxY = Math.max(a[1], b[1]) + reach;
    const seg: Segment = { a, b, widthM: 0 };
    const out: Collider[] = [];
    for (let j = Math.floor(minY / this.cellM); j <= Math.floor(maxY / this.cellM); j++) {
      for (let i = Math.floor(minX / this.cellM); i <= Math.floor(maxX / this.cellM); i++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const c of list) {
          if (distanceToSegment([c.x, c.y], seg) < r + c.radiusM) out.push(c);
        }
      }
    }
    return out;
  }
}

// ── content: the asset classes (plan W2-2, cut per B4 to what a cell needs) ─────

/**
 * The registry's own version, separate from `WorldManifest.terrainVersion` (DECISIONS C5).
 *
 * WHAT IT IS FOR. `ASSET_CLASSES` is shared with the server by contract: the same table, the same
 * seed and the same position give the same instance on both sides of the wire, and the same form
 * drawn for it. A change to the table is therefore a change both sides have to agree on, and it is
 * NOT a change to the planet: no elevation moves, no biome boundary moves, no parcel changes hands.
 * Bumping this rather than `terrainVersion` is what keeps those two facts apart, so an ecology edit
 * never has to argue with a deed.
 *
 * WHAT COUNTS AS A BUMP. Anything that changes what a client draws from this file: `densityPerKm2`,
 * a biome weight, a band, a cluster, an exclusion, a class id, a `scale`, a `collider`, `lod`.
 * DECISIONS C5's rule is that a batch of ecology work lands behind ONE bump rather than a dozen, so
 * the scatter re-lays under people's feet once.
 *
 *   1  the table as it shipped through W2 and DECISIONS C17 to C21.
 *   2  DECISIONS C22: every `lod.farM` re-derived by measurement against the 500 m disk the scatter
 *      actually fills. Twenty-six values moved and not one instance did; `placeAssets` never reads
 *      `lod`, and `apps/web/tests/scatterSplit.test.mts` holds the placement against the matrices
 *      the placer produced.
 */
export const ASSET_REGISTRY_VERSION = 2;

/**
 * Every class the planet has words for, across all ten land biomes.
 *
 * `densityPerKm2` is the NEAR FIELD density, the ground within sight of the player, and it is set
 * from what the biome looks like rather than from a budget: woodland is one stem every six or
 * seven metres, a desert is one thing every fifteen. The budget is met by `spawnFalloff` thinning
 * the distance, not by making the near field bare. B4d measures the result.
 *
 * A cell needs only the classes its own biomes call for; `classesForBiomes` selects them, so
 * changing the demo cell changes which classes ship without touching this table.
 *
 * EVERY `lod.farM` HERE IS A MEASUREMENT (DECISIONS C22), and this is where the numbers came from.
 * The value is the NEAREST distance at which swapping the class's own form for the two-triangle
 * card scatterImpostor.ts derives from it costs no more than two pixels of the shipped frame:
 * both silhouettes rasterised at the shipped lens's own scale (fov 50, at 1280x800 and again at
 * 1920x1080, the larger taken), from twelve horizontal azimuths, at the class's LARGEST instance
 * scale, weighted by the contrast the shipped fog has left at that distance. Nearest, because every
 * metre past it is a full form drawn where two triangles are indistinguishable. The old numbers
 * were authored, and six of them said 900 m over a disk that ends at 500.
 *
 *   class            was    now   class            was    now   class            was    now
 *   buttress-tree    900    410   thicket          450    380   snow-drift       400    380
 *   broadleaf        900    410   vine-tangle      380    380   dune-ripple      250    370
 *   conifer          900    400   fern             220    340   tidepool         400    370
 *   canopy-palm      900    400   berry-bush       380    340   fallen-log       500    370
 *   acacia           900    400   grass-tuft       220    290   driftwood        400    350
 *   boulder          900    400   dead-shrub       400    320   cactus           700    350
 *   dead-tree        700    360   lichen-rock      300    310   reeds            500    360
 *   shore-rock       450    360   bromeliad        200    300   moss-patch       200    260
 *   scree            300    210   shell            120    160
 *
 * WHY THE ANSWERS ARE NOT IN THE RATIO OF THE FORMS' HEIGHTS, which is what a pure angular-size
 * rule would give and is worth writing down because it is the first thing anyone will check. A
 * fern's form is 0.99 m tall and a buttress-tree's is 15.30 m, so at one shared angular threshold
 * their distances would stand 15.4 to 1 apart. They cannot: at the threshold that cards a
 * buttress-tree at 450 m a fern is carded at 29 m, where it is 39 pixels tall and plainly a card,
 * and at the threshold that leaves the fern where it shipped, 5.2 pixels of form height, a
 * buttress-tree is not carded until 3.4 km, three times past anything the disk contains. The rule
 * that survives both ends is not
 * angular size but VISIBLE DIFFERENCE, and past 350 m the fog has taken 83% of every form's own
 * colour, so the tall classes come cheap at 400 m rather than at 5,900 and the range closes to
 * 2.6 to 1. The fog is why a shared ceiling looked tempting; it is still not one, and the spread
 * from a shell's 160 m to a buttress-tree's 410 m is the form's own size doing the work.
 */
export const ASSET_CLASSES: readonly AssetClass[] = [
  // ── canopy: the thing that makes a place read as somewhere ──
  { id: "conifer", biomes: { taiga: 0.9, forest: 0.5, tundra: 0.15 }, densityPerKm2: 7000, waterDistanceM: { min: 8, max: Infinity }, cluster: { radiusM: 9, count: 3 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 400 }, collider: { radiusM: 0.7, heightM: 9 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "broadleaf", biomes: { forest: 0.9, grassland: 0.2, taiga: 0.2 }, densityPerKm2: 6500, waterDistanceM: { min: 8, max: Infinity }, cluster: { radiusM: 11, count: 3 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 410 }, collider: { radiusM: 0.9, heightM: 8 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "buttress-tree", biomes: { rainforest: 0.85 }, densityPerKm2: 4500, cluster: { radiusM: 14, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 410 }, collider: { radiusM: 1.6, heightM: 14 }, scale: [0.8, 1.6], castsShadow: true },
  { id: "vine-tangle", biomes: { rainforest: 0.6, forest: 0.2 }, densityPerKm2: 5000, cluster: { radiusM: 8, count: 3 }, excludes: ["water", "path", "footprint"], lod: { nearM: 110, farM: 380 }, collider: null, scale: [0.7, 1.6], castsShadow: false },
  { id: "fallen-log", biomes: { rainforest: 0.45, forest: 0.4, taiga: 0.35 }, densityPerKm2: 1100, excludes: ["water", "path", "footprint"], lod: { nearM: 140, farM: 370 }, collider: { radiusM: 1.1, heightM: 0.9 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "bromeliad", biomes: { rainforest: 0.55 }, densityPerKm2: 6000, excludes: ["water", "path"], lod: { nearM: 60, farM: 300 }, collider: null, scale: [0.6, 1.2], castsShadow: false },
  { id: "canopy-palm", biomes: { rainforest: 0.9, beach: 0.25 }, densityPerKm2: 6000, cluster: { radiusM: 10, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 180, farM: 400 }, collider: { radiusM: 0.6, heightM: 11 }, scale: [0.8, 1.4], castsShadow: true },
  { id: "acacia", biomes: { savanna: 0.7, grassland: 0.15 }, densityPerKm2: 900, waterDistanceM: { min: 15, max: Infinity }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 400 }, collider: { radiusM: 1.1, heightM: 6 }, scale: [0.8, 1.6], castsShadow: true },
  { id: "dead-tree", biomes: { tundra: 0.3, taiga: 0.2, desert: 0.1 }, densityPerKm2: 700, excludes: ["water", "path", "footprint"], lod: { nearM: 160, farM: 360 }, collider: { radiusM: 0.5, heightM: 5 }, scale: [0.6, 1.2], castsShadow: true },
  // ── understorey ──
  { id: "thicket", biomes: { forest: 0.8, rainforest: 0.8, taiga: 0.6, grassland: 0.3 }, densityPerKm2: 9000, cluster: { radiusM: 7, count: 4 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 120, farM: 380 }, collider: { radiusM: 1.2, heightM: 1.6 }, scale: [0.7, 1.5], castsShadow: true },
  { id: "fern", biomes: { rainforest: 0.9, forest: 0.7, taiga: 0.4 }, densityPerKm2: 14000, cluster: { radiusM: 5, count: 5 }, excludes: ["water", "path"], lod: { nearM: 70, farM: 340 }, collider: null, scale: [0.6, 1.3], castsShadow: false },
  { id: "berry-bush", biomes: { forest: 0.5, taiga: 0.5, grassland: 0.4, tundra: 0.2 }, densityPerKm2: 2200, excludes: ["water", "path", "footprint"], lod: { nearM: 110, farM: 340 }, collider: { radiusM: 0.8, heightM: 1.1 }, scale: [0.7, 1.3], castsShadow: true },
  { id: "grass-tuft", biomes: { grassland: 0.95, savanna: 0.8, tundra: 0.5, beach: 0.25, forest: 0.4, taiga: 0.35 }, densityPerKm2: 18000, excludes: ["water", "path"], lod: { nearM: 70, farM: 290 }, collider: null, scale: [0.7, 1.4], castsShadow: false },
  { id: "dead-shrub", biomes: { desert: 0.8, tundra: 0.45, savanna: 0.3, grassland: 0.15 }, densityPerKm2: 3200, excludes: ["water", "path", "footprint"], lod: { nearM: 100, farM: 320 }, collider: null, scale: [0.6, 1.3], castsShadow: false },
  { id: "cactus", biomes: { desert: 0.7 }, densityPerKm2: 900, waterDistanceM: { min: 40, max: Infinity }, cluster: { radiusM: 12, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 150, farM: 350 }, collider: { radiusM: 0.5, heightM: 2.4 }, scale: [0.7, 1.4], castsShadow: true },
  { id: "reeds", biomes: { beach: 0.8, grassland: 0.35, rainforest: 0.3 }, densityPerKm2: 3000, waterDistanceM: { min: 0, max: 90 }, cluster: { radiusM: 6, count: 7 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 120, farM: 360 }, collider: null, scale: [0.8, 1.4], castsShadow: false },
  { id: "moss-patch", biomes: { tundra: 0.8, taiga: 0.6, snow: 0.15 }, densityPerKm2: 9000, excludes: ["water", "path"], lod: { nearM: 60, farM: 260 }, collider: null, scale: [0.7, 1.6], castsShadow: false },
  // ── stone and ground ──
  { id: "boulder", biomes: { tundra: 0.7, "bare-rock": 0.9, desert: 0.35, grassland: 0.25, taiga: 0.4, forest: 0.25, rainforest: 0.2 }, densityPerKm2: 1600, waterDistanceM: { min: 6, max: Infinity }, cluster: { radiusM: 10, count: 2 }, excludes: ["water", "path", "footprint", "sightline"], lod: { nearM: 200, farM: 400 }, collider: { radiusM: 1.4, heightM: 1.8 }, scale: [0.6, 2.4], castsShadow: true },
  { id: "scree", biomes: { "bare-rock": 0.9, snow: 0.4, tundra: 0.3 }, densityPerKm2: 12000, altitude: { min: 0.03, max: 1 }, cluster: { radiusM: 8, count: 6 }, excludes: ["water", "path"], lod: { nearM: 80, farM: 210 }, collider: null, scale: [0.5, 1.2], castsShadow: false },
  { id: "lichen-rock", biomes: { tundra: 0.9, taiga: 0.5, "bare-rock": 0.6 }, densityPerKm2: 5000, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 310 }, collider: { radiusM: 0.6, heightM: 0.6 }, scale: [0.5, 1.3], castsShadow: false },
  { id: "snow-drift", biomes: { snow: 0.9, tundra: 0.2 }, densityPerKm2: 5000, excludes: ["water", "path"], lod: { nearM: 100, farM: 380 }, collider: null, scale: [0.9, 2.2], castsShadow: false },
  { id: "dune-ripple", biomes: { desert: 0.9, beach: 0.35 }, densityPerKm2: 4000, excludes: ["water", "path"], lod: { nearM: 60, farM: 370 }, collider: null, scale: [1, 2.2], castsShadow: false },
  // ── the shoreline ──
  { id: "driftwood", biomes: { beach: 0.6 }, densityPerKm2: 1400, waterDistanceM: { min: 0, max: 160 }, excludes: ["water", "path", "footprint"], lod: { nearM: 80, farM: 350 }, collider: { radiusM: 0.9, heightM: 0.5 }, scale: [0.7, 1.3], castsShadow: true },
  { id: "shell", biomes: { beach: 0.9 }, densityPerKm2: 4500, waterDistanceM: { min: 0, max: 120 }, excludes: ["water", "path"], lod: { nearM: 40, farM: 160 }, collider: null, scale: [0.6, 1.2], castsShadow: false },
  { id: "tidepool", biomes: { beach: 0.4 }, densityPerKm2: 250, waterDistanceM: { min: 0, max: 60 }, excludes: ["water", "path", "footprint"], lod: { nearM: 120, farM: 370 }, collider: null, scale: [1, 1.6], castsShadow: false },
  { id: "shore-rock", biomes: { beach: 0.5 }, densityPerKm2: 1800, waterDistanceM: { min: 0, max: 70 }, cluster: { radiusM: 7, count: 3 }, excludes: ["water", "path", "footprint"], lod: { nearM: 120, farM: 360 }, collider: { radiusM: 0.7, heightM: 0.8 }, scale: [0.5, 1.4], castsShadow: true },
];

/** The classes a set of biomes calls for: everything with a non-zero weight in any of them. */
export function classesForBiomes(biomes: readonly Biome[], registry: readonly AssetClass[] = ASSET_CLASSES): AssetClass[] {
  const want = new Set(biomes);
  return registry.filter((c) => (Object.keys(c.biomes) as Biome[]).some((b) => want.has(b) && (c.biomes[b] ?? 0) > 0));
}

/**
 * The classes the demo cell ships with. A selection, not a second table: change DEMO_LAND_BIOMES
 * and this follows, which is the one-line cell swap the plan promised.
 */
export const DEMO_ASSET_CLASSES: readonly AssetClass[] = classesForBiomes(DEMO_LAND_BIOMES);
