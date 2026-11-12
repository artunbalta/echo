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
import { t, useLang } from "@/lib/i18n";
import { identityHeaders, identityToken, peekUserId, refusedUnsigned } from "@/lib/identity";
import { eraseEnvelopes } from "@/lib/knowable/erase";
import { closePanel, openPanel, togglePanel, usePanel } from "@/lib/panels";

import EchoPanel from "./Panel";
import type { Contributor, MirrorView, Move, SetOut } from "@/lib/mirror";
import { cloudWanted, setCloudWanted } from "@/lib/villagerVoice";

type Loaded = MirrorView & { capped?: boolean; source?: string; setOut?: SetOut[] };

/**
 * What erasing everything removes from this browser, besides what the server erases. The envelopes'
 * own keys are not in this list: `eraseEnvelopes` clears them, for every page that erases, and keeps
 * the count's id for as long as rows are still under it (`lib/knowable/erase.ts`).
 */
const LOCAL_KEYS = ["echo.userId", "echo.name", "echo.consent", "echo.character", "echo.identityToken", "echo.voiceCloud", "echo.villagerVoice", "echo.email"];

const ARROW = (m: { amount: number }) => (m.amount > 0 ? "→" : "←");
const pct = (x: number) => `${Math.round(((Math.max(-1, Math.min(1, x)) + 1) / 2) * 100)}%`;
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function Mirror({ consent, onAccept, onRevoke }: { consent: ConsentState; onAccept: () => void; onRevoke: () => void }) {
  // Two of the echo's pages are this component's (C96): how it sees you, and your say over all of it.
  // The second used to be the foot of the first, so the one place to stop the watching or erase
  // everything was under eight lines of a reading most visitors do not have yet.
  const panel = usePanel();
  const open = panel === "portrait" || panel === "privacy";
  // Your say over the echo is said in the visitor's language (C96); the reading itself is still English (⚑58).
  const lang = useLang();
  const [view, setView] = useState<Loaded | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [axis, setAxis] = useState<PersonaAxisKey | null>(null);
  const [cloud, setCloud] = useState<boolean | null>(null);
  const [erasing, setErasing] = useState<"no" | "asking" | "going" | string>("no");
  // What can be done about what the erasure said: ask again, or (everything here being gone) leave.
  const [after, setAfter] = useState<"again" | "leave">("again");

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

  const close = useCallback(() => closePanel(), []);
  // Closed, or turned to another page: the question about erasing is put back.
  useEffect(() => {
    if (!open) setErasing("no");
  }, [open]);

  // `Y` opens and closes it, unless a field is being typed in; Esc closes; the meter asks by event.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyY" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) togglePanel("portrait");
      else if (e.code === "Escape" && open) close();
    };
    const onAsk = () => openPanel("portrait");
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
    if (panel === "portrait") void look();
  }, [open, panel, look]);

  const erase = useCallback(async () => {
    setErasing("going");
    // What the echo sealed, and what was added to the village's count (C89, C91), do not wait on the
    // server's own erasure: the first was only ever in this browser, the second is under an id the
    // delete route never saw. One helper does both, for every page that erases.
    const count = await eraseEnvelopes();
    const counted = count === "left" ? ` ${t(lang, "priv.said.count")}` : "";
    const uid = peekUserId();
    // With no id there is nothing on the server to ask about.
    let server: "erased" | "nothing" | "failed" = uid ? "failed" : "nothing";
    let tables = "";
    if (uid) {
      try {
        const res = await fetch("/api/account/delete", {
          method: "POST",
          headers: identityHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ userId: uid }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; supabaseTablesFailed?: string[] };
        if (res.ok && data.ok) server = "erased";
        // Nothing was ever kept there under this browser's id (`refusedUnsigned`): what there is of this
        // person is here, and is erased here. The mirror used to tell them to try again, for ever.
        else if (refusedUnsigned(data.error)) server = "nothing";
        else if (data.supabaseTablesFailed?.length) tables = ` (${data.supabaseTablesFailed.join(", ")})`;
      } catch {
        // Not sent: the same as refused. The id is kept to ask again with.
      }
    }
    if (server === "failed") {
      setAfter("again");
      setErasing(t(lang, "priv.said.failed", { tables, counted }));
      return;
    }
    // One thing is not gone: the page stops watching before it says so, since the identity it watched under is.
    if (count === "left") onRevoke();
    for (const k of LOCAL_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {
        // a private window: nothing was kept to remove
      }
    }
    if (count === "left") {
      setAfter("leave");
      setErasing(t(lang, "priv.said.left", { counted }));
      return;
    }
    window.location.assign("/");
  }, [onRevoke, lang]);

  if (!open) return null;
  const watching = consent === "accepted";
  const sel = axis ? view?.axes.find((a) => a.key === axis) : null;

  return (
    <EchoPanel tab={panel === "privacy" ? "privacy" : "portrait"} label="The mirror" wide={panel !== "privacy"} attrs={{ "data-mirror": view ? (view.live ? "live" : "record") : "empty" }}>
      <div
        className="min-h-0 overflow-y-auto"
        onMouseDown={(e) => {
          // The world keeps its keys: nothing here takes focus, except a button, and your id to copy.
          if (!(e.target instanceof HTMLButtonElement) && !(e.target instanceof Element && e.target.closest("[data-mirror-id]"))) e.preventDefault();
        }}
      >
      {panel === "privacy" ? null : (
      <header className="flex items-baseline justify-between gap-3 px-6 pt-4">
        <div>
          <h2 className="font-serif text-[20px] leading-tight text-parchment">How your echo sees you</h2>
          <p className="mt-0.5 text-xs text-white/50">Where it puts you, and what it saw that made it so.</p>
        </div>
        <button type="button" onClick={() => void look()} disabled={loading} data-mirror-again className="shrink-0 text-xs text-white/50 hover:text-white disabled:opacity-40">
          {loading ? "Looking…" : "Look again"}
        </button>
      </header>
      )}

      <div className="px-6 pb-5 pt-3 text-sm">
        {panel === "privacy" ? null : (
        <>
        {trouble ? <p className="mb-3 italic text-ember/85">{trouble}</p> : null}
        {!watching ? (
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-white/70">
            Your echo is not watching you{consent === "unset" ? " yet" : " now"}: nothing you do here reaches it.
          </p>
        ) : null}
        {view && !view.live ? (
          // The route's reason rides in the title, for whoever is looking for it (C68); the sentence is
          // what it means for the person reading.
          <p className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-white/70" data-mirror-offline title={view.reason ?? undefined}>
            Your echo&apos;s engine is not answering right now, so these lines are empty. What you did is still kept, and its guesses still work.
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
                              className="absolute inset-y-0 rounded-full bg-parchment/25"
                              style={{ left: pct(a.mu - a.sd), right: `calc(100% - ${pct(a.mu + a.sd)})` }}
                            />
                            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember" style={{ left: pct(a.mu) }} />
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

        {view?.setOut?.length ? (
          <div className="mt-6" data-mirror-setout>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-white/45">What the world set out for you</h3>
            <ul className="space-y-1.5 text-[13px]">
              {view.setOut.map((o) => (
                <li key={o.id}>
                  <span className="text-white/85">
                    {o.name[0]!.toUpperCase()}
                    {o.name.slice(1)}
                  </span>
                  <span className="text-white/45">, to see {o.asks}. </span>
                  <span className="text-echo-soft/80">You {o.answer === "walked past" || o.answer === "left it be" ? o.answer : `chose “${o.answer}”`}.</span>
                  <span className="text-[11px] text-white/35"> {when(o.at)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-white/40">
              It sets one out only when it is unsure of you, and fewer as it grows sure. None is a test you can fail: walking past is an answer
              like any other.
            </p>
          </div>
        ) : null}

        </>
        )}

        {/* Your say: its own page. */}
        {panel !== "privacy" ? (
          <p className="mt-6 border-t border-white/10 pt-3 text-xs text-white/50">
            {t(lang, "priv.pointer")}{" "}
            <button type="button" data-mirror-to-privacy onClick={() => openPanel("privacy")} className="text-echo-soft underline decoration-echo-soft/40 underline-offset-2 hover:text-white">
              {t(lang, "hub.privacy")}
            </button>
          </p>
        ) : (
        <div data-mirror-say>
          <h2 className="mb-3 font-serif text-[20px] leading-tight text-parchment">{t(lang, "menu.privacy")}</h2>
          {/* Three things a person may want to do, each a line with its own button (C96): they were three
              underlined phrases in a paragraph. */}
          <div className="divide-y divide-white/10 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-white/90">{t(lang, watching ? "priv.watching.yes" : "priv.watching.no")}</p>
                <p className="mt-0.5 text-[12px] text-white/45">{t(lang, "priv.watching.note")}</p>
              </div>
              {watching ? (
                <button type="button" data-mirror-stop onClick={onRevoke} className="btn btn-sm btn-ghost">
                  {t(lang, "priv.stop")}
                </button>
              ) : (
                <button type="button" data-mirror-watch onClick={onAccept} className="btn btn-sm btn-primary">
                  {t(lang, consent === "unset" ? "consent.yes" : "priv.watchAgain")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <p className="min-w-0 flex-1 text-white/90">{t(lang, "priv.voices", { state: t(lang, cloud === true ? "priv.yes" : cloud === false ? "priv.no" : "priv.never") })}</p>
              {cloud ? (
                <button type="button" data-mirror-voices-off onClick={() => (setCloudWanted(false), setCloud(false))} className="btn btn-sm btn-ghost">
                  {t(lang, "priv.voicesOff")}
                </button>
              ) : null}
            </div>
            <div className="py-3">
            {erasing === "no" ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="min-w-0 flex-1 text-white/90">{t(lang, "priv.erase.line")}</p>
                <button type="button" data-mirror-erase onClick={() => setErasing("asking")} className="btn btn-sm btn-danger">
                  {t(lang, "priv.erase")}
                </button>
              </div>
            ) : erasing === "asking" ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-3">
                <p className="text-white/85">{t(lang, "priv.erase.sure")}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" data-mirror-erase-yes onClick={() => void erase()} className="btn btn-sm bg-danger text-ink-deep hover:opacity-90">
                    {t(lang, "priv.erase.yes")}
                  </button>
                  <button type="button" onClick={() => setErasing("no")} className="btn btn-sm btn-ghost">
                    {t(lang, "priv.erase.keep")}
                  </button>
                </div>
              </div>
            ) : erasing === "going" ? (
              <p className="italic text-white/60">{t(lang, "priv.erasing")}</p>
            ) : (
              <div>
                <p className="text-danger" data-mirror-erase-failed>
                  {erasing}
                </p>
                <button type="button" data-mirror-erase-after={after} onClick={() => (after === "leave" ? window.location.assign("/") : setErasing("asking"))} className="btn btn-sm btn-ghost mt-2.5">
                  {t(lang, after === "leave" ? "priv.erase.leave" : "priv.erase.again")}
                </button>
              </div>
            )}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-white/35" data-mirror-id>
            {t(lang, "priv.id")} <span className="select-all font-mono">{peekUserId() || t(lang, "priv.idNone")}</span>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/40">
            {t(lang, "priv.note")}
          </p>
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
            {t(lang, "priv.inspect")}{" "}
            <button
              type="button"
              data-mirror-inspect
              onClick={() => {
                closePanel();
                window.dispatchEvent(new Event("echo:inspector"));
              }}
              className="text-echo-soft underline decoration-echo-soft/40 underline-offset-2 hover:text-white"
            >
              {t(lang, "menu.inspector")}
            </button>
          </p>
        </div>
        )}
      </div>
      </div>
    </EchoPanel>
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
  return <span className={lean ? "text-ember" : undefined}>{lean && strong ? `strongly ${word}` : word}</span>;
}

function MoveChip({ m }: { m: Move }) {
  return (
    <span className="rounded-full bg-white/5 px-2 text-[11px] text-echo-soft/80" title={`${m.axis} ${m.amount > 0 ? "+" : ""}${m.amount.toFixed(3)}`}>
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
            <span className="shrink-0 text-xs text-echo-soft/80">
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
