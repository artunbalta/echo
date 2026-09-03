/**
 * The vertical slice: two stations, one act, one consequence (plan Section A, tasks S5, S6, S9).
 *
 * This is the whole point of the project reduced to the smallest thing that can prove it. You walk
 * into a cave mouth. That is a real choice with a real cost, so it is measured: an `enter_cave`
 * BehavioralEvent with risk_index 0.75 goes through telemetry into the persona posterior, which
 * returns a new mean for dominance, and the campfire on your parcel grows. Refusing is measured
 * too: linger at the threshold and walk away and it is `stay_safe` at risk 0.1, which is the same
 * channel moving the other way. Non-action is data, never a penalty.
 *
 * What is honest here and what would not be:
 *   - the fire moves ONLY on a posterior the measurement service really returned. When ML is
 *     mocked or unreachable the reaction stays at its base and the inspector says offline. A
 *     campfire that grew on a local guess would be exactly the fake I2 forbids.
 *   - the cave's own glimmer is a BEAT: a scripted consequence of the act, which fires whether or
 *     not anything is measuring. The inspector labels the two differently for that reason.
 *
 * Everything else the demo will eventually hold (the other beats, the day cycle, the presence, the
 * scatter) is deliberately absent: the slice is judged on whether the chain is real, not on how
 * much of the world exists.
 */

import * as THREE from "three";
import { PERSONA_AXIS_KEYS } from "@echo/shared";
import {
  biomeAtLocal,
  createTangentPatch,
  regionBound,
  walkableAt,
  type Biome,
} from "@echo/planet";

import { buildProp3D } from "../three/props3d";
import type { PropKind } from "../props";
import { SLICE_REACTION, reactionValue } from "./actionMap";
import { offsetLocalM, snapStations, SLICE_STATIONS, type SnapWorld, type SnappedStation } from "./demoStations";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { MeasureChain } from "./measure";
import type { ReactionReading } from "@/components/world/Inspector";

/** Tiles. Inside this ring of the cave mouth you have entered it. */
const ENTER_TILES = 1.5;
/** Tiles. Inside this ring you are at the threshold, deciding. */
const THRESHOLD_TILES = 3.4;
/** Milliseconds at the threshold before walking away counts as a refusal rather than a passer-by. */
const LINGER_MS = 700;
/** The axis the slice's one channel reads. */
const DOMINANCE = PERSONA_AXIS_KEYS.indexOf("dominance");

export interface SliceLayerOptions {
  chain: MeasureChain;
  /** Where the player is, in tiles. The player layer's position(). */
  playerTile: () => { x: number; y: number };
  /** Called whenever the campfire's reading changes, for the inspector. */
  onReaction?: (reading: ReactionReading) => void;
  /** Called when a beat fires, for a diegetic line. */
  onBeat?: (text: string) => void;
}

export interface SliceLayer extends WorldLayer {
  /** The stations as placed, for a test or a HUD. */
  stations(): SnappedStation[];
  /** The campfire's current reading, or null before the first posterior arrives. */
  reading(): ReactionReading | null;
}

