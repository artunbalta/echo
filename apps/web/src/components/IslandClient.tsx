"use client";

/**
 * IslandClient — the survival day on your island (BUILD-PLAN §5 Phase 0 + blueprint P1).
 *
 * One soft-irreversible day against three clocks: DAYLIGHT (the sun crosses; at nightfall the
 * day closes wherever you stand), VITALITY (you decay unless you sustain yourself — forage
 * feeds, rest restores, building spends), SCARCITY (yesterday's choices set today's lean).
 * The day is DIEGETIC: no menu of forks, no bars — the sun is the clock, your body is the
 * meter, the thinning bushes are the ledger. Choices live in the world (a grain plot, a raft,
 * the tide pools) and are commit-once; the campfire ends the day WHENEVER you choose (an
 * undecided fork is a first-class refusal, never a blocker — Law 2). The world REMEMBERS:
 * crops ripen or wilt across sessions, the raft weathers, scarcity compounds (islandState).
 * Revealed preference from behaviour under real cost, not a survey (§3, §IV.3).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { PixiWorld } from "@/game/PixiWorld";
import { TelemetryCollector } from "@/game/telemetry";
import { generateArchipelago, isWater } from "@/game/tilemap";
import { SURVIVAL, type Facing, type IslandDayState } from "@echo/shared";
import DuskReading, { type DuskReadingData } from "@/components/DuskReading";
import { markFunnel, telemetryConsented } from "@/lib/funnel";
import { useDay, type DuskReason } from "@/lib/useDay";
import {
  DAY_FORKS,
  DAY_BET,
  forkDeliberationEvent,
  structureProgressEvent,
  leaveIntentEvent,
  allocationEvent,
  type Fork,
  type Allocation,
  type AllocCategory,
} from "@/lib/island-day";
import type { EntitySnapshot, TelemetryEvent } from "@echo/shared";

const FORK_PLANT = DAY_FORKS.find((f) => f.key === "plant_or_spend") as Fork;
const FORK_SHIP = DAY_FORKS.find((f) => f.key === "start_ship") as Fork;

// ── the island's diegetic stations (placed on the small island, spread apart) ──────────
type Interact = "pet" | "choice" | "bet" | "dwell" | "end";
interface StationOpt {
  id: string;
  label: string;
}
interface Station {
  refId: string;
  sprite: string; // proc:<kind>
  dx: number; // tile offset from the home-island centre
  dy: number;
  name: string;
  interact: Interact;
  cat?: AllocCategory; // time-share category accrued by lingering here
  fork?: Fork; // for "choice"
  options?: StationOpt[]; // diegetic option labels (mapped to fork option / bet side ids)
  hint?: string; // shown for dwell stations
  ripeGate?: boolean; // a "choice" that only opens once it has grown ripe (the grain)
}

// Stations are laid out as offsets from the player's own island centre (the archipelago places
// that island at the world centre and the camera keeps it centred — "your island", egocentric).
const STATIONS: Station[] = [
  { refId: "pet_1", sprite: "proc:dog", dx: 2, dy: 0, name: "the small one", interact: "pet", cat: "social" },
  {
    refId: "grain", sprite: "proc:grain_sprout", dx: -4, dy: -4, name: "a sprout", interact: "choice", ripeGate: true, fork: FORK_PLANT,
    options: [{ id: "spend", label: "eat it now" }, { id: "save", label: "save the seed" }],
  },
  {
    refId: "raft", sprite: "proc:raft", dx: 0, dy: -5, name: "an unfinished raft", interact: "choice", cat: "build", fork: FORK_SHIP,
    options: [{ id: "start", label: "begin the raft" }, { id: "stay", label: "leave it be" }],
  },
  {
    refId: "tidepool", sprite: "proc:tidepool", dx: 0, dy: 5, name: "the tide pools", interact: "bet",
    options: [{ id: "risky", label: "risk the big run" }, { id: "safe", label: "keep the steady line" }],
  },
  { refId: "berry_bush", sprite: "proc:berry_bush", dx: 4, dy: -4, name: "a berry bush", interact: "dwell", cat: "earn", hint: "you forage — it feeds you while the light lasts" },
  { refId: "book_cairn", sprite: "proc:book_cairn", dx: -4, dy: 4, name: "a cairn of books", interact: "dwell", cat: "learn", hint: "you read the island, the tides, yourself" },
  { refId: "bedroll", sprite: "proc:bedroll", dx: 4, dy: 4, name: "a bedroll", interact: "dwell", cat: "leisure", hint: "you rest; strength returns as the day passes" },
  { refId: "campfire", sprite: "proc:campfire", dx: -3, dy: 3, name: "a cold campfire", interact: "end" },
];
const STATION_BY_ID = new Map(STATIONS.map((s) => [s.refId, s]));

interface ChoiceLog {
  forkKey: string;
  option: string;
  dayIndex: number;
  detail?: string;
}
interface PetLine {
  who: "you" | "pet";
  text: string;
}

const POS = /\b(good|great|love|happy|hope|glad|nice|safe|warm|home|free|calm|peace|like|want|dream)\b/gi;
const NEG = /\b(alone|lonely|sad|tired|afraid|scared|lost|cold|hate|fear|dark|empty|hurt|never|cant|can't)\b/gi;
/** Crude client-side sentiment for pet_talk.valence — a derived scalar, never raw text (§4.4). */
function valence(text: string): number {
  const p = (text.match(POS) ?? []).length;
  const n = (text.match(NEG) ?? []).length;
  if (p + n === 0) return 0;
  return Math.max(-1, Math.min(1, (p - n) / (p + n)));
}

