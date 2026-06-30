/**
 * Bible PNG overrides for procedural props (Step 6, Part 3). An entity with a `proc:<kind>`
 * spriteUrl renders its committed Higgsfield PNG (a single static sprite, generated to
 * docs/world-design/art-bible.md by pipeline/generate-flow-assets.mjs) when one exists here, and
 * falls back to the procedural builder (game/props.ts) / a character sheet when it doesn't — so the
 * world stays key-free and renders even with assets absent (Invariant 1). Ground TILES
 * (grass/water/sand/…) are NOT here; they load via PixiWorld's artDir.
 *
 * Kinds with no entry (dog, grain_*, raft, book_cairn, bedroll, campfire, queue_line) stay
 * procedural: they either have no generated PNG or belong to the retired island-day loop.
 */
export const PROP_ASSETS: Record<string, string> = {
  // ── F0 — the solitary shore (rendered by Flow0Client, artDir /assets/island) ──
  hill: "/assets/island/hill.png",
  thicket: "/assets/island/thicket.png",
  driftwood: "/assets/island/driftwood.png",
  shell: "/assets/island/shell.png",
  path_marker: "/assets/island/path_marker.png",
  tidepool: "/assets/island/tidepool.png",

  // ── F1 — scarcity / learning (assets ready; scene future) ──
  fertile_patch: "/assets/f1/fertile_patch.png",
  berry_bush: "/assets/f1/berry_bush.png",
  gamble_cave: "/assets/f1/gamble_cave.png",
  marker_stone: "/assets/f1/marker_stone.png",
  buried_cache: "/assets/f1/buried_cache.png",
  shy_creature: "/assets/f1/shy_creature.png",

  // ── F2 — the crossing ──
  raft_causeway: "/assets/f2/raft_causeway.png",
  solo_figure: "/assets/f2/solo_figure.png",
  gift_props: "/assets/f2/gift_props.png",

  // ── F3 — the clearing's station NPCs (rendered in the shared room) ──
  stall_keeper: "/assets/f3/stall_keeper.png",
  elder: "/assets/f3/elder.png",
  group_npcs: "/assets/f3/group_npcs.png",
  marginal_npc: "/assets/f3/marginal_npc.png",
  trader: "/assets/f3/trader.png",

  // ── F4 — community (assets ready; scene future) ──
  partner_neutral: "/assets/f4/partner_neutral.png",
  partner_ally: "/assets/f4/partner_ally.png",
  partner_wronged: "/assets/f4/partner_wronged.png",
  promise_token: "/assets/f4/promise_token.png",
  bench: "/assets/f4/bench.png",
  shared_fire: "/assets/f4/shared_fire.png",

  // ── F5 — pressure / private (assets ready; scene future) ──
  found_property: "/assets/f5/found_property.png",
  unwatched_hush: "/assets/f5/unwatched_hush.png",

  // ── F6 — settlement (assets ready; scene future) ──
  home_orderly: "/assets/f6/home_orderly.png",
  home_ornate: "/assets/f6/home_ornate.png",
  home_sparse: "/assets/f6/home_sparse.png",
  gathering: "/assets/f6/gathering.png",
  doppelganger_cameo: "/assets/f6/doppelganger_cameo.png",

  // ── the 4 stand archetypes (rendered in the shared room) ──
  travel_stand: "/assets/stands/travel_stand.png",
  workplace_stand: "/assets/stands/workplace_stand.png",
  food_stand: "/assets/stands/food_stand.png",
  market_stand: "/assets/stands/market_stand.png",
};
