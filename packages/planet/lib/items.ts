/**
 * What a stranger carries, and what they can make of it (DECISIONS C47).
 *
 * A CLOSED LIST OF THINGS. Everything that can be picked up is an item here, named by the verb that
 * gives it (`affordances.ts` `gives`); everything that can be made is a recipe here, from those items.
 * `items.test.ts` fails if a verb gives something this list does not know, so the two cannot drift.
 *
 * A PACK, NOT A HOARD. Eight things at most, one of them in the hand (what a gift gives). The pack is
 * the stranger's and is kept between visits (`player_items`), so a shell picked up on one coast can be
 * given to a child three villages away; and it is checked by the server, so a gift is a gift of
 * something that was actually carried.
 *
 * NO PRICE (Design Law 1). Nothing here has a value, a rarity or a number that goes up. A villager may
 * be glad of a gift — a fisher of a hook, a child of a shell — and that gladness is theirs to say.
 *
 * Pure.
 */

import type { Measure } from "./affordances.js";

export interface ItemSpec {
  id: string;
  /** In a sentence: "a shell", "some driftwood". */
  name: string;
  /** Who in a village is especially glad of one, for the villager's facts: a trade, or "child", or "old". */
  gladdens?: readonly string[];
}

export const ITEMS: Record<string, ItemSpec> = {
  shell: { id: "shell", name: "a shell", gladdens: ["child"] },
  stone: { id: "stone", name: "a flat stone" },
  reed: { id: "reed", name: "a reed", gladdens: ["weaver"] },
  driftwood: { id: "driftwood", name: "a piece of driftwood", gladdens: ["carpenter"] },
  "dry branch": { id: "dry branch", name: "a dry branch" },
  "dry twigs": { id: "dry twigs", name: "a bundle of dry twigs" },
  berries: { id: "berries", name: "a handful of berries", gladdens: ["old", "child"] },
  "a handful of grain": { id: "a handful of grain", name: "a handful of grain" },
  ore: { id: "ore", name: "a lump of ore", gladdens: ["smith"] },
  // What can be made.
  basket: { id: "basket", name: "a reed basket", gladdens: ["farmer", "fisher"] },
  necklace: { id: "necklace", name: "a shell necklace", gladdens: ["child", "old"] },
  "hook and line": { id: "hook and line", name: "a hook and line", gladdens: ["fisher"] },
  hammer: { id: "hammer", name: "a stone hammer", gladdens: ["smith", "carpenter", "stonecutter"] },
  torch: { id: "torch", name: "a torch" },
  raft: { id: "raft", name: "a raft" },
  // What a villager's work leaves them to spare, given in trade or in return for help (C58). Each is
  // somebody's day's work, and none of them is worth more than another: nothing here has a value.
  fish: { id: "fish", name: "a fish", gladdens: ["old", "innkeeper", "smith"] },
  bread: { id: "bread", name: "a loaf of bread", gladdens: ["fisher", "miner", "child"] },
  cheese: { id: "cheese", name: "a piece of cheese", gladdens: ["fisher", "child"] },
  cloth: { id: "cloth", name: "a length of cloth", gladdens: ["farmer", "old"] },
  pot: { id: "pot", name: "a clay pot", gladdens: ["innkeeper", "healer", "farmer"] },
  bowl: { id: "bowl", name: "a wooden bowl", gladdens: ["innkeeper", "old"] },
  herbs: { id: "herbs", name: "a bunch of herbs", gladdens: ["healer", "old"] },
  knife: { id: "knife", name: "a knife", gladdens: ["fisher", "herder", "forester"] },
  // What a house is furnished with (C59), made like anything else.
  stool: { id: "stool", name: "a stool" },
  table: { id: "table", name: "a table" },
  bed: { id: "bed", name: "a bed" },
  shelf: { id: "shelf", name: "a shelf" },
};

export interface Recipe {
  id: string;
  makes: string;
  /** What it takes, by item id. */
  needs: Record<string, number>;
  /** Seconds of work. */
  holdS: number;
  label: string;
  measure: Measure;
  beat: string;
  /** Made where it is used, not carried: a raft is built at the water's edge and launched there. */
  atWater?: boolean;
}

const craft = (action: string, route: Measure["route"]): Measure => ({ cue: "F6", channel: "F", action, route });

