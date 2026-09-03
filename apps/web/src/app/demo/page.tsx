/**
 * The landing demo (plan Section A, the vertical slice).
 *
 * The world manifest comes from the server, the same seed and the same calibrated sea level the
 * globe on the landing page draws with, so the ground here is the ground the globe showed. The
 * cell is DEMO_CELL, chosen by measurement rather than by eye: see packages/planet/lib/demo-cell.ts
 * for what was measured and packages/planet/scripts/rank-demo-cells.ts to reproduce it.
 */
import { DEMO_CELL, DEMO_REGION_K } from "@echo/planet";

import DemoClient from "@/components/world/DemoClient";
import { planet } from "@/lib/planet";

// A plain import, not next/dynamic with ssr:false, which a Server Component may not use. The
// client boundary is DemoClient's own "use client"; three never reaches a server render because
// WorldCanvas imports the host inside an effect, and nothing here opens a GL context.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  const { world, calibration } = planet();
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#1c1326]">
      <DemoClient
        cell={DEMO_CELL}
        k={DEMO_REGION_K}
        seed={world.seed}
        seaLevel={calibration.seaLevel}
        peakElevation={calibration.peakElevation}
        radiusKm={world.radiusKm}
      />
    </main>
  );
}
