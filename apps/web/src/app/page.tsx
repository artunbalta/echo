"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import AuthModal from "@/components/AuthModal";
import Splash from "@/components/Splash";
import LegendBook from "./_landing/LegendBook";
import CharacterSelect from "./_landing/CharacterSelect";
import DemoEntry from "./_landing/DemoEntry";
import { getSupabase } from "@/lib/supabase";

/**
 * The landing. Exactly three stacked sections, in this order (§1):
 *
 *   1a  LegendBook      the myth, told as a book. The hero.
 *   1b  CharacterSelect JOIN WAITLIST. The roster with a hole in it. The conversion surface.
 *   1c  DemoEntry       a quiet, honestly-labelled door to the live build.
 *
 * REMOVED from the old landing (all of it marketing, none of it serving those three):
 *   - the photo hero (title.png over landing-back.png) and its two CTAs
 *   - the FEATURES grid ("An agent that learns you, then moves things forward") + 3 SVG icons
 *   - the HOW IT WORKS three-step section
 *   - the WORLD showcase (browser-chrome mock around demo.png)
 *   - the FINAL CTA section ("Today is your first day.")
 *   - the nav links Product / How it works / World, and the footer's copies of them
 *   - the "▾ scroll" cue
 * Orphaned by that: public/title.png and public/demo.png. They are LEFT ON DISK, not deleted —
 * removing a page is reversible, deleting committed art is a decision for you, and they cost
 * nothing while untracked-in-use. public/logo.png stays: /onboard uses it too.
 *
 * KEPT deliberately, as a judgement call worth flagging: the top bar's Log in / Enter, and
 * AuthModal. The brief says exactly three sections, and this is a fourth thing. But AuthModal owns
 * the ONLY writes to the echo.userId / echo.email localStorage keys the rest of the app reads, and
 * deleting the only way an existing player signs in would be a bigger break than a small header.
 * It is reduced to the wordmark plus one text link, with no marketing nav.
 */

type Mode = "signin" | "signup";

export default function Landing() {
  const lenisRef = useRef<Lenis | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<Mode>("signin");
  const [email, setEmail] = useState<string | null>(null);

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

  // Freeze the spring while the auth modal is open.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (authOpen) lenis.stop();
    else lenis.start();
  }, [authOpen]);

  // Reflect an existing Supabase session in the header.
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) return;
    supa.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = supa.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="relative bg-ink text-parchment">
      <Splash />

      {/* Wordmark and a way back in. No marketing nav: there is nothing to navigate to. */}
      <header className="absolute inset-x-0 top-0 z-40">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#legend" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              draggable={false}
              className="h-7 w-7 select-none rounded"
            />
            <span className="font-pixel text-xl font-bold lowercase tracking-wide text-parchment">
              echo
            </span>
          </a>
          {email ? (
            <Link
              href="/play"
              className="font-pixel text-xs text-parchment/60 underline-offset-4 transition-colors hover:text-parchment hover:underline"
            >
              Enter <span aria-hidden>›</span>
            </Link>
          ) : (
            <button
              onClick={() => {
                setAuthMode("signin");
                setAuthOpen(true);
              }}
              className="font-pixel text-xs text-parchment/60 underline-offset-4 transition-colors hover:text-parchment hover:underline"
            >
              Log in
            </button>
          )}
        </nav>
      </header>

      <LegendBook />
      <CharacterSelect />
      <DemoEntry />

      <footer className="border-t border-parchment/10 bg-ink px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2">
          <p className="font-pixel text-sm lowercase text-parchment/50">echo</p>
          <p className="font-pixel text-xs text-parchment/30">A country that does not exist.</p>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthed={(e) => {
          setEmail(e);
          setAuthOpen(false);
        }}
      />
    </div>
  );
}
