"use client";

/**
 * Telling the moderators something is wrong here (DECISIONS C67). Opened from the parcel's card; three
 * plain reasons and a short note. Nothing about anyone is shown to the reporter: what was there, and
 * whose it was, is the server's to keep with the report.
 */
import { useEffect, useState } from "react";

import { identityHeaders, identityToken } from "@/lib/identity";

const REASONS = [
  { id: "ruining", label: "Someone is ruining this village" },
  { id: "offensive", label: "Something offensive is on this land" },
  { id: "other", label: "Something else" },
] as const;

export default function ReportPanel({ cell }: { cell: string }) {
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
      aria-label="Report something here"
      className="absolute bottom-6 left-1/2 z-40 w-[min(440px,92vw)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#16241f]/95 px-5 py-4 text-sm text-[#f4e9d0] shadow-2xl backdrop-blur-xl"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg text-[#e4edcd]">Something wrong here?</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-white/50 hover:text-white">
          Close
        </button>
      </div>
      {state === "sent" ? (
        <p className="mt-3 text-white/80" data-report-sent>
          Thank you. A moderator will look at what was here, and who left it.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {REASONS.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 text-white/85">
                <input type="radio" name="report-reason" checked={reason === r.id} onChange={() => setReason(r.id)} data-report-reason={r.id} />
                {r.label}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="What did you see? (optional)"
            rows={3}
            data-report-note
            className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          {state === "failed" ? <p className="mt-1 text-xs text-[#f0a48a]">That did not go through. Try again in a while.</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/20 px-3 py-1 text-xs">
              Cancel
            </button>
            <button type="button" data-report-send disabled={state === "sending"} onClick={() => void send()} className="rounded-full bg-[#e2edc8] px-3 py-1 text-xs font-medium text-[#213522] disabled:opacity-50">
              {state === "sending" ? "Sending…" : "Send to the moderators"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
