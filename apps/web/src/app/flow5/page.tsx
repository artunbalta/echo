"use client";

import dynamic from "next/dynamic";

// Three.js touches the DOM/WebGL — load the scene only in the browser.
// /flow5 is the embodied Ring-of-Gyges slice (ECHO_level_design_7flows.md §FLOW 5): an isolated, real,
// playable proof of the two probes, beside the canonical /play own-island path where they sit behind
// the day loop. `?probe=gull|cache` and `?privacy=public|private` select one cell, which is what lets
// the acceptance harness drive individuation and the public-minus-private delta separately.
const Flow5Client = dynamic(() => import("@/components/Flow5Client"), { ssr: false });

export default function Flow5Page() {
  return <Flow5Client />;
}
