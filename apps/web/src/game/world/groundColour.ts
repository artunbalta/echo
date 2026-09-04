/**
 * The ground's own colour, written over the biome paint before the mesh is uploaded (task A10).
 *
 * THE COMPLAINT. `buildRegionScene` gives every vertex `BIOME_COLOUR[biome]`, one of eleven flat
 * values. Measured on the two shipped routes, that left 74% of the ordinary parcel's floor and 99%
 * of a savanna parcel's on a single colour, on the largest surface in every frame; and the value it
 * left the rainforest on was a mid green, which is the CANOPY seen from orbit painted onto a floor
 * that receives one or two percent of the light.
 *
 * WHY THE FIX IS HERE AND NOT IN THE BUILDER. `BIOME_COLOUR` is not an input to `biome()`,
 * `isLand()` or `placeAssets()`, so rewriting it moves no deed, no boundary and no instance. It is
 * also not shared: the server never renders. Doing it in @echo/planet would put ten art recipes
 * into the module the registry and the sea-level calibration live in, and would hand them to the
 * globe, which must not have them (below). So the builder keeps painting the label and this file
 * paints the ground.
 *
 * WHERE THE BIOME COMES FROM, and why that is not a hack. The chunk carries the biome only as its
 * colour, but it carries it EXACTLY: `put()` copies one of eleven `BIOME_COLOUR_LINEAR` triples
 * with no interpolation, and the eleven red channels are all distinct as float32 (checked at module
 * load, and again by a test). So the colour attribute is a per-vertex biome label and the table
 * inverts on the red channel alone. Nothing else in the chunk says what the ground is, and asking
 * the terrain field again would be one more `elevation` + `moisture` + `temperature` per vertex,
 * which is the region build a second time.
 *
 * EVERYTHING BELOW IS READ OFF THE MESH. Height, slope, distance to water and the biome all come
 * out of the arrays `buildRegionScene` just returned. There is not one terrain evaluation in this
 * file, which is why it costs milliseconds against the build's 190, and why it cannot disagree with
 * the ground it is painting: the water it fades a beach toward is the water the mesh drew.
 *
 * LINEAR, THE WHOLE WAY (DECISIONS C3). The attribute is read by three as linear and this file
 * writes into it. Every palette entry reaches the mixer through `linearRgb`, the same seam
 * `BIOME_COLOUR_LINEAR` goes through, and every blend is a lerp in linear, which is what an area
 * average of two albedos IS. Mixing the sRGB bytes and converting after would be a different and
 * wrong colour, and it would be invisible until it was on screen.
 *
 * WHAT THE LATTICE WILL AND WILL NOT CARRY, and where that leaves a person's feet. Colour lives on
 * the same 12 m vertices as the mesh and Gouraud-interpolates across each triangle, so the finest
 * thing that can be DRAWN rather than aliased is about three lattice steps, 36 m. Litter mottle at
 * the scale of a leaf, a game trail, a termite mound: none of those are available and none are
 * attempted.
 *
 * That bound meets the camera, and the meeting has a cost that is worth stating rather than
 * discovering. The camera sits 5.5 m up and 9 m back at a 25 degree pitch, so the bottom of the
 * frame is ground about 5 m away and the middle of it is 15 to 25 m; 92 to 98% of the ground rays
 * in a shipped frame land inside 40 m. The floor in the bottom third of the picture is therefore
 * about ten metres of ground, and NOTHING this file can draw varies across ten metres. Measured: a
 * 400 by 250 pixel crop of the nearest floor comes back at a standard deviation of 1.9 levels of
 * 255 on a savanna parcel where the albedo's own spread is 20.7. What did move is everything from
 * about 15 m out: on the same parcel the ground's value band in the middle of the frame goes from
 * 4 levels wide to 22. So this reads as a place, and as ground you walk ACROSS rather than ground
 * you are standing on, and the last ten metres would need a finer mesh or a fragment shader.
 *
 * The band that is available, 36 m to a few hundred, is where a burn scar, a treefall gap, a frost
 * polygon, a drift of thatch and a wet-sand fringe all live, so the ecology this draws is the
 * ecology at that scale and nothing is faked below it. It is also why every recipe leans on the
 * ground's own SHAPE first and on noise last: a hollow that is darker because it is wetter is
 * legible at any distance, and a value that is different because a hash said so is legible as fizz.
 *
 * THE FRAME IS THE ANCHOR'S, exactly as DECISIONS C2's displacement is. The pattern is a function
 * of local metres in the built region's own tangent frame, so the same region gives the same ground
 * on every machine and every reload, and the same ground reached from a different anchor cell would
 * mottle differently. Nothing in the product reaches it that way. Sharing C2's frame is deliberate
 * beyond the precedent: colour and relief crease together, so the dark of a hollow is the hollow.
 *
 * THE GLOBE KEEPS THE TABLE, and it should. A parcel is a handful of pixels from orbit and what is
 * visible there is the canopy; `BIOME_COLOUR.rainforest` is a good canopy. This file paints what is
 * UNDER that canopy, which no orbital view has ever seen. So the two part company for the three
 * closed biomes on purpose and by a stated amount, and stay within 3 to 16% on the open ones, where
 * there is no canopy to be under. {@link GROUND_MEAN_SRGB} carries every measured mean and the
 * reason for each gap, and a test pins them. That is a different thing from DECISIONS C3's rejected
 * option, which was one surface described two ways by accident.
 */

import {
  BIOMES,
  BIOME_COLOUR_LINEAR,
  hashPosition,
  hashString,
  linearRgb,
  type Biome,
  type RegionChunk,
  type RegionScene,
} from "@echo/planet";

import { PALETTE } from "../three/palette";

