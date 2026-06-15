/**
 * Spanning probe set generator (§8). NPCs are NOT flavor — they are a designed
 * stimulus set chosen to cover persona space, so a user's *differential* responses
 * locate them (active learning, §9.6). We deterministically generate ~100 NPCs that
 * tile the corners and mid-points of the 8 persona axes.
 *
 * Deterministic (seeded) so the same world regenerates identically — important for
 * resumability and because Math.random is unavailable in some harness contexts.
 */
import {
  PERSONA_AXIS_KEYS,
  type PersonaAxes,
  emptyAxes,
  describeAxes,
} from "./persona.js";
import { WORLD } from "./world.js";

export interface NpcSpec {
  id: string;
  name: string;
  axes: PersonaAxes;
  systemPrompt: string;
  spriteUrl: string;
  homeX: number;
  homeY: number;
  venue: string;
}

/** A small, reproducible PRNG (mulberry32) — no global Math.random dependency. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Mira", "Tomas", "Aiko", "Bran", "Lale", "Niko", "Sena", "Ravi", "Yuki", "Omar",
  "Petra", "Kai", "Suad", "Vera", "Dex", "Noor", "Iris", "Cem", "Lena", "Ezra",
  "Mara", "Fin", "Asel", "Ren", "Pia", "Hugo", "Ada", "Sol", "Wren", "Idris",
  "Talia", "Bo", "Esma", "Jun", "Cleo", "Arda", "Vidya", "Otto", "Naz", "Quill",
];
const LAST = [
  "the Quiet", "of the Hill", "Brightwater", "Vance", "Demir", "Okafor", "Lind",
  "Marsh", "Ferro", "Solis", "Yilmaz", "Crane", "Abe", "Voss", "Reyes", "Holt",
];

const VENUES = [
  "demo night", "quiet corner", "reading circle", "the fountain", "market stalls",
  "rooftop", "the long table", "garden bench", "noticeboard", "bonfire",
];

/**
 * Generate a spanning set of NPCs. We sample a low-discrepancy-ish grid: each axis
 * is pushed toward {-1, 0, +1}, walking through combinations so corners and centers
 * are both represented, then jittered slightly for naturalness.
 */
export function generateSpanningSet(count = 100, seed = 1337): NpcSpec[] {
  const rng = mulberry32(seed);
  const keys = PERSONA_AXIS_KEYS;
  const levels = [-1, 0, 1];
  const specs: NpcSpec[] = [];

  for (let i = 0; i < count; i++) {
    const axes = emptyAxes();
    // Mixed-radix walk over axis levels gives systematic coverage of the corners.
    let n = i;
    for (const k of keys) {
      const level = levels[n % 3];
      n = Math.floor(n / 3);
      const jitter = (rng() - 0.5) * 0.4;
      axes[k] = Math.max(-1, Math.min(1, level * 0.85 + jitter));
    }
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    const venue = VENUES[i % VENUES.length];
    // Scatter NPCs randomly across the walkable map (seeded RNG keeps it reproducible),
    // avoiding the border ring and the central spawn plaza so they don't pile on the player.
    const cx = WORLD.MAP_WIDTH / 2;
    const cy = WORLD.MAP_HEIGHT / 2;
    let homeX = cx;
    let homeY = cy;
    for (let tries = 0; tries < 24; tries++) {
      homeX = 3 + Math.floor(rng() * (WORLD.MAP_WIDTH - 6));
      homeY = 3 + Math.floor(rng() * (WORLD.MAP_HEIGHT - 6));
      if (Math.hypot(homeX - cx, homeY - cy) >= 6) break;
    }

    specs.push({
      id: `npc_${i.toString().padStart(3, "0")}`,
      name,
      axes,
      systemPrompt: buildNpcSystemPrompt(name, axes, venue),
      spriteUrl: "", // filled by asset pipeline / placeholder generator
      homeX: Math.max(1, Math.min(WORLD.MAP_WIDTH - 2, homeX)),
      homeY: Math.max(1, Math.min(WORLD.MAP_HEIGHT - 2, homeY)),
      venue,
    });
  }
  return specs;
}

/** Build a persona system prompt from axis coordinates (used by the LLM, §8). */
export function buildNpcSystemPrompt(
  name: string,
  axes: PersonaAxes,
  venue: string,
): string {
  const traits = describeAxes(axes, 0.25);
  const traitLine = traits.length ? traits.join(", ") : "even-keeled, hard to read";
  return [
    `You are ${name}, a resident of a country that does not exist. You are at "${venue}".`,
    `Personality: you come across as ${traitLine}.`,
    `You are talking to a newcomer who arrived today; no one here knows them, not even themselves.`,
    `Stay fully in character. Be specific and human, never an assistant. Do not break the fourth wall,`,
    `do not mention being an AI or a model, and never reference scores, levels, or games.`,
    `Keep replies short (1-3 sentences) unless the conversation naturally deepens.`,
    `React to what the newcomer actually says and does; let your personality color every reply.`,
  ].join(" ");
}
