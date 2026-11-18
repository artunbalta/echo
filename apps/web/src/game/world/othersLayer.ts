/**
 * The other people in a village room (DECISIONS C101), drawn as the villagers are, and this body's pose
 * sent to them.
 *
 * THE SAME BODIES AS THE VILLAGE'S. A person who came in through the room's door is drawn by the crowd
 * (`crowd.ts`), with a look from the villagers' own trades, ages and dress (`roomLookOf`, `lookFor`), at
 * the villagers' gait. Nothing about a body says whether it is a villager or someone who came in: no
 * colour of its own, no mark over it. The nameplate is the villagers' plate (`fillPlate`), shown at the
 * same distance a villager's is, and says what a visitor's says (C107): a name in the village's own
 * tongue drawn from the body's look, "age · trade", and "here for the day from another village, visiting"
 * one of its people (`villagersLayer` `visitor`). No name typed at a door is anywhere on it.
 *
 * TALKING (C107). Whoever is nearest, villager or someone who came in, is the one `T` talks to
 * (`nearestToTalk`), in the same panel (`VillagerTalk`). A line said to this body alone shows over the
 * one who said it as any line does, unless a conversation with them is open, where it shows in the panel
 * instead, as a villager's answer does.
 *
 * WHAT IS SENT. Ten times a second (`ROOM.poseHz`) this body's place in planet-local metres, its yaw,
 * its speed and what it is doing, read from the player layer. Out of the village (a raft has taken it
 * to another shore, the world is a different cell), it says it is away once and sends nothing more.
 *
 * WHAT IS SAID by someone near shows over their head as a villager's line does, for a few seconds;
 * this body's own line shows over its own head.
 *
 * COMING BACK to a body your echo kept (C104), this body takes its place where that one stands, rather than
 * that one walking over to wherever the page came in.
 *
 * NOBODY WALKS THROUGH A PERSON (C46, C107), whoever moves them: a body that came in stops this one as a
 * villager's does (`blockedTile`, which the player's gate asks). Two who came in at the same spot can still
 * walk apart: only a step closer into someone is refused.
 *
 * THE LAYER KNOWS NOTHING OF WHO IS WATCHING: it draws what the room says and sends what the body does.
 */
import * as THREE from "three";

import { ROOM, type PoseMsg, type SaidMsg, type WalkerActivity } from "@echo/shared";

import { onSaid, onTold, roomCell, roomOthers, roomSelf, sendAway, sendPose, takePlace, type Other } from "@/lib/villageRoom";

import { Crowd, hashUnit, lookFor, type Look, type Pose } from "./crowd";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";
import { yawFromHeading } from "./playerLayer";
import { BUBBLE_CSS, PLATE_CSS, PLAYER_WALK_MPS, SPEAKING_M, fillPlate, type NearVillager, type VillagersLayer } from "./villagersLayer";

/** Where the room is, injectable so a test can stand in for it. */
export interface OthersSource {
  cell(): string | null;
  self(): string | null;
  others(): ReadonlyMap<string, Other>;
  sendPose(p: PoseMsg): void;
  away(): void;
  onSaid(fn: (m: SaidMsg) => void): () => void;
  /** Hear a line said to this body alone (C107). */
  onTold?(fn: (m: SaidMsg) => void): () => void;
  /** Where this body is to stand, once, when it comes back to one its echo kept (C104). */
  takePlace?(): { x: number; y: number; yaw: number } | null;
}

const ROOM_SOURCE: OthersSource = { cell: roomCell, self: roomSelf, others: roomOthers, sendPose, away: sendAway, onSaid, onTold, takePlace };

/** Seconds a line stays over the one who said it. */
const SAY_S = 6;
/** Bubbles shown at once. */
const BUBBLES = 4;
/** How far a body keeps from another's middle, metres: the villagers' own (C46). */
const BODY_M = 0.3;

