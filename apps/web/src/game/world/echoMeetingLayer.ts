/**
 * Two echoes on the green (DECISIONS C71): yours and your friend's, faint, standing where they met while
 * you were both away, turned to each other. Walk up and they say it again, a bubble over whichever is
 * speaking (`say`), while the page plays the voices.
 *
 * Yours is your own body, as the outing's echo is (`buildCharacter("you", true)`); your friend's is a
 * body of its own, the same for them every time. Both translucent, so neither reads as anyone standing
 * there now. Only the two people it belongs to ever see it, each on their own page.
 */
import * as THREE from "three";

import { buildCharacter, poseCharacter, type CharacterParts } from "../three/character";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";
import { yawFromHeading } from "./playerLayer";
import { REACH_M } from "./echoBodyLayer";

export interface MeetingScene {
  me: { x: number; y: number };
  friend: { x: number; y: number };
  /** Whose body the friend's is: the same look for the same person. */
  friendId: string;
}

export interface EchoMeetingLayer extends WorldLayer {
  set(scene: MeetingScene | null): void;
  scene(): MeetingScene | null;
  /** Called once when the stranger comes within reach of the two. */
  onReached(fn: (() => void) | null): void;
  /** A bubble over one of them: said aloud, or (only ever your own) what it held back. Null clears it. */
  say(who: "me" | "friend", text: string | null, held?: boolean): void;
}

