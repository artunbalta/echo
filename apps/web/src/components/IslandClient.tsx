"use client";

/**
 * IslandClient — the single-player Proof-of-Magic island (BUILD-PLAN §5, Phase 0).
 *
 * One irreversible day on a small island with a dog; at dusk the echo reads you back to
 * yourself. The day is DIEGETIC: there is no menu of forks. The choices live in the world —
 * a grain patch that grows ripe, a raft on the shore, the tide pools — and you walk up to them
 * to decide. How you spent the day (the time-share that reveals your priorities) is read from
 * where you actually lingered: the forage bush, the cairn of books, the bedroll, the dog. At
 * the campfire you choose to end the day. Revealed preference from behaviour, not a survey (§3).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { PixiWorld } from "@/game/PixiWorld";
import { TelemetryCollector } from "@/game/telemetry";
import { generateArchipelago, isWater } from "@/game/tilemap";
import type { Facing } from "@echo/shared";
import DuskReading, { type DuskReadingData } from "@/components/DuskReading";
import { markFunnel } from "@/lib/funnel";
import {
  DAY_FORKS,
  DAY_BET,
  choiceMadeEvent,
  forkDeliberationEvent,
  structureProgressEvent,
  leaveIntentEvent,
  allocationEvent,
  resourceBetEvent,
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
  { refId: "berry_bush", sprite: "proc:berry_bush", dx: 4, dy: -4, name: "a berry bush", interact: "dwell", cat: "earn", hint: "you forage — berries for the day" },
  { refId: "book_cairn", sprite: "proc:book_cairn", dx: -4, dy: 4, name: "a cairn of books", interact: "dwell", cat: "learn", hint: "you read the island, the tides, yourself" },
  { refId: "bedroll", sprite: "proc:bedroll", dx: 4, dy: 4, name: "a bedroll", interact: "dwell", cat: "leisure", hint: "you rest a while; the day passes" },
  { refId: "campfire", sprite: "proc:campfire", dx: -3, dy: 3, name: "a cold campfire", interact: "end" },
];
const STATION_BY_ID = new Map(STATIONS.map((s) => [s.refId, s]));
const GROW_MS = 14000; // the grain ripens partway through the day

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

  const [uid, setUid] = useState("");
  const [nearId, setNearId] = useState<string | null>(null);
  const [grainRipe, setGrainRipe] = useState(false);
  const [sailing, setSailing] = useState(false);

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

  const forwardEvents = useCallback(async (events: TelemetryEvent[]) => {
    if (!uidRef.current || !events.length) return { mocked: true };
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
          setNearId(st?.refId ?? null);
          if (t) markFunnel(uidRef.current, "first_nearby");
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
    });

    // The grain ripens partway through the day — then it can be harvested.
    const growTimer = setTimeout(() => {
      if (disposed) return;
      world.setEntitySprite("grain", "proc:grain_ripe");
      world.setEntityName("grain", "ripe grain");
      setGrainRipe(true);
    }, GROW_MS);

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
      clearTimeout(growTimer);
      clearInterval(wander);
      tele.stop();
      world.destroy();
    };
  }, [forwardEvents]);

  // ── pet dialogue (neutral elicitor) ──────────────────────────────────────────────
  const sendToPet = useCallback(async () => {
    const text = draft.trim();
    if (!text || petBusy) return;
    setDraft("");
    const nextLines: PetLine[] = [...petLines, { who: "you", text }];
    setPetLines(nextLines);
    setPetBusy(true);
    markFunnel(uidRef.current, "first_pet_talk");

    const dayDone = ["plant_or_spend", "start_ship", "tide_wager"].every((k) => committed[k]);
    teleRef.current?.emit("pet_talk", { chars: text.length, valence: valence(text), turnIndex: petTurnRef.current++, underStress: !dayDone });

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
  }, [draft, petBusy, petLines, committed]);

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
      choicesRef.current.push({ forkKey: key, option: optId, dayIndex: 0, detail: label });

      const sid = sessionRef.current;
      const secs = Math.round((Date.now() - dayStartRef.current) / 1000);
      const events: TelemetryEvent[] = [];
      if (st.interact === "bet") {
        const side = optId === "risky" ? DAY_BET.risky : DAY_BET.safe;
        events.push(resourceBetEvent(sid, DAY_BET, side));
      } else {
        const fork = st.fork as Fork;
        events.push(choiceMadeEvent(sid, fork, { id: optId, label }, latencyMs));
        events.push(forkDeliberationEvent(sid, fork.key, 0, latencyMs));
        if (fork.key === "start_ship") {
          const leaving = optId === "start";
          events.push(structureProgressEvent(sid, "ship", { started: leaving, finished: false, delta01: leaving ? 0.1 : 0, sessionSeconds: secs }));
          events.push(leaveIntentEvent(sid, { stage: leaving ? "started" : "none", shipProgress01: leaving ? 0.1 : 0, secondsAlone: secs }));
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
    [committed, forwardEvents],
  );

  // ── rest by the fire → the allocation (from where you lingered) → the reading ──────
  const endDay = useCallback(async () => {
    if (readingBusy) return;
    setReadingBusy(true);
    markFunnel(uidRef.current, "reached_dusk");

    // Flush the current lingering, then turn dwell-seconds into the day's time-share.
    const now = Date.now();
    const prev = nearSinceRef.current;
    if (prev.cat) dwellRef.current[prev.cat] += (now - prev.t) / 1000;
    const alloc = dwellRef.current as Allocation;
    const top = (Object.keys(alloc) as AllocCategory[]).reduce((a, b) => (alloc[a] >= alloc[b] ? a : b));
    choicesRef.current.push({ forkKey: "day_hours", option: top, dayIndex: 0, detail: `you spent most of the day on ${top}` });
    const sid = sessionRef.current;
    const events: TelemetryEvent[] = [allocationEvent(sid, alloc)];
    if (alloc.build > 0) events.push(structureProgressEvent(sid, "ship", { delta01: 0.2, sessionSeconds: Math.round((now - dayStartRef.current) / 1000) }));
    await forwardEvents(events);

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
  }, [readingBusy, forwardEvents]);

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
  const choicesDone = ["plant_or_spend", "start_ship", "tide_wager"].filter((k) => committed[k]).length;
  const dayDone = choicesDone === 3;
  const remaining = [
    { key: "plant_or_spend", label: "the grain" },
    { key: "start_ship", label: "the raft" },
    { key: "tide_wager", label: "the tide" },
  ];

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0e1116] text-stone-200">
      <div ref={mountRef} className="absolute inset-0" />

      {/* top: where you are */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center p-4">
        <div className="rounded-full bg-black/40 px-4 py-1.5 text-xs tracking-wide text-stone-300 backdrop-blur">
          a country that does not exist — no one knows you here, not even you.
        </div>
      </div>

      {/* a quiet ledger of the day's three reckonings (no buttons — just what remains) */}
      {!reading && (
        <div className="pointer-events-none absolute right-4 top-16 rounded-xl bg-black/40 px-3 py-2 text-[11px] text-stone-400 backdrop-blur">
          <div className="mb-1 uppercase tracking-widest text-stone-500">the day</div>
          {remaining.map((r) => (
            <div key={r.key} className={committed[r.key] ? "text-amber-200/70 line-through" : ""}>
              {committed[r.key] ? "✓ " : "· "}
              {r.label}
            </div>
          ))}
          <div className="mt-1 text-stone-500">{dayDone ? "rest at the fire to end the day" : "wander — decide as you go"}</div>
        </div>
      )}

      {/* the diegetic proximity prompt for whatever you're standing beside */}
      {near && !petOpen && !reading && (
        <div className="absolute bottom-24 left-1/2 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/65 p-4 text-center backdrop-blur">
          <StationPrompt
            station={near}
            committed={committed}
            grainRipe={grainRipe}
            dayDone={dayDone}
            onPet={() => setPetOpen(true)}
            onChoose={(id) => commitChoice(near, id)}
            onEnd={endDay}
            ending={readingBusy}
          />
        </div>
      )}

      {/* pet conversation */}
      {petOpen && !reading && (
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
      {!near && !petOpen && !reading && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-4 py-1.5 text-xs text-stone-400 backdrop-blur">
          {sailing
            ? "⛵ the raft is yours — cross the sea to the other islands"
            : "walk with WASD / tap to move · find the grain, the raft, the tide"}
        </div>
      )}

      {reading && <DuskReading reading={reading} onSubmit={handleDuskSubmit} />}
    </div>
  );
}

