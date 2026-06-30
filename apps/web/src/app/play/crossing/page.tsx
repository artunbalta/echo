import { redirect } from "next/navigation";

// The crossing is no longer a separate destination — it's the physical act of sailing off your
// island in the ONE shared ocean at /play (silhouette → person, by distance). Retired; folded in.
// (Code recoverable in git, like the Step-5 route retirements.)
export default function PlayCrossingPage() {
  redirect("/play");
}
