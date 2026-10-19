"use client";

/**
 * What your echo did while you were away (DECISIONS C64), and your word on it.
 *
 * - **Only with consent.** The echo is what watching made; without it there is no echo to send out.
 * - **The page says you are here** (`seen`) every two minutes and as it closes, so an absence is
 *   measured from when you actually left. On opening, it asks (`back`): the server fills the
 *   absence, if it was long enough, and hands back the outing not yet told.
 * - **Your echo waits** where it last met someone, if that is here: walk up to it and it tells you.
 *   Anywhere else, a line says where it went, with a button to hear it.
 * - **The account** is the echo's own, first person, then every meeting: what it said, what it held
 *   back, what they said. To each line, "That's me" or "Not me"; to each held back, "I'd have said
 *   that" or "No". That is the old copilot's feedback: it trains what the echo may say for you.
 * - **In your own voice**, when you have one here (C62), it is read to you.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { EchoBodyLayer } from "@/game/world/echoBodyLayer";
import type { ConsentState } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { Encounter, Outing } from "@/lib/echoTypes";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { cloudWanted, ownVoiceHere, speakCloud, speakSelf, unlockCloud } from "@/lib/villagerVoice";

type Shown = Omit<Outing, "subject"> & { told: string; encounters: (Encounter & { lines: (Encounter["lines"][number] & { voice?: string })[] })[] };

/** How often the page says it is still here. */
export const SEEN_MS = 120_000;

const hourWords = (h: number) => (h < 0.42 ? "morning" : h < 0.58 ? "midday" : h < 0.7 ? "afternoon" : "evening");
const howLong = (ms: number) => {
  const h = ms / 3_600_000;
  const n = h < 1 ? Math.round(ms / 60_000) : h < 48 ? Math.round(h) : Math.round(h / 24);
  const unit = h < 1 ? "minute" : h < 48 ? "hour" : "day";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
};

