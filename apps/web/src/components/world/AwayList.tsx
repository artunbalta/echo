"use client";

/**
 * What your echo met while it kept your body (DECISIONS C104, C105), one line a moment: what it was, and
 * whether the echo did what it said you would, walked on as you would, or held back (and what it would
 * have done). Shown on coming back, at the door for the last time it kept your place, and live while you
 * watch it.
 *
 * "NOT ME". Beside a moment in a family (the only moments the echo can ever stand in at), the person can
 * say its call was not them (`/api/echo/veto`). Each one makes the echo show more in that kind of
 * situation before it acts there again (C103).
 *
 * A LINE IT SAID FOR YOU (C109) is listed as what it said, in its own words, with "not me" beside it: each
 * makes it show more before it talks for you again. What was said to it is never here.
 */
import { TALK_KIND, type AwayEntry } from "@echo/shared";

import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { ON, familyOf, known } from "@/lib/knowable/calls";
import { momentWords, outcomeWords } from "@/lib/knowable/say";
import { t, type Lang } from "@/lib/i18n";

type Known = AwayEntry & { kind: Parameters<typeof outcomeWords>[1] };
const isKnown = (e: AwayEntry): e is Known => known(e.kind);
/** A line it said for them (C109). */
export const isTalk = (e: AwayEntry): boolean => e.kind === TALK_KIND && typeof e.said === "string";
/** What a list of what it did shows: moments it met, and lines it said. */
export const shown = (e: AwayEntry): boolean => isKnown(e) || isTalk(e);

/** One moment's key: the room logs each with its time and kind. */
export const vetoKey = (e: { at: number; kind: string }) => `${e.at}|${e.kind}`;

/** Say "that was not me" of one moment. Whether it was kept. */
export async function vetoMoment(e: AwayEntry): Promise<boolean> {
  try {
    await ensureIdentity();
    const r = await fetch("/api/echo/veto", { method: "POST", headers: identityHeaders(), body: JSON.stringify({ at: e.at, kind: e.kind, call: e.call }) });
    return r.ok;
  } catch {
    return false;
  }
}

/** How many things it did, and how many it held back at. */
export function awaySum(entries: readonly AwayEntry[]): { did: number; held: number } {
  return { did: entries.filter((e) => e.did !== ON).length, held: entries.filter((e) => e.did === ON && e.call !== ON).length };
}

function line(lang: Lang, e: Known): { text: string; done: boolean } {
  if (e.did !== ON) return { text: outcomeWords(lang, e.kind, e.did), done: true };
  if (e.call === ON) return { text: t(lang, "standin.away.on"), done: false };
  return { text: t(lang, "standin.away.held", { what: outcomeWords(lang, e.kind, e.call) }), done: false };
}

export function AwayList({
  lang,
  entries,
  vetoed,
  onVeto,
  max = 12,
}: {
  lang: Lang;
  entries: readonly AwayEntry[];
  vetoed?: ReadonlySet<string>;
  onVeto?: (e: AwayEntry) => void;
  max?: number;
}) {
  const met = entries.filter(shown).slice().reverse().slice(0, max);
  return (
    <ul className="mt-2 space-y-2.5">
      {met.map((e) => {
        if (!isKnown(e)) {
          const key = vetoKey(e);
          const said = vetoed?.has(key) ?? false;
          return (
            <li key={key} data-standin-away-entry="said" className="text-[13px] leading-snug">
              <p className="text-parchment/85">{t(lang, "standin.away.talk")}</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-echo-soft">“{e.said}”</span>
                {onVeto ? (
                  said ? (
                    <span data-veto-said className="shrink-0 text-[11px] text-parchment/45">
                      {t(lang, "veto.said")}
                    </span>
                  ) : (
                    <button type="button" data-veto={key} onClick={() => onVeto(e)} className="shrink-0 text-[11px] text-parchment/55 underline decoration-parchment/25 underline-offset-2 hover:text-parchment">
                      {t(lang, "veto.notMe")}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        }
        const l = line(lang, e);
        const key = vetoKey(e);
        const said = vetoed?.has(key) ?? false;
        return (
          <li key={key} data-standin-away-entry={l.done ? "did" : e.call === ON ? "on" : "held"} className="text-[13px] leading-snug">
            <p className="text-parchment/85">{momentWords(lang, e.kind, null).name}</p>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className={`text-[12px] ${l.done ? "text-echo-soft" : "text-parchment/50"}`}>{l.text}</span>
              {onVeto && familyOf(e.kind) && e.call !== ON ? (
                said ? (
                  <span data-veto-said className="shrink-0 text-[11px] text-parchment/45">
                    {t(lang, "veto.said")}
                  </span>
                ) : (
                  <button type="button" data-veto={key} onClick={() => onVeto(e)} className="shrink-0 text-[11px] text-parchment/55 underline decoration-parchment/25 underline-offset-2 hover:text-parchment">
                    {t(lang, "veto.notMe")}
                  </button>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
