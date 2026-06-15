"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the world client only in the browser.
const WorldClient = dynamic(() => import("@/components/WorldClient"), { ssr: false });

export default function WorldPage() {
  return <WorldClient />;
}
