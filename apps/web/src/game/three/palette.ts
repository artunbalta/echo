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
  // seaDeep is still NOT DRAWN anywhere. seaFoam now is, though never as a surface: skyLayer.ts
  // blends it into the daylight sky, the moonlight key and the day fill, which is light mixed
  // with light and the only mixing this file sanctions. §3 also asks for "shallow turquoise grading to
  // deep ink-blue in gentle depth bands", and an attempt at that by subdividing the sea plane and
  // vertex-colouring it was measured and REJECTED: the plane is 1152 units, the shelf is 20.8, so at
  // 96 segments the gradient resolved across 1.73 cells and was invisible, while costing 18,432
  // triangles against the seven island discs' 5,600. A uniform grid is the wrong instrument at that
  // ratio. If the depth bands are wanted they belong in the fragment shader, where the feature scale
  // and the sampling rate can match. seaDeep stays defined so that work has its palette ready.
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

  // ── cold country ──
  // Added when the scatter reached the biomes the island world never visited. The palette had no
  // word for snow, for lichen, or for a conifer, so three forms blended their own values in place:
  // a taiga canopy pulled toward `duskFill`, which is a LIGHT colour and the only surface in the
  // codebase ever painted with one, and a snow drift painted entirely in `cloth`, which is a built
  // thing being used for nature against the law at the top of this file. Naming them here is the
  // difference between a palette and a habit. Values are muted the way the rest of the land is:
  // snow is the one legitimate high-value entry, because snow is, and it is still pulled off white.
  conifer: 0x3e5a44,     // taiga canopy: colder and bluer than `leafDark`, which is a warm forest
  lichen: 0x797f6c,      // the grey-green crust on cold rock, between `rockLight` and `grassDry`
  snowLit: 0xcfc9b2,     // a drift's crest under the warm western key
  snowShade: 0xb9c9c5,   // its lee, cooled toward the sky rather than darkened toward ink

  // ── the ground underfoot ──
  // Added when the floor stopped being one flat biome colour (task A10). The audit's complaint was
  // that 74% of a rainforest parcel's floor and 99% of a savanna's were a single value, on the
  // largest surface in every frame, and the answer is to paint that floor out of the materials a
  // floor is actually MADE of. The palette had words for growing things and for built things and
  // none at all for the dead and the mineral underfoot, so ten recipes would each have blended
  // their own browns at their own call sites, which is the habit the cold-country block above was
  // written to stop. Every entry below is a material, not a mood: it is what that ground is.
  //
  // Values are read as ALBEDO and go through `srgbToLinear` before they reach a vertex, so these
  // are what the surface would be under white light, not what it looks like at dusk. That matters
  // most at the dark end: `char` and `humus` are the darkest entries this palette has ever had, and
  // both are deliberately clear of `shadow`, the 0x0b0e14 ink a shadow is drawn in, by factors of
  // 2.2 and 2.7 in value. A material painted in the shadow colour is not dark, it is a hole.
  litter: 0x6b5238,      // dry fallen leaves, the top of any forest floor: warmer and lighter than `soil`
  humus: 0x2e2416,       // wet decomposed leaf mould in a hollow, and the peat in a frost trough
  clay: 0x77452c,        // the red mineral subsoil a slope shows once the litter slides off it, and the varnish on a desert stone
  char: 0x221e1b,        // ground weeks after a grass fire: charcoal and burnt stubble, neutral where `humus` is brown
  ash: 0x8d867c,         // the pale grey the same fire leaves in its own hollows, between `lichen` and `rockLight` but warmer than both
  thatch: 0xb9a463,      // standing dead grass, cured and bleached; `grassDry` is the olive of a sward going over and this is the straw it ends as. It lands within (1, 4, 6) of the biome table's own savanna, which is not a coincidence: that table's savanna IS cured grass seen from orbit
  sandDry: 0xe8d3a0,     // the bible's §3 dry rung, for the crest of a dune where nothing has been damp for a season

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
