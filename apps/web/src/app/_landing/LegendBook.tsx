"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BEATS, COVER } from "./legend";

/**
 * The legend book (landing §1a). A bespoke pixel-art book: cover, then seven spreads, each one
 * mythic line and one illustration. The hero of the page.
 *
 * WHAT THIS IS NOT, and why:
 *  - Not react-pageflip. It renders <div></div> on the server, so every legend line would be absent
 *    from the server HTML and invisible to search and to no-JS — while the brief requires graceful
 *    degradation. It is also unmaintained since 2022 with a floating "page-flip": "latest" prod dep.
 *  - Not a three.js / r3f book. It would turn the pitch into canvas textures (unreadable to screen
 *    readers, uncrawlable), add three + fiber + drei to a marketing page, and it is unlicensed
 *    tutorial code.
 *  - Not a CSS 3D rotateY curl. A photoreal paper curl is a different visual language from a flat
 *    16-bit dusk world, and the brief rules it out explicitly.
 *
 * THE TURN is what a 16-bit game would do: a short, discrete FRAME SEQUENCE (see TURN_FRAMES).
 * The leaf squashes to nothing and opens again over five fixed steps with no easing and no
 * interpolation between them — each frame is held, then replaced. Chunky and weighty, not a
 * continuous curl. `transition: none` is load-bearing: the moment a browser tweens between frames
 * this becomes the smooth 3D-ish animation the brief rejected.
 *
 * TEXT IS DOM. Every line is real text, server-rendered, selectable and readable by a screen reader.
 * With JS off you get the cover plus the whole legend as a plain ordered list (see <noscript>), so
 * the pitch survives even when nothing animates.
 *
 * PIXELS: `image-rendering: pixelated` and integer scaling only. The plates are 128x86, shown at
 * exactly 2x. See Plate() for why a breakpoint-stepped 3x silently broke that.
 */

/**
 * The turn, as held frames. Values are horizontal scale of the turning leaf. No easing function is
 * involved anywhere: the component holds each value for FRAME_MS and then jumps to the next.
 * 1 -> 0.55 -> 0.12 is the leaf closing; the content swaps at the narrowest point (frame 2, where
 * the page is edge-on and nothing is legible); 0.55 -> 1 is the new leaf opening.
 */
const TURN_FRAMES = [1, 0.55, 0.12, 0.55, 1] as const;
const SWAP_AT = 2;
/** Weight, not speed. ~95ms a frame reads as a page with mass; faster reads as a UI transition. */
const FRAME_MS = 95;


export default function LegendBook() {
  // -1 = cover, 0..BEATS.length-1 = spreads.
  const [page, setPage] = useState(-1);
  const [frame, setFrame] = useState(0);
  const [turning, setTurning] = useState(false);
  const [reduced, setReduced] = useState(false);
  const pending = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const goTo = useCallback(
    (next: number) => {
      if (turning) return;
      const clamped = Math.max(-1, Math.min(BEATS.length - 1, next));
      if (clamped === page) return;

      // prefers-reduced-motion: cut straight to the spread. No frames at all, per Appendix A.
      if (reduced) {
        setPage(clamped);
        return;
      }

      setTurning(true);
      pending.current = clamped;
      timers.current.forEach(clearTimeout);
      timers.current = TURN_FRAMES.map((_, i) =>
        window.setTimeout(() => {
          setFrame(i);
          if (i === SWAP_AT && pending.current !== null) setPage(pending.current);
          if (i === TURN_FRAMES.length - 1) {
            setTurning(false);
            pending.current = null;
          }
        }, i * FRAME_MS),
      );
    },
    [page, reduced, turning],
  );

  const next = useCallback(() => goTo(page + 1), [goTo, page]);
  const prev = useCallback(() => goTo(page - 1), [goTo, page]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(-1);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(BEATS.length - 1);
      }
    },
    [goTo, next, prev],
  );

  const beat = page >= 0 ? BEATS[page] : null;
  const scale = turning ? TURN_FRAMES[frame] : 1;
  const atEnd = page === BEATS.length - 1;

  return (
    <section id="legend" className="relative bg-ink px-4 pb-16 pt-24 sm:px-8 sm:pb-24 sm:pt-32">
      <div className="mx-auto max-w-4xl">
        <div
          role="group"
          aria-roledescription="book"
          aria-label="The legend of echo"
          tabIndex={0}
          onKeyDown={onKey}
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            touchX.current = null;
            if (start === null || end === null) return;
            const dx = end - start;
            if (Math.abs(dx) < 40) return; // a tap is not a swipe
            if (dx < 0) next();
            else prev();
          }}
          className="relative mx-auto rounded-sm outline-none ring-offset-4 ring-offset-ink focus-visible:ring-2 focus-visible:ring-parchment/40"
        >
          <Book scale={scale} beat={beat} page={page} />

          {/* Click targets on the page edges, as Appendix A asks. Buttons, not divs: they are real
              controls and must be reachable and announced. */}
          <PageEdge side="left" onClick={prev} disabled={page === -1 || turning} label="Previous page" />
          <PageEdge side="right" onClick={next} disabled={atEnd || turning} label="Next page" />
        </div>

        <Progress page={page} onGoTo={goTo} turning={turning} />

        {/* The whole legend, always in the DOM, for no-JS and for anything that does not run our
            script. Hidden from sighted users only because the book above already presents it. */}
        <noscript>
          <ol className="mx-auto mt-10 max-w-lg list-none space-y-5 text-center">
            {BEATS.map((b) => (
              <li key={b.id} className="font-pixel text-sm leading-relaxed text-parchment/70">
                {b.line}
              </li>
            ))}
          </ol>
        </noscript>
      </div>
    </section>
  );
}

