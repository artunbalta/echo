"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the island client only in the browser.
const IslandClient = dynamic(() => import("@/components/IslandClient"), { ssr: false });

export default function IslandPage() {
  return <IslandClient />;
}
