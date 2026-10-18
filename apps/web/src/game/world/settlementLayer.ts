/**
 * The settlement layer (DECISIONS C41): the anchor cell's village, drawn — houses, ruins, the well,
 * the dock and its boats, the fields, the graveyard — where the cell has one.
 *
 * It does no planning. `PlanetWorld` builds the village once, at construction, because the village
 * decides where a visitor arrives (`region.spawn`), and the spawn has to exist before any layer does.
 * This layer only reads `ctx.region.village` and draws it, so there is one village and not two.
 *
 * TWO DRAWS, PLUS A SHADOW. Everything that never moves is one merged mesh, and the lit windows are
 * one more because they change with the hour. The boats sail, so they are the villagers layer's.
 * See villageGeometry.ts for why the budget forces that shape.
 *
 * WHERE IT SITS IN THE LIST, and why there: after the terrain, whose ground it stands on, and BEFORE
 * the scatter, so that nothing about this layer can depend on the scatter — the scatter is the one
 * that has to keep the village's ground clear, and it reads the same plan from the region.
 */

import * as THREE from "three";
import { timeOfDay, type WorldClock } from "@echo/planet";

import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";
import { buildVillage, placement, type VillageForms } from "./villageGeometry";

/** A house's footprint, as the forms carry it. */
export type HouseFootprint = VillageForms["footprints"][number] & { house: NonNullable<VillageForms["footprints"][number]["house"]> };

/** A box a body cannot walk through, local metres: centre, heading, half extents (C54: furniture). */
export interface Solid {
  x: number;
  y: number;
  heading: number;
  halfU: number;
  halfV: number;
}

export interface SettlementLayer extends WorldLayer {
  /** True when a body of `radiusM` at tile (x, y) would stand inside a wall. The player's gate. */
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /** What was built, for tests and the frame budget. Null on a parcel with no village. */
  forms(): VillageForms | null;
  /**
   * Inside a house (C54). Open a house's door to the player or close it again (a house is open when
   * they were asked in, its door was forced, or nobody lives in it); cut away the one house the player
   * is in — its roof and walls above the head, so the room is seen from above — and the doorway of the
   * one they are at; and the furniture of that room, which a body walks round.
   */
  setOpen(plot: number, open: boolean): void;
  isOpen(plot: number): boolean;
  setCut(house: HouseFootprint | null, mode: "inside" | "door" | null): void;
  setFurniture(solids: readonly Solid[]): void;
  /** The house whose footprint a local point is inside, if any. */
  houseAt(x: number, y: number): HouseFootprint | null;
}

/**
 * Does one footprint stop a body of `radiusM` at a local point (C54)? A shut house is solid; an open
 * one is floor inside its walls and in its doorway, and wall everywhere else. Pure, for the tests.
 */
export function blockedByHouse(f: VillageForms["footprints"][number], isOpen: boolean, xm: number, ym: number, radiusM: number): boolean {
  if (Math.abs(xm - f.x) > f.halfAlong + f.halfAcross + radiusM || Math.abs(ym - f.y) > f.halfAlong + f.halfAcross + radiusM) return false;
  const dx = xm - f.x;
  const dy = ym - f.y;
  const c = Math.cos(f.heading);
  const s = Math.sin(f.heading);
  const along = dx * c + dy * s;
  const across = -dx * s + dy * c;
  if (!(Math.abs(along) < f.halfAlong + radiusM && Math.abs(across) < f.halfAcross + radiusM)) return false;
  if (f.house && isOpen && f.house.state !== "ruin") {
    const z = -across; // the drawing's across is the other way round from this one
    const inside = Math.abs(along) < f.house.depthM / 2 - 0.14 - radiusM && Math.abs(z) < f.house.widthM / 2 - 0.14 - radiusM;
    const doorway = along > 0 && Math.abs(z - f.house.door) < 0.5 - radiusM * 0.3;
    if (inside || doorway) return false;
  }
  return true;
}

/** How high the cutaway takes a house off when the player is inside it, above its floor. */
const CUT_Y = 1.45;
/** The top of the stone skirt a house stands on, above its floor line: the room's floor (C54). */
export const ROOM_FLOOR_M = 0.25;

/**
 * The cutaway (C54), in the houses' own shader: everything of the merged village inside one house's
 * box above `cutHalf.y`, and inside its doorway's hole, is not drawn. One house at a time; zero size
 * is off. The depth pass gets the same, or the cut roof would still shade the room.
 */
function cutaway(uniforms: { cutInv: { value: THREE.Matrix4 }; cutHalf: { value: THREE.Vector3 }; holeMin: { value: THREE.Vector3 }; holeMax: { value: THREE.Vector3 } }) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform mat4 cutInv;\nuniform vec3 cutHalf;\nuniform vec3 holeMin;\nuniform vec3 holeMax;\nvarying vec3 vCutWorld;")
      .replace(
        "void main() {",
        `void main() {
  vec3 cl = (cutInv * vec4(vCutWorld, 1.0)).xyz;
  if (cutHalf.x > 0.0 && abs(cl.x) < cutHalf.x && abs(cl.z) < cutHalf.z && cl.y > cutHalf.y) discard;
  if (holeMax.x > holeMin.x && all(greaterThan(cl, holeMin)) && all(lessThan(cl, holeMax))) discard;`,
      );
  };
}

