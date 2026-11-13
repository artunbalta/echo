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
import { useLang, type Lang } from "@/lib/lang";
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
  // The planet has drawn a frame (C97). Until then its box is empty and clear; then it comes in over
  // most of a second (`.arrive`). It used to appear all at once, a second or two after the words, on
  // top of them on a phone.
  const [here, setHere] = useState(false);

  // Two fetches, deliberately. The planet needs terrain, a sea level and the twelve commons, which
  // is two hundred milliseconds, and it draws as soon as it has them. The counts and the parcels
  // that have owners need the registry, which on a cold serverless instance is thirty three seconds
  // of measuring land in 284,004 cells. Waiting for the second before showing the first is why the
  // hero was an empty rectangle in production.
  useEffect(() => {
    let cancelled = false;
    // The planet's own code is asked for now, beside its numbers, not after them: it is the larger of
    // the two, and one waiting for the other was a second of an empty hero.
    void import("@/game/planet/PlanetGlobe");
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
      // The planet has a box of its own now (C97, `app/page.tsx`): beside the words on a wide screen,
      // under them on a narrow one. So it sits in the middle of what it is given and is never slid
      // under the headline, which is where a phone had it.
      //
      // Pointing at it is for a wide screen and a pointer. Under the words on a phone it is a picture:
      // the card a pick opens is taller than the planet's box there, and a canvas that answers a
      // thumb is a canvas that takes the thumb meant for the page.
      const pointable = window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
      instance = new PlanetGlobe(host.current, {
        seed: world.seed,
        seaLevel: world.seaLevel,
        peakElevation: world.peakElevation,
        reducedMotion,
        picking: pointable
          ? {
              parcelResolution: pickResolution,
              commonsResolution: world.commonsResolution,
              minLandFraction: world.minLandFraction,
              commons: world.commons,
              onHover: setHover,
              onSelect: select,
            }
          : undefined,
      });
      instance.setClaimed(Object.keys(world.commons), 1400);
      globe.current = instance;
      // Two frames on, it has drawn itself.
      requestAnimationFrame(() => requestAnimationFrame(() => live && setHere(true)));
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
      <div ref={host} data-planet data-here={here} className="arrive absolute inset-0 h-full w-full" aria-hidden />

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

          <div ref={inset} className="pointer-events-none absolute right-4 top-24 z-30 sm:right-8">
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

/**
 * The picked parcel's card, in both languages and in the site's own buttons (C96). It was the one thing
 * on the landing still in English with a hand-made pill, and its close button turned green on hover.
 */
const PICK: Record<Lang, { label: string; live: string; close: string; place: string; ocean: string; abandoned: (graves: number) => string; lives: (kind: string, n: number, households: number) => string; village: string; land: string; sea: string; go: string; stay: string }> = {
  en: {
    label: "Selected parcel",
    live: "Live world · arrival view",
    close: "Close parcel preview",
    place: "A place in the world.",
    ocean: "The open ocean.",
    abandoned: (graves) => `An abandoned village · ${graves} graves`,
    lives: (kind, n, households) => `A ${kind} · ${n} ${n === 1 ? "person lives" : "people live"} here · ${households} households`,
    village: "You arrive at the edge of the village. Everyone in it has lived a life here, and the houses, the boats and the graves are theirs.",
    land: "Step into this landscape. The ground, vegetation and arrival point you see here are the place you will explore.",
    sea: "Choose a patch of land to begin exploring.",
    go: "Look around here",
    stay: "Keep looking",
  },
  tr: {
    label: "Seçilen toprak",
    live: "Canlı dünya · varış görüntüsü",
    close: "Önizlemeyi kapat",
    place: "Dünyada bir yer.",
    ocean: "Açık deniz.",
    abandoned: (graves) => `Terk edilmiş bir köy · ${graves} mezar`,
    lives: (kind, n, households) => `${kind === "village" ? "Bir köy" : kind === "hamlet" ? "Bir mezra" : kind === "town" ? "Bir kasaba" : kind} · burada ${n} kişi yaşıyor · ${households} hane`,
    village: "Köyün kıyısına varırsın. İçindeki herkes burada bir ömür yaşadı; evler, kayıklar ve mezarlar onların.",
    land: "Bu manzaranın içine gir. Burada gördüğün zemin, bitkiler ve varış noktası, gezeceğin yerin kendisi.",
    sea: "Gezmeye başlamak için bir toprak parçası seç.",
    go: "Buraya göz at",
    stay: "Bakmaya devam et",
  },
};

function DemoPrompt({ parcel, world, onDismiss }: {
  parcel: PickedParcel; world: World; onDismiss: () => void;
}) {
  const copy = PICK[useLang()];
  const canEnter = parcel.assignable || !!parcel.commonsName;
  const village = useVillage(parcel.cell);
  return (
    <section aria-label={copy.label} className="absolute inset-x-4 bottom-5 z-30 overflow-hidden rounded-2xl border border-parchment/15 bg-ink/95 text-parchment shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[min(540px,calc(100%-2rem))]">
      {canEnter ? (
        <div className="relative h-[230px] sm:h-[300px]" data-preview-cell={parcel.cell}>
          <ParcelPreview key={parcel.cell} cell={parcel.cell} seed={world.seed} seaLevel={world.seaLevel} peakElevation={world.peakElevation} radiusKm={world.radiusKm} commons={Object.keys(world.commons)} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-transparent to-transparent" />
          <span className="absolute left-5 top-4 rounded-full bg-ink/70 px-3 py-1 text-[12px] text-parchment/85">{copy.live}</span>
        </div>
      ) : null}
      <button type="button" aria-label={copy.close} title={copy.close} onClick={onDismiss} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-parchment/15 bg-ink/80 text-parchment/80 transition-colors hover:bg-ink-deep hover:text-parchment">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
        </svg>
      </button>
      <div className="relative px-6 pb-6 pt-4">
        <p className="text-[12px] tabular-nums text-parchment/50">{parcel.lat.toFixed(3)}° · {parcel.lng.toFixed(3)}°</p>
        <h2 className="mt-1.5 font-serif text-[1.7rem] leading-tight">{parcel.commonsName ?? village?.name ?? (canEnter ? copy.place : copy.ocean)}</h2>
        {village ? (
          <p data-village={village.name} className="mt-1 text-sm text-ember">
            {village.kind === 'abandoned village' ? copy.abandoned(village.graves) : copy.lives(village.kind, village.population, village.households)}
          </p>
        ) : null}
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
          {village && village.population > 0
            ? copy.village
            : canEnter ? copy.land : copy.sea}
        </p>
        <div className="mt-5 flex items-center gap-4">
          {canEnter ? <a data-parcel-entry={parcel.cell} href={`/parcel/${parcel.cell}`} className="btn btn-primary">{copy.go}</a> : null}
          <button type="button" onClick={onDismiss} className="btn btn-ghost">{copy.stay}</button>
        </div>
      </div>
    </section>
  );
}