export function sliceLayer(options: SliceLayerOptions): SliceLayer {
  const { chain, playerTile } = options;
  let placed: SnappedStation[] = [];
  const props = new Map<string, THREE.Group>();
  let cave: SnappedStation | null = null;
  let fire: SnappedStation | null = null;
  let fireGroup: THREE.Group | null = null;
  let glimmer: THREE.PointLight | null = null;

  // The beat's own memory. `committed` is per session: entering twice is one measured act, because
  // the second entry is no longer a decision about an unknown cave.
  let committed: "enter_cave" | "stay_safe" | null = null;
  let thresholdSince = 0;
  let insideThreshold = false;

  let reading: ReactionReading | null = null;
  let lastVersion: number | null = null;
  const tmp = new THREE.Vector3();

  const emit = (action: "enter_cave" | "stay_safe", risk01: number, decisionMs: number) => {
    if (committed) return;
    committed = action;
    options.onBeat?.(action === "enter_cave" ? "the dark takes the shape of a room" : "you keep to the light");
    if (action === "enter_cave" && glimmer) glimmer.intensity = 2.6;
    void chain.emitAction(action, {
      raw: { risk01, decision_latency_ms: Math.round(decisionMs) },
      target: { id: "cave_mouth", kind: "place" },
    });
  };

  return {
    name: "slice",

    async build(ctx: LayerContext, signal: AbortSignal) {
      // The stations are snapped against the same world the mover walks, so a station is never
      // somewhere the player cannot stand.
      const patch = createTangentPatch(ctx.region.cell, ctx.radiusKm);
      const bound = regionBound(ctx.region.cell, ctx.region.k, ctx.radiusKm);
      const world: SnapWorld = {
        walkable: (dx, dy) => {
          const [xm, ym] = offsetLocalM(ctx.region.spawn, dx, dy, ctx.frame.tileM);
          return walkableAt(patch, ctx.field, ctx.calibration.seaLevel, xm, ym, bound);
        },
        biome: (dx, dy): Biome => {
          const [xm, ym] = offsetLocalM(ctx.region.spawn, dx, dy, ctx.frame.tileM);
          return biomeAtLocal(patch, ctx.field, ctx.calibration, xm, ym);
        },
      };
      const all = snapStations(ctx.region.spawn, world, ctx.frame.tileM);
      placed = all.filter((s) => SLICE_STATIONS.includes(s.id));
      if (signal.aborted) return;

      const spawnTile = ctx.region.spawnTile;
      for (const s of placed) {
        const group = buildProp3D(s.kind as PropKind, s.id);
        // Station offsets are tiles from the SPAWN; the frame is tiles from the anchor centre.
        ctx.frame.toScene(spawnTile[0] + s.x, spawnTile[1] + s.y, 0, tmp);
        group.position.copy(tmp);
        // The props are authored at avatar scale in tile units, like the body.
        group.scale.setScalar(ctx.frame.tileM);
        group.name = s.id;
        if (signal.aborted) return;
        ctx.scene.add(group);
        props.set(s.id, group);
        if (s.id === "cave_mouth") cave = s;
        if (s.id === "campfire") {
          fire = s;
          fireGroup = group;
          // The one warm pooled light in a cool dusk, per the art bible. It is also the channel:
          // its reach grows with the fire.
          const warm = new THREE.PointLight(0xffb877, 1.4, 14 * ctx.frame.tileM, 2);
          warm.position.set(0, 1.1 * ctx.frame.tileM, 0);
          group.add(warm);
        }
      }

      if (cave) {
        // The cave's glimmer: a beat, not a reaction. It brightens when you go in, with ML up or
        // down, and the inspector says which kind of thing it is.
        glimmer = new THREE.PointLight(0xc79bf0, 0.9, 9 * ctx.frame.tileM, 2);
        glimmer.position.set(0, 1.2 * ctx.frame.tileM, 0);
        props.get("cave_mouth")?.add(glimmer);
      }
    },

    update(_dt, ctx) {
      const spawnTile = ctx.region.spawnTile;
      const p = playerTile();

      // The locomotion channel: the sampler wants TILE positions, which is what we have.
      chain.feedPosition(p.x, p.y);

      // ── the beat ──
      if (cave && !committed) {
        const cx = spawnTile[0] + cave.x;
        const cy = spawnTile[1] + cave.y;
        const d = Math.hypot(p.x - cx, p.y - cy);
        const now = performance.now();
        if (d <= ENTER_TILES) {
          emit("enter_cave", 0.75, insideThreshold ? now - thresholdSince : 0);
        } else if (d <= THRESHOLD_TILES) {
          if (!insideThreshold) {
            insideThreshold = true;
            thresholdSince = now;
          }
        } else if (insideThreshold) {
          const lingered = now - thresholdSince;
          insideThreshold = false;
          // Walking past is not a refusal. Standing at the mouth and then turning away is.
          if (lingered >= LINGER_MS) emit("stay_safe", 0.1, lingered);
        }
      }

      // ── the reaction ──
      const post = chain.posterior();
      const base = 1;
      if (!post || post.mocked || !post.mu) {
        // Offline: the fire sits at its base and says nothing. Never a guess.
        if (fireGroup) fireGroup.scale.setScalar(ctx.frame.tileM * base);
        if (reading !== null) {
          reading = null;
          options.onReaction?.({ channel: SLICE_REACTION.channel, base, offset: 0, result: base, eventId: null, version: null });
        }
        return;
      }
      const mu = post.mu[DOMINANCE] ?? 0;
      const result = reactionValue(SLICE_REACTION, mu);
      if (post.version !== lastVersion || !reading) {
        lastVersion = post.version ?? null;
        // Which event this reading answered: the newest measured one whose version is the one the
        // fire is showing. This is what makes the inspector's trace a fact rather than a caption.
        const source = [...chain.log()].reverse().find((e) => e.route === "behavioral" && e.version === post.version);
        reading = {
          channel: SLICE_REACTION.channel,
          base,
          offset: result - base,
          result,
          eventId: source?.id ?? null,
          version: post.version ?? null,
        };
        options.onReaction?.(reading);
      }
      if (fireGroup) fireGroup.scale.setScalar(ctx.frame.tileM * result);
      if (fire && fireGroup) {
        const light = fireGroup.children.find((c) => c instanceof THREE.PointLight) as THREE.PointLight | undefined;
        if (light) light.intensity = 1.4 * result;
      }
    },

    dispose() {
      for (const g of props.values()) {
        g.removeFromParent();
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
        });
      }
      props.clear();
      fireGroup = null;
      glimmer = null;
      cave = null;
      fire = null;
    },

    stations: () => placed,
    reading: () => reading,
  };
}
