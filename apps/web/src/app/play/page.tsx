"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the Flow 0 scene only in the browser.
// /play is the canonical front door of the 7-flow archipelago: sign in → your own island → Flow 0.
const Flow0Client = dynamic(() => import("@/components/Flow0Client"), { ssr: false });

export default function PlayPage() {
  return <Flow0Client />;
}
