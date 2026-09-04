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
 * `consent` is the chain's own state, and unset means OFF on this path: the card shows only while
 * the question is unanswered, and an answer of either kind is remembered by the chain, not here.
 */

import type { ConsentState } from "@/game/world/measure";

export interface ConsentCardProps {
  consent: ConsentState;
  onAccept: () => void;
  onDecline: () => void;
}

export default function ConsentCard({ consent, onAccept, onDecline }: ConsentCardProps) {
  if (consent !== "unset") return null;
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded border border-[#a06cd5]/30 bg-[#1c1326]/95 p-5 backdrop-blur-sm">
        <p className="font-pixel text-sm text-[#f4e9d0]">Your echo can learn from how you move here.</p>
        <p className="mt-2 text-xs leading-relaxed text-[#f4e9d0]/60">
          It reads where you go and what you choose, never what you type, and you can stop it at any
          time from the inspector. Say no and the world plays exactly the same.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-[#a06cd5] px-4 py-2 font-pixel text-xs text-[#1c1326] transition-opacity hover:opacity-90"
          >
            Let it watch
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded border border-[#f4e9d0]/20 px-4 py-2 font-pixel text-xs text-[#f4e9d0]/70 transition-colors hover:border-[#f4e9d0]/40"
          >
            Not this time
          </button>
        </div>
      </div>
    </div>
  );
}
