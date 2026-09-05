/**
 * The spatial split (task A7): which instances a class submits this frame, and which it does not.
 *
 * WHY THIS IS NOT THE PLAN'S SPLIT. The plan asked for one InstancedMesh per class AND per cell,
 * so the seven chunks of the region would cull independently. Measured, that culls NOTHING: on
 * 8482589ffffffff all 64,010 instances fall inside the anchor chunk's own hexagon, because the
 * scatter is truncated at 500 m from the spawn by `spawnFalloff` and a resolution-4 hexagon on a
 * 200 km planet is wider than that, so seven meshes per class is one mesh per class. The projection
 * measured 99.7% of the parcel's triangles still drawn at the spawn and 97.6% of the demo's.
 *
 * WHAT DOES CULL IS A FINER GRID, and the cost of a finer grid in the plan's shape is draw calls.
 * Measured on the parcel at the spawn, main pass: a 250 m grid draws 62.9% of the triangles in 59
 * meshes, 125 m draws 38.2% in 142, 62.5 m draws 28.3% in 358 and 16 m draws 13.1% in 1,325. The
 * whole-frame ceiling is 120 draw calls, so the plan's shape runs out of budget between 250 m and
 * 125 m, before the shadow pass has taken its share, and it buys 37% of the triangles for it.
 *
 * SO THE GRID IS RESOLVED ON THE CPU INSTEAD OF IN THE SCENE GRAPH. The instances of one class are
 * sorted into buckets once, at build; every frame the buckets whose boxes meet the frustum are
 * copied, as whole contiguous runs, into the front of ONE InstancedMesh's instance buffer and
 * `count` is set to how many landed there. The split is therefore as fine as we like and still
 * costs exactly one draw call per class, which is what the layer already spent. The bucket grid is
 * a decision about WHICH MESH DRAWS AN INSTANCE and never about where an instance is: the matrices
 * copied are the matrices `placeAssets` produced, bit for bit, and `scatterSplit.test.mts` proves
 * the packed set is the placement.
 *
 * THE SHADOW PASS GETS ITS OWN MESH, and it has to. three uploads an InstancedMesh's matrix buffer
 * at most once per `render()` (`WebGLObjects.update` keys its cache on `info.render.frame`, and the
 * shadow pass and the main pass share that frame), so one buffer cannot hold two different sets in
 * one frame. It is also the pass that needs culling most: the key's shadow camera is a 240 m box
 * whose ground footprint at a 16 degree sun is 240 m by 240 / sin(16) = 871 m, and it was carrying
 * 695,118 of the parcel's 1,623,152 triangles. So a class that casts gets a second InstancedMesh,
 * packed against the shadow camera, which the main pass skips by drawing zero instances of it
 * (three's `renderInstances` returns before `gl.drawArraysInstanced` when the instance count is 0,
 * so a zero-count mesh is not a draw call and not a triangle). The main mesh in turn stops casting,
 * so neither pass ever sees the other's set and the draw-call total does not move.
 *
 * THE BOX, NOT THE SPHERE. A bucket of ferns 16 m across and 1.5 m tall has a bounding sphere of
 * radius 11.4 m, four fifths of which is air. The bucket bounds here are axis-aligned boxes over
 * the instances' own transformed geometry spheres, which is both tighter and, for a layer of props
 * lying on the ground, tighter in the direction that matters.
 *
 * AND THERE IS NO IMPOSTOR, which was the other half of the plan and is not built, on numbers.
 * Measured on the ordinary parcel over twelve views, main pass, against the split's own output:
 *
 *   past each class's own `lod.farM`, which is the band the plan named    0 to 20.9%, 39,364 tri
 *   past the FOG, which is the band that is actually invisible            0 to 7.4%, 13,993 tri
 *
 * The first band is nearly all fern and bromeliad, at 6 and 16 triangles an instance, so the very
 * best an impostor could return is about two thirds of it, 26,000 triangles, 4% of a 622,210
 * frame; and it returns nothing at all in the shadow pass, because neither class casts. The second
 * band is smaller still, and it is the one that could simply be deleted rather than impostored:
 * three's linear fog is `smoothstep(near, far, viewDepth)`, exactly 1 at and beyond `far`, and the
 * sky layer pins the fog colour to the dome's own horizon stop, so a prop past it carries none of
 * its own colour. That was not argued, it was rendered: removing the whole fog band and re-reading
 * the framebuffer moves 0 of 1,024,000 pixels at all twenty-four route-and-view pairs. Fourteen
 * thousand triangles is not worth a second geometry path, a transition to tune and a pop to
 * prevent, so neither band is built and the reason is here rather than in a ticket.
 *
 * The plan's own version of the far band is emptier than either. `buttress-tree`, `canopy-palm`,
 * `boulder`, `conifer`, `broadleaf` and `acacia` all carry `farM` 900 while `spawnFalloff`'s
 * `cutoffM` is 500, so from a camera anywhere near the spawn not one instance of the six is ever
 * past its own far distance: on the parcel that is 303,451 triangles, 35.9% of the scatter,
 * structurally outside any band those two constants can describe.
 */

