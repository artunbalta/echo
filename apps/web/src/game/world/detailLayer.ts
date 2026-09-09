/** Close-range forms reuse the scatter's exact placement and colliders.
 * Restore the main buffer before its next cull; partition only after that cull has completed.
 * Shadow and far-band buffers are never modified. No high-detail forest in the shadow pass.
 */
import * as THREE from 'three';
import type { WorldLayer } from './PlanetWorld';
import type { ScatterLayer } from './scatterLayer';
import { DETAIL_GEOMETRY, DETAIL_MATERIAL, MID_BAND_INNER_M, MID_GEOMETRY } from './scatterDetail';
export const DETAIL_DISTANCE_M = 34;
/** One LOD boundary: the distance it sits at and the half-width of its screen-door dither. */
interface Edge { r: number; t: number }
interface Pair {
  source: THREE.InstancedMesh; detail: THREE.InstancedMesh; mid?: THREE.InstancedMesh;
  saved: Float32Array; count: number; outer: Edge; inner?: Edge; restoreMaterial: () => void;
}
/** Partition matrices without moving, scaling or reseeding a single asset. */
export function partitionDetail(source: Float32Array, count: number, low: Float32Array, high: Float32Array, eye: THREE.Vector3, radius = DETAIL_DISTANCE_M, transition = 0) {
  let near = 0, far = 0;
  for (let i = 0; i < count; i++) {
    const offset = i * 16;
    const dx = source[offset + 12]! - eye.x, dy = source[offset + 13]! - eye.y, dz = source[offset + 14]! - eye.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (distance < radius + transition) {
      const at = near++ * 16;
      for (let j = 0; j < 16; j++) high[at+j] = source[offset+j]!;
    }
    if (distance >= radius - transition) {
      const at = far++ * 16;
      for (let j = 0; j < 16; j++) low[at+j] = source[offset+j]!;
    }
  }
  return { near, far };
}

/**
 * The same, for a class that has a third form between the two.
 *
 * An instance lands in every band whose dither it is inside, which is how the crossfade works and
 * also what it costs: across a transition it is written to two buffers and DRAWN TWICE, once by
 * each neighbour, at the sum of their triangle counts. A second boundary therefore adds a second
 * double-drawn annulus, and any triangle claim that ignores it is counting a frame nobody renders.
 */
export function partitionDetailMid(
  source: Float32Array, count: number,
  near: Float32Array, mid: Float32Array, far: Float32Array,
  eye: THREE.Vector3, inner: Edge, outer: Edge,
) {
  let n = 0, m = 0, f = 0;
  for (let i = 0; i < count; i++) {
    const offset = i * 16;
    const dx = source[offset + 12]! - eye.x, dy = source[offset + 13]! - eye.y, dz = source[offset + 14]! - eye.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (distance < inner.r + inner.t) {
      const at = n++ * 16;
      for (let j = 0; j < 16; j++) near[at+j] = source[offset+j]!;
    }
    if (distance >= inner.r - inner.t && distance < outer.r + outer.t) {
      const at = m++ * 16;
      for (let j = 0; j < 16; j++) mid[at+j] = source[offset+j]!;
    }
    if (distance >= outer.r - outer.t) {
      const at = f++ * 16;
      for (let j = 0; j < 16; j++) far[at+j] = source[offset+j]!;
    }
  }
  return { near: n, mid: m, far: f };
}
/**
 * Whether two geometries are the same shape, to the byte.
 *
 * Positions only, and that is enough: two forms with identical vertex positions draw the same
 * silhouette and the same triangles, which is the whole question here. Colour differences would
 * matter for a fade and there are none — the duplicates are the same `merge` call.
 */
