/** Streaming ground cover. Positions belong to the parcel seed; only visibility follows the eye.
 * One patch is prepared per frame. Wind and the player's wake are evaluated on the GPU.
 */
import * as THREE from 'three';
import { biomeAtLocal } from '@echo/planet';
import { hashStr } from '../three/palette';
import type { LayerContext, WorldLayer } from './PlanetWorld';
import type { PlayerLayer } from './playerLayer';
export const SIZE = 8, RADIUS = 3, BLADES = 1300;

/**
 * Where the fragment shader starts and finishes dissolving a blade, metres from the player.
 *
 * These are interpolated into the GLSL below rather than written into it, because the constant that
 * has to agree with them lives in TypeScript and could not read a float literal inside a template
 * string. `smoothstep(NEAR, FAR, d)` reaches exactly 1 at FAR and the noise it is compared against
 * is fract(...) in [0, 1), so at FAR every fragment of every blade discards: FAR is the distance
 * past which the meadow does not exist, not merely where it thins.
 */
export const MEADOW_FADE_NEAR_M = 17;
export const MEADOW_FADE_FAR_M = 24;

/** The exact smoothstep spliced into the fragment shader, so a test can read what the GPU gets. */
export const MEADOW_FADE_GLSL = `smoothstep(${MEADOW_FADE_NEAR_M.toFixed(1)}, ${MEADOW_FADE_FAR_M.toFixed(1)}, vMeadowDistance)`;

/**
 * How far from the player a blade is GUARANTEED to have been placed, metres.
 *
 * The ring is a square of (2 * RADIUS + 1) patches keyed off floor(player / SIZE), so the player
 * sits at some offset u in [0, SIZE) inside its own patch and the built span reaches
 * RADIUS * SIZE + u one way and (RADIUS + 1) * SIZE - u the other. The smaller of those, minimised
 * over u, is RADIUS * SIZE — at u = 0 and again as u -> SIZE. So this is the WORST case rather than
 * the typical one, and the worst case is what the shader's far stop has to be bounded against,
 * because the player walks through u = 0 constantly.
 *
 * IT IS ALREADY EXACTLY THE FAR STOP: 3 * 8 = 24 m against a 24 m fade. SOCIETY-PLAN SOC-1.B and
 * DECISIONS C23 both asked for the ring to be "pulled to the fade distance" for free triangles;
 * there is nothing to pull, and taking that instruction literally opens an 8 m annulus of missing
 * grass whose inner metre is before smoothstep has even started. meadowRing.test.mts fails on it.
 */
export const MEADOW_RING_M = RADIUS * SIZE;
const GREEN = new Set(['grassland', 'forest', 'rainforest', 'savanna', 'taiga', 'tundra']);
export function meadowSeed(seed: string, cell: string, x: number, z: number): number {
  return Math.floor(hashStr(`${seed}:${cell}:meadow:${x}:${z}`) * 0xffffffff) >>> 0;
}
export interface MeadowLayer extends WorldLayer {
  /** Drop every patch, to be grown again round the player: the ground under them has changed (C59). */
  regrow(): void;
}

