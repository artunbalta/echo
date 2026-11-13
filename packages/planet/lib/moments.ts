/**
 * Moments and hidden things (DECISIONS C86): something small happening near the stranger every minute
 * or so, and things tucked away around the village for whoever goes looking.
 *
 * WHY. Played for 25 minutes, a visit had long stretches of walking with nothing in reach: the
 * director's situations are hours apart (C63), and the pilot's six are over in the first minutes
 * (C75). A moment fills the gap the way a village does: someone's basket spills in front of you,
 * children's ball comes to your feet, people touch the well's rim for luck as they pass. Each is a
 * classic paradigm in the world's own clothes, and each is read under a label ingest.py already has
 * (C7), so `services/ml` is not touched:
 *
 * | Moment | What happens | Read as (cue) |
 * |---|---|---|
 * | `spilled-basket` | a woman trips and her apples roll across the path | `help_at_cost`; walking past, `pass_by` (H9) |
 * | `stuck-cart` | a handcart's wheel sinks, the carter strains at it | `help_at_cost`, held as long as you push; `pass_by` (H9) |
 * | `ball-game` | children's ball rolls to you; one of them is always left out | `include_marginal` / `ignore_marginal` (G2: Cyberball) |
 * | `stray-ball` | a child's throw goes wide and hits you | `forgive` / `retaliate`; walking off, `withdraw` (G10) |
 * | `well-custom` | people passing the well touch its rim and bow | `conform_custom`; passing it untouched, `deviate_custom` (H4) |
 * | `well-queue` | a line at the well with buckets | `wait_in_queue` / `cut_queue` (H1) |
 * | `village-dance` | in the evening a ring forms on the green | `group_join` / `group_observe`; walking off, `group_avoid` (G4) |
 * | `loose-hen` | after dark, a woman with a lantern chasing a hen that got out | `help_at_cost`; walking past, `pass_by` (H9) |
 * | `falling-stars` | at night, stars falling over the sea | `gaze_reflection`, held as long as you watch (J2) |
 * | `banging-door` | at night, a house's door banging in the wind | `stack_tidy`: pulling it shut (J5) |
 *
 * None is one of the pilot's six (no bread, no lending, no bet, no seed, no path, no lone stranger),
 * and none is set out while one of those stands: a moment never stands between a person and the study.
 *
 * NEVER A PROMPT (Law 2, as the director). A moment is people doing something, nothing else: no marker,
 * no word that it is for you. Leaving it is an answer, and never a penalty. Its people walk in from the
 * side rather than appearing, and walk off when it is over.
 *
 * HIDDEN THINGS are the village's own, the same for everyone, found once each by each stranger: hollow
 * stumps with something carved inside (`egg_hollow`, I3), a bottle on the shore with a note (`study_marker`,
 * J6), a still pool (`egg_reflection`, J2), a lookout rock (`egg_horizon_seen`, I3, and sitting there,
 * `gaze_reflection`, J2), a box someone buried (`dig_cache`).
 *
 * NEVER EMPTY (DECISIONS C87). With one moment a minute, 46% of a played visit still had nothing near.
 * Now three streams run at once (`MomentLane`): something happening ahead, a few seconds after the last;
 * someone coming along the way; and something lying by the way. Each new moment is a published
 * experiment in the village's clothes (`paradigm` cites it), and where the experiment has arms (two
 * onlookers or none, two coins or nine, a hurry or none) each stranger meets them in turn from a first arm
 * of their own (`armOf`), and the act carries the arm. Every label is one ingest.py reads by name (C7).
 *
 * Pure: where and which, never when (the page keeps the clock).
 */
import { blocked, navGraph } from "./nav.js";
import { doorOf } from "./schedule.js";
import { inVillage } from "./director.js";
import type { ArmContext } from "./things.js";
import { benchOut, type VillagePlan } from "./village.js";

/**
 * Which stream a moment comes in (C87). Three run at once, so that something is always near:
 *   people   something happening a few strides ahead, its people walking in from the side (C86's kind);
 *   passer   someone coming along the way toward the stranger, and on past them;
 *   wayside  something lying or standing by the way ahead, nobody about.
 */
export type MomentLane = "people" | "passer" | "wayside";

export type MomentKind =
  // C86
  | "spilled-basket" | "stuck-cart" | "ball-game" | "stray-ball" | "well-custom" | "well-queue" | "village-dance" | "loose-hen" | "falling-stars" | "banging-door"
  // C87: people
  | "fallen-elder" | "asch-boats" | "looking-up" | "teasing" | "imece-wall" | "net-haul" | "musician" | "wrong-basket" | "tea-invite" | "tangled-net"
  | "bread-errand" | "bread-mother" | "drunk-or-ill" | "campfire" | "crying-alone" | "dolphins" | "bench-sit" | "unfinished-tale" | "knucklebones"
  // C87: passers
  | "greeting" | "rude-bump" | "narrow-way" | "ask-way" | "heavy-jugs" | "dark-lantern"
  // C87: wayside
  | "lost-purse" | "open-gate" | "litter" | "caught-lamb" | "woodpile" | "honey-stall";
export type EggKind = "hollow-stump" | "message-bottle" | "still-pool" | "lookout-rock" | "buried-box";

export const EGG_KINDS: readonly EggKind[] = ["hollow-stump", "message-bottle", "still-pool", "lookout-rock", "buried-box"];

/** One arm of a moment's experiment: what differs between its occurrences, and what the act carries. */
export interface MomentArm {
  id: string;
  /** Raw signals the act carries, for the analysis (C7: ingest.py reads none it does not know). */
  raw?: Readonly<Record<string, number | string>>;
  /** The context the act is read in: onlookers, who the other is, a deadline, what is at stake. */
  context?: ArmContext;
}