export const RECIPES: readonly Recipe[] = [
  { id: "basket", makes: "basket", needs: { reed: 4 }, holdS: 8, label: "Weave a basket", measure: craft("weave_basket", "unrouted"), beat: "It is lopsided, and it holds." },
  { id: "necklace", makes: "necklace", needs: { shell: 3, reed: 1 }, holdS: 6, label: "String a shell necklace", measure: craft("string_necklace", "unrouted"), beat: "Three shells on a reed. It clicks when you move." },
  { id: "hook", makes: "hook and line", needs: { reed: 2, shell: 1 }, holdS: 5, label: "Make a hook and line", measure: craft("make_hook", "unrouted"), beat: "A shell ground to a point, on a twisted reed." },
  { id: "hammer", makes: "hammer", needs: { stone: 2, "dry branch": 1 }, holdS: 7, label: "Lash a stone hammer", measure: craft("lash_hammer", "unrouted"), beat: "Heavier at the head than you meant. Good." },
  { id: "torch", makes: "torch", needs: { "dry branch": 1, "dry twigs": 1 }, holdS: 4, label: "Bind a torch", measure: craft("bind_torch", "unrouted"), beat: "It will burn, when it is lit." },
  // The raft is the one recipe ingest.py already knows by its own name: building it is assemble_raft.
  // Furniture for a house of your own (C59): F6, investment in building, under their own labels.
  { id: "stool", makes: "stool", needs: { "dry branch": 2 }, holdS: 6, label: "Make a stool", measure: craft("make_stool", "unrouted"), beat: "Three legs. It does not rock." },
  { id: "table", makes: "table", needs: { driftwood: 3 }, holdS: 10, label: "Make a table", measure: craft("make_table", "unrouted"), beat: "Driftwood boards, pegged. Something to eat at." },
  { id: "bed", makes: "bed", needs: { driftwood: 2, reed: 3 }, holdS: 10, label: "Make a bed", measure: craft("make_bed", "unrouted"), beat: "A frame, and reeds to lie on." },
  { id: "shelf", makes: "shelf", needs: { driftwood: 2, "dry branch": 1 }, holdS: 7, label: "Make a shelf", measure: craft("make_shelf", "unrouted"), beat: "A board on two brackets. A place for things." },
  { id: "raft", makes: "raft", needs: { driftwood: 6, reed: 2 }, holdS: 14, label: "Lash a raft together", measure: { cue: "F6", channel: "F", action: "assemble_raft", route: "named", abandon: "abandon_build" }, beat: "Six logs and two reeds. It floats, probably.", atWater: true },
];

/** How many things a pack holds. */
export const PACK_SIZE = 8;

/** A pack: item id → how many. */
export type Pack = Record<string, number>;

export const packCount = (pack: Pack): number => Object.values(pack).reduce((a, b) => a + b, 0);

/** Can this recipe be made from this pack? */
export function canMake(pack: Pack, recipe: Recipe): boolean {
  return Object.entries(recipe.needs).every(([id, n]) => (pack[id] ?? 0) >= n);
}

/** The pack after making a recipe, or null if it cannot be made. */
export function make(pack: Pack, recipe: Recipe): Pack | null {
  if (!canMake(pack, recipe)) return null;
  const next: Pack = { ...pack };
  for (const [id, n] of Object.entries(recipe.needs)) {
    next[id] -= n;
    if (next[id] === 0) delete next[id];
  }
  next[recipe.makes] = (next[recipe.makes] ?? 0) + 1;
  return next;
}

/** The pack after adding one thing, or null if it is full or the thing is not an item. */
export function add(pack: Pack, item: string): Pack | null {
  if (!ITEMS[item] || packCount(pack) >= PACK_SIZE) return null;
  return { ...pack, [item]: (pack[item] ?? 0) + 1 };
}

/** The pack after taking one thing out, or null if it is not there. */
export function remove(pack: Pack, item: string): Pack | null {
  if ((pack[item] ?? 0) <= 0) return null;
  const next: Pack = { ...pack, [item]: pack[item] - 1 };
  if (next[item] === 0) delete next[item];
  return next;
}

/** Whether a villager would be especially glad of this thing: their trade, or their age. */
export function gladOf(item: string, trade: string, age: number): boolean {
  const g = ITEMS[item]?.gladdens ?? [];
  return g.includes(trade) || (age < 13 && g.includes("child")) || (age >= 65 && g.includes("old"));
}
