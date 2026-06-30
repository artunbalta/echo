import { redirect } from "next/navigation";

// Route consolidation (Step 5): the standalone main-world demo is retired as an entry point. The
// canonical front door is /play (sign in → your own island → Flow 0); its shared realtime zone now
// lives at /play/crossing, reached by the in-world crossing. A direct /world hit lands at Flow 0.
export default function WorldPage() {
  redirect("/play");
}