export default function IslandClient() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PixiWorld | null>(null);
  const teleRef = useRef<TelemetryCollector | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");
  const petTurnRef = useRef(0);
  const dayStartRef = useRef(0);
  const homeRef = useRef<{ x: number; y: number }>({ x: 55, y: 55 });
  const petPosRef = useRef<{ x: number; y: number }>({ x: 57, y: 55 });
  const betWonRef = useRef<boolean | null>(null);

  const [uid, setUid] = useState("");
  const [worldReady, setWorldReady] = useState(false);
  const [nearId, setNearId] = useState<string | null>(null);
  const [grainForkReady, setGrainForkReady] = useState(false);
  const [sailing, setSailing] = useState(false);
  const [orientGone, setOrientGone] = useState(false);
  const [awayChanges, setAwayChanges] = useState<string[]>([]);

  const [petOpen, setPetOpen] = useState(false);
  const [petLines, setPetLines] = useState<PetLine[]>([]);
  const [draft, setDraft] = useState("");
  const [petBusy, setPetBusy] = useState(false);

  const [committed, setCommitted] = useState<Record<string, string>>({});
  const choicesRef = useRef<ChoiceLog[]>([]);
  const seenAtRef = useRef<Record<string, number>>({}); // when each station first came into reach
  // Time-share: seconds lingered near each category's station — the diegetic "allocation".
  const dwellRef = useRef<Record<AllocCategory, number>>({ earn: 0, learn: 0, social: 0, leisure: 0, build: 0 });
  const nearSinceRef = useRef<{ cat: AllocCategory | null; t: number }>({ cat: null, t: 0 });

  const [reading, setReading] = useState<DuskReadingData | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  // The next morning's state, held while the dusk card / collapse card is on screen.
  const [pendingNext, setPendingNext] = useState<IslandDayState | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const forwardEvents = useCallback(async (events: TelemetryEvent[]) => {
    // Consent gate (event-schema §5): telemetry off → fully playable, emits NOTHING.
    if (!uidRef.current || !events.length || !telemetryConsented()) return { mocked: true };
    try {
      const res = await fetch("/api/island/observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: uidRef.current, sessionId: sessionRef.current, events }),
      });
      return (await res.json()) as { mocked?: boolean };
    } catch {
      return { mocked: true };
    }
  }, []);

  // ── the day-loop state machine (the three clocks) ──────────────────────────────
  const endDayRef = useRef<(reason: DuskReason) => void>(() => {});
  const day = useDay({
    userId: uid,
    onSurvivalTick: (t) => {
      if (telemetryConsented()) teleRef.current?.emit("survival_tick", t);
    },
    onForcedDusk: (reason) => endDayRef.current(reason),
  });
  const dayRef = useRef(day);
  dayRef.current = day;

  // ── mount the small island + place self, dog, and the day's stations ──────────────
  useEffect(() => {
    const userId = localStorage.getItem("echo.userId") ?? "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("echo.userId", userId);
    const sessionId = "s_" + Math.random().toString(36).slice(2, 10);
    uidRef.current = userId;
    sessionRef.current = sessionId;
    dayStartRef.current = Date.now();
    setUid(userId);
    markFunnel(userId, "island_enter");

    // The endless world: one big sea of islands. Your own island sits at the centre; the
    // others (empty, unowned for now) ring it across the water. Stations live on the home
    // island, positioned by their offset from its centre. Clear a little space around each so
    // a tree never blocks you from reaching it.
    const map = generateArchipelago(7);
    const home = map.homeCenter ?? { x: Math.round(map.width / 2), y: Math.round(map.height / 2) };
    homeRef.current = home;
    const stationPos = (st: Station) => ({ x: home.x + st.dx, y: home.y + st.dy });
    for (const st of STATIONS) {
      const p = stationPos(st);
      map.decorations = map.decorations.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 1.5);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.round(p.x) + dx;
          const y = Math.round(p.y) + dy;
          if (x >= 0 && y >= 0 && x < map.width && y < map.height && map.water && map.water[y * map.width + x] === 0) {
            map.collision[y * map.width + x] = 0;
          }
        }
      }
    }

    let disposed = false;
    const tele = new TelemetryCollector(sessionId, (events) => void forwardEvents(events));
    teleRef.current = tele;
    tele.start();

    const world = new PixiWorld(
      {
        onNearbyChange: (t) => {
          // Flush the time lingered at the previous station into its time-share category.
          const now = Date.now();
          const prev = nearSinceRef.current;
          if (prev.cat) dwellRef.current[prev.cat] += (now - prev.t) / 1000;
          const st = t ? STATION_BY_ID.get(t.refId) : undefined;
          nearSinceRef.current = { cat: st?.cat ?? null, t: now };
          if (st && !(st.refId in seenAtRef.current)) seenAtRef.current[st.refId] = now;
          // The dwell category also feeds/spends vitality (forage +, rest +, build −).
          dayRef.current.setDwellCategory(st?.cat ?? null);
          setNearId(st?.refId ?? null);
          if (t) {
            markFunnel(uidRef.current, "first_nearby");
            setOrientGone(true); // the island answered the one soft pull — the line dissolves
          }
        },
        emitTelemetry: (type, payload) => tele.emit(type as TelemetryEvent["type"], payload),
      },
      { map, artDir: "/assets/island" }, // generated Higgsfield art; vivid procedural fallback if missing
    );
    worldRef.current = world;

    const SELF: EntitySnapshot = { id: "player1", kind: "user", refId: userId, name: "you", spriteUrl: "", x: home.x, y: home.y, facing: "down", moving: false };
    const snaps = new Map<string, EntitySnapshot>([["player1", SELF]]);
    for (const st of STATIONS) {
      const p = stationPos(st);
      snaps.set(st.refId, { id: st.refId, kind: "npc", refId: st.refId, name: st.name, spriteUrl: st.sprite, x: p.x, y: p.y, facing: "down", moving: false });
    }
    petPosRef.current = stationPos(STATIONS[0]); // the dog's starting tile

    world.init(mountRef.current!).then(() => {
      if (disposed) return;
      world.setSelf("player1", home.x, home.y);
      world.applySnapshot(snaps, 0);
      setWorldReady(true);
    });

    // The dog wanders the home island — ambling to a new nearby spot now and then, sometimes
    // just sitting. Stays on land, near the plaza.
    const wander = setInterval(() => {
      if (disposed) return;
      if (Math.random() < 0.3) return; // a beat of stillness
      let tx = home.x;
      let ty = home.y;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = 1 + Math.random() * 5;
        const x = Math.round(home.x + Math.cos(a) * d);
        const y = Math.round(home.y + Math.sin(a) * d);
        if (!isWater(map, x, y)) { tx = x; ty = y; break; }
      }
      const prev = petPosRef.current;
      const dx = tx - prev.x;
      const dy = ty - prev.y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      petPosRef.current = { x: tx, y: ty };
      world.moveEntity("pet_1", tx, ty, facing);
    }, 2200);

    return () => {
      disposed = true;
      clearInterval(wander);
      tele.stop();
      world.destroy();
    };
  }, [forwardEvents]);

  // ── the clocks drive the world's diegetic state (sun, body, bushes — no bars) ─────
  useEffect(() => {
    const w = worldRef.current;
    if (!w || !worldReady) return;
    w.setDayPhase(day.dayPhase01);
    w.setVitality(day.vitality01);
    w.setScarcity(day.scarcityLevel);
  }, [worldReady, day.dayPhase01, day.vitality01, day.scarcityLevel]);

  // ── on day load: the honest return hook, the day-2 marker, a begun raft still sails ──
  useEffect(() => {
    if (!day.ready) return;
    if (day.changes.length) setAwayChanges(day.changes);
    if (day.dayCount >= 1) {
      markFunnel(uidRef.current, "day_2_return");
      setOrientGone(true); // the orientation line belongs to the first morning only
    }
    if (day.structureProgress > 0 && worldRef.current) {
      worldRef.current.setSailing(true);
      setSailing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.ready, day.dayCount]);

  // The "while you were gone" lines rest a while, then dissolve.
  useEffect(() => {
    if (!awayChanges.length) return;
    const t = setTimeout(() => setAwayChanges([]), 14000);
    return () => clearTimeout(t);
  }, [awayChanges]);

  // The orientation line dissolves on its own if the island isn't approached.
  useEffect(() => {
    if (orientGone) return;
    const t = setTimeout(() => setOrientGone(true), 22000);
    return () => clearTimeout(t);
  }, [orientGone]);

  // ── the grain plot follows the persisted crop across days ─────────────────────────
  useEffect(() => {
    const w = worldRef.current;
    if (!day.ready || !worldReady || !w) return;
    if (day.crop === "ripe") {
      w.setEntitySprite("grain", "proc:grain_ripe");
      w.setEntityName("grain", "the saved harvest");
      setGrainForkReady(false);
      return;
    }
    if (day.crop === "wilted") {
      w.setEntitySprite("grain", "proc:grain_sprout");
      w.setEntityName("grain", "wilted stalks");
      setGrainForkReady(false);
      return;
    }
    if (day.crop === "planted") {
      w.setEntitySprite("grain", "proc:grain_sprout");
      w.setEntityName("grain", "a planted seed");
      setGrainForkReady(false);
      return;
    }
    // No crop: a fresh sprout ripens partway through the day, then the fork opens.
    w.setEntitySprite("grain", "proc:grain_sprout");
    w.setEntityName("grain", "a sprout");
    setGrainForkReady(false);
    const t = setTimeout(() => {
      w.setEntitySprite("grain", "proc:grain_ripe");
      w.setEntityName("grain", "ripe grain");
      setGrainForkReady(true);
    }, SURVIVAL.GROW_MS);
    return () => clearTimeout(t);
  }, [day.ready, worldReady, day.crop, day.dayCount]);

  // ── pet dialogue (neutral elicitor) ──────────────────────────────────────────────
  const sendToPet = useCallback(async () => {
    const text = draft.trim();
    if (!text || petBusy) return;
    setDraft("");
    const nextLines: PetLine[] = [...petLines, { who: "you", text }];
    setPetLines(nextLines);
    setPetBusy(true);
    markFunnel(uidRef.current, "first_pet_talk");

    // Under stress = the body is running low or the light is nearly gone (real pressure,
    // not an unfinished checklist) — the I4 stress→pet read.
    const underStress = day.vitality01 < 0.35 || day.dayPhase01 > 0.8;
    teleRef.current?.emit("pet_talk", { chars: text.length, valence: valence(text), turnIndex: petTurnRef.current++, underStress });

    try {
      const res = await fetch("/api/island/pet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: nextLines.map((l) => ({ role: l.who === "you" ? "user" : "assistant", text: l.text })) }),
      });
      const data = (await res.json()) as { text?: string };
      setPetLines((cur) => [...cur, { who: "pet", text: data.text ?? "(it watches you, quiet)" }]);
    } catch {
      setPetLines((cur) => [...cur, { who: "pet", text: "(it watches you, quiet)" }]);
    } finally {
      setPetBusy(false);
    }
  }, [draft, petBusy, petLines, day.vitality01, day.dayPhase01]);

  /** The survival context every fork event carries (Law 3: the conditional signature). */
  const forkContext = useCallback(() => {
    const d = dayRef.current;
    return {
      scarcityLevel: Number(d.scarcityLevel.toFixed(3)),
      vitality01: Number(d.vitality01.toFixed(3)),
      daylight01: Number((1 - d.dayPhase01).toFixed(3)),
      dayCount: d.dayCount,
    };
  }, []);

  // ── commit a station's irreversible choice (no take-backs within the day) ──────────
  const commitChoice = useCallback(
    async (st: Station, optId: string) => {
      const key = st.interact === "bet" ? DAY_BET.key : (st.fork as Fork).key;
      if (committed[key]) return;
      markFunnel(uidRef.current, "first_fork");
      const shownAt = seenAtRef.current[st.refId] ?? dayStartRef.current;
      const latencyMs = Date.now() - shownAt;
      const label = st.options?.find((o) => o.id === optId)?.label ?? optId;
      setCommitted((c) => ({ ...c, [key]: optId }));
      choicesRef.current.push({ forkKey: key, option: optId, dayIndex: day.dayCount, detail: label });

      const sid = sessionRef.current;
      const secs = Math.round((Date.now() - dayStartRef.current) / 1000);
      const events: TelemetryEvent[] = [];
      const base = { forkKey: key, option: optId, latencyMs, irreversible: true, ...forkContext() };

      if (st.interact === "bet") {
        const side = optId === "risky" ? DAY_BET.risky : DAY_BET.safe;
        // The wager resolves at once and the body shows it — a won run feeds you, a lost
        // one costs; the steady line pays small and sure. Outcome is luck; the CHOICE is the cue.
        const won = optId === "risky" ? Math.random() < 0.45 : undefined;
        betWonRef.current = won ?? null;
        if (optId === "risky") dayRef.current.addVitality(won ? 0.2 : -0.08);
        else dayRef.current.addVitality(0.08);
        if (won !== undefined) {
          choicesRef.current.push({ forkKey: "tide_outcome", option: won ? "won" : "lost", dayIndex: day.dayCount, detail: won ? "the run came back heavy" : "the run came back empty" });
        }
        events.push({
          type: "fork_decision", sessionId: sid, ts: Date.now(),
          payload: { ...base, stake: DAY_BET.stake, expectedValue: side.expectedValue, variance: side.variance, chosenRisk: side.id },
        });
      } else {
        const fork = st.fork as Fork;
        events.push({ type: "fork_decision", sessionId: sid, ts: Date.now(), payload: base });
        events.push(forkDeliberationEvent(sid, fork.key, 0, latencyMs));
        if (fork.key === "plant_or_spend" && optId === "spend") {
          // Eating now is a real meal — the certain, immediate arm of the delay fork.
          dayRef.current.addVitality(0.3);
        }
        if (fork.key === "plant_or_spend" && optId === "save") {
          // The seed is in the ground NOW — persisted immediately, so it survives a closed tab.
          dayRef.current.notePlanted();
        }
        if (fork.key === "start_ship") {
          const leaving = optId === "start";
          if (leaving) dayRef.current.noteBuildDelta(0.1);
          events.push(structureProgressEvent(sid, "ship", { started: leaving, finished: false, delta01: leaving ? 0.1 : 0, sessionSeconds: secs }));
          events.push(leaveIntentEvent(sid, { stage: leaving ? "started" : "none", dayIndex: day.dayCount, shipProgress01: leaving ? Math.max(0.1, day.structureProgress) : day.structureProgress, secondsAlone: secs }));
          // Building the raft is the resource/effort gate: once begun, the sea is yours to cross
          // and you can sail out to the other islands (the endless world opens up).
          if (leaving) {
            worldRef.current?.setSailing(true);
            setSailing(true);
          }
        }
      }
      await forwardEvents(events);
    },
    [committed, forwardEvents, forkContext, day.dayCount, day.structureProgress],
  );

  // ── the saved harvest / wilted stalks (yesterday's fork, landed) ──────────────────
  const harvestCrop = useCallback(async () => {
    if (committed.harvest) return;
    setCommitted((c) => ({ ...c, harvest: "gathered" }));
    dayRef.current.addVitality(0.35);
    dayRef.current.noteCropHarvested();
    choicesRef.current.push({ forkKey: "harvest", option: "gathered", dayIndex: day.dayCount, detail: "the saved seed came back as a harvest" });
    await forwardEvents([{
      type: "fork_decision", sessionId: sessionRef.current, ts: Date.now(),
      payload: { forkKey: "harvest", option: "gathered", latencyMs: 0, irreversible: true, ...forkContext() },
    }]);
  }, [committed, forwardEvents, forkContext, day.dayCount]);

  const clearWilted = useCallback(async () => {
    if (committed.clear_wilted) return;
    setCommitted((c) => ({ ...c, clear_wilted: "cleared" }));
    dayRef.current.noteCropCleared();
    choicesRef.current.push({ forkKey: "clear_wilted", option: "cleared", dayIndex: day.dayCount, detail: "the wilted stalks were cleared" });
    await forwardEvents([{
      type: "fork_decision", sessionId: sessionRef.current, ts: Date.now(),
      payload: { forkKey: "clear_wilted", option: "cleared", latencyMs: 0, irreversible: false, ...forkContext() },
    }]);
  }, [committed, forwardEvents, forkContext, day.dayCount]);

  // ── the day closes: by the fire, by nightfall, or by collapse ─────────────────────
  const endDay = useCallback(
    async (reason: DuskReason) => {
      if (readingBusy || reading || collapsed || pendingNext) return;
      setReadingBusy(true);
      if (reason === "collapse") markFunnel(uidRef.current, "first_collapse");
      else markFunnel(uidRef.current, "reached_dusk");

      // Flush the current lingering, then turn dwell-seconds into the day's time-share.
      const now = Date.now();
      const prev = nearSinceRef.current;
      if (prev.cat) dwellRef.current[prev.cat] += (now - prev.t) / 1000;
      nearSinceRef.current = { cat: null, t: now };
      const dwell = dwellRef.current;
      const spent = (Object.values(dwell) as number[]).reduce((a, b) => a + b, 0) || 1;
      const alloc = {
        earn: dwell.earn / spent, learn: dwell.learn / spent, social: dwell.social / spent,
        leisure: dwell.leisure / spent, build: dwell.build / spent,
      };
      const top = (Object.keys(dwell) as AllocCategory[]).reduce((a, b) => (dwell[a] >= dwell[b] ? a : b));
      choicesRef.current.push({ forkKey: "day_hours", option: top, dayIndex: day.dayCount, detail: `you spent most of the day on ${top}` });

      const sid = sessionRef.current;
      const events: TelemetryEvent[] = [allocationEvent(sid, dwell as Allocation)];
      if (dwell.build > 0) {
        dayRef.current.noteBuildDelta(0.2);
        events.push(structureProgressEvent(sid, "ship", { delta01: 0.2, sessionSeconds: Math.round((now - dayStartRef.current) / 1000) }));
      }

      // Undecided forks close as REFUSALS — first-class data, never a blocker or a penalty
      // (Law 2). Only a fork that actually OPENED today can be refused.
      const refusals: { forkKey: string }[] = [];
      if (grainForkReady && day.crop === "none" && !committed.plant_or_spend) refusals.push({ forkKey: "plant_or_spend" });
      if (!committed.start_ship && day.structureProgress === 0) refusals.push({ forkKey: "start_ship" });
      if (!committed.tide_wager) refusals.push({ forkKey: "tide_wager" });
      for (const r of refusals) {
        events.push({
          type: "fork_decision", sessionId: sid, ts: now,
          payload: { ...r, option: "refused", latencyMs: now - dayStartRef.current, irreversible: false, ...forkContext() },
        });
      }
      await forwardEvents(events);

      const next = await dayRef.current.finishDay(
        {
          grain: (committed.plant_or_spend as "save" | "spend" | undefined) ?? null,
          bet: (committed.tide_wager as "risky" | "safe" | undefined) ?? null,
          betWon: betWonRef.current ?? undefined,
          alloc,
          collapse: reason === "collapse",
          tieDeltas: petTurnRef.current > 0 ? { pet_1: Math.min(0.3, petTurnRef.current * 0.05) } : undefined,
        },
        reason,
      );
      setPendingNext(next);

      if (reason === "collapse") {
        // No reading at a collapse — the day is simply lost; the world advanced without you.
        setCollapsed(true);
        setReadingBusy(false);
        return;
      }

      teleRef.current?.flush();
      try {
        const res = await fetch("/api/island/reading", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: uidRef.current, choices: choicesRef.current }),
        });
        setReading((await res.json()) as DuskReadingData);
      } catch {
        setReading({ statements: [{ text: "The day closed before the echo could form.", axis: null, choiceRef: null, control: false }], recognition: 0, mocked: true });
      } finally {
        setReadingBusy(false);
      }
    },
    [readingBusy, reading, collapsed, pendingNext, committed, grainForkReady, forwardEvents, forkContext, day.dayCount, day.crop, day.structureProgress],
  );
  endDayRef.current = endDay;

  // ── wake into the next morning (after the dusk card or the collapse) ──────────────
  const startNextDay = useCallback(() => {
    const next = pendingNext;
    if (!next) return;
    dayRef.current.beginNextDay(next);
    setCommitted({});
    choicesRef.current = [];
    seenAtRef.current = {};
    dwellRef.current = { earn: 0, learn: 0, social: 0, leisure: 0, build: 0 };
    nearSinceRef.current = { cat: null, t: Date.now() };
    betWonRef.current = null;
    petTurnRef.current = 0;
    dayStartRef.current = Date.now();
    setReading(null);
    setCollapsed(false);
    setPendingNext(null);
    setGrainForkReady(false);
  }, [pendingNext]);

  const handleDuskSubmit = useCallback(
    ({ ratings, overall }: { ratings: Record<number, boolean>; overall: number }) => {
      if (!reading) return;
      const rated = reading.statements.map((s, i) => ({ ...s, isMe: ratings[i] }));
      const record = { uid: uidRef.current, ts: Date.now(), overall, specific: rated.filter((s) => !s.control), controls: rated.filter((s) => s.control), recognition: reading.recognition, mocked: reading.mocked };
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
    [reading],
  );

  // ── derived: the nearby station and what it offers right now ───────────────────────
  const near = nearId ? STATION_BY_ID.get(nearId) ?? null : null;
  const showOrient = day.ready && day.dayCount === 0 && !orientGone && !reading && !collapsed;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0e1116] text-stone-200">
      <div ref={mountRef} className="absolute inset-0" />

      {/* top: where you are */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center p-4">
        <div className="rounded-full bg-black/40 px-4 py-1.5 text-xs tracking-wide text-stone-300 backdrop-blur">
          a country that does not exist — no one knows you here, not even you.
        </div>
      </div>

      {/* the first morning's one soft pull (V.4) — no checklist, no quest markers */}
      {showOrient && (
        <div className="pointer-events-none absolute left-1/2 top-16 w-[min(92vw,430px)] -translate-x-1/2 rounded-xl bg-black/40 px-4 py-2.5 text-center text-xs italic leading-relaxed text-stone-300 backdrop-blur">
          your first day here. the light won&apos;t last — see what the island offers.
        </div>
      )}

      {/* the honest return hook: what changed while you were gone (real state only, M5) */}
      {awayChanges.length > 0 && !reading && !collapsed && (
        <div className="pointer-events-none absolute left-1/2 top-16 w-[min(92vw,430px)] -translate-x-1/2 rounded-xl bg-black/45 px-4 py-2.5 text-xs leading-relaxed text-amber-100/85 backdrop-blur">
          {awayChanges.map((c, i) => (
            <p key={i} className="italic">{c}</p>
          ))}
        </div>
      )}

      {/* the diegetic proximity prompt for whatever you're standing beside */}
      {near && !petOpen && !reading && !collapsed && (
        <div className="absolute bottom-24 left-1/2 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/65 p-4 text-center backdrop-blur">
          <StationPrompt
            station={near}
            committed={committed}
            grainForkReady={grainForkReady}
            crop={day.crop}
            structureProgress={day.structureProgress}
            betWon={betWonRef.current}
            onPet={() => setPetOpen(true)}
            onChoose={(id) => commitChoice(near, id)}
            onHarvest={harvestCrop}
            onClearWilted={clearWilted}
            onEnd={() => endDay("campfire")}
            ending={readingBusy}
          />
        </div>
      )}

      {/* pet conversation */}
      {petOpen && !reading && !collapsed && (
        <div className="absolute bottom-6 left-1/2 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-amber-200/80">the small one</span>
            <button onClick={() => setPetOpen(false)} className="text-xs text-stone-400 hover:text-stone-200">leave it</button>
          </div>
          <div className="mb-3 max-h-44 space-y-2 overflow-y-auto pr-1 text-sm">
            {petLines.length === 0 && <p className="italic text-stone-500">it pads over and sits beside you, waiting.</p>}
            {petLines.map((l, i) => (
              <p key={i} className={l.who === "you" ? "text-stone-200" : "italic text-amber-100/90"}>
                {l.who === "you" ? <span className="text-stone-500">you: </span> : null}
                {l.text}
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendToPet()}
              placeholder="say something to it…"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-stone-600 focus:border-amber-200/40"
            />
            <button onClick={sendToPet} disabled={petBusy} className="rounded-lg bg-amber-200/90 px-4 text-sm font-medium text-stone-900 disabled:opacity-50">
              {petBusy ? "…" : "say"}
            </button>
          </div>
        </div>
      )}

      {/* a gentle nudge when nothing is nearby */}
      {!near && !petOpen && !reading && !collapsed && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-4 py-1.5 text-xs text-stone-400 backdrop-blur">
          {sailing
            ? "⛵ the raft is yours — cross the sea to the other islands"
            : "walk with WASD / tap to move"}
        </div>
      )}

      {/* collapse — the day is lost, the world advances, you are never erased (§I.6) */}
      {collapsed && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-[min(94vw,480px)] rounded-2xl border border-white/10 bg-[#12151c] p-6 text-center font-mono">
            <p className="text-sm leading-relaxed text-stone-300">
              the world dims. you fold to the ground where you stand.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              the day is lost — the island went on without you. you will wake weakened,
              and tomorrow runs leaner. nothing you built is taken; nothing about you is forgotten.
            </p>
            <button
              onClick={startNextDay}
              className="mt-6 w-full rounded-xl border border-amber-200/40 py-2.5 text-sm text-amber-200 transition hover:bg-amber-200/10"
            >
              wake
            </button>
          </div>
        </div>
      )}

      {reading && <DuskReading reading={reading} onSubmit={handleDuskSubmit} onNextDay={pendingNext ? startNextDay : undefined} />}
    </div>
  );
}

