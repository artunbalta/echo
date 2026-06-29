"use client";

import dynamic from "next/dynamic";

// PixiJS touches the DOM/WebGL — load the town client only in the browser.
const TownClient = dynamic(() => import("@/components/TownClient"), { ssr: false });

export default function TownPage() {
  return <TownClient />;
}
