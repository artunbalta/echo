"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the world scene only in the browser.
// /play is the canonical front door: ONE shared ocean. You spawn on your own island (Flow 0,
// solitary) and sense others as distant silhouettes that sharpen into people as you sail closer.
const WorldClient = dynamic(() => import("@/components/WorldClient"), { ssr: false });

export default function PlayPage() {
  return <WorldClient />;
}
