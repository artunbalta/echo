/**
 * What village stands on a cell, if any, in a sentence (DECISIONS C41): its name, what kind of place
 * it is, how many live there today. The landing's parcel card asks this when someone picks a cell, so
 * a picked hexagon can say "Konreef · fishing village · 46 people" rather than "A place in the world."
 *
 * READ-ONLY AND DERIVED. Everything here is a function of the seed and today's world day (L2): the
 * same answer for everyone who asks, computed from `planet()`'s cached field and commons in a few
 * milliseconds. Nothing is stored, nobody is identified, and nothing is spent, which is why it needs
 * neither a subject nor a rate limit (⚑30 is about routes that spend).
 */
import { NextResponse } from "next/server";
import {
  geographySampler,
  settlementAt,
  settlementSummary,
  worldClock,
  worldDayIndex,
  PLANET_PARAMS,
  WORLD_EPOCH,
} from "@echo/planet";

import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

/** An H3 cell id is fifteen lowercase hex digits. Anything else is not asked of the planet. */
const CELL = /^[0-9a-f]{15}$/;

export async function GET(req: Request) {
  const cell = new URL(req.url).searchParams.get("cell") ?? "";
  if (!CELL.test(cell)) return NextResponse.json({ error: "bad_cell" }, { status: 400 });

  const { field, calibration, commons, world } = planet();
  let village = null;
  try {
    // The same resolution guard villageAt keeps: settlements live on start-resolution cells.
    if (parseInt(cell[1], 16) === PLANET_PARAMS.startResolution) {
      const day = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
      const geography = geographySampler(field, calibration, world.radiusKm, { commons: commons.cells })(cell);
      const s = settlementAt(world.seed, cell, geography, day);
      village = s ? settlementSummary(s, day) : null;
    }
  } catch {
    return NextResponse.json({ error: "bad_cell" }, { status: 400 });
  }
  return NextResponse.json({ village }, { headers: { "cache-control": "public, max-age=60" } });
}
