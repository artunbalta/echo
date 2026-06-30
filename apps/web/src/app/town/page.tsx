import { redirect } from "next/navigation";

// Route consolidation (Step 5): the Stage-4 town is retired as an entry point — its social cue
// ecology now lives in the canonical Flow 3 clearing. Redirect to the front door.
export default function TownPage() {
  redirect("/play");
}
