/** Rounded, close-range vegetation and rock forms. Positions, scale and colliders belong to
 * scatterLayer; detailLayer replaces only visible geometry and leaves distant/shadow forms light.
 * Parts merge into one geometry per asset class, preserving a single instanced draw per class.
 */
import * as THREE from "three";
import type { AssetClassId } from "@echo/planet";

import { PALETTE } from "../three/palette";

interface Part {
  geometry: THREE.BufferGeometry;
  colour: number;

  at?: readonly [number, number, number];

  turn?: readonly [number, number, number];

  stretch?: readonly [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

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

/**
 * Segment budget for the form being built right now: 1 is the close-range form, below 1 the mid
 * band. Every primitive below is formula-driven — `card` bends by its own y, `stone` displaces by
 * position — so a coarser segment count is the SAME SHAPE with fewer vertices, and none of the 26
 * builders has to know, or be edited to say, which band it is being built for.
 */
let COARSE = 1;

/** A segment count at the current budget, never below the floor that keeps a solid closed. */
const seg = (n: number, floor: number) => Math.max(floor, Math.round(n * COARSE));

/** Build at a reduced budget. Geometry construction is synchronous, so the knob cannot straddle. */
export function coarsened(quality: number, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  COARSE = quality;
  try {
    return make();
  } finally {
    COARSE = 1;
  }
}

const stem = (top: number, bottom: number, height: number, sides = 10) =>
  new THREE.CylinderGeometry(top, bottom, height, seg(sides, 3), 1, true);

const flare = (radius: number, height: number, sides = 5) =>
  new THREE.ConeGeometry(radius, height, seg(sides, 3), 1, true);

const blob = () => new THREE.SphereGeometry(1, seg(12, 4), seg(8, 3));

const nub = () => new THREE.SphereGeometry(1, seg(8, 4), seg(6, 3));

const stone = () => {
  const g = new THREE.IcosahedronGeometry(1, COARSE < 1 ? 1 : 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + .07 * Math.sin(x * 7 + y * 3) * Math.cos(z * 5);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  return g;
};

const card = (w: number, h: number) => {
  const g = new THREE.PlaneGeometry(w, h, seg(2, 1), seg(4, 2));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setXYZ(i, p.getX(i) * Math.sin(Math.PI * t) * (1 - t * .4), t * h, t * t * h * .22);
  }
  g.computeVertexNormals();
  return g;
};

const disc = (radius: number, sides = 8) => {
  const g = new THREE.CircleGeometry(radius, seg(sides, 4));
  g.rotateX(-Math.PI / 2);
  return g;
};

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

const mix = (a: number, b: number, t: number): number => {
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

const P = PALETTE;

const buttressTree = () =>
  merge([
    { geometry: flare(1.6, 3.2), colour: P.trunk, at: [0, 1.6, 0] },
    { geometry: stem(0.34, 0.85, 12.5), colour: P.trunk, at: [0, 7.4, 0] },
    { geometry: blob(), colour: P.leafDark, at: [-0.6, 12.6, 0.4], stretch: [3.6, 2.0, 3.4] },
    { geometry: blob(), colour: P.leaf, at: [1.0, 13.6, -0.5], stretch: [2.8, 1.7, 2.6] },
  ]);

const vineTangle = () => merge(fan(4, 0.9, 3.4, 0.06, 0.2, P.leafDark));

const fallenLog = () =>
  merge([
    { geometry: new THREE.CylinderGeometry(0.3, 0.36, 3.4, 6), colour: P.trunk, at: [0, 0.34, 0], turn: [0, 0, Math.PI / 2] },
    { geometry: flare(0.13, 0.9, 4), colour: P.trunk, at: [1.5, 0.6, 0.25], turn: [0, 0, -1.1] },
    { geometry: blob(), colour: P.bush, at: [-0.3, 0.6, 0], stretch: [1.1, 0.16, 0.3] },
  ]);

const bromeliad = () =>
  merge([
    ...fan(6, 0.24, 0.85, 0.55, 0.05, P.leafLight, 0.06),
    { geometry: nub(), colour: P.flower, at: [0, 0.44, 0], stretch: [0.11, 0.17, 0.11] },
  ]);

const canopyPalm = () =>
  merge([
    { geometry: stem(0.17, 0.3, 10.4), colour: P.trunk, at: [0, 5.2, 0] },
    ...fan(5, 0.55, 3.1, 1.15, 10.2, P.leaf, 0.2),
  ]);

const thicket = () =>
  merge([
    { geometry: blob(), colour: P.bush, at: [0, 0.75, 0], stretch: [1.2, 0.85, 1.1] },
    { geometry: blob(), colour: P.leafDark, at: [0.7, 0.5, 0.35], stretch: [0.85, 0.6, 0.8] },
    { geometry: nub(), colour: P.bushDry, at: [-0.55, 0.4, -0.4], stretch: [0.8, 0.7, 0.85], turn: [0, 0.8, 0] },
  ]);

const fern = () => {
  const points: number[] = [];
  for (let frond = 0; frond < 5; frond++) {
    const yaw = frond * Math.PI * 2 / 5;
    for (let leaf = 1; leaf <= 7; leaf++) {
      const t = leaf / 8, reach = t * .65, height = Math.sin(t * 1.9) * .7;
      const width = Math.sin(t * Math.PI) * .19;
      for (const side of [-1, 1]) for (const [x,y,z] of [[0,height,reach], [side*width,height-.045,reach-.04], [0,height+.05,reach+.075]]) {
        points.push(x!*Math.cos(yaw)-z!*Math.sin(yaw),y!,x!*Math.sin(yaw)+z!*Math.cos(yaw));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3)); geometry.computeVertexNormals();
  return merge([{geometry,colour:P.leaf}]);
};

const grassTuft = () =>
  merge([
    { geometry: card(0.6, 0.55), colour: P.grass, turn: [0.05, 0, 0] },
    { geometry: card(0.6, 0.5), colour: P.grassDry, turn: [0.05, Math.PI / 2, 0] },
    { geometry: stem(.012, .015, .5, 5), colour: P.grass, at: [.06, .25, 0] },
    ...Array.from({ length: 6 }, (_, i): Part => ({
      geometry: new THREE.SphereGeometry(1, 8, 4), colour: 0xf5efd9,
      at: [.06 + Math.cos(i * Math.PI / 3) * .064, .50, Math.sin(i * Math.PI / 3) * .064],
      stretch: [.054, .016, .044],
    })),
    { geometry: nub(), colour: 0xd9b54e, at: [.06, .52, 0], stretch: [.033, .022, .033] },
  ]);

const reeds = () => merge(fan(4, 0.5, 2.0, 0.18, 0, P.bushDry, 0.12));

const boulder = () =>
  merge([
    { geometry: stone(), colour: P.rock, at: [0, 0.78, 0], stretch: [1.25, 0.9, 1.05], turn: [0.12, 0.7, 0.08] },
    { geometry: blob(), colour: P.rockLight, at: [0.95, 0.3, 0.5], stretch: [0.55, 0.4, 0.5] },
  ]);

const duneRipple = () =>
  merge([
    { geometry: blob(), colour: P.sand, at: [0, 0.07, 0], stretch: [2.4, 0.16, 0.55], turn: [0, 0.25, 0] },
    { geometry: blob(), colour: P.sandWet, at: [0.3, 0.05, 0.7], stretch: [1.6, 0.1, 0.35], turn: [0, 0.4, 0] },
  ]);

const driftwood = () =>
  merge([
    { geometry: new THREE.CylinderGeometry(0.17, 0.22, 2.1, 5), colour: P.rope, at: [0, 0.2, 0], turn: [0, 0.3, Math.PI / 2 - 0.08] },
    { geometry: flare(0.09, 0.85, 4), colour: P.cloth, at: [0.85, 0.4, 0.2], turn: [0.3, 0, -0.9] },
  ]);

const shell = () =>
  merge([
    { geometry: flare(0.11, 0.24, 6), colour: P.cloth, at: [0, 0.07, 0], turn: [Math.PI / 2 - 0.25, 0, 0] },
    { geometry: blob(), colour: P.sandWet, at: [0, 0.03, 0.06], stretch: [0.13, 0.03, 0.1] },
  ]);

const tidepool = () =>
  merge([
    { geometry: disc(1.25), colour: P.seaShallow, at: [0, 0.04, 0] },
    { geometry: blob(), colour: P.rock, at: [1.1, 0.12, 0.35], stretch: [0.5, 0.28, 0.45] },
    { geometry: blob(), colour: P.rockLight, at: [-0.75, 0.1, -0.85], stretch: [0.45, 0.22, 0.4] },
    { geometry: blob(), colour: P.rock, at: [-0.35, 0.09, 1.05], stretch: [0.4, 0.2, 0.38] },
  ]);

const shoreRock = () =>
  merge([
    { geometry: blob(), colour: P.rock, at: [0, 0.3, 0], stretch: [0.8, 0.55, 0.7], turn: [0.1, 0.5, 0] },
    { geometry: blob(), colour: P.rockLight, at: [0.6, 0.18, 0.3], stretch: [0.45, 0.3, 0.42] },
    { geometry: blob(), colour: P.sandWet, at: [-0.5, 0.12, -0.35], stretch: [0.4, 0.18, 0.38] },
  ]);

const conifer = () => merge([
  { geometry: stem(.10, .32, 8.6), colour: P.trunk, at: [0, 4.3, 0] },
  ...Array.from({ length: 6 }, (_, level): Part => ({
    geometry: new THREE.ConeGeometry(1.45 - level * .19, 2.7 - level * .2, 12, 2),
    colour: level % 2 ? P.leaf : P.conifer, at: [Math.sin(level) * .12, 2.6 + level * 1.07, 0],
    turn: [0, level * .65, .035 * Math.sin(level)],
  })),
]);

const broadleaf = () =>
  merge([
    { geometry: stem(0.28, 0.46, 4.3), colour: P.trunk, at: [0, 2.15, 0] },
    ...Array.from({ length: 5 }, (_, i): Part => ({
      geometry: stem(.09, .23, 2.8), colour: P.trunk,
      at: [Math.sin(i*2.4)*.65, 3.8, Math.cos(i*2.4)*.65], turn: [Math.cos(i*2.4)*.65, 0, -Math.sin(i*2.4)*.65],
    })),
    ...Array.from({ length: 7 }, (_, i): Part => ({
      geometry: blob(), colour: i % 3 ? P.leaf : P.leafDark,
      at: [Math.sin(i*2.4)*1.7, 5.3 + (i % 3)*.6, Math.cos(i*2.4)*1.6], stretch: [1.8, 1.45, 1.7],
    })),
    { geometry: nub(), colour: P.leaf, at: [1.0, 6.7, -0.6], stretch: [1.7, 1.5, 1.6], turn: [0, 0.6, 0] },
  ]);

const acacia = () =>
  merge([
    { geometry: stem(0.22, 0.42, 3.5), colour: P.rope, at: [0, 1.75, 0] },
    { geometry: flare(0.13, 1.5, 4), colour: P.rope, at: [-0.45, 4.0, 0.15], turn: [0, 0, 0.5] },
    { geometry: flare(0.12, 1.4, 4), colour: P.rope, at: [0.5, 4.1, -0.2], turn: [0, 0, -0.55] },
    { geometry: blob(), colour: P.leafDark, at: [0, 5.5, 0], stretch: [3.2, 0.45, 2.8] },
    { geometry: nub(), colour: P.bushDry, at: [1.6, 5.35, 0.5], stretch: [1.3, 0.28, 1.1] },
  ]);

const deadTree = () =>
  merge([
    { geometry: stem(0.24, 0.36, 2.2, 4), colour: P.trunk, at: [0, 1.1, 0] },
    { geometry: stem(0.08, 0.23, 2.9, 4), colour: P.rope, at: [0.06, 3.55, 0], turn: [0, 0, -0.04] },
    { geometry: flare(0.07, 0.95, 3), colour: P.rope, at: [0.42, 3.0, 0.1], turn: [0, 0, -0.95] },
    { geometry: flare(0.06, 0.75, 3), colour: P.rope, at: [-0.3, 4.05, -0.15], turn: [0.2, 0, 1.05] },
  ]);

const berryBush = () =>
  merge([
    { geometry: blob(), colour: P.bush, at: [0, 0.5, 0], stretch: [0.78, 0.5, 0.72] },
    { geometry: nub(), colour: P.leafLight, at: [0.3, 0.5, -0.22], stretch: [0.42, 0.34, 0.4] },
    { geometry: nub(), colour: P.flower, at: [-0.1, 1.02, 0.08], stretch: [0.16, 0.13, 0.15] },
  ]);

const deadShrub = () =>
  merge([
    { geometry: card(0.95, 0.72), colour: P.bushDry, turn: [0.1, 0, 0] },
    { geometry: card(0.86, 0.62), colour: P.bushDry, turn: [0.08, 1.05, 0] },
    { geometry: card(0.74, 0.55), colour: P.rope, turn: [0.1, 2.1, 0] },
  ]);

const cactus = () =>
  merge([
    { geometry: stem(0.26, 0.32, 2.35), colour: P.leafDark, at: [0, 1.175, 0] },
    { geometry: stem(0.1, 0.12, 0.62, 3), colour: P.leafDark, at: [-0.3, 1.15, 0], turn: [0, 0, 1.15] },
    { geometry: flare(0.1, 0.62, 3), colour: P.bushDry, at: [-0.54, 1.7, 0], turn: [0, 0, 0.06] },
    { geometry: stem(0.09, 0.11, 0.5, 3), colour: P.leafDark, at: [0.28, 0.85, 0.05], turn: [0, 0, -1.2] },
    { geometry: flare(0.09, 0.5, 3), colour: P.bushDry, at: [0.48, 1.3, 0.05], turn: [0, 0, -0.05] },
  ]);

const mossPatch = () =>
  merge([
    { geometry: nub(), colour: P.bush, at: [0, 0.05, 0], stretch: [0.95, 0.1, 0.85] },
    { geometry: nub(), colour: P.leafLight, at: [0.14, 0.08, -0.1], stretch: [0.5, 0.09, 0.44], turn: [0, 0.9, 0] },
  ]);

const scree = () =>
  merge([
    { geometry: nub(), colour: P.rock, at: [0, 0.14, 0], stretch: [0.3, 0.16, 0.26], turn: [0.3, 0.5, 0.15] },
    { geometry: nub(), colour: P.rockLight, at: [0.34, 0.09, -0.2], stretch: [0.19, 0.1, 0.17], turn: [0.5, 1.7, 0.2] },
  ]);

const lichenRock = () =>
  merge([
    { geometry: blob(), colour: P.rock, at: [0, 0.22, 0], stretch: [0.6, 0.33, 0.54], turn: [0.1, 0.6, 0.06] },
    { geometry: nub(), colour: P.lichen, at: [0.02, 0.44, 0.03], stretch: [0.34, 0.11, 0.3], turn: [0, 0.8, 0] },
  ]);

const snowDrift = () =>
  merge([
    { geometry: blob(), colour: P.snowLit, at: [0, 0.17, 0], stretch: [1.9, 0.3, 0.72] },
    { geometry: blob(), colour: P.snowShade, at: [0.85, 0.09, 0.38], stretch: [1.35, 0.17, 0.5], turn: [0, 0.22, 0] },
  ]);

export const DETAIL_GEOMETRY: Record<AssetClassId, () => THREE.BufferGeometry> = {
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
 * The mid band: every detail form rebuilt at half its segment budget (DECISIONS C37).
 *
 * C36 measured the gap this fills — ordinary forms are 4-36 triangles and detail forms 38-1,376,
 * so `detailLayer` had nothing to draw between "as cheap as a distant impostor" and "as expensive
 * as arm's reach", and picked the expensive one for the whole 180 m. These are not new art: the
 * same 26 builders run against coarser primitives, which is why the mid form cannot drift from the
 * detail form it stands in for.
 */
export const MID_COARSENING = 0.5;

export const MID_GEOMETRY: Record<AssetClassId, () => THREE.BufferGeometry> = {};
for (const [id, build] of Object.entries(DETAIL_GEOMETRY)) {
  MID_GEOMETRY[id] = () => coarsened(MID_COARSENING, build);
}

const CARDED = new Set<AssetClassId>(["vine-tangle", "bromeliad", "canopy-palm", "fern", "grass-tuft", "reeds", "tidepool", "dead-shrub"]);

/** Local-space grain stays attached to a swaying branch, without image/UV seams. */
function naturalMaterial(side: THREE.Side): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, side });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vNaturalPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vNaturalPoint = position;');
    shader.fragmentShader = `
      varying vec3 vNaturalPoint;
      float naturalHash(vec3 p) {
        p = fract(p * .1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float naturalNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f*f*(3.-2.*f);
        return mix(mix(mix(naturalHash(i), naturalHash(i+vec3(1,0,0)), f.x),
                       mix(naturalHash(i+vec3(0,1,0)), naturalHash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(naturalHash(i+vec3(0,0,1)), naturalHash(i+vec3(1,0,1)), f.x),
                       mix(naturalHash(i+vec3(0,1,1)), naturalHash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float green = smoothstep(.015, .07, diffuseColor.g - diffuseColor.r);
      float bark = (1.-green) * smoothstep(.015, .07, diffuseColor.r - diffuseColor.b);
      vec3 grainPoint = vNaturalPoint * mix(vec3(7.), vec3(18., .7, 18.), bark);
      float grain = naturalNoise(grainPoint);
      float broadGrain = naturalNoise(vNaturalPoint * 1.8);
      // Suppress fine grain once a fragment covers several texels, avoiding distant shimmer.
      float filterGrain = 1.-smoothstep(.35, 1.5, length(fwidth(grainPoint)));
      diffuseColor.rgb *= .88 + .24*broadGrain + (grain-.5)*.3*filterGrain;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.93,1.04,.89), green*broadGrain*.45);
    `);
  };
  material.customProgramCacheKey = () => 'natural-surface-v1';
  return material;
}

export const DETAIL_MATERIAL: Record<AssetClassId, () => THREE.MeshLambertMaterial> = {};
for (const id of Object.keys(DETAIL_GEOMETRY)) {
  const side = CARDED.has(id) ? THREE.DoubleSide : THREE.FrontSide;
  DETAIL_MATERIAL[id] = () => naturalMaterial(side);
}

export function hasScatterGeometry(id: AssetClassId): boolean {
  return Object.hasOwn(DETAIL_GEOMETRY, id);
}
