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

import type { BuildPhase, PlanetWorld, PlanetWorldOptions, RenderInfo, WorldLayer } from "@/game/world/PlanetWorld";
import { renderDebugEnabled } from "@/lib/renderDebug";

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
  // The last reading, for the readout below. It is state and not a ref because the readout is the
  // only way to see these numbers on a phone, which has no console to print them to.
  const [reading, setReading] = useState<RenderInfo | null>(null);

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
        // ONE PREDICATE, TWO GATES. These used to be two independent `NODE_ENV` checks, so a change
        // to either one alone gave a world that samples and never reports, or a report of nothing.
        // What decides is lib/renderDebug.ts: development as before, production only when the URL
        // asks (?debug=render, ?debug=layers). See DECISIONS C23 for why a URL and not a flag.
        const level = options.devInfo === undefined ? renderDebugEnabled() : options.devInfo ? "frame" : "off";
        world = new PlanetWorld(host.current, {
          ...options,
          devInfo: level !== "off",
          devLayers: options.devLayers ?? level === "layers",
        });
        if (level !== "off") {
          diagnostics = setInterval(() => {
            const info = world?.info;
            if (!host.current || !info) return;
            // `dataset.worldFps` is the attribute `data-world-fps` on the page, not `data-worldFps`:
            // the DOM hyphenates a dataset key. Every selector that reads these uses the hyphens,
            // and DECISIONS C23 and SOCIETY-PLAN both wrote the camel-case form, which matches
            // nothing in a real browser.
            host.current.dataset.worldFps = info.fps.toFixed(1);
            host.current.dataset.worldTriangles = String(info.triangles);
            host.current.dataset.worldCalls = String(info.calls);
            host.current.dataset.worldWorstTriangles = String(info.worstTriangles);
            host.current.dataset.worldWorstCalls = String(info.worstCalls);
            host.current.dataset.worldMainTriangles = String(info.mainTriangles);
            host.current.dataset.worldMainCalls = String(info.mainCalls);
            host.current.dataset.worldShadowTriangles = String(info.shadowTriangles);
            host.current.dataset.worldShadowCalls = String(info.shadowCalls);
            host.current.dataset.worldPixelRatio = String(info.pixelRatio);
            host.current.dataset.worldBuffer = `${info.width}x${info.height}`;
            host.current.dataset.worldLayers = JSON.stringify(info.layers);
            setReading(info);
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
      {/* The readout, which exists for exactly one reason: a phone has no devtools, and DECISIONS
          C23 ends on the fact that this frame has never been measured on one. Rendered only when a
          reading exists, which is only when the gate above opened. */}
      {reading ? (
        <pre
          data-world-readout
          className="pointer-events-none absolute right-3 top-16 z-40 whitespace-pre rounded bg-[#120c19]/85 px-2 py-1 font-mono text-[10px] leading-tight text-[#f4e9d0]/85"
        >
{`${reading.fps.toFixed(1)} fps   ${reading.width}x${reading.height} @${reading.pixelRatio}
whole  ${reading.triangles.toLocaleString()} tri / ${reading.calls} calls   worst ${reading.worstTriangles.toLocaleString()} / ${reading.worstCalls}
main   ${reading.mainTriangles.toLocaleString()} / ${reading.mainCalls}
shadow ${reading.shadowTriangles.toLocaleString()} / ${reading.shadowCalls}
${Object.entries(reading.layers)
  .map(([name, c]) => `${name.padEnd(14)}${String(c.triangles).padStart(9)} /${String(c.calls).padStart(3)}   +sh${String(c.shadowTriangles).padStart(9)} /${String(c.shadowCalls).padStart(3)}`)
  .join("\n")}`}
        </pre>
      ) : null}
      {children}
    </div>
  );
}
