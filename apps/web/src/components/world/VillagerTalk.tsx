"use client";

/**
 * Talking to a villager (DECISIONS C42, C44). Walk up to someone until their nameplate shows, press E
 * (or tap Talk), and say something; they stop, turn to you, and answer from the life they have lived.
 *
 * A CONVERSATION BEGINS WHERE THEY ARE. Pressing E asks the server to begin one (`talk/begin`) with
 * where you stand; the server checks that against where the villager is, counts the meeting in their
 * memory of you, and hands back the token every line carries. A villager who remembers you says so.
 *
 * WHAT IT SENDS AND WHAT IT KEEPS. The cell, the villager's id, your position at the start, your line
 * and the conversation so far — never a description of the villager, which the server rebuilds. Your
 * words go to the model to be answered and are not stored. What the villager makes of you is: a short
 * note in their own words, so they remember you next time, private to you, and erased by "Forget me".
 * None of it is read into your echo. The line under the input says so before anything is typed.
 *
 * A CONVERSATION CAN CHANGE A LIFE (C44). When the villager decides something — to keep a grave, to
 * build a boat, to leave — the panel says so, and the page regenerates the village with the change in
 * it, so the stranger who caused it sees it at once and everyone else on their next visit.
 *
 * WHY IT WAITS FOR THE CARD. The routes need a signed id and minting one is only allowed after the
 * consent question is answered, either way (identity/session's own rule).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { LifeChange } from "@echo/planet";

import type { ConsentState } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { NearVillager, VillagersLayer } from "@/game/world/villagersLayer";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { canSpeak, hush, setVoiceWanted, speak, voiceWanted } from "@/lib/villagerVoice";

interface Turn {
  role: "stranger" | "villager" | "decided";
  text: string;
}

/** Beyond this many metres a conversation is over: they have walked on with their day. */
const PARTING_M = 12;

