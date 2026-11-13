"use client";

import { useEffect } from "react";
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
import Closing from "./Closing";
import Evidence from "./Evidence";
import Film from "./Film";
import TryOne from "./TryOne";
import CharacterSelect from "./CharacterSelect";

// The planet has to be client only: it opens a WebGL context, which does not exist on a server.
// Nothing stands in for it while it loads: its box is empty and the page is already the page.
const HeroPlanet = dynamic(() => import("@/components/planet/HeroPlanet"), { ssr: false });

/**
 * The hero's words, in both languages. They are here and not in the chrome's table because they are
 * this page's own, as its sections' words are (each section keeps its own, the same way). The page is
 * English, and Turkish for whoever chose it with the header's switch (`lib/lang.ts`, C99). The
 * header's and the footer's words are `components/site`'s.
 *
 * The headline is the one sentence that says what this is, in the owner's words, and it is written in
 * Turkish first: the English is its own sentence and not a translation of it.
 */
const COPY: Record<Lang, { h1: string; body: string; peek: (seconds: number) => string; film: string; character: string; pick: string }> = {
  en: {
    // *…* is said in the echo's colour, with its echo behind it: the two things the sentence is about.
    h1: "An agent that *learns you* from what you do, then *acts like you.*",
    body: "A small village in your browser. You walk around. It learns you.",
    peek: (seconds) => `Look around for ${seconds} seconds`,
    film: "Watch the film",
    character: "Choose your character",
    pick: "This is the world. Pick a place on it to look at.",
  },
  tr: {
    h1: "Yaptıklarından *seni öğrenen,* sonra *senin gibi davranan* bir agent.",
    body: "Tarayıcında küçük bir köy. Sen gez, o seni öğrensin.",
    peek: (seconds) => `${seconds} saniye göz at`,
    film: "Filmi izle",
    character: "Karakterini seç",
    pick: "Dünya bu. Üstünde bir yer seç, oraya bak.",
  },
};

/** A sentence with its `*marked*` words set apart. */
function Said({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, i) =>
        i % 2 ? (
          <span key={i} className="echoed">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

const SCROLLS = "html, body { height: auto; overflow: visible; }";

/**
 * The landing (DECISIONS C97, C99). It is served by two pages, one in each language (`app/page.tsx`,
 * `app/tr/page.tsx`): English, and Turkish for a reader who chose it. Top to bottom:
 *
 *   hero            THE PLANET, first (C99): the world itself, turning, and a place on it can be
 *                   picked with a mouse or a thumb (`components/planet/HeroPlanet.tsx`). It has a box
 *                   of its own: over the words on an upright screen, beside them on a wide one
 *                   (`.hero-planet`, globals.css). For a week (C97) it was UNDER the words below
 *                   1024px and answered no thumb, so a phone, and a computer whose window was narrow
 *                   or zoomed in, opened on a headline and a form: "only text", in the owner's words,
 *                   with the world a scroll away. Before that it filled the hero behind the words.
 *                   Nothing is ever over it or under it, and it comes in when it has drawn (`.arrive`).
 *
 *                   Then what this is in one sentence, in the pixel face, and the waitlist: a name, an
 *                   email, one button. The village opens in turns, so the list is the page's main
 *                   action; the header's button for it is on the first screen at every size. Under the
 *                   form, two quiet links: a short look at the village (`lib/preview.ts`), which ends
 *                   at the same form, and the film below.
 *   1  Film         half a minute that says the whole thing, drawn live in its own frame.
 *   2  TryOne       how it works, by doing it once: two of the village's moments, answered on the page,
 *                   with ECHO's sealed call opened between them.
 *   3  Evidence     the finding it rests on: the thirteen twins, each where it scored and where one
 *                   look put it.
 *   4  CharacterSelect  a figure to go with the place: the roster with a hole in it. Optional, and it
 *                   knows who has just joined above (`lib/waitlistSeat.ts`).
 *   5  Closing      the village at dusk with its windows coming on, and the list once more.
 *
 * SHOWN, NOT SAID (C100). The owner's words for the page C97 left: "too much text, all of it", and
 * the three numbered steps "a one-prompt job". So what was three paragraphs is something done in
 * under a minute, what was a number in a box is thirteen marks either side of a line, and the page
 * draws its places in the film's own pixels (`pixels.ts`) where it used to describe them.
 *
 * WHAT WENT, and where. The reveal that held the page shut for four seconds (`Splash`) is gone: a
 * visitor sees the page at once. The legend's book is a page of its own, `/story`, with the header's
 * link to it. The trailer and its "walk the demo" are not on this page: the film is of an older world,
 * and a door to a walk is not what a page whose village opens in turns should end on. The spring laid
 * over the scroll wheel (Lenis) is gone; the page scrolls as the browser scrolls it.
 *
 * TWO VOICES, NO RULES. What is read is the site's one grotesque (`app/layout.tsx`, C97). What says
 * what a thing IS, a headline, a section's title, the number that is the point, is the film's pixel
 * face (C100, `.font-display`): C97 had set titles in the grotesque too, and the owner asked for the
 * page to be written "in pixels a little more". There is still no small spaced label over a title, no
 * italics, and no hairline between sections: space and a change of ground set them apart.
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
        <section id="top" className="hero">
          {/* The planet's box, and it is the first thing in the hero (C99): over the words on an upright
              screen, the right half of a wide one, edge to edge and top to bottom, with the words kept
              to the left of where it starts. One box, placed by the stylesheet (`.hero-planet`,
              globals.css); the words never share ground with it. Under it, one line saying what it
              is and that it can be pressed. */}
          <div className="hero-planet">
            <div className="hero-globe">
              <HeroPlanet />
            </div>
            <p className="hero-hint">{copy.pick}</p>
          </div>
          <div className={`${WRAP} hero-row`}>
            <div className="hero-words">
              <h1 className="hero-title font-display text-balance text-parchment">
                <Said text={copy.h1} />
              </h1>
              <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-parchment/75 sm:text-lg">{copy.body}</p>

              <div id="waitlist" className="mt-8 scroll-mt-28">
                <WaitlistForm
                  where="landing"
                  after={
                    <a href="#character" className="text-link mt-4 inline-block text-[15px]">
                      {copy.character}
                    </a>
                  }
                />
              </div>

              <p className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
                <Link href={OPEN_VILLAGE_PATH} data-walk-in onClick={() => step("walk_in")} className="text-link text-[15px]">
                  {copy.peek(PREVIEW_SECONDS)}
                </Link>
                <a href="#film" className="text-link text-[15px]">
                  {copy.film}
                </a>
              </p>
            </div>
          </div>
        </section>

        <Film />
        <TryOne />
        <Evidence />
        <CharacterSelect />
        <Closing />
      </main>

      <SiteFooter />
    </div>
  );
}
