"use client";

/**
 * Stage 4 town — the playable slice. Walk the plaza (WASD / click). Wait in the market line or
 * cut it; step up to the clerk and be gracious or curt; walk off without a word; linger at the
 * flower stall. Every act becomes a BehavioralEvent (with mandatory context + a Channel-K
 * refusal twin) forwarded to the engine, and you watch the posterior move — the mirror, live.
 * No score, no win — just a place to be, instrumented end to end.
 */
import { useEffect, useRef, useState } from "react";
import type {
  BehavioralEvent, EventContext, CueChannel, CueId, TargetKind, CounterpartStatus, TelemetryType, Stakes,
} from "@echo/shared";
import { TownScene, type TownProximity } from "@/game/town/TownScene";

const AXES = ["warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect"];

type ActKey =
  | "approach_server" | "join_queue" | "cut_queue"
  | "serve_courtesy" | "serve_curt" | "refuse_server" | "dwell_stall";

interface ActCfg {
  channel: CueChannel; cue: CueId; type: TelemetryType; action: string;
  polarity: "take" | "refuse"; target: { id: string; kind: TargetKind; status: CounterpartStatus };
  counterpart: CounterpartStatus; label: string;
}

const ACTS: Record<ActKey, ActCfg> = {
  approach_server: { channel: "A", cue: "A1", type: "approach", action: "approaches_the_clerk", polarity: "take",
    target: { id: "clerk", kind: "server", status: "low" }, counterpart: "low", label: "approached the clerk" },
  join_queue: { channel: "H", cue: "H1", type: "choice_made", action: "waits_in_the_queue", polarity: "take",
    target: { id: "market_queue", kind: "queue", status: "peer" }, counterpart: "peer", label: "waited in line" },
  cut_queue: { channel: "H", cue: "H1", type: "choice_made", action: "cuts_the_queue", polarity: "refuse",
    target: { id: "market_queue", kind: "queue", status: "peer" }, counterpart: "peer", label: "cut the queue" },
  serve_courtesy: { channel: "G", cue: "G11", type: "interaction_start", action: "thanks_the_clerk", polarity: "take",
    target: { id: "clerk", kind: "server", status: "low" }, counterpart: "low", label: "thanked the clerk" },
  serve_curt: { channel: "G", cue: "G11", type: "interaction_start", action: "is_curt_with_the_clerk", polarity: "refuse",
    target: { id: "clerk", kind: "server", status: "low" }, counterpart: "low", label: "was curt with the clerk" },
  refuse_server: { channel: "K", cue: "K1", type: "avoid", action: "walks_off_without_a_word", polarity: "refuse",
    target: { id: "clerk", kind: "server", status: "low" }, counterpart: "low", label: "walked off without a word" },
  dwell_stall: { channel: "J", cue: "J2", type: "dwell", action: "lingers_at_the_flower_stall", polarity: "take",
    target: { id: "flower_stall", kind: "place", status: "none" }, counterpart: "none", label: "lingered at the flowers" },
};

interface LogRow { label: string; polarity: "take" | "refuse"; delta: number }

