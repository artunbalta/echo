/**
 * What is within reach (DECISIONS C45): the nearest thing a person could act on, and the marks acts
 * have left on the world.
 *
 * EVERYTHING DRAWN IS A CANDIDATE. The village's things come from `villageThings` (the same list the
 * act route checks a reference against); every scatter instance comes from the scatter's own
 * placement, gridded so a frame's question is a handful of cells; the water's edge is probed around
 * the body; a villager within arm's length is a thing too. Which verbs each affords is the registry's
 * (`@echo/planet` affordances), so a class added to the scatter is reachable here the day it has
 * verbs, and `affordances.test.ts` will not let it ship without them.
 *
 * THE MARKS. A trampled field, a forced door, flowers at a tidied grave, fresh spoil at a worked mine:
 * one small merged mesh over the village, rebuilt when the marks change (`buildMarks`). A thing that was
 * taken — a shell, a stone, the driftwood — is hidden in the scatter itself, for everyone, until its
 * mark heals.
 *
 * It decides nothing and sends nothing: `Interact.tsx` does the acting, the measuring and the asking.
 */

import * as THREE from "three";
import {
  activeEffects,
  parseScatterRef,
  scatterRef,
  verbsOf,
  villageThings,
  worldDayIndex,
  type Thing,
  type Verb,
  type WorldClock,
  type WorldEffect,
} from "@echo/planet";

import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { VillagersLayer } from "./villagersLayer";
import type { InteriorLayer } from "./interiorLayer";
import type { HomeLayer } from "./homeLayer";
import type { AnimalsLayer } from "./animalsLayer";
import { buildMarks } from "./villageGeometry";

export interface NearThing extends Thing {
  verbs: readonly Verb[];
  /** Metres from the body to the thing's edge. */
  distanceM: number;
}

export interface InteractLayer extends WorldLayer {
  /** The nearest thing within reach of the body, or null. */
  nearest(): NearThing | null;
  /** The marks standing today, by thing reference. */
  marks(): ReadonlyMap<string, WorldEffect>;
  /** Replace the marks (from the page's fetch). */
  setMarks(effects: readonly WorldEffect[]): void;
  /** One new mark, made here. */
  addMark(effect: WorldEffect): void;
  /** How many villagers out of doors could see an act at this point: the event's audience. */
  audience(x: number, y: number): number;
  /** The body, planet-local metres. */
  bodyAt(): { x: number; y: number } | null;
}

interface PlayerLike {
  position(): { x: number; y: number };
}

interface ScatterLike extends WorldLayer {
  placement(): { placed: { classId: string; x: number; y: number }[] } | null;
  readonly buckets: ReadonlyMap<string, { readonly matrices: Float32Array; readonly instances: number }>;
  invalidate(): void;
}

/** The farthest any verb reaches, plus the biggest thing: beyond this nothing is considered. */
const LOOK_M = 9;
const GRID_M = 8;
/**
 * How close the water must be to be a thing, metres: inside the water verbs' 3 m reach, not on it. At
 * exactly 3 m the point is a rounding away from the reach. Measured from a body at (84.4, −707.7),
 * as on Drurnscree's beach, the diagonals come out 3.000000000000014 m and are out of reach, and the
 * first water found ended the search. Wherever the sea lay on a diagonal, the water's edge was not
 * there, and the raft could not be launched (found launching it, C57).
 */
const WATER_M = 2.5;

