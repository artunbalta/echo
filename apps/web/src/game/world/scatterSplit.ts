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
 * AND THE IMPOSTOR IS BUILT NOW, which this header used to argue against. What it argued was true
 * of the frame it was measured on and false of the frame that actually breaks the budget, and the
 * correction is worth keeping rather than deleting, because it is a lesson about where a
 * measurement was taken. The old paragraph read, over twelve views AT THE SPAWN:
 *
 *   past each class's own `lod.farM`, which is the band the plan named    0 to 20.9%, 39,364 tri
 *   past the FOG, which is the band that is actually invisible            0 to 7.4%, 13,993 tri
 *
 * and concluded that fourteen to twenty-six thousand triangles was not worth a second geometry
 * path. AT THE SPAWN it still is not: DECISIONS C21 measured on the real GPU takes the parcel's
 * spawn frame from 496,615 to 470,655, 5.2%. FROM THE RIM the same band is half the frame: standing
 * 390 m out and looking back, 279,490 of the 576,774 instanced triangles in the cone stand past
 * their own `lod.farM`, and the whole frame goes 704,644 to 544,164, from over C16's ceiling to
 * under it. The band the old measurement called small is the same band; the camera it was measured
 * from was the one the split already works at.
 *
 * The other half of that paragraph stands and is now load bearing for a different reason. Three's
 * linear fog is `smoothstep(near, far, viewDepth)`, exactly 1 at and beyond `far`, and the sky
 * layer pins the fog colour to the dome's own horizon stop, so a prop past 420 m carries none of
 * its own colour. That is why the far band is nearly free to look at: measured on the shipped page
 * at seven stand points on the ordinary parcel, drawing it as cards rather than as full forms moves
 * 0 or 1 pixels of 1,024,000, because between the fog and the near forest standing in front of it
 * the whole band is invisible. scatterImpostor.ts has the numbers and the routes where it is not.
 *
 * The plan's own reading of the far band is still emptier than either, and this is still true.
 * `buttress-tree`, `canopy-palm`, `boulder`, `conifer`, `broadleaf` and `acacia` all carry `farM`
 * 900 while `spawnFalloff`'s `cutoffM` is 500, so from a camera anywhere near the spawn not one
 * instance of the six is ever past its own far distance, and even from the rim the furthest
 * instance on the disk is 890 m away. On the parcel that is 303,451 triangles, 35.9% of the
 * scatter, structurally outside any band those two constants can describe: C21 does not touch a
 * single tree on this route, and everything it buys it buys from the understorey.
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
 * Which visible buckets are inside a class's own far distance and which are past it (DECISIONS
 * C21). One sweep, two run lists, so the far band costs no second pass over the buckets.
 *
 * THE TEST IS ON THE BOX'S NEAREST POINT, and that is what makes the near field safe. A bucket goes
 * to the far list only when the closest point of its box is further than `farM` from the eye, and
 * the box already contains every instance's own bounding sphere, so every instance drawn as an
 * impostor is past `farM` by its whole radius. The other direction is deliberately loose: an
 * instance past `farM` sharing a bucket with something nearer is still drawn in full. That costs
 * triangles and can never cost a pixel, which is the only asymmetry a level of detail is allowed.
 *
 * `farM` of Infinity is the whole feature turned off: no bucket can be past it, `farCount` comes
 * back 0, and the near list is exactly what {@link visibleRuns} would have returned. That is how
 * the guards render the world with impostors and without in one session, on one machine.
 */
export function visibleRunsByRange(
  buckets: ScatterBuckets,
  planes: Float32Array,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  farM: number,
  nearRuns: Int32Array,
  farRuns: Int32Array,
): { nearCount: number; farCount: number } {
  const { box, start, length } = buckets;
  const n = start.length;
  const farSq = farM === Infinity ? Infinity : farM * farM;
  let nearCount = 0;
  let farCount = 0;
  let openNear = -1;
  let openFar = -1;
  let lastNear = -1;
  let lastFar = -1;
  const close = (runs: Int32Array, count: number, from: number, to: number) => {
    runs[count * 2] = start[from]!;
    runs[count * 2 + 1] = start[to]! + length[to]!;
    return count + 1;
  };
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
    let far = false;
    if (inside && farSq !== Infinity) {
      // The squared distance from the eye to the box: zero on any axis the eye is between the
      // faces of, which is the standard point-to-box and is exact rather than a corner test.
      const dx = eyeX < box[o]! ? box[o]! - eyeX : eyeX > box[o + 3]! ? eyeX - box[o + 3]! : 0;
      const dy = eyeY < box[o + 1]! ? box[o + 1]! - eyeY : eyeY > box[o + 4]! ? eyeY - box[o + 4]! : 0;
      const dz = eyeZ < box[o + 2]! ? box[o + 2]! - eyeZ : eyeZ > box[o + 5]! ? eyeZ - box[o + 5]! : 0;
      far = dx * dx + dy * dy + dz * dz > farSq;
    }
    const wantNear = inside && !far;
    const wantFar = inside && far;
    if (wantNear) {
      if (openNear < 0) openNear = b;
      lastNear = b;
    } else if (openNear >= 0) {
      nearCount = close(nearRuns, nearCount, openNear, lastNear);
      openNear = -1;
    }
    if (wantFar) {
      if (openFar < 0) openFar = b;
      lastFar = b;
    } else if (openFar >= 0) {
      farCount = close(farRuns, farCount, openFar, lastFar);
      openFar = -1;
    }
  }
  if (openNear >= 0) nearCount = close(nearRuns, nearCount, openNear, lastNear);
  if (openFar >= 0) farCount = close(farRuns, farCount, openFar, lastFar);
  return { nearCount, farCount };
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
