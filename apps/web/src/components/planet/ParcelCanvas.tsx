"use client";

/**
 * Walk into your parcel: the WorldCanvas mount with the terrain and the player (build order step
 * 10, on the layer host from plan §4).
 *
 * Two layers, in build order: the terrain chunks, then the player. The player layer drives the
 * camera (orbit, terrain collision) from its own update, so no `follow` is passed: PlanetWorld's
 * provisional boom runs after the layers whenever one is set and would overwrite the orbit camera
 * every frame. The world manifest props are unchanged, so app/parcel/[cell]/page.tsx is untouched.
 * WorldCanvas itself reports the build phase and any failure, so the HUD here is only the name of
 * the place and the controls.
 */
import { useCallback } from "react";

import WorldCanvas from "@/components/world/WorldCanvas";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import { playerLayer } from "@/game/world/playerLayer";
import { terrainLayer } from "@/game/world/terrainChunks";

export interface ParcelCanvasProps {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  /** Ring count of the built disk; 1 is the cell and its six neighbours. */
  k?: number;
}

export default function ParcelCanvas(props: ParcelCanvasProps) {
  const layers = useCallback((_world: PlanetWorld): WorldLayer[] => [terrainLayer(), playerLayer()], []);

  return (
    <WorldCanvas {...props} layers={layers} className="relative h-full w-full">
      <div className="pointer-events-none absolute bottom-6 left-6 rounded border border-[#a06cd5]/30 bg-[#1c1326]/85 px-4 py-3 text-xs text-[#f4e9d0]/80 backdrop-blur-sm">
        <p className="font-pixel text-[#a06cd5]">Your land</p>
        <p className="mt-2 text-[#f4e9d0]/45">W A S D to walk, shift to run, space to jump, drag to look</p>
      </div>
    </WorldCanvas>
  );
}
