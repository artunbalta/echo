"use client";

/**
 * Flow 1 — "Scarcity, Learning, Solving", the EMBODIED activities (ECHO_level_design_7flows.md §FLOW 1).
 * An isolated, real, playable slice of the whole flow: the flagship raft build PLUS the rest of F1
 * (plant-vs-eat, gamble cave, marker study, buried-cache dig, the shy creature). Every interaction is a
 * *performed* activity whose MANNER is the measurement (continuous raw_signals through the proven
 * /observe/behavioral ingress), never a button-menu. The shared Flow1Scene orchestrator does the work,
 * so this scene and the canonical /play own-island seep behave identically. Zero-key; procedural
 * animation; the measurement backend is untouched.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ThreeWorld } from "@/game/ThreeWorld";
import { generateArchipelago } from "@/game/tilemap";
import { Flow1Scene } from "@/game/activities/flow1Scene";
import { type RaftPhase } from "@/game/activities/raftBuild";
import { resolveUserId } from "@/lib/identity";
import { type EntitySnapshot, type BehavioralEvent } from "@echo/shared";

interface LiveResult { delta_mu?: number; mocked?: boolean; cond_key?: string }

export default function Flow1Client() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ThreeWorld | null>(null);
  const sceneRef = useRef<Flow1Scene | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");

  const [whisper, setWhisper] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [phase, setPhase] = useState<RaftPhase>("gather");
  const [counter, setCounter] = useState<{ gathered: number; needed: number } | null>(null);
  const [stirred, setStirred] = useState(0);

  // POST a batch of BehavioralEvents to the proven ingress; log reproducible evidence + a diegetic
  // "the mirror stirs" pulse when the posterior actually moves — no score UI.
  const postEvents = useCallback((events: BehavioralEvent[]) => {
    if (!events.length) return;
    void (async () => {
      try {
        const res = await fetch("/api/observe/behavioral", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }),
        });
        const data = (await res.json()) as { results?: LiveResult[]; mocked?: boolean };
        const log = (window as unknown as { __echoFlow1?: unknown[] }).__echoFlow1 ?? [];
        (data.results ?? []).forEach((r, i) => {
          log.push({ action: events[i]?.action, delta_mu: r.delta_mu, cond_key: r.cond_key, mocked: data.mocked });
          if ((r.delta_mu ?? 0) > 0.002) setStirred((n) => n + 1);
        });
        (window as unknown as { __echoFlow1?: unknown[] }).__echoFlow1 = log;
      } catch { /* best-effort — never block the player on telemetry */ }
    })();
  }, []);

  useEffect(() => {
    const userId = resolveUserId();
    uidRef.current = userId;
    sessionRef.current = "s_" + Math.random().toString(36).slice(2, 10);

    let disposed = false;
    let world: ThreeWorld | null = null;

    (async () => {
      let seed = 7;
      try {
        const r = await fetch("/api/island/assign", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }),
        });
        const placement = (await r.json()) as { seed?: number };
        if (typeof placement.seed === "number") seed = placement.seed;
      } catch { /* zero-key offline → default seed */ }
      if (disposed) return;

      const map = generateArchipelago(seed);
      const home = map.homeCenter ?? { x: Math.round(map.width / 2), y: Math.round(map.height / 2) };
      const spawn = { x: home.x, y: home.y + 5 };

      world = new ThreeWorld({}, { map });
      worldRef.current = world;

      // The shared orchestrator computes positions (snapped to walkable land) + the entity snapshots.
      const scene = new Flow1Scene({
        world, map, home,
        actorId: () => uidRef.current, sessionId: () => sessionRef.current, send: postEvents,
        hooks: {
          onWhisper: (t) => setWhisper(t),
          onPrompt: (t) => setPrompt(t),
          onPhase: (p) => setPhase(p),
          onCounter: (g) => setCounter(g),
        },
      });
      sceneRef.current = scene;
      const { snaps } = scene.entities();

      // Clear terrain + collision around the spawn and every placed object so all are reachable.
      for (const p of [spawn, ...snaps.map((s) => ({ x: s.x, y: s.y }))]) {
        map.decorations = map.decorations.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 1.5);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
            if (x >= 0 && y >= 0 && x < map.width && y < map.height && map.water?.[y * map.width + x] === 0)
              map.collision[y * map.width + x] = 0;
          }
      }

      const self: EntitySnapshot = { id: "player1", kind: "user", refId: userId, name: "you",
        spriteUrl: "", x: spawn.x, y: spawn.y, facing: "up", moving: false };
      const snapMap = new Map<string, EntitySnapshot>([["player1", self]]);
      for (const s of snaps) snapMap.set(s.id, s);

      await world.init(mountRef.current!);
      if (disposed) return;
      world.setSelf("player1", spawn.x, spawn.y);
      world.applySnapshot(snapMap, 0);
      scene.begin(); // applies display heights + starts the controllers

      // Test hook (the individuation harness drives the REAL client through this): it exposes only
      // the real player-facing surface — walk the real movement/collision path, read the placed
      // objects' real positions. It commands nothing the measurement reads; every emitted cue still
      // comes from raftBuild/flow1Beats reacting to real motion and real key presses. Harmless in
      // the product: /flow1 is a dev slice, and this just surfaces refs already in the DOM.
      (window as unknown as { __echo?: unknown }).__echo = {
        walkTo: (x: number, y: number) => world!.setAutoWalk({ x, y }),
        self: () => world!.getSelfTile(),
        objects: snaps.map((s) => ({ id: s.id, x: s.x, y: s.y, url: s.spriteUrl })),
        points: () => scene.points(),
        raft: () => scene.raftDebug(),
      };
    })();

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      world?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postEvents]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0b0a12] text-[#f4e9d0]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* a single quiet line; never a goal, never a score */}
      {whisper && (
        <div className="pointer-events-none absolute left-1/2 top-10 w-[min(90vw,560px)] -translate-x-1/2 text-center text-sm italic text-[#f4e9d0]/80">
          {whisper}
        </div>
      )}

      {/* the driftwood counter — how many a raft needs; over-gathering past `needed` is a real cue */}
      {counter && (phase === "gather" || phase === "ready") && (
        <div className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-center backdrop-blur">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#f4e9d0]/50">driftwood</div>
          <div className="mt-1 text-lg tabular-nums text-[#f4e9d0]/90">
            {counter.gathered} <span className="text-[#f4e9d0]/40">/ {counter.needed}</span>
          </div>
          {counter.gathered >= counter.needed && (
            <div className="mt-1 text-[10px] italic text-[#a06cd5]/80">enough — or more</div>
          )}
        </div>
      )}

      {/* the single contextual prompt (raft "pick", or a beat: plant/eat/enter/study/dig) */}
      {prompt && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full border border-[#a06cd5]/30 bg-black/50 px-4 py-1.5 text-xs text-[#f4e9d0]/85 backdrop-blur">
          {prompt}
        </div>
      )}
      {!prompt && (phase === "gather" || phase === "ready") && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1.5 text-xs text-[#f4e9d0]/55 backdrop-blur">
          walk with WASD / arrows — the island is yours to work
        </div>
      )}

      {/* the mirror stirs — a faint pulse when an act actually moved the posterior (evidence, not a score) */}
      {stirred > 0 && (
        <div key={stirred} className="pointer-events-none absolute right-8 top-8 h-2 w-2 rounded-full bg-[#a06cd5] shadow-[0_0_12px_4px_rgba(160,108,213,0.6)] animate-ping" />
      )}
    </div>
  );
}
