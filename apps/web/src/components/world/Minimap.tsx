"use client";

/**
 * The minimap, top right: where you are inside your parcel, which way you are going, and where the
 * parcel is on the planet.
 *
 * The reference given was Grand Theft Auto's. What is borrowed is the vocabulary, a corner map with
 * a marker and a view cone, and nothing else: GTA's map scrolls under a fixed marker because you
 * cross its world at 30 m/s, and this world walks at WORLD.MOVE_SPEED, 6.4 m/s, across a parcel
 * 1,426 m wide. A window scrolling at GTA's rate relative to the walk would show 60 m of ground and
 * answer neither of the two questions that were actually asked. So the frame is FIXED and the
 * marker moves in it: the map covers the whole built region, 4,147 m across on 8482589ffffffff, the
 * exact disk `regionBound` gates walking to, and the marker therefore cannot leave the map because
 * the player cannot leave the region.
 *
 * IT IS DRAWN FROM THE GROUND THE WORLD UPLOADED, not from a second sampling of the terrain. The
 * ground image is one pass over `terrain.chunks[i].geometry`: the position, normal and colour
 * attributes that the GPU is holding, binned into 112 by 112 pixels. That is the same colour after
 * groundColour.ts's paint and after canopyClosure.ts has darkened the floor under the crowns, so
 * the map shows the forest because the world's own vertices are darker there, and a change to
 * either of those layers moves this map without anybody editing this file. The sea is not a colour
 * of this file's own either: it is read off `terrain.water`'s material, colour and opacity both, and
 * composited exactly where the shipped water plane covers ground below sea level.
 *
 * AND THE COST OF THAT CHOICE, WHICH IS REAL. What the vertices carry is the ground's ALBEDO, and
 * under a closed canopy the ground is leaf litter, so a parcel that is 100% rainforest draws BROWN
 * on this map while the world in front of you is green: 8482589ffffffff reads as litter, humus and
 * clay, which is what groundColour.ts painted it and what a person standing on it is standing on.
 * The alternative is painting the biome table instead, and that is a second story about what the
 * ground looks like, which is the divergence this project keeps being bitten by. So the map is the
 * floor and not the canopy, and it is worth most exactly where a person needs it most: the demo
 * cell's 45% ocean, its shoreline and the sand between them are unmistakable on it.
 *
 * THE ONE THING IT ADDS IS THE LIGHT, and it is a MAP's light, not the world's. The dusk key sits
 * 16 degrees above the horizon in the west, and a plan view lit from there is half in shadow; the
 * hillshade here comes from the chunks' own vertex normals against a light from the north west,
 * high, which is the convention a printed relief map uses and the one ParcelInset.ts already uses
 * on the landing. It is normalised so flat ground reads at exactly the albedo the vertex carries.
 *
 * NORTH IS FIXED AT THE TOP AND THE HEADING IS SHOWN AS WELL. Fixed, because the parcel is a hexagon
 * that does not turn, and the whole question "where am I in my parcel" is asked against that fixed
 * shape; a map that span would put the deed line somewhere new every time you looked. The heading is
 * the arrow and the camera is the cone, so nothing is lost by not turning the map.
 *
 * WHICH WAY IS UP, PROVED RATHER THAN ASSERTED. The tile frame is x east and y SOUTH; three's frame
 * is x east, y up, z SOUTH; a canvas's y grows DOWNWARD. So south maps to down with no sign at all,
 * and north is up for free: `mapPixelOf` takes three's own (x, z) straight through. The flip this
 * project has had twice is the one that comes from converting through planet-local metres, which run
 * NORTH, and this file never touches those except for the parcel outline, which is the one input
 * that arrives in them (`patch.boundary`) and is the one place a minus sign appears.
 * tests/minimap.test.mts pins the mapping at the two edges and the e2e spec walks the shipped player
 * 400 m north and measures the marker moving up the shipped panel.
 *
 * THE PLANET INSET TAKES THE LANDING GLOBE'S HANDEDNESS, WHICH IS NOT THE MAP'S. Measured on
 * 8482589ffffffff: `east x north . outward = -1.000000`. geo.ts maps latitude to +Y and longitude to
 * +Z from +X, which is an odd permutation of the Earth convention, so on this planet east draws to
 * the LEFT of a north-up view from outside. The landing's globe draws that way, because PlanetGlobe
 * and preview-globe.ts both take three's own lookAt basis, `right = up x view`, and so does the
 * inset below: the inset's job is to say "that planet you pointed at, here" and a mirrored one would
 * be the second mirrored parcel inset this project has shipped (DECISIONS C3 records the first). The
 * ground map above it does NOT follow that convention and must not: it is a picture of the scene as
 * three draws it, and a map that disagreed with the ground under your feet would be useless for the
 * only thing a map is for. The two panels therefore have opposite handedness, which is a property of
 * the planet and not of this widget; `planetInsetBasis` states it and a test pins it.
 *
 * WHAT IT COSTS, MEASURED ON THE SHIPPED PAGE ON A REAL GPU. The two images are painted ONCE, when
 * the world reports ready: 31 to 40 ms in total on the demo cell over repeated runs, of which 12 to
 * 16 is the ground, one walk over 421,626 vertices; 16 is the planet inset's 12,892 terrain samples;
 * and 3 to 8 is the PNG encode that turns both into <img> sources. Per frame it reads the player
 * layer's position, heading and camera yaw and writes one transform and two rotate attributes: 31
 * to 43 microseconds, mean over 250 to 410 frames, with no canvas work, no second camera and no
 * readback. The counterfactual was measured rather than argued: repainting the ground
 * image every frame instead of once costs 22,344 microseconds a frame, 590 times as much, and
 * tests/e2e/minimap.spec.ts is the guard that was watched failing on exactly that edit. The ground
 * is already at 844,775 triangles against DECISIONS C16's 600,000 budget, so a map that re-rendered
 * the world from a second camera was never affordable and was never considered.
 *
 * The build stats are on `window.__minimap` outside production, which is where those numbers are
 * read from and how the e2e spec asserts them.
 *
 * REDUCED MOTION. The marker's own travel is not motion worth removing: at 6.4 m/s over a 21.2 m
 * per display pixel map it is 0.30 px/s, which is slower than a clock's minute hand. The two things
 * that DO move fast are the heading arrow and the view cone, which the mouse can spin at
 * MOVER.TURN_RATE, 12 rad/s, and the ring's breathe. Under prefers-reduced-motion the breathe stops
 * (the tailwind config's own instruction on that keyframe) and both rotations snap to the eight
 * compass points, which keeps the information and removes the spin.
 *
 * IT CANNOT TAKE FOCUS. The panel is `pointer-events-none` with no interactive element and no
 * tabindex in it, so a click near the top right corner goes through to the renderer's canvas and
 * keeps orbiting the camera, and nothing here is in the tab order.
 */