/** A palette entry as the attribute must carry it. `linearRgb` takes bytes, which is what a hex is. */
const lin = (hex: number): readonly [number, number, number] =>
  linearRgb([(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]);

const LITTER = lin(PALETTE.litter);
const HUMUS = lin(PALETTE.humus);
const CLAY = lin(PALETTE.clay);
const CHAR = lin(PALETTE.char);
const ASH = lin(PALETTE.ash);
const THATCH = lin(PALETTE.thatch);
const SAND = lin(PALETTE.sand);
const SAND_WET = lin(PALETTE.sandWet);
const SAND_DRY = lin(PALETTE.sandDry);
const GRASS = lin(PALETTE.grass);
const GRASS_DRY = lin(PALETTE.grassDry);
const LEAF = lin(PALETTE.leaf);
const LEAF_DARK = lin(PALETTE.leafDark);
const LEAF_LIGHT = lin(PALETTE.leafLight);
const BUSH_DRY = lin(PALETTE.bushDry);
const CONIFER = lin(PALETTE.conifer);
const LICHEN = lin(PALETTE.lichen);
const ROCK = lin(PALETTE.rock);
const ROCK_LIGHT = lin(PALETTE.rockLight);
const SOIL = lin(PALETTE.soil);
const SNOW_LIT = lin(PALETTE.snowLit);
const SNOW_SHADE = lin(PALETTE.snowShade);

/**
 * The metres of height difference from a vertex's own 156 m neighbourhood that count as "a crest".
 *
 * Measured over five built regions at the shipped 12 m lattice and 2,700 m height scale, as the
 * median |height - local mean|: 0.77 m on a flat savanna cell, 1.04 on tundra, 2.26 on a desert
 * coast, 3.12 on the ordinary rainforest parcel and 5.53 on the coastal demo. The signal is mapped
 * through `rel / (|rel| + this)`, which is smooth, has no clamp to step at, and reaches ±0.5 at
 * exactly this height, so three metres puts the flat cell at 0.20, the parcel at 0.51 and the demo
 * at 0.65. A per-region normalisation was rejected: it would give a flat parcel the same modelled
 * relief as a hillside, which is drawing ground that is not there. DECISIONS C2's displacement
 * alone is worth about a metre of this, so even the flattest ground now shades its own swells.
 */
const CREST_SCALE_M = 3;

/**
 * Half width of the box a vertex's height is compared against, in metres.
 *
 * 78 m each way, so the window is 156 m: wide enough to sit outside C2's 96 m octave and read the
 * swell it makes rather than following it, and narrow enough that the macro field, whose finest
 * feature is 1.56 km, contributes only its local curvature and not its shape. Narrower and the
 * measure chases the very bump it is meant to shade; wider and every parcel reads as one slope.
 */
const CREST_BOX_M = 78;

/**
 * Half width of the NARROW box, in metres, and the metres of rise in it that count as a swell.
 *
 * 24 m each way, so a 60 m window, which is the band DECISIONS C2's displacement lives in and the
 * macro field cannot reach: the measured |height - local mean| over it is 1.06 m on the ordinary
 * parcel, 0.37 on tundra and 0.28 on the flattest savanna cell, against 3.12, 1.04 and 0.77 over
 * the wide box. Half a metre is therefore the right scale for the same soft ratio the wide signal
 * uses: it puts the flat savanna at 0.36 and the parcel at 0.68, so the flattest ground still has
 * a floor that is going somewhere.
 *
 * Narrower would be better for the near field and cannot be had. At a 36 m window the residual is
 * the 24 m octave alone, which is 0.27 m of amplitude on a 12 m lattice: two vertices per period,
 * which is the flicker the whole file avoids.
 */
const SWELL_BOX_M = 24;
const SWELL_SCALE_M = 0.5;

/** Slope, in degrees, at which the "steep" signal saturates. p95 of land at the shipped scale is 8.3. */
const STEEP_FULL_DEG = 12;

/**
 * How far from the water a beach reads as the wet end of itself, in metres.
 *
 * Two things make the near end of a beach darker and only one of them is water. The swash zone is
 * genuinely saturated, and this sea has no tide, so that band is metres wide and would be a line on
 * a 12 m lattice, not a gradient. The other is sorting: a beach profile grades from the fine dark
 * sediment the water leaves near it to the coarse pale shell and quartz lag the wind works
 * landward, and that runs over tens of metres, which is the thing the eye reads as a wet-to-dry
 * beach and the thing this draws.
 *
 * Ninety metres, against a measured median beach-vertex distance of 72 m on the demo coast and
 * 152 m on the desert one: half of a beach is in the ramp and the back of it is dry. It was tried
 * at 34 m first and the gradient was 2.8 lattice steps wide, which is an edge and not a grade: the
 * neighbour-difference ratio went to 0.75 while the mean barely left the dry end.
 *
 * Where the elevation band paints beach with no sea in the region at all, `waterDistanceM` is
 * Infinity and the ramp is simply zero, which is the honest answer for that ground: dry sand. That
 * is not rare. DECISIONS C4 records the rule that puts it there, and one measured cell has 12,109
 * beach vertices and no water within the region at all.
 */
const BEACH_WET_M = 90;

/** Ease with a zero derivative at both ends. The same curve `scene.ts` interpolates its noise with. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** `v` mapped from 0 at `lo` to 1 at `hi`, eased, and flat outside. */
const band = (v: number, lo: number, hi: number): number =>
  v <= lo ? 0 : v >= hi ? 1 : ease((v - lo) / (hi - lo));

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface GroundPaint {
  /** Vertices whose colour was rewritten. Ocean is not one of them. */
  painted: number;
  /** Vertices left exactly as the builder wrote them: ocean, and anything the table cannot name. */
  untouched: number;
  /** Distinct lattice points a colour was computed for, against the vertices they were copied to. */
  latticePoints: number;
  /**
   * Vertices whose position fell outside the raster. Must be zero: the raster is the mesh's own
   * lattice with a ring of slack, so a stray means the builder's lattice moved and every signal in
   * this file would be reading the wrong cell.
   */
  strays: number;
  /** Vertices carrying a colour that is not in the biome table, so the biome could not be read. */
  unlabelled: number;
  /** Wall clock for the whole rewrite, milliseconds. */
  millis: number;
  /** Which recipes ran, by biome, and on how many lattice points. */
  byBiome: Partial<Record<Biome, number>>;
}

/**
 * The lattice reds, as float32, inverted back to a biome index.
 *
 * Built once and asserted once: if two biomes ever shared a red the map would silently lose one and
 * a whole biome would be painted with another's recipe, which is exactly the kind of thing that
 * looks fine in a screenshot of a cell that has neither.
 */
const BIOME_BY_RED = (() => {
  const table = new Map<number, number>();
  BIOMES.forEach((b, i) => table.set(Math.fround(BIOME_COLOUR_LINEAR[b]![0]), i));
  if (table.size !== BIOMES.length) {
    throw new Error(
      `two biomes share a red channel in BIOME_COLOUR, so a vertex cannot be labelled: ${table.size} of ${BIOMES.length} are distinct`,
    );
  }
  return table;
})();

/**
 * The biome indices, as numbers, because the recipe loop runs once per lattice point and a switch
 * on `BIOMES[kind]` costs a string lookup and a string compare seventy thousand times.
 */
const OCEAN = BIOMES.indexOf("ocean");
const RAINFOREST = BIOMES.indexOf("rainforest");
const FOREST = BIOMES.indexOf("forest");
const TAIGA = BIOMES.indexOf("taiga");
const TUNDRA = BIOMES.indexOf("tundra");
const SAVANNA = BIOMES.indexOf("savanna");
const GRASSLAND = BIOMES.indexOf("grassland");
const BEACH = BIOMES.indexOf("beach");
const DESERT = BIOMES.indexOf("desert");
const BARE_ROCK = BIOMES.indexOf("bare-rock");
const SNOW = BIOMES.indexOf("snow");

/**
 * Value noise over the vertex lattice, evaluated once per lattice point into a flat array.
 *
 * It is built as a GRID rather than as a function because every consumer is a lattice point: the
 * corner hashes and the two interpolation weights depend only on the row or the column, so both are
 * precomputed per axis and the inner loop is four reads and three lerps. Sampled as a function
 * instead, the same three fields cost sixteen `hashPosition` calls per vertex and the rewrite stops
 * fitting in a frame.
 *
 * `cellX` and `cellY` are separate so a field can be stretched. Wind-formed ground is not isotropic:
 * a dune field and a snow sastrugi field are ridges with a direction, and a stretched value field is
 * the cheapest honest way to say so, at no cost at all here because the axes are already separate.
 *
 * `filled` is the mesh's own footprint. The raster is a square and the region is a hexagon inside
 * it, so a third of the square is ground that was never emitted and is never read; skipping it is
 * measured at a third off every field.
 */
function noiseGrid(
  n: number,
  half: number,
  step: number,
  cellX: number,
  cellY: number,
  salt: number,
  filled: Uint8Array,
): Float32Array {
  const axis = (cell: number) => {
    const lo = Math.floor((-half * step) / cell) - 1;
    const hi = Math.floor((half * step) / cell) + 2;
    const count = hi - lo + 1;
    const index = new Int32Array(n);
    const weight = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = (i - half) * step;
      const g = Math.floor(v / cell);
      index[i] = g - lo;
      weight[i] = ease(v / cell - g);
    }
    return { lo, count, index, weight };
  };
  const ax = axis(cellX);
  const ay = axis(cellY);
  const corners = new Float32Array(ax.count * ay.count);
  for (let j = 0; j < ay.count; j++) {
    for (let i = 0; i < ax.count; i++) {
      corners[j * ax.count + i] = hashPosition((ax.lo + i) * cellX, (ay.lo + j) * cellY, salt) * 2 - 1;
    }
  }
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const cj = ay.index[j]! * ax.count;
    const v = ay.weight[j]!;
    for (let i = 0; i < n; i++) {
      if (filled[j * n + i] === 0) continue;
      const o = cj + ax.index[i]!;
      const u = ax.weight[i]!;
      const a = corners[o]!;
      const b = corners[o + 1]!;
      const c = corners[o + ax.count]!;
      const d = corners[o + ax.count + 1]!;
      const loRow = a + (b - a) * u;
      const hiRow = c + (d - c) * u;
      out[j * n + i] = loRow + (hiRow - loRow) * v;
    }
  }
  return out;
}

