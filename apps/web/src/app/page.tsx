"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import dynamic from "next/dynamic";
import Link from "next/link";
import Splash from "@/components/Splash";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { useLang, type Lang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { coarsePointer } from "@/lib/pointerKind";
import { step } from "@/lib/steps";
import { WRAP } from "./_landing/Section";
import HowItGoes from "./_landing/HowItGoes";
import LegendBook from "./_landing/LegendBook";
import CharacterSelect from "./_landing/CharacterSelect";
import DemoEntry from "./_landing/DemoEntry";

// The planet has to be client only: it opens a WebGL context, which does not exist on a server.
const HeroPlanet = dynamic(() => import("@/components/planet/HeroPlanet"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ink" />,
});

/**
 * The hero's words, in both languages (C89). They are here and not in the chrome's table because they
 * are this page's own, as its sections' words are (each section keeps its own, the same way). A
 * browser set to Turkish reads Turkish (`detectLang`). The header's and the footer's words are
 * `components/site`'s.
 */
const COPY: Record<Lang, { eyebrow: string; h1: [string, string]; body: string; small: string; walkIn: string; how: string }> = {
  en: {
    eyebrow: "Who knows you best?",
    h1: ["A world that", "learns you."],
    body: "Walk into a village where small things happen. Before each one, your echo seals a guess about what you will do. Then you open them.",
    small: "A few minutes, in your browser, no account. You can also click the planet to pick land of your own.",
    walkIn: "Walk in",
    how: "How it works",
  },
  tr: {
    eyebrow: "Seni en iyi kim tanıyor?",
    h1: ["Seni öğrenen", "bir dünya."],
    body: "Küçük şeylerin olduğu bir köye gir. Her birinden önce yankın, ne yapacağına dair bir tahmin mühürler. Sonra sen açarsın.",
    small: "Birkaç dakika, tarayıcında, hesap açmadan. İstersen gezegene tıklayıp kendi toprağını da seçebilirsin.",
    walkIn: "İçeri gir",
    how: "Nasıl çalışır",
  },
};

const SCROLLS = "html, body { height: auto; overflow: visible; }";

/**
 * The landing. Top to bottom:
 *
 *   hero            THE PLANET, turning, and the first-day line. It replaced a painted landscape
 *                   (public/landing-back.png, now unused by this page and left on disk) with the
 *                   world the registry actually sells parcels out of. Point at it and a hexagon
 *                   appears; click and it settles on that parcel and asks whether you want to see
 *                   it from the ground. The hero is no longer a picture of the product.
 *
 *                   That flipped the hero from light to dark, so the type over it went from
 *                   #241d33 to parchment.
 *                   Its one filled button walks into the open village (C89, `lib/openVillage.ts`):
 *                   the world is open, so the page's main action is to go in. Beside it is one
 *                   quiet link to what happens there, and under them one line saying the planet
 *                   itself can be clicked (C96: there were four ways in and nothing said which
 *                   was which). The waitlist is in the header, where every page has it.
 *   1  HowItGoes    what happens in there, in three steps, and the finding it rests on (C89).
 *   1a LegendBook   the myth, told as a book.
 *   1b CharacterSelect  the waitlist. A form, and the roster with a hole in it beside it.
 *   1c DemoEntry    the trailer and a door to the demo. Stays last.
 *
 * THE HEADER AND THE FOOTER are the site's (`components/site`, C96), the same on every page that is
 * a document. The header is clear over the planet (`over`) and solid once the page has scrolled.
 * Every section hangs from the header's left edge and keeps one rhythm (`_landing/Section.tsx`).
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
  const copy = COPY[useLang()];

  // How far people come (C92): this page was opened.
  useEffect(() => step("landing"), []);

  // Spring/inertia scrolling — pointer devices only. Touch keeps native scroll: no spring, and it
  // avoids the spring fighting iOS's address-bar/viewport behaviour.
  useEffect(() => {
    if (typeof window === "undefined" || coarsePointer()) return;
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
    <div className="relative bg-ink font-sans text-parchment antialiased">
      {/* This route scrolls; the global stylesheet locks the body for the full-screen world routes,
          so the page hands the scroll back for as long as it is mounted, as every other document
          page does (`components/site/SitePage.tsx`). It used to set `overflow: auto` on html and
          body from an effect and leave the body's `height: 100%`: on a phone (no Lenis) that made
          the BODY the scroller, so the window never scrolled, the header never learned the page had
          moved and stayed clear over the text, and a link to `/#how` from another page landed
          before the effect had run. */}
      <style dangerouslySetInnerHTML={{ __html: SCROLLS }} />
      <Splash />

      <SiteHeader over />

      <main>
        {/* ───────────────────────── HERO ───────────────────────── */}
        <section id="top" className="relative h-[100dvh] min-h-[600px] w-full overflow-hidden bg-ink">
          <HeroPlanet />

          {/* The vignette stays: it pulls the eye to the middle of the sphere. The scrim does not,
              because it existed to darken bright pixel art and there is nothing bright left. */}
          <div className="world-vignette pointer-events-none absolute inset-0" />
          {/* A soft wash on the reading side only, so the copy has contrast wherever the planet's
              lit limb happens to be turning. It stops well short of the sphere's middle. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent lg:to-40%" />

          {/* pointer-events-none so the copy does not swallow clicks meant for the planet behind it;
              the two things that must stay clickable turn them back on for themselves. The column is
              the header's, so the headline starts under the wordmark. */}
          <div className="echo-rise pointer-events-none absolute inset-0 z-10 flex flex-col justify-center pt-[60px]">
            <div className={WRAP}>
              <div className="max-w-xl">
                <p className="eyebrow mb-5">{copy.eyebrow}</p>
                {/* Two ranges: on a phone the headline is sized to the phone (the longer Turkish line
                    must hold on 320px), and from `lg` to the space left of the planet. */}
                <h1 className="font-serif text-[clamp(2.6rem,13.5vw,3.5rem)] leading-[.98] tracking-[-.04em] text-parchment lg:text-[clamp(3.4rem,6vw,5.5rem)]">
                  {copy.h1[0]}<br /><span className="italic text-echo-soft">{copy.h1[1]}</span>
                </h1>
                <p className="mt-7 max-w-md text-base leading-relaxed text-parchment/75 sm:text-lg">
                  {copy.body}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  {/* The world is open, so the one filled button goes into it (C89). It was the
                      waitlist, which asked a stranger to wait for something already here. */}
                  <Link href={OPEN_VILLAGE_PATH} data-walk-in onClick={() => step("walk_in")} className="btn btn-primary pointer-events-auto h-12 px-7 text-[15px]">
                    {copy.walkIn}
                    <span className="chev" aria-hidden>
                      ›
                    </span>
                  </Link>
                  <a href="#how" className="text-link pointer-events-auto text-sm">
                    {copy.how}
                  </a>
                </div>
                <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-parchment/50">
                  {copy.small}
                </p>
              </div>
            </div>
          </div>
        </section>

        <HowItGoes />
        <LegendBook />
        <CharacterSelect />
        <DemoEntry />
      </main>

      <SiteFooter />
    </div>
  );
}
