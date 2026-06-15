"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { config } from "@/lib/config";
import { PixiWorld } from "@/game/PixiWorld";
import { NetClient } from "@/game/net";
import { TelemetryCollector } from "@/game/telemetry";
import { proposeReply, sendFeedback, requestConnectionAnalysis, type AgentTurn, type ConnectionAnalysis } from "@/lib/agent";
import EchoPanel from "@/components/EchoPanel";
import OutcomesPanel, { type MetPerson } from "@/components/OutcomesPanel";
import RecognitionMeter from "@/components/RecognitionMeter";
import EchoActivityPanel, { type EchoAct } from "@/components/EchoActivityPanel";
import { useEcho } from "@/lib/useEcho";
import { markFunnel } from "@/lib/funnel";
import type { InteractTurnPayload } from "@echo/shared";

const prettyBucket = (b: string) => b.replace(/_/g, " ");

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
  const [offline, setOffline] = useState(false);
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
  const metRef = useRef<Map<string, { id: string; name: string; turns: number; auto?: boolean }>>(new Map());
  const [metCount, setMetCount] = useState(0);
  // Full transcripts per counterpart, accumulated across the session — fed to the real
  // end-of-day connection analysis (and stored as training data) instead of a turn-count guess.
  const transcriptsRef = useRef<Map<string, Line[]>>(new Map());
  // Grounded, conversation-specific reads keyed by counterpart id, cached by turn count so
  // reopening the panel doesn't re-hit the model when nothing changed.
  const [connAnalyses, setConnAnalyses] = useState<Record<string, ConnectionAnalysis & { turns: number }>>({});
  const [analyzing, setAnalyzing] = useState(false);

  // ── recognition + handover (the learning made felt; the echo taking over) ──────
  // A transient, in-tone acknowledgement shown near the meter when learning genuinely moves.
  const [recognitionBeat, setRecognitionBeat] = useState<string | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showBeat(text: string) {
    setRecognitionBeat(text);
    if (beatTimer.current) clearTimeout(beatTimer.current);
    beatTimer.current = setTimeout(() => setRecognitionBeat(null), 6000);
  }
  // The earned graduation moment (a context reaching `auto`) — the on-ramp to the handover.
  const [gradMoment, setGradMoment] = useState<{ bucket: string } | null>(null);
  // Autonomous mode: the echo wanders and converses on its own in a promoted context.
  const [handoverOn, setHandoverOn] = useState(false);
  const handoverOnRef = useRef(false);
  handoverOnRef.current = handoverOn;
  const handoverBucketRef = useRef<string>("");
  const [echoStatus, setEchoStatus] = useState<string | null>(null); // banner while wandering
  const [acts, setActs] = useState<EchoAct[]>([]); // autonomous utterances (rationale + veto)
  const [showActs, setShowActs] = useState(false);
  // Live, in-conversation handover orchestration state (refs to survive network callbacks).
  const autoConvoRef = useRef(false);
  const autoTurnsRef = useRef(0);
  const autoTargetRef = useRef<{ id: string; name: string } | null>(null);
  const autoMetRef = useRef(0);
  const autoLoopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The shared persona poll: drives the meter, the in-the-moment beats, and graduation.
  const echo = useEcho(uid, {
    onTraitResolved: (trait) => showBeat(`your echo is starting to see you as ${trait}.`),
    onPromotion: (bucket, level) => {
      if (level === "auto") setGradMoment({ bucket });
      else showBeat(`your echo can act in ${prettyBucket(bucket)} now — you'll still see everything.`);
    },
  });
  const echoRef = useRef(echo);
  echoRef.current = echo;
  const handoverAvailable = echo.autoBuckets.length > 0;

  // Cold-start orientation + discoverability + touch awareness.
  const [orientDismissed, setOrientDismissed] = useState(false);
  const [usedEcho, setUsedEcho] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  }, []);

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
      onNearbyChange: (t) => {
        setNearby(t);
        if (t) markFunnel(uidRef.current, "first_nearby");
      },
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
        markFunnel(uidRef.current, "world_enter");
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
          metRef.current.set(p.target.id, { id: p.target.id, name: p.target.name, turns: 0, auto: autoConvoRef.current });
          setMetCount(metRef.current.size);
        }
        tele.emit("interaction_start", { targetId: p.target.id });
        if (autoConvoRef.current && handoverOnRef.current) {
          // The echo opens the conversation itself.
          autoMetRef.current += 1;
          autoLoopTimer.current = setTimeout(() => autoEchoTurnRef.current("(you walk up to them)"), 600);
        } else {
          markFunnel(uidRef.current, "first_conversation");
        }
      },
      onInteractTurn: (p: InteractTurnPayload) => {
        setConvo((c) => (c ? { ...c, lines: [...c.lines, { who: "them", name: p.speakerName, text: p.text }] } : c));
        if (autoConvoRef.current && handoverOnRef.current) {
          const npcText = p.text;
          if (autoTurnsRef.current < MAX_AUTO_TURNS) {
            autoLoopTimer.current = setTimeout(() => autoEchoTurnRef.current(npcText), 1600);
          } else {
            autoLoopTimer.current = setTimeout(() => {
              if (interactionRef.current) netRef.current?.interactEnd(interactionRef.current);
            }, 1600);
          }
        }
      },
      onInteractClosed: () => {
        const wasAuto = autoConvoRef.current;
        const t = convoTargetRef.current;
        const counterpart = t ? { name: t.name, turns: metRef.current.get(t.id)?.turns ?? 0 } : undefined;
        // Keep the transcript (appending if we've spoken with them before) for real analysis.
        if (t && convoRef.current && convoRef.current.lines.length) {
          const prev = transcriptsRef.current.get(t.id) ?? [];
          transcriptsRef.current.set(t.id, [...prev, ...convoRef.current.lines]);
        }
        interactionRef.current = null;
        convoTargetRef.current = null;
        setConvo(null);
        setProposal(null);
        tele.emit("interaction_end", {});
        if (wasAuto) {
          // The echo's own encounter: continue the loop; the activity feed + recap cover it
          // (skip the human-attributed narrator debrief).
          setAutoConvoActive(false);
          if (handoverOnRef.current) autoLoopTimer.current = setTimeout(() => approachNextRef.current(), 1800);
        } else {
          narrateNow("encounter", counterpart);
        }
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
        setStatus("");
        setOffline(true);
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
      // Sovereignty: any move/act/Esc while the echo is wandering reclaims control instantly.
      if (handoverOnRef.current) {
        const k = e.key.toLowerCase();
        if (["escape", "w", "a", "s", "d", "e", " ", "o", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
          stopHandoverRef.current();
          return; // movement keys still reach the world's own listener
        }
      }
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
    markFunnel(uid, "first_let_echo_answer");
    setUsedEcho(true);
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
    markFunnel(uid, "first_feedback");
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
    markFunnel(uid, "first_feedback");
    await sendFeedback({
      userId: uid,
      bucket: bucketFor(),
      confidence: turn.confidence,
      agreed: false,
      rejected: turn.action,
      context: `talking with ${target.name}`,
    });
  }

  // ── the handover (§10): in a promoted context, the echo acts on its own ────────
  // It walks up to people and converses via the real /agent/turn gate, while you watch or
  // idle. Every act is surfaced with its rationale and a "that wasn't me" veto; the human
  // stays sovereign — this is delegation you can revoke, not loss of control.
  const MAX_AUTO_TURNS = 3;
  const [autoConvo, setAutoConvo] = useState(false);

  function setAutoConvoActive(v: boolean) {
    autoConvoRef.current = v;
    setAutoConvo(v);
  }

  /** Nearest NPC we didn't just leave — who the echo approaches next. */
  function pickNextNpc(): { id: string; name: string } | null {
    const world = worldRef.current;
    if (!world) return null;
    const me = world.getSelfTile();
    const npcs = world.listNpcs();
    if (!npcs.length) return null;
    const recent = autoTargetRef.current?.id;
    const sorted = npcs
      .map((n) => ({ ...n, d: Math.hypot(n.x - me.x, n.y - me.y) }))
      .sort((a, b) => a.d - b.d);
    const choice = sorted.find((n) => n.id !== recent) ?? sorted[0];
    return { id: choice.id, name: choice.name };
  }

  function startHandover() {
    const bucket = echoRef.current.autoBuckets[0];
    if (!bucket) return;
    handoverBucketRef.current = bucket;
    setGradMoment(null);
    setHandoverOn(true);
    handoverOnRef.current = true;
    autoMetRef.current = 0;
    markFunnel(uidRef.current, "handover_start");
    setEchoStatus(`your echo is carrying ${prettyBucket(bucket)} on its own — wandering and meeting people for you.`);
    approachNext();
  }

  function stopHandover() {
    setHandoverOn(false);
    handoverOnRef.current = false;
    if (autoLoopTimer.current) clearTimeout(autoLoopTimer.current);
    worldRef.current?.setAutoWalk(null);
    if (autoConvoRef.current && interactionRef.current) netRef.current?.interactEnd(interactionRef.current);
    setAutoConvoActive(false);
    setEchoStatus(null);
    const met = autoMetRef.current;
    if (met > 0) {
      showBeat(`your echo met ${met} ${met === 1 ? "person" : "people"} while it wandered — see who's worth meeting yourself.`);
      runConnectionAnalysis(); // ready the payoff
    }
  }

  function approachNext() {
    if (!handoverOnRef.current) return;
    if (convoRef.current && !autoConvoRef.current) return; // never hijack a manual chat
    const target = pickNextNpc();
    if (!target) {
      autoLoopTimer.current = setTimeout(approachNext, 1500); // nobody near — wait
      return;
    }
    autoTargetRef.current = target;
    steerToTarget();
  }

  function steerToTarget() {
    if (!handoverOnRef.current) return;
    const world = worldRef.current;
    const target = autoTargetRef.current;
    if (!world || !target) return;
    const npc = world.listNpcs().find((n) => n.id === target.id);
    if (npc) world.setAutoWalk({ x: npc.x, y: npc.y }); // they wander; keep aiming
    const nearbyId = world.getNearbyId();
    if (nearbyId) {
      world.setAutoWalk(null);
      setAutoConvoActive(true);
      autoTurnsRef.current = 0;
      netRef.current?.interactStart(nearbyId); // → onInteractOpened kicks the first echo turn
      return;
    }
    autoLoopTimer.current = setTimeout(steerToTarget, 350);
  }

  /** One autonomous turn: the echo proposes and — only where it's truly earned (decision
   *  `auto`) — speaks. It never self-confirms agreement; silence is not consent. The sole
   *  feedback signal is the human's veto. */
  async function autoEchoTurn(userMessage: string) {
    if (!handoverOnRef.current || !autoConvoRef.current) return;
    const target = convoTargetRef.current;
    const bucket = handoverBucketRef.current;
    if (!target || !bucket) return;
    try {
      const turn = await proposeReply(uidRef.current, `talking with ${target.name}`, userMessage, bucket, "low");
      if (!handoverOnRef.current || !autoConvoRef.current) return; // stopped mid-flight
      if (turn.decision === "auto") {
        sendText(turn.action, true);
        autoTurnsRef.current += 1;
        const act: EchoAct = {
          id: `act_${performance.now().toFixed(0)}_${Math.random().toString(36).slice(2, 6)}`,
          npcName: target.name,
          text: turn.action,
          rationale: turn.rationale,
          bucket,
          context: `talking with ${target.name}`,
        };
        setActs((a) => [...a, act]);
      } else {
        setEchoStatus(`your echo held back — it hasn't earned ${prettyBucket(bucket)} here.`);
        endAutoEncounter();
      }
    } catch {
      endAutoEncounter();
    }
  }

  function endAutoEncounter() {
    if (interactionRef.current) netRef.current?.interactEnd(interactionRef.current);
    // onInteractClosed continues the loop (and resets convo state).
  }

  /** The human reclaims an autonomous action: "that wasn't me" → demote signal (§9.7). */
  async function vetoAct(act: EchoAct) {
    setActs((list) => list.map((a) => (a.id === act.id ? { ...a, vetoed: true } : a)));
    markFunnel(uidRef.current, "first_feedback");
    await sendFeedback({
      userId: uidRef.current,
      bucket: act.bucket,
      confidence: 0.5,
      agreed: false,
      rejected: act.text,
      context: act.context,
    });
    showBeat(`noted — that wasn't you. Your echo will step back from ${prettyBucket(act.bucket)}.`);
  }

  // Keep the orchestration callable from the mount-time network callbacks.
  const autoEchoTurnRef = useRef(autoEchoTurn);
  autoEchoTurnRef.current = autoEchoTurn;
  const approachNextRef = useRef(approachNext);
  approachNextRef.current = approachNext;
  const stopHandoverRef = useRef(stopHandover);
  stopHandoverRef.current = stopHandover;

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

  // Real end-of-day read: send the actual transcripts of the most-engaged people to the
  // server for a grounded, conversation-specific analysis. Cached by turn count so toggling
  // the panel open/closed doesn't re-hit the model when nothing has changed.
  async function runConnectionAnalysis() {
    const people = [...metRef.current.values()]
      .sort((a, b) => b.turns - a.turns)
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        name: m.name,
        turns: m.turns,
        lines: (transcriptsRef.current.get(m.id) ?? []).map((l) => ({ who: l.who, text: l.text })),
      }));
    if (people.length === 0) return;
    const need = people.filter((p) => connAnalyses[p.id]?.turns !== p.turns);
    if (need.length === 0) return; // already analyzed at this engagement level
    setAnalyzing(true);
    try {
      const res = await requestConnectionAnalysis(uidRef.current, sessionIdRef.current, people);
      if (res.length) {
        setConnAnalyses((prev) => {
          const next = { ...prev };
          for (const a of res) {
            const p = people.find((x) => x.id === a.id);
            next[a.id] = { ...a, turns: p?.turns ?? 0 };
          }
          return next;
        });
      }
    } finally {
      setAnalyzing(false);
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

      {offline ? (
        <div className="panel absolute left-1/2 top-1/2 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg px-6 py-5 text-center font-mono text-sm text-parchment">
          <div className="glow-echo mb-1 text-base font-bold text-echo">The world is resting</div>
          <p className="mb-4 leading-relaxed text-parchment/70">
            We couldn&apos;t reach the live world right now — it may be waking up. Try again in a moment.
          </p>
          <div className="flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded bg-echo px-4 py-2 font-bold text-ink">
              Try again
            </button>
            <a href="/" className="rounded border border-echo/40 px-4 py-2 text-parchment/80 hover:text-parchment">
              Home
            </a>
          </div>
        </div>
      ) : status ? (
        <div className="panel absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-6 py-4 font-mono text-sm text-parchment">
          {status}
        </div>
      ) : null}

      {/* HUD */}
      <div className="panel absolute left-3 top-3 rounded px-3 py-2 font-mono text-[11px] text-parchment/80">
        <div className="glow-echo font-bold text-echo">ECHO — first day</div>
        <div>{touch ? "tap or drag to move" : "WASD / arrows to move"}</div>
        <div>{touch ? "tap someone to talk" : "E or Space to talk · Esc to leave"}</div>
      </div>

      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-20 flex gap-2 font-mono text-[11px]">
        <button
          onClick={() => { setShowEcho((v) => !v); setShowOutcomes(false); setShowActs(false); }}
          className="panel rounded px-3 py-2 text-parchment hover:text-echo"
        >
          your echo
        </button>
        <button
          onClick={() => {
            const open = !showOutcomes;
            setShowOutcomes(open);
            setShowEcho(false);
            setShowActs(false);
            if (open) runConnectionAnalysis(); // real read of the actual conversations
          }}
          className="panel rounded px-3 py-2 text-parchment hover:text-echo"
        >
          connections{metCount > 0 ? ` (${metCount})` : ""}
        </button>
        {acts.length > 0 && (
          <button
            onClick={() => { setShowActs((v) => !v); setShowEcho(false); setShowOutcomes(false); }}
            className="panel rounded px-3 py-2 text-parchment hover:text-echo"
          >
            echo log ({acts.length})
          </button>
        )}
        <a href="/account" className="panel rounded px-3 py-2 text-parchment hover:text-echo">
          data
        </a>
      </div>

      {/* Recognition meter — the always-glanceable "your echo knows you" signal. */}
      {uid && (
        <>
          <RecognitionMeter
            recognition={echo.recognition}
            parts={echo.parts}
            offline={echo.offline}
            loaded={echo.loaded}
            onOpen={() => { setShowEcho((v) => !v); setShowOutcomes(false); setShowActs(false); }}
          />
          {recognitionBeat && (
            <div className="pointer-events-none absolute left-1/2 top-[88px] z-20 w-[min(280px,80vw)] -translate-x-1/2 text-center font-mono text-[11px] italic text-echo/90 echo-rise">
              {recognitionBeat}
            </div>
          )}
        </>
      )}

      {showEcho && uid && (
        <EchoPanel snap={echo.snap} parts={echo.parts} offline={echo.offline} onClose={() => setShowEcho(false)} />
      )}
      {showActs && <EchoActivityPanel acts={acts} onVeto={vetoAct} onClose={() => setShowActs(false)} />}
      {showOutcomes && uid && (
        <OutcomesPanel
          userId={uid}
          onClose={() => setShowOutcomes(false)}
          met={[...metRef.current.values()].map((m): MetPerson => ({ ...m, reason: reasonFor(m.turns) }))}
          analyses={connAnalyses}
          analyzing={analyzing}
        />
      )}

      {/* Cold-start orientation (M2): re-plant the hook, give one soft pull, then get out of
          the way. Hidden the moment the first real conversation happens (metCount > 0). */}
      {uid && !offline && metCount === 0 && !orientDismissed && !convo && !handoverOn && (
        <div className="panel echo-rise absolute bottom-24 left-1/2 z-10 w-[min(440px,92vw)] -translate-x-1/2 rounded-lg p-4 text-center font-mono text-parchment">
          <p className="mb-2 text-sm leading-relaxed text-parchment/85">
            It&apos;s your first day. No one here knows you — <span className="text-echo">not even your echo</span>.
            It learns only from what you do.
          </p>
          <p className="mb-3 text-xs text-parchment/60">
            Someone is nearby. {touch ? "Tap toward them" : "Walk over"} and be seen — watch the meter
            above begin to fill.
          </p>
          <button
            onClick={() => setOrientDismissed(true)}
            className="text-[11px] text-parchment/50 underline-offset-2 hover:text-parchment hover:underline"
          >
            I&apos;ll find my own way
          </button>
        </div>
      )}

      {/* The graduation moment (M4) — calm, earned; also the on-ramp to the handover (B1). */}
      {gradMoment && (
        <div className="panel graduation-rise absolute left-1/2 top-1/3 z-40 w-[min(440px,92vw)] -translate-x-1/2 rounded-lg p-5 text-center font-mono text-parchment">
          <div className="glow-echo mb-2 text-base font-bold text-echo">your echo has earned this</div>
          <p className="mb-4 text-sm leading-relaxed text-parchment/80">
            Enough of its calls have matched yours that it can carry{" "}
            <span className="text-echo">{prettyBucket(gradMoment.bucket)}</span> on its own now. Want to let it
            take the lead? You can watch, and take back control anytime.
          </p>
          <div className="flex justify-center gap-2">
            <button onClick={startHandover} className="rounded bg-echo px-4 py-2 text-sm font-bold text-ink">
              let it take the lead
            </button>
            <button onClick={() => setGradMoment(null)} className="rounded border border-echo/40 px-4 py-2 text-sm text-parchment/80">
              not yet
            </button>
          </div>
        </div>
      )}

      {/* Handover banner — visible while the echo wanders between people (sovereign stop). */}
      {handoverOn && !autoConvo && (
        <div className="panel absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 font-mono text-xs text-parchment">
          <span className="echo-pulse text-echo" aria-hidden>●</span>
          <span>{echoStatus ?? "your echo is acting on your behalf…"}</span>
          <button onClick={stopHandover} className="rounded border border-echo/40 px-2 py-1 text-parchment/80 hover:text-parchment">
            take back control
          </button>
        </div>
      )}

      {/* A quiet on-ramp once any context is earned, if the user dismissed the moment. */}
      {handoverAvailable && !handoverOn && !gradMoment && !convo && (
        <button
          onClick={startHandover}
          className="panel absolute bottom-4 right-4 z-20 rounded-lg px-3 py-2 font-mono text-[11px] text-echo hover:bg-echo/10"
        >
          ↪ let your echo wander
        </button>
      )}

      {/* Proximity prompt */}
      {nearby && !convo && !handoverOn && (
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
            <span className="font-bold text-echo">
              {convo.name}
              {autoConvo && <span className="ml-2 rounded bg-echo/25 px-1 text-[10px] font-normal text-echo">your echo is speaking</span>}
            </span>
            <button
              onClick={autoConvo ? stopHandover : leaveConvo}
              className="text-xs text-parchment/50 hover:text-parchment"
            >
              {autoConvo ? "stop (Esc)" : "leave (Esc)"}
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
          {autoConvo ? (
            /* The echo is driving this conversation itself — read-only, revocable. */
            <div className="flex items-center justify-between rounded border border-echo/30 bg-echo/5 px-2 py-1.5 text-[11px] text-parchment/70">
              <span><span className="text-echo">your echo</span> is carrying this for you…</span>
              <button onClick={stopHandover} className="rounded border border-echo/40 px-2 py-0.5 text-parchment/80 hover:text-parchment">
                take back control
              </button>
            </div>
          ) : (
            <>
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

              {/* Discoverability (M3): first-timers learn the core action *teaches* the echo. */}
              {!usedEcho && !proposal && (
                <div className="mb-1 text-[10px] italic text-parchment/45">
                  tip: let your echo try a reply — every approve / edit / reject teaches it who you are.
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
            </>
          )}
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
