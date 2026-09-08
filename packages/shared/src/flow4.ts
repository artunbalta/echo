/**
 * Flow 4 — "Repeated Games & Trust", embodied.
 *
 * Four beats with ONE recurring partner: the return (a promise kept across sessions), the repeated
 * exchange (the iterated game), the conflict (being wronged), and non-reciprocal generosity. See
 * docs/world-design/f4-beats.md for the beat table this implements and for the partner fork.
 *
 * THE TRAP THIS IS BUILT AGAINST. F4's beats as the level design writes them are DECISIONS: a
 * promise kept or broken, a conflict repaired or not, generosity given or withheld. A decision is a
 * button in disguise, and a button cannot individuate people — if one persona keeps the promise and
 * the other breaks it, the posteriors diverge because two different choices were scripted, which is
 * the multiple-choice questionnaire this whole design exists to escape. So every beat below emits
 * CONTINUOUS manner scalars that survive holding the branch fixed, and the test each had to pass is:
 * *if both personas take the same branch, is there still something to measure?*
 *
 * AND NO MENU EVER APPEARS. The branch is inferred from what the body did. Leaving something at
 * their post IS repair. Stopping short and turning away IS withdrawal. Coming close, standing there
 * and doing nothing hostile IS forgiveness. Taking from the cache IS retaliation. The conflict beat
 * is the one most at risk of collapsing into four buttons, and it is the one where this matters most.
 *
 * WHAT IT RIDES. `tieWarmth` / `tendTie` in islandState.ts, not a parallel trust store, and
 * `promisedTo` on the same persisted state so the return beat spans real sessions. tieWarmth is
 * WORLD state (the homestead remembering who you tended); the posterior is the PERSON model. F4
 * feeds both and they are never conflated.
 */
import type { EmbodiedCueDef } from "./flow1.js";

/**
 * The F4 cue vocabulary. Channel G (bonds/relationship) for the relational beats, Channel F for the
 * exchange's resource commitment, in the shape f5.ts declares its own.
 *
 * Every `axisPrior` marked ⚑ is a cue with NO anchored feature in the committed W. It is emitted,
 * carried in `raw_signals` for the second re-anchor's corpus, and NOT routed. `response_to_defect01`
 * is the important one: the iterated-game signature is F4's whole reason to exist and it is exactly
 * the cue with nowhere clean to go, which is the same shape as F5's `circled01`.
 */
export const FLOW4_CUES = {
  make_promise: {
    channel: "G", cue: "G7", action: "promise_made",
    targetKind: "npc",
    axisPrior: "committing to a future act → conscientiousness/integrity; the KEEPING is what is measured",
  },
  keep_promise: {
    channel: "G", cue: "G7", action: "promise_kept", refuseAction: "promise_broken",
    targetKind: "npc",
    axisPrior:
      "did what you said you would, across real elapsed sessions → consistency (existing, 0.9/0.1, " +
      "the same anchor return_cache/keep_cache carries); return_directness01 / detoured_first01 / " +
      "unprompted ⚑ unrouted",
  },
  exchange_round: {
    channel: "F", cue: "F7", action: "cooperate", refuseAction: "defect",
    targetKind: "resource",
    axisPrior:
      "the PATTERN over rounds → consistency (a cooperation rate is norm-internalization); " +
      "stake_amount01 and response_to_defect01 ⚑ unrouted — a single defection is not a defector",
  },
  conflict_repair: {
    channel: "G", cue: "G8", action: "repair",
    targetKind: "npc",
    axisPrior: "mending it with your hands → persistence (held work, the raft's own anchor); settle_distance ⚑",
  },
  conflict_forgive: {
    channel: "G", cue: "G8", action: "forgive",
    targetKind: "npc",
    axisPrior: "came close, stayed, did nothing back → approach (existing); settle_distance / circled01 ⚑",
  },
  conflict_retaliate: {
    channel: "G", cue: "G8", action: "retaliate",
    targetKind: "resource",
    axisPrior: "took back from their share → risk_index (existing dominance-driving anchor)",
  },
  conflict_withdraw: {
    channel: "G", cue: "G8", action: "withdraw",
    targetKind: "npc",
    axisPrior: "stopped short and turned away → approach=false + solitude_tol (the existing withdrawal read)",
  },
  give_unreciprocated: {
    channel: "F", cue: "F7", action: "give_unreciprocated", refuseAction: "withhold_unreciprocated",
    targetKind: "npc",
    axisPrior:
      "gave where nothing can come back → ts_social via gift_amount01 (the existing F7 give/share " +
      "anchor sets ts_social = amount); cost_paid01 ⚑ unrouted, exactly as in F5",
  },
} as const satisfies Record<string, EmbodiedCueDef>;

