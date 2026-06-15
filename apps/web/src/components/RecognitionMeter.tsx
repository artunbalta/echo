"use client";

import { useEffect, useRef, useState } from "react";
import type { RecognitionParts } from "@/lib/useEcho";

/**
 * The recognition meter (B2) — the always-glanceable "how well your echo knows you" signal,
 * elevated out of the buried side bar into the world HUD. Deliberately NOT an XP bar: a row
 * of eight faint stars (the persona axes) that light as they resolve, over a soft tide that
 * rises as the echo's certainty in you grows. No score, no number-as-reward — recognition,
 * not progress-to-grind. Every value is real `/persona` state (see computeRecognition); the
 * honest sub-components are one hover away (transparency, §10), and an offline brain says so.
 */
export default function RecognitionMeter({
  recognition,
  parts,
  offline,
  loaded,
  onOpen,
}: {
  recognition: number;
  parts: RecognitionParts;
  offline: boolean;
  loaded: boolean;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Brief glow when recognition genuinely rises — the "it just learned something" tick (M1).
  const prev = useRef(recognition);
  const [rising, setRising] = useState(false);
  useEffect(() => {
    if (recognition > prev.current + 0.002) {
      setRising(true);
      const t = setTimeout(() => setRising(false), 1400);
      prev.current = recognition;
      return () => clearTimeout(t);
    }
    prev.current = recognition;
  }, [recognition]);

  const lit = Math.round(parts.breadth * 8); // axes resolved, of 8
  const pct = Math.round(recognition * 100);

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2 select-none"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        onClick={onOpen}
        aria-label={`Your echo knows you ${offline ? "(demo)" : `${pct} percent`}. Open the mirror.`}
        className={`panel block w-[min(240px,68vw)] rounded-lg px-3 py-2 text-left font-mono ${
          rising ? "recognition-rise" : ""
        }`}
      >
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-parchment/55">
          <span>your echo knows you</span>
          {offline && <span className="text-parchment/35">demo</span>}
        </div>

        {/* Constellation: the 8 axes, lighting up as they resolve. */}
        <div className="mb-1.5 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-all duration-700 ${
                i < lit ? "bg-echo star-lit" : "bg-parchment/15"
              }`}
            />
          ))}
        </div>

        {/* The rising tide — feathered, glowing leading edge; not a hard progress bar. */}
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-ink/80">
          <div
            className="recognition-tide absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
            style={{ width: `${Math.max(loaded ? 2 : 0, pct)}%`, opacity: offline ? 0.4 : 1 }}
          />
        </div>
      </button>

      {/* Transparency: the honest sub-components the headline is blended from. */}
      {expanded && loaded && (
        <div className="panel mt-1.5 w-[min(240px,68vw)] rounded-lg px-3 py-2 font-mono text-[10px] text-parchment/70">
          <div className="mb-1 text-parchment/45">{offline ? "demo values — ML offline" : "what this is made of"}</div>
          {(
            [
              ["sure of who you are", parts.certainty],
              ["facets resolved", parts.breadth],
              ["evidence gathered", parts.evidence],
              ["calls it gets right", parts.reliability],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="mb-1 flex items-center gap-2">
              <span className="w-28 shrink-0 text-parchment/55">{label}</span>
              <span className="h-1 flex-1 overflow-hidden rounded bg-ink">
                <span className="block h-full rounded bg-echo/70" style={{ width: `${Math.round(v * 100)}%` }} />
              </span>
            </div>
          ))}
          <div className="mt-1 text-parchment/35">click to open the mirror</div>
        </div>
      )}
    </div>
  );
}
