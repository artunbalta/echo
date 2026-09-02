"use client";

/** Mounts {@link ParcelWorld} and reports what the ground turned out to be. */
import { useEffect, useRef, useState } from "react";

import { ParcelWorld } from "@/game/planet/ParcelWorld";

export interface ParcelCanvasProps {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
}

export default function ParcelCanvas(props: ParcelCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<{ plants: number; landFraction: number; biome: string } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const world = new ParcelWorld(host.current, {
      ...props,
      onReady: (scene) =>
        setReady({
          plants: scene.plants.length,
          landFraction: scene.landFraction,
          biome: scene.dominantBiome,
        }),
    });
    return () => world.dispose();
  }, [props.cell, props.seed, props.seaLevel, props.peakElevation, props.radiusKm]);

  return (
    <>
      <div ref={host} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-6 left-6 rounded border border-[#a06cd5]/30 bg-[#1c1326]/85 px-4 py-3 text-xs text-[#f4e9d0]/80 backdrop-blur-sm">
        <p className="font-pixel text-[#a06cd5]">Your land</p>
        <p className="mt-1">
          {ready
            ? `${ready.biome}, ${Math.round(ready.landFraction * 100)}% above water, ${ready.plants.toLocaleString()} plants`
            : "Building the ground"}
        </p>
        <p className="mt-2 text-[#f4e9d0]/45">
          W A S D to walk, shift to run, click and drag to look.
        </p>
      </div>
    </>
  );
}