export interface MomentDef {
  kind: MomentKind;
  /** What it is called over it, as the prompt says. */
  name: string;
  /** The hours it can happen in, on the sky's clock (0.25 sunrise, 0.75 sunset); [0.85, 0.2] runs over midnight. */
  hours: readonly [number, number];
  /**
   * Where: anywhere ahead of the stranger, at the well, on the green, overhead (the sky, wherever they
   * are), at a house's door, on the shore near the water, out on the sea, beside a house, at a field's
   * edge, or at one of the benches round the green.
   */
  where: "ahead" | "well" | "green" | "sky" | "door" | "shore" | "sea" | "house" | "field" | "bench";
  /** Children in it (the ball games), so the cast is drawn small. */
  children: boolean;
  /** How long it waits for the stranger before it is over by itself, seconds (from when it begins). */
  lifeS: number;
  /**
   * Walking past it once it was in plain view, measured as this (the director's rule, C63). Null where
   * walking past says nothing: a ball game you never stopped at is not a choice about who to include.
   */
  passed: { action: string; cue: string; channel: string } | null;
  /** Its stream (C87). */
  lane: MomentLane;
  /** The paradigm it is, as the decision record cites it (C87; C86's are in the table above). */
  paradigm: string;
  /** Its experiment's arms, met in turn by each stranger from an arm of their own (`armOf`). */
  arms?: readonly MomentArm[];
  /** How many times a round of its stream it comes (a greeting is commoner than a quarrel). */
  weight?: number;
  /** Only ever the second part of another, never begun by itself (the mother waiting for the loaf). */
  followUp?: boolean;
  /**
   * Awe, or beauty of no use (C87). Awe makes people more generous for a while (Piff et al. 2015), so these
   * wait until the pilot's six are long over (`MOMENT.aweAfterS`): one must never warm the stranger up for
   * the bread they are about to be asked for.
   */
  awe?: boolean;
  /**
   * An act on it that sends the stranger off somewhere (C87): with the bread to a house (`carry`, to be
   * handed over as `deliver`), or with someone walking beside them to their door (`escort`).
   */
  errand?: { on: string; kind: "carry" | "escort"; deliver?: MomentKind };
}

const C86 = "C86";

