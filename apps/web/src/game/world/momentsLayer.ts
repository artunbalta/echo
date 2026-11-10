/**
 * Moments and hidden things (DECISIONS C86), and a village that is never empty (C87), drawn and played
 * out for this viewer.
 *
 * Three streams run at once (`@echo/planet` `moments.ts` says which and where; this layer keeps the clock
 * and the choreography):
 *   people   something happening a few strides ahead: its people walk in from the side, it happens, and
 *            they walk off when it is over, whether the stranger did anything or not. The next begins a
 *            few seconds after (C87; C86 waited a minute).
 *   passer   someone coming along the way toward the stranger: they stop as they meet (a greeting, a
 *            question, a curse), and go on past.
 *   wayside  something lying or standing by the way ahead, with nobody about: a purse in the grass, a
 *            gate left open. Two at most, and one always somewhere ahead.
 * An act on a moment can send the stranger off on an errand (C87): with a loaf to someone's mother, who
 * waits at her door (a promise, kept there or broken by never coming), or walking beside someone to their
 * door.
 *
 * What can be done to a moment is offered like anything else within reach (`things`), carrying the arm of
 * its experiment, and the act is measured like any other (`Interact.tsx`). Walking past one once it was in
 * plain view, or letting someone's greeting go unanswered, is this layer's to notice (`onPassed`), as a
 * promise come to nothing is (`onBroken`). What its people say as the stranger comes near is sent as an
 * `echo:moment-line` event, for the page to show as it shows any line.
 *
 * The village's hidden things are drawn here too: the same for everyone, each found once by each
 * stranger (kept on this device), and once found it offers nothing more.
 *
 * PRESENTATION ONLY: nothing here is shared or stored by the server, and the village's own day (the
 * schedule everyone sees) is untouched. Its people are passers-by drawn by this layer, not villagers
 * taken out of their day.
 */
import * as THREE from "three";
import {
  MOMENT,
  MOMENTS,
  armOf,
  benchSpot,
  doorSpot,
  eggLine,
  eggsOf,
  entryPoint,
  errandHouse,
  fieldSpot,
  houseSpot,
  momentPass,
  momentSpot,
  nextMoment,
  openGround,
  passerPath,
  seaSpot,
  shoreSpot,
  waysideSpot,
  type Egg,
  type MomentArm,
  type MomentGround,
  type MomentKind,
  type MomentLane,
  householdOn,
  worldDayIndex,
  type Thing,
  type WorldClock,
} from "@echo/planet";

import { Crowd, hashUnit, lookFor, type Look } from "./crowd";
import { momentProps, type MomentProps } from "./momentProps";
import type { DirectorLayer } from "./directorLayer";
import type { InteriorLayer } from "./interiorLayer";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";

type P = { x: number; y: number };

export interface MomentsLayer extends WorldLayer {
  readonly name: "moments";
  /** What can be acted on near a point: the moments going on, the errand's end, and hidden things not yet found. */
  things(mx: number, my: number): Thing[];
  /** An act on one of them was finished: the moment plays out, a hidden thing is found. A line to say, or null. */
  acted(ref: string, verbId: string): string | null;
  /** Called once when the stranger has walked past a moment whose passing is data. */
  onPassed(fn: ((kind: MomentKind, ref: string, distM: number, arm: MomentArm | null) => void) | null): void;
  /** Called once when a promise made here came to nothing: the loaf never brought (C87). */
  onBroken(fn: ((kind: MomentKind, ref: string, arm: MomentArm | null) => void) | null): void;
  /**
   * Called once for every moment the stranger saw, when it is over (C87): its arm, how long it was in view,
   * how near they came, and what became of it, acted on or not. The pilot's research record.
   */
  onSeen(fn: ((row: SeenMoment) => void) | null): void;
  /** Report every moment still going on, as it stands (the page is closing). */
  settle(): void;
  /** The moment ahead now, in the people stream (for tests and a played visit's log), or null. */
  current(): { kind: MomentKind; x: number; y: number; state: "arriving" | "live" | "ending" } | null;
  /** Every moment going on now, in every stream (C87). */
  all(): { kind: MomentKind; lane: MomentLane | "errand"; x: number; y: number; state: "arriving" | "live" | "ending"; arm: string | null }[];
  /** The errand under way, if one is (C87). */
  errand(): { kind: "carry" | "escort"; from: MomentKind; x: number; y: number; since: number } | null;
  /** The hidden things, and which this stranger has found. */
  eggs(): readonly (Egg & { found: boolean })[];
}

/** One moment the stranger saw, as it ended (C87): what the pilot's research record holds of it. */
export interface SeenMoment {
  ref: string;
  kind: MomentKind;
  lane: MomentLane | "errand";
  arm: string | null;
  armRaw: Record<string, number | string> | null;
  seenAt: string;
  endedAt: string;
  /** Seconds it was in view, near. */
  seenS: number;
  nearestM: number | null;
  /** The verb chosen, `passed`, `left`, `expired`, `told`, `none`, `open`; for an errand, how it ended. */
  outcome: string;
}

interface Live {
  id: string;
  kind: MomentKind;
  lane: MomentLane;
  arm: MomentArm | null;
  spot: P;
  facing: number;
  entry: P;
  exit: P;
  t0: number;
  arrive: number;
  near: boolean;
  outcome: { verb: string; at: number } | null;
  /** Where a ball was sent: the stranger's feet when it was thrown. */
  aim: P | null;
  looks: Look[];
  /** For the ball games: the throw that went to the stranger, and when it landed. */
  longAt: number | null;
  /** C87. A passer's way, where they are now, and their meeting with the stranger. */
  path: { from: P; to: P; meet: P } | null;
  at: P;
  stoppedAt: number | null;
  goOnAt: number | null;
  met: boolean;
  /** An errand in a hurry was under way when it began: the act is read under time pressure (Darley & Batson). */
  pressure: number;
  /** Whether its people have said what they say as the stranger comes near, and when. */
  spoke: boolean;
  spokeAt: number;
  /** How far a told thing has got (the tale, the throw): lines said after the first. */
  step: number;
  /** Which of its kind's tellings this is (the tale told). */
  variant: number;
  /** For a loaf to carry: the door it is carried to, fixed when it begins (so the promise can be kept). */
  errandTo: (P & { facing: number }) | null;
  /** C87: how long it has been in view and near, since when, the nearest the stranger came, and whether it was reported. */
  seenS: number;
  seenAt: number | null;
  nearest: number;
  reported: boolean;
}

interface Errand {
  id: string;
  kind: "carry" | "escort";
  from: MomentKind;
  ref: string;
  arm: MomentArm | null;
  /** The door it goes to, and where the one at it stands. */
  to: P & { facing: number };
  since: number;
  /** Carry: when the one waiting gives up. */
  deadline: number;
  look: Look;
  /** Escort: where the one walking with the stranger is; carry: where the one waiting stands. */
  at: P;
  heading: number;
  /** Escort: they know the way and lead (the old woman), or follow the stranger (the pedlar). */
  leads: boolean;
  /** Seconds the stranger has been far from them (escort). */
  away: number;
  done: { at: number; how: "kept" | "arrived" | "broken" | "gone" } | null;
  spoke: boolean;
  reported: boolean;
}

interface Figure {
  x: number;
  y: number;
  heading: number;
  activity: "walk" | "stand" | "stoop" | "work" | "sit" | "play" | "mourn" | "sleep";
  speed: number;
  talk?: number;
  wave?: number;
  lookUp?: number;
  lantern?: boolean;
}

const WALK_MPS = 1.4;
const RUN_MPS = 2.6;
/** Seen (C87): within this far, within this angle either side of the way the view looks, for this long. */
const SEEN_M = 12;
const SEEN_HALF_ANGLE = Math.PI / 3;
const SEEN_MIN_S = 1;
const APPLES = 8;
const FOUND_KEY = (cell: string) => `echo.eggs.${cell}`;
const MET_KEY = (cell: string) => `echo.moments.${cell}`;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const toward = (a: P, b: P) => Math.atan2(b.y - a.y, b.x - a.x);
const along = (p: P, a: number, d: number): P => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where someone walking from `a` to `b`, setting off at `t0` at `mps`, is at `t`, and whether they still walk. */
function walking(a: P, b: P, t0: number, mps: number, t: number): { p: P; heading: number; moving: boolean } {
  const d = dist(a, b);
  const k = d < 1e-6 ? 1 : Math.min(1, Math.max(0, ((t - t0) * mps) / d));
  return { p: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, heading: toward(a, b), moving: k > 0 && k < 1 };
}

/** A ball's flight from `a` to `b` over `s` seconds, `peak` metres at its highest: where it is at fraction k. */
function arc(a: P, b: P, k: number, peak: number): { p: P; h: number } {
  const c = Math.min(1, Math.max(0, k));
  return { p: { x: lerp(a.x, b.x, c), y: lerp(a.y, b.y, c) }, h: 1.1 + Math.sin(Math.PI * c) * peak - c * 0.9 };
}

/** How near a passer comes before they stop to meet the stranger, and how long they wait there (C87). */
const PASS: Partial<Record<MomentKind, { sideM: number; stopM: number; waitS: number; mps: number }>> = {
  greeting: { sideM: 1.4, stopM: 3.2, waitS: 5, mps: WALK_MPS },
  "rude-bump": { sideM: 0, stopM: 1.2, waitS: 5, mps: 1.7 },
  "narrow-way": { sideM: 0.4, stopM: 2.6, waitS: 6, mps: 1.1 },
  "ask-way": { sideM: 1.3, stopM: 3, waitS: 8, mps: WALK_MPS },
  "heavy-jugs": { sideM: 1.4, stopM: 3, waitS: 7, mps: 0.8 },
  "dark-lantern": { sideM: 1.3, stopM: 3, waitS: 7, mps: 0.9 },
};

/**
 * What its people say as the stranger comes near (C87), by arm where the arm changes it. English here; the
 * page says it in the stranger's language. A villager speaking is the world, not a prompt (Law 2): it is
 * what they would say to anyone.
 */
const SAYS: Partial<Record<MomentKind, string | Record<string, string>>> = {
  "fallen-elder": "Oh — my ankle. I cannot get up.",
  "asch-boats": { unanimous: "The red one's the longer, plain as day. Isn't it?", dissenter: "We say the red one's the longer. He says the blue. Which is it?" },
  teasing: "Look at him! He can't even keep a kite up!",
  "imece-wall": { alone: "These stones get heavier every year.", crew: "One more row and it's done." },
  "net-haul": { alone: "Heavy today! If I could only get it in…", crew: "Pull! All together now, pull!" },
  "stray-ball": { apology: "Sorry! Sorry, it slipped!" },
  knucklebones: "Throw it under the cup! If it's tava, the pomegranate's yours.",
  "wrong-basket": "Here, Yusuf's fish. You're his cousin, aren't you? Take it.",
  "tea-invite": "Come, sit down, have a glass of tea.",
  "tangled-net": "Every knot I undo, another comes.",
  "bread-errand": { hurry: "Would you take this to my mother, just along there? Quickly, she wants it before the boats go out.", "no-hurry": "Would you take this loaf to my mother, just along there? There's no hurry." },
  campfire: "…and that was the last anyone saw of him.",
  greeting: { high: "Peace be upon you.", low: "Morning to you!", peer: "Good day!" },
  "rude-bump": "Watch where you're going!",
  "ask-way": "Excuse me, which way is the harbour?",
  "heavy-jugs": "Oof. These get heavier every year.",
  "dark-lantern": "My lantern's gone out. I can hardly see the path.",
};
/** What is said when an errand ends well (C87). */
const ARRIVED: Partial<Record<MomentKind, string>> = {
  "ask-way": "Here it is. Thank you, friend.",
  "heavy-jugs": "Here we are. Bless you.",
  "dark-lantern": "This is my door. Thank you, and goodnight.",
};
const MOTHER_SAYS = "Is that my daughter's bread?";

/**
 * The tales the old man tells (C87, curiosity): Nasreddin Hoca's, each stopped just before its end. The
 * beginning as the stranger comes near, the pause, and the end, said only if they wait or ask for it.
 */
