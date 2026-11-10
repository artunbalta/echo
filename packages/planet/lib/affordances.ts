/**
 * What a person can do to anything in the world (DECISIONS C45): one registry, every kind of thing,
 * and for each thing the verbs it affords — what the act is, what it means, and who it touches.
 *
 * EVERYTHING, AND EVERYTHING LATER. The world draws two families of thing: the village's (houses,
 * fields, the well, the dock and its boats, the graves, the benches, the mine) and the scatter's
 * (every `ASSET_CLASSES` class: trees, rocks, bushes, shells, driftwood…), plus the people and the
 * water. `affordances.test.ts` fails if any of them has no verb, so a class added to the scatter or a
 * thing added to the village plan cannot ship until someone has said what a person can do to it. That
 * test is the mechanism for "everything, including what is added later": not a promise in a document,
 * a build that stops.
 *
 * WHAT A VERB SAYS, in three parts read by three different systems:
 *
 *   MEASUREMENT (`measure`) — the act's line in `cue-catalog.md`, and the ACTION LABEL it is sent
 *     under. The label is chosen by the protected boundary's own rule (C7, ingest.py ⚑13): where
 *     `services/ml/echo_ml/ingest.py` already has a handler whose DEFINITION is this act — sitting
 *     still is `sit_still`, studying a thing is `study_marker`, gathering driftwood is
 *     `gather_driftwood`, costly unobserved help is `help_at_cost`, entering a dark mine is
 *     `enter_cave` — the act is sent under that label (`named`). Where the catalogue's channel has a
 *     generic route (F1 save-vs-spend, F7 giving, G approach) it goes there (`generic`). Where neither
 *     fits — trespass, theft, respect at a grave, play — the act is sent under its own label and is
 *     `unrouted`: it is recorded, and since C73 it moves nothing (the engine no longer reads a label
 *     as text), and it is never attached to the nearest plausible feature. `services/ml` is not touched, and no
 *     loading is written here: what an act weighs on an axis is W's to say.
 *   THE WORLD (`effect`) — the mark a shared act leaves (a trampled field, a forced door, a shell
 *     that is gone) and how many world days it lasts. Marks heal: the world is shared, and one
 *     person's afternoon must not be everyone's village for good.
 *   THE PEOPLE (`deed`) — how a villager who SAW it, or whose household it was done to, reads it.
 *     A reading, not a number anybody sees (Design Law 1): what a villager does with it is speak of
 *     it, or turn their back.
 *
 * Pure data, plus the lookups. No I/O, no randomness.
 */

import { ASSET_CLASSES, type AssetClassId } from "./assets.js";

/** The things the village plan draws. Every one has an entry below; a new one must. */
/** What can dye a door, a wall or a shirt, and what can be set down in a house (C59, `homes.ts`). */
const DYE_ITEMS = ["berries", "herbs", "shell", "ore"] as const;
const PLACEABLE_ITEMS = ["bed", "table", "stool", "shelf", "basket", "pot", "bowl", "cloth", "torch"] as const;

export const VILLAGE_THINGS = ["house", "ruin", "field", "bench", "well", "dock", "boat", "grave", "mine"] as const;
export type VillageThing = (typeof VILLAGE_THINGS)[number];

/** Not drawn by the plan or the scatter, and still things a person can act on. */
/** C55: the animals a stranger can act on — a dog (anyone's, or nobody's), a goat, a hen. */
/** C59: your own land, the house on it, and what is set down inside. */
export const OTHER_THINGS = [
  "villager", "water", "dog", "goat", "hen", "land", "home", "furnishing", "netted-gull", "lost-pouch", "carved-mark", "dark-cleft",
  // The pilot's six (C75, `director.ts`).
  "hungry-stranger", "raft-borrower", "tide-fisher", "seed-offer", "overgrown-path", "lone-traveler",
  // Moments and hidden things (C86, `moments.ts`).
  "spilled-basket", "stuck-cart", "ball-game", "stray-ball", "well-custom", "well-queue", "village-dance", "loose-hen", "falling-stars", "banging-door",
  "hollow-stump", "message-bottle", "still-pool", "lookout-rock", "buried-box",
  // A village that is never empty (C87, `moments.ts`): people, passers-by, and things by the way.
  "fallen-elder", "asch-boats", "looking-up", "teasing", "imece-wall", "net-haul", "musician", "wrong-basket", "tea-invite", "tangled-net",
  "bread-errand", "bread-mother", "drunk-or-ill", "campfire", "crying-alone", "dolphins", "bench-sit", "unfinished-tale", "knucklebones",
  "greeting", "rude-bump", "narrow-way", "ask-way", "heavy-jugs", "dark-lantern",
  "lost-purse", "open-gate", "litter", "caught-lamb", "woodpile", "honey-stall",
] as const;
export type OtherThing = (typeof OTHER_THINGS)[number];

/** Every kind of thing: the village's, the others, and every scatter class by its id. */
export type ThingKind = VillageThing | OtherThing | AssetClassId;

/** How the body does it: the poses the rig has (`three/character.ts`). */
export type Pose = "sit" | "kneel" | "gather" | "dig" | "build" | "study" | "push" | "climb" | "still";

/** A mark an act leaves on the shared world. */
export type EffectKind = "trampled" | "tended" | "forced" | "taken" | "tidied" | "worked";

/** How a villager reads what they saw done. The first three are kindnesses; the rest are wrongs. */
export type DeedReading = "help" | "kindness" | "respect" | "harm" | "theft" | "trespass" | "disrespect";

export const WRONGS: ReadonlySet<DeedReading> = new Set(["harm", "theft", "trespass", "disrespect"]);

/** `D` since C55: D11, the pet cue, is the one D-channel cue an act (not a conversation) sends. `E` since C87: closing an exchange gracefully, or not at all (E4, E6). */
export type CueChannel = "A" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";

export interface Measure {
  /** The line in cue-catalog.md. */
  cue: `${CueChannel}${number}`;
  channel: CueChannel;
  /** The action label sent to `/api/observe/behavioral`. */
  action: string;
  /** Which of ingest.py's routes it takes (see the header). */
  route: "named" | "generic" | "unrouted";
  /** The label sent when the act is begun and walked away from, if it has its own refusal twin. */
  abandon?: string;
}

export interface Verb {
  id: string;
  /** What the prompt says. Imperative, short: "Sit", "Force the door". */
  label: string;
  /** Seconds the act takes. Walking away before then abandons it, and abandoning is measured too. 0 is "until you get up". */
  holdS: number;
  pose: Pose;
  /** How close to the thing the body must be, metres. */
  reachM: number;
  stakes: "low" | "medium" | "high";
  measure: Measure;
  effect: { kind: EffectKind; lastsDays: number } | null;
  /** How the people it touches read it, and how much it weighs with them (1 a little, 3 a great deal). */
  deed: { reading: DeedReading; weight: 1 | 2 | 3 } | null;
  /** Whose it is: a household's (their house, field, boat, grave), the village's (the mine, the well), or nobody's. */
  owner: "household" | "village" | "none";
  /**
   * Only while carrying something (to give it), only while not (to pick something up), or only from
   * inside a boat (to bring it back).
   */
  needs?: "carrying" | "empty-handed" | "aboard";
  /** What the hand holds afterwards, for a verb that picks something up. */
  gives?: string;
  /** For a verb that gives what is carried: the only things it can give (food, to an animal; C55). */
  takes?: readonly string[];
  /** What it costs out of the pack (C75: the bread you give, the raft you lend). Offered only while you have it. */
  spends?: { item: string; count: number };
  /** One line of what happens, for the player: the act's beat, which fires whether or not anything is measured. */
  beat: string;
  /** Raw signals this verb always carries (C63: how much of a found pouch was taken, `taken01`). */
  raw?: Readonly<Record<string, number>>;
}