export type Flow4CueKey = keyof typeof FLOW4_CUES;

/**
 * Scene config. Offsets are egocentric tiles from the home-island centre, the convention
 * FLOW0_AFFORDANCES, RAFT_BUILD and FLOW5_PROBES all use, snapped to walkable land at placement.
 *
 * The geometry is doing design work, not decoration. Their post and the shared cache sit on opposite
 * sides of the player's own store, so "go straight to them" and "get to your own errands first" are
 * genuinely different paths and `return_directness01` / `detoured_first01` have something to read.
 */
export const FLOW4_SCENE = {
  /** Where the recurring partner stands, and where their post is. The post stays when they do not. */
  partner: { dx: 8, dy: -4 },
  post: { dx: 6.6, dy: -5.2 },
  /** The cache you both put into, between the two of you. */
  cache: { dx: 1.5, dy: -6 },
  /** Your own store — where what you have to give comes from. Opposite their post, deliberately. */
  store: { dx: -5, dy: 3 },
  /** Two errands of your own, so "I got to it eventually" is a real path and not an idle timer. */
  errands: [
    { dx: -7, dy: -2 },
    { dx: -2, dy: 7 },
  ],

  /** How close you must be to act on a thing. Matches F5's reach so the two feel the same. */
  reach: 1.6,
  /** Approach sampling starts here, as in F5. */
  aware: 9,

  return: {
    /** Hold at the post to press your palm to it — how a promise is made in this world. */
    promiseMs: 1800,
    /** The reminder whisper. Arriving before it is `unprompted`; it never says "you promised". */
    remindAfterMs: 25000,
    /** Walking this far from the partner AFTER the reminder is the broken branch. */
    leaveRadius: 14,
  },

  exchange: {
    rounds: 4,
    /** The round the partner takes more than their share. Nothing announces it. */
    defectRound: 3,
    /** Hold at the cache to place: how long you hold is how much you put in. */
    placeMs: 2600,
    /** Carrying your stake from the store to the cache is the round's real cost in time. */
    stages: 3,
  },

  conflict: {
    /** Stopping inside this and staying is coming close; the grievance's proxemics. */
    closeAt: 2.2,
    /** Turning away from further out than this, without acting, is withdrawal. */
    shortAt: 4.0,
    /** How long you must hold a distance for it to count as where you settled, not where you passed. */
    settleMs: 800,
    /** Hold at their post with something of yours to mend it. */
    repairMs: 2400,
    /** Hold at the emptied cache to take back what is left of their share. */
    retaliateMs: 1600,
  },

  generosity: {
    /** Hold at their post to leave what you carried. Progressive: the hold is the amount. */
    giveMs: 3000,
    /** Real cost, drained as you carry and place. Felt, never shown as a number. */
    vitalityCost: 0.06,
  },

  displayH: { partner: 26, post: 20, cache: 16, store: 16, errand: 18 },

  /** Four new prop kinds; everything else reuses what the island already has. */
  sprites: {
    partner: "proc:recurring_partner",
    post: "proc:promise_post",
    cache: "proc:shared_cache",
    cacheFull: "proc:shared_cache_full",
    store: "proc:buried_cache",
    errand: "proc:berry_bush",
    mark: "proc:marker_stone",
  },
} as const;

/** Which beat of F4 is live this session. One at a time, so a capture can drive exactly one cell. */
export type Flow4Beat = "promise" | "return" | "exchange" | "conflict" | "generosity";
