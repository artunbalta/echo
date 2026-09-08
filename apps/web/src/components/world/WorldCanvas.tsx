"use client";

/**
 * The bare mount for the planet world (contract, plan §4). Owned by C0 as a scaffold; A3 fills
 * the host, A6 wires it into the hero. Nothing about the landing lives here: it takes the world
 * manifest as props, composes the layers it is given, and reports the build phase.
 *
 * The host module is imported dynamically so three never reaches a server render, and the world is
 * created inside the effect so React StrictMode's double-mount builds two worlds only briefly: the
 * first is disposed, which aborts its build, before the second starts. Every failure on the way,
 * including a layer factory that throws, lands in the same "failed" phase with its message.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { BuildPhase, PlanetWorld, PlanetWorldOptions, WorldLayer } from "@/game/world/PlanetWorld";

export interface WorldCanvasProps extends Omit<PlanetWorldOptions, "handle"> {
  /** Layers to add, in build order. Called once per world instance. */
  layers: (world: PlanetWorld) => WorldLayer[];
  /** Follow target, e.g. the player layer's position getter. */
  follow?: (world: PlanetWorld) => () => { x: number; y: number; liftM?: number };
  onPhase?: (phase: BuildPhase, error?: unknown) => void;
  onWorld?: (world: PlanetWorld | null) => void;
  className?: string;
  children?: ReactNode;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function WorldCanvas({ layers, follow, onPhase, onWorld, className, children, ...options }: WorldCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let world: PlanetWorld | null = null;
    let live = true;
    let diagnostics: ReturnType<typeof setInterval> | undefined;
    const fail = (e: unknown) => {
      setPhase("failed");
      setError(message(e));
      onPhase?.("failed", e);
      world?.dispose();
      world = null;
    };
    void import("@/game/world/PlanetWorld").then(({ PlanetWorld }) => {
      if (!live || !host.current) return;
      try {
        world = new PlanetWorld(host.current, { ...options, devInfo: options.devInfo ?? process.env.NODE_ENV !== "production" });
        if (process.env.NODE_ENV !== "production") {
          diagnostics = setInterval(() => {
            if (host.current && world?.info) {
              host.current.dataset.worldFps = world.info.fps.toFixed(1);
              host.current.dataset.worldTriangles = String(world.info.triangles);
              host.current.dataset.worldCalls = String(world.info.calls);
            }
          }, 1000);
        }
        world.onPhase = (p, err) => {
          setPhase(p);
          if (p === "failed") setError(message(err));
          onPhase?.(p, err);
        };
        for (const layer of layers(world)) world.addLayer(layer);
        if (follow) world.setFollow(follow(world));
        onWorld?.(world);
        world.start().catch(fail);
      } catch (e) {
        fail(e);
      }
    });
    return () => {
      live = false;
      clearInterval(diagnostics);
      world?.dispose();
      onWorld?.(null);
    };
    // The world is rebuilt only when the manifest or the frame changes; layer and callback
    // identity is not a reason to rebuild a planet. devInfo is read once at construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.cell, options.seed, options.seaLevel, options.peakElevation, options.radiusKm, options.k, options.heightScaleM, options.tileM]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={host} className="absolute inset-0" data-phase={phase} />
      {phase !== "ready" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <p className="rounded border border-[#a06cd5]/30 bg-[#1c1326]/85 px-4 py-2 font-pixel text-xs text-[#f4e9d0]/80">
            {phase === "failed" ? `The ground could not be built: ${error ?? "unknown error"}` : "Building the ground"}
          </p>
        </div>
      ) : null}
      {children}
    </div>
  );
}
