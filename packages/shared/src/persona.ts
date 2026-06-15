/**
 * Persona axes (§8). These define both:
 *   1. the NPC "spanning probe set" — NPCs are placed to cover the corners and
 *      mid-points of this space so a user's *differential* responses locate them, and
 *   2. the human-readable decoding of the user's latent persona vector `z` (§9.3).
 *
 * Each axis is a bipolar dimension in [-1, 1].
 */
export interface PersonaAxes {
  warmth: number; // cold (-1) ↔ warm (+1)
  dominance: number; // submissive ↔ assertive
  openness: number; // conventional ↔ eccentric
  energy: number; // calm ↔ high-energy
  formality: number; // casual ↔ formal
  intellect: number; // playful ↔ cerebral
  pace: number; // slow ↔ fast
  affect: number; // reserved ↔ expressive
}

export const PERSONA_AXIS_KEYS = [
  "warmth",
  "dominance",
  "openness",
  "energy",
  "formality",
  "intellect",
  "pace",
  "affect",
] as const;

export type PersonaAxisKey = (typeof PERSONA_AXIS_KEYS)[number];

/** Poles used when decoding axis values into natural-language trait phrases. */
export const AXIS_POLES: Record<PersonaAxisKey, [neg: string, pos: string]> = {
  warmth: ["cold", "warm"],
  dominance: ["deferential", "assertive"],
  openness: ["conventional", "eccentric"],
  energy: ["calm", "high-energy"],
  formality: ["casual", "formal"],
  intellect: ["playful", "cerebral"],
  pace: ["unhurried", "fast"],
  affect: ["reserved", "expressive"],
};

export const PERSONA_DIM = PERSONA_AXIS_KEYS.length; // 8

export function emptyAxes(): PersonaAxes {
  return {
    warmth: 0,
    dominance: 0,
    openness: 0,
    energy: 0,
    formality: 0,
    intellect: 0,
    pace: 0,
    affect: 0,
  };
}

export function axesToVector(a: PersonaAxes): number[] {
  return PERSONA_AXIS_KEYS.map((k) => a[k]);
}

export function vectorToAxes(v: number[]): PersonaAxes {
  const a = emptyAxes();
  PERSONA_AXIS_KEYS.forEach((k, i) => {
    a[k] = v[i] ?? 0;
  });
  return a;
}

/**
 * Decode axis values into trait phrases, keeping only axes the value is decisive on.
 * Used to build the persona profile injected into the cloning policy prompt (§9.3).
 */
export function describeAxes(a: PersonaAxes, threshold = 0.33): string[] {
  const out: string[] = [];
  for (const k of PERSONA_AXIS_KEYS) {
    const v = a[k];
    if (Math.abs(v) < threshold) continue;
    const [neg, pos] = AXIS_POLES[k];
    const word = v > 0 ? pos : neg;
    const intensity = Math.abs(v) > 0.66 ? "strongly " : "";
    out.push(`${intensity}${word}`);
  }
  return out;
}
