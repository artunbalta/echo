/**
 * Traveler profile generation (§7.1). Pure + isomorphic: the PixiJS client generates a
 * profile per spawned visitor and sends it to the simulate endpoint. No server imports.
 */
import type {
  BudgetBand,
  BudgetSensitivity,
  Loyalty,
  Objection,
  Segment,
  TravelerProfile,
} from "../types";

const DESTINATIONS = [
  "Tokyo", "Bangkok", "Berlin", "New York", "Dubai", "Paris", "London",
  "Singapore", "Cape Town", "Rio de Janeiro", "Bali", "Rome", "Toronto", "Seoul",
];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const SEGMENTS: Segment[] = ["leisure", "business", "family", "student", "VFR"];
const OBJECTIONS: Objection[] = ["price", "schedule", "route", "loyalty-to-competitor", "just-browsing"];
const ALTERNATIVES = ["Lufthansa Island", "Emirates Island", "Qatar Island", "the food court", "the concert stage", "a rival booth"];

/** Tiny seeded PRNG so a given visitor id always yields the same profile + outcome. */
export function rngFromId(id: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

export function newVisitorId(): string {
  // Client-side spawn id; randomness is fine here (visuals only until persisted).
  return "v_" + Math.random().toString(36).slice(2, 10);
}

export function generateTravelerProfile(id: string): TravelerProfile {
  const r = rngFromId(id);
  const segment = pick(SEGMENTS, r());
  const budgetSensitivity = pick<BudgetSensitivity>(["low", "medium", "high"], r());
  const loyalty = pick<Loyalty>(["none", "occasional", "frequent"], r());
  const altCount = 1 + Math.floor(r() * 2);
  const consideredAlternatives: string[] = [];
  for (let i = 0; i < altCount; i++) consideredAlternatives.push(pick(ALTERNATIVES, r()));

  return {
    id,
    segment,
    desiredDestination: pick(DESTINATIONS, r()),
    flexibleDestination: r() < 0.45,
    travelMonth: pick(MONTHS, r()),
    partySize: segment === "family" ? 2 + Math.floor(r() * 4) : 1 + Math.floor(r() * 2),
    budgetSensitivity,
    loyalty,
    primaryObjection: pick(OBJECTIONS, r()),
    consideredAlternatives: [...new Set(consideredAlternatives)],
  };
}

export function budgetBandOf(p: TravelerProfile): BudgetBand {
  if (p.segment === "business") return p.budgetSensitivity === "high" ? "mid" : "high";
  if (p.segment === "student") return p.budgetSensitivity === "low" ? "mid" : "low";
  return p.budgetSensitivity === "high" ? "low" : p.budgetSensitivity === "medium" ? "mid" : "high";
}

/** A hue for the visitor's sprite tint, keyed by segment, so the crowd reads at a glance. */
export const SEGMENT_HINT: Record<Segment, { label: string; color: number }> = {
  leisure: { label: "leisure", color: 0x5aa6d0 },
  business: { label: "business", color: 0xd0a93a },
  family: { label: "family", color: 0x3aa06c },
  student: { label: "student", color: 0xa06cd5 },
  VFR: { label: "VFR", color: 0xd0533a },
};
