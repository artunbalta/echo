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
  /**
   * The village's count is on (C91): the card says so in its own sentence, because a yes given here is
   * also a yes to that, and a promise is only kept if it was made.
   */
  crowd?: boolean;
}

export default function ConsentCard({ consent, onAccept, onDecline, crowd = false }: ConsentCardProps) {
  const lang = useLang();
  if (consent !== "unset") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-5">
      <div className="hud-pop hud-in pointer-events-auto w-[min(420px,100%)] px-5 py-4">
        <p className="font-serif text-[17px] leading-snug text-parchment">{t(lang, "consent.title")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">{t(lang, "consent.body")}</p>
        {crowd ? (
          <p data-consent-crowd className="mt-1.5 text-[13px] leading-relaxed text-parchment/60">
            {t(lang, "consent.crowd")}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            data-consent-yes
            className="btn btn-sm btn-primary"
          >
            {t(lang, "consent.yes")}
          </button>
          <button
            type="button"
            onClick={onDecline}
            data-consent-no
            className="btn btn-sm btn-ghost"
          >
            {t(lang, "consent.no")}
          </button>
        </div>
      </div>
    </div>
  );
}
