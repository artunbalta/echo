/**
 * What the body needs to know of a thing to do an act to it for real (DECISIONS C98): how near it
 * stands, how high off the ground a hand meets the thing, and what is seen in the hand.
 *
 * The registry says WHAT is done (`Verb.gesture`, `@echo/planet`); the rig says how the body moves
 * (`game/three/gestures.ts`). Between them is this: a jar on a stall is at the height of a stall, a
 * door is knocked on at the height of a door, and a person who throws a ball back throws a ball. It is
 * a table and a few rules, and a thing it does not name falls back on what its gesture does by itself.
 */
import { GESTURE_HANDS, type Gesture, type ThingKind, type Verb } from "@echo/planet";

import type { HandItem } from "@/game/world/handThings";
import type { Act } from "@/game/world/playerLayer";

/** Gestures done to a thing by hand: the body steps up to it first. The rest are done from where the body is. */
const BY_HAND: ReadonlySet<Gesture> = new Set<Gesture>([
  "pick-up", "take", "give", "offer", "feed", "set-down", "pick-place", "leave-be", "touch", "lift", "tidy", "search", "eat", "pluck", "draw-water",
  "knock", "push", "shoulder", "pull", "swing", "push-open", "turn", "untie", "hammer", "lay", "stack", "paint", "stroke", "tussle", "help-up", "peer", "peep",
  "reflect", "respect", "drop",
]);

/** Where a hand meets a kind of thing: how far the body stands from its middle, and how high, in metres. */
const SITES: Partial<Record<ThingKind, { standM?: number; upM?: number }>> = {
  // A ball is thrown back from where it lies: the body goes to it.
  "ball-game": { standM: 0.5 },
  "stray-ball": { standM: 0.5 },
  "honey-stall": { standM: 0.62, upM: 0.9 },
  well: { standM: 1.0, upM: 0.85 },
  "well-custom": { standM: 1.0, upM: 0.85 },
  house: { standM: 0.5 },
  "banging-door": { standM: 0.55, upM: 1.0 },
  "open-gate": { standM: 0.6, upM: 1.0 },
  "stuck-cart": { standM: 1.05, upM: 0.75 },
  "lost-purse": { standM: 0.5 },
  "lost-pouch": { standM: 0.5 },
  litter: { standM: 0.5 },
  woodpile: { standM: 0.7 },
  "imece-wall": { standM: 0.75 },
  "caught-lamb": { standM: 0.6, upM: 0.3 },
  "netted-gull": { standM: 0.55, upM: 0.15 },
  grave: { standM: 0.7 },
  dog: { standM: 0.55, upM: 0.45 },
  goat: { standM: 0.6, upM: 0.6 },
  hen: { standM: 0.5, upM: 0.25 },
  villager: { standM: 0.8, upM: 1.0 },
  "bread-errand": { standM: 0.8, upM: 1.0 },
  "bread-mother": { standM: 0.8, upM: 1.0 },
  "hungry-stranger": { standM: 0.8, upM: 1.0 },
  "heavy-jugs": { standM: 0.75, upM: 0.3 },
  "fallen-elder": { standM: 0.6, upM: 0.3 },
  "drunk-or-ill": { standM: 0.6, upM: 0.3 },
  "still-pool": { standM: 0.9 },
  water: { standM: 0.4 },
};

/** What a verb puts in the hand, by the thing it is done to; then by its gesture. */
const ITEM_OF_KIND: Partial<Record<ThingKind, HandItem>> = {
  "ball-game": "ball", "stray-ball": "ball", "honey-stall": "jar", "lost-purse": "coin", "lost-pouch": "coin", "spilled-basket": "apple", litter: "litter",
  woodpile: "log", "imece-wall": "stone", "bread-errand": "loaf", "bread-mother": "loaf", "hungry-stranger": "loaf", "heavy-jugs": "jug", "message-bottle": "note",
};
const ITEM_OF_GESTURE: Partial<Record<Gesture, HandItem>> = {
  throw: "pebble", roll: "ball", skip: "pebble", drop: "pebble", snowball: "snowball", scatter: "grain", tidy: "litter", eat: "berry", pluck: "berry",
  "gather-up": "apple", hammer: "hammer", stake: "pebble", pick: "pickaxe", paint: "brush", fish: "rod", read: "note", wring: "cloth", plant: "seed",
  feed: "food", lay: "stone", stack: "log", weed: "weed", dig: "earth", lift: "jug",
};
const ITEM_OF_CARRIED: Record<string, HandItem> = { bread: "loaf", loaf: "loaf", berries: "berry", herbs: "weed", ore: "lump", shell: "lump", driftwood: "log", fish: "food", grain: "grain", seed: "seed" };

export interface ActThing {
  ref: string;
  kind: ThingKind | "self";
  sizeM: number;
}

/**
 * The act as the body is asked to do it. `carried` is what is in the hand already; `aim` is where the
 * thing's own layer says a thing let go should be sent (tiles), if it says.
 */
export function actFor(verb: Verb, thing: ActThing, carried: string | null, aim: Act["aim"] = null): Act {
  const site = thing.kind === "self" ? undefined : SITES[thing.kind];
  const byHand = BY_HAND.has(verb.gesture);
  const hands = GESTURE_HANDS[verb.gesture];
  // What is given or set down is what was carried; what is taken is the thing's own; a tool is the gesture's.
  const item: HandItem | null =
    hands === "leaves" && carried ? (ITEM_OF_CARRIED[carried] ?? "lump")
    : (thing.kind !== "self" ? ITEM_OF_KIND[thing.kind] : undefined) ?? (verb.gives ? (ITEM_OF_CARRIED[verb.gives] ?? "lump") : undefined) ?? ITEM_OF_GESTURE[verb.gesture] ?? (hands ? "lump" : null);
  return {
    gesture: verb.gesture,
    holdS: verb.holdS,
    ref: thing.ref,
    verb: verb.id,
    item,
    standM: thing.kind === "self" ? null : (site?.standM ?? (byHand ? Math.min(0.9, Math.max(0.45, Math.min(thing.sizeM, 0.4) + 0.4)) : null)),
    upM: site?.upM ?? 0,
    aim,
    owned: thing.ref.startsWith("moment:"),
  };
}
