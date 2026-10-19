"use client";

/**
 * Walk into your parcel, and, on one cell, walk into the demo (build order step 10, on the layer
 * host from plan §4).
 *
 * The layers, their order and the reasoning for that order live in game/world/parcelWorld.ts, which
 * is the list BOTH shapes of this page build from. What this file owns is the mount: the manifest,
 * the HUD, and the measurement.
 *
 * ONE MOUNT, TWO WORLDS, AND THE DIFFERENCE IS ONE PROP (tasks A3, A5). `stations` is the server's
 * answer to `?stations=slice`, and it is null on every parcel but the demo cell (lib/stationSet.ts,
 * DECISIONS.md C15). Given a set, this mounts the slice with its cave, its campfire, its beats and
 * its reactions; given null, it mounts a parcel, which has none of those and is not pretending to.
 * The demo used to be a second component with its own copy of all of this, and the copy is what
 * made a fourteen metre tree possible in front of the cave: two files, one of them not migrated.
 *
 * IT MEASURES, AND IT ASKS FIRST (task A1). A person walking their own land is being measured
 * exactly as much as a person in the demo, and has the same right to see it and to refuse it, so
 * the whole apparatus is here and not only on the demo cell: one chain for the life of the page,
 * the consent card, the recognition meter, the inspector, and the line in the HUD that says which
 * key opens it. Consent is unset-means-OFF on this path: until somebody says yes, no position is
 * sampled, nothing is buffered, and the walk layer keeps no tally either.
 *
 * THE INSPECTOR IS TOLD WHICH WORLD IT IS IN by which of the two it is handed. With stations there
 * are reactions to show, because there is a fire that answers a posterior. Without them the panel
 * takes the walk tally instead and says plainly that nothing has moved the posterior, which is the
 * truth on ground with no bounded act in it; see Inspector.tsx and DECISIONS.md C15.
 *
 * IT IS PLAYABLE WITH A THUMB (task C23). Looking around always worked on a phone, because the
 * canvas takes pointer events and refuses `touch-action`; everything else was a key nobody has on a
 * phone. So this mount makes one TouchControlHandle, hands it to the world (where game/world/input.ts
 * merges it with the keys into the single InputFrame the mover reads) and to the HUD (where
 * TouchControls draws the thumbstick and the buttons). It is made HERE and not inside either of them
 * because it is the one thing both halves have to be holding the same instance of. It is drawn only
 * on a coarse pointer, and only once the consent question has been answered — the card is a gate
 * standing in the bottom band of a phone screen, which is exactly where a thumb goes.
 *
 * The player layer drives the camera (orbit, terrain collision) from its own update, so no `follow`
 * is passed: PlanetWorld's provisional boom runs after the layers whenever one is set and would
 * overwrite the orbit camera every frame.
 *
 * THE CELL COMES OFF THE URL AND IS NOT CHECKED HERE. It already has one place to fail and one
 * sentence to fail with: PlanetWorld's constructor resolves the spawn before it allocates anything,
 * WorldCanvas catches the throw into its "failed" phase, and what a person reads is the message the
 * throw carried. An all-ocean cell such as 8400403ffffffff under the shipped seed gives up after
 * about 40 ms, because `spawnPointFor` stops at depth 5 rather than searching forever, and says
 * "The ground could not be built: 8400403ffffffff has no dry ground to spawn on". A second guard
 * here would only be a second thing to keep true, so the HUD below is still just the name of the
 * place and the controls.
 *
 * The one arbitrary cell that hangs instead of failing is a cell too COARSE to be a parcel. The
 * registry deals in resolutions 4 through 7; a resolution 1 commons cell in the URL builds a 40 km
 * disk whose biome mask alone is 63.6 M samples against a parcel's 172 k. That was already true
 * when this route was terrain and a player, so it is the route's input that wants a guard, not this
 * list, but nobody should discover it from a spinner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CROSSING, cellAtLocal, outsideBy, type Home, type LifeChange, type Look, type WorldEffect } from "@echo/planet";

import ConsentCard from "@/components/world/ConsentCard";
import TouchControls from "@/components/world/TouchControls";
import Inspector, { useMeasureChain, type ReactionReading } from "@/components/world/Inspector";
import Minimap from "@/components/world/Minimap";
import RecognitionMeter from "@/components/world/RecognitionMeter";
import Mirror from "@/components/world/Mirror";
import Director from "@/components/world/Director";
import Interact from "@/components/world/Interact";
import Gatherings from "@/components/world/Gatherings";
import SoundToggle from "@/components/world/SoundToggle";
import VillagerTalk from "@/components/world/VillagerTalk";
import WorldCanvas from "@/components/world/WorldCanvas";
import { createMeasureChain, type MeasureChain } from "@/game/world/measure";
import { parcelLayers, sliceOptionsFor } from "@/game/world/parcelWorld";
import { createTouchControls } from "@/game/world/touchInput";
import { useCoarsePointer } from "@/lib/pointerKind";
import type { InteractLayer } from "@/game/world/interactLayer";
import type { PlayerLayer } from "@/game/world/playerLayer";
import { carryHandoff } from "@/game/world/crossTo";
import type { HomeLayer } from "@/game/world/homeLayer";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import type { SliceLayer } from "@/game/world/sliceLayer";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import type { WalkLayer } from "@/game/world/walkLayer";
import type { StationSet } from "@/lib/stationSet";

export interface ParcelCanvasProps {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  /** Ring count of the built disk; 1 is the cell and its six neighbours. */
  k?: number;
  /** The world's commons cells, which a settled parcel needs to build its village (DECISIONS C41). */
  commons?: readonly string[];
  /**
   * The furniture this cell is allowed to stand, as the SERVER resolved it. Null is an ordinary
   * parcel and is the only answer any cell but the demo cell can get, whatever the URL asked for.
   */
  stations?: StationSet | null;
}

