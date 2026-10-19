"use client";

/**
 * The mirror (DECISIONS C61): how your echo sees you, what it saw that made it so, and your say over
 * all of it. Opened with `Y`, or from the recognition meter; Esc closes it.
 *
 * WHAT IT SHOWS is `lib/mirror.ts` `mirrorOf`, read from `/api/echo/mirror` when it opens and again
 * on "Look again", never polled: the read asks the engine's language model (see the route).
 *
 * - **Where it puts you**: each of the eight axes between its two words, with how sure it is drawn as
 *   the width of the band, and a word only where the engine would say one.
 * - **Why**: pick an axis, and the acts that moved it most, either way, from the record. What the
 *   record does not itemise is one line of its own, so the account always adds up to where you are.
 * - **What it saw lately**: the record, newest first, each with what it moved.
 * - **Your say**: whether it watches you at all, whether villagers speak through ElevenLabs (C60),
 *   and erasing everything.
 *
 * Sizes are words, not numbers; the numbers are in the titles for anyone who hovers. Nothing here
 * goes up for doing more (Design Law 1).
 */
import { useCallback, useEffect, useState } from "react";

import { PERSONA_AXIS_KEYS, type PersonaAxisKey } from "@echo/shared";

import type { ConsentState } from "@/game/world/measure";
import { identityHeaders, identityToken, peekUserId } from "@/lib/identity";
import type { Contributor, MirrorView, Move } from "@/lib/mirror";
import { cloudWanted, setCloudWanted } from "@/lib/villagerVoice";

type Loaded = MirrorView & { capped?: boolean; source?: string };

/** What erasing everything removes from this browser, besides what the server erases. */
const LOCAL_KEYS = ["echo.userId", "echo.name", "echo.consent", "echo.character", "echo.identityToken", "echo.voiceCloud", "echo.villagerVoice", "echo.email"];

