/**
 * The shared ocean geometry — the SINGLE source of truth for where the 100 archipelago islands sit
 * as real, bounded landmasses in the one rendered sea, used identically by the client renderer
 * (generateOcean), the client movement-collision (PixiWorld.blockedAt via the collision array), and
 * the AUTHORITATIVE server collision (WorldRoom.integrate). One function, three consumers — so the
 * coastline you see, the wall you bump, and the wall the server enforces can never disagree.
 *
 * The archipelago slots (archipelago.ts) live in a 128-unit coordinate field; the shared ocean is
 * WORLD.MAP_WIDTH tiles, so slots are scaled up by SCALE = MAP/EXTENT. At the shipped 768-tile ocean
 * that spaces neighbours ~36 tiles apart with radius-13 islands (~10 tiles of clear water between) —
 * each island a real place to roam (room for the Flow-0 affordances with space to move), separated
 * by an open stretch of sea you must SAIL across (water is a movement barrier; see
 * WorldRoom.integrate + PixiWorld.blockedAt).
 */
import { WORLD } from "./world.js";
import { archipelagoSlots, islandSlot, OCEAN as ARCH } from "./archipelago.js";

/** Island land radius, in shared-ocean (WORLD.MAP) tiles. Diameter 26 → room for the Flow-0 hill,
 *  thicket, tide pool, and scattered objects with comfortable space to move between them. */
export const OCEAN_ISLAND_R = 13;
/** The sand-ring coastline width (tiles) drawn around each island's grass. */
export const OCEAN_BEACH_W = 1.5;

const SCALE = WORLD.MAP_WIDTH / ARCH.EXTENT; // 128-extent slot coords → WORLD.MAP ocean tiles

/** This player's home island centre in ocean tiles (their archipelago slot, scaled). */
export function oceanIslandCenter(index: number): { x: number; y: number } {
  const s = islandSlot(index);
  return { x: s.x * SCALE, y: s.y * SCALE };
}

// Memoize the 100 pre-generated centres — oceanLandAt is called per-move on the server.
let _centres: { x: number; y: number }[] | null = null;
export function oceanIslandCenters(): { x: number; y: number }[] {
  if (!_centres) _centres = archipelagoSlots().map((s) => ({ x: s.x * SCALE, y: s.y * SCALE }));
  return _centres;
}

/** Is (x,y) (ocean tiles) ON LAND — i.e. within OCEAN_ISLAND_R (+pad) of any island centre? Water
 *  (everything else) is a movement barrier. `pad` lets the beach ring count as land if desired. */
export function oceanLandAt(x: number, y: number, pad = 0): boolean {
  const r = OCEAN_ISLAND_R + pad;
  const r2 = r * r;
  for (const c of oceanIslandCenters()) {
    const dx = x - c.x;
    if (dx > r || dx < -r) continue; // cheap reject
    const dy = y - c.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}
