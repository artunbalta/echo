"use client";

import { useCallback } from 'react';
import WorldCanvas from '@/components/world/WorldCanvas';
import { parcelEnvironmentLayers } from '@/game/world/parcelWorld';
import type { PlanetWorld, WorldLayer } from '@/game/world/PlanetWorld';

interface Props { cell: string; seed: string; seaLevel: number; peakElevation: number; radiusKm: number; commons?: readonly string[] }
/** The actual parcel renderer, at the actual arrival point. No separate preview terrain or seed. */
export default function ParcelPreview(props: Props) {
  // No walk layer in a passive preview, so no sampling regardless of saved consent.
  const layers = useCallback((_world: PlanetWorld): WorldLayer[] =>
    parcelEnvironmentLayers({ inputEnabled: false }), []);
  return <WorldCanvas {...props} k={1} layers={layers} className="relative h-full w-full" />;
}
