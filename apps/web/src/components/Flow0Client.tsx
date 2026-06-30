"use client";

/**
 * Flow 0 — "Waking Alone" (the solitary shore). The canonical front door's first flow
 * (ECHO_level_design_7flows.md §FLOW 0), built to the doc's beat timeline:
 *
 *   t=0      spawn lying on the shore; a 2.5s dawn/camera-tilt reveal. No UI, no goal, no arrow.
 *   t=2.5    a near-transparent WASD/↑←↓→ glyph fades in, fades fully by t=5.5. Giving no
 *            instruction makes time-to-first-input a clean tempo cue → first_move.
 *   t=5.5+   free roam. The geography offers (never prompts) the choices: a worn path east, an
 *            unmarked thicket west, a climbable hill, a tide pool, five strewn objects, one lone
 *            driftwood. Each emits a real BehavioralEvent on USE; leaving F0 without acting emits
 *            its REFUSE/IGNORE twin (non-action is data). Three eggs (horizon, reflection, hollow)
 *            are real curiosity cues. The flow seeps into F1 when 2 regions are visited (tide
 *            recedes, a seed glints) — affordance-seepage, no wall, no "Level 1".
 *
 * Everything routes through the proven /observe/behavioral ingress; the measurement backend is
 * untouched. Runs zero-key: island assignment + island terrain are local, ML moves the posterior
 * when services/ml is up (offline → events still flow, mocked).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PixiWorld } from "@/game/PixiWorld";
import { generateArchipelago } from "@/game/tilemap";
import {
  FLOW0_AFFORDANCES,
  FLOW0_EGGS,
  FLOW0_FIRST_MOVE,
  FLOW0_TO_FLOW1,
  FLOW2_CROSS,
  buildFlow0Event,
  buildFlow2Event,
  type Flow0Affordance,
  type EntitySnapshot,
  type BehavioralEvent,
} from "@echo/shared";

interface LiveResult { delta_mu?: number; mocked?: boolean; cond_key?: string }

export default function Flow0Client() {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PixiWorld | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");
  const sceneReadyAtRef = useRef(0);
  const firstMoveDoneRef = useRef(false);
  const homeRef = useRef<{ x: number; y: number }>({ x: 55, y: 55 });
  const visitedRef = useRef<Set<string>>(new Set());
  const usedRef = useRef<Set<string>>(new Set());
  const eggsRef = useRef<Set<string>>(new Set());
  const transitionedRef = useRef(false);
  const gazeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<"reveal" | "glyph" | "roam">("reveal");
  const [near, setNear] = useState<Flow0Affordance | null>(null);
  const [hillTries, setHillTries] = useState(0);
  const [horizon, setHorizon] = useState(false);
  const [whisper, setWhisper] = useState<string | null>(null);
  const [seeped, setSeeped] = useState(false);

  // ── the instrumentation: one BehavioralEvent → /observe/behavioral (the proven ingress) ──
  const emit = useCallback(
    async (e: Omit<Parameters<typeof buildFlow0Event>[0], "actorId" | "sessionId">) => {
      if (!uidRef.current) return;
      const event: BehavioralEvent = buildFlow0Event({
        actorId: uidRef.current,
        sessionId: sessionRef.current,
        ...e,
      });
      try {
        const res = await fetch("/api/observe/behavioral", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event }),
        });
        const data = (await res.json()) as { results?: LiveResult[]; mocked?: boolean };
        const r = data.results?.[0] ?? {};
        // Reproducible client-side evidence: the cue + how far the posterior moved (no score UI).
        const log = (window as unknown as { __echoFlow0?: unknown[] }).__echoFlow0 ?? [];
        log.push({ action: e.action, polarity: e.polarity ?? "take", delta_mu: r.delta_mu, cond_key: r.cond_key, mocked: data.mocked });
        (window as unknown as { __echoFlow0?: unknown[] }).__echoFlow0 = log;
      } catch {
        /* best-effort — never block the player on telemetry */
      }
    },
    [],
  );

  const visitRegion = useCallback((region: string) => {
    visitedRef.current.add(region);
    maybeSeep();
  }, []);

  // F0 → F1 seepage: 2 regions visited OR elapsed ≥ 210s. Emit IGNORE twins for everything the
  // player never acted on (non-action is data), then the tide recedes and a seed glints.
  const maybeSeep = useCallback(() => {
    if (transitionedRef.current) return;
    const elapsed = Date.now() - sceneReadyAtRef.current;
    if (visitedRef.current.size < FLOW0_TO_FLOW1.minVisitedRegions && elapsed < FLOW0_TO_FLOW1.maxElapsedMs) return;
    transitionedRef.current = true;
    for (const aff of FLOW0_AFFORDANCES) {
      if (!usedRef.current.has(aff.id) && aff.refuseAction) {
        void emit({ channel: aff.channel, cue: aff.cue, action: aff.refuseAction, polarity: "refuse",
                    targetId: aff.id, targetKind: aff.targetKind });
      }
    }
    setSeeped(true);
    setWhisper("the tide pulls back. something glints in the wet sand.");
  }, [emit]);

  // ── mount: assign the island, build its shore, place self + the F0 objects ──────────────────
  useEffect(() => {
    const userId = localStorage.getItem("echo.userId") ?? "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("echo.userId", userId);
    uidRef.current = userId;
    sessionRef.current = "s_" + Math.random().toString(36).slice(2, 10);

    let disposed = false;
    let world: PixiWorld | null = null;

    (async () => {
      // Claim (or recover) this user's home island — slot + deterministic terrain seed.
      let seed = 7;
      try {
        const r = await fetch("/api/island/assign", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const placement = (await r.json()) as { seed?: number };
        if (typeof placement.seed === "number") seed = placement.seed;
      } catch { /* zero-key offline → default seed */ }
      if (disposed) return;

      const map = generateArchipelago(seed);
      const home = map.homeCenter ?? { x: Math.round(map.width / 2), y: Math.round(map.height / 2) };
      homeRef.current = home;
      // Spawn on the south beach of the home island (the doc's center-south shore).
      const spawn = { x: home.x, y: home.y + 5 };
      const affPos = (a: Flow0Affordance) => ({ x: home.x + a.dx, y: home.y + a.dy });

      // Clear a tile around each object + the spawn so terrain never blocks reaching them.
      for (const p of [spawn, ...FLOW0_AFFORDANCES.map(affPos)]) {
        map.decorations = map.decorations.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 1.5);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
            if (x >= 0 && y >= 0 && x < map.width && y < map.height && map.water?.[y * map.width + x] === 0)
              map.collision[y * map.width + x] = 0;
          }
      }

      world = new PixiWorld(
        {
          onNearbyChange: (t) => {
            const aff = t ? FLOW0_AFFORDANCES.find((a) => a.id === t.refId) ?? null : null;
            setNear(aff);
            if (aff) onApproachRegion(aff);
          },
          onMoveIntent: () => onFirstInput(),
        },
        { map, artDir: "/assets/island" },
      );
      worldRef.current = world;

      const self: EntitySnapshot = { id: "player1", kind: "user", refId: userId, name: "you",
        spriteUrl: "", x: spawn.x, y: spawn.y, facing: "up", moving: false };
      const snaps = new Map<string, EntitySnapshot>([["player1", self]]);
      for (const a of FLOW0_AFFORDANCES) {
        const p = affPos(a);
        snaps.set(a.id, { id: a.id, kind: "npc", refId: a.id, name: a.label, spriteUrl: a.sprite,
          x: p.x, y: p.y, facing: "down", moving: false });
      }

      await world.init(mountRef.current!);
      if (disposed) return;
      world.setSelf("player1", spawn.x, spawn.y);
      world.applySnapshot(snaps, 0);

      // Beat timeline: dawn reveal (2.5s) → glyph fades in/out by 5.5s.
      sceneReadyAtRef.current = Date.now();
      setTimeout(() => !disposed && setPhase("glyph"), 2500);
      setTimeout(() => !disposed && setPhase("roam"), 5500);
    })();

    return () => {
      disposed = true;
      if (gazeTimerRef.current) clearTimeout(gazeTimerRef.current);
      world?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── t=first input: the clean tempo cue (the glyph is fading; we never told them to move) ──
  const onFirstInput = useCallback(() => {
    if (firstMoveDoneRef.current) return;
    firstMoveDoneRef.current = true;
    const t = Date.now() - sceneReadyAtRef.current;
    void emit({ channel: FLOW0_FIRST_MOVE.channel, cue: FLOW0_FIRST_MOVE.cue, action: FLOW0_FIRST_MOVE.action,
                targetId: "shore", targetKind: "place", raw: { latency_ms: t } });
  }, [emit]);

  // dwell at the tide pool ≥3s → gaze_reflection, then the one-frame reflection-flicker egg.
  const onApproachRegion = useCallback((aff: Flow0Affordance) => {
    if (aff.id === "tidepool" && !gazeTimerRef.current && !usedRef.current.has("tidepool")) {
      gazeTimerRef.current = setTimeout(() => {
        gazeTimerRef.current = null;
        // egg: the reflection holds a different posture for a frame
        if (!eggsRef.current.has("egg_reflection")) {
          eggsRef.current.add("egg_reflection");
          const egg = FLOW0_EGGS.find((e) => e.id === "egg_reflection")!;
          void emit({ channel: egg.channel, cue: egg.cue, action: egg.action, targetId: "tidepool", targetKind: "place" });
          setWhisper("for a breath, your reflection holds a posture that isn't yours.");
        }
      }, 3000);
    }
  }, [emit]);

  // ── act on whatever you're standing beside (diegetic; the world offers, never commands) ──────
  const use = useCallback(
    (aff: Flow0Affordance, variant?: "stack" | "collect" | "gaze") => {
      usedRef.current.add(aff.id);
      const action = variant === "collect" ? "collect" : aff.action;
      void emit({ channel: aff.channel, cue: aff.cue, action, polarity: "take",
                  targetId: aff.id, targetKind: aff.targetKind, raw: aff.raw });
      visitRegion(aff.region);

      if (aff.id === "thicket" && !eggsRef.current.has("egg_hollow")) {
        eggsRef.current.add("egg_hollow");
        const egg = FLOW0_EGGS.find((e) => e.id === "egg_hollow")!;
        void emit({ channel: egg.channel, cue: egg.cue, action: egg.action, targetId: "hollow", targetKind: "place" });
        setWhisper("deep in the brush: a tiny mark carved into the bark. no reward — just someone was here.");
      }
    },
    [emit, visitRegion],
  );

  // the hill is effortful: each climb may slip; persisting (retrying) is the high-validity grit cue.
  const climb = useCallback(() => {
    const aff = FLOW0_AFFORDANCES.find((a) => a.id === "hill")!;
    const n = hillTries + 1;
    setHillTries(n);
    if (n === 1) {
      usedRef.current.add("hill");
      void emit({ channel: aff.channel, cue: aff.cue, action: "climb_hill", targetId: "hill", targetKind: "place" });
      setWhisper("the slope is loose underfoot. you slip back a step.");
    } else {
      void emit({ channel: aff.channel, cue: aff.cue, action: "climb_persist", targetId: "hill", targetKind: "place" });
      // reaching the top reveals the horizon-island egg (the seed of Flow 2)
      if (!eggsRef.current.has("egg_horizon")) {
        eggsRef.current.add("egg_horizon");
        const egg = FLOW0_EGGS.find((e) => e.id === "egg_horizon")!;
        void emit({ channel: egg.channel, cue: egg.cue, action: egg.action, targetId: "horizon", targetKind: "place" });
        setHorizon(true);
        setWhisper("from the top: across the water, the faint silhouette of another island. someone is out there.");
      }
      visitRegion("hill");
    }
  }, [emit, hillTries, visitRegion]);

  // ── the crossing (F1→F2 seam): leave the private island for the shared ocean ────────────────
  // The decision to cross is itself F2's first, high-validity sociability cue (single actor, no
  // counterpart yet). Then hand off — via client-side nav, no reload/"Level 2" — into the shared
  // Colyseus room where other live players are visible. We carry the userId; the shared scene
  // resolves the same archipelago slot so the player appears at their island's ocean coordinate.
  const cross = useCallback(async () => {
    if (!uidRef.current) return;
    const event: BehavioralEvent = buildFlow2Event({
      actorId: uidRef.current,
      sessionId: sessionRef.current,
      channel: FLOW2_CROSS.channel,
      cue: FLOW2_CROSS.cue,
      action: FLOW2_CROSS.action,
      targetId: "open_water",
      targetKind: "place",
      counterpartStatus: "none",
    });
    try {
      await fetch("/api/observe/behavioral", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ event }),
      });
    } catch { /* best-effort */ }
    router.push("/play/crossing"); // the shared realtime zone, under the canonical /play namespace
  }, [router]);

  // ── presentation ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0b0a12] text-[#f4e9d0]">
      <div
        ref={mountRef}
        className="absolute inset-0 transition-transform duration-[2500ms] ease-out"
        style={{ transform: phase === "reveal" ? "scale(1.18) translateY(-7%)" : "scale(1)" }}
      />

      {/* dawn reveal: a dark veil that lifts over the first 2.5s (the camera tilting up) */}
      <div
        className="pointer-events-none absolute inset-0 bg-[#0b0a12] transition-opacity duration-[2500ms] ease-out"
        style={{ opacity: phase === "reveal" ? 1 : 0 }}
      />

      {/* the near-transparent movement glyph: fades in at t=2.5, gone by t=5.5 */}
      <div
        className="pointer-events-none absolute bottom-10 right-10 transition-opacity duration-1000"
        style={{ opacity: phase === "glyph" ? 0.5 : 0 }}
      >
        <div className="grid grid-cols-3 gap-1 text-[10px] text-[#a06cd5]">
          <span /><span className="rounded border border-[#a06cd5]/50 px-1.5 py-0.5">W</span><span />
          <span className="rounded border border-[#a06cd5]/50 px-1.5 py-0.5">A</span>
          <span className="rounded border border-[#a06cd5]/50 px-1.5 py-0.5">S</span>
          <span className="rounded border border-[#a06cd5]/50 px-1.5 py-0.5">D</span>
        </div>
      </div>

      {/* a single quiet line; never a goal, never a score */}
      {whisper && (
        <div className="pointer-events-none absolute left-1/2 top-10 w-[min(90vw,560px)] -translate-x-1/2 text-center text-sm italic text-[#f4e9d0]/80">
          {whisper}
        </div>
      )}

      {/* the faint horizon island, revealed only from the hilltop (the seed of Flow 2) */}
      {horizon && (
        <div className="pointer-events-none absolute left-0 right-0 top-[22%] flex justify-center">
          <div className="h-6 w-40 rounded-[100%] bg-[#a06cd5]/15 blur-[2px]" />
        </div>
      )}

      {/* the diegetic proximity prompt — what the thing beside you offers right now */}
      {phase === "roam" && near && !seeped && (
        <div className="absolute bottom-24 left-1/2 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/60 p-4 text-center backdrop-blur">
          <p className="mb-3 text-sm italic text-[#f4e9d0]/85">{near.label}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {near.id === "scatter" ? (
              <>
                <PromptBtn onClick={() => use(near, "stack")}>stack them neatly</PromptBtn>
                <PromptBtn onClick={() => use(near, "collect")}>pocket them</PromptBtn>
                <PromptBtn onClick={() => { usedRef.current.add(near.id); void emit({ channel: near.channel, cue: near.cue, action: "ignore_all", polarity: "refuse", targetId: near.id, targetKind: near.targetKind }); visitRegion(near.region); }}>leave them</PromptBtn>
              </>
            ) : near.id === "hill" ? (
              <PromptBtn onClick={climb}>{hillTries === 0 ? "climb it" : "keep climbing"}</PromptBtn>
            ) : near.id === "tidepool" ? (
              <PromptBtn onClick={() => use(near, "gaze")}>look into the water</PromptBtn>
            ) : near.id === "thicket" ? (
              <PromptBtn onClick={() => use(near)}>push through</PromptBtn>
            ) : near.id === "driftwood" ? (
              <PromptBtn onClick={() => use(near)}>go to it</PromptBtn>
            ) : (
              <PromptBtn onClick={() => use(near)}>follow the path</PromptBtn>
            )}
          </div>
        </div>
      )}

      {/* the F0→F1 seep: the tide receded, a seed waits (no notification, no "Level 1"). Once the
          horizon island has been seen, the shallows become crossable — the F1→F2 seam. */}
      {seeped && (
        <div className="absolute bottom-16 left-1/2 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-[#a06cd5]/20 bg-black/55 p-4 text-center backdrop-blur">
          <p className="mb-3 text-sm italic text-[#f4e9d0]/85">
            a seed lies in the wet sand. {horizon ? "across the water, that other island waits." : "the water is shallow here now."}
          </p>
          <button
            onClick={cross}
            className="rounded-lg border border-[#a06cd5]/50 px-4 py-1.5 text-xs text-[#f4e9d0] transition hover:border-[#a06cd5] hover:bg-[#a06cd5]/10"
          >
            wade into the shallows, toward the far shore
          </button>
        </div>
      )}

      {!whisper && phase === "roam" && !near && !seeped && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1.5 text-xs text-[#f4e9d0]/55 backdrop-blur">
          walk with WASD / tap — the shore is yours
        </div>
      )}
    </div>
  );
}

function PromptBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-white/15 px-4 py-1.5 text-xs text-[#f4e9d0] transition hover:border-[#a06cd5]/60 hover:bg-white/5"
    >
      {children}
    </button>
  );
}