import { useEffect, useRef, useState } from "react";
import {
  BIOME_COLOUR_LINEAR,
  biome,
  globeHeightAt,
  linearToSrgb,
  regionBound,
  srgbToLinear,
  vec3ToLatLng,
  type Calibration,
  type TerrainField,
  type Vec3,
} from "@echo/planet";

import { PALETTE, rgb } from "@/game/three/palette";
import { cameraForward } from "@/game/world/followCamera";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { PlayerLayer } from "@/game/world/playerLayer";
import type { TerrainLayer } from "@/game/world/terrainChunks";

// ── the dials ───────────────────────────────────────────────────────────────────

/**
 * Pixels the ground image is rasterised at, and pixels it is shown at.
 *
 * Rendered small and scaled up with crisp edges, which is ParcelInset's register on the landing and
 * the art bible's. At the region's own 2,073 m half extent this is 37.0 m of ground per rendered
 * pixel against the mesh's 12 m lattice, so about nine lattice vertices land in each one: the map is
 * an average of real vertices everywhere rather than a nearest-neighbour pick, which is what stops
 * the coastline crawling with lattice aliasing.
 */
export const MAP_RENDER_PX = 112;
export const MAP_DISPLAY_PX = 196;

/**
 * The planet inset. 128 samples a side is 12,892 terrain evaluations inside the disk, 14 ms in node
 * on this machine, paid once; ParcelInset already spends 12,544 of the same order on the landing.
 * Shown at 64 so it is a locator and not a second hero.
 */
export const GLOBE_RENDER_PX = 128;
export const GLOBE_DISPLAY_PX = 64;

/**
 * The map's light: from the north west, high. Three's frame, so -x is west and -z is NORTH.
 *
 * Not the world's key. That one is 16 degrees above the horizon in the west (skyLayer's dusk), and
 * a plan view lit from 16 degrees puts every north-east facing slope in full shadow; a relief map is
 * lit from over the reader's shoulder for exactly that reason. The shade is divided by the light's
 * own y so that flat ground comes out at 1.000 and carries the vertex albedo unchanged, and it is
 * clamped either side so a cliff darkens the ground rather than replacing it.
 */
const MAP_LIGHT = normalise([-0.45, 0.78, -0.44]);
const SHADE_MIN = 0.66;
const SHADE_MAX = 1.34;

/**
 * How far the ground outside the deed line is pulled toward the ink. Toward `PALETTE.shadow` rather
 * than toward zero, which is the art bible's law and the same construction canopyClosure.ts uses:
 * no amount of dimming can reach black. 0.42 leaves the six neighbours plainly legible as ground
 * while the parcel reads as the lit thing in the middle, which is the point, since the parcel is
 * what is owned.
 */
const OUTSIDE_DIM = 0.42;

/** The planet inset's night side, as a share of the lit value. Same rule: the floor is the ink. */
const INSET_AMBIENT = 0.2;

// ── the frame, in one function ──────────────────────────────────────────────────

