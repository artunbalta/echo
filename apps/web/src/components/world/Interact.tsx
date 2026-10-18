"use client";

/**
 * Doing things to the world (DECISIONS C45): one prompt for whatever is within reach, and the act.
 *
 * WHAT IT SHOWS. The nearest thing and what can be done to it — "Fallen log · E Sit · 2 Climb" — and,
 * whenever somebody is near enough to talk to, `T Talk to Jel`. The verbs are the registry's
 * (`@echo/planet` affordances), filtered by what is in your hands: you can only give what you carry,
 * and only pick up with empty hands.
 *
 * WHAT AN ACT IS. The body takes the verb's pose and faces the thing; an act with a length takes that
 * long, with a bar; sitting lasts until you get up. Walking off ends an act — finished if it was done,
 * abandoned if it was not, and both are measured. Then, in this order:
 *   the beat         one line of what happened, whether or not anything is measured;
 *   the hands        what was picked up is carried, what was given is gone;
 *   the echo         the act as a behavioural event (`lib/acts.ts`), only with consent, through the
 *                    same chain the walking goes through — so it moves the posterior and the meter;
 *   the world        an act that leaves a mark or touches somebody goes to `/api/world/act`, which
 *                    records who saw it; the answer says who, and the panel says so ("Haim saw you").
 *
 * WHY IT WAITS FOR THE CARD, for acts that touch somebody. Recording a deed needs a signed id, and
 * minting one waits for the consent question to be answered either way (identity/session's rule).
 * Acts that touch nobody need nothing and are never refused.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ITEMS, PACK_SIZE, RECIPES, bondWith, canMake, packCount, thingName, verbOf, worldDayIndex, worldClock, WORLD_EPOCH, type Deed, type LifeChange, type Pack, type Recipe, type Verb } from "@echo/planet";

import type { AnimalsLayer } from "@/game/world/animalsLayer";
import type { InteractLayer, NearThing } from "@/game/world/interactLayer";
import type { ConsentState, MeasureChain } from "@/game/world/measure";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import type { PlayerLayer } from "@/game/world/playerLayer";
import type { NearVillager, VillagersLayer } from "@/game/world/villagersLayer";
import { measurementFor, recipeVerb, touchesTheWorld, verbsInHand } from "@/lib/acts";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

interface Acting {
  verb: Verb;
  thing: NearThing;
  startedAt: number;
  decisionMs: number;
  /** For making something: which recipe (C47). */
  recipe?: Recipe;
}

/** The stranger themself, as the target of making something. */
const SELF: NearThing = { ref: "self", kind: "self", x: 0, y: 0, sizeM: 0, owners: [], name: "yourself", verbs: [], distanceM: 0 };

const KEYS = ["KeyE", "Digit2", "Digit3", "Digit4"] as const;
const KEY_LABEL = ["E", "2", "3", "4"];

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

const title = (t: NearThing) => (t.kind === "villager" || t.name.startsWith("the ") || t.name.endsWith("grave") ? t.name : thingName(t.kind));

