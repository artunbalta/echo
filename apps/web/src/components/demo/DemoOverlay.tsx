"use client";

/**
 * What a demo visitor sees over the world in their five minutes (DECISIONS C72), and nothing else.
 *
 * - **A clock and one line**, top centre: how long is left, and "Walk. The world is learning you."
 * - **Their voice**, if they said yes to it: after the first minute, three sentences to read aloud. The
 *   recording goes to the server once, with the yes, and comes back as their echo's voice for a day.
 * - **The meeting**: once there has been time to learn something, a button to let their echo meet the
 *   host's; at five minutes it happens by itself. It is handed to EchoMeeting (`echo:meeting`), which puts
 *   the two on the green and offers to take them there.
 * - **The end**: when the meeting is closed, what that was, and one button to erase everything now:
 *   their voice at ElevenLabs, their echo, the meeting. Otherwise it is all gone within a day.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ShownMeeting } from "@/lib/echoMeeting";
import { t, useLang } from "@/lib/i18n";
import { identityHeaders, peekUserId } from "@/lib/identity";
import { recorder } from "@/lib/villagerVoice";

export interface DemoSettings {
  hostName: string;
  voice: boolean;
  startedAt: string;
  meetAfterMs: number;
  visitMs: number;
}

const VOICE_AFTER_MS = 60_000;
const RECORD_MAX_MS = 30_000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function DemoOverlay({ demo }: { demo: DemoSettings }) {
  const lang = useLang();
  const started = Date.parse(demo.startedAt);
  const [now, setNow] = useState(() => Date.now());
  const [meet, setMeet] = useState<"idle" | "asking" | "met" | "failed">("idle");
  const [voice, setVoice] = useState<"hidden" | "offered" | "recording" | "sending" | "ready" | "failed" | "denied" | "dismissed">(demo.voice ? "hidden" : "dismissed");
  const [end, setEnd] = useState<"hidden" | "shown" | "erasing" | "erased" | "kept" | "failed">("hidden");
  const rec = useRef<ReturnType<typeof recorder> | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - started;
  const left = demo.visitMs - elapsed;

  useEffect(() => {
    if (voice === "hidden" && elapsed >= VOICE_AFTER_MS) setVoice("offered");
  }, [voice, elapsed]);

  const askMeet = useCallback(async () => {
    if (asked.current) return;
    asked.current = true;
    setMeet("asking");
    for (let tries = 0; tries < 40; tries++) {
      try {
        const res = await fetch("/api/demo?op=meet", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: "{}" });
        const data = (await res.json().catch(() => ({}))) as { meeting?: ShownMeeting; inMs?: number; making?: boolean };
        if (res.ok && data.meeting) {
          window.dispatchEvent(new CustomEvent("echo:meeting", { detail: data.meeting }));
          setMeet("met");
          return;
        }
        if (res.status === 409 && data.inMs) {
          await new Promise((r) => setTimeout(r, Math.min(data.inMs!, 15_000) + 300));
          continue;
        }
        if (res.status === 202) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    asked.current = false;
    setMeet("failed");
  }, []);

  // At five minutes it happens by itself.
  useEffect(() => {
    if (left <= 0 && meet === "idle") void askMeet();
  }, [left, meet, askMeet]);

  useEffect(() => {
    const done = () => setEnd((e) => (e === "hidden" ? "shown" : e));
    window.addEventListener("echo:meeting-done", done);
    return () => window.removeEventListener("echo:meeting-done", done);
  }, []);

  const startReading = async () => {
    rec.current = recorder(RECORD_MAX_MS);
    const r = await rec.current.start();
    setVoice(r === "on" ? "recording" : "denied");
  };
  const stopReading = async () => {
    const blob = await rec.current?.stop();
    rec.current = null;
    if (!blob) return setVoice("failed");
    setVoice("sending");
    try {
      const res = await fetch("/api/demo?op=voice", {
        method: "POST",
        // The yes, given on the first screen, said again with the recording: nothing goes without it.
        headers: identityHeaders({ "content-type": blob.type.split(";")[0] || "audio/webm", "x-voice-consent": "yes" }),
        body: blob,
      });
      setVoice(res.ok ? "ready" : "failed");
    } catch {
      setVoice("failed");
    }
  };

  const erase = async () => {
    setEnd("erasing");
    try {
      const a = await fetch("/api/demo?op=erase", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: "{}" });
      const b = await fetch("/api/account/delete", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ userId: peekUserId() }) });
      // Forgotten in this browser only once it is gone everywhere: a retry needs the identity to ask with.
      if (a.ok && b.ok) {
        try {
          for (const k of ["echo.userId", "echo.identityToken", "echo.consent"]) localStorage.removeItem(k);
        } catch {
          // nothing kept to clear
        }
      }
      setEnd(a.ok && b.ok ? "erased" : "failed");
    } catch {
      setEnd("failed");
    }
  };

  const button = "rounded-full bg-parchment px-3.5 py-1.5 text-xs font-medium text-ink disabled:opacity-40";

  return (
    <>
      {end === "hidden" && meet !== "met" ? (
        <div data-demo-clock className="hud-pop hud-in pointer-events-auto absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 py-1.5 pl-4 pr-1.5 text-[13px] text-parchment max-sm:bottom-auto max-sm:top-[7.5rem]">
          <span className="font-mono text-parchment/80 tabular-nums">{clock(left)}</span>
          <span className="text-parchment/60 max-sm:hidden">{meet === "asking" ? t(lang, "demo.meeting", { host: demo.hostName }) : meet === "failed" ? t(lang, "demo.noEngine") : t(lang, "demo.walking")}</span>
          <button type="button" data-demo-meet disabled={meet === "asking" || elapsed < demo.meetAfterMs} onClick={() => void askMeet()} className={button}>
            {t(lang, "demo.meet", { host: demo.hostName })}
          </button>
        </div>
      ) : null}

      {["offered", "recording", "sending", "failed", "denied"].includes(voice) && end === "hidden" ? (
        <section data-demo-voice className="hud-pop hud-in absolute bottom-20 left-4 z-30 w-[min(360px,92vw)] px-4 py-3 text-sm text-parchment max-sm:left-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-base">{t(lang, "demo.voiceTitle")}</h2>
            {voice === "offered" || voice === "failed" || voice === "denied" ? (
              <button type="button" onClick={() => setVoice("dismissed")} className="text-xs text-parchment/45 hover:text-parchment">
                {t(lang, "demo.later")}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-parchment/55">{t(lang, "demo.voiceRead")}</p>
          <ol className="mt-2 space-y-1.5 font-serif text-[15px] leading-snug text-parchment/90">
            <li>{t(lang, "demo.voice1")}</li>
            <li>{t(lang, "demo.voice2")}</li>
            <li>{t(lang, "demo.voice3")}</li>
          </ol>
          <div className="mt-3 flex items-center gap-3">
            {voice === "recording" ? (
              <button type="button" data-demo-stop onClick={() => void stopReading()} className={`${button} bg-echo`}>
                {t(lang, "demo.stop")}
              </button>
            ) : (
              <button type="button" data-demo-record disabled={voice === "sending"} onClick={() => void startReading()} className={button}>
                {t(lang, "demo.record")}
              </button>
            )}
            <span className="text-xs text-parchment/55">
              {voice === "recording" ? t(lang, "demo.recording") : voice === "sending" ? t(lang, "demo.cloning") : voice === "failed" ? t(lang, "demo.voiceFailed") : voice === "denied" ? t(lang, "demo.micDenied") : ""}
            </span>
          </div>
        </section>
      ) : null}
      {voice === "ready" && end === "hidden" ? (
        <p data-demo-voice-ready className="hud-shadow hud-in pointer-events-none absolute bottom-20 left-4 z-30 text-xs text-parchment/75 max-sm:left-3">
          {t(lang, "demo.voiceReady")}
        </p>
      ) : null}

      {end !== "hidden" ? (
        <section data-demo-end className="hud-pop hud-in absolute left-1/2 top-1/2 z-40 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 px-6 py-5 text-center text-parchment">
          {end === "erased" || end === "kept" ? (
            <>
              <p className="font-serif text-lg">{end === "erased" ? t(lang, "demo.erased") : t(lang, "demo.eraseNote")}</p>
              <button type="button" data-demo-again onClick={() => window.location.reload()} className={`${button} mt-4`}>
                {t(lang, "demo.again")}
              </button>
            </>
          ) : end === "failed" ? (
            <>
              <p className="font-serif text-lg" data-demo-erase-failed>
                {t(lang, "demo.eraseFailed")}
              </p>
              <button type="button" data-demo-erase onClick={() => void erase()} className={`${button} mt-4`}>
                {t(lang, "demo.erase")}
              </button>
            </>
          ) : (
            <>
              <h2 className="font-serif text-xl">{t(lang, "demo.endTitle")}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-parchment/65">{t(lang, "demo.endBody")}</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <button type="button" data-demo-erase disabled={end === "erasing"} onClick={() => void erase()} className={button}>
                  {end === "erasing" ? t(lang, "demo.erasing") : t(lang, "demo.erase")}
                </button>
                <button type="button" onClick={() => setEnd("kept")} className="text-xs text-parchment/50 hover:text-parchment">
                  {t(lang, "demo.keep")}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
