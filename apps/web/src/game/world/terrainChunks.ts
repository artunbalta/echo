/**
 * The terrain layer (contract W2-4): the ground, the sea, the fog and the dusk light.
 *
 * The ground is `buildRegionScene`, one mesh per H3 cell of the disk, straight from @echo/planet
 * with no conversion, because the builder already emits three's frame (x east, y up, z south).
 * Building it is about 150 ms of pure arithmetic and then seven uploads; the layer yields
 * to the event loop between the uploads so a React StrictMode unmount, which aborts the signal
 * during the build, stops it before the next mesh rather than after the last one.
 *
 * Height is visual only. Nothing here is read back into movement: the mover asks
 * `frame.walkableTile`, which is land or not, and this mesh could be flat without a single step
 * changing. What the mesh promises instead is that it is the SAME ground the globe showed, which is
 * true because `buildRegionScene` samples `sceneHeightAt`, the I1 function.
 *
 * The world is finite, and the art bible would rather it dissolved than ended. The disk is about
 * 4 km across at the founder resolution and the scatter dresses only the first 500 m, so fog
 * closes at 420 m: far enough to see a headland, near enough that the rim of the mesh and the
 * undressed middle distance are never in view. The sky is a flat dusk colour under it, until a
 * sky layer paints a gradient.
 *
 * Light, per the bible: one low western dusk key, a cool hemisphere fill, long soft ink shadows.
 * The host makes a provisional key light named "key"; this layer retunes it rather than adding a
 * second sun, and moves its shadow box with the camera so the 240 m of ground around the player is
 * always the part that gets shadows. A day-cycle layer that takes the light over later finds it
 * under the same name, and the fill under "fill".
 */

import * as THREE from "three";
import { buildRegionScene, type RegionScene } from "@echo/planet";

import { PALETTE } from "../three/palette";
import type { LayerContext, WorldLayer } from "./PlanetWorld";

export interface TerrainLayerOptions {
  /** Grid spacing in metres. Twelve is the builder's default: about 139k triangles for the demo disk. */
  resolution?: number;
  /** Where the fog begins to take the ground, and where it has taken all of it. Metres. */
  fogNearM?: number;
  fogFarM?: number;
  /** Half width of the box around the player that receives shadows. Metres. */
  shadowHalfM?: number;
  /** Shadow map side, texels. 2048 over a 240 m box is 12 cm per texel. */
  shadowMapSize?: number;
}

export interface TerrainLayer extends WorldLayer {
  readonly name: "terrain";
  /** The built region, for layers that read the chunks or the composition. Null until built. */
  readonly region: RegionScene | null;
  /** One mesh per chunk, in the region's cell order. */
  readonly chunks: readonly THREE.Mesh[];
  /** The sea, or null for a region with no water in it. */
  readonly water: THREE.Mesh | null;
}

/**
 * The sea, between the bible's #2680c6 and #1f5a8f. One flat colour: the depth bands the bible
 * asks for were measured and rejected on the island world (palette.ts explains), and this plane
 * is larger still, so they belong in a shader if they come at all.
 */
const WATER = 0x2374b0;

/** The direction the dusk key light shines FROM: the west, sixteen degrees up, a little south. */
const KEY_FROM = new THREE.Vector3(-1, 0.3, 0.22).normalize();
/** How far back along that direction the light sits from its target. Beyond the shadow box. */
const KEY_DISTANCE_M = 420;
/** The camera boom is 9 m back and 5.5 m up, so the target is about 12 m ahead of the lens. */
const CAMERA_TO_TARGET_M = 12;

