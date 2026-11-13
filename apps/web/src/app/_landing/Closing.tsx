"use client";

/**
 * The foot of the landing (DECISIONS C100): the village at dusk, its windows coming on, and the one
 * thing there is to do.
 *
 * It is the film's last picture, drawn by the same painter (`pixels.ts`), so the page ends where the
 * film ends. The windows light one after another from the moment the village is first on the screen.
 */
import { useEffect, useRef, useState } from "react";

import { useLang, type Lang } from "@/lib/lang";
import PixelScene, { type PlaceSpec } from "./PixelScene";

const VILLAGE: PlaceSpec = { hz: 0.8, moon: [0.88, 0.42], houses: [[0.05, 9], [0.17, 8], [0.29, 11], [0.43, 8], [0.56, 10], [0.7, 8], [0.83, 9], [0.94, 8]] };
/** On a phone the same hill is a third as wide: fewer houses, or they stand in each other. */
const HAMLET: PlaceSpec = { hz: 0.8, moon: [0.84, 0.5], houses: [[0.06, 9], [0.3, 11], [0.56, 8], [0.78, 10]] };

const COPY: Record<Lang, { line: string; join: string }> = {
  en: { line: "The village is opening in turns.", join: "Join the waitlist" },
  tr: { line: "Köy sırayla açılıyor.", join: "Sıraya gir" },
};

export default function Closing() {
  const copy = COPY[useLang()];
  const host = useRef<HTMLElement>(null);
  // When the village was first seen, on the scene's clock; before that every window is dark.
  const since = useRef<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    setNarrow(query.matches);
    const listener = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        since.current = performance.now() / 1000;
        seen.disconnect();
      },
      { threshold: 0.4 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return (
    <section ref={host} className="relative bg-[#07040b]">
      <PixelScene
        place={narrow ? HAMLET : VILLAGE}
        rows={110}
        // One window after another, a third of a second apart; someone who asked for less motion finds them lit.
        lit={(i, t) => (since.current === null ? 0 : Math.min(1, Math.max(0, (t - since.current - 0.5 - i * 0.32) / 0.5)))}
        className="h-[clamp(360px,62vh,560px)] w-full"
      />
      <div className="absolute inset-x-0 top-[16%] flex flex-col items-center gap-6 px-5 text-center">
        <p className="font-display text-[clamp(2.1rem,5.4vw,3.6rem)] leading-[0.95] text-parchment">{copy.line}</p>
        <a href="#waitlist" onClick={() => window.dispatchEvent(new Event("echo:join"))} className="px-btn">
          {copy.join}
        </a>
      </div>
    </section>
  );
}