/**
 * How lit the windows are at an hour: dark by day, on from just before sunset to just after sunrise
 * (0.75 and 0.25 on the sky's own clock), with a short ramp each side so a village does not switch on.
 */
export function windowLight(t: number): number {
  const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (t >= 0.5) return ramp(t, 0.72, 0.79);
  return 1 - ramp(t, 0.21, 0.28);
}

export function settlementLayer(options: { clock: WorldClock }): SettlementLayer {
  let forms: VillageForms | null = null;
  let frame: WorldFrame | null = null;
  const owned: { dispose(): void }[] = [];
  let glow: THREE.Mesh | null = null;
  let glowMaterial: THREE.MeshBasicMaterial | null = null;
  const open = new Set<number>();
  let solids: readonly Solid[] = [];
  const uniforms = {
    cutInv: { value: new THREE.Matrix4() },
    cutHalf: { value: new THREE.Vector3(0, 0, 0) },
    holeMin: { value: new THREE.Vector3(0, 0, 0) },
    holeMax: { value: new THREE.Vector3(0, 0, 0) },
  };
  const inBox = (f: { x: number; y: number; heading: number }, halfA: number, halfB: number, xm: number, ym: number, r: number) => {
    const dx = xm - f.x;
    const dy = ym - f.y;
    const c = Math.cos(f.heading);
    const s = Math.sin(f.heading);
    const along = dx * c + dy * s;
    const across = -dx * s + dy * c;
    return { hit: Math.abs(along) < halfA + r && Math.abs(across) < halfB + r, along, across };
  };

  return {
    name: "settlement",

    async build(ctx: LayerContext, signal: AbortSignal) {
      const village = ctx.region.village;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      forms = buildVillage(ctx.frame, village, village.settlement.throughDay);
      if (signal.aborted) return;

      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      material.onBeforeCompile = cutaway(uniforms);
      const built = new THREE.Mesh(forms.built, material);
      built.name = "settlement:built";
      built.castShadow = true;
      built.receiveShadow = true;
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = cutaway(uniforms);
      built.customDepthMaterial = depth;
      owned.push(depth);

      glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
      // The lit windows are cut with the walls they are in, or they hang in the air over the room.
      glowMaterial.onBeforeCompile = cutaway(uniforms);
      glow = new THREE.Mesh(forms.glow, glowMaterial);
      glow.name = "settlement:glow";

      owned.push(forms.built, forms.glow, material, glowMaterial);
      ctx.scene.add(built, glow);
    },

    update(_dt, ctx) {
      if (!glow || !glowMaterial) return;
      // The sky's hour, not the clock's: the sky is the one authority on what hour it is, and a sky
      // frozen for a measurement or a screenshot must not leave the windows lit at noon. The first
      // screenshot of Konreef did exactly that. The clock is the fallback for a world with no sky.
      const sky = ctx.layer<SkyLayer>("sky");
      const light = windowLight(sky ? sky.timeOfDay() : timeOfDay(options.clock, Date.now()));
      glow.visible = light > 0.02;
      glowMaterial.color.setScalar(0.35 + 0.65 * light);
    },

    blockedTile(x, y, radiusM) {
      if (!forms || !frame) return false;
      const [xm, ym] = frame.toLocalM(x, y);
      // An open house (C54): the room inside and the doorway into it are floor; the walls are walls.
      for (const f of forms.footprints) if (blockedByHouse(f, !!f.house && open.has(f.house.plot), xm, ym, radiusM)) return true;
      for (const o of solids) if (inBox(o, o.halfU, o.halfV, xm, ym, radiusM).hit) return true;
      return false;
    },

    setOpen(plot, isOpen) {
      if (isOpen) open.add(plot);
      else open.delete(plot);
    },
    isOpen: (plot) => open.has(plot),

    setCut(house, mode) {
      if (!house || !mode || !frame) {
        uniforms.cutHalf.value.set(0, 0, 0);
        uniforms.holeMin.value.set(0, 0, 0);
        uniforms.holeMax.value.set(0, 0, 0);
        return;
      }
      const m = placement(frame, house.x, house.y, house.heading, house.house.floor);
      uniforms.cutInv.value.copy(m).invert();
      const { depthM: d, widthM: w, door } = house.house;
      if (mode === "inside") uniforms.cutHalf.value.set(d / 2 + 0.8, CUT_Y, w / 2 + 0.8);
      else uniforms.cutHalf.value.set(0, 0, 0);
      uniforms.holeMin.value.set(d / 2 - 0.3, -0.05, door - 0.5);
      uniforms.holeMax.value.set(d / 2 + 0.3, 1.95, door + 0.5);
    },

    setFurniture(list) {
      solids = list;
    },

    houseAt(x, y) {
      if (!forms) return null;
      for (const f of forms.footprints) {
        if (!f.house) continue;
        if (inBox(f, f.house.depthM / 2, f.house.widthM / 2, x, y, 0).hit) return f as HouseFootprint;
      }
      return null;
    },

    forms: () => forms,

    dispose() {
      for (const o of owned) o.dispose();
      owned.length = 0;
      forms = null;
      glow = null;
      glowMaterial = null;
    },
  };
}
