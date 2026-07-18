/**
 * ThreeWorld — the world, in three dimensions.
 *
 * This implements the SAME public contract PixiWorld did, method for method, so it drops into
 * WorldClient / Flow0Client / Flow1Client / flow1Scene / flow1Beats / raftBuild / sampler without a
 * single call-site change. That was the whole point of extracting WorldCore first: the logic those
 * files depend on never moved, so this file only had to learn to draw.
 *
 * What it owns: a scene, a camera, meshes, and light. Nothing else.
 * What it does NOT own: movement, collision, proximity, the CLOSE gate, the locomotion sampler, the
 * activity slot. Those are WorldCore's, and the server's authority is untouched — it still holds
 * (x, y) on a flat plane and gets a zero diff from this migration.
 *
 * Coordinates: gameplay is (x, y) in TILES. Three is right-handed Y-up, so the world plane is
 * (x, z) and Y is height. tile (x, y) → three (x, groundHeight(x,y), y). Height is scenery: it is
 * read from a pure function of the same shared island geometry the collision uses, and nothing ever
 * reads it back. You cannot stand on anything here that you could not stand on in 2D.
 *
 * Light: one low western dusk key, a cool sky fill, and pooled warm light at campfires. That is the
 * art bible's rule and it survives the migration unchanged — see docs/world-design/art-bible.md
 * §addendum for what did not.
 */
import * as THREE from "three";
import {
  WORLD,
  type EntitySnapshot,
  type Facing,
} from "@echo/shared";
import { WorldCore, type WorldHooks, type WorldEntity, type ActivityKind } from "./WorldCore";
import { generateTileMap, type TileMap } from "./tilemap";
import { buildTerrain, groundHeight, type TerrainBuild } from "./three/terrain";
import { buildCharacter, poseCharacter, type CharacterParts } from "./three/character";
import { buildProp3D, buildUnknownProp } from "./three/props3d";
import { isPropUrl, propKindFromUrl } from "./props";
import { PALETTE } from "./three/palette";

export type { WorldHooks, ActivityKind } from "./WorldCore";
export type { EntityActivity } from "./WorldCore";

/** One entity's visual body in the scene. The core's twin lives in WorldCore.entities. */
interface EntityView {
  group: THREE.Group;
  /** Present for characters (users + NPCs that are people); absent for props. */
  parts: CharacterParts | null;
  /** The name label, an HTML element positioned over the canvas. Text in WebGL is a whole asset
   *  pipeline (SDF atlases, troika); a div is sharper, accessible, and free. */
  label: HTMLDivElement;
  labelVisible: boolean;
  spriteUrl: string;
  isProp: boolean;
}

const CAM_HEIGHT = 7.2;
const CAM_BACK = 8.4;
const CAM_LERP = 6;

export class ThreeWorld {
  readonly core: WorldCore;
  private map: TileMap;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private parent: HTMLElement | null = null;
  private labelLayer: HTMLDivElement | null = null;

  private terrain: TerrainBuild | null = null;
  private views = new Map<string, EntityView>();
  private particleGeo: THREE.BufferGeometry | null = null;
  private particlePts: THREE.Points | null = null;

  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.HemisphereLight | null = null;

  private raf = 0;
  private lastT = 0;
  private destroyed = false;
  private initialized = false;

  /** Camera offset while a ping is centring someone, in tiles. Eased. */
  private locOff = { x: 0, y: 0 };
  private camPos = new THREE.Vector3();