/**
 * A cellular field over the lattice: which patch a point is in, and how far it is from the nearest
 * patch boundary.
 *
 * Value noise cannot draw a boundary. A burn scar, a frost polygon and a jointed rock face are all
 * ground divided into PIECES with edges, and the edge is the whole read: it is what makes a burn
 * look burnt rather than blotchy and a polygon net look like a net. Sites sit on a jittered grid,
 * `id` is the hash of the winning site, and `edge` is the metres between the nearest and second
 * nearest site, which is zero on the boundary itself and grows to about half a cell in the middle.
 */
function cellularGrid(
  n: number,
  half: number,
  step: number,
  cellM: number,
  jitter: number,
  salt: number,
  filled: Uint8Array,
): { id: Float32Array; edge: Float32Array } {
  const lo = Math.floor((-half * step) / cellM) - 1;
  const hi = Math.floor((half * step) / cellM) + 1;
  const side = hi - lo + 1;
  const sx = new Float32Array(side * side);
  const sy = new Float32Array(side * side);
  const sid = new Float32Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const gx = lo + i;
      const gy = lo + j;
      const o = j * side + i;
      sx[o] = (gx + 0.5 + (hashPosition(gx * cellM, gy * cellM, salt) - 0.5) * jitter) * cellM;
      sy[o] = (gy + 0.5 + (hashPosition(gx * cellM, gy * cellM, salt + 1) - 0.5) * jitter) * cellM;
      sid[o] = hashPosition(gx * cellM, gy * cellM, salt + 2);
    }
  }
  const id = new Float32Array(n * n);
  const edge = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const y = (j - half) * step;
    const cy = Math.floor(y / cellM) - lo;
    for (let i = 0; i < n; i++) {
      if (filled[j * n + i] === 0) continue;
      const x = (i - half) * step;
      const cx = Math.floor(x / cellM) - lo;
      let best = Infinity;
      let second = Infinity;
      let winner = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cy + dj;
        if (jj < 0 || jj >= side) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = cx + di;
          if (ii < 0 || ii >= side) continue;
          const o = jj * side + ii;
          const dx = sx[o]! - x;
          const dy = sy[o]! - y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            second = best;
            best = d;
            winner = sid[o]!;
          } else if (d < second) {
            second = d;
          }
        }
      }
      const k = j * n + i;
      id[k] = winner;
      edge[k] = second === Infinity ? cellM : Math.sqrt(second) - Math.sqrt(best);
    }
  }
  return { id, edge };
}

