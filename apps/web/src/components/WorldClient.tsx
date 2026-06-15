"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { config } from "@/lib/config";
import { PixiWorld } from "@/game/PixiWorld";
import { NetClient } from "@/game/net";
import { TelemetryCollector } from "@/game/telemetry";
import { proposeReply, sendFeedback, type AgentTurn } from "@/lib/agent";
import EchoPanel from "@/components/EchoPanel";
import OutcomesPanel, { type MetPerson } from "@/components/OutcomesPanel";
import type { InteractTurnPayload } from "@echo/shared";

interface Line {
  who: "you" | "them";
  name: string;
  text: string;
}

function reasonFor(turns: number): string {
  if (turns >= 4) return "a long, real conversation — you stayed when you could have moved on";
  if (turns >= 2) return "you kept it going past the first hello";
  return "a brief hello";
}

export default function WorldClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PixiWorld | null>(null);
  const netRef = useRef<NetClient | null>(null);
  const teleRef = useRef<TelemetryCollector | null>(null);
  const interactionRef = useRef<string | null>(null);
  const inputFocusedAt = useRef<number>(0);
  const editsRef = useRef<number>(0);

  const [status, setStatus] = useState("Connecting…");
  const [uid, setUid] = useState("");
  const [nearby, setNearby] = useState<{ id: string; name: string; refId: string } | null>(null);
  const [portalNear, setPortalNear] = useState(false);
  const [entering, setEntering] = useState(false);
  const portalNearRef = useRef(false);
  portalNearRef.current = portalNear;
  const enteringRef = useRef(false);
  const [convo, setConvo] = useState<{ name: string; lines: Line[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [narration, setNarration] = useState<string | null>(null);

  // Agency layer (Phase 6).
  const [proposal, setProposal] = useState<AgentTurn | null>(null);
  const [proposing, setProposing] = useState(false);
  const [showEcho, setShowEcho] = useState(false);
  const [showOutcomes, setShowOutcomes] = useState(false);
  const editFromRef = useRef<string | null>(null); // original proposal when editing
  const convoTargetRef = useRef<{ id: string; name: string } | null>(null);
  const metRef = useRef<Map<string, { id: string; name: string; turns: number }>>(new Map());
  const [metCount, setMetCount] = useState(0);

  // Narrator session digest (Phase 7) — grounded signals for the debrief.
  const digestRef = useRef({ approaches: 0, avoids: 0, dwell: 0, revisits: 0, edits: 0, replyMs: [] as number[] });
  const voiceConsentRef = useRef(false);
  const sessionIdRef = useRef("");
  const uidRef = useRef("");

  // Keep a stable ref to `nearby` for keyboard handler.
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;
  const convoRef = useRef(convo);
  convoRef.current = convo;

  const startInteraction = useCallback(() => {
    const n = nearbyRef.current;
    if (!n || convoRef.current) return;
    netRef.current?.interactStart(n.id);
  }, []);

  // Step through the portal → fade to black, then travel to the venue.
  const enterVenue = useCallback(() => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    setEntering(true);
    teleRef.current?.emit("portal_enter", { to: "venue" });
    window.setTimeout(() => {
      window.location.href = "/venue";
    }, 700);
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem("echo.userId") ?? "u_" + Math.random().toString(36).slice(2, 10);
    const name = localStorage.getItem("echo.name") ?? "Newcomer";
    const sessionId = "s_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("echo.userId", userId);
    setUid(userId);
    uidRef.current = userId;
    sessionIdRef.current = sessionId;
    try {
      voiceConsentRef.current = JSON.parse(localStorage.getItem("echo.consent") ?? "{}").voice === true;
    } catch {
      voiceConsentRef.current = false;
    }

    // Character + consent from onboarding (Phase 3).
    let spriteUrl = "";
    try {
      spriteUrl = JSON.parse(localStorage.getItem("echo.character") ?? "{}").spriteUrl ?? "";
    } catch {
      /* none yet */
    }
    let telemetryConsent = true;
    try {
      telemetryConsent = JSON.parse(localStorage.getItem("echo.consent") ?? "{}").telemetry !== false;
    } catch {
      /* default on */
    }

    let disposed = false;
    const world = new PixiWorld({
      onNearbyChange: (t) => setNearby(t),
      onMoveIntent: (dir, facing, seq) => netRef.current?.sendMove({ dir, facing, seq }),
      onStop: (seq) => netRef.current?.sendStop(seq),
      emitTelemetry: (type, payload) => {
        teleRef.current?.emit(type as any, payload);
        const d = digestRef.current;
        if (type === "approach") d.approaches++;
        else if (type === "avoid") d.avoids++;
        else if (type === "dwell") d.dwell++;
        else if (type === "revisit") d.revisits++;
      },
      onPortalChange: (near) => setPortalNear(near),
    });
    worldRef.current = world;

    const net = new NetClient(config.realtimeUrl);
    netRef.current = net;
    const tele = new TelemetryCollector(sessionId, (events) => net.sendTelemetry(events));
    teleRef.current = tele;

    net.on({
      onWelcome: (w) => {
        world.setSelf(w.entityId, w.spawn.x, w.spawn.y);
        setStatus("");
      },
      onSnapshot: (snaps, _tick) => {
        world.applySnapshot(snaps, net.lastAckSeq());
        if (typeof window !== "undefined") {
          let npc = 0;
          let user = 0;
          snaps.forEach((s) => (s.kind === "npc" ? npc++ : user++));
          const me = snaps.get(net.selfId);
          let nearest: { x: number; y: number; dist: number } | null = null;
          if (me) {
            snaps.forEach((s) => {
              if (s.kind !== "npc") return;
              const d = Math.hypot(s.x - me.x, s.y - me.y);
              if (!nearest || d < nearest.dist) nearest = { x: s.x, y: s.y, dist: d };
            });
          }
          (window as { __echo?: unknown }).__echo = {
            total: snaps.size,
            npc,
            user,
            self: net.selfId,
            me: me ? { x: me.x, y: me.y } : null,
            nearest,
          };
        }
      },
      onInteractOpened: (p) => {
        interactionRef.current = p.interactionId;
        convoTargetRef.current = { id: p.target.id, name: p.target.name };
        setConvo({ name: p.target.name, lines: [] });
        setProposal(null);
        if (!metRef.current.has(p.target.id)) {
          metRef.current.set(p.target.id, { id: p.target.id, name: p.target.name, turns: 0 });
          setMetCount(metRef.current.size);
        }
        tele.emit("interaction_start", { targetId: p.target.id });
      },
      onInteractTurn: (p: InteractTurnPayload) => {
        setConvo((c) => (c ? { ...c, lines: [...c.lines, { who: "them", name: p.speakerName, text: p.text }] } : c));
      },
      onInteractClosed: () => {
        const t = convoTargetRef.current;
        const counterpart = t ? { name: t.name, turns: metRef.current.get(t.id)?.turns ?? 0 } : undefined;
        interactionRef.current = null;
        convoTargetRef.current = null;
        setConvo(null);
        setProposal(null);
        tele.emit("interaction_end", {});
        narrateNow("encounter", counterpart);
      },
      onError: (e) => setStatus(e.message),
    });

    (async () => {
      await world.init(mountRef.current!);
      if (disposed) return;
      try {
        await net.connect({ userId, name, spriteUrl, sessionId });
        // Respect telemetry consent (§2, §13): only collect if the user opted in.
        if (telemetryConsent) tele.start();
      } catch (err) {
        setStatus("Could not reach the world server. Is @echo/realtime running on :2567?");
      }
    })();

    return () => {
      disposed = true;
      tele.stop();
      net.leave();
      world.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Space/E to talk; Esc to leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc must end a conversation even while the chat input is focused — handle it first.
      if (e.key === "Escape" && convoRef.current) {
        e.preventDefault();
        leaveConvo();
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "e" || e.key === " ") && nearbyRef.current && !convoRef.current) {
        e.preventDefault();
        startInteraction();
      } else if ((e.key === "o" || e.key === "O") && portalNearRef.current && !convoRef.current) {
        e.preventDefault();
        enterVenue();
      }
    };
    window.addEventListener("keydown", onKey);
    // Session-end debrief (§11): fire-and-forget on the way out (keepalive).
    const onUnload = () => {
      const body = JSON.stringify({
        userId: uidRef.current,
        sessionId: sessionIdRef.current,
        digest: buildDigest("session"),
      });
      navigator.sendBeacon?.("/api/narrate", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInteraction]);

  function leaveConvo() {
    if (interactionRef.current) netRef.current?.interactEnd(interactionRef.current);
    interactionRef.current = null;
    setConvo(null);
  }

  function bucketFor(): string {
    const userLines = convoRef.current?.lines.filter((l) => l.who === "you").length ?? 0;
    return userLines === 0 ? "first_greeting" : "smalltalk";
  }

  function sendText(text: string, fromAgent = false) {
    const iid = interactionRef.current;
    if (!text.trim() || !iid) return;
    const latencyMs = inputFocusedAt.current ? Date.now() - inputFocusedAt.current : undefined;
    setConvo((c) => (c ? { ...c, lines: [...c.lines, { who: "you", name: "You", text }] } : c));
    netRef.current?.chat(iid, text, latencyMs, editsRef.current);
    teleRef.current?.emit("reply_latency", { ms: latencyMs ?? 0, edits: editsRef.current, agent: fromAgent });
    // accumulate grounded narrator signals (only human-typed replies, not agent ones)
    if (!fromAgent) {
      if (latencyMs) digestRef.current.replyMs.push(latencyMs);
      digestRef.current.edits += editsRef.current;
    }
    // bump engagement with the current counterpart (feeds outcome surfacing)
    const target = convoTargetRef.current;
    if (target) {
      const m = metRef.current.get(target.id);
      if (m) m.turns += 1;
    }
    setDraft("");
    editsRef.current = 0;
    inputFocusedAt.current = Date.now();
  }

  function sendChat() {
    const text = draft.trim();
    const editedFrom = editFromRef.current;
    sendText(text);
    // If this was an edit of an agent proposal, it's a rich label: the user preferred
    // their version over the agent's (preference pair + disagreement, §9.3/§9.4/§9.7).
    if (editedFrom && text && editedFrom !== text) {
      const target = convoTargetRef.current;
      sendFeedback({
        userId: uid,
        bucket: bucketFor(),
        confidence: 0.5,
        agreed: false,
        chosen: text,
        rejected: editedFrom,
        context: target ? `talking with ${target.name}` : "",
      });
    }
    editFromRef.current = null;
  }

  // ── agency (§10): the agent proposes the user's reply ───────────────────────
  async function askEcho() {
    const target = convoTargetRef.current;
    if (!target || proposing) return;
    setProposing(true);
    try {
      const lastThem = [...(convoRef.current?.lines ?? [])].reverse().find((l) => l.who === "them");
      const turn = await proposeReply(
        uid,
        `talking with ${target.name}`,
        lastThem?.text ?? "(they're waiting for you to speak)",
        bucketFor(),
        "low",
      );
      // If the agent has earned autonomy here, it just acts (supervised/auto).
      if (turn.decision === "auto") {
        sendText(turn.action, true);
        await sendFeedback({ userId: uid, bucket: bucketFor(), confidence: turn.confidence, agreed: true, context: `talking with ${target.name}` });
        setNarration(`your echo answered for you — it's earned that here (${turn.level}).`);
        setTimeout(() => setNarration(null), 5000);
      } else {
        setProposal(turn); // copilot/ask → human reviews
      }
    } finally {
      setProposing(false);
    }
  }

  async function approveProposal() {
    const turn = proposal;
    const target = convoTargetRef.current;
    if (!turn || !target) return;
    const bucket = bucketFor();
    sendText(turn.action, true);
    setProposal(null);
    await sendFeedback({ userId: uid, bucket, confidence: turn.confidence, agreed: true, context: `talking with ${target.name}` });
  }

  function editProposal() {
    if (!proposal) return;
    editFromRef.current = proposal.action;
    setDraft(proposal.action);
    setProposal(null);
  }

  async function rejectProposal() {
    const turn = proposal;
    const target = convoTargetRef.current;
    if (!turn || !target) return;
    setProposal(null);
    await sendFeedback({
      userId: uid,
      bucket: bucketFor(),
      confidence: turn.confidence,
      agreed: false,
      rejected: turn.action,
      context: `talking with ${target.name}`,
    });
  }

  // Grounded debrief (§11): runs AFTER an encounter/session, never live. Stays silent
  // unless the signals support something specific.
  function buildDigest(mode: "encounter" | "session", counterpart?: { name: string; turns: number }) {
    const d = digestRef.current;
    const replies = d.replyMs.filter((m) => m > 0);
    return {
      mode,
      counterpart,
      approaches: d.approaches,
      avoids: d.avoids,
      dwell: d.dwell,
      revisits: d.revisits,
      edits: d.edits,
      avgReplyMs: replies.length ? Math.round(replies.reduce((a, b) => a + b, 0) / replies.length) : undefined,
      maxReplyMs: replies.length ? Math.max(...replies) : undefined,
      metNames: [...metRef.current.values()].map((m) => m.name),
      traits: [],
    };
  }

  async function narrateNow(mode: "encounter" | "session", counterpart?: { name: string; turns: number }) {
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: uidRef.current, sessionId: sessionIdRef.current, digest: buildDigest(mode, counterpart) }),
        keepalive: true, // allow the session debrief to fire during unload
      });
      const data = (await res.json()) as { text: string; audioDataUrl: string | null; silent: boolean };
      if (data.silent || !data.text) return; // narrator stays silent — that's by design
      setNarration(data.text);
      speak(data.text, data.audioDataUrl);
      setTimeout(() => setNarration(null), 9000);
    } catch {
      /* narration is best-effort */
    }
  }

  function speak(text: string, audioDataUrl: string | null) {
    if (!voiceConsentRef.current) return; // respect voice consent (§13)
    if (audioDataUrl) {
      new Audio(audioDataUrl).play().catch(() => {});
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-grass">
      <div ref={mountRef} className="absolute inset-0" />
      {/* Atmospheric vignette over the world (below the UI panels in DOM order). */}
      <div className="world-vignette absolute inset-0" />

      {status && (
        <div className="panel absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-6 py-4 font-mono text-sm text-parchment">
          {status}
        </div>
      )}

      {/* HUD */}
      <div className="panel absolute left-3 top-3 rounded px-3 py-2 font-mono text-[11px] text-parchment/80">
        <div className="glow-echo font-bold text-echo">ECHO — first day</div>
        <div>WASD / arrows to move</div>
        <div>E or Space to talk · Esc to leave</div>
      </div>

      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-20 flex gap-2 font-mono text-[11px]">
        <button
          onClick={() => { setShowEcho((v) => !v); setShowOutcomes(false); }}
          className="panel rounded px-3 py-2 text-parchment hover:text-echo"
        >
          your echo
        </button>
        <button
          onClick={() => { setShowOutcomes((v) => !v); setShowEcho(false); }}
          className="panel rounded px-3 py-2 text-parchment hover:text-echo"
        >
          connections{metCount > 0 ? ` (${metCount})` : ""}
        </button>
        <a href="/account" className="panel rounded px-3 py-2 text-parchment hover:text-echo">
          data
        </a>
      </div>

      {showEcho && uid && <EchoPanel userId={uid} onClose={() => setShowEcho(false)} />}
      {showOutcomes && uid && (
        <OutcomesPanel
          userId={uid}
          onClose={() => setShowOutcomes(false)}
          met={[...metRef.current.values()].map((m): MetPerson => ({ ...m, reason: reasonFor(m.turns) }))}
        />
      )}

      {/* Proximity prompt */}
      {nearby && !convo && (
        <button
          onClick={startInteraction}
          className="panel absolute bottom-24 left-1/2 -translate-x-1/2 rounded px-4 py-2 font-mono text-sm text-parchment hover:text-echo"
        >
          Talk to <span className="font-bold text-echo">{nearby.name}</span> — press E
        </button>
      )}

      {/* Portal prompt — only when not already talking to someone */}
      {portalNear && !nearby && !convo && (
        <button
          onClick={enterVenue}
          className="panel absolute bottom-24 left-1/2 -translate-x-1/2 rounded px-4 py-2 font-mono text-sm text-parchment hover:text-echo"
        >
          Step through the portal — press <span className="font-bold text-echo">O</span>
        </button>
      )}

      {/* Fade-to-black portal transition */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 bg-black transition-opacity duration-700 ${
          entering ? "opacity-100" : "opacity-0"
        }`}
      />
      {entering && (
        <div className="absolute inset-0 z-50 flex items-center justify-center font-mono text-sm italic text-parchment/80">
          stepping through…
        </div>
      )}

      {/* Conversation */}
      {convo && (
        <div className="panel absolute bottom-4 left-1/2 w-[min(560px,92vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-echo">{convo.name}</span>
            <button onClick={leaveConvo} className="text-xs text-parchment/50 hover:text-parchment">
              leave (Esc)
            </button>
          </div>
          <div className="mb-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {convo.lines.length === 0 && (
              <div className="text-parchment/40">Say something…</div>
            )}
            {convo.lines.map((l, i) => (
              <div key={i} className={l.who === "you" ? "text-parchment" : "text-echo"}>
                <span className="opacity-60">{l.who === "you" ? "you" : l.name}:</span> {l.text}
              </div>
            ))}
          </div>
          {/* Co-pilot proposal (§10): the agent drafts the user's reply; the human
              approves/edits/rejects — each verdict is a label feeding the learner. */}
          {proposal && (
            <div className="mb-2 rounded border-2 border-echo/40 bg-echo/10 p-2 text-sm">
              <div className="mb-1 flex items-center gap-2 text-[10px] text-parchment/60">
                <span className="rounded bg-echo/30 px-1 font-bold text-echo">your echo suggests</span>
                <span>{proposal.decision}</span>
                <span>· conf {Math.round(proposal.p_hat * 100)}% / need {Math.round(proposal.tau * 100)}%</span>
                {proposal.explored && <span className="text-yellow-300">· exploring</span>}
              </div>
              <div className="mb-1 text-parchment">&ldquo;{proposal.action}&rdquo;</div>
              <div className="mb-2 text-[10px] italic text-parchment/50">why: {proposal.rationale}</div>
              <div className="flex gap-2">
                <button onClick={approveProposal} className="rounded bg-echo px-2 py-1 text-xs font-bold text-ink">approve</button>
                <button onClick={editProposal} className="rounded border border-echo/40 px-2 py-1 text-xs">edit</button>
                <button onClick={rejectProposal} className="rounded border border-echo/40 px-2 py-1 text-xs text-parchment/60">reject</button>
              </div>
            </div>
          )}

          <div className="mb-2">
            <button
              onClick={askEcho}
              disabled={proposing || !!proposal}
              className="rounded border border-echo/40 px-2 py-1 text-[11px] text-echo hover:bg-echo/10 disabled:opacity-40"
            >
              {proposing ? "your echo is thinking…" : "↪ let my echo answer"}
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={draft}
              onFocus={() => {
                if (!inputFocusedAt.current) inputFocusedAt.current = Date.now();
              }}
              onChange={(e) => {
                if (e.target.value.length < draft.length) editsRef.current++;
                setDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
              autoFocus
              placeholder="type…"
              className="flex-1 rounded border-2 border-echo/30 bg-ink px-2 py-1 text-sm text-parchment outline-none focus:border-echo"
            />
            <button onClick={sendChat} className="rounded bg-echo px-3 py-1 text-sm font-bold text-ink">
              say
            </button>
          </div>
        </div>
      )}

      {/* Narrator caption (debrief) */}
      {narration && (
        <div className="panel absolute bottom-4 right-4 max-w-xs rounded-lg p-3 font-mono text-xs italic text-parchment/90">
          <span className="text-echo">narrator</span> · {narration}
        </div>
      )}
    </div>
  );
}