import * as THREE from "three";

/** Six planes as (nx, ny, nz, constant), for a loop that allocates nothing. */
const PLANE_FLOATS = 24;

/**
 * Slack on every bucket box, metres. The boxes are accumulated in double precision and stored as
 * float32, which can round a bound inward by about 1e-4 m at these coordinates; a bound that
 * rounds inward is an instance that pops out at the edge of the screen. One millimetre is four
 * hundred times that rounding and one ten-thousandth of the smallest bucket, so it cannot make a
 * box loose enough to matter and cannot make one tight enough to clip.
 */
export const BOX_SLACK_M = 0.001;

/**
 * How far outside the shadow camera a caster is still packed, metres.
 *
 * PCFSoft samples the shadow map in a neighbourhood rather than at a point, so a caster just
 * outside the frustum can still darken a texel inside it. At the shipped 2048 map over a 240 m box
 * a texel is 117 mm and the filter reaches one texel, so anything past a few centimetres cannot
 * contribute. Half a metre is four texels of margin and 0.4% of the box's half width.
 */
export const SHADOW_PAD_M = 0.5;

export interface ScatterBuckets {
  /** Instance matrices in bucket order, 16 floats each. This is the source the packing copies FROM. */
  readonly matrices: Float32Array;
  /** Bucket b holds instances [start[b], start[b] + length[b]) of `matrices`. */
  readonly start: Int32Array;
  readonly length: Int32Array;
  /** Bucket b's world box as minX, minY, minZ, maxX, maxY, maxZ at box[b * 6]. */
  readonly box: Float32Array;
  /** How many instances in total, which is `Placement.byClass` for this class. */
  readonly instances: number;
  /** Grid step the buckets were cut on, metres. */
  readonly bucketM: number;
}

/**
 * Sort one class's instances into a grid and measure each bucket.
 *
 * `sphereCentre` and `sphereRadius` are the FORM's own bounding sphere in the class frame, so a
 * bucket's box is the union of the instances' transformed spheres and therefore contains every
 * triangle the renderer will draw from that bucket. Nothing here evaluates a height function or
 * moves an instance: it reads the matrices it is handed and writes them out in a different order.
 *
 * The order inside the grid is Morton (bit-interleaved) rather than row major, because the packing
 * copies RUNS of adjacent buckets and Morton keeps a square block of them contiguous while row
 * major keeps a strip. MEASURED, AND THE MEASUREMENT DOES NOT AGREE WITH THAT ARGUMENT, which is
 * why it is written down rather than assumed: at the two shipped spawns the visible buckets fall
 * into 66 runs in Morton order against 42 in row major on the parcel, and 82 against 116 on the
 * demo. It goes both ways and neither is worth anything, because a run is one `TypedArray.set` and
 * forty of them against eighty is nothing beside the 0.2 ms the box tests themselves take. Morton
 * stays because the run count it produces is bounded by locality rather than by how wide the
 * occupied region happens to be, and because a claim of a hundred runs either way changes no
 * number in this file's own header.
 */
