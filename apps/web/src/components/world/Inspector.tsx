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
 * It takes keyboard focus from nothing. The toggle is a window keydown listener that ignores text
 * fields and does not stop propagation; the panel is inert to focus (tabIndex -1, and mousedown is
 * cancelled so a click on it cannot move focus off the world). The world's own keys are untouched.
 */

import { useEffect, useState } from "react";

import { AXIS_POLES, PERSONA_AXIS_KEYS } from "@echo/shared";

import { REACTION_CHANNELS, type ReactionChannel } from "@/game/world/actionMap";
import type { ConsentState, MeasureChain, MeasureLogEntry, Posterior } from "@/game/world/measure";

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
  /** The toggle key. Backtick by default. */
  toggleKey?: string;
}

/** Subscribe a component to a chain: re-renders on every log, posterior or consent change. */
export function useMeasureChain(chain: MeasureChain | null): {
  posterior: Posterior | null;
  log: MeasureLogEntry[];
  consent: ConsentState;
} {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!chain) return;
    return chain.subscribe(() => bump((n) => n + 1));
  }, [chain]);
  return { posterior: chain?.posterior() ?? null, log: chain?.log() ?? [], consent: chain?.consent() ?? "unset" };
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
  width: 360,
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto",
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

export default function Inspector({ posterior, log, reactions = [], consent = "unset", userId, toggleKey = "`" }: InspectorProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== toggleKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleKey]);

  if (!open) return null;

  return (
    <aside style={panel} tabIndex={-1} aria-label="measurement inspector" onMouseDown={(e) => e.preventDefault()}>
      <Header consent={consent} userId={userId} posterior={posterior} />
      <PosteriorSection posterior={posterior} />
      <EventsSection log={log} />
      <ReactionsSection reactions={reactions} />
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
                <td style={{ ...td, textAlign: "right" }}>{num(e.delta_mu, 4)}</td>
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