export default function TownClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TownScene | null>(null);
  const idRef = useRef({ userId: "", sessionId: "" });
  const consentRef = useRef(true);
  const joinedRef = useRef(false);

  const [prox, setProx] = useState<TownProximity>({ nearCounter: false, npcsWaiting: 0, nearTail: false, nearStall: false, nearPortal: false });
  const [panel, setPanel] = useState(false);
  const [mu, setMu] = useState<number[] | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [mocked, setMocked] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);

  async function emit(key: ActKey, opts: { raw?: Record<string, number>; audience?: number; stakes?: Stakes } = {}) {
    if (!consentRef.current) return;
    const cfg = ACTS[key];
    const context: EventContext = {
      stakes: opts.stakes ?? "low",
      audience_size: opts.audience ?? prox.npcsWaiting,
      public_or_private: "public",
      counterpart_status: cfg.counterpart,
      stage: 4,
      scarcity_level: 0.3,
      mood_proxy: 0,
      time_pressure: 0,
    };
    const event: BehavioralEvent = {
      actor_id: idRef.current.userId,
      sessionId: idRef.current.sessionId,
      t: Date.now(),
      type: cfg.type,
      channel: cfg.channel,
      cue: cfg.cue,
      action: cfg.action,
      polarity: cfg.polarity,
      target: cfg.target,
      context,
      raw_signals: opts.raw ?? {},
      payload: {},
      provenance: "live",
    };
    try {
      const res = await fetch("/api/town/observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [event] }),
      });
      const data = (await res.json()) as {
        mocked?: boolean;
        result?: { persona?: { mu: number[] }; delta_mu?: number; polarity?: "take" | "refuse" };
      };
      setMocked(!!data.mocked);
      const delta = data.result?.delta_mu ?? 0;
      if (data.result?.persona?.mu) setMu(data.result.persona.mu);
      setLastDelta(delta);
      setLog((l) => [{ label: cfg.label, polarity: cfg.polarity, delta }, ...l].slice(0, 8));
    } catch {
      /* never block the player on a telemetry hiccup */
    }
  }

  useEffect(() => {
    // identity + consent (mirrors the other clients)
    let uid = localStorage.getItem("echo.userId");
    if (!uid) { uid = "u_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("echo.userId", uid); }
    idRef.current = { userId: uid, sessionId: "s_" + Math.random().toString(36).slice(2, 10) };
    try {
      consentRef.current = JSON.parse(localStorage.getItem("echo.consent") ?? "{}").telemetry !== false;
    } catch { consentRef.current = true; }

    const scene = new TownScene({
      onProximity: (p) => setProx(p),
      onApproachServer: (distance) => void emit("approach_server", { raw: { distance } }),
      onStallDwell: (seconds) => void emit("dwell_stall", { raw: { dwell_ms: seconds * 1000 } }),
    });
    sceneRef.current = scene;
    if (mountRef.current) void scene.init(mountRef.current);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      const p = sceneRef.current?.getProximity();
      if (!p) return;
      if (k === "e") {
        if (p.nearTail) {
          joinedRef.current = true;
          void emit("join_queue", { audience: p.npcsWaiting });
        } else if (p.nearCounter) {
          // cutting = stepping up to a busy counter without having joined the line
          if (p.npcsWaiting > 0 && !joinedRef.current) void emit("cut_queue", { audience: p.npcsWaiting });
          setPanel(true);
        }
      } else if (k === "o" && p.nearPortal) {
        window.location.href = "/world";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      scene.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function serve(choice: "serve_courtesy" | "serve_curt" | "refuse_server") {
    setPanel(false);
    joinedRef.current = false;
    void emit(choice, { raw: { latency_ms: 800 } });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#241f38", overflow: "hidden" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* prompt */}
      {!panel && (prox.nearTail || prox.nearCounter || prox.nearPortal) && (
        <div style={promptStyle}>
          {prox.nearTail ? "E — take your place in line"
            : prox.nearCounter ? (prox.npcsWaiting > 0 && !joinedRef.current ? "E — step up (past the line)" : "E — step up to the clerk")
            : "O — leave through the portal"}
        </div>
      )}

      {/* server choice */}
      {panel && (
        <div style={modalStyle}>
          <div style={{ marginBottom: 10, opacity: 0.85 }}>The clerk looks up, tired. {prox.npcsWaiting} still waiting.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => serve("serve_courtesy")}>Thank them warmly</button>
            <button style={btn} onClick={() => serve("serve_curt")}>Be curt, get it done</button>
            <button style={btnGhost} onClick={() => serve("refuse_server")}>Walk off without a word</button>
          </div>
        </div>
      )}

      {/* the mirror, moving */}
      <div style={panelStyle}>
        <div style={{ fontWeight: 600, marginBottom: 6, letterSpacing: 0.4 }}>echo · forming</div>
        {mocked && <div style={{ color: "#e0a13a", fontSize: 11, marginBottom: 6 }}>ML offline — mock (start services/ml)</div>}
        {AXES.map((a, i) => {
          const v = mu?.[i] ?? 0;
          return (
            <div key={a} style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0", fontSize: 11 }}>
              <div style={{ width: 60, opacity: 0.7 }}>{a}</div>
              <div style={{ position: "relative", flex: 1, height: 6, background: "#3a3357", borderRadius: 3 }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#5b5380" }} />
                <div style={{
                  position: "absolute", top: 0, bottom: 0, borderRadius: 3,
                  background: v >= 0 ? "#7fc7a3" : "#c77f9b",
                  left: v >= 0 ? "50%" : `${50 + v * 50}%`,
                  width: `${Math.min(50, Math.abs(v) * 50)}%`,
                }} />
              </div>
            </div>
          );
        })}
        {lastDelta != null && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>last act moved the posterior by <b>{lastDelta.toFixed(3)}</b></div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
          {log.map((r, i) => (
            <div key={i} style={{ color: r.polarity === "refuse" ? "#c77f9b" : "#9fd6bb" }}>
              {r.polarity === "refuse" ? "✕" : "•"} {r.label} <span style={{ opacity: 0.6 }}>Δ{r.delta.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={hintStyle}>WASD / click to walk · wait in line or cut it · be kind to the clerk or not · nothing here is scored</div>
    </div>
  );
}

const promptStyle: React.CSSProperties = {
  position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)",
  background: "rgba(20,16,36,0.85)", color: "#f4e9d0", padding: "8px 14px", borderRadius: 8,
  fontFamily: "monospace", fontSize: 13, border: "1px solid #4a4270",
};
const panelStyle: React.CSSProperties = {
  position: "absolute", top: 14, right: 14, width: 240, background: "rgba(20,16,36,0.82)",
  color: "#f4e9d0", padding: 12, borderRadius: 10, fontFamily: "monospace", border: "1px solid #4a4270",
};
const modalStyle: React.CSSProperties = {
  position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)", width: 420, maxWidth: "92vw",
  background: "rgba(20,16,36,0.94)", color: "#f4e9d0", padding: 16, borderRadius: 12,
  fontFamily: "monospace", fontSize: 13, border: "1px solid #4a4270",
};
const hintStyle: React.CSSProperties = {
  position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
  color: "#b9b0d6", fontFamily: "monospace", fontSize: 11, opacity: 0.7, textAlign: "center", width: "92vw",
};
const btn: React.CSSProperties = {
  background: "#3f6db9", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8,
  fontFamily: "monospace", fontSize: 12, cursor: "pointer",
};
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", border: "1px solid #6a628f", color: "#cfc7e6" };