export interface OthersLayer extends WorldLayer {
  /** How many others were drawn in the last frame: for tests. */
  drawn(): number;
  /** Where each of them was drawn in the last frame, planet-local metres, and what it was doing: for tests. */
  seen(): { id: string; x: number; y: number; activity: WalkerActivity }[];
  /** Whoever of them is within speaking distance, nearest first, as a villager is told (`room` set); the held one while talking. */
  nearest(): NearVillager | null;
  /** Metres to the nearest of them within speaking distance last frame, or null: the villagers' plate gives way to a nearer one. */
  nearestM(): number | null;
  /** Metres from this body to one of them drawn last frame, or null. */
  distanceTo(id: string): number | null;
  /** Keep the plate on one of them while a conversation lasts; null lets it go. Presentation only. */
  hold(id: string | null): void;
  /** One of them is being talked to. */
  holding(): boolean;
  /**
   * Would a body of `radiusM` at this TILE position step into one of them (C46)? The player's gate, as the
   * villagers' is. A step that takes it no closer is never refused, so two bodies that came in at the
   * same spot can part.
   */
  blockedTile(x: number, y: number, radiusM: number): boolean;
}

/**
 * Who `T` talks to (C107): the nearest within speaking distance, a villager or someone who came into the
 * room, told the same way. A conversation does not care which, and neither does anything that shows it.
 */
export function nearestToTalk(ctx: LayerContext | null | undefined): NearVillager | null {
  const v = ctx?.layer<VillagersLayer>("villagers")?.nearest() ?? null;
  const o = ctx?.layer<OthersLayer>("others")?.nearest() ?? null;
  if (!o || !v) return o ?? v;
  return o.distanceM < v.distanceM ? o : v;
}

/** The crowd's activity for a room activity. */
function crowdActivity(a: WalkerActivity): Pose["activity"] {
  return a === "row" ? "row" : a === "sit" ? "sit" : a === "work" ? "work" : a === "walk" ? "walk" : "stand";
}

/** What this body is doing, as the room is told. */
export function activityOf(player: PlayerLayer, speedMps: number): WalkerActivity {
  if (player.onRaft()) return "row";
  if (player.seat()) return "sit";
  if (player.mover().state === "activity" || player.act()) return "work";
  return speedMps > 0.1 ? "walk" : "stand";
}

