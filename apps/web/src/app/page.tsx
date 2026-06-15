"use client";

import Link from "next/link";

export default function Landing() {
  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-ink">
      {/* Atmospheric backdrop: the generated world, blurred and dimmed beneath the title. */}
      <div
        className="pixel absolute inset-0 opacity-30"
        style={{
          backgroundImage: "url(/assets/world/grass.png)",
          backgroundSize: "320px",
          imageRendering: "pixelated",
          filter: "blur(1px) brightness(0.7)",
        }}
      />
      <div className="world-vignette absolute inset-0" />

      <div className="echo-rise panel relative z-10 max-w-lg p-8 text-center">
        <h1 className="glow-echo mb-3 font-mono text-5xl font-bold tracking-tight text-echo">ECHO</h1>
        <p className="mb-6 font-mono text-sm leading-relaxed text-parchment/80">
          You&apos;ve arrived in a country that does not exist. It is your first day.
          <br />
          No one knows you here — not even you.
        </p>
        <Link
          href="/onboard"
          className="block rounded-lg bg-echo px-6 py-3 font-mono font-bold text-ink shadow-lg shadow-echo/20 transition hover:brightness-110 hover:shadow-echo/40"
        >
          Arrive →
        </Link>
        <p className="echo-pulse mt-4 font-mono text-[10px] text-parchment/40">
          Consent, then a character — from a selfie or a curated set.
        </p>
        <Link href="/venue" className="mt-5 block font-mono text-[10px] text-parchment/40 underline-offset-2 hover:text-echo hover:underline">
          ✈ THY fuar standı demo →
        </Link>
      </div>
    </main>
  );
}
