"use client";

import dynamic from "next/dynamic";

// The shared realtime zone of the canonical 7-flow experience: the ocean + clearing the player
// crosses into from Flow 0/1 (Flow 2 "the crossing" onward). Other live players are visible here.
// PixiJS touches the DOM/WebGL — load only in the browser. Reuses the proven Colyseus WorldClient.
const WorldClient = dynamic(() => import("@/components/WorldClient"), { ssr: false });

export default function CrossingPage() {
  return <WorldClient />;
}
