"use client";

/**
 * Flow 1 — "Scarcity, Learning, Solving", the EMBODIED raft build (ECHO_level_design_7flows.md §FLOW 1).
 * The flagship of the embodied-interaction rebuild: an interaction is a *performed* activity, not a
 * button menu. You walk the shore and gather driftwood (how much = thoroughness), stand at the water's
 * edge and HOLD to work it into a raft (deliberation → pace, redo → self-monitoring, persistence → grit,
 * flourish → openness), then push it into the water (the F1→F2 seam). The measurement is the MANNER,
 * sampled continuously and emitted as continuous raw_signals through the proven /observe/behavioral
 * ingress (buildFlow1Event, solo context) — the backend math is untouched.
 *
 * A dedicated slice scene (isolated from the shared-ocean WorldClient) so the primitive can be verified
 * end-to-end before it is seeped into the canonical own-island path. Runs zero-key: island terrain is
 * local; ML moves the posterior when services/ml is up, and the scene never blocks on telemetry.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { PixiWorld } from "@/game/PixiWorld";
import { generateArchipelago, type TileMap } from "@/game/tilemap";
import { RaftBuild, type RaftPhase } from "@/game/activities/raftBuild";
import { LocomotionSampler } from "@/game/activities/sampler";
import { resolveUserId } from "@/lib/identity";
import { RAFT_BUILD, type EntitySnapshot, type BehavioralEvent } from "@echo/shared";

interface LiveResult { delta_mu?: number; mocked?: boolean; cond_key?: string }

export default function Flow1Client() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PixiWorld | null>(null);
  const raftRef = useRef<RaftBuild | null>(null);
  const samplerRef = useRef<LocomotionSampler | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");

  const [whisper, setWhisper] = useState<string | null>(null);
  const [phase, setPhase] = useState<RaftPhase>("gather");
  const [stirred, setStirred] = useState(0);
  const [pickPrompt, setPickPrompt] = useState(false);
  const [counter, setCounter] = useState<{ gathered: number; needed: number } | null>(null);

  // POST a batch of BehavioralEvents to the proven ingress; log reproducible client-side evidence
  // (the cue + how far the posterior moved) and give a diegetic "the mirror stirs" pulse — no score UI.
  const postEvents = useCallback((events: BehavioralEvent[]) => {
    if (!events.length) return;
    void (async () => {
      try {
        const res = await fetch("/api/observe/behavioral", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ events }),
        });
        const data = (await res.json()) as { results?: LiveResult[]; mocked?: boolean };
        const log = (window as unknown as { __echoFlow1?: unknown[] }).__echoFlow1 ?? [];
        (data.results ?? []).forEach((r, i) => {
          log.push({ action: events[i]?.action, delta_mu: r.delta_mu, cond_key: r.cond_key, mocked: data.mocked });
          if ((r.delta_mu ?? 0) > 0.002) setStirred((n) => n + 1);
        });
        (window as unknown as { __echoFlow1?: unknown[] }).__echoFlow1 = log;
      } catch {
        /* best-effort — never block the player on telemetry */
      }
    })();
  }, []);

  useEffect(() => {
    const userId = resolveUserId();
    uidRef.current = userId;
    sessionRef.current = "s_" + Math.random().toString(36).slice(2, 10);

    let disposed = false;
    let world: PixiWorld | null = null;

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
      const spawn = nearestWalkable(map, home.x, home.y + 5);
      // Snap every wood piece + the assembly/launch spots to the nearest WALKABLE LAND tile, so none land
      // in water or on an obstacle (the earlier "unreachable / overlapping" pieces). Dedupe onto distinct
      // tiles so two pieces never stack.
      const used = new Set<string>([`${spawn.x},${spawn.y}`]);
      const snapUnique = (x: number, y: number) => {
        let p = nearestWalkable(map, x, y);
        let guard = 0;
        while (used.has(`${p.x},${p.y}`) && guard++ < 12) p = nearestWalkable(map, p.x + (guard % 2 ? 1 : -1), p.y + (guard % 3 ? 1 : 0));
        used.add(`${p.x},${p.y}`);
        return p;
      };
      const woodPos = RAFT_BUILD.driftwoodOffsets.map((o, i) => {
        const p = snapUnique(home.x + o.dx, home.y + o.dy);
        return { id: `f1_wood_${i}`, x: p.x, y: p.y };
      });
      const assembly = nearestWalkable(map, home.x + RAFT_BUILD.assemblySpot.dx, home.y + RAFT_BUILD.assemblySpot.dy);
      const launch = nearestWalkable(map, home.x + RAFT_BUILD.launchSpot.dx, home.y + RAFT_BUILD.launchSpot.dy);

      // Clear terrain + collision around the spawn, every wood piece, and the assembly/launch spots so
      // the player can always walk to them (mirrors Flow0Client's clearing).
      for (const p of [spawn, assembly, launch, ...woodPos]) {
        map.decorations = map.decorations.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) > 1.5);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
            if (x >= 0 && y >= 0 && x < map.width && y < map.height && map.water?.[y * map.width + x] === 0)
              map.collision[y * map.width + x] = 0;
          }
      }

      world = new PixiWorld({}, { map, artDir: "/assets/island" });
      worldRef.current = world;

      const self: EntitySnapshot = { id: "player1", kind: "user", refId: userId, name: "you",
        spriteUrl: "", x: spawn.x, y: spawn.y, facing: "up", moving: false };
      const snaps = new Map<string, EntitySnapshot>([["player1", self]]);
      for (const w of woodPos) {
        snaps.set(w.id, { id: w.id, kind: "npc", refId: w.id, name: "", spriteUrl: RAFT_BUILD.sprites.driftwood,
          x: w.x, y: w.y, facing: "down", moving: false });
      }

      await world.init(mountRef.current!);
      if (disposed) return;
      world.setSelf("player1", spawn.x, spawn.y);
      world.applySnapshot(snaps, 0);
      // Shrink the driftwood to gatherable (avatar-ish) scale — its committed PNG is 36×75, ~3× the avatar.
      for (const w of woodPos) world.setEntityDisplayHeight(w.id, RAFT_BUILD.displayH.driftwood);

      const raft = new RaftBuild({
        world, selfId: "player1", wood: woodPos, assembly, launch, raftId: "f1_raft", needed: RAFT_BUILD.needed,
        actorId: () => uidRef.current, sessionId: () => sessionRef.current,
        send: postEvents,
        onWhisper: (t) => setWhisper(t),
        onPhase: (p) => setPhase(p),
        onNearWood: (id) => setPickPrompt(!!id),
        onProgress: (g) => setCounter({ gathered: g.gathered, needed: g.needed }),
      });
      raftRef.current = raft;
      raft.start();

      const sampler = new LocomotionSampler({
        world, actorId: () => uidRef.current, sessionId: () => sessionRef.current, send: postEvents, stage: 1,
      });
      samplerRef.current = sampler;
      sampler.start();
    })();

    return () => {
      disposed = true;
      raftRef.current?.abandonIfUnfinished();
      raftRef.current?.dispose();
      samplerRef.current?.stop();
      world?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* the embodied "pick" prompt — walk up to a plank, press to pick it up (no passive walk-over) */}
      {pickPrompt && (phase === "gather" || phase === "ready") && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full border border-[#a06cd5]/30 bg-black/50 px-4 py-1.5 text-xs text-[#f4e9d0]/80 backdrop-blur">
          pick up the driftwood — press <span className="rounded border border-[#a06cd5]/50 px-1.5">space</span>
        </div>
      )}

      {/* the "hold to work" hint appears only while building (diegetic, not a control panel) */}
      {phase === "building" && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-4 py-1.5 text-xs text-[#f4e9d0]/60 backdrop-blur">
          hold [space] to work the wood — as long, or as briefly, as you like
        </div>
      )}
      {(phase === "gather" || phase === "ready") && !pickPrompt && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1.5 text-xs text-[#f4e9d0]/55 backdrop-blur">
          walk with WASD / arrows — find the driftwood along the shore
        </div>
      )}

      {/* the mirror stirs — a faint pulse when an act actually moved the posterior (evidence, not a score) */}
      {stirred > 0 && (
        <div key={stirred} className="pointer-events-none absolute right-8 top-8 h-2 w-2 rounded-full bg-[#a06cd5] shadow-[0_0_12px_4px_rgba(160,108,213,0.6)] animate-ping" />
      )}
    </div>
  );
}

/** Nearest WALKABLE LAND tile to (x,y): land (not open water) and not blocked. Spiral-searches outward so
 *  a driftwood/assembly/launch position that fell in water or on an obstacle snaps to reachable ground. */
function nearestWalkable(map: TileMap, x: number, y: number, maxR = 8): { x: number; y: number } {
  const w = map.width, h = map.height;
  const walk = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    const idx = ty * w + tx;
    const land = !map.water || map.water[idx] === 0;
    const clear = !map.collision || map.collision[idx] === 0;
    return land && clear;
  };
  const rx = Math.round(x), ry = Math.round(y);
  if (walk(rx, ry)) return { x: rx, y: ry };
  for (let r = 1; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // walk the ring at radius r
        if (walk(rx + dx, ry + dy)) return { x: rx + dx, y: ry + dy };
      }
  return { x: rx, y: ry };
}
