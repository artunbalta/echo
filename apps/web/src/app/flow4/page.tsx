"use client";

import dynamic from "next/dynamic";

// Three.js touches the DOM/WebGL — load the scene only in the browser.
// /flow4 is the embodied Repeated-Games-and-Trust slice (ECHO_level_design_7flows.md §FLOW 4): an
// isolated, real, playable proof of the four beats, beside the canonical /play own-island path where
// they will sit behind the day loop. `?beat=` selects one beat and `?partner=` names the counterpart,
// which is what lets the acceptance harness drive individuation and the repetition delta separately.
const Flow4Client = dynamic(() => import("@/components/Flow4Client"), { ssr: false });

export default function Flow4Page() {
  return <Flow4Client />;
}
