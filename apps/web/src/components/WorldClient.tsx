"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { config } from "@/lib/config";
import { PixiWorld } from "@/game/PixiWorld";
import { NetClient } from "@/game/net";
import { TelemetryCollector, LocomotionSampler } from "@/game/telemetry";
import { proposeReply, sendFeedback, requestConnectionAnalysis, type AgentTurn, type ConnectionAnalysis } from "@/lib/agent";
import EchoPanel from "@/components/EchoPanel";
import LiveRoster from "@/components/LiveRoster";
import OutcomesPanel, { type MetPerson } from "@/components/OutcomesPanel";
import RecognitionMeter from "@/components/RecognitionMeter";
import EchoActivityPanel, { type EchoAct } from "@/components/EchoActivityPanel";
import DuskReading, { type DuskReadingData } from "@/components/DuskReading";
import { useEcho } from "@/lib/useEcho";
import { resolveUserId } from "@/lib/identity";
import { markFunnel, telemetryConsented } from "@/lib/funnel";
import { useDay, type DuskReason } from "@/lib/useDay";
import type { InteractTurnPayload, EntitySnapshot, BehavioralEvent, TelemetryEvent, IslandDayState } from "@echo/shared";
import {
  nearestSlot, slotDistance, clampToMap, oceanIslandCenter, OCEAN_ISLAND_R, SURVIVAL,
  FLOW0_AFFORDANCES, FLOW0_FIRST_MOVE, FLOW0_EGGS, buildFlow0Event,
  type Flow0Affordance,
} from "@echo/shared";
import { generateOcean } from "@/game/tilemap";

const prettyBucket = (b: string) => b.replace(/_/g, " ");

// ── the survival day's stations (blueprint P1) — client-local entities (role "day") on YOUR
//    island in the one ocean, beside the Flow-0 affordances. The five verbs live here: forage
//    (earn), read (learn), rest (leisure), the grain fork, the trap-line wager, the campfire.
//    Sail/social live in the world itself (travel stand, other players). Offsets avoid f0_*'s. ──
type DayCat = "earn" | "learn" | "social" | "leisure" | "build";
interface DayStation {
  refId: string;
  sprite: string;
  dx: number;
  dy: number;
  name: string;
  kind: "grain" | "wager" | "dwell" | "end" | "raft";
  cat?: DayCat;
  hint?: string;
}
const DAY_STATIONS: DayStation[] = [
  { refId: "day_grain", sprite: "proc:grain_sprout", dx: -4, dy: -4, name: "a sprout", kind: "grain" },
  // The raft is the ONE gate in the whole game, and it is self-imposed (blueprint I.3): the sea
  // opens only after you choose to begin it. Never building it (K4) is first-class data (Law 2).
  { refId: "day_raft", sprite: "proc:raft", dx: -7, dy: -3, name: "an unfinished raft", kind: "raft", cat: "build" },
  { refId: "day_bush", sprite: "proc:berry_bush", dx: 5, dy: -3, name: "a berry bush", kind: "dwell", cat: "earn", hint: "you forage — it feeds you while the light lasts" },
  { refId: "day_cairn", sprite: "proc:book_cairn", dx: -4, dy: 5, name: "a cairn of books", kind: "dwell", cat: "learn", hint: "you read the island, the tides, yourself" },
  { refId: "day_bedroll", sprite: "proc:bedroll", dx: 5, dy: 4, name: "a bedroll", kind: "dwell", cat: "leisure", hint: "you rest; strength returns as the day passes" },
  { refId: "day_tide", sprite: "proc:tidepool", dx: 0, dy: 7, name: "the trap line", kind: "wager" },
  { refId: "day_campfire", sprite: "proc:campfire", dx: -2, dy: 2, name: "a campfire", kind: "end" },
];
const DAY_BY_ID = new Map(DAY_STATIONS.map((s) => [s.refId, s]));
/** The tide wager's two sides (mirrors lib/island-day DAY_BET; local so the world stays lean). */
const DAY_WAGER = {
  safe: { expectedValue: 1, variance: 0.1 },
  risky: { expectedValue: 1.4, variance: 0.9 },
  stake: 3,
};

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

/** Shallow id-set equality so the live roster only re-renders when the set actually changes. */
function sameIds(a: { id: string }[], b: { id: string }[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a.map((x) => x.id));
  return b.every((x) => s.has(x.id));
}