const TALES: readonly { start: string; end: string }[] = [
  {
    start: "…so the Hoca borrows his neighbour's cauldron, and brings it back with a little pot inside. \"Your cauldron gave birth,\" he says. The neighbour is delighted. A week later the Hoca borrows it again, and this time he does not bring it back…",
    end: "\"Your cauldron died,\" says the Hoca. \"How can a cauldron die?\" \"You believed it could give birth, didn't you?\"",
  },
  {
    start: "…the Hoca goes to a wedding feast in his old work clothes, and nobody so much as looks at him. So he goes home, puts on his fur coat, and comes back. Now they seat him at the head of the table and bring him soup…",
    end: "He dips the sleeve of his coat in the soup. \"Eat, my coat, eat,\" he says. \"It was you they invited, not me.\"",
  },
  {
    start: "…one day they find the Hoca at the lakeside, stirring yoghurt into the water with a spoon. \"Hoca, what are you doing?\" \"Making the lake into yoghurt.\" \"But a lake can never turn into yoghurt!\"…",
    end: "\"I know,\" says the Hoca. \"But what if it does?\"",
  },
];
const TALE_PAUSE = "Wait, wait — let me light my pipe.";
/** The knucklebone's fall, as the stranger sees it: under the cup where only they see it, or with both children watching. */
const THROWN: Record<string, string> = {
  unseen: "You throw it under the cup and lift the edge: it lies on its side. Not tava.",
  seen: "You throw it in the open, and both of them lean in to look: it lies on its side. Not tava.",
};
const SEEN_LIE = "They saw it as well as you did. They look at each other, and hand you the pomegranate anyway.";

/** Every line a moment's people say (for the test that each has its Turkish). */
export const MOMENT_LINES: readonly string[] = [
  ...Object.values(SAYS).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))),
  ...Object.values(ARRIVED),
  MOTHER_SAYS,
  ...TALES.flatMap((t) => [t.start, t.end]),
  TALE_PAUSE,
  ...Object.values(THROWN),
  SEEN_LIE,
];

