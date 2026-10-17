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
import { buildVillage, type VillageForms } from "./villageGeometry";

export interface SettlementLayer extends WorldLayer {
  /** True when a body of `radiusM` at tile (x, y) would stand inside a wall. The player's gate. */
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /** What was built, for tests and the frame budget. Null on a parcel with no village. */
  forms(): VillageForms | null;
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

  return {
    name: "settlement",

    async build(ctx: LayerContext, signal: AbortSignal) {
      const village = ctx.region.village;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      forms = buildVillage(ctx.frame, village, village.settlement.throughDay);
      if (signal.aborted) return;

      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const built = new THREE.Mesh(forms.built, material);
      built.name = "settlement:built";
      built.castShadow = true;
      built.receiveShadow = true;

      glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
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
      for (const f of forms.footprints) {
        const dx = xm - f.x;
        const dy = ym - f.y;
        if (Math.abs(dx) > f.halfAlong + f.halfAcross + radiusM || Math.abs(dy) > f.halfAlong + f.halfAcross + radiusM) continue;
        const c = Math.cos(f.heading);
        const s = Math.sin(f.heading);
        const along = dx * c + dy * s;
        const across = -dx * s + dy * c;
        if (Math.abs(along) < f.halfAlong + radiusM && Math.abs(across) < f.halfAcross + radiusM) return true;
      }
      return false;
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
