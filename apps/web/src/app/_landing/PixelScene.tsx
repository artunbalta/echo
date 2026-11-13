"use client";

/**
 * A place at dusk, drawn in pixels and kept moving (DECISIONS C100): the film's own picture, on the page.
 *
 * It fills the box it is given. The picture is small (`rows` pixels tall, as wide as the box's shape
 * makes it) and the stylesheet enlarges it whole, by a whole number, so every pixel of it is a square
 * of the screen's and none is smeared. What is in it is the caller's: where the horizon and the moon
 * are, which houses, what stands in the grass (`things`), and anything drawn over the place (`over`:
 * an envelope in the sky).
 *
 * IT MOVES ONLY WHILE IT IS LOOKED AT. The loop runs at half the screen's rate, stops when the box is
 * off the screen or the tab is hidden, and for someone who has asked for less motion there is no loop:
 * one still picture, drawn again when the caller says something changed (`version`), with every motion
 * the caller draws already at its end (`settled`).
 */
import { useEffect, useRef } from "react";

import { drawPlace, makePlace, type Place, type Standing } from "./pixels";

export interface PlaceSpec {
  /** The horizon, as a fraction of the way down. */
  hz: number;
  /** The moon, as fractions of the picture. */
  moon: [number, number];
  /** A house at each `[x as a fraction, width in pixels]` on the far hill. */
  houses: [number, number][];
}

interface Props {
  place: PlaceSpec;
  /** About how many pixels tall the picture is. */
  rows?: number;
  /** How lit each window is, 0 to 1 (all of them, when not given). */
  lit?: (i: number, t: number) => number;
  /** What stands in the grass, asked every frame. `settled`: there is no next frame, so say where things come to rest. */
  things?: (p: Place, t: number, settled: boolean) => Standing[];
  /** Drawn over the place, with the same two. */
  over?: (g: CanvasRenderingContext2D, p: Place, t: number, settled: boolean) => void;
  /** Changes when what is drawn changed, for the still picture of someone who asked for less motion. */
  version?: string | number;
  className?: string;
}

const ALL_LIT = () => 1;

export default function PixelScene({ place, rows = 96, lit = ALL_LIT, things, over, version, className = "" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // What to draw is read afresh every frame, so a caller's new state needs no new canvas.
  const now = useRef({ lit, things, over });
  now.current = { lit, things, over };
  const redraw = useRef<() => void>(() => {});
  const spec = JSON.stringify(place);

  useEffect(() => {
    const host = box.current;
    const cv = canvas.current;
    if (!host || !cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const where = JSON.parse(spec) as PlaceSpec;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let made: Place | null = null;
    let seen = true;
    let raf = 0;
    let odd = false;

    const size = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 8 || h < 8) return;
      const ps = Math.max(2, Math.round(h / rows));
      const pw = Math.ceil(w / ps);
      const ph = Math.ceil(h / ps);
      if (made && made.W === pw && made.H === ph) return;
      cv.width = pw;
      cv.height = ph;
      cv.style.width = `${pw * ps}px`;
      cv.style.height = `${ph * ps}px`;
      made = makePlace(pw, ph, where.hz, where.moon, where.houses);
      draw();
    };
    const draw = () => {
      if (!made) return;
      const t = still ? 2.2 : performance.now() / 1000;
      const { lit: l, things: th, over: ov } = now.current;
      const clock = performance.now() / 1000;
      drawPlace(g, made, t, l, th ? th(made, clock, still) : []);
      ov?.(g, made, clock, still);
    };
    redraw.current = draw;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      odd = !odd;
      if (odd && seen && !document.hidden) draw();
    };

    size();
    const sized = new ResizeObserver(size);
    sized.observe(host);
    const watched = new IntersectionObserver(([e]) => (seen = !!e?.isIntersecting), { rootMargin: "120px" });
    watched.observe(host);
    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      watched.disconnect();
    };
  }, [spec, rows]);

  // The still picture, drawn again when its caller's state has changed.
  useEffect(() => {
    redraw.current();
  }, [version]);

  return (
    <div ref={box} className={`relative overflow-hidden bg-[#07040b] ${className}`} aria-hidden>
      <canvas ref={canvas} className="absolute left-0 top-0 block" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}