const v = (verb: Verb): Verb => verb;
const m = (cue: Measure["cue"], action: string, route: Measure["route"], abandon?: string): Measure => ({
  cue,
  channel: cue[0] as CueChannel,
  action,
  route,
  ...(abandon ? { abandon } : {}),
});

// ── the verbs ───────────────────────────────────────────────────────────────────

const SIT = v({ id: "sit", label: "Sit", holdS: 0, pose: "sit", reachM: 2.2, stakes: "low", measure: m("G5", "sit_still", "named"), effect: null, deed: null, owner: "none", beat: "You sit, and the place goes on around you." });
const REST_SHADE = v({ id: "rest", label: "Rest in the shade", holdS: 0, pose: "sit", reachM: 3, stakes: "low", measure: m("G5", "sit_still", "named"), effect: null, deed: null, owner: "none", beat: "You sit with your back to the trunk. The leaves move." });
const CLIMB = v({ id: "climb", label: "Climb", holdS: 3, pose: "climb", reachM: 2, stakes: "medium", measure: m("F3", "climb_hill", "named"), effect: null, deed: null, owner: "none", beat: "You climb. It is further down than it looked." });
const EXAMINE = v({ id: "examine", label: "Look closely", holdS: 2.5, pose: "study", reachM: 2.5, stakes: "low", measure: m("J6", "study_marker", "named"), effect: null, deed: null, owner: "none", beat: "You look closely. There is more to it than you thought." });
const PICK = (what: string, label = `Pick up the ${what}`, beat = `You pick up the ${what}.`) =>
  v({ id: "pick-up", label, holdS: 1.2, pose: "gather", reachM: 1.8, stakes: "low", measure: m("J3", "collect", "named"), effect: { kind: "taken", lastsDays: 5 }, deed: null, owner: "none", needs: "empty-handed", gives: what, beat });
const PUSH_THROUGH = v({ id: "push-through", label: "Push through", holdS: 2.5, pose: "push", reachM: 2, stakes: "medium", measure: m("F3", "push_through", "generic"), effect: null, deed: null, owner: "none", beat: "You push in. It scratches, and gives." });
const TOUCH = v({ id: "touch", label: "Touch it", holdS: 1, pose: "gather", reachM: 1.6, stakes: "low", measure: m("I3", "touch_novel", "unrouted"), effect: null, deed: null, owner: "none", beat: "You touch it." });

const TREE = [REST_SHADE, CLIMB, EXAMINE];
const ROCK = [SIT, CLIMB];
const PLANT = [EXAMINE, TOUCH];

/** Every scatter class, by id. A class missing here fails `affordances.test.ts`. */
const SCATTER: Record<string, Verb[]> = {
  conifer: TREE,
  broadleaf: TREE,
  "buttress-tree": TREE,
  "canopy-palm": TREE,
  acacia: TREE,
  "dead-tree": [CLIMB, PICK("dry branch", "Break off a dry branch", "It snaps off clean.")],
  "vine-tangle": [PUSH_THROUGH, EXAMINE],
  "fallen-log": [SIT, CLIMB],
  bromeliad: PLANT,
  thicket: [PUSH_THROUGH, EXAMINE],
  fern: PLANT,
  "berry-bush": [
    // The catalogue's F1 fork, as a bush: now, or kept for later.
    v({ id: "eat", label: "Eat the berries", holdS: 2, pose: "gather", reachM: 1.8, stakes: "low", measure: m("F1", "eat_now", "named"), effect: { kind: "taken", lastsDays: 3 }, deed: null, owner: "none", beat: "Sharp, and sweet after." }),
    v({ id: "keep", label: "Pick berries to keep", holdS: 3, pose: "gather", reachM: 1.8, stakes: "low", measure: m("F1", "save_berries", "generic"), effect: { kind: "taken", lastsDays: 3 }, deed: null, owner: "none", needs: "empty-handed", gives: "berries", beat: "You fill your hands for later." }),
  ],
  "grass-tuft": PLANT,
  "dead-shrub": [TOUCH, PICK("dry twigs", "Gather dry twigs", "A bundle of dry twigs.")],
  cactus: [TOUCH, EXAMINE],
  reeds: [EXAMINE, PICK("reed", "Cut a reed", "A long reed, still wet at the root.")],
  "moss-patch": [EXAMINE, SIT],
  boulder: ROCK,
  scree: [PICK("stone", "Pick up a stone", "A flat grey stone, cool in the hand."), CLIMB],
  "lichen-rock": [SIT, EXAMINE],
  "snow-drift": [
    v({ id: "play", label: "Make a snowball", holdS: 2, pose: "gather", reachM: 2, stakes: "low", measure: m("I2", "play_snow", "unrouted"), effect: null, deed: null, owner: "none", beat: "It packs well. Nobody to throw it at." }),
    SIT,
  ],
  "dune-ripple": [
    v({ id: "draw", label: "Draw in the sand", holdS: 4, pose: "kneel", reachM: 2.5, stakes: "low", measure: m("J4", "draw_in_sand", "unrouted"), effect: null, deed: null, owner: "none", beat: "You draw. The wind starts on it at once." }),
    SIT,
  ],
  driftwood: [SIT, v({ id: "pick-up", label: "Pick up the driftwood", holdS: 2, pose: "gather", reachM: 2, stakes: "low", measure: m("F5", "gather_driftwood", "named", "abandon_gather"), effect: { kind: "taken", lastsDays: 5 }, deed: null, owner: "none", needs: "empty-handed", gives: "driftwood", beat: "Salt-grey, lighter than it looks." })],
  shell: [PICK("shell", "Pick up the shell", "A whole shell, not a chip in it."), EXAMINE],
  tidepool: [EXAMINE, TOUCH],
  "shore-rock": ROCK,
};

