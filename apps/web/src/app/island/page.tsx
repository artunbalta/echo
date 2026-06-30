import { redirect } from "next/navigation";

// Route consolidation (Step 5): the standalone Phase-0 island proof is retired as an entry point —
// Flow 0 ("Waking Alone") at /play is its canonical successor. Redirect to the front door.
export default function IslandPage() {
  redirect("/play");
}
