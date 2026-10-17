/**
 * The villagers layer (DECISIONS C41): the people of the anchor cell's village going about their day
 * — out of their doors before sunrise, to the boats and the fields and the workbench, onto the green
 * in the evening, home after dark — and the boats going out and coming back.
 *
 * NOTHING HERE DECIDES ANYTHING. Where a person is at an hour is `whereabouts` (@echo/planet), a
 * closed form of the settlement, the plan, the world day and the hour; this layer only asks it, sixty
 * times a second, and draws the answer. So everyone standing in the village sees the same baker at the
 * same well (C27), and no server moved her there.
 *
 * THE HOUR IS THE SKY'S, the day is the clock's. The sky is the one authority on what hour it is —
 * frozen for a screenshot, the villagers must freeze with it, which is the lesson the windows taught
 * — and the world day only changes which plan is in force.
 *
 * THE NAMEPLATE. Walk up to someone and their name, age, trade and one line of the life they have
 * lived (`life.ts`) appear over them. Identity is gated by distance, as the design always had it: a
 * stranger across the green is a figure, and only close enough to speak is a name.
 */

import * as THREE from "three";
import {
  ageYears,
  boatAt,
  dayPlans,
  lives,
  timeOfDay,
  whereabouts,
  worldDayIndex,
  SCHEDULE,
  type BoatDay,
  type DayPlan,
  type LifeEvent,
  type Mooring,
  type Person,
  type SettledParcel,
  type WorldClock,
} from "@echo/planet";

import { Crowd, hashUnit, lookFor, type Look } from "./crowd";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";
import { BOAT_PAINT, boatForm } from "./villageGeometry";

/** The player's walking speed, metres per second: the gait's `speed = 1`. */
const PLAYER_WALK_MPS = 1.65;
/** Close enough to speak: the nameplate shows inside this many metres. */
const SPEAKING_M = 7;

/** The person close enough to speak to, as the talk panel needs them. */
export interface NearVillager {
  id: string;
  name: string;
  occupation: string;
  age: number;
  distanceM: number;
}

export interface VillagersLayer extends WorldLayer {
  /** How many people the last frame drew. For tests and the frame budget. */
  drawn(): number;
  /** The plans in force, for tests. */
  plans(): readonly DayPlan[];
  /** Whoever is within speaking distance of the player, nearest first; the held one while talking. */
  nearest(): NearVillager | null;
  /** Metres from the player to a villager drawn last frame, or null if they are not out. */
  distanceTo(id: string): number | null;
  /**
   * Stop one villager where they stand, facing the player, for as long as a conversation lasts; null
   * lets them go, and they walk back into their day over a couple of seconds rather than jumping to
   * it. PRESENTATION ONLY, and only for this viewer: the schedule — what everyone else sees — is
   * unchanged, which is why this can exist without a server (C27, L2).
   */
  hold(id: string | null): void;
}

interface PlayerLike {
  position(): { x: number; y: number };
}

/** One line of a life, for the nameplate: the most telling thing that has happened to them. */
export function lifeLine(events: readonly LifeEvent[], day: number, names: Map<string, string>): string {
  const years = (d: number) => Math.floor((day - d) / 365);
  const ago = (d: number) => {
    const y = years(d);
    return y <= 0 ? "this year" : y === 1 ? "a year ago" : `${y} years ago`;
  };
  /** "for 15 years", never "since 15 years ago", which is what the first nameplate said. */
  const lasting = (d: number) => {
    const y = years(d);
    return y <= 0 ? "this past year" : y === 1 ? "for a year" : `for ${y} years`;
  };
  const who = (e: LifeEvent) => names.get(e.with[0] ?? "") ?? "someone";
  const last = (kind: LifeEvent["kind"]) => [...events].reverse().find((e) => e.kind === kind && e.day <= day);
  const widowed = last("widowed");
  if (widowed) return `Widowed ${ago(widowed.day)}; ${who(widowed)} lies in the graveyard.`;
  const lost = last("child-died");
  if (lost && day - lost.day < 25 * 365) return `Lost a child, ${who(lost)}, ${ago(lost.day)}.`;
  const married = last("married");
  const taught = last("taught");
  if (taught) return `Taught ${who(taught)} the trade${married ? `; married to ${who(married)}` : ""}.`;
  if (married) return `Married to ${who(married)} ${lasting(married.day)}.`;
  const arrived = last("arrived");
  if (arrived && arrived.detail === "married-in") return `Came here from elsewhere ${ago(arrived.day)}.`;
  const learned = last("learned-trade");
  if (learned && learned.with.length > 0) return `Learned the trade from ${who(learned)}.`;
  const friend = last("befriended");
  if (friend) return `Best friends with ${who(friend)}.`;
  return "Born here, and has never lived anywhere else.";
}

