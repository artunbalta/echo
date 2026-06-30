import { redirect } from "next/navigation";

// Route consolidation (Step 5): the THY venue brand-stand demo is retired as an ENTRY POINT to the
// product — redirect to the canonical front door (/play). The venue implementation is preserved in
// the codebase (game/venue/VenueScene.ts, lib/venue/*) and recoverable from git history; only the
// route entry is retired, so the demo can be re-exposed under a dedicated path if THY needs it.
export default function VenuePage() {
  redirect("/play");
}
