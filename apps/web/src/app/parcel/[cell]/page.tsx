/**
 * Walk into your parcel (build order step 10).
 *
 * Section 9 requires that a new owner can walk in immediately: a waitlist that assigns land and
 * shows nothing walkable spends the user's only visit and gets nothing back. The scene is built in
 * the browser from the same terrain module the globe used, so this is not a picture of the parcel,
 * it is the parcel.
 */
import Link from "next/link";

import ParcelCanvas from "@/components/planet/ParcelCanvas";
import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export default async function ParcelPage({ params }: { params: Promise<{ cell: string }> }) {
  const { cell } = await params;
  const { world, calibration } = planet();

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#8fa4c4]">
      <ParcelCanvas
        cell={cell}
        seed={world.seed}
        seaLevel={calibration.seaLevel}
        peakElevation={calibration.peakElevation}
        radiusKm={world.radiusKm}
      />
      <Link
        href="/claim"
        className="absolute right-6 top-6 rounded border border-[#1c1326]/25 bg-[#f4e9d0]/85 px-3 py-2 font-pixel text-xs text-[#1c1326] hover:bg-[#f4e9d0]"
      >
        Back to the planet
      </Link>
    </main>
  );
}