export const MOMENTS: Readonly<Record<MomentKind, MomentDef>> = {
  "spilled-basket": { kind: "spilled-basket", name: "a woman whose apples have rolled everywhere", hours: [0.27, 0.78], where: "ahead", children: false, lifeS: 50, passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people", paradigm: C86 },
  "stuck-cart": { kind: "stuck-cart", name: "a carter with a wheel stuck fast", hours: [0.28, 0.74], where: "ahead", children: false, lifeS: 55, passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people", paradigm: C86 },
  "ball-game": { kind: "ball-game", name: "children playing catch", hours: [0.3, 0.78], where: "ahead", children: true, lifeS: 50, passed: null, lane: "people", paradigm: C86 },
  // C87 gives it an experiment: the child says sorry, or does not (apology and forgiveness, Ohbuchi, Kameda &
  // Agarie 1989; Fehr, Gelfand & Nag 2010).
  "stray-ball": { kind: "stray-ball", name: "a child who threw wide", hours: [0.3, 0.78], where: "ahead", children: true, lifeS: 30, passed: { action: "withdraw", cue: "G10", channel: "G" }, lane: "people", paradigm: C86, arms: [{ id: "apology", raw: { apology: 1 } }, { id: "no-apology", raw: { apology: 0 } }] },
  "well-custom": { kind: "well-custom", name: "the well's worn rim", hours: [0.26, 0.82], where: "well", children: false, lifeS: 60, passed: { action: "deviate_custom", cue: "H4", channel: "H" }, lane: "people", paradigm: C86 },
  "well-queue": { kind: "well-queue", name: "a line at the well", hours: [0.27, 0.7], where: "well", children: false, lifeS: 55, passed: null, lane: "people", paradigm: C86 },
  "village-dance": { kind: "village-dance", name: "a ring dance on the green", hours: [0.74, 0.93], where: "green", children: false, lifeS: 70, passed: { action: "group_avoid", cue: "G4", channel: "G" }, lane: "people", paradigm: C86 },
  // The night's own (C86): the village after dark is not empty of things to do.
  "loose-hen": { kind: "loose-hen", name: "a woman with a lantern, chasing a hen", hours: [0.82, 0.28], where: "ahead", children: false, lifeS: 50, passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people", paradigm: C86 },
  "falling-stars": { kind: "falling-stars", name: "stars falling over the sea", hours: [0.86, 0.2], where: "sky", children: false, lifeS: 26, passed: null, lane: "people", paradigm: C86, awe: true },
  "banging-door": { kind: "banging-door", name: "a door banging in the wind", hours: [0.8, 0.3], where: "door", children: false, lifeS: 40, passed: null, lane: "people", paradigm: C86 },

  // ── C87: people ─────────────────────────────────────────────────────────────
  "fallen-elder": {
    kind: "fallen-elder", name: "an old man who has slipped and cannot get up", hours: [0.27, 0.8], where: "ahead", children: false, lifeS: 55,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people",
    paradigm: "the bystander effect (Darley & Latané 1968; Fischer et al. 2011): the same need, with others standing by or nobody",
    arms: [{ id: "alone", raw: { onlookers: 0 } }, { id: "onlookers", raw: { onlookers: 2 }, context: { audience_size: 2 } }],
  },
  "asch-boats": {
    kind: "asch-boats", name: "fishers sure the red boat is the longer", hours: [0.28, 0.76], where: "shore", children: false, lifeS: 50, passed: null, lane: "people",
    paradigm: "conformity to a mistaken majority (Asch 1956; Bond & Smith 1996): a unanimous majority, or one with a dissenting ally (Asch 1956; Allen & Levine 1971)",
    arms: [{ id: "unanimous", raw: { majority: 3, dissent: 0 }, context: { audience_size: 3 } }, { id: "dissenter", raw: { majority: 2, dissent: 1 }, context: { audience_size: 3 } }],
  },
  "looking-up": {
    kind: "looking-up", name: "people stopped in the way, looking up", hours: [0.28, 0.78], where: "ahead", children: false, lifeS: 45, passed: null, lane: "people",
    paradigm: "the drawing power of a crowd (Milgram, Bickman & Berkowitz 1969): one person looking up, or five",
    arms: [{ id: "one", raw: { lookers: 1 }, context: { audience_size: 1 } }, { id: "five", raw: { lookers: 5 }, context: { audience_size: 5 } }],
  },
  teasing: {
    kind: "teasing", name: "boys teasing a smaller one", hours: [0.3, 0.76], where: "ahead", children: true, lifeS: 45,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people",
    paradigm: "the participant roles in bullying (Salmivalli et al. 1996): joining in, defending, standing by the victim, or walking on",
  },
  "imece-wall": {
    kind: "imece-wall", name: "a field wall fallen, and stones to lift", hours: [0.28, 0.72], where: "field", children: false, lifeS: 70, passed: null, lane: "people",
    paradigm: "communal work and social loafing (Latané, Williams & Harkins 1979; Karau & Williams 1993): one old man at it alone, or a crew of four",
    arms: [{ id: "alone", raw: { crew: 1 } }, { id: "crew", raw: { crew: 4 }, context: { audience_size: 4 } }],
  },
  "net-haul": {
    kind: "net-haul", name: "fishers hauling a heavy net up the beach", hours: [0.27, 0.7], where: "shore", children: false, lifeS: 60, passed: null, lane: "people",
    paradigm: "social loafing at a rope (Ingham et al. 1974; Latané, Williams & Harkins 1979; Karau & Williams 1993): one fisher alone at it, or three, and how long you pull",
    arms: [{ id: "alone", raw: { crew: 1 } }, { id: "crew", raw: { crew: 3 }, context: { audience_size: 3 } }],
  },
  musician: {
    kind: "musician", name: "an old man playing the kaval", hours: [0.32, 0.9], where: "ahead", children: false, lifeS: 90, passed: null, lane: "people",
    paradigm: "aesthetic dwell: stopping for music that is of no use (cue J2; stable individual differences in music reward, Mas-Herrero et al. 2013)",
    awe: true,
  },
  "wrong-basket": {
    kind: "wrong-basket", name: "a busy fishwife holding out a basket meant for someone else", hours: [0.28, 0.74], where: "ahead", children: false, lifeS: 40, passed: null, lane: "people",
    paradigm: "honesty with a windfall that is not yours (excess change returned: Azar, Yosef & Bar-Eli 2013; civic honesty, Cohn et al. 2019)",
    arms: [{ id: "one-basket", context: { public_or_private: "private" } }],
  },
  "tea-invite": {
    kind: "tea-invite", name: "an old woman on her step, beckoning you to sit for tea", hours: [0.3, 0.8], where: "door", children: false, lifeS: 90,
    passed: { action: "close_ghost", cue: "E6", channel: "E" }, lane: "people",
    paradigm: "answering a bid for company: accepting hospitality, declining it gracefully, or not answering (cues G4, E4–E6)",
  },
  "tangled-net": {
    kind: "tangled-net", name: "a fisher working at a hopelessly tangled net", hours: [0.28, 0.78], where: "shore", children: false, lifeS: 70, passed: null, lane: "people",
    paradigm: "persistence at something that resists (frustration tolerance, cue I5; task persistence as conscientiousness)",
  },
  "bread-errand": {
    kind: "bread-errand", name: "a woman at her door with a loaf for her mother", hours: [0.28, 0.76], where: "door", children: false, lifeS: 45, passed: null, lane: "people",
    paradigm: "keeping a promise when nothing makes you (Charness & Dufwenberg 2006; Vanberg 2008); in a hurry or not (Darley & Batson 1973)",
    arms: [{ id: "hurry", raw: { hurry: 1 }, context: { time_pressure: 1 } }, { id: "no-hurry", raw: { hurry: 0 }, context: { time_pressure: 0 } }],
    errand: { on: "take", kind: "carry", deliver: "bread-mother" },
  },
  "bread-mother": {
    kind: "bread-mother", name: "an old woman waiting at her door", hours: [0, 1], where: "door", children: false, lifeS: 600, passed: null, lane: "people",
    paradigm: "the promise kept (Charness & Dufwenberg 2006)", followUp: true,
  },
  "drunk-or-ill": {
    kind: "drunk-or-ill", name: "a man lying on the path in the dark", hours: [0.84, 0.22], where: "ahead", children: false, lifeS: 55,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people",
    paradigm: "Good Samaritanism toward the ill and the drunk (Piliavin, Rodin & Piliavin 1969): a cane beside him, or a bottle",
    arms: [{ id: "ill", raw: { victim: "cane" } }, { id: "drunk", raw: { victim: "bottle" } }],
  },
  campfire: {
    kind: "campfire", name: "villagers round a fire, telling stories", hours: [0.8, 0.04], where: "ahead", children: false, lifeS: 90,
    passed: { action: "group_avoid", cue: "G1", channel: "G" }, lane: "people",
    paradigm: "joining a group or staying outside it (cue G4, group affiliation)",
  },
  "crying-alone": {
    kind: "crying-alone", name: "a young woman sitting alone, crying", hours: [0.72, 0.12], where: "ahead", children: false, lifeS: 55,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "people",
    paradigm: "empathy and the ease of escape (Batson et al. 1981): she sits right on your way, or off to one side",
    arms: [{ id: "on-the-way", raw: { escape: "hard" } }, { id: "aside", raw: { escape: "easy" } }],
  },
  dolphins: {
    kind: "dolphins", name: "dolphins in the bay", hours: [0.3, 0.74], where: "sea", children: false, lifeS: 30, passed: null, lane: "people",
    paradigm: "awe and aesthetic dwell (Keltner & Haidt 2003; Piff et al. 2015): stopping for something vast and of no use",
    awe: true,
  },
  "bench-sit": {
    kind: "bench-sit", name: "someone sitting at one end of a bench", hours: [0.3, 0.9], where: "bench", children: false, lifeS: 60, passed: null, lane: "people",
    paradigm: "personal space (Sommer 1959; Felipe & Sommer 1966; stable within a person, Hayduk 1983): where you sit on a bench someone is already on, an elder or one of your own age",
    arms: [{ id: "elder", raw: { sitter: "elder" }, context: { counterpart_status: "high" } }, { id: "peer", raw: { sitter: "peer" }, context: { counterpart_status: "peer" } }],
  },
  "unfinished-tale": {
    kind: "unfinished-tale", name: "an old man telling children a Nasreddin Hoca tale", hours: [0.32, 0.85], where: "ahead", children: false, lifeS: 80, passed: null, lane: "people",
    paradigm: "information-gap curiosity, paid for in time (Loewenstein 1994; Kang et al. 2009): he stops before the end of the tale to light his pipe, for a short while or a long one",
    arms: [{ id: "short-pause", raw: { pause_s: 20 } }, { id: "long-pause", raw: { pause_s: 45 } }],
  },
  knucklebones: {
    kind: "knucklebones", name: "two children with a knucklebone, a cup and a pomegranate", hours: [0.3, 0.78], where: "ahead", children: true, lifeS: 45, passed: null, lane: "people",
    paradigm: "lying for gain (Fischbacher & Föllmi-Heusi 2013; Abeler, Nosenzo & Raymond 2019), seen or unseen (Gneezy, Kajackaite & Sobel 2018): the throw is not tava, and the children watch it, or it is under the cup",
    arms: [{ id: "unseen", raw: { seen: 0 }, context: { public_or_private: "private" } }, { id: "seen", raw: { seen: 1 }, context: { public_or_private: "public", audience_size: 2 } }],
  },

  // ── C87: passers ───────────────────────────────────────────────────────────
  greeting: {
    kind: "greeting", name: "someone coming along, with a greeting for you", hours: [0, 1], where: "ahead", children: false, lifeS: 30,
    passed: { action: "opener_silent", cue: "G5", channel: "G" }, lane: "passer", weight: 3,
    paradigm: "courtesy across status (cues G2, G11): the same greeting from the headman, from a water-carrier, or from anybody",
    arms: [
      { id: "high", raw: { status: "headman" }, context: { counterpart_status: "high" } },
      { id: "low", raw: { status: "water-carrier" }, context: { counterpart_status: "low" } },
      { id: "peer", raw: { status: "villager" }, context: { counterpart_status: "peer" } },
    ],
  },
  "rude-bump": {
    kind: "rude-bump", name: "a man with sacks, who knocks into you and swears", hours: [0.28, 0.8], where: "ahead", children: false, lifeS: 30,
    passed: { action: "cold_response_withdraw", cue: "G9", channel: "G" }, lane: "passer",
    paradigm: "answering an insult (Cohen, Nisbett, Bowdle & Schwarz 1996): smoothing it over, giving it back, or walking off",
  },
  "narrow-way": {
    kind: "narrow-way", name: "someone coming the other way on the narrow path", hours: [0.28, 0.8], where: "ahead", children: false, lifeS: 30, passed: null, lane: "passer",
    paradigm: "giving way on a narrow passage, by status (Dabbs & Stokes 1975; Willis, Gier & Smith 1979): an elder with a staff, or a girl with two full jugs",
    arms: [{ id: "elder", raw: { status: "elder" }, context: { counterpart_status: "high" } }, { id: "porter", raw: { status: "water-girl" }, context: { counterpart_status: "low" } }],
  },
  "ask-way": {
    kind: "ask-way", name: "a pedlar who asks you the way to the harbour", hours: [0.3, 0.76], where: "ahead", children: false, lifeS: 30,
    passed: { action: "opener_silent", cue: "G5", channel: "G" }, lane: "passer",
    paradigm: "helping a stranger find the way (Levine et al. 1994; 2001): showing them there, pointing, or not answering",
    errand: { on: "walk", kind: "escort" },
  },
  "heavy-jugs": {
    kind: "heavy-jugs", name: "an old woman struggling with two heavy jugs", hours: [0.27, 0.76], where: "ahead", children: false, lifeS: 30,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "passer",
    paradigm: "help with a burden, at a cost in time and effort (cue H9; Levine et al. 2001)",
    errand: { on: "carry", kind: "escort" },
  },
  "dark-lantern": {
    kind: "dark-lantern", name: "a woman whose lantern has gone out", hours: [0.84, 0.2], where: "ahead", children: false, lifeS: 30,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "passer",
    paradigm: "help at a cost after dark (cue H9)",
    errand: { on: "walk", kind: "escort" },
  },

  // ── C87: wayside ───────────────────────────────────────────────────────────
  "lost-purse": {
    kind: "lost-purse", name: "a purse lying in the grass", hours: [0, 1], where: "ahead", children: false, lifeS: 240, passed: null, lane: "wayside",
    paradigm: "civic honesty with a lost purse (Cohn, Maréchal, Tannenbaum & Zünd 2019): two coins in it, or nine",
    arms: [{ id: "few", raw: { coins: 2 }, context: { stakes: "low" } }, { id: "many", raw: { coins: 9 }, context: { stakes: "high" } }],
  },
  "open-gate": {
    kind: "open-gate", name: "a field gate left open", hours: [0, 1], where: "field", children: false, lifeS: 240, passed: null, lane: "wayside",
    paradigm: "keeping an unenforced rule (cue H4; the spreading of disorder, Keizer, Lindenberg & Steg 2008)",
  },
  litter: {
    kind: "litter", name: "rubbish dropped by the way", hours: [0, 1], where: "ahead", children: false, lifeS: 240, passed: null, lane: "wayside",
    paradigm: "tidying a shared place, clean or already littered (Cialdini, Reno & Kallgren 1990)",
    arms: [{ id: "clean", raw: { litter: 1 } }, { id: "littered", raw: { litter: 7 } }],
  },
  "caught-lamb": {
    kind: "caught-lamb", name: "a lamb with its head caught in the fence", hours: [0.27, 0.78], where: "field", children: false, lifeS: 240,
    passed: { action: "pass_by", cue: "H9", channel: "H" }, lane: "wayside",
    paradigm: "help at a cost to a creature in trouble (cue H9)",
  },
  woodpile: {
    kind: "woodpile", name: "a woodpile that has come down", hours: [0, 1], where: "house", children: false, lifeS: 240, passed: null, lane: "wayside",
    paradigm: "order when nobody asks for it (cue J5; orderliness and conscientiousness, Gosling et al. 2002)",
  },
  "honey-stall": {
    kind: "honey-stall", name: "a stall of honey, one jar each, nobody minding it", hours: [0.27, 0.78], where: "ahead", children: false, lifeS: 240, passed: null, lane: "wayside",
    paradigm: "honesty at an honesty stall (Levitt 2006), with watching eyes or without (Bateson, Nettle & Roberts 2006; Dear, Dutton & Fox 2019): a nazar charm over it, or none",
    arms: [{ id: "eye", raw: { eye: 1 } }, { id: "no-eye", raw: { eye: 0 } }],
  },
};

export const MOMENT_KINDS: readonly MomentKind[] = Object.keys(MOMENTS) as MomentKind[];

/** Each stream's kinds, as its rotation deals them: a kind as many times a round as its weight. */
export const LANE_KINDS: Readonly<Record<MomentLane, readonly MomentKind[]>> = {
  people: rotation("people"),
  passer: rotation("passer"),
  wayside: rotation("wayside"),
};

function rotation(lane: MomentLane): MomentKind[] {
  return MOMENT_KINDS.filter((k) => MOMENTS[k].lane === lane && !MOMENTS[k].followUp).flatMap((k) => Array.from({ length: MOMENTS[k].weight ?? 1 }, () => k));
}

export const MOMENT = {
  /** Before the first, after arriving: time to look around. */
  firstS: 14,
  /** Between the end of one and the start of the next (C87: a few seconds, so something is always near). */
  gapS: [3, 7] as const,
  /** Each stream's first and its gaps (C87). */
  lanes: {
    people: { firstS: 14, gapS: [3, 7] as const },
    passer: { firstS: 30, gapS: [12, 24] as const },
    wayside: { firstS: 8, gapS: [5, 9] as const },
  },
  /** Awe waits this long into a visit, seconds: the pilot's six are over in the first seven minutes (C75). */
  aweAfterS: 480,
  /** A bench moment: one of the green's benches this far off. */
  benchM: [4, 26] as const,
  /** The same kind is not met again this soon, seconds (a greeting sooner: there are many people). */
  repeatS: 240,
  greetingRepeatS: 45,
  /** Set this far ahead of the stranger: near, in front, on the way. */
  aheadM: [6.5, 10] as const,
  /** On the shore: this far ahead, within this far of the water. */
  shoreM: [7, 16] as const,
  shoreWaterM: 4.5,
  /** Out on the sea: this far off, for the dolphins. */
  seaM: [22, 46] as const,
  /** Wayside things: at most this many at once, set this far ahead, this far apart, wanted this near. */
  wayside: { max: 2, aheadM: [11, 18] as const, apartM: 9, goneM: 34, wantM: 22 },
  /** Someone coming along: from this far ahead, this far to one side of the stranger, on to this far behind. */
  passer: { startM: [15, 19] as const, sideM: 1.4, endM: 16 },
  /** An errand's house is this far off, and the one it is carried to waits this long. */
  errandM: [16, 46] as const,
  errandWaitS: 300,
  /** Its people walk in from about this far. */
  entryM: 15,
  /** The well and the green moments: only for someone this near them. */
  wellM: 28,
  greenM: 32,
  /** Came this close: it was in plain view. Then this far: they walked on. */
  noticeM: 8,
  goneM: 20,
  /** A door moment: a house whose door is this far from the stranger, metres. */
  doorM: [5, 25] as const,
  /** A field or a house moment: one this far off. */
  besideM: [6, 30] as const,
  /** Never this near something the director set out (the pilot's six above all). */
  clearOfStagingM: 14,
  /**
   * Nothing begins while the stranger is this near something the director set out, which they may yet
   * go to. Walked away from it, they are free of it: one left standing for its four minutes (C75) does
   * not hold every moment back. C87 widens it from 40 m to the whole ring a staging is set in (22–48 m,
   * and some): with three streams running, the pilot's six must still stand out when they come.
   */
  holdForStagingM: 60,
} as const;

/** A number in [0, 1) fixed by a string (FNV with a murmur finish, as the director's). */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * The order one stranger meets a stream's moments in: every kind once (a greeting its weight's times)
 * before any comes again, shuffled afresh for each round, the same on every reload. So a 25-minute visit
 * meets most of them, in an order that differs from one person to the next.
 */
export function momentAt(seed: string, n: number, lane: MomentLane = "people"): MomentKind {
  const kinds = LANE_KINDS[lane];
  const round = Math.floor(n / kinds.length);
  const order = [...kinds];
  const key = lane === "people" ? `${seed}|moment` : `${seed}|moment|${lane}`;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(unit(`${key}|${round}|${i}`) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order[n % kinds.length]!;
}

/**
 * The arm of a moment's experiment a stranger meets the `k`th time they meet it (C87): a first arm of
 * their own, so that across strangers each arm is met first equally often, then the others in turn, so
 * that one stranger meets them all.
 */
export function armOf(seed: string, kind: MomentKind, k: number): MomentArm | null {
  const arms = MOMENTS[kind].arms;
  if (!arms?.length) return null;
  const first = Math.floor(unit(`${seed}|arm|${kind}`) * arms.length);
  return arms[(first + k) % arms.length]!;
}

/** Whether the sea is within `r` metres of a point. */
export function seaWithin(ground: MomentGround, at: { x: number; y: number }, r: number): boolean {
  for (const f of [0.34, 0.67, 1]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (ground.height(at.x + Math.cos(a) * r * f, at.y + Math.sin(a) * r * f) < 0) return true;
    }
  }
  return false;
}

/** Whether a moment can happen here and now: its hours, and its place. */
export function momentFits(kind: MomentKind, hour: number, at: { x: number; y: number }, plan: VillagePlan | null, ground: MomentGround | null = null): boolean {
  const def = MOMENTS[kind];
  const [h0, h1] = def.hours;
  if (h0 <= h1 ? hour < h0 || hour > h1 : hour < h0 && hour > h1) return false;
  if (def.where === "ahead" || def.where === "sky") return true;
  if (def.where === "shore") return !!ground && seaWithin(ground, at, 26);
  if (def.where === "sea") return !!ground && seaWithin(ground, at, MOMENT.seaM[1] * 0.8);
  if (!plan) return false;
  if (def.where === "door") return plan.plots.some((p) => Math.hypot(doorOf(p).x - at.x, doorOf(p).y - at.y) < MOMENT.doorM[1]);
  if (def.where === "house") return plan.plots.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < MOMENT.besideM[1]);
  if (def.where === "field") return plan.fields.some((f) => Math.hypot(f.x - at.x, f.y - at.y) < MOMENT.besideM[1] + f.lengthM / 2);
  if (def.where === "bench") return plan.benches.some((b) => Math.hypot(b.x - at.x, b.y - at.y) < MOMENT.benchM[1]);
  const d = Math.hypot(at.x - plan.centre.x, at.y - plan.centre.y);
  return def.where === "well" ? d < MOMENT.wellM : d < MOMENT.greenM;
}

/**
 * The next moment of a stream from `n` on that fits: the rotation's own next if it does, or the first
 * after it that does (and `n` moves past both). `skip` passes over kinds the caller has just had. Null
 * when none fits here and now.
 */
export function nextMoment(
  seed: string,
  n: number,
  hour: number,
  at: { x: number; y: number },
  plan: VillagePlan | null,
  lane: MomentLane = "people",
  ground: MomentGround | null = null,
  skip: ((kind: MomentKind) => boolean) | null = null,
): { kind: MomentKind; n: number } | null {
  const kinds = LANE_KINDS[lane];
  for (let k = 0; k < kinds.length; k++) {
    const kind = momentAt(seed, n + k, lane);
    if (skip?.(kind)) continue;
    if (momentFits(kind, hour, at, plan, ground)) return { kind, n: n + k + 1 };
  }
  return null;
}

/** The ground a moment or a hidden thing is set on. */
export interface MomentGround {
  /** Metres above the sea; below zero is water. */
  height(x: number, y: number): number;
  plan: VillagePlan | null;
}

/** Open ground: dry, not on a house, the well, a bench or anything else standing there. */
export function openGround(ground: MomentGround, x: number, y: number): boolean {
  if (ground.height(x, y) < 0.15) return false;
  return !ground.plan || !blocked(navGraph(ground.plan), { x, y });
}

/**
 * Where a moment ahead is set: in front of the stranger (`heading`, radians, planet-local), within
 * forty degrees either side, on open ground, and clear of whatever the director set out. Null when
 * nowhere ahead will do.
 */
export function momentSpot(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround, avoid: { x: number; y: number } | null = null): { x: number; y: number; facing: number } | null {
  const [r0, r1] = MOMENT.aheadM;
  for (let i = 0; i < 40; i++) {
    const a = heading + (unit(`${seed}|a|${i}`) - 0.5) * (Math.PI * 0.45);
    const r = r0 + unit(`${seed}|r|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (!openGround(ground, x, y)) continue;
    // Room for the people in it: a metre and a half all round.
    let room = true;
    for (let k = 0; k < 6 && room; k++) room = openGround(ground, x + Math.cos((k / 6) * Math.PI * 2) * 1.5, y + Math.sin((k / 6) * Math.PI * 2) * 1.5);
    if (!room) continue;
    if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < MOMENT.clearOfStagingM) continue;
    // Facing the stranger, so that what happens happens toward them.
    return { x, y, facing: Math.atan2(at.y - y, at.x - x) };
  }
  return null;
}

/**
 * Which house's door bangs: the nearest lived-in house (`lived`, the caller's: a ruin has no door left
 * to bang) within `doorM`, preferring one ahead of the stranger (a door behind them is heard, and nobody
 * turns round for it). Facing the way the house faces.
 */
export function doorSpot(at: { x: number; y: number }, heading: number, plan: VillagePlan, lived: (plot: VillagePlan["plots"][number]) => boolean = () => true): { x: number; y: number; facing: number } | null {
  let best: { x: number; y: number; facing: number; score: number } | null = null;
  for (const plot of plan.plots) {
    if (!lived(plot)) continue;
    const d = doorOf(plot);
    const r = Math.hypot(d.x - at.x, d.y - at.y);
    if (r < MOMENT.doorM[0] || r > MOMENT.doorM[1]) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(d.y - at.y, d.x - at.x) - heading), Math.cos(Math.atan2(d.y - at.y, d.x - at.x) - heading)));
    const score = r + (off > Math.PI * 0.4 ? 40 : 0);
    if (!best || score < best.score) best = { x: d.x, y: d.y, facing: plot.facing, score };
  }
  return best && { x: best.x, y: best.y, facing: best.facing };
}

/** Where its people walk in from: off to one side of the stranger's way, about `entryM` away. */
export function entryPoint(spot: { x: number; y: number }, from: { x: number; y: number }, seed: string, ground: MomentGround): { x: number; y: number } {
  const toward = Math.atan2(spot.y - from.y, spot.x - from.x);
  for (let i = 0; i < 16; i++) {
    const side = unit(`${seed}|side|${i}`) < 0.5 ? -1 : 1;
    const a = toward + side * (Math.PI / 2 + (unit(`${seed}|tilt|${i}`) - 0.5) * 0.8);
    const r = MOMENT.entryM * (0.8 + 0.4 * unit(`${seed}|er|${i}`));
    const x = spot.x + Math.cos(a) * r;
    const y = spot.y + Math.sin(a) * r;
    if (openGround(ground, x, y)) return { x, y };
  }
  return { x: spot.x + Math.cos(toward + Math.PI / 2) * 6, y: spot.y + Math.sin(toward + Math.PI / 2) * 6 };
}

type Spot = { x: number; y: number; facing: number };
const angleOff = (from: { x: number; y: number }, to: { x: number; y: number }, heading: number) => {
  const a = Math.atan2(to.y - from.y, to.x - from.x) - heading;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
};

/**
 * On the shore ahead (C87): dry ground with the water within a few strides, within seventy degrees either
 * side of the way ahead, clear of what the director set out. Facing the stranger.
 */
export function shoreSpot(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround, avoid: { x: number; y: number } | null = null): Spot | null {
  const [r0, r1] = MOMENT.shoreM;
  for (let i = 0; i < 80; i++) {
    const a = heading + (unit(`${seed}|sa|${i}`) - 0.5) * (Math.PI * 0.78);
    const r = r0 + unit(`${seed}|sr|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (!openGround(ground, x, y) || !seaWithin(ground, { x, y }, MOMENT.shoreWaterM)) continue;
    // Room for the people in it on the landward side at least: four of six points round it open.
    let open = 0;
    for (let k = 0; k < 6; k++) if (openGround(ground, x + Math.cos((k / 6) * Math.PI * 2) * 1.4, y + Math.sin((k / 6) * Math.PI * 2) * 1.4)) open++;
    if (open < 4) continue;
    if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < MOMENT.clearOfStagingM) continue;
    return { x, y, facing: Math.atan2(at.y - y, at.x - x) };
  }
  return null;
}

/** Out on the water ahead (C87), for something seen from the land: the dolphins. */
export function seaSpot(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround): Spot | null {
  const [r0, r1] = MOMENT.seaM;
  for (let i = 0; i < 60; i++) {
    const a = heading + (unit(`${seed}|wa|${i}`) - 0.5) * (Math.PI * 0.8);
    const r = r0 + unit(`${seed}|wr|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (ground.height(x, y) > -0.6) continue;
    return { x, y, facing: a + Math.PI / 2 };
  }
  return null;
}

/**
 * Beside a lived-in house near the stranger (C87): a woodpile at its gable. The nearest, preferring one
 * ahead, on open ground; facing along the house's front.
 */
export function houseSpot(at: { x: number; y: number }, heading: number, plan: VillagePlan, ground: MomentGround, lived: (plot: VillagePlan["plots"][number]) => boolean = () => true): Spot | null {
  let best: (Spot & { score: number }) | null = null;
  for (const plot of plan.plots) {
    if (!lived(plot)) continue;
    for (const side of [-1, 1]) {
      const a = plot.facing + (side * Math.PI) / 2;
      const x = plot.x + Math.cos(a) * (plot.widthM / 2 + 1.1);
      const y = plot.y + Math.sin(a) * (plot.widthM / 2 + 1.1);
      const r = Math.hypot(x - at.x, y - at.y);
      if (r < MOMENT.besideM[0] || r > MOMENT.besideM[1] || !openGround(ground, x, y)) continue;
      const score = r + (angleOff(at, { x, y }, heading) > Math.PI * 0.4 ? 40 : 0);
      if (!best || score < best.score) best = { x, y, facing: plot.facing, score };
    }
  }
  return best && { x: best.x, y: best.y, facing: best.facing };
}

/**
 * At the edge of a field near the stranger (C87): its gate at one end, or its fence along a side. The
 * nearest, preferring one ahead, on open ground; facing the field.
 */
export function fieldSpot(at: { x: number; y: number }, heading: number, plan: VillagePlan, ground: MomentGround): Spot | null {
  let best: (Spot & { score: number }) | null = null;
  for (const f of plan.fields) {
    const along = (d: number, side: number) => ({ x: f.x + Math.cos(f.heading) * d + Math.cos(f.heading + Math.PI / 2) * side, y: f.y + Math.sin(f.heading) * d + Math.sin(f.heading + Math.PI / 2) * side });
    const edges = [along(f.lengthM / 2 + 0.9, 0), along(-f.lengthM / 2 - 0.9, 0), along(0, f.widthM / 2 + 0.9), along(0, -f.widthM / 2 - 0.9)];
    for (const p of edges) {
      const r = Math.hypot(p.x - at.x, p.y - at.y);
      if (r < MOMENT.besideM[0] || r > MOMENT.besideM[1] || !openGround(ground, p.x, p.y)) continue;
      const score = r + (angleOff(at, p, heading) > Math.PI * 0.4 ? 40 : 0);
      if (!best || score < best.score) best = { x: p.x, y: p.y, facing: Math.atan2(f.y - p.y, f.x - p.x), score };
    }
  }
  return best && { x: best.x, y: best.y, facing: best.facing };
}

/**
 * One of the green's benches near the stranger (C87): the nearest, preferring one ahead, that nobody
 * is on (`free`; a bench the old are sitting on is theirs). Its middle, facing the way a SITTER on it
 * faces (out, toward the well: `benchOut`, not `heading`, which is the way the plank runs), and
 * which bench it is, so its people can be seated by `benchSeat`.
 */
export function benchSpot(at: { x: number; y: number }, heading: number, plan: VillagePlan, free: (bench: number) => boolean = () => true): (Spot & { bench: number }) | null {
  let best: (Spot & { bench: number; score: number }) | null = null;
  for (let i = 0; i < plan.benches.length; i++) {
    const b = plan.benches[i]!;
    const r = Math.hypot(b.x - at.x, b.y - at.y);
    if (r < MOMENT.benchM[0] || r > MOMENT.benchM[1] || !free(i)) continue;
    const score = r + (angleOff(at, b, heading) > Math.PI * 0.45 ? 30 : 0);
    if (!best || score < best.score) best = { x: b.x, y: b.y, facing: benchOut(plan, b), bench: i, score };
  }
  return best && { x: best.x, y: best.y, facing: best.facing, bench: best.bench };
}

/**
 * Where a wayside thing lies (C87): ahead of the stranger, a little further than a moment ahead (it is
 * come upon, not walked into), on open ground, apart from the others and from what the director set out.
 */
export function waysideSpot(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround, avoid: readonly { x: number; y: number }[]): Spot | null {
  const [r0, r1] = MOMENT.wayside.aheadM;
  for (let i = 0; i < 50; i++) {
    const a = heading + (unit(`${seed}|ya|${i}`) - 0.5) * (Math.PI * 0.39);
    const r = r0 + unit(`${seed}|yr|${i}`) * (r1 - r0);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r;
    if (!openGround(ground, x, y)) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < MOMENT.wayside.apartM)) continue;
    return { x, y, facing: unit(`${seed}|yf|${i}`) * Math.PI * 2 };
  }
  return null;
}

/**
 * Someone coming along (C87): where they set out from ahead of the stranger, where they pass them (a
 * stride or so to one side: `sideM`, nought for someone who walks straight into you), and where they go
 * on to behind. Null when the way ahead is not open ground.
 */
export function passerPath(at: { x: number; y: number }, heading: number, seed: string, ground: MomentGround, sideM: number = MOMENT.passer.sideM): { from: { x: number; y: number }; to: { x: number; y: number }; meet: { x: number; y: number } } | null {
  const [s0, s1] = MOMENT.passer.startM;
  for (let i = 0; i < 20; i++) {
    const side = unit(`${seed}|ps|${i}`) < 0.5 ? -1 : 1;
    const dir = heading + (unit(`${seed}|pt|${i}`) - 0.5) * 0.5;
    const perp = dir + (side * Math.PI) / 2;
    const meet = { x: at.x + Math.cos(perp) * sideM, y: at.y + Math.sin(perp) * sideM };
    const start = s0 + unit(`${seed}|pr|${i}`) * (s1 - s0);
    const from = { x: meet.x + Math.cos(dir) * start, y: meet.y + Math.sin(dir) * start };
    const to = { x: meet.x - Math.cos(dir) * MOMENT.passer.endM, y: meet.y - Math.sin(dir) * MOMENT.passer.endM };
    if (!openGround(ground, from.x, from.y) || !openGround(ground, meet.x, meet.y)) continue;
    let open = 0;
    for (const k of [0.25, 0.5, 0.75]) if (openGround(ground, meet.x + (from.x - meet.x) * k, meet.y + (from.y - meet.y) * k)) open++;
    if (open < 2) continue;
    return { from, to, meet };
  }
  return null;
}

/**
 * Where an errand goes (C87): the door of another lived-in house, a little way off, in an order the seed
 * decides. Null when there is none.
 */
export function errandHouse(at: { x: number; y: number }, from: { x: number; y: number }, plan: VillagePlan, seed: string, lived: (plot: VillagePlan["plots"][number]) => boolean = () => true): Spot | null {
  const ok = plan.plots
    .filter((p) => lived(p))
    .map((p) => ({ p, d: doorOf(p) }))
    .filter(({ d }) => {
      const r = Math.hypot(d.x - at.x, d.y - at.y);
      return r >= MOMENT.errandM[0] && r <= MOMENT.errandM[1] && Math.hypot(d.x - from.x, d.y - from.y) > 6;
    });
  if (!ok.length) return null;
  const pick = ok[Math.floor(unit(`${seed}|errand`) * ok.length)]!;
  return { x: pick.d.x, y: pick.d.y, facing: pick.p.facing };
}

/** Walking past, one step at a time: `near` once within `noticeM`; `passed` when then beyond `goneM`. */
export function momentPass(wasNear: boolean, distM: number): { near: boolean; passed: boolean } {
  const near = wasNear || distM <= MOMENT.noticeM;
  return { near, passed: near && distM > MOMENT.goneM };
}

// ── hidden things ─────────────────────────────────────────────────────────────

export interface Egg {
  /** Stable across visits and viewers: the village's, by kind and number. */
  id: string;
  kind: EggKind;
  x: number;
  y: number;
  facing: number;
  /** Which of its kind's lines it says when found (the token carved, the note's words). */
  variant: number;
}

/** How many of each a village hides. */
const EGG_COUNTS: Readonly<Record<EggKind, number>> = { "hollow-stump": 3, "message-bottle": 2, "still-pool": 1, "lookout-rock": 1, "buried-box": 1 };

/**
 * Where a village hides its things: deterministic from the village, outside its own houses and fields
 * (`inVillage`), a few strides apart, each on the ground it needs: a bottle at the waterline, a pool in
 * a hollow of the land, the lookout on the highest ground near the village. Fewer when the land will not
 * have them (no shore, no bottles).
 */
export function eggsOf(seed: string, ground: MomentGround): Egg[] {
  const plan = ground.plan;
  if (!plan) return [];
  const c = plan.centre;
  const out: Egg[] = [];
  const apart = (x: number, y: number) => out.every((e) => Math.hypot(e.x - x, e.y - y) > 14);
  const dry = (x: number, y: number) => openGround(ground, x, y) && !inVillage(plan, x, y, 3);
  const nearSea = (x: number, y: number, r: number) => {
    for (let k = 0; k < 12; k++) if (ground.height(x + Math.cos((k / 12) * Math.PI * 2) * r, y + Math.sin((k / 12) * Math.PI * 2) * r) < 0) return true;
    return false;
  };
  // A bottle lies at the waterline, which random points miss: sweep round the dock (or the green, with
  // no dock) every 5° and 2 m, in an order the seed decides, for barely dry sand with the sea beside it.
  const shoreline = (key: string): { x: number; y: number } | null => {
    const o = plan.dock ? plan.dock.root : c;
    const spots: { x: number; y: number; k: number }[] = [];
    for (let i = 0; i < 72; i++) {
      for (let r = 10; r <= 90; r += 2) {
        const a = (i / 72) * Math.PI * 2;
        spots.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, k: unit(`${key}|${i}|${r}`) });
      }
    }
    spots.sort((p, q) => p.k - q.k);
    for (const { x, y } of spots) {
      const h = ground.height(x, y);
      if (h < 0.02 || h > 1.5 || !nearSea(x, y, 3) || inVillage(plan, x, y, 3) || !apart(x, y)) continue;
      if (blocked(navGraph(plan), { x, y })) continue;
      return { x, y };
    }
    return null;
  };
  for (const kind of EGG_KINDS) {
    for (let n = 0; n < EGG_COUNTS[kind]; n++) {
      const key = `${seed}|egg|${kind}|${n}`;
      let best: { x: number; y: number; score: number } | null = null;
      if (kind === "message-bottle") {
        const at = shoreline(key);
        if (at) out.push({ id: `${kind}:${n}`, kind, x: at.x, y: at.y, facing: unit(`${key}|f`) * Math.PI * 2, variant: Math.floor(unit(`${key}|v`) * 1e6) });
        continue;
      }
      for (let i = 0; i < 220; i++) {
        const a = unit(`${key}|a|${i}`) * Math.PI * 2;
        const r = (kind === "lookout-rock" ? 35 : 25) + unit(`${key}|r|${i}`) * (kind === "lookout-rock" ? 70 : 60);
        const x = c.x + Math.cos(a) * r;
        const y = c.y + Math.sin(a) * r;
        if (!dry(x, y) || !apart(x, y)) continue;
        if (kind === "lookout-rock") {
          // The highest ground of the tries: a lookout is somewhere to look out from.
          const score = ground.height(x, y);
          if (!best || score > best.score) best = { x, y, score };
          continue;
        }
        if (kind === "still-pool" && nearSea(x, y, 6)) continue;
        best = { x, y, score: 0 };
        break;
      }
      if (!best) continue;
      out.push({ id: `${kind}:${n}`, kind, x: best.x, y: best.y, facing: unit(`${key}|f`) * Math.PI * 2, variant: Math.floor(unit(`${key}|v`) * 1e6) });
    }
  }
  return out;
}

/** What a hidden thing says when found: one of its kind's lines, by its variant. */
export const EGG_LINES: Readonly<Record<EggKind, readonly string[]>> = {
  "hollow-stump": [
    "Inside the hollow, wrapped in a leaf: a small fish carved from bone.",
    "Inside the hollow: a wooden bird, its wings worn smooth by hands.",
    "Inside the hollow: a little boat cut from bark, with a mast of a twig.",
    "Inside the hollow: three pebbles, each with a line scratched on it.",
  ],
  "message-bottle": [
    "The note says: \"If you find this, the herons came back this year. Tell someone.\"",
    "The note says: \"I went across the water to see what is there. Do not wait for me.\"",
    "The note is a child's drawing of a house, and a dog, and the sea.",
    "The note says only a name, and a day, a long time ago.",
  ],
  "still-pool": ["The water is so still you can see the clouds go over your own face."],
  "lookout-rock": ["From up here the whole bay is laid out: the roofs, the boats, and the far shore in a haze."],
  "buried-box": ["A small box, rotten at the corners. Inside: a ring of plaited hair, and a shell."],
};

export function eggLine(e: Pick<Egg, "kind" | "variant">): string {
  const lines = EGG_LINES[e.kind];
  return lines[e.variant % lines.length]!;
}
