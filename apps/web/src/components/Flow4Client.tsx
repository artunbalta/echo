"use client";

/**
 * Flow 4 — "Repeated Games & Trust", the four beats as an isolated slice.
 *
 * The same relationship /flow5 has to /play: a real, playable, drivable proof of the primitive,
 * beside the canonical own-island path where F4 will sit behind the day loop.
 *
 * `?beat=promise|return|exchange|conflict|generosity` selects one beat, `?partner=<id>` names the
 * counterpart, and `?u=<name>` gives a deterministic identity. Bar 2 needs the partner id to vary
 * independently of the player, which is the whole difference between repeated contact and one-shots.
 *
 * THE PROMISE SPANS SESSIONS FOR REAL. `?beat=promise` presses a palm to their post and persists
 * `promisedTo` into island state; `?beat=return` is a DIFFERENT session that loads it back. Between
 * the two the harness can inject a day with the gated clock, so the return is measured after the
 * island has actually aged rather than after a timer.
 *
 * Nothing here reads the measurement. The harness hook exposes only the real player-facing surface
 * (walk, read positions), so every emitted cue still comes from Flow4Trust reacting to real motion
 * and real key presses.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ThreeWorld } from "@/game/ThreeWorld";
import { generateArchipelago } from "@/game/tilemap";
import { Flow4Trust } from "@/game/activities/flow4Trust";
import { resolveUserId } from "@/lib/identity";
import {
  type EntitySnapshot, type BehavioralEvent, type Flow4Beat, type IslandDayState,
} from "@echo/shared";

const BEATS: Flow4Beat[] = ["promise", "return", "exchange", "conflict", "generosity"];

export default function Flow4Client() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ThreeWorld | null>(null);
  const ctrlRef = useRef<Flow4Trust | null>(null);
  const uidRef = useRef("");
  const sessionRef = useRef("");
  const stateRef = useRef<IslandDayState | null>(null);

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
    const beat = (BEATS as string[]).includes(q.get("beat") ?? "")
      ? (q.get("beat") as Flow4Beat) : "exchange";
    const partnerId = q.get("partner") || "f4_partner";
    // `?wronged=0` runs the same four rounds with the same recurring partner and no
    // defection. The matched control for the repetition bar.
    const partnerDefects = q.get("wronged") !== "0";

    let disposed = false;
    let world: ThreeWorld | null = null;

    /** WORLD state, not the posterior. Persisted through the same route and store tieWarmth uses. */
    const saveIsland = (mutate: (s: IslandDayState) => IslandDayState) => {
      const cur = stateRef.current;
      if (!cur) return;
      const next = mutate(cur);
      stateRef.current = next;
      void fetch("/api/island/state", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, state: next }),
      }).catch(() => { /* the beat still plays with no backend */ });
    };

    (async () => {
      let seed = 7;
      try {
        const r = await fetch("/api/island/assign", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }),
        });
        const placement = (await r.json()) as { seed?: number };
        if (typeof placement.seed === "number") seed = placement.seed;
      } catch { /* zero-key offline → default seed */ }
      try {
        const r = await fetch(`/api/island/state?userId=${encodeURIComponent(userId)}`);
        const loaded = (await r.json()) as { state?: IslandDayState };
        if (loaded.state) stateRef.current = loaded.state;
      } catch { /* the promise simply will not persist without a backend */ }
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
      const ctrl = new Flow4Trust({
        world, beat, partnerId, partnerDefects, home, place,
        actorId: () => uidRef.current, sessionId: () => sessionRef.current, send: postEvents,
        addEntity: (snap) => { live.set(snap.id, snap); world!.addEntity(snap); },
        setEntitySprite: (id, url) => {
          const e = live.get(id);
          if (e) live.set(id, { ...e, spriteUrl: url });
          world!.setEntitySprite(id, url);
        },
        onTendTie: (delta) => saveIsland((s) => ({
          ...s,
          tieWarmth: {
            ...s.tieWarmth,
            [partnerId]: Math.max(0, Math.min(1, (s.tieWarmth[partnerId] ?? 0) + delta)),
          },
        })),
        onPromiseMade: () => saveIsland((s) => ({
          ...s, promisedTo: { counterpartId: partnerId, madeAt: Date.now() },
        })),
        onPromiseResolved: () => saveIsland((s) => ({ ...s, promisedTo: null })),
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

      // Test hook, same contract as /flow1's and /flow5's: only the real player-facing surface. It
      // commands nothing the measurement reads; the cues still come from Flow4Trust reacting to real
      // motion and real key presses.
      (window as unknown as { __echo4?: unknown }).__echo4 = {
        walkTo: (x: number, y: number) => world!.setAutoWalk({ x, y }),
        // Stopping where you are. The player-facing equivalent of letting go, and the conflict beat
        // needs it: the reading is the distance you SETTLE at, and a drive that can only aim at a
        // fixed point has to hit a tile that may be blocked by the post or the partner themselves.
        stop: () => world!.setAutoWalk(null),
        self: () => world!.getSelfTile(),
        beat,
        partnerId,
        partnerDefects,
        // what the player can see: the cache is empty and the whisper has said so
        wronged: () => ctrl.wasWronged(),
        home,
        promised: !!stateRef.current?.promisedTo,
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
