"use client";

/**
 * The registration screen (section 9).
 *
 * The sequence is the product: a planet turning with owned land already lit on it, one sentence
 * saying how much is left and what happens when it runs out, a name, and then a flight down to
 * ground you can walk on. Nothing else is on the screen, because everything else would compete
 * with the reveal, which is the only thing anyone will screenshot.
 *
 * The button keeps its verb. "Claim your parcel" becomes "Parcel claimed", never "Success".
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useReducedMotion, type GlobePhase } from "@/components/planet/motion";

const GlobeCanvas = dynamic(() => import("@/components/planet/GlobeCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#120c19]" />,
});

interface Status {
  round: number;
  resolution: number;
  remaining: number;
  triggerAt: number;
  untilSplit: number;
  parcelsSold: number;
  atFloor: boolean;
}

interface World {
  seed: string;
  radiusKm: number;
  startResolution: number;
  floorResolution: number;
  triggerFraction: number;
  seaLevel: number;
  peakElevation: number;
  commons: string[];
}

interface Parcel {
  h3Index: string;
  resolution: number;
  landFraction: number;
  areaKm2: number;
  roundAssigned: number;
  lat: number;
  lng: number;
  biome: string;
}

const BIOME_LABEL: Record<string, string> = {
  ocean: "Open water",
  beach: "Shoreline",
  grassland: "Grassland",
  forest: "Forest",
  rainforest: "Rainforest",
  savanna: "Savanna",
  desert: "Desert",
  tundra: "Tundra",
  taiga: "Taiga",
  "bare-rock": "Bare rock",
  snow: "Snow",
};

export function ClaimClient() {
  const reducedMotion = useReducedMotion();
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [phase, setPhase] = useState<GlobePhase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The planet first, because it is cheap and it is what the screen is. The registry second,
    // because seeding it is slow and the sentence about what is left can arrive a moment later.
    fetch("/api/planet/world")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWorld(data);
      })
      .catch(() => setError("The planet did not answer. Reload the page to try again."));

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

  const submit = useCallback(async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/planet/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "The claim did not go through. Try again.");
        return;
      }
      if (data.status === "waitlisted") {
        setError(data.message);
        return;
      }
      setParcel(data.parcel);
      setStatus(data.statusAfter);
      setClaimed((prev) => [data.parcel.h3Index, ...prev]);
      setPhase(reducedMotion ? "arrived" : "flying");
    } catch {
      setError("The planet did not answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, name, reducedMotion]);

  const sentence = useMemo(() => {
    if (!status) return null;
    if (status.atFloor) {
      return `${status.remaining.toLocaleString()} parcels left. This is the last round: nothing splits again.`;
    }
    return `${status.untilSplit.toLocaleString()} parcels left before every remaining parcel splits into seven.`;
  }, [status]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#120c19] text-[#f4e9d0]">
      <div className="absolute inset-0">
        {world ? (
          <GlobeCanvas
            seed={world.seed}
            seaLevel={world.seaLevel}
            peakElevation={world.peakElevation}
            claimed={claimed}
            myParcel={parcel?.h3Index ?? null}
            reducedMotion={reducedMotion}
            onArrived={() => setPhase("arrived")}
          />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
        <header className="pointer-events-auto max-w-xl">
          <h1 className="font-pixel text-xl tracking-wide sm:text-2xl">A planet with room on it</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#f4e9d0]/70">
            One sphere, divided into parcels. Every parcel has exactly one owner, permanently.
          </p>
        </header>

        {!parcel ? (
          <section className="pointer-events-auto w-full max-w-md rounded-lg border border-[#a06cd5]/30 bg-[#1c1326]/85 p-5 backdrop-blur-sm">
            {sentence ? (
              <p className="font-pixel text-sm leading-relaxed text-[#a06cd5]">{sentence}</p>
            ) : (
              <p className="font-pixel text-sm text-[#f4e9d0]/50">Reading the registry</p>
            )}

            <label className="mt-5 block text-xs uppercase tracking-widest text-[#f4e9d0]/50" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              autoComplete="off"
              className="mt-2 w-full rounded border border-[#f4e9d0]/20 bg-[#120c19] px-3 py-2 text-[#f4e9d0] outline-none focus:border-[#a06cd5]"
              placeholder="Who is arriving"
            />

            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || name.trim().length < 2}
              className="mt-4 w-full rounded bg-[#a06cd5] px-4 py-2.5 font-pixel text-sm text-[#120c19] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Claiming your parcel" : "Claim your parcel"}
            </button>

            <p className="mt-3 text-xs leading-relaxed text-[#f4e9d0]/45">
              Your parcel is chosen at random from what is left. You cannot pick, and it is yours
              from the moment it is drawn.
            </p>
            {error ? <p className="mt-3 text-xs text-[#e0806a]">{error}</p> : null}
          </section>
        ) : (
          <ParcelPanel parcel={parcel} status={status} phase={phase} />
        )}
      </div>
    </main>
  );
}

function ParcelPanel({
  parcel,
  status,
  phase,
}: {
  parcel: Parcel;
  status: Status | null;
  phase: GlobePhase;
}) {
  const area =
    parcel.areaKm2 >= 1
      ? `${parcel.areaKm2.toFixed(2)} km²`
      : `${Math.round(parcel.areaKm2 * 1e6).toLocaleString()} m²`;

  return (
    <section className="pointer-events-auto w-full max-w-md rounded-lg border border-[#a06cd5]/30 bg-[#1c1326]/90 p-5 backdrop-blur-sm">
      <p className="font-pixel text-sm text-[#a06cd5]">Parcel claimed</p>
      <h2 className="mt-1 font-pixel text-lg">{BIOME_LABEL[parcel.biome] ?? parcel.biome}</h2>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label="Area" value={area} />
        <Row label="Land" value={`${Math.round(parcel.landFraction * 100)}%`} />
        <Row label="Coordinates" value={`${parcel.lat.toFixed(3)}, ${parcel.lng.toFixed(3)}`} />
        <Row label="Round" value={`${parcel.roundAssigned}`} />
        <Row label="Resolution" value={`${parcel.resolution}`} />
        <Row label="Owners before you" value={status ? `${(status.parcelsSold - 1).toLocaleString()}` : "counting"} />
      </dl>

      <p className="mt-4 break-all font-mono text-[11px] leading-relaxed text-[#f4e9d0]/50">
        {parcel.h3Index}
      </p>
      <p className="text-[11px] text-[#f4e9d0]/40">
        That identifier is permanent. It names this parcel for as long as the planet exists.
      </p>

      <a
        href={`/parcel/${parcel.h3Index}`}
        className={`mt-4 block rounded bg-[#f4e9d0] px-4 py-2.5 text-center font-pixel text-sm text-[#120c19] transition-opacity hover:opacity-90 ${
          phase === "arrived" ? "opacity-100" : "pointer-events-none opacity-40"
        }`}
      >
        Walk into your parcel
      </a>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#f4e9d0]/45">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}
