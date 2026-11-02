/**
 * Inside a house (DECISIONS C54): the room, drawn while the stranger is in it, and the door that lets
 * them in.
 *
 * WHICH DOORS OPEN. A house is open to the stranger when its people asked them in today (the talk
 * route's `invited`, as a window event), when its door has been forced (C45's mark, as the interact
 * layer has it), or when nobody lives in it. Otherwise its door is a wall, as it always was — and
 * knocking, looking in at the window and forcing it are where they were.
 *
 * WHAT IS DRAWN. The room (`roomOf`, in the planet) is one instanced box mesh and one for the fire,
 * built when the stranger steps in and dropped when they step out: two draw calls while inside a
 * house, none otherwise. The house they are in is cut away above the head (the settlement layer's
 * shader), so the room is seen from above, the way a doll's house is. The people of the house who are
 * at home are the villagers layer's to draw, asleep in their beds or at the table (`setIndoors`).
 *
 * Presentation only. Who is home is the schedule's; what the room holds is the household's; the
 * doorway's being open is a fact about this stranger, not about the house.
 */

import * as THREE from "three";
import { plotState, roomHeading, roomOf, roomToLocal, worldDayIndex, type FurnitureKind, type Room, type WorldClock } from "@echo/planet";

import type { InteractLayer } from "./interactLayer";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import { ROOM_FLOOR_M, type HouseFootprint, type SettlementLayer, type Solid } from "./settlementLayer";
import { placement } from "./villageGeometry";
import type { VillagersLayer } from "./villagersLayer";

export interface InteriorLayer extends WorldLayer {
  /** The plot the stranger is inside, and the room drawn there, or null. */
  inside(): { plot: number; room: Room } | null;
  /** Ask the stranger in to a house for today (the talk route's answer, or a test); `host` is who asked. */
  invite(plot: number, host?: string): void;
}

/** How a house came to be open to the stranger, for what is measured when they step in. */
export type EntryWay = "invited" | "forced" | "empty";

const COLOUR: Record<FurnitureKind, number> = {
  floor: 0x7a5a3a, wall: 0xc4b498, hearth: 0x6e6a64, fire: 0xffa040, table: 0x6a4a2e, bench: 0x5e4228,
  bed: 0x5a3e28, blanket: 0x8a5a4a, cradle: 0x7a5a36, chest: 0x5a3a24, shelf: 0x6a4a2e, pot: 0x9a5a3a,
  nets: 0x8a8a70, loom: 0x7a5a36, anvil: 0x3a3a3c, wheel: 0x8a6a4a, sacks: 0xb8a070, tools: 0x5a5a5a,
  "door-down": 0x4a3020, stool: 0x6a4a2e, dust: 0x8a8070,
};
const BLANKETS = [0x8a5a4a, 0x4f5f7a, 0x7a7a4a, 0xa89a7e] as const;
const MAX_ITEMS = 96;