export default function EchoAway({ world, cell, consent }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState }) {
  const worldRef = useRef(world);
  worldRef.current = world;
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const [outing, setOuting] = useState<Shown | null>(null);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [mine, setMine] = useState(false);
  /** The return question, while it is out: nothing may say "here" before it has read when you were last. */
  const asked = useRef<Promise<unknown> | null>(null);

  const post = useCallback(async (body: Record<string, unknown>, keepalive = false) => {
    await ensureIdentity();
    const res = await fetch("/api/echo/away", { method: "POST", keepalive, headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }, []);

  const body = useCallback(() => worldRef.current()?.context().layer<EchoBodyLayer>("echo-body") ?? null, []);

  // Here: on opening, every two minutes, and on leaving.
  useEffect(() => {
    if (consent !== "accepted") return;
    if (!asked.current) {
      asked.current = post({ op: "back", cell: cellRef.current })
        .then(({ data }) => {
          const o = (data.outing as Shown | null) ?? null;
          if (o) setOuting(o);
        })
        .catch(() => {});
      void ownVoiceHere(identityHeaders()).then(setMine).catch(() => {});
    }
    // A "seen" sent before the return question is answered would erase the very absence it asks about.
    const seen = (keepalive = false) => void asked.current!.then(() => post({ op: "seen", cell: cellRef.current }, keepalive)).catch(() => {});
    const every = setInterval(() => seen(), SEEN_MS);
    const leaving = () => seen(true);
    window.addEventListener("pagehide", leaving);
    return () => {
      clearInterval(every);
      window.removeEventListener("pagehide", leaving);
    };
  }, [consent, post, cell]);

  // The body waits where it last was, if that is here; reaching it opens the account.
  useEffect(() => {
    const l = body();
    if (!l) return;
    if (outing && !open && outing.waits && outing.waits.cell === cell) {
      l.set({ x: outing.waits.x, y: outing.waits.y });
      l.onReached(() => setOpen(true));
    } else if (!outing) l.set(null);
    return () => l.onReached(null);
  }, [outing, open, cell, body]);

  const close = useCallback(() => {
    setOpen(false);
    if (outing) void post({ op: "read", id: outing.id }).catch(() => {});
    body()?.set(null);
    setOuting(null);
  }, [outing, post, body]);

  const answer = useCallback(
    async (e: number, t: number, agreed: boolean) => {
      if (!outing) return;
      const key = `${e}:${t}`;
      setSaid((s) => ({ ...s, [key]: "…" }));
      const { ok, data } = await post({ op: "answer", id: outing.id, encounter: e, turn: t, agreed });
      const bucket = data.bucket as { level?: string; changed?: boolean; bucket?: string } | null;
      const words = !ok
        ? "That did not go through."
        : bucket?.changed
          ? bucket.level === "auto"
            ? "It has earned this: it may now speak for you here on its own."
            : bucket.level === "copilot"
              ? "It will hold back more, and ask you first."
              : "It will speak for you here, and you will see what it said."
          : agreed
            ? "Noted: that was you."
            : "Noted: that was not you.";
      setSaid((s) => ({ ...s, [key]: words }));
      if (ok) {
        setOuting((o) => (o ? { ...o, encounters: o.encounters.map((x, i) => (i === e ? { ...x, feedback: x.feedback.map((f, j) => (j === t ? agreed : f)) } : x)) } : o));
      }
    },
    [outing, post],
  );

  const hear = useCallback(async () => {
    if (!outing) return;
    unlockCloud();
    if (mine) await speakSelf(outing.told, identityHeaders());
    // And what they said, each in their own voice, when you said yes to that (C60).
    if (cloudWanted()) {
      for (const e of outing.encounters) {
        for (const l of e.lines) if (l.who === "villager" && l.voice) await speakCloud({ cell: e.cell, person: e.person, text: l.text, token: l.voice }, identityHeaders());
      }
    }
  }, [outing, mine]);

  if (!outing || consent !== "accepted") return null;
  const waitingHere = outing.waits?.cell === cell;

  if (!open) {
    return (
      <div data-echo-away="waiting" className="pointer-events-auto absolute bottom-28 left-6 z-30 max-w-[22rem] rounded-xl border border-white/15 bg-[#16241f]/90 px-4 py-3 text-sm text-[#f4e9d0] shadow-xl backdrop-blur max-sm:bottom-[13rem]">
        <p className="text-white/85">
          {outing.village
            ? waitingHere
              ? `Your echo went out while you were away. It is waiting for you in ${outing.village}.`
              : `While you were away, your echo went to ${outing.village}.`
            : "Your echo went out while you were away."}
        </p>
        <button type="button" data-echo-hear onClick={() => setOpen(true)} className="mt-2 rounded-full bg-[#e2edc8] px-3 py-1 text-xs font-medium text-[#213522]">
          {waitingHere ? "Hear it now" : "Hear what it did"}
        </button>
      </div>
    );
  }

  return (
    <section
      data-echo-away="open"
      aria-label="While you were away"
      className="absolute inset-x-0 top-14 z-40 mx-auto max-h-[84vh] w-[min(760px,94vw)] overflow-y-auto rounded-2xl border border-white/15 bg-[#16241f]/95 text-[#f4e9d0] shadow-2xl backdrop-blur-xl"
    >
      <header className="flex items-baseline justify-between gap-3 px-6 pt-5">
        <div>
          <h2 className="font-serif text-xl text-[#e4edcd]">While you were away</h2>
          <p className="text-xs text-white/50">
            You were away {howLong(Date.parse(outing.awayTo) - Date.parse(outing.awayFrom))}. Your echo went out in your place.
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-4 text-xs text-white/50">
          {mine || cloudWanted() ? (
            <button type="button" data-echo-listen onClick={() => void hear()} className="hover:text-white">
              Hear it
            </button>
          ) : null}
          <button type="button" onClick={close} className="hover:text-white">
            Done
          </button>
        </div>
      </header>
      <div className="px-6 pb-5 pt-3 text-sm">
        <p className="italic leading-relaxed text-[#e8c98a]/90" data-echo-told>
          {outing.told}
        </p>
        <ul className="mt-4 space-y-4">
          {outing.encounters.map((e, i) => (
            <li key={`${e.person}-${i}`} className="rounded-xl bg-white/5 px-4 py-3" data-echo-encounter={e.person}>
              <p className="text-xs text-white/50">
                {e.given} {e.family}, {e.age}, {e.occupation} · {e.village}, {hourWords(e.hour)}
              </p>
              <div className="mt-2 space-y-1.5">
                {e.lines.map((l, j) => (
                  <p key={j} className={l.who === "echo" ? "text-white/85" : "text-[#f4e9d0]"}>
                    <span className={l.who === "echo" ? "mr-1.5 text-[#b9c4ea]" : "mr-1.5 text-[#e8c98a]"}>{l.who === "echo" ? "Your echo:" : `${e.given}:`}</span>
                    {l.text}
                  </p>
                ))}
              </div>
              <div className="mt-2 space-y-1.5">
                {e.turns.map((t, j) => {
                  const spoken = t.decision === "auto";
                  const answered = e.feedback[j];
                  const key = `${i}:${j}`;
                  return (
                    <div key={j} className="text-xs" title={`sure ${t.p_hat.toFixed(2)}, needed ${t.tau.toFixed(2)}${t.explored ? ", trying" : ""}`}>
                      {!spoken ? <p className="mb-1 text-white/55">It held back. It would have said: “{t.line}”</p> : null}
                      {answered === null && !said[key] ? (
                        <div className="flex gap-2">
                          <button type="button" data-echo-yes={key} onClick={() => void answer(i, j, true)} className="rounded-full bg-[#e2edc8] px-3 py-0.5 font-medium text-[#213522]">
                            {spoken ? `That's me${e.turns.length > 1 ? ` (line ${j + 1})` : ""}` : "I'd have said that"}
                          </button>
                          <button type="button" data-echo-no={key} onClick={() => void answer(i, j, false)} className="rounded-full border border-white/20 px-3 py-0.5">
                            {spoken ? "Not me" : "No"}
                          </button>
                        </div>
                      ) : (
                        <p className="text-white/50" data-echo-answered={key}>
                          {said[key] ?? (answered ? "You said: that was you." : "You said: not you.")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-snug text-white/40">
          Your echo speaks only where it has earned it, and holds back elsewhere. What you say here teaches it which is which. The people it met
          remember the meeting as one with you. Nothing it did was read into your echo: its words are not you.
        </p>
      </div>
    </section>
  );
}
