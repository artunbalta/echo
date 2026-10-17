/**
 * The planet on the registration screen (section 9), as plain three.js.
 *
 * Not react-three-fiber. R3F is a declared dependency of this app that nothing uses, and on this
 * React and Next pairing it throws reading ReactCurrentOwner before it renders a frame. Every other
 * 3D surface in ECHO is a plain three.js class mounted from a client component (see ThreeWorld), so
 * this follows that, and the whole file is imperative on purpose.
 *
 * What is drawn, and what is deliberately not. Terrain is one displaced icosphere coloured by biome
 * at every vertex. Parcels with owners are drawn from their own H3 boundaries and stand proud of
 * the surface, which is what makes owned land legible on a turning globe with no labels. All of
 * them are never drawn: the registry holds a million parcels at the floor and a browser cannot draw
 * a million hexagons. It draws the terrain, the parcels that have owners, and yours.
 *
 * The flight turns the planet and drops the camera, rather than flying a camera around a sphere.
 * That keeps the parcel dead centre the whole way, which is the shot worth watching, and it eases
 * out so the slow part is the last part, where the ground resolves.
 */

import { cellToParent, latLngToCell } from "h3-js";
import {
  buildGlobeGeometry,
  buildParcelMesh,
  buildParcelOutlines,
  cellCentre,
  createRegistryIndex,
  DEFAULT_GLOBE_OPTIONS,
  globeRadiusAt,
  landFractionOfCell,
  raycastGlobe,
  vec3ToLatLng,
  createTerrain,
  linearRgb,
  paintParcel,
  setParcelExtrusion,
  type Calibration,
  type TerrainField,
} from "@echo/planet";
import * as THREE from "three";

export interface PickedParcel {
  cell: string;
  lat: number;
  lng: number;
  /** The commons name when the point falls in one of the twelve, otherwise null. */
  commonsName: string | null;
  /**
   * A coarser cell containing the parcel, for marking it on a view of the whole planet.
   *
   * This exists because of a hard geometric fact rather than a preference. A parcel is 1.4 km
   * across on a planet 1,257 km around, so at any camera distance where one parcel is legible the
   * planet is no longer a sphere, and at any distance where the planet is a sphere one parcel is
   * under half a pixel. Both cannot be shown. So a click marks the REGION it landed in, about
   * 10 km across, and the card names the parcel. Marking the region and calling it the parcel would
   * be the dishonest version of the same compromise.
   */
  region: string;
  /** How much of this cell is dry land, 0 to 1, measured on a 49 point grid inside it. */
  landFraction: number;
  /**
   * Whether this cell can ever be given to anyone.
   *
   * Section 5.4: a cell holding less than minLandFraction land is never assigned to anybody and
   * stays on the globe as open water. Assignment is random, so without this rule somebody's only
   * land would be a rectangle of sea. The registry already filters on it, which is why nobody can
   * be given open water; this is here so the interface does not CALL open water a parcel.
   */
  assignable: boolean;
}

/**
 * A read handle on the drawn scene, out of the dev build only.
 *
 * It exists for one purpose: a guard that checks the pick has to raycast the mesh the GPU actually
 * drew, and it must reach that mesh without going anywhere near the pick's own arithmetic. A test
 * that asked this class where the pointer is would be asking the thing under test. Nothing in the
 * app reads it, and it is not in the production bundle.
 */
export interface PlanetGlobeProbe {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The group the terrain, the markers and the outlines hang off. Its transform is the spin. */
  planet: THREE.Group;
  host: HTMLElement;
}

