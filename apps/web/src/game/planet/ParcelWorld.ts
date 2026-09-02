/**
 * The walkable parcel (build order step 10, and the last clause of section 9).
 *
 * Section 9 is blunt about why this exists: a waitlist that assigns land and shows nothing walkable
 * spends the user's only visit and gets nothing back. So the minimum is terrain, water, vegetation
 * and free movement, and this is that minimum and no more.
 *
 * The scene is built IN THE BROWSER from @echo/planet, not fetched. That is not a shortcut, it is
 * the point: the same buildParcelScene the server would call, sampling the same terrain field the
 * globe sampled, so the ground here is the ground the globe showed. The agreement test in
 * tests/agreement.test.ts is what makes that a fact rather than an intention.
 */

import {
  buildParcelScene,
  createTangentPatch,
  createTerrain,
  sceneHeightAt,
  type Calibration,
  type ParcelScene,
  type TangentPatch,
  type TerrainField,
} from "@echo/planet";
import * as THREE from "three";

export interface ParcelWorldOptions {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  onReady?: (scene: ParcelScene) => void;
}

const PLANT_COLOUR: Record<string, number> = {
  forest: 0x3f6b4a,
  rainforest: 0x2f5c42,
  taiga: 0x3b5750,
  grassland: 0x6d8a4a,
  savanna: 0x8a7a3f,
  beach: 0x9a8a5a,
  desert: 0x8a7a52,
  tundra: 0x6a6a5a,
};

export class ParcelWorld {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.5, 8000);
  private readonly keys = new Set<string>();
  private frame = 0;
  private observer: ResizeObserver | null = null;
  private lastFrameAt = 0;
  private disposed = false;
  private yaw = 0;
  private pitch = -0.22;
  private readonly position = new THREE.Vector3();
  private built: ParcelScene | null = null;
  private field: TerrainField | null = null;
  private calibration: Calibration | null = null;
  private patch: TangentPatch | null = null;
  private heightScaleM = 900;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: ParcelWorldOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.scene.background = new THREE.Color("#8fa4c4");
    this.scene.fog = new THREE.Fog(0x8fa4c4, 400, 2600);
    this.scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x4a4636, 0.85));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(-600, 900, 400);
    this.scene.add(sun);

    this.build();
    this.resize();
    window.addEventListener("resize", this.resize);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.loop();
  }

  private build(): void {
    const field = createTerrain(this.options.seed);
    const calibration: Calibration = {
      seaLevel: this.options.seaLevel,
      peakElevation: this.options.peakElevation,
      landFraction: 0.6,
    };
    const scene = buildParcelScene(this.options.cell, field, calibration, this.options.radiusKm, {
      resolution: 112,
    });
    this.built = scene;
    this.field = field;
    this.calibration = calibration;
    this.patch = createTangentPatch(this.options.cell, this.options.radiusKm);

    // Ground. z is up in the scene builder's local frame, so the mesh is rotated into three's y up.
    const ground = new THREE.BufferGeometry();
    ground.setAttribute("position", new THREE.BufferAttribute(scene.positions, 3));
    ground.setAttribute("normal", new THREE.BufferAttribute(scene.normals, 3));
    ground.setAttribute("color", new THREE.BufferAttribute(scene.colours, 3));
    const groundMesh = new THREE.Mesh(
      ground,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    );
    groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(groundMesh);

    // Water, only where the parcel actually has some. A parcel entirely above sea level gets no
    // sheet of blue laid over it, which would be a lie about where the coast is.
    if (scene.hasWater) {
      const extent = scene.patch.extentM * 2.4;
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(extent, extent),
        new THREE.MeshStandardMaterial({
          color: 0x2f5f86,
          transparent: true,
          opacity: 0.82,
          roughness: 0.25,
          metalness: 0.1,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = scene.waterLevelZ;
      this.scene.add(water);
    }

    // Vegetation, as one instanced cone per plant. Deterministic: same parcel, same trees, always.
    const byBiome = new Map<string, typeof scene.plants>();
    for (const plant of scene.plants) {
      const list = byBiome.get(plant.biome) ?? [];
      list.push(plant);
      byBiome.set(plant.biome, list);
    }
    const dummy = new THREE.Object3D();
    for (const [biome, plants] of byBiome) {
      const trunkHeight = biome === "grassland" || biome === "savanna" ? 6 : 14;
      const geometry = new THREE.ConeGeometry(trunkHeight * 0.42, trunkHeight, 6);
      geometry.translate(0, trunkHeight / 2, 0);
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: PLANT_COLOUR[biome] ?? 0x5a7a4a, roughness: 1 }),
        plants.length,
      );
      plants.forEach((plant, i) => {
        dummy.position.set(plant.x, plant.z, -plant.y);
        dummy.rotation.set(0, plant.rotation, 0);
        dummy.scale.setScalar(plant.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }

    // Stand the viewer in the middle of their land, at head height.
    const centreHeight = this.heightAt(0, 0);
    this.position.set(0, centreHeight + 1.7, 0);
    this.options.onReady?.(scene);
  }

  /**
   * The ground under a point, from the terrain field itself rather than by searching the mesh.
   *
   * This is sceneHeightAt, which is the function the cross renderer agreement test compares against
   * the globe. So the height you WALK on and the height the globe DREW are not merely close, they
   * are the same call. Searching the triangle soup instead would have been a second implementation
   * of the same idea and the first place the two could drift apart.
   */
  private heightAt(x: number, z: number): number {
    if (!this.field || !this.calibration || !this.patch) return 0;
    // The scene builder works in local metres with y north; three has z south.
    return sceneHeightAt(this.patch, this.field, this.calibration, x, -z) * this.heightScaleM;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.key.toLowerCase());
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private onPointerDown = (): void => {
    void this.renderer.domElement.requestPointerLock?.();
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  };
  private onPointerLockChange = (): void => {
    if (document.pointerLockElement !== this.renderer.domElement) {
      document.removeEventListener("mousemove", this.onMouseMove);
    }
  };
  private onMouseMove = (event: MouseEvent): void => {
    this.yaw -= event.movementX * 0.0022;
    this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch - event.movementY * 0.0022));
  };

  private loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const delta = this.lastFrameAt === 0 ? 1 / 60 : Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;

    const speed = (this.keys.has("shift") ? 220 : 70) * delta;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.keys.has("w") || this.keys.has("arrowup")) this.position.addScaledVector(forward, speed);
    if (this.keys.has("s") || this.keys.has("arrowdown")) this.position.addScaledVector(forward, -speed);
    if (this.keys.has("a") || this.keys.has("arrowleft")) this.position.addScaledVector(right, -speed);
    if (this.keys.has("d") || this.keys.has("arrowright")) this.position.addScaledVector(right, speed);

    // Follow the ground rather than float over it.
    const ground = this.heightAt(this.position.x, this.position.z);
    this.position.y += (ground + 1.7 - this.position.y) * Math.min(1, delta * 8);

    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.renderer.render(this.scene, this.camera);
  };

  private resize = (): void => {
    const width = this.host.clientWidth || 1;
    const height = this.host.clientHeight || 1;
    // Not setSize(w, h, false): without the style update the canvas lays out at its device
    // pixel size, which is twice the container on a high density display.
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.observer?.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
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
