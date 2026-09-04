"use client";

/**
 * The landing demo, as the vertical slice (plan Section A).
 *
 * One world, one visible person, one act with a visible consequence, and an inspector that proves
 * the consequence came from the measurement and not from the code that drew it.
 *
 * The consent line comes first and means it: nothing is emitted, and nothing is even buffered,
 * until somebody says yes. Declining leaves the world entirely playable, which is the rule the
 * event schema has always stated and which /play does not yet keep (that is its own ticket).
 */
import { useCallback, useMemo, useRef, useState } from "react";

import Inspector, { useMeasureChain, type ReactionReading } from "@/components/world/Inspector";
import WorldCanvas from "@/components/world/WorldCanvas";
import { createMeasureChain, landingConsent, type MeasureChain } from "@/game/world/measure";
import { playerLayer } from "@/game/world/playerLayer";
import { scatterLayer } from "@/game/world/scatterLayer";
import { skyLayer } from "@/game/world/skyLayer";
import { DEMO_SCATTER } from "@/game/world/demoStations";
import { sliceLayer } from "@/game/world/sliceLayer";
import { terrainLayer } from "@/game/world/terrainChunks";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";

export interface DemoClientProps {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  k?: number;
}

export default function DemoClient(props: DemoClientProps) {
  // One chain for the life of the page. It arms itself if this browser has already consented.
  const chain = useMemo<MeasureChain>(() => createMeasureChain(), []);
  const { posterior, log, consent } = useMeasureChain(chain);
  const [reactions, setReactions] = useState<ReactionReading[]>([]);
  const [beat, setBeat] = useState<string | null>(null);
  const player = useRef<ReturnType<typeof playerLayer> | null>(null);

  const onReaction = useCallback((r: ReactionReading) => {
    setReactions((prev) => [...prev.filter((p) => p.channel !== r.channel), r]);
  }, []);

  const layers = useCallback(
    (world: PlanetWorld): WorldLayer[] => {
      const p = playerLayer();
      player.current = p;
      const slice = sliceLayer({
          chain,
          playerTile: () => {
            const at = p.position();
            return { x: at.x, y: at.y };
          },
          onReaction,
          onBeat: (text) => setBeat(text),
      });
      // A handle for the browser tests, and for anyone debugging in a console. Never in a
      // production bundle: the demo must not carry a way to move the player it did not earn.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __demo?: unknown }).__demo = { world, player: p, slice, chain };
      }
      // Sky first: it owns the air, and the terrain layer stands its fallback down when it
      // finds the air already claimed.
      // DEMO_SCATTER, not a bare call: the stations have to be excluded or the scatter puts a
      // tree in front of the cave the whole slice is about. It is a shared value so this line
      // and the test cannot drift apart again.
      return [skyLayer(), terrainLayer(), scatterLayer(DEMO_SCATTER), p, slice];
    },
    [chain, onReaction],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1c1326]">
      <WorldCanvas {...props} layers={layers} className="absolute inset-0" />

      {/* The controls, and nothing else: the point of the test is that nobody is told what to
          look for. */}
      <div className="pointer-events-none absolute bottom-6 left-6 rounded border border-[#a06cd5]/25 bg-[#1c1326]/85 px-4 py-3 font-pixel text-xs text-[#f4e9d0]/70 backdrop-blur-sm">
        <p className="text-[#a06cd5]">Your land</p>
        <p className="mt-2">W A S D to walk · shift to run · space to jump · drag to look</p>
        <p className="mt-1 text-[#f4e9d0]/40">` opens the inspector</p>
      </div>

      {beat ? (
        <p className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 font-pixel text-sm text-[#f4e9d0]/80 [text-shadow:0_1px_12px_rgba(18,12,25,0.9)]">
          {beat}
        </p>
      ) : null}

      {consent === "unset" ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
          <div className="pointer-events-auto max-w-md rounded border border-[#a06cd5]/30 bg-[#1c1326]/95 p-5 backdrop-blur-sm">
            <p className="font-pixel text-sm text-[#f4e9d0]">Your echo can learn from how you move here.</p>
            <p className="mt-2 text-xs leading-relaxed text-[#f4e9d0]/60">
              It reads where you go and what you choose, never what you type, and you can stop it at any
              time from the inspector. Say no and the world plays exactly the same.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => chain.accept()}
                className="rounded bg-[#a06cd5] px-4 py-2 font-pixel text-xs text-[#1c1326] transition-opacity hover:opacity-90"
              >
                Let it watch
              </button>
              <button
                type="button"
                onClick={() => chain.decline()}
                className="rounded border border-[#f4e9d0]/20 px-4 py-2 font-pixel text-xs text-[#f4e9d0]/70 transition-colors hover:border-[#f4e9d0]/40"
              >
                Not this time
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Inspector posterior={posterior} log={log} reactions={reactions} consent={consent} />
    </div>
  );
}
