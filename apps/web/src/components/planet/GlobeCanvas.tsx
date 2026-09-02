"use client";

/** Mounts {@link PlanetGlobe} into a div and hands it the two things that change: claims and yours. */
import { useEffect, useRef } from "react";

import { PlanetGlobe } from "@/game/planet/PlanetGlobe";

export interface GlobeCanvasProps {
  seed: string;
  seaLevel: number;
  peakElevation: number;
  claimed: string[];
  myParcel: string | null;
  reducedMotion: boolean;
  onArrived?: () => void;
}

export default function GlobeCanvas(props: GlobeCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const globe = useRef<PlanetGlobe | null>(null);
  const arrived = useRef(props.onArrived);
  arrived.current = props.onArrived;

  useEffect(() => {
    if (!host.current) return;
    const instance = new PlanetGlobe(host.current, {
      seed: props.seed,
      seaLevel: props.seaLevel,
      peakElevation: props.peakElevation,
      reducedMotion: props.reducedMotion,
      onArrived: () => arrived.current?.(),
    });
    globe.current = instance;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __globe?: PlanetGlobe }).__globe = instance;
    }
    return () => {
      instance.dispose();
      globe.current = null;
    };
    // The planet itself never changes within a session; only what is drawn on it does.
  }, [props.seed, props.seaLevel, props.peakElevation, props.reducedMotion]);

  useEffect(() => {
    globe.current?.setClaimed(props.claimed);
  }, [props.claimed]);

  useEffect(() => {
    if (props.myParcel) globe.current?.flyTo(props.myParcel);
  }, [props.myParcel]);

  return <div ref={host} className="h-full w-full" />;
}