  constructor(hooks: WorldHooks, opts: { map?: TileMap } = {}) {
    this.map = opts.map ?? generateTileMap();
    this.core = new WorldCore(
      {
        ...hooks,
        onEntityAdded: (e) => this.addView(e),
        onEntityRemoved: (id) => this.removeView(id),
        onEntitySkin: (id, url) => this.reskin(id, url),
        onEntityName: (id, name) => this.rename(id, name),
      },
      this.map,
    );
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────────

  async init(canvasParent: HTMLElement) {
    // React StrictMode double-mounts in dev; PixiWorld guarded this and so must we, or the second
    // mount races the first's teardown and leaves an orphaned canvas eating a GL context.
    if (this.destroyed || this.initialized) return;
    this.initialized = true;
    this.parent = canvasParent;

    const w = canvasParent.clientWidth || 800;
    const h = canvasParent.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(PALETTE.skyDusk);
    if (this.destroyed) {
      this.renderer.dispose();
      return;
    }
    canvasParent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";

    // Labels ride above the canvas as DOM.
    this.labelLayer = document.createElement("div");
    this.labelLayer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;font:11px ui-monospace,monospace;";
    canvasParent.appendChild(this.labelLayer);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Dusk: the sky is close and the horizon is warm, so fog reads as haze, not as a grey cull.
    this.scene.fog = new THREE.Fog(PALETTE.skyDusk, 34, 130);

    // ── the single low western key light ──
    const key = new THREE.DirectionalLight(PALETTE.dusk, 1.65);
    key.position.set(-40, 22, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    const S = 26;
    key.shadow.camera.left = -S;
    key.shadow.camera.right = S;
    key.shadow.camera.top = S;
    key.shadow.camera.bottom = -S;
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    // The cool sky fill opposite it. Ground bounce is warm sand, never black — the bible's
    // "shadows are ink, not absence" rule, expressed as light rather than as a colour swatch.
    const fill = new THREE.HemisphereLight(PALETTE.duskFill, PALETTE.sandWet, 0.85);
    this.scene.add(fill);
    this.fillLight = fill;

    const self = this.core.getSelfTile();
    this.terrain = buildTerrain(self.x, self.y);
    this.scene.add(this.terrain.group);

    // Particles: one Points cloud, capped at the core's 80.
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
    this.particleGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
    this.particlePts = new THREE.Points(
      this.particleGeo,
      new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    this.particlePts.frustumCulled = false;
    this.scene.add(this.particlePts);

    // Any entity the core already knows about (added before init) needs a body.
    for (const e of this.core.entities.values()) this.addView(e);

    this.bindInput();
    window.addEventListener("resize", this.onResize);

    this.lastT = performance.now();
    const loop = () => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dtMs = now - this.lastT;
      this.lastT = now;
      this.core.step(dtMs);
      this.draw(Math.min(dtMs, 50) / 1000);
      this.renderer!.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onResize = () => {
    if (!this.renderer || !this.parent) return;
    const w = this.parent.clientWidth || 800;
    const h = this.parent.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    if (!this.initialized) return;
    this.renderer?.domElement.removeEventListener("pointerdown", this.onPointerDown);
    for (const id of [...this.views.keys()]) this.removeView(id);
    this.terrain?.dispose();
    this.particleGeo?.dispose();
    this.labelLayer?.remove();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    this.renderer = null;
  }

  // ── input ───────────────────────────────────────────────────────────────────────

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.renderer?.domElement.addEventListener("pointerdown", this.onPointerDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    this.core.setKey(e.key.toLowerCase(), true);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.core.setKey(e.key.toLowerCase(), false);
  };

  /** A backgrounded tab never delivers keyup — without this you walk forever. */
  private onBlur = () => this.core.clearKeys();

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  /** Click-to-move: raycast the sea plane (y=0) rather than unprojecting a 2D camera. */
  private onPointerDown = (e: PointerEvent) => {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return;
    this.core.setAutoWalk({ x: hit.x, y: hit.z });
  };

  // ── entity views ────────────────────────────────────────────────────────────────

  private addView(e: WorldEntity) {
    if (!this.initialized || this.views.has(e.id)) return;
    const group = new THREE.Group();
    const propKind = isPropUrl(e.spriteUrl) ? propKindFromUrl(e.spriteUrl) : null;
    // A prop is a thing; anything else is a body. NPC people and users both get characters.
    const isProp = !!propKind;
    let parts: CharacterParts | null = null;
    if (isProp) {
      group.add(propKind ? buildProp3D(propKind, e.id) : buildUnknownProp());
    } else {
      parts = buildCharacter(e.id, e.kind === "user");
      group.add(parts.root);
    }

    const label = document.createElement("div");
    label.style.cssText =
      "position:absolute;transform:translate(-50%,-100%);white-space:nowrap;color:#f4e9d0;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.9);pointer-events:none;display:none;";
    label.textContent = e.name;
    this.labelLayer?.appendChild(label);

    this.scene.add(group);
    this.views.set(e.id, { group, parts, label, labelVisible: false, spriteUrl: e.spriteUrl, isProp });
    this.applyTargetH(e);
  }

  private removeView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    v.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    v.label.remove();
    this.views.delete(id);
  }

  private reskin(id: string, spriteUrl: string) {
    const v = this.views.get(id);
    const e = this.core.entities.get(id);
    if (!v || !e) return;
    if (v.spriteUrl === spriteUrl) return;
    // Rebuild the body: a re-skin is a raft becoming a bigger raft, not a texture swap.
    v.group.clear();
    const kind = isPropUrl(spriteUrl) ? propKindFromUrl(spriteUrl) : null;
    if (kind) {
      v.group.add(buildProp3D(kind, id));
      v.parts = null;
      v.isProp = true;
    } else {
      v.parts = buildCharacter(id, e.kind === "user");
      v.group.add(v.parts.root);
      v.isProp = false;
    }
    v.spriteUrl = spriteUrl;
    this.applyTargetH(e);
  }

  private rename(id: string, name: string) {
    const v = this.views.get(id);
    if (v) v.label.textContent = name;
  }

  /**
   * `targetH` is a 2D idea: "render this sprite at N source pixels tall". It exists because the
   * committed PNGs were wildly different sizes (a 36×75 driftwood next to a 16×24 avatar). In 3D
   * the geometry is authored at true scale, so the only thing worth keeping is the RATIO to the
   * avatar — a prop asked to be 17px next to a 24px body should read at ~0.7 of body height.
   */
  private applyTargetH(e: WorldEntity) {
    const v = this.views.get(e.id);
    if (!v || !v.isProp || !e.targetH) return;
    const s = Math.max(0.25, e.targetH / 24);
    v.group.scale.setScalar(s);
  }

  // ── the draw pass ───────────────────────────────────────────────────────────────

  private draw(dt: number) {
    const self = this.core.getSelfTile();

    for (const [id, e] of this.core.entities) {
      const v = this.views.get(id);
      if (!v) continue;
      const vis = this.core.entityVisual(e, dt);

      const gy = groundHeight(e.ix, e.iy);
      v.group.position.set(e.ix, gy, e.iy);

      if (v.parts) {
        poseCharacter(v.parts, {
          facing: e.facing,
          moving: e.moving,
          animTime: e.animTime,
          bob: vis.bob,
          lean: vis.lean,
          carrying: vis.carrying,
          activity: e.activity?.kind ?? null,
        });
        // Vitality drains the colour out of the body — the body IS the meter, no bar anywhere.
        if (id === this.core.selfId) {
          const tint = this.core.vitalityTint();
          for (const m of v.parts.skinMats) {
            (m as THREE.MeshLambertMaterial).color.setHex(tint === 0xffffff ? m.userData.base ?? m.color.getHex() : tint);
          }
        }
        const ring = v.parts.root.getObjectByName("ring") as THREE.Mesh | undefined;
        if (ring && vis.ring) {
          (ring.material as THREE.MeshBasicMaterial).opacity = vis.ring.alpha;
          ring.scale.setScalar(vis.ring.scale);
        }
      }

      // Labels: identity only at CLOSE (≤ 2.0 tiles). Same gate, same guarantee, new medium.
      if (vis.named !== v.labelVisible) {
        v.label.style.display = vis.named ? "block" : "none";
        v.labelVisible = vis.named;
      }
      if (vis.named && this.renderer) {
        const p = new THREE.Vector3(e.ix, gy + 1.5, e.iy).project(this.camera);
        const rect = this.renderer.domElement;
        v.label.style.left = `${((p.x + 1) / 2) * rect.clientWidth}px`;
        v.label.style.top = `${((-p.y + 1) / 2) * rect.clientHeight}px`;
      }
    }

    // Bushes thin as the larder empties (deterministic — the core owns the hash).
    if (this.terrain) {
      const s = this.core.scarcity;
      this.terrain.bushes.forEach((b, i) => {
        b.visible = this.core.bushVisible(i, s);
      });
    }

    this.stepCamera(dt, self);
    this.drawParticles();
    this.applyDayLight();
  }

  /** Third person: behind and above, easing. You see your own body — which is the point, and the
   *  reason gaze and orientation are cues we can finally read. */
  private stepCamera(dt: number, self: { x: number; y: number }) {
    const loc = this.core.locateTarget();
    const wantX = loc ? loc.x - self.x : 0;
    const wantY = loc ? loc.y - self.y : 0;
    const ease = Math.min(1, dt * 4);
    this.locOff.x += (wantX - this.locOff.x) * ease;
    this.locOff.y += (wantY - this.locOff.y) * ease;

    const tx = self.x + this.locOff.x;
    const tz = self.y + this.locOff.y;
    const gy = groundHeight(tx, tz);
    const desired = new THREE.Vector3(tx, gy + CAM_HEIGHT, tz + CAM_BACK);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
    this.camPos.lerp(desired, Math.min(1, dt * CAM_LERP));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(tx, gy + 0.7, tz);

    // The shadow camera follows the player, or a 768-tile world would need a 768-tile shadow map.
    if (this.keyLight) {
      this.keyLight.position.set(self.x - 26, 20, self.y + 8);
      this.keyLight.target.position.set(self.x, 0, self.y);
      this.keyLight.target.updateMatrixWorld();
    }
  }

  private drawParticles() {
    if (!this.particleGeo || !this.particlePts) return;
    const ps = this.core.particles;
    const pos = this.particleGeo.attributes.position as THREE.BufferAttribute;
    const col = this.particleGeo.attributes.color as THREE.BufferAttribute;
    const n = Math.min(ps.length, 80);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      pos.setXYZ(i, p.x, groundHeight(p.x, p.y) + 0.35 - p.vy * 0.05, p.y);
      c.setHex(p.color);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    // Park the unused tail far below the sea rather than reallocating the buffer each frame.
    for (let i = n; i < 80; i++) pos.setXYZ(i, 0, -999, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.particlePts.visible = n > 0;
  }

  /** The day's light: the key swings and cools toward nightfall. The 2D build washed the screen
   *  with a coloured rect; here the same ramp drives the actual light, which is what a wash was
   *  always imitating. */
  private applyDayLight() {
    if (!this.keyLight || !this.fillLight) return;
    const p = this.core.dayPhase;
    const { color, alpha } = this.core.ambientFor(p);
    // Dawn warm → midday clear → amber → deep blue dark.
    const key = new THREE.Color(PALETTE.dusk);
    if (alpha > 0) key.lerp(new THREE.Color(color), Math.min(0.85, alpha * 2.2));
    this.keyLight.color.copy(key);
    this.keyLight.intensity = p > 0.85 ? 1.65 * (1 - (p - 0.85) / 0.15) * 0.6 + 0.25 : 1.65;
    this.fillLight.intensity = p > 0.85 ? 0.85 - 0.4 * ((p - 0.85) / 0.15) : 0.85;
    const sky = new THREE.Color(PALETTE.skyDusk);
    if (p > 0.85) sky.lerp(new THREE.Color(0x0a0d16), (p - 0.85) / 0.15);
    this.renderer?.setClearColor(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
  }

  // ── the contract: everything below delegates to the core, unchanged ──────────────

  setSelf(id: string, x: number, y: number) {
    this.core.setSelf(id, x, y);
  }
  applySnapshot(snaps: Map<string, EntitySnapshot>, ackSeq?: number) {
    this.core.applySnapshot(snaps, ackSeq);
  }
  addEntity(snap: EntitySnapshot) {
    this.core.addEntity(snap);
  }
  removeEntity(id: string) {
    this.core.removeEntity(id);
  }
  moveEntity(id: string, x: number, y: number, facing?: Facing) {
    this.core.moveEntity(id, x, y, facing);
  }
  setEntitySprite(id: string, spriteUrl: string) {
    this.core.setEntitySprite(id, spriteUrl);
  }
  setEntityName(id: string, name: string) {
    this.core.setEntityName(id, name);
  }
  setEntityDisplayHeight(id: string, px: number) {
    this.core.setEntityDisplayHeight(id, px);
    const e = this.core.entities.get(id);
    if (e) this.applyTargetH(e);
  }
  setSelfActivityState(kind: ActivityKind | null, opts?: { carrying?: boolean; intensity?: number; owner?: string }) {
    this.core.setSelfActivityState(kind, opts);
  }
  setActivityState(id: string, kind: ActivityKind | null, opts?: { carrying?: boolean; intensity?: number }) {
    this.core.setActivityState(id, kind, opts);
  }
  getSelfTile() {
    return this.core.getSelfTile();
  }
  getNearbyId() {
    return this.core.getNearbyId();
  }
  getNearbyKind() {
    return this.core.getNearbyKind();
  }
  listNpcs() {
    return this.core.listNpcs();
  }
  pingEntity(id: string) {
    this.core.pingEntity(id);
  }
  setAutoWalk(t: { x: number; y: number } | null) {
    this.core.setAutoWalk(t);
  }
  isNearPortal() {
    return this.core.isNearPortal();
  }
  setSailing(on: boolean) {
    this.core.setSailing(on);
  }
  setRaft(r: { sea: number; reach: number; departX: number; departY: number }) {
    this.core.setRaft(r);
  }
  getRaftStrain() {
    return this.core.getRaftStrain();
  }
  sampleLocomotion() {
    return this.core.sampleLocomotion();
  }
  setDayPhase(p: number) {
    this.core.setDayPhase(p);
  }
  setVitality(v: number) {
    this.core.setVitality(v);
  }
  setScarcity(level01: number) {
    this.core.setScarcity(level01);
  }
  /** Kept for call-site parity with PixiWorld (WORLD.MAP tiles). */
  get mapRef(): TileMap {
    return this.map;
  }
}

void WORLD;