function sameForm(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const pa = a.getAttribute('position')?.array as Float32Array | undefined;
  const pb = b.getAttribute('position')?.array as Float32Array | undefined;
  if (!pa || !pb || pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return false;
  return true;
}

/**
 * Complementary screen-door coverage makes opaque LODs dissolve without alpha sorting.
 *
 * A form is described by the two edges it lives BETWEEN, either of which may be absent: the detail
 * form keeps everything up to `keepTo`, the ordinary form everything from `keepFrom`, and a mid form
 * has both. At one edge the nearer form discards where `coverage < fade` and the farther form where
 * `coverage >= fade`, so the two keep exactly complementary fragments and nothing is drawn twice or
 * left bare.
 *
 * BOTH EDGES BELONG TO THE KEY. The base cache key is the constant 'natural-surface-v1' for every
 * non-foliage class, so a program is picked by this suffix alone; three returns the FIRST program
 * whose key matches, and a mid material that collided with its own class's detail material would
 * silently draw with the detail form's fade — a forest drawn to the horizon, with nothing to catch
 * it. Keying on the band name and both edges makes the collision impossible rather than unlikely.
 */
export function installBandFade(material: THREE.Material, band: string, keepFrom: Edge | null, keepTo: Edge | null): () => void {
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  const smooth = (e: Edge) => `smoothstep(${(e.r - e.t).toFixed(2)}, ${(e.r + e.t).toFixed(2)}, vDetailRange)`;
  const clauses = [
    keepFrom ? `coverage >= ${smooth(keepFrom)}` : null,
    keepTo ? `coverage < ${smooth(keepTo)}` : null,
  ].filter(Boolean);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = 'varying float vDetailRange;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vDetailRange = length((modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz - cameraPosition);
    `);
    shader.fragmentShader = 'varying float vDetailRange;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
      if (${clauses.join(' || ')}) discard;
    `);
  };
  material.customProgramCacheKey = () => `${cacheKey.call(material)}-band-${band}-${keepFrom?.r ?? 'x'}-${keepTo?.r ?? 'x'}`;
  material.needsUpdate = true;
  return () => { material.onBeforeCompile = compile; material.customProgramCacheKey = cacheKey; material.needsUpdate = true; };
}

/**
 * Upload the prefix that will be DRAWN, never the whole class — scatterSplit's `packInto` idiom.
 *
 * `needsUpdate = true` with no update range means "send the whole array" (three's WebGLAttributes),
 * and this layer flagged three buffers that way every frame, so a class of 3.91 MiB of matrices was
 * re-sent 60 times a second to draw a few hundred of them. Measured over a 19-frame walk: 89.43 MiB
 * handed to the GPU to draw 7.73 MiB, 11.6x — and 99.3x standing perfectly still, because
 * `packInto`'s unchanged path writes nothing at all and the stale unranged flag re-sent everything
 * anyway.
 *
 * THE ZERO GUARD IS LOAD-BEARING and it sits BEFORE the clear, which is the opposite of `packInto`.
 * `packInto` owns its attribute; this layer does NOT own `pair.source`. Clearing a range `packInto`
 * has just added, while its version bump stands, leaves the attribute dirty with an EMPTY range
 * list — which is exactly the "send everything" case. That costs 0.74 MiB on the spawn frame, where
 * buttress-tree and canopy-palm both partition to far == 0. And it may not be replaced by an
 * unconditional `addUpdateRange(0, 0)` either: three passes the count through to `bufferSubData`,
 * where a length of 0 on that overload means "the remainder of the source".
 *
 * The unit is FLOATS, not instances and not bytes — sixteen per matrix, same as `packInto`.
 */
function uploadPrefix(attribute: THREE.InstancedBufferAttribute, instances: number) {
  if (instances === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, instances * 16);
  attribute.needsUpdate = true;
}

