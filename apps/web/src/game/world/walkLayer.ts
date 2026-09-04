/**
 * The walk layer: the only thing measuring a person who is only walking (task A1).
 *
 * The chain's locomotion sampler is the least fakeable channel there is and it wants TILE positions
 * every frame. Until now the one thing feeding it was `sliceLayer`, which exists on the demo cell
 * and nowhere else, so a person walking their own parcel was measured by nothing at all while the
 * same person standing on DEMO_CELL was measured continuously. That is the gap this layer closes,
 * and it closes it in the list BOTH routes build from, so there is one feeder rather than one per
 * route and no way for a new route to arrive without one.
 *
 * It also keeps a TALLY of what it fed, which is the other half of its reason to exist. On ground
 * with no stations there is no bounded act and so no posterior move to report (DECISIONS.md C15),
 * and the honest thing left to report is the walking itself: how far, how long stood still, how
 * much ground. The tally is computed from the same positions the sampler saw, so the panel and the
 * wire are describing one walk rather than two.
 *
 * CONSENT GATES THE TALLY, not merely the sending. `feedPosition` is already inert before accept,
 * because the sampler does not exist until the chain arms. The tally is held to the same line:
 * while the chain is not armed there is no tally at all, `tally()` answers null, and a decline or a
 * revoke drops what had accumulated exactly as `revoke()` drops the chain's own log. A counter that
 * kept running behind a "no" would be the measurement the consent card promised was not happening,
 * and it would be worse for being invisible.
 *
 * Nothing here leaves the browser. The tally is never sent, never buffered for sending, and never
 * read by anything but the inspector; what goes on the wire is what the sampler emits, unchanged.
 */

import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { MeasureChain } from "./measure";

/**
 * Tiles per second below which the body counts as standing still rather than moving.
 *
 * This is the locomotion sampler's own idle test, converted: telemetry.ts calls a 250 ms sample
 * that moved less than 0.05 tiles a dwell point, which is this speed. The two agree by derivation
 * rather than by coincidence, so a second standing still on screen is a second the sampler also
 * called still.
 */
const STILL_TILES_PER_S = 0.2;

/**
 * The tile memory's bound, which is the sampler's own MAX_VISITED. It is generous for a parcel:
 * 30,000 tiles at TILE_M is 76,800 m2, and a person walking at the mover's run speed for an hour
 * covers about a tenth of that. Past the bound the area stops rising, which is why `capped` exists
 * rather than a number that quietly stops being true.
 */
const MAX_TILES = 30_000;

export interface WalkTally {
  /** Path length, not displacement: walking a circle back to the spawn is not zero metres walked. */
  distanceM: number;
  /** Milliseconds spent under STILL_TILES_PER_S. */
  dwellMs: number;
  /** Distinct tiles touched, rounded to the tile the sampler's novelty set rounds to. */
  tiles: number;
  /** `tiles` as ground: each is one tileM square. */
  areaM2: number;
  /** True once the tile memory hit MAX_TILES: `tiles` and `areaM2` are then a floor, not a total. */
  capped: boolean;
  /**
   * Milliseconds of measured world time. It is summed from the frame delta, so a tab left hidden
   * adds nothing: requestAnimationFrame stops there, and time nobody spent in the world is not
   * dwell. This is time on screen, not wall clock, and the panel says so.
   */
  measuredMs: number;
}

export interface WalkLayerOptions {
  chain: MeasureChain;
  /** Where the player is, in tiles. The player layer's position(). */
  playerTile: () => { x: number; y: number };
}

export interface WalkLayer extends WorldLayer {
  /** Required here, not optional as the host allows: a walk layer that does not update feeds nothing. */
  update(dt: number, ctx: LayerContext): void;
  /**
   * What has been measured, or null when nothing is being measured: the chain is not armed, or the
   * world has not finished building. Null is a state the inspector reports, never a zero it draws.
   */
  tally(): WalkTally | null;
}

export function walkLayer(options: WalkLayerOptions): WalkLayer {
  const { chain, playerTile } = options;

  // Metres per tile comes from the world that was built, never from TILE_M here: a mount may pass
  // its own tileM, and a tally that converted with a constant would report a different walk from
  // the one the world drew. Null until build, which is also what makes tally() null until then.
  let tileM: number | null = null;

  let last: { x: number; y: number } | null = null;
  let distanceTiles = 0;
  let dwellMs = 0;
  let measuredMs = 0;
  let visited: Set<string> | null = null;
  let capped = false;
  let wasArmed = false;

  /** Drop everything held. Called on a consent change and on dispose; see the paragraph above. */
  const forget = () => {
    last = null;
    distanceTiles = 0;
    dwellMs = 0;
    measuredMs = 0;
    visited = null;
    capped = false;
  };

  return {
    name: "walk",

    async build(ctx: LayerContext, signal: AbortSignal) {
      // Nothing is allocated and nothing enters the scene, so there is nothing an abort could
      // leak; the check is here because the contract is the contract and a later line that does
      // allocate must not be the first one to think about it.
      if (signal.aborted) return;
      tileM = ctx.frame.tileM;
      wasArmed = chain.armed();
      forget();
    },

    update(dt, _ctx) {
      const p = playerTile();

      // The locomotion channel: the sampler wants TILE positions, which is what we have. Inert
      // until consent arms the chain, which is why it is safe to call it before the gate below.
      chain.feedPosition(p.x, p.y);

      // The reset hangs off the TRANSITION, not off the not-armed frame, so it holds even for a no
      // and a yes with no frame in between: a decline drops what was held, exactly as revoke()
      // drops the chain's log, and an accept never credits ground that was covered while the
      // answer was no.
      const armed = chain.armed();
      if (armed !== wasArmed) {
        wasArmed = armed;
        forget();
      }
      if (!armed) return;
      if (!visited) visited = new Set<string>();

      measuredMs += dt * 1000;
      if (last && dt > 0) {
        const step = Math.hypot(p.x - last.x, p.y - last.y);
        if (step / dt < STILL_TILES_PER_S) dwellMs += dt * 1000;
        else distanceTiles += step;
      }
      last = { x: p.x, y: p.y };

      if (visited.size < MAX_TILES) visited.add(`${Math.round(p.x)},${Math.round(p.y)}`);
      else capped = true;
    },

    tally() {
      if (tileM === null || !visited || !chain.armed()) return null;
      return {
        distanceM: distanceTiles * tileM,
        dwellMs,
        tiles: visited.size,
        areaM2: visited.size * tileM * tileM,
        capped,
        measuredMs,
      };
    },

    dispose() {
      tileM = null;
      wasArmed = false;
      forget();
    },
  };
}
