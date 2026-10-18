/**
 * A stranger's own house on their own land (DECISIONS C59), as anyone on the parcel sees it.
 *
 * The house is the home route's record (`/api/home`), handed in by the page (`setHome`), and drawn by
 * stage: stakes and string, a foundation, walls, a roof, a door, in the colours it was painted, with
 * what was set down inside (`villageGeometry.ts` `homeForms`). It sits level on the highest ground
 * under it, as the village's houses do.
 *
 * WHAT IT ADDS TO THE WORLD'S RULES:
 *
 * - **Walls stop a body**, except at the doorway, and so do the solid things set down inside.
 * - **The roof lifts off** while the stranger is inside, so the camera can see what they are doing.
 * - **Things within reach** (`things`) for the interact layer: your own land, where a house could go
 *   if the site is good; the house itself; and each thing set down in it.
 */
import * as THREE from "three";
import { HOME, ITEMS, PLACEABLE, fromHouse, inWall, insideHome, siteProblem, toHouse, type Home, type Thing } from "@echo/planet";

import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";
import { homeForms } from "./villageGeometry";

export interface HomeLayer extends WorldLayer {
  /** The house on this parcel, if any, and whether the stranger looking is its owner. */
  setHome(state: { home: Home | null; owner: boolean }): void;
  home(): Home | null;
  owner(): boolean;
  /** The stranger is inside the walls. */
  inside(): boolean;
  /** Where a house could go right here, for the owner with none yet: null when it cannot. */
  site(): { x: number; y: number; facing: number } | null;
  /** Things within reach of a body, for the interact layer. */
  things(mx: number, my: number): Thing[];
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /**
   * Whether a point, in local metres, is on the ground the house has cleared: its footprint and a
   * margin round it. The undergrowth there is gone, and the trees there neither stop a body nor
   * catch the camera.
   */
  clears(x: number, y: number): boolean;
}

/** How far round the house the ground is cleared, metres. */
const CLEAR_M = 1.5;

interface ScatterBuckets extends WorldLayer {
  readonly buckets: ReadonlyMap<string, { readonly matrices: Float32Array; readonly instances: number }>;
  invalidate(): void;
}

