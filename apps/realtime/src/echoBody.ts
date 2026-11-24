/**
 * A body its echo keeps while its person is away (DECISIONS C104): the way it walks, and what it does
 * at what it meets.
 *
 * WHERE IT WALKS. The person's own way, kept as breadcrumbs while they walked it (`Trail`): the echo
 * walks it back, then on again, at the person's own pace, and stops where they stopped, as long as they
 * did (sitting where they sat). It never walks anywhere its person had not: the room has no ground of its
 * own, and a way someone has already walked is a way a body can walk.
 *
 * WHAT IT MEETS. The moments of the village (`@echo/planet` moments, C86/C87), in the same three streams
 * and at the same rhythm a person meets them, from a rotation of its own. Only those that come to someone
 * on their way (`where: "ahead"`): the ones tied to a place (the well, a door, a field, the shore, a bench)
 * and the errands that send someone off to a house are left for the person. Every family the calls read
 * has moments that come this way.
 *
 * WHAT IT DOES THERE is decided by the brief (`StandInBrief`) and nothing else: the echo's call for that
 * kind of moment and where it stands in that kind of situation (C103). Where it may act, it does what it
 * says its person would do, walking on included. Where it may not (still learning, or close), it holds
 * back: the body walks on, and what it would have done is kept for the person to read. A kind it has no
 * call for, or one in no family, it always holds back at.
 *
 * WHAT IT IS NOT. Nothing it does is the person's. It is told to the person when they come back
 * (`log`), and it is measured as nothing: no act is sent anywhere, no record is written, no mark is left
 * in the village.
 *
 * IT DOES NOT KNOW WHO IS WATCHING (C105). Nothing here takes a watcher, a viewer or a count of them:
 * `advanceKept` is the room's whole step and is given the bodies, the time and the dice, and `newsFor`,
 * which is how a watcher hears of a moment, only reads. A test runs the same keeping with a watcher and
 * without one and finds the two byte for byte the same.
 *
 * Pure but for `now` and `rand`, which are passed in.
 */
import { MOMENT, MOMENTS, WORLD_EPOCH, nextMoment, timeOfDay, worldClock, type MomentKind, type MomentLane } from "@echo/planet";
import { STAND_IN, yawOfHeading, type AwayEntry, type StandInBrief, type StandInCall, type WalkerActivity } from "@echo/shared";

/** Walking on: the call for doing nothing at a moment (apps/web `calls.ts` ON). */
export const ON = "on";

const CLOCK = worldClock(WORLD_EPOCH);
const LANES: readonly MomentLane[] = ["people", "passer", "wayside"];

interface P {
  x: number;
  y: number;
}
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** One breadcrumb of the person's way: where, and how long they stood there (and whether they sat). */
export interface Crumb {
  x: number;
  y: number;
  pauseS: number;
  sit: boolean;
}

/** A body's pose as the room holds it. */
export interface BodyPose {
  x: number;
  y: number;
  yaw: number;
  speed: number;
  activity: WalkerActivity;
}

/** The person's own way, kept as they walk it, for their echo to walk if they let it. */
export class Trail {
  crumbs: Crumb[] = [];
  /** Their walking pace, metres a second: a running mean of the speeds they walked at. */
  pace = 1.65;

  /** Take one pose, `dtMs` after the last. */
  take(p: BodyPose, dtMs: number): void {
    // On the water is not a way to walk.
    if (p.activity === "row") return;
    const last = this.crumbs.at(-1);
    if (last && dist(last, p) > STAND_IN.jumpM) this.crumbs.length = 0;
    const tail = this.crumbs.at(-1);
    if (!tail || dist(tail, p) >= STAND_IN.crumbM) {
      this.crumbs.push({ x: p.x, y: p.y, pauseS: 0, sit: false });
      if (this.crumbs.length > STAND_IN.crumbs) this.crumbs.shift();
    } else if (p.speed < 0.1) {
      // A page asleep sends nothing for a while; that is not a person standing still for all of it.
      tail.pauseS = Math.min(STAND_IN.pauseMaxS, tail.pauseS + Math.min(dtMs, 500) / 1000);
      if (p.activity === "sit") tail.sit = true;
    }
    if (p.activity === "walk" && p.speed > 0.3) this.pace = 0.9 * this.pace + 0.1 * Math.min(p.speed, STAND_IN.paceMps[1]);
  }
}

