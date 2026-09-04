/**
 * One low-poly form per asset class (plan W2-3, the renderer half of packages/planet assets.ts).
 *
 * assets.ts decides WHERE a thing stands and how big it is; this file decides what it looks like,
 * and the split is deliberate: the registry has to run on a server with no `three` in it, so no
 * mesh may ever leak into it.
 *
 * The art bible's rule for scatter is that the SILHOUETTE carries the read. Thirteen thousand ferns
 * at dusk are a texture, not thirteen thousand ferns, so nothing here has detail a player could
 * stop and count: a buttress-tree is a tapered trunk and two canopy blobs, a fern is three crossed
 * quads, a grass tuft is two. Every builder stays under sixty triangles, and most are under thirty,
 * because the whole class is drawn every frame in one instanced draw call and the triangle count is
 * the count times the instances.
 *
 * ONE GEOMETRY PER CLASS. A class is one InstancedMesh, so a form made of several pieces is merged
 * into a single non-indexed buffer here, and the pieces keep their own colours through a `color`
 * attribute rather than through separate materials. That is what lets a tree be brown at the bottom
 * and green at the top inside a single draw call.
 *
 * COLOUR SPACE. `new THREE.Color(hex)` reads the hex as sRGB and converts it to the renderer's
 * linear working space, which is what props3d.ts does for its material colours, so a fern and a
 * campfire agree. (The terrain's vertex colours are written raw by @echo/planet's scene builder and
 * so sit a shade brighter; that is its file's business, not this one's.)
 *
 * Colours come from PALETTE and nowhere else.
 */

import * as THREE from "three";
import type { AssetClassId } from "@echo/planet";

import { PALETTE } from "../three/palette";

// ── the merge ───────────────────────────────────────────────────────────────────