export function othersLayer(source: OthersSource = ROOM_SOURCE): OthersLayer {
  let crowd: Crowd | null = null;
  let label: HTMLDivElement | null = null;
  const bubbles: { el: HTMLDivElement; id: string | null; text: string; until: number; at: THREE.Vector3 }[] = [];
  const looks = new Map<string, { key: string; look: Look }>();
  const heads = new Map<string, THREE.Vector3>();
  let labelled: { id: string; at: THREE.Vector3 } | null = null;
  let poseClock = 0;
  let wasHere = false;
  let drawnNow = 0;
  const seenNow: { id: string; x: number; y: number; activity: WalkerActivity }[] = [];
  let unsubscribe: (() => void) | null = null;
  const head = new THREE.Vector3();
  /** Who is nearest within speaking distance (or held), as the talk panel is told; and how far. */
  let near: NearVillager | null = null;
  let nearM: number | null = null;
  let held: string | null = null;
  /** Where each of them was drawn last frame, planet-local metres; and this body. */
  const lastAt = new Map<string, { x: number; y: number }>();
  const meAt = { x: Number.NaN, y: Number.NaN };
  let frameNow: LayerContext["frame"] | null = null;
  /** Who they are here: a name and a visitor's line, drawn once a body from its look (C107). */
  const known = new Map<string, { name: string; line: string }>();
  const whoIs = (ctx: LayerContext, o: Other) => {
    const kept = known.get(o.lookSeed);
    if (kept) return kept;
    const v = ctx.layer<VillagersLayer>("villagers")?.visitor(o.lookSeed) ?? null;
    if (v) known.set(o.lookSeed, v);
    return v;
  };

  const lookOf = (o: Other): Look => {
    const key = `${o.lookSeed}|${o.sex}|${o.age}|${o.trade}`;
    const kept = looks.get(o.id);
    if (kept && kept.key === key) return kept.look;
    const look = lookFor(`room:${o.lookSeed}`, o.trade, o.age, o.sex);
    looks.set(o.id, { key, look });
    return look;
  };

  /** A hand above the head, as a villager's bubble sits. */
  const overHead = (scale: number, tileM: number) => (1.95 * scale + 0.45) * (tileM / 1.6);

  const said = (m: SaidMsg) => {
    const seconds = performance.now() / 1000;
    // A line said to this body by the one it is talking to is in the panel, as a villager's answer is.
    if (held !== null && m.from === held) return;
    // The one already showing this person's line is reused; else the oldest.
    const slot = bubbles.find((b) => b.id === m.from) ?? [...bubbles].sort((a, b) => a.until - b.until)[0];
    if (!slot) return;
    slot.id = m.from;
    slot.text = m.text;
    slot.until = seconds + SAY_S;
    slot.el.textContent = m.text;
  };

  return {
    name: "others",

    async build(ctx, signal) {
      if (signal.aborted) return;
      crowd = new Crowd(ROOM.capacity, ctx.frame.tileM);
      crowd.group.name = "others";
      ctx.scene.add(crowd.group);
      const host = ctx.renderer.domElement.parentElement;
      if (host) {
        // The villagers' own plate and bubble, so a person who came in reads as anyone else does.
        label = document.createElement("div");
        label.dataset.othersLabel = "";
        label.style.cssText = PLATE_CSS;
        host.appendChild(label);
        for (let k = 0; k < BUBBLES; k++) {
          const el = document.createElement("div");
          el.dataset.othersSaid = "";
          el.style.cssText = BUBBLE_CSS;
          host.appendChild(el);
          bubbles.push({ el, id: null, text: "", until: 0, at: new THREE.Vector3() });
        }
      }
      const offSaid = source.onSaid(said);
      const offTold = source.onTold?.(said);
      unsubscribe = () => {
        offSaid();
        offTold?.();
      };
    },

    update(dt, ctx) {
      if (!crowd) return;
      const frame = ctx.frame;
      frameNow = frame;
      const self = source.self();
      const inRoom = self !== null && source.cell() === ctx.region.cell;
      crowd.begin();
      drawnNow = 0;
      seenNow.length = 0;
      heads.clear();
      lastAt.clear();
      if (!inRoom) {
        crowd.end();
        if (wasHere) {
          wasHere = false;
          source.away();
        }
        labelled = null;
        near = null;
        nearM = null;
        return;
      }
      const player = ctx.layer<PlayerLayer>("player");
      let mx = Number.NaN;
      let my = Number.NaN;
      if (player) {
        const place = source.takePlace?.();
        if (place) {
          const [tx, ty] = frame.fromLocalM(place.x, place.y);
          player.setPosition(tx, ty);
          poseClock = 1;
        }
        const at = player.position();
        [mx, my] = frame.toLocalM(at.x, at.y);
        meAt.x = mx;
        meAt.y = my;
        const ground = Math.max(0, frame.heightAtTile(at.x, at.y));
        heads.set(self, new THREE.Vector3(at.x * frame.tileM, ground + at.liftM + overHead(1, frame.tileM), at.y * frame.tileM));
        poseClock += dt;
        if (poseClock >= 1 / ROOM.poseHz) {
          poseClock = 0;
          const m = player.mover();
          const speed = Math.hypot(m.vx, m.vy) * frame.tileM;
          source.sendPose({ x: mx, y: my, yaw: yawFromHeading(m.heading), speed, activity: activityOf(player, speed) });
          wasHere = true;
        }
      }

      const now = performance.now();
      const seconds = now / 1000;
      let nearest: { id: string; d: number; at: THREE.Vector3 } | null = null;
      for (const o of source.others().values()) {
        if (!o.here) continue;
        const s = o.track.at(now);
        if (!s) continue;
        const [tx, ty] = frame.fromLocalM(s.x, s.y);
        const y = s.activity === "row" ? 0.22 : Math.max(0, frame.heightAtTile(tx, ty));
        const look = lookOf(o);
        const activity = crowdActivity(s.activity);
        crowd.pose(
          {
            x: tx * frame.tileM,
            y,
            z: ty * frame.tileM,
            yaw: s.yaw,
            activity,
            speed: activity === "walk" ? s.speed / PLAYER_WALK_MPS : 0,
            time: seconds,
            phase0: hashUnit(o.lookSeed) * Math.PI * 2,
          },
          look,
        );
        drawnNow++;
        seenNow.push({ id: o.id, x: s.x, y: s.y, activity: s.activity });
        lastAt.set(o.id, { x: s.x, y: s.y });
        const top = new THREE.Vector3(tx * frame.tileM, y + overHead(look.scale, frame.tileM), ty * frame.tileM);
        heads.set(o.id, top);
        const d = Math.hypot(s.x - mx, s.y - my);
        // While talking, the plate stays on the one being talked to, whoever wanders nearer.
        const eligible = held !== null ? held === o.id : d < SPEAKING_M;
        if (eligible && (!nearest || d < nearest.d)) nearest = { id: o.id, d, at: top };
      }
      crowd.end();

      // Who `T` would talk to, told as a villager is (C107).
      const person = nearest ? source.others().get(nearest.id) : undefined;
      const who = person ? whoIs(ctx, person) : null;
      near = nearest && person && who ? { id: person.id, name: who.name, occupation: person.trade, age: person.age, distanceM: nearest.d, room: true } : null;
      nearM = near ? near.distanceM : null;

      // The plate: the nearest person within speaking distance, unless a villager stands nearer, or is
      // being talked to, whose plate the villagers' layer is already showing.
      const villagers = ctx.layer<VillagersLayer>("villagers");
      const villager = villagers?.nearest();
      if (held === null && nearest && villager && (villagers!.holding() || villager.distanceM < nearest.d)) nearest = null;
      if (label) {
        if (nearest && who && person && nearest.id !== labelled?.id) fillPlate(label, who.name, `${person.age} · ${person.trade}`, who.line);
        labelled = nearest && who ? { id: nearest.id, at: nearest.at } : null;
        if (!labelled) label.style.display = "none";
      }

      for (const b of bubbles) {
        const at = b.id ? heads.get(b.id) : undefined;
        if (!b.id || b.until < seconds || !at) {
          b.el.style.display = "none";
          if (b.until < seconds) b.id = null;
          continue;
        }
        b.at.copy(at);
      }
    },

    beforeRender(ctx) {
      const canvas = ctx.renderer.domElement;
      const seconds = performance.now() / 1000;
      const placed: { x: number; y: number }[] = [];
      for (const b of bubbles) {
        if (!b.id || b.until < seconds) continue;
        head.copy(b.at).project(ctx.camera);
        if (head.z > 1) {
          b.el.style.display = "none";
          continue;
        }
        const x = ((head.x + 1) / 2) * canvas.clientWidth;
        let y = ((1 - head.y) / 2) * canvas.clientHeight;
        // Over the plate of the one who said it, not under it.
        if (labelled && b.id === labelled.id) y -= (label?.offsetHeight ?? 40) + 6;
        while (placed.some((p) => Math.abs(p.x - x) < 200 && Math.abs(p.y - y) < 30)) y -= 32;
        placed.push({ x, y });
        b.el.style.display = "block";
        b.el.style.left = `${x}px`;
        b.el.style.top = `${y}px`;
      }
      if (!label || !labelled) return;
      head.copy(labelled.at).project(ctx.camera);
      if (head.z > 1) {
        label.style.display = "none";
        return;
      }
      label.style.display = "block";
      label.style.left = `${((head.x + 1) / 2) * canvas.clientWidth}px`;
      label.style.top = `${((1 - head.y) / 2) * canvas.clientHeight}px`;
    },

    drawn: () => drawnNow,
    seen: () => seenNow.map((o) => ({ ...o })),
    nearest: () => near,
    nearestM: () => nearM,
    distanceTo(id) {
      const at = lastAt.get(id);
      return at && Number.isFinite(meAt.x) ? Math.hypot(at.x - meAt.x, at.y - meAt.y) : null;
    },
    hold(id) {
      held = id;
      labelled = null;
    },
    holding: () => held !== null,
    blockedTile(x, y, radiusM) {
      if (!frameNow || !Number.isFinite(meAt.x)) return false;
      const [lx, ly] = frameNow.toLocalM(x, y);
      for (const at of lastAt.values()) {
        const d = Math.hypot(at.x - lx, at.y - ly);
        if (d < radiusM + BODY_M && d < Math.hypot(at.x - meAt.x, at.y - meAt.y) - 1e-6) return true;
      }
      return false;
    },

    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      if (wasHere) source.away();
      wasHere = false;
      crowd?.group.removeFromParent();
      crowd?.dispose();
      crowd = null;
      label?.remove();
      label = null;
      for (const b of bubbles) b.el.remove();
      bubbles.length = 0;
    },
  };
}