/** What the body is doing for the moment it is at. */
interface Doing {
  kind: MomentKind;
  lane: MomentLane;
  call: string;
  activity: WalkerActivity;
  /** The crumb it is met at; it walks there first. */
  at: number;
  /** When it is done, once it is there; 0 until then. */
  until: number;
  /** When it gives up going there. */
  giveUpAt: number;
}

export interface EchoBody {
  since: number;
  /** When its keeping ends and the body goes. */
  until: number;
  /** Its own rotation of moments: never the person's, so the person meets theirs untouched when they come back. */
  seed: string;
  brief: StandInBrief;
  trail: Crumb[];
  pace: number;
  /** The crumb it is walking to, and which way along. */
  i: number;
  dir: 1 | -1;
  pauseUntil: number;
  /** The last crumb it paused at, so one pause is not kept twice in a row. */
  pausedAt: number;
  lanes: Record<MomentLane, { count: number; nextAt: number }>;
  lastMet: Map<MomentKind, number>;
  doing: Doing | null;
  log: AwayEntry[];
  /** How many moments it has met in all: the log keeps the last `STAND_IN.logMax`, this counts on past them. */
  met: number;
  /**
   * Turned to someone it is answering (C110): it stands, faces them, and does not walk on until `until`, as a
   * person typing an answer does. Set by the room when it answers, never by a watcher.
   */
  facing: { yaw: number; until: number } | null;
}

/** Hands on a thing, sitting, or just standing a moment: how a verb looks on the body. */
const SAYS = new Set(["greet-warm", "nod", "sorry", "back", "thank", "aside", "first", "agree", "differ", "look-up", "leave", "not-mine", "say-true", "say-tava", "laugh", "stop", "stand-by", "watch", "listen", "point", "listen-edge", "ask-end"]);
export function activityOf(verb: string): WalkerActivity {
  if (verb.startsWith("sit")) return "sit";
  return SAYS.has(verb) ? "stand" : "work";
}

/** How long a verb takes, seconds: a nod is over at once, an old man helped up is not. */
const TAKES: Record<string, number> = {
  help: 9, "help-up": 9, push: 10, catch: 9, "help-home": 10, "free-lamb": 8, "sit-with": 16, "sit-tea": 24, "sit-fire": 20,
  "ask-end": 16, stack: 8, tidy: 5, "shut-gate": 3, untangle: 9, haul: 9, "lend-hand": 10, listen: 10,
  "greet-warm": 2.5, nod: 1.5, sorry: 2, thank: 2, aside: 2.5, agree: 3, "look-up": 4,
};
export const takesS = (verb: string): number => TAKES[verb] ?? 3;

/** The moments the echo can meet: on its way, begun by themselves, sending nobody off. */
export function meetable(kind: MomentKind): boolean {
  const def = MOMENTS[kind];
  return def.where === "ahead" && !def.followUp && !def.errand;
}

const between = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);

/** The body, taken over where it stands: walking its person's way back from where they left it. */
export function keepBody(at: P, trail: Trail, brief: StandInBrief, seed: string, now: number, maxS: number = STAND_IN.maxS): EchoBody {
  const crumbs = trail.crumbs.map((c) => ({ ...c }));
  const lanes = Object.fromEntries(LANES.map((l) => [l, { count: 0, nextAt: now + MOMENT.lanes[l].firstS * 1000 }])) as EchoBody["lanes"];
  // Back along the way from its end, which is nearest where the person left it.
  let i = crumbs.length - 1;
  if (i > 0 && dist(crumbs[i]!, at) < 0.5) i--;
  return {
    since: now,
    until: Math.min(now + maxS * 1000, brief.exp),
    seed,
    brief,
    trail: crumbs,
    pace: Math.min(STAND_IN.paceMps[1], Math.max(STAND_IN.paceMps[0], trail.pace)),
    i: Math.max(0, i),
    dir: -1,
    pauseUntil: 0,
    pausedAt: -1,
    lanes,
    lastMet: new Map(),
    doing: null,
    facing: null,
    log: [],
    met: 0,
  };
}

