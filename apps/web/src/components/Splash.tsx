"use client";

import { useEffect, useState } from "react";

// First-load reveal for the landing route. The wordmark blooms in one letter at a
// time — e → ec → ech → echo — the tagline follows, then we dwell ~1s so the hero
// photo is decoded before we fade away onto a ready scene.
const WORD = "echo";
const TAGLINE = "A country that does not exist.";

const STAGGER = 0.3; // s between letters (keep in sync with .splash-letter timing)
const LETTER_ANIM = 0.6; // s per letter (matches the @keyframes duration)
// Tagline starts just after the last letter settles.
const TAGLINE_DELAY = (WORD.length - 1) * STAGGER + LETTER_ANIM + 0.15;
const TAGLINE_ANIM = 0.6;

const REVEAL_DONE_MS = (TAGLINE_DELAY + TAGLINE_ANIM) * 1000;
const HOLD_MS = 1000; // requested 1s dwell once everything is on screen
const EXIT_MS = 650; // fade-out duration (matches .splash transition)

export default function Splash() {
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Preload the landing hero image so the reveal lands on a ready photo, not a blank.
    let imgReady = false;
    const img = new window.Image();
    const ready = () => {
      imgReady = true;
    };
    img.onload = ready;
    img.onerror = ready; // never hang on a 404
    img.src = "/landing-back.png";
    if (img.complete) imgReady = true;

    let pollTimer = 0;
    let goneTimer = 0;

    const beginExit = () => {
      setExiting(true);
      goneTimer = window.setTimeout(() => setGone(true), EXIT_MS);
    };

    // After the reveal + 1s dwell, leave — but wait briefly for the photo if it's
    // still in flight, so we never fade onto an empty hero.
    const gate = () => {
      if (imgReady) beginExit();
      else pollTimer = window.setTimeout(gate, 100);
    };
    const exitTimer = window.setTimeout(gate, REVEAL_DONE_MS + HOLD_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(pollTimer);
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
        {TAGLINE}
      </p>
    </div>
  );
}
