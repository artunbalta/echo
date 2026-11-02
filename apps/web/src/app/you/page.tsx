/**
 * Five minutes to you (DECISIONS C72): the world shown to someone, start to finish, in one sitting.
 *
 * There is no such page unless the demo is switched on (`ECHO_DEMO=1` with a host, `lib/demo.ts`): a
 * 404 for everyone, everywhere else. Built from the same planet as a parcel, so what a visitor walks is
 * the world, not a picture of it.
 */
import { notFound } from "next/navigation";
import { PARCEL_REGION_K } from "@echo/planet";

import YouDemo from "@/components/demo/YouDemo";
import { demoConfig } from "@/lib/demo";
import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export default function You() {
  const cfg = demoConfig();
  if (!cfg) notFound();
  const { world, calibration, commons } = planet();
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-ink">
      <YouDemo
        hostName={cfg.hostName}
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
