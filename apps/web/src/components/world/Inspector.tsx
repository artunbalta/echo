"use client";

/**
 * The inspector (plan W5-4): the number, shown. Hidden by default; the backtick key toggles it.
 * It never invents a value. When the posterior is mocked it says OFFLINE and names the reason
 * instead of drawing bars, and a reaction channel that has not yet answered an event says so.
 *
 * Three sections, top to bottom:
 *   posterior   the eight axes of μ as bars with a ±√var band and the numeric value; the version.
 *   events      the last 25: id, action, route (behavioral | telemetry), the routed features,
 *               ‖Δμ‖, and the durable and mocked flags, newest first.
 *   reactions   every channel in REACTION_CHANNELS with base, offset, result, and THE EVENT ID
 *               AND POSTERIOR VERSION it responded to, from the reactions layer via props.
 *
 * THE STATION-LESS MODE (task A6). Pass `walk` and the first and third sections are replaced by
 * what was actually measured, because on ground with no stations there is nothing else true to
 * show. There is no cave and no campfire on an ordinary parcel, so there is no bounded decision;
 * the only channel walking opens is passive_locomotion, and ML /telemetry answers that with
 * uncertainty and never with a mean. The posterior a person would be shown is therefore the seed
 * read and nothing else, and eight bars at their seed values read to anybody as a result. Drawing
 * them would be the code stating the conclusion this panel exists to disprove, so the panel says
 * what it measured and says plainly why the posterior has not moved. That an ordinary parcel has
 * nothing to do in it is a deferred design question, not an accident: DECISIONS.md C15.
 *
 * It takes keyboard focus from nothing. The toggle is a window keydown listener that ignores text
 * fields and does not stop propagation; the panel is inert to focus (tabIndex -1, and mousedown is
 * cancelled so a click on it cannot move focus off the world). The world's own keys are untouched.
 *
 * AND SINCE C23 THERE IS A SECOND DOOR, because the first one is a key no phone has. `open` and
 * `onOpenChange` are optional: given neither, this behaves exactly as it did, holding its own state
 * and answering only the backtick. Given both, the MOUNT owns whether the panel is showing and the
 * keydown here just calls the setter — so a touch control and a keystroke are two ways to reach one
 * piece of state rather than two pieces of state that can disagree about whether a panel is up.
 * That mattered more than a convenience: ConsentCard promises "you can stop it at any time from the
 * inspector", and on a phone that sentence was false — consent could be given and never withdrawn.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AXIS_POLES, PERSONA_AXIS_KEYS } from "@echo/shared";

import { REACTION_CHANNELS, type ReactionChannel } from "@/game/world/actionMap";
import { LOG_SIZE, type ConsentState, type MeasureChain, type MeasureLogEntry, type Posterior } from "@/game/world/measure";
import type { WalkTally } from "@/game/world/walkLayer";

/** One channel's current reading, as the reactions layer computed it. */
export interface ReactionReading {
  channel: ReactionChannel;
  base: number;
  offset: number;
  result: number;
  /** The event id (MeasureLogEntry.id) and posterior version this reading responded to. */
  eventId: string | null;
  version: number | null;
}

export interface InspectorProps {
  posterior: Posterior | null;
  log: readonly MeasureLogEntry[];
  reactions?: readonly ReactionReading[];
  consent?: ConsentState;
  userId?: string;
  /**
   * The walk layer's tally, which puts this panel in its station-less mode (see the header). It is
   * a getter rather than a value because the tally moves every frame and nothing subscribes to it;
   * the panel polls it while it is open and not at all while it is shut. It must be STABLE across
   * renders (a useCallback), or the poll restarts on every reading it causes.
   */
  walk?: () => WalkTally | null;
  /** The toggle key. Backtick by default. */
  toggleKey?: string;
  /**
   * Whether the panel is showing, when the mount wants to own that (see the header). Pass both this
   * and `onOpenChange` or neither: half of a controlled pair is the disagreement it exists to stop.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Subscribe a component to a chain: re-renders on every log, posterior or consent change. */
export function useMeasureChain(chain: MeasureChain | null): {
  posterior: Posterior | null;
  log: MeasureLogEntry[];
  consent: ConsentState;
} {
  const [, bump] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    if (!chain) return;
    return chain.subscribe(() => bump((n) => n + 1));
  }, [chain]);
  return hydrated
    ? { posterior: chain?.posterior() ?? null, log: chain?.log() ?? [], consent: chain?.consent() ?? "unset" }
    : { posterior: null, log: [], consent: "unset" };
}