/** What a refusal from the routes means, in the villager's world rather than the server's. */
function trouble(status: number, error: string | undefined, name: string): string {
  if (status === 429) return `${name} has had enough talk for now. Come back in a while.`;
  if (error === "too_far") return `${name} is too far away to hear you.`;
  if (error === "not_out") return `${name} has gone indoors.`;
  if (error === "at_sea") return `${name} is out at sea.`;
  if (error === "no_conversation") return `${name} has lost the thread. Say hello again.`;
  if (status === 401 || status === 403) return "You need to answer the card first.";
  // The routes' own words for "not now", taken from rateLimit.ts and lib/subject.ts, not guessed.
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
  const [greeting, setGreeting] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  const conv = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => setVoice(voiceWanted() && canSpeak()), []);

  // The parent hands a fresh getter every render; held in a ref, so the four-a-second poll below is
  // set up once rather than torn down and rebuilt on every render it causes.
  const worldRef = useRef(world);
  worldRef.current = world;
  const layer = useCallback(() => worldRef.current()?.context().layer<VillagersLayer>("villagers") ?? null, []);
  const personOf = useCallback((id: string) => worldRef.current()?.region.village?.settlement.people.find((p) => p.id === id) ?? null, []);
  const first = (talking ?? near)?.name.split(" ")[0];

  const end = useCallback(() => {
    window.dispatchEvent(new CustomEvent("echo:talking", { detail: false }));
    layer()?.hold(null);
    hush();
    conv.current = null;
    setTalking(null);
    setTurns([]);
    setDraft("");
    setNote(null);
    setGreeting(null);
    setPending(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [layer]);

  /** Ask the server to begin: it checks where you both are and counts the meeting. */
  const begin = useCallback(
    async (who: NearVillager): Promise<boolean> => {
      const at = layer()?.playerPosition();
      if (!at) return false;
      try {
        await ensureIdentity();
        const res = await fetch("/api/village/talk/begin", {
          method: "POST",
          headers: identityHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ cell, person: who.id, at }),
        });
        const data = (await res.json().catch(() => ({}))) as { conv?: string; recognised?: string | null; error?: string };
        if (!res.ok || !data.conv) {
          setNote(trouble(res.status, data.error, who.name.split(" ")[0]));
          return false;
        }
        conv.current = data.conv;
        setGreeting(data.recognised ?? null);
        return true;
      } catch {
        setNote(`${who.name.split(" ")[0]} does not seem to hear you.`);
        return false;
      }
    },
    [cell, layer],
  );

  const start = useCallback(() => {
    const v = layer();
    const who = v?.nearest();
    if (!v || !who) return;
    v.hold(who.id);
    window.dispatchEvent(new CustomEvent("echo:talking", { detail: true }));
    setTalking(who);
    setTurns([]);
    setNote(null);
    setGreeting(null);
    conv.current = null;
    if (consent === "unset") setNote("Answer the card first: talking needs the answer, either way.");
    else void begin(who);
    setTimeout(() => input.current?.focus(), 0);
  }, [layer, consent, begin]);

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

  // Escape ends a conversation; beginning one is `Interact`'s (C45): one prompt for everything within
  // reach, `T` for whoever is near enough to talk to, and an `echo:talk` event to open this panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && talking) {
        e.preventDefault();
        end();
      }
    };
    const onTalk = () => {
      if (!talking && near) start();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("echo:talk", onTalk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("echo:talk", onTalk);
    };
  }, [near, talking, start, end]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, pending]);

  /** A decision this conversation made, folded into the page's own village at once. */
  const adopt = useCallback((change: LifeChange) => {
    const w = worldRef.current();
    const had = w?.region.village?.changes ?? [];
    if (w && !had.some((c) => c.id === change.id)) w.revillage([...had, change]);
  }, []);

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
    const history = turns.filter((t) => t.role !== "decided") as { role: "stranger" | "villager"; text: string }[];
    const before = turns;
    setTurns([...before, { role: "stranger", text }]);
    try {
      if (!conv.current && !(await begin(talking))) {
        setTurns(before);
        setDraft(text);
        return;
      }
      const res = await fetch("/api/village/talk", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ cell, person: talking.id, message: text, history, conv: conv.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; change?: LifeChange; decided?: string };
      if (!res.ok || !data.reply) {
        if (data.error === "no_conversation") conv.current = null;
        setTurns(before);
        setDraft(text);
        setNote(trouble(res.status, data.error, talking.name.split(" ")[0]));
      } else {
        const next: Turn[] = [...before, { role: "stranger", text }, { role: "villager", text: data.reply }];
        if (data.change && data.decided) {
          next.push({ role: "decided", text: data.decided });
          adopt(data.change);
        }
        setTurns(next);
        if (voice) {
          const p = personOf(talking.id);
          if (p) speak(data.reply, { id: p.id, sex: p.sex, age: talking.age });
        }
      }
    } catch {
      setTurns(before);
      setDraft(text);
      setNote(`${talking.name.split(" ")[0]} does not seem to hear you.`);
    } finally {
      setPending(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [draft, talking, pending, consent, turns, cell, begin, adopt, voice, personOf]);

  const forget = useCallback(async () => {
    if (!talking || consent === "unset") return;
    try {
      await ensureIdentity();
      const res = await fetch("/api/village/memory", {
        method: "DELETE",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ cell, person: talking.id }),
      });
      setNote(res.ok ? `${talking.name.split(" ")[0]} will not remember you.` : `${talking.name.split(" ")[0]} could not forget you just now. Try again.`);
      if (res.ok) setGreeting(null);
    } catch {
      setNote("That did not go through. Try again.");
    }
  }, [talking, consent, cell]);

  const toggleVoice = useCallback(() => {
    const on = !voice;
    setVoice(on);
    setVoiceWanted(on);
    if (!on) hush();
  }, [voice]);

  // The prompt to talk is `Interact`'s now (C45); this is only the conversation.
  if (!talking) return null;

  return (
    <section
      data-talk-panel={talking.id}
      aria-label={`Talking to ${talking.name}`}
      className="absolute bottom-6 left-1/2 z-40 w-[min(560px,92vw)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#16241f]/90 text-[#f4e9d0] shadow-2xl backdrop-blur-xl"
    >
      <header className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <p className="font-serif text-lg text-[#e4edcd]">
          {talking.name}
          <span className="ml-2 text-xs text-white/45">
            {talking.age} · {talking.age >= 13 ? talking.occupation : "a child"}
          </span>
        </p>
        <div className="flex shrink-0 items-baseline gap-3 text-xs text-white/50">
          {canSpeak() ? (
            <button type="button" onClick={toggleVoice} aria-pressed={voice} data-talk-voice className="hover:text-white">
              {voice ? "Voice on" : "Voice off"}
            </button>
          ) : null}
          <button type="button" onClick={() => void forget()} data-talk-forget className="hover:text-white">
            Forget me
          </button>
          <button type="button" onClick={end} className="hover:text-white">
            Esc · leave
          </button>
        </div>
      </header>
      <div ref={log} className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto px-5">
        {greeting ? <p className="text-sm italic text-[#e8c98a]/80">{greeting}</p> : null}
        {turns.length === 0 && !pending ? <p className="text-sm italic text-white/45">{first} stops and looks at you.</p> : null}
        {turns.map((t, i) =>
          t.role === "decided" ? (
            <p key={i} data-talk-decided className="rounded-lg bg-[#e8c98a]/10 px-3 py-1.5 text-sm italic text-[#e8c98a]">
              {t.text}
            </p>
          ) : (
            <p key={i} className={t.role === "stranger" ? "text-right text-sm text-white/70" : "text-sm leading-relaxed text-[#f4e9d0]"}>
              {t.role === "villager" ? <span className="mr-1.5 text-[#e8c98a]">{first}:</span> : null}
              {t.text}
            </p>
          ),
        )}
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
        What you say goes to Claude to be answered and is not stored. {first} keeps a short note of your talk in their own words, so they
        remember you — “Forget me” erases it. None of it is read into your echo. What {first} decides about their own life, everyone can see.
      </p>
    </section>
  );
}
