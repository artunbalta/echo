/**
 * The camera on a body your echo keeps, from outside (DECISIONS C105).
 *
 * The watching page has the village and its people and the room's bodies, and no body of the person's own:
 * the player layer is there only for its camera. Every frame its body is hidden and put where the watched
 * body is drawn, so the camera the player layer already drives (behind, above, round the ground) follows
 * the echo. Input is off, nothing is measured: the page has no walk, no acts, no moments of its own.
 */
import type { WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";

export function watchLayer(target: (now: number) => { x: number; y: number } | null): WorldLayer {
  return {
    name: "watch",
    async build() {
      // Nothing of its own to draw: it moves the camera the player layer already has.
    },
    update(_dt, ctx) {
      const player = ctx.layer<PlayerLayer>("player");
      if (!player) return;
      const body = ctx.scene.getObjectByName("player");
      if (body) body.visible = false;
      const at = target(performance.now());
      if (!at) return;
      const [tx, ty] = ctx.frame.fromLocalM(at.x, at.y);
      player.setPosition(tx, ty);
    },
  };
}