/**
 * Three's world metres to a pixel on the map, north up.
 *
 * The whole orientation of this widget is these two lines. Three's x is EAST and its z is SOUTH; a
 * canvas's x grows right and its y grows DOWN. East to the right and south to the bottom is
 * therefore the identity, and north ends up at the top with no sign anywhere. `extentM` is the half
 * width of the square the map covers, so -extentM lands on 0 and +extentM on `size`.
 */
export function mapPixelOf(xM: number, zM: number, extentM: number, size: number): [number, number] {
  const scale = size / (2 * extentM);
  return [(xM + extentM) * scale, (zM + extentM) * scale];
}

/**
 * The rotation to apply to a marker drawn pointing NORTH so that it points along a tile-space
 * heading. Radians, clockwise, which is what both CSS and SVG mean by a positive rotation on a
 * y-grows-down surface.
 *
 * `heading` is atan2(south, east) from controller.ts, so its screen direction is (cos h, sin h)
 * directly. Art that points north points at (0, -1), which is a quarter turn anticlockwise from
 * (1, 0), so the rotation that carries it onto the heading is h + pi/2.
 */
export function arrowRotationRad(heading: number): number {
  return heading + Math.PI / 2;
}

/**
 * The nearest of the eight compass points, for prefers-reduced-motion.
 *
 * The heading itself is kept exact everywhere else; this only decides which way a 10 px arrow is
 * drawn. Eight points is 45 degrees, so the arrow is never more than 22.5 degrees from the truth,
 * and the mouse can no longer spin it.
 */
export function quantiseToCompass(radians: number): number {
  const step = Math.PI / 4;
  return Math.round(radians / step) * step;
}

// ── the ground image ────────────────────────────────────────────────────────────

/**
 * What one terrain chunk contributes: the three attributes the renderer is holding for it.
 *
 * `ArrayLike<number>` rather than Float32Array so a test can hand this plain arrays, and so nothing
 * here has to assert what type a BufferAttribute happens to be carrying.
 */
export interface GroundSource {
  /** Triangle soup, three vertices a triangle. Three's metres: x east, y up, z south. */
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  /** 0..1 per channel, LINEAR, the space a colour attribute is read in. See RegionChunk.colours. */
  colours: ArrayLike<number>;
}

/** The sea, as the shipped water mesh's own material states it. Linear, because THREE.Color is. */
export interface WaterSpec {
  r: number;
  g: number;
  b: number;
  /** The material's opacity, or 1 where it is not transparent. */
  opacity: number;
}

export interface GroundMapOptions {
  /** Rendered pixels a side. */
  size: number;
  /** Half the side of the square of ground the image covers, metres. */
  extentM: number;
  /** Inside the deed line, in the anchor patch's LOCAL metres: x east, y NORTH. */
  insideParcel: (xM: number, yNorthM: number) => boolean;
  /** Null on a region with no water in it, where no water mesh is built either. */
  water: WaterSpec | null;
}

/**
 * Bin every vertex the world uploaded into pixels, shade, composite the sea, dim what is not the
 * parcel, and encode. Returns RGBA bytes ready for an ImageData.
 *
 * ONE PASS, AND IT IS THE ONLY EXPENSIVE THING THIS WIDGET DOES. A vertex is a handful of adds, and
 * a triangle soup repeats each corner three times, which is not waste here: a vertex shared by three
 * triangles genuinely covers three times as much ground, so the repetition is the area weight and
 * dropping it would bias the average toward the lattice's own corners.
 *
 * PIXELS WITH NO VERTEX IN THEM ARE LEFT TRANSPARENT. The region is a hexagonal flower inside a
 * square, so about a quarter of the image is outside it; painting that in a colour would draw a
 * square of ground that does not exist.
 */