/* ── the book itself ─────────────────────────────────────────────────────────────────────────── */

function Book({ scale, beat, page }: { scale: number; beat: (typeof BEATS)[number] | null; page: number }) {
  return (
    <div
      className="relative mx-auto flex w-full max-w-[560px] items-stretch justify-center rounded-sm border-2 border-[#2a2340] bg-[#120c19] p-2 shadow-[0_10px_0_#0d0812] sm:max-w-[720px] sm:p-3"
      style={{
        // The turning leaf squashes horizontally. transition:none is load-bearing — the instant a
        // browser tweens this, the discrete frame sequence becomes a smooth animation.
        transition: "none",
      }}
    >
      {/* binding: bark, down the middle */}
      <div
        aria-hidden
        className="absolute inset-y-2 left-1/2 z-20 hidden w-[10px] -translate-x-1/2 bg-bark shadow-[inset_2px_0_0_#5d3a22,inset_-2px_0_0_#5d3a22] sm:block sm:w-3"
      />
      <div
        className="flex w-full origin-center"
        style={{ transform: `scaleX(${scale})`, transition: "none" }}
      >
        {page < 0 ? <Cover /> : <Spread beat={beat!} />}
      </div>
    </div>
  );
}

function Cover() {
  return (
    <div className="flex min-h-[300px] w-full flex-col items-center justify-center gap-4 bg-parchment px-6 py-16 sm:min-h-[420px]">
      {/* The one echo-violet on this page, and it is small. The cover and the empty roster slot are
          the only two places it is allowed on the whole landing. */}
      <p className="font-pixel text-5xl font-bold lowercase tracking-tight text-echo sm:text-6xl">
        {COVER.mark}
      </p>
      <p className="font-pixel text-xs uppercase tracking-[0.3em] text-ink/50 sm:text-sm">
        {COVER.line}
      </p>
    </div>
  );
}

function Spread({ beat }: { beat: (typeof BEATS)[number] }) {
  return (
    <div className="grid w-full grid-cols-1 bg-parchment sm:grid-cols-2">
      {/* Left leaf: the plate. Degrades to nothing if the art is missing — the line still carries
          the beat, which is why the text is never baked into the image. */}
      <div className="flex items-center justify-center border-b-2 border-[#cdb88e] bg-[#e8d3a0] p-5 sm:border-b-0 sm:border-r-2 sm:p-6">
        <Plate beat={beat} />
      </div>
      {/* Right leaf: the line. Real DOM text. */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <p className="max-w-[26ch] text-balance font-pixel text-base leading-relaxed text-ink/85 sm:text-lg">
          {beat.line}
        </p>
      </div>
    </div>
  );
}

function Plate({ beat }: { beat: (typeof BEATS)[number] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [beat.id]);
  if (failed) {
    // Never a broken slot: an absent plate leaves a quiet parchment panel, and the legend line
    // beside it still carries the whole beat.
    return <div aria-hidden className="h-[172px] w-[256px] rounded-sm bg-[#cdb88e]/40" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by
    // next/image. `pixel` + an integer scale is the whole point.
    //
    // Fixed at exactly 2x (128x86 -> 256x172), and `max-w-none` is LOAD-BEARING. An earlier version
    // stepped 1x/2x/3x at breakpoints, but the 3x width did not fit inside the book's leaf, so the
    // stylesheet's `img { max-width: 100% }` quietly clamped it and the plate rendered at 2.31x —
    // a fractional scale, which smears the pixel grid. Any size here must actually FIT the leaf, or
    // the clamp silently undoes the integer rule. 2x fits every breakpoint down to a 390px phone.
    <img
      src={beat.plate}
      alt={beat.alt}
      width={128}
      height={86}
      draggable={false}
      onError={() => setFailed(true)}
      className="pixel box-content block w-[256px] max-w-none select-none"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

/* ── controls ────────────────────────────────────────────────────────────────────────────────── */

function PageEdge({
  side,
  onClick,
  disabled,
  label,
}: {
  side: "left" | "right";
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`absolute inset-y-0 z-30 w-12 cursor-pointer select-none outline-none transition-opacity disabled:pointer-events-none disabled:opacity-0 sm:w-16 ${
        side === "left" ? "-left-2 sm:-left-8" : "-right-2 sm:-right-8"
      }`}
    >
      <span
        aria-hidden
        className="mx-auto block font-pixel text-2xl text-parchment/25 transition-colors hover:text-parchment/70"
      >
        {side === "left" ? "‹" : "›"}
      </span>
    </button>
  );
}

function Progress({
  page,
  onGoTo,
  turning,
}: {
  page: number;
  onGoTo: (n: number) => void;
  turning: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      {[-1, ...BEATS.map((_, i) => i)].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onGoTo(n)}
          disabled={turning}
          aria-label={n === -1 ? "Cover" : `Page ${n + 1} of ${BEATS.length}`}
          aria-current={page === n ? "true" : undefined}
          className={`h-1.5 rounded-full transition-all ${
            page === n ? "w-6 bg-parchment/70" : "w-1.5 bg-parchment/20 hover:bg-parchment/40"
          }`}
        />
      ))}
    </div>
  );
}
