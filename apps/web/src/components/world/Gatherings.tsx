"use client";

/**
 * The village's days that are not like the others, on the page (DECISIONS C52).
 *
 * THE NEWS. A few lines under the place's name (the HUD draws them, C68) say what the village knows: a burial this afternoon, a wedding in three
 * days, a woman expecting any day now — with the world's hours turned into real minutes, because a
 * world day is twelve of them and a wedding three days off is worth coming back for. It is what the
 * villagers themselves are saying (`comingOn`), nothing more: no list of things to do, and no count.
 *
 * BEING THERE. While a gathering holds, where the stranger stands is read (`lib/gatherings.ts`): long
 * enough inside its rings and they were at it. Then the village is told (`/api/village/attend`, a
 * deed: everyone there saw them), and — with consent — the echo is: I7 at a burial, G4 at a wedding
 * or a new child's door, and G4's refusal for a wedding watched from across the green and never joined.
 */
import { useEffect, useRef, useState } from "react";
import { GATHERINGS, worldDayIndex, worldClock, WORLD_EPOCH, type Gathering } from "@echo/planet";

import type { ConsentState, MeasureChain } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { SkyLayer } from "@/game/world/skyLayer";
import type { VillagersLayer } from "@/game/world/villagersLayer";
import { attendanceLabel, attendStep, newAttendState, realWhen, type AttendEvent } from "@/lib/gatherings";
import { t, useLang, type Key } from "@/lib/i18n";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { publishNews, type NewsItem } from "@/lib/villageNews";

const CLOCK = worldClock(WORLD_EPOCH);

/** The beat when a stranger has been at it long enough to have been there. */
const BEAT: Record<Gathering["kind"], Key> = {
  funeral: "gathering.funeral",
  wedding: "gathering.wedding",
  naming: "gathering.naming",
};

export default function Gatherings({ world, cell, consent, chain }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState; chain: MeasureChain }) {
  const [line, setLine] = useState<string | null>(null);
  const lang = useLang();
  const langRef = useRef(lang);
  langRef.current = lang;
  const state = useRef(newAttendState());
  const consentRef = useRef(consent);
  consentRef.current = consent;

  useEffect(() => {
    let last = performance.now();
    let lineTimer: ReturnType<typeof setTimeout> | null = null;
    const say = (text: string) => {
      if (lineTimer) clearTimeout(lineTimer);
      setLine(text);
      lineTimer = setTimeout(() => setLine(null), 5200);
    };

    const tell = async (e: AttendEvent, at: { x: number; y: number }, audience: number) => {
      const label = attendanceLabel(e);
      let knew = false;
      // The village hears of it (a deed), once the card has been answered either way.
      if (e.kind === "joined" && consentRef.current !== "unset") {
        try {
          await ensureIdentity();
          const res = await fetch("/api/village/attend", {
            method: "POST",
            headers: identityHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({ cell, gathering: e.gathering.id, at }),
          });
          knew = ((await res.json().catch(() => ({}))) as { knew?: boolean }).knew === true;
        } catch {
          // being there happened; the village's record of it did not
        }
      }
      if (!chain.armed()) return;
      void chain.emitAction(label.action, {
        cue: label.cue,
        channel: label.channel,
        polarity: label.polarity,
        raw: { dwell_ms: Math.round(e.dwellMs), distance: Number(e.distanceM.toFixed(2)), knew_them: knew ? 1 : 0 },
        target: { id: e.gathering.id, kind: "npc" },
        contextOverride: { stakes: "low", audience_size: audience, public_or_private: "public", counterpart_status: knew ? "peer" : "stranger" },
      });
    };

    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const ctx = world()?.context();
      const villagers = ctx?.layer<VillagersLayer>("villagers");
      if (!ctx || !villagers) return;
      const hour = ctx.layer<SkyLayer>("sky")?.timeOfDay() ?? 0.5;
      const day = worldDayIndex(CLOCK, Date.now());
      const gatherings = villagers.gatherings();
      const player = villagers.playerPosition();

      for (const e of attendStep(state.current, gatherings, hour, player, dt)) {
        if (e.kind === "joined") say(t(langRef.current, BEAT[e.gathering.kind]));
        void tell(e, player ?? e.gathering.at, e.gathering.centre.length + e.gathering.guests.length);
      }

      // The news, as the villagers would say it, with the time in real minutes. The HUD shows it
      // under the place's name (C68); this only reads it.
      const lang = langRef.current;
      const items: NewsItem[] = [];
      const coming = villagers.coming();
      for (const g of gatherings) {
        const c = coming.find((x) => x.day === day && x.about.join() === g.about.join() && x.kind === g.kind);
        const text = c?.words ?? g.id;
        const when = hour < g.t0 ? realWhen(day, hour, day, g.t0, lang) : hour <= g.t1 ? t(lang, "news.now") : t(lang, "news.earlier");
        items.push({ key: g.id, text, when });
      }
      for (const c of coming) {
        if (c.day === day && c.kind !== "expecting" && c.kind !== "ailing" && c.kind !== "omen") continue;
        // What is feared (C66) is talked of now; what is planned, for when it will be.
        const when =
          c.kind === "expecting"
            ? t(lang, "news.anyDay")
            : c.kind === "ailing"
              ? t(lang, "news.now")
              : c.kind === "omen"
                ? t(lang, c.day === day ? "news.today" : "news.tomorrow")
                : realWhen(day, hour, c.day, GATHERINGS[c.kind][0], lang);
        items.push({ key: `${c.kind}:${c.about.join("+")}`, text: c.words, when });
      }
      publishNews(items.slice(0, 3));
    }, 250);
    return () => {
      clearInterval(id);
      if (lineTimer) clearTimeout(lineTimer);
      publishNews([]);
    };
  }, [world, cell, chain]);

  return (
    <>
      {line ? (
        <p data-gathering-line className="hud-shadow hud-in pointer-events-none absolute bottom-56 left-1/2 z-30 w-[min(520px,90vw)] -translate-x-1/2 text-center font-serif text-[15px] text-parchment">
          {line}
        </p>
      ) : null}
    </>
  );
}
