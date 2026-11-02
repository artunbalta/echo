/**
 * The echo's body (DECISIONS C64): your own body, faint, standing where your echo last met someone
 * while you were away, turned towards you. Walk up to it and it tells you what it did (`onReached`).
 *
 * It is the same rig as the player (`buildCharacter("you", true)`), every material made translucent
 * and a little cold, so it reads as you and not as anyone else. Only the stranger it belongs to sees
 * it: an echo's outing is told to its own stranger, nobody else.
 */
import * as THREE from "three";

import { buildCharacter, poseCharacter, type CharacterParts } from "../three/character";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";
import { yawFromHeading } from "./playerLayer";

export interface EchoBodyLayer extends WorldLayer {
  /** Where it waits, in this parcel's local metres; null takes it away. */
  set(at: { x: number; y: number } | null): void;
  at(): { x: number; y: number } | null;
  /** Called once when the stranger comes within reach of it. */
  onReached(fn: (() => void) | null): void;
}

/** Close enough to be spoken to. */
export const REACH_M = 2.6;

export function echoBodyLayer(): EchoBodyLayer {
  let where: { x: number; y: number } | null = null;
  let parts: CharacterParts | null = null;
  let dirty = false;
  let reached: (() => void) | null = null;
  let told = false;
  let t = 0;
  let fade = 0;

  const clear = () => {
    if (!parts) return;
    parts.root.removeFromParent();
    parts.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    parts = null;
  };

  const build = (ctx: LayerContext) => {
    clear();
    if (!where) return;
    const built = buildCharacter("you", true);
    built.root.name = "echo-body";
    built.root.scale.setScalar(ctx.frame.tileM);
    // Translucent and a little cold: you, but not quite here. Each mesh its own material, so fading
    // one never touches the player's.
    built.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = (o.material as THREE.MeshLambertMaterial).clone();
      m.transparent = true;
      m.opacity = 0;
      m.depthWrite = false;
      m.emissive = new THREE.Color(0x6f7fb8);
      m.emissiveIntensity = 0.35;
      o.material = m;
      o.castShadow = false;
    });
    poseCharacter(built, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
    ctx.scene.add(built.root);
    parts = built;
    fade = 0;
  };

  return {
    name: "echo-body",

    async build(ctx, signal) {
      if (signal.aborted) return;
      if (where) build(ctx);
    },

    update(dt, ctx) {
      if (dirty) {
        dirty = false;
        build(ctx);
      }
      if (!parts || !where) return;
      t += dt;
      fade = Math.min(1, fade + dt / 1.5);
      const [tx, ty] = ctx.frame.fromLocalM(where.x, where.y);
      const ground = ctx.frame.heightAtTile(tx, ty);
      parts.root.position.set(tx * ctx.frame.tileM, Math.max(0, ground) + Math.sin(t * 1.3) * 0.02 * ctx.frame.tileM, ty * ctx.frame.tileM);
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      if (player) {
        const at = player.position();
        const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
        // Turned towards you, as someone waiting would be.
        parts.root.rotation.y = yawFromHeading(Math.atan2(my - where.y, mx - where.x));
        if (!told && Math.hypot(mx - where.x, my - where.y) <= REACH_M) {
          told = true;
          reached?.();
        }
      }
      const opacity = 0.55 * fade * (0.9 + 0.1 * Math.sin(t * 2.1));
      parts.root.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.MeshLambertMaterial).opacity = opacity;
      });
    },

    set(at) {
      if (at && where && at.x === where.x && at.y === where.y) return;
      where = at;
      told = false;
      dirty = true;
    },
    at: () => where,
    onReached(fn) {
      reached = fn;
    },

    dispose() {
      clear();
    },
  };
}
