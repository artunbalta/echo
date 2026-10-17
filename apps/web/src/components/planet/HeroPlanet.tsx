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
const ParcelPreview = dynamic(() => import("@/components/planet/ParcelPreview"), { ssr: false });
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
      // The planet's villages as lights (DECISIONS C41). A static index derived from the seed, so a
      // seed with no index simply has no lights; it is never a reason for the planet not to draw.
      fetch(`/planet/villages-${world.seed}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((index: { cells: string[]; capacity: number[] } | null) => {
          if (live && index && instance) instance.setVillages(index.cells, index.capacity);
        })
        .catch(() => undefined);
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

      {selected && world ? <DemoPrompt parcel={selected} world={world} onDismiss={dismiss} /> : null}
    </>
  );
}

/** Selection opens a window onto this exact coordinate, using the same layers as the route. */
interface VillageSummary { name: string; kind: string; population: number; households: number; graves: number }

/** The village a picked cell holds, if it holds one (DECISIONS C41). Null until it is known, and for open ground. */
function useVillage(cell: string): VillageSummary | null {
  const [village, setVillage] = useState<VillageSummary | null>(null);
  useEffect(() => {
    let live = true;
    setVillage(null);
    fetch(`/api/planet/village?cell=${cell}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { village: VillageSummary | null } | null) => {
        if (live) setVillage(data?.village ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [cell]);
  return village;
}

function DemoPrompt({ parcel, world, onDismiss }: {
  parcel: PickedParcel; world: World; onDismiss: () => void;
}) {
  const canEnter = parcel.assignable || !!parcel.commonsName;
  const village = useVillage(parcel.cell);
  return (
    <section aria-label="Selected parcel" className="absolute inset-x-4 bottom-5 z-30 overflow-hidden rounded-2xl border border-white/25 bg-[#16241f]/95 text-[#f7f5e9] shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[min(580px,48vw)]">
      {canEnter ? (
        <div className="relative h-[230px] sm:h-[300px]" data-preview-cell={parcel.cell}>
          <ParcelPreview key={parcel.cell} cell={parcel.cell} seed={world.seed} seaLevel={world.seaLevel} peakElevation={world.peakElevation} radiusKm={world.radiusKm} commons={Object.keys(world.commons)} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#16241f] via-transparent to-transparent" />
          <span className="absolute left-5 top-4 rounded-full bg-[#16241f]/70 px-3 py-1 text-[10px] uppercase tracking-[.2em]">Live world · arrival view</span>
        </div>
      ) : null}
      <button type="button" aria-label="Close parcel preview" onClick={onDismiss} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[#16241f]/80 text-xl hover:bg-[#324638]">×</button>
      <div className="relative px-6 pb-6 pt-4">
        <p className="text-[10px] uppercase tracking-[.24em] text-[#bdd0ae]">{parcel.lat.toFixed(3)}° · {parcel.lng.toFixed(3)}°</p>
        <h2 className="mt-2 font-serif text-3xl">{parcel.commonsName ?? village?.name ?? (canEnter ? 'A place in the world.' : 'The open ocean.')}</h2>
        {village ? (
          <p data-village={village.name} className="mt-1 text-sm text-[#e8c98a]">
            {village.kind === 'abandoned village'
              ? `An abandoned village · ${village.graves} graves`
              : `A ${village.kind} · ${village.population} ${village.population === 1 ? 'person lives' : 'people live'} here · ${village.households} households`}
          </p>
        ) : null}
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
          {village && village.population > 0
            ? 'You arrive at the edge of the village. Everyone in it has lived a life here, and the houses, the boats and the graves are theirs.'
            : canEnter ? 'Step into this landscape. The ground, vegetation and arrival point you see here are the place you will explore.' : 'Choose a patch of land to begin exploring.'}
        </p>
        <div className="mt-5 flex items-center gap-4">
          {canEnter ? <a data-parcel-entry={parcel.cell} href={`/parcel/${parcel.cell}`} className="rounded-full bg-[#e2edc8] px-6 py-3 text-sm font-medium text-[#213522] hover:bg-white">Explore this place <span aria-hidden>↗</span></a> : null}
          <button type="button" onClick={onDismiss} className="py-3 text-sm text-white/65 hover:text-white">Keep exploring</button>
        </div>
      </div>
    </section>
  );
}