/**
 * The mean sRGB each recipe paints its biome, over the drawn vertices of nine built regions.
 *
 * These are here to be ASSERTED against, not consulted. Two things can go wrong in this file and
 * neither shows up in a screenshot of a cell that happens not to have that biome in it: a recipe
 * can drift a whole ground somewhere nobody looked, and the blend can end up in the wrong colour
 * space, which is invisible until it is on a screen. Both move these numbers, and the second moves
 * them a long way: the identical recipes mixed in sRGB and converted afterwards give rainforest
 * (61, 49, 31) against (68, 54, 34) as it was measured, savanna (145, 140, 87) against (152, 143, 89),
 * and take savanna's own spread from 20.9 to 25.9. So this table is what pins DECISIONS C3 on this side.
 *
 * WHAT THEY SAY NEXT TO THE BIOME TABLE, which the globe still draws. Each figure is this mean's
 * Rec.709 luminance against `BIOME_COLOUR`'s, and there are three groups and three reasons:
 *
 *   forest -38%, taiga -26%, rainforest -25%. Deliberate, and the point of the task: the table is a
 *   canopy seen from orbit and this is the floor under it, in a shade the renderer has no ambient
 *   occlusion to give it. In absolute terms the order is the one a person would expect, rainforest
 *   floor darkest at luma 62, then forest at 69 and taiga at 74; the percentages differ from that
 *   order only because the table's forest green is brighter than its rainforest green.
 *
 *   desert -3%, beach -10%, grassland -13%, savanna -16%. Open ground, where the globe and a
 *   standing person are looking at the same surface, so these are meant to stay close and do.
 *   Savanna is the far end of it because a tenth of a savanna is charcoal at any moment, which is
 *   the burn mosaic doing what it was asked; grassland is next because thatch is a straw and the
 *   table's grassland is a lawn, which was the complaint.
 *
 *   bare-rock -16%, tundra -19%, snow -24%. NOT a decision, a limit, and worth saying out loud:
 *   this palette's cold open country tops out at `lichen` and `rockLight`, both near luma 121, and
 *   its snow at `snowLit`, while the table's tundra, rock and snow are all paler greys than any
 *   material named here. Reaching the table would mean painting from a value with no word behind
 *   it, which is the habit palette.ts exists to stop, so they stay where the palette can reach.
 *
 * Spread across the ten regions is 0 to 2 per channel on every closed biome, on tundra and on
 * bare-rock, and 9 to 24 on beach, desert and snow, which are the three grounds whose recipes are
 * driven by something that differs between cells: how far a beach is from its own water, and how
 * much relief a desert or a snowfield has for the wind to strip and to fill.
 */
export const GROUND_MEAN_SRGB: Partial<Record<Biome, readonly [number, number, number]>> = {
  rainforest: [78, 60, 39],
  forest: [79, 69, 45],
  taiga: [81, 74, 55],
  savanna: [151, 143, 89],
  grassland: [143, 141, 87],
  beach: [205, 176, 130],
  desert: [197, 170, 127],
  tundra: [120, 122, 98],
  "bare-rock": [108, 111, 118],
  snow: [181, 183, 172],
};

/**
 * Rewrite every land vertex's colour in place, and report what it did.
 *
 * In place because the alternative is a second five megabyte copy of every chunk's colour attribute
 * for the few milliseconds before it is uploaded and thrown away. The chunks are the caller's, they
 * have not been handed to three yet, and nothing else in this app reads them.
 */