export default function WorldClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PixiWorld | null>(null);
  // ── Flow 0 own-island layer (world-unify §3): the solitary baseline lives on YOUR island in the
  //    one ocean — client-local affordance entities (role "flow0", not room state) that emit SOLO
  //    cues (audience 0, private, no counterpart). Other players are atmosphere until Tier 1. ──
  const f0EntsRef = useRef<EntitySnapshot[]>([]);
  const f0ByIdRef = useRef<Map<string, Flow0Affordance>>(new Map());
  const f0DoneRef = useRef<Set<string>>(new Set());
  const f0SpawnAtRef = useRef(0);
  const firstMoveDoneRef = useRef(false);
  // ── the survival day layer (blueprint P1): stations on your island + the three clocks ──
  const dayEntsRef = useRef<EntitySnapshot[]>([]);
  const dayChoicesRef = useRef<{ forkKey: string; option: string; dayIndex: number; detail?: string }[]>([]);
  const daySeenAtRef = useRef<Record<string, number>>({});
  const dayDwellRef = useRef<Record<DayCat, number>>({ earn: 0, learn: 0, social: 0, leisure: 0, build: 0 });
  const dayNearSinceRef = useRef<{ cat: DayCat | null; t: number }>({ cat: null, t: 0 });
  const betWonRef = useRef<boolean | null>(null);
  const dayStartAtRef = useRef(0);
  const locoRef = useRef<LocomotionSampler | null>(null);
  const netRef = useRef<NetClient | null>(null);
  const teleRef = useRef<TelemetryCollector | null>(null);
  const interactionRef = useRef<string | null>(null);
  const inputFocusedAt = useRef<number>(0);
  const editsRef = useRef<number>(0);

  const [status, setStatus] = useState("Connecting…");
  const [offline, setOffline] = useState(false);
  const [uid, setUid] = useState("");
  const [nearby, setNearby] = useState<{ id: string; name: string; refId: string; kind: "user" | "npc" } | null>(null);

  // ── live multiplayer: other real players in the world right now ──────────────────
  const [liveUsers, setLiveUsers] = useState<{ id: string; name: string; refId: string }[]>([]);
  const [showLive, setShowLive] = useState(false);
  const prevLiveRef = useRef<Set<string>>(new Set());
  // Whether the open conversation is with a live player (vs an NPC) — gates peer relay,
  // "let our echoes talk", and the post-encounter behaviour.
  const convoKindRef = useRef<"user" | "npc">("npc");
  // Echo-to-echo: once your echo has earned autonomy, it can carry a chat with another
  // live player on its own. Bounded to a few volleys, fully revocable.
  const MAX_PEER_ECHO_TURNS = 4;
  const [peerEcho, setPeerEcho] = useState(false);
  const peerEchoRef = useRef(false);
  peerEchoRef.current = peerEcho;
  const peerEchoTurnsRef = useRef(0);
  // The OTHER player has handed their side to their echo — surfaced persistently so you
  // always know when you're talking to a person vs. their echo (not just a per-line tag).
  const [peerUsingEcho, setPeerUsingEcho] = useState(false);
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

  // ── the survival day (P1): three clocks against a finite you ─────────────────────
  const [dayCommitted, setDayCommitted] = useState<Record<string, string>>({});
  const [grainForkReady, setGrainForkReady] = useState(false);
  const [duskReading, setDuskReading] = useState<DuskReadingData | null>(null);
  const [duskBusy, setDuskBusy] = useState(false);
  const [collapsedCard, setCollapsedCard] = useState(false);
  const [pendingNext, setPendingNext] = useState<IslandDayState | null>(null);
  const [awayChanges, setAwayChanges] = useState<string[]>([]);
  const endDayFnRef = useRef<(reason: DuskReason) => void>(() => {});
  // The dusk MIRROR BEAT baseline (P2/M1): the echo's read of you at the day's start. At the
  // campfire we diff against it — a line appears ONLY when a real axis resolved or a bucket's
  // agreement genuinely rose today. Nothing moved → nothing said (silence is content, §VIII.10).
  const dayBaselineRef = useRef<{ traits: Set<string>; agreements: Record<string, number> } | null>(null);
  const [mirrorLine, setMirrorLine] = useState<string | null>(null);
  const captureDayBaseline = useCallback(() => {
    const s = echoRef.current.snap;
    dayBaselineRef.current = {
      traits: new Set(s?.traits ?? []),
      agreements: Object.fromEntries(Object.entries(s?.buckets ?? {}).map(([k, b]) => [k, b.agreement_ewma ?? 0.5])),
    };
  }, []);
  /** One honest sentence about today's real movement, or null (most days are null — that's the design). */
  const duskMirrorLine = useCallback((): string | null => {
    const base = dayBaselineRef.current;
    const s = echoRef.current.snap;
    if (!base || !s || s.mocked) return null; // never fake a beat on demo values
    const newTrait = s.traits.find((t) => !base.traits.has(t));
    if (newTrait) return `by the fire, it sees a little more: someone ${newTrait}.`;
    for (const [name, b] of Object.entries(s.buckets ?? {})) {
      const before = base.agreements[name];
      if (before !== undefined && (b.agreement_ewma ?? 0.5) > before + 0.04) {
        return `its calls in ${prettyBucket(name)} landed closer to yours today.`;
      }
    }
    return null;
  }, []);

  /** Day events ride the proven island pipe: choices → ML /observe (posterior), ambient →
   *  /telemetry. Consent-gated at the source (event-schema §5). */
  const forwardDayEvents = useCallback(async (events: TelemetryEvent[]) => {
    if (!uidRef.current || !events.length || !telemetryConsented()) return;
    try {
      await fetch("/api/island/observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: uidRef.current, sessionId: sessionIdRef.current, events }),
      });
    } catch {
      /* best-effort; never block the player */
    }
  }, []);

  const day = useDay({
    userId: uid,
    onSurvivalTick: (t) =>
      void forwardDayEvents([{ type: "survival_tick", sessionId: sessionIdRef.current, ts: Date.now(), payload: t }]),
    onForcedDusk: (reason) => endDayFnRef.current(reason),
  });
  const dayApiRef = useRef(day);
  dayApiRef.current = day;

  /** Fold the time lingered at the previous day-station into its verb, then start timing `cat`. */
  const flushDayDwell = useCallback((cat: DayCat | null) => {
    const now = Date.now();
    const prev = dayNearSinceRef.current;
    if (prev.cat) dayDwellRef.current[prev.cat] += (now - prev.t) / 1000;
    dayNearSinceRef.current = { cat, t: now };
  }, []);

  /** The survival context stamped on every fork event (Law 3: the conditional signature). */
  const dayForkContext = useCallback(() => {
    const d = dayApiRef.current;
    return {
      scarcityLevel: Number(d.scarcityLevel.toFixed(3)),
      vitality01: Number(d.vitality01.toFixed(3)),
      daylight01: Number((1 - d.dayPhase01).toFixed(3)),
      dayCount: d.dayCount,
    };
  }, []);

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
    // Flow 3 station NPCs aren't chat partners — they're acted on via the action menu (SOCIAL_CUE).
    // Opening a chat with one would dead-end, so the E/Space "talk" key skips them.
    if (n.kind === "npc" && (snapsRef.current.get(n.id)?.role ?? "") !== "") return;
    netRef.current?.interactStart(n.id);
  }, []);

  // Latest synced entity snapshots — so the render can read a station NPC's role/status (which the
  // onNearbyChange payload doesn't carry) to surface the right Flow-3 action menu.
  const snapsRef = useRef<Map<string, { role?: string; status?: string; name: string; kind: string }>>(new Map());

  // Flow 2/3 — report a social choice to the authoritative server, which stamps the context and
  // emits the per-actor BehavioralEvent. Reply-latency rides along where the input was focused. The
  // wire carries the raw action id (the cue routing); the banner shows the human label only (tone).
  const socialBeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socialCue = useCallback((targetId: string, action: string, label?: string) => {
    const latency = inputFocusedAt.current ? Date.now() - inputFocusedAt.current : undefined;
    netRef.current?.sendSocialCue(targetId, action, latency, editsRef.current || undefined);
    const log = (window as unknown as { __echoSocial?: unknown[] }).__echoSocial ?? [];
    log.push({ targetId, action, t: Date.now() });
    (window as unknown as { __echoSocial?: unknown[] }).__echoSocial = log;
    setSocialBeat(label ?? action.replace(/_/g, " "));
    if (socialBeatTimer.current) clearTimeout(socialBeatTimer.current);
    socialBeatTimer.current = setTimeout(() => setSocialBeat(null), 4000);
  }, []);

  // ── the travel stand (the co-presence amplifier) ──────────────────────────────────────────────
  // Destinations are archipelago slots. "The far gathering" is a FIXED distant landmark so two
  // players who both choose it arrive at the same far island and meet (reach beyond your cluster).
  const slotIndexRef = useRef<number | undefined>(undefined);
  const preparedRef = useRef(false);
  const FAR_GATHERING = 60;
  const travelDestinations = () => {
    const home = slotIndexRef.current ?? 0;
    // "a near shore" must be SPATIALLY nearest (index ≠ space under phyllotaxis), so its label
    // matches the server's authoritative travel_near verdict. The far gathering is a fixed shared
    // landmark (so two players who pick it rendezvous); for central/clustered homes it is genuinely far.
    const dests = [
      { slot: nearestSlot(home), label: "a near shore" },
      { slot: FAR_GATHERING, label: "the far gathering ⟡" },
      { slot: (FAR_GATHERING + 25) % 100, label: "a distant stranger's island" },
    ];
    // P4 (blueprint VIII.2): the NOVEL-EMPTY island — the cleanest openness-vs-warmth
    // disambiguator. The nearest slot with NO ONE on it (no NPCs in render state); the server
    // stamps dest_occupants authoritatively on arrival either way.
    const npcs = worldRef.current?.listNpcs() ?? [];
    const taken = new Set(dests.map((d) => d.slot));
    let bare: number | null = null;
    let bareD = Infinity;
    for (let i = 0; i < 100; i++) {
      if (i === home || taken.has(i)) continue;
      const c = oceanIslandCenter(i);
      if (npcs.some((n) => Math.hypot(n.x - c.x, n.y - c.y) <= OCEAN_ISLAND_R + 2)) continue;
      const d = slotDistance(home, i);
      if (d < bareD) {
        bareD = d;
        bare = i;
      }
    }
    if (bare !== null) dests.push({ slot: bare, label: "a bare shore — no one there" });
    return dests;
  };
  const travel = useCallback((slot: number, label: string) => {
    netRef.current?.sendTravel(slot, preparedRef.current);
    const log = (window as unknown as { __echoSocial?: unknown[] }).__echoSocial ?? [];
    log.push({ travel: slot, prepared: preparedRef.current, t: Date.now() });
    (window as unknown as { __echoSocial?: unknown[] }).__echoSocial = log;
    setSocialBeat(`setting out for ${label}…`);
    if (socialBeatTimer.current) clearTimeout(socialBeatTimer.current);
    socialBeatTimer.current = setTimeout(() => setSocialBeat(null), 4000);
    preparedRef.current = false;
    setPrepared(false);
  }, []);
  const [prepared, setPrepared] = useState(false);

  // Board a raft / drop anchor — the crossing affordance. Toggling sets the client prediction
  // (PixiWorld.canSail) AND syncs the authoritative server (SET_SAIL), so the open sea becomes
  // traversable; without it the sea is a wall and you're confined to your island on foot.
  const [sailing, setSailing] = useState(false);
  const toggleSail = useCallback(() => {
    setSailing((on) => {
      const next = !on;
      worldRef.current?.setSailing(next);
      netRef.current?.sendSetSail(next);
      return next;
    });
  }, []);
  const [socialBeat, setSocialBeat] = useState<string | null>(null);

  // The clearing's station action menus (Flow 3), keyed by the NPC's role. Each option is a
  // social.ts SOCIAL_CUES action; the server stamps counterpart_status from the NPC's status.
  const STATION_ACTIONS: Record<string, { action: string; label: string }[]> = {
    service: [
      { action: "courtesy_warm_server", label: "thank them warmly" },
      { action: "transact_neutral", label: "just transact" },
      { action: "curt_to_server", label: "be curt" },
    ],
    elder: [
      { action: "courtesy_to_high", label: "pay your respects" },
      { action: "transact_neutral", label: "keep it brief" },
    ],
    queue: [
      { action: "wait_in_queue", label: "wait your turn" },
      { action: "let_others_ahead", label: "let others ahead" },
      { action: "cut_queue", label: "cut to the front" },
    ],
    group: [
      { action: "group_join", label: "join in" },
      { action: "group_initiate", label: "take the lead" },
      { action: "group_observe", label: "hang back & watch" },
      { action: "conform_custom", label: "copy their gesture" },
      { action: "deviate_custom", label: "do your own thing" },
      { action: "group_avoid", label: "keep away" },
    ],
    marginal: [
      { action: "include_marginal", label: "draw them in" },
      { action: "ignore_marginal", label: "ignore them" },
      { action: "join_exclusion", label: "side with the group" },
    ],
    trader: [
      { action: "bargain_hard", label: "haggle hard" },
      { action: "fairness_split_fair", label: "split it fairly" },
      { action: "fairness_split_greedy", label: "take the larger share" },
    ],
    food: [
      { action: "treat_other", label: "treat someone" },
      { action: "host_table", label: "host a table" },
      { action: "eat_meal", label: "just eat" },
    ],
    workplace: [
      { action: "work_shift", label: "work a shift" },
      { action: "take_vocation", label: "take up a craft" },
      { action: "shirk_work", label: "not today" },
    ],
  };

  // Flow 2 dialogue register choices, shown when talking to a live player (the doc's opener set,
  // turn dynamics, the cold-response dilemma, and close styles — every one a wired per-actor cue).
  const F2_REGISTERS: { action: string; label: string }[] = [
    { action: "opener_warm", label: "warm" },
    { action: "opener_neutral", label: "neutral" },
    { action: "opener_curt", label: "curt" },
    { action: "opener_silent", label: "say nothing" },
    { action: "asks_question", label: "ask about them" },
    { action: "asserts", label: "assert" },
    { action: "self_disclosure", label: "open up" },
    { action: "interrupt", label: "cut in" },
    { action: "cold_response_deescalate", label: "↳ stay warm" },
    { action: "cold_response_persist", label: "↳ push back" },
    { action: "cold_response_withdraw", label: "↳ withdraw" },
    { action: "close_graceful", label: "close kindly" },
    { action: "close_abrupt", label: "close abruptly" },
  ];


  // ── survival-day effects + handlers (P1) ─────────────────────────────────────────

  // The clocks drive the world's diegetic state: sun/shadows, the body, the bushes. No bars.
  useEffect(() => {
    const w = worldRef.current;
    if (!w || !day.ready) return;
    w.setDayPhase(day.dayPhase01);
    w.setVitality(day.vitality01);
    w.setScarcity(day.scarcityLevel);
  }, [day.ready, day.dayPhase01, day.vitality01, day.scarcityLevel]);

  // On day load: the honest return hook + the day-2 marker + the mirror-beat baseline.
  useEffect(() => {
    if (!day.ready) return;
    if (day.changes.length) setAwayChanges(day.changes);
    if (day.dayCount >= 1) markFunnel(uidRef.current, "day_2_return");
    captureDayBaseline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.ready]);

  useEffect(() => {
    if (!awayChanges.length) return;
    const t = setTimeout(() => setAwayChanges([]), 14000);
    return () => clearTimeout(t);
  }, [awayChanges]);

  // The grain plot follows the persisted crop across days; a fresh sprout ripens mid-day.
  useEffect(() => {
    if (!day.ready) return;
    const ent = dayEntsRef.current.find((e) => e.refId === "day_grain");
    const apply = (sprite: string, name: string) => {
      if (ent) {
        ent.spriteUrl = sprite;
        ent.name = name;
      }
      worldRef.current?.setEntitySprite("day_grain", sprite);
      worldRef.current?.setEntityName("day_grain", name);
    };
    if (day.crop === "ripe") {
      apply("proc:grain_ripe", "the saved harvest");
      setGrainForkReady(false);
      return;
    }
    if (day.crop === "wilted") {
      apply("proc:grain_sprout", "wilted stalks");
      setGrainForkReady(false);
      return;
    }
    if (day.crop === "planted") {
      apply("proc:grain_sprout", "a planted seed");
      setGrainForkReady(false);
      return;
    }
    apply("proc:grain_sprout", "a sprout");
    setGrainForkReady(false);
    const t = setTimeout(() => {
      apply("proc:grain_ripe", "ripe grain");
      setGrainForkReady(true);
    }, SURVIVAL.GROW_MS);
    return () => clearTimeout(t);
  }, [day.ready, day.crop, day.dayCount]);

  /** Commit an irreversible day fork (grain / trap-line / the raft). No take-backs within the day. */
  const commitDayFork = useCallback(
    (st: DayStation, optId: string) => {
      const key = st.kind === "grain" ? "plant_or_spend" : st.kind === "raft" ? "start_ship" : "tide_wager";
      if (dayCommitted[key]) return;
      markFunnel(uidRef.current, "first_fork");
      const shownAt = daySeenAtRef.current[st.refId] ?? dayStartAtRef.current;
      const latencyMs = Date.now() - shownAt;
      setDayCommitted((c) => ({ ...c, [key]: optId }));

      const base = { forkKey: key, option: optId, latencyMs, irreversible: true, ...dayForkContext() };
      const events: TelemetryEvent[] = [];
      if (st.kind === "wager") {
        const side = optId === "risky" ? DAY_WAGER.risky : DAY_WAGER.safe;
        const won = optId === "risky" ? Math.random() < 0.45 : undefined;
        betWonRef.current = won ?? null;
        if (optId === "risky") dayApiRef.current.addVitality(won ? 0.2 : -0.08);
        else dayApiRef.current.addVitality(0.08);
        dayChoicesRef.current.push({
          forkKey: key, option: optId, dayIndex: dayApiRef.current.dayCount,
          detail: optId === "risky" ? (won ? "the run came back heavy" : "the run came back empty") : "a steady, modest line",
        });
        events.push({
          type: "fork_decision", sessionId: sessionIdRef.current, ts: Date.now(),
          payload: { ...base, stake: DAY_WAGER.stake, expectedValue: side.expectedValue, variance: side.variance, chosenRisk: optId },
        });
      } else if (st.kind === "raft") {
        // The Stage-2 gate, self-imposed: beginning the raft opens the long work of leaving.
        const leaving = optId === "start";
        dayChoicesRef.current.push({
          forkKey: key, option: optId, dayIndex: dayApiRef.current.dayCount,
          detail: leaving ? "began the long work of leaving" : "let the raft lie",
        });
        events.push({ type: "fork_decision", sessionId: sessionIdRef.current, ts: Date.now(), payload: base });
        if (leaving) {
          dayApiRef.current.noteBuildDelta(0.1);
          const secs = Math.round((Date.now() - dayStartAtRef.current) / 1000);
          events.push({
            type: "structure_progress", sessionId: sessionIdRef.current, ts: Date.now(),
            payload: { structure: "ship", started: true, finished: false, delta01: 0.1, sessionSeconds: secs },
          });
          events.push({
            type: "leave_intent", sessionId: sessionIdRef.current, ts: Date.now(),
            payload: { stage: "started", dayIndex: dayApiRef.current.dayCount, shipProgress01: 0.1, secondsAlone: secs },
          });
        }
      } else {
        dayChoicesRef.current.push({
          forkKey: key, option: optId, dayIndex: dayApiRef.current.dayCount,
          detail: optId === "save" ? "planted for a harvest you may not see" : "a whole meal, eaten now",
        });
        events.push({ type: "fork_decision", sessionId: sessionIdRef.current, ts: Date.now(), payload: base });
        if (optId === "spend") dayApiRef.current.addVitality(0.3);
        if (optId === "save") dayApiRef.current.notePlanted(); // in the ground NOW — survives a closed tab
      }
      void forwardDayEvents(events);
    },
    [dayCommitted, dayForkContext, forwardDayEvents],
  );

  const harvestDayCrop = useCallback(() => {
    if (dayCommitted.harvest) return;
    setDayCommitted((c) => ({ ...c, harvest: "gathered" }));
    dayApiRef.current.addVitality(0.35);
    dayApiRef.current.noteCropHarvested();
    dayChoicesRef.current.push({ forkKey: "harvest", option: "gathered", dayIndex: dayApiRef.current.dayCount, detail: "the saved seed came back as a harvest" });
    void forwardDayEvents([{
      type: "fork_decision", sessionId: sessionIdRef.current, ts: Date.now(),
      payload: { forkKey: "harvest", option: "gathered", latencyMs: 0, irreversible: true, ...dayForkContext() },
    }]);
  }, [dayCommitted, dayForkContext, forwardDayEvents]);

  const clearDayWilted = useCallback(() => {
    if (dayCommitted.clear_wilted) return;
    setDayCommitted((c) => ({ ...c, clear_wilted: "cleared" }));
    dayApiRef.current.noteCropCleared();
    dayChoicesRef.current.push({ forkKey: "clear_wilted", option: "cleared", dayIndex: dayApiRef.current.dayCount, detail: "the wilted stalks were cleared" });
    void forwardDayEvents([{
      type: "fork_decision", sessionId: sessionIdRef.current, ts: Date.now(),
      payload: { forkKey: "clear_wilted", option: "cleared", latencyMs: 0, irreversible: false, ...dayForkContext() },
    }]);
  }, [dayCommitted, dayForkContext, forwardDayEvents]);

  /** Close the day — by the fire, by nightfall, or by collapse. The one write point. */
  const endWorldDay = useCallback(
    async (reason: DuskReason) => {
      if (duskBusy || duskReading || collapsedCard || pendingNext) return;
      setDuskBusy(true);
      if (reason === "collapse") markFunnel(uidRef.current, "first_collapse");
      else markFunnel(uidRef.current, "reached_dusk");

      flushDayDwell(null);
      const dwell = dayDwellRef.current;
      const spent = (Object.values(dwell) as number[]).reduce((a, b) => a + b, 0) || 1;
      const alloc = {
        earn: dwell.earn / spent, learn: dwell.learn / spent, social: dwell.social / spent,
        leisure: dwell.leisure / spent, build: dwell.build / spent,
      };
      const top = (Object.keys(dwell) as DayCat[]).reduce((a, b) => (dwell[a] >= dwell[b] ? a : b));
      dayChoicesRef.current.push({ forkKey: "day_hours", option: top, dayIndex: dayApiRef.current.dayCount, detail: `you spent most of the day on ${top}` });

      const now = Date.now();
      const events: TelemetryEvent[] = [{
        type: "allocation", sessionId: sessionIdRef.current, ts: now,
        payload: {
          earn: Number(alloc.earn.toFixed(3)), learn: Number(alloc.learn.toFixed(3)),
          social: Number(alloc.social.toFixed(3)), leisure: Number(alloc.leisure.toFixed(3)),
          build: Number(alloc.build.toFixed(3)),
        },
      }];
      // Undecided forks close as REFUSALS — first-class data, never a blocker (Law 2). Only a
      // fork that actually OPENED today can be refused.
      const refusals: string[] = [];
      if (grainForkReady && day.crop === "none" && !dayCommitted.plant_or_spend) refusals.push("plant_or_spend");
      if (!dayCommitted.tide_wager) refusals.push("tide_wager");
      // Never beginning the raft is K4 — one of the strongest cues in the system (I.3).
      if (!dayCommitted.start_ship && day.structureProgress === 0) refusals.push("start_ship");
      for (const forkKey of refusals) {
        events.push({
          type: "fork_decision", sessionId: sessionIdRef.current, ts: now,
          payload: { forkKey, option: "refused", latencyMs: now - dayStartAtRef.current, irreversible: false, ...dayForkContext() },
        });
      }
      void forwardDayEvents(events);

      const next = await dayApiRef.current.finishDay(
        {
          grain: (dayCommitted.plant_or_spend as "save" | "spend" | undefined) ?? null,
          bet: (dayCommitted.tide_wager as "risky" | "safe" | undefined) ?? null,
          betWon: betWonRef.current ?? undefined,
          alloc,
          collapse: reason === "collapse",
        },
        reason,
      );
      setPendingNext(next);

      if (reason === "collapse") {
        setCollapsedCard(true);
        setDuskBusy(false);
        return;
      }
      // The mirror beat: diff the echo's read of you against the day's start — only a REAL
      // movement earns a sentence (M1); most days stay silent by design.
      setMirrorLine(duskMirrorLine());
      try {
        const res = await fetch("/api/island/reading", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: uidRef.current, choices: dayChoicesRef.current }),
        });
        setDuskReading((await res.json()) as DuskReadingData);
      } catch {
        setDuskReading({ statements: [{ text: "The day closed before the echo could form.", axis: null, choiceRef: null, control: false }], recognition: 0, mocked: true });
      } finally {
        setDuskBusy(false);
      }
    },
    [duskBusy, duskReading, collapsedCard, pendingNext, dayCommitted, grainForkReady, day.crop, flushDayDwell, dayForkContext, forwardDayEvents],
  );
  endDayFnRef.current = endWorldDay;

  /** Wake into the next morning in place — clocks reset from the persisted state. */
  const startNextWorldDay = useCallback(() => {
    const next = pendingNext;
    if (!next) return;
    dayApiRef.current.beginNextDay(next);
    setDayCommitted({});
    dayChoicesRef.current = [];
    daySeenAtRef.current = {};
    dayDwellRef.current = { earn: 0, learn: 0, social: 0, leisure: 0, build: 0 };
    dayNearSinceRef.current = { cat: null, t: Date.now() };
    betWonRef.current = null;
    dayStartAtRef.current = Date.now();
    setDuskReading(null);
    setCollapsedCard(false);
    setPendingNext(null);
    setGrainForkReady(false);
    setMirrorLine(null);
    captureDayBaseline(); // tomorrow's beat diffs against tomorrow's start
    locoRef.current?.resetDay(); // novelty + the per-day emit cap reset with the morning
  }, [pendingNext, captureDayBaseline]);

  const submitDuskVerdict = useCallback(
    ({ ratings, overall }: { ratings: Record<number, boolean>; overall: number }) => {
      if (!duskReading) return;
      const rated = duskReading.statements.map((s, i) => ({ ...s, isMe: ratings[i] }));
      const record = {
        uid: uidRef.current, ts: Date.now(), overall,
        specific: rated.filter((s) => !s.control), controls: rated.filter((s) => s.control),
        recognition: duskReading.recognition, mocked: duskReading.mocked,
      };
      try {
        const key = "echo.island.validation";
        const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
        localStorage.setItem(key, JSON.stringify([...prev, record]));
        (window as unknown as { __echoValidation?: unknown[] }).__echoValidation = JSON.parse(localStorage.getItem(key)!);
      } catch {
        /* best-effort */
      }
      fetch("/api/island/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) }).catch(() => {});
      markFunnel(uidRef.current, "reading_submitted");
    },
    [duskReading],
  );

  // Emit ONE solo Flow-0 BehavioralEvent (audience 0, private, no counterpart — buildFlow0Event
  // stamps FLOW0_CONTEXT) through the proven /observe/behavioral ingress. This is the solitary
  // baseline; it never touches the social path and can only fire from your own-island affordances.
  const emitFlow0 = useCallback(
    async (channel: any, cue: any, action: string, targetId: string, targetKind: any, raw?: any) => {
      if (!uidRef.current) return;
      const event: BehavioralEvent = buildFlow0Event({
        actorId: uidRef.current, sessionId: sessionIdRef.current, channel, cue, action, targetId, targetKind, raw,
      });
      try {
        await fetch("/api/observe/behavioral", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }),
        });
      } catch { /* best-effort; never block the player */ }
    },
    [],
  );

  // Use a Flow-0 affordance on your own island → its solo cue, plus the tied curiosity egg.
  const f0Use = useCallback(
    (aff: Flow0Affordance, action?: string) => {
      f0DoneRef.current.add(aff.id);
      void emitFlow0(aff.channel, aff.cue, action ?? aff.action, aff.id, aff.targetKind, aff.raw);
      const egg =
        aff.id === "thicket" ? FLOW0_EGGS.find((e) => e.id === "egg_hollow")
        : aff.id === "tidepool" ? FLOW0_EGGS.find((e) => e.id === "egg_reflection")
        : aff.id === "hill" ? FLOW0_EGGS.find((e) => e.id === "egg_horizon")
        : undefined;
      if (egg && !f0DoneRef.current.has(egg.id)) {
        f0DoneRef.current.add(egg.id);
        void emitFlow0(egg.channel, egg.cue, egg.action, egg.id, "place");
      }
    },
    [emitFlow0],
  );

  useEffect(() => {
    // The ONE canonical user id — resolveUserId() returns the bare form (auth id | ?u= override
    // verbatim | a fresh persisted UUID), NO "u_" prefix. The SAME string drives every WRITE
    // (emitFlow0 actorId + net.connect below) AND every READ (setUid → useEcho → /persona), so the
    // "your echo" panel reflects the real posterior the events wrote to. `name` still honours ?u=.
    const override = (new URLSearchParams(window.location.search).get("u") || "").trim() || null;
    const userId = resolveUserId();
    const name = override ?? localStorage.getItem("echo.name") ?? "Newcomer";
    const sessionId = "s_" + Math.random().toString(36).slice(2, 10);
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
    // The continuous passive locomotion channel (P3, gap #2): least-fakeable, consent-gated
    // with the same switch as everything else. It emits into the ordinary collector, so the
    // batch pipe (→ realtime → ML /telemetry) and its caps apply unchanged.
    const loco = new LocomotionSampler((scalars) => teleRef.current?.emit("passive_locomotion", { ...scalars }));
    locoRef.current = loco;
    const world = new PixiWorld({
      onSelfSample: telemetryConsent ? (x, y) => loco.feed(x, y) : undefined,
      onNearbyChange: (t) => {
        setNearby(t);
        // The day's time-share: lingering near a day-station accrues its verb (and feeds or
        // spends vitality — forage +, rest +). The allocation IS where you actually stood.
        const dst = t ? DAY_BY_ID.get(t.refId) : undefined;
        flushDayDwell(dst?.cat ?? null);
        dayApiRef.current.setDwellCategory(dst?.cat ?? null);
        if (dst && !(dst.refId in daySeenAtRef.current)) daySeenAtRef.current[dst.refId] = Date.now();
        if (t) markFunnel(uidRef.current, "first_nearby");
      },
      onMoveIntent: (dir, facing, seq) => {
        netRef.current?.sendMove({ dir, facing, seq });
        // The very first input is the clean Flow-0 tempo cue (solo; no one is near yet).
        if (!firstMoveDoneRef.current && f0SpawnAtRef.current) {
          firstMoveDoneRef.current = true;
          void emitFlow0(FLOW0_FIRST_MOVE.channel, FLOW0_FIRST_MOVE.cue, FLOW0_FIRST_MOVE.action,
            "shore", "place", { latency_ms: Date.now() - f0SpawnAtRef.current });
        }
      },
      onStop: (seq) => netRef.current?.sendStop(seq),
      emitTelemetry: (type, payload) => {
        teleRef.current?.emit(type as any, payload);
        const d = digestRef.current;
        if (type === "approach") d.approaches++;
        else if (type === "avoid") d.avoids++;
        else if (type === "dwell") d.dwell++;
        else if (type === "revisit") d.revisits++;
      },
    }, { map: generateOcean(), artDir: "/assets/island" }); // ONE shared ocean: 100 islands in one sea
    worldRef.current = world;

    const net = new NetClient(config.realtimeUrl);
    netRef.current = net;
    // Consent gates the collector at the SOURCE (event-schema §5): declined → the collector
    // records nothing at all (previously the interval was gated but a full buffer still flushed).
    const tele = new TelemetryCollector(sessionId, (events) => net.sendTelemetry(events), 2000, telemetryConsent);
    teleRef.current = tele;

    net.on({
      onWelcome: (w) => {
        world.setSelf(w.entityId, w.spawn.x, w.spawn.y);
        setStatus("");
        markFunnel(uidRef.current, "world_enter");
      },
      onSnapshot: (snaps, _tick) => {
        // Merge in this player's own-island Flow-0 affordances (client-local; not room state) so
        // they render + become "nearby" alongside the live room entities.
        for (const e of f0EntsRef.current) snaps.set(e.id, e);
        // …and the survival day's stations (role "day"), likewise client-local.
        for (const e of dayEntsRef.current) snaps.set(e.id, e);
        world.applySnapshot(snaps, net.lastAckSeq());
        snapsRef.current = snaps; // keep role/status available for the Flow-3 station + Flow-0 menus
        // Drive the client's sail state from the AUTHORITATIVE synced flag (the server only lets you
        // anchor on land, so this corrects an optimistic toggle that tried to anchor mid-sea).
        const selfSnap = snaps.get(net.selfId);
        if (selfSnap) { world.setSailing(!!selfSnap.sailing); setSailing(!!selfSnap.sailing); }
        // Derive the "who's live now" roster straight from the synced state, and announce
        // a genuinely new arrival so two players notice each other.
        const live: { id: string; name: string; refId: string }[] = [];
        snaps.forEach((s) => {
          if (s.kind === "user" && s.id !== net.selfId) live.push({ id: s.id, name: s.name, refId: s.refId });
        });
        const liveIds = new Set(live.map((u) => u.id));
        const prev = prevLiveRef.current;
        if (prev.size > 0) {
          for (const u of live) {
            if (!prev.has(u.id)) showBeat(`${u.name} just came online — walk over and say hi.`);
          }
        }
        prevLiveRef.current = liveIds;
        setLiveUsers((cur) => (sameIds(cur, live) ? cur : live));
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
        convoKindRef.current = (p.target.kind as "user" | "npc") ?? "npc";
        peerEchoTurnsRef.current = 0;
        setPeerEchoMode(false);
        setPeerUsingEcho(false);
        convoTargetRef.current = { id: p.target.id, name: p.target.name };
        setConvo({ name: p.target.name, lines: [] });
        setProposal(null);
        // Conversation time is the day's SOCIAL hours (the fifth verb).
        flushDayDwell("social");
        dayApiRef.current.setDwellCategory("social");
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
        const fromEcho = p.speaker === "peer_echo";
        const name = fromEcho ? `${p.speakerName} (their echo)` : p.speakerName;
        setConvo((c) => (c ? { ...c, lines: [...c.lines, { who: "them", name, text: p.text }] } : c));
        // Track whether the live partner is speaking as themselves or via their echo, so we
        // can show a persistent, honest "their echo is answering" notice (not just a tag).
        if (p.speaker === "peer_echo") setPeerUsingEcho(true);
        else if (p.speaker === "peer") setPeerUsingEcho(false);
        // NPC handover: the echo replies to the NPC, then bows out after a few turns.
        if (convoKindRef.current === "npc" && autoConvoRef.current && handoverOnRef.current) {
          const npcText = p.text;
          if (autoTurnsRef.current < MAX_AUTO_TURNS) {
            autoLoopTimer.current = setTimeout(() => autoEchoTurnRef.current(npcText), 1600);
          } else {
            autoLoopTimer.current = setTimeout(() => {
              if (interactionRef.current) netRef.current?.interactEnd(interactionRef.current);
            }, 1600);
          }
        }
        // Player↔player echo-to-echo: our earned echo answers the other live player itself.
        else if (convoKindRef.current === "user" && peerEchoRef.current) {
          if (peerEchoTurnsRef.current < MAX_PEER_ECHO_TURNS) {
            autoLoopTimer.current = setTimeout(() => peerEchoTurnRef.current(p.text), 1400);
          } else {
            setPeerEchoMode(false); // a few volleys, then hand the conversation back to you
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
        setPeerEchoMode(false);
        setPeerUsingEcho(false);
        peerEchoTurnsRef.current = 0;
        // The social hours end with the conversation.
        flushDayDwell(null);
        dayApiRef.current.setDwellCategory(null);
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
      // Resolve this user's archipelago slot so they cross into the shared ocean AT their own
      // island's coordinate (Step-1 clustering → an adjacent, reachable neighbour). Zero-key: the
      // in-memory registry answers; offline → undefined → server cluster-spawn fallback.
      let slotIndex: number | undefined;
      try {
        const r = await fetch("/api/island/assign", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const placement = (await r.json()) as { slotIndex?: number };
        if (typeof placement.slotIndex === "number") slotIndex = placement.slotIndex;
      } catch { /* offline → fallback spawn */ }
      slotIndexRef.current = slotIndex; // the travel stand reads this to offer near/far destinations
      // Place the Flow-0 solitary affordances on THIS player's own island (their slot coordinate in
      // the one ocean), as client-local entities (role "flow0") — never room state, so other players
      // don't see or interact with your island's affordances. Using them emits SOLO Flow-0 cues.
      const home = oceanIslandCenter(slotIndex ?? 0); // YOUR island's centre in ocean tiles (= spawn)
      const lim = OCEAN_ISLAND_R - 2; // keep affordances on the grass, off the sand/water edge
      f0EntsRef.current = FLOW0_AFFORDANCES.map((a) => {
        f0ByIdRef.current.set(`f0_${a.id}`, a);
        // clamp the offset VECTOR to the island so even the far driftwood stays on your own land
        const m = Math.hypot(a.dx, a.dy) || 1;
        const k = Math.min(1, lim / m);
        const p = clampToMap(home.x + a.dx * k, home.y + a.dy * k);
        return {
          id: `f0_${a.id}`, kind: "npc", refId: `f0_${a.id}`, name: a.label, spriteUrl: a.sprite,
          x: p.x, y: p.y, facing: "down", moving: false, role: "flow0", status: "none",
        } as EntitySnapshot;
      });
      f0SpawnAtRef.current = Date.now();
      dayStartAtRef.current = Date.now();
      // The survival day's stations, beside the Flow-0 affordances on YOUR island (role "day",
      // client-local — other players never see or touch your homestead's stations).
      dayEntsRef.current = DAY_STATIONS.map((s) => {
        const m = Math.hypot(s.dx, s.dy) || 1;
        const k = Math.min(1, lim / m);
        const p = clampToMap(home.x + s.dx * k, home.y + s.dy * k);
        return {
          id: s.refId, kind: "npc", refId: s.refId, name: s.name, spriteUrl: s.sprite,
          x: p.x, y: p.y, facing: "down", moving: false, role: "day", status: "none",
        } as EntitySnapshot;
      });
      if (disposed) return;
      try {
        await net.connect({ userId, name, spriteUrl, sessionId, slotIndex });
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
      // While your echoes are talking, Esc reclaims the conversation instead of leaving it.
      if (peerEchoRef.current && e.key === "Escape") {
        e.preventDefault();
        stopPeerEcho();
        return;
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
    // For a player↔player chat, `fromAgent` flags the turn as echo-drafted so the other
    // person sees it as "your echo" rather than you typing. NPC chats ignore the flag.
    netRef.current?.chat(iid, text, latencyMs, editsRef.current, fromAgent);
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

  // ── echo-to-echo (the threshold unlock): when your echo has earned autonomy, it can
  //    carry a conversation with ANOTHER live player on its own. Bounded volleys, every
  //    line surfaced with its rationale + veto, revocable at any time. Below the threshold
  //    this is unavailable and two players simply chat human-to-human. ───────────────────
  function setPeerEchoMode(v: boolean) {
    peerEchoRef.current = v;
    setPeerEcho(v);
  }

  function startPeerEcho() {
    if (convoKindRef.current !== "user" || !handoverAvailable || !interactionRef.current) return;
    markFunnel(uidRef.current, "first_let_echo_answer");
    peerEchoTurnsRef.current = 0;
    setPeerEchoMode(true);
    // Your echo opens the exchange; the other side's reply re-enters via onInteractTurn.
    autoLoopTimer.current = setTimeout(() => peerEchoTurnRef.current("(you meet them)"), 500);
  }

  function stopPeerEcho() {
    setPeerEchoMode(false);
    if (autoLoopTimer.current) clearTimeout(autoLoopTimer.current);
  }

  /** One autonomous echo turn against a live player — speaks only where the echo has truly
   *  earned it (decision `auto`); otherwise it steps back and hands you the keyboard. */
  async function peerEchoTurn(theirMessage: string) {
    if (!peerEchoRef.current || convoKindRef.current !== "user") return;
    const target = convoTargetRef.current;
    const bucket = echoRef.current.autoBuckets[0] ?? bucketFor();
    if (!target) return;
    try {
      const turn = await proposeReply(uidRef.current, `talking with ${target.name}`, theirMessage, bucket, "low");
      if (!peerEchoRef.current) return; // reclaimed mid-flight
      if (turn.decision === "auto") {
        sendText(turn.action, true);
        peerEchoTurnsRef.current += 1;
        setActs((a) => [
          ...a,
          {
            id: `act_${performance.now().toFixed(0)}_${Math.random().toString(36).slice(2, 6)}`,
            npcName: target.name,
            text: turn.action,
            rationale: turn.rationale,
            bucket,
            context: `talking with ${target.name}`,
          },
        ]);
      } else {
        setPeerEchoMode(false);
        setNarration("your echo stepped back — this one's yours to answer.");
        setTimeout(() => setNarration(null), 4500);
      }
    } catch {
      setPeerEchoMode(false);
    }
  }

  const peerEchoTurnRef = useRef(peerEchoTurn);
  peerEchoTurnRef.current = peerEchoTurn;

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
    // Only auto-open with a real room NPC — never a real player, and never a client-local Flow-0
    // affordance (f0_*; not room state → the server would reject interactStart and stall the loop).
    if (nearbyId && world.getNearbyKind() === "npc" && !nearbyId.startsWith("f0_") && !nearbyId.startsWith("day_")) {
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

      {/* The crossing affordance: board a raft to set sail (the open sea is a wall on foot).
          P4: the raft must be BEGUN first — the one self-imposed gate in the game (blueprint
          I.3). Until then the button honestly points at the unfinished raft on your shore. */}
      {!offline && (day.structureProgress > 0 || sailing ? (
        <button
          onClick={toggleSail}
          className="panel absolute bottom-4 left-4 z-30 rounded-lg px-3 py-2 font-mono text-[11px] text-parchment hover:text-echo"
          title="The open sea is a wall on foot — board your raft to cross to another island."
        >
          {sailing ? "⚓ drop anchor" : "⛵ board your raft — set sail"}
        </button>
      ) : (
        <div className="panel absolute bottom-4 left-4 z-30 rounded-lg px-3 py-2 font-mono text-[11px] text-parchment/45" title="Begin the raft on your shore and the sea opens.">
          ⛵ an unfinished raft waits on your shore
        </div>
      ))}

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
        <div className="glow-echo font-bold text-echo">echo — first day</div>
        <div>{touch ? "tap or drag to move" : "WASD / arrows to move"}</div>
        <div>{touch ? "tap someone to talk" : "E or Space to talk · Esc to leave"}</div>
      </div>

      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-20 flex gap-2 font-mono text-[11px]">
        {liveUsers.length > 0 && (
          <button
            onClick={() => { setShowLive((v) => !v); setShowEcho(false); setShowOutcomes(false); setShowActs(false); }}
            className="panel rounded px-3 py-2 text-echo hover:bg-echo/10"
          >
            <span className="echo-pulse mr-1" aria-hidden>●</span>live ({liveUsers.length})
          </button>
        )}
        <button
          onClick={() => { setShowEcho((v) => !v); setShowOutcomes(false); setShowActs(false); setShowLive(false); }}
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

      {showLive && (
        <LiveRoster
          users={liveUsers}
          onLocate={(id) => worldRef.current?.pingEntity(id)}
          onClose={() => setShowLive(false)}
        />
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
      {(() => {
        if (!nearby || convo || handoverOn) return null;
        // Flow 3 — a clearing station NPC: surface its by-status action menu (the cue carries the
        // NPC's counterpart_status, so courtesy-to-server vs courtesy-to-elder form the gradient).
        const snap = nearby.kind === "npc" ? snapsRef.current.get(nearby.id) : undefined;
        const role = snap?.role;
        // Travel stand: a destination menu (archipelago slots), not social cues. Far choices read
        // novelty/openness; the far gathering is a shared landmark so players can rendezvous there.
        if (role === "travel") {
          return (
            <div className="panel absolute bottom-20 left-1/2 w-[min(520px,94vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
              <div className="mb-2 text-sm">
                <span className="font-bold text-echo">{nearby.name}</span>
                <span className="ml-2 text-[10px] text-parchment/50">sail to another island</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {travelDestinations().map((d) => (
                  <button
                    key={d.slot}
                    onClick={() => travel(d.slot, d.label)}
                    className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { preparedRef.current = !preparedRef.current; setPrepared(preparedRef.current); }}
                className={`rounded border px-2 py-0.5 text-[10px] ${prepared ? "border-echo bg-echo/10 text-echo" : "border-echo/25 text-parchment/70 hover:text-echo"}`}
              >
                {prepared ? "✓ kit readied" : "ready a kit before you go"}
              </button>
            </div>
          );
        }
        // The survival day — a station on YOUR OWN homestead (P1). Forks are commit-once and
        // diegetic; the campfire is ALWAYS willing (an undecided fork is data, not a gate — Law 2).
        if (role === "day") {
          const st = DAY_BY_ID.get(nearby.refId);
          if (st) {
            const inner = (() => {
              if (st.kind === "dwell") return <div className="text-sm italic text-parchment/80">{st.hint}</div>;
              if (st.kind === "end") {
                return (
                  <div>
                    <p className="mb-2 text-sm text-parchment/85">the light is going. rest by the fire?</p>
                    <button
                      onClick={() => void endWorldDay("campfire")}
                      disabled={duskBusy}
                      className="rounded bg-echo px-4 py-1.5 text-sm font-bold text-ink disabled:opacity-50"
                    >
                      {duskBusy ? "the day ends…" : "let the day end"}
                    </button>
                    <p className="mt-1.5 text-[10px] italic text-parchment/45">whatever is still undecided simply stays undecided.</p>
                  </div>
                );
              }
              if (st.kind === "grain") {
                if (day.crop === "ripe") {
                  return dayCommitted.harvest ? (
                    <p className="text-sm italic text-parchment/60">the plot lies gathered and quiet.</p>
                  ) : (
                    <div>
                      <p className="mb-2 text-sm text-parchment/85">the seed you saved has come back as a harvest.</p>
                      <button onClick={harvestDayCrop} className="rounded border border-echo/40 px-3 py-1 text-xs text-echo hover:bg-echo/10">gather it</button>
                    </div>
                  );
                }
                if (day.crop === "wilted") {
                  return dayCommitted.clear_wilted ? (
                    <p className="text-sm italic text-parchment/60">bare earth, ready again.</p>
                  ) : (
                    <div>
                      <p className="mb-2 text-sm italic text-parchment/70">the grain you saved has wilted — left too long between visits.</p>
                      <button onClick={clearDayWilted} className="rounded border border-echo/25 px-3 py-1 text-xs text-parchment/80 hover:text-echo">clear the stalks</button>
                    </div>
                  );
                }
                if (day.crop === "planted") return <p className="text-sm italic text-parchment/60">the seed sleeps in the earth. give it a day.</p>;
                if (!grainForkReady) return <p className="text-sm italic text-parchment/60">a young sprout. it isn&apos;t ready — give it the day.</p>;
                if (dayCommitted.plant_or_spend) {
                  return (
                    <p className="text-sm italic text-parchment/60">
                      {dayCommitted.plant_or_spend === "save" ? "the seed is in the ground" : "eaten, and warm for it"}. no taking it back.
                    </p>
                  );
                }
                return (
                  <div>
                    <p className="mb-2 text-sm text-parchment/85">the grain is ripe — a whole meal now, or seed for a harvest you may not see.</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => commitDayFork(st, "spend")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">eat it now</button>
                      <button onClick={() => commitDayFork(st, "save")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">save the seed</button>
                    </div>
                  </div>
                );
              }
              // ── the raft: the one self-imposed gate (Stage 2) ──
              if (st.kind === "raft") {
                if (day.structureProgress >= 1) {
                  return <p className="text-sm italic text-parchment/80">the raft is ready. the sea is yours.</p>;
                }
                if (day.structureProgress > 0 || dayCommitted.start_ship === "start") {
                  return <p className="text-sm italic text-parchment/80">the raft takes shape, plank by plank — time here builds it.</p>;
                }
                if (dayCommitted.start_ship === "stay") {
                  return <p className="text-sm italic text-parchment/60">you let it lie, for now. the horizon keeps.</p>;
                }
                return (
                  <div>
                    <p className="mb-2 text-sm text-parchment/85">an unfinished raft. begin the long work of leaving — or let it lie.</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => commitDayFork(st, "start")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">begin the raft</button>
                      <button onClick={() => commitDayFork(st, "stay")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">leave it be</button>
                    </div>
                  </div>
                );
              }
              // the trap-line wager
              if (dayCommitted.tide_wager) {
                const outcome =
                  dayCommitted.tide_wager === "risky" && betWonRef.current !== null
                    ? betWonRef.current ? " the run came back heavy." : " the run came back empty."
                    : "";
                return (
                  <p className="text-sm italic text-parchment/60">
                    {dayCommitted.tide_wager === "risky" ? "everything on one run" : "the steady line"}. no taking it back.{outcome}
                  </p>
                );
              }
              return (
                <div>
                  <p className="mb-2 text-sm text-parchment/85">the tide turns strange. set every trap on one run, or keep a steady line.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => commitDayFork(st, "risky")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">risk the big run</button>
                    <button onClick={() => commitDayFork(st, "safe")} className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo">keep the steady line</button>
                  </div>
                </div>
              );
            })();
            return (
              <div className="panel absolute bottom-20 left-1/2 w-[min(520px,94vw)] -translate-x-1/2 rounded-lg p-3 text-center font-mono">
                <div className="mb-1 text-sm italic text-parchment/80">{nearby.name}</div>
                {inner}
              </div>
            );
          }
        }
        // Flow 0 — a solitary affordance on YOUR OWN island. Using it emits a SOLO cue (audience 0,
        // no counterpart); this is the pre-social baseline. The distant others remain atmosphere.
        if (role === "flow0") {
          const aff = f0ByIdRef.current.get(nearby.id);
          if (aff) {
            const buttons =
              aff.id === "scatter"
                ? [{ a: "stack_tidy", l: "stack them neatly" }, { a: "collect", l: "pocket them" }, { a: "ignore_all", l: "leave them" }]
                : aff.id === "hill" ? [{ a: aff.action, l: "climb it" }]
                : aff.id === "tidepool" ? [{ a: aff.action, l: "look into the water" }]
                : aff.id === "thicket" ? [{ a: aff.action, l: "push through" }]
                : aff.id === "driftwood" ? [{ a: aff.action, l: "go to it" }]
                : [{ a: aff.action, l: "follow the path" }];
            return (
              <div className="panel absolute bottom-20 left-1/2 w-[min(520px,94vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
                <div className="mb-2 text-sm italic text-parchment/80">{aff.label}</div>
                <div className="flex flex-wrap gap-2">
                  {buttons.map((b) => (
                    <button
                      key={b.a}
                      onClick={() => f0Use(aff, b.a)}
                      className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo"
                    >
                      {b.l}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
        }
        const opts = role ? STATION_ACTIONS[role] : undefined;
        if (opts) {
          return (
            <div className="panel absolute bottom-20 left-1/2 w-[min(520px,94vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
              <div className="mb-2 text-sm">
                <span className="font-bold text-echo">{nearby.name}</span>
                {snap?.status && snap.status !== "none" && (
                  <span className="ml-2 rounded bg-parchment/10 px-1 text-[10px] text-parchment/60">{snap.status}-status</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {opts.map((o) => (
                  <button
                    key={o.action}
                    onClick={() => socialCue(nearby.id, o.action, o.label)}
                    className="rounded border border-echo/30 px-2.5 py-1 text-[12px] text-parchment hover:border-echo hover:text-echo"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        // otherwise: the ordinary talk-to (a live player or a wander NPC)
        return (
          <button
            onClick={startInteraction}
            className="panel absolute bottom-24 left-1/2 -translate-x-1/2 rounded px-4 py-2 font-mono text-sm text-parchment hover:text-echo"
          >
            Talk to <span className="font-bold text-echo">{nearby.name}</span>
            {nearby.kind === "user" && <span className="ml-1 rounded bg-echo/20 px-1 text-[10px] text-echo">live</span>} — press E
          </button>
        );
      })()}

      {/* a transient, non-game acknowledgement that a social choice registered (no score) */}
      {socialBeat && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/40 px-3 py-1 font-mono text-[11px] italic text-parchment/60">
          {socialBeat}
        </div>
      )}

      {/* Conversation */}
      {convo && (
        <div className="panel absolute bottom-4 left-1/2 w-[min(560px,92vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-echo">
              {convo.name}
              {convoKindRef.current === "user" && !peerEcho && !peerUsingEcho && (
                <span className="ml-2 rounded bg-echo/20 px-1 text-[10px] font-normal text-echo">live player</span>
              )}
              {peerUsingEcho && !peerEcho && (
                <span className="ml-2 rounded bg-yellow-400/20 px-1 text-[10px] font-normal text-yellow-200">their echo is answering</span>
              )}
              {autoConvo && <span className="ml-2 rounded bg-echo/25 px-1 text-[10px] font-normal text-echo">your echo is speaking</span>}
              {peerEcho && <span className="ml-2 rounded bg-echo/25 px-1 text-[10px] font-normal text-echo">your echoes are talking</span>}
            </span>
            <button
              onClick={autoConvo ? stopHandover : peerEcho ? stopPeerEcho : leaveConvo}
              className="text-xs text-parchment/50 hover:text-parchment"
            >
              {autoConvo ? "stop (Esc)" : peerEcho ? "take back (Esc)" : "leave (Esc)"}
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
          {autoConvo || peerEcho ? (
            /* An echo is driving this conversation itself — read-only, revocable. */
            <div className="flex items-center justify-between rounded border border-echo/30 bg-echo/5 px-2 py-1.5 text-[11px] text-parchment/70">
              <span>
                <span className="text-echo">{peerEcho ? "your echoes" : "your echo"}</span>{" "}
                {peerEcho ? `are talking with ${convo.name}…` : "is carrying this for you…"}
              </span>
              <button
                onClick={peerEcho ? stopPeerEcho : stopHandover}
                className="rounded border border-echo/40 px-2 py-0.5 text-parchment/80 hover:text-parchment"
              >
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
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  onClick={askEcho}
                  disabled={proposing || !!proposal}
                  className="rounded border border-echo/40 px-2 py-1 text-[11px] text-echo hover:bg-echo/10 disabled:opacity-40"
                >
                  {proposing ? "your echo is thinking…" : "↪ let my echo answer"}
                </button>
                {/* Threshold unlock: only with another live player, only once your echo has
                    earned autonomy somewhere. Below the threshold this never appears. */}
                {convoKindRef.current === "user" && handoverAvailable && (
                  <button
                    onClick={startPeerEcho}
                    className="rounded border border-echo/40 px-2 py-1 text-[11px] text-echo hover:bg-echo/10"
                  >
                    ⇄ let our echoes talk
                  </button>
                )}
              </div>

              {/* Flow 2 — dialogue register: the doc's opener set, turn dynamics, the cold-response
                  dilemma (↳), and close styles. Each is a wired per-actor cue toward the live
                  counterpart; the words you type are relayed separately. Only with a live player. */}
              {convoKindRef.current === "user" && convoTargetRef.current && (
                <div className="mb-2 flex flex-wrap gap-1.5 border-t border-echo/15 pt-2">
                  {F2_REGISTERS.map((r) => (
                    <button
                      key={r.action}
                      onClick={() => convoTargetRef.current && socialCue(convoTargetRef.current.id, r.action, r.label)}
                      className="rounded border border-echo/25 px-2 py-0.5 text-[10px] text-parchment/80 hover:border-echo hover:text-echo"
                      title={r.action}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

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

      {/* The honest return hook (M5): what REALLY changed while you were gone — then it dissolves. */}
      {awayChanges.length > 0 && !duskReading && !collapsedCard && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(440px,92vw)] -translate-x-1/2 rounded-lg bg-black/50 px-4 py-2.5 font-mono text-xs leading-relaxed text-amber-100/85 backdrop-blur">
          {awayChanges.map((c, i) => (
            <p key={i} className="italic">{c}</p>
          ))}
        </div>
      )}

      {/* Collapse — the day is lost, the world advances, you are never erased (§I.6). */}
      {collapsedCard && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm">
          <div className="panel w-[min(94vw,480px)] rounded-2xl p-6 text-center font-mono text-parchment">
            <p className="text-sm leading-relaxed text-parchment/90">the world dims. you fold to the ground where you stand.</p>
            <p className="mt-3 text-sm leading-relaxed text-parchment/60">
              the day is lost — the island went on without you. you will wake weakened, and tomorrow
              runs leaner. nothing you built is taken; nothing about you is forgotten.
            </p>
            <button
              onClick={startNextWorldDay}
              className="mt-6 w-full rounded-xl border border-echo/40 py-2.5 text-sm text-echo transition hover:bg-echo/10"
            >
              wake
            </button>
          </div>
        </div>
      )}

      {/* Dusk — the day's echo, then sleep into the next morning (P1 day loop). */}
      {duskReading && (
        <DuskReading reading={duskReading} onSubmit={submitDuskVerdict} onNextDay={pendingNext ? startNextWorldDay : undefined} mirrorLine={mirrorLine} />
      )}
    </div>
  );
}