/** Every village thing, and the people, and the water. */
const OTHERS: Record<VillageThing | OtherThing, Verb[]> = {
  house: [
    // When someone inside lies ill (C66, `fates.ts` decides when these are offered).
    v({ id: "fetch-healer", label: "Fetch the healer for them", holdS: 6, pose: "still", reachM: 3, stakes: "medium", measure: m("H9", "help_at_cost", "named"), effect: null, deed: { reading: "kindness", weight: 2 }, owner: "household", beat: "You bring the healer, who sits with them a long while." }),
    v({ id: "leave-herbs", label: "Leave herbs for them", holdS: 3, pose: "gather", reachM: 3, stakes: "low", measure: m("H9", "help_at_cost", "named"), effect: null, deed: { reading: "kindness", weight: 1 }, owner: "household", needs: "carrying", takes: ["herbs"], beat: "You leave the herbs with the family, and tell them how." }),
    v({ id: "knock", label: "Knock", holdS: 1.2, pose: "push", reachM: 2.2, stakes: "low", measure: m("G1", "knock_door", "generic"), effect: null, deed: { reading: "respect", weight: 1 }, owner: "household", beat: "You knock, and wait." }),
    v({ id: "peer-in", label: "Look in at the window", holdS: 2.5, pose: "study", reachM: 2.5, stakes: "medium", measure: m("H2", "peer_in_window", "unrouted"), effect: null, deed: { reading: "trespass", weight: 1 }, owner: "household", beat: "A table, a hearth, a coat on a peg. Someone's life." }),
    v({ id: "force-door", label: "Force the door", holdS: 5, pose: "push", reachM: 2.2, stakes: "high", measure: m("H5", "force_door", "unrouted", "back_off_door"), effect: { kind: "forced", lastsDays: 1 }, deed: { reading: "trespass", weight: 3 }, owner: "household", beat: "The bar splits. The door swings in on its own." }),
    v({ id: "give", label: "Leave what you carry at the door", holdS: 1.5, pose: "gather", reachM: 2.2, stakes: "low", measure: m("F7", "give_gift", "generic"), effect: null, deed: { reading: "kindness", weight: 2 }, owner: "household", needs: "carrying", beat: "You leave it on the step, where they will find it." }),
  ],
  ruin: [
    v({ id: "search", label: "Search the ruin", holdS: 4, pose: "gather", reachM: 3, stakes: "medium", measure: m("J6", "study_marker", "named"), effect: null, deed: null, owner: "none", beat: "A broken pot, a hinge. Whoever lived here left nothing." }),
    SIT,
  ],
  field: [
    v({ id: "tend", label: "Help weed the field", holdS: 6, pose: "dig", reachM: 3, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: { kind: "tended", lastsDays: 2 }, deed: { reading: "help", weight: 2 }, owner: "household", beat: "A row clean of weeds, and your back knows it." }),
    v({ id: "trample", label: "Trample the crop", holdS: 3, pose: "push", reachM: 3, stakes: "high", measure: m("H5", "trample_crop", "unrouted"), effect: { kind: "trampled", lastsDays: 3 }, deed: { reading: "harm", weight: 3 }, owner: "household", beat: "The stalks go down under you and do not get up." }),
    v({ id: "pick-up", label: "Take a handful", holdS: 1.5, pose: "gather", reachM: 3, stakes: "medium", measure: m("H5", "take_crop", "unrouted"), effect: null, deed: { reading: "theft", weight: 2 }, owner: "household", needs: "empty-handed", gives: "a handful of grain", beat: "A handful. Nobody will miss it, probably." }),
  ],
  bench: [
    SIT,
    v({ id: "lie", label: "Lie down for a while", holdS: 0, pose: "sit", reachM: 2.2, stakes: "low", measure: m("G5", "sit_still", "named"), effect: null, deed: null, owner: "none", beat: "The sky, and the sound of the well." }),
  ],
  well: [
    v({ id: "drink", label: "Draw water and drink", holdS: 3, pose: "build", reachM: 2.5, stakes: "low", measure: m("A5", "drink_water", "unrouted"), effect: null, deed: null, owner: "village", beat: "Cold enough to hurt your teeth." }),
    v({ id: "play", label: "Drop a pebble in", holdS: 1.5, pose: "gather", reachM: 2.5, stakes: "low", measure: m("I3", "drop_pebble", "unrouted"), effect: null, deed: null, owner: "village", beat: "A long time, and then a small sound." }),
  ],
  dock: [
    v({ id: "sit", label: "Sit at the end of the dock", holdS: 0, pose: "sit", reachM: 3, stakes: "low", measure: m("G5", "sit_still", "named"), effect: null, deed: null, owner: "village", beat: "Your feet over the water. The boats knock against the posts." }),
    v({ id: "fish", label: "Fish from the dock", holdS: 8, pose: "still", reachM: 3, stakes: "low", measure: m("F5", "fish_from_dock", "unrouted"), effect: null, deed: null, owner: "village", beat: "Nothing, and then nothing, and then a tug." }),
  ],
  boat: [
    v({ id: "board", label: "Take the boat out", holdS: 1.5, pose: "climb", reachM: 3.5, stakes: "high", measure: m("H5", "take_boat", "unrouted"), effect: { kind: "taken", lastsDays: 0 }, deed: { reading: "theft", weight: 2 }, owner: "household", beat: "It rocks as you step in. Nobody said you could." }),
    v({ id: "bail", label: "Bail it out for them", holdS: 5, pose: "dig", reachM: 3.5, stakes: "low", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: { reading: "help", weight: 1 }, owner: "household", beat: "The bilge water goes back to the sea, a scoop at a time." }),
    // Bringing back what you took is its own deed, and enough to make the taking good (C45).
    v({ id: "moor", label: "Bring the boat back", holdS: 2, pose: "sit", reachM: 6, stakes: "low", measure: m("H5", "return_boat", "unrouted"), effect: null, deed: { reading: "respect", weight: 2 }, owner: "household", needs: "aboard", beat: "You tie it where you found it, and the rope the way they tie it." }),
  ],
  grave: [
    v({ id: "respect", label: "Pay your respects", holdS: 4, pose: "kneel", reachM: 2, stakes: "low", measure: m("I7", "pay_respects", "unrouted"), effect: null, deed: { reading: "respect", weight: 1 }, owner: "household", beat: "You stand a while. The name on it is weathered." }),
    v({ id: "tidy", label: "Tidy the grave", holdS: 6, pose: "kneel", reachM: 2, stakes: "low", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: { kind: "tidied", lastsDays: 5 }, deed: { reading: "respect", weight: 2 }, owner: "household", beat: "You pull the grass back from the stone." }),
    v({ id: "trample", label: "Walk over the grave", holdS: 1, pose: "still", reachM: 1.5, stakes: "medium", measure: m("H4", "walk_over_grave", "unrouted"), effect: null, deed: { reading: "disrespect", weight: 2 }, owner: "household", beat: "You walk across it as if it were ground." }),
  ],
  mine: [
    v({ id: "work", label: "Work a shift", holdS: 10, pose: "dig", reachM: 5, stakes: "medium", measure: m("C11", "work_shift", "named", "shirk_work"), effect: { kind: "worked", lastsDays: 1 }, deed: { reading: "help", weight: 2 }, owner: "village", beat: "The pick, the stone, the pick. Your hands will remember it." }),
    v({ id: "pick-up", label: "Take a lump of ore", holdS: 2, pose: "gather", reachM: 5, stakes: "medium", measure: m("H5", "take_ore", "unrouted"), effect: null, deed: { reading: "theft", weight: 2 }, owner: "village", needs: "empty-handed", gives: "ore", beat: "Heavy for its size. It is theirs." }),
    v({ id: "enter", label: "Go a little way inside", holdS: 4, pose: "study", reachM: 5, stakes: "high", measure: m("F3", "enter_cave", "named", "stay_safe"), effect: null, deed: null, owner: "none", beat: "Dark, and colder with every step, and somewhere water." }),
  ],
  villager: [
    // A fisher set on going out under a wrong sky (C66, `fates.ts` decides when this is offered).
    v({ id: "ask-ashore", label: "Ask them to stay ashore", holdS: 2.5, pose: "still", reachM: 2.5, stakes: "medium", measure: m("H9", "help_at_cost", "named"), effect: null, deed: { reading: "kindness", weight: 2 }, owner: "household", beat: "You talk them out of it. They are not pleased, but they will stay in." }),
    v({ id: "talk", label: "Talk", holdS: 0, pose: "still", reachM: 7, stakes: "low", measure: m("G1", "initiate", "generic"), effect: null, deed: null, owner: "none", beat: "" }),
    v({ id: "give", label: "Give what you carry", holdS: 1, pose: "gather", reachM: 3, stakes: "low", measure: m("F7", "give_gift", "generic"), effect: null, deed: { reading: "kindness", weight: 2 }, owner: "household", needs: "carrying", beat: "They take it, surprised." }),
    // Barter and labour (C58), with no price anywhere: the villager takes what they want or need, or
    // takes it from someone they like, and gives what their own work leaves them to spare
    // (`trade.ts`). Done through the trade route, never the act route, because something comes back.
    v({ id: "trade", label: "Offer it in trade", holdS: 1.5, pose: "gather", reachM: 3, stakes: "low", measure: m("F9", "barter", "generic"), effect: null, deed: { reading: "respect", weight: 1 }, owner: "household", needs: "carrying", beat: "" }),
    v({ id: "ask-back", label: "Ask for something for your help", holdS: 1, pose: "still", reachM: 3, stakes: "low", measure: m("G12", "ask_return", "unrouted"), effect: null, deed: { reading: "respect", weight: 1 }, owner: "household", beat: "" }),
  ],
  // C55. A dog: the one creature here a stranger can make a friend of. D11 is the catalogue's pet cue,
  // which ingest.py reads into `pet_attach` by its amount (`acts.ts` sends the bond as it).
  dog: [
    v({ id: "stroke", label: "Stroke the dog", holdS: 3, pose: "kneel", reachM: 1.8, stakes: "low", measure: m("D11", "warm_to_pet", "generic"), effect: null, deed: { reading: "kindness", weight: 1 }, owner: "household", beat: "It leans into your hand." }),
    v({ id: "feed", label: "Give it something to eat", holdS: 1.5, pose: "kneel", reachM: 1.8, stakes: "low", measure: m("D11", "warm_to_pet", "generic"), effect: null, deed: { reading: "kindness", weight: 1 }, owner: "household", needs: "carrying", takes: ["berries", "a handful of grain", "fish", "bread", "cheese"], beat: "Gone in a moment, and it looks for more." }),
    v({ id: "play", label: "Play with it", holdS: 4, pose: "gather", reachM: 2.5, stakes: "low", measure: m("D11", "warm_to_pet", "generic"), effect: null, deed: { reading: "kindness", weight: 1 }, owner: "household", beat: "It runs rings round you, and comes back for more." }),
    v({ id: "shoo", label: "Shoo it away", holdS: 1, pose: "push", reachM: 2.5, stakes: "low", measure: m("D11", "shoo_pet", "generic"), effect: null, deed: { reading: "disrespect", weight: 1 }, owner: "household", beat: "It backs off, and watches you from further away." }),
  ],
  goat: [
    v({ id: "scratch", label: "Scratch its head", holdS: 2.5, pose: "kneel", reachM: 1.8, stakes: "low", measure: m("D11", "warm_to_pet", "generic"), effect: null, deed: null, owner: "household", beat: "It pushes back against your fingers, and then tries to eat your sleeve." }),
    v({ id: "chase", label: "Chase the goats", holdS: 2, pose: "push", reachM: 3, stakes: "medium", measure: m("H5", "chase_animals", "unrouted"), effect: null, deed: { reading: "harm", weight: 1 }, owner: "household", beat: "They scatter, bleating, and the herder will hear of it." }),
  ],
  hen: [
    v({ id: "feed", label: "Scatter grain for them", holdS: 2, pose: "gather", reachM: 2.5, stakes: "low", measure: m("F7", "feed_hens", "generic"), effect: null, deed: { reading: "kindness", weight: 1 }, owner: "household", needs: "carrying", takes: ["a handful of grain", "berries"], beat: "They come at a run, and peck round your feet." }),
    v({ id: "chase", label: "Chase the hens", holdS: 1.5, pose: "push", reachM: 2.5, stakes: "medium", measure: m("H5", "chase_animals", "unrouted"), effect: null, deed: { reading: "harm", weight: 1 }, owner: "household", beat: "Feathers, and a great deal of noise." }),
  ],
  // C59. A house of your own, on your own parcel (`homes.ts`), through the home route, never the act
  // route: it changes a house, not the shared world. Building is time at a structure, which
  // ingest.py's dwell branch reads as ts_build; the customising (J1) and the arranging (J5) are the
  // catalogue's, and what the arrangement says is read off the whole room when you step out.
  land: [
    v({ id: "stake", label: "Mark out a house here", holdS: 3, pose: "dig", reachM: 1, stakes: "medium", measure: m("F6", "stake_home", "unrouted"), effect: null, deed: null, owner: "none", beat: "Four stakes and a string. It is a start." }),
  ],
  home: [
    v({ id: "build", label: "Work on the house", holdS: 10, pose: "build", reachM: 4, stakes: "medium", measure: m("F6", "build_home", "generic"), effect: null, deed: null, owner: "none", beat: "" }),
    v({ id: "paint-door", label: "Paint the door", holdS: 4, pose: "build", reachM: 3, stakes: "low", measure: m("J1", "customize_home", "unrouted"), effect: null, deed: null, owner: "none", needs: "carrying", takes: DYE_ITEMS, beat: "" }),
    v({ id: "paint-walls", label: "Paint the walls", holdS: 6, pose: "build", reachM: 4, stakes: "low", measure: m("J1", "customize_home", "unrouted"), effect: null, deed: null, owner: "none", needs: "carrying", takes: DYE_ITEMS, beat: "" }),
    v({ id: "dress", label: "Dye your shirt", holdS: 5, pose: "gather", reachM: 4, stakes: "low", measure: m("J1", "customize_self", "unrouted"), effect: null, deed: null, owner: "none", needs: "carrying", takes: DYE_ITEMS, beat: "" }),
    v({ id: "place-square", label: "Set it down square", holdS: 1, pose: "kneel", reachM: 4, stakes: "low", measure: m("J5", "place_square", "unrouted"), effect: null, deed: null, owner: "none", needs: "carrying", takes: PLACEABLE_ITEMS, beat: "" }),
    v({ id: "place-loose", label: "Set it down as it is", holdS: 1, pose: "kneel", reachM: 4, stakes: "low", measure: m("J5", "place_loose", "unrouted"), effect: null, deed: null, owner: "none", needs: "carrying", takes: PLACEABLE_ITEMS, beat: "" }),
  ],
  // What the director sets out (C63, `director.ts`): the island's private probes, in the new world,
  // under the labels ingest.py already reads them by. Walking past the gull or the mark is measured
  // too, by the director's own layer: `pass_by`, and the mark's refusal twin.
  "netted-gull": [
    v({ id: "free", label: "Free the gull", holdS: 6, pose: "kneel", reachM: 2, stakes: "medium", measure: m("H9", "help_at_cost", "named", "abandon_free_gull"), effect: null, deed: null, owner: "none", beat: "You work the net loose. It is gone before you stand." }),
  ],
  "lost-pouch": [
    v({ id: "leave", label: "Leave it closed, for its owner", holdS: 1.5, pose: "gather", reachM: 1.8, stakes: "medium", measure: m("H2", "return_cache", "named"), effect: null, deed: null, owner: "household", beat: "You set it where it will be seen, and leave it shut." }),
    v({ id: "take-little", label: "Take a little from it", holdS: 2, pose: "gather", reachM: 1.8, stakes: "medium", measure: m("H2", "keep_cache", "named", "abandon_take_cache"), effect: null, deed: null, owner: "household", needs: "empty-handed", gives: "shell", raw: { taken01: 0.25 }, beat: "A shell or two. It hardly shows." }),
    v({ id: "take-all", label: "Take what is in it", holdS: 2.5, pose: "gather", reachM: 1.8, stakes: "high", measure: m("H2", "keep_cache", "named", "abandon_take_cache"), effect: null, deed: null, owner: "household", needs: "empty-handed", gives: "knife", raw: { taken01: 1 }, beat: "A good knife, and nothing else worth having." }),
  ],
  "carved-mark": [
    v({ id: "look", label: "Look closer", holdS: 2.5, pose: "study", reachM: 2.2, stakes: "low", measure: m("I3", "egg_hollow", "named"), effect: null, deed: null, owner: "none", beat: "A spiral, cut long ago, and something like a word under it." }),
  ],
  "dark-cleft": [
    v({ id: "go-in", label: "Go in", holdS: 4, pose: "push", reachM: 2.2, stakes: "high", measure: m("F3", "enter_cave", "named", "stay_safe"), effect: null, deed: null, owner: "none", beat: "It is colder in here, and quieter, and goes back further than you can see." }),
    v({ id: "stay-out", label: "Leave it be", holdS: 0.8, pose: "still", reachM: 2.6, stakes: "medium", measure: m("F3", "stay_safe", "named"), effect: null, deed: null, owner: "none", beat: "You leave it to the dark." }),
  ],
  // The pilot's six (C75, `director.ts`): a classic paradigm each, with the world's own stakes. People are
  // `household`-owned so the act is read with a stranger as its counterpart. What is given or risked
  // comes out of the pack (`spends`), and what comes back is the director route's to say.
  "hungry-stranger": [
    // The dictator game: of three loaves, how many. Walking past is giving none (`passed`).
    v({ id: "give-one", label: "Give them a loaf", holdS: 1.5, pose: "gather", reachM: 2.6, stakes: "medium", measure: m("F7", "give_gift", "generic"), effect: null, deed: null, owner: "household", spends: { item: "bread", count: 1 }, raw: { amount: 0.333 }, beat: "They take it in both hands, and say nothing for a moment." }),
    v({ id: "give-two", label: "Give them two loaves", holdS: 1.8, pose: "gather", reachM: 2.6, stakes: "medium", measure: m("F7", "give_gift", "generic"), effect: null, deed: null, owner: "household", spends: { item: "bread", count: 2 }, raw: { amount: 0.667 }, beat: "Two. They look at you as if to ask whether you are sure." }),
    v({ id: "give-all", label: "Give them all your bread", holdS: 2, pose: "gather", reachM: 2.6, stakes: "high", measure: m("F7", "give_gift", "generic"), effect: null, deed: null, owner: "household", spends: { item: "bread", count: 3 }, raw: { amount: 1 }, beat: "All of it. You will be hungry on the water." }),
  ],
  "raft-borrower": [
    // The trust game: lend what you need to someone who could keep it. No route reads trust yet (C7):
    // it is recorded, and moves nothing, until W has a direction for it (cue-catalog G16).
    v({ id: "lend", label: "Lend them your raft", holdS: 2, pose: "gather", reachM: 2.8, stakes: "high", measure: m("G16", "lend_raft", "unrouted"), effect: null, deed: null, owner: "household", spends: { item: "raft", count: 1 }, beat: "They drag it down to the water, and wave once." }),
    v({ id: "keep", label: "Say no", holdS: 0.8, pose: "still", reachM: 3, stakes: "medium", measure: m("G16", "keep_raft", "unrouted"), effect: null, deed: null, owner: "household", beat: "They nod, and go on looking along the shore." }),
  ],
  "tide-fisher": [
    // A risk choice with the mean held fixed: two fish on average whichever you take (`pilot.ts`).
    v({ id: "bet-safe", label: "Take two fish now", holdS: 1.2, pose: "gather", reachM: 2.8, stakes: "medium", measure: m("F3", "tide_wager", "generic"), effect: null, deed: null, owner: "household", raw: { variance: 0 }, beat: "" }),
    v({ id: "bet-even", label: "Bet: three fish or one", holdS: 1.2, pose: "gather", reachM: 2.8, stakes: "medium", measure: m("F3", "tide_wager", "generic"), effect: null, deed: null, owner: "household", raw: { variance: 0.25 }, beat: "" }),
    v({ id: "bet-long", label: "Bet big: four fish or none", holdS: 1.2, pose: "gather", reachM: 2.8, stakes: "high", measure: m("F3", "tide_wager", "generic"), effect: null, deed: null, owner: "household", raw: { variance: 1 }, beat: "" }),
  ],
  "seed-offer": [
    // Delay discounting: a handful now, or three tomorrow.
    v({ id: "now", label: "Take a handful of grain now", holdS: 1.5, pose: "gather", reachM: 2.4, stakes: "medium", measure: m("F1", "eat_now", "named"), effect: null, deed: null, owner: "household", needs: "empty-handed", gives: "a handful of grain", beat: "A handful now. It is good grain." }),
    v({ id: "plant", label: "Plant the seed for later", holdS: 4, pose: "dig", reachM: 2.4, stakes: "medium", measure: m("F1", "plant_seed", "named"), effect: null, deed: null, owner: "household", beat: "You press it into the soil. It will be up by tomorrow." }),
  ],
  "overgrown-path": [
    v({ id: "follow", label: "Follow the overgrown path", holdS: 3, pose: "push", reachM: 2.6, stakes: "medium", measure: m("I3", "enter_unmarked", "named"), effect: null, deed: null, owner: "none", beat: "Brambles, then a narrow way, then a clearing nobody seems to know, and the whole bay below it." }),
  ],
  "lone-traveler": [
    v({ id: "greet", label: "Go and say hello", holdS: 2, pose: "still", reachM: 3.2, stakes: "low", measure: m("G1", "initiate", "generic"), effect: null, deed: null, owner: "household", beat: "They look up, surprised, and make room by the fire." }),
  ],
  // Moments (C86, `moments.ts`): something small happening near the stranger, a classic paradigm in the
  // world's clothes, under the labels ingest.py already reads. Walking past one is measured by the moments
  // layer, as each names (`pass_by`, `withdraw`, `deviate_custom`, `group_avoid`).
  "spilled-basket": [
    v({ id: "help", label: "Help gather the apples", holdS: 4, pose: "gather", reachM: 2.8, stakes: "low", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "You gather them back into her basket. She laughs, and thanks you twice." }),
  ],
  "stuck-cart": [
    v({ id: "push", label: "Put your shoulder to the wheel", holdS: 6, pose: "push", reachM: 3, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "It rocks, sticks, and then rolls free. The carter claps you on the back." }),
  ],
  "ball-game": [
    // Cyberball, in a field: the ball is yours to throw, and one of them never gets it.
    v({ id: "to-alone", label: "Throw it to the one on their own", holdS: 1, pose: "gather", reachM: 3, stakes: "low", measure: m("G2", "include_marginal", "named"), effect: null, deed: null, owner: "household", beat: "The child on their own catches it, and the game is three now." }),
    v({ id: "to-others", label: "Throw it back to the others", holdS: 1, pose: "gather", reachM: 3, stakes: "low", measure: m("G2", "ignore_marginal", "named"), effect: null, deed: null, owner: "household", beat: "They are off again. The one on their own goes on watching." }),
  ],
  "stray-ball": [
    v({ id: "laugh", label: "Laugh it off, and roll it back", holdS: 1.2, pose: "gather", reachM: 3.2, stakes: "low", measure: m("G10", "forgive", "named"), effect: null, deed: null, owner: "household", beat: "The child grins with relief and runs to get it." }),
    v({ id: "scold", label: "Tell them to watch where they throw", holdS: 1.2, pose: "still", reachM: 3.2, stakes: "low", measure: m("G10", "retaliate", "named"), effect: null, deed: null, owner: "household", beat: "The child looks at the ground, picks up the ball, and goes." }),
  ],
  "well-custom": [
    v({ id: "touch", label: "Touch the rim, as they do", holdS: 1.5, pose: "gather", reachM: 2.8, stakes: "low", measure: m("H4", "conform_custom", "named"), effect: null, deed: null, owner: "none", beat: "The stone is worn smooth where the hands go." }),
  ],
  "well-queue": [
    v({ id: "wait", label: "Wait your turn", holdS: 2.5, pose: "still", reachM: 3.2, stakes: "low", measure: m("H1", "wait_in_queue", "named"), effect: null, deed: null, owner: "household", beat: "The line moves along. Someone ahead nods to you." }),
    v({ id: "cut", label: "Go straight to the front", holdS: 1.2, pose: "still", reachM: 3.2, stakes: "low", measure: m("H1", "cut_queue", "named"), effect: null, deed: null, owner: "household", beat: "Someone mutters behind you. Nobody says anything aloud." }),
  ],
  "village-dance": [
    v({ id: "join", label: "Join the dance", holdS: 3, pose: "still", reachM: 3.6, stakes: "low", measure: m("G4", "group_join", "named"), effect: null, deed: null, owner: "household", beat: "Two hands find yours, and the ring takes you round." }),
    v({ id: "watch", label: "Stand and watch", holdS: 3, pose: "still", reachM: 3.6, stakes: "low", measure: m("G4", "group_observe", "named"), effect: null, deed: null, owner: "household", beat: "You stand at the edge and watch them go round." }),
  ],
  "loose-hen": [
    v({ id: "catch", label: "Help her catch the hen", holdS: 3.5, pose: "gather", reachM: 3, stakes: "low", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "You corner it between you. She tucks it under her arm, laughing in the dark." }),
  ],
  "falling-stars": [
    v({ id: "watch-sky", label: "Stop and watch the sky", holdS: 4, pose: "still", reachM: 1, stakes: "low", measure: m("J2", "gaze_reflection", "named"), effect: null, deed: null, owner: "none", beat: "One, then another, then three at once, falling into the sea." }),
  ],
  "banging-door": [
    v({ id: "shut", label: "Pull the door shut", holdS: 1.5, pose: "push", reachM: 2.6, stakes: "low", measure: m("J5", "stack_tidy", "named"), effect: null, deed: null, owner: "household", beat: "It catches, and the house goes quiet." }),
  ],
  // A village that is never empty (C87, `moments.ts`): each a published experiment in the village's clothes,
  // under a label ingest.py reads by name (C7), and none a label of the pilot's six. Walking past one is
  // measured by the moments layer, as each names.
  "fallen-elder": [
    // The bystander effect: the same old man, with two onlookers standing by or nobody (the arm).
    v({ id: "help-up", label: "Help him to his feet", holdS: 3, pose: "kneel", reachM: 2.6, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "He leans on you and gets up, and tries the ankle. \"It will hold. Thank you.\"" }),
  ],
  "asch-boats": [
    // Asch: the red boat is plainly the shorter, and they are all sure it is the longer (or one of them is not).
    v({ id: "agree", label: "Agree, the red one", holdS: 1.2, pose: "still", reachM: 3.4, stakes: "low", measure: m("H3", "conform_custom", "named"), effect: null, deed: null, owner: "household", beat: "They nod, satisfied, and go back to their nets." }),
    v({ id: "differ", label: "Say the blue one is longer", holdS: 1.2, pose: "still", reachM: 3.4, stakes: "low", measure: m("H3", "deviate_custom", "named"), effect: null, deed: null, owner: "household", beat: "They look at the boats again. One of them shrugs." }),
  ],
  "looking-up": [
    v({ id: "look-up", label: "Stop and look up with them", holdS: 2, pose: "still", reachM: 4.2, stakes: "low", measure: m("H3", "conform_custom", "named"), effect: null, deed: null, owner: "none", beat: "You look where they look. A stork, building on the roof, one stick at a time." }),
  ],
  teasing: [
    v({ id: "laugh", label: "Laugh along", holdS: 1, pose: "still", reachM: 3.8, stakes: "low", measure: m("D9", "join_exclusion", "named"), effect: null, deed: null, owner: "household", beat: "They laugh louder. The small one looks at the ground." }),
    v({ id: "stop", label: "Tell them to leave him be", holdS: 1.5, pose: "still", reachM: 3.8, stakes: "medium", measure: m("D3", "asserts", "named"), effect: null, deed: null, owner: "household", beat: "They mutter, and drift off. The small one picks up his kite." }),
    v({ id: "stand-by", label: "Go and stand by the small one", holdS: 2, pose: "still", reachM: 3.8, stakes: "medium", measure: m("G1", "include_marginal", "named"), effect: null, deed: null, owner: "household", beat: "You stand by him. Soon they find something else to do." }),
  ],
  "imece-wall": [
    // Communal work (imece), and how hard one works in a crew of four or beside one old man (the arm).
    v({ id: "lend-hand", label: "Lend a hand with the wall", holdS: 10, pose: "build", reachM: 3.4, stakes: "medium", measure: m("C11", "work_shift", "named", "shirk_work"), effect: null, deed: null, owner: "household", beat: "Stone by stone, hand to hand. The wall stands a row higher." }),
  ],
  "net-haul": [
    // Social loafing: one fisher alone at the rope, or three (the arm); how long you pull is how hard you worked.
    v({ id: "haul", label: "Take hold of the rope and pull", holdS: 8, pose: "push", reachM: 3.4, stakes: "medium", measure: m("C11", "work_shift", "named", "shirk_work"), effect: null, deed: null, owner: "household", beat: "It comes in heavy and silver, up onto the sand. Someone claps you on the shoulder." }),
  ],
  musician: [
    v({ id: "listen", label: "Sit and listen", holdS: 0, pose: "sit", reachM: 4.6, stakes: "low", measure: m("J2", "gaze_reflection", "named"), effect: null, deed: null, owner: "none", beat: "The tune goes on, and you stay for it." }),
  ],
  "wrong-basket": [
    v({ id: "not-mine", label: "Tell her it is not for you", holdS: 1.2, pose: "still", reachM: 3.2, stakes: "medium", measure: m("H2", "return_cache", "named"), effect: null, deed: null, owner: "household", beat: "She laughs at herself, and looks round for the right one." }),
    v({ id: "take-it", label: "Take it anyway", holdS: 1.2, pose: "gather", reachM: 3.2, stakes: "high", measure: m("H2", "keep_cache", "named"), effect: null, deed: null, owner: "household", raw: { taken01: 1 }, beat: "A basket of fish, meant for somebody else." }),
  ],
  "tea-invite": [
    v({ id: "sit-tea", label: "Sit down with her for tea", holdS: 0, pose: "sit", reachM: 3.2, stakes: "low", measure: m("G1", "group_join", "named"), effect: null, deed: null, owner: "household", beat: "Tea in a small glass, too hot to hold. She tells you about her sons." }),
    v({ id: "thank", label: "Thank her, and go on", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("E4", "close_graceful", "named"), effect: null, deed: null, owner: "household", beat: "\"Another time, then.\" She waves you on." }),
  ],
  "tangled-net": [
    // Persistence: as long as you keep at it (the knots slip back now and then), and it is read by how long.
    v({ id: "untangle", label: "Help him untangle it", holdS: 9, pose: "gather", reachM: 3.2, stakes: "medium", measure: m("G8", "repair", "named"), effect: null, deed: null, owner: "household", beat: "Knot after knot, and at last it lies flat." }),
  ],
  "bread-errand": [
    // A promise: to take the loaf to her mother's door. Kept there (`bread-mother`), or broken by never coming.
    v({ id: "take", label: "Take the bread to her mother", holdS: 1.5, pose: "gather", reachM: 3.2, stakes: "medium", measure: m("G7", "promise_made", "named"), effect: null, deed: null, owner: "household", beat: "\"The house just along there. She will be waiting.\"" }),
  ],
  "bread-mother": [
    v({ id: "give-bread", label: "Give her the bread", holdS: 1.2, pose: "gather", reachM: 3, stakes: "low", measure: m("G7", "promise_kept", "named"), effect: null, deed: null, owner: "household", beat: "She takes it in both hands, and asks after her daughter." }),
  ],
  "drunk-or-ill": [
    // Piliavin: the same man on the path, with a cane beside him or a bottle (the arm).
    v({ id: "help-home", label: "Help him home", holdS: 4, pose: "kneel", reachM: 2.6, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "You get him up. He leans on you most of the way, and thanks you at his door." }),
  ],
  campfire: [
    v({ id: "sit-fire", label: "Sit down by the fire", holdS: 0, pose: "sit", reachM: 3.8, stakes: "low", measure: m("G1", "group_join", "named"), effect: null, deed: null, owner: "household", beat: "Someone shifts along to make room. The story goes on." }),
    v({ id: "listen-edge", label: "Stand at the edge and listen", holdS: 3, pose: "still", reachM: 4.4, stakes: "low", measure: m("A4", "group_observe", "named"), effect: null, deed: null, owner: "household", beat: "You listen from the dark, just outside the light." }),
  ],
  "crying-alone": [
    v({ id: "sit-with", label: "Sit with her a while", holdS: 5, pose: "sit", reachM: 3, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "She does not say what it is. After a while she wipes her eyes and thanks you." }),
  ],
  dolphins: [
    v({ id: "watch", label: "Stop and watch them", holdS: 4, pose: "still", reachM: 1, stakes: "low", measure: m("J2", "gaze_reflection", "named"), effect: null, deed: null, owner: "none", beat: "They come up together, and go under, and come up again further out." }),
  ],
  greeting: [
    // Courtesy across status: the same greeting from the headman, a water-carrier, or anybody (the arm).
    v({ id: "greet-warm", label: "Greet them warmly", holdS: 1, pose: "still", reachM: 3.6, stakes: "low", measure: m("G2", "opener_warm", "named"), effect: null, deed: null, owner: "household", beat: "They smile, and say something kind about the weather." }),
    v({ id: "nod", label: "Nod back", holdS: 0.6, pose: "still", reachM: 3.6, stakes: "low", measure: m("G3", "opener_neutral", "named"), effect: null, deed: null, owner: "household", beat: "A nod for a nod." }),
  ],
  "rude-bump": [
    v({ id: "sorry", label: "Say sorry anyway", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("G8", "cold_response_deescalate", "named"), effect: null, deed: null, owner: "household", beat: "He grunts, and goes on." }),
    v({ id: "back", label: "Tell him to watch where he is going", holdS: 1, pose: "still", reachM: 3.2, stakes: "medium", measure: m("D8", "cold_response_persist", "named"), effect: null, deed: null, owner: "household", beat: "He stops, glares, and thinks better of it." }),
  ],
  "narrow-way": [
    v({ id: "aside", label: "Step aside for her", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("H2", "let_others_ahead", "named"), effect: null, deed: null, owner: "household", beat: "She edges past with her jugs, and thanks you." }),
    v({ id: "first", label: "Keep to your way", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("D3", "asserts", "named"), effect: null, deed: null, owner: "household", beat: "She steps off the path to let you by." }),
  ],
  "ask-way": [
    v({ id: "walk", label: "Walk them to the harbour", holdS: 1.5, pose: "still", reachM: 3.6, stakes: "medium", measure: m("H9", "help_at_cost", "named"), effect: null, deed: null, owner: "household", beat: "\"This way.\" They fall in beside you." }),
    v({ id: "point", label: "Point the way", holdS: 1, pose: "still", reachM: 3.6, stakes: "low", measure: m("G15", "transact_neutral", "named"), effect: null, deed: null, owner: "household", beat: "They thank you, and set off the way you pointed." }),
  ],
  "heavy-jugs": [
    v({ id: "carry", label: "Carry a jug for her", holdS: 1.5, pose: "gather", reachM: 3.2, stakes: "medium", measure: m("H9", "help_at_cost", "named"), effect: null, deed: null, owner: "household", beat: "It is heavier than it looked. She walks beside you, talking." }),
  ],
  "dark-lantern": [
    v({ id: "walk", label: "Walk her to her door", holdS: 1.5, pose: "still", reachM: 3.2, stakes: "medium", measure: m("H9", "help_at_cost", "named"), effect: null, deed: null, owner: "household", beat: "She takes your arm in the dark." }),
  ],
  "lost-purse": [
    // Civic honesty (Cohn et al. 2019): two coins in it, or nine (the arm).
    v({ id: "leave", label: "Set it on the wall for whoever lost it", holdS: 1.5, pose: "gather", reachM: 1.9, stakes: "medium", measure: m("H2", "return_cache", "named"), effect: null, deed: null, owner: "household", beat: "You set it up where it will be seen, and leave it shut." }),
    v({ id: "take-one", label: "Take a coin", holdS: 1.5, pose: "gather", reachM: 1.9, stakes: "medium", measure: m("H2", "keep_cache", "named", "abandon_take_cache"), effect: null, deed: null, owner: "household", raw: { taken01: 0.25 }, beat: "One coin. It hardly shows." }),
    v({ id: "take-all", label: "Take the coins", holdS: 2, pose: "gather", reachM: 1.9, stakes: "high", measure: m("H2", "keep_cache", "named", "abandon_take_cache"), effect: null, deed: null, owner: "household", raw: { taken01: 1 }, beat: "The purse is light now." }),
  ],
  "open-gate": [
    v({ id: "shut-gate", label: "Shut the gate", holdS: 1.5, pose: "push", reachM: 2.6, stakes: "low", measure: m("H3", "conform_custom", "named"), effect: null, deed: null, owner: "household", beat: "The latch drops. The goats will stay where they are." }),
  ],
  litter: [
    v({ id: "tidy", label: "Put it in the basket by the wall", holdS: 2, pose: "gather", reachM: 2.4, stakes: "low", measure: m("J5", "stack_tidy", "named"), effect: null, deed: null, owner: "none", beat: "Into the basket by the wall." }),
  ],
  "caught-lamb": [
    v({ id: "free-lamb", label: "Free the lamb", holdS: 4, pose: "kneel", reachM: 2.4, stakes: "medium", measure: m("H9", "help_at_cost", "named", "pass_by"), effect: null, deed: null, owner: "household", beat: "It pulls its head free and bolts for its mother." }),
  ],
  woodpile: [
    v({ id: "stack", label: "Stack the logs back neatly", holdS: 6, pose: "build", reachM: 2.8, stakes: "low", measure: m("J5", "stack_tidy", "named"), effect: null, deed: null, owner: "household", beat: "Square at the ends, the way a woodpile should be." }),
  ],
  "bench-sit": [
    // Personal space: beside someone already on the bench, or as far from them as the bench allows.
    v({ id: "sit-close", label: "Sit down beside them", holdS: 0, pose: "sit", reachM: 3, stakes: "low", measure: m("A1", "proxemics_close", "named"), effect: null, deed: null, owner: "household", beat: "You sit down beside them. They shift a little, and nod." }),
    v({ id: "sit-far", label: "Sit at the far end", holdS: 0, pose: "sit", reachM: 3, stakes: "low", measure: m("A3", "proxemics_far", "named"), effect: null, deed: null, owner: "household", beat: "You take the far end. The bench is long enough for two strangers." }),
  ],
  "unfinished-tale": [
    // Curiosity paid for in time: he has stopped just before the end, to light his pipe. Asking is the read.
    v({ id: "ask-end", label: "Ask him how it ends", holdS: 1.2, pose: "still", reachM: 4.4, stakes: "low", measure: m("D2", "asks_question", "named"), effect: null, deed: null, owner: "household", beat: "He laughs, and tells you the end." }),
  ],
  knucklebones: [
    // Lying for gain: the throw is not tava. Seen by the children, or under the cup where only you saw it (the arm).
    v({ id: "say-true", label: "Tell them it is not tava", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("H2", "return_cache", "named"), effect: null, deed: null, owner: "household", beat: "\"Again!\" They take the cup back, and throw for it themselves." }),
    v({ id: "say-tava", label: "Say it is tava", holdS: 1, pose: "still", reachM: 3.2, stakes: "low", measure: m("H2", "keep_cache", "named"), effect: null, deed: null, owner: "household", raw: { taken01: 1 }, beat: "They hand you the pomegranate, a little doubtful." }),
  ],
  "honey-stall": [
    // An honesty stall (Levitt 2006), with a nazar charm over it or none (watching eyes; the arm).
    v({ id: "one-jar", label: "Take one jar, as the board shows", holdS: 1.2, pose: "gather", reachM: 2.6, stakes: "low", measure: m("H3", "conform_custom", "named"), effect: null, deed: null, owner: "household", beat: "One jar. The honey is dark, and smells of thyme." }),
    v({ id: "three-jars", label: "Take three jars", holdS: 1.8, pose: "gather", reachM: 2.6, stakes: "medium", measure: m("H2", "keep_cache", "named"), effect: null, deed: null, owner: "household", raw: { taken01: 0.67 }, beat: "Three jars. Nobody is minding the stall." }),
  ],
  // Hidden things (C86): the village's own, found once each. What is found is the moments layer's to say.
  "hollow-stump": [
    v({ id: "look-in", label: "Look inside the hollow", holdS: 2, pose: "study", reachM: 2.2, stakes: "low", measure: m("I3", "egg_hollow", "named"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  "message-bottle": [
    v({ id: "read", label: "Read the note inside", holdS: 4, pose: "study", reachM: 2.2, stakes: "low", measure: m("J6", "study_marker", "named"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  "still-pool": [
    v({ id: "look", label: "Look at your reflection", holdS: 3, pose: "kneel", reachM: 2.6, stakes: "low", measure: m("J2", "egg_reflection", "named"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  "lookout-rock": [
    v({ id: "look-out", label: "Climb up and look out", holdS: 3, pose: "climb", reachM: 2.8, stakes: "low", measure: m("I3", "egg_horizon_seen", "named"), effect: null, deed: null, owner: "none", beat: "" }),
    v({ id: "sit", label: "Sit and watch the sea", holdS: 0, pose: "sit", reachM: 2.8, stakes: "low", measure: m("J2", "gaze_reflection", "named"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  "buried-box": [
    v({ id: "dig", label: "Dig where the earth is soft", holdS: 5, pose: "dig", reachM: 2.2, stakes: "low", measure: m("C7", "dig_cache", "named", "abandon_build"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  furnishing: [
    v({ id: "lift", label: "Pick it up", holdS: 1, pose: "gather", reachM: 1.6, stakes: "low", measure: m("J5", "lift_furnishing", "unrouted"), effect: null, deed: null, owner: "none", beat: "" }),
    v({ id: "turn", label: "Turn it", holdS: 1, pose: "push", reachM: 1.6, stakes: "low", measure: m("J5", "turn_furnishing", "unrouted"), effect: null, deed: null, owner: "none", beat: "" }),
  ],
  water: [
    v({ id: "wade", label: "Wade in", holdS: 2, pose: "still", reachM: 3, stakes: "low", measure: m("I3", "wade_in", "unrouted"), effect: null, deed: null, owner: "none", beat: "Colder than you meant it to be." }),
    v({ id: "play", label: "Skip a stone", holdS: 1.5, pose: "gather", reachM: 3, stakes: "low", measure: m("I2", "skip_stone", "unrouted"), effect: null, deed: null, owner: "none", beat: "Three, four… five." }),
  ],
};

/** The verbs a kind of thing affords, or an empty list for a kind nobody has described yet. */
export function verbsOf(kind: ThingKind): readonly Verb[] {
  return (OTHERS as Record<string, Verb[]>)[kind] ?? SCATTER[kind] ?? [];
}

/** Every kind the world can draw today: the coverage test's list, and nothing is exempt. */
export function allThingKinds(): ThingKind[] {
  return [...VILLAGE_THINGS, ...OTHER_THINGS, ...ASSET_CLASSES.map((c) => c.id)];
}

/** One verb, by kind and id. */
export function verbOf(kind: ThingKind, id: string): Verb | null {
  return verbsOf(kind).find((x) => x.id === id) ?? null;
}

/** What a thing is called in a prompt and in a villager's mouth. */
export function thingName(kind: ThingKind): string {
  const NAMES: Record<string, string> = {
    house: "house", ruin: "ruin", field: "field", bench: "bench", well: "well", dock: "dock", boat: "boat",
    grave: "grave", mine: "mine", villager: "villager", water: "water's edge", land: "your land", home: "house", furnishing: "thing", dog: "dog", goat: "goat", hen: "hen",
    "berry-bush": "berry bush", "fallen-log": "fallen log", "dead-tree": "dead tree", "buttress-tree": "great tree",
    "canopy-palm": "palm", "vine-tangle": "tangle of vines", "grass-tuft": "tuft of grass", "dead-shrub": "dry shrub",
    "moss-patch": "moss", "lichen-rock": "lichen-covered rock", "snow-drift": "snow drift", "dune-ripple": "sand",
    "shore-rock": "rock", "scree": "loose stones",
    "hungry-stranger": "stranger", "raft-borrower": "stranger with nets", "tide-fisher": "fisher", "seed-offer": "child",
    "overgrown-path": "overgrown path", "lone-traveler": "traveller",
    "spilled-basket": "spilled basket", "stuck-cart": "stuck cart", "ball-game": "children's game", "stray-ball": "child",
    "well-custom": "well", "well-queue": "line at the well", "village-dance": "dance", "loose-hen": "loose hen", "falling-stars": "night sky", "banging-door": "door",
    "hollow-stump": "hollow stump", "message-bottle": "bottle", "still-pool": "still pool", "lookout-rock": "lookout rock", "buried-box": "patch of soft earth",
    "fallen-elder": "old man", "asch-boats": "fishers", "looking-up": "people looking up", teasing: "boys", "imece-wall": "fallen wall", "net-haul": "fishers",
    "bench-sit": "bench", "unfinished-tale": "storyteller", knucklebones: "children", musician: "musician", "wrong-basket": "fishwife", "tea-invite": "old woman", "tangled-net": "fisher", "bread-errand": "woman",
    "bread-mother": "old woman", "drunk-or-ill": "man on the path", campfire: "fire", "crying-alone": "young woman", dolphins: "dolphins",
    greeting: "passer-by", "rude-bump": "man with sacks", "narrow-way": "woman with jugs", "ask-way": "pedlar", "heavy-jugs": "old woman", "dark-lantern": "woman in the dark",
    "lost-purse": "purse", "open-gate": "gate", litter: "rubbish", "caught-lamb": "lamb", woodpile: "woodpile", "honey-stall": "honey stall",
  };
  return NAMES[kind] ?? kind;
}