export interface PlanetGlobeOptions {
  seed: string;
  seaLevel: number;
  peakElevation: number;
  reducedMotion: boolean;
  onArrived?: () => void;
  /**
   * Icosphere subdivisions for the terrain. 8 is 655,362 vertices, 0.88 km between them on a 200 km
   * planet, which is about three device pixels per triangle on a retina display at hero size. 7 is
   * a quarter of that and reads as faceted. Higher costs about 1.3 seconds of main thread to build,
   * once, which is why it is a knob and not a constant.
   */
  subdivisions?: number;
  /**
   * Slide the planet sideways, as a FRACTION of the visible half width, so copy can sit beside it.
   *
   * The camera keeps looking at the origin, and the PLANET moves. Moving the camera's target
   * instead re-centres the sphere in frame and the offset does nothing, which is the mistake this
   * comment exists to stop someone repeating. It eases back to zero during a flight, so a parcel
   * ends up in the middle of the frame and not behind the headline.
   */
  offsetX?: number;
  /**
   * Turn on pointing at the planet.
   *
   * Picking is arithmetic, as section 6.1 says: intersect the ray with the surface the globe
   * draws, convert the hit to lat/lng, ask H3 which cell that is. No GPU picking, no BVH, no per
   * parcel colliders, and nothing proportional to the size of the registry. What section 6.1
   * actually said was "a plain unit sphere", and that sentence was the bug: see raycastGlobe.
   *
   * The registry at round 1 is every cell at parcelResolution except the reserved commons, so the
   * lookup needs no set of ids at all. A mixed resolution registry, after the first subdivision,
   * needs createRegistryIndex and the walk up through cellToParent; that is the same function and
   * this is the cheap case of it.
   */
  picking?: {
    parcelResolution: number;
    commonsResolution: number;
    /** The section 5.4 threshold. A cell below it is water, not a parcel. */
    minLandFraction: number;
    /** Cell id to name, for the twelve. */
    commons: Record<string, string>;
    onHover?: (parcel: PickedParcel | null) => void;
    onSelect?: (parcel: PickedParcel) => void;
  };
}

const OWNED: [number, number, number] = [116, 92, 168];
const MINE: [number, number, number] = [244, 233, 208];
/** The globe's diameter as a fraction of the viewport height when it is just turning. */
const IDLE_FILL = 0.76;
/** The most of the viewport WIDTH the globe may take, so a tall narrow window does not crop it. */
const MAX_WIDTH_FILL = 0.86;
const FOV_DEGREES = 34;
// Nine kilometres above the ground. A resolution 4 parcel is 1.4 km across on a 200 km planet, so
// it lands at about a quarter of the frame with its neighbours still around it, which is the shot:
// your hexagon, in a place. Note what does NOT happen here, whatever section 9 hopes for: the
// GLOBE's terrain does not resolve. Its vertices are 1.9 km apart, so below about ten kilometres
// there is nothing left in that mesh to reveal. The terrain that resolves is the walkable scene,
// which is what the button opens, and stopping the descent here says so honestly rather than
// pushing the camera into a surface with no detail left in it.
const ARRIVED_DISTANCE = 1.06;

/**
 * How far the hover patch stands off the ground it names, as a fraction of the radius. 60 m.
 *
 * Derived from the mesh it has to beat, not chosen. The globe is a displaced icosphere at 8
 * subdivisions, and its flat triangles stand above the continuous surface the patch is sampled
 * from on 30.7% of the ground, by p90 31.1 m and p99 59.1 m over 141,700 measured samples. 60 m
 * puts the patch above the drawn triangles over 99% of the planet; on the last percent a ridge
 * stands in front of it and hides part of it, which is what a ridge in front of something is for.
 *
 * The cost of the lift is that the patch is seen from off to one side and so lands outward from
 * the middle of the disk: 0.0054 degrees a third of the way to the silhouette and 0.0522 at 0.95 of
 * the way, which on a 0.386 degree parcel is a seventieth and a seventh of one. The
 * assignedExtrusion this used to borrow costs 0.1074 and 1.0125 there, 0.28 and 2.62 parcels. It is
 * not zero because zero would let the drawn mesh tear through the patch.
 */
const MARKER_LIFT = 0.0003;

