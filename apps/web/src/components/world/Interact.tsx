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

import { thingName, verbOf, worldDayIndex, worldClock, WORLD_EPOCH, type Verb } from "@echo/planet";

import type { InteractLayer, NearThing } from "@/game/world/interactLayer";
import type { ConsentState, MeasureChain } from "@/game/world/measure";
import type { PlanetWorld, WorldLayer } from "@/game/world/PlanetWorld";
import type { PlayerLayer } from "@/game/world/playerLayer";
import type { NearVillager, VillagersLayer } from "@/game/world/villagersLayer";
import { measurementFor, touchesTheWorld, verbsInHand } from "@/lib/acts";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

interface Acting {
  verb: Verb;
  thing: NearThing;
  startedAt: number;
  decisionMs: number;
}

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
  const [carrying, setCarrying] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  // While a conversation is open the panel owns the keys and the bottom of the screen.
  const [talking, setTalking] = useState(false);
  /** The boat the stranger is out in (C45): whose, and where it is moored. */
  const [aboard, setAboard] = useState<{ thing: NearThing; household: number } | null>(null);
  const aboardRef = useRef(aboard);
  aboardRef.current = aboard;
  /** While aboard: land within reach to step onto, tile coordinates, or null. */
  const [shore, setShore] = useState<{ x: number; y: number } | null>(null);
  const worldRef = useRef(world);
  worldRef.current = world;
  const seenSince = useRef<{ ref: string; at: number } | null>(null);
  const actingRef = useRef<Acting | null>(null);
  actingRef.current = acting;
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

  /** Tell the world: the deed and the mark, and who saw it. */
  const record = useCallback(
    async (verb: Verb, thing: NearThing) => {
      const { interact } = layers();
      const at = interact?.bodyAt();
      if (!at) return;
      try {
        await ensureIdentity();
        const res = await fetch("/api/world/act", {
          method: "POST",
          headers: identityHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ cell, thing: thing.ref, kind: thing.kind, verb: verb.id, at }),
        });
        const data = (await res.json().catch(() => ({}))) as { seenBy?: string[]; effect?: { id: string; thing: string; kind: string; day: number; untilDay: number }; error?: string };
        if (res.status === 429) {
          say("Enough. The village has seen enough of you for one day.");
          return;
        }
        if (data.effect) interact?.addMark(data.effect as never);
        const seen = data.seenBy ?? [];
        if (seen.length === 1) say(`${seen[0]} saw you.`, 5200);
        else if (seen.length <= 3 && seen.length > 1) say(`${seen.slice(0, -1).join(", ")} and ${seen.at(-1)} saw you.`, 5200);
        else if (seen.length > 3) say(`${seen.slice(0, 3).join(", ")} and ${seen.length - 3} others saw you.`, 5200);
      } catch {
        // The act happened; the village did not hear of it. Nothing to show the person.
      }
    },
    [cell, layers, say],
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
      if (done && a.verb.gives) {
        setCarrying(a.verb.gives);
        player?.setCarrying(true);
      }
      if (done && a.verb.needs === "carrying") {
        setCarrying(null);
        player?.setCarrying(false);
      }
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
      const m = measurementFor(a.verb, a.thing, { heldMs, decisionMs: a.decisionMs, abandoned, distanceM: a.thing.distanceM }, interact?.audience(at.x, at.y) ?? 0);
      if (chain.armed()) void chain.emitAction(m.action, m.opts);
      if (done && touchesTheWorld(a.verb) && consent !== "unset") void record(a.verb, a.thing);
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

  const drop = useCallback(() => {
    if (!carrying) return;
    layers().player?.setCarrying(false);
    say(`You put down the ${carrying}.`);
    setCarrying(null);
  }, [carrying, layers, say]);

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
    ? [...(near ? verbsInHand(near.verbs, carrying, true) : []), ...(fishing ? [{ ...fishing, label: "Fish over the side" }] : [])].slice(0, 4)
    : near
      ? verbsInHand(near.verbs, carrying).slice(0, 4)
      : [];
  const stepAshore = useCallback(() => {
    if (!aboard || !shore) return;
    const { player, villagers } = layers();
    player?.ashore(shore);
    villagers?.lend(null);
    setAboard(null);
    say(`You leave the ${aboard.thing.name.replace(/^the /, "")} on the shore. Someone will have to fetch it.`);
  }, [aboard, shore, layers, say]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing() || talking) return;
      if (e.code === "KeyT" && talkable && !actingRef.current) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("echo:talk"));
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
  }, [near, verbs, talkable, carrying, talking, aboard, shore, begin, drop, stepAshore]);

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
      {carrying ? (
        <p data-carrying className="pointer-events-none absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#16241f]/70 px-3 py-1 text-[11px] text-[#f4e9d0]/70">
          Carrying {carrying}
          {coarse ? "" : " · G to put it down"}
        </p>
      ) : null}
      {line ? (
        <p data-act-line className="pointer-events-none absolute bottom-44 left-1/2 z-30 w-[min(520px,90vw)] -translate-x-1/2 text-center font-serif text-[15px] text-[#f4e9d0] [text-shadow:0_1px_10px_rgba(0,0,0,.75)]">
          {line}
        </p>
      ) : null}
    </>
  );
}