export default function ParcelCanvas({ stations = null, ...manifest }: ParcelCanvasProps) {
  // One chain for the life of the page. It arms itself if this browser has already consented.
  //
  // It is deliberately never disposed. Disposal is the right thing on a real unmount, and it is
  // what /play does, but React StrictMode unmounts and remounts the effects while this useMemo
  // keeps the same instance, so a cleanup that disposed would leave every development mount
  // holding a dead chain. What is left running is the collector's 2 s interval, which flushes an
  // empty buffer and sends nothing.
  const chain = useMemo<MeasureChain>(() => createMeasureChain(), []);
  const { posterior, log, consent } = useMeasureChain(chain);

  // One handle for the life of the page, for the same reason the chain is: the world is built with
  // it once, and a new instance would leave the HUD writing into something nothing reads.
  const touch = useMemo(() => createTouchControls(), []);
  const coarse = useCoarsePointer();
  // The inspector's open state lives here now, so a backtick and a thumb reach ONE piece of state.
  const [inspecting, setInspecting] = useState(false);

  // Both of these stay empty for the life of an ordinary parcel: only the slice emits them, and
  // there is no slice unless the server said there could be one.
  const [reactions, setReactions] = useState<ReactionReading[]>([]);
  const [beat, setBeat] = useState<string | null>(null);
  const onReaction = useCallback((r: ReactionReading) => {
    setReactions((prev) => [...prev.filter((p) => p.channel !== r.channel), r]);
  }, []);

  // The world, so the panel can ask the walk layer what it has measured. It is read from the
  // world's own layer registry rather than from a reference kept here, so this cannot go on naming
  // a layer the list stopped building.
  const world = useRef<PlanetWorld | null>(null);
  const walk = useCallback(() => world.current?.context().layer<WalkLayer>("walk")?.tally() ?? null, []);

  const layers = useCallback(
    (built: PlanetWorld): WorldLayer[] => {
      const list = parcelLayers({ chain, touch, slice: sliceOptionsFor(stations, { onReaction, onBeat: setBeat }) });
      // A handle for the browser tests, and for anyone debugging in a console. Never in a
      // production bundle: the demo must not carry a way to move the player it did not earn.
      // The two layers are read out of the world's own registry, so this cannot go on naming
      // something the list stopped building, and it is only ever attached where there is a slice
      // for it to name.
      if (stations && process.env.NODE_ENV !== "production") {
        (window as unknown as { __demo?: unknown }).__demo = {
          world: built,
          chain,
          get player() {
            return built.context().layer<PlayerLayer>("player");
          },
          get slice() {
            return built.context().layer<SliceLayer>("slice");
          },
        };
      }
      return list;
    },
    [chain, touch, stations, onReaction],
  );

  // The village's changes (C44), fetched BEFORE the world is built so the browser generates the same
  // people the talk route does. One small request; a parcel with no commons has no village and does
  // not wait, and a request that fails or takes too long builds the seed's village, as the route would.
  const hasVillage = Boolean(manifest.commons);
  const [changes, setChanges] = useState<readonly LifeChange[] | null>(hasVillage ? null : []);
  // The marks acts have left (C45), from the same request: drawn by the interact layer once it exists.
  const marks = useRef<readonly WorldEffect[]>([]);
  useEffect(() => {
    if (!hasVillage) return;
    let live = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    fetch(`/api/village/changes?cell=${encodeURIComponent(manifest.cell)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { changes?: LifeChange[]; effects?: WorldEffect[] } | null) => {
        if (!live) return;
        marks.current = Array.isArray(d?.effects) ? d.effects : [];
        setChanges(Array.isArray(d?.changes) ? d.changes : []);
      })
      .catch(() => {
        if (live) setChanges([]);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      ctl.abort();
      clearTimeout(timer);
    };
  }, [manifest.cell, hasVillage]);

  // ── crossing to the next parcel by raft (C57) ─────────────────────────────────────
  // The parcel the person is in now. It starts as the page's and moves when a raft crosses; the
  // world canvas keeps the page's, so it never rebuilds — the crossing hands it a successor instead.
  const [here, setHere] = useState(manifest.cell);
  /** Whose shore it is, once a raft has brought the person to one that is not the page's. */
  const [hereName, setHereName] = useState<string | null>(null);
  const adopt = useRef<((next: PlanetWorld) => void) | null>(null);
  useEffect(() => {
    type Job = { cell: string; next: PlanetWorld | null; dropped: boolean };
    let job: Job | null = null;
    let live = true;
    const drop = () => {
      if (!job) return;
      job.dropped = true;
      job.next?.dispose();
      job = null;
    };
    const prepare = async (j: Job, from: PlanetWorld) => {
      // The next parcel's village as conversations have changed it, and its marks, as on a first visit.
      let changesThere: LifeChange[] = [];
      let marksThere: WorldEffect[] = [];
      try {
        const r = await fetch(`/api/village/changes?cell=${encodeURIComponent(j.cell)}`);
        const d = r.ok ? ((await r.json()) as { changes?: LifeChange[]; effects?: WorldEffect[] }) : null;
        changesThere = Array.isArray(d?.changes) ? d.changes : [];
        marksThere = Array.isArray(d?.effects) ? d.effects : [];
      } catch {
        // The seed's village: what a first visit would see if the store were down.
      }
      if (j.dropped || !live) return;
      const next = from.successor({ cell: j.cell, changes: changesThere });
      j.next = next;
      for (const layer of parcelLayers({ chain, touch })) next.addLayer(layer);
      try {
        await next.start();
      } catch {
        if (job === j) drop();
        return;
      }
      if (j.dropped || !live || job !== j || world.current !== from) {
        if (job === j) drop();
        else next.dispose();
        return;
      }
      // The body, the raft, its speed and the eye behind it, carried into the next frame.
      const fromPlayer = from.context().layer<PlayerLayer>("player");
      const toPlayer = next.context().layer<PlayerLayer>("player");
      const carried = fromPlayer && toPlayer ? carryHandoff(fromPlayer.handOff(), from.frame, next.frame) : null;
      if (!carried || !toPlayer || !fromPlayer?.onRaft()) {
        drop();
        return;
      }
      toPlayer.adopt(carried);
      next.context().layer<InteractLayer>("interact")?.setMarks(marksThere);
      job = null;
      // In one task: the old world gives up the renderer and goes, the new one starts drawing.
      from.handOver(next);
      from.dispose();
      chain.breakPath();
      next.wake();
      adopt.current?.(next);
      setHere(j.cell);
      setHereName(next.region.village?.settlement.name ?? "Another shore");
      try {
        window.history.replaceState(window.history.state, "", `/parcel/${j.cell}${window.location.search}`);
      } catch {
        // The address is a convenience; the crossing has happened either way.
      }
    };
    const watch = setInterval(() => {
      const from = world.current;
      if (!from || from.phase !== "ready") return;
      const ctx = from.context();
      const player = ctx.layer<PlayerLayer>("player");
      if (!player) return;
      const at = player.position();
      const [xm, ym] = ctx.frame.toLocalM(at.x, at.y);
      // Only the stranger's own raft crosses, and only once it is well past the line.
      const want = player.onRaft() && outsideBy(ctx.frame.patch, xm, ym) >= CROSSING.intoM ? cellAtLocal(ctx.frame.patch, xm, ym) : null;
      if (job && job.cell !== want) drop();
      if (!want || job) return;
      job = { cell: want, next: null, dropped: false };
      void prepare(job, from);
    }, 400);
    return () => {
      live = false;
      clearInterval(watch);
      drop();
    };
  }, [chain, touch]);

  // ── your own land and house (C59) ─────────────────────────────────────────────────
  // Whose land this is and what stands on it, asked of the home route for the parcel the person is
  // on now, and handed to whichever world is showing it. Before the consent card is answered there
  // is no identity to ask with, so it asks again once there is.
  const homeState = useRef<{ cell: string; home: Home | null; owner: boolean; look: Look | null } | null>(null);
  const [owned, setOwned] = useState(false);
  const applyHome = useCallback((w: PlanetWorld | null) => {
    const st = homeState.current;
    if (!w || !st || w.region.cell !== st.cell) return;
    w.context().layer<HomeLayer>("home")?.setHome({ home: st.home, owner: st.owner });
    if (st.look) w.context().layer<PlayerLayer>("player")?.setLook(st.look);
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (consent !== "unset") await ensureIdentity();
        const r = await fetch(`/api/home?cell=${encodeURIComponent(here)}`, { headers: consent !== "unset" ? identityHeaders() : {} });
        const d = r.ok ? ((await r.json()) as { owner?: boolean; home?: Home | null; look?: Look | null }) : null;
        if (!live || !d) return;
        homeState.current = { cell: here, home: d.home ?? null, owner: Boolean(d.owner), look: d.look ?? null };
        setOwned(Boolean(d.owner));
        applyHome(world.current);
      } catch {
        // No house to show; the land is still the land.
      }
    })();
    return () => {
      live = false;
    };
  }, [here, consent, applyHome]);

  if (changes === null) return <div className="relative h-full w-full" data-phase="changes" />;

  return (
    <WorldCanvas
      {...manifest}
      changes={changes}
      layers={layers}
      onWorld={(w, adoptNext) => {
        const first = world.current === null;
        world.current = w;
        adopt.current = adoptNext;
        // The page's own marks go on the page's own world; a crossed-into world brought its own.
        if (first) w?.context().layer<InteractLayer>("interact")?.setMarks(marks.current);
        if (first && w) setHereName(w.region.village?.settlement.name ?? null);
        applyHome(w);
      }}
      className="relative h-full w-full"
    >
      {/* data-stations is the one place the server's answer is legible without a GL context, the
          way WorldCanvas exposes data-phase. It says "none" rather than going missing, because an
          absent attribute cannot tell a parcel with no stations apart from a HUD that has not
          rendered yet, and the thing worth testing is precisely that a refused parameter left
          this saying "none". */}
      {/* On a narrow screen this moves OUT of the bottom-left corner, because that corner is where
          a left thumb goes and a 366 px card there is 94% of the width. It stacks into the top-left
          column instead, under the meter, and the whole card is `max-sm:` — a WIDTH question, which
          CSS can answer on its own, and deliberately not the coarse-pointer question, which decides
          something else (whether the controls exist at all) and is asked in JavaScript. */}
      <div
        data-stations={stations ?? "none"}
        className="pointer-events-none absolute bottom-6 left-6 rounded-2xl border border-white/15 bg-[#192a20]/75 px-5 py-4 text-xs text-[#f4f2e4]/80 backdrop-blur-xl max-sm:bottom-auto max-sm:left-3 max-sm:top-[5.5rem] max-sm:w-[58vw] max-sm:rounded-xl max-sm:px-3 max-sm:py-2"
      >
        <p className="font-serif text-xl text-[#e4edcd] max-sm:text-base">{owned ? "Your corner of the world" : (hereName ?? "Open land")}</p>
        <p className="mt-1 text-[10px] tracking-widest text-white/40" data-here={here}>{here}</p>
        {/* The legend has to be true on the device reading it. It said Shift and Space to people
            holding a phone, which is the one instruction on the route. */}
        <p className="mt-2 text-[#f4e9d0]/45 max-sm:text-[10px] max-sm:leading-relaxed">
          {coarse
            ? "Stick · Walk　 Push far · Run　 Drag · Look　 Pinch · Zoom"
            : "W A S D · Walk　 Shift · Run　 Space · Jump　 Drag · Look"}
        </p>
        <p className="mt-1 text-[#f4e9d0]/30 max-sm:text-[10px]">
          {coarse ? "` opens the inspector, and so does the button" : "` opens the inspector"}
        </p>
      </div>

      {/* The beat's line, and nothing that names what to look for: the slice is judged on whether
          a person notices the consequence unprompted. */}
      {beat ? (
        <p className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 font-pixel text-sm text-[#f4e9d0]/80 max-sm:bottom-[13rem] max-sm:w-[80vw] max-sm:text-center [text-shadow:0_1px_12px_rgba(18,12,25,0.9)]">
          {beat}
        </p>
      ) : null}

      {/* Where you are in your parcel and where the parcel is on the planet. It reads the world
          out of the same ref the walk tally does, so it can never be handed a world this mount is
          not showing. */}
      <Minimap world={() => world.current} />

      <ConsentCard consent={consent} onAccept={() => chain.accept()} onDecline={() => chain.decline()} />

      {/* Talking to a villager, where the cell has a village (C42). It reads the villagers layer out of
          the same ref the minimap does, so a parcel with no village simply never shows it. */}
      <VillagerTalk world={() => world.current} cell={here} consent={consent} coarse={coarse} />

      {/* Everything within reach, and the act (C45): one prompt, the registry's verbs, the echo and
          the village told. It opens the conversation above with `T`. */}
      <Interact world={() => world.current} cell={here} consent={consent} chain={chain} coarse={coarse} />
      <Gatherings world={() => world.current} cell={here} consent={consent} chain={chain} />
      {/* Now and then, the one encounter that would teach the echo most (C63), only with consent. */}
      <Director world={() => world.current} cell={here} consent={consent} chain={chain} />
      {/* The sound of the place (C56), and the person's say over it. */}
      <SoundToggle world={() => world.current} />

      {/* The one thing a person can read without knowing a key exists. It is handed the same chain
          state the inspector gets, so the glance and the panel cannot disagree; what it may say
          about it is decided in recognitionReading.ts. */}
      <RecognitionMeter posterior={posterior} log={log} consent={consent} />
      {/* How the echo sees you and what moved it, with your say over it (C61): `Y`, or the meter. */}
      <Mirror consent={consent} onAccept={() => chain.accept()} onRevoke={() => chain.revoke()} />

      {/* Exactly one of these two is ever passed, and which one IS the mode: reactions where there
          are stations to react, the walk tally where there are none. */}
      <Inspector
        posterior={posterior}
        log={log}
        consent={consent}
        onRevoke={() => chain.revoke()}
        reactions={stations ? reactions : undefined}
        walk={stations ? undefined : walk}
        open={inspecting}
        onOpenChange={setInspecting}
      />

      {/* Last, so it paints over the HUD it shares a screen with, and only where there is a thumb to
          use it. The consent card is answered first: see the header. */}
      {coarse && consent !== "unset" ? (
        <TouchControls
          handle={touch}
          inspecting={inspecting}
          onToggleInspector={() => setInspecting((v) => !v)}
        />
      ) : null}
    </WorldCanvas>
  );
}