/** A macrotask, so the browser can paint and an abort can land between two pieces of work. */
const yieldToLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function terrainLayer(options: TerrainLayerOptions = {}): TerrainLayer {
  const fogNear = options.fogNearM ?? 150;
  const fogFar = options.fogFarM ?? 420;
  const shadowHalf = options.shadowHalfM ?? 120;
  const shadowMapSize = options.shadowMapSize ?? 2048;

  let region: RegionScene | null = null;
  const chunks: THREE.Mesh[] = [];
  let water: THREE.Mesh | null = null;
  let ground: THREE.MeshLambertMaterial | null = null;
  let key: THREE.DirectionalLight | null = null;
  let scene: THREE.Scene | null = null;
  // The last whole metre the shadow box was centred on, so update() is a comparison most frames.
  let shadowX = NaN;
  let shadowZ = NaN;
  const tmp = new THREE.Vector3();
  const forward = new THREE.Vector3();

  const dispose = () => {
    for (const mesh of chunks) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    chunks.length = 0;
    ground?.dispose();
    ground = null;
    if (water) {
      water.removeFromParent();
      water.geometry.dispose();
      (water.material as THREE.Material).dispose();
      water = null;
    }
    // The key light is the host's; only its target, which this layer added, is ours to remove.
    key?.target.removeFromParent();
    key = null;
    scene = null;
    region = null;
    shadowX = NaN;
    shadowZ = NaN;
  };

  const build = async (ctx: LayerContext, signal: AbortSignal): Promise<void> => {
    scene = ctx.scene;
    // Let the frame that mounted the canvas paint before 150 ms of arithmetic blocks the thread.
    await yieldToLoop();
    if (signal.aborted) return;

    const built = buildRegionScene(ctx.region.cell, ctx.region.k, ctx.field, ctx.calibration, ctx.radiusKm, {
      ...(options.resolution !== undefined ? { resolution: options.resolution } : {}),
      heightScaleM: ctx.frame.heightScaleM,
    });
    if (signal.aborted) return;
    region = built;

    // Sky and fog first, so even the first chunk arrives into the right air. One colour for both,
    // so the far ground fades into the very colour behind it and the rim of the mesh has nowhere
    // to show. Halfway between the bible's dusk zenith and its horizon: the horizon is what a
    // flat background stands in for, but at full strength it is an orange wall.
    const sky = new THREE.Color(PALETTE.skyDusk).lerp(new THREE.Color(PALETTE.skyHorizon), 0.5);
    ctx.scene.background = sky;
    ctx.scene.fog = new THREE.Fog(sky, fogNear, fogFar);

    // Lighting is the host's key light, retuned, rather than a second light on top of it.
    tuneLights(ctx);

    // Flat shading, per the bible: carved clay. Vertex colours still interpolate, so the biome
    // blend along a boundary survives it; only the lighting is per facet.
    ground = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const chunk of built.chunks) {
      if (chunk.triangleCount === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(chunk.colours, 3));
      // The builder's sphere, so three never walks 40k vertices to find one it already knows.
      const [cx, cy, cz] = chunk.bounds.centre;
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), chunk.bounds.radius);
      const mesh = new THREE.Mesh(geometry, ground);
      mesh.name = `terrain:${chunk.cell}`;
      mesh.frustumCulled = true;
      mesh.receiveShadow = true;
      // A hill throws a long shadow at dusk; without this only the trees would. Seven extra
      // draws in the shadow pass, and the normal bias below keeps a flat beach from self-shadowing.
      mesh.castShadow = true;
      ctx.scene.add(mesh);
      chunks.push(mesh);
      // One chunk per macrotask: this is where an unmount during the build lands.
      await yieldToLoop();
      if (signal.aborted) {
        dispose();
        return;
      }
    }

    if (built.hasWater) {
      // The sea reaches past the fog in every direction, so the horizon over water is fog, not
      // an edge. Coplanar beach vertices (height exactly zero) fight this plane for depth, which
      // polygonOffset settles in the beach's favour without lifting either: the bible's waterline
      // is flush, and moving the geometry would open a lip along every shore.
      const size = (built.extentM + fogFar) * 2.5;
      const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshLambertMaterial({
        color: WATER,
        transparent: true,
        opacity: 0.86,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      water = new THREE.Mesh(geometry, material);
      water.name = "terrain:water";
      water.position.set(0, built.waterLevelY, 0);
      water.receiveShadow = true;
      ctx.scene.add(water);
    }
  };

  /**
   * The host's provisional lights, brought to the bible. The key is found by name so a scene
   * that already has one is not given two suns, and the hemisphere fill is the first one in the
   * scene or a new one. Shadows are on the renderer, which is shared with the globe; the flag is
   * harmless to a scene whose lights do not cast.
   */
  const tuneLights = (ctx: LayerContext) => {
    ctx.renderer.shadowMap.enabled = true;
    ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    let found = ctx.scene.getObjectByName("key") as THREE.DirectionalLight | undefined;
    if (!found || !(found as THREE.DirectionalLight).isDirectionalLight) {
      found = new THREE.DirectionalLight(PALETTE.dusk, 1);
      found.name = "key";
      ctx.scene.add(found);
    }
    key = found;
    key.color.set(PALETTE.dusk);
    key.intensity = 1.7;
    key.castShadow = true;
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const cam = key.shadow.camera;
    cam.left = -shadowHalf;
    cam.right = shadowHalf;
    cam.top = shadowHalf;
    cam.bottom = -shadowHalf;
    // Room along the light for the ground to rise and fall inside the box: the light sits 420 m
    // out, and a hill 300 m above the player 120 m toward the sun is still 30 m short of the near.
    cam.near = 1;
    cam.far = KEY_DISTANCE_M * 2.2;
    cam.updateProjectionMatrix();
    // Sixteen degrees of sun makes every up-facing triangle a grazing one; the normal bias moves
    // the sample along the surface normal so those do not shadow themselves in stripes.
    key.shadow.normalBias = 0.6;
    key.shadow.bias = -0.0002;
    // A directional light shines at its target, and the target only tracks when it is in the
    // scene graph. Moving both together keeps the direction fixed while the box follows the player.
    ctx.scene.add(key.target);
    placeKey(0, 0, 0);

    let fill = ctx.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as
      | THREE.HemisphereLight
      | undefined;
    if (!fill) {
      fill = new THREE.HemisphereLight(PALETTE.duskFill, PALETTE.shadow, 1);
      ctx.scene.add(fill);
    }
    fill.name = "fill";
    // Cool sky opposite the warm key; ink below, never black, so a shadowed slope still reads.
    fill.color.set(PALETTE.duskFill);
    fill.groundColor.set(PALETTE.shadow);
    fill.intensity = 0.9;
  };

  const placeKey = (x: number, y: number, z: number) => {
    if (!key) return;
    key.target.position.set(x, y, z);
    key.position.set(x + KEY_FROM.x * KEY_DISTANCE_M, y + KEY_FROM.y * KEY_DISTANCE_M, z + KEY_FROM.z * KEY_DISTANCE_M);
  };

  /**
   * Keep the shadow box on the ground the camera is looking at. The target is a fixed distance
   * ahead of the lens, snapped to whole metres: the box is 240 m wide and a texel is 12 cm, so
   * snapping stops the shadows swimming as the camera eases, and most frames change nothing.
   */
  const update = (_dt: number, ctx: LayerContext) => {
    if (!key) return;
    ctx.camera.getWorldDirection(forward);
    tmp.copy(ctx.camera.position).addScaledVector(forward, CAMERA_TO_TARGET_M);
    const x = Math.round(tmp.x);
    const z = Math.round(tmp.z);
    if (x === shadowX && z === shadowZ) return;
    shadowX = x;
    shadowZ = z;
    const [tx, ty] = ctx.frame.fromScene(tmp);
    placeKey(x, Math.max(0, ctx.frame.heightAtTile(tx, ty)), z);
  };

  return {
    name: "terrain",
    get region() {
      return region;
    },
    get chunks(): readonly THREE.Mesh[] {
      return chunks;
    },
    get water() {
      return water;
    },
    build,
    update,
    dispose,
  };
}
