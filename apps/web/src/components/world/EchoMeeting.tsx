"use client";

/**
 * Your echo and a friend's, met while you were both away (DECISIONS C71), and your word on it.
 *
 * - **Asked after the return** (`echo:back`, from EchoAway): that is when a meeting due is planned, so
 *   asking before it would find nothing. The first of the two people to ask fills it.
 * - **On the green**, when it was here: the two of them, faint, turned to each other. Walk up and they
 *   say it again, a bubble over whichever speaks, in each one's own voice where there is one.
 * - **The account**: what was said, and what YOUR echo held back, marked; where your friend's echo held
 *   something back you see only that it did, as they see only that yours did. Your answer to each of your
 *   own echo's lines trains what it may say for you, exactly as an outing's does.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { EchoMeetingLayer } from "@/game/world/echoMeetingLayer";
import type { ConsentState } from "@/game/world/measure";
import type { PlayerLayer } from "@/game/world/playerLayer";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { ShownMeeting } from "@/lib/echoMeeting";
import { t, useLang } from "@/lib/i18n";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

/** Long enough to read a bubble when there is no voice to wait for. */
const readingMs = (text: string) => Math.max(1800, Math.min(7000, text.length * 55));

let playing: HTMLAudioElement | null = null;

/** One line aloud: the speaker's own voice from the server when there is one, else this browser's. */
async function voice(id: string, line: number, text: string, mine: boolean): Promise<void> {
  try {
    const res = await fetch("/api/echo/meet", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ op: "voice", id, line }) });
    if (res.status === 200 && typeof Audio !== "undefined") {
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      playing = a;
      await new Promise<void>((done) => {
        a.onended = () => done();
        a.onerror = () => done();
        void a.play().catch(() => done());
      });
      URL.revokeObjectURL(url);
      return;
    }
  } catch {
    // fall through to this browser's voice
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return new Promise((r) => setTimeout(r, readingMs(text)));
  await new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(text);
    // Two people, two voices, even with none of their own here.
    u.pitch = mine ? 1 : 0.82;
    u.rate = 0.98;
    u.onend = () => done();
    u.onerror = () => done();
    window.speechSynthesis.speak(u);
    setTimeout(done, readingMs(text) + 4000);
  });
}

