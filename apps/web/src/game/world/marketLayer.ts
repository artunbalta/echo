/**
 * The market stall on the green (DECISIONS C58), on market day only, with what the traders brought.
 *
 * The days, the place and the goods are the village's market (`markets.ts`), the same for everyone
 * who looks. The traders who stand behind it are the villagers layer's: their day already takes
 * them there (`schedule.ts`). One mesh, one draw, made again only when the goods change.
 */
import * as THREE from "three";
import { isMarketDay, stallOf, stockOn, worldDayIndex, type WorldClock } from "@echo/planet";

import type { LayerContext, WorldLayer } from "./PlanetWorld";
import { stallForm } from "./villageGeometry";

export interface MarketLayer extends WorldLayer {
  /** For tests and the page: the day the stall is up for, and what is on it; null when it is not up. */
  shown(): { day: number; goods: string[] } | null;
  /** Whether a body of this radius at a tile position would be in the stall (the player asks). */
  blockedTile(x: number, y: number, radiusM: number): boolean;
}

export function marketLayer(options: { clock: WorldClock }): MarketLayer {
  let mesh: THREE.Mesh | null = null;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  let showing: { day: number; goods: string[] } | null = null;
  let since = 1;
  /** The stall's table, in local metres, while it is up: a box along its heading. */
  let table: { x: number; y: number; heading: number } | null = null;
  let tileM = 1;

  const refresh = (ctx: LayerContext) => {
    const v = ctx.region.village ?? null;
    const m = v?.plan.market ?? null;
    const day = worldDayIndex(options.clock, Date.now());
    const up = m !== null && isMarketDay(m, day);
    tileM = ctx.frame.tileM;
    if (!up) {
      if (mesh) mesh.visible = false;
      showing = null;
      table = null;
      return;
    }
    const goods = stockOn(m!, day);
    if (showing && showing.day === day && mesh) {
      mesh.visible = true;
      return;
    }
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    const at = stallOf(v!.plan);
    table = at;
    const [tx, ty] = ctx.frame.fromLocalM(at.x, at.y);
    mesh = new THREE.Mesh(stallForm(goods), material);
    mesh.name = "market:stall";
    mesh.castShadow = true;
    mesh.position.set(tx * ctx.frame.tileM, Math.max(0, ctx.frame.heightAtTile(tx, ty)), ty * ctx.frame.tileM);
    mesh.rotation.y = at.heading;
    ctx.scene.add(mesh);
    showing = { day, goods };
  };

  return {
    name: "market",
    async build(ctx, signal) {
      if (signal.aborted) return;
      refresh(ctx);
    },
    update(dt, ctx) {
      since += dt;
      if (since < 1) return;
      since = 0;
      refresh(ctx);
    },
    shown: () => showing,
    blockedTile(x, y, radiusM) {
      if (!table) return false;
      // Tile to local metres (tiles run south), then into the table's own axes: 0.9 m deep, 2.6 m long.
      const dx = x * tileM - table.x;
      const dy = -y * tileM - table.y;
      const along = dx * Math.cos(table.heading) + dy * Math.sin(table.heading);
      const across = -dx * Math.sin(table.heading) + dy * Math.cos(table.heading);
      return Math.abs(along) < 0.45 + radiusM && Math.abs(across) < 1.3 + radiusM;
    },
    dispose() {
      if (mesh) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh = null;
      }
      material.dispose();
      showing = null;
    },
  };
}
