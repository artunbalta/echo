"use client";

/**
 * Flow 5 — "Pressure & the Unobserved Self", the EMBODIED probes as an isolated slice.
 *
 * The same relationship /flow1 has to /play: a real, playable, drivable proof of the primitive before
 * and beside the canonical own-island path. It exists for the same reason /flow1 does, and it is what
 * the F5 individuation harness drives, because the canonical probes sit behind the day loop
 * (`day.ready && day.dayCount >= 1`) which is not a thing a capture can reliably reach.
 *
 * `?probe=gull|cache` and `?privacy=public|private` select the beat and the condition, so the two
 * acceptance bars can drive exactly one cell at a time. `?u=<name>` gives a deterministic identity.
 * Defaults match the canonical path's own defaults.
 *
 * Nothing here reads the measurement. The harness hook exposes only the real player-facing surface
 * (walk, read positions), so every emitted cue still comes from Flow5Probes reacting to real motion
 * and real key presses.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ThreeWorld } from "@/game/ThreeWorld";
import { generateArchipelago } from "@/game/tilemap";
import { Flow5Probes, type ProbeKind } from "@/game/activities/flow5Probes";
import { resolveUserId } from "@/lib/identity";
import { type EntitySnapshot, type BehavioralEvent } from "@echo/shared";

export default function Flow5Client() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ThreeWorld | null>(null);
  const ctrlRef = useRef<Flow5Probes | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");

  const [whisper, setWhisper] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const postEvents = useCallback((events: BehavioralEvent[]) => {
    if (!events.length) return;
    void fetch("/api/observe/behavioral", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }),
    }).catch(() => { /* best-effort; never block the player */ });
  }, []);

  useEffect(() => {
    const userId = resolveUserId();
    uidRef.current = userId;
    sessionRef.current = "s_" + Math.random().toString(36).slice(2, 10);
    const q = new URLSearchParams(window.location.search);
    const probe: ProbeKind = q.get("probe") === "cache" ? "cache" : "gull";
    const privacy: "public" | "private" = q.get("privacy") === "public" ? "public" : "private";

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
      const spawn = { x: home.x, y: home.y + 4 };

      world = new ThreeWorld({}, { map });
      worldRef.current = world;

      const lim = 11;
      const place = (dx: number, dy: number) => {
        const m = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, lim / m);
        return { x: home.x + dx * k, y: home.y + dy * k };
      };

      const live = new Map<string, EntitySnapshot>();
      const ctrl = new Flow5Probes({
        world, probe, privacy, home, place,
        actorId: () => uidRef.current, sessionId: () => sessionRef.current, send: postEvents,
        addEntity: (snap) => { live.set(snap.id, snap); world!.addEntity(snap); },
        setEntitySprite: (id, url) => {
          const e = live.get(id);
          if (e) live.set(id, { ...e, spriteUrl: url });
          world!.setEntitySprite(id, url);
        },
        onWhisper: (t) => setWhisper(t),
        onPrompt: (t) => setPrompt(t),
      });
      ctrlRef.current = ctrl;
      const snaps = ctrl.entities();
      for (const s of snaps) live.set(s.id, s);

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
      ctrl.start();

      // Test hook, same contract as /flow1's: only the real player-facing surface. It commands
      // nothing the measurement reads; the cues still come from Flow5Probes reacting to real motion.
      (window as unknown as { __echo5?: unknown }).__echo5 = {
        walkTo: (x: number, y: number) => world!.setAutoWalk({ x, y }),
        self: () => world!.getSelfTile(),
        probe,
        privacy,
        home,   // so a drive can walk back INLAND; the shore side is water and unreachable
        objects: snaps.map((s) => ({ id: s.id, x: s.x, y: s.y, url: s.spriteUrl })),
      };
    })();

    return () => {
      disposed = true;
      ctrlRef.current?.dispose();
      world?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postEvents]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0b0a12] text-[#f4e9d0]">
      <div ref={mountRef} className="absolute inset-0" />
      {whisper && (
        <div className="pointer-events-none absolute left-1/2 top-10 w-[min(90vw,560px)] -translate-x-1/2 text-center text-sm italic text-[#f4e9d0]/80">
          {whisper}
        </div>
      )}
      {prompt && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full border border-[#a06cd5]/30 bg-black/50 px-4 py-1.5 text-xs text-[#f4e9d0]/85 backdrop-blur">
          {prompt}
        </div>
      )}
      {!prompt && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1.5 text-xs text-[#f4e9d0]/55 backdrop-blur">
          walk with WASD / arrows
        </div>
      )}
    </div>
  );
}