function hushAll() {
  playing?.pause();
  playing = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

/**
 * `guide`: a demo visitor's five minutes (C72), where the meeting is handed in directly (`echo:meeting`)
 * and there is a way to be taken to the green, since nobody in a pitch should have to find it.
 */
export default function EchoMeeting({ world, cell, consent, guide = false }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState; guide?: boolean }) {
  const lang = useLang();
  const worldRef = useRef(world);
  worldRef.current = world;
  const [meeting, setMeeting] = useState<ShownMeeting | null>(null);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<Record<number, string>>({});
  const [speaking, setSpeaking] = useState<number | null>(null);
  const stop = useRef(false);

  const layer = useCallback(() => worldRef.current()?.context().layer<EchoMeetingLayer>("echo-meeting") ?? null, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await ensureIdentity();
    const res = await fetch("/api/echo/meet", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }, []);

  // Asked once the return has been looked at: before then nothing due has been planned.
  useEffect(() => {
    if (consent !== "accepted") return;
    let asked = false;
    const ask = () => {
      if (asked) return;
      asked = true;
      void post({ op: "back" })
        .then(({ data }) => {
          const list = (data.meetings as ShownMeeting[] | undefined) ?? [];
          if (list[0]) setMeeting(list[0]);
        })
        .catch(() => {});
    };
    if (document.documentElement.dataset.echoBack === "1") ask();
    window.addEventListener("echo:back", ask);
    // A meeting made on the spot (the demo, C72), handed in whole.
    const given = (e: Event) => {
      const m = (e as CustomEvent<ShownMeeting>).detail;
      if (m) {
        setOpen(false);
        setMeeting(m);
      }
    };
    window.addEventListener("echo:meeting", given);
    return () => {
      window.removeEventListener("echo:back", ask);
      window.removeEventListener("echo:meeting", given);
    };
  }, [consent, post]);

  /** Three metres in front of the two of them, along the way the camera looks: close enough to start it. */
  const goTo = useCallback(() => {
    const w = worldRef.current();
    const scene = layer()?.scene();
    if (!w || !scene) return;
    const ctx = w.context();
    const player = ctx.layer<PlayerLayer>("player");
    if (!player) return;
    const mid = { x: (scene.me.x + scene.friend.x) / 2, y: (scene.me.y + scene.friend.y) / 2 };
    const [mx, my] = ctx.frame.fromLocalM(mid.x, mid.y);
    const dir = ctx.camera.getWorldDirection(ctx.camera.position.clone());
    const len = Math.hypot(dir.x, dir.z) || 1;
    const back = 3 / ctx.frame.tileM;
    const h = player.handOff();
    player.adopt({ ...h, mover: { ...h.mover, x: mx - (dir.x / len) * back, y: my - (dir.z / len) * back, vx: 0, vy: 0 } });
  }, [layer]);

  /** Say it again, line by line, over the two of them if they are here. */
  const play = useCallback(async () => {
    if (!meeting) return;
    stop.current = false;
    const l = layer();
    for (let i = 0; i < meeting.lines.length; i++) {
      if (stop.current) break;
      const line = meeting.lines[i]!;
      const who = line.mine ? "me" : "friend";
      setSpeaking(i);
      if (!line.mine && !line.said) {
        // Theirs, held back: only that something was.
        l?.say("friend", "…");
        await new Promise((r) => setTimeout(r, 1200));
      } else {
        l?.say(who, line.text, !line.said);
        await voice(meeting.id, i, line.text, line.mine);
      }
      l?.say(who, null);
    }
    setSpeaking(null);
  }, [meeting, layer]);

  // On the green, when it was here; walking up says it again, then tells it.
  useEffect(() => {
    const l = layer();
    if (!l) return;
    if (meeting && meeting.cell === cell && meeting.stand) {
      l.set({ me: meeting.stand.me, friend: meeting.stand.friend, friendId: `friend:${meeting.friend}` });
      l.onReached(() => {
        void play().then(() => setOpen(true));
      });
    } else l.set(null);
    return () => l.onReached(null);
  }, [meeting, cell, layer, play]);

  const done = useCallback(() => {
    stop.current = true;
    hushAll();
    setOpen(false);
    if (meeting) void post({ op: "read", id: meeting.id }).catch(() => {});
    layer()?.set(null);
    setMeeting(null);
    window.dispatchEvent(new Event("echo:meeting-done"));
  }, [meeting, post, layer]);

  const answer = useCallback(
    async (i: number, agreed: boolean) => {
      if (!meeting) return;
      setSaid((s) => ({ ...s, [i]: "…" }));
      const { ok, data } = await post({ op: "answer", id: meeting.id, line: i, agreed });
      const bucket = data.bucket as { level?: string; changed?: boolean } | null;
      setSaid((s) => ({ ...s, [i]: !ok ? t(lang, "meet.failed") : bucket?.changed && bucket.level !== "copilot" ? t(lang, "meet.notedPromoted") : t(lang, "meet.noted") }));
      if (ok) setMeeting((m) => (m ? { ...m, lines: m.lines.map((l, j) => (j === i ? { ...l, feedback: agreed } : l)) } : m));
    },
    [meeting, post, lang],
  );

  if (!meeting || consent !== "accepted") return null;
  const here = meeting.cell === cell && meeting.stand !== null;
  const told = [
    t(lang, "meet.told", { name: meeting.friend, village: meeting.village ?? "" }),
    meeting.topic ? t(lang, "meet.toldTopic", { topic: meeting.topic.charAt(0).toLowerCase() + meeting.topic.slice(1) }) : "",
    meeting.lines.every((l) => !l.said) ? t(lang, "meet.toldNone", { name: meeting.friend }) : meeting.lines.some((l) => !l.said) ? t(lang, "meet.toldSome") : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!open) {
    return (
      <div
        data-echo-meeting="waiting"
        className="hud-pop hud-in pointer-events-auto absolute left-1/2 top-16 z-30 flex w-max max-w-[min(30rem,60vw)] -translate-x-1/2 items-center gap-3 py-2 pl-4 pr-2 text-[13px] text-parchment max-sm:left-3 max-sm:right-3 max-sm:top-[7.5rem] max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0"
      >
        <p className="text-parchment/85">{here ? t(lang, "meet.toastHere", { name: meeting.friend }) : t(lang, "meet.toast", { name: meeting.friend })}</p>
        {guide && here ? (
          <button type="button" data-echo-meeting-go onClick={goTo} className="shrink-0 rounded-full bg-echo px-3 py-1 text-xs font-medium text-ink">
            {t(lang, "meet.takeMe")}
          </button>
        ) : null}
        <button type="button" data-echo-meeting-open onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-parchment px-3 py-1 text-xs font-medium text-ink">
          {t(lang, "meet.watch")}
        </button>
      </div>
    );
  }

  return (
    <section data-echo-meeting="open" aria-label={t(lang, "meet.title", { name: meeting.friend })} className="hud-pop hud-in absolute inset-x-0 top-14 z-40 mx-auto max-h-[84vh] w-[min(720px,94vw)] overflow-y-auto text-parchment">
      <header className="flex items-baseline justify-between gap-3 px-6 pt-5">
        <h2 className="font-serif text-xl">{t(lang, "meet.title", { name: meeting.friend })}</h2>
        <div className="flex shrink-0 items-baseline gap-4 text-xs text-parchment/50">
          <button type="button" data-echo-meeting-play onClick={() => void play()} disabled={speaking !== null} className="hover:text-parchment disabled:opacity-40">
            {t(lang, "meet.play")}
          </button>
          <button type="button" onClick={done} className="hover:text-parchment">
            {t(lang, "meet.done")}
          </button>
        </div>
      </header>
      <div className="px-6 pb-5 pt-3 text-sm">
        <p className="italic leading-relaxed text-ember/90" data-echo-meeting-told>
          {told}
        </p>
        <ol className="mt-4 space-y-2.5">
          {meeting.lines.map((l, i) => (
            <li key={i} data-meeting-line={i} data-mine={l.mine ? "1" : "0"} data-said={l.said ? "1" : "0"} className={`rounded-xl px-3.5 py-2 ${speaking === i ? "bg-echo/15" : "bg-parchment/[0.04]"}`}>
              <p className={l.said ? "text-parchment" : "text-parchment/60"}>
                <span className={`mr-1.5 ${l.mine ? "text-echo-soft" : "text-ember"}`}>{l.mine ? t(lang, "meet.yours") : t(lang, "meet.theirs", { name: meeting.friend })}</span>
                {!l.said ? <span className="mr-1.5 text-xs italic text-parchment/45">{l.mine ? t(lang, "meet.held") : t(lang, "meet.heldTheirs")}</span> : null}
                {l.mine || l.said ? (l.said ? l.text : <span className="italic">“{l.text}”</span>) : null}
              </p>
              {l.mine ? (
                l.feedback === null && !said[i] ? (
                  <div className="mt-1.5 flex gap-2 text-xs" title={l.p_hat !== undefined ? `sure ${l.p_hat.toFixed(2)}, needed ${l.tau?.toFixed(2)}` : undefined}>
                    <button type="button" data-meeting-yes={i} onClick={() => void answer(i, true)} className="rounded-full bg-parchment px-3 py-0.5 font-medium text-ink">
                      {l.said ? t(lang, "meet.yes") : t(lang, "meet.yesHeld")}
                    </button>
                    <button type="button" data-meeting-no={i} onClick={() => void answer(i, false)} className="rounded-full border border-parchment/20 px-3 py-0.5">
                      {l.said ? t(lang, "meet.no") : t(lang, "meet.noHeld")}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-parchment/45" data-meeting-answered={i}>
                    {said[i] ?? t(lang, "meet.noted")}
                  </p>
                )
              ) : null}
            </li>
          ))}
        </ol>
        {meeting.seenBy > 0 ? <p className="mt-3 text-xs text-parchment/55">{meeting.seenBy === 1 ? t(lang, "meet.seenByOne") : t(lang, "meet.seenBy", { n: meeting.seenBy })}</p> : null}
        <p className="mt-4 text-[11px] leading-snug text-parchment/40">{t(lang, "meet.footer")}</p>
      </div>
    </section>
  );
}