// ── the palette, in one place ───────────────────────────────────────────────────
const INK = "#1c1326";
const PARCHMENT = "#f4e9d0";
const ECHO = "#a06cd5";
const DIM = "rgba(244, 233, 208, 0.5)";
const FAINT = "rgba(244, 233, 208, 0.22)";
const RULE = "rgba(160, 108, 213, 0.35)";

const panel: React.CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  width: "min(360px, calc(100vw - 24px))",
  maxHeight: "calc(100dvh - 24px)",
  overflowY: "auto",
  // The canvas below carries touch-action: none, so without this a finger on the panel drags the
  // world instead of scrolling the twenty-five events the panel is showing.
  touchAction: "pan-y",
  overscrollBehavior: "contain",
  zIndex: 40,
  padding: "10px 12px",
  background: "rgba(28, 19, 38, 0.92)",
  border: `1px solid ${RULE}`,
  borderRadius: 8,
  color: PARCHMENT,
  font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
  fontVariantNumeric: "tabular-nums",
  boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
  userSelect: "text",
};

const REASONS: Record<string, string> = {
  ml_service_url_unset: "ML_SERVICE_URL is unset in this runtime; the route answered with a mock",
  ml_forward_failed: "the route reached for echo-ml and the forward failed",
  no_persona_in_response: "the response carried no posterior",
  consent_off: "consent is off; nothing was sent",
  not_armed: "the chain is not armed; nothing was sent",
  unmapped_action: "the action is not in ACTION_AXIS_MAP; nothing was sent",
};

const explain = (reason: string | undefined) => (reason ? REASONS[reason] ?? reason : "no reason given");
const num = (v: number | null | undefined, digits = 3) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—");
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour12: false });
const amount = (v: number, digits = 0) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** How often the tally is read while the panel is open. Nothing polls while it is shut. */
const TALLY_MS = 500;

