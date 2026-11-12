"use client";

import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import dynamic from "next/dynamic";
import Link from "next/link";
import Splash from "@/components/Splash";
import { useLang, type Lang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { coarsePointer } from "@/lib/pointerKind";
import { step } from "@/lib/steps";
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
 * The hero's and the nav's words, in both languages (C89). They are here and not in the chrome's table
 * because they are this page's own, as its sections' words are; the legend, the waitlist and the demo
 * are still English only (⚑58). A browser set to Turkish reads Turkish (`detectLang`).
 */
const COPY: Record<Lang, { eyebrow: string; h1: [string, string]; body: string; small: string; walkIn: string; waitlist: string; scroll: string; nav: { legend: string; waitlist: string; demo: string; evidence: string } }> = {
  en: {
    eyebrow: "Who knows you best?",
    h1: ["A world that", "learns you."],
    body: "Walk into a village where small things happen. Before each one, your echo seals a guess about what you will do. Then you open them.",
    small: "A few minutes, in your browser, no account. Or point at the planet and pick a patch of land of your own.",
    walkIn: "Walk in",
    waitlist: "Join the waitlist",
    scroll: "scroll",
    nav: { legend: "Legend", waitlist: "Waitlist", demo: "Demo", evidence: "Evidence" },
  },
  tr: {
    eyebrow: "Seni en iyi kim tanıyor?",
    h1: ["Seni öğrenen", "bir dünya."],
    body: "Küçük şeylerin olduğu bir köye gir. Her birinden önce yankın, ne yapacağına dair bir tahmin mühürler. Sonra sen açarsın.",
    small: "Birkaç dakika, tarayıcında, hesap açmadan. Ya da gezegene bak ve kendine bir toprak parçası seç.",
    walkIn: "İçeri gir",
    waitlist: "Bekleme listesine katıl",
    scroll: "aşağı",
    nav: { legend: "Efsane", waitlist: "Bekleme listesi", demo: "Demo", evidence: "Kanıt" },
  },
};

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
 *                   #241d33 to parchment and the nav's over-hero state went with it. The nav is
 *                   still two-state, but both states are now dark; what changed is that the light
 *                   one had nothing left to sit on.
 *                   Its first button walks into the open village (C89, `lib/openVillage.ts`): the
 *                   world is open, so the page's main action is to go in, and the waitlist is
 *                   the second thing it offers, not the first.
 *   1  HowItGoes    what happens in there, in three steps, and the finding it rests on (C89).
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
  const copy = COPY[useLang()];

  // How far people come (C92): this page was opened.
  useEffect(() => step("landing"), []);

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
    <div className="relative bg-ink text-parchment">
      <Splash />

      <Nav />

      {/* ───────────────────────── HERO ───────────────────────── */}
      <section id="top" className="relative h-[100dvh] min-h-[560px] w-full overflow-hidden bg-ink">
        <HeroPlanet />

        {/* The vignette stays: it pulls the eye to the middle of the sphere. The scrim does not,
            because it existed to darken bright pixel art and there is nothing bright left. */}
        <div className="world-vignette pointer-events-none absolute inset-0" />
        {/* A soft wash on the reading side only, so the copy has contrast wherever the planet's
            lit limb happens to be turning. It stops well short of the sphere's middle. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent lg:to-40%" />

        {/* pointer-events-none so the copy does not swallow clicks meant for the planet behind it;
            the one thing that must stay clickable turns them back on for itself. */}
        <div className="echo-rise pointer-events-none absolute inset-0 z-10 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
          <div className="max-w-xl">
            <p className="mb-5 text-[10px] uppercase tracking-[.32em] text-echo-soft">{copy.eyebrow}</p>
            <h1 className="max-w-xl font-serif text-[clamp(3.6rem,6.6vw,6.8rem)] leading-[.98] tracking-[-.045em] text-parchment">
              {copy.h1[0]}<br /><span className="italic text-echo-soft">{copy.h1[1]}</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-parchment/75 sm:text-lg">
              {copy.body}
            </p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-parchment/45">
              {copy.small}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              {/* The world is open, so the first button goes into it (C89). It was the waitlist, which
                  asked a stranger to wait for something already here. */}
              <Link href={OPEN_VILLAGE_PATH} data-walk-in onClick={() => step("walk_in")} className="pointer-events-auto rounded-full bg-parchment px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white">
                {copy.walkIn}{" "}
                <span className="chev" aria-hidden>
                  ›
                </span>
              </Link>
              <a href="#waitlist" className="pointer-events-auto text-sm text-parchment/60 underline decoration-parchment/25 underline-offset-4 transition-colors hover:text-parchment hover:decoration-parchment/60">
                {copy.waitlist}
              </a>
            </div>
          </div>
        </div>

        <a
          href="#how"
          className="scroll-cue absolute bottom-5 left-1/2 z-10 -translate-x-1/2 font-pixel text-xs text-parchment/55"
          aria-label="Scroll for more"
        >
          ▾ {copy.scroll}
        </a>
      </section>

      <HowItGoes />
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

/* ── nav ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The navbar. Rebuilt for the page that actually exists now: three places to go on the page, the
 * evidence, the way in (C89), and nothing to log in to (auth is gone — see
 * _landing/README-auth-removal.md).
 *
 * Two-state on purpose, because the page is two-toned. Over the hero it is transparent with dark
 * type, since the hero art is bright pixel landscape. Past the hero every section is ink, so it
 * takes an ink background and parchment type. The original nav only ever had the light state,
 * because the old landing was light all the way down; keeping that here would have put navy text on
 * a dark page.
 *
 * Mobile drops the anchors and keeps the wordmark and the one CTA. A hamburger for three in-page
 * anchors is furniture, not navigation.
 */
function Nav() {
  const copy = COPY[useLang()];
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Both states are dark now that the hero is the planet. What survives of the two-state design is
  // the background: transparent over the planet, ink once the page has scrolled past it.
  const link = "text-parchment/60 hover:text-parchment";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-parchment/10 bg-ink/90 backdrop-blur" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            width={32}
            height={32}
            draggable={false}
            className="h-8 w-8 select-none rounded"
          />
          <span
            className="font-pixel text-xl font-bold lowercase tracking-wide text-parchment"
          >
            echo
          </span>
        </a>

        <div className="flex items-center gap-6">
          <a href="#legend" className={`hidden font-pixel text-xs transition-colors sm:block ${link}`}>
            {copy.nav.legend}
          </a>
          <a href="#waitlist" className={`hidden font-pixel text-xs transition-colors sm:block ${link}`}>
            {copy.nav.waitlist}
          </a>
          <a href="#demo" className={`hidden font-pixel text-xs transition-colors sm:block ${link}`}>
            {copy.nav.demo}
          </a>
          <Link href="/bench" className={`hidden font-pixel text-xs transition-colors sm:block ${link}`}>
            {copy.nav.evidence}
          </Link>
          <Link
            href={OPEN_VILLAGE_PATH}
            onClick={() => step("walk_in")}
            className={`rounded border-2 px-3 py-1.5 font-pixel text-xs font-bold transition-colors ${
              scrolled
                ? "border-parchment/30 text-parchment hover:border-parchment/70"
                : "border-parchment/25 text-parchment/90 hover:border-parchment/60"
            }`}
          >
            {copy.walkIn}
          </Link>
        </div>
      </nav>
    </header>
  );
}