export function paintRegionGround(region: RegionScene, seed: string): GroundPaint {
  const t0 = performance.now();
  const step = region.resolution;
  // A multiply where the two hot passes would each do a divide, which is two divides on every one
  // of four hundred thousand vertices. 1/12 is not exact in binary, but every vertex x is an exact
  // multiple of the step and the result is rounded to an integer, so the last-place error cannot
  // reach the answer: the only input that could is a coordinate exactly half a step off the
  // lattice, and the builder emits none.
  const perStep = 1 / step;
  // The builder's own lattice, plus one ring: it lays grid line i at (i - half) * step with
  // half = ceil(extentM / step) + 1, so this raster is a superset of it and `strays` must be zero.
  const half = Math.ceil(region.extentM / step) + 2;
  const n = 2 * half + 1;
  const cells = n * n;

  const height = new Float32Array(cells);
  const slopeUp = new Float32Array(cells);
  const slopeEast = new Float32Array(cells);
  const label = new Int8Array(cells).fill(-1);
  const filled = new Uint8Array(cells);
  let strays = 0;
  let unlabelled = 0;
  let latticePoints = 0;

  // 1. The raster. Every vertex appears up to six times in the soup and the first one to reach a
  //    lattice point wins; the rest are a byte read and a branch, which is what keeps this pass
  //    near the cost of touching the array at all.
  for (const chunk of region.chunks) {
    const p = chunk.positions;
    const nrm = chunk.normals;
    const col = chunk.colours;
    for (let o = 0; o < p.length; o += 3) {
      const i = Math.round(p[o]! * perStep) + half;
      const j = Math.round(-p[o + 2]! * perStep) + half;
      if (i < 0 || i >= n || j < 0 || j >= n) {
        strays++;
        continue;
      }
      const k = j * n + i;
      if (filled[k]) continue;
      filled[k] = 1;
      height[k] = p[o + 1]!;
      slopeUp[k] = nrm[o + 1]!;
      slopeEast[k] = nrm[o]!;
      const biome = BIOME_BY_RED.get(col[o]!);
      if (biome === undefined) {
        unlabelled++;
        label[k] = -1;
      } else {
        label[k] = biome;
        latticePoints++;
      }
    }
  }

  // 2. Distance to water, by the chamfer 3-4 transform `sampleBiomeMask` uses, over the mesh's own
  //    heights. Not the mask itself: that is one `elevation` per grid point over the whole region,
  //    which is the build again, and it would answer about a different lattice. The water it finds
  //    is `isLand`'s water to the metre, because DECISIONS C2's displacement is exactly zero at the
  //    waterline, so a vertex at or below zero here is a vertex the registry calls sea.
  //    Skipped outright on a region with no sea in it, which is most of them: with no seed cell the
  //    transform can only return Infinity everywhere, and running it anyway measured 8 ms spent
  //    proving that. `hasWater` is the builder's own answer to the same question, and it is why the
  //    ordinary parcel costs 30 ms here and the coastal demo 42.
  const A = 3;
  const B = 4;
  const water = new Float32Array(cells).fill(Infinity);
  if (region.hasWater) {
    for (let k = 0; k < cells; k++) water[k] = filled[k] === 1 && height[k]! <= 0 ? 0 : Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let best = water[k]!;
        if (i > 0) best = Math.min(best, water[k - 1]! + A);
        if (j > 0) {
          best = Math.min(best, water[k - n]! + A);
          if (i > 0) best = Math.min(best, water[k - n - 1]! + B);
          if (i < n - 1) best = Math.min(best, water[k - n + 1]! + B);
        }
        water[k] = best;
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const k = j * n + i;
        let best = water[k]!;
        if (i < n - 1) best = Math.min(best, water[k + 1]! + A);
        if (j < n - 1) {
          best = Math.min(best, water[k + n]! + A);
          if (i < n - 1) best = Math.min(best, water[k + n + 1]! + B);
          if (i > 0) best = Math.min(best, water[k + n - 1]! + B);
        }
        water[k] = best;
      }
    }
    for (let k = 0; k < cells; k++) water[k] = water[k]! === Infinity ? Infinity : (water[k]! / A) * step;
  }

  // 3. Each vertex against its own neighbourhood, at TWO widths, because the eye is asking two
  //    different questions of the same ground and only one of them is answered by a wide box.
  //
  //    Measured on the shipped routes: 92 to 98% of the ground rays in a frame land within 40 m of
  //    the camera, and the camera is 5.5 m up, so the floor a person is standing on is a patch
  //    about forty metres across. A signal whose features are 150 m wide is ONE VALUE over all of
  //    it. That is not a guess: with the wide box alone, a 400 by 250 pixel crop of the near floor
  //    on a tundra parcel came back at a standard deviation of 0.06 levels of 255, which is a flat
  //    colour with a new mean.
  //
  //    So `crest` is the wide question, the hollow-or-hill a hillside is made of, and `swell` is
  //    the narrow one: the 24 to 48 m relief DECISIONS C2 bought, over a 60 m window. It is worth
  //    more than any hash could be, because the mesh DRAWS that relief: the ground shades one way
  //    and the colour shades with it, so a paler crest is a crest a person can see.
  //
  //    The running PREFIX is float64 because it accumulates a whole row, which reaches a million
  //    metres and would start losing centimetres in float32; the windowed sums it differences are
  //    a handful of heights and stay well inside float32. One row pass serves both widths.
  const R = Math.max(1, Math.round(CREST_BOX_M / step));
  const RN = Math.max(1, Math.round(SWELL_BOX_M / step));
  const rowSum = new Float32Array(cells);
  const rowCount = new Float32Array(cells);
  const rowSumNear = new Float32Array(cells);
  const rowCountNear = new Float32Array(cells);
  const prefixSum = new Float64Array(n + 1);
  const prefixCount = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      prefixSum[i + 1] = prefixSum[i]! + (filled[k] ? height[k]! : 0);
      prefixCount[i + 1] = prefixCount[i]! + (filled[k] ? 1 : 0);
    }
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const lo = Math.max(0, i - R);
      const hi = Math.min(n - 1, i + R);
      rowSum[k] = prefixSum[hi + 1]! - prefixSum[lo]!;
      rowCount[k] = prefixCount[hi + 1]! - prefixCount[lo]!;
      const loN = Math.max(0, i - RN);
      const hiN = Math.min(n - 1, i + RN);
      rowSumNear[k] = prefixSum[hiN + 1]! - prefixSum[loN]!;
      rowCountNear[k] = prefixCount[hiN + 1]! - prefixCount[loN]!;
    }
  }
  const boxMean = new Float32Array(cells);
  const boxMeanNear = new Float32Array(cells);
  const column = (radius: number, rs: Float32Array, rc: Float32Array, out: Float32Array) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const k = j * n + i;
        prefixSum[j + 1] = prefixSum[j]! + rs[k]!;
        prefixCount[j + 1] = prefixCount[j]! + rc[k]!;
      }
      for (let j = 0; j < n; j++) {
        const lo = Math.max(0, j - radius);
        const hi = Math.min(n - 1, j + radius);
        const count = prefixCount[hi + 1]! - prefixCount[lo]!;
        out[j * n + i] = count > 0 ? (prefixSum[hi + 1]! - prefixSum[lo]!) / count : height[j * n + i]!;
      }
    }
  };
  prefixSum[0] = 0;
  prefixCount[0] = 0;
  column(R, rowSum, rowCount, boxMean);
  column(RN, rowSumNear, rowCountNear, boxMeanNear);

  // 4. The noise fields. Salted from the seed exactly as the displacement is, so two planets never
  //    share a litter pattern, and only the fields this region's composition asks for are built: a
  //    100% rainforest parcel pays nothing for the burn scars it has no savanna to put them on.
  const salt = Math.floor(hashString(seed) * 0x7fffffff) | 0;
  const has = (b: Biome) => (region.composition[b] ?? 0) > 0;
  // THE LADDER IS SET BY WHAT THE EYE IS STANDING IN, not by taste. The camera sits 5.5 m up and
  // 9 m back, and the ground rays in a shipped frame land at a median 66 to 70 m, so the near half
  // of the picture is about forty metres of ground across. A field at 300 m is one flat value over
  // all of that: it moves the whole-frame average and leaves the floor underfoot exactly as flat as
  // it was. Measured that way first, at 108 and 324 m, and the savanna and the tundra came back
  // with a burn scar and a frost net visible only on the horizon. So the workhorse is 72 m, which
  // is half a period across the near field, and 36 m sits under it. 36 is the floor: three lattice
  // steps, the finest wavelength this mesh can carry without aliasing into a per-vertex flicker.
  // 216 m is still here because it is what makes one parcel's ground read differently from the
  // next one's over a walk, but it carries the smallest weight of the three.
  const fine = noiseGrid(n, half, step, 36, 36, salt + 11, filled);
  const mid = noiseGrid(n, half, step, 72, 72, salt + 12, filled);
  const coarse = noiseGrid(n, half, step, 216, 216, salt + 13, filled);
  // Ridges, not blobs, and the only two grounds shaped by moving air rather than by water.
  const dunes = has("desert") || has("beach") ? noiseGrid(n, half, step, 54, 210, salt + 14, filled) : null;
  const sastrugi = has("snow") ? noiseGrid(n, half, step, 220, 40, salt + 15, filled) : null;
  // 70 m fire scars, 90 m frost polygons, 80 m joint blocks. Squeezed between two bounds: large
  // enough that the drawn line between two pieces is not the only thing in the piece, and small
  // enough that a person standing on one can see the next. At 200 m the savanna's scars were real
  // and entirely on the horizon, because a player stands in the middle of one and walks for a
  // minute without leaving it; at 70 there are two or three of them inside the fog.
  //
  // THE FROST NET IS THE ONE PLACE THE LATTICE WON AN ARGUMENT, and it is worth writing down. Ice
  // wedges crack tundra into polygons that run from about 15 m to 50 m, and none of that range is
  // drawable here: a trough needs two lattice steps of ramp on each side to be a line rather than a
  // step between two vertices, which is 26 m of trough, and a 45 m polygon is then ALL trough. It
  // was measured that way. At 45 m and an 11 m ramp the tundra's mean neighbour difference was 0.88
  // of the white-noise ratio; at 55 m and 24 m the mean was 0.78 and the MEDIAN pair differed by
  // 9.2 levels of 255, which is the tell: a drawn line leaves most pairs flat and puts everything
  // in the tail, and this was putting half of them in the middle. At 90 m the median pair differs
  // by 5.0 and the 90th percentile by 24, which is a flat interior with an edge around it. So the
  // net is drawn at twice the size the world draws it, because the alternative was fizz in the
  // shape of a net, and this is written here rather than discovered later.
  const scars = has("savanna") ? cellularGrid(n, half, step, 70, 0.9, salt + 21, filled) : null;
  const polygons = has("tundra") ? cellularGrid(n, half, step, 90, 0.85, salt + 24, filled) : null;
  const joints = has("bare-rock") ? cellularGrid(n, half, step, 80, 0.8, salt + 27, filled) : null;

  // 5. One colour per lattice point. Everything above this line is a signal; everything below it is
  //    ecology. The mixer is three registers and two closures rather than allocations, because this
  //    runs seventy thousand times and an rgb triple per point is seventy thousand short-lived
  //    objects on the frame the world is being built in.
  const paint = new Float32Array(cells * 3);
  const perBiome = new Int32Array(BIOMES.length);
  let r = 0;
  let g = 0;
  let b = 0;
  const set = (c: readonly [number, number, number]) => {
    r = c[0];
    g = c[1];
    b = c[2];
  };
  const towards = (c: readonly [number, number, number], t: number) => {
    if (t <= 0) return;
    const w = t > 1 ? 1 : t;
    r += (c[0] - r) * w;
    g += (c[1] - g) * w;
    b += (c[2] - b) * w;
  };
  const SIN_STEEP = Math.sin((STEEP_FULL_DEG * Math.PI) / 180);

  for (let k = 0; k < cells; k++) {
    const kind = label[k]!;
    if (kind < 0 || kind === OCEAN) continue;
    perBiome[kind]!++;

    const h = height[k]!;
    // Above its own neighbourhood or below it, softened so there is no edge to the signal and no
    // clamp to band at. Reaches ±0.5 at CREST_SCALE_M and asymptotes to ±1.
    const rel = h - boxMean[k]!;
    const crest = rel / (Math.abs(rel) + CREST_SCALE_M);
    // The same question over 60 m instead of 156: the swell under a foot rather than the hill.
    const relN = h - boxMeanNear[k]!;
    const swell = relN / (Math.abs(relN) + SWELL_SCALE_M);
    // The normal is a unit vector, so its horizontal length is the sine of the slope.
    const ny = slopeUp[k]!;
    const steep = clamp01(Math.sqrt(Math.max(0, 1 - ny * ny)) / SIN_STEEP);
    // Negative x is west, which is where the one key light comes from: this is how much of the low
    // sun a face takes, and so how dry and how bleached it is.
    const sunward = clamp01((-slopeEast[k]! / SIN_STEEP) * 0.5 + 0.5);
    const wd = water[k]!;
    const nf = fine[k]!;
    const nm = mid[k]!;
    const nc = coarse[k]!;

    switch (kind) {
      case RAINFOREST: {
        // A rainforest floor is not green and it is not lit. It is leaf litter over red subsoil, in
        // a permanent shade the renderer has no ambient occlusion to give it, so the darkness is
        // baked into the albedo here: this is the ground under a canopy, not a canopy.
        //
        // Litter falls everywhere and ROTS in the wet, so the hollows go to humus and the rises keep
        // their brown. The one bright thing on this floor is a treefall gap, which is real, famous
        // and about the right size to draw: where the coarse field opens, the herb layer floods in.
        set(HUMUS);
        towards(LITTER, clamp01(0.32 + 0.26 * crest + 0.28 * swell + 0.22 * nm + 0.14 * nf));
        // A slope sheds its litter and shows the clay under it.
        towards(CLAY, 0.45 * steep * steep);
        const gap = band(nc, 0.34, 0.9);
        towards(LEAF, 0.42 * gap);
        towards(LEAF_LIGHT, 0.16 * gap * gap);
        break;
      }
      case FOREST: {
        // The same floor with ten times the light and a tenth of the rot: thicker dry litter, moss
        // on the damp and shaded half of it, and bracken where the canopy opens. Lighter than the
        // rainforest and browner than the table's canopy green.
        set(HUMUS);
        towards(LITTER, clamp01(0.44 + 0.22 * crest + 0.26 * swell + 0.24 * nm + 0.14 * nf));
        towards(LEAF_DARK, 0.32 * clamp01(0.45 - 0.4 * crest - 0.4 * swell + 0.3 * nf) * (1 - 0.5 * sunward));
        towards(LEAF_LIGHT, 0.3 * band(nc, 0.25, 0.8));
        towards(CLAY, 0.3 * steep * steep);
        break;
      }
      case TAIGA: {
        // A boreal floor is a MAT, not bare ground: feather moss over needle litter, reindeer lichen
        // wherever it is dry enough, sphagnum and peat in every hollow. `conifer` is used for the
        // moss rather than a new entry because it is already this palette's word for a cold blue
        // green, and the moss under these trees is the same cold green as the trees.
        set(HUMUS);
        towards(LITTER, clamp01(0.44 + 0.2 * crest + 0.26 * swell + 0.22 * nm + 0.12 * nf));
        towards(CONIFER, 0.34 * clamp01(0.5 - 0.35 * crest - 0.35 * swell + 0.26 * nf));
        towards(LICHEN, 0.5 * clamp01(0.15 + 0.5 * crest + 0.4 * swell + 0.3 * nm));
        break;
      }
      case TUNDRA: {
        // The frost-polygon net, which is the one thing about this ground anybody would recognise
        // from a photograph. Ice wedges crack the ground into cells; the wedge melts out into a wet
        // peat trough along every crack, and the cell it encloses drains and dries and takes lichen
        // and frost-heaved gravel. The net is the read: dark lines on a pale mat, and the lines are
        // drawn by the DISTANCE to the boundary rather than by any noise field.
        const cell = polygons ? polygons.id[k]! : 0.5;
        // 24 m of ramp, two lattice steps either side of a wedge. A trough that arrived over one
        // step would be a hard line between two vertices, which this mesh cannot carry.
        const trough = polygons ? clamp01(1 - polygons.edge[k]! / 26) : 0;
        set(LICHEN);
        towards(BUSH_DRY, clamp01(0.34 + 0.24 * cell + 0.34 * swell + 0.3 * nm + 0.14 * nf));
        // A polygon centre that heaved is gravel, not vegetation.
        towards(ROCK_LIGHT, 0.45 * clamp01(cell * 1.4 - 0.6) * (1 - trough));
        towards(HUMUS, 0.6 * trough * (0.45 + 0.55 * trough));
        // Snow lies late in the lee of anything, and this is the one ground cold enough to keep it
        // into the season. It is also the only bright thing the palette has for cold open country.
        towards(SNOW_SHADE, 0.6 * band(nc, 0.35, 0.9) * (1 - steep) * (1 - 0.6 * trough));
        towards(ROCK, 0.35 * steep * steep);
        break;
      }
      case SAVANNA: {
        // A burn mosaic, because that is what savanna IS: it burns in patches and every patch is at
        // a different point in the same cycle. Fresh scar is charcoal with ash in its own hollows;
        // weeks later the flush comes up through the black, greener than anything around it;
        // then it cures through olive to straw and waits to burn again.
        //
        // The scar is a cellular patch and not a blob because a fire front stops at something: the
        // edge is the most recognisable part of a burn and the reason this is not simply noise.
        // Crests dry first and so burn first, which is why the age is shifted by the relief and not
        // taken from the hash alone.
        const scar = scars ? scars.id[k]! : 0.6;
        const softEdge = scars ? clamp01(scars.edge[k]! / 26) : 1;
        // Near a boundary the two neighbours' ages meet; the fine field frays the seam so it is a
        // fire's edge and not a bisector.
        const age = clamp01(scar + 0.1 * crest + 0.1 * swell + 0.09 * nf * (1 - softEdge) + 0.06 * nm);
        set(THATCH);
        towards(GRASS_DRY, clamp01(0.3 - 0.4 * crest - 0.42 * swell + 0.34 * nm + 0.18 * nf));
        // Bare soil between the tussocks, on the ground that has been grazed and dried hardest.
        towards(CLAY, 0.24 * clamp01(0.3 + 0.6 * crest) * (1 - band(age, 0.1, 0.35)));
        // The flush, then the scar over it, so a fresh burn wins wherever it is fresh.
        towards(GRASS, 0.7 * (band(age, 0.08, 0.17) * (1 - band(age, 0.24, 0.44))));
        const burnt = 1 - band(age, 0.03, 0.13);
        towards(CHAR, 0.9 * burnt);
        towards(ASH, 0.42 * burnt * clamp01(0.45 - 0.5 * crest + 0.5 * nf));
        break;
      }
      case GRASSLAND: {
        // Seasonal thatch, not lawn. By the end of a season a temperate sward is standing dead
        // straw with green left only where the water is, so the green is placed by the ground's own
        // drainage rather than sprinkled: hollows first, then anything within a stone's throw of
        // water. That puts green ribbons down the draws and bleaches the crests, which is what a
        // grassland looks like from a hundred metres up and from standing in it.
        set(GRASS_DRY);
        // Cured straw wins the crests and the sun-facing half, and a whole sward can be a season
        // ahead of the one next to it, which is what the coarse term is: a drift of thatch, not a
        // speckle of it.
        towards(THATCH, clamp01(0.34 + 0.32 * crest + 0.4 * swell + 0.34 * nm + 0.22 * nc + 0.16 * nf + 0.18 * sunward));
        // Green only where the water is: the bottom of a draw, and anything near open water. That
        // draws green ribbons down the drainage instead of sprinkling green over the whole field.
        const damp = band(-0.7 * crest - 0.7 * swell + 0.4 * nf + 0.3 * nm, -0.1, 0.55) + (Number.isFinite(wd) ? 0.6 * (1 - band(wd, 10, 90)) : 0);
        towards(GRASS, 0.72 * clamp01(damp));
        towards(SOIL, 0.24 * steep * steep);
        break;
      }
      case BEACH: {
        // Wet sand toward the water, on the distance the chamfer already found. There is no tide in
        // this world, so there is no tide line and none is drawn: what darkens is the capillary
        // fringe behind the swash, and it is metres wide because that is what it is. Everything past
        // it is dry, and the crest of a dune, where nothing has been damp for a season, is the
        // palest sand there is. The fine ridges are aeolian and so they run: `dunes` is a stretched
        // field, not a round one.
        set(SAND);
        towards(SAND_DRY, clamp01(0.3 + 0.36 * crest + 0.36 * swell + 0.3 * (dunes ? dunes[k]! : 0) + 0.12 * nf));
        towards(SAND_WET, Number.isFinite(wd) ? 0.95 * (1 - band(wd, 0, BEACH_WET_M)) : 0);
        // Heavy minerals streak a beach dark where the water sorted them. Small on purpose.
        towards(ROCK, 0.07 * clamp01(nf * 0.8 + 0.2 * nm));
        break;
      }
      case DESERT: {
        // The exact inverse of the forest floor, and the inversion is the point: in a forest the
        // hollows collect the dark organic matter and the crests are bare, while in a desert the
        // wind strips the crests to a lag of varnished stone and the hollows fill with pale sand.
        // Desert pavement is the most common desert surface there is and it is dark, which is why
        // this biome is not a field of one sand colour.
        set(SAND);
        towards(SAND_DRY, clamp01(0.44 - 0.34 * crest - 0.36 * swell + 0.36 * (dunes ? dunes[k]! : 0) + 0.18 * nf));
        const pavement = clamp01(0.12 + 0.55 * crest + 0.5 * swell + 0.44 * nm + 0.4 * steep + 0.16 * nf + 0.12 * nc);
        towards(CLAY, 0.52 * pavement);
        towards(ROCK, 0.3 * pavement * pavement);
        break;
      }
      case BARE_ROCK: {
        // Rock is jointed. It breaks into blocks along its own cracks and every block weathers on
        // its own, so a cliff reads as a mosaic with lines in it and never as grey noise; the cracks
        // hold the soil and the water, and lichen takes the flat tops it cannot hold on a face.
        const block = joints ? joints.id[k]! : 0.5;
        // 20 m of ramp for the same reason the frost trough has 24: a crack drawn over one lattice
        // step is a line the mesh cannot carry, and it aliases instead of reading.
        const crack = joints ? clamp01(1 - joints.edge[k]! / 20) : 0;
        set(ROCK);
        towards(ROCK_LIGHT, clamp01(0.4 + 0.6 * block + 0.34 * swell + 0.3 * nm + 0.16 * nf));
        towards(LICHEN, 0.5 * (1 - steep) * clamp01(0.2 + 0.55 * nm + 0.3 * nf));
        towards(SOIL, 0.36 * crack * (0.4 + 0.6 * crack));
        break;
      }
      case SNOW: {
        // Snow is never one white. It is the only ground here that is brighter than the sky's fill,
        // so every hollow in it is lit by the sky alone and goes blue, which is exactly what
        // `snowShade` was named for. The wind does the rest: it scours the crests to hard slab and
        // piles the lees, and the ridges it carves run with it, which is why this field is stretched
        // east to west, along the one wind this world has.
        set(SNOW_SHADE);
        towards(SNOW_LIT, clamp01(0.5 + 0.24 * crest + 0.3 * swell + 0.22 * sunward + 0.24 * (sastrugi ? sastrugi[k]! : 0) + 0.14 * nm));
        // A slope steep enough sheds its snow and shows what it was lying on.
        towards(ROCK_LIGHT, 0.5 * steep * steep * steep);
        break;
      }
      default:
        // A biome this file has no recipe for keeps the table's colour rather than an accident.
        continue;
    }

    const o = k * 3;
    paint[o] = r;
    paint[o + 1] = g;
    paint[o + 2] = b;
  }

  // 6. Back onto the soup. A lattice point is shared by up to six triangles and by up to two chunks,
  //    and every one of them gets the same three floats, so the builder's promise that a shared
  //    vertex has one colour survives this.
  let painted = 0;
  let untouched = 0;
  for (const chunk of region.chunks) {
    const p = chunk.positions;
    const col = chunk.colours;
    for (let o = 0; o < p.length; o += 3) {
      const i = Math.round(p[o]! * perStep) + half;
      const j = Math.round(-p[o + 2]! * perStep) + half;
      if (i < 0 || i >= n || j < 0 || j >= n) {
        untouched++;
        continue;
      }
      const k = j * n + i;
      const kind = label[k]!;
      if (kind < 0 || kind === OCEAN) {
        // Seabed keeps the table. It is under a sea plane at 0.86 opacity, so a seventh of any
        // change would reach the eye, and what colour the sea is belongs to the layer drawing it.
        untouched++;
        continue;
      }
      const g3 = k * 3;
      col[o] = paint[g3]!;
      col[o + 1] = paint[g3 + 1]!;
      col[o + 2] = paint[g3 + 2]!;
      painted++;
    }
  }

  return {
    painted,
    untouched,
    latticePoints,
    strays,
    unlabelled,
    millis: performance.now() - t0,
    byBiome: BIOMES.reduce<Partial<Record<Biome, number>>>((out, b, i) => {
      if (perBiome[i]! > 0) out[b] = perBiome[i]!;
      return out;
    }, {}),
  };
}

/** The chunk shape this file rewrites, re-exported so a test can name it without reaching past here. */
export type { RegionChunk };
