/**
 * Claim one parcel (section 7.1).
 *
 * Random by default, and no picker: the reveal is the point, and a picker over an empty globe
 * produces decision paralysis and nothing worth sharing.
 */
import { NextResponse } from "next/server";
import { biome, cellCentre, normalisedHeight } from "@echo/planet";

import { planet } from "@/lib/planet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; referrer?: string };
  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "Enter a name of at least two characters." }, { status: 400 });
  }

  const { registry, field, calibration } = planet();
  const store = registry();
  const result = await store.claim(name, body.referrer?.trim() || undefined);

  if (result.status === "waitlisted" || !result.parcel) {
    return NextResponse.json({
      status: "waitlisted",
      message: "Every parcel on the planet has an owner. There is no more land until the registry adds a round.",
    });
  }

  const parcel = result.parcel;
  const { lat, lng, direction } = cellCentre(parcel.h3Index);
  const height = normalisedHeight(field.elevation(direction), calibration);
  const dominant = biome(height, field.moisture(direction), field.temperature(direction));

  return NextResponse.json({
    status: "assigned",
    parcel: { ...parcel, lat, lng, biome: dominant },
    endedRound: Boolean(result.endedRound),
    placedAdjacent: Boolean(result.placedAdjacent),
    // Section 7.2: when nothing was free near their friend, say so rather than letting them wonder.
    referralNote:
      body.referrer && !result.placedAdjacent
        ? "No land was free near the person who invited you, so your parcel was drawn at random."
        : null,
    statusAfter: await store.status(),
  });
}
