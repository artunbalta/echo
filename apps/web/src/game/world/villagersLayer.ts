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
 *
 * WHAT THEY WOULD ASK (C50). Someone with a need this week (`needsOn`) says it, once, when the
 * stranger comes within {@link ASK_M} of them — a child after a shell, a man short of wood for his
 * boat — in a bubble over them, as a person would; and says thank you the same way when it is met.
 * Nothing else marks them out: no icon, no list (Design Law 1).
 */

import * as THREE from "three";
import {
  ageYears,
  boatAt,
  chatter,
  weatherAt,
  dayPlans,
  comingOn,
  gatheringsOn,
  doorOf,
  homeState,
  lives,
  needsOn,
  residentsOn,
  roomHeading,
  roomToLocal,
  occupationOn,
  timeOfDay,
  whereabouts,
  worldDayIndex,
  SCHEDULE,
  type BoatDay,
  type Coming,
  type DayPlan,
  type Gathering,
  type Deed,
  type LifeEvent,
  type Mooring,
  type Need,
  type Plot,
  type Room,
  type Person,
  type SettledParcel,
  type WorldClock,
} from "@echo/planet";

import { earshotOf } from "@/lib/soundscape";

import { Crowd, hashUnit, lookFor, type Look } from "./crowd";
import type { InteractLayer } from "./interactLayer";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";
import { BOAT_PAINT, boatForm } from "./villageGeometry";

