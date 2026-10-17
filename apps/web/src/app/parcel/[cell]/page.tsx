/**
 * Walk into your parcel (build order step 10), and the one address the demo has (task A3).
 *
 * Section 9 requires that a new owner can walk in immediately: a waitlist that assigns land and
 * shows nothing walkable spends the user's only visit and gets nothing back. The scene is built in
 * the browser from the same terrain module the globe used, so this is not a picture of the parcel,
 * it is the parcel.
 *
 * THIS ROUTE IS ALSO THE DEMO NOW. There is no /demo world any more, only /demo the redirect: the
 * demo is this page with `?stations=slice` on the demo cell, which is why the parameter is read
 * here on the server rather than sniffed in the browser. What the parameter may and may not do,
 * and why it is a parameter at all, is written once in lib/stationSet.ts.
 *
 * The refusal is logged and never shown. A parcel that was asked for stations it cannot have looks
 * exactly like a parcel nobody asked anything of, which is correct for the world and useless for
 * the person who typed it, so the reason goes to the server log where whoever is running the thing
 * will find it.
 *
 * IT IS 100dvh AND NOT 100vh (DECISIONS C23), and on a phone that was the difference between a
 * playable route and a dead one. On iOS Safari 100vh is the LARGE viewport, the one with the bars
 * hidden, and globals.css locks this page's overflow — so the bars never retract, 180 px of an
 * iPhone's box are permanently off screen, and everything anchored to the bottom is under the tab
 * bar. That included both of the consent card's buttons, which is the FIRST thing this route asks
 * and the gate everything else waits behind: a person could reach their parcel and never get past
 * the question. The landing hero (app/page.tsx) already had this right; this route was the outlier.
 *
 * `k` is passed rather than left to the host. It moves no ground today, because PlanetWorld's own
 * default is already 1, and that is the reason to name it: a route that leans on a host default
 * for the size of the world it builds is a route that silently builds a different world the day
 * the default moves, and the demo would have kept its ring while this parcel lost six neighbours.
 */
import Link from "next/link";
import { PARCEL_REGION_K } from "@echo/planet";

import ParcelCanvas from "@/components/planet/ParcelCanvas";
import { planet } from "@/lib/planet";
import { STATIONS_PARAM, stationSetFor } from "@/lib/stationSet";

export const dynamic = "force-dynamic";

export default async function ParcelPage({
  params,
  searchParams,
}: {
  params: Promise<{ cell: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cell } = await params;
  const { world, calibration, commons } = planet();

  const { set, refused } = stationSetFor(cell, (await searchParams)[STATIONS_PARAM]);
  if (refused) console.warn(`[parcel] ${refused}`);

  return (
    // Not a dead colour, which is why it changed rather than went. The GL canvas is opaque and
    // covers the viewport, so this is only ever seen in the moments without a world: the paint
    // before the renderer exists, and, for a cell with no dry ground to spawn on, permanently
    // behind the failure message. The blue that was here said noon under a sky that opens at dusk.
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#1c1326]">
      <ParcelCanvas
        cell={cell}
        k={PARCEL_REGION_K}
        stations={set}
        seed={world.seed}
        seaLevel={calibration.seaLevel}
        peakElevation={calibration.peakElevation}
        radiusKm={world.radiusKm}
        commons={commons.cells}
      />
      {/* z-30 because it is the only way off this page and it shares the top of the screen with a
          meter that sits at z-20. In the same stacking context the meter simply won, and at 390 px
          wide it covered all but four pixels of this link: you could walk into a parcel and have no
          way out but the browser's back button. The short label is the same link on a narrow
          screen, where "Back to the planet" would wrap into two lines beside the minimap. */}
      <Link
        href="/"
        className="absolute right-6 top-6 z-30 rounded-full border border-white/25 bg-[#f4f2e4]/90 px-5 py-3 text-xs text-[#26392b] backdrop-blur-lg hover:bg-white max-sm:right-3 max-sm:top-3 max-sm:px-4 max-sm:py-2 max-sm:text-[11px]"
      >
        <span className="max-sm:hidden">Back to the planet</span>
        <span className="hidden max-sm:inline">← Planet</span>
      </Link>
    </main>
  );
}
