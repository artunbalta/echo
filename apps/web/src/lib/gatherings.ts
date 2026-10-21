/**
 * Being there (DECISIONS C52): when a stranger has stood with a burial, a wedding or a new child's
 * callers long enough to have been part of it — and, at a wedding, when they watched it from across
 * the green and never came near.
 *
 * PRESENCE, NOT A BUTTON. There is no verb for it (`affordances.ts`): the catalogue's I7 and G4 are
 * what a person does unprompted — goes up to the yard, joins the ring — and a prompt would turn the
 * cue into compliance with the prompt. So it is read from where the stranger stands while it holds,
 * in real time, as everything about the body is: a share of the gathering's own length inside its
 * rings is joining it.
 *
 * Pure: the browser's component calls it a few times a second with what the world says.
 */
import { WORLD_DAY_S, type Gathering } from "@echo/planet";

export const ATTEND = {
  /** Inside the rings for this share of the gathering is being at it. */
  joinShare: 0.4,
  /** Metres beyond the outermost ring that still count as inside. */
  reachM: 2.5,
  /** Within this many metres of the middle is being in sight of it. */
  nearM: 45,
  /** In sight for this share and inside for less than `insideMax` is watching from apart. */
  apartShare: 0.4,
  insideMax: 0.1,
} as const;

export interface AttendState {
  /** Real milliseconds inside each gathering's rings, and in sight of it. */
  inside: Map<string, number>;
  near: Map<string, number>;
  joined: Set<string>;
  apart: Set<string>;
}

export type AttendEvent = { kind: "joined" | "stayed-apart"; gathering: Gathering; dwellMs: number; distanceM: number };

export const newAttendState = (): AttendState => ({ inside: new Map(), near: new Map(), joined: new Set(), apart: new Set() });

/** The outermost ring's radius, metres from the middle. */
export function outerRing(g: Gathering): number {
  let r = 0;
  for (const p of g.places.values()) r = Math.max(r, Math.hypot(p.at.x - g.at.x, p.at.y - g.at.y));
  return r;
}

/** A gathering's length in real milliseconds. */
export const realLengthMs = (g: Gathering): number => (g.t1 - g.t0) * WORLD_DAY_S * 1000;

/** One step: `dtMs` of real time at `hour`, the stranger at `player` (planet-local metres), or nowhere. */
export function attendStep(state: AttendState, gatherings: readonly Gathering[], hour: number, player: { x: number; y: number } | null, dtMs: number): AttendEvent[] {
  const out: AttendEvent[] = [];
  for (const g of gatherings) {
    const length = realLengthMs(g);
    const d = player ? Math.hypot(player.x - g.at.x, player.y - g.at.y) : Infinity;
    if (hour >= g.t0 && hour <= g.t1 && player) {
      if (d <= outerRing(g) + ATTEND.reachM) state.inside.set(g.id, (state.inside.get(g.id) ?? 0) + dtMs);
      if (d <= ATTEND.nearM) state.near.set(g.id, (state.near.get(g.id) ?? 0) + dtMs);
      const inside = state.inside.get(g.id) ?? 0;
      if (!state.joined.has(g.id) && inside >= ATTEND.joinShare * length) {
        state.joined.add(g.id);
        out.push({ kind: "joined", gathering: g, dwellMs: inside, distanceM: d });
      }
    }
    // A wedding watched from across the green, and never joined: the refusal's twin (G4's K).
    if (hour > g.t1 && g.kind === "wedding" && !state.joined.has(g.id) && !state.apart.has(g.id)) {
      const near = state.near.get(g.id) ?? 0;
      const inside = state.inside.get(g.id) ?? 0;
      if (near >= ATTEND.apartShare * length && inside < ATTEND.insideMax * length) {
        state.apart.add(g.id);
        out.push({ kind: "stayed-apart", gathering: g, dwellMs: near, distanceM: d });
      }
    }
  }
  return out;
}

/**
 * What being there is measured as. A burial is the catalogue's I7 `mourns`, which ingest.py does not
 * route yet. Joining a wedding or a new child's callers, and keeping apart from a wedding, are the
 * clearing's own `group_join` and `group_avoid` (G1, packages/shared/src/social.ts), which ingest.py
 * reads by name — C52 sent them as the catalogue's unrouted G4 names until C55 found the routed pair.
 */
export function attendanceLabel(e: AttendEvent): { action: string; cue: "I7" | "G1"; channel: "I" | "G"; polarity: "take" | "refuse" } {
  if (e.kind === "stayed-apart") return { action: "group_avoid", cue: "G1", channel: "G", polarity: "refuse" };
  return e.gathering.kind === "funeral" ? { action: "mourns", cue: "I7", channel: "I", polarity: "take" } : { action: "group_join", cue: "G1", channel: "G", polarity: "take" };
}

/** How long until a world day and hour, in real minutes, in words: "in about 20 minutes". */
export function realWhen(fromDay: number, fromHour: number, day: number, hour: number, lang: "en" | "tr" = "en"): string {
  const minutes = ((day - fromDay) + (hour - fromHour)) * (WORLD_DAY_S / 60);
  if (lang === "tr") {
    if (minutes <= 0.5) return "şimdi";
    if (minutes < 1.5) return "yaklaşık bir dakika sonra";
    return `yaklaşık ${Math.round(minutes)} dakika sonra`;
  }
  if (minutes <= 0.5) return "now";
  if (minutes < 1.5) return "in about a minute";
  return `in about ${Math.round(minutes)} minutes`;
}