/** A sub-part of a form: a primitive, a colour, and where it sits in the class's local frame. */
interface Part {
  geometry: THREE.BufferGeometry;
  colour: number;
  /** Metres, in the class frame: x east, y up, z south, origin on the ground. */
  at?: readonly [number, number, number];
  /** Radians, XYZ Euler. */
  turn?: readonly [number, number, number];
  /** Non-uniform stretch applied before the turn. */
  stretch?: readonly [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Bake the parts into one non-indexed buffer with position, normal and colour.
 *
 * Non-indexed because the parts do not share vertices and because flat shading derives its normals
 * from screen-space derivatives anyway, so an index buffer would buy nothing but a second upload.
 * The source primitives are consumed: they are built fresh inside each class's builder and are
 * disposed here so nothing survives the merge holding a buffer.
 */
function merge(parts: readonly Part[]): THREE.BufferGeometry {
  const chunks: { position: Float32Array; normal: Float32Array; rgb: [number, number, number] }[] = [];
  let vertices = 0;

  for (const part of parts) {
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    _e.set(...(part.turn ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _t.set(...(part.at ?? [0, 0, 0]));
    _s.set(...(part.stretch ?? [1, 1, 1]));
    _m.compose(_t, _q, _s);
    // applyMatrix4 carries the normals through the normal matrix, so a stretched blob still lights
    // correctly rather than shading as if it were round.
    flat.applyMatrix4(_m);
    const position = flat.getAttribute("position").array as Float32Array;
    const normal = flat.getAttribute("normal").array as Float32Array;
    _c.set(part.colour);
    chunks.push({ position, normal, rgb: [_c.r, _c.g, _c.b] });
    vertices += position.length / 3;
    if (flat !== part.geometry) flat.dispose();
    part.geometry.dispose();
  }

  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const colour = new Float32Array(vertices * 3);
  let o = 0;
  for (const chunk of chunks) {
    position.set(chunk.position, o);
    normal.set(chunk.normal, o);
    for (let i = 0; i < chunk.position.length; i += 3) {
      colour[o + i] = chunk.rgb[0];
      colour[o + i + 1] = chunk.rgb[1];
      colour[o + i + 2] = chunk.rgb[2];
    }
    o += chunk.position.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// ── the primitives ──────────────────────────────────────────────────────────────

/** A tapered, open-ended tube: two triangles per side and no caps. Trunks and stems. */
const stem = (top: number, bottom: number, height: number, sides = 5) =>
  new THREE.CylinderGeometry(top, bottom, height, sides, 1, true);

/** An open cone: one triangle per side. Flares, shells, broken stubs. */
const flare = (radius: number, height: number, sides = 5) =>
  new THREE.ConeGeometry(radius, height, sides, 1, true);

/** Eight triangles of irregular mass. Canopy blobs, rocks, thicket clumps. */
const blob = () => new THREE.OctahedronGeometry(1, 0);

/** Four triangles: the cheapest thing that is still a solid. Small clumps, a flower head. */
const nub = () => new THREE.TetrahedronGeometry(1, 0);

/** Twenty triangles, for the one thing a player walks up to and looks at: a boulder. */
const stone = () => new THREE.IcosahedronGeometry(1, 0);

/** A standing card, w wide and h tall, its foot on the ground. Two triangles. */
const card = (w: number, h: number) => {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  return g;
};

/** A flat disc lying on the ground, `sides` triangles. Tidepools. */
const disc = (radius: number, sides = 8) => {
  const g = new THREE.CircleGeometry(radius, sides);
  g.rotateX(-Math.PI / 2);
  return g;
};

/**
 * `n` cards fanned about the upright axis, each leaning `tilt` radians away from vertical.
 *
 * The lean is baked into the card's own geometry before the yaw rather than passed as an Euler,
 * because Euler XYZ would apply the lean about the WORLD x axis and every leaf of a rosette would
 * fall the same way instead of splaying outward.
 *
 * A card at radius 0 is its own mirror image, so those fan over half a turn (three of them at 60°
 * is a fern seen from every side); a card pushed out to `radius` is not, so those take a full turn.
 */
function fan(n: number, w: number, h: number, tilt: number, y: number, colour: number, radius = 0): Part[] {
  const parts: Part[] = [];
  const sweep = radius > 0 ? Math.PI * 2 : Math.PI;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * sweep;
    const leaf = card(w, h);
    leaf.rotateX(tilt);
    parts.push({
      geometry: leaf,
      colour,
      at: [Math.sin(yaw) * radius, y, Math.cos(yaw) * radius],
      turn: [0, yaw, 0],
    });
  }
  return parts;
}

// ── the fifteen forms the demo cell calls for ───────────────────────────────────
//
// Heights are metres at scale 1; the placer multiplies each instance by its own scale, so these are
// the middle of each class's range, and the collider in assets.ts is what the numbers agree with
// (a buttress-tree's collider is 14 m tall, so the tree is).

const P = PALETTE;

/** The rainforest emergent: a flared trunk carrying its mass fourteen metres up. 31 triangles. */
const buttressTree = () =>
  merge([
    { geometry: flare(1.6, 3.2), colour: P.trunk, at: [0, 1.6, 0] },
    { geometry: stem(0.34, 0.85, 12.5), colour: P.trunk, at: [0, 7.4, 0] },
    { geometry: blob(), colour: P.leafDark, at: [-0.6, 12.6, 0.4], stretch: [3.6, 2.0, 3.4] },
    { geometry: blob(), colour: P.leaf, at: [1.0, 13.6, -0.5], stretch: [2.8, 1.7, 2.6] },
  ]);

/**
 * Curtains of leaf hanging off something unseen. Cards only, so it reads from any angle, and eight
 * triangles because there are two and a half thousand of them and none is ever looked at directly.
 */
const vineTangle = () => merge(fan(4, 0.9, 3.4, 0.06, 0.2, P.leafDark));

/** A trunk on its side, going back to soil, with moss along the top. 34 triangles. */
const fallenLog = () =>
  merge([
    { geometry: new THREE.CylinderGeometry(0.3, 0.36, 3.4, 6), colour: P.trunk, at: [0, 0.34, 0], turn: [0, 0, Math.PI / 2] },
    { geometry: flare(0.13, 0.9, 4), colour: P.trunk, at: [1.5, 0.6, 0.25], turn: [0, 0, -1.1] },
    { geometry: blob(), colour: P.bush, at: [-0.3, 0.6, 0], stretch: [1.1, 0.16, 0.3] },
  ]);

/** An epiphyte rosette with a single flower in it: the one flash of warm in the understorey. 16. */
const bromeliad = () =>
  merge([
    ...fan(6, 0.24, 0.85, 0.55, 0.05, P.leafLight, 0.06),
    { geometry: nub(), colour: P.flower, at: [0, 0.44, 0], stretch: [0.11, 0.17, 0.11] },
  ]);

/** A slim trunk and a crown of fronds, eleven metres up. 20 triangles. */
const canopyPalm = () =>
  merge([
    { geometry: stem(0.17, 0.3, 10.4), colour: P.trunk, at: [0, 5.2, 0] },
    ...fan(5, 0.55, 3.1, 1.15, 10.2, P.leaf, 0.2),
  ]);

/**
 * Understorey mass: three clumps, no stems, because at 120 m only the outline survives. The third
 * clump is a tetrahedron rather than a fourth pair of octahedra because there are nine thousand
 * thickets on this disk and they were the single largest line in the triangle count. 20 triangles.
 */
const thicket = () =>
  merge([
    { geometry: blob(), colour: P.bush, at: [0, 0.75, 0], stretch: [1.2, 0.85, 1.1] },
    { geometry: blob(), colour: P.leafDark, at: [0.7, 0.5, 0.35], stretch: [0.85, 0.6, 0.8] },
    { geometry: nub(), colour: P.bushDry, at: [-0.55, 0.4, -0.4], stretch: [0.8, 0.7, 0.85], turn: [0, 0.8, 0] },
  ]);

/** Three crossed quads. The single most numerous thing in the world, so it stays at six triangles. */
const fern = () => merge(fan(3, 1.15, 1.0, 0.12, 0, P.leaf));

/** Two crossed quads, four triangles, one dry and one green so a field of them is not one colour. */
const grassTuft = () =>
  merge([
    { geometry: card(0.6, 0.55), colour: P.grass, turn: [0.05, 0, 0] },
    { geometry: card(0.6, 0.5), colour: P.grassDry, turn: [0.05, Math.PI / 2, 0] },
  ]);

/** A stand of reeds at the waterline: tall, thin, leaning. 8 triangles. */
const reeds = () => merge(fan(4, 0.5, 2.0, 0.18, 0, P.bushDry, 0.12));

/** The one thing worth twenty triangles: a boulder is a landmark you navigate by. 28 total. */
const boulder = () =>
  merge([
    { geometry: stone(), colour: P.rock, at: [0, 0.78, 0], stretch: [1.25, 0.9, 1.05], turn: [0.12, 0.7, 0.08] },
    { geometry: blob(), colour: P.rockLight, at: [0.95, 0.3, 0.5], stretch: [0.55, 0.4, 0.5] },
  ]);

/** A wind ripple in the sand: two flattened ridges, almost ground. 16 triangles. */
const duneRipple = () =>
  merge([
    { geometry: blob(), colour: P.sand, at: [0, 0.07, 0], stretch: [2.4, 0.16, 0.55], turn: [0, 0.25, 0] },
    { geometry: blob(), colour: P.sandWet, at: [0.3, 0.05, 0.7], stretch: [1.6, 0.1, 0.35], turn: [0, 0.4, 0] },
  ]);

/** Bleached wood above the tideline, half buried, with one branch still on it. 28 triangles. */
const driftwood = () =>
  merge([
    { geometry: new THREE.CylinderGeometry(0.17, 0.22, 2.1, 5), colour: P.rope, at: [0, 0.2, 0], turn: [0, 0.3, Math.PI / 2 - 0.08] },
    { geometry: flare(0.09, 0.85, 4), colour: P.cloth, at: [0.85, 0.4, 0.2], turn: [0.3, 0, -0.9] },
  ]);

/** A shell, twenty centimetres of pale cone on its side. 14 triangles. */
const shell = () =>
  merge([
    { geometry: flare(0.11, 0.24, 6), colour: P.cloth, at: [0, 0.07, 0], turn: [Math.PI / 2 - 0.25, 0, 0] },
    { geometry: blob(), colour: P.sandWet, at: [0, 0.03, 0.06], stretch: [0.13, 0.03, 0.1] },
  ]);

/** Water caught in the rock at low tide, with a rim you can see over. 32 triangles. */
const tidepool = () =>
  merge([
    { geometry: disc(1.25), colour: P.seaShallow, at: [0, 0.04, 0] },
    { geometry: blob(), colour: P.rock, at: [1.1, 0.12, 0.35], stretch: [0.5, 0.28, 0.45] },
    { geometry: blob(), colour: P.rockLight, at: [-0.75, 0.1, -0.85], stretch: [0.45, 0.22, 0.4] },
    { geometry: blob(), colour: P.rock, at: [-0.35, 0.09, 1.05], stretch: [0.4, 0.2, 0.38] },
  ]);

/** Wet rock on the shoreline: three low lumps, never one. 24 triangles. */
const shoreRock = () =>
  merge([
    { geometry: blob(), colour: P.rock, at: [0, 0.3, 0], stretch: [0.8, 0.55, 0.7], turn: [0.1, 0.5, 0] },
    { geometry: blob(), colour: P.rockLight, at: [0.6, 0.18, 0.3], stretch: [0.45, 0.3, 0.42] },
    { geometry: blob(), colour: P.sandWet, at: [-0.5, 0.12, -0.35], stretch: [0.4, 0.18, 0.38] },
  ]);

// ── the tables the renderer reads ───────────────────────────────────────────────

/**
 * A builder per class id. Every call returns a FRESH geometry: the scatter layer builds one per
 * class and disposes it, and a shared instance would be freed out from under a second world.
 */
export const SCATTER_GEOMETRY: Record<AssetClassId, () => THREE.BufferGeometry> = {
  "buttress-tree": buttressTree,
  "vine-tangle": vineTangle,
  "fallen-log": fallenLog,
  bromeliad,
  "canopy-palm": canopyPalm,
  thicket,
  fern,
  "grass-tuft": grassTuft,
  reeds,
  boulder,
  "dune-ripple": duneRipple,
  driftwood,
  shell,
  tidepool,
  "shore-rock": shoreRock,
};

/**
 * Classes whose form is made of cards. A card is one-sided, so half of a fern would vanish as you
 * walked around it; these are drawn double-sided. Everything else is a closed solid and keeps
 * back-face culling, which is half the fragments for free.
 */
const CARDED = new Set<AssetClassId>(["vine-tangle", "bromeliad", "canopy-palm", "fern", "grass-tuft", "reeds", "tidepool"]);

/**
 * A material per class. Flat shading and no textures, per the bible: carved clay, not plastic.
 * `vertexColors` is what carries the per-part colour the merge baked in, so one class is still one
 * draw call however many colours its form uses.
 */
export const SCATTER_MATERIAL: Record<AssetClassId, () => THREE.MeshLambertMaterial> = {};
for (const id of Object.keys(SCATTER_GEOMETRY)) {
  const side = CARDED.has(id) ? THREE.DoubleSide : THREE.FrontSide;
  SCATTER_MATERIAL[id] = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side });
}

/** Does this class have a form? A registry class with no builder is drawn by nobody, loudly. */
export function hasScatterGeometry(id: AssetClassId): boolean {
  return typeof SCATTER_GEOMETRY[id] === "function";
}