/** The player's walking speed, metres per second: the gait's `speed = 1`. */
const PLAYER_WALK_MPS = 1.65;
/** Close enough to speak: the nameplate shows inside this many metres. */
const SPEAKING_M = 7;
/** How far a villager keeps from the stranger's middle when their way crosses (C46). */
const STEP_ASIDE_M = 0.8;
/** A villager's half-width, for the player's gate. */
const BODY_M = 0.3;
/** Within this many metres, someone with a need asks the stranger for it (C50), once. */
const ASK_M = 5;
/** How long a villager's own line to the stranger stays over them, seconds. */
const SAY_S = 7;

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
  /** The stranger's own deeds here (C49): what the villagers may be saying about them, once word has spread. */
  setDeeds(deeds: readonly Deed[]): void;
  /** What each villager would ask for this week (C50), as this page has the village: for tests and the HUD. */
  needs(): ReadonlyMap<string, Need>;
  /** Today's burials, weddings and callers (C52), as the schedule has them. */
  gatherings(): readonly Gathering[];
  /** The village's news today: what it knows is coming (C52). */
  coming(): readonly Coming[];
  /** One villager says something to the stranger, in a bubble over them, for `seconds` (C50: thanks). */
  say(id: string, text: string, seconds?: number): void;
  /**
   * The stranger is inside a house (C54), or null: its people who are at home are drawn in it —
   * asleep in their beds, at the table, or, when the door has been forced, up against the back wall.
   */
  setIndoors(info: { plot: Plot; room: Room; floor: number; forced: boolean } | null): void;
  /**
   * Someone who asked the stranger in (C54): while the stranger is in their house, they are in it too,
   * at the table. Presentation only, as `hold` is — their day, as everyone else sees it, is unchanged.
   */
  host(id: string | null, plot: number | null): void;
  /**
   * What can be heard of the village near a point (C56): people out of doors weighted by nearness,
   * pairs talking (the bubbles shown), and who is at work at what trade — the tool is theirs.
   */
  earshot(x: number, y: number, r: number): { people: number; talking: number; working: { id: string; occupation: string; activity: string; x: number; y: number }[] };
  /** Where someone was drawn out of doors last frame (C55: a dog keeps to its person as drawn), or null. */
  whereIs(id: string): { x: number; y: number; heading: number; visible: boolean; boat: number | null } | null;
  /**
   * A household's boat is out with the stranger (C45): its mooring is drawn empty, in this view only,
   * until `lend(null)`. The schedule — the family's fisher rowing out at dawn — is untouched.
   */
  lend(household: number | null): void;
  /**
   * Would a body of `radiusM` at this TILE position stand inside a villager (C46)? The player's gate:
   * nobody walks through a person. Read off where everyone was drawn last frame.
   */
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /** Villagers drawn out of doors last frame within `r` metres of a point: who could see an act (C45). */
  watchers(x: number, y: number, r: number): number;
  /** The player's position last frame, planet-local metres: what `begin` is told (C44). */
  playerPosition(): { x: number; y: number } | null;
  /** The same village with new changes (C44): new people, new days, the same houses. */
  apply(village: SettledParcel): void;
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
  // Between villages (C53), the most telling thing about anyone while it is recent.
  const home = last("came-home");
  if (home && day - home.day < 5 * 365) return `Went away, and came home ${ago(home.day)}.`;
  const came = last("arrived");
  if (came && came.detail?.startsWith("visit:") && came.day === day) return "Here for the day from another village, visiting.";
  if (came && came.detail?.startsWith("from:") && day - came.day < 10 * 365) return `Came here from another village ${ago(came.day)}.`;
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
  const lastAt = new Map<string, { x: number; y: number; activity: string; sx: number; sy: number; sz: number; heading?: number }>();
  /** What two villagers standing together say (C49): three bubbles at most, near the stranger. */
  let deeds: Deed[] = [];
  const bubbles: { el: HTMLDivElement; at: THREE.Vector3 | null; key: string }[] = [];
  let chatterClock = 0;
  /** Needs this week (C50), recomputed when the day, the changes or the marks change. */
  let needs: ReadonlyMap<string, Need> = new Map();
  let needsKey = "";
  /** Needs already said aloud to this stranger on this page: a person asks once, not every time you pass. */
  const asked = new Set<string>();
  /** A villager's own line to the stranger, held over them for a few seconds. */
  let spoken: { id: string; text: string; until: number } | null = null;
  let near: NearVillager | null = null;
  let held: { id: string; x: number; y: number; activity: string } | null = null;
  let indoors: { plot: Plot; room: Room; floor: number; forced: boolean } | null = null;
  let hosting: { id: string; plot: number } | null = null;
  /** Who sleeps in the house the stranger is in, today. */
  let indoorsOf: { key: string; ids: string[] } = { key: "", ids: [] };
  let released: { id: string; x: number; y: number; at: number } | null = null;
  /** How long a released villager takes to walk back into their day, seconds. */
  const RELEASE_S = 2.5;
  /** The player's last position (local metres) and the sky's last hour, for the calls between frames. */
  const playerAt = { x: Infinity, y: Infinity };
  let lastHour = 0.5;
  let lent: number | null = null;
  const zero = new THREE.Vector3(0, 0, 0);

  /** Where a bubble sits over someone: a hand above their head, a child's lower than a man's. */
  const overHead = (id: string) => (1.95 * (looks.get(id)?.scale ?? 1) + 0.45) * ((frame?.tileM ?? 1.6) / 1.6);

  const refresh = (day: number) => {
    const v = village!;
    const next = dayPlans(v.settlement, v.plan, day, v.changes);
    state = { day, ...next };
    for (const d of next.plans) {
      if (!looks.has(d.person)) {
        const p = people.get(d.person)!;
        looks.set(d.person, lookFor(p.id, occupationOn(p, day), ageYears(p, day), p.sex));
      }
    }
  };
  const adopt = (v: SettledParcel) => {
    village = v;
    const s = v.settlement;
    people = new Map(s.people.map((p) => [p.id, p]));
    names = new Map(s.people.map((p) => [p.id, p.given]));
    life = lives(s);
  };

  return {
    name: "villagers",

    async build(ctx: LayerContext, signal: AbortSignal) {
      village = ctx.region.village ?? null;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      adopt(village);

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
        for (let k = 0; k < 3; k++) {
          const el = document.createElement("div");
          el.dataset.villagerChatter = "";
          el.style.cssText =
            "position:absolute;left:0;top:0;pointer-events:none;z-index:14;display:none;transform:translate(-50%,-100%);" +
            "max-width:220px;padding:4px 9px;border-radius:12px;background:rgba(244,233,208,.88);color:#213522;" +
            "font:11px/1.3 ui-sans-serif,system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)";
          host.appendChild(el);
          bubbles.push({ el, at: null, key: "" });
        }
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
        m.compose(pos.set(tx * frame!.tileM, h, ty * frame!.tileM), q, mo.household === lent ? zero : one);
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
      const hostIn = hosting && indoors && indoors.plot.index === hosting.plot ? hosting.id : null;
      for (const d of state.plans) {
        // The one who asked the stranger in is inside with them (C54), not where their day has them.
        if (d.person === hostIn) continue;
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
        // Nobody walks through the stranger (C46): a villager whose way crosses where you stand steps
        // round you. Presentation only, and only here; the schedule everyone else sees is untouched.
        if (!(held && held.id === d.person) && w.boat === null) {
          const gap = Math.hypot(w.x - mx, w.y - my);
          if (gap < STEP_ASIDE_M && gap > 1e-6) {
            w.x = mx + ((w.x - mx) / gap) * STEP_ASIDE_M;
            w.y = my + ((w.y - my) / gap) * STEP_ASIDE_M;
          }
        }
        const [tx, ty] = frame.fromLocalM(w.x, w.y);
        const y = w.boat !== null ? 0.22 + Math.sin(seconds * 1.3 + w.boat) * 0.03 : Math.max(0, frame.heightAtTile(tx, ty));
        const seen = lastAt.get(d.person);
        if (seen) {
          seen.x = w.x;
          seen.y = w.y;
          seen.heading = w.heading;
          seen.activity = w.activity;
          seen.sx = tx * frame.tileM;
          seen.sy = y;
          seen.sz = ty * frame.tileM;
        } else lastAt.set(d.person, { x: w.x, y: w.y, activity: w.activity, sx: tx * frame.tileM, sy: y, sz: ty * frame.tileM, heading: w.heading });
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
      // Inside a house (C54): its people who are home, where the room puts them.
      if (indoors) {
        const key = `${indoors.plot.index}|${day}|${village.changes.length}`;
        if (indoorsOf.key !== key) {
          indoorsOf = { key, ids: residentsOn(village.settlement, village.plan, day).filter((r) => r.plot.index === indoors!.plot.index).map((r) => r.person.id) };
        }
        const door = doorOf(indoors.plot);
        for (const id of indoorsOf.ids) {
          const p = people.get(id);
          if (!p || p.deathDay <= day || p.birthDay > day) continue;
          const d = state.plans.find((x) => x.person === id);
          const home = id === hostIn ? "awake" : homeState(d, hour, door);
          if (home === "out" || home === "away") continue;
          const spot = indoors.forced ? indoors.room.wall.get(id) : home === "asleep" ? indoors.room.beds.get(id) : indoors.room.seats.get(id);
          if (!spot) continue;
          const at = roomToLocal(indoors.plot, spot.u, spot.v);
          const [tx, ty] = frame.fromLocalM(at.x, at.y);
          const activity = indoors.forced ? "stand" : home === "asleep" ? "sleep" : "sit";
          const lift = activity === "sleep" ? 0.47 : 0;
          const heading = roomHeading(indoors.plot, spot.heading);
          const look = looks.get(id) ?? lookFor(p.id, occupationOn(p, day), ageYears(p, day), p.sex);
          looks.set(id, look);
          crowd.pose(
            { x: tx * frame.tileM, y: indoors.floor + lift, z: ty * frame.tileM, yaw: heading + Math.PI / 2, activity, speed: 0, time: seconds, phase0: hashUnit(id) * Math.PI * 2 },
            look,
          );
          if (activity !== "sleep") {
            // Awake at home: someone the stranger can speak to, in the room with them.
            lastAt.set(id, { x: at.x, y: at.y, activity, sx: tx * frame.tileM, sy: indoors.floor, sz: ty * frame.tileM });
            const dist = Math.hypot(at.x - mx, at.y - my);
            const eligible = held ? held.id === id : dist < SPEAKING_M;
            if (eligible && (!nearest || dist < nearest.d)) nearest = { id, d: dist, x: tx * frame.tileM, y: indoors.floor + 1.95 * look.scale * (frame.tileM / 1.6), z: ty * frame.tileM };
          }
        }
      }
      crowd.end();
      drawn = crowd.placed();
      if (nearest) {
        const p = people.get(nearest.id)!;
        near = { id: p.id, name: `${p.given} ${p.family}`, occupation: occupationOn(p, day), age: Math.floor(ageYears(p, day)), distanceM: nearest.d };
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
          // A child has a trade drawn for later, not one they work at: the panel says "a child", and so does this.
          sub.textContent = `${age} · ${age >= 13 ? occupationOn(p, day) : "a child"}`;
          const line = document.createElement("div");
          line.style.cssText = "margin-top:3px;color:#e8c98a";
          // A decision to go is the most telling thing about anyone, and everyone can see it (C44).
          // A visitor's leaving is going home after the day (C53), not leaving for good.
          line.textContent = p.visiting
            ? `Here for the day from another village, visiting ${names.get(p.visiting) ?? "someone"}.`
            : p.leftDay !== Infinity && p.leftDay > day
              ? `Leaving ${village!.settlement.name} in ${p.leftDay - day} day${p.leftDay - day === 1 ? "" : "s"}.`
              : lifeLine(life.get(p.id) ?? [], day, names);
          label.append(title, sub, line);
        }
        labelled = nearest ? { id: nearest.id, x: nearest.x, y: nearest.y, z: nearest.z } : null;
        if (!labelled) label.style.display = "none";
      }

      // A villager's own line to the stranger follows them as they walk (C50).
      if (spoken && bubbles[0]?.key === `say:${spoken.id}:${spoken.text}`) {
        const at = lastAt.get(spoken.id);
        if (at && bubbles[0].at) bubbles[0].at.set(at.sx, at.sy + overHead(spoken.id), at.sz);
      }

      // Two people standing together talk (C49). Every so often: the pairs near the stranger, what one
      // says to the other this half-hour (the same for every passer-by), three bubbles at most.
      chatterClock += _dt;
      if (chatterClock > 0.8 && bubbles.length > 0) {
        chatterClock = 0;
        const s = village.settlement;
        // What everyone would ask for this week (C50): again only when the day, the changes or the marks move.
        const marks = ctx.layer<InteractLayer>("interact")?.marks();
        const key = `${day}|${village.changes.length}|${village.changes.at(-1)?.id ?? ""}|${marks ? [...marks.values()].map((e) => e.id).join(",") : ""}`;
        if (key !== needsKey) {
          needsKey = key;
          needs = needsOn(s, village.plan, day, village.changes, marks ? [...marks.values()] : []);
        }
        // Someone near the stranger with a need says it, once (C50). Not while a conversation holds anyone,
        // and not from inside a burial, a wedding or a new child's callers (C52): nobody asks a stranger
        // for berries at a graveside.
        if (!held && (!spoken || spoken.until < seconds)) {
          const busy = new Set<string>();
          for (const g of gatheringsOn(s, village.plan, day)) if (hour >= g.t0 - 0.02 && hour <= g.t1 + 0.02) for (const id of g.places.keys()) busy.add(id);
          let asker: { id: string; d: number } | null = null;
          for (const [id, at] of lastAt) {
            const n = needs.get(id);
            if (!n || asked.has(n.id) || at.activity === "row" || busy.has(id)) continue;
            const d = Math.hypot(at.x - mx, at.y - my);
            if (d < ASK_M && (!asker || d < asker.d)) asker = { id, d };
          }
          if (asker) {
            const n = needs.get(asker.id)!;
            asked.add(n.id);
            spoken = { id: asker.id, text: n.text, until: seconds + SAY_S };
          }
        }
        if (spoken && (spoken.until < seconds || !lastAt.has(spoken.id))) spoken = null;
        const weather = ctx.region.geography ? weatherAt(ctx.seed, ctx.region.cell, ctx.region.geography, day, hour, s) : null;
        const idle = [...lastAt].filter(([id, at]) => (at.activity === "stand" || at.activity === "sit" || at.activity === "work") && id !== held?.id && Math.hypot(at.x - mx, at.y - my) < 28);
        const said: { key: string; at: THREE.Vector3; text: string; d: number }[] = [];
        for (let i = 0; i < idle.length; i++) {
          for (let j = i + 1; j < idle.length; j++) {
            const [ia, a] = idle[i];
            const [ib, b] = idle[j];
            if (Math.hypot(a.x - b.x, a.y - b.y) > 2.6) continue;
            const pa = people.get(ia);
            const pb = people.get(ib);
            if (!pa || !pb || ageYears(pa, day) < 6 || ageYears(pb, day) < 6) continue;
            const first = hashUnit(`${ia}+${ib}/${day}/${Math.floor(hour * 48)}`) < 0.5;
            const [speaker, listener, at] = first ? [pa, pb, a] : [pb, pa, b];
            if (spoken && (speaker.id === spoken.id || listener.id === spoken.id)) continue;
            const text = chatter(s, speaker, listener, day, hour, { weather, deeds, changes: village.changes, plan: village.plan, needs });
            if (text) said.push({ key: `${speaker.id}:${text}`, at: new THREE.Vector3(at.sx, at.sy + overHead(speaker.id), at.sz), text: `${speaker.given}: ${text}`, d: Math.hypot(at.x - mx, at.y - my) });
          }
        }
        said.sort((p, q) => p.d - q.d);
        // The same sentence twice on one screen reads as a machine; keep the nearer of the two.
        const shown = new Set<string>();
        const unique = said.filter((x) => {
          const t = x.text.slice(x.text.indexOf(":") + 1);
          if (shown.has(t)) return false;
          shown.add(t);
          return true;
        });
        said.length = 0;
        // A line said to the stranger comes before anything said between neighbours.
        if (spoken) {
          const at = lastAt.get(spoken.id)!;
          const who = people.get(spoken.id);
          said.push({ key: `say:${spoken.id}:${spoken.text}`, at: new THREE.Vector3(at.sx, at.sy + overHead(spoken.id), at.sz), text: `${who?.given ?? ""}: ${spoken.text}`, d: 0 });
        }
        said.push(...unique);
        bubbles.forEach((b, k) => {
          const next = said[k];
          if (!next) {
            b.at = null;
            b.el.style.display = "none";
            return;
          }
          if (b.key !== next.key) b.el.textContent = next.text;
          b.key = next.key;
          b.at = next.at;
        });
      }
    },

    beforeRender(ctx) {
      const canvas = ctx.renderer.domElement;
      // Bubbles that would overlap are stacked, the later one lifted above the earlier.
      const placed: { x: number; y: number }[] = [];
      for (const b of bubbles) {
        if (!b.at) continue;
        head.copy(b.at).project(ctx.camera);
        if (head.z > 1) {
          b.el.style.display = "none";
          continue;
        }
        const x = ((head.x + 1) / 2) * canvas.clientWidth;
        let y = ((1 - head.y) / 2) * canvas.clientHeight;
        while (placed.some((p) => Math.abs(p.x - x) < 200 && Math.abs(p.y - y) < 30)) y -= 32;
        placed.push({ x, y });
        b.el.style.display = "block";
        b.el.style.left = `${x}px`;
        b.el.style.top = `${y}px`;
      }
      // Placed here, after the camera has moved, so the plate does not trail its person by a frame.
      if (!label || !labelled) return;
      head.set(labelled.x, labelled.y, labelled.z).project(ctx.camera);
      if (head.z > 1) {
        label.style.display = "none";
        return;
      }
      label.style.display = "block";
      label.style.left = `${((head.x + 1) / 2) * canvas.clientWidth}px`;
      label.style.top = `${((1 - head.y) / 2) * canvas.clientHeight}px`;
    },

    drawn: () => drawn,
    plans: () => state.plans,
    nearest: () => near,
    playerPosition: () => (Number.isFinite(playerAt.x) ? { x: playerAt.x, y: playerAt.y } : null),
    lend(household) {
      lent = household;
    },
    setDeeds(list) {
      deeds = [...list];
    },
    needs: () => needs,
    setIndoors(info) {
      indoors = info;
    },
    earshot(x, y, r) {
      const day = worldDayIndex(options.clock, Date.now());
      const drawn = [...lastAt].map(([id, at]) => ({ id, x: at.x, y: at.y, activity: at.activity }));
      // A bubble sits in the scene (x east, z south), over the pair talking under it.
      const talks = bubbles.filter((b) => b.at !== null && b.el.style.display !== "none").map((b) => ({ x: b.at!.x, y: -b.at!.z }));
      const heard = earshotOf(drawn, talks, x, y, r);
      const working = heard.working.flatMap((w) => {
        const p = people.get(w.id);
        return p ? [{ ...w, occupation: occupationOn(p, day) }] : [];
      });
      return { people: heard.people, talking: heard.talking, working };
    },
    whereIs(id) {
      const at = lastAt.get(id);
      if (!at || at.activity === "sleep" || at.activity === "row" || at.activity === "fish") return null;
      return { x: at.x, y: at.y, heading: at.heading ?? 0, visible: true, boat: null };
    },
    host(id, plot) {
      hosting = id !== null && plot !== null ? { id, plot } : null;
    },
    gatherings: () => (village ? gatheringsOn(village.settlement, village.plan, state.day) : []),
    coming: () => (village ? comingOn(village.settlement, village.plan, state.day, village.changes) : []),
    say(id, text, seconds = SAY_S) {
      spoken = { id, text, until: performance.now() / 1000 + seconds };
      chatterClock = 1; // shown at the next frame, not the next tick
    },
    blockedTile(x, y, radiusM) {
      if (!frame) return false;
      const [lx, ly] = frame.toLocalM(x, y);
      for (const at of lastAt.values()) if (Math.hypot(at.x - lx, at.y - ly) < radiusM + BODY_M) return true;
      return false;
    },
    watchers(x, y, r) {
      // Children under eight see, and nobody asks them: the same rule the act route's witnesses keep.
      const day = worldDayIndex(options.clock, Date.now());
      let n = 0;
      for (const [id, at] of lastAt) {
        const p = people.get(id);
        if (p && Math.hypot(at.x - x, at.y - y) <= r && (day - p.birthDay) / 365 >= 8) n++;
      }
      return n;
    },

    apply(v) {
      if (!village) return;
      adopt(v);
      labelled = null; // the plate is rebuilt for whoever is nearest, from the new life
      refresh(worldDayIndex(options.clock, Date.now()));
    },

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
      for (const b of bubbles) b.el.remove();
      bubbles.length = 0;
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
