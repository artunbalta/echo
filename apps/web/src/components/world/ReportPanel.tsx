"use client";

/**
 * Telling the moderators something is wrong here (DECISIONS C67). Opened from the HUD's menu (C68); three
 * plain reasons and a short note. Nothing about anyone is shown to the reporter: what was there, and
 * whose it was, is the server's to keep with the report.
 */
import { useEffect, useState } from "react";

import { t, useLang } from "@/lib/i18n";
import { identityHeaders, identityToken } from "@/lib/identity";

const REASONS = [
  { id: "ruining", label: "report.ruining" },
  { id: "offensive", label: "report.offensive" },
  { id: "other", label: "report.other" },
] as const;

export default function ReportPanel({ cell }: { cell: string }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("ruining");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"form" | "sending" | "sent" | "failed">("form");

  useEffect(() => {
    const show = () => {
      setOpen(true);
      setState("form");
    };
    window.addEventListener("echo:report", show);
    return () => window.removeEventListener("echo:report", show);
  }, []);

  if (!open) return null;
  const send = async () => {
    setState("sending");
    try {
      // A report needs no identity: one who never let the echo watch is heard all the same.
      const headers = identityToken() ? identityHeaders({ "content-type": "application/json" }) : { "content-type": "application/json" };
      const res = await fetch("/api/moderation/report", { method: "POST", headers, body: JSON.stringify({ cell, reason, note: note.trim() || undefined }) });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <section
      data-report
      aria-label={t(lang, "menu.report")}
      className="hud-pop hud-in absolute bottom-6 left-1/2 z-40 w-[min(420px,92vw)] -translate-x-1/2 px-5 py-4 text-sm text-parchment"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg text-parchment">{t(lang, "report.title")}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t(lang, "pack.close")} className="text-parchment/45 hover:text-parchment">
          ×
        </button>
      </div>
      {state === "sent" ? (
        <p className="mt-3 text-white/80" data-report-sent>
          {t(lang, "report.sent")}
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {REASONS.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 text-parchment/85">
                <input type="radio" name="report-reason" checked={reason === r.id} onChange={() => setReason(r.id)} data-report-reason={r.id} className="accent-echo" />
                {t(lang, r.label)}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={t(lang, "report.note")}
            rows={3}
            data-report-note
            className="mt-3 w-full rounded-lg border border-parchment/15 bg-parchment/5 px-3 py-2 text-sm text-parchment placeholder:text-parchment/35 focus:border-echo focus:outline-none"
          />
          {state === "failed" ? <p className="mt-1 text-xs text-danger">{t(lang, "report.failed")}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-parchment/20 px-3.5 py-1.5 text-xs text-parchment/75">
              {t(lang, "report.cancel")}
            </button>
            <button type="button" data-report-send disabled={state === "sending"} onClick={() => void send()} className="rounded-full bg-parchment px-3.5 py-1.5 text-xs font-medium text-ink disabled:opacity-50">
              {state === "sending" ? t(lang, "report.sending") : t(lang, "report.send")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
