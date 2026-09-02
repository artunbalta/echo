/**
 * The planet itself: everything a renderer needs, and nothing the registry knows.
 *
 * Split out from /api/planet/status because they cost three orders of magnitude apart. This is
 * terrain, a calibrated sea level and the twelve commons, about two hundred milliseconds and the
 * same answer forever. Status has to seed 284,004 cells to count what is left, which is 33 seconds
 * on a cold instance, and the landing page waited for it to draw a planet that does not depend on
 * any of it.
 */
import { NextResponse } from "next/server";

import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export async function GET() {
  const { world, calibration, commons } = planet();
  return NextResponse.json({
    seed: world.seed,
    radiusKm: world.radiusKm,
    startResolution: world.startResolution,
    floorResolution: world.floorResolution,
    triggerFraction: world.triggerFraction,
    minLandFraction: world.minLandFraction,
    commonsResolution: world.commonsResolution ?? world.startResolution,
    seaLevel: calibration.seaLevel,
    peakElevation: calibration.peakElevation,
    commons: Object.fromEntries(commons.choices.map((c) => [c.cell, c.name])),
  });
}
