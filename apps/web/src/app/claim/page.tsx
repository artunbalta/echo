/**
 * Claim a parcel (build order step 9).
 *
 * A server shell around a client screen. The planet is built once per process on the server, so the
 * first request pays for measuring the land in 284,004 cells and every later one does not.
 */
import { planet } from "@/lib/planet";

import { ClaimClient } from "./ClaimClient";

export const metadata = {
  title: "Claim your parcel",
  description: "One sphere, divided into parcels. Every parcel has exactly one owner, permanently.",
};

export const dynamic = "force-dynamic";

export default function ClaimPage() {
  // Touch the planet on the server so the world is warm before the browser asks for its status.
  planet();
  return <ClaimClient />;
}
