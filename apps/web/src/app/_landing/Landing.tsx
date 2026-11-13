"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import WaitlistForm from "@/components/site/WaitlistForm";
import { useLang, type Lang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { PREVIEW_SECONDS } from "@/lib/preview";
import { step } from "@/lib/steps";
import { WRAP } from "./Section";
import HowItGoes from "./HowItGoes";
import CharacterSelect from "./CharacterSelect";

// The planet has to be client only: it opens a WebGL context, which does not exist on a server.
// Nothing stands in for it while it loads: its box is empty and the page is already the page.
const HeroPlanet = dynamic(() => import("@/components/planet/HeroPlanet"), { ssr: false });

/**
 * The hero's words, in both languages. They are here and not in the chrome's table because they are
 * this page's own, as its sections' words are (each section keeps its own, the same way). A browser
 * set to Turkish reads Turkish (`detectLang`). The header's and the footer's words are
 * `components/site`'s.
 *
 * The headline is the one sentence that says what this is, in the owner's words, and it is written in
 * Turkish first: the English is its own sentence and not a translation of it.
 */
const COPY: Record<Lang, { h1: string; body: string; peek: (seconds: number) => string; character: string }> = {
  en: {
    h1: "An agent that learns you from what you do, then acts like you.",
    body: "ECHO is a small village you walk through in your browser. It watches what you do there, not what you say. For now the village is opening in turns.",
    peek: (seconds) => `Look around for ${seconds} seconds first`,
    character: "Choose your character",
  },
  tr: {
    h1: "Yaptıklarından seni öğrenen, sonra senin gibi davranan bir agent.",
    body: "ECHO, tarayıcında gezdiğin küçük bir köy. Orada ne söylediğine değil, ne yaptığına bakar. Köy şimdilik sırayla açılıyor.",
    peek: (seconds) => `Önce ${seconds} saniye göz at`,
    character: "Karakterini seç",
  },
};

const SCROLLS = "html, body { height: auto; overflow: visible; }";

/**
 * The landing (DECISIONS C97). It is served by two pages, one in each language (`app/page.tsx`,
 * `app/tr/page.tsx`), so its first paint is in its reader's language. Top to bottom:
 *
 *   hero            what this is in one sentence, and the waitlist: a name, an email, one button. The
 *                   village opens in turns now, so the list is the page's main action and it is the
 *                   first thing on it. Under the form, one quiet link to a ten-second look at the
 *                   village (`lib/preview.ts`), which ends at the same form.
 *
 *                   THE PLANET has a box of its own: beside the words on a wide screen, under them on
 *                   a narrow one. It used to fill the hero behind the words, so on a phone the
 *                   headline was set over a turning sphere, and everywhere it appeared all at once a
 *                   second or two after the page. Now nothing is ever over it or under it, and it
 *                   comes in when it has drawn (`.arrive`). On a wide screen it can still be pointed
 *                   at and a parcel picked (`components/planet/HeroPlanet.tsx`).
 *   1  HowItGoes    what happens in the village, in three steps, and the finding it rests on.
 *   2  CharacterSelect  a figure to go with the place: the roster with a hole in it. Optional, and it
 *                   knows who has just joined above (`lib/waitlistSeat.ts`).
 *
 * WHAT WENT, and where. The reveal that held the page shut for four seconds (`Splash`) is gone: a
 * visitor sees the page at once. The legend's book is a page of its own, `/story`, with the header's
 * link to it. The trailer and its "walk the demo" are not on this page: the film is of an older world,
 * and a door to a walk is not what a page whose village opens in turns should end on. The spring laid
 * over the scroll wheel (Lenis) is gone; the page scrolls as the browser scrolls it.
 *
 * ONE FACE, NO RULES. Every word is the site's one family (`app/layout.tsx`), upright, with titles in
 * its heavier weight; the wordmark alone is the pixel face. There is no small spaced label over a
 * title, no second line in italics, and no hairline between sections: space sets them apart.
 *
 * THE HEADER AND THE FOOTER are the site's (`components/site`, C96), the same on every page that is
 * a document. The header is clear over the hero (`over`) and solid once the page has scrolled.
 *
 * NO AUTH. The header's Log in, the hero's two auth buttons and AuthModal are all gone (§6). What
 * that actually costs is documented in _landing/README-auth-removal.md — short version: nothing
 * crashes, because every reader of `echo.userId` already falls back to a generated anonymous id.
 * What is lost is account CONTINUITY: there is no longer any way to sign in, so a returning player
 * on a new browser gets a new anonymous echo instead of their old one.
 */
export default function Landing() {
  const copy = COPY[useLang()];

  // How far people come (C92): this page was opened.
  useEffect(() => step("landing"), []);

  return (
    <div className="relative bg-ink font-sans text-parchment antialiased">
      {/* This route scrolls; the global stylesheet locks the body for the full-screen world routes,
          so the page hands the scroll back for as long as it is mounted, as every other document
          page does (`components/site/SitePage.tsx`). It used to set `overflow: auto` on html and
          body from an effect and leave the body's `height: 100%`: on a phone that made the BODY the
          scroller, so the window never scrolled, the header never learned the page had moved and
          stayed clear over the text, and a link to `/#how` from another page landed before the
          effect had run. */}
      <style dangerouslySetInnerHTML={{ __html: SCROLLS }} />

      <SiteHeader over />

      <main>
        {/* ───────────────────────── HERO ───────────────────────── */}
        <section id="top" className="relative overflow-hidden bg-ink">
          {/* The planet's box. From `lg` it is the right of the hero, edge to edge and top to bottom,
              and the words keep to the left of where it starts; under `lg` it is a square under the
              words. The words never share ground with it. */}
          <div className={`${WRAP} relative flex flex-col lg:min-h-[100dvh] lg:justify-center`}>
            <div className="relative z-10 pb-4 pt-[calc(60px+2.75rem)] sm:pt-[calc(60px+4rem)] lg:max-w-[min(540px,calc(46vw-3rem))] lg:py-[calc(60px+2rem)]">
              <h1 className="text-balance text-[clamp(2rem,8.4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-.03em] text-parchment lg:text-[clamp(2.5rem,3.7vw,3.6rem)]">{copy.h1}</h1>
              <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-parchment/75 sm:text-lg">{copy.body}</p>

              <div id="waitlist" className="mt-9 scroll-mt-28">
                <WaitlistForm
                  where="landing"
                  after={
                    <a href="#character" className="text-link mt-4 inline-block text-[15px]">
                      {copy.character}
                    </a>
                  }
                />
              </div>

              <p className="mt-7">
                <Link href={OPEN_VILLAGE_PATH} data-walk-in onClick={() => step("walk_in")} className="text-link text-[15px]">
                  {copy.peek(PREVIEW_SECONDS)}
                </Link>
              </p>
            </div>

            <div className="relative mx-auto mt-6 aspect-square w-full max-w-[420px] lg:hidden">
              <HeroPlanetWhen wide={false} />
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 hidden w-[50vw] lg:block">
            <HeroPlanetWhen wide />
          </div>
        </section>

        <HowItGoes />
        <CharacterSelect />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * The planet, mounted in the one of its two boxes this screen shows. Both boxes are in the page (one
 * is hidden by the stylesheet), and a planet in each would be two WebGL contexts for one picture.
 */
function HeroPlanetWhen({ wide }: { wide: boolean }) {
  const isWide = useWide();
  return isWide === wide ? <HeroPlanet /> : null;
}

/** Whether the screen is `lg` or wider; null until the page is in a browser. */
function useWide(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    setWide(query.matches);
    const listener = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return wide;
}
