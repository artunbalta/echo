"use client";

/**
 * The moderators' page (DECISIONS C67). Reports, newest open first, each with who had left what in that
 * cell when it was filed; a stranger's whole trace in the shared world, and what an undo would do to
 * it before anyone does it; and the log of what moderators did. Only for the subjects in
 * `ECHO_MODERATORS`: anyone else is told so and shown nothing.
 */
import { useCallback, useEffect, useState } from "react";

import { identityHeaders, identityToken } from "@/lib/identity";
import type { UndoPlan } from "@/lib/moderation";
import type { CellTraces, ModerationEntry, Report, Traces } from "@/lib/moderationTypes";

const REASON: Record<string, string> = { ruining: "ruining the village", offensive: "something offensive", other: "something else" };
const short = (s: string) => `${s.slice(0, 8)}…`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const kinds = (changes: { kind: string }[]) => {
  const n = new Map<string, number>();
  for (const c of changes) n.set(c.kind, (n.get(c.kind) ?? 0) + 1);
  return [...n].map(([k, v]) => `${v} ${k}`).join(", ") || "none";
};

type Look = { subject: string; traces: Traces; plan: UndoPlan; bar: { until: string; reason: string } | null; today: number };

export default function Moderation() {
  const [state, setState] = useState<"loading" | "denied" | "ready" | "failed">("loading");
  const [reports, setReports] = useState<Report[]>([]);
  const [log, setLog] = useState<ModerationEntry[]>([]);
  const [look, setLook] = useState<Look | null>(null);
  const [lookFor, setLookFor] = useState("");
  const [removeHome, setRemoveHome] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!identityToken()) return setState("denied");
    const res = await fetch("/api/moderation", { headers: identityHeaders() });
    if (res.status === 403 || res.status === 401) return setState("denied");
    if (!res.ok) return setState("failed");
    const data = (await res.json()) as { reports: Report[]; log: ModerationEntry[] };
    setReports(data.reports);
    setLog(data.log);
    setState("ready");
  }, []);
  useEffect(() => void load(), [load]);

  const open = useCallback(async (subject: string, keepSaid = false) => {
    // What was just done stays said when the stranger is read again after it.
    if (!keepSaid) setSaid(null);
    const res = await fetch(`/api/moderation?subject=${encodeURIComponent(subject)}`, { headers: identityHeaders() });
    if (res.ok) setLook((await res.json()) as Look);
    else setSaid("Could not read that stranger's traces.");
  }, []);

  const act = useCallback(
    async (body: Record<string, unknown>, done: string) => {
      const res = await fetch("/api/moderation", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { done?: Record<string, number>; until?: string; error?: string };
      setSaid(res.ok ? `${done}${data.done ? `: ${Object.entries(data.done).map(([k, v]) => `${k} ${v}`).join(", ")}` : data.until ? ` until ${when(data.until)}` : ""}.` : `Refused: ${data.error ?? res.status}.`);
      await load();
      if (typeof body.subject === "string") await open(body.subject, true);
    },
    [load, open],
  );

  if (state === "loading") return <main className="flex min-h-screen items-center justify-center bg-ink font-mono text-parchment">Reading…</main>;
  if (state === "denied")
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink p-6 font-mono text-parchment" data-moderation="denied">
        <p>This page is for the world&apos;s moderators.</p>
      </main>
    );
  if (state === "failed") return <main className="flex min-h-screen items-center justify-center bg-ink font-mono text-parchment">The reports could not be read.</main>;

  return (
    <main className="min-h-screen bg-ink p-6 font-mono text-sm text-parchment" data-moderation="ready">
      <h1 className="font-serif text-2xl text-[#e4edcd]">Moderation</h1>
      <p className="mt-1 text-xs text-parchment/50">Reports from strangers, what was there, and what you can undo. Everything you do here is logged.</p>
      {said ? <p className="mt-3 rounded bg-white/5 px-3 py-2 text-xs" data-moderation-said>{said}</p> : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wide text-parchment/45">Reports</h2>
          {reports.length === 0 ? <p className="text-parchment/50">None.</p> : null}
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className={`rounded-lg border px-3 py-2 ${r.resolvedAt ? "border-white/5 opacity-60" : "border-white/15"}`} data-moderation-report={r.id}>
                <p>
                  <span className="text-[#e8c98a]">{REASON[r.reason]}</span> · {r.cell} · day {r.day} · {when(r.madeAt)}
                  {r.resolvedAt ? <span className="text-parchment/50"> · closed: {r.outcome}</span> : null}
                </p>
                {r.note ? <p className="mt-1 italic text-parchment/70">“{r.note}”</p> : null}
                <ul className="mt-2 space-y-1 text-xs">
                  {r.snapshot.length === 0 ? <li className="text-parchment/45">Nobody else had left anything there lately.</li> : null}
                  {r.snapshot.map((t: CellTraces) => (
                    <li key={t.subject} className="flex flex-wrap items-baseline gap-x-2">
                      <button type="button" className="underline decoration-white/30" onClick={() => void open(t.subject)} data-moderation-look={t.subject}>
                        {short(t.subject)}
                      </button>
                      <span className="text-parchment/60">
                        changes: {kinds(t.changes)} · marks {t.marks.length} · deeds {t.deeds}
                        {t.wrongs ? `, ${t.wrongs} wrongs` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {!r.resolvedAt ? (
                  <button type="button" className="mt-2 text-xs text-parchment/60 underline" onClick={() => void act({ op: "dismiss", report: r.id }, "Dismissed")} data-moderation-dismiss={r.id}>
                    Dismiss
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wide text-parchment/45">A stranger</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (lookFor.trim()) void open(lookFor.trim());
            }}
          >
            <input value={lookFor} onChange={(e) => setLookFor(e.target.value)} placeholder="their id" className="flex-1 rounded border border-white/15 bg-white/5 px-2 py-1" />
            <button type="submit" className="rounded border border-white/20 px-3 py-1 text-xs">
              Look
            </button>
          </form>
          {look ? (
            <div className="mt-3 space-y-2 text-xs" data-moderation-subject={look.subject}>
              <p className="text-parchment/80">
                {look.subject}
                {look.bar ? <span className="text-[#f0a48a]"> · barred until {when(look.bar.until)} ({look.bar.reason})</span> : null}
              </p>
              <p>
                Life changes: {kinds(look.traces.changes.map((c) => c.change))} · marks {look.traces.marks.length} ({look.traces.marks.filter((m) => m.mark.untilDay > look.today).length} still showing) · deeds in {look.traces.deeds.length} villages · house {look.traces.home ? look.traces.home.cell : "none"}
              </p>
              <p className="text-parchment/70">
                An undo now would withdraw {look.plan.remove.length} plans not yet lived, make {look.plan.counter.length} reversals (stays, drops, trades back), heal {look.plan.heal.length} marks
                {look.plan.forgetDeeds ? ", and make the villagers forget their deeds" : ""}. {look.plan.stands.length} things that already happened stand.
              </p>
              <label className="flex items-center gap-2 text-parchment/70">
                <input type="checkbox" checked={removeHome} onChange={(e) => setRemoveHome(e.target.checked)} /> and take down their house
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded bg-[#f0a48a] px-3 py-1 font-medium text-[#2a1712]" data-moderation-undo onClick={() => void act({ op: "undo", subject: look.subject, removeHome, report: reports.find((r) => !r.resolvedAt && r.snapshot.some((t) => t.subject === look.subject))?.id }, "Undone")}>
                  Undo their traces
                </button>
                {look.bar ? (
                  <button type="button" className="rounded border border-white/20 px-3 py-1" onClick={() => void act({ op: "lift", subject: look.subject }, "Bar lifted")}>
                    Lift the bar
                  </button>
                ) : (
                  <button type="button" className="rounded border border-[#f0a48a]/50 px-3 py-1" data-moderation-bar onClick={() => void act({ op: "bar", subject: look.subject, days: 7, reason: "reported", report: reports.find((r) => !r.resolvedAt && r.snapshot.some((t) => t.subject === look.subject))?.id }, "Barred")}>
                    Bar for a week
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <h2 className="mb-2 mt-8 text-xs uppercase tracking-wide text-parchment/45">What moderators did</h2>
          <ul className="space-y-1 text-xs text-parchment/70">
            {log.length === 0 ? <li>Nothing yet.</li> : null}
            {log.map((e) => (
              <li key={e.id}>
                {when(e.at)} · {short(e.moderator)} · {e.action}
                {e.subject ? ` ${short(e.subject)}` : ""} {Object.keys(e.detail).length ? `· ${JSON.stringify(e.detail)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
