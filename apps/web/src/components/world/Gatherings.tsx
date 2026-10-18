"use client";

/**
 * The village's days that are not like the others, on the page (DECISIONS C52).
 *
 * THE NEWS. A small card says what the village knows: a burial this afternoon, a wedding in three
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
import { ensureIdentity, identityHeaders } from "@/lib/identity";

const CLOCK = worldClock(WORLD_EPOCH);

/** The beat when a stranger has been at it long enough to have been there. */
const BEAT: Record<Gathering["kind"], string> = {
  funeral: "You stand with the mourners. Nobody asks who you are.",
  wedding: "You stand with the guests. Someone you have never met smiles at you.",
  naming: "You wait with the callers. Inside, a baby is crying.",
};

export default function Gatherings({ world, cell, consent, chain }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState; chain: MeasureChain }) {
  const [news, setNews] = useState<{ key: string; text: string; when: string }[]>([]);
  const [line, setLine] = useState<string | null>(null);
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
        if (e.kind === "joined") say(BEAT[e.gathering.kind]);
        void tell(e, player ?? e.gathering.at, e.gathering.centre.length + e.gathering.guests.length);
      }

      // The news, as the villagers would say it, with the time in real minutes.
      const items: { key: string; text: string; when: string }[] = [];
      const coming = villagers.coming();
      for (const g of gatherings) {
        const c = coming.find((x) => x.day === day && x.about.join() === g.about.join() && x.kind === g.kind);
        const text = c?.words ?? g.id;
        const when = hour < g.t0 ? realWhen(day, hour, day, g.t0) : hour <= g.t1 ? "now" : "earlier today";
        items.push({ key: g.id, text, when });
      }
      for (const c of coming) {
        if (c.day === day && c.kind !== "expecting") continue;
        const when = c.kind === "expecting" ? "any day" : realWhen(day, hour, c.day, GATHERINGS[c.kind][0]);
        items.push({ key: `${c.kind}:${c.about.join("+")}`, text: c.words, when });
      }
      const shown = items.slice(0, 4);
      setNews((was) => (was.length === shown.length && was.every((w, i) => w.key === shown[i].key && w.when === shown[i].when) ? was : shown));
    }, 250);
    return () => {
      clearInterval(id);
      if (lineTimer) clearTimeout(lineTimer);
    };
  }, [world, cell, chain]);

  return (
    <>
      {news.length > 0 ? (
        <section data-village-news className="pointer-events-none absolute left-6 top-6 z-20 w-[min(300px,40vw)] rounded-xl border border-white/10 bg-[#16241f]/80 px-4 py-3 text-[12px] leading-snug text-[#f4e9d0] backdrop-blur-md max-sm:hidden">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-white/45">In the village</p>
          <ul className="space-y-1.5">
            {news.map((n) => (
              <li key={n.key} data-news-item={n.key}>
                {n.text}
                <span className="ml-1 text-white/45">· {n.when}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {line ? (
        <p data-gathering-line className="pointer-events-none absolute bottom-56 left-1/2 z-30 w-[min(520px,90vw)] -translate-x-1/2 text-center font-serif text-[15px] text-[#f4e9d0] [text-shadow:0_1px_10px_rgba(0,0,0,.75)]">
          {line}
        </p>
      ) : null}
    </>
  );
}