export function paintGroundMap(chunks: readonly GroundSource[], options: GroundMapOptions): Uint8ClampedArray {
  const { size, extentM, insideParcel, water } = options;
  const n = size * size;
  const sum = new Float64Array(n * 3);
  const norm = new Float64Array(n * 3);
  const count = new Float64Array(n);
  const wet = new Float64Array(n);
  const scale = size / (2 * extentM);

  for (const chunk of chunks) {
    const { positions, normals, colours } = chunk;
    const vertices = positions.length / 3;
    for (let v = 0; v < vertices; v++) {
      const o = v * 3;
      const px = Math.floor((positions[o]! + extentM) * scale);
      const py = Math.floor((positions[o + 2]! + extentM) * scale);
      if (px < 0 || px >= size || py < 0 || py >= size) continue;
      const k = py * size + px;
      const k3 = k * 3;
      sum[k3] += colours[o]!;
      sum[k3 + 1] += colours[o + 1]!;
      sum[k3 + 2] += colours[o + 2]!;
      norm[k3] += normals[o]!;
      norm[k3 + 1] += normals[o + 1]!;
      norm[k3 + 2] += normals[o + 2]!;
      // The height IS the sea test: heightAtTile is metres above sea level, so the sign is the
      // waterline, exactly as isLandHeight reads it.
      if (positions[o + 1]! < 0) wet[k] += 1;
      count[k] += 1;
    }
  }

  const ink = rgb(PALETTE.shadow).map(srgbToLinear) as [number, number, number];
  const out = new Uint8ClampedArray(n * 4);
  const invLightY = 1 / MAP_LIGHT[1];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const k = py * size + px;
      const hits = count[k]!;
      if (hits === 0) continue; // transparent: there is no ground here
      const inv = 1 / hits;
      const k3 = k * 3;

      const nx = norm[k3]! * inv;
      const ny = norm[k3 + 1]! * inv;
      const nz = norm[k3 + 2]! * inv;
      const len = Math.hypot(nx, ny, nz) || 1;
      const lambert = (nx * MAP_LIGHT[0] + ny * MAP_LIGHT[1] + nz * MAP_LIGHT[2]) / len;
      const shade = clamp(lambert * invLightY, SHADE_MIN, SHADE_MAX);

      let r = sum[k3]! * inv * shade;
      let g = sum[k3 + 1]! * inv * shade;
      let b = sum[k3 + 2]! * inv * shade;

      // The sea, where the shipped water plane covers ground below sea level. The share of this
      // pixel's vertices that are under water is its sub-pixel coverage, so a coast fades over one
      // pixel instead of stepping, and a pixel with no wet vertex is untouched.
      if (water && wet[k]! > 0) {
        const a = water.opacity * (wet[k]! * inv);
        r += (water.r - r) * a;
        g += (water.g - g) * a;
        b += (water.b - b) * a;
      }

      // Which side of the deed line this pixel's centre is. Local metres run NORTH, so the row
      // index is negated: this is the one place in this file a frame is flipped.
      const eastM = (px + 0.5) / scale - extentM;
      const northM = extentM - (py + 0.5) / scale;
      if (!insideParcel(eastM, northM)) {
        r += (ink[0] - r) * OUTSIDE_DIM;
        g += (ink[1] - g) * OUTSIDE_DIM;
        b += (ink[2] - b) * OUTSIDE_DIM;
      }

      const o = k * 4;
      out[o] = linearToSrgb(r) * 255;
      out[o + 1] = linearToSrgb(g) * 255;
      out[o + 2] = linearToSrgb(b) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ── the planet inset ────────────────────────────────────────────────────────────

export interface PlanetInsetOptions {
  field: TerrainField;
  calibration: Calibration;
  /** The parcel's own unit direction: `patch.centre`. */
  at: Vec3;
  size: number;
}

export interface PlanetInset {
  pixels: Uint8ClampedArray;
  /** Where the parcel sits, in the same rendered pixels. */
  marker: [number, number];
  /** The equator's row, in rendered pixels. It is a straight line under this projection. */
  equatorY: number;
  lat: number;
  lng: number;
}

/**
 * The view basis the inset projects through: three's own lookAt, which is what the landing globe
 * and preview-globe.ts both use.
 *
 * `right = up x view`. On this planet that puts EAST TO THE LEFT, because geo.ts sends latitude to
 * +Y and longitude to +Z from +X and that permutation is a reflection of the Earth convention;
 * measured on the shipped tangent frame, `east x north . outward = -1.000000`. The inset follows the
 * globe rather than the intuition, and a test pins it, because the alternative is an inset that is a
 * mirror of the planet the person clicked on to get here.
 *
 * The view is the parcel's own longitude taken to the equator, so the parcel is always on the
 * central meridian and can never be hidden behind the limb, and its height on the disk is the sine
 * of its latitude. That is what makes the marker's position mean something rather than sitting in
 * the middle of every parcel's inset.
 */
export function planetInsetBasis(at: Vec3): { view: Vec3; right: Vec3; up: Vec3 } {
  const up: Vec3 = [0, 1, 0];
  // The direction at the parcel's longitude, latitude zero. At a pole every longitude names the
  // same point, so any meridian will do and +X is taken.
  const flat = Math.hypot(at[0], at[2]);
  const view: Vec3 = flat > 1e-9 ? [at[0] / flat, 0, at[2] / flat] : [1, 0, 0];
  const right = normalise([
    up[1] * view[2] - up[2] * view[1],
    up[2] * view[0] - up[0] * view[2],
    up[0] * view[1] - up[1] * view[0],
  ]);
  return { view, right, up };
}

/**
 * The planet, orthographic, small.
 *
 * It samples the same three functions `buildGlobeGeometry` samples per vertex, in the same order and
 * out of the same table: `globeHeightAt`, then `biome` of that height with the field's own moisture
 * and temperature, then `BIOME_COLOUR_LINEAR`. Relief is not displaced, because at 3.1 km per pixel
 * the whole 2.7 km peak is under a pixel; what carries the shape is the sphere's own shading.
 * `linearToSrgb` runs once, at the byte, which is the trip DECISIONS C3 records preview-globe.ts
 * having to make for the same reason: there is no shader here to make it.
 */
export function paintPlanetInset(options: PlanetInsetOptions): PlanetInset {
  const { field, calibration, at, size } = options;
  const { view, right, up } = planetInsetBasis(at);
  // Over the reader's left shoulder, as preview-globe.ts lights the same planet.
  const light = normalise([
    view[0] * 0.82 + right[0] * -0.34 + up[0] * 0.38,
    view[1] * 0.82 + right[1] * -0.34 + up[1] * 0.38,
    view[2] * 0.82 + right[2] * -0.34 + up[2] * 0.38,
  ]);
  const ink = rgb(PALETTE.shadow).map(srgbToLinear) as [number, number, number];

  const pixels = new Uint8ClampedArray(size * size * 4);
  const half = size / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const sx = (i + 0.5 - half) / half;
      const sy = (half - j - 0.5) / half;
      const r2 = sx * sx + sy * sy;
      if (r2 > 1) continue; // off the limb: transparent, so the panel shows through
      const sz = Math.sqrt(1 - r2);
      const d: Vec3 = [
        right[0] * sx + up[0] * sy + view[0] * sz,
        right[1] * sx + up[1] * sy + view[1] * sz,
        right[2] * sx + up[2] * sy + view[2] * sz,
      ];
      const height = globeHeightAt(field, calibration, d);
      const colour = BIOME_COLOUR_LINEAR[biome(height, field.moisture(d), field.temperature(d))];
      // A sphere's normal is its own direction. The floor is the ink rather than zero.
      const lambert = Math.max(0, d[0] * light[0] + d[1] * light[1] + d[2] * light[2]);
      const t = INSET_AMBIENT + (1 - INSET_AMBIENT) * lambert;
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[o + c] = linearToSrgb(ink[c]! + (colour[c]! - ink[c]!) * t) * 255;
      }
      pixels[o + 3] = 255;
    }
  }

  const [lat, lng] = vec3ToLatLng(at[0], at[1], at[2]);
  const mx = at[0] * right[0] + at[1] * right[1] + at[2] * right[2];
  const my = at[0] * up[0] + at[1] * up[1] + at[2] * up[2];
  return {
    pixels,
    marker: [half + mx * half, half - my * half],
    equatorY: half,
    lat,
    lng,
  };
}

