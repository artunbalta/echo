/**
 * What a place sounds like (DECISIONS C56): the sea, the wind and the rain, the village's murmur,
 * the night's insects and the dawn's birds — and, one at a time, footsteps, tools and animals.
 *
 * THE WORLD DECIDES, THE EAR ONLY HEARS. Every number here is read off what is already true where
 * the stranger stands: how far the water is, the day's weather (`weatherAt`), the hour, how many
 * people are out within earshot and how many are talking, who is at work and at what, which animals
 * are near, whether the stranger is indoors. Nothing here is a fact about the world, and nothing here
 * is measured: it is the one layer of the game that is only for the person playing it.
 *
 * Pure. The sound layer (`soundLayer.ts`) builds the WebAudio graph and asks this, a few times a
 * second, what each bed should be, what is underfoot and which tool is whose. When a foot falls is
 * the gait's (`playerLayer.footfalls`), not this file's.
 */

export type Ground = "sand" | "grass" | "wood" | "snow" | "water";
export type Tool = "anvil" | "hammer" | "hoe" | "pick" | "axe" | "loom";
export type Call = "hen" | "goat" | "dog" | "gull" | "crow";

export interface Hearing {
  /** The sky's hour, a day fraction. */
  hour: number;
  /** Metres to the nearest open water, or null where there is none in earshot. */
  seaM: number | null;
  /** The weather here and now, as `weatherAt` has it. */
  weather: { kind: string; wind: number; fall: number } | null;
  /** In a house: the world outside comes through the walls. */
  inside: boolean;
  /** A fire in the hearth of the house they are in. */
  fire: boolean;
  /** People out of doors near, weighted by how near (1 at a metre, 0 at 30). */
  people: number;
  /** Pairs talking near (the chatter bubbles). */
  talking: number;
  /** Inland or on the coast, for which birds and which night. */
  coastal: boolean;
}

export interface Mix {
  sea: number;
  wind: number;
  rain: number;
  murmur: number;
  insects: number;
  dawn: number;
  hearth: number;
  /** How much of the outside comes through: 1 out of doors, low inside a house. */
  through: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
/** Dark: 1 from dusk to dawn, with half-hour ramps (0.75 sunset, 0.25 sunrise on the sky's clock). */
export const darkness = (t: number): number => (t >= 0.5 ? ramp(t, 0.74, 0.8) : 1 - ramp(t, 0.2, 0.26));

/** The beds' levels, 0 … 1, for where and when the stranger is. */
export function mixFor(h: Hearing): Mix {
  const w = h.weather;
  const night = darkness(h.hour);
  const wet = w && (w.kind === "rain" || w.kind === "storm" || w.kind === "snow") ? w.fall : 0;
  // The sea: loud at the water's edge, gone by a hundred and twenty metres; a storm makes it roar.
  const sea = h.seaM === null ? 0 : clamp01(1 - h.seaM / 120) ** 1.4 * (0.55 + 0.45 * (w?.kind === "storm" ? 1 : (w?.wind ?? 0.3)));
  const wind = clamp01(0.08 + 0.7 * (w?.wind ?? 0.2) ** 1.5);
  const rain = w?.kind === "snow" ? 0.15 * wet : clamp01(wet * 1.1);
  // The murmur of people: the near and the talking, and the evening green loudest; rain sends it in.
  const evening = h.hour > 0.66 && h.hour < 0.82 ? 1.3 : 1;
  // It fills, it does not clip: a crowd is louder than a handful, and thirty louder than a dozen.
  const crowd = 1 - Math.exp(-(0.06 * h.people + 0.22 * h.talking));
  const murmur = clamp01(crowd * evening * (1 - 0.5 * wet) * (1 - 0.85 * night));
  // Insects on dry nights; birds at first light, and some all day by the sea.
  const insects = clamp01(night * (1 - wet) * (h.coastal ? 0.35 : 0.8) * (w?.kind === "snow" ? 0 : 1));
  const dawnPeak = Math.exp(-(((h.hour - 0.27) / 0.035) ** 2));
  const dawn = clamp01((dawnPeak * 0.9 + (1 - night) * 0.12) * (1 - 0.7 * wet));
  const through = h.inside ? 0.28 : 1;
  return { sea, wind, rain, murmur, insects, dawn, hearth: h.inside && h.fire ? 0.5 : 0, through };
}

/**
 * What is heard of the people near a point: each one out of doors weighs 1 beside the ear and
 * nothing at `r`; each pair talking counts once, if it is within `r`; and who is at work, for their
 * tools. The villagers layer hands over who it drew and where its bubbles are.
 */
export function earshotOf<P extends { x: number; y: number; activity: string }>(people: Iterable<P>, talks: Iterable<{ x: number; y: number }>, x: number, y: number, r: number): { people: number; talking: number; working: P[] } {
  let weight = 0;
  let talking = 0;
  const working: P[] = [];
  for (const p of people) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > r) continue;
    weight += 1 - d / r;
    if (p.activity === "work" || p.activity === "stoop") working.push(p);
  }
  for (const t of talks) if (Math.hypot(t.x - x, t.y - y) <= r) talking++;
  return { people: weight, talking, working };
}

/** What a body is walking on, from what is under it. */
export function groundAt(where: { heightM: number; onDock: boolean; inside: boolean; nearSea: boolean; snow: boolean }): Ground {
  if (where.onDock || where.inside) return "wood";
  if (where.heightM < 0.05) return "water";
  if (where.snow) return "snow";
  if (where.nearSea && where.heightM < 3) return "sand";
  return "grass";
}

/** The tool someone at work is heard with, by trade and what they are doing, if any. */
export function toolOf(occupation: string, activity: string): Tool | null {
  if (activity !== "work" && activity !== "stoop") return null;
  switch (occupation) {
    case "smith":
      return "anvil";
    case "carpenter":
      return "hammer";
    case "farmer":
    case "labourer":
      return activity === "stoop" ? "hoe" : null;
    case "miner":
    case "stonecutter":
      return "pick";
    case "forester":
      return "axe";
    case "weaver":
      return "loom";
    default:
      return null;
  }
}

/** Seconds between blows of a tool: an anvil rings quicker than an axe falls. */
export const TOOL_RHYTHM: Record<Tool, number> = { anvil: 0.55, hammer: 0.7, hoe: 1.4, pick: 1.1, axe: 1.6, loom: 0.9 };

/** Mean seconds between an animal's calls, when near. */
export const CALL_EVERY: Record<Call, number> = { hen: 4, goat: 9, dog: 14, gull: 6, crow: 8 };

/** How loud something is at a distance: full beside it, falling off as the square, gone at `farM`. */
export function atDistance(d: number, farM = 25): number {
  if (d >= farM) return 0;
  return clamp01((1 / (1 + (d / (farM / 4)) ** 2)) * (1 - d / farM));
}

/** The tool a performed pose is heard as, for the stranger's own work (C45 poses). */
export function toolOfPose(pose: string | null): Tool | null {
  if (pose === "dig") return "hoe";
  if (pose === "build") return "hammer";
  if (pose === "push") return "pick";
  return null;
}