export function detailLayer(): WorldLayer {
  const pairs: Pair[] = [];
  const time = { value: 0 };
  return {
    name: 'detail',
    async build(ctx, signal) {
      const scatter = ctx.layer<ScatterLayer>('scatter');
      if (!scatter || signal.aborted) return;
      for (const [id, source] of scatter.meshes) {
        const geometry = DETAIL_GEOMETRY[id]!();
        // A CLASS WHOSE "DETAIL" FORM IS ITS ORDINARY FORM GETS NO PAIR AT ALL.
        //
        // `dead-tree` and `driftwood` are byte-identical between scatterDetail.ts and
        // scatterGeometry.ts — the same four `merge` entries, the same 22 and 24 triangles, the same
        // bounding box. Building a pair for them allocated a second InstancedMesh at the full class
        // count, compiled TWO extra shader variants (the screen-door crossfade, high and low),
        // partitioned every instance into it every frame, uploaded it, and drew it — to produce
        // EXACTLY THE SAME PIXELS. Worse than free: the crossfade also gets installed on the
        // ORDINARY mesh, so the pair dithers one form against itself.
        //
        // Found by deriving the detail band the way C22 derived the far band
        // (tests/detailBand.test.mts): both classes came back "the two forms are already within 2 px
        // at 10 m", which is not a marginal LOD, it is the same geometry twice. `dead-tree` is one of
        // the six classes on the 180 m band, so it was doing this for every dead tree in sight.
        //
        // Compared by BYTES rather than by a hardcoded list of ids, because a list is the thing that
        // goes stale the day someone gives dead-tree a real detail form and nobody edits the list.
        if (sameForm(geometry, source.geometry)) {
          geometry.dispose();
          continue;
        }
        const SWAYS = ['broadleaf','buttress-tree','conifer','acacia','fern','grass-tuft','bromeliad','reeds','canopy-palm','thicket','berry-bush'];
        // The sway is a property of the CLASS, not of the band, so every form of a swaying class has
        // to carry it. A mid form built without it would stand perfectly still among trees that move.
        const formMaterial = (height: number) => {
          const m = DETAIL_MATERIAL[id]!();
          if (!SWAYS.includes(id)) return m;
          const surfaceCompile = m.onBeforeCompile;
          m.onBeforeCompile = (shader, renderer) => {
            surfaceCompile.call(m, shader, renderer);
            shader.uniforms.uFoliageTime = time;
            shader.vertexShader = 'uniform float uFoliageTime;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
              #include <begin_vertex>
              float weight = pow(clamp(position.y / ${height.toFixed(3)}, 0., 1.), 2.);
              float phase = instanceMatrix[3].x * .13 + instanceMatrix[3].z * .17;
              transformed.x += sin(uFoliageTime * 1.1 + phase) * weight * .075;
              transformed.z += cos(uFoliageTime * .8 + phase) * weight * .045;
            `);
          };
          m.customProgramCacheKey = () => `natural-surface-v1-foliage-${id}`;
          return m;
        };
        const material = formMaterial(Math.max(1, geometry.boundingSphere!.center.y * 2));
        const radius = ["broadleaf", "buttress-tree", "conifer", "acacia", "canopy-palm", "dead-tree"].includes(id)
          ? 180 : ["boulder", "shore-rock", "lichen-rock", "thicket", "berry-bush"].includes(id) ? 75 : DETAIL_DISTANCE_M;
        // ONE PAIR OF EDGE CONSTANTS, SHARED BY EVERY FORM THAT MEETS AT THEM. Recomputing a
        // transition from each mesh's own radius is the obvious edit and it opens a see-through band
        // along the rim, because the two neighbours would smoothstep over different intervals and
        // their discards would stop being complementary.
        const outer: Edge = { r: radius, t: Math.max(3, radius * .08) };
        let inner: Edge | undefined;
        let mid: THREE.InstancedMesh | undefined;

        const innerM = MID_BAND_INNER_M[id];
        if (innerM !== undefined && innerM > 0 && innerM < radius) {
          const midGeometry = MID_GEOMETRY[id]!();
          const edge: Edge = { r: innerM, t: Math.max(3, innerM * .08) };
          // A mid form earns its mesh only if it is a form NEITHER neighbour already draws, and only
          // if its dither band clears the outer one — overlapping bands are not exclusive, so some
          // fragments would be discarded by all three meshes and some drawn by two.
          if (sameForm(midGeometry, geometry) || sameForm(midGeometry, source.geometry) || edge.r + edge.t > outer.r - outer.t) {
            midGeometry.dispose();
          } else {
            inner = edge;
            const midMaterial = formMaterial(Math.max(1, midGeometry.boundingSphere!.center.y * 2));
            installBandFade(midMaterial, 'mid', inner, outer);
            mid = new THREE.InstancedMesh(midGeometry, midMaterial, source.instanceMatrix.count);
            mid.name = `${source.name}:mid`; mid.count = 0;
            mid.receiveShadow = true; mid.castShadow = false;
            mid.boundingSphere = source.boundingSphere!.clone(); mid.boundingSphere.radius += 10;
            mid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            ctx.scene.add(mid);
          }
        }

        const restoreMaterial = installBandFade(source.material as THREE.Material, 'ordinary', outer, null);
        installBandFade(material, 'detail', null, inner ?? outer);
        const detail = new THREE.InstancedMesh(geometry, material, source.instanceMatrix.count);
        detail.name = `${source.name}:detail`; detail.count = 0;
        detail.receiveShadow = true; detail.castShadow = false;
        detail.boundingSphere = source.boundingSphere!.clone(); detail.boundingSphere.radius += 10;
        detail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        ctx.scene.add(detail);
        pairs.push({ source, detail, mid, saved: new Float32Array(source.instanceMatrix.array.length), count: -1, outer, inner, restoreMaterial });
      }
    },
    update(dt) {
      time.value += dt;
      for (const pair of pairs) if (pair.count >= 0) {
        (pair.source.instanceMatrix.array as Float32Array).set(pair.saved.subarray(0, pair.count * 16));
        pair.source.count = pair.count;
        // NO DIRTY FLAG HERE, and this is not a tidy-up. PlanetWorld runs every layer's `update`,
        // then every layer's `beforeRender`, then renders — nothing draws in between — and this
        // layer's own `beforeRender` always shortens `source.count` again and re-ranges that prefix,
        // so the full restored array is never what the GPU is asked for. Flagging it here would also
        // make the ranges below a no-op on a still frame, because the leftover unranged flag would
        // re-send the whole class anyway. Anyone reordering that frame loop owes this comment a look.
        pair.count = -1;
      }
    },
    beforeRender(ctx) {
      for (const pair of pairs) {
        const low = pair.source.instanceMatrix.array as Float32Array;
        pair.count = pair.source.count;
        pair.saved.set(low.subarray(0, pair.count * 16));
        if (pair.mid && pair.inner) {
          const { near, mid, far } = partitionDetailMid(
            pair.saved, pair.count,
            pair.detail.instanceMatrix.array as Float32Array,
            pair.mid.instanceMatrix.array as Float32Array,
            low, ctx.camera.position, pair.inner, pair.outer,
          );
          pair.source.count = far; pair.detail.count = near; pair.mid.count = mid;
          uploadPrefix(pair.source.instanceMatrix, far);
          uploadPrefix(pair.detail.instanceMatrix, near);
          uploadPrefix(pair.mid.instanceMatrix, mid);
        } else {
          const { near, far } = partitionDetail(pair.saved, pair.count, low, pair.detail.instanceMatrix.array as Float32Array, ctx.camera.position, pair.outer.r, pair.outer.t);
          pair.source.count = far; pair.detail.count = near;
          uploadPrefix(pair.source.instanceMatrix, far); uploadPrefix(pair.detail.instanceMatrix, near);
        }
      }
    },
    dispose() {
      for (const { detail, mid, restoreMaterial } of pairs) {
        restoreMaterial();
        for (const mesh of [detail, mid]) {
          if (!mesh) continue;
          mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose();
        }
      }
      pairs.length = 0;
    },
  };
}
