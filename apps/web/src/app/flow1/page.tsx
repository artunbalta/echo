"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the scene only in the browser.
// /flow1 is the embodied raft-build slice (ECHO_level_design_7flows.md §FLOW 1): an isolated, real,
// playable proof of the embodied-activity primitive before it seeps into the canonical /play own-island
// path. Zero-key: `?u=<name>` gives a deterministic identity for two-tab evidence runs.
const Flow1Client = dynamic(() => import("@/components/Flow1Client"), { ssr: false });

export default function Flow1Page() {
  return <Flow1Client />;
}
