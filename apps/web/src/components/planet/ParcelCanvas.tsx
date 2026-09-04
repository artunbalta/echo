"use client";

/**
 * Walk into your parcel: the WorldCanvas mount with the world /demo has (build order step 10, on
 * the layer host from plan §4).
 *
 * Four layers, in build order, and the order is the demo's for the reason the demo has it. Sky
 * first, because it owns the air: the terrain layer paints its flat blend of skyDusk and skyHorizon
 * only when it finds `scene.background` still null, and that fallback is exactly the orange wall
 * somebody reported standing under on this route, where nothing had ever claimed the air. Terrain
 * second, because the scatter stands each prop on the ground the terrain actually drew rather than
 * on the placer's own z. Scatter third. The player last, and that one is load-bearing rather than
 * tidy: `playerLayer.build` looks the scatter up by name and takes its collider index, so a player
 * built ahead of it walks through every trunk on the parcel.
 *
 * WHAT THIS ROUTE DELIBERATELY DOES NOT GET is the demo's furniture. `scatterLayer` is called with
 * no options at all, which is now the general answer rather than a bare one: it reads its class
 * list off this cell's own biome mask, so a rainforest parcel grows buttress trees and bromeliads
 * and a taiga one grows what taiga calls for, and the only ground it keeps clear is the ground
 * every parcel has to keep clear, the buildable footprint and the spawn clearing. Handing it the
 * demo's stations would sweep corridors toward a campfire and a cave mouth that are not on this
 * cell and never will be.
 *
 * The player layer drives the camera (orbit, terrain collision) from its own update, so no `follow`
 * is passed: PlanetWorld's provisional boom runs after the layers whenever one is set and would
 * overwrite the orbit camera every frame.
 *
 * THE CELL COMES OFF THE URL AND IS NOT CHECKED HERE. It already has one place to fail and one
 * sentence to fail with: PlanetWorld's constructor resolves the spawn before it allocates anything,
 * WorldCanvas catches the throw into its "failed" phase, and what a person reads is the message the
 * throw carried. An all-ocean cell such as 8400403ffffffff under the shipped seed gives up after
 * about 40 ms, because `spawnPointFor` stops at depth 5 rather than searching forever, and says
 * "The ground could not be built: 8400403ffffffff has no dry ground to spawn on". A second guard
 * here would only be a second thing to keep true, so the HUD below is still just the name of the
 * place and the controls.
 *
 * The one arbitrary cell that hangs instead of failing is a cell too COARSE to be a parcel. The
 * registry deals in resolutions 4 through 7; a resolution 1 commons cell in the URL builds a 40 km
 * disk whose biome mask alone is 63.6 M samples against a parcel's 172 k. That was already true
 * when this route was terrain and a player, so it is the route's input that wants a guard, not this
 * list, but nobody should discover it from a spinner.
 */
import { useCallback } from "react";

import WorldCanvas from "@/components/world/WorldCanvas";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import { playerLayer } from "@/game/world/playerLayer";
import { scatterLayer } from "@/game/world/scatterLayer";
import { skyLayer } from "@/game/world/skyLayer";
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
  const layers = useCallback(
    (_world: PlanetWorld): WorldLayer[] => [skyLayer(), terrainLayer(), scatterLayer(), playerLayer()],
    [],
  );

  return (
    <WorldCanvas {...props} layers={layers} className="relative h-full w-full">
      <div className="pointer-events-none absolute bottom-6 left-6 rounded border border-[#a06cd5]/30 bg-[#1c1326]/85 px-4 py-3 text-xs text-[#f4e9d0]/80 backdrop-blur-sm">
        <p className="font-pixel text-[#a06cd5]">Your land</p>
        <p className="mt-2 text-[#f4e9d0]/45">W A S D to walk, shift to run, space to jump, drag to look</p>
      </div>
    </WorldCanvas>
  );
}