export function homeLayer(): HomeLayer {
  let state: { home: Home | null; owner: boolean } = { home: null, owner: false };
  const group = new THREE.Group();
  group.name = "home";
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  let shell: THREE.Mesh | null = null;
  /** The same shell with its walls cut to waist height, shown instead while the stranger is inside. */
  let cut: THREE.Mesh | null = null;
  let roof: THREE.Mesh | null = null;
  let furniture: THREE.Mesh | null = null;
  let ctxRef: LayerContext | null = null;
  let dirty = false;
  let isInside = false;
  let site: { x: number; y: number; facing: number } | null = null;
  let since = 1;

  const clear = () => {
    for (const m of [shell, cut, roof, furniture]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    shell = cut = roof = furniture = null;
  };

  const rebuild = (ctx: LayerContext) => {
    clear();
    const h = state.home;
    if (!h) return;
    const forms = homeForms(h);
    const mesh = (g: THREE.BufferGeometry, name: string) => {
      const m = new THREE.Mesh(g, material);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    shell = mesh(forms.shell, "home:shell");
    cut = mesh(homeForms(h, 0.95).shell, "home:cut");
    cut.visible = false;
    roof = forms.roof ? mesh(forms.roof, "home:roof") : null;
    furniture = forms.furniture ? mesh(forms.furniture, "home:furniture") : null;
    // Level on the highest ground under it.
    let top = -Infinity;
    for (const [u, v] of [[0, 0], [HOME.depthM / 2, HOME.widthM / 2], [HOME.depthM / 2, -HOME.widthM / 2], [-HOME.depthM / 2, HOME.widthM / 2], [-HOME.depthM / 2, -HOME.widthM / 2]]) {
      const p = fromHouse(h, u, v);
      const [tx, ty] = ctx.frame.fromLocalM(p.x, p.y);
      top = Math.max(top, ctx.frame.heightAtTile(tx, ty));
    }
    const [tx, ty] = ctx.frame.fromLocalM(h.x, h.y);
    group.position.set(tx * ctx.frame.tileM, Math.max(0, top), ty * ctx.frame.tileM);
    group.rotation.y = h.facing;
    // Clear the ground: whatever grew where the house stands is gone (scaled to nothing, as a thing
    // taken is). Scene x is east and z is south.
    const scatter = ctx.layer<ScatterBuckets>("scatter");
    if (scatter?.buckets) {
      for (const b of scatter.buckets.values()) {
        for (let i = 0; i < b.instances; i++) {
          if (!clearsAt(h, b.matrices[i * 16 + 12]!, -b.matrices[i * 16 + 14]!)) continue;
          for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) b.matrices[i * 16 + k] = 0;
        }
      }
      scatter.invalidate();
    }
    // And the grass: grown again round the player, around the house.
    ctx.layer<WorldLayer & { regrow(): void }>("meadow")?.regrow();
  };

  return {
    name: "home",

    async build(ctx, signal) {
      if (signal.aborted) return;
      ctxRef = ctx;
      ctx.scene.add(group);
      if (state.home) rebuild(ctx);
    },

    update(dt, ctx) {
      if (dirty) {
        dirty = false;
        rebuild(ctx);
      }
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      const h = state.home;
      if (!player) return;
      const at = player.position();
      const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
      isInside = h !== null && h.stage >= 2 && insideHome(h, mx, my);
      if (roof) roof.visible = !isInside;
      if (shell) shell.visible = !isInside;
      if (cut) cut.visible = isInside;
      // Where a house could go, for the owner who has none: checked a few times a second, where they stand.
      since += dt;
      if (since < 0.3) return;
      since = 0;
      site = null;
      if (!state.owner || h || player.aboard()) return;
      const facing = -player.mover().heading;
      const ground = {
        cell: ctx.region.cell,
        patch: ctx.frame.patch,
        standable: (x: number, y: number) => ctx.frame.walkableTile(...ctx.frame.fromLocalM(x, y)),
        heightAt: (x: number, y: number) => ctx.frame.heightAtTile(...ctx.frame.fromLocalM(x, y)),
        plan: ctx.region.village?.plan ?? null,
      };
      if (siteProblem(ground, mx, my, facing) === null) site = { x: mx, y: my, facing };
    },

    setHome(next) {
      state = { home: next.home ? structuredClone(next.home) : null, owner: next.owner };
      dirty = true;
      if (ctxRef && !state.home) clear();
    },
    home: () => state.home,
    owner: () => state.owner,
    inside: () => isInside,
    site: () => site,

    things(mx, my) {
      const h = state.home;
      if (!h) return site ? [{ ref: "land", kind: "land", x: mx, y: my, sizeM: 0, owners: [], name: "your land" }] : [];
      if (!state.owner) return [];
      const out: Thing[] = [];
      if (isInside) {
        // Inside, the house is always to hand. With something in your hands it is what you are reaching
        // for: to set the thing down, or paint, or dye with it. Empty-handed, a thing set down near
        // you is nearer, to pick up or turn.
        const holding = ctxRef?.layer<WorldLayer & PlayerLayer>("player")?.holding() ?? false;
        out.push({ ref: "home", kind: "home", x: mx + (holding ? 0 : 1.2), y: my, sizeM: 0, owners: [], name: "your house" });
        if (holding) return out;
        h.items.forEach((it, i) => {
          const p = fromHouse(h, it.u, it.v);
          out.push({ ref: `furnishing:${i}`, kind: "furnishing", x: p.x, y: p.y, sizeM: 0.3, owners: [], name: ITEMS[it.kind]?.name ?? it.kind });
        });
        return out;
      }
      // Outside, the house is as near as its nearest wall.
      const { u, v } = toHouse(h, mx, my);
      const edge = fromHouse(h, Math.max(-HOME.depthM / 2, Math.min(HOME.depthM / 2, u)), Math.max(-HOME.widthM / 2, Math.min(HOME.widthM / 2, v)));
      out.push({ ref: "home", kind: "home", x: edge.x, y: edge.y, sizeM: 0, owners: [], name: "your house" });
      return out;
    },

    clears: (x, y) => (state.home ? clearsAt(state.home, x, y) : false),

    blockedTile(x, y, radiusM) {
      const h = state.home;
      if (!h || !ctxRef) return false;
      const lx = x * ctxRef.frame.tileM;
      const ly = -y * ctxRef.frame.tileM;
      if (inWall(h, lx, ly, radiusM)) return true;
      if (!insideHome(h, lx, ly)) return false;
      const { u, v } = toHouse(h, lx, ly);
      for (const it of h.items) {
        const p = PLACEABLE[it.kind];
        if (!p?.solid) continue;
        const c = Math.cos(it.turn);
        const s = Math.sin(it.turn);
        const du = u - it.u;
        const dv = v - it.v;
        const a = du * c + dv * s;
        const b = -du * s + dv * c;
        if (Math.abs(a) < p.du / 2 + radiusM && Math.abs(b) < p.dv / 2 + radiusM) return true;
      }
      return false;
    },

    dispose() {
      clear();
      group.removeFromParent();
      material.dispose();
      ctxRef = null;
    },
  };
}

function clearsAt(h: Home, x: number, y: number): boolean {
  const { u, v } = toHouse(h, x, y);
  return Math.abs(u) < HOME.depthM / 2 + CLEAR_M && Math.abs(v) < HOME.widthM / 2 + CLEAR_M;
}