export function bucketise(
  matrices: Float32Array,
  instances: number,
  sphereCentre: THREE.Vector3,
  sphereRadius: number,
  bucketM: number,
): ScatterBuckets {
  const cells = new Map<number, number[]>();
  // Morton over 16-bit unsigned grid indices. The scatter reaches 500 m from the spawn and the
  // region is 2 km, so an index is a few hundred at most and the 32768 offset cannot underflow.
  const morton = (i: number, j: number): number => {
    let x = (i + 32768) & 0xffff;
    let y = (j + 32768) & 0xffff;
    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;
    y = (y | (y << 8)) & 0x00ff00ff;
    y = (y | (y << 4)) & 0x0f0f0f0f;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;
    // The interleave is over unsigned 32-bit lanes; `>>> 0` keeps the key a positive number so the
    // sort below is numeric rather than a sign flip at the top bit.
    return ((x | (y << 1)) >>> 0) as number;
  };

  for (let i = 0; i < instances; i++) {
    const o = i * 16;
    const key = morton(Math.floor(matrices[o + 12]! / bucketM), Math.floor(matrices[o + 14]! / bucketM));
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  }

  const keys = [...cells.keys()].sort((a, b) => a - b);
  const out = new Float32Array(instances * 16);
  const start = new Int32Array(keys.length);
  const length = new Int32Array(keys.length);
  const box = new Float32Array(keys.length * 6);

  let written = 0;
  for (let b = 0; b < keys.length; b++) {
    const list = cells.get(keys[b]!)!;
    start[b] = written;
    length[b] = list.length;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const i of list) {
      const o = i * 16;
      out.set(matrices.subarray(o, o + 16), written * 16);
      written++;
      // The instance's own sphere: the form's sphere centre through the instance matrix, and its
      // radius through the matrix's scale. The scale is uniform (`scale.setScalar`) and a rotation
      // preserves a length, so column 0's length IS the scale.
      const s = Math.hypot(matrices[o]!, matrices[o + 1]!, matrices[o + 2]!);
      const cx =
        matrices[o]! * sphereCentre.x + matrices[o + 4]! * sphereCentre.y + matrices[o + 8]! * sphereCentre.z + matrices[o + 12]!;
      const cy =
        matrices[o + 1]! * sphereCentre.x + matrices[o + 5]! * sphereCentre.y + matrices[o + 9]! * sphereCentre.z + matrices[o + 13]!;
      const cz =
        matrices[o + 2]! * sphereCentre.x + matrices[o + 6]! * sphereCentre.y + matrices[o + 10]! * sphereCentre.z + matrices[o + 14]!;
      const r = s * sphereRadius;
      if (cx - r < minX) minX = cx - r;
      if (cy - r < minY) minY = cy - r;
      if (cz - r < minZ) minZ = cz - r;
      if (cx + r > maxX) maxX = cx + r;
      if (cy + r > maxY) maxY = cy + r;
      if (cz + r > maxZ) maxZ = cz + r;
    }
    box[b * 6] = minX - BOX_SLACK_M;
    box[b * 6 + 1] = minY - BOX_SLACK_M;
    box[b * 6 + 2] = minZ - BOX_SLACK_M;
    box[b * 6 + 3] = maxX + BOX_SLACK_M;
    box[b * 6 + 4] = maxY + BOX_SLACK_M;
    box[b * 6 + 5] = maxZ + BOX_SLACK_M;
  }

  return { matrices: out, start, length, box, instances, bucketM };
}

/**
 * Does a sphere meet these planes. The same test three's `Frustum.intersectsSphere` makes, written
 * against the flat plane array so the object-level check and the bucket checks share one frustum.
 */
export function frustumHas(planes: Float32Array, sphere: THREE.Sphere): boolean {
  const x = sphere.center.x;
  const y = sphere.center.y;
  const z = sphere.center.z;
  const negRadius = -sphere.radius;
  for (let i = 0; i < PLANE_FLOATS; i += 4) {
    if (planes[i]! * x + planes[i + 1]! * y + planes[i + 2]! * z + planes[i + 3]! < negRadius) return false;
  }
  return true;
}

