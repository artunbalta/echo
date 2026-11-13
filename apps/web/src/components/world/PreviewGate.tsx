"use client";

/**
 * Where a short look ends (DECISIONS C97, `lib/preview.ts`): the waitlist, standing where the
 * village was.
 *
 * The village is gone from the page by the time this is drawn (`components/planet/ParcelVisit.tsx`
 * unmounts it), so nothing behind this card is running, listening for a key or making a sound; what
 * is seen behind it is the last frame of the look, held still. The card says what happened in one
 * sentence, asks for the same two things the landing asks for (`components/site/WaitlistForm.tsx`),
 * and has one way back.
 */
import Link from "next/link";
import { useEffect } from "react";

import WaitlistForm from "@/components/site/WaitlistForm";
import { useLang, type Lang } from "@/lib/lang";
import { step } from "@/lib/steps";

const COPY: Record<Lang, { title: string; body: string; home: string }> = {
  en: {
    title: "The rest opens in turns.",
    body: "For now the village opens to the people on the waitlist, a few at a time. Leave your name and we will write to you when it is your turn.",
    home: "Back to the front page",
  },
  tr: {
    title: "Devamı sırayla açılıyor.",
    body: "Köy şimdilik bekleme listesindekilere azar azar açılıyor. Adını bırak, sıran geldiğinde sana yazalım.",
    home: "Ana sayfaya dön",
  },
};

export default function PreviewGate({ still }: { still: string | null }) {
  const copy = COPY[useLang()];
  // How far people come (C92): a look that reached its end.
  useEffect(() => step("gated"), []);
  return (
    <div data-preview-gate className="absolute inset-0 overflow-y-auto bg-ink">
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- a frame of this page's own canvas, held in memory
        <img src={still} alt="" aria-hidden className="pointer-events-none fixed inset-0 h-full w-full scale-105 object-cover opacity-45 blur-[6px]" />
      ) : null}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-ink/60 via-ink/75 to-ink" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[520px] flex-col justify-center px-5 py-10">
        <Link href="/" className="mb-10 flex w-fit items-center gap-2.5" aria-label="echo">
          <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
          <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
        </Link>
        <h1 className="text-balance text-[clamp(1.75rem,6vw,2.4rem)] font-semibold leading-[1.1] tracking-[-.025em] text-parchment">{copy.title}</h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-parchment/75">{copy.body}</p>
        <WaitlistForm where="gate" className="mt-8" />
        <p className="mt-8">
          <Link href="/" className="text-link text-[15px]">
            {copy.home}
          </Link>
        </p>
      </div>
    </div>
  );
}