/** Whether the echo has a way to walk at all. */
const walks = (b: EchoBody) => b.trail.length >= STAND_IN.minCrumbs;

/** The crumb about `aheadM` on along the way it is walking, or where it is when it has no way. */
function crumbAhead(b: EchoBody, from: P): number {
  if (!walks(b)) return -1;
  let i = b.i;
  let dir = b.dir;
  let d = dist(from, b.trail[i]!);
  // Crumbs are a stride and a half apart at least, so this ends; the count is for a way it never saw.
  for (let k = 0; d < STAND_IN.aheadM && k < 64; k++) {
    let n = i + dir;
    if (n < 0 || n >= b.trail.length) {
      dir = dir === 1 ? -1 : 1;
      n = i + dir;
    }
    d += dist(b.trail[i]!, b.trail[n]!);
    i = n;
  }
  return i;
}

/** The next moment of a stream, if one is due and comes this way now; what the echo does there is decided as it comes. */
function meet(b: EchoBody, lane: MomentLane, pose: BodyPose, now: number, rand: () => number): void {
  const L = b.lanes[lane];
  const hour = timeOfDay(CLOCK, now);
  const skip = (k: MomentKind) => {
    if (!meetable(k)) return true;
    if (MOMENTS[k].awe && now - b.since < MOMENT.aweAfterS * 1000) return true;
    const last = b.lastMet.get(k);
    return last !== undefined && now - last < (k === "greeting" ? MOMENT.greetingRepeatS : MOMENT.repeatS) * 1000;
  };
  const next = nextMoment(b.seed, L.count, hour, pose, null, lane, null, skip);
  if (!next) {
    L.nextAt = now + (lane === "wayside" ? 5 : 8) * 1000;
    return;
  }
  L.count = next.n;
  b.lastMet.set(next.kind, now);
  const c: StandInCall = b.brief.calls[next.kind] ?? { call: ON, p: 0, may: "watch" };
  const acts = c.may === "act" && c.call !== ON;
  b.log.push({ at: now, kind: next.kind, call: c.call, p: c.p, may: c.may, did: acts ? c.call : ON });
  b.met++;
  if (b.log.length > STAND_IN.logMax) b.log.shift();
  if (acts) {
    b.doing = { kind: next.kind, lane, call: c.call, activity: activityOf(c.call), at: crumbAhead(b, pose), until: 0, giveUpAt: now + 40_000 };
    if (b.doing.at < 0) b.doing.until = now + takesS(c.call) * 1000;
  } else {
    // Walked past: the stream's next comes once it is behind, a few strides on.
    L.nextAt = now + (6 + between(MOMENT.lanes[lane].gapS, rand)) * 1000;
  }
}

