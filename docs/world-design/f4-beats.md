# Flow 4 beats: repeated games and trust, embodied

The design table for F4, written before the code, in the shape of `f5-beats.md` and F1's table. This
is the document the acceptance bars are judged against, and it exists before any F4 gameplay because
the standing rule is measurement before feature.

Status: **designed, not built.** The capture (`harness/f4/`) is built and passing on everything that
does not need the flow. The beats below are not implemented.

---

## The partner fork, resolved: an NPC

F4 needs a recurring partner, and the answer decides the harness's scope. **It is an NPC**, and this
comes from the design rather than from convenience:

- The F4 asset manifest names it directly: **`f4_recurring_partner` NPC w/ relationship states
  (neutral to ally to wronged)**.
- The F4 easter egg is "an NPC the player consistently helped becomes a steadfast ally who later acts
  on the player's behalf".
- The F3 to F4 transition is "the clearing's NPCs begin to persist and recognize the player ('you
  again') across visits".

**Does an NPC partner materially weaken what F4 measures?** No, and this is worth being explicit
about because it would be the reason to build a two-client harness. F4 measures **the player's
pattern**: tit-for-tat versus exploit versus forgive across rounds, promise-keeping across real
elapsed sessions, how they respond to being wronged, and whether they give when nothing can come
back. Every one of those is a property of the player, not of the pair. The counterpart needs to
persist, to have done something to you, and to remember; it does not need to be human. What an NPC
partner cannot give is the counterpart's own genuine unpredictability, and F4 does not measure that.

Two practical consequences that also point the same way: F4's duration is "ongoing / multi-session"
with promises spanning real elapsed sessions, which a second human would have to be present for
repeatedly; and with Render suspended every visitor is currently in a solo session, so a
human-partner F4 would measure nothing at all today.

So the harness stays single-client. `tieWarmth` is keyed by counterpart id, a plain string, which
works for an NPC id exactly as it does for a user id.

---

## What F4 rides rather than reinvents

`packages/shared/src/islandState.ts` already carries the substrate, verified end to end in ⚑15:

- `tieWarmth: Record<string, number>`, per-counterpart warmth 0..1, **cooling between sessions** at
  `TIE_COOL_PER_DAY` 0.08.
- `tieDeltas` on `DaySummary`, warmth earned today, folded by `closeDay`.
- `tendTie(state, counterpartId, delta)`, the tending function. (Not `warmTie`; the handover record
  had the name wrong.)

**No parallel trust store.** F4 writes through `tendTie` and reads `tieWarmth`.

And the distinction that must never blur: **`tieWarmth` is world state, the homestead remembering who
you tended. The posterior is the person model.** F4 feeds both. Every number in the capture and the
report is labelled WORLD or POSTERIOR.

---

## The trap, and the design rule that follows from it

F4's beats as the spec writes them are **decisions**: a promise kept or broken, a conflict repaired or
not, generosity given or withheld. A decision is a button in disguise, and a button cannot
individuate people. If Tessa keeps her promise and Hank breaks it, the posteriors diverge because two
different choices were scripted, which is the multiple-choice questionnaire this design exists to
escape.

**So every beat below must produce continuous manner scalars even when the branch is held fixed.** The
test each beat has to pass: *if both personas take the same branch, is there still something to
measure?* If a beat's only measurable output is which branch was taken, it is not an F4 beat yet.

---

## Beat 1: the return (promise-keeping across sessions)

You tell the partner you will come back tomorrow. The promise is made by an act, not a menu: you
press your palm to the partner's marker post, which is how a promise is made in this world.

**What the player physically does, next session:** nothing prompts you. The partner is where they
said they would be. Whether you go, how soon in the session you go, and whether you go straight there
or get to it eventually, is the beat.

**Duration:** the whole of the following session, sampled from its first frame.

| Manner scalar | What it measures | Held fixed across personas? |
|---|---|---|
| `return_latency_ms` | how far into the session before you set out for the partner | yes, both return |
| `return_directness01` | path length to the partner over the straight line, from the moment you first move | yes |
| `detoured_first01` | fraction of the session spent on your own errands before going | yes |
| `unprompted` | whether you arrived before any reminder fired | yes |
| `promise_kept` / `promise_broken` | the branch | **the only branch cue** |

Both personas keep the promise. One goes first thing and straight there; the other does three other
things and arrives late. That is the individuation, and it survives holding the branch fixed.

## Beat 2: the repeated exchange (the iterated game)

Across rounds, you and the partner each put something into a shared cache. The partner's behaviour is
a fixed schedule so the player's pattern is what varies.

