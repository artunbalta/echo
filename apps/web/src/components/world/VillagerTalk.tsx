"use client";

/**
 * Talking to a villager (DECISIONS C42). Walk up to someone until their nameplate shows, press E (or
 * tap Talk), and say something; they stop, turn to you, and answer from the life they have lived.
 *
 * WHAT IT SENDS AND WHAT IT DOES NOT. The cell, the villager's id, your line and the conversation so
 * far — never a description of the villager, which the server rebuilds from the seed. Your words go to
 * the model to be answered and nowhere else: not stored, not logged, not part of the measurement
 * chain, which is what the consent card promised ("never what you type"). The line under the input
 * says so, because a person deciding what to type is owed that sentence before they type it.
 *
 * WHY IT WAITS FOR THE CARD. The route needs a signed id and minting one is only allowed after the
 * consent question is answered, either way (identity/session's own rule). Until then the panel opens
 * and says why it cannot send.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ConsentState } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { NearVillager, VillagersLayer } from "@/game/world/villagersLayer";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

interface Turn {
  role: "stranger" | "villager";
  text: string;
}

/** Beyond this many metres a conversation is over: they have walked on with their day. */
const PARTING_M = 12;

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

/** What a refusal from the route means, in the villager's world rather than the server's. */
function trouble(status: number, error: string | undefined, name: string): string {
  if (status === 429) return `${name} has had enough talk for now. Come back in a while.`;
  if (status === 401 || status === 403) return "You need to answer the card first.";
  // The route's own words for "not now", taken from rateLimit.ts and lib/subject.ts, not guessed.
  if (error === "identity_unconfigured" || error === "rate_limiter_unavailable") return `${name} cannot hear you just now.`;
  if (status === 413) return "That is too much to say at once.";
  return `${name} does not seem to hear you.`;
}

export default function VillagerTalk({ world, cell, consent, coarse }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState; coarse: boolean }) {
  const [near, setNear] = useState<NearVillager | null>(null);
  const [talking, setTalking] = useState<NearVillager | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // The parent hands a fresh getter every render; held in a ref, so the four-a-second poll below is
  // set up once rather than torn down and rebuilt on every render it causes.
  const worldRef = useRef(world);
  worldRef.current = world;
  const layer = useCallback(() => worldRef.current()?.context().layer<VillagersLayer>("villagers") ?? null, []);

  const end = useCallback(() => {
    layer()?.hold(null);
    setTalking(null);
    setTurns([]);
    setDraft("");
    setNote(null);
    setPending(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [layer]);

  const start = useCallback(() => {
    const v = layer();
    const who = v?.nearest();
    if (!v || !who) return;
    v.hold(who.id);
    setTalking(who);
    setTurns([]);
    setNote(null);
    setTimeout(() => input.current?.focus(), 0);
  }, [layer]);

  // Who is near, four times a second; and whether the one being talked to has walked off.
  useEffect(() => {
    const id = setInterval(() => {
      const v = layer();
      setNear(v?.nearest() ?? null);
      if (talking && v) {
        const d = v.distanceTo(talking.id);
        if (d === null || d > PARTING_M) {
          setNote(`${talking.name.split(" ")[0]} has gone on with their day.`);
          setTimeout(end, 1600);
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [layer, talking, end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && talking) {
        e.preventDefault();
        end();
        return;
      }
      if (e.code === "KeyE" && !talking && !typing() && near) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, talking, start, end]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, pending]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!talking || !text || pending) return;
    if (consent === "unset") {
      setNote("Answer the card first: talking needs the answer, either way.");
      return;
    }
    setDraft("");
    setPending(true);
    setNote(null);
    const history = turns;
    setTurns([...history, { role: "stranger", text }]);
    try {
      await ensureIdentity();
      const res = await fetch("/api/village/talk", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ cell, person: talking.id, message: text, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setTurns(history);
        setDraft(text);
        setNote(trouble(res.status, data.error, talking.name.split(" ")[0]));
      } else {
        setTurns([...history, { role: "stranger", text }, { role: "villager", text: data.reply }]);
      }
    } catch {
      setTurns(history);
      setDraft(text);
      setNote(`${talking.name.split(" ")[0]} does not seem to hear you.`);
    } finally {
      setPending(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [draft, talking, pending, consent, turns, cell]);

  const first = (talking ?? near)?.name.split(" ")[0];

  if (!talking) {
    if (!near) return null;
    return coarse ? (
      <button
        type="button"
        onClick={start}
        data-talk-prompt
        className="absolute bottom-40 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#e2edc8] px-5 py-2 text-sm font-medium text-[#213522] shadow-lg"
      >
        Talk to {first}
      </button>
    ) : (
      <p data-talk-prompt className="pointer-events-none absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#16241f]/80 px-4 py-1.5 text-xs text-[#f4e9d0]/85">
        <span className="mr-2 rounded bg-[#f4e9d0]/15 px-1.5 py-0.5 font-mono">E</span>Talk to {first}
      </p>
    );
  }

  return (
    <section
      data-talk-panel={talking.id}
      aria-label={`Talking to ${talking.name}`}
      className="absolute bottom-6 left-1/2 z-40 w-[min(560px,92vw)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#16241f]/92 text-[#f4e9d0] shadow-2xl backdrop-blur-xl"
    >
      <header className="flex items-baseline justify-between px-5 pt-4">
        <p className="font-serif text-lg text-[#e4edcd]">
          {talking.name}
          <span className="ml-2 text-xs text-white/45">
            {talking.age} · {talking.age >= 13 ? talking.occupation : "a child"}
          </span>
        </p>
        <button type="button" onClick={end} className="text-xs text-white/50 hover:text-white">
          Esc · leave
        </button>
      </header>
      <div ref={log} className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto px-5">
        {turns.length === 0 && !pending ? <p className="text-sm italic text-white/45">{first} stops and looks at you.</p> : null}
        {turns.map((t, i) => (
          <p key={i} className={t.role === "stranger" ? "text-right text-sm text-white/70" : "text-sm leading-relaxed text-[#f4e9d0]"}>
            {t.role === "villager" ? <span className="mr-1.5 text-[#e8c98a]">{first}:</span> : null}
            {t.text}
          </p>
        ))}
        {pending ? <p className="text-sm italic text-white/45">{first} thinks…</p> : null}
        {note ? <p className="text-sm italic text-[#e8c98a]/80">{note}</p> : null}
      </div>
      <form
        className="flex gap-2 px-5 pb-2 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 400))}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              end();
            }
          }}
          placeholder={`Say something to ${first}…`}
          maxLength={400}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#e2edc8]/60 focus:outline-none"
        />
        <button type="submit" disabled={pending || !draft.trim()} className="rounded-full bg-[#e2edc8] px-4 py-2 text-sm font-medium text-[#213522] disabled:opacity-40">
          Say
        </button>
      </form>
      <p className="px-5 pb-3 text-[10px] leading-snug text-white/35">
        What you say goes to Claude to be answered. It is not stored, and it is never read into your echo.
      </p>
    </section>
  );
}
