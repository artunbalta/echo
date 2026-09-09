/** Close-range forms reuse the scatter's exact placement and colliders.
 * Restore the main buffer before its next cull; partition only after that cull has completed.
 * Shadow and far-band buffers are never modified. No high-detail forest in the shadow pass.
 */
import * as THREE from 'three';
import type { WorldLayer } from './PlanetWorld';
import type { ScatterLayer } from './scatterLayer';
import { DETAIL_GEOMETRY, DETAIL_MATERIAL } from './scatterDetail';
export const DETAIL_DISTANCE_M = 34;
interface Pair { source: THREE.InstancedMesh; detail: THREE.InstancedMesh; saved: Float32Array; count: number; radius: number; transition: number; restoreMaterial: () => void }
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

/** Complementary screen-door coverage makes two opaque LODs dissolve without alpha sorting. */
function installDetailFade(material: THREE.Material, radius: number, transition: number, high: boolean): () => void {
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
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
      float detailFade = smoothstep(${(radius-transition).toFixed(2)}, ${(radius+transition).toFixed(2)}, vDetailRange);
      float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
      if (coverage ${high ? '<' : '>='} detailFade) discard;
    `);
  };
  material.customProgramCacheKey = () => `${cacheKey.call(material)}-detail-fade-${radius}-${high}`;
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
        const material = DETAIL_MATERIAL[id]!();
        // Slow branch/leaf sway, rooted in the same instance transform used for collision.
        if (['broadleaf','buttress-tree','conifer','acacia','fern','grass-tuft','bromeliad','reeds','canopy-palm','thicket','berry-bush'].includes(id)) {
          const height = Math.max(1, geometry.boundingSphere!.center.y * 2);
          const surfaceCompile = material.onBeforeCompile;
          material.onBeforeCompile = (shader, renderer) => {
            surfaceCompile.call(material, shader, renderer);
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
          material.customProgramCacheKey = () => `natural-surface-v1-foliage-${id}`;
        }
        const radius = ["broadleaf", "buttress-tree", "conifer", "acacia", "canopy-palm", "dead-tree"].includes(id)
          ? 180 : ["boulder", "shore-rock", "lichen-rock", "thicket", "berry-bush"].includes(id) ? 75 : DETAIL_DISTANCE_M;
        const transition = Math.max(3, radius * .08);
        const restoreMaterial = installDetailFade(source.material as THREE.Material, radius, transition, false);
        installDetailFade(material, radius, transition, true);
        const detail = new THREE.InstancedMesh(geometry, material, source.instanceMatrix.count);
        detail.name = `${source.name}:detail`; detail.count = 0;
        detail.receiveShadow = true; detail.castShadow = false;
        detail.boundingSphere = source.boundingSphere!.clone(); detail.boundingSphere.radius += 10;
        detail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        ctx.scene.add(detail);
        pairs.push({ source, detail, saved: new Float32Array(source.instanceMatrix.array.length), count: -1, radius, transition, restoreMaterial });
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
        const { near, far } = partitionDetail(pair.saved, pair.count, low, pair.detail.instanceMatrix.array as Float32Array, ctx.camera.position, pair.radius, pair.transition);
        pair.source.count = far; pair.detail.count = near;
        uploadPrefix(pair.source.instanceMatrix, far); uploadPrefix(pair.detail.instanceMatrix, near);
      }
    },
    dispose() {
      for (const { detail, restoreMaterial } of pairs) {
        restoreMaterial();
        detail.removeFromParent(); detail.geometry.dispose(); (detail.material as THREE.Material).dispose(); detail.dispose();
      }
      pairs.length = 0;
    },
  };
}