// ── the component ───────────────────────────────────────────────────────────────

interface Built {
  extentM: number;
  groundSrc: string;
  planetSrc: string;
  /** The deed line, as an SVG points list at DISPLAY scale. */
  parcel: string;
  planet: PlanetInset;
  /** The fog's own far distance, in display pixels: how much of this map you can actually see. */
  sightPx: number;
  /** What the build cost, milliseconds, so the header's numbers come off the shipping code. */
  groundMs: number;
  planetMs: number;
  encodeMs: number;
}

export interface MinimapProps {
  /**
   * The world, read fresh each frame rather than captured. WorldCanvas hands its host a new
   * PlanetWorld on every rebuild and null on unmount, and the mount that owns this holds it in a
   * ref, so a getter is the only shape that cannot go stale.
   */
  world: () => PlanetWorld | null;
}

export default function Minimap({ world }: MinimapProps) {
  const [built, setBuilt] = useState<Built | null>(null);
  // The getter behind a ref, so the frame loop below is started ONCE. The mount passes an inline
  // arrow, which is a new function on every one of its renders, and the mount re-renders whenever
  // the measure chain moves; a loop keyed on that identity would tear itself down and repaint both
  // images, 35 ms, every time a posterior arrived.
  const source = useRef(world);
  useEffect(() => {
    source.current = world;
  }, [world]);
  const marker = useRef<HTMLDivElement>(null);
  const arrow = useRef<SVGGElement>(null);
  const cone = useRef<SVGGElement>(null);
  const conePath = useRef<SVGPathElement>(null);
  const builtRef = useRef<Built | null>(null);
  const reduced = useRef(false);
  const [reducedState, setReducedState] = useState(false);

  // prefers-reduced-motion, in a ref because the frame loop reads it and must not be torn down and
  // rebuilt (which would drop the ground image) every time the setting changes.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (matches: boolean) => {
      reduced.current = matches;
      setReducedState(matches);
    };
    apply(query.matches);
    const listener = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let raf = 0;
    let shown: PlanetWorld | null = null;
    let player: PlayerLayer | null = null;
    // The host's camera and the tile size never change for the life of a world, so they are taken
    // once. That is what keeps the frame below off `world.context()`, which allocates.
    let camera: { fov: number; aspect: number } | null = null;
    let tileM = 1;
    let aspect = NaN;
    const stats = { frames: 0, totalMs: 0, buildMs: 0, groundMs: 0, planetMs: 0, encodeMs: 0, meanUpdateUs: 0 };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const live = source.current();
      if (!live || live.phase !== "ready") {
        // A world that went away or is rebuilding: drop the image rather than leave a map of a
        // parcel nobody is standing in any more.
        if (shown) {
          shown = null;
          player = null;
          camera = null;
          builtRef.current = null;
          setBuilt(null);
        }
        return;
      }
      if (live !== shown) {
        shown = live;
        const next = build(live);
        player = live.context().layer<PlayerLayer>("player") ?? null;
        camera = live.camera;
        tileM = live.frame.tileM;
        builtRef.current = next;
        stats.groundMs = next?.groundMs ?? 0;
        stats.planetMs = next?.planetMs ?? 0;
        stats.encodeMs = next?.encodeMs ?? 0;
        stats.buildMs = stats.groundMs + stats.planetMs + stats.encodeMs;
        aspect = NaN;
        setBuilt(next);
        return;
      }

      const map = builtRef.current;
      const node = marker.current;
      if (!map || !node || !player || !camera) return;
      const started = performance.now();

      const state = player.mover();
      const [px, py] = mapPixelOf(state.x * tileM, state.y * tileM, map.extentM, MAP_DISPLAY_PX);
      node.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;

      // Where the body is going, and where the lens is looking. `cameraForward` is imported rather
      // than restated: it is the same function the mover's input is resolved through, so the cone
      // cannot come to disagree with which way W walks.
      const [fx, fy] = cameraForward(player.camera().yaw);
      let bodyRad = arrowRotationRad(state.heading);
      let lensRad = arrowRotationRad(Math.atan2(fy, fx));
      if (reduced.current) {
        bodyRad = quantiseToCompass(bodyRad);
        lensRad = quantiseToCompass(lensRad);
      }
      arrow.current?.setAttribute("transform", `rotate(${deg(bodyRad)} ${MARKER_C} ${MARKER_C})`);
      cone.current?.setAttribute("transform", `rotate(${deg(lensRad)} ${MARKER_C} ${MARKER_C})`);

      // The cone is the camera's real horizontal field, so it changes with the viewport and with
      // nothing else. A float compare a frame; the path is rewritten only when a window is resized.
      if (camera.aspect !== aspect) {
        aspect = camera.aspect;
        conePath.current?.setAttribute("d", conePathFor(halfFovRad(camera.fov, aspect), map.sightPx));
      }

      stats.frames++;
      stats.totalMs += performance.now() - started;
      stats.meanUpdateUs = (stats.totalMs / stats.frames) * 1000;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __minimap?: unknown }).__minimap = stats;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scale = GLOBE_DISPLAY_PX / GLOBE_RENDER_PX;
  return (
    <div
      data-minimap={built ? "ready" : "building"}
      role="img"
      aria-label="Your parcel from above, north at the top, with the planet below it"
      className="panel pointer-events-none absolute right-6 top-[4.5rem] z-10 select-none p-2.5"
    >
      {/* data-minimap-map and data-minimap-marker are how tests/e2e/minimap.spec.ts finds the
          two boxes it measures the frame between. They carry no behaviour and they ship, because a
          hook that only exists in development tests a build nobody runs. */}
      <div
        data-minimap-map
        className="relative overflow-hidden rounded"
        style={{ width: MAP_DISPLAY_PX, height: MAP_DISPLAY_PX }}
      >
        {/* The ground the world uploaded. Scaled up crisp: the pixels are the register, not an
            artefact, and smoothing them would invent detail the vertices do not carry. */}
        {built ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={built.groundSrc}
            alt=""
            className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
          />
        ) : null}
        {/* The deed line, drawn as vector over pixel ground so the thing that is OWNED has a clean
            edge. Echo-violet, the colour ParcelInset already draws the same line in. */}
        <svg
          className="absolute inset-0"
          width={MAP_DISPLAY_PX}
          height={MAP_DISPLAY_PX}
          viewBox={`0 0 ${MAP_DISPLAY_PX} ${MAP_DISPLAY_PX}`}
          aria-hidden="true"
        >
          {built ? (
            <polygon
              points={built.parcel}
              fill="none"
              stroke={hex(PALETTE.echo)}
              strokeOpacity={0.75}
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
          ) : null}
        </svg>
        {/* You. Positioned by one transform a frame; everything inside is drawn once. */}
        <div ref={marker} data-minimap-marker className="absolute left-0 top-0" style={{ willChange: "transform" }}>
          <svg
            width={MARKER_PX}
            height={MARKER_PX}
            viewBox={`0 0 ${MARKER_PX} ${MARKER_PX}`}
            className="absolute"
            style={{ left: -MARKER_C, top: -MARKER_C }}
            aria-hidden="true"
          >
            {/* How far you can actually see: the fog's own far distance, to scale. Everything
                outside it is what the map knows and your eyes do not. */}
            <circle
              cx={MARKER_C}
              cy={MARKER_C}
              r={built?.sightPx ?? 0}
              fill="none"
              stroke={hex(PALETTE.parchment)}
              strokeOpacity={0.22}
              strokeWidth={1}
            />
            <g ref={cone}>
              <path ref={conePath} d="" fill={hex(PALETTE.parchment)} fillOpacity={0.13} />
            </g>
            <g ref={arrow} data-minimap-arrow>
              <polygon
                points={`${MARKER_C},${MARKER_C - 9.5} ${MARKER_C - 4.2},${MARKER_C + 2.4} ${MARKER_C},${MARKER_C + 0.4} ${MARKER_C + 4.2},${MARKER_C + 2.4}`}
                fill={hex(PALETTE.parchment)}
                fillOpacity={0.95}
                stroke={hex(PALETTE.shadow)}
                strokeOpacity={0.75}
                strokeWidth={0.7}
                strokeLinejoin="round"
              />
            </g>
            {/* Echo-violet, which marks a live human and is spent on nothing else. The ring
                breathes, and stops breathing under prefers-reduced-motion. */}
            <circle
              cx={MARKER_C}
              cy={MARKER_C}
              r={5.5}
              fill="none"
              stroke={hex(PALETTE.echo)}
              strokeWidth={1.2}
              className="animate-breathe motion-reduce:animate-none"
            />
            <circle cx={MARKER_C} cy={MARKER_C} r={2.4} fill={hex(PALETTE.echo)} />
          </svg>
        </div>
        {/* North, said out loud. The map does not turn, so this is a fact about the panel and not
            a readout; it is drawn with the same ink halo the beat line uses because it has to be
            legible over sand, over sea and over forest floor without a plate behind it. */}
        <span
          className="absolute left-1/2 top-1 -translate-x-1/2 font-pixel text-[9px] leading-none text-parchment/70"
          style={{ textShadow: "0 0 3px rgba(11,14,20,0.95), 0 1px 2px rgba(11,14,20,0.95)" }}
        >
          N
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="relative shrink-0" style={{ width: GLOBE_DISPLAY_PX, height: GLOBE_DISPLAY_PX }}>
          {built ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={built.planetSrc} alt="" className="absolute inset-0 h-full w-full" />
          ) : null}
          {built ? (
            <svg
              className="absolute inset-0"
              width={GLOBE_DISPLAY_PX}
              height={GLOBE_DISPLAY_PX}
              viewBox={`0 0 ${GLOBE_DISPLAY_PX} ${GLOBE_DISPLAY_PX}`}
              aria-hidden="true"
            >
              {/* The equator, which under this projection is a straight line, so latitude can be
                  read off the marker's height rather than guessed. */}
              <line
                x1={0}
                y1={built.planet.equatorY * scale}
                x2={GLOBE_DISPLAY_PX}
                y2={built.planet.equatorY * scale}
                stroke={hex(PALETTE.parchment)}
                strokeOpacity={0.16}
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
              <circle
                cx={built.planet.marker[0] * scale}
                cy={built.planet.marker[1] * scale}
                r={4}
                fill="none"
                stroke={hex(PALETTE.echo)}
                strokeWidth={1.4}
              />
              <circle
                cx={built.planet.marker[0] * scale}
                cy={built.planet.marker[1] * scale}
                r={1.2}
                fill={hex(PALETTE.echo)}
              />
            </svg>
          ) : null}
        </div>
        <div className="font-pixel text-[10px] leading-relaxed">
          <p className="text-parchment/75" data-minimap-coords>
            {built ? latLngLabel(built.planet.lat, built.planet.lng) : "Reading the ground"}
          </p>
          <p className="text-parchment/35">
            north up{built ? ` · ${((built.extentM * 2) / 1000).toFixed(1)} km across` : ""}
          </p>
          {/* Said only when it is true, and it is the one thing about this panel a person could
              otherwise mistake for a fault: the arrow stops turning smoothly. */}
          {reducedState ? <p className="text-parchment/25">reduced motion: heading to 8 points</p> : null}
        </div>
      </div>
    </div>
  );
}

