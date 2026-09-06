/**
 * The terrain layer (contract W2-4): the ground, the sea, and the box the shadows fall in.
 *
 * The ground is `buildRegionScene`, one mesh per H3 cell of the disk, straight from @echo/planet
 * with no conversion, because the builder already emits three's frame (x east, y up, z south).
 * Building it is about 150 ms of pure arithmetic and then seven uploads; the layer yields
 * to the event loop between the uploads so a React StrictMode unmount, which aborts the signal
 * during the build, stops it before the next mesh rather than after the last one.
 *
 * WHAT THE BUILDER RETURNS IS NOT WHAT IS UPLOADED. `buildRegionScene` paints every vertex the flat
 * `BIOME_COLOUR` of its biome, which is a LABEL for what the ground is and was never a picture of
 * it; groundColour.ts rewrites that attribute in place, out of the palette, before the first
 * BufferAttribute is made. Positions, normals and triangles are the builder's untouched.
 *
 * AND THE GROUND HAS ONE MORE ATTRIBUTE AND ONE SHADER PATCH (task A28). The vertex lattice is 12 m
 * and 43% of the ground rays in a shipped frame land inside ten metres, so the floor a person is
 * standing on is one triangle with a Gouraud gradient across it and nothing groundColour.ts can
 * write reaches it. groundGrain.ts draws that band per fragment, off a three-byte per-vertex axis
 * saying which two palette materials this ground swings between, and it goes on the same
 * MeshLambertMaterial rather than a material of its own: everything else about the ground, the
 * shadow map, the fog, the two lights, the vertex colours, is three's and none of it is worth
 * reimplementing to add twelve hashes. Measured at 16 microseconds a frame on the ordinary parcel.
 *
 * Height is visual only. Nothing here is read back into movement: the mover asks
 * `frame.walkableTile`, which is land or not, and this mesh could be flat without a single step
 * changing. What the mesh promises instead is that it is the SAME ground the globe showed, which is
 * true because `buildRegionScene` samples `sceneHeightAt`, the I1 function.
 *
 * THE AIR IS NOT THIS LAYER'S ANY MORE. Sky, fog colour, and the colour and strength of the two
 * lights all belong to skyLayer.ts (W4-4), which owns them together because they are one thing: the
 * fog has to be the sky's own horizon colour or the rim of the disk shows, and the light has to be
 * the hour the sky is painting or the ground and the air disagree. Exactly one layer may own the
 * air, and it is that one. What is left here is the fallback below, which paints a static dusk when
 * nobody has claimed the air, so a world built without a sky layer still renders.
 *
 * The world is finite, and the art bible would rather it dissolved than ended. The disk is about
 * 4 km across at the founder resolution and the scatter dresses only the first 500 m, so fog
 * closes at 420 m: far enough to see a headland, near enough that the rim of the mesh and the
 * undressed middle distance are never in view. The sky layer keeps the same two distances.
 *
 * What IS still this layer's is the shadow BOX: the key light is found by name, given a 240 m
 * frustum and a 2048-square depth map, and that frustum is walked along with the camera so the
 * ground around the player is always the part that gets shadows. The sky layer decides which way
 * the light comes from and how hard it burns; this layer decides what it can see. The two meet at
 * `key.target`, which this layer moves and the sky layer aims from.
 */

import * as THREE from "three";
import { buildRegionScene, type RegionScene } from "@echo/planet";

import { PALETTE } from "../three/palette";
import { paintRegionGround } from "./groundColour";
import { patchGroundGrain } from "./groundGrain";
import { ALBEDO_FIX, KEY_DISTANCE_M } from "./skyLayer";
import type { LayerContext, WorldLayer } from "./PlanetWorld";

