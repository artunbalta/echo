"use client";

import { useEffect, useState } from "react";

import { SITE_COPY } from "@/components/site/SiteHeader";
import { useLang } from "@/lib/lang";

// First-load reveal for the landing route. The wordmark blooms in one letter at a
// time — e → ec → ech → echo — the tagline follows, then we dwell ~1s and fade away.
// The tagline is the site's own (the footer says the same line), in the reader's language.
const WORD = "echo";

const STAGGER = 0.3; // s between letters (keep in sync with .splash-letter timing)
const LETTER_ANIM = 0.6; // s per letter (matches the @keyframes duration)
// Tagline starts just after the last letter settles.
const TAGLINE_DELAY = (WORD.length - 1) * STAGGER + LETTER_ANIM + 0.15;
const TAGLINE_ANIM = 0.6;

const REVEAL_DONE_MS = (TAGLINE_DELAY + TAGLINE_ANIM) * 1000;
const HOLD_MS = 1000; // requested 1s dwell once everything is on screen
const EXIT_MS = 650; // fade-out duration (matches .splash transition)

/** Set once the reveal has played in this tab: coming back from the world goes straight to the page. */
const SEEN_KEY = "echo.splash";
/**
 * When this load's reveal began. In development React runs an effect, undoes it and runs it again at
 * once: the first pass set the key and the second read it, so the reveal never played for anyone running
 * the site locally. A key set within this moment is this same arrival, not an earlier one.
 */
let began = 0;
const SAME_ARRIVAL_MS = 1000;

export default function Splash() {
  const tagline = SITE_COPY[useLang()].tagline;
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Once a tab (C89). The reveal is an arrival; someone stepping back out of the village has
    // already arrived, and should not wait four seconds to see the page again.
    try {
      if (sessionStorage.getItem(SEEN_KEY) && Date.now() - began > SAME_ARRIVAL_MS) {
        setGone(true);
        return;
      }
      began = Date.now();
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // no session storage: it plays, as it always did
    }

    let goneTimer = 0;
    // After the reveal + 1s dwell, leave. It used to wait here for /landing-back.png, a picture the
    // hero stopped showing when the planet replaced it: 770 KB fetched to hold a door shut.
    const exitTimer = window.setTimeout(() => {
      setExiting(true);
      goneTimer = window.setTimeout(() => setGone(true), EXIT_MS);
    }, REVEAL_DONE_MS + HOLD_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(goneTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`splash${exiting ? " splash--exit" : ""}`}
      role="status"
      aria-label="Loading echo"
    >
      <div className="splash-mark" aria-hidden>
        {WORD.split("").map((ch, i) => (
          <span
            key={i}
            className="splash-letter glow-echo"
            style={{ animationDelay: `${i * STAGGER}s` }}
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="splash-tagline" aria-hidden style={{ animationDelay: `${TAGLINE_DELAY}s` }}>
        {tagline}
      </p>
    </div>
  );
}