export class PlanetGlobe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.01, 100);
  private readonly planet = new THREE.Group();
  private readonly field: TerrainField;
  private readonly calibration: Calibration;

  private owned: THREE.Mesh | null = null;
  private villages: THREE.Points | null = null;
  private mine: THREE.Group | null = null;
  private frame = 0;
  private spin = 0;
  private flight = -1;
  private target: THREE.Quaternion | null = null;
  private announced = false;
  private arrivedDistance = ARRIVED_DISTANCE;
  /** Recomputed on every resize, because a fixed distance frames one viewport and crops the rest. */
  private idleDistance = 4.35;
  private idleOffsetX = 0;
  private observer: ResizeObserver | null = null;
  private disposed = false;
  private lastFrameAt = 0;
  private hover: THREE.Group | null = null;
  private hovered: string | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  /** Scratch for parcelAt, which runs on every pointer move and allocates nothing. */
  private readonly pickMatrix = new THREE.Matrix4();
  private readonly pickFrom = new THREE.Vector3();
  private readonly pickTo = new THREE.Vector3();
  private readonly depthForward = new THREE.Vector3();
  private readonly depthToPlanet = new THREE.Vector3();
  /** Land fraction by cell. Forty nine terrain samples each, so worth keeping, cheap to compute. */
  private readonly landCache = new Map<string, number>();

  constructor(
    private readonly host: HTMLElement,
    private readonly options: PlanetGlobeOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.scene.background = new THREE.Color("#101c19");
    this.scene.add(this.planet);
    this.camera.position.set(0, 0.22, this.idleDistance);

    // WHAT MOVED WHEN THE SEAM WAS FIXED, AND WHAT DELIBERATELY DID NOT (A11, DECISIONS C3).
    //
    // The globe reads the same colour buffer the walked world does, so its terrain albedo fell by
    // the same transfer. Measured over the planet's own pixels on the landing at 1280x800: mean
    // luma 96.16 -> 63.93, p50 100 -> 56, p95 153 -> 122.
    //
    // The key is NOT raised to put that back. 96.16 is the picture the audit called pale, high-key
    // and washed, and the correct albedo IS the improvement here: ocean darkens 4.63x while snow
    // darkens 1.08x, which is the sea-against-icecap separation the wrong buffer was flattening.
    // The walked world's exposure was re-derived to land back where it was because a place has to
    // read at a fixed hour; a hero image has no such anchor, so it keeps the contrast it gained.
    //
    // What is NOT acceptable is the bottom of the range: pixels under 8/255 went 0.02% -> 2.23% of
    // the planet, which is the unlit limb reaching black, and the bible bans black outright. The
    // rim is the one light aimed at that limb, so the rim is the one number that moves, 0.3 -> 1.2.
    // Swept in a live page rather than guessed: the rim buys the dark end almost for free (under-8
    // 2.23% -> 0.22% while the mean moves 63.93 -> 65.32), where reaching the same dark end on the
    // hemisphere costs 0.6 -> 1.6 and drags the whole planet to 73.48, back toward washed.
    //
    // The residual 0.22% is not lightable: at rim 2.6 it is still 0.15%, because those are the
    // antialiased silhouette pixels blending into the page's own #120c19 ground.
    this.scene.add(new THREE.HemisphereLight(0xcfc0e8, 0x241733, 0.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
    key.position.set(3, 2.4, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa06cd5, 1.2);
    rim.position.set(-4, -1, -2);
    this.scene.add(rim);

    this.field = createTerrain(options.seed);
    // landFraction is not used by any renderer path, so the calibration is complete for our needs
    // with the two values the manifest carries.
    this.calibration = { seaLevel: options.seaLevel, peakElevation: options.peakElevation, landFraction: 0.6 };

    if (process.env.NODE_ENV !== "production") {
      // __globeProbe, not __globe: GlobeCanvas already puts the whole instance on __globe for the
      // registration screen, and a guard that wants the DRAWN scene must not get the pick's own class.
      const probe = window as unknown as { __THREE?: typeof THREE; __globeProbe?: PlanetGlobeProbe };
      probe.__THREE = THREE;
      probe.__globeProbe = { scene: this.scene, camera: this.camera, planet: this.planet, host };
    }
    this.buildTerrain();
    if (options.picking) {
      host.style.cursor = "crosshair";
      host.addEventListener("pointermove", this.onPointerMove);
      host.addEventListener("pointerleave", this.onPointerLeave);
      host.addEventListener("click", this.onClick);
    }
    this.resize();
    window.addEventListener("resize", this.resize);
    // A window listener is not enough. The host is laid out by the page, so it can change size
    // without the window doing anything: a dvh unit settling, a sidebar, a font loading. Without
    // this the camera keeps an aspect ratio from before layout and the planet sits off to one side.
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
    }
    this.loop();
  }

  private buildTerrain(): void {
    const globe = buildGlobeGeometry(this.field, this.calibration, createRegistryIndex([]), {
      subdivisions: this.options.subdivisions ?? 8,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(globe.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(globe.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(globe.terrainColours, 3));
    geometry.setIndex(new THREE.BufferAttribute(globe.indices, 1));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    );
    // Named so a guard can find the ground the GPU drew without guessing which child is which.
    mesh.name = "globe:terrain";
    this.planet.add(mesh);
    // A translucent atmospheric limb gives the same airy daylight as the ground-level sky.
    // Terrain and parcel picking still use the original, shared spherical field.
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.065, 64, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: `varying vec3 vNormal; varying vec3 vEye;
        void main() { vec4 mv = modelViewMatrix * vec4(position,1.); vNormal = normalize(normalMatrix * normal); vEye = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vEye;
        void main() { float rim = pow(1.-abs(dot(normalize(vNormal),normalize(vEye))), 3.);
        gl_FragColor=vec4(.38,.67,.83,rim*.32); }`,
    }));
    atmosphere.name = "globe:atmosphere";
    this.planet.add(atmosphere);
  }

  /** Draw the parcels that have owners. Capped, because a million hexagons is not a picture. */
  setClaimed(cells: string[], limit = 1200): void {
    if (this.owned) {
      this.planet.remove(this.owned);
      this.owned.geometry.dispose();
      (this.owned.material as THREE.Material).dispose();
      this.owned = null;
    }
    const subset = cells.slice(0, limit);
    if (subset.length === 0) return;

    const mesh = buildParcelMesh(subset, this.field, this.calibration, { reliefSubdivisions: 1 });
    for (const cell of subset) {
      paintParcel(mesh, cell, OWNED);
      setParcelExtrusion(mesh, cell, true);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colours, 3));
    this.owned = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
    );
    this.planet.add(this.owned);
  }

  /**
   * The planet's villages, as lights (DECISIONS C41): one point at the centre of every settled cell,
   * warmer and brighter the more people its ground can hold.
   *
   * POINTS, NOT PARCELS, and the count is why. `setClaimed` extrudes a hexagon per cell and caps at
   * twelve hundred because "a million hexagons is not a picture"; there are some twenty-seven thousand
   * villages, and a light is what a village looks like from this far up anyway. One draw call for all
   * of them, a fixed few pixels each, hidden behind the planet's limb by the depth buffer like
   * everything else on it. Seated with `globeRadiusAt` plus the hover patch's own lift, so a light
   * stands on the ground it names and not on the highest peak's sphere.
   */
  setVillages(cells: readonly string[], capacity: readonly number[]): void {
    if (this.villages) {
      this.planet.remove(this.villages);
      this.villages.geometry.dispose();
      (this.villages.material as THREE.Material).dispose();
      this.villages = null;
    }
    if (cells.length === 0) return;
    const positions = new Float32Array(cells.length * 3);
    const colours = new Float32Array(cells.length * 3);
    const sizes = new Float32Array(cells.length);
    const ember = new THREE.Color(0xd08a40);
    const lantern = new THREE.Color(0xffc05a);
    const colour = new THREE.Color();
    cells.forEach((cell, i) => {
      const { direction } = cellCentre(cell);
      const r = globeRadiusAt(this.field, this.calibration, direction) + MARKER_LIFT;
      positions[i * 3] = direction[0] * r;
      positions[i * 3 + 1] = direction[1] * r;
      positions[i * 3 + 2] = direction[2] * r;
      // A hamlet is a small ember; a town on a trade route is a lantern three pixels across. Tuned by
      // eye against two screenshots, both wrong: every village at the same bright 2.6 px buried the
      // continents under twenty-eight thousand of them, and a dark 0.9 px ember lost them entirely.
      const t = Math.pow(Math.min(1, (capacity[i] ?? 0) / 140), 1.4);
      colour.copy(ember).lerp(lantern, t);
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
      sizes[i] = 1.3 + 2.0 * t;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.computeBoundingSphere();
    this.villages = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        uniforms: { pixelRatio: { value: this.renderer.getPixelRatio() } },
        vertexShader: `attribute float size; uniform float pixelRatio; varying vec3 vColour;
          void main() { vColour = color; gl_PointSize = size * pixelRatio; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 vColour;
          void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(vColour, smoothstep(0.5, 0.15, r) * 0.85); }`,
      }),
    );
    this.villages.name = "globe:villages";
    this.planet.add(this.villages);
  }

  /**
   * Draw a parcel, outlined, and begin the flight down to it.
   *
   * `fill` exists because legibility depends on how far away you stop. On the registration screen
   * the descent ends nine kilometres up and the parcel keeps its own terrain, which is the point of
   * arriving. On the landing the planet only leans in, and at that distance one parcel is three
   * percent of the frame, so terrain colours would be indistinguishable from the ground around
   * them and the parcel has to be a mark rather than a place.
   */
  flyTo(cell: string, options: { fill?: [number, number, number]; distance?: number } = {}): void {
    if (this.mine) {
      this.planet.remove(this.mine);
      this.mine = null;
    }

    const group = new THREE.Group();
    // Yours keeps its own terrain. Flooding it with a flat owner colour is right on a globe seen
    // from orbit, where the question is who owns what, and wrong at the end of a descent, where
    // the question is what the ground looks like. It is lifted and outlined instead.
    const mesh = buildParcelMesh([cell], this.field, this.calibration, { reliefSubdivisions: 4 });
    setParcelExtrusion(mesh, cell, true);
    if (options.fill) paintParcel(mesh, cell, options.fill);
    // Lifted toward parchment so the hexagon separates from the ground around it, but not so far
    // that it stops being your terrain. Extrusion alone cannot do this job: buildParcelMesh makes a
    // top surface and no side walls, so from directly overhead a lifted parcel is invisible. Seen
    // from orbit the owner colour does the separating; at the end of a descent, this does.
    if (!options.fill) {
      // MINE is parchment in sRGB bytes; mesh.colours is linear (DECISIONS C3). Mixing the bytes
      // straight in would drag the terrain toward a value 2.3x too bright and undo the seam fix on
      // exactly the parcel a person is arriving at.
      const mine = linearRgb(MINE);
      for (let i = 0; i < mesh.colours.length; i++) {
        mesh.colours[i] = mesh.colours[i]! + (mine[i % 3]! - mesh.colours[i]!) * 0.3;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colours, 3));
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.02 }),
      ),
    );

    // Over a parcel that IS extruded, so the line has to clear the extrusion as well as the ground.
    const outline = buildParcelOutlines([cell], this.field, this.calibration, {
      outlineLift: DEFAULT_GLOBE_OPTIONS.assignedExtrusion + DEFAULT_GLOBE_OPTIONS.outlineLift,
    });
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.BufferAttribute(outline.positions, 3));
    // Echo violet, which is the one colour on this planet that no biome uses, so the deed line can
    // never be confused with a coastline or a ridge.
    group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xa06cd5 })));

    this.planet.add(group);
    this.mine = group;
    // Turn the planet so the parcel faces the camera.
    const { direction } = cellCentre(cell);
    this.target = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(direction[0], direction[1], direction[2]).normalize(),
      new THREE.Vector3(0, 0, 1),
    );
    this.arrivedDistance = options.distance ?? ARRIVED_DISTANCE;
    this.flight = this.options.reducedMotion ? 1 : 0;
    this.announced = false;
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);

    // Real elapsed time, not an assumed sixty frames a second. Driving the flight by frame count
    // makes it take four seconds on a fast machine and fourteen on a slow one, which is exactly the
    // kind of thing that looks fine in development and is broken for half the people who use it.
    // Clamped, so a backgrounded tab does not resume by teleporting to the ground.
    const now = performance.now();
    const delta = this.lastFrameAt === 0 ? 1 / 60 : Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;

    if (this.target === null) {
      if (!this.options.reducedMotion) this.spin += delta * 0.055;
      this.planet.rotation.set(0, this.spin, 0);
      this.planet.position.x = this.options.offsetX ?? 0;
      this.camera.position.set(0, 0.22, this.idleDistance);
    } else {
      if (this.flight < 1) this.flight = Math.min(1, this.flight + delta * 0.26);
      const t = 1 - Math.pow(1 - this.flight, 3);
      this.planet.quaternion.slerp(this.target, this.options.reducedMotion ? 1 : Math.min(1, delta * 5.4));
      this.planet.position.x = this.idleOffsetX * (1 - t);
      this.camera.position.set(0, 0.22 * (1 - t), this.idleDistance - (this.idleDistance - this.arrivedDistance) * t);
      if (this.flight >= 1 && !this.announced) {
        this.announced = true;
        this.options.onArrived?.();
      }
    }

    this.camera.lookAt(0, 0, 0);
    this.frameDepth();
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Put the near and far planes around the planet, every frame, instead of 0.01 and 100.
   *
   * A depth buffer's resolution goes as z^2 (f - n) / (2 f n), so 0.01 against 100 spent the whole
   * 24 bits on empty space and left one depth step measuring 1.13e-4 of the radius at the globe:
   * 22.6 m of ground, which is the same order as the 60 m a marker is lifted by and is why the
   * old lifts had to be kilometres to be seen at all. Derived from where the camera actually is,
   * the step becomes 6.7e-7, which is 0.13 m, and a 60 m lift is 450 depth steps clear.
   *
   * The near plane is HALF the gap to the highest ground the planet can have, so a peak that the
   * camera has descended toward cannot clip through the front of the frame.
   */
  private frameDepth(): void {
    // Along the camera's own forward axis, which is where a frustum plane is measured, and not the
    // straight-line distance: the camera looks at the origin while the PLANET is offset sideways
    // by up to a third of a radian of it, so the two differ by 6% at the hero's own composition.
    const forward = this.depthForward.copy(this.camera.position).negate().normalize();
    const depth = this.depthToPlanet.copy(this.planet.position).sub(this.camera.position).dot(forward);
    const rMax = 1 + DEFAULT_GLOBE_OPTIONS.reliefScale;
    const near = Math.max(0.01, (depth - rMax) / 2);
    const far = Math.max(near + 1, depth + rMax * 1.2);
    if (near === this.camera.near && far === this.camera.far) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  // ── pointing at the planet ────────────────────────────────────────────────────

  /**
   * The parcel under a pointer position, or null when the pointer is off the planet.
   *
   * THE RAY IS PUT INTO THE PLANET'S OWN SPACE FIRST, and the intersection is taken there against
   * the surface the planet is DRAWN at. It used to be taken against an invisible unit sphere, and
   * the planet is drawn displaced by relief, so the two hits were two different points: a median
   * 0.264 and a p95 2.177 degrees apart on a parcel 0.40 degrees wide. See raycastGlobe.
   *
   * `matrixWorld` is deliberately NOT refreshed here. The pixel the pointer is over belongs to the
   * frame that has already been drawn, so the pick has to be answered against the rotation that
   * drew it. Refreshing would answer against a frame nobody has seen yet.
   */
  private parcelAt(clientX: number, clientY: number): PickedParcel | null {
    const picking = this.options.picking;
    if (!picking) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Two points on the world-space ray through the planet's inverse transform, rather than the
    // direction through a rotation: the difference is a vector however the group is placed, and
    // this cannot go wrong the day something puts a scale or a second parent above the planet.
    const inverse = this.pickMatrix.copy(this.planet.matrixWorld).invert();
    const from = this.pickFrom.copy(this.raycaster.ray.origin).applyMatrix4(inverse);
    const along = this.pickTo.copy(this.raycaster.ray.origin).add(this.raycaster.ray.direction).applyMatrix4(inverse).sub(from);

    const hit = raycastGlobe(
      this.field,
      this.calibration,
      [from.x, from.y, from.z],
      [along.x, along.y, along.z],
      { subdivisions: this.options.subdivisions ?? 8 },
    );
    if (!hit) return null;

    const [lat, lng] = vec3ToLatLng(hit.direction[0], hit.direction[1], hit.direction[2]);
    const cell = latLngToCell(lat, lng, picking.parcelResolution);
    const commonsCell = cellToParent(cell, picking.commonsResolution);
    const commonsName = picking.commons[commonsCell] ?? null;
    const region = commonsName ? commonsCell : cellToParent(cell, Math.min(2, picking.parcelResolution));
    const chosen = commonsName ? commonsCell : cell;

    let landFraction = this.landCache.get(chosen);
    if (landFraction === undefined) {
      landFraction = landFractionOfCell(this.field, this.calibration.seaLevel, chosen, 2);
      this.landCache.set(chosen, landFraction);
    }

    return {
      cell: chosen,
      lat,
      lng,
      commonsName,
      region,
      landFraction,
      // A commons is not assignable either. It is public, which is a different reason.
      assignable: commonsName === null && landFraction >= picking.minLandFraction,
    };
  }

  private onPointerMove = (event: PointerEvent): void => {
    const parcel = this.parcelAt(event.clientX, event.clientY);
    if (parcel?.cell === this.hovered) return;
    this.hovered = parcel?.cell ?? null;
    this.setHoverOutline(parcel?.cell ?? null, parcel);
    this.options.picking?.onHover?.(parcel);
  };

  private onPointerLeave = (): void => {
    this.hovered = null;
    this.setHoverOutline(null, null);
    this.options.picking?.onHover?.(null);
  };

  private onClick = (event: MouseEvent): void => {
    const parcel = this.parcelAt(event.clientX, event.clientY);
    if (parcel) this.options.picking?.onSelect?.(parcel);
  };

  /**
   * Mark whatever the pointer is over.
   *
   * An outline alone does not do it. A parcel is 1.4 km on a planet 1,257 km around, so at hero
   * size its border is one pixel of pale line on a lit sphere and the eye slides straight past it.
   * The parcel is filled as well, lifted off the surface so the fill cannot be mistaken for terrain,
   * and the outline is drawn on top of that.
   */
  private setHoverOutline(cell: string | null, parcel: PickedParcel | null): void {
    if (this.hover) {
      this.planet.remove(this.hover);
      this.hover.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      this.hover = null;
    }
    if (!cell) return;

    // Gold for a commons, parchment for a parcel somebody can own, and a cold blue for water,
    // which nobody will ever be given and which must not look like an offer.
    const colour: [number, number, number] = parcel?.commonsName
      ? [226, 198, 122]
      : parcel?.assignable
        ? [244, 233, 208]
        : [122, 156, 190];
    const group = new THREE.Group();

    // MARKER_LIFT, not the assignedExtrusion an owned parcel gets. An owned parcel stands proud on
    // purpose and is read from orbit; this patch has one job, which is to say WHICH GROUND the
    // pointer is on, and a patch 1.2 km in the air is seen from the side and lands up to three
    // parcels away from that ground. See MARKER_LIFT.
    const mesh = buildParcelMesh([cell], this.field, this.calibration, {
      reliefSubdivisions: 2,
      assignedExtrusion: MARKER_LIFT,
    });
    paintParcel(mesh, cell, colour);
    setParcelExtrusion(mesh, cell, true);
    const fill = new THREE.BufferGeometry();
    fill.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    fill.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    group.add(
      new THREE.Mesh(
        fill,
        new THREE.MeshBasicMaterial({
          // setRGB with the space named, not the numeric constructor: three's Color(r, g, b) takes
          // WORKING space, which is linear here, so the bytes went in unconverted and the hover
          // fill rendered (250, 229, 183) where the parchment it names is (244, 233, 208).
          color: new THREE.Color().setRGB(colour[0] / 255, colour[1] / 255, colour[2] / 255, THREE.SRGBColorSpace),
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );

    const outline = buildParcelOutlines([cell], this.field, this.calibration, {
      outlineLift: MARKER_LIFT + DEFAULT_GLOBE_OPTIONS.outlineLift,
    });
    const line = new THREE.BufferGeometry();
    line.setAttribute("position", new THREE.BufferAttribute(outline.positions, 3));
    group.add(
      new THREE.LineSegments(
        line,
        new THREE.LineBasicMaterial({ color: parcel?.assignable === false && !parcel.commonsName ? 0x7a9cbe : 0xa06cd5 }),
      ),
    );

    this.planet.add(group);
    this.hover = group;
  }

  /**
   * Where a parcel is on screen right now, in CSS pixels relative to the host, or null if it has
   * turned to the far side. Polled by the caller rather than pushed, because the planet keeps
   * turning under a still cursor and an arrow drawn to a stale position points at nothing.
   */
  screenPositionOf(cell: string): { x: number; y: number } | null {
    const { direction } = cellCentre(cell);
    this.planet.updateMatrixWorld(true);
    // The radius THIS cell is drawn at, plus the lift the marker patch itself gets. It used to be
    // 1 + reliefScale, the height of the highest peak on the planet, for every cell whatever its
    // own height: on 84611b1ffffffff, drawn at 1.00179, that put the circle 11.0 px off the cell
    // at spin 0 and 21.0 px at worst, and in one captured frame off the planet in black space.
    const radius = globeRadiusAt(this.field, this.calibration, direction) + MARKER_LIFT;
    const world = new THREE.Vector3(direction[0], direction[1], direction[2])
      .multiplyScalar(radius)
      .applyMatrix4(this.planet.matrixWorld);

    // Behind the planet's own limb, from where the camera is.
    const toCamera = this.camera.position.clone().sub(this.planet.position);
    const toPoint = world.clone().sub(this.planet.position);
    if (toPoint.dot(toCamera) < 0) return null;

    const ndc = world.project(this.camera);
    if (ndc.z > 1) return null;
    return {
      x: ((ndc.x + 1) / 2) * (this.host.clientWidth || 1),
      y: ((1 - ndc.y) / 2) * (this.host.clientHeight || 1),
    };
  }

  /** Let go and go back to turning. */
  release(): void {
    this.target = null;
    this.arrivedDistance = ARRIVED_DISTANCE;
    this.flight = -1;
    this.spin = Math.atan2(0, 1);
  }

  /**
   * Size the canvas and frame the planet for the viewport it actually has.
   *
   * Two things here were wrong and both showed up only on a high density display. setSize's third
   * argument is updateStyle, and passing false leaves the canvas with no CSS size, so at a device
   * pixel ratio of 2 the element lays out at twice the intended width and spills out of its
   * container to the bottom right. On a ratio of 1 display, which is what every headless test runs
   * at, it looks perfect. And the distance was a constant, which frames exactly one aspect ratio.
   */
  private resize = (): void => {
    const width = this.host.clientWidth || 1;
    const height = this.host.clientHeight || 1;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const halfFov = Math.tan(((FOV_DEGREES / 2) * Math.PI) / 180);
    const radius = 1 + DEFAULT_GLOBE_OPTIONS.reliefScale;
    // Far enough that the globe is IDLE_FILL of the height, and far enough again that it is never
    // more than MAX_WIDTH_FILL of the width. The wider of the two constraints wins.
    const byHeight = radius / (IDLE_FILL * halfFov);
    const byWidth = radius / (MAX_WIDTH_FILL * halfFov * this.camera.aspect);
    this.idleDistance = Math.max(byHeight, byWidth);

    // The offset is a fraction of what is visible, not a fixed distance in the world, so the
    // composition holds from a phone to an ultrawide instead of drifting off the edge of one.
    const halfWidth = this.idleDistance * halfFov * this.camera.aspect;
    const wanted = halfWidth * (this.options.offsetX ?? 0);
    this.idleOffsetX = Math.min(wanted, Math.max(0, halfWidth - radius * 1.02));
  };

  dispose(): void {
    this.disposed = true;
    // Points are not in the traversal below, which disposes meshes and outlines only.
    this.villages?.geometry.dispose();
    (this.villages?.material as THREE.Material | undefined)?.dispose();
    this.villages = null;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.observer?.disconnect();
    this.host.removeEventListener("pointermove", this.onPointerMove);
    this.host.removeEventListener("pointerleave", this.onPointerLeave);
    this.host.removeEventListener("click", this.onClick);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const material = object.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