export interface TerrainLayerOptions {
  /** Where the fog begins to take the ground, and where it has taken all of it. Metres. */
  fogNearM?: number;
  fogFarM?: number;
  /**
   * Half width of the box around the player that receives shadows. Metres.
   *
   * IT DID NOT MOVE UNDER DECISIONS C1, which is a measurement rather than an oversight, and the
   * arithmetic behind it is asserted in tests/relief.test.mts rather than left in this paragraph.
   *
   * The box follows the player, so what has to fit is not the disk's relief but the relief inside
   * its own 240 m footprint, and the vertical budget is spent on three things at a 16.3 degree
   * sun: the along-light term, a fixed `half * sin(e)` of 33.7 m; the tallest form the scatter can
   * put in the box, 24.91 m of reach, worth 23.9 m; and the ground's own rise, worth `rise *
   * cos(e)`. At the worst rise measured over 2,400 box centres on 40 assignable parcels at the
   * shipped height, 58.5 m, that comes to 113.7 m of the 120 and leaves 6.3 m. The same
   * measurement at 900 gives 19.5 m of rise, 76.3 m used and 43.7 m spare, so the height scale ate
   * seven eighths of the margin and the box still holds.
   *
   * Measured live on both shipped routes rather than left at the worst case: nothing at all is
   * clipped, and the worst thing in the box sits at 68.6 m of the 120 on the ordinary parcel and
   * 65.6 m on the demo, against 68.9 and 66.6 before the height scale tripled. The headroom BARELY
   * MOVED there because the box rises with the ground under the player, so only the rise WITHIN
   * 240 m counts, and that is 13.6 m on a parcel whose whole height span is 328 m. Raising the
   * half would have cost a fifth of the shadow's sharpness on the mid-range laptop DECISIONS C16
   * names, to buy margin against a hill the measurement says is not there.
   */
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

/**
 * Where the key comes from WHEN THERE IS NO SKY LAYER: the bible's west, sixteen degrees up, a
 * little south. With a sky layer present this vector is never read, because the sky layer's dusk is
 * derived from this exact vector and it moves the light itself.
 */
const FALLBACK_KEY_FROM = new THREE.Vector3(-1, 0.3, 0.22).normalize();
/** The camera boom is 9 m back and 5.5 m up, so the target is about 12 m ahead of the lens. */
const CAMERA_TO_TARGET_M = 12;

/**
 * The shadow box's half width, exported so the test that checks it FITS reads the shipped number
 * rather than a copy of it. See TerrainLayerOptions.shadowHalfM for what it has to hold.
 */
export const DEFAULT_SHADOW_HALF_M = 120;

/**
 * The shadow map's side in texels, exported for the same reason the half width is: what a texel
 * covers on the ground is `2 * DEFAULT_SHADOW_HALF_M / DEFAULT_SHADOW_MAP_SIZE`, 117 mm as shipped,
 * and that length is what any margin around the shadow camera has to be measured in.
 */
export const DEFAULT_SHADOW_MAP_SIZE = 2048;

/** A macrotask, so the browser can paint and an abort can land between two pieces of work. */
const yieldToLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function terrainLayer(options: TerrainLayerOptions = {}): TerrainLayer {
  const fogNear = options.fogNearM ?? 150;
  const fogFar = options.fogFarM ?? 420;
  const shadowHalf = options.shadowHalfM ?? DEFAULT_SHADOW_HALF_M;
  const shadowMapSize = options.shadowMapSize ?? DEFAULT_SHADOW_MAP_SIZE;

  let region: RegionScene | null = null;
  const chunks: THREE.Mesh[] = [];
  let water: THREE.Mesh | null = null;
  let ground: THREE.MeshLambertMaterial | null = null;
  let key: THREE.DirectionalLight | null = null;
  let scene: THREE.Scene | null = null;
  // True only when no sky layer had claimed the air by the time this layer built. It is what turns
  // the static-dusk fallback on, and what it cleans up on the way out.
  let ownsAir = false;
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
    if (ownsAir && scene) {
      scene.background = null;
      scene.fog = null;
    }
    ownsAir = false;
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

    // Both dials come off the frame, never out of a local option. The host built its height
    // function from the same two, and the walking-scale displacement is defined on this very
    // lattice, so a mesh built on any other grid would be a surface `heightAtTile` does not
    // describe and every prop on it would float.
    const built = buildRegionScene(ctx.region.cell, ctx.region.k, ctx.field, ctx.calibration, ctx.radiusKm, {
      resolution: ctx.frame.resolutionM,
      heightScaleM: ctx.frame.heightScaleM,
    });
    if (signal.aborted) return;

    // The ground's own colour, over the biome paint and before anything is uploaded (task A10).
    //
    // HERE, rather than a chunk at a time inside the loop below, because the two signals the
    // recipes lean on hardest are not local: the distance to water is a transform over the whole
    // region, and a vertex's height against its own neighbourhood needs the neighbours, which live
    // in whichever chunk they live in. Painting per chunk would have to seam them.
    //
    // It is one blocking block of arithmetic, so it goes between the build and the first upload
    // where there is already an abort check on either side. Measured cold on a fresh process, which
    // is exactly how it is paid because a world is built once: 30 ms on the ordinary parcel and
    // 42 on the demo, against region builds of 193 and 199. It allocates about 7 MB of typed arrays
    // that are dead by the end of this line, so it is a step in a build and never a frame cost.
    const paint = paintRegionGround(built, ctx.seed);
    if (paint.strays > 0 || paint.unlabelled > 0) {
      // Neither can happen while the builder lays its lattice the way it says it does. Both are
      // silent if they do: the ground would simply be painted from the wrong cell, or left on the
      // table's flat colour, and both look like a build that worked.
      console.warn(
        `[terrain] ground colour: ${paint.strays} vertices off the lattice and ${paint.unlabelled} with no biome in the table`,
      );
    }
    if (signal.aborted) return;
    region = built;

    // The air, only if nobody owns it. A non-null background is the sky layer having already been
    // here (it builds first and sets one), so this is a fallback and never an override: a world
    // composed without a sky layer still gets a dusk it can be seen in, and a world with one is
    // left entirely alone. One flat colour for sky and fog together, so the far ground still fades
    // into the very colour behind it. Halfway between the bible's dusk zenith and its horizon,
    // because the horizon at full strength is the orange wall a playtester complained about.
    if (ctx.scene.background === null) {
      ownsAir = true;
      const sky = new THREE.Color(PALETTE.skyDusk).lerp(new THREE.Color(PALETTE.skyHorizon), 0.5);
      ctx.scene.background = sky;
      ctx.scene.fog = new THREE.Fog(sky, fogNear, fogFar);
    }

    // The shadow box, on the one key light, found by name rather than added to.
    tuneLights(ctx);

    // Flat shading, per the bible: carved clay. Vertex colours still interpolate, so the biome
    // blend along a boundary survives it; only the lighting is per facet.
    ground = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // The metre-scale grain (task A28). It is a patch on this material rather than a material of
    // its own because everything else about the ground - the shadow map, the fog, the two lights,
    // the vertex colours - is three's and none of it is worth reimplementing to add twelve hashes.
    // groundGrain.ts carries the derivation and the reason it multiplies rather than adds.
    patchGroundGrain(ground);
    let chunkIndex = -1;
    for (const chunk of built.chunks) {
      chunkIndex++;
      if (chunk.triangleCount === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(chunk.colours, 3));
      // Three normalised bytes a vertex: which two materials this ground swings between, and how
      // far apart they are. Zero on the sea floor, which is how the grain is masked without a
      // branch in the shader. 1.2 MB over the whole disk against the colour attribute's 4.8.
      geometry.setAttribute("grainAxis", new THREE.BufferAttribute(paint.grain[chunkIndex]!, 3, true));
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
   * The shadow box. The key is found by name so a scene that already has one is not given two suns,
   * and the hemisphere fill is the first one in the scene or a new one. Shadows are on the
   * renderer, which is shared with the globe; the flag is harmless to a scene whose lights do not
   * cast.
   *
   * COLOUR AND INTENSITY ARE NOT SET HERE unless this layer also took the air. The sky layer drives
   * both, hour by hour, and a second writer would fight it every frame.
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
    key.castShadow = true;
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const cam = key.shadow.camera;
    cam.left = -shadowHalf;
    cam.right = shadowHalf;
    cam.top = shadowHalf;
    cam.bottom = -shadowHalf;
    // Room along the light for the ground to rise and fall inside the box. The near is not the
    // binding constraint and never was: the key sits KEY_DISTANCE_M along its own axis, so ground
    // would have to rise 420 / sin(16) = 1,524 m above the box centre to reach it. Measured on
    // both routes at the shipped height scale, the nearest thing in the box is 253 m from the
    // light and the farthest 584 m, which is 252 m clear of the near and 340 m clear of the far.
    // The constraint that DOES bind is the box's vertical half; see shadowHalfM.
    cam.near = 1;
    cam.far = KEY_DISTANCE_M * 2.2;
    cam.updateProjectionMatrix();
    // Sixteen degrees of sun makes every up-facing triangle a grazing one; the normal bias moves
    // the sample along the surface normal so those do not shadow themselves in stripes.
    key.shadow.normalBias = 0.6;
    key.shadow.bias = -0.0002;
    // A directional light shines at its target, and the target only tracks when it is in the
    // scene graph. Moving both together keeps the direction fixed while the box follows the player.
    if (!key.target.parent) ctx.scene.add(key.target);
    placeKey(0, 0, 0);

    let fill = ctx.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as
      | THREE.HemisphereLight
      | undefined;
    if (!fill) {
      fill = new THREE.HemisphereLight(PALETTE.duskFill, PALETTE.shadow, 1);
      ctx.scene.add(fill);
    }
    fill.name = "fill";
    if (!ownsAir) return;
    // The fallback dusk, and only when this layer took the air. The bible's key and its cool sky
    // fill, through both corrections the sky layer's header records: the missing pi, because
    // intensity is no longer scaled by pi for you while MeshLambertMaterial still divides by it;
    // and ALBEDO_FIX, because the terrain's colour attribute stopped being read 3.7x too bright.
    // Imported rather than retyped, so the fallback hour cannot drift from the real one.
    key.color.set(PALETTE.dusk);
    key.intensity = 1.7 * Math.PI * ALBEDO_FIX;
    fill.color.set(PALETTE.duskFill);
    fill.groundColor.set(PALETTE.shadow);
    fill.intensity = 0.9 * Math.PI * ALBEDO_FIX;
  };

  /**
   * Move the shadow box. The TARGET is what this layer owns: it is the centre of the 240 m frustum
   * and it is what the sky layer aims the light from, so moving it moves the box without ever
   * touching the direction the light comes from. The light's own position is placed here only in
   * the fallback, when there is no sky layer to place it.
   */
  const placeKey = (x: number, y: number, z: number) => {
    if (!key) return;
    key.target.position.set(x, y, z);
    if (!ownsAir) return;
    key.position.set(
      x + FALLBACK_KEY_FROM.x * KEY_DISTANCE_M,
      y + FALLBACK_KEY_FROM.y * KEY_DISTANCE_M,
      z + FALLBACK_KEY_FROM.z * KEY_DISTANCE_M,
    );
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