export function interiorLayer(options: { clock: WorldClock }): InteriorLayer {
  let mesh: THREE.InstancedMesh | null = null;
  let fire: THREE.InstancedMesh | null = null;
  let current: { plot: number; room: Room; key: string } | null = null;
  const invited = new Map<number, number>(); // plot → the world day they were asked in
  const entered = new Set<number>();
  let onInvite: ((e: Event) => void) | null = null;
  let hostOf: { plot: number; host: string } | null = null;
  const m = new THREE.Matrix4();
  const t = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();

  const way = (f: HouseFootprint, day: number, interact: InteractLayer | undefined): EntryWay | null => {
    if (interact?.marks().get(`house:${f.house.plot}`)?.kind === "forced") return "forced";
    if (invited.get(f.house.plot) === day) return "invited";
    if (f.house.state !== "lived") return "empty";
    return null;
  };

  return {
    name: "interior",

    async build(ctx: LayerContext, signal: AbortSignal) {
      if (!ctx.region.village || signal.aborted) return;
      const material = new THREE.MeshLambertMaterial({ emissive: new THREE.Color(0x2a1a0e) });
      mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_ITEMS);
      mesh.name = "interior:room";
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      fire = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffa040 }), 2);
      fire.name = "interior:fire";
      fire.frustumCulled = false;
      fire.visible = false;
      ctx.scene.add(mesh, fire);
      if (typeof window !== "undefined") {
        onInvite = (e: Event) => {
          const detail = (e as CustomEvent<{ house?: string; host?: string }>).detail;
          const plot = Number((detail?.house ?? "").replace(/^house:/, ""));
          if (!Number.isInteger(plot)) return;
          invited.set(plot, worldDayIndex(options.clock, Date.now()));
          if (detail?.host) ctx.layer<VillagersLayer>("villagers")?.host(detail.host, plot);
        };
        window.addEventListener("echo:invited", onInvite);
      }
    },

    update(_dt, ctx) {
      const v = ctx.region.village;
      const settlement = ctx.layer<SettlementLayer>("settlement");
      const villagers = ctx.layer<VillagersLayer>("villagers");
      const interact = ctx.layer<InteractLayer>("interact");
      if (!v || !settlement || !villagers || !mesh || !fire) return;
      const day = worldDayIndex(options.clock, Date.now());
      const forms = settlement.forms();
      if (!forms) return;

      // Which doors are open to this stranger today.
      for (const f of forms.footprints) {
        if (!f.house) continue;
        settlement.setOpen(f.house.plot, way(f as HouseFootprint, day, interact) !== null);
      }

      if (hostOf) {
        villagers.host(hostOf.host, hostOf.plot);
        hostOf = null;
      }
      const me = villagers.playerPosition();
      const here = me ? settlement.houseAt(me.x, me.y) : null;
      const inOpen = here && settlement.isOpen(here.house.plot) && here.house.state !== "ruin" ? here : null;
      if (!inOpen) {
        // At the door of an open house: its doorway is a hole, to see into.
        let door: HouseFootprint | null = null;
        if (me) {
          for (const f of forms.footprints) {
            if (!f.house || !settlement.isOpen(f.house.plot) || f.house.state === "ruin") continue;
            const at = roomToLocal(v.plan.plots[f.house.plot], f.house.depthM / 2, f.house.door);
            if (Math.hypot(at.x - me.x, at.y - me.y) < 3.5) door = f as HouseFootprint;
          }
        }
        settlement.setCut(door, door ? "door" : null);
        if (current) {
          current = null;
          mesh.visible = false;
          fire.visible = false;
          settlement.setFurniture([]);
          villagers.setIndoors(null);
        }
        return;
      }

      // Inside: the room, built once for this house, day and mark.
      const plot = v.plan.plots[inOpen.house.plot];
      const forced = interact?.marks().get(`house:${plot.index}`)?.kind === "forced";
      const key = `${plot.index}|${day}|${forced}|${v.changes.length}`;
      if (current?.key !== key) {
        const room = roomOf(v.settlement, v.plan, plot, day, { door: inOpen.house.door, hearth: inOpen.house.hearth }, forced);
        current = { plot: plot.index, room, key };
        // The room stands on the skirt's top, not on the floor line the walls are drawn from.
        const house = placement(ctx.frame, plot.x, plot.y, plot.facing, inOpen.house.floor + ROOM_FLOOR_M);
        let n = 0;
        let f = 0;
        let beds = 0;
        const solids: Solid[] = [];
        for (const it of room.items) {
          q.setFromAxisAngle(up, it.turn ?? 0);
          t.compose(new THREE.Vector3(it.u, it.y + it.dy / 2, it.v), q, new THREE.Vector3(it.du, it.dy, it.dv));
          m.multiplyMatrices(house, t);
          if (it.kind === "fire") {
            if (f < 2) fire.setMatrixAt(f++, m);
            continue;
          }
          if (n >= MAX_ITEMS) continue;
          mesh.setMatrixAt(n, m);
          mesh.setColorAt(n, colour.set(it.kind === "blanket" ? BLANKETS[beds++ % BLANKETS.length] : COLOUR[it.kind]));
          n++;
          if (it.solid) {
            const c = roomToLocal(plot, it.u, it.v);
            solids.push({ x: c.x, y: c.y, heading: roomHeading(plot, it.turn ?? 0), halfU: it.du / 2, halfV: it.dv / 2 });
          }
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        fire.count = f;
        fire.instanceMatrix.needsUpdate = true;
        settlement.setFurniture(solids);
        villagers.setIndoors({ plot, room, floor: inOpen.house.floor + ROOM_FLOOR_M, forced });
        // The first time in, the way they came in is the measurement's (the parcel page sends it).
        if (!entered.has(plot.index) && typeof window !== "undefined") {
          entered.add(plot.index);
          const how = way(inOpen, day, interact) ?? "empty";
          const lived = plotState(v.settlement, plot, day) === "lived";
          window.dispatchEvent(new CustomEvent("echo:entered", { detail: { house: `house:${plot.index}`, how, lived, family: room.beds.size } }));
        }
      }
      settlement.setCut(inOpen, "inside");
      mesh.visible = true;
      fire.visible = fire.count > 0;
      // The fire flickers.
      (fire.material as THREE.MeshBasicMaterial).color.setHSL(0.07 + Math.sin(performance.now() / 180) * 0.01, 1, 0.55 + Math.sin(performance.now() / 97) * 0.06);
    },

    inside: () => (current ? { plot: current.plot, room: current.room } : null),
    invite(plot, host) {
      invited.set(plot, worldDayIndex(options.clock, Date.now()));
      if (host) hostOf = { plot, host };
    },

    dispose() {
      if (onInvite && typeof window !== "undefined") window.removeEventListener("echo:invited", onInvite);
      for (const o of [mesh, fire]) {
        if (!o) continue;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      mesh = null;
      fire = null;
    },
  };
}