export default function Interact({
  world,
  cell,
  consent,
  chain,
  coarse,
}: {
  world: () => PlanetWorld | null;
  cell: string;
  consent: ConsentState;
  chain: MeasureChain;
  coarse: boolean;
}) {
  const [near, setNear] = useState<NearThing | null>(null);
  const [talkable, setTalkable] = useState<NearVillager | null>(null);
  const [acting, setActing] = useState<Acting | null>(null);
  const [progress, setProgress] = useState(0);
  // The pack is the server's (C47); the hand is which thing in it is held out, for a gift.
  const [pack, setPack] = useState<Pack>({});
  const [carrying, setCarrying] = useState<string | null>(null);
  const [packOpen, setPackOpen] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  // While a conversation is open the panel owns the keys and the bottom of the screen.
  const [talking, setTalking] = useState(false);
  /** The boat the stranger is out in (C45): whose, and where it is moored. */
  const [aboard, setAboard] = useState<{ thing: NearThing; household: number; own?: boolean } | null>(null);
  const aboardRef = useRef(aboard);
  aboardRef.current = aboard;
  /** While aboard: land within reach to step onto, tile coordinates, or null. */
  const [shore, setShore] = useState<{ x: number; y: number } | null>(null);
  const worldRef = useRef(world);
  worldRef.current = world;
  const seenSince = useRef<{ ref: string; at: number } | null>(null);
  const actingRef = useRef<Acting | null>(null);
  actingRef.current = acting;
  const carryingRef = useRef<string | null>(null);
  carryingRef.current = carrying;

  /** Make something (C47): the pack is checked and changed by the server. */
  const makeIt = useCallback(async (recipe: Recipe) => {
    try {
      await ensureIdentity();
      const res = await fetch("/api/player/pack", {
        method: "POST",
        headers: identityHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ op: "make", recipe: recipe.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { pack?: Pack };
      if (data.pack) {
        setPack(data.pack);
        // What was held may have gone into the making.
        const held = carryingRef.current;
        if (held && !((data.pack[held] ?? 0) > 0)) {
          setCarrying(null);
          worldRef.current()?.context().layer<WorldLayer & PlayerLayer>("player")?.setCarrying(false);
        }
      }
    } catch {
      // The making happened in the hands; the pack did not hear of it.
    }
  }, []);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layers = useCallback(() => {
    const ctx = worldRef.current()?.context();
    return {
      interact: ctx?.layer<InteractLayer>("interact") ?? null,
      villagers: ctx?.layer<VillagersLayer>("villagers") ?? null,
      player: ctx?.layer<WorldLayer & PlayerLayer>("player") ?? null,
      ctx: ctx ?? null,
    };
  }, []);

  const say = useCallback((text: string | null, ms = 4200) => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    setLine(text);
    if (text) lineTimer.current = setTimeout(() => setLine(null), ms);
  }, []);

  const deedsRef = useRef<Deed[]>([]);
  /** A dog at your heel (C55): since when, and when you last did anything for it. */
  const heel = useRef<{ id: string | null; since: number; lastKind: number; told: boolean }>({ id: null, since: 0, lastKind: 0, told: false });
  /** Your own deeds here (C49), for the villagers' talk: what they may be saying about you. */
  const refreshDeeds = useCallback(async () => {
    try {
      await ensureIdentity();
      const res = await fetch(`/api/village/deeds?cell=${encodeURIComponent(cell)}`, { headers: identityHeaders() });
      const data = (await res.json().catch(() => ({}))) as { deeds?: unknown[] };
      if (Array.isArray(data.deeds)) {
        layers().villagers?.setDeeds(data.deeds as never);
        deedsRef.current = data.deeds as Deed[];
        // How much each dog has taken to this stranger (C55): the animals layer brings the one that has to their side.
        const today = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
        const bonds = new Map<string, number>();
        for (const d of deedsRef.current) if (d.thing.startsWith("animal:")) bonds.set(d.thing.slice(7), bondWith(deedsRef.current, d.thing.slice(7), today));
        layers().ctx?.layer<AnimalsLayer>("animals")?.setBonds(bonds);
      }
    } catch {
      // the villagers will talk about other things
    }
  }, [cell, layers]);

  /** Tell the world: the deed and the mark, and who saw it. */
  const record = useCallback(
    async (verb: Verb, thing: NearThing, item: string | null) => {
      const { interact, player } = layers();
      const at = interact?.bodyAt();
      if (!at) return;
      try {
        await ensureIdentity();
        const res = await fetch("/api/world/act", {
          method: "POST",
          headers: identityHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ cell, thing: thing.ref, kind: thing.kind, verb: verb.id, at, ...(item ? { item } : {}) }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          seenBy?: string[];
          effect?: { id: string; thing: string; kind: string; day: number; untilDay: number };
          error?: string;
          pack?: Pack;
          met?: { person: string; name: string; words: string }[];
          changes?: LifeChange[];
        };
        if (res.status === 429) {
          say("Enough. The village has seen enough of you for one day.");
          return;
        }
        if (data.error === "pack_full") {
          say(`Your pack is full: ${PACK_SIZE} things. Put something down first (I).`);
          return;
        }
        if (data.error === "not_food") {
          say("It sniffs at it, and turns away.");
          return;
        }
        if (data.error === "not_carried") {
          say("You are not carrying that any more.");
          setCarrying(null);
          player?.setCarrying(false);
          return;
        }
        // The pack, as the server now has it: the new thing in the hand, or the hand empty after a gift.
        if (data.pack) {
          setPack(data.pack);
          if (verb.gives) {
            setCarrying(verb.gives);
            player?.setCarrying(true);
          } else if (verb.needs === "carrying") {
            const left = item && (data.pack[item] ?? 0) > 0 ? item : null;
            setCarrying(left);
            player?.setCarrying(left !== null);
          }
        }
        if (data.effect) interact?.addMark(data.effect as never);
        if (verb.deed) void refreshDeeds();
        // Who saw it matters only for what somebody would think about: cutting a reed is nobody's business.
        const seen = verb.deed ? (data.seenBy ?? []) : [];
        if (seen.length === 1) say(`${seen[0]} saw you.`, 5200);
        else if (seen.length <= 3 && seen.length > 1) say(`${seen.slice(0, -1).join(", ")} and ${seen.at(-1)} saw you.`, 5200);
        else if (seen.length > 3) say(`${seen.slice(0, 3).join(", ")} and ${seen.length - 3} others saw you.`, 5200);
        // The very thing somebody needed (C50): they say so, to your face if they are there.
        if (data.met?.length) {
          const { villagers } = layers();
          const w = worldRef.current();
          const had = w?.region.village?.changes ?? [];
          const fresh = (data.changes ?? []).filter((c) => !had.some((h) => h.id === c.id));
          if (w && fresh.length) w.revillage([...had, ...fresh]);
          for (const m of data.met) {
            const d = villagers?.distanceTo(m.person) ?? null;
            if (d !== null && d < 20) villagers?.say(m.person, m.words);
            else say(`${m.name} will be glad of it.`, 5200);
          }
        }
      } catch {
        // The act happened; the village did not hear of it. Nothing to show the person.
      }
    },
    [cell, layers, say, refreshDeeds],
  );

  const finish = useCallback(
    (abandoned: boolean) => {
      const a = actingRef.current;
      if (!a) return;
      const { interact, player } = layers();
      player?.release();
      setActing(null);
      setProgress(0);
      const heldMs = performance.now() - a.startedAt;
      const done = !abandoned;
      if (done && a.verb.beat) say(a.verb.beat);
      // What goes into the pack, or out of it, is the server's to say (see `record`); making something is too.
      if (done && a.recipe) void makeIt(a.recipe);
      const { ctx, villagers } = layers();
      if (done && a.verb.id === "board" && ctx) {
        // Into the boat, at its mooring, bow to the sea: the dock's heading, in the player's frame.
        const plan = ctx.region.village?.plan;
        const [tx, ty] = ctx.frame.fromLocalM(a.thing.x, a.thing.y);
        player?.board({ x: tx, y: ty }, plan?.dock ? -plan.dock.heading : 0);
        const household = Number(a.thing.ref.split(":")[1]);
        villagers?.lend(household);
        setAboard({ thing: a.thing, household });
      }
      if (done && a.verb.id === "moor" && ctx) {
        const plan = ctx.region.village?.plan;
        const land = plan?.dock ? plan.dock.root : { x: a.thing.x, y: a.thing.y };
        const [tx, ty] = ctx.frame.fromLocalM(land.x, land.y);
        player?.ashore({ x: tx, y: ty });
        villagers?.lend(null);
        setAboard(null);
      }
      // A mark the act leaves on a thing nobody owns is drawn at once; one that touches somebody is
      // drawn when the world has recorded it (the answer carries it).
      if (done && a.verb.effect && a.verb.effect.lastsDays > 0 && !touchesTheWorld({ ...a.verb, effect: null })) {
        const day = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
        interact?.addMark({ id: `local:${a.thing.ref}`, thing: a.thing.ref, kind: a.verb.effect.kind, day, untilDay: day + a.verb.effect.lastsDays });
      }
      // The echo hears of it, finished or not, only with consent (the chain refuses otherwise).
      const at = interact?.bodyAt() ?? { x: a.thing.x, y: a.thing.y };
      // For a dog (C55), the stroke weighs what the bond weighs: a little from a stranger, a lot from a friend.
      const animal = a.thing.ref.startsWith("animal:") ? a.thing.ref.slice(7) : null;
      const bond = animal ? bondWith(deedsRef.current, animal, worldDayIndex(worldClock(WORLD_EPOCH), Date.now())) : 0;
      const amount = a.thing.kind === "dog" ? 0.3 + 0.6 * bond : a.thing.kind === "goat" ? 0.35 : undefined;
      if (done && animal && a.thing.kind === "dog" && a.verb.id !== "shoo") heel.current.lastKind = performance.now();
      const m = measurementFor(a.verb, a.thing, { heldMs, decisionMs: a.decisionMs, abandoned, distanceM: a.thing.distanceM, amount }, interact?.audience(at.x, at.y) ?? 0);
      if (chain.armed()) void chain.emitAction(m.action, m.opts);
      if (done && touchesTheWorld(a.verb) && consent !== "unset") void record(a.verb, a.thing, a.verb.needs === "carrying" ? carryingRef.current : null);
    },
    [chain, consent, layers, record, say],
  );

  const begin = useCallback(
    (verb: Verb, thing: NearThing) => {
      if (actingRef.current) return;
      if (verb.id === "talk") {
        window.dispatchEvent(new CustomEvent("echo:talk"));
        return;
      }
      if (touchesTheWorld(verb) && consent === "unset") {
        say("Answer the card first: what you do here is remembered, and that needs the answer, either way.");
        return;
      }
      const { player, ctx } = layers();
      if (!player || !ctx) return;
      const [tx, ty] = ctx.frame.fromLocalM(thing.x, thing.y);
      player.perform(verb.pose, { x: tx, y: ty });
      const decisionMs = seenSince.current?.ref === thing.ref ? performance.now() - seenSince.current.at : 0;
      setActing({ verb, thing, startedAt: performance.now(), decisionMs });
      say(null);
    },
    [consent, layers, say],
  );

  /** Put what is in the hand back in the pack. */
  /** Making something is an act on yourself: a pose, a length, a measurement (C47). */
  const beginMaking = useCallback(
    (r: Recipe) => {
      if (actingRef.current || consent === "unset") {
        if (consent === "unset") say("Answer the card first: what you carry is kept, and that needs the answer, either way.");
        return;
      }
      const { player } = layers();
      if (!player) return;
      player.perform("build", null);
      setActing({ verb: recipeVerb(r), thing: SELF, startedAt: performance.now(), decisionMs: 0, recipe: r });
      say(null);
    },
    [consent, layers, say],
  );

  const drop = useCallback(() => {
    if (!carrying) return;
    layers().player?.setCarrying(false);
    say(`You put ${ITEMS[carrying]?.name ?? "it"} away.`);
    setCarrying(null);
  }, [carrying, layers, say]);

  /** Throw something out of the pack for good. */
  const discard = useCallback(
    async (item: string) => {
      try {
        await ensureIdentity();
        const res = await fetch("/api/player/pack", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ op: "drop", item }) });
        const data = (await res.json().catch(() => ({}))) as { pack?: Pack };
        if (data.pack) {
          setPack(data.pack);
          if (carrying === item && !(data.pack[item] > 0)) {
            setCarrying(null);
            layers().player?.setCarrying(false);
          }
        }
      } catch {
        // nothing to say
      }
    },
    [carrying, layers],
  );

  // Stepping into a house (C54): a line for it, and — with consent — the way they came in, for the echo.
  useEffect(() => {
    const onEntered = (e: Event) => {
      const d = (e as CustomEvent<{ house: string; how: "invited" | "forced" | "empty"; lived: boolean }>).detail;
      if (!d) return;
      say(
        d.how === "invited"
          ? "You step in. It is warmer than outside, and smells of smoke."
          : d.how === "forced"
            ? "You step over the broken door into somebody's home."
            : "Dust, and the cold of a hearth nobody has lit in years.",
        5200,
      );
      if (!chain.armed()) return;
      const label = d.how === "invited" ? { action: "enter_invited", cue: "G1", channel: "G" } : d.how === "forced" ? { action: "enter_forced", cue: "H5", channel: "H" } : { action: "explore_house", cue: "J6", channel: "J" };
      void chain.emitAction(label.action, {
        cue: label.cue as never,
        channel: label.channel as never,
        polarity: "take",
        raw: { distance: 0, lived: d.lived ? 1 : 0 },
        target: { id: d.house, kind: "structure" },
        contextOverride: { stakes: d.how === "forced" ? "high" : "low", public_or_private: "private", counterpart_status: d.lived ? "stranger" : "none" },
      });
    };
    window.addEventListener("echo:entered", onEntered);
    return () => window.removeEventListener("echo:entered", onEntered);
  }, [chain, say]);

  // The pack, once there is an id to read it under (the card answered, either way).
  useEffect(() => {
    if (consent === "unset") return;
    let live = true;
    void (async () => {
      try {
        await ensureIdentity();
        const res = await fetch("/api/player/pack", { headers: identityHeaders() });
        const data = (await res.json().catch(() => ({}))) as { pack?: Pack };
        if (live && data.pack) setPack(data.pack);
        if (live) void refreshDeeds();
      } catch {
        // no pack to show
      }
    })();
    return () => {
      live = false;
    };
  }, [consent, refreshDeeds]);

  // What is within reach, a few times a second; and the act's clock.
  useEffect(() => {
    const id = setInterval(() => {
      const { interact, villagers, player } = layers();
      const a = actingRef.current;
      if (a) {
        const held = (performance.now() - a.startedAt) / 1000;
        if (a.verb.holdS > 0) {
          setProgress(Math.min(1, held / a.verb.holdS));
          if (held >= a.verb.holdS) return finish(false);
        }
        // Walking is how a person stops. An act with no length (sitting) is FINISHED by getting up.
        if (player?.wantsToMove()) finish(a.verb.holdS > 0);
        return;
      }
      if (aboardRef.current) {
        // In a boat: what matters is the mooring, the shore, and the fish.
        const { ctx } = layers();
        const body = interact?.bodyAt();
        const home = aboardRef.current.thing;
        if (body && ctx) {
          const d = Math.hypot(home.x - body.x, home.y - body.y);
          setNear(d < 6 ? { ...home, distanceM: d } : null);
          let land: { x: number; y: number } | null = null;
          for (let k = 0; k < 12 && !land; k++) {
            const a = (k / 12) * Math.PI * 2;
            const [tx, ty] = ctx.frame.fromLocalM(body.x + Math.cos(a) * 2.5, body.y + Math.sin(a) * 2.5);
            if (ctx.frame.walkableTile(tx, ty)) land = { x: tx, y: ty };
          }
          setShore(land);
        }
        setTalkable(null);
        return;
      }
      // A dog at your heel that you never so much as look at (C55): once a page, the catalogue's K5 —
      // sent as D11 with nothing in it, which is how ingest.py reads `pet_attach` as none.
      const dog = layers().ctx?.layer<AnimalsLayer>("animals")?.following() ?? null;
      const h = heel.current;
      if (dog !== h.id) heel.current = { id: dog, since: performance.now(), lastKind: h.lastKind, told: h.told };
      else if (dog && !h.told && performance.now() - Math.max(h.since, h.lastKind) > 60_000 && chain.armed()) {
        h.told = true;
        void chain.emitAction("ignores_pet", { cue: "D11" as never, channel: "D" as never, polarity: "refuse", raw: { amount: 0, dwell_ms: Math.round(performance.now() - Math.max(h.since, h.lastKind)) }, target: { id: `animal:${dog}`, kind: "pet" }, contextOverride: { stakes: "low", public_or_private: "private", counterpart_status: "none" } });
      }
      const n = interact?.nearest() ?? null;
      if (n && seenSince.current?.ref !== n.ref) seenSince.current = { ref: n.ref, at: performance.now() };
      setNear(n);
      setTalkable(villagers?.nearest() ?? null);
    }, 120);
    return () => clearInterval(id);
  }, [layers, finish]);

  // In a boat the verbs are the boat's own (bringing it back) and fishing over the side.
  const fishing = aboard ? verbOf("dock", "fish") : null;
  const verbs = aboard
    ? [...(near && !aboard.own ? verbsInHand(near.verbs, carrying, true) : []), ...(fishing ? [{ ...fishing, label: "Fish over the side" }] : [])].slice(0, 4)
    : near
      ? verbsInHand(near.verbs, carrying, false, packCount(pack) < PACK_SIZE).slice(0, 4)
      : [];
  // Your own raft, at the water's edge (C47): R launches it.
  const canLaunch = !aboard && (pack.raft ?? 0) > 0 && near?.kind === "water";
  const launch = useCallback(() => {
    const { player, ctx } = layers();
    if (!near || near.kind !== "water" || !player || !ctx) return;
    const [tx, ty] = ctx.frame.fromLocalM(near.x, near.y);
    const body = layers().interact?.bodyAt();
    const heading = body ? Math.atan2(-(near.y - body.y), near.x - body.x) : 0;
    player.board({ x: tx, y: ty }, heading);
    setAboard({ thing: { ...near, ref: "raft", kind: "boat", name: "your raft" }, household: -1, own: true });
    say("It floats. You did not think it would.");
  }, [near, layers, say]);
  const stepAshore = useCallback(() => {
    if (!aboard || !shore) return;
    const { player, villagers } = layers();
    player?.ashore(shore);
    villagers?.lend(null);
    setAboard(null);
    say(aboard.own ? "You drag the raft up the shore." : `You leave the ${aboard.thing.name.replace(/^the /, "")} on the shore. Someone will have to fetch it.`);
  }, [aboard, shore, layers, say]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing() || talking) return;
      if (e.code === "KeyT" && talkable && !actingRef.current) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("echo:talk"));
        return;
      }
      if (e.code === "KeyI" && !actingRef.current) {
        e.preventDefault();
        setPackOpen((o) => !o);
        return;
      }
      if (e.code === "KeyR" && canLaunch && !actingRef.current) {
        e.preventDefault();
        launch();
        return;
      }
      if (e.code === "KeyQ" && aboard && shore && !actingRef.current) {
        e.preventDefault();
        stepAshore();
        return;
      }
      if (e.code === "KeyG" && carrying && !actingRef.current) {
        e.preventDefault();
        drop();
        return;
      }
      const k = KEYS.indexOf(e.code as (typeof KEYS)[number]);
      const target = near ?? (aboard ? { ...aboard.thing, distanceM: 0 } : null);
      if (k >= 0 && target && verbs[k]) {
        e.preventDefault();
        begin(verbs[k], target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, verbs, talkable, carrying, talking, aboard, shore, begin, drop, stepAshore, canLaunch, launch]);

  useEffect(() => {
    const on = (e: Event) => setTalking(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("echo:talking", on);
    return () => window.removeEventListener("echo:talking", on);
  }, []);

  const talkHint = talkable && !(near?.kind === "villager") ? talkable.name.split(" ")[0] : null;
  if (talking) return null;

  return (
    <>
      {acting ? (
        <div data-acting={acting.verb.id} className="pointer-events-none absolute bottom-32 left-1/2 z-30 w-56 -translate-x-1/2 text-center">
          <p className="text-xs text-[#f4e9d0]/85 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]">
            {acting.verb.label}
            {acting.verb.holdS === 0 ? " · move to get up" : ""}
          </p>
          {acting.verb.holdS > 0 ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-[#e8c98a]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
      ) : aboard ? (
        <div data-interact-prompt="aboard" className={`absolute bottom-28 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 ${coarse ? "" : "pointer-events-none"}`}>
          <span className="rounded-full bg-[#16241f]/85 px-3 py-1 text-xs text-[#e4edcd]">In {aboard.thing.name}</span>
          {verbs.map((v, i) =>
            coarse ? (
              <button key={v.id} type="button" onClick={() => begin(v, near ?? { ...aboard.thing, distanceM: 0 })} className="rounded-full bg-[#e2edc8] px-3 py-1.5 text-xs font-medium text-[#213522] shadow">
                {v.label}
              </button>
            ) : (
              <span key={v.id} className="rounded-full bg-[#16241f]/80 px-3 py-1 text-xs text-[#f4e9d0]/85">
                <span className="mr-1.5 rounded bg-[#f4e9d0]/15 px-1.5 py-0.5 font-mono">{KEY_LABEL[i]}</span>
                {v.label}
              </span>
            ),
          )}
          {shore ? (
            coarse ? (
              <button type="button" onClick={stepAshore} className="rounded-full bg-[#e2edc8] px-3 py-1.5 text-xs font-medium text-[#213522] shadow">
                Step ashore
              </button>
            ) : (
              <span className="rounded-full bg-[#16241f]/80 px-3 py-1 text-xs text-[#f4e9d0]/85">
                <span className="mr-1.5 rounded bg-[#f4e9d0]/15 px-1.5 py-0.5 font-mono">Q</span>Step ashore
              </span>
            )
          ) : null}
        </div>
      ) : near || talkHint ? (
        <div data-interact-prompt={near?.ref ?? ""} className={`absolute bottom-28 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 ${coarse ? "" : "pointer-events-none"}`}>
          {near ? (
            <span className="rounded-full bg-[#16241f]/85 px-3 py-1 text-xs text-[#e4edcd]">{title(near)}</span>
          ) : null}
          {verbs.map((v, i) =>
            coarse ? (
              <button key={v.id} type="button" onClick={() => near && begin(v, near)} className="rounded-full bg-[#e2edc8] px-3 py-1.5 text-xs font-medium text-[#213522] shadow">
                {v.label}
              </button>
            ) : (
              <span key={v.id} className="rounded-full bg-[#16241f]/80 px-3 py-1 text-xs text-[#f4e9d0]/85">
                <span className="mr-1.5 rounded bg-[#f4e9d0]/15 px-1.5 py-0.5 font-mono">{KEY_LABEL[i]}</span>
                {v.label}
              </span>
            ),
          )}
          {talkHint ? (
            coarse ? (
              <button type="button" data-talk-prompt onClick={() => window.dispatchEvent(new CustomEvent("echo:talk"))} className="rounded-full bg-[#e2edc8] px-3 py-1.5 text-xs font-medium text-[#213522] shadow">
                Talk to {talkHint}
              </button>
            ) : (
              <span data-talk-prompt className="rounded-full bg-[#16241f]/80 px-3 py-1 text-xs text-[#f4e9d0]/85">
                <span className="mr-1.5 rounded bg-[#f4e9d0]/15 px-1.5 py-0.5 font-mono">T</span>Talk to {talkHint}
              </span>
            )
          ) : null}
        </div>
      ) : null}
      {carrying || packCount(pack) > 0 ? (
        <p data-carrying className="pointer-events-none absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#16241f]/70 px-3 py-1 text-[11px] text-[#f4e9d0]/70">
          {carrying ? `In your hand: ${ITEMS[carrying]?.name ?? carrying}${coarse ? "" : " · G to put it away"} · ` : ""}
          {packCount(pack)}/{PACK_SIZE} in your pack{coarse ? "" : " · I to open it"}
          {canLaunch ? (coarse ? "" : " · R to launch your raft") : ""}
        </p>
      ) : null}
      {packOpen ? (
        <section data-pack className="absolute bottom-28 left-1/2 z-40 w-[min(460px,92vw)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#16241f]/90 p-4 text-[#f4e9d0] shadow-2xl backdrop-blur-xl">
          <header className="mb-2 flex items-baseline justify-between">
            <p className="font-serif text-lg text-[#e4edcd]">Your pack</p>
            <button type="button" onClick={() => setPackOpen(false)} className="text-xs text-white/50 hover:text-white">
              I · close
            </button>
          </header>
          {packCount(pack) === 0 ? <p className="text-sm italic text-white/45">Nothing yet. Pick things up as you go.</p> : null}
          <ul className="space-y-1">
            {Object.entries(pack).map(([id, n]) => (
              <li key={id} className="flex items-center justify-between text-sm">
                <span>
                  {ITEMS[id]?.name ?? id}
                  {n > 1 ? ` ×${n}` : ""}
                </span>
                <span className="flex gap-2 text-xs">
                  <button type="button" data-hold={id} onClick={() => { setCarrying(id); layers().player?.setCarrying(true); setPackOpen(false); }} className="rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20">
                    Hold
                  </button>
                  <button type="button" onClick={() => void discard(id)} className="rounded-full px-2 py-0.5 text-white/50 hover:text-white">
                    Throw away
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs uppercase tracking-widest text-white/40">Make</p>
          <ul className="mt-1 space-y-1">
            {RECIPES.map((r) => {
              const ok = canMake(pack, r);
              return (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className={ok ? "" : "text-white/40"}>
                    {ITEMS[r.makes]?.name ?? r.makes}
                    <span className="ml-2 text-xs text-white/40">{Object.entries(r.needs).map(([id, k]) => `${k} ${id}`).join(", ")}</span>
                  </span>
                  <button
                    type="button"
                    data-make={r.id}
                    disabled={!ok}
                    onClick={() => {
                      if (r.atWater && near?.kind !== "water") {
                        say("That is made at the water's edge.");
                        return;
                      }
                      setPackOpen(false);
                      beginMaking(r);
                    }}
                    className="rounded-full bg-[#e2edc8] px-2.5 py-0.5 text-xs font-medium text-[#213522] disabled:opacity-30"
                  >
                    Make
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {line ? (
        <p data-act-line className="pointer-events-none absolute bottom-44 left-1/2 z-30 w-[min(520px,90vw)] -translate-x-1/2 text-center font-serif text-[15px] text-[#f4e9d0] [text-shadow:0_1px_10px_rgba(0,0,0,.75)]">
          {line}
        </p>
      ) : null}
    </>
  );
}