/** What the station you're standing beside offers right now. */
function StationPrompt({
  station,
  committed,
  grainRipe,
  dayDone,
  onPet,
  onChoose,
  onEnd,
  ending,
}: {
  station: Station;
  committed: Record<string, string>;
  grainRipe: boolean;
  dayDone: boolean;
  onPet: () => void;
  onChoose: (id: string) => void;
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
    return dayDone ? (
      <div>
        <p className="mb-2 text-sm text-stone-300">the light is going. rest by the fire?</p>
        <button onClick={onEnd} disabled={ending} className="rounded-lg bg-stone-200/90 px-5 py-2 text-sm font-medium text-stone-900 enabled:hover:bg-white disabled:opacity-50">
          {ending ? "the day ends…" : "let the day end"}
        </button>
      </div>
    ) : (
      <p className="text-sm italic text-stone-400">a cold fire ring. the day isn't done — the grain, the raft, the tide still wait.</p>
    );
  }

  // choice / bet
  if (station.interact === "choice" && station.ripeGate && !grainRipe) {
    return <p className="text-sm italic text-stone-400">a young sprout. it isn't ready — give it the day.</p>;
  }
  if (done) {
    const chosen = station.options?.find((o) => o.id === committed[key]);
    return <p className="text-sm italic text-stone-400">{station.name} — {chosen?.label ?? "decided"}. no taking it back.</p>;
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
