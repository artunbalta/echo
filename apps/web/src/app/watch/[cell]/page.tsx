/**
 * Watching your echo from outside while it keeps your body in a village room (DECISIONS C105).
 *
 * `/watch/<cell>?room=<code>`: the village of that room's world, its people and the room's bodies, and a
 * camera on the body your echo keeps. Nothing of yours is in the room while you watch, nothing is
 * measured, and the echo is not told. The door of the room offers this page once you have left it with
 * your echo standing in; the room itself decides whether there is anything of yours to watch.
 *
 * 100dvh for the reason `/parcel` gives (DECISIONS C23).
 */
import type { Metadata } from "next";
import { PARCEL_REGION_K } from "@echo/planet";

import WatchVisit from "@/components/world/WatchVisit";
import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Watching your echo", robots: { index: false, follow: false } };

export default async function WatchPage({ params }: { params: Promise<{ cell: string }> }) {
  const { cell } = await params;
  const { world, calibration, commons } = planet();
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-ink">
      <WatchVisit
        cell={cell}
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
