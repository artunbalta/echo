"use client";

/**
 * Who knew you best (DECISIONS C80): the debrief after a person's last visit, as `/api/pilot?op=reveal`
 * sends it (lib/pilotReveal.ts). For each of the six it shows their words, their friends' median guess, their
 * echo's guess and what they did, with the closest marked. Then how many each was closest on, and what the
 * echo now knows. Plain words in the pilot's one palette; the flow sets it in its page.
 */
import { Fragment, useState } from "react";

import { t, type Key } from "@/lib/i18n";
import { shareCard, shareOrSave, shareText } from "@/lib/shareCard";

type Paradigm = "give" | "lend" | "bet" | "seed" | "path" | "greet";
type Witness = "said" | "friends" | "echo";

export interface Debrief {
  ready: boolean;
  rows?: { paradigm: Paradigm; said: number | null; friends: number | null; friendsCount: number; echo: number | null; did: number | null; looks: number; closest: Witness[] }[];
  tally?: Record<Witness, number>;
  knows?: Record<Paradigm, { looks: number; share: number }>;
  /** A circle's debrief, which may be passed on as a card (C83); never the study's. */
  shareable?: boolean;
}

/** A coded answer (0..1) in the words of the six, rounded to the nearest choice there is. */
export function answerText(lang: "en" | "tr", p: Paradigm, v: number): string {
  if (p === "give") return t(lang, `pilot.reveal.give${Math.round(v * 3)}` as Key);
  if (p === "lend") return t(lang, v >= 0.5 ? "pilot.reveal.lend1" : "pilot.reveal.lend0");
  if (p === "bet") return t(lang, v < 0.25 ? "pilot.betSafe" : v < 0.75 ? "pilot.betEven" : "pilot.betLong");
  if (p === "seed") return t(lang, v >= 0.5 ? "pilot.seedPlant" : "pilot.seedNow");
  if (p === "path") return t(lang, v >= 0.5 ? "pilot.pathUnmarked" : "pilot.pathMarked");
  return t(lang, v >= 0.5 ? "pilot.reveal.greet1" : "pilot.reveal.greet0");
}

const LABEL: Record<Witness, Key> = { said: "pilot.reveal.said", friends: "pilot.reveal.friends", echo: "pilot.reveal.echo" };

export default function PilotReveal({ debrief, lang, onBack }: { debrief: Debrief; lang: "en" | "tr"; onBack: () => void }) {
  const [shared, setShared] = useState<"shared" | "saved" | "cancelled" | null>(null);
  if (!debrief.rows || !debrief.tally || !debrief.knows) return null;
  const met = debrief.rows.filter((r) => r.did !== null).length;
  const passOn = async () => {
    const text = shareText(lang, debrief.tally!, met, `${window.location.origin}/pilot`);
    setShared(await shareOrSave(await shareCard(text, met), text));
  };
  const seen = Object.values(debrief.knows).map((k) => k.looks).filter((n) => n > 0).sort((a, b) => a - b);
  const looks = seen.length ? seen[Math.floor(seen.length / 2)]! : 0;
  const share = Object.values(debrief.knows).find((k) => k.looks === looks)?.share ?? 0;
  return (
    <div data-pilot-reveal>
      <h2 className="font-serif text-3xl">{t(lang, "pilot.reveal.title")}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-parchment/75">{t(lang, "pilot.reveal.lead")}</p>
      <div className="mt-6 divide-y divide-parchment/10">
        {debrief.rows.map((r) => (
          <div key={r.paradigm} data-pilot-reveal-row={r.paradigm} className="py-4">
            <h3 className="font-serif text-lg">{t(lang, `pilot.reveal.${r.paradigm}` as Key)}</h3>
            {r.did === null ? (
              <p className="mt-1 text-[13px] text-parchment/50">{t(lang, "pilot.reveal.unmet")}</p>
            ) : (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
                {(["said", "friends", "echo"] as const).map((w) => (
                  <Fragment key={w}>
                    <dt className="text-parchment/55">{t(lang, LABEL[w])}</dt>
                    <dd data-pilot-reveal-closest={r.closest.includes(w) || undefined} className={r.closest.includes(w) ? "font-medium text-parchment" : "text-parchment/70"}>
                      {r[w] === null ? (
                        <span className="text-[13px] text-parchment/45">{w === "friends" && r.friendsCount === 1 ? t(lang, "pilot.reveal.oneFriend") : t(lang, "pilot.reveal.noFriend")}</span>
                      ) : (
                        answerText(lang, r.paradigm, r[w]!)
                      )}
                      {r.closest.includes(w) ? (
                        <span aria-hidden className="ml-2 text-parchment">
                          ●
                        </span>
                      ) : null}
                    </dd>
                  </Fragment>
                ))}
                <dt className="text-parchment/55">{t(lang, "pilot.reveal.did")}</dt>
                <dd className="font-semibold text-parchment">{answerText(lang, r.paradigm, r.did)}</dd>
              </dl>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-[15px] leading-relaxed text-parchment/85">{t(lang, "pilot.reveal.tally", { echo: debrief.tally.echo, friends: debrief.tally.friends, said: debrief.tally.said })}</p>
      {looks > 0 ? <p className="mt-3 text-[13px] leading-relaxed text-parchment/60">{t(lang, "pilot.reveal.knows", { looks, share: `${Math.round(share * 100)}%` })}</p> : null}
      <p className="mt-3 text-[12px] text-parchment/45">{t(lang, "pilot.reveal.private")}</p>
      {debrief.shareable && met > 0 ? (
        <div className="mt-5">
          <button type="button" data-pilot-share onClick={() => void passOn()} className="rounded-full bg-parchment px-4 py-2 text-sm font-medium text-ink">
            {t(lang, "pilot.share.button")}
          </button>
          <p className="mt-2 text-[12px] leading-relaxed text-parchment/45">{shared === "saved" ? t(lang, "pilot.share.saved") : t(lang, "pilot.share.note")}</p>
        </div>
      ) : null}
      <div className="mt-6">
        <button type="button" onClick={onBack} className="text-sm text-parchment/55 hover:text-parchment">
          {t(lang, "pilot.back")}
        </button>
      </div>
    </div>
  );
}