**What the player physically does:** carry an item to the cache and hold to place it, or walk away
with it. Repeated over rounds within and across sessions.

| Manner scalar | What it measures |
|---|---|
| `rounds_cooperated` / `rounds_total` | the pattern, which is the cue, never a single round |
| `place_latency_ms` per round | hesitation at the moment of committing, round by round |
| `amount01` per round | how much you put in when the amount is yours to choose |
| `response_to_defect01` | what you did in the round **after** the partner took more than their share |
| `cooperate` / `defect` | the branch |

The spec's own note is load-bearing here: **a single defection is not a defector**. The cue is the
pattern over rounds, and the per-round latency and amount are what separate two players with the same
cooperation rate.

## Beat 3: the conflict (being wronged, and what repair looks like in the body)

Once, the partner takes the whole cache. Nothing announces it; you find it empty and their mark on it.

**What the player physically does:** the beat is what happens next, in the body. Do you approach them
at all, and how fast? Do you stop short of them, or close? Do you leave something at their post, or
take something back, or neither?

| Manner scalar | What it measures |
|---|---|
| `approach_latency_ms` | how long before you go to them at all |
| `settle_distance` | how close you stop, the proxemics of a grievance |
| `circled01` | whether you approached directly or went around |
| `repair_hold_ms` | if you leave something, how long you spend on it |
| `forgive` / `retaliate` / `withdraw` / `repair` | the branch |

**This is the beat most at risk of collapsing into a button**, because four named branches invite four
buttons. The design rule: the branch is inferred from what you physically did, not selected. Leaving
something at their post IS repair. Stopping at eight tiles and leaving IS withdrawal. Taking from
their cache IS retaliation. No menu ever appears.

## Beat 4: non-reciprocal generosity

The partner is worse off and cannot return anything, and the world makes that legible: their cache is
empty and they are not at their post.

**What the player physically does:** carry something of yours to their post and leave it, or not. No
one sees. Nothing is owed. Nothing comes back.

| Manner scalar | What it measures |
|---|---|
| `give_latency_ms` | how long before you decide to |
| `amount01` | how much of what you have you gave |
| `trips` | whether you went back for more |
| `cost_paid01` | what it actually cost you, in vitality or in a thing you needed |
| `give_unreciprocated` / `withhold_unreciprocated` | the branch |

---

## Routing, expected

F4's cues are new and most will have no clean existing feature. **Expect to flag more than is
routed**, as F5 did at five and five. First reading, to be confirmed against `ingest.py` when the
beats are built:

| Scalar | Likely disposition |
|---|---|
| `return_latency_ms`, `place_latency_ms`, `give_latency_ms`, `approach_latency_ms` | routed, `decision_latency`, identical definition to every other beat's |
| `rounds_cooperated / rounds_total` | routed, `consistency`, which is norm-internalization and is what a cooperation rate is |
| `repair_hold_ms`, `trips` | routed, `persistence`, same definition as the raft's slips and the gather's thoroughness |
| `promise_kept` / `promise_broken` | routed, `consistency`, the highest-validity integrity cue in the flow |
| `cost_paid01` | **⚑**, same argument as F5's: no anchored feature means what an act cost you |
| `return_directness01`, `circled01` | **⚑**, same argument as F5's `approach_detour01` and `circled01`; `path_tortuosity` was anchored on the P3 sampler's normalized ratio, which these are not |
| `settle_distance` | **⚑**, proxemics of a grievance. `proxemics_close` / `proxemics_far` exist as F2 cues but were anchored at the interaction-open gate, which is a different quantity from where you choose to stop when angry |
| `response_to_defect01` | **⚑**, the tit-for-tat signature. This is the single most F4-specific signal in the flow and it is exactly the one with nowhere clean to go, the same shape as F5's `circled01` |
| `detoured_first01`, `amount01`, `unprompted` | **⚑** pending, no obviously fitting anchored feature |

`response_to_defect01` being unroutable is worth stating plainly now rather than discovering it
later: **the iterated-game signature is F4's whole reason to exist, and the committed W has no
feature for it.** It will be emitted, carried in `raw_signals`, and flagged for the one-time second
re-anchor, which is the correct outcome and not a failure.

---

## What this is not

No points, no scores, no XP, no levels, no win states, no leaderboards, no visible timers. No menu
ever appears for a branch; the branch is inferred from what the body did. The memory wall, if built,
records kept and broken promises as marks and never as a tally. Calm, literary, slightly uncanny.