/** What the station you're standing beside offers right now. */
function StationPrompt({
  station,
  committed,
  grainForkReady,
  crop,
  structureProgress,
  betWon,
  onPet,
  onChoose,
  onHarvest,
  onClearWilted,
  onEnd,
  ending,
}: {
  station: Station;
  committed: Record<string, string>;
  grainForkReady: boolean;
  crop: "none" | "planted" | "ripe" | "wilted";
  structureProgress: number;
  betWon: boolean | null;
  onPet: () => void;
  onChoose: (id: string) => void;
  onHarvest: () => void;
  onClearWilted: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const key = station.interact === "bet" ? DAY_BET.key : station.fork?.key ?? "";
  const done = !!committed[key];

  if (station.interact === "pet") {
    return (
      <button onClick={onPet} className="rounded-full bg-amber-200/90 px-5 py-2 text-sm font-medium text-stone-900 transition hover:bg-amber-100">
        sit with the small one ⏎
      </button>
    );
  }

  if (station.interact === "dwell") {
    return <p className="text-sm italic text-stone-300">{station.hint}</p>;
  }

  if (station.interact === "end") {
    // The fire is ALWAYS willing (Law 2): an undecided fork is a choice the echo reads,
    // never a gate. The day ends when you say so — or when the light does.
    return (
      <div>
        <p className="mb-2 text-sm text-stone-300">the light is going. rest by the fire?</p>
        <button onClick={onEnd} disabled={ending} className="rounded-lg bg-stone-200/90 px-5 py-2 text-sm font-medium text-stone-900 enabled:hover:bg-white disabled:opacity-50">
          {ending ? "the day ends…" : "let the day end"}
        </button>
        <p className="mt-2 text-[11px] italic text-stone-500">whatever is still undecided simply stays undecided.</p>
      </div>
    );
  }

  // ── the grain plot: yesterday's choice landed here ──
  if (station.refId === "grain" && crop === "ripe") {
    return committed.harvest ? (
      <p className="text-sm italic text-stone-400">the plot lies gathered and quiet.</p>
    ) : (
      <div>
        <p className="mb-2 text-sm text-stone-300">the seed you saved has come back as a harvest.</p>
        <button onClick={onHarvest} className="rounded-lg border border-amber-200/40 px-4 py-1.5 text-xs text-amber-200 transition hover:bg-amber-200/10">
          gather it
        </button>
      </div>
    );
  }
  if (station.refId === "grain" && crop === "wilted") {
    return committed.clear_wilted ? (
      <p className="text-sm italic text-stone-400">bare earth, ready again.</p>
    ) : (
      <div>
        <p className="mb-2 text-sm italic text-stone-400">the grain you saved has wilted — left too long between visits.</p>
        <button onClick={onClearWilted} className="rounded-lg border border-white/15 px-4 py-1.5 text-xs text-stone-300 transition hover:bg-white/5">
          clear the stalks
        </button>
      </div>
    );
  }
  if (station.refId === "grain" && crop === "planted") {
    return <p className="text-sm italic text-stone-400">the seed sleeps in the earth. give it a day.</p>;
  }

  // ── the raft, once begun, is work rather than a question ──
  if (station.refId === "raft" && (structureProgress > 0 || committed.start_ship === "start")) {
    return (
      <p className="text-sm italic text-stone-300">
        {structureProgress >= 1 ? "the raft is ready. the sea is yours." : "the raft takes shape, plank by plank — time here builds it."}
      </p>
    );
  }

  // choice / bet
  if (station.interact === "choice" && station.ripeGate && !grainForkReady) {
    return <p className="text-sm italic text-stone-400">a young sprout. it isn&apos;t ready — give it the day.</p>;
  }
  if (done) {
    const chosen = station.options?.find((o) => o.id === committed[key]);
    const outcome =
      station.interact === "bet" && committed[key] === "risky" && betWon !== null
        ? betWon
          ? " the run came back heavy."
          : " the run came back empty."
        : "";
    return (
      <p className="text-sm italic text-stone-400">
        {station.name} — {chosen?.label ?? "decided"}. no taking it back.{outcome}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm text-stone-300">{promptFor(station)}</p>
      <div className="flex justify-center gap-2">
        {station.options?.map((o) => (
          <button key={o.id} onClick={() => onChoose(o.id)} className="rounded-lg border border-white/15 px-4 py-1.5 text-xs text-stone-200 transition hover:border-amber-200/50 hover:bg-white/5">
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function promptFor(st: Station): string {
  switch (st.refId) {
    case "grain":
      return "the grain is ripe — a whole meal now, or seed for a harvest you may not see.";
    case "raft":
      return "an unfinished raft. begin the long work of leaving — or let it lie.";
    case "tidepool":
      return "the tide turns strange. set every trap on one run, or keep a steady line.";
    default:
      return st.name;
  }
}