export function meadowLayer(): MeadowLayer {
  const patches = new Map<string, THREE.InstancedMesh>();
  const time = { value: 0 }, player = { value: new THREE.Vector3(0, -1000, 0) };
  let geometry: THREE.BufferGeometry;
  let material: THREE.MeshLambertMaterial;
  const matrix = new THREE.Object3D(), colour = new THREE.Color();
  let context: LayerContext;
  const buildPatch = (gx: number, gz: number) => {
    const key = `${gx}:${gz}`;
    const cleared = context.layer<WorldLayer & { clears(x: number, y: number): boolean }>('home');
    let seed = meadowSeed(context.seed, context.region.cell, gx, gz);
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const mesh = new THREE.InstancedMesh(geometry, material, BLADES);
    mesh.name = `meadow:${key}`; mesh.count = 0;
    mesh.position.set(gx * SIZE, 0, gz * SIZE);
    // One biome sample per small patch: still no grass on beach, snow, desert or water.
    const kind = biomeAtLocal(context.frame.patch, context.field, context.calibration, (gx + .5) * SIZE, -(gz + .5) * SIZE);
    if (GREEN.has(kind)) {
      const dry = kind === 'savanna' || kind === 'tundra';
      for (let i = 0; i < BLADES; i++) {
        const x = random() * SIZE, z = random() * SIZE;
        const tx = (gx * SIZE + x) / context.frame.tileM, ty = (gz * SIZE + z) / context.frame.tileM;
        const y = context.frame.heightAtTile(tx, ty);
        if (y <= .03 || !context.frame.walkableTile(tx, ty)) continue;
        // No grass through the floor of a house of your own (C59), nor round its walls.
        if (cleared?.clears(gx * SIZE + x, -(gz * SIZE + z))) continue;
        matrix.position.set(x, y - .025, z);
        matrix.rotation.set(0, random() * Math.PI * 2, 0);
        matrix.scale.set(1. + random() * .7, .65 + random() * .8, 1);
        matrix.updateMatrix(); mesh.setMatrixAt(mesh.count, matrix.matrix);
        colour.setHSL(dry ? .19 + random() * .035 : .235 + random() * .04, .36 + random() * .2, .10 + random() * .09);
        mesh.setColorAt(mesh.count++, colour);
      }
    }
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    context.scene.add(mesh); patches.set(key, mesh);
  };
  /** Distance from the player to the nearest point of patch (gx, gz)'s SIZE-metre footprint. */
  const nearestM = (gx: number, gz: number) => {
    const dx = Math.max(gx * SIZE - player.value.x, 0, player.value.x - (gx + 1) * SIZE);
    const dz = Math.max(gz * SIZE - player.value.z, 0, player.value.z - (gz + 1) * SIZE);
    return Math.hypot(dx, dz);
  };
  return {
    name: 'meadow',
    async build(ctx) {
      context = ctx;
      geometry = new THREE.BufferGeometry();
      // Two curved tapering blades, three triangles each, rooted at y=0.
      const positions: number[] = [];
      for (const turn of [0, 1.8]) {
        const points = [[-.015,0,0],[.015,0,0],[-.012,.23,.04],[.012,.23,.04],[0,.48,.17]];
        for (const i of [0,1,2,1,3,2,2,3,4]) {
          const [x,y,z] = points[i]!;
          positions.push(x! * Math.cos(turn) - z! * Math.sin(turn), y!, x! * Math.sin(turn) + z! * Math.cos(turn));
        }
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
      material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uMeadowTime = time; shader.uniforms.uMeadowPlayer = player;
        shader.fragmentShader = 'varying float vMeadowDistance; varying float vBladeHeight;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
          #include <clipping_planes_fragment>
          float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
          if (noise < ${MEADOW_FADE_GLSL}) discard;
        `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(.45, 1.15, sqrt(max(0.,vBladeHeight)));');
        shader.vertexShader = 'varying float vMeadowDistance; varying float vBladeHeight; uniform float uMeadowTime; uniform vec3 uMeadowPlayer;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vec3 root = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
          vMeadowDistance = length(root.xz - uMeadowPlayer.xz);
          vBladeHeight = position.y / .48;
          float bend = position.y * position.y;
          transformed.x += sin(uMeadowTime * 1.8 + root.x * .33 + root.z * .21) * bend * .55;
          vec2 away = root.xz - uMeadowPlayer.xz;
          float wake = (1. - smoothstep(.15, 1.15, length(away))) * (1. - smoothstep(.4, 2., abs(root.y - uMeadowPlayer.y)));
          vec3 worldPush = vec3(normalize(away + vec2(.001)) * wake * bend * 3., 0.).xzy;
          transformed += transpose(mat3(modelMatrix * instanceMatrix)) * worldPush;
          transformed.y -= wake * position.y * .45;
        `);
      };
      material.customProgramCacheKey = () => `echo-meadow-v2:${MEADOW_FADE_NEAR_M}:${MEADOW_FADE_FAR_M}`;
      const at = ctx.region.spawnTile;
      buildPatch(Math.floor(at[0] * ctx.frame.tileM / SIZE), Math.floor(at[1] * ctx.frame.tileM / SIZE));
    },
    update(dt, ctx) {
      time.value += dt;
      const at = ctx.layer<PlayerLayer>('player')?.position();
      if (!at) return;
      ctx.frame.toScene(at.x, at.y, 0, player.value);
      const gx = Math.floor(player.value.x / SIZE), gz = Math.floor(player.value.z / SIZE);
      for (const [key, mesh] of patches) {
        if (Math.abs(mesh.position.x / SIZE - gx) > RADIUS || Math.abs(mesh.position.z / SIZE - gz) > RADIUS) {
          mesh.removeFromParent(); mesh.dispose(); patches.delete(key);
        }
      }
      // A SQUARE RING COVERING A DISC IS 42.3% SQUARE, AND THAT PART IS STRUCTURAL: RADIUS * SIZE is
      // already exactly MEADOW_FADE_FAR_M, so there is no ring to trim (SOC-1.B, corrected). What
      // there is, is the 4 to 10 patches of the 49 — mean 7.7, computed over the player's offset
      // inside its own patch — whose nearest corner is past the far stop right now, every fragment
      // of which the shader discards entire. They stay RESIDENT, because the offset changes as the
      // player walks and a rebuild is 1300 terrain samples, but they stop being submitted.
      for (const mesh of patches.values()) {
        mesh.visible = nearestM(mesh.position.x / SIZE, mesh.position.z / SIZE) <= MEADOW_FADE_FAR_M;
      }
      // Build from the feet outward; avoid allocating the entire ring during a turn or teleport.
      // Deliberately NOT gated on nearestM: a patch skipped here is a patch that must be built in a
      // later frame, one per frame, and the player reaches it before the builder does.
      for (let ring = 0; ring <= RADIUS; ring++) for (let x = -ring; x <= ring; x++) for (let z = -ring; z <= ring; z++) {
        if (!patches.has(`${gx+x}:${gz+z}`)) { buildPatch(gx+x, gz+z); return; }
      }
    },
    regrow() {
      for (const mesh of patches.values()) { mesh.removeFromParent(); mesh.dispose(); }
      patches.clear();
    },
    dispose() {
      for (const mesh of patches.values()) { mesh.removeFromParent(); mesh.dispose(); }
      patches.clear(); geometry?.dispose(); material?.dispose();
    },
  };
}
