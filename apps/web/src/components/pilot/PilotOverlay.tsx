"use client";

/**
 * What a pilot visit shows over the world (DECISIONS C75), and nothing more: how long is left, which visit
 * this is, a way to end it, and, when it happens, what became of a raft you lent or a seed you planted.
 * Nothing points at what the world sets out: finding it, or not, is the visit.
 *
 * It asks `/api/pilot` now and then, which settles what is due and says so; a changed pack goes to the
 * interact layer (`echo:pack`). At the visit's end, or when ended early (asked twice), the visit is
 * closed and the page moves on to the friends' ratings.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { t, useLang, type Key } from "@/lib/i18n";
import { identityHeaders } from "@/lib/identity";

export interface PilotSettings {
  n: number;
  /** How many visits there are in all (two, or three when the owner chose it, C78). */
  total?: number;
  startedAt: string;
  sessionMs: number;
  onEnd: () => void;
}

const POLL_MS = 20_000;
const NOTICE_MS = 9_000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function PilotOverlay({ pilot }: { pilot: PilotSettings }) {
  const lang = useLang();
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [ending, setEnding] = useState(false);
  const ended = useRef(false);
  const left = Date.parse(pilot.startedAt) + pilot.sessionMs - now;
  const fresh = now - Date.parse(pilot.startedAt) < 25_000;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const end = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    setEnding(true);
    try {
      await fetch("/api/pilot?op=end", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: "{}" });
    } catch {
      // the visit closes itself at its time anyway
    }
    pilot.onEnd();
  }, [pilot]);

  useEffect(() => {
    if (left <= 0) void end();
  }, [left, end]);

  // What is due since (a raft back, a crop up), said once, and the pack as it now is.
  useEffect(() => {
    let live = true;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch("/api/pilot", { headers: identityHeaders() });
        const data = (await res.json().catch(() => ({}))) as { notices?: { key: Key; vars: Record<string, string | number> }[]; pack?: Record<string, number> };
        if (!live) return;
        if (data.pack) window.dispatchEvent(new CustomEvent("echo:pack", { detail: data.pack }));
        const said = (data.notices ?? []).map((n) => t(lang, n.key, n.vars)).join(" ");
        if (said) {
          setNotice(said);
          clearTimeout(hide);
          hide = setTimeout(() => live && setNotice(null), NOTICE_MS);
        }
      } catch {
        // asked again shortly
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
      clearTimeout(hide);
    };
  }, [lang]);

  const button = "rounded-full bg-parchment px-3.5 py-1.5 text-xs font-medium text-ink disabled:opacity-40";

  return (
    <>
      <div data-pilot-clock className="hud-pop hud-in pointer-events-auto absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 py-1.5 pl-4 pr-1.5 text-[13px] text-parchment max-sm:top-[4.25rem]">
        <span className="font-mono tabular-nums text-parchment/80">{clock(left)}</span>
        <span className="text-parchment/55 max-sm:hidden">{t(lang, "pilot.visit", { n: pilot.n, total: pilot.total ?? 2 })}</span>
        <button
          type="button"
          data-pilot-end
          disabled={ending}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (sure ? void end() : setSure(true))}
          className={button}
        >
          {ending ? t(lang, "pilot.ending") : sure ? t(lang, "pilot.endSure") : t(lang, "pilot.end")}
        </button>
      </div>
      {fresh ? (
        <p data-pilot-hint className="hud-shadow hud-in pointer-events-none absolute left-1/2 top-[4.25rem] -translate-x-1/2 text-center font-serif text-[15px] text-parchment/85 max-sm:top-[7.25rem] max-sm:w-[80vw]">
          {t(lang, "pilot.hint")}
        </p>
      ) : null}
      {notice ? (
        <p data-pilot-notice className="hud-shadow hud-in pointer-events-none absolute left-1/2 top-[4.25rem] -translate-x-1/2 text-center font-serif text-[15px] text-parchment/90 max-sm:top-[7.25rem] max-sm:w-[80vw]">
          {notice}
        </p>
      ) : null}
    </>
  );
}
