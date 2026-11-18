"use client";

/**
 * Watching your echo from outside (DECISIONS C105): the village of the room's world, a camera on the body
 * your echo keeps, and beside it what the echo has met, each moment as it meets it.
 *
 * WHAT THE PAGE IS BUILT FROM is the village and nothing a person does in it: the ground, the houses, the
 * villagers and their animals, the room's bodies (`othersLayer` reading the watching connection), and the
 * camera (`watchLayer`). No walk, no acts, no moments, no envelopes: nothing here is measured, and
 * nothing is sent of the person but a "that was not me" when they say one.
 *
 * WHAT IS SAID TO IT (C107): a line anyone in the room says to the body, shown as it comes and kept nowhere,
 * with who said it named as the village names them. Beside it, what the echo answered for you where it has
 * earned talking (C109), with "not me"; where it is close and not there yet, the line it would say, with "Say
 * it" for as long as it waits. A line nothing answered says so once it has waited as long as a panel does.
 *
 * "NOT ME". Said of a moment, it is kept (`/api/echo/veto`), the server gives the echo the standing that
 * follows and a brief signed for it, and the brief is handed to the room from here: from the next moment
 * the echo acts by it, as it would had the person handed it in from inside.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LifeChange } from "@echo/planet";
import { STAND_IN } from "@echo/shared";

import WorldCanvas from "@/components/world/WorldCanvas";
import { othersLayer } from "@/game/world/othersLayer";
import { parcelEnvironmentLayers } from "@/game/world/parcelWorld";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import type { VillagersLayer } from "@/game/world/villagersLayer";
import { watchLayer } from "@/game/world/watchLayer";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { t, useLang } from "@/lib/i18n";
import { ANSWER_WAIT_MS, worldQuery, worldRoom } from "@/lib/villageRoom";
import { WATCH_SOURCE, sayIt, sendWatchBrief, startWatching, stopWatching, useWatchView, watchedAt, watchedSeedOf } from "@/lib/watchEcho";

import { AwayList, awaySum, isTalk, vetoKey, vetoMoment } from "./AwayList";

/** One line in what passed between the body and whoever talked to it, in time order (C109). */
type Talked =
  | { kind: "heard"; at: number; from: string; text: string }
  | { kind: "said"; at: number; entry: import("@echo/shared").AwayEntry }
  | { kind: "would"; at: number; id: string; text: string; until: number };

interface Props {
  cell: string;
  k?: number;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  commons?: readonly string[];
}