export function villagersLayer(options: { clock: WorldClock }): VillagersLayer {
  let village: SettledParcel | null = null;
  let frame: WorldFrame | null = null;
  let crowd: Crowd | null = null;
  let boatMesh: THREE.InstancedMesh | null = null;
  let boatMaterial: THREE.Material | null = null;
  let people = new Map<string, Person>();
  let names = new Map<string, string>();
  let life = new Map<string, LifeEvent[]>();
  const looks = new Map<string, Look>();
  let state: { day: number; plans: DayPlan[]; boats: (BoatDay | null)[]; moorings: Mooring[] } = { day: -1, plans: [], boats: [], moorings: [] };
  let label: HTMLDivElement | null = null;
  let labelled: { id: string; x: number; y: number; z: number } | null = null;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const head = new THREE.Vector3();
  const tint = new THREE.Color();
  let drawn = 0;
  /** Where each visible villager stood last frame, local metres. Reused; the hook may not allocate per person. */
  const lastAt = new Map<string, { x: number; y: number }>();
  let near: NearVillager | null = null;
  let held: { id: string; x: number; y: number; activity: string } | null = null;
  let released: { id: string; x: number; y: number; at: number } | null = null;
  /** How long a released villager takes to walk back into their day, seconds. */
  const RELEASE_S = 2.5;
  /** The player's last position (local metres) and the sky's last hour, for the calls between frames. */
  const playerAt = { x: Infinity, y: Infinity };
  let lastHour = 0.5;

  const refresh = (day: number) => {
    const v = village!;
    const next = dayPlans(v.settlement, v.plan, day);
    state = { day, ...next };
    for (const d of next.plans) {
      if (!looks.has(d.person)) {
        const p = people.get(d.person)!;
        looks.set(d.person, lookFor(p.id, p.occupation, ageYears(p, day)));
      }
    }
  };

  return {
    name: "villagers",

    async build(ctx: LayerContext, signal: AbortSignal) {
      village = ctx.region.village ?? null;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      const s = village.settlement;
      people = new Map(s.people.map((p) => [p.id, p]));
      names = new Map(s.people.map((p) => [p.id, p.given]));
      life = lives(s);

      const day = worldDayIndex(options.clock, Date.now());
      refresh(day);
      crowd = new Crowd(state.plans.length + 12, ctx.frame.tileM);
      ctx.scene.add(crowd.group);

      boatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      boatMesh = new THREE.InstancedMesh(boatForm(), boatMaterial, Math.max(1, state.moorings.length + 4));
      boatMesh.name = "villagers:boats";
      boatMesh.castShadow = true;
      boatMesh.receiveShadow = true;
      boatMesh.frustumCulled = false;
      boatMesh.count = state.moorings.length;
      state.moorings.forEach((mo, i) => boatMesh!.setColorAt(i, tint.set(BOAT_PAINT[mo.household % BOAT_PAINT.length])));
      if (boatMesh.instanceColor) boatMesh.instanceColor.needsUpdate = true;
      ctx.scene.add(boatMesh);

      const host = ctx.renderer.domElement.parentElement;
      if (host) {
        label = document.createElement("div");
        label.dataset.villagerLabel = "";
        label.style.cssText =
          "position:absolute;left:0;top:0;pointer-events:none;z-index:15;display:none;transform:translate(-50%,-100%);" +
          "max-width:260px;padding:6px 10px;border-radius:10px;background:rgba(22,36,31,.86);color:#f4e9d0;" +
          "font:12px/1.35 ui-sans-serif,system-ui,sans-serif;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.35)";
        host.appendChild(label);
      }
    },

    update(_dt, ctx) {
      if (!crowd || !village || !frame || !boatMesh) return;
      const sky = ctx.layer<SkyLayer>("sky");
      const hour = sky ? sky.timeOfDay() : timeOfDay(options.clock, Date.now());
      const day = worldDayIndex(options.clock, Date.now());
      if (day !== state.day) refresh(day);
      const seconds = performance.now() / 1000;

      // The boats first: the fishers in them stand on their decks.
      state.moorings.forEach((mo, i) => {
        const b = boatAt(state.boats[i] ?? null, mo, hour);
        const [tx, ty] = frame!.fromLocalM(b.x, b.y);
        const h = mo.ashore ? Math.max(0, frame!.heightAtTile(tx, ty)) + 0.05 : 0.08 + Math.sin(seconds * 1.3 + i) * 0.03;
        q.setFromAxisAngle(up, b.heading);
        m.compose(pos.set(tx * frame!.tileM, h, ty * frame!.tileM), q, one);
        boatMesh!.setMatrixAt(i, m);
      });
      boatMesh.instanceMatrix.needsUpdate = true;

      // Who is nearest the player, for the nameplate.
      const player = ctx.layer<WorldLayer & PlayerLike>("player");
      const me = player?.position();
      const [mx, my] = me ? frame.toLocalM(me.x, me.y) : [Infinity, Infinity];
      playerAt.x = mx;
      playerAt.y = my;
      lastHour = hour;
      let nearest: { id: string; d: number; x: number; y: number; z: number } | null = null;

      crowd.begin();
      for (const d of state.plans) {
        const w = whereabouts(d, hour, state.boats, state.moorings);
        if (held && held.id === d.person) {
          // Talking: where they stood when it began, turned to the player, sitting if they sat.
          w.x = held.x;
          w.y = held.y;
          w.visible = true;
          w.heading = Math.atan2(my - held.y, mx - held.x);
          w.activity = held.activity === "sit" ? "sit" : "stand";
          w.speed = 0;
        } else if (released && released.id === d.person) {
          const k = (seconds - released.at) / RELEASE_S;
          if (k >= 1 || !w.visible) released = null;
          else {
            // Back into the day: a short walk from where the conversation left them.
            const tx0 = released.x + (w.x - released.x) * k;
            const ty0 = released.y + (w.y - released.y) * k;
            w.heading = Math.atan2(w.y - released.y, w.x - released.x);
            w.x = tx0;
            w.y = ty0;
            w.activity = "walk";
            w.speed = 1;
          }
        }
        if (!w.visible) {
          lastAt.delete(d.person);
          continue;
        }
        const seen = lastAt.get(d.person);
        if (seen) {
          seen.x = w.x;
          seen.y = w.y;
        } else lastAt.set(d.person, { x: w.x, y: w.y });
        const [tx, ty] = frame.fromLocalM(w.x, w.y);
        const y = w.boat !== null ? 0.22 + Math.sin(seconds * 1.3 + w.boat) * 0.03 : Math.max(0, frame.heightAtTile(tx, ty));
        const look = looks.get(d.person)!;
        const gait = w.activity === "walk" || w.activity === "play" ? (SCHEDULE.walkMps * w.speed) / PLAYER_WALK_MPS : 0;
        crowd.pose(
          {
            x: tx * frame.tileM,
            y,
            z: ty * frame.tileM,
            // The rig faces +z; a local heading h points along (cos h, -sin h) in three's x-z.
            yaw: w.heading + Math.PI / 2,
            activity: w.activity,
            speed: gait,
            time: seconds,
            phase0: hashUnit(d.person) * Math.PI * 2,
          },
          look,
        );
        const dist = Math.hypot(w.x - mx, w.y - my);
        // While talking, the plate stays on the one being talked to, whoever wanders nearer.
        const eligible = held ? held.id === d.person : dist < SPEAKING_M;
        if (eligible && (!nearest || dist < nearest.d)) {
          nearest = { id: d.person, d: dist, x: tx * frame.tileM, y: y + 1.95 * look.scale * (frame.tileM / 1.6), z: ty * frame.tileM };
        }
      }
      crowd.end();
      drawn = crowd.placed();
      if (nearest) {
        const p = people.get(nearest.id)!;
        near = { id: p.id, name: `${p.given} ${p.family}`, occupation: p.occupation, age: Math.floor(ageYears(p, day)), distanceM: nearest.d };
      } else near = null;

      if (label) {
        if (nearest && nearest.id !== labelled?.id) {
          const p = people.get(nearest.id)!;
          const age = Math.floor(ageYears(p, day));
          label.innerHTML = "";
          const title = document.createElement("div");
          title.style.cssText = "font-weight:600;font-size:13px";
          title.textContent = `${p.given} ${p.family}`;
          const sub = document.createElement("div");
          sub.style.cssText = "opacity:.75";
          sub.textContent = `${age} · ${p.occupation}`;
          const line = document.createElement("div");
          line.style.cssText = "margin-top:3px;color:#e8c98a";
          line.textContent = lifeLine(life.get(p.id) ?? [], day, names);
          label.append(title, sub, line);
        }
        labelled = nearest ? { id: nearest.id, x: nearest.x, y: nearest.y, z: nearest.z } : null;
        if (!labelled) label.style.display = "none";
      }
    },

    beforeRender(ctx) {
      // Placed here, after the camera has moved, so the plate does not trail its person by a frame.
      if (!label || !labelled) return;
      head.set(labelled.x, labelled.y, labelled.z).project(ctx.camera);
      if (head.z > 1) {
        label.style.display = "none";
        return;
      }
      const canvas = ctx.renderer.domElement;
      label.style.display = "block";
      label.style.left = `${((head.x + 1) / 2) * canvas.clientWidth}px`;
      label.style.top = `${((1 - head.y) / 2) * canvas.clientHeight}px`;
    },

    drawn: () => drawn,
    plans: () => state.plans,
    nearest: () => near,

    distanceTo(id) {
      const at = lastAt.get(id);
      return at ? Math.hypot(at.x - playerAt.x, at.y - playerAt.y) : null;
    },

    hold(id) {
      if (id === (held?.id ?? null)) return;
      if (held) {
        const at = lastAt.get(held.id);
        released = at ? { id: held.id, x: at.x, y: at.y, at: performance.now() / 1000 } : null;
        held = null;
      }
      if (id) {
        const at = lastAt.get(id);
        const d = state.plans.find((x) => x.person === id);
        if (!at || !d) return;
        // The sky's hour, as everywhere in this layer: never the clock's (see the header).
        const w = whereabouts(d, lastHour, state.boats, state.moorings);
        held = { id, x: at.x, y: at.y, activity: w.activity };
        if (released?.id === id) released = null;
      }
    },

    dispose() {
      crowd?.dispose();
      boatMesh?.geometry.dispose();
      boatMaterial?.dispose();
      label?.remove();
      crowd = null;
      boatMesh = null;
      label = null;
      village = null;
    },
  };
}