// ── the build ───────────────────────────────────────────────────────────────────

/** The marker's own little canvas: big enough to hold the sight ring at the fog distance. */
const MARKER_PX = 56;
const MARKER_C = MARKER_PX / 2;

function build(world: PlanetWorld): Built | null {
  const ctx = world.context();
  const terrain = ctx.layer<TerrainLayer>("terrain");
  if (!terrain || terrain.chunks.length === 0) return null;

  const chunks: GroundSource[] = [];
  for (const mesh of terrain.chunks) {
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    const colours = mesh.geometry.getAttribute("color");
    if (!positions || !normals || !colours) continue;
    chunks.push({
      positions: positions.array as ArrayLike<number>,
      normals: normals.array as ArrayLike<number>,
      colours: colours.array as ArrayLike<number>,
    });
  }
  if (chunks.length === 0) return null;

  // The deed line's own membership test, taken from @echo/planet rather than written again here:
  // a k = 0 region IS the anchor cell, in the anchor cell's own tangent frame, and it is the same
  // polygon walkability is gated by one ring out.
  const deed = regionBound(ctx.region.cell, 0, ctx.radiusKm);
  const extentM = ctx.region.extentM;
  const groundStarted = performance.now();
  const ground = paintGroundMap(chunks, {
    size: MAP_RENDER_PX,
    extentM,
    insideParcel: (x, y) => deed.contains(x, y),
    water: waterSpecOf(terrain),
  });

  const groundMs = performance.now() - groundStarted;

  const planetStarted = performance.now();
  const planet = paintPlanetInset({
    field: ctx.field,
    calibration: ctx.calibration,
    at: ctx.frame.patch.centre,
    size: GLOBE_RENDER_PX,
  });
  const planetMs = performance.now() - planetStarted;

  // The outline, from the patch's own corners. They arrive in local metres, whose y runs NORTH, so
  // this is where the flip happens and nowhere else.
  const parcel = ctx.frame.patch.boundary
    .map(([east, north]) => mapPixelOf(east, -north, extentM, MAP_DISPLAY_PX).map((v) => v.toFixed(1)).join(","))
    .join(" ");

  const encodeStarted = performance.now();
  const groundSrc = toDataUrl(ground, MAP_RENDER_PX);
  const planetSrc = toDataUrl(planet.pixels, GLOBE_RENDER_PX);
  const encodeMs = performance.now() - encodeStarted;

  return {
    extentM,
    groundSrc,
    planetSrc,
    parcel,
    planet,
    encodeMs,
    sightPx: (sightRangeM(ctx.scene) / (2 * extentM)) * MAP_DISPLAY_PX,
    groundMs,
    planetMs,
  };
}