export default function WatchVisit(manifest: Props) {
  const { cell } = manifest;
  const lang = useLang();
  const watch = useWatchView();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [changes, setChanges] = useState<readonly LifeChange[] | null>(null);
  const [vetoed, setVetoed] = useState<ReadonlySet<string>>(new Set());
  const [noted, setNoted] = useState(false);
  const [world, setWorld] = useState<PlanetWorld | null>(null);
  // A clock for what waits: lines it would say run out, and a line unanswered says so after a while.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  /** Someone in the room, named as the village names a visitor (C107). */
  const nameOf = (seed: string | null): string | null => (seed ? (world?.context().layer<VillagersLayer>("villagers")?.visitor(seed)?.name ?? null) : null);

  // The room's world, as the room page builds it: the address says which, and its changes come first.
  useEffect(() => {
    const room = worldRoom(cell);
    setCode(room);
    let live = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    fetch(`/api/village/changes?${worldQuery(cell)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { changes?: LifeChange[] } | null) => live && setChanges(Array.isArray(d?.changes) ? d.changes : []))
      .catch(() => live && setChanges([]))
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      ctl.abort();
      clearTimeout(timer);
    };
  }, [cell]);

  useEffect(() => {
    if (!code) return;
    void startWatching(cell, code);
    return () => stopWatching();
  }, [cell, code]);

  // What has already been said not to be you, so it is not offered again.
  useEffect(() => {
    void (async () => {
      try {
        await ensureIdentity();
        const r = await fetch("/api/echo/keeping", { headers: identityHeaders() });
        const d = r.ok ? ((await r.json()) as { vetoes?: { at: number; kind: string }[] }) : null;
        if (d?.vetoes) setVetoed(new Set(d.vetoes.map(vetoKey)));
      } catch {
        // Offered again; the server keeps one per moment.
      }
    })();
  }, []);

  const layers = useCallback((): WorldLayer[] => [...parcelEnvironmentLayers({ inputEnabled: false }), othersLayer(WATCH_SOURCE), watchLayer(watchedAt)], []);

  const veto = async (e: Parameters<typeof vetoMoment>[0]) => {
    if (!(await vetoMoment(e))) return;
    setVetoed((v) => new Set([...v, vetoKey(e)]));
    setNoted(true);
    try {
      // The standing that follows, signed, handed to the room: the echo acts by it from now.
      const r = await fetch("/api/echo/standin", { headers: identityHeaders() });
      const d = r.ok ? ((await r.json()) as { brief?: string }) : null;
      if (typeof d?.brief === "string") sendWatchBrief(d.brief);
    } catch {
      // The veto is kept; the echo takes it up the next time its brief is handed in.
    }
  };

  const time = (ms: number) => new Date(ms).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const sum = awaySum(watch.log);
  const talked: Talked[] = [
    ...watch.said.map((m): Talked => ({ kind: "heard", at: m.at, from: m.from, text: m.text })),
    ...watch.log.filter(isTalk).map((e): Talked => ({ kind: "said", at: e.at, entry: e })),
    ...watch.would.filter((w) => w.until > now).map((w): Talked => ({ kind: "would", at: w.until - STAND_IN.wouldMs, id: w.id, text: w.text, until: w.until })),
  ].sort((a, b) => a.at - b.at);
  /** A line said to it that nothing of the echo's followed, once it has waited as long as a panel would. */
  const unanswered = (i: number) => {
    const next = talked[i + 1];
    return next ? next.kind === "heard" : now - talked[i]!.at > ANSWER_WAIT_MS;
  };
  const takeBack = code ? `/parcel/${cell}?room=${code}` : null;

  return (
    <>
      {changes ? <WorldCanvas {...manifest} changes={changes} layers={layers} onWorld={(w) => setWorld(w)} className="absolute inset-0" /> : null}
      <aside
        data-watch={watch.status}
        className="hud-pop absolute right-4 top-4 z-[45] flex max-h-[calc(100%-2rem)] w-[min(380px,92vw)] flex-col overflow-y-auto p-4 text-sm text-parchment max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:max-h-[46%] max-sm:w-auto"
      >
        <p className="font-serif text-[17px]">{t(lang, "watch.title")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-parchment/55">{t(lang, "watch.unseen")}</p>

        {watch.status === "idle" || watch.status === "joining" ? <p className="mt-3 text-[13px] text-parchment/70">{t(lang, "watch.joining")}</p> : null}
        {watch.status === "none" || code === null ? <p className="mt-3 text-[13px] text-parchment/75">{t(lang, "watch.none")}</p> : null}
        {watch.status === "offline" ? <p className="mt-3 text-[13px] text-rose-300">{t(lang, "watch.offline")}</p> : null}
        {watch.status === "ended" ? (
          <p data-watch-ended={watch.ended ?? ""} className="mt-3 text-[13px] text-parchment/75">
            {t(lang, watch.ended === "back" ? "watch.back" : "watch.over")}
          </p>
        ) : null}

        {watch.status === "watching" || (watch.status === "ended" && watch.log.length > 0) ? (
          <div className="mt-3">
            {watch.status === "watching" ? (
              <p className="text-[13px] text-parchment/80">
                <span className="text-parchment" data-watch-name>
                  {nameOf(watch.seed) ?? t(lang, "watch.you")}
                </span>{" "}
                · {t(lang, "watch.until", { time: time(watch.until) })}
              </p>
            ) : null}
            {talked.length > 0 ? (
              <div className="mt-3" data-watch-said={watch.said.length}>
                <p className="text-[12px] text-parchment/55">{t(lang, "watch.said")}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {talked
                    .map((x, i) => ({ x, i }))
                    .reverse()
                    .map(({ x, i }) =>
                      x.kind === "heard" ? (
                        <li key={`h|${x.at}|${x.from}`} className="text-[13px] leading-snug">
                          <span className="text-ember">{nameOf(watchedSeedOf(x.from)) ?? t(lang, "watch.someone")}:</span> <span className="text-parchment/85">{x.text}</span>
                          {unanswered(i) ? <span className="ml-1.5 text-[11px] text-parchment/45">{t(lang, "watch.noAnswer")}</span> : null}
                        </li>
                      ) : x.kind === "said" ? (
                        <li key={`s|${x.at}`} data-watch-answered className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
                          <span>
                            <span className="text-echo-soft">{t(lang, "watch.echoSaid")}:</span> <span className="text-parchment">{x.entry.said}</span>
                          </span>
                          {vetoed.has(vetoKey(x.entry)) ? (
                            <span data-veto-said className="shrink-0 text-[11px] text-parchment/45">
                              {t(lang, "veto.said")}
                            </span>
                          ) : (
                            <button type="button" data-veto={vetoKey(x.entry)} onClick={() => void veto(x.entry)} className="shrink-0 text-[11px] text-parchment/55 underline decoration-parchment/25 underline-offset-2 hover:text-parchment">
                              {t(lang, "veto.notMe")}
                            </button>
                          )}
                        </li>
                      ) : (
                        <li key={`w|${x.id}`} data-watch-would={x.id} className="rounded-lg border border-echo/30 bg-echo/[0.06] px-2.5 py-2 text-[13px] leading-snug">
                          <p>
                            <span className="text-parchment/60">{t(lang, "watch.would")}:</span> <span className="text-parchment">{x.text}</span>
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-parchment/45">{t(lang, "watch.wouldLeft", { s: Math.max(0, Math.ceil((x.until - now) / 1000)) })}</span>
                            <button type="button" data-watch-say-it={x.id} onClick={() => sayIt(x.id)} className="btn btn-sm btn-primary">
                              {t(lang, "watch.sayIt")}
                            </button>
                          </div>
                        </li>
                      ),
                    )}
                </ul>
              </div>
            ) : null}
            {watch.log.length === 0 ? (
              <p className="mt-2 text-[12px] text-parchment/55">{t(lang, "watch.nothing")}</p>
            ) : (
              <>
                <p className="mt-1 text-[12px] text-parchment/55" data-watch-met={watch.log.length}>
                  {t(lang, "standin.away.sum", sum)}
                </p>
                <AwayList lang={lang} entries={watch.log.filter((e) => !isTalk(e))} vetoed={vetoed} onVeto={(e) => void veto(e)} max={40} />
              </>
            )}
            {noted ? <p className="mt-3 text-[12px] leading-relaxed text-echo-soft">{t(lang, "veto.note")}</p> : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {takeBack && watch.status === "watching" ? (
            <Link href={takeBack} data-watch-take-back className="btn btn-sm btn-primary">
              {t(lang, "watch.takeBack")}
            </Link>
          ) : null}
          <Link href={`/parcel/${cell}`} data-watch-leave className="text-xs text-parchment/60 hover:text-parchment">
            {t(lang, "watch.leave")}
          </Link>
        </div>
      </aside>
    </>
  );
}
