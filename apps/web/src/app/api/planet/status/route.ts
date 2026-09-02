/** What is left of the planet, and the one sentence section 9 puts on the screen. */
import { NextResponse } from "next/server";

import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export async function GET() {
  const { registry, world, calibration, commons } = planet();
  const status = await registry.status();
  return NextResponse.json({
    status,
    world: {
      seed: world.seed,
      radiusKm: world.radiusKm,
      startResolution: world.startResolution,
      floorResolution: world.floorResolution,
      triggerFraction: world.triggerFraction,
      seaLevel: calibration.seaLevel,
      peakElevation: calibration.peakElevation,
      commonsResolution: world.commonsResolution ?? world.startResolution,
      commons: Object.fromEntries(commons.choices.map((c) => [c.cell, c.name])),
    },
    claimed: await registry.recentlyClaimed(1500),
  });
}
