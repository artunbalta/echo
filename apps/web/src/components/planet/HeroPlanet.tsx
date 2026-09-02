"use client";

/**
 * The planet, as the first thing anyone sees.
 *
 * It replaces a painted landscape with the actual world, turning, drawn from the same terrain
 * module the registry sells parcels out of. That matters more than it sounds: the hero is no longer
 * a picture OF the product, it is the product, and a visitor can point at a piece of it and be
 * standing on that exact piece two clicks later.
 *
 * What is drawn: terrain, the twelve named commons in gold, and every parcel that has an owner.
 * Not the whole grid. There are 284,004 parcels at round 1 and a browser cannot draw them, so the
 * hexagon appears under your pointer instead of being drawn everywhere at once. On a fresh planet
 * that means terrain and twelve gold marks, and it fills in as people arrive, which is the story
 * the registry is telling anyway.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/planet/motion";
import type { PickedParcel } from "@/game/planet/PlanetGlobe";

interface Status {
  remaining: number;
  untilSplit: number;
  parcelsSold: number;
  resolution: number;
  atFloor: boolean;
}

interface World {
  seed: string;
  seaLevel: number;
  peakElevation: number;
  startResolution: number;
  commons: Record<string, string>;
  commonsResolution: number;
}

export default function HeroPlanet() {
  const host = useRef<HTMLDivElement>(null);
  const globe = useRef<import("@/game/planet/PlanetGlobe").PlanetGlobe | null>(null);
  const reducedMotion = useReducedMotion();

  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [hover, setHover] = useState<PickedParcel | null>(null);
  const [selected, setSelected] = useState<PickedParcel | null>(null);

  // Two fetches, deliberately. The planet needs terrain, a sea level and the twelve commons, which
  // is two hundred milliseconds, and it draws as soon as it has them. The counts and the parcels
  // that have owners need the registry, which on a cold serverless instance is thirty three seconds
  // of measuring land in 284,004 cells. Waiting for the second before showing the first is why the
  // hero was an empty rectangle in production.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/planet/world")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWorld(data);
      })
      .catch(() => undefined);

    fetch("/api/planet/status")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setStatus(data.status);
        setClaimed((data.claimed as Array<{ h3Index: string }>).map((c) => c.h3Index));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback((parcel: PickedParcel) => {
    setSelected(parcel);
    // A commons is 324 km2 and reads on its own; a parcel is 1.4 km and has to be marked. The
    // planet leans in rather than landing, because a hero that ends inside a hexagon has stopped
    // being a planet, and the card carries the facts the distance cannot.
    // The REGION is what gets marked, not the parcel: see PickedParcel.region for why one of the
    // two has to give. The planet leans in far enough to show a coastline and no further.
    globe.current?.flyTo(parcel.region, {
      fill: parcel.commonsName ? [226, 198, 122] : [160, 108, 213],
      distance: 2.35,
    });
  }, []);

  // Picking happens at the resolution the registry is currently issuing at. Until the status
  // arrives that is the start resolution, which is the same number until the first subdivision
  // round, and a change remounts rather than picking at a stale resolution.
  const pickResolution = status?.resolution ?? world?.startResolution ?? null;

  useEffect(() => {
    if (!host.current || !world || pickResolution === null) return;
    let live = true;
    let instance: import("@/game/planet/PlanetGlobe").PlanetGlobe | null = null;

    void import("@/game/planet/PlanetGlobe").then(({ PlanetGlobe }) => {
      if (!live || !host.current) return;
      instance = new PlanetGlobe(host.current, {
        seed: world.seed,
        seaLevel: world.seaLevel,
        peakElevation: world.peakElevation,
        reducedMotion,
        // Right of centre on a wide screen, so the headline has ground of its own. On a narrow one
        // the copy stacks over the planet anyway and an offset would only push it off the edge.
        offsetX: window.innerWidth >= 1024 ? 0.78 : 0,
        picking: {
          parcelResolution: pickResolution,
          commonsResolution: world.commonsResolution,
          commons: world.commons,
          onHover: setHover,
          onSelect: select,
        },
      });
      instance.setClaimed(Object.keys(world.commons), 1400);
      globe.current = instance;
    });

    return () => {
      live = false;
      instance?.dispose();
      globe.current = null;
    };
  }, [world, pickResolution, reducedMotion, select]);

  // Owned parcels arrive later than the planet and must not rebuild it when they do.
  useEffect(() => {
    if (!world) return;
    globe.current?.setClaimed([...Object.keys(world.commons), ...claimed], 1400);
  }, [claimed, world]);

  const dismiss = useCallback(() => {
    setSelected(null);
    globe.current?.release();
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* What the pointer is over. Quiet, because it is a hint and not a claim. */}
      {hover && !selected ? (
        <div className="pointer-events-none absolute right-6 top-24 z-20 rounded border border-parchment/15 bg-ink/80 px-3 py-2 font-pixel text-xs text-parchment/80 backdrop-blur-sm sm:right-10">
          {hover.commonsName ? (
            <>
              <span className="text-[#e2c67a]">{hover.commonsName}</span>
              <span className="text-parchment/45"> · public commons</span>
            </>
          ) : (
            <>
              <span>{hover.lat.toFixed(2)}, {hover.lng.toFixed(2)}</span>
              <span className="text-parchment/45"> · one parcel of 173,569</span>
            </>
          )}
        </div>
      ) : null}

      {selected ? <DemoPrompt parcel={selected} status={status} onDismiss={dismiss} /> : null}
    </>
  );
}

/** The question a click earns: you pointed at a place, do you want to stand in it. */
function DemoPrompt({
  parcel,
  status,
  onDismiss,
}: {
  parcel: PickedParcel;
  status: Status | null;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute bottom-8 left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-echo/30 bg-ink/92 p-5 backdrop-blur-sm sm:bottom-12">
      {parcel.commonsName ? (
        <>
          <p className="font-pixel text-sm text-[#e2c67a]">{parcel.commonsName}</p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            One of twelve public commons. Their number is fixed by the geometry of the sphere, so
            there can never be a thirteenth, and no one will ever own this one.
          </p>
        </>
      ) : (
        <>
          <p className="font-pixel text-sm text-echo">
            A parcel, at {parcel.lat.toFixed(2)}, {parcel.lng.toFixed(2)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            Marked is the region around it, roughly ten kilometres across. The parcel itself is
            1.4 km, which is too small to see and the right size to stand in.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            {status
              ? `${status.remaining.toLocaleString()} parcels are still unclaimed. Each one has exactly one owner, permanently.`
              : "Each parcel has exactly one owner, permanently."}
          </p>
        </>
      )}

      <p className="mt-4 font-pixel text-sm text-parchment">Want to see it from the ground?</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href={`/parcel/${parcel.cell}`}
          className="rounded bg-echo px-4 py-2 font-pixel text-xs text-ink transition-opacity hover:opacity-90"
        >
          Show me the demo
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-parchment/20 px-4 py-2 font-pixel text-xs text-parchment/75 transition-colors hover:border-parchment/40"
        >
          Keep looking
        </button>
      </div>
    </div>
  );
}
