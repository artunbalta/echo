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
  vec3ToLatLng,
  createTerrain,
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
   * Picking is arithmetic, exactly as section 6.1 says: raycast a plain unit sphere, convert the
   * hit to lat/lng, ask H3 which cell that is. No GPU picking, no BVH, no per parcel colliders,
   * and nothing proportional to the size of the registry.
   *
   * The registry at round 1 is every cell at parcelResolution except the reserved commons, so the
   * lookup needs no set of ids at all. A mixed resolution registry, after the first subdivision,
   * needs createRegistryIndex and the walk up through cellToParent; that is the same function and
   * this is the cheap case of it.
   */
  picking?: {
    parcelResolution: number;
    commonsResolution: number;
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

export class PlanetGlobe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.01, 100);
  private readonly planet = new THREE.Group();
  private readonly field: TerrainField;
  private readonly calibration: Calibration;

  private owned: THREE.Mesh | null = null;
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
  /** An invisible unit sphere. The only thing the raycaster ever has to hit. */
  private readonly pickSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32));

  constructor(
    private readonly host: HTMLElement,
    private readonly options: PlanetGlobeOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.scene.background = new THREE.Color("#120c19");
    this.scene.add(this.planet);
    this.camera.position.set(0, 0.22, this.idleDistance);

    this.scene.add(new THREE.HemisphereLight(0xcfc0e8, 0x241733, 0.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
    key.position.set(3, 2.4, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa06cd5, 0.3);
    rim.position.set(-4, -1, -2);
    this.scene.add(rim);

    this.field = createTerrain(options.seed);
    // landFraction is not used by any renderer path, so the calibration is complete for our needs
    // with the two values the manifest carries.
    this.calibration = { seaLevel: options.seaLevel, peakElevation: options.peakElevation, landFraction: 0.6 };

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __THREE?: typeof THREE }).__THREE = THREE;
    }
    this.buildTerrain();
    if (options.picking) {
      this.pickSphere.visible = false;
      this.planet.add(this.pickSphere);
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
    this.planet.add(mesh);
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
      for (let i = 0; i < mesh.colours.length; i++) {
        mesh.colours[i] = mesh.colours[i]! + (MINE[i % 3]! / 255 - mesh.colours[i]!) * 0.3;
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

    const outline = buildParcelOutlines([cell], this.field, this.calibration);
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
    this.renderer.render(this.scene, this.camera);
  };

  // ── pointing at the planet ────────────────────────────────────────────────────

  /** The parcel under a pointer position, or null when the pointer is off the planet. */
  private parcelAt(clientX: number, clientY: number): PickedParcel | null {
    const picking = this.options.picking;
    if (!picking) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObject(this.pickSphere, false)[0];
    if (!hit) return null;

    // The hit is in world space; the cell is a property of the planet, so undo its rotation first.
    const local = this.planet.worldToLocal(hit.point.clone()).normalize();
    const [lat, lng] = vec3ToLatLng(local.x, local.y, local.z);
    const cell = latLngToCell(lat, lng, picking.parcelResolution);
    const commonsCell = cellToParent(cell, picking.commonsResolution);
    const commonsName = picking.commons[commonsCell] ?? null;
    const region = commonsName ? commonsCell : cellToParent(cell, Math.min(2, picking.parcelResolution));
    return { cell: commonsName ? commonsCell : cell, lat, lng, commonsName, region };
  }

  private onPointerMove = (event: PointerEvent): void => {
    const parcel = this.parcelAt(event.clientX, event.clientY);
    if (parcel?.cell === this.hovered) return;
    this.hovered = parcel?.cell ?? null;
    this.setHoverOutline(parcel?.cell ?? null, parcel?.commonsName != null);
    this.options.picking?.onHover?.(parcel);
  };

  private onPointerLeave = (): void => {
    this.hovered = null;
    this.setHoverOutline(null, false);
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
  private setHoverOutline(cell: string | null, isCommons: boolean): void {
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

    const colour: [number, number, number] = isCommons ? [226, 198, 122] : [244, 233, 208];
    const group = new THREE.Group();

    const mesh = buildParcelMesh([cell], this.field, this.calibration, { reliefSubdivisions: 2 });
    paintParcel(mesh, cell, colour);
    setParcelExtrusion(mesh, cell, true);
    const fill = new THREE.BufferGeometry();
    fill.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    fill.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    group.add(
      new THREE.Mesh(
        fill,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(colour[0] / 255, colour[1] / 255, colour[2] / 255),
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );

    const outline = buildParcelOutlines([cell], this.field, this.calibration);
    const line = new THREE.BufferGeometry();
    line.setAttribute("position", new THREE.BufferAttribute(outline.positions, 3));
    group.add(new THREE.LineSegments(line, new THREE.LineBasicMaterial({ color: 0xa06cd5 })));

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
    const world = new THREE.Vector3(direction[0], direction[1], direction[2])
      .multiplyScalar(1 + DEFAULT_GLOBE_OPTIONS.reliefScale)
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
