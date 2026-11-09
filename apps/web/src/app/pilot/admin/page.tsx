/**
 * The owner's groups (DECISIONS C85): make a group, send its link, and let in whoever asks to join.
 *
 * No such page unless the pilot is switched on, as `/pilot`. Everything on it asks the API with the
 * owner's token (`ECHO_PILOT_ADMIN`), which the page keeps on the owner's device once typed; without
 * the token the page is a box to type it into, and nothing else.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PilotAdmin from "@/components/pilot/PilotAdmin";
import { pilotConfig } from "@/lib/pilot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Groups", robots: { index: false, follow: false } };

export default function PilotGroups() {
  if (!pilotConfig()) notFound();
  return (
    <main className="min-h-[100dvh] w-full bg-ink">
      <PilotAdmin />
    </main>
  );
}
