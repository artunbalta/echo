"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function Landing() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Respect reduced-motion: hold the start frame (poster) instead of animating.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduce?.matches) {
      v.pause();
      v.style.opacity = "0"; // reveal the poster (start frame) beneath
      return;
    }

    v.play().catch(() => {
      /* autoplay can be blocked; the poster remains as a graceful fallback */
    });

    // Soft crossfade loop: dip near the end so the traveler's reset to the foot of
    // the path dissolves through the start-frame poster rather than hard-cutting.
    const onTime = () => {
      if (!v.duration) return;
      const remaining = v.duration - v.currentTime;
      v.style.opacity = remaining < 0.55 || v.currentTime < 0.45 ? "0.18" : "1";
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink">
      {/* The traveler arriving — start frame walks itself to the end frame (Higgsfield). */}
      <img
        src="/landing-poster.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <video
        ref={videoRef}
        className="hero-video absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/landing-poster.jpg"
      >
        <source src="/landing.mp4" type="video/mp4" />
      </video>

      {/* Legibility + mood. */}
      <div className="hero-scrim absolute inset-0" />
      <div className="world-vignette absolute inset-0" />

      {/* Hero content: exact title (font + string from the source card), copy, CTA. */}
      <div className="echo-rise absolute inset-0 z-10 flex flex-col justify-center px-8 sm:px-14 lg:px-24">
        <div className="max-w-xl">
          <img
            src="/title.png"
            alt="AI AGENTS THAT LEARN YOU."
            draggable={false}
            className="title-img w-[min(80vw,560px)] select-none"
          />

          <p className="mt-7 max-w-md font-pixel text-lg leading-relaxed text-[#241d33] [text-shadow:0_1px_0_rgba(255,248,230,0.55)] sm:text-xl">
            You&apos;ve arrived in a country that does not exist. It is your first day.
            No one knows you here — not even you.
          </p>

          <Link href="/onboard" className="btn-pixel mt-8" aria-label="Get started">
            Get Started <span className="chev" aria-hidden>›</span>
          </Link>
        </div>
      </div>

      {/* Preserve the existing venue-demo entry point, unobtrusively. */}
      <Link
        href="/venue"
        className="absolute bottom-4 right-5 z-10 font-pixel text-xs text-[#241d33]/70 underline-offset-4 transition hover:text-[#241d33] hover:underline"
      >
        ✈ THY fuar standı demo →
      </Link>
    </main>
  );
}
