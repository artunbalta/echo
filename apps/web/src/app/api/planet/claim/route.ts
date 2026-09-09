/**
 * Claim one parcel (section 7.1).
 *
 * Random by default, and no picker: the reveal is the point, and a picker over an empty globe
 * produces decision paralysis and nothing worth sharing.
 */
import { NextResponse } from "next/server";
import { biomeAt, cellCentre } from "@echo/planet";

import { claimRequestFrom, type ClaimBody } from "@/lib/claimRequest";
import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ClaimBody;

  // THE KEY IS THE ID, AND IT USED TO BE THE NAME (SOC-2.B). The branch lives in lib/claimRequest.ts
  // so a test drives the same code this route does; that file carries the whole argument.
  const claim = claimRequestFrom(body);
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 400 });
  const { ownerId, displayName: name } = claim;

  const { registry, field, calibration } = planet();
  const store = registry();
  const result = await store.claim(ownerId, {
    displayName: name,
    referrerParcel: claim.referrer,
  });

  if (result.status === "waitlisted" || !result.parcel) {
    return NextResponse.json({
      status: "waitlisted",
      message: "Every parcel on the planet has an owner. There is no more land until the registry adds a round.",
    });
  }

  const parcel = result.parcel;
  const { lat, lng, direction } = cellCentre(parcel.h3Index);
  const dominant = biomeAt(field, calibration, direction);

  return NextResponse.json({
    status: "assigned",
    parcel: { ...parcel, lat, lng, biome: dominant },
    endedRound: Boolean(result.endedRound),
    placedAdjacent: Boolean(result.placedAdjacent),
    // Section 7.2: when nothing was free near their friend, say so rather than letting them wonder.
    referralNote:
      claim.referrer && !result.placedAdjacent
        ? "No land was free near the person who invited you, so your parcel was drawn at random."
        : null,
    statusAfter: await store.status(),
  });
}
