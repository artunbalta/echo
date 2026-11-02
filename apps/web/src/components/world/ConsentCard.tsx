"use client";

/**
 * The consent line, in one place because there is one promise (task A1).
 *
 * It comes first and it means it: nothing is emitted, and nothing is even buffered or tallied,
 * until somebody says yes. Declining leaves the world entirely playable, which is the rule the
 * event schema has always stated and which /play does not yet keep (that is its own ticket).
 *
 * It is the same card on the demo cell and on a person's own parcel, and that is the point of
 * lifting it out of the demo's own mount: a person walking their own land is measured as much as a
 * person in the demo, so they are asked in exactly the same words. Two copies of this text is two
 * promises that can drift, and the one that drifts is the one nobody is reading.
 *
 * THE WORDS ARE SHORTER NOW (C68), and they still make the same three promises: what it reads and
 * what it never reads, that it can be stopped, and that no changes nothing.
 *
 * `consent` is the chain's own state, and unset means OFF on this path: the card shows only while
 * the question is unanswered, and an answer of either kind is remembered by the chain, not here.
 */

import type { ConsentState } from "@/game/world/measure";
import { t, useLang } from "@/lib/i18n";

export interface ConsentCardProps {
  consent: ConsentState;
  onAccept: () => void;
  onDecline: () => void;
}

export default function ConsentCard({ consent, onAccept, onDecline }: ConsentCardProps) {
  const lang = useLang();
  if (consent !== "unset") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-5">
      <div className="hud-pop hud-in pointer-events-auto w-[min(420px,100%)] px-5 py-4">
        <p className="font-serif text-[17px] leading-snug text-parchment">{t(lang, "consent.title")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">{t(lang, "consent.body")}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full bg-parchment px-4 py-2 text-[13px] font-medium text-ink transition-opacity hover:opacity-90"
          >
            {t(lang, "consent.yes")}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-parchment/20 px-4 py-2 text-[13px] text-parchment/75 transition-colors hover:border-parchment/40 hover:text-parchment"
          >
            {t(lang, "consent.no")}
          </button>
        </div>
      </div>
    </div>
  );
}