/** One step of the body, `dtMs` after the last: its pose now. */
export function stepEcho(b: EchoBody, pose: BodyPose, now: number, dtMs: number, rand: () => number = Math.random): BodyPose {
  // At a moment, doing what it said: there until it is done.
  const d = b.doing;
  if (d && d.until > 0) {
    if (now < d.until) return { ...pose, speed: 0, activity: d.activity };
    b.doing = null;
    b.lanes[d.lane].nextAt = now + between(MOMENT.lanes[d.lane].gapS, rand) * 1000;
  } else if (d && now > d.giveUpAt) {
    b.doing = null;
    b.lanes[d.lane].nextAt = now;
  }

  if (!b.doing) {
    for (const lane of LANES) {
      if (b.lanes[lane].nextAt <= now) {
        meet(b, lane, pose, now, rand);
        break;
      }
    }
    if (b.doing && (b.doing as Doing).until > 0) return { ...pose, speed: 0, activity: (b.doing as Doing).activity };
  }

  if (!walks(b)) return { ...pose, speed: 0, activity: "stand" };

  // Where its person stood still, it stands (or sits) as long, unless a moment is waiting ahead.
  if (now < b.pauseUntil && !b.doing) return { ...pose, speed: 0, activity: b.trail[b.pausedAt]?.sit ? "sit" : "stand" };

  let x = pose.x;
  let y = pose.y;
  let yaw = pose.yaw;
  let left = (b.pace * Math.min(dtMs, 500)) / 1000;
  while (left > 1e-6) {
    const to = b.trail[b.i]!;
    const gap = Math.hypot(to.x - x, to.y - y);
    if (gap > 1e-6) yaw = yawOfHeading(Math.atan2(to.y - y, to.x - x));
    if (gap > left) {
      x += ((to.x - x) / gap) * left;
      y += ((to.y - y) / gap) * left;
      left = 0;
      break;
    }
    x = to.x;
    y = to.y;
    left -= gap;
    const here = b.i;
    let n = b.i + b.dir;
    if (n < 0 || n >= b.trail.length) {
      b.dir = b.dir === 1 ? -1 : 1;
      n = b.i + b.dir;
    }
    b.i = n;
    if (b.doing && b.doing.until === 0 && here === b.doing.at) {
      b.doing.until = now + takesS(b.doing.call) * 1000;
      return { x, y, yaw, speed: 0, activity: b.doing.activity };
    }
    if (!b.doing && to.pauseS >= STAND_IN.pauseMinS && here !== b.pausedAt) {
      b.pausedAt = here;
      b.pauseUntil = now + to.pauseS * 1000;
      return { x, y, yaw, speed: 0, activity: to.sit ? "sit" : "stand" };
    }
  }
  return { x, y, yaw, speed: b.pace, activity: "walk" };
}

/** A body as the room holds it: where it is, and whose keeping it is in, if anyone's. */
export interface KeptBody extends Omit<BodyPose, "activity"> {
  activity: string;
  echo: EchoBody | null;
}

/**
 * The room's whole step for the bodies echoes keep: each moved on by `dtMs` at `now`. Returns those whose
 * keeping is over, for the room to let go. Takes no watcher, and nothing it reads says whether there is one.
 */
export function advanceKept<T extends KeptBody>(bodies: Iterable<T>, now: number, dtMs: number, rand: () => number = Math.random): T[] {
  const over: T[] = [];
  for (const w of bodies) {
    if (!w.echo) continue;
    if (now >= w.echo.until) {
      over.push(w);
      continue;
    }
    // Answering someone (C110): it stands where it is, turned to them, until the answer is said.
    const f = w.echo.facing;
    if (f && now < f.until) {
      w.yaw = f.yaw;
      w.speed = 0;
      if (w.activity === "walk") w.activity = "stand";
      continue;
    }
    if (f) w.echo.facing = null;
    const p = stepEcho(w.echo, { x: w.x, y: w.y, yaw: w.yaw, speed: w.speed, activity: w.activity as BodyPose["activity"] }, now, dtMs, rand);
    w.x = p.x;
    w.y = p.y;
    w.yaw = p.yaw;
    w.speed = p.speed;
    w.activity = p.activity;
  }
  return over;
}

/**
 * What a watcher has not yet been told, having been told of `seen` moments: copies of the newest entries,
 * and the count to remember. Reads the body and writes nothing to it.
 */
export function newsFor(body: Readonly<EchoBody>, seen: number): { entries: AwayEntry[]; seen: number } {
  const fresh = Math.min(body.met - seen, body.log.length);
  return { entries: fresh > 0 ? body.log.slice(-fresh).map((e) => ({ ...e })) : [], seen: body.met };
}