/**
 * The sea's colour and opacity, off the mesh the terrain layer built, or null where it built none.
 *
 * Read rather than restated. `WATER` is a constant inside terrainChunks.ts and is not exported, and
 * a second copy of it here is precisely the divergence this project keeps being bitten by: the map
 * would go on drawing last month's sea. THREE.Color converts on assignment under ColorManagement,
 * which is on by default in r169, so what comes back is already linear.
 */
function waterSpecOf(terrain: TerrainLayer): WaterSpec | null {
  const water = terrain.water;
  if (!water) return null;
  const material = water.material as unknown as {
    color?: { r: number; g: number; b: number };
    opacity?: number;
    transparent?: boolean;
  };
  if (!material?.color) return null;
  return {
    r: material.color.r,
    g: material.color.g,
    b: material.color.b,
    opacity: material.transparent ? (material.opacity ?? 1) : 1,
  };
}

/**
 * How far a person can see, metres: the fog's own far distance, read off whichever layer claimed
 * the air. A world without fog can see to the rim of the region.
 */
function sightRangeM(scene: { fog: unknown }): number {
  const fog = scene.fog as { far?: number } | null;
  return typeof fog?.far === "number" ? fog.far : 0;
}

// ── small arithmetic ────────────────────────────────────────────────────────────

