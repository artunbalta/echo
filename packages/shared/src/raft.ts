/**
 * The raft's physics — how the MANNER of a build becomes a fact about the world.
 *
 * The design rule (ECHO is not a game): the player never sees a number. There is no hull-points bar, no
 * "quality: 62%", no XP. There is a pile of wood, an amount of time you chose to spend on the lashings, and
 * an ocean. What effort buys is REACH — how much open water the raft puts behind it before the sea starts
 * winning — and in this archipelago reach is *who you can meet*. The failure mode is not sinking or dying;
 * it is the current quietly walking you back to the beach you shoved off from.
 *
 * Every function here is PURE and is imported by BOTH the client prediction (PixiWorld.stepLocal) and the
 * authoritative server (WorldRoom.integrate). That shared import is not a nicety: if the client did not
 * predict the current identically, the server would correct it 20×/sec and the player would snap.
 */

/** The minimum viable lashing. Below this the wood does not hold together and there is no raft — this is
 *  the launch gate. A hasty raft IS a raft: it launches, it floats, it just does not go far. */
export const MIN_BUILD_MS = 4200;
/** The ceiling of held work. Past this, more time buys nothing (the wood is as tight as wood gets). */
export const LAVISH_BUILD_MS = 15000;
/** Past this the build reads as care rather than construction — the ML's `decoration` cue starts here. */
export const SOLID_MS = 9000;

/** Reach floor/ceiling, in tiles of open water, before the sea begins to push back.
 *  The FLOOR matters: the widest nearest-neighbour crossing in the archipelago is ~32.6 tiles, so a floor
 *  of 40 guarantees that ANY raft, however scrappy, can always make at least one hop. Haste must never be
 *  able to strand a player — haste is a style we measure, not a mistake we punish. */
export const REACH_FLOOR = 40;
export const REACH_SPAN = 60;

/** Hull speed at sea (tiles/sec). Walking is WORLD.MOVE_SPEED = 4. A true raft is quick; a scrap raft
 *  wallows — you feel the difference in your hands before you ever see a shore. */
export const HULL_SPEED_FLOOR = 3.4;
export const HULL_SPEED_SPAN = 0.8;

/** Where the current starts to bite (as a fraction of reach) and where it reaches full strength. */
export const STRAIN_ONSET = 0.75;
export const STRAIN_FULL = 1.1;
/** Full-strength current, tiles/sec. Above every hull speed, so past your reach you always lose ground —
 *  but you are never frozen and never seized: paddling still slows the drift. */
export const DRIFT_SPEED = 4.6;

/** Raft ageing: tiles of open water before 1/e of the seaworthiness is gone. A better-built raft also
 *  lasts longer (the user's "dayanıklılığı daha uzun süre çalışmalı"), so effort pays twice. */
export const LIFESPAN_FLOOR = 140;
export const LIFESPAN_SPAN = 320;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * SEAWORTHINESS s0 ∈ [0,1] — what the build was worth, fixed at the moment of launch.
 *
 * The three channels are INDEPENDENT on purpose. An earlier draft coupled them (wood only counted if you
 * also worked it in), which meant eight planks lashed hastily scored exactly the same as five — i.e. the
 * player who *tried to do more* got nothing for it. That is precisely the complaint this whole change
 * exists to answer, so wood pays on its own, work pays on its own, and doing both pays most.
 *
 *   planks  — how much driftwood you carried to the shore (needed..total)
 *   workMs  — how long you actually held the action key working the wood (MIN..LAVISH)
 *   grit01  — whether you re-engaged after the lashing slipped, instead of giving up
 */
export function seaworthiness(
  planks: number,
  workMs: number,
  grit01: number,
  needed: number,
  total: number,
): number {
  const workFrac = clamp01((workMs - MIN_BUILD_MS) / (LAVISH_BUILD_MS - MIN_BUILD_MS));
  const woodFrac = total > needed ? clamp01((planks - needed) / (total - needed)) : 0;
  return clamp01(0.45 * workFrac + 0.4 * woodFrac + 0.15 * clamp01(grit01));
}

/** Tiles of open water this raft can cross before it is 1/e as seaworthy as it was. */
export function lifespan(s0: number): number {
  return LIFESPAN_FLOOR + LIFESPAN_SPAN * clamp01(s0);
}

/** The raft AGES. `waterTiles` is the lifetime open-water distance it has carried you. This is the
 *  "durability" the player feels: the raft that made the long hop last week no longer quite makes it.
 *  It decays toward zero but the reach FLOOR means an old raft is still a raft — beach it and rebuild. */
export function effectiveSeaworthiness(s0: number, waterTiles: number): number {
  const s = clamp01(s0);
  if (s <= 0) return 0;
  return s * Math.exp(-Math.max(0, waterTiles) / lifespan(s));
}

/** How far this raft carries you, in tiles of open water, before the sea starts taking it back. */
export function reachTiles(sEff: number): number {
  return REACH_FLOOR + REACH_SPAN * clamp01(sEff);
}

/** Tiles/sec under sail. */
export function hullSpeed(sEff: number): number {
  return HULL_SPEED_FLOOR + HULL_SPEED_SPAN * clamp01(sEff);
}

/** How hard the sea is pushing back right now: 0 until you have spent 75% of your reach, 1 past 110%.
 *  A non-positive reach means "no raft here" — which must read as NO CURRENT, not as maximum strain.
 *  (Returning 1 would make driftVector haul the player toward an unset departure point at the map's
 *  origin at full speed, from any path that ever enabled sailing without also setting a raft.) */
export function strain01(spent: number, reach: number): number {
  if (reach <= 0) return 0;
  return clamp01((spent / reach - STRAIN_ONSET) / (STRAIN_FULL - STRAIN_ONSET));
}

/**
 * The current. Past your reach the sea carries you back toward the land you departed from — it never
 * sinks you, never seizes the controls, never clears `sailing` out from under you mid-ocean (which would
 * brick the player, since water blocks on foot). You simply stop making headway, and then you lose it.
 * Returns tiles/sec to add to the player's own motion this step.
 */
export function driftVector(
  x: number,
  y: number,
  departX: number,
  departY: number,
  spent: number,
  reach: number,
): { x: number; y: number } {
  const c = strain01(spent, reach);
  if (c <= 0) return { x: 0, y: 0 };
  const dx = departX - x;
  const dy = departY - y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return { x: 0, y: 0 };
  const v = c * DRIFT_SPEED;
  return { x: (dx / d) * v, y: (dy / d) * v };
}
