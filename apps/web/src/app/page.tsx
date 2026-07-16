"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import Splash from "@/components/Splash";
import LegendBook from "./_landing/LegendBook";
import CharacterSelect from "./_landing/CharacterSelect";
import DemoEntry from "./_landing/DemoEntry";

/**
 * The landing. Top to bottom:
 *
 *   hero            the pixel landscape and the first-day line. Restored from the original.
 *   1a LegendBook   the myth, told as a book.
 *   1b CharacterSelect  JOIN WAITLIST. The roster with a hole in it, form at the bottom.
 *   1c DemoEntry    the trailer and a door to the live build. Stays last.
 *
 * REMOVED from the original landing: the FEATURES grid and its 3 SVG icons, HOW IT WORKS, the WORLD
 * showcase (browser chrome around demo.png), the FINAL CTA, the Product / How it works / World nav
 * and its footer copies, and the "▾ scroll" target that pointed at them. public/demo.png is orphaned
 * by that and is LEFT ON DISK rather than deleted; public/title.png and public/landing-back.png are
 * back in use by the hero.
 *
 * NO AUTH. The header's Log in, the hero's two auth buttons and AuthModal are all gone (§6). What
 * that actually costs is documented in _landing/README-auth-removal.md — short version: nothing
 * crashes, because every reader of `echo.userId` already falls back to a generated anonymous id.
 * What is lost is account CONTINUITY: there is no longer any way to sign in, so a returning player
 * on a new browser gets a new anonymous echo instead of their old one.
 */
export default function Landing() {
  const lenisRef = useRef<Lenis | null>(null);

  // This route scrolls; the global stylesheet locks body overflow for the full-screen world/venue
  // routes, so opt back in here and restore on leave.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { h: html.style.overflow, b: document.body.style.overflow };
    html.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      html.style.overflow = prev.h;
      document.body.style.overflow = prev.b;
    };
  }, []);

  // Spring/inertia scrolling — pointer devices only. Touch keeps native scroll: no spring, and it
  // avoids the spring fighting iOS's address-bar/viewport behaviour.
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1, anchors: true });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <div className="relative bg-ink text-parchment">
      <Splash />

      {/* Wordmark only. There is nothing to navigate to, and nothing to log in to. */}
      <header className="absolute inset-x-0 top-0 z-40">
        <nav className="mx-auto flex max-w-6xl items-center px-5 py-4 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              draggable={false}
              className="h-8 w-8 select-none rounded"
            />
            <span className="font-pixel text-xl font-bold lowercase tracking-wide text-[#1f2740]">
              echo
            </span>
          </a>
        </nav>
      </header>

      {/* ───────────────────────── HERO ───────────────────────── */}
      <section id="top" className="relative h-[100dvh] min-h-[560px] w-full overflow-hidden bg-ink">
        <img
          src="/landing-back.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="hero-scrim absolute inset-0" />
        <div className="world-vignette absolute inset-0" />

        <div className="echo-rise absolute inset-0 z-10 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
          <div className="max-w-xl">
            <img
              src="/title.png"
              alt="AI AGENTS THAT LEARN YOU."
              draggable={false}
              className="title-img w-[min(84vw,560px)] select-none"
            />
            <p className="mt-6 max-w-md font-pixel text-base leading-relaxed text-[#241d33] [text-shadow:0_1px_0_rgba(255,248,230,0.55)] sm:mt-7 sm:text-xl">
              You&apos;ve arrived in a country that does not exist. It is your first day. No one knows
              you here, not even you.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              {/* Was "Get Started" into the auth modal. With auth gone the only thing to start is
                  the waitlist, so it goes there rather than nowhere. */}
              <a href="#waitlist" className="btn-pixel" aria-label="Join the waitlist">
                Join the waitlist{" "}
                <span className="chev" aria-hidden>
                  ›
                </span>
              </a>
            </div>
          </div>
        </div>

        <a
          href="#legend"
          className="scroll-cue absolute bottom-5 left-1/2 z-10 -translate-x-1/2 font-pixel text-xs text-[#241d33]"
          aria-label="Scroll for more"
        >
          ▾ scroll
        </a>
      </section>

      <LegendBook />
      <CharacterSelect />
      <DemoEntry />

      <footer className="border-t border-parchment/10 bg-ink px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2">
          <p className="font-pixel text-sm lowercase text-parchment/50">echo</p>
          <p className="font-pixel text-xs text-parchment/30">A country that does not exist.</p>
        </div>
      </footer>
    </div>
  );
}
