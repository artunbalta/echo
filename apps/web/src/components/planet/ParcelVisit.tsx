"use client";

/**
 * A parcel as a visitor meets it (DECISIONS C97): the village, or a ten-second look at it and then
 * the waitlist.
 *
 * The server says which (`lib/previewPass.ts`); this holds the one piece of state that follows from
 * it. When a look ends the village is UNMOUNTED, not covered: a world left running under a form would
 * go on drawing, sounding and reading keys while someone types their name over it.
 */
import { useState } from "react";

import ParcelCanvas, { type ParcelCanvasProps } from "@/components/planet/ParcelCanvas";
import PreviewGate from "@/components/world/PreviewGate";

export default function ParcelVisit({ look, ...parcel }: Omit<ParcelCanvasProps, "preview"> & { look: boolean }) {
  const [ended, setEnded] = useState<{ still: string | null } | null>(null);
  if (ended) return <PreviewGate still={ended.still} />;
  return <ParcelCanvas {...parcel} preview={look ? { onEnd: (still) => setEnded({ still }) } : null} />;
}
