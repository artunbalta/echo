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
 * Colours come from PALETTE and nowhere else. Three of the eleven cold and stony forms need a
 * colour the palette has no entry for; they blend two entries rather than add a twelfth, which
 * `mix` below explains.
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

/**
 * Two palette entries blended, in the sRGB byte space the entries were chosen in.
 *
 * Three reads on this planet have no entry of their own: snow, a lichen crust, and a taiga green
 * colder than the rainforest's. The palette is a closed set and stays one, so rather than invent
 * three hexes each of those is a point BETWEEN two entries the bible already argued for, which is a
 * colour this world already contains. The blend is in sRGB and not in linear because that is the
 * space the paint chips were picked on the page in; `merge` converts the result exactly as it
 * converts a raw entry, so a blend and an entry still light identically.
 */
const mix = (a: number, b: number, t: number): number => {
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

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

/** A trunk on its side, going back to soil, with moss along the top. 36 triangles. */
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

/** Bleached wood above the tideline, half buried, with one branch still on it. 24 triangles. */
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

// ── the eleven the rest of the planet calls for ─────────────────────────────────
//
// The fifteen above are the classes the demo cell's rainforest and beach call for, and they were
// all that existed. Every other land biome placed instances and drew none: a taiga full of conifers
// with no conifer form is bare ground under the same sky, and snow was the worst of it, because all
// three of its classes were missing and it had nothing at all. These are those forms, so a cell is
// dressed by what grows there rather than by whether it happens to be the cell the demo picked.
//
// The four woody ones exist to be told apart at a hundred metres and nowhere nearer: conifer is a
// spire, broadleaf a wide low dome, acacia a flat plate on a bare stem, dead-tree a hole. That is
// the whole design; the triangles are spent on the outline and on nothing else.

/** The taiga's spire: a tapered trunk under two stacked cones closing to a point. 20 triangles. */
const conifer = () =>
  merge([
    { geometry: stem(0.14, 0.32, 3.4), colour: P.trunk, at: [0, 1.7, 0] },
    // Cones rather than blobs because the point at the top is the read: a stand of these is a
    // saw-tooth line against the dusk, where a stand of octahedra is a row of green balls.
    // The lower mass is `conifer`, a palette entry added for exactly this: a taiga painted in the
    // rainforest's own `leafDark` under the same western key reads as the same wood; the cold is
    // what says north. A cold green is not a palette entry and does not become one for this.
    { geometry: flare(1.35, 4.5, 5), colour: P.conifer, at: [0, 3.85, 0] },
    { geometry: flare(0.92, 4.1, 5), colour: P.leaf, at: [0, 6.95, 0] },
  ]);

/**
 * The deciduous wood: a short trunk swallowed by one dome broader than it is tall. 22 triangles.
 *
 * Deliberately the conifer's opposite, because forest gives both a weight and a mixed wood that is
 * one silhouette twice over is a texture, not a wood.
 */
const broadleaf = () =>
  merge([
    { geometry: stem(0.28, 0.46, 4.3), colour: P.trunk, at: [0, 2.15, 0] },
    { geometry: blob(), colour: P.leafDark, at: [0, 5.75, 0], stretch: [3.3, 2.05, 3.1] },
    { geometry: nub(), colour: P.leaf, at: [1.0, 6.7, -0.6], stretch: [1.7, 1.5, 1.6], turn: [0, 0.6, 0] },
  ]);

/**
 * The savanna's one landmark: a bare trunk that forks, then a single flat plate held above nothing.
 * 30 triangles, the most of the eleven, and worth it because at 900 per square kilometre this is
 * the only thing drawn on an otherwise empty horizon and there is nothing else for the eye to
 * measure the distance by.
 *
 * `rope` for the wood: the precedent is driftwood, and sun-bleached is sun-bleached.
 */
const acacia = () =>
  merge([
    { geometry: stem(0.22, 0.42, 3.5), colour: P.rope, at: [0, 1.75, 0] },
    { geometry: flare(0.13, 1.5, 4), colour: P.rope, at: [-0.45, 4.0, 0.15], turn: [0, 0, 0.5] },
    { geometry: flare(0.12, 1.4, 4), colour: P.rope, at: [0.5, 4.1, -0.2], turn: [0, 0, -0.55] },
    { geometry: blob(), colour: P.leafDark, at: [0, 5.5, 0], stretch: [3.2, 0.45, 2.8] },
    { geometry: nub(), colour: P.bushDry, at: [1.6, 5.35, 0.5], stretch: [1.3, 0.28, 1.1] },
  ]);

/**
 * A snag: two lengths of trunk and two broken limbs, no canopy anywhere. 22 triangles.
 *
 * The only form here with no mass on top, which is the point of it. Tundra and taiga get their
 * skyline from conifers, and a dead tree has to read as a gap in that line rather than as one more
 * shape on it, so nothing is allowed to close over the top. Four sides on both trunks instead of
 * five: with no canopy to hide behind it is the taper and the fork that carry it, not the round.
 */
const deadTree = () =>
  merge([
    { geometry: stem(0.24, 0.36, 2.2, 4), colour: P.trunk, at: [0, 1.1, 0] },
    { geometry: stem(0.08, 0.23, 2.9, 4), colour: P.rope, at: [0.06, 3.55, 0], turn: [0, 0, -0.04] },
    { geometry: flare(0.07, 0.95, 3), colour: P.rope, at: [0.42, 3.0, 0.1], turn: [0, 0, -0.95] },
    { geometry: flare(0.06, 0.75, 3), colour: P.rope, at: [-0.3, 4.05, -0.15], turn: [0.2, 0, 1.05] },
  ]);

/**
 * A knee-high clump with a few warm heads on it. 16 triangles.
 *
 * The cold biomes' answer to the bromeliad, and it earns its top-of-budget size the same way: the
 * heads are `flower`, the palette's single warm accent, and they are the only warm thing in a
 * forest or a tundra understorey. PALETTE has no red and does not get one for berries, because a
 * red would compete with `echo` for the eye and `echo` is sacred.
 */
const berryBush = () =>
  merge([
    { geometry: blob(), colour: P.bush, at: [0, 0.5, 0], stretch: [0.78, 0.5, 0.72] },
    { geometry: nub(), colour: P.leafLight, at: [0.3, 0.5, -0.22], stretch: [0.42, 0.34, 0.4] },
    { geometry: nub(), colour: P.flower, at: [-0.1, 1.02, 0.08], stretch: [0.16, 0.13, 0.15] },
  ]);

/**
 * Bare twig, more gap than substance. Three cards, six triangles.
 *
 * The one class defined by seeing THROUGH it, so it is cards and not a solid: a desert read through
 * a shrub is still a desert, and an opaque ball at three thousand two hundred per square kilometre
 * would close the ground off. One card in `rope` so the outer twigs catch the key and the clump
 * does not read as a single flat smudge.
 */
const deadShrub = () =>
  merge([
    { geometry: card(0.95, 0.72), colour: P.bushDry, turn: [0.1, 0, 0] },
    { geometry: card(0.86, 0.62), colour: P.bushDry, turn: [0.08, 1.05, 0] },
    { geometry: card(0.74, 0.55), colour: P.rope, turn: [0.1, 2.1, 0] },
  ]);

/**
 * One thick column and two arms turned up at the elbow. 28 triangles.
 *
 * The most recognisable outline in the table and the only class that has to survive on shape alone,
 * which is why the elbow is two pieces per arm rather than one leaning stick: the bend is what says
 * cactus. Five sides on the column because it is the one thing in a desert a player walks up to,
 * and a four-sided one is a box from close range. The tips take `bushDry` because that is where the
 * low western key lands first.
 */
const cactus = () =>
  merge([
    { geometry: stem(0.26, 0.32, 2.35), colour: P.leafDark, at: [0, 1.175, 0] },
    { geometry: stem(0.1, 0.12, 0.62, 3), colour: P.leafDark, at: [-0.3, 1.15, 0], turn: [0, 0, 1.15] },
    { geometry: flare(0.1, 0.62, 3), colour: P.bushDry, at: [-0.54, 1.7, 0], turn: [0, 0, 0.06] },
    { geometry: stem(0.09, 0.11, 0.5, 3), colour: P.leafDark, at: [0.28, 0.85, 0.05], turn: [0, 0, -1.2] },
    { geometry: flare(0.09, 0.5, 3), colour: P.bushDry, at: [0.48, 1.3, 0.05], turn: [0, 0, -0.05] },
  ]);

/**
 * Ground cover with no edge you could point at: two flattened tetrahedra, eight triangles.
 *
 * Nearer to ground colour than to an object, and the shortest near-LOD in the registry at sixty
 * metres, so there is nothing to spend triangles on. Tetrahedra rather than an octahedron because
 * the flat facets read as a skin over the soil where a stretched octahedron reads as a pillow.
 */
const mossPatch = () =>
  merge([
    { geometry: nub(), colour: P.bush, at: [0, 0.05, 0], stretch: [0.95, 0.1, 0.85] },
    { geometry: nub(), colour: P.leafLight, at: [0.14, 0.08, -0.1], stretch: [0.5, 0.09, 0.44], turn: [0, 0.9, 0] },
  ]);

/**
 * Two angular chips lying where they fell, no two the same size. Eight triangles.
 *
 * Two, not the three or four a slope of scree looks like, because the registry already clusters
 * this class six deep inside eight metres: what a player sees is twelve chips, and paying for them
 * twice would make the second densest class on the planet also one of the more expensive. The two
 * colours are what stop a cluster reading as one grey lump.
 */
const scree = () =>
  merge([
    { geometry: nub(), colour: P.rock, at: [0, 0.14, 0], stretch: [0.3, 0.16, 0.26], turn: [0.3, 0.5, 0.15] },
    { geometry: nub(), colour: P.rockLight, at: [0.34, 0.09, -0.2], stretch: [0.19, 0.1, 0.17], turn: [0.5, 1.7, 0.2] },
  ]);

/**
 * A low stone half sunk in the ground, read by the crust across its top rather than by its body.
 * The boulder's small cousin, twelve triangles against the boulder's twenty-eight.
 *
 * The crust is `rockLight` walked most of the way to `grassDry`. Lichen is the pale green-grey
 * between stone and dry grass and the palette has no entry for it, and it does not get one: two
 * entries blended is a colour this world already contains, a new hex is not.
 */
const lichenRock = () =>
  merge([
    { geometry: blob(), colour: P.rock, at: [0, 0.22, 0], stretch: [0.6, 0.33, 0.54], turn: [0.1, 0.6, 0.06] },
    { geometry: nub(), colour: P.lichen, at: [0.02, 0.44, 0.03], stretch: [0.34, 0.11, 0.3], turn: [0, 0.8, 0] },
  ]);

/**
 * A long wedge, steep on one flank and drawn out on the other. Sixteen triangles, dune-ripple's
 * exact sibling and built the same way, because the two do the same job in two biomes.
 *
 * SNOW IS TWO COLOURS, never one. A drift read in one value is a white blob with no form at all,
 * because the whole shape of a drift is the crest catching the key and the lee turning cold. This
 * first blended its own two values out of `cloth`, which is a built-things colour being used to
 * paint nature against the law at the top of palette.ts. `snowLit` and `snowShade` are now palette
 * entries, added because the palette simply had no word for snow: the island world never went
 * anywhere cold, and a form that needs a colour the palette lacks is a gap to fill, not a licence.
 *
 * What this form does NOT do is record a wind. The placer yaws every instance by a hash of its own
 * position, so a field of drifts faces every direction and no shared lee is available to build; the
 * asymmetry here is the drift's own, seen from whichever side the hash turned it to.
 */
const snowDrift = () =>
  merge([
    { geometry: blob(), colour: P.snowLit, at: [0, 0.17, 0], stretch: [1.9, 0.3, 0.72] },
    { geometry: blob(), colour: P.snowShade, at: [0.85, 0.09, 0.38], stretch: [1.35, 0.17, 0.5], turn: [0, 0.22, 0] },
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
  conifer,
  broadleaf,
  acacia,
  "dead-tree": deadTree,
  "berry-bush": berryBush,
  "dead-shrub": deadShrub,
  cactus,
  "moss-patch": mossPatch,
  scree,
  "lichen-rock": lichenRock,
  "snow-drift": snowDrift,
};

/**
 * Classes whose form is made of cards. A card is one-sided, so half of a fern would vanish as you
 * walked around it; these are drawn double-sided. Everything else is a closed solid and keeps
 * back-face culling, which is half the fragments for free.
 */
const CARDED = new Set<AssetClassId>(["vine-tangle", "bromeliad", "canopy-palm", "fern", "grass-tuft", "reeds", "tidepool", "dead-shrub"]);

/**
 * A material per class. Flat shading and no textures, per the bible: carved clay, not plastic.
 * `vertexColors` is what carries the per-part colour the merge baked in, so one class is still one
 * draw call however many colours its form uses.
 */
export const SCATTER_MATERIAL: Record<AssetClassId, () => THREE.MeshLambertMaterial> = {};
for (const id of Object.keys(SCATTER_GEOMETRY)) {
  const side = CARDED.has(id) ? THREE.DoubleSide : THREE.FrontSide;
  SCATTER_MATERIAL[id] = () => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, side });
    // Five narrow blades in each inexpensive card; a single taper read as a solid pyramid.
    if (id === "grass-tuft") {
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 vBladePosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBladePosition = position;');
        shader.fragmentShader = 'varying vec3 vBladePosition;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
          #include <clipping_planes_fragment>
          float across = (vBladePosition.x + vBladePosition.z + .3) / .12;
          float bladeTop = .38 + .17 * fract(sin(floor(across) * 13.7 + 1.) * 4375.);
          float height = vBladePosition.y / bladeTop;
          if (height > 1. || abs(fract(across) - .5) > .24 * (1. - height) + .025) discard;
        `);
      };
      material.customProgramCacheKey = () => 'distant-grass-blades-v2';
    }
    return material;
  };
}

/** Does this class have a form? A registry class with no builder is drawn by nobody, loudly. */
export function hasScatterGeometry(id: AssetClassId): boolean {
  // Object.hasOwn, not a typeof on the index. SCATTER_GEOMETRY is a plain object literal, so it
  // inherits Object.prototype, and `typeof SCATTER_GEOMETRY["toString"] === "function"` is true.
  // No shipped class is called toString, but ScatterLayerOptions.classes takes ids from a caller,
  // and the layer's stated guarantee that a class with no form is dropped loudly has to hold for
  // every id, not only for the ones the table happens to contain today.
  return Object.hasOwn(SCATTER_GEOMETRY, id);
}