export default function Inspector({
  posterior,
  log,
  reactions = [],
  consent = "unset",
  userId,
  walk,
  toggleKey = "`",
  open: controlledOpen,
  onOpenChange,
}: InspectorProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const [tally, setTally] = useState<WalkTally | null>(null);
  // The keydown reads the current value through a ref rather than depending on it, so the listener
  // is subscribed once for the life of the panel instead of torn down and rebuilt on every toggle.
  const openNow = useRef(open);
  openNow.current = open;

  // Before the early return, because a hook is not allowed to depend on whether the panel is open;
  // `open` is a dependency instead, so a shut panel holds no timer.
  useEffect(() => {
    if (!walk || !open) return;
    const read = () => setTally(walk());
    read();
    const id = setInterval(read, TALLY_MS);
    return () => clearInterval(id);
  }, [walk, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== toggleKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(!openNow.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleKey, setOpen]);

  if (!open) return null;

  return (
    <aside style={panel} tabIndex={-1} aria-label="measurement inspector" onMouseDown={(e) => e.preventDefault()}>
      {/* Not a <button>, for the reason C23 records for the whole HUD: a focused button eats the
          spacebar, which is jump in this world. It shows only where the mount owns `open`, because
          an uncontrolled panel has nowhere to put the answer. */}
      {controlled ? (
        <div
          role="button"
          aria-label="Close the inspector"
          data-inspector-close
          onPointerDown={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          style={{
            position: "absolute", top: 6, right: 8, width: 30, height: 30, display: "grid",
            placeItems: "center", borderRadius: 15, color: DIM, cursor: "pointer",
            font: "15px/1 ui-monospace, monospace", touchAction: "manipulation",
          }}
        >
          ×
        </div>
      ) : null}
      <Header consent={consent} userId={userId} posterior={posterior} />
      {walk ? (
        <WalkSection tally={tally} consent={consent} log={log} posterior={posterior} />
      ) : (
        <PosteriorSection posterior={posterior} />
      )}
      <EventsSection log={log} />
      {/* No reactions section in the station-less mode. Not because every channel belongs to a
          station: fog_offset comes from the passive_locomotion row and therefore belongs to walking,
          which is the one thing happening here. It is hidden because nothing DRIVES fog_offset yet,
          so the row would say "no reaction" about a channel that is wired to nothing, which reads
          as one that has not happened yet rather than as one that cannot. */}
      {walk ? null : <ReactionsSection reactions={reactions} />}
    </aside>
  );
}

// ── header ──────────────────────────────────────────────────────────────────────

function Header({ consent, userId, posterior }: { consent: ConsentState; userId?: string; posterior: Posterior | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
      <span style={{ color: ECHO, fontWeight: 700, letterSpacing: "0.04em" }}>inspector</span>
      <span style={{ color: DIM }}>
        consent {consent}
        {userId ? ` · ${userId.slice(0, 8)}` : ""}
        {posterior && !posterior.mocked ? ` · v${posterior.version ?? "?"}` : ""}
      </span>
    </div>
  );
}

function Rule({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
      <span style={{ color: ECHO }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: RULE }} />
    </div>
  );
}

// ── posterior ───────────────────────────────────────────────────────────────────

function PosteriorSection({ posterior }: { posterior: Posterior | null }) {
  if (!posterior) {
    return (
      <>
        <Rule label="posterior" />
        <div style={{ color: DIM }}>no posterior yet: it is read once when consent is accepted, then moved by events.</div>
      </>
    );
  }
  if (posterior.mocked) {
    return (
      <>
        <Rule label="posterior" />
        <div style={{ border: `1px solid ${RULE}`, borderRadius: 4, padding: "6px 8px" }}>
          <div style={{ color: ECHO, fontWeight: 700 }}>OFFLINE</div>
          <div style={{ color: DIM }}>{explain(posterior.reason)}</div>
          <div style={{ color: FAINT }}>
            no numbers are shown for a mocked posterior · {posterior.source} · {clock(posterior.at)}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <Rule label={`posterior · v${posterior.version ?? "?"} · ${posterior.source} · ${clock(posterior.at)}`} />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", columnGap: 8, rowGap: 3, alignItems: "center" }}>
        {PERSONA_AXIS_KEYS.map((key, i) => {
          const mu = posterior.mu[i] ?? 0;
          const sd = posterior.var && Number.isFinite(posterior.var[i]) ? Math.sqrt(Math.max(0, posterior.var[i])) : null;
          const [neg, pos] = AXIS_POLES[key];
          return (
            <AxisRow key={key} name={key} poles={`${neg} ↔ ${pos}`} mu={mu} sd={sd} />
          );
        })}
      </div>
    </>
  );
}

/** One axis: name, a −1..+1 track with the ±√var band under the μ bar, and the numbers. */
function AxisRow({ name, poles, mu, sd }: { name: string; poles: string; mu: number; sd: number | null }) {
  const pct = (v: number) => 50 + 50 * Math.max(-1, Math.min(1, v));
  const lo = sd === null ? null : pct(mu - sd);
  const hi = sd === null ? null : pct(mu + sd);
  const barLeft = Math.min(50, pct(mu));
  const barWidth = Math.abs(pct(mu) - 50);
  return (
    <>
      <span title={poles} style={{ color: DIM, width: 68 }}>{name}</span>
      <span style={{ position: "relative", height: 10, background: "rgba(244,233,208,0.08)", borderRadius: 2 }}>
        {lo !== null && hi !== null ? (
          <span style={{ position: "absolute", top: 0, bottom: 0, left: `${lo}%`, width: `${hi - lo}%`, background: "rgba(160,108,213,0.22)", borderRadius: 2 }} />
        ) : null}
        <span style={{ position: "absolute", top: 0, bottom: 0, left: `${barLeft}%`, width: `${barWidth}%`, background: ECHO }} />
        <span style={{ position: "absolute", top: -1, bottom: -1, left: "50%", width: 1, background: FAINT }} />
      </span>
      <span style={{ textAlign: "right", minWidth: 52 }}>{mu >= 0 ? "+" : ""}{num(mu)}</span>
      <span style={{ color: DIM, minWidth: 48 }}>±{sd === null ? "—" : num(sd)}</span>
    </>
  );
}

// ── the station-less reading ────────────────────────────────────────────────────

/**
 * What was measured, and why that is all there is. Every row is a quantity something in the world
 * actually counted: the first four come from the walk layer's tally, which is summed from the same
 * tile positions the locomotion sampler was fed, and the last two are the chain's own state. There
 * is no row here that is an inference.
 */
function WalkSection({ tally, consent, log, posterior }: { tally: WalkTally | null; consent: ConsentState; log: readonly MeasureLogEntry[]; posterior: Posterior | null }) {
  // Locomotion windows that actually reached the service. A mocked send moved nothing, so it does
  // not count here: this number is the claim the card below makes, and it has to be a count of
  // updates that happened rather than of attempts.
  const windows = log.filter((e) => e.action === "passive_locomotion" && e.mocked === false).length;
  const service = !posterior
    ? "not read yet: the seed read happens when consent arms the chain"
    : posterior.mocked
      ? `mocked, so no number stands behind it: ${explain(posterior.reason)}`
      : `answered, v${posterior.version ?? "?"}, ${posterior.source} read at ${clock(posterior.at)}`;

  return (
    <>
      <Rule label="measured" />
      {tally ? (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 3 }}>
          <Measured label="walked" value={`${amount(tally.distanceM, 1)} m`} />
          <Measured
            label="stood still"
            value={`${amount(tally.dwellMs / 1000, 1)} s of ${amount(tally.measuredMs / 1000, 1)} s`}
            note="time in the world, summed from frames: a hidden tab counts for nothing"
          />
          <Measured
            label="ground covered"
            value={`${tally.capped ? "at least " : ""}${amount(tally.areaM2)} m2, ${amount(tally.tiles)} tiles`}
            note={tally.capped ? "the tile memory is full, so this is a floor rather than a total" : "distinct tiles touched, converted with the metres per tile the world was built with"}
          />
          <Measured label="events held" value={`${log.length} of ${LOG_SIZE}`} note={`the log keeps the last ${LOG_SIZE}; anything older was sent and then dropped from view, so this is not a session total`} />
          <Measured label="consent" value={consent} />
          <Measured label="service" value={service} />
        </div>
      ) : (
        <div style={{ color: DIM }}>
          {consent === "accepted"
            ? "nothing measured yet: no frame has been counted, because the ground is not built and drawing."
            : "nothing is being measured. Consent is " +
              (consent === "declined" ? "declined" : "unanswered, which on this path means off") +
              ", so no position is sampled, nothing is buffered, and no tally is kept here either."}
        </div>
      )}

      <Rule label="posterior" />
      <div style={{ border: `1px solid ${RULE}`, borderRadius: 4, padding: "6px 8px" }}>
        <div style={{ color: ECHO, fontWeight: 700 }}>{windows > 0 ? "WALKING IS MOVING IT" : "NOTHING HAS MOVED IT YET"}</div>
        <div style={{ color: DIM, marginTop: 3 }}>
          {windows > 0
            ? `${windows} locomotion ${windows === 1 ? "window has" : "windows have"} reached the service. Each one runs a Kalman update on two identified directions, novel_tile_ratio and path_tortuosity, which carry the largest loadings in the whole action map. This is the least fakeable channel there is, and it is the one you are on.`
            : "No locomotion window has reached the service yet. Walk, and one lands about every second and a half."}
        </div>
        <div style={{ color: DIM, marginTop: 3 }}>
          The axes are not drawn here because the route that receives a locomotion window answers
          with uncertainty and no mean, so nothing on this screen could say by how much any one axis
          moved. The version above is re-read after every window that lands, which is the honest
          measure available: it counts the updates rather than describing them.
        </div>
        <div style={{ color: FAINT, marginTop: 3 }}>
          There is still no bounded act on this ground: no cave to enter, no fire to keep, nothing
          whose cost you could take or refuse. What an ordinary parcel gives a person to do is a
          design question that was deferred on purpose, not an accident: see DECISIONS.md C15.
        </div>
      </div>
    </>
  );
}

