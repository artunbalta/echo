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

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/planet/motion";
import type { PickedParcel } from "@/game/planet/PlanetGlobe";

// Sampling terrain for the inset pulls in the whole planet package, which the hero already loads,
// but it is only ever needed once somebody points at something.
const ParcelInset = dynamic(() => import("@/components/planet/ParcelInset"), { ssr: false });

interface Status {
  remaining: number;
  untilSplit: number;
  parcelsSold: number;
  resolution: number;
  atFloor: boolean;
}

interface World {
  seed: string;
  radiusKm: number;
  seaLevel: number;
  peakElevation: number;
  startResolution: number;
  minLandFraction: number;
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
  const inset = useRef<HTMLDivElement>(null);
  const [arrow, setArrow] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);

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
          minLandFraction: world.minLandFraction,
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

  // The planet keeps turning under a still cursor, so the far end of the line has to be asked for
  // every frame rather than pushed once. Cheap: one matrix multiply and a projection.
  useEffect(() => {
    if (!hover || selected) {
      setArrow(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const at = globe.current?.screenPositionOf(hover.cell);
      const box = inset.current?.getBoundingClientRect();
      const hostBox = host.current?.getBoundingClientRect();
      if (!at || !box || !hostBox) {
        setArrow(null);
        return;
      }
      setArrow({
        fromX: box.left - hostBox.left,
        fromY: box.top - hostBox.top + box.height / 2,
        toX: at.x,
        toY: at.y,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hover, selected]);

  const dismiss = useCallback(() => {
    setSelected(null);
    globe.current?.release();
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* What the pointer is over, drawn close up, with a line back to where it is. A parcel is
          three percent of the frame at hero distance, so naming it is not enough: the eye needs
          somewhere to look and something to compare. */}
      {hover && !selected && world ? (
        <>
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden>
            {arrow ? (
              <>
                <line
                  x1={arrow.fromX}
                  y1={arrow.fromY}
                  x2={arrow.toX}
                  y2={arrow.toY}
                  stroke="#a06cd5"
                  strokeWidth={1.5}
                  strokeOpacity={0.75}
                  strokeDasharray="5 4"
                />
                <circle cx={arrow.toX} cy={arrow.toY} r={7} fill="none" stroke="#a06cd5" strokeWidth={1.5} />
                <circle cx={arrow.toX} cy={arrow.toY} r={2} fill="#a06cd5" />
              </>
            ) : null}
          </svg>

          <div ref={inset} className="pointer-events-none absolute right-6 top-24 z-30 sm:right-10">
            <ParcelInset
              cell={hover.cell}
              seed={world.seed}
              seaLevel={world.seaLevel}
              peakElevation={world.peakElevation}
              radiusKm={world.radiusKm}
              commonsName={hover.commonsName}
              assignable={hover.assignable}
            />
          </div>
        </>
      ) : null}

      {selected && world ? <DemoPrompt parcel={selected} status={status} minLand={world.minLandFraction} onDismiss={dismiss} /> : null}
    </>
  );
}

/** The question a click earns: you pointed at a place, do you want to stand in it. */
function DemoPrompt({
  parcel,
  status,
  minLand,
  onDismiss,
}: {
  parcel: PickedParcel;
  status: Status | null;
  minLand: number;
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
      ) : parcel.assignable ? (
        <>
          <p className="font-pixel text-sm text-echo">
            A parcel, at {parcel.lat.toFixed(2)}, {parcel.lng.toFixed(2)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            Marked is the region around it, roughly ten kilometres across. The parcel itself is
            1.4 km, which is too small to see and the right size to stand in.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            {Math.round(parcel.landFraction * 100)}% of it is dry land.{" "}
            {status
              ? `${status.remaining.toLocaleString()} parcels are still unclaimed, and each one has exactly one owner, permanently.`
              : "Each parcel has exactly one owner, permanently."}
          </p>
        </>
      ) : (
        <>
          <p className="font-pixel text-sm text-[#7a9cbe]">
            Open water, at {parcel.lat.toFixed(2)}, {parcel.lng.toFixed(2)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            This is not a parcel and never will be. Land is assigned at random, so anything under{" "}
            {Math.round(minLand * 100)}% dry ground is held out of the pool entirely: nobody is ever
            given a rectangle of sea and told it is theirs.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-parchment/70">
            This one is {Math.round(parcel.landFraction * 100)}% land. Point at somewhere greener.
          </p>
        </>
      )}

      {parcel.assignable || parcel.commonsName ? (
        <p className="mt-4 font-pixel text-sm text-parchment">Want to see it from the ground?</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        {parcel.assignable || parcel.commonsName ? (
          <a
            href={`/parcel/${parcel.cell}`}
            className="rounded bg-echo px-4 py-2 font-pixel text-xs text-ink transition-opacity hover:opacity-90"
          >
            Show me the demo
          </a>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-parchment/20 px-4 py-2 font-pixel text-xs text-parchment/75 transition-colors hover:border-parchment/40"
        >
          {parcel.assignable || parcel.commonsName ? "Keep looking" : "Point somewhere else"}
        </button>
      </div>
    </div>
  );
}
