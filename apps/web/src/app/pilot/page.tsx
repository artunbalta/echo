/**
 * The pilot village (DECISIONS C75): a group of friends, each come twice, meet six classic paradigms in
 * the world, and say how they see each other.
 *
 * There is no such page unless the pilot is switched on (`ECHO_PILOT=1` with `ECHO_PILOT_CODE`,
 * `lib/pilot.ts`): a 404 for everyone, everywhere else. Built from the same planet as a parcel, so what
 * they walk is the world, not a picture of it.
 */
import { notFound } from "next/navigation";
import { PARCEL_REGION_K } from "@echo/planet";

import PilotFlow from "@/components/pilot/PilotFlow";
import { pilotConfig } from "@/lib/pilot";
import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export default function Pilot() {
  const cfg = pilotConfig();
  if (!cfg) notFound();
  const { world, calibration, commons } = planet();
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-ink">
      <PilotFlow
        cell={cfg.cell}
        k={PARCEL_REGION_K}
        seed={world.seed}
        seaLevel={calibration.seaLevel}
        peakElevation={calibration.peakElevation}
        radiusKm={world.radiusKm}
        commons={commons.cells}
      />
    </main>
  );
}
