/**
 * The waitlist roster (§1b). Eight islanders around the empty centre slot.
 *
 * This is the app-side source of truth for WHICH characters exist. It stores ids and names only and
 * derives every style from styleFromId() — the same function the world uses — so a roster tile, its
 * generated portrait, and the sprite the player actually receives can never disagree.
 *
 * Portraits are committed PNGs from `npm run gen:roster` (pipeline/generate-roster-portraits.mjs),
 * designed silhouette-first to docs/world-design/roster-portrait-spec.md and gated by
 * pipeline/audit-roster-portraits.py. They are art only: picking a character still calls
 * createFromPremade(id), which builds the real procedural sprite sheet. If a portrait PNG is missing
 * the tile falls back to the procedural AvatarPreview, so the roster renders with zero keys, zero
 * network, and never a broken slot.
 *
 * KEEP IN SYNC with pipeline/roster-cast.mjs (`npm run verify:roster` diffs the two).
 */
import { styleFromId, type CharStyle } from "@/game/art";

/**
 * Id + name, in grid order. Ids are chosen for head-outline spread: styleFromId's hairStyle is the
 * only sprite-fixed attribute that changes a silhouette, so the set hashes exactly 2 to each of
 * short/long/buzz/bun. See pipeline/roster-cast.mjs for the full rationale and each character's
 * silhouette design.
 *
 * Names are placeless and slightly archaic, to fit the world's register. They are deliberately NOT
 * /onboard's hair-silhouette tags ("Long", "Buzz") — those describe a haircut, and under a roster
 * portrait a haircut does not read as a person.
 */
export const CAST: { id: string; name: string }[] = [
  // premade_0 carries the one hand-picked portrait (see pipeline/roster-cast.mjs). Its palette is
  // styleFromId("premade_0") exactly, which is why the art lives on THIS id and not on the id the
  // name Lark used to sit on — a tile must never lie about the sprite a player receives.
  { id: "premade_0", name: "Lark" },
  { id: "premade_11888", name: "Rook" },
  { id: "premade_8535", name: "Maren" },
  { id: "premade_4940", name: "Sorrel" },
  { id: "premade_4483", name: "Pell" },
  { id: "premade_5893", name: "Bryn" },
  { id: "premade_11861", name: "Cass" },
  { id: "premade_12508", name: "Wren" },
];

export const ROSTER_IDS = CAST.map((c) => c.id);

/** The empty centre slot. Not a character: the absence of one. */
export const EMPTY_SLOT = "empty" as const;

export interface RosterEntry {
  id: string;
  name: string;
  style: CharStyle;
  /** Committed portrait; falls back to the procedural sprite if it 404s. */
  portrait: string;
}

export const ROSTER: RosterEntry[] = CAST.map(({ id, name }) => ({
  id,
  name,
  style: styleFromId(id),
  portrait: `/assets/roster/${id}.png`,
}));

/**
 * The 3x3 grid, reading order, with the hole in the middle. The centre is index 4 — the only place
 * echo-violet is allowed on this page, and the primary call to action.
 */
export const GRID: (RosterEntry | typeof EMPTY_SLOT)[] = [
  ROSTER[0],
  ROSTER[1],
  ROSTER[2],
  ROSTER[3],
  EMPTY_SLOT,
  ROSTER[4],
  ROSTER[5],
  ROSTER[6],
  ROSTER[7],
];

export const GRID_COLS = 3;
export const EMPTY_INDEX = 4;