/** Horizontal half angle of a three PerspectiveCamera, whose `fov` is the VERTICAL one. */
export function halfFovRad(verticalFovDeg: number, aspect: number): number {
  return Math.atan(Math.tan(((verticalFovDeg / 2) * Math.PI) / 180) * aspect);
}

/** The view cone as an SVG path, pointing north before it is rotated. */
export function conePathFor(halfAngleRad: number, radius: number): string {
  const p = (a: number) => `${(MARKER_C + radius * Math.sin(a)).toFixed(2)},${(MARKER_C - radius * Math.cos(a)).toFixed(2)}`;
  return `M ${MARKER_C},${MARKER_C} L ${p(-halfAngleRad)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${p(halfAngleRad)} Z`;
}

/**
 * A painted buffer as a data URL, once per build.
 *
 * AN IMAGE AND NOT A CANVAS, deliberately. This page has exactly ONE canvas and it is the WebGL
 * context PlanetWorld shares with the landing globe; `data-engine="three.js r169"` is on it and
 * every browser test on this route reaches for it by tag. Two more canvas elements in the corner
 * turned `locator("canvas")` into three elements and broke tests/e2e/slice.spec.ts outright, which
 * is a fair complaint about the DOM and not about the test: these two are pictures, they are painted
 * once and never drawn on again, and an <img> is what a picture is. Measured at 1.9 ms for the pair
 * on the demo cell, against the 27.5 ms of painting them.
 *
 * The buffer goes through the context's own ImageData rather than the constructor, because the
 * painters return plain typed arrays so that node can test them and `createImageData` is the one
 * path that takes those without a cast about which kind of ArrayBuffer they sit on.
 */
function toDataUrl(pixels: Uint8ClampedArray, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(size, size);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

const deg = (radians: number) => ((radians * 180) / Math.PI).toFixed(2);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

function normalise(v: readonly [number, number, number]): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** "1.86°S 2.67°E". Signed degrees read as a hemisphere, which is what a locator is for. */
export function latLngLabel(lat: number, lng: number): string {
  const ns = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}`;
  const ew = `${Math.abs(lng).toFixed(2)}°${lng < 0 ? "W" : "E"}`;
  return `${ns} ${ew}`;
}
