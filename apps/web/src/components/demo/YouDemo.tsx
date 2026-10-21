"use client";

/**
 * The first screen of five minutes to you (DECISIONS C72), and then the world.
 *
 * What the visitor is asked, before anything happens, in plain words: whether the world may learn from how
 * they move for these five minutes (it is the visit, so it is asked as the visit), and, separately and
 * unticked, whether their voice may be copied from three sentences, to speak only their own echo's lines,
 * here, for a day. Every visitor is a fresh person: nobody's identity is carried over from the last one on
 * this machine.
 */
import { useEffect, useState } from "react";

import ParcelCanvas, { type ParcelCanvasProps } from "@/components/planet/ParcelCanvas";
import type { DemoSettings } from "@/components/demo/DemoOverlay";
import { t, useLang } from "@/lib/i18n";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

export default function YouDemo({ hostName, ...parcel }: Omit<ParcelCanvasProps, "demo" | "stations"> & { hostName: string }) {
  const lang = useLang();
  const [name, setName] = useState("");
  const [watch, setWatch] = useState(true);
  const [voice, setVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [demo, setDemo] = useState<DemoSettings | null>(null);
  // Said once the page answers: a click before it would go nowhere.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  const begin = async () => {
    setBusy(true);
    setFailed(false);
    try {
      // A fresh person, and their yes to being watched for the visit.
      for (const k of ["echo.userId", "echo.identityToken"]) localStorage.removeItem(k);
      localStorage.setItem("echo.consent", JSON.stringify({ telemetry: true }));
      await ensureIdentity();
      const res = await fetch("/api/demo?op=start", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ name: name.trim() || undefined }) });
      const started = (await res.json().catch(() => ({}))) as { startedAt?: string };
      const info = (await (await fetch("/api/demo", { headers: identityHeaders() })).json().catch(() => ({}))) as { meetAfterMs?: number; visitMs?: number };
      if (!res.ok || !started.startedAt) throw new Error("not started");
      setDemo({ hostName, voice, startedAt: started.startedAt, meetAfterMs: info.meetAfterMs ?? 120_000, visitMs: info.visitMs ?? 300_000 });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (demo) return <ParcelCanvas {...parcel} stations={null} demo={demo} />;

  return (
    <div data-demo-intro={live ? "ready" : "loading"} className="flex h-full w-full items-center justify-center bg-ink px-5">
      <div className="w-[min(520px,100%)] text-parchment">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{t(lang, "demo.title")}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-parchment/70">{t(lang, "demo.intro", { host: hostName })}</p>
        <label className="mt-6 block text-xs text-parchment/55">
          {t(lang, "demo.name", { host: hostName })}
          <input
            data-demo-name
            value={name}
            maxLength={40}
            placeholder={t(lang, "demo.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-parchment/15 bg-parchment/5 px-3 py-2.5 text-[15px] text-parchment placeholder:text-parchment/35 focus:border-echo focus:outline-none"
          />
        </label>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-parchment/80">
          <input data-demo-watch type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} className="mt-1 accent-echo" />
          {t(lang, "demo.watch")}
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-parchment/80">
          <input data-demo-voice-yes type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="mt-1 accent-echo" />
          {t(lang, "demo.voiceYes")}
        </label>
        <button type="button" data-demo-begin disabled={!live || !watch || busy} onClick={() => void begin()} className="mt-7 rounded-full bg-parchment px-6 py-2.5 text-sm font-medium text-ink disabled:opacity-40">
          {t(lang, "demo.begin")}
        </button>
        {failed ? <p className="mt-3 text-sm text-danger">{t(lang, "pair.err.other")}</p> : null}
        <p className="mt-6 text-xs leading-relaxed text-parchment/40">{t(lang, "demo.eraseNote")}</p>
      </div>
    </div>
  );
}