function Measured({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <>
      <span style={{ color: DIM }} title={note}>{label}</span>
      <span>{value}</span>
    </>
  );
}

// ── events ──────────────────────────────────────────────────────────────────────

function EventsSection({ log }: { log: readonly MeasureLogEntry[] }) {
  const newestFirst = [...log].reverse();
  return (
    <>
      <Rule label={`events · last ${log.length}`} />
      {newestFirst.length === 0 ? (
        <div style={{ color: DIM }}>nothing sent yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: FAINT, textAlign: "left" }}>
              <th style={th}>id</th>
              <th style={th}>action</th>
              <th style={th}>route</th>
              <th style={th}>features</th>
              <th style={{ ...th, textAlign: "right" }}>‖Δμ‖</th>
              <th style={th}>flags</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((e) => (
              <tr key={e.id} title={`${clock(e.at)}${e.reason ? ` · ${explain(e.reason)}` : ""}${e.version !== null ? ` · v${e.version}` : ""}`}>
                <td style={{ ...td, color: DIM }}>{e.id.slice(e.id.lastIndexOf("#"))}</td>
                <td style={td}>{e.action}</td>
                <td style={{ ...td, color: DIM }}>{e.route}</td>
                <td style={{ ...td, color: DIM }}>{e.features.length ? e.features.join(", ") : "—"}</td>
                {/* A dash next to a "real" flag reads as "moved nothing", and for a locomotion
                    window that is exactly wrong: it moved the posterior and the route answered with
                    uncertainty instead of a mean, so the number was never sent. Say which of the two
                    silences this is. */}
                <td style={{ ...td, textAlign: "right", color: e.delta_mu === null && e.route === "telemetry" ? FAINT : undefined }}
                    title={e.delta_mu === null && e.route === "telemetry" ? "the telemetry route answers with uncertainty and no mean, so the size of this update was never reported" : undefined}>
                  {e.delta_mu === null && e.route === "telemetry" ? "not reported" : num(e.delta_mu, 4)}
                </td>
                <td style={td}>
                  <Flag on={e.durable} yes="durable" no="volatile" />
                  {" "}
                  <Flag on={!e.mocked} yes="real" no="mocked" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const th: React.CSSProperties = { fontWeight: 400, padding: "0 4px 2px 0" };
const td: React.CSSProperties = { padding: "1px 4px 1px 0", verticalAlign: "top", whiteSpace: "nowrap" };

function Flag({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return <span style={{ color: on ? PARCHMENT : ECHO }}>{on ? yes : no}</span>;
}

// ── reactions ───────────────────────────────────────────────────────────────────

function ReactionsSection({ reactions }: { reactions: readonly ReactionReading[] }) {
  const byChannel = new Map(reactions.map((r) => [r.channel, r]));
  return (
    <>
      <Rule label="reactions" />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8, rowGap: 4 }}>
        {REACTION_CHANNELS.map((c) => {
          const r = byChannel.get(c.channel);
          return (
            <ReactionRow key={c.channel} axis={c.axis} channel={c.channel} feature={c.feature} loading={c.loading} reading={r} />
          );
        })}
      </div>
    </>
  );
}

function ReactionRow({ axis, channel, feature, loading, reading }: { axis: string; channel: ReactionChannel; feature: string; loading: number; reading?: ReactionReading }) {
  return (
    <>
      <span style={{ color: DIM }} title={`${feature} loads ${axis} at ${loading}`}>
        {channel.replace(/_/g, " ")}
        <span style={{ color: FAINT }}> ← {axis}</span>
      </span>
      {reading ? (
        <span>
          base {num(reading.base)} {reading.offset >= 0 ? "+" : "−"} {num(Math.abs(reading.offset))} = {num(reading.result)}
          <span style={{ color: DIM }}>
            {" "}· {reading.eventId ? reading.eventId.slice(reading.eventId.lastIndexOf("#")) : "no event"} · v{reading.version ?? "?"}
          </span>
        </span>
      ) : (
        <span style={{ color: DIM }}>no reaction yet</span>
      )}
    </>
  );
}