export function interactLayer(options: { clock: WorldClock }): InteractLayer {
  let frame: WorldFrame | null = null;
  let things: Thing[] = [];
  let thingsDay = -1;
  let thingsFor: unknown = null;
  const grid = new Map<string, { classId: string; x: number; y: number }[]>();
  let near: NearThing | null = null;
  let body: { x: number; y: number } | null = null;
  let since = 0;
  let marks = new Map<string, WorldEffect>();
  let all: WorldEffect[] = [];
  let markMesh: THREE.Mesh | null = null;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  let ctxRef: LayerContext | null = null;
  const hidden = new Set<string>();

  const cellOf = (x: number, y: number) => `${Math.floor(x / GRID_M)},${Math.floor(y / GRID_M)}`;

  const refreshThings = (ctx: LayerContext, day: number) => {
    const v = ctx.region.village;
    if (!v) {
      things = [];
      return;
    }
    if (thingsDay === day && thingsFor === v) return;
    things = villageThings(v.settlement, v.plan, day);
    thingsDay = day;
    thingsFor = v;
  };

  /** Hide one scatter instance, for a thing that has been taken. */
  const hide = (ctx: LayerContext, ref: string) => {
    if (hidden.has(ref)) return;
    const s = parseScatterRef(ref);
    const scatter = ctx.layer<ScatterLike>("scatter");
    const b = s && scatter?.buckets.get(s.classId);
    if (!s || !b || !frame) return;
    const [tx, ty] = frame.fromLocalM(s.x, s.y);
    const sx = tx * frame.tileM;
    const sz = ty * frame.tileM;
    let best = -1;
    let bestD = 1.2;
    for (let i = 0; i < b.instances; i++) {
      const d = Math.hypot(b.matrices[i * 16 + 12] - sx, b.matrices[i * 16 + 14] - sz);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) b.matrices[best * 16 + k] = 0;
    scatter!.invalidate();
    hidden.add(ref);
  };

  const redraw = () => {
    const ctx = ctxRef;
    if (!ctx || !frame) return;
    const day = worldDayIndex(options.clock, Date.now());
    marks = activeEffects(all, day);
    if (markMesh) {
      ctx.scene.remove(markMesh);
      markMesh.geometry.dispose();
      markMesh = null;
    }
    const v = ctx.region.village;
    if (v) {
      const g = buildMarks(frame, v, marks, day);
      if (g) {
        markMesh = new THREE.Mesh(g, material);
        markMesh.name = "interact:marks";
        markMesh.receiveShadow = true;
        ctx.scene.add(markMesh);
      }
    }
    for (const [ref, e] of marks) if (e.kind === "taken") hide(ctx, ref);
  };

  return {
    name: "interact",

    async build(ctx, signal) {
      if (signal.aborted) return;
      ctxRef = ctx;
      frame = ctx.frame;
      grid.clear();
      const placed = ctx.layer<ScatterLike>("scatter")?.placement()?.placed ?? [];
      for (const p of placed) {
        if (verbsOf(p.classId).length === 0) continue;
        const key = cellOf(p.x, p.y);
        const list = grid.get(key);
        if (list) list.push(p);
        else grid.set(key, [p]);
      }
      refreshThings(ctx, worldDayIndex(options.clock, Date.now()));
      redraw();
    },

    update(dt, ctx) {
      if (!frame) return;
      since += dt;
      if (since < 0.15) return;
      since = 0;
      const player = ctx.layer<WorldLayer & PlayerLike>("player");
      if (!player) return;
      const at = player.position();
      const [mx, my] = frame.toLocalM(at.x, at.y);
      body = { x: mx, y: my };
      refreshThings(ctx, worldDayIndex(options.clock, Date.now()));

      let best: NearThing | null = null;
      const consider = (t: Thing) => {
        const verbs = verbsOf(t.kind);
        if (verbs.length === 0) return;
        const reach = Math.max(...verbs.map((v) => v.reachM));
        const d = Math.max(0, Math.hypot(t.x - mx, t.y - my) - t.sizeM);
        if (d > reach) return;
        if (!best || d < best.distanceM) best = { ...t, verbs, distanceM: d };
      };
      // Your own land, your house, and what is set down in it (C59). First, so that a tuft of grass at
      // your feet does not stand between you and the house you mean to mark out: a tie goes to the first.
      const homeNow = ctx.layer<HomeLayer>("home");
      for (const t of homeNow?.things(mx, my) ?? []) consider(t);
      // Inside a house (C54), its own door is behind you: you do not knock on it from within.
      const within = ctx.layer<InteriorLayer>("interior")?.inside()?.plot;
      for (const t of things) if (Math.hypot(t.x - mx, t.y - my) < LOOK_M + t.sizeM && t.ref !== `house:${within}`) consider(t);
      const gx = Math.floor(mx / GRID_M);
      const gy = Math.floor(my / GRID_M);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const p of grid.get(`${gx + i},${gy + j}`) ?? []) {
            if (homeNow?.clears(p.x, p.y)) continue;
            const ref = scatterRef(p.classId, p.x, p.y);
            if (marks.get(ref)?.kind === "taken") continue;
            consider({ ref, kind: p.classId, x: p.x, y: p.y, sizeM: 0.4, owners: [], name: p.classId });
          }
        }
      }
      // The water's edge: the nearest point round the body that is sea.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const wx = mx + Math.cos(a) * WATER_M;
        const wy = my + Math.sin(a) * WATER_M;
        const [tx, ty] = frame.fromLocalM(wx, wy);
        if (frame.heightAtTile(tx, ty) < 0) {
          consider({ ref: scatterRef("water", wx, wy), kind: "water", x: wx, y: wy, sizeM: 0, owners: [], name: "the water's edge" });
          break;
        }
      }
      // An animal within reach (C55): a dog, a goat, a hen.
      const beast = ctx.layer<AnimalsLayer>("animals")?.nearest(mx, my, 2.6);
      if (beast) consider({ ref: `animal:${beast.id}`, kind: beast.kind, x: beast.x, y: beast.y, sizeM: 0.3, owners: [], name: beast.name ?? (beast.kind === "hen" ? "the hens" : beast.kind === "goat" ? "a goat" : "a dog") });
      // Somebody within arm's length is the nearest thing; further off, `T` still talks to them.
      const v = ctx.layer<VillagersLayer>("villagers")?.nearest();
      if (v && v.distanceM < 3) {
        const p = ctx.region.village?.settlement.people.find((q) => q.id === v.id);
        if (p) consider({ ref: `villager:${p.id}`, kind: "villager", x: mx + v.distanceM, y: my, sizeM: 0, owners: [p.id], name: p.given });
      }
      near = best;
    },

    nearest: () => near,
    marks: () => marks,
    setMarks(effects) {
      all = [...effects];
      redraw();
    },
    addMark(effect) {
      all = [...all.filter((e) => e.id !== effect.id), effect];
      redraw();
    },
    audience(x, y) {
      return ctxRef?.layer<VillagersLayer>("villagers")?.watchers(x, y, 30) ?? 0;
    },
    bodyAt: () => body,

    dispose() {
      if (markMesh) {
        markMesh.geometry.dispose();
        markMesh = null;
      }
      material.dispose();
      ctxRef = null;
    },
  };
}
