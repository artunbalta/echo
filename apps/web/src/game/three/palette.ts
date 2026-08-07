/**
 * The palette, carried over from the art bible unchanged.
 *
 * The 3D migration supersedes the bible's RENDERING clauses (16-bit top-down orthographic, crisp
 * pixels) — see docs/world-design/art-bible.md §addendum — but not its COLOUR law, which was never
 * about pixels:
 *
 *   • one low western dusk light, everything lit by it
 *   • long soft ink shadows, never black
 *   • vivid but value-muted: saturation lives, brightness does not shout
 *   • echo-violet is sacred and rare (≤5% of any frame) — it marks the echo and live humans, and
 *     it must never become decoration
 *   • pooled warm lantern light against the cool dusk
 *   • nature is organic, built things are geometric
 *
 * Flat shading, no textures, no PBR, no specular. Carved clay, not plastic.
 */

export const PALETTE = {
  // ── the sea and sky ──
  // The water family, brought back onto the art bible's §3 ramp. The shipped values had the right
  // HUE (205, against the bible's 204 to 213) but roughly HALF its saturation: seaShallow sat at
  // S 38% where every rung of the bible's ramp is S 54% to 77%. The bible's rule is "vivid but
  // value-muted", meaning saturated colour at lowered brightness; the old values lowered both, so
  // under the warm dusk key the sea read as grey-olive rather than as water. These keep the muted
  // LIGHTNESS and restore the saturation. Measured on identical frames: S 17.1% -> 42.9% in the
  // rendered pixels, blue-minus-red +8.8 -> +28.7.
  //
  // seaDeep and seaFoam are still NOT DRAWN anywhere. §3 also asks for "shallow turquoise grading to
  // deep ink-blue in gentle depth bands", and an attempt at that by subdividing the sea plane and
  // vertex-colouring it was measured and REJECTED: the plane is 1152 units, the shelf is 20.8, so at
  // 96 segments the gradient resolved across 1.73 cells and was invisible, while costing 18,432
  // triangles against the seven island discs' 5,600. A uniform grid is the wrong instrument at that
  // ratio. If the depth bands are wanted they belong in the fragment shader, where the feature scale
  // and the sampling rate can match. These two stay defined so that work has its palette ready.
  seaDeep: 0x1c3a5e,
  seaShallow: 0x2b6d9e,
  seaFoam: 0x9fc9dd,
  skyDusk: 0x2a1f3d,
  skyHorizon: 0xc86f4a,

  // ── the land ──
  sand: 0xc9a878,
  sandWet: 0x9c8460,
  grass: 0x4f6f4a,
  grassDry: 0x7d8452,
  rock: 0x5c5f66,
  rockLight: 0x767a82,
  soil: 0x4a3a2c,

  // ── growing things (organic) ──
  trunk: 0x4a3728,
  leafDark: 0x3c5a3a,
  leaf: 0x53794c,
  leafLight: 0x6b8f57,
  bush: 0x47663f,
  bushDry: 0x8a8455,
  flower: 0xd8b04a,

  // ── built things (geometric) ──
  wood: 0x8a5733,
  woodLight: 0xb88a5a,
  rope: 0xa89268,
  cloth: 0xd9c9a8,

  // ── the body ──
  skin: 0xc98f6a,
  tunic: 0x5a6b7a,
  tunicAlt: 0x6b5a4a,
  hair: 0x2e2620,

  // ── light ──
  dusk: 0xffb877,        // the single low western key light
  duskFill: 0x4a5a7a,    // the cool sky fill opposite it
  lantern: 0xffc05a,     // pooled warm light, up close
  shadow: 0x0b0e14,      // ink, never black — 0x000000 is banned

  // ── echo-violet: sacred, rare, ≤5% ──
  echo: 0xa06cd5,
  echoDim: 0x6d4a91,

  // ── parchment (the UI's voice, not the world's) ──
  parchment: 0xf4e9d0,
} as const;

/** Hex → the 0..1 triple three wants, without dragging in a Color instance per call. */
export const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

/**
 * A deterministic value hash. Every procedural form in the world is seeded from its own id or
 * index, so the same island grows the same trees on every machine and every reload. Nothing here
 * may call Math.random(): two players looking at one island must see one island.
 */
export function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A hash seeded from a string id — for props whose identity is a name, not an index. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