/** The six frustum planes as a flat array, so the hot loop reads numbers and not objects. */
export function planesOf(frustum: THREE.Frustum, out: Float32Array, padM = 0): Float32Array {
  for (let i = 0; i < 6; i++) {
    const p = frustum.planes[i]!;
    out[i * 4] = p.normal.x;
    out[i * 4 + 1] = p.normal.y;
    out[i * 4 + 2] = p.normal.z;
    // A frustum plane's normal points INWARD and is unit length, so adding to the constant moves
    // the plane outward by exactly `padM` metres.
    out[i * 4 + 3] = p.constant + padM;
  }
  return out;
}

/**
 * Which buckets meet the frustum, as runs of adjacent bucket indices.
 *
 * Buckets are laid out back to back in `matrices`, so a run of adjacent visible buckets is one
 * contiguous slice of the source and one `TypedArray.set`. `runs` is filled with instance indices
 * in pairs, [first, last) per run, and the return value is how many pairs were written.
 *
 * The test is the p-vertex box test three's own `Frustum.intersectsBox` uses: for each inward
 * plane, the box corner furthest along the normal. It is conservative in the right direction, a
 * box straddling a corner of the frustum is kept, which is what a cull must be.
 */
export function visibleRuns(buckets: ScatterBuckets, planes: Float32Array, runs: Int32Array): number {
  const { box, start, length } = buckets;
  const n = start.length;
  let runCount = 0;
  let open = -1;
  for (let b = 0; b < n; b++) {
    const o = b * 6;
    let inside = true;
    for (let i = 0; i < PLANE_FLOATS; i += 4) {
      const nx = planes[i]!;
      const ny = planes[i + 1]!;
      const nz = planes[i + 2]!;
      const px = nx > 0 ? box[o + 3]! : box[o]!;
      const py = ny > 0 ? box[o + 4]! : box[o + 1]!;
      const pz = nz > 0 ? box[o + 5]! : box[o + 2]!;
      if (nx * px + ny * py + nz * pz + planes[i + 3]! < 0) {
        inside = false;
        break;
      }
    }
    if (inside) {
      if (open < 0) open = b;
    } else if (open >= 0) {
      runs[runCount * 2] = start[open]!;
      runs[runCount * 2 + 1] = start[b - 1]! + length[b - 1]!;
      runCount++;
      open = -1;
    }
  }
  if (open >= 0) {
    runs[runCount * 2] = start[open]!;
    runs[runCount * 2 + 1] = start[n - 1]! + length[n - 1]!;
    runCount++;
  }
  return runCount;
}

/**
 * Copy the visible runs into a mesh's instance buffer and set its count.
 *
 * `previous` is last frame's run list. When it matches, the buffer already holds exactly these
 * matrices and neither the copy nor the upload is repeated: a player standing still, which is
 * every screenshot and most of a session, costs the bucket tests and nothing else. The upload
 * range is the packed prefix rather than the whole buffer, so a frame that draws 7% of a class
 * uploads 7% of it and not 4 MB.
 */
export function packInto(
  mesh: THREE.InstancedMesh,
  buckets: ScatterBuckets,
  runs: Int32Array,
  runCount: number,
  previous: { runs: Int32Array; count: number },
): number {
  let same = previous.count === runCount;
  if (same) {
    for (let k = 0; k < runCount * 2; k++) {
      if (previous.runs[k] !== runs[k]) {
        same = false;
        break;
      }
    }
  }
  let instances = 0;
  for (let k = 0; k < runCount; k++) instances += runs[k * 2 + 1]! - runs[k * 2]!;
  if (same) {
    mesh.count = instances;
    return instances;
  }

  const dst = mesh.instanceMatrix.array as Float32Array;
  const src = buckets.matrices;
  let w = 0;
  for (let k = 0; k < runCount; k++) {
    const a = runs[k * 2]! * 16;
    const z = runs[k * 2 + 1]! * 16;
    dst.set(src.subarray(a, z), w);
    w += z - a;
  }
  mesh.count = w / 16;
  mesh.instanceMatrix.clearUpdateRanges();
  if (w > 0) {
    mesh.instanceMatrix.addUpdateRange(0, w);
    mesh.instanceMatrix.needsUpdate = true;
  }
  previous.runs.set(runs.subarray(0, runCount * 2));
  previous.count = runCount;
  return mesh.count;
}