const ARROW = (m: { amount: number }) => (m.amount > 0 ? "→" : "←");
const pct = (x: number) => `${Math.round(((Math.max(-1, Math.min(1, x)) + 1) / 2) * 100)}%`;
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function Mirror({ consent, onAccept, onRevoke }: { consent: ConsentState; onAccept: () => void; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Loaded | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [axis, setAxis] = useState<PersonaAxisKey | null>(null);
  const [cloud, setCloud] = useState<boolean | null>(null);
  const [erasing, setErasing] = useState<"no" | "asking" | "going" | string>("no");

  const look = useCallback(async () => {
    setLoading(true);
    setTrouble(null);
    try {
      if (!identityToken()) {
        setView(null);
        return;
      }
      const res = await fetch("/api/echo/mirror", { headers: identityHeaders() });
      const data = (await res.json().catch(() => ({}))) as Loaded & { error?: string };
      if (!res.ok) {
        setTrouble(res.status === 429 ? "You have looked often just now. Try again in a few minutes." : "The mirror could not be read just now.");
        return;
      }
      setView(data);
      setAxis((a) => a ?? strongest(data));
    } catch {
      setTrouble("The mirror could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setErasing("no");
  }, []);

  // `Y` opens and closes it, unless a field is being typed in; Esc closes; the meter asks by event.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyY" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) setOpen((o) => !o);
      else if (e.code === "Escape" && open) close();
    };
    const onAsk = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("echo:mirror", onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("echo:mirror", onAsk);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    setCloud(cloudWanted());
    void look();
  }, [open, look]);

  const erase = useCallback(async () => {
    setErasing("going");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ userId: peekUserId() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; supabaseTablesFailed?: string[] };
      if (!res.ok || !data.ok) {
        setErasing(`Not everything could be erased${data.supabaseTablesFailed?.length ? ` (${data.supabaseTablesFailed.join(", ")})` : ""}. Nothing in this browser was cleared; try again.`);
        return;
      }
      for (const k of LOCAL_KEYS) {
        try {
          localStorage.removeItem(k);
        } catch {
          // a private window: nothing was kept to remove
        }
      }
      window.location.assign("/");
    } catch {
      setErasing("The erasure could not be sent. Nothing was erased; try again.");
    }
  }, []);

  if (!open) return null;
  const watching = consent === "accepted";
  const sel = axis ? view?.axes.find((a) => a.key === axis) : null;

  return (
    <section
      data-mirror={view ? (view.live ? "live" : "record") : "empty"}
      aria-label="The mirror"
      className="absolute inset-x-0 top-14 z-40 mx-auto max-h-[84vh] w-[min(900px,94vw)] overflow-y-auto rounded-2xl border border-white/15 bg-[#16241f]/95 text-[#f4e9d0] shadow-2xl backdrop-blur-xl"
      onMouseDown={(e) => {
        // The world keeps its keys: nothing here takes focus, except a button, and your id to copy.
        if (!(e.target instanceof HTMLButtonElement) && !(e.target instanceof Element && e.target.closest("[data-mirror-id]"))) e.preventDefault();
      }}
    >
      <header className="flex items-baseline justify-between gap-3 px-6 pt-5">
        <div>
          <h2 className="font-serif text-xl text-[#e4edcd]">The mirror</h2>
          <p className="text-xs text-white/50">How your echo sees you, and what it saw that made it so.</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-4 text-xs text-white/50">
          <button type="button" onClick={() => void look()} disabled={loading} data-mirror-again className="hover:text-white disabled:opacity-40">
            {loading ? "Looking…" : "Look again"}
          </button>
          <button type="button" onClick={close} className="hover:text-white">
            Esc · close
          </button>
        </div>
      </header>

      <div className="px-6 pb-5 pt-3 text-sm">
        {trouble ? <p className="mb-3 italic text-[#e8c98a]/85">{trouble}</p> : null}
        {!watching ? (
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-white/70">
            Your echo is not watching you{consent === "unset" ? " yet" : " now"}: nothing you do here reaches it.
          </p>
        ) : null}
        {view && !view.live ? (
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-white/70" data-mirror-offline>
            Your echo could not be reached just now ({view.reason}). This is the record alone, without where it puts you.
          </p>
        ) : null}
        {view?.restarted ? (
          <p className="mb-3 text-xs italic text-white/50">
            Your echo started over{view.restarted === true ? " after the record below" : ` on ${when(view.restarted)}`}: what came before no longer counts towards anything.
          </p>
        ) : null}

        {!view && !loading && !trouble ? <p className="text-white/60">There is nothing to show yet: your echo has seen nothing of you.</p> : null}

        {view ? (
          <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
            {/* Where it puts you. */}
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-white/45">Where it puts you</h3>
              <ul className="space-y-2.5">
                {view.axes.map((a) => (
                  <li key={a.key}>
                    <button
                      type="button"
                      data-mirror-axis={a.key}
                      aria-pressed={axis === a.key}
                      onClick={() => setAxis(a.key)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left ${axis === a.key ? "bg-white/10" : "hover:bg-white/5"}`}
                      title={view.live ? `${a.key}: ${a.mu.toFixed(2)} ± ${a.sd.toFixed(2)}` : a.key}
                    >
                      <div className="flex justify-between text-[11px] text-white/55">
                        <Pole word={a.poles[0]} lean={view.live && a.words !== null && a.mu < 0} strong={Math.abs(a.mu) > 0.66} />
                        <span className="text-white/45">{!view.live ? "—" : a.words ? "" : a.sure ? "in between" : "not sure yet"}</span>
                        <Pole word={a.poles[1]} lean={view.live && a.words !== null && a.mu > 0} strong={Math.abs(a.mu) > 0.66} />
                      </div>
                      <div className="relative mt-1 h-1.5 rounded-full bg-white/10">
                        {view.live ? (
                          <>
                            <span
                              className="absolute inset-y-0 rounded-full bg-[#e2edc8]/25"
                              style={{ left: pct(a.mu - a.sd), right: `calc(100% - ${pct(a.mu + a.sd)})` }}
                            />
                            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8c98a]" style={{ left: pct(a.mu) }} />
                          </>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {view.watched ? (
                <p className="mt-3 text-xs text-white/65" data-mirror-watched>
                  When others can see you, it reads you as more {view.watched.towards} than when you are alone: {view.watched.words}.
                </p>
              ) : null}
            </div>

            {/* Why. */}
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-white/45">{sel ? `Why, on ${sel.poles[0]} — ${sel.poles[1]}` : "Why"}</h3>
              {sel ? <Why view={view} axis={sel.key} /> : <p className="text-white/55">Pick a line on the left.</p>}
            </div>
          </div>
        ) : null}

        {view && view.timeline.length ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs uppercase tracking-wide text-white/45">What it saw lately</h3>
            <ol className="space-y-1" data-mirror-timeline>
              {view.timeline.slice(0, 20).map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="w-12 shrink-0 tabular-nums text-[11px] text-white/40">{when(t.at)}</span>
                  <span className="text-white/85">
                    {t.label}
                    {t.kind === "walk" ? <span className="text-white/45"> · {stretches(t.windows)}</span> : null}
                  </span>
                  {t.moves.length ? (
                    t.moves.map((m) => <MoveChip key={m.axis} m={m} />)
                  ) : (
                    <span className="text-[11px] text-white/35">moved nothing you would notice</span>
                  )}
                  {t.readAs.length ? <span className="text-[11px] text-white/35">· read as {t.readAs.join(", ")}</span> : null}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-white/40">
              {view.rows} things on record{view.since ? `, since ${when(view.since)}` : ""}
              {view.capped ? "; older ones are counted in “not in this record”" : ""}.
            </p>
          </div>
        ) : null}

        {/* Your say. */}
        <div className="mt-6 border-t border-white/10 pt-4">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-white/45">Your say</h3>
          <div className="space-y-2 text-[13px]">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-white/80">Watching you: {watching ? "yes" : "no"}.</span>
              {watching ? (
                <button type="button" data-mirror-stop onClick={onRevoke} className="text-[#e8c98a] underline decoration-[#e8c98a]/40 hover:text-white">
                  Stop watching me
                </button>
              ) : (
                <button type="button" data-mirror-watch onClick={onAccept} className="text-[#e8c98a] underline decoration-[#e8c98a]/40 hover:text-white">
                  {consent === "unset" ? "Let it watch" : "Let it watch again"}
                </button>
              )}
              <span className="text-[11px] text-white/40">Stopping ends anything new reaching it; what it already saw stays until you erase it.</span>
            </p>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-white/80">Villagers&apos; voices through ElevenLabs: {cloud === true ? "yes" : cloud === false ? "no" : "never asked"}.</span>
              {cloud ? (
                <button type="button" data-mirror-voices-off onClick={() => (setCloudWanted(false), setCloud(false))} className="text-[#e8c98a] underline decoration-[#e8c98a]/40 hover:text-white">
                  Stop using ElevenLabs
                </button>
              ) : null}
            </p>
            {erasing === "no" ? (
              <button type="button" data-mirror-erase onClick={() => setErasing("asking")} className="text-[#f0a48a] underline decoration-[#f0a48a]/40 hover:text-white">
                Erase everything
              </button>
            ) : erasing === "asking" ? (
              <div className="rounded-lg border border-[#f0a48a]/30 bg-[#f0a48a]/10 px-3 py-2">
                <p className="text-white/85">
                  This erases your echo and everything it was told, this record, what villagers remember of you, what you did in their villages,
                  what you carry, your house and your look. Villages&apos; own histories keep what happened, without your name. It cannot be undone.
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" data-mirror-erase-yes onClick={() => void erase()} className="rounded-full bg-[#f0a48a] px-3 py-1 text-xs font-medium text-[#2a1712]">
                    Erase it all
                  </button>
                  <button type="button" onClick={() => setErasing("no")} className="rounded-full border border-white/20 px-3 py-1 text-xs">
                    Keep it
                  </button>
                </div>
              </div>
            ) : erasing === "going" ? (
              <p className="italic text-white/60">Erasing…</p>
            ) : (
              <p className="italic text-[#f0a48a]" data-mirror-erase-failed>
                {erasing}
              </p>
            )}
          </div>
          <p className="mt-3 text-[11px] text-white/35" data-mirror-id>
            Your id here: <span className="select-all font-mono">{peekUserId() || "none yet"}</span>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/40">
            The record keeps ninety days; your echo keeps its read of you until you erase it. Nothing here is a score: it does not go up for doing
            more, and there is no right place to be on any line.
          </p>
        </div>
      </div>
    </section>
  );
}

/** The axis with the most to say for itself: the furthest from the middle among the sure, else the first. */
function strongest(v: MirrorView): PersonaAxisKey {
  const sure = v.axes.filter((a) => a.sure);
  const pick = (sure.length ? sure : v.axes).reduce((best, a) => (Math.abs(a.mu) > Math.abs(best.mu) ? a : best));
  return v.live ? pick.key : (PERSONA_AXIS_KEYS.find((k) => v.evidence[k].length) ?? PERSONA_AXIS_KEYS[0]);
}

const stretches = (n: number) => (n === 1 ? "one stretch" : `${n} stretches`);

/** A pole's word, lit when the engine leans that way and would say so. */
function Pole({ word, lean, strong }: { word: string; lean: boolean; strong: boolean }) {
  return <span className={lean ? "text-[#e8c98a]" : undefined}>{lean && strong ? `strongly ${word}` : word}</span>;
}

function MoveChip({ m }: { m: Move }) {
  return (
    <span className="rounded-full bg-white/5 px-2 text-[11px] text-[#e2edc8]/80" title={`${m.axis} ${m.amount > 0 ? "+" : ""}${m.amount.toFixed(3)}`}>
      {ARROW(m)} {m.towards}, {m.words}
    </span>
  );
}

function Why({ view, axis }: { view: Loaded; axis: PersonaAxisKey }) {
  const list: Contributor[] = view.evidence[axis];
  const rest = view.notInRecord?.[axis] ?? 0;
  const reads = view.reads[axis];
  return (
    <div data-mirror-why={axis}>
      {list.length === 0 && Math.abs(rest) < 0.005 ? <p className="text-white/55">Nothing has moved it yet.</p> : null}
      <ul className="space-y-1.5">
        {list.map((c) => (
          <li key={`${c.kind}|${c.label}`} className="flex items-baseline justify-between gap-3" title={`${c.amount > 0 ? "+" : ""}${c.amount.toFixed(3)}`}>
            <span className="text-white/85">
              {c.label}
              <span className="text-white/40">
                {" "}
                · {c.kind === "walk" ? stretches(c.count) : c.count === 1 ? "once" : `${c.count} times`}
              </span>
            </span>
            <span className="shrink-0 text-xs text-[#e2edc8]/80">
              {ARROW(c)} {c.towards}, {c.words}
            </span>
          </li>
        ))}
        {view.notInRecord && Math.abs(rest) >= 0.005 ? (
          <li className="flex items-baseline justify-between gap-3 text-white/55" data-mirror-unrecorded title={`${rest > 0 ? "+" : ""}${rest.toFixed(3)}; ${view.missing} updates`}>
            <span>Not in this record{view.missing ? ` (${view.missing} updates)` : ""}</span>
            <span className="shrink-0 text-xs">
              {rest > 0 ? "→" : "←"} {rest > 0 ? view.axes.find((a) => a.key === axis)!.poles[1] : view.axes.find((a) => a.key === axis)!.poles[0]}
            </span>
          </li>
        ) : null}
      </ul>
      {reads?.length ? <p className="mt-3 text-[11px] text-white/45">It reads this line from {reads.join(", ")}.</p> : null}
    </div>
  );
}