export function echoMeetingLayer(): EchoMeetingLayer {
  let scene: MeetingScene | null = null;
  let bodies: { me: CharacterParts; friend: CharacterParts } | null = null;
  let dirty = false;
  let reached: (() => void) | null = null;
  let told = false;
  let t = 0;
  let fade = 0;
  const bubbles: Record<"me" | "friend", HTMLDivElement | null> = { me: null, friend: null };
  const head = new THREE.Vector3();

  const ghost = (parts: CharacterParts, tint: number) => {
    parts.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = (o.material as THREE.MeshLambertMaterial).clone();
      m.transparent = true;
      m.opacity = 0;
      m.depthWrite = false;
      m.emissive = new THREE.Color(tint);
      m.emissiveIntensity = 0.35;
      o.material = m;
      o.castShadow = false;
    });
  };

  const clear = () => {
    if (!bodies) return;
    for (const parts of [bodies.me, bodies.friend]) {
      parts.root.removeFromParent();
      parts.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    bodies = null;
  };

  const build = (ctx: LayerContext) => {
    clear();
    if (!scene) return;
    const me = buildCharacter("you", true);
    const friend = buildCharacter(scene.friendId, false);
    me.root.name = "echo-meeting:me";
    friend.root.name = "echo-meeting:friend";
    for (const [parts, tint] of [[me, 0x6f7fb8], [friend, 0xb88f6f]] as const) {
      parts.root.scale.setScalar(ctx.frame.tileM);
      ghost(parts, tint);
      poseCharacter(parts, { facing: "down", moving: false, animTime: 0, bob: 0, lean: 0, carrying: false, activity: null });
      ctx.scene.add(parts.root);
    }
    bodies = { me, friend };
    fade = 0;
    told = false;
  };

  const bubble = (host: HTMLElement, mine: boolean) => {
    const el = document.createElement("div");
    el.dataset.echoMeetingBubble = mine ? "me" : "friend";
    el.style.cssText =
      "position:absolute;left:0;top:0;pointer-events:none;z-index:14;display:none;transform:translate(-50%,-100%);" +
      "max-width:240px;padding:5px 10px;border-radius:12px;color:#1c1326;font:12px/1.35 ui-sans-serif,system-ui,sans-serif;" +
      "text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    host.appendChild(el);
    return el;
  };

  const place = (ctx: LayerContext, parts: CharacterParts, at: { x: number; y: number }, toward: { x: number; y: number }) => {
    const [tx, ty] = ctx.frame.fromLocalM(at.x, at.y);
    const ground = ctx.frame.heightAtTile(tx, ty);
    parts.root.position.set(tx * ctx.frame.tileM, Math.max(0, ground) + Math.sin(t * 1.3) * 0.02 * ctx.frame.tileM, ty * ctx.frame.tileM);
    parts.root.rotation.y = yawFromHeading(Math.atan2(toward.y - at.y, toward.x - at.x));
  };

  return {
    name: "echo-meeting",

    async build(ctx, signal) {
      if (signal.aborted) return;
      const host = ctx.renderer.domElement.parentElement;
      if (host && !bubbles.me) {
        bubbles.me = bubble(host, true);
        bubbles.friend = bubble(host, false);
      }
      if (scene) build(ctx);
    },

    update(dt, ctx) {
      if (dirty) {
        dirty = false;
        build(ctx);
      }
      if (!bodies || !scene) return;
      t += dt;
      fade = Math.min(1, fade + dt / 1.5);
      // Turned to each other: they are talking, not waiting for you.
      place(ctx, bodies.me, scene.me, scene.friend);
      place(ctx, bodies.friend, scene.friend, scene.me);
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      if (player && !told) {
        const at = player.position();
        const [mx, my] = ctx.frame.toLocalM(at.x, at.y);
        const midX = (scene.me.x + scene.friend.x) / 2;
        const midY = (scene.me.y + scene.friend.y) / 2;
        if (Math.hypot(mx - midX, my - midY) <= REACH_M + 1) {
          told = true;
          reached?.();
        }
      }
      const opacity = 0.55 * fade * (0.9 + 0.1 * Math.sin(t * 2.1));
      for (const parts of [bodies.me, bodies.friend]) {
        parts.root.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.MeshLambertMaterial).opacity = opacity;
        });
      }
    },

    beforeRender(ctx) {
      if (!bodies) return;
      const canvas = ctx.renderer.domElement;
      for (const who of ["me", "friend"] as const) {
        const el = bubbles[who];
        if (!el || el.dataset.text === undefined) continue;
        const parts = bodies[who];
        // A hand above the head, as the villagers' own bubbles sit (villagersLayer `overHead`).
        head.copy(parts.root.position);
        head.y += 2.4 * (ctx.frame.tileM / 1.6);
        head.project(ctx.camera);
        if (head.z > 1) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "block";
        el.style.left = `${((head.x + 1) / 2) * canvas.clientWidth}px`;
        el.style.top = `${((1 - head.y) / 2) * canvas.clientHeight}px`;
      }
    },

    dispose() {
      clear();
      for (const who of ["me", "friend"] as const) bubbles[who]?.remove();
      bubbles.me = bubbles.friend = null;
    },

    set(next) {
      const same =
        next && scene && next.friendId === scene.friendId && next.me.x === scene.me.x && next.me.y === scene.me.y && next.friend.x === scene.friend.x && next.friend.y === scene.friend.y;
      if (same || (!next && !scene)) return;
      scene = next;
      dirty = true;
      if (!next) {
        for (const who of ["me", "friend"] as const) {
          const el = bubbles[who];
          if (el) {
            el.style.display = "none";
            delete el.dataset.text;
          }
        }
      }
    },

    scene() {
      return scene;
    },

    onReached(fn) {
      reached = fn;
    },

    say(who, text, held = false) {
      const el = bubbles[who];
      if (!el) return;
      if (text === null) {
        el.style.display = "none";
        delete el.dataset.text;
        return;
      }
      el.dataset.text = text;
      el.dataset.held = held ? "1" : "0";
      el.textContent = text;
      // Said aloud: the villagers' own bubble. Held back: faint and dashed, a thought, and only ever yours.
      el.style.background = held ? "rgba(244,233,208,.45)" : "rgba(244,233,208,.92)";
      el.style.border = held ? "1px dashed rgba(28,19,38,.45)" : "none";
      el.style.fontStyle = held ? "italic" : "normal";
    },
  };
}