export function momentsLayer(options: { clock: WorldClock }): MomentsLayer {
  let frame: WorldFrame | null = null;
  let ctxRef: LayerContext | null = null;
  let crowd: Crowd | null = null;
  const group = new THREE.Group();
  group.name = "moments";
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const mat = (hex: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => {
    const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
    materials.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };

  // Props, made once and moved about (`momentProps.ts`).
  let props: MomentProps | null = null;
  let basket: THREE.Mesh | null = null;
  let apples: THREE.Mesh[] = [];
  let cart: THREE.Group | null = null;
  let ball: THREE.Mesh | null = null;
  let buckets: THREE.Mesh[] = [];
  let hen: THREE.Group | null = null;
  let lamp: THREE.Mesh | null = null;
  /** A second lantern's flame, for someone coming along after dark while the hen's woman has hers. */
  let lamp2: THREE.Mesh | null = null;
  let streak: THREE.Mesh | null = null;
  let door: THREE.Group | null = null;
  const handAt = new THREE.Vector3();
  const eggMeshes = new Map<string, THREE.Object3D>();

  const lanes: Record<"people" | "passer", { live: Live | null; nextAt: number; count: number }> = {
    people: { live: null, nextAt: MOMENT.lanes.people.firstS, count: 0 },
    passer: { live: null, nextAt: MOMENT.lanes.passer.firstS, count: 0 },
  };
  let waysides: Live[] = [];
  let waysideNextAt: number = MOMENT.lanes.wayside.firstS;
  let waysideCount = 0;
  let errand: Errand | null = null;
  const lastMet = new Map<MomentKind, number>();
  let metCounts: Record<string, number> = {};
  let started = -1;
  let seed = "anon";
  let eggs: Egg[] = [];
  let found = new Set<string>();
  let passedFn: ((kind: MomentKind, ref: string, distM: number, arm: MomentArm | null) => void) | null = null;
  let brokenFn: ((kind: MomentKind, ref: string, arm: MomentArm | null) => void) | null = null;
  let seenFn: ((row: SeenMoment) => void) | null = null;
  let me: P = { x: 0, y: 0 };
  let nowS = 0;
  let dark = false;

  const ground = (): MomentGround => ({
    height: (x, y) => {
      if (!frame) return -1;
      const [tx, ty] = frame.fromLocalM(x, y);
      return frame.heightAtTile(tx, ty);
    },
    plan: ctxRef?.region.village?.plan ?? null,
  });

  const place = (o: THREE.Object3D, p: P, lift = 0, yaw = 0) => {
    if (!frame) return;
    const [tx, ty] = frame.fromLocalM(p.x, p.y);
    o.position.set(tx * frame.tileM, Math.max(0, frame.heightAtTile(tx, ty)) + lift, ty * frame.tileM);
    // A local heading h points along (cos h, -sin h) in three's x-z, as the villagers' rig has it.
    o.rotation.y = yaw;
    o.visible = true;
  };
  const yawOf = (heading: number) => heading + Math.PI / 2;
  const S = () => (frame ? frame.tileM / 1.6 : 1);

  const keepFound = () => {
    try {
      if (ctxRef) localStorage.setItem(FOUND_KEY(ctxRef.region.cell), JSON.stringify([...found]));
    } catch {
      // kept for this page only
    }
  };
  const keepMet = () => {
    try {
      if (ctxRef) localStorage.setItem(MET_KEY(ctxRef.region.cell), JSON.stringify(metCounts));
    } catch {
      // kept for this page only
    }
  };
  /** Something in the stranger's hands for an errand (the loaf, a jug), or not. */
  const carry = (on: boolean) => {
    const player = ctxRef?.layer<WorldLayer & { setCarrying?(on: boolean): void }>("player");
    if (typeof player?.setCarrying === "function") player.setCarrying(on);
  };
  const sayLine = (text: string) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("echo:moment-line", { detail: { text } }));
  };
  const lineOf = (l: Live): string | null => {
    if (l.kind === "unfinished-tale") return TALES[l.variant % TALES.length]!.start;
    const said = SAYS[l.kind];
    if (!said) return null;
    if (typeof said === "string") return said;
    // Said only in the arm it belongs to: the child who throws wide says sorry in one arm and nothing in the other.
    return l.arm ? (said[l.arm.id] ?? null) : (Object.values(said)[0] ?? null);
  };

  // ── C86: where its people stand, where it is acted on, how big it is ─────────────────────────

  /** Where the people of a moment stand once they are in it, by kind. */
  const spots = (l: Live): P[] => {
    const side = l.facing + Math.PI / 2;
    const plan = ctxRef?.region.village?.plan;
    switch (l.kind) {
      case "spilled-basket":
      case "stuck-cart":
      case "stray-ball":
        return [l.spot];
      case "ball-game":
        // Two who throw to each other, and one standing off on their own.
        return [along(l.spot, side, 1.7), along(l.spot, side + Math.PI, 1.7), along(along(l.spot, l.facing + Math.PI, 3), side, 3)];
      case "well-custom": {
        const c = plan?.centre ?? l.spot;
        return [along(c, l.facing + 1.2, 1.5), along(c, l.facing - 1.6, 1.5)];
      }
      case "well-queue": {
        const c = plan?.centre ?? l.spot;
        return [0, 1, 2].map((i) => along(c, l.facing, 1.7 + 1.25 * i));
      }
      case "village-dance":
        return [0, 1, 2, 3, 4, 5].map((i) => along(l.spot, (i / 6) * Math.PI * 2, 2.3));
      case "loose-hen":
        return [l.spot];
      case "falling-stars":
      case "banging-door":
        return [];
      default:
        return castOf(l).map((r) => r.at);
    }
  };

  /** Where the moment can be acted on now, or null (still arriving, or over). */
  const thingAt = (l: Live, t: number): P | null => {
    if (l.outcome) return null;
    const plan = ctxRef?.region.village?.plan;
    switch (l.kind) {
      case "spilled-basket":
      case "stuck-cart":
        return t >= l.arrive ? l.spot : null;
      case "ball-game":
      case "stray-ball":
        return l.longAt !== null && t >= l.longAt && l.aim ? l.aim : null;
      case "well-custom":
        return t >= l.arrive && plan ? along(plan.centre, toward(plan.centre, me), 0.2) : null;
      case "well-queue":
        return t >= l.arrive ? along(plan?.centre ?? l.spot, l.facing, 1.7 + 1.25 * 3) : null;
      case "village-dance":
      case "loose-hen":
        return t >= l.arrive ? l.spot : null;
      case "falling-stars":
        // The sky is over the stranger wherever they walk.
        return t >= 1 ? me : null;
      case "banging-door":
        return l.spot;
      default:
        return actPoint(l, t);
    }
  };

  const sizeOf = (kind: MomentKind) =>
    kind === "village-dance" ? 2.6 : kind === "loose-hen" ? 2 : kind === "well-custom" ? 1.6 : kind === "stuck-cart" ? 1.4 : kind === "spilled-basket" ? 1.8 : kind === "falling-stars" ? 0 : kind === "banging-door" ? 0.8
      : kind === "dolphins" ? 0 : kind === "asch-boats" || kind === "imece-wall" || kind === "campfire" ? 2.2 : kind === "net-haul" || kind === "tangled-net" || kind === "looking-up" || kind === "bench-sit" || kind === "unfinished-tale" ? 1.6
      : kind === "honey-stall" || kind === "woodpile" || kind === "teasing" ? 1.2 : 0.7;

  // ── C87: the people in a moment, by kind ──────────────────────────────────────────────────

  interface Role {
    /** Where they are once in it. */
    at: P;
    /** Who they are drawn as. */
    age: number;
    sex: "f" | "m";
    trade: string;
  }

  /** Everyone in a C87 moment, where they stand in it, and who they are. Things by the way have nobody. */
  const castOf = (l: Live): Role[] => {
    const f = l.facing;
    const side = f + Math.PI / 2;
    const at = (a: number, r: number) => along(l.spot, f + a, r);
    const adult = (i: number, p: P, trade = "farmer"): Role => ({ at: p, age: 24 + hashUnit(`${l.id}|age|${i}`) * 34, sex: hashUnit(`${l.id}|sex|${i}`) < 0.5 ? "f" : "m", trade });
    switch (l.kind) {
      case "fallen-elder": {
        const out: Role[] = [{ at: l.spot, age: 74, sex: "m", trade: "farmer" }];
        // The onlookers stand off to one side, talking to each other, not helping.
        if (l.arm?.id === "onlookers") out.push(adult(1, along(at(0.9, 3.6), side, 0.6)), adult(2, along(at(0.9, 3.6), side, -0.6)));
        return out;
      }
      case "asch-boats":
        return [0, 1, 2].map((i) => adult(i, along(along(l.spot, f + Math.PI, 1.9), side, (i - 1) * 1.1), "fisher"));
      case "looking-up": {
        const n = l.arm?.id === "five" ? 5 : 1;
        return Array.from({ length: n }, (_, i) => adult(i, along(along(l.spot, side, (i - (n - 1) / 2) * 0.9), f, (i % 2) * 0.6)));
      }
      case "teasing":
        // Three in a half ring round a smaller one on the ground.
        return [
          { at: l.spot, age: 7, sex: "m", trade: "farmer" },
          ...[-1, 0, 1].map((k, i) => ({ at: along(l.spot, f + Math.PI + k * 0.8, 1.6), age: 10 + i, sex: "m" as const, trade: "farmer" })),
        ];
      case "imece-wall":
        return l.arm?.id === "crew"
          ? [0, 1, 2, 3].map((i) => adult(i, along(at(Math.PI, 1.1), side, (i - 1.5) * 1.0), "labourer"))
          : [{ at: at(Math.PI, 1.1), age: 69, sex: "m", trade: "labourer" }];
      case "net-haul":
        // At the rope, in a line up the beach from the water: one alone, or three.
        return Array.from({ length: l.arm?.id === "crew" ? 3 : 1 }, (_, i) => ({ at: along(at(Math.PI, 0.8 + i * 1.1), side, 0.35 * (i % 2 ? 1 : -1)), age: 30 + hashUnit(`${l.id}|age|${i}`) * 35, sex: "m" as const, trade: "fisher" }));
      case "tangled-net":
        return [{ at: at(Math.PI / 2, 1.2), age: 40 + hashUnit(`${l.id}|age`) * 25, sex: "m", trade: "fisher" }];
      case "bench-sit":
        // At one end of the bench, sitting the way the bench faces.
        return [{ at: along(l.spot, f + Math.PI / 2, 0.62), age: l.arm?.id === "elder" ? 72 : 28, sex: hashUnit(`${l.id}|s`) < 0.5 ? "f" : "m", trade: l.arm?.id === "elder" ? "weaver" : "farmer" }];
      case "unfinished-tale":
        // The old man, and two children sitting in front of him.
        return [{ at: l.spot, age: 78, sex: "m", trade: "weaver" }, { at: at(0.5, 1.3), age: 8, sex: "m", trade: "farmer" }, { at: at(-0.5, 1.3), age: 9, sex: "f", trade: "farmer" }];
      case "knucklebones":
        return [{ at: along(l.spot, side, 0.55), age: 9, sex: "m", trade: "farmer" }, { at: along(l.spot, side, -0.55), age: 10, sex: "m", trade: "fisher" }];
      case "musician":
        return [{ at: l.spot, age: 72, sex: "m", trade: "weaver" }];
      case "wrong-basket":
        return [{ at: l.spot, age: 38, sex: "f", trade: "fisher" }];
      case "tea-invite":
        return [{ at: l.spot, age: 76, sex: "f", trade: "weaver" }];
      case "bread-errand":
        return [{ at: l.spot, age: 33, sex: "f", trade: "farmer" }];
      case "drunk-or-ill":
        return [{ at: l.spot, age: 48, sex: "m", trade: "labourer" }];
      case "campfire":
        return [0, 1, 2, 3].map((i) => adult(i, at((i / 4) * Math.PI * 2 + 0.4, 1.3), i % 2 ? "fisher" : "farmer"));
      case "crying-alone":
        return [{ at: l.spot, age: 21, sex: "f", trade: "weaver" }];
      case "greeting":
        return [{ at: l.at, age: l.arm?.id === "high" ? 66 : l.arm?.id === "low" ? 17 : 35, sex: l.arm?.id === "peer" && hashUnit(`${l.id}|s`) < 0.5 ? "f" : "m", trade: l.arm?.id === "high" ? "weaver" : "labourer" }];
      case "rude-bump":
        return [{ at: l.at, age: 41, sex: "m", trade: "carter" }];
      case "narrow-way":
        return l.arm?.id === "elder" ? [{ at: l.at, age: 74, sex: "m", trade: "weaver" }] : [{ at: l.at, age: 15, sex: "f", trade: "farmer" }];
      case "ask-way":
        return [{ at: l.at, age: 45, sex: "m", trade: "potter" }];
      case "heavy-jugs":
        return [{ at: l.at, age: 77, sex: "f", trade: "farmer" }];
      case "dark-lantern":
        return [{ at: l.at, age: 52, sex: "f", trade: "weaver" }];
      default:
        return [];
    }
  };

  /** Where a C87 moment is acted on now, or null. */
  const actPoint = (l: Live, t: number): P | null => {
    const def = MOMENTS[l.kind];
    if (def.lane === "wayside") return l.spot;
    if (def.lane === "passer") return l.met && l.stoppedAt !== null ? l.at : dist(l.at, me) < 4.5 ? l.at : null;
    if (l.kind === "dolphins") return t >= 1 ? me : null;
    if (t < l.arrive) return null;
    if (l.kind === "imece-wall" || l.kind === "net-haul" || l.kind === "tangled-net") return along(l.spot, l.facing, 0.3);
    // The knucklebone's answer is the stranger's only once they have thrown it and seen how it fell.
    if (l.kind === "knucklebones" && l.step < 1) return null;
    return l.spot;
  };

  /** Start the next moment of a stream, if one fits here and now. */
  const begin = (lane: MomentLane, ctx: LayerContext, now: number, hour: number) => {
    const plan = ctx.region.village?.plan ?? null;
    const g = ground();
    const village = ctx.region.village;
    const day = worldDayIndex(options.clock, Date.now());
    const lived = (plot: NonNullable<typeof plan>["plots"][number]) => !!village && householdOn(village.settlement, plot, day) !== null;
    const count = lane === "wayside" ? waysideCount : lanes[lane].count;
    const later = (s: number) => {
      if (lane === "wayside") waysideNextAt = now + s;
      else lanes[lane].nextAt = now + s;
    };
    const skip = (k: MomentKind) => {
      // Awe waits until the pilot's six are long over (Piff et al. 2015: awe makes people more generous).
      if (MOMENTS[k].awe && now - started < MOMENT.aweAfterS) return true;
      const last = lastMet.get(k);
      if (last !== undefined && now - last < (k === "greeting" ? MOMENT.greetingRepeatS : MOMENT.repeatS)) return true;
      // One errand at a time, and nothing that sends the stranger off while one is under way; and no
      // promise asked for that could not be kept (a loaf for a mother with no house of hers near).
      if (MOMENTS[k].errand && errand && !errand.done) return true;
      if (MOMENTS[k].errand?.kind === "carry" && (!plan || !errandHouse(me, me, plan, `${seed}|probe`, lived))) return true;
      return waysides.some((w) => w.kind === k);
    };
    const next = nextMoment(seed, count, hour, me, plan, lane, g, skip);
    if (!next) {
      later(lane === "wayside" ? 5 : 8);
      return;
    }
    const def = MOMENTS[next.kind];
    const staged = ctx.layer<DirectorLayer>("director")?.staging() ?? null;
    // The way the camera looks, on the ground: what is ahead of the stranger is what they will see.
    const fwd = new THREE.Vector3();
    ctx.camera.getWorldDirection(fwd);
    const [ax, ay] = frame!.toLocalM((ctx.camera.position.x + fwd.x * 10) / frame!.tileM, (ctx.camera.position.z + fwd.z * 10) / frame!.tileM);
    const [cx, cy] = frame!.toLocalM(ctx.camera.position.x / frame!.tileM, ctx.camera.position.z / frame!.tileM);
    const heading = Math.atan2(ay - cy, ax - cx);
    const id = `${seed}|${lane}|${next.n}`;
    const avoid: P[] = [...waysides.map((w) => w.spot), ...(lanes.people.live ? [lanes.people.live.spot] : []), ...(staged ? [{ x: staged.x, y: staged.y }] : [])];
    let spot: P | null = null;
    let facing = 0;
    let path: Live["path"] = null;
    if (lane === "passer") {
      path = passerPath(me, heading, id, g, PASS[next.kind]?.sideM ?? MOMENT.passer.sideM);
      if (path) {
        spot = path.meet;
        facing = toward(path.from, path.to);
      }
    } else if (def.where === "sky" || def.where === "sea") {
      const s = def.where === "sea" ? seaSpot(me, heading, id, g) : { x: me.x, y: me.y, facing: heading };
      if (s) {
        spot = { x: s.x, y: s.y };
        facing = s.facing;
      }
    } else if (def.where === "door" && plan) {
      // A lived-in house's door: a ruin's has nothing left to bang, and nobody sits on its step.
      const d = doorSpot(me, heading, plan, lived);
      if (d) {
        // The banging door is the doorway itself; someone at a door stands just outside it.
        spot = next.kind === "banging-door" ? d : along(d, d.facing, 0.9);
        facing = next.kind === "banging-door" ? d.facing : toward(spot, me);
      }
    } else if (def.where === "well" && plan) {
      spot = plan.centre;
      facing = toward(plan.centre, me);
    } else if (def.where === "shore") {
      const s = shoreSpot(me, heading, id, g, staged ? { x: staged.x, y: staged.y } : null);
      if (s) {
        spot = s;
        facing = s.facing;
      }
    } else if (def.where === "house" && plan) {
      const s = houseSpot(me, heading, plan, g, lived);
      if (s && !avoid.some((p) => dist(p, s) < MOMENT.wayside.apartM)) {
        spot = s;
        facing = s.facing;
      }
    } else if (def.where === "bench" && plan) {
      const s = benchSpot(me, heading, plan);
      if (s) {
        spot = s;
        facing = s.facing;
      }
    } else if (def.where === "field" && plan) {
      const s = fieldSpot(me, heading, plan, g);
      if (s && !avoid.some((p) => dist(p, s) < MOMENT.wayside.apartM)) {
        spot = s;
        facing = s.facing;
      }
    } else if (lane === "wayside") {
      const s = waysideSpot(me, heading, id, g, avoid);
      if (s) {
        spot = s;
        facing = s.facing;
      }
    } else {
      const s = momentSpot(me, heading, id, g, staged ? { x: staged.x, y: staged.y } : null);
      if (s && def.where === "green" && plan && dist(s, plan.centre) > plan.greenRadiusM) {
        // A dance is on the green: the stretch of it nearest the stranger.
        const on = along(plan.centre, toward(plan.centre, me), plan.greenRadiusM * 0.45);
        spot = openGround(g, on.x, on.y) ? on : null;
        facing = toward(spot ?? on, me);
      } else if (s) {
        spot = s;
        facing = s.facing;
      }
    }
    if (!spot) {
      later(lane === "wayside" ? 4 : 6);
      return;
    }
    // A loaf asked to be carried has its door already: if there is none, the rotation moves on.
    let errandTo: Live["errandTo"] = null;
    if (def.errand?.kind === "carry" && plan) {
      const h = errandHouse(me, spot, plan, `${id}|to`, lived);
      if (!h) {
        if (lane !== "wayside") lanes[lane].count = next.n;
        later(2);
        return;
      }
      errandTo = { ...h, ...along(h, h.facing, 0.9) };
    }
    const variant = metCounts[next.kind] ?? 0;
    const arm = armOf(seed, next.kind, variant);
    // Batson's easy escape: she sits well off to one side of the way, not on it.
    if (next.kind === "crying-alone" && arm?.id === "aside") {
      const off = along(spot, heading + Math.PI / 2, 7);
      if (openGround(g, off.x, off.y)) spot = off;
    }
    if (lane === "wayside") waysideCount = next.n;
    else lanes[lane].count = next.n;
    metCounts[next.kind] = (metCounts[next.kind] ?? 0) + 1;
    keepMet();
    lastMet.set(next.kind, now);
    // Someone at their own door steps out of it, and goes back in when it is over.
    const doorway = def.where === "door" && next.kind !== "banging-door" ? along(spot, toward(spot, me) + Math.PI, 0.9) : null;
    const entry = path ? path.from : doorway ?? entryPoint(spot, me, id, g);
    const exit = path ? path.to : doorway ?? along(spot, toward(entry, spot), MOMENT.entryM);
    const l: Live = {
      id, kind: next.kind, lane, arm, spot, facing, entry, exit, t0: now, arrive: 0, near: false, outcome: null, aim: null, looks: [], longAt: null,
      path, at: path ? path.from : spot, stoppedAt: null, goOnAt: null, met: false,
      pressure: errand && !errand.done && errand.kind === "carry" ? (errand.arm?.context?.time_pressure ?? 0) : 0,
      spoke: false, spokeAt: 0, step: 0, variant, errandTo, seenS: 0, seenAt: null, nearest: Infinity, reported: false,
    };
    const c86People = l.kind === "village-dance" ? 6 : l.kind === "ball-game" || l.kind === "well-queue" ? 3 : l.kind === "well-custom" ? 2 : 1;
    const c87 = def.paradigm !== "C86";
    const cast = c87 ? castOf(l) : [];
    const people = c87 ? cast.length : l.kind === "falling-stars" || l.kind === "banging-door" ? 0 : c86People;
    l.looks = Array.from({ length: people }, (_, i) => {
      const k = hashUnit(`${id}|${i}`);
      if (c87) {
        const r = cast[i]!;
        return lookFor(`moment:${id}:${i}`, r.trade, r.age, r.sex);
      }
      const child = def.children;
      return lookFor(`moment:${id}:${i}`, child ? "farmer" : (["farmer", "fisher", "weaver", "potter", "labourer", "carter"] as const)[Math.floor(k * 6)], child ? 7 + k * 5 : 22 + k * 40, k < 0.5 ? "f" : "m");
    });
    // Its people walk in; a passer is already on their way; things by the way, the sky and the sea are just there.
    const walkIn = lane === "people" && def.where !== "sky" && def.where !== "sea" && next.kind !== "banging-door";
    if (walkIn) {
      const far = Math.max(0, ...spots(l).map((s) => dist(entry, s)));
      l.arrive = far / (def.children ? RUN_MPS : WALK_MPS);
    } else l.arrive = lane === "people" ? 0.5 : 0;
    if (lane === "wayside") waysides.push(l);
    else lanes[lane].live = l;
  };

  /** A moment of the page's clock (seconds), as a wall-clock time. */
  const wall = (s: number) => new Date(Date.now() - (performance.now() / 1000 - s) * 1000).toISOString();
  const ACTED_NOT = new Set(["passed", "expired", "left", "told"]);

  /** Report a moment once, when it is over (or the page closes on it): only one the stranger saw, or acted on. */
  const report = (l: Live, now: number, open = false) => {
    if (l.reported) return;
    l.reported = true;
    const acted = !!l.outcome && !ACTED_NOT.has(l.outcome.verb);
    if (l.seenS < SEEN_MIN_S && !acted) return;
    const armRaw: Record<string, number | string> = { ...(l.arm?.raw ?? {}) };
    // Met while carrying a loaf someone is waiting on: under time pressure (Darley & Batson).
    if (l.pressure > 0) armRaw.time_pressure = l.pressure;
    seenFn?.({
      ref: `moment:${l.id}`,
      kind: l.kind,
      lane: l.lane,
      arm: l.arm?.id ?? null,
      armRaw: Object.keys(armRaw).length ? armRaw : null,
      seenAt: wall(l.seenAt ?? l.t0),
      endedAt: wall(now),
      seenS: Math.round(l.seenS * 10) / 10,
      nearestM: Number.isFinite(l.nearest) ? Math.round(l.nearest * 10) / 10 : null,
      outcome: l.outcome?.verb ?? (open ? "open" : "none"),
    });
  };
  const reportErrand = (e: Errand, now: number) => {
    if (e.reported) return;
    e.reported = true;
    seenFn?.({
      ref: `${e.ref}|errand`,
      kind: e.from,
      lane: "errand",
      arm: e.arm?.id ?? null,
      armRaw: e.arm?.raw ? { ...e.arm.raw } : null,
      seenAt: wall(e.since),
      endedAt: wall(e.done?.at ?? now),
      seenS: Math.round(((e.done?.at ?? now) - e.since) * 10) / 10,
      nearestM: null,
      outcome: e.done?.how ?? "open",
    });
  };

  /** End a moment of a stream: the next comes a few seconds later. */
  const close = (lane: MomentLane, now: number, l: Live) => {
    report(l, now);
    if (lane === "wayside") {
      waysides = waysides.filter((w) => w !== l);
      waysideNextAt = Math.max(waysideNextAt, now + MOMENT.lanes.wayside.gapS[0]);
      return;
    }
    const L = lanes[lane];
    if (L.live !== l) return;
    L.live = null;
    const [g0, g1] = MOMENT.lanes[lane].gapS;
    L.nextAt = now + g0 + hashUnit(`${seed}|gap|${lane}|${L.count}`) * (g1 - g0);
  };

  // ── C86's choreography, as it was ─────────────────────────────────────────────────────────

  /** Everyone in a C86 moment at `t` seconds into it, and its props put where they are. */
  const play = (l: Live, t: number): Figure[] => {
    const where = spots(l);
    const done = l.outcome;
    const sinceDone = done ? t - (done.at - l.t0) : 0;
    const leaving = done ? sinceDone > 3.5 : t > MOMENTS[l.kind].lifeS;
    const leaveAt = done ? done.at - l.t0 + 3.5 : MOMENTS[l.kind].lifeS;
    const mps = MOMENTS[l.kind].children ? RUN_MPS : WALK_MPS;
    const out: Figure[] = [];
    const arriveOrLeave = (i: number, at: P): Figure | null => {
      const from = along(l.entry, l.facing + Math.PI / 2, (i - (where.length - 1) / 2) * 0.8);
      if (t < l.arrive) {
        const w = walking(from, at, 0, mps, t);
        return { x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? (MOMENTS[l.kind].children ? "play" : "walk") : "stand", speed: w.moving ? 1 : 0 };
      }
      if (leaving) {
        const to = along(l.exit, l.facing + Math.PI / 2, (i - (where.length - 1) / 2) * 0.8);
        const w = walking(at, to, leaveAt + i * 0.4, mps * 0.85, t);
        return { x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? (MOMENTS[l.kind].children ? "play" : "walk") : "stand", speed: w.moving ? 1 : 0 };
      }
      return null;
    };

    switch (l.kind) {
      case "spilled-basket": {
        const f = arriveOrLeave(0, l.spot);
        const spill = l.arrive;
        // The apples: in the basket, then all over, then gathered up — slowly by her, at once with help.
        const gathered = done ? 1 : Math.min(1, Math.max(0, (t - spill) / 48));
        for (let i = 0; i < APPLES; i++) {
          const a = (hashUnit(`${l.id}|apple|${i}`) * 2 - 1) * Math.PI;
          const r = 0.6 + hashUnit(`${l.id}|appler|${i}`) * 1.6;
          const rest = along(l.spot, l.facing + a, r);
          const gone = i / APPLES < gathered || (done && sinceDone > 0.4 + i * 0.08);
          if (t < spill || gone) continue;
          const k = Math.min(1, (t - spill) / 0.5);
          place(apples[i]!, { x: lerp(l.spot.x, rest.x, k), y: lerp(l.spot.y, rest.y, k) }, 0.08 + Math.sin(Math.PI * k) * 0.35);
        }
        if (f) {
          // Carried in, and carried off again.
          out.push(f);
          place(basket!, along({ x: f.x, y: f.y }, f.heading + 0.6, 0.4), 0.75, yawOf(f.heading));
        } else {
          place(basket!, along(l.spot, l.facing + 0.4, 0.5), 0.12, yawOf(l.facing));
          if (done && sinceDone < 3.5) out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 0.6 && sinceDone < 2.6 ? Math.sin((Math.PI * (sinceDone - 0.6)) / 2) : 0, talk: 0.6 });
          else out.push({ x: l.spot.x, y: l.spot.y, heading: l.facing + Math.sin(t * 0.4) * 0.8, activity: "stoop", speed: 0 });
        }
        break;
      }
      case "stuck-cart": {
        const f = arriveOrLeave(0, along(l.spot, l.facing + Math.PI, 1.1));
        const rolled = done ? Math.min(1, sinceDone / 2) : 0;
        const cartAt = along(l.spot, l.facing + Math.PI / 2, rolled * 3);
        const stuck = t >= l.arrive && !done;
        if (cart) {
          const behind = f && t < l.arrive ? along({ x: f.x, y: f.y }, f.heading + Math.PI, 1.5) : f && leaving ? along({ x: f.x, y: f.y }, f.heading + Math.PI, 1.5) : cartAt;
          const yaw = f && (t < l.arrive || leaving) ? yawOf(f.heading) : yawOf(l.facing + Math.PI / 2);
          place(cart, behind, stuck ? -0.12 : 0, yaw);
          cart.rotation.z = stuck ? 0.22 + Math.sin(t * 6) * 0.03 : 0;
        }
        if (f) out.push(f);
        else if (done && sinceDone < 3.5) out.push({ x: cartAt.x - Math.cos(l.facing) * 1.1, y: cartAt.y - Math.sin(l.facing) * 1.1, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 2 ? Math.sin((Math.PI * (sinceDone - 2)) / 1.5) : 0 });
        else {
          const at = along(l.spot, l.facing + Math.PI, 1.1);
          // Straining at it, and, left to it too long, sitting down on the shaft.
          out.push({ x: at.x, y: at.y, heading: l.facing, activity: t - l.arrive > 30 ? "sit" : "work", speed: 0 });
        }
        break;
      }
      case "ball-game": {
        const throwEvery = 1.3;
        const longAt = l.arrive + 7;
        for (let i = 0; i < 3; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f) out.push(f);
          else {
            const lookAt = i === 2 ? along(l.spot, 0, 0) : where[1 - i]!;
            out.push({ x: where[i]!.x, y: where[i]!.y, heading: toward(where[i]!, lookAt), activity: "stand", speed: 0, talk: i < 2 ? 0.3 : 0, wave: l.longAt !== null && !done && i < 2 && t > l.longAt ? 0.6 : 0 });
          }
        }
        if (t >= l.arrive && !leaving) {
          // Back and forth between the two, then one goes long, to the stranger.
          if (l.longAt === null && t >= longAt) {
            l.aim = along(me, toward(me, l.spot), 0.9);
            l.longAt = t + 1.1;
          }
          let a: P;
          let b: P;
          let k: number;
          let peak = 1.4;
          if (l.longAt === null) {
            const n = Math.floor((t - l.arrive) / throwEvery);
            a = where[n % 2]!;
            b = where[(n + 1) % 2]!;
            k = ((t - l.arrive) % throwEvery) / throwEvery;
          } else if (!done) {
            a = where[1]!;
            b = l.aim!;
            k = (t - (l.longAt - 1.1)) / 1.1;
            peak = 2.6;
          } else {
            // Thrown back by the stranger: to the one on their own, or to the others; then the game goes on.
            const included = done.verb === "to-alone";
            const s = t - (done.at - l.t0);
            const players = included ? [where[2]!, where[0]!, where[1]!] : [where[0]!, where[1]!];
            if (s < 1) {
              a = l.aim!;
              b = players[0]!;
              k = s;
            } else {
              const n = Math.floor((s - 1) / throwEvery);
              a = players[n % players.length]!;
              b = players[(n + 1) % players.length]!;
              k = ((s - 1) % throwEvery) / throwEvery;
            }
          }
          const f = arc(a, b, k, peak);
          if (ball) place(ball, f.p, Math.max(0.12, f.h));
        }
        break;
      }
      case "stray-ball": {
        const f = arriveOrLeave(0, l.spot);
        const hitAt = l.arrive + 2.4;
        if (f) out.push(f);
        else {
          const guilty = l.longAt !== null && !done;
          out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: guilty ? "mourn" : "stand", speed: 0, wave: done?.verb === "laugh" && sinceDone > 1 && sinceDone < 3 ? 0.8 : 0 });
        }
        if (ball && !leaving) {
          if (t < hitAt) place(ball, along(l.spot, l.facing, 0.4), 0.3 + Math.abs(Math.sin(t * 4)) * 0.9);
          else {
            if (l.longAt === null) {
              l.aim = along(me, toward(l.spot, me), 1.1);
              l.longAt = t + 0.9;
            }
            if (t < l.longAt) {
              const k = (t - (l.longAt - 0.9)) / 0.9;
              const p = arc(l.spot, me, k, 0.6);
              place(ball, p.p, 0.6 + p.h);
            } else if (done?.verb === "laugh") {
              const k = Math.min(1, (t - (done.at - l.t0)) / 1.2);
              place(ball, { x: lerp(l.aim!.x, l.spot.x, k), y: lerp(l.aim!.y, l.spot.y, k) }, 0.12);
            } else place(ball, l.aim!, 0.12);
          }
        }
        break;
      }
      case "well-custom": {
        // Two people come by the well; each touches the rim with a bow, and walks on.
        for (let i = 0; i < 2; i++) {
          const t0 = i * 5;
          const from = along(l.entry, l.facing + Math.PI / 2, i * 3);
          const rim = where[i]!;
          const on = along(rim, toward(from, rim), 6 + i * 2);
          if (t < t0) continue;
          const reach = dist(from, rim) / WALK_MPS;
          if (t < t0 + reach) {
            const w = walking(from, rim, t0, WALK_MPS, t);
            out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
          } else if (t < t0 + reach + 2.2) {
            out.push({ x: rim.x, y: rim.y, heading: toward(rim, ctxRef?.region.village?.plan.centre ?? rim), activity: "mourn", speed: 0 });
          } else {
            const w = walking(rim, on, t0 + reach + 2.2, WALK_MPS, t);
            if (w.moving) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
          }
        }
        break;
      }
      case "well-queue": {
        const c = ctxRef?.region.village?.plan.centre ?? l.spot;
        const step = 7;
        for (let i = 0; i < 3; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f && t < l.arrive) {
            out.push(f);
            continue;
          }
          // The line moves along: the first draws water and goes, then the next steps up.
          const turnsGone = Math.max(0, Math.floor((t - l.arrive) / step));
          if (i < turnsGone) {
            const w = walking(along(c, l.facing, 1.7), along(c, l.facing + 1.4, 12), l.arrive + (i + 1) * step, WALK_MPS, t);
            if (w.moving) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "walk", speed: 1 });
            continue;
          }
          const place_ = i - turnsGone;
          const at = along(c, l.facing, 1.7 + 1.25 * place_);
          out.push({ x: at.x, y: at.y, heading: toward(at, c), activity: place_ === 0 ? "work" : "stand", speed: 0, talk: done?.verb === "cut" && i === 2 && sinceDone < 3 ? 0.9 : 0 });
          if (buckets[i]) place(buckets[i]!, along(at, toward(at, c) + 0.9, 0.35), 0.5);
        }
        if (t > l.arrive + 3 * step + 6) close("people", l.t0 + t, l);
        break;
      }
      case "loose-hen": {
        const f = arriveOrLeave(0, l.spot);
        // The hen runs rings round the spot until it is caught; she goes after it, bent double.
        const caught = done && done.verb !== "passed" && done.verb !== "expired" && done.verb !== "left";
        const a = (t - l.arrive) * 2.1 + Math.sin(t * 3.3) * 0.6;
        const henAt = caught ? along(l.spot, l.facing, 0.5) : along(l.spot, a, 1.4 + Math.sin(t * 1.7) * 0.3);
        if (hen && t >= l.arrive && !(caught && sinceDone > 1.2) && !leaving) {
          place(hen, henAt, Math.abs(Math.sin(t * 9)) * (caught ? 0 : 0.08), yawOf(a + Math.PI / 2));
        }
        if (f) out.push({ ...f, lantern: dark });
        else if (caught && sinceDone < 3.5) out.push({ x: l.spot.x, y: l.spot.y, heading: toward(l.spot, me), activity: "stand", speed: 0, wave: sinceDone > 1.2 ? 0.7 : 0, talk: 0.5, lantern: dark });
        else {
          const chase = along(l.spot, a - 0.9, 0.9);
          const stooping = Math.sin(t * 1.3) > 0;
          out.push({ x: chase.x, y: chase.y, heading: a + Math.PI / 2, activity: stooping ? "stoop" : "walk", speed: 0.6, lantern: dark && !stooping });
        }
        break;
      }
      case "falling-stars": {
        // A few at a time, high over the way the stranger looks, each across the sky in a second.
        const shots = [1, 5.5, 8, 12.5, 16, 19.5];
        const cam = ctxRef?.camera;
        if (streak && cam) {
          for (const [k, at] of shots.entries()) {
            const u = (t - at) / 1.1;
            if (u < 0 || u > 1) continue;
            const fwd = new THREE.Vector3();
            cam.getWorldDirection(fwd);
            fwd.y = 0;
            fwd.normalize();
            const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
            const lean = hashUnit(`${l.id}|star|${k}`) - 0.5;
            // Low enough to be in the frame of a camera looking along the ground: about fifteen degrees up.
            const from = cam.position.clone().addScaledVector(fwd, 150).addScaledVector(side, -55 + lean * 70).add(new THREE.Vector3(0, 40 + lean * 12, 0));
            const path = side.clone().multiplyScalar(80).add(new THREE.Vector3(0, -30, 0));
            streak.position.copy(from).addScaledVector(path, u);
            streak.lookAt(streak.position.clone().add(path));
            (streak.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * u) * 0.95;
            streak.visible = true;
          }
        }
        break;
      }
      case "banging-door": {
        // Banging open and shut in the gusts, until someone pulls it to.
        if (door) {
          const shut = done && done.verb === "shut";
          const gust = Math.max(0, Math.sin(t * 1.9) * Math.sin(t * 0.7 + 1)) * 0.9 + 0.15;
          place(door, l.spot, 0, yawOf(l.facing));
          (door.children[0] as THREE.Object3D).rotation.y = shut ? 0 : -gust;
        }
        break;
      }
      case "village-dance": {
        const turn = (t - l.arrive) * 0.45;
        for (let i = 0; i < 6; i++) {
          const f = arriveOrLeave(i, where[i]!);
          if (f) {
            out.push(f);
            continue;
          }
          const a = (i / 6) * Math.PI * 2 + turn;
          const at = along(l.spot, a, 2.3);
          out.push({ x: at.x, y: at.y, heading: a + Math.PI / 2, activity: "walk", speed: 0.55, talk: hashUnit(`${l.id}|${i}|${Math.floor(t / 3)}`) < 0.3 ? 0.8 : 0 });
        }
        break;
      }
      default:
        return playC87(l, t);
    }
    return out;
  };

  // ── C87's choreography ───────────────────────────────────────────────────────────────────

  /** Everyone in a C87 moment at `t` seconds into it, and its props put where they are. */
  const playC87 = (l: Live, t: number): Figure[] => {
    const P = props;
    if (!P) return [];
    const def = MOMENTS[l.kind];
    const cast = castOf(l);
    const done = l.outcome;
    const sinceDone = done ? t - (done.at - l.t0) : 0;
    const linger = l.kind === "tea-invite" || l.kind === "campfire" || l.kind === "musician" ? 6 : 3.5;
    const leaving = done ? sinceDone > linger : t > def.lifeS;
    const leaveAt = done ? done.at - l.t0 + linger : def.lifeS;
    const mps = def.children ? RUN_MPS : WALK_MPS;
    const out: Figure[] = [];
    const s = S();
    const at = (a: number, r: number) => along(l.spot, l.facing + a, r);
    const face = (p: P) => toward(p, me);
    const answered = (verb: string) => done?.verb === verb;
    const acted = done && done.verb !== "passed" && done.verb !== "expired" && done.verb !== "left";
    /** Walking in to their place, or off again; null while they are in it. */
    const comeOrGo = (i: number, to: P): Figure | null => {
      const n = cast.length;
      const from = along(l.entry, l.facing + Math.PI / 2, (i - (n - 1) / 2) * 0.8);
      if (t < l.arrive) {
        const w = walking(from, to, 0, mps, t);
        return { x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? (def.children ? "play" : "walk") : "stand", speed: w.moving ? 1 : 0 };
      }
      if (leaving) {
        const away = along(l.exit, l.facing + Math.PI / 2, (i - (n - 1) / 2) * 0.8);
        const t0 = leaveAt + i * 0.4;
        // Still in their place a moment, the last to go after the first.
        if (t < t0) return { x: to.x, y: to.y, heading: toward(to, away), activity: "stand", speed: 0 };
        const w = walking(to, away, t0, mps * 0.85, t);
        return w.moving ? { x: w.p.x, y: w.p.y, heading: w.heading, activity: def.children ? "play" : "walk", speed: 1 } : null;
      }
      return null;
    };
    /** Someone at their place: as they wait, or as they answer what the stranger did. */
    const there = (i: number, f: Omit<Figure, "x" | "y" | "speed"> & { speed?: number }): void => {
      const r = cast[i];
      if (!r) return;
      const moving = comeOrGo(i, r.at);
      if (moving) out.push(moving);
      else if (!leaving) out.push({ x: r.at.x, y: r.at.y, speed: 0, ...f });
    };
    const react = (i: number, idle: Omit<Figure, "x" | "y" | "speed">, after?: Partial<Figure>) => {
      const r = cast[i];
      if (!r) return;
      there(i, done && sinceDone < linger ? { ...idle, heading: face(r.at), activity: "stand", talk: 0.6, wave: sinceDone > 0.5 && sinceDone < 2.4 ? 0.7 : 0, ...after } : idle);
    };

    switch (l.kind) {
      case "fallen-elder": {
        // He comes along with a stick, stumbles, and is down; the onlookers keep talking.
        const r = cast[0]!;
        const fallen = t >= l.arrive + 0.6;
        const helped = acted;
        if (t < l.arrive || leaving) {
          const f = comeOrGo(0, r.at);
          if (f) out.push({ ...f, speed: f.speed * 0.6 });
        } else if (helped && sinceDone > 1) out.push({ x: r.at.x, y: r.at.y, heading: face(r.at), activity: "stand", speed: 0, talk: 0.7, wave: sinceDone > 1.5 && sinceDone < 3 ? 0.6 : 0 });
        else out.push({ x: r.at.x, y: r.at.y, heading: face(r.at) + 0.5, activity: fallen ? "sit" : "stoop", speed: 0, talk: fallen ? 0.25 : 0 });
        if (!leaving && t >= l.arrive) place(P.cane, at(0.8, 0.7), 0.03, yawOf(l.facing + 0.3));
        for (let i = 1; i < cast.length; i++) {
          const o = cast[i]!;
          const other = cast[i === 1 ? 2 : 1]?.at ?? r.at;
          there(i, { heading: toward(o.at, other), activity: "stand", talk: hashUnit(`${l.id}|talk|${i}|${Math.floor(t / 2.5)}`) < 0.6 ? 0.7 : 0.1 });
        }
        break;
      }
      case "asch-boats": {
        // Two boats on the sand, the red plainly shorter; three fishers sure it is the longer.
        if (!leaving || t < def.lifeS + 6) {
          const along_ = l.facing + Math.PI / 2;
          place(P.boats[0], at(Math.PI / 2, 1.1), 0, yawOf(along_ + Math.PI / 2));
          place(P.boats[1], at(-Math.PI / 2, 1.1), 0, yawOf(along_ + Math.PI / 2));
        }
        const near = dist(me, l.spot) < 7;
        for (let i = 0; i < cast.length; i++) {
          const r = cast[i]!;
          // Arguing among themselves; turning to the stranger once they come near.
          const turned = near && !done;
          const pointing = (i === 1 || (l.arm?.id === "dissenter" && i === 2)) && hashUnit(`${l.id}|pt|${Math.floor(t / 2)}|${i}`) < 0.5;
          react(i, { heading: turned ? face(r.at) : toward(r.at, l.spot), activity: "stand", talk: turned ? (i === 1 ? 0.8 : 0.3) : 0.6, wave: pointing ? 0.5 : 0 }, answered("differ") && i === 0 ? { wave: 0.3, talk: 0.2 } : undefined);
        }
        break;
      }
      case "looking-up":
        // All one way, heads back, now and then one points.
        for (let i = 0; i < cast.length; i++) there(i, { heading: l.facing + Math.PI + (hashUnit(`${l.id}|lk|${i}`) - 0.5) * 0.4, activity: "stand", lookUp: 0.75, wave: i === 0 && Math.sin(t * 0.8) > 0.6 ? 0.6 : 0 });
        break;
      case "teasing": {
        // The small one sits with his torn kite; the others laugh and point, until it is answered.
        const small = cast[0]!;
        const kiteAt = along(small.at, l.facing + 0.6, 0.6);
        if (!leaving) place(P.kite, kiteAt, 0.02, yawOf(l.facing + 0.4));
        const scattered = answered("stop") || answered("stand-by");
        there(0, done && scattered && sinceDone > 2 ? { heading: face(small.at), activity: "stand", talk: 0.3 } : { heading: toward(small.at, me) + 0.8, activity: "sit" });
        for (let i = 1; i < cast.length; i++) {
          const r = cast[i]!;
          if (done && scattered && sinceDone > 0.8) {
            // They drift off, quicker for being told.
            const w = walking(r.at, along(r.at, toward(small.at, r.at), 9), done.at - l.t0 + 0.8 + i * 0.3, answered("stop") ? RUN_MPS : WALK_MPS, t);
            if (w.moving) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: "play", speed: 1 });
            continue;
          }
          there(i, { heading: toward(r.at, small.at), activity: "stand", talk: answered("laugh") ? 1 : 0.8, wave: hashUnit(`${l.id}|tw|${i}|${Math.floor(t / 1.5)}`) < 0.45 ? 0.6 : 0 });
        }
        break;
      }
      case "imece-wall": {
        // A low wall half down, stones on the ground; hand to hand along the crew, or one old man alone.
        const built = acted ? Math.min(1, sinceDone / 2) : 0;
        if (!leaving || t < leaveAt + 4) {
          place(P.wall, l.spot, 0, yawOf(l.facing + Math.PI / 2));
          P.wall.scale.y = 0.6 + 0.5 * built;
          for (let i = 0; i < P.stones.length; i++) {
            if (acted && i < built * P.stones.length) continue;
            place(P.stones[i]!, along(at(Math.PI, 1.6 + (i % 3) * 0.35), l.facing + Math.PI / 2, (i - 2.5) * 0.45), 0.1 * s);
          }
        }
        const pass = (t * 0.7) % 1;
        for (let i = 0; i < cast.length; i++) react(i, { heading: cast.length > 1 ? l.facing + Math.PI / 2 + (pass > 0.5 ? 0.6 : -0.6) : l.facing, activity: "work", talk: cast.length > 1 && i === 0 ? 0.4 : 0 });
        break;
      }
      case "net-haul": {
        // At the water's edge, leaning back on the rope; hauled in, the net and its catch come up the sand.
        const hauled = acted && answered("haul");
        const up = hauled ? Math.min(1, sinceDone / 1.5) : 0;
        const netAt = at(0, lerp(2.2 - Math.sin(t * 1.3) * 0.12, 0.4, up));
        if (!leaving) place(P.net, netAt, 0.02, yawOf(l.facing));
        if (hauled && !leaving) for (let i = 0; i < P.fish.length; i++) place(P.fish[i]!, along(netAt, l.facing + Math.PI / 2, (i - 3.5) * 0.18), 0.06 * s, yawOf(l.facing + hashUnit(`${l.id}|f|${i}`)));
        for (let i = 0; i < cast.length; i++) react(i, { heading: l.facing, activity: "work", talk: i === 0 ? 0.3 : 0.05 });
        break;
      }
      case "bench-sit":
        // Sitting at one end, looking out the way the bench looks.
        there(0, { heading: l.facing, activity: "sit", talk: done && acted && sinceDone < 3 ? 0.4 : 0 });
        break;
      case "unfinished-tale": {
        // He tells it with his hands; at the pause he fills his pipe; the children hang on the end.
        const pausing = l.step === 1;
        const ended = l.step >= 2 || (acted && answered("ask-end"));
        there(0, { heading: toward(cast[0]!.at, l.spot) + Math.PI, activity: "sit", talk: pausing ? 0.05 : ended ? 0.5 : 0.85, wave: !pausing && !ended && Math.sin(t * 1.1) > 0.5 ? 0.4 : 0 });
        if (pausing && !leaving) place(P.kaval, along(cast[0]!.at, l.facing, 0.22), 0.95 * s, yawOf(l.facing));
        for (let i = 1; i < cast.length; i++) there(i, { heading: toward(cast[i]!.at, cast[0]!.at), activity: "sit", talk: ended ? 0.9 : 0, wave: ended && i === 1 ? 0.5 : 0 });
        break;
      }
      case "knucklebones": {
        // Two children over a cup, a knucklebone and a pomegranate; they watch the throw or wait for the word.
        const mid = l.spot;
        if (!leaving) {
          if (!(answered("say-tava") && sinceDone > 0.6)) place(P.pomegranate, along(mid, l.facing, 0.25), 0.08 * s);
          place(P.cup, along(mid, l.facing + Math.PI, 0.15), 0.06 * s);
          place(P.knucklebone, along(mid, l.facing + Math.PI / 2, 0.2), 0.02 * s, yawOf(l.facing + 0.7));
        }
        const watching = l.arm?.id === "seen" && l.step >= 1 && !done;
        for (let i = 0; i < cast.length; i++) there(i, { heading: watching ? toward(cast[i]!.at, mid) : toward(cast[i]!.at, me), activity: "sit", talk: done ? 0.6 : l.step < 1 ? 0.4 : 0 });
        break;
      }
      case "musician": {
        const r = cast[0]!;
        // Sitting on his heels, the kaval to his lips, swaying with the tune.
        if (!leaving && t >= l.arrive) place(P.kaval, along(r.at, l.facing, 0.25), 1.0 * s, yawOf(l.facing + 0.2));
        if (!leaving && t >= l.arrive) P.kaval.rotation.z = 1.1;
        there(0, { heading: l.facing, activity: "sit", talk: 0.35 + Math.sin(t * 2) * 0.1 });
        break;
      }
      case "wrong-basket": {
        const r = cast[0]!;
        // She comes with the basket and holds it out; it goes with her again, or stays with the stranger.
        const kept = answered("take-it");
        const f = comeOrGo(0, r.at);
        if (f) {
          out.push(f);
          if (!(kept && leaving)) place(P.fishBasket, along({ x: f.x, y: f.y }, f.heading + 0.6, 0.4), 0.75 * s, yawOf(f.heading));
        } else if (!leaving) {
          out.push({ x: r.at.x, y: r.at.y, heading: face(r.at), activity: "stand", speed: 0, talk: done ? 0.7 : 0.5, wave: !done ? 0.3 : 0 });
          if (!(kept && sinceDone > 0.4)) place(P.fishBasket, along(r.at, face(r.at), 0.45), 0.9 * s, yawOf(face(r.at)));
        }
        break;
      }
      case "tea-invite": {
        const r = cast[0]!;
        // On her step with a low table and two glasses; she waves the stranger over.
        if (!leaving) place(P.teaTable, along(r.at, l.facing + 0.9, 0.8), 0, yawOf(l.facing));
        const near = dist(me, r.at);
        there(0, { heading: face(r.at), activity: "sit", talk: done ? 0.7 : near < 9 ? 0.4 : 0, wave: !done && near < 12 && near > 3 && Math.sin(t * 1.4) > 0.3 ? 0.7 : 0 });
        break;
      }
      case "tangled-net": {
        const r = cast[0]!;
        if (!leaving) place(P.net, at(0, 0.4), 0.05, yawOf(l.facing + 0.5));
        if (!leaving) P.net.scale.set(0.7, 3, 0.7);
        react(0, { heading: toward(r.at, at(0, 0.4)), activity: "stoop", talk: 0.3 });
        break;
      }
      case "bread-errand": {
        const r = cast[0]!;
        // At her door with a loaf; once the stranger takes it, she points the way and goes in.
        const taken = answered("take");
        if (!taken && !leaving) place(P.loaf, along(r.at, face(r.at), 0.4), 1.0 * s, yawOf(face(r.at)));
        // Pointing the way to her mother's, then back in at her own door.
        if (taken && errand && !leaving) out.push({ x: r.at.x, y: r.at.y, heading: toward(r.at, errand.to), activity: "stand", speed: 0, wave: 0.8, talk: 0.5 });
        else there(0, { heading: face(r.at), activity: "stand", talk: done ? 0.4 : 0.2 });
        break;
      }
      case "drunk-or-ill": {
        const r = cast[0]!;
        // Lying across the way in the dark: a cane by his hand, or a bottle.
        const helped = acted;
        if (helped && sinceDone > 1) {
          const w = walking(r.at, l.exit, done!.at - l.t0 + 2, 0.7, t);
          if (w.moving || sinceDone < 2) out.push({ x: w.p.x, y: w.p.y, heading: w.heading, activity: w.moving ? "walk" : "stand", speed: 0.5 });
        } else if (!leaving) {
          out.push({ x: r.at.x, y: r.at.y, heading: l.facing + 1.2, activity: "sleep", speed: 0 });
          if (l.arm?.id === "drunk") place(P.bottle, at(0.6, 0.8), 0.04, yawOf(l.facing + 0.7));
          else place(P.cane, at(0.6, 0.8), 0.03, yawOf(l.facing + 0.4));
        }
        break;
      }
      case "campfire": {
        // A fire they kindle as they come, and sit round, and talk over in turns.
        const lit = Math.min(1, Math.max(0, (t - l.arrive + 1) / 3));
        if (!leaving || t < leaveAt + 3) {
          place(P.fire, l.spot, 0);
          const flick = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17.3) * 0.06;
          P.flame.scale.set(lit * flick, lit * (0.9 + Math.sin(t * 7) * 0.15), lit * flick);
          if (frame) {
            const [tx, ty] = frame.fromLocalM(l.spot.x, l.spot.y);
            P.fireLight.position.set(tx * frame.tileM, Math.max(0, frame.heightAtTile(tx, ty)) + 0.9 * s, ty * frame.tileM);
          }
          P.fireLight.intensity = (leaving ? Math.max(0, 1 - (t - leaveAt) / 3) : lit) * 2.4 * flick;
        }
        for (let i = 0; i < cast.length; i++) {
          const r = cast[i]!;
          const speaker = Math.floor(t / 4) % cast.length === i;
          there(i, { heading: toward(r.at, l.spot), activity: "sit", talk: speaker ? 0.8 : 0.05 });
        }
        break;
      }
      case "crying-alone":
        // Head down, turned a little from the way; answered, she looks up and talks a while.
        react(0, { heading: l.facing + 2.2, activity: "sit", talk: 0 }, { activity: "sit", wave: 0, talk: 0.4 });
        break;
      case "dolphins": {
        // Three backs coming up out of the bay in turn, arcing, and under again.
        for (let i = 0; i < P.dolphins.length; i++) {
          const period = 3.2;
          const u = ((t + i * 0.9) % period) / 1.4;
          if (u > 1 || t > def.lifeS) continue;
          const p = along(l.spot, l.facing, (i - 1) * 2.4 + u * 3);
          place(P.dolphins[i]!, p, -0.4 * s + Math.sin(Math.PI * u) * 1.1 * s, yawOf(l.facing));
          P.dolphins[i]!.rotation.z = (0.5 - u) * 1.2;
        }
        break;
      }
      // ── passers: walking along, stopped to meet the stranger, going on ──
      case "greeting":
      case "rude-bump":
      case "narrow-way":
      case "ask-way":
      case "heavy-jugs":
      case "dark-lantern": {
        const stopped = l.stoppedAt !== null;
        const heading = stopped ? toward(l.at, me) : l.path ? toward(l.at, l.path.to) : l.facing;
        const ps = PASS[l.kind]!;
        const fig: Figure = { x: l.at.x, y: l.at.y, heading, activity: stopped ? "stand" : "walk", speed: stopped ? 0 : ps.mps / WALK_MPS, talk: stopped ? 0.4 : 0 };
        if (done && sinceDone < 1.8) {
          fig.talk = 0.7;
          if (l.kind === "greeting" && done.verb === "greet-warm") fig.wave = Math.sin((Math.PI * sinceDone) / 1.8);
          if (l.kind === "narrow-way" && done.verb === "first") {
            // She steps off the way to let the stranger by.
            const off = along(l.at, heading + Math.PI / 2, Math.min(1, sinceDone) * 0.9);
            fig.x = off.x;
            fig.y = off.y;
          }
        }
        if (l.kind === "greeting" && stopped && !done) fig.wave = l.arm?.id === "low" ? 0 : 0.4;
        if (dark && l.kind !== "dark-lantern") fig.lantern = true;
        out.push(fig);
        // What they carry.
        const hand = along(l.at, heading + Math.PI / 2, 0.42);
        const other = along(l.at, heading - Math.PI / 2, 0.42);
        if (l.kind === "rude-bump") {
          place(P.sacks[0]!, hand, 0.55 * s, yawOf(heading));
          place(P.sacks[1]!, other, 0.55 * s, yawOf(heading));
        } else if (l.kind === "narrow-way" && l.arm?.id === "elder") place(P.staff, hand, 0.8 * s, yawOf(heading));
        else if (l.kind === "narrow-way" || l.kind === "heavy-jugs") {
          place(P.jugs[0]!, hand, 0.25 * s, yawOf(heading));
          place(P.jugs[1]!, other, 0.25 * s, yawOf(heading));
        } else if (l.kind === "ask-way") place(P.pack, along(l.at, heading + Math.PI, 0.25), 1.15 * s, yawOf(heading));
        else if (l.kind === "greeting" && l.arm?.id === "high") place(P.staff, hand, 0.8 * s, yawOf(heading));
        else if (l.kind === "greeting" && l.arm?.id === "low") place(P.yoke, l.at, 0, yawOf(heading));
        break;
      }
      // ── things by the way: nobody about ──
      case "lost-purse": {
        const coins = Number(l.arm?.raw?.coins ?? 2);
        const left = answered("leave");
        const taken = answered("take-all") ? coins : answered("take-one") ? 1 : 0;
        const purseAt = left ? at(0.6, 1.1) : l.spot;
        if (left) place(P.ledge, at(0.6, 1.1), 0, yawOf(l.facing));
        place(P.purse, purseAt, left ? 0.62 * s : 0.05 * s, yawOf(l.facing));
        if (!left) for (let i = 0; i < coins - taken; i++) place(P.coins[i]!, along(l.spot, l.facing + 0.7 + i * 0.5, 0.16 + (i % 3) * 0.05), 0.01 * s, yawOf(i));
        break;
      }
      case "open-gate": {
        place(P.gate, l.spot, 0, yawOf(l.facing + Math.PI / 2));
        const shut = answered("shut-gate");
        const swing = shut ? Math.max(0, 1.2 * (1 - Math.min(1, sinceDone / 1.2))) : 1.2;
        (P.gate.children[2] as THREE.Object3D).rotation.y = -swing;
        break;
      }
      case "litter": {
        const n = Number(l.arm?.raw?.litter ?? 1);
        const tidied = answered("tidy");
        for (let i = 0; i < n; i++) {
          if (tidied && i === 0 && sinceDone > 0.5) continue;
          const a = i === 0 ? 0 : hashUnit(`${l.id}|lt|${i}`) * Math.PI * 2;
          const r = i === 0 ? 0 : 0.7 + hashUnit(`${l.id}|lr|${i}`) * 2.4;
          place(P.litter[i]!, along(l.spot, a, r), 0.02 * s, yawOf(a * 3));
        }
        place(P.bin, at(Math.PI / 2, 2.2), 0.25 * s, 0);
        break;
      }
      case "caught-lamb": {
        place(P.fence, l.spot, 0, yawOf(l.facing + Math.PI / 2));
        const freed = answered("free-lamb");
        if (freed) {
          const w = walking(at(Math.PI, 0.4), at(Math.PI, 12), done!.at - l.t0 + 0.3, 3.5, t);
          if (w.moving) place(P.lamb, w.p, Math.abs(Math.sin(t * 12)) * 0.08 * s, yawOf(w.heading));
        } else place(P.lamb, at(Math.PI, 0.35), Math.abs(Math.sin(t * 7)) * 0.03 * s, yawOf(l.facing + Math.sin(t * 5) * 0.25));
        break;
      }
      case "woodpile": {
        const neat = answered("stack") ? Math.min(1, sinceDone / 1.2) : 0;
        for (let i = 0; i < P.logs.length; i++) {
          const fallen = { p: along(l.spot, hashUnit(`${l.id}|wa|${i}`) * Math.PI * 2, 0.3 + hashUnit(`${l.id}|wr|${i}`) * 1.3), lift: 0.08 * s, yaw: hashUnit(`${l.id}|wy|${i}`) * Math.PI * 2 };
          const row = Math.floor(i / 3);
          const stacked = { p: along(l.spot, l.facing + Math.PI / 2, ((i % 3) - 1 + (row % 2) * 0.5) * 0.18), lift: (0.08 + row * 0.15) * s, yaw: yawOf(l.facing) };
          const p = { x: lerp(fallen.p.x, stacked.p.x, neat), y: lerp(fallen.p.y, stacked.p.y, neat) };
          place(P.logs[i]!, p, lerp(fallen.lift, stacked.lift, neat), lerp(fallen.yaw, stacked.yaw, neat));
          P.logs[i]!.rotation.z = Math.PI / 2;
        }
        break;
      }
      case "honey-stall": {
        place(P.stall, l.spot, 0, yawOf(l.facing));
        const gone = answered("three-jars") ? 3 : answered("one-jar") ? 1 : 0;
        for (let i = gone; i < P.jars.length; i++) place(P.jars[i]!, along(l.spot, l.facing + Math.PI / 2, (i - 2) * 0.2), 0.88 * s, 0);
        if (l.arm?.id === "eye") place(P.nazar, along(l.spot, l.facing + Math.PI, 0.22), 1.42 * s, yawOf(l.facing));
        break;
      }
      default:
        break;
    }
    return out;
  };

  /** Move a passer along: on their way, stopped to meet the stranger, then on past (C87). */
  const stepPasser = (l: Live, dt: number, now: number) => {
    const ps = PASS[l.kind];
    if (!ps || !l.path) return;
    if (l.stoppedAt === null) {
      const d = dist(l.at, l.path.to);
      const step = Math.min(d, ps.mps * dt);
      if (d > 1e-6) l.at = along(l.at, toward(l.at, l.path.to), step);
      // Meeting the stranger: they stop, once, a stride or two away.
      if (!l.met && !l.outcome && dist(l.at, me) < ps.stopM) {
        l.met = true;
        l.stoppedAt = now;
        l.goOnAt = now + ps.waitS;
      }
    } else if (l.goOnAt !== null && now >= l.goOnAt) l.stoppedAt = null;
  };

  /** Draw the errand: the one walking with the stranger, or the one waiting at her door (C87). */
  const stepErrand = (e: Errand, dt: number, now: number): Figure | null => {
    if (e.kind === "carry") {
      // She waits outside her door, waves when she sees the stranger coming, and goes in when it is over.
      if (e.done && now - e.done.at > 3) return null;
      const d = dist(me, e.at);
      if (!e.done && !e.spoke && d < 7) {
        e.spoke = true;
        sayLine(MOTHER_SAYS);
      }
      if (!e.done && now > e.deadline) {
        e.done = { at: now, how: "broken" };
        brokenFn?.(e.from, e.ref, e.arm);
        carry(false);
      }
      return { x: e.at.x, y: e.at.y, heading: toward(e.at, me), activity: "stand", speed: 0, talk: e.done?.how === "kept" ? 0.7 : 0, wave: (!e.done && d < 16 && d > 3 && Math.sin(now * 1.6) > 0.2) || (e.done?.how === "kept" && now - e.done.at < 2) ? 0.7 : 0, lantern: dark };
    }
    // Escort: walking with the stranger, the old woman leading the way home, the pedlar following them.
    if (e.done) {
      if (now - e.done.at > 3.2) return null;
      return { x: e.at.x, y: e.at.y, heading: toward(e.at, me), activity: "stand", speed: 0, talk: 0.6, wave: e.done.how === "arrived" ? 0.6 : 0 };
    }
    const toMe = dist(e.at, me);
    e.away = toMe > 20 ? e.away + dt : 0;
    let moving = false;
    let speed = 0;
    if (e.leads) {
      // She goes on toward her door while the stranger keeps beside her, and waits when they fall behind.
      if (toMe < 6) {
        const d = dist(e.at, e.to);
        speed = Math.min(d, (e.from === "heavy-jugs" ? 0.85 : 1.0) * dt);
        if (d > 0.05) {
          e.heading = toward(e.at, e.to);
          e.at = along(e.at, e.heading, speed);
          moving = true;
        }
      } else e.heading = toward(e.at, me);
    } else if (toMe > 2.2) {
      // The pedlar keeps a stride behind the stranger.
      const goal = along(me, toward(me, e.at), 1.6);
      const d = dist(e.at, goal);
      speed = Math.min(d, Math.min(1.9, 0.9 + d * 0.4) * dt);
      e.heading = toward(e.at, goal);
      e.at = along(e.at, e.heading, speed);
      moving = true;
    } else e.heading = toward(e.at, me);
    if (dist(e.at, e.to) < (e.leads ? 1.2 : 7)) {
      e.done = { at: now, how: "arrived" };
      const said = ARRIVED[e.from];
      if (said) sayLine(said);
      carry(false);
    } else if (e.away > 10) {
      e.done = { at: now, how: "gone" };
      carry(false);
    }
    return { x: e.at.x, y: e.at.y, heading: e.heading, activity: moving ? "walk" : "stand", speed: moving ? 0.7 : 0, talk: Math.sin(now * 0.7) > 0.4 ? 0.5 : 0, lantern: dark && e.from !== "dark-lantern" ? true : false };
  };

  /** Start an errand from an act on a moment (C87). */
  const startErrand = (l: Live, now: number) => {
    const def = MOMENTS[l.kind];
    const plan = ctxRef?.region.village?.plan;
    if (!def.errand || !plan) return;
    const village = ctxRef?.region.village;
    const day = worldDayIndex(options.clock, Date.now());
    const lived = (plot: (typeof plan)["plots"][number]) => !!village && householdOn(village.settlement, plot, day) !== null;
    let to: (P & { facing: number }) | null = null;
    if (l.kind === "ask-way") {
      // The harbour, or with no harbour the well: somewhere the stranger can take them.
      const root = plan.dock ? plan.dock.root : plan.centre;
      to = { x: root.x, y: root.y, facing: 0 };
    } else if (l.errandTo) to = l.errandTo;
    else {
      const h = errandHouse(me, l.spot, plan, `${l.id}|to`, lived);
      if (h) to = { ...h, ...along(h, h.facing, 0.9) };
    }
    if (!to) return;
    const passer = def.errand.kind === "escort";
    errand = {
      id: `${l.id}|errand`,
      kind: def.errand.kind,
      from: l.kind,
      ref: `moment:${l.id}`,
      arm: l.arm,
      to,
      since: now,
      deadline: now + MOMENT.errandWaitS,
      look: passer ? l.looks[0]! : lookFor(`moment:${l.id}:mother`, "weaver", 74, "f"),
      at: passer ? { ...l.at } : { x: to.x, y: to.y },
      heading: toward(passer ? l.at : to, me),
      leads: l.kind !== "ask-way",
      away: 0,
      done: null,
      spoke: false,
      reported: false,
    };
    if (l.kind === "bread-errand" || l.kind === "heavy-jugs") carry(true);
  };

  /** What a live moment offers to be acted on, with the arm it carries. */
  const offer = (l: Live, mx: number, my: number, out: Thing[]) => {
    const t = nowS - l.t0;
    const p = thingAt(l, t);
    if (!p || Math.hypot(p.x - mx, p.y - my) >= 16) return;
    const kind = l.kind;
    const pressure = l.pressure > 0 ? { time_pressure: l.pressure } : null;
    const arm = l.arm || pressure ? { id: l.arm?.id ?? "none", ...(l.arm?.raw ? { raw: l.arm.raw } : {}), context: { ...(l.arm?.context ?? {}), ...(pressure ?? {}) } } : undefined;
    out.push({ ref: `moment:${l.id}`, kind, x: p.x, y: p.y, sizeM: sizeOf(kind), owners: [], name: MOMENTS[kind].name, ...(arm ? { arm } : {}) });
  };

  const lives = (): Live[] => [lanes.people.live, lanes.passer.live, ...waysides].filter((l): l is Live => l !== null);

  return {
    name: "moments",

    async build(ctx: LayerContext, signal: AbortSignal) {
      const village = ctx.region.village;
      if (!village || signal.aborted) return;
      frame = ctx.frame;
      ctxRef = ctx;
      try {
        seed = localStorage.getItem("echo.userId") ?? "anon";
        found = new Set(JSON.parse(localStorage.getItem(FOUND_KEY(ctx.region.cell)) ?? "[]") as string[]);
        metCounts = JSON.parse(localStorage.getItem(MET_KEY(ctx.region.cell)) ?? "{}") as Record<string, number>;
      } catch {
        // a page without storage plays the same, and finds them afresh
      }
      crowd = new Crowd(18, ctx.frame.tileM);
      group.add(crowd.group);

      const s = ctx.frame.tileM / 1.6;
      props = momentProps(s, mat, geo, (m) => materials.push(m));
      ({ basket, apples, cart, ball, buckets, hen, lamp, streak, door } = props);
      lamp2 = props.lamp.clone();
      lamp2.visible = false;
      for (const o of props.all) group.add(o);
      group.add(lamp2, props.fireLight);

      // The village's hidden things.
      eggs = eggsOf(`${village.settlement.seed}|${ctx.region.cell}`, ground());
      const stumpMat = mat(0x5a4532);
      const hollowMat = mat(0x1c140e);
      const glass = mat(0x4f8a6a, { emissive: 0x1a3a2a, transparent: true, opacity: 0.9 });
      const poolMat = mat(0x22384a, { emissive: 0x0c1824 });
      const rockMat = mat(0x7d7a72);
      const earthMat = mat(0x5e4630);
      for (const e of eggs) {
        let o: THREE.Object3D;
        if (e.kind === "hollow-stump") {
          const g = new THREE.Group();
          const stump = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.42 * s, 0.55 * s, 0.9 * s, 9)), stumpMat);
          stump.position.y = 0.45 * s;
          const hole = new THREE.Mesh(geo(new THREE.CircleGeometry(0.26 * s, 9)), hollowMat);
          hole.rotation.x = -Math.PI / 2;
          hole.position.y = 0.905 * s;
          g.add(stump, hole);
          o = g;
        } else if (e.kind === "message-bottle") {
          const g = new THREE.Group();
          const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.26 * s, 8)), glass);
          body.rotation.z = Math.PI / 2;
          const neck = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.1 * s, 6)), glass);
          neck.rotation.z = Math.PI / 2;
          neck.position.x = 0.17 * s;
          g.add(body, neck);
          g.position.y = 0.06 * s;
          o = g;
        } else if (e.kind === "still-pool") {
          const pool = new THREE.Mesh(geo(new THREE.CircleGeometry(1.15 * s, 18)), poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.y = 0.03;
          o = pool;
        } else if (e.kind === "lookout-rock") {
          const rock = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1, 0)), rockMat);
          rock.scale.set(1.6 * s, 1.1 * s, 1.4 * s);
          rock.position.y = 0.6 * s;
          o = rock;
        } else {
          const g = new THREE.Group();
          const mound = new THREE.Mesh(geo(new THREE.SphereGeometry(0.6 * s, 8, 5)), earthMat);
          mound.scale.y = 0.25;
          const stick = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.7 * s, 5)), stumpMat);
          stick.position.set(0.35 * s, 0.35 * s, 0);
          stick.rotation.z = 0.2;
          g.add(mound, stick);
          o = g;
        }
        o.name = `egg:${e.id}`;
        const holder = new THREE.Group();
        holder.add(o);
        place(holder, e, 0, e.facing);
        group.add(holder);
        eggMeshes.set(e.id, holder);
      }
      ctx.scene.add(group);
    },

    update(dt, ctx) {
      if (!frame || !crowd || !props) return;
      const now = performance.now() / 1000;
      nowS = now;
      if (started < 0) {
        started = now;
        lanes.people.nextAt = now + MOMENT.lanes.people.firstS;
        lanes.passer.nextAt = now + MOMENT.lanes.passer.firstS;
        waysideNextAt = now + MOMENT.lanes.wayside.firstS;
      }
      const player = ctx.layer<WorldLayer & { position(): P; aboard?(): boolean }>("player");
      if (!player) return;
      const at = player.position();
      const [mx, my] = frame.toLocalM(at.x, at.y);
      me = { x: mx, y: my };
      const hour = ctx.layer<SkyLayer>("sky")?.timeOfDay() ?? 0.5;
      dark = hour > 0.8 || hour < 0.24;
      const indoors = ctx.layer<InteriorLayer>("interior")?.inside() ?? null;
      const staged = ctx.layer<DirectorLayer>("director")?.staging() ?? null;
      // Nothing begins while the stranger is near something the director set out (the pilot's six above
      // all), nor indoors, nor at sea.
      const quiet = (staged !== null && dist(me, staged) < MOMENT.holdForStagingM) || !!indoors || !!player.aboard?.();

      for (const lane of ["people", "passer"] as const) {
        const L = lanes[lane];
        if (!L.live && now >= L.nextAt) {
          if (quiet) L.nextAt = now + 6;
          else begin(lane, ctx, now, hour);
        }
      }
      // Things by the way: gone once far behind or long left; a new one whenever none is ahead.
      for (const w of [...waysides]) {
        const t = now - w.t0;
        if (dist(me, w.spot) > MOMENT.wayside.goneM || t > MOMENTS[w.kind].lifeS || (w.outcome && now - w.outcome.at > 4)) close("wayside", now, w);
      }
      if (now >= waysideNextAt && waysides.length < MOMENT.wayside.max && !waysides.some((w) => !w.outcome && dist(w.spot, me) < MOMENT.wayside.wantM)) {
        if (quiet) waysideNextAt = now + 5;
        else begin("wayside", ctx, now, hour);
      }

      for (const o of props.all) o.visible = false;
      if (lamp2) lamp2.visible = false;
      props.fireLight.intensity = 0;
      crowd.begin();
      let lamps = 0;
      // The way the view looks, on the ground (C87: what is in front of it is what the stranger sees).
      const fwd = new THREE.Vector3();
      ctx.camera.getWorldDirection(fwd);
      const [vx, vy] = frame.toLocalM((ctx.camera.position.x + fwd.x * 10) / frame.tileM, (ctx.camera.position.z + fwd.z * 10) / frame.tileM);
      const [vcx, vcy] = frame.toLocalM(ctx.camera.position.x / frame.tileM, ctx.camera.position.z / frame.tileM);
      const view = Math.atan2(vy - vcy, vx - vcx);
      for (const l of lives()) {
        const t = now - l.t0;
        const def = MOMENTS[l.kind];
        if (l.lane === "passer") stepPasser(l, dt, now);
        // Seen: near, in front of the view, while it is going on (C87); the sky is over wherever they look.
        if (!l.outcome) {
          const p = l.lane === "passer" ? l.at : def.where === "sky" ? me : l.spot;
          const d = def.where === "sky" ? 0 : dist(me, p);
          l.nearest = Math.min(l.nearest, d);
          const off = Math.abs(Math.atan2(Math.sin(toward({ x: vcx, y: vcy }, p) - view), Math.cos(toward({ x: vcx, y: vcy }, p) - view)));
          const inView = def.where === "sky" || (def.where === "sea" ? off < SEEN_HALF_ANGLE : d <= SEEN_M && off < SEEN_HALF_ANGLE);
          if (inView && t >= Math.min(l.arrive, 1)) {
            l.seenS += dt;
            l.seenAt ??= now;
          }
        }
        const thing = thingAt(l, t);
        // What its people say, once, as the stranger comes near (the child who threw wide: once it has landed).
        const ready = l.kind === "stray-ball" ? l.longAt !== null && t >= l.longAt + 0.3 : t >= l.arrive;
        if (!l.spoke && !l.outcome && ready && dist(me, l.lane === "passer" ? l.at : l.spot) < (l.lane === "passer" ? 4.5 : 7)) {
          const line = lineOf(l);
          l.spoke = true;
          l.spokeAt = now;
          if (line) sayLine(line);
        }
        // What is told on after the first line (C87): the tale's pause and its end; the knucklebone's fall.
        if (l.spoke && !l.outcome) {
          if (l.kind === "unfinished-tale") {
            const pause = Number(l.arm?.raw?.pause_s ?? 20);
            if (l.step === 0 && now - l.spokeAt > 9) {
              l.step = 1;
              sayLine(TALE_PAUSE);
            } else if (l.step === 1 && now - l.spokeAt > 9 + pause) {
              // He finishes it for whoever stayed to hear; nobody is asked anything. Heard it (`told`), or
              // had gone by then (`left`): the curiosity read is whether they waited (C87).
              l.step = 2;
              const heard = dist(me, l.spot) < 12;
              if (heard) sayLine(TALES[l.variant % TALES.length]!.end);
              l.outcome = { verb: heard ? "told" : "left", at: now };
            }
          } else if (l.kind === "knucklebones" && l.step === 0 && now - l.spokeAt > 3) {
            l.step = 1;
            sayLine(THROWN[l.arm?.id ?? "unseen"] ?? THROWN.unseen!);
          }
        }
        // Walking past it, once it was in plain view, is an answer too; for someone who stopped to meet
        // the stranger, letting them go on without a word is.
        if (def.passed && !l.outcome) {
          if (l.lane === "passer") {
            if (l.met && l.goOnAt !== null && now >= l.goOnAt) {
              l.outcome = { verb: "passed", at: now };
              passedFn?.(l.kind, `moment:${l.id}`, dist(me, l.at), l.arm);
            }
          } else if (thing) {
            const step = momentPass(l.near, dist(me, thing));
            l.near = step.near;
            if (step.passed) {
              l.outcome = { verb: "passed", at: now };
              passedFn?.(l.kind, `moment:${l.id}`, dist(me, thing), l.arm);
            }
          }
        }
        // Walked away from (C87): a moment ahead the stranger has left behind is over, whether or not its
        // passing is data, so the next can begin ahead of them; one they never came near says nothing.
        if (!l.outcome && l.lane === "people" && def.where !== "sky" && def.where !== "sea") {
          const d = dist(me, l.spot);
          if ((t >= l.arrive && d > MOMENT.goneM + 5) || (t < l.arrive && d > MOMENT.goneM + 12)) l.outcome = { verb: "left", at: now };
        }
        if (!l.outcome && l.lane === "people" && t > def.lifeS) l.outcome = { verb: "expired", at: now };
        for (const [i, f] of play(l, t).entries()) {
          const [tx, ty] = frame.fromLocalM(f.x, f.y);
          const lantern = !!f.lantern;
          crowd.pose(
            {
              x: tx * frame.tileM,
              y: Math.max(0, frame.heightAtTile(tx, ty)),
              z: ty * frame.tileM,
              yaw: f.heading + Math.PI / 2,
              activity: f.activity,
              speed: f.speed,
              time: now,
              phase0: hashUnit(`${l.id}|${i}`) * Math.PI * 2,
              talk: f.talk,
              wave: f.wave,
              lantern,
              lookUp: f.lookUp,
            },
            l.looks[i] ?? l.looks[0]!,
          );
          const flame = lamps === 0 ? lamp : lamps === 1 ? lamp2 : null;
          if (lantern && flame && crowd.lanternAt(handAt)) {
            flame.position.copy(handAt);
            flame.visible = true;
            lamps++;
          }
        }
        // Over once its people have walked off: a few seconds after the end, or its life and a walk.
        if (l.lane === "people" && lanes.people.live === l && l.outcome && now - l.outcome.at > 3.5 + MOMENT.entryM / WALK_MPS) close("people", now, l);
        if (l.lane === "passer" && lanes.passer.live === l && l.path && l.stoppedAt === null && dist(l.at, l.path.to) < 0.3) close("passer", now, l);
        if (l.lane === "passer" && lanes.passer.live === l && now - l.t0 > 60) close("passer", now, l);
      }
      if (errand) {
        if (errand.done) reportErrand(errand, now);
        const f = stepErrand(errand, dt, now);
        if (f) {
          const [tx, ty] = frame.fromLocalM(f.x, f.y);
          crowd.pose({ x: tx * frame.tileM, y: Math.max(0, frame.heightAtTile(tx, ty)), z: ty * frame.tileM, yaw: f.heading + Math.PI / 2, activity: f.activity, speed: f.speed, time: now, phase0: 1.3, talk: f.talk, wave: f.wave, lantern: !!f.lantern }, errand.look);
          if (errand.kind === "escort" && errand.from === "heavy-jugs" && props) place(props.jugs[1]!, along(errand.at, errand.heading - Math.PI / 2, 0.42), 0.25 * S(), yawOf(errand.heading));
          const flame = lamps === 0 ? lamp : lamps === 1 ? lamp2 : null;
          if (f.lantern && flame && crowd.lanternAt(handAt)) {
            flame.position.copy(handAt);
            flame.visible = true;
            lamps++;
          }
        } else if (errand.done) {
          reportErrand(errand, now);
          errand = null;
        }
      }
      crowd.end();
    },

    things(mx, my) {
      const out: Thing[] = [];
      for (const l of lives()) offer(l, mx, my, out);
      // The errand's end: the old woman waiting for her daughter's bread (C87).
      if (errand && errand.kind === "carry" && !errand.done && Math.hypot(errand.at.x - mx, errand.at.y - my) < 16) {
        const deliver = MOMENTS[errand.from].errand?.deliver ?? "bread-mother";
        out.push({ ref: `moment:${errand.id}`, kind: deliver, x: errand.at.x, y: errand.at.y, sizeM: 0.7, owners: [], name: MOMENTS[deliver].name, ...(errand.arm ? { arm: { id: errand.arm.id, ...(errand.arm.raw ? { raw: errand.arm.raw } : {}), context: { ...(errand.arm.context ?? {}) } } } : {}) });
      }
      for (const e of eggs) {
        if (found.has(e.id) || Math.hypot(e.x - mx, e.y - my) > 12) continue;
        out.push({ ref: `egg:${e.id}`, kind: e.kind, x: e.x, y: e.y, sizeM: e.kind === "lookout-rock" ? 1.6 : e.kind === "still-pool" ? 1.1 : 0.5, owners: [], name: EGG_NAMES[e.kind] });
      }
      return out;
    },

    acted(ref, verbId) {
      const now = performance.now() / 1000;
      if (ref.startsWith("moment:")) {
        if (errand && ref === `moment:${errand.id}` && !errand.done) {
          errand.done = { at: now, how: "kept" };
          carry(false);
          return null;
        }
        const l = lives().find((x) => ref === `moment:${x.id}`);
        if (!l || l.outcome) return null;
        l.outcome = { verb: verbId, at: now };
        const def = MOMENTS[l.kind];
        if (def.errand && def.errand.on === verbId) {
          startErrand(l, now);
          // Someone walking with the stranger is now the errand's to draw: the passer is over. With no door
          // to walk them to, they thank the stranger and go on their way.
          if (def.errand.kind === "escort" && errand?.ref === `moment:${l.id}`) close("passer", now, l);
        }
        if (l.lane === "passer" && l.goOnAt !== null) l.goOnAt = Math.min(l.goOnAt, now + 1.8);
        // Asked, he tells the end of the tale; seen lying, the children know it (C87).
        if (l.kind === "unfinished-tale" && verbId === "ask-end") {
          l.step = 2;
          return TALES[l.variant % TALES.length]!.end;
        }
        if (l.kind === "knucklebones" && verbId === "say-tava" && l.arm?.id === "seen") return SEEN_LIE;
        return null;
      }
      if (ref.startsWith("egg:")) {
        const e = eggs.find((x) => `egg:${x.id}` === ref);
        if (!e) return null;
        // Sitting on the lookout can be done again; looking out from it, once.
        if (!(e.kind === "lookout-rock" && verbId === "sit")) {
          found.add(e.id);
          keepFound();
        }
        return verbId === "sit" ? null : eggLine(e);
      }
      return null;
    },

    onPassed(fn) {
      passedFn = fn;
    },

    onBroken(fn) {
      brokenFn = fn;
    },

    onSeen(fn) {
      seenFn = fn;
    },

    settle() {
      const now = performance.now() / 1000;
      for (const l of lives()) report(l, now, true);
      if (errand) reportErrand(errand, now);
    },

    current() {
      const live = lanes.people.live;
      if (!live) return null;
      const t = performance.now() / 1000 - live.t0;
      return { kind: live.kind, x: live.spot.x, y: live.spot.y, state: t < live.arrive ? "arriving" : live.outcome ? "ending" : "live" };
    },

    all() {
      const now = performance.now() / 1000;
      const out: ReturnType<MomentsLayer["all"]> = lives().map((l) => {
        const t = now - l.t0;
        const p = l.lane === "passer" ? l.at : l.spot;
        return { kind: l.kind, lane: l.lane, x: p.x, y: p.y, state: t < l.arrive ? "arriving" : l.outcome ? "ending" : "live", arm: l.arm?.id ?? null };
      });
      if (errand && !errand.done) out.push({ kind: errand.kind === "carry" ? (MOMENTS[errand.from].errand?.deliver ?? errand.from) : errand.from, lane: "errand", x: errand.at.x, y: errand.at.y, state: "live", arm: errand.arm?.id ?? null });
      return out;
    },

    errand() {
      return errand && !errand.done ? { kind: errand.kind, from: errand.from, x: errand.to.x, y: errand.to.y, since: errand.since } : null;
    },

    eggs: () => eggs.map((e) => ({ ...e, found: found.has(e.id) })),

    dispose() {
      crowd?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.removeFromParent();
      crowd = null;
      lanes.people.live = null;
      lanes.passer.live = null;
      waysides = [];
      errand = null;
    },
  };
}

/** What a hidden thing is called over it. */
const EGG_NAMES: Record<Egg["kind"], string> = {
  "hollow-stump": "a hollow stump",
  "message-bottle": "a bottle half in the sand",
  "still-pool": "a still pool",
  "lookout-rock": "a big rock with a flat top",
  "buried-box": "a patch of soft earth",
};
