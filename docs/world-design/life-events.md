# Life events — a lived past before anyone arrives

> **Status: APPROVED 2026-10-17 as `C40` (all three decisions as recommended), and BUILT** as
> `packages/planet/lib/life.ts` with `tests/life.test.ts`. This is step 1 of the village slice
> (SOCIETY-PLAN §7 step 5): the past as data. Narration, schedules, bodies and memory of players are
> later steps; §7 sketches their contracts so this module's output fits them. Where building it
> proved the proposal wrong, the text below says what changed and why (§4 and §9).

## 0. What this is for

The user's ask, 2026-10-17: NPCs that have **lived a life before they enter the world**, and arrive
"as if reborn" with it — they talk about it, they move, they go to work.

`society.ts` already holds most of a life: who your parents were, the sibling who died at four, the
day you married, the stranger you married, your trade, the day your partner died. What it did not
hold is any of it as **events a person lived through**, nor anything that happened to a village as a
whole. This module turns the substrate into a dated, shared, checkable life story, without an LLM and
without changing one person in the substrate.

The LLM comes later and only narrates (§7). It never invents a fact: every name and date it may use
is in this module's output.

## 1. The rules this keeps

- **L2, extended to events.** A life read to day N is the same life read to any later day, filtered
  to N. The one thing that may appear "in the past" when the horizon moves is an incomer's birth
  elsewhere, because they did not exist in the village's list until they arrived; the test allows
  exactly that and nothing else.
- **Inert against the substrate** (decision 1). `society.ts` output is byte-identical, and C33
  reproduces (C40 has the three proofs). Events EXPLAIN demographic facts; they never cause them.
- **L1 / C26.** Kinship events are readings of immutable facts. Friendships, rifts and trades learned
  are relationships and employment, which C26 makes mutable: here they are the **prior**, and a later
  delta (SOC-6.C) may override them. They never write back.
- **SOCIETY-PLAN §5, and the module's own header** (`society.ts:43-48`): differentiation comes from
  circumstance. Temperament (§5) is the one deliberate exception, and says why.
- **Design Law 1.** No event kind, field or detail is a ladder; pinned by a test.

## 2. A finding first: alive is not here

`alive(p, day)` is `birthDay <= day < deathDay` (`society.ts:471`). An incomer is born elsewhere
years before they marry in (`society.ts:662-673`), so for every day between their birth and their
arrival they are *alive* and *not in the village*. `census()` does not distinguish the two.

**Measured** over 60 cells: of 1,813 incomers alive five years before they arrived, 1,813 are counted
in `census(s, thatDay).alive`; founders, 720 before the founding day. Nothing shipped is affected —
the full account is `⚑32`. This module asks about the past constantly, so it uses its own predicate,
`present(s, p, day)`: alive AND arrived.

## 3. The module

`packages/planet/lib/life.ts`, pure, in `society.ts`'s idiom. `society.ts` changed by one exported
word (`stream`, so there is one stream implementation, L5) and two comments.

- `lives(s): Map<id, LifeEvent[]>` — every life at once, because a teacher's life holds the
  apprentices who chose them and a friendship has two sides. `lifeOf(s, p)` exists and computes the
  whole to return one.
- `chronicle(s): VillageEvent[]` — completed world years only.
- `temperaments(s)` / `temperamentOf(s, p)` — eight numbers per person (§5).
- `causeOfDeath(p)`, `present(s, p, day)`.

`LifeEvent` is `{ key, day, kind, subject, with, detail }`, keyed `${id}/${kind}[/${other id}]`.
`VillageEvent` is `{ key, year, kind, witnesses, dead }`.

**Streams are keyed on `Person.id`, not `seedKey`.** A `seedKey` doubles per generation (36,037
characters at the longest; `⚑33`) and every draw reads all of it. What a semantic key would buy over
`id` — stability if the substrate inserts a person — is already lost by then, since that changes every
`id` after it.

**Why the horizon filter is safe.** An event on day D reads only facts settled on or before D: everyone
`present` on D comes from a pairing on or before D, and death days are drawn at birth. Every
computation that would read the future stops BEFORE it reads it (`d <= horizon` comes first), and is
never filtered afterwards in the hope that it did not matter.

## 4. Event kinds, as built

**A. Kinship — read off the substrate, no draws.** `born`, `arrived` (founders at the founding,
incomers on their wedding day), `married`, `left-home`, `child-born`, `child-died`, `sibling-born`,
`sibling-died` (only if you were alive for it), `grandchild-born`, `parent-died`, `widowed`, `died`.

**B. Lives — own draws, keyed `${id}/…`.**

| kind | rule |
|---|---|
| `learned-trade` / `taught` | At 12–15, if present. The teacher is a parent in the same trade who is here; else a present adult of 25–60 in it; else nobody (`with: []`). Founders and incomers brought their trade. The teacher's life carries `taught`. |
| `befriended` / `friend-died` | **Changed while building.** Two windows, one symmetric decision per pair per window: *childhood* (both village-born, ≤ 3 years apart, decided at the younger's 8th year) and *adulthood* (≤ 10 years apart, decided when the younger is 20 or the later of them arrives, 2.5× likelier in the same trade; detail `"work"`). Chance is divided by the village's **headcount at the start of that year**. The proposal had one childhood window at a fixed chance, which left 82–95% of adults friendless; normalising by capacity still left the coast at median 0. Pairs are excluded only if already married **on the day** (the L2 test caught the "ever married" version). |
| `rift` / `reconciled` | When the last founding partner of a household dies leaving two or more adult children here: 15% a rift between the two eldest; 55% of those make peace 2–20 years later, if both live. |
| cause on `died` | **Changed while building: a function of age and trade only, never of the chronicle.** Under 6: `childhood-illness`. Under 50: the trade's hazard with a trade-weighted chance (fisher `sea`, miner `collapse`, stonecutter `quarry`, forester `falling-tree`, carter `road`), else `illness`. 50–70: `illness`. 70+: `old-age`. The proposal let causes read the chronicle, which would have changed a death's cause on the day its year closed. **`childbirth` was cut**: 0 of 9,374 deaths, because death days are drawn independently of anyone's children. |

**C. The village chronicle — completed years.** Inferred, and so consistent with the graves: `fever`
(two or more child deaths in a year; three happened 11 times in 376 villages, two happens 216 times)
and `storm` (anyone lost at sea, where `coastal > 0.3`). Drawn, killing nobody in v1: `hungry-year`
(likelier on poor ground) or `fire` (likelier in woodland), at most one a year. Witnesses are everyone
present and at least five at mid-year.

## 5. Temperament: the one exception, and why

`society.ts:43-48` says nothing there writes a personality. This module adds one, separately,
because (1) if the substrate supplies none, the model supplies its own, which is the thousand hats
SOCIETY-PLAN §5 warns about; and (2) SOC-6.F expects axis vectors from a demographic model, and
putting villagers on the **player's eight axes** is what lets BALD choose among the people nearby.

Eight numbers in `[-1, 1]`, in `PERSONA_AXIS_KEYS` order. Founders and incomers draw from a prior with
standard deviation 0.4. A child is `h·mean(parents) + sqrt(1 − h²/2)·noise`, `h = 0.5`. That noise
weight keeps the population's spread across generations; the naive `(1 − h)·noise` collapses it, and
the test that pins the spread fails on it. Constant over a life in v1 (decision 2). `@echo/planet`
cannot import `@echo/shared`, so `TEMPERAMENT_AXES = 8` is pinned to `PERSONA_DIM` by a test in
`apps/web`.

## 6. Gates (all built, all green)

`tests/life.test.ts` (13) and `apps/web/tests/temperamentAxes.test.mts` (2). C40 lists them and the
four injected defects each was shown to catch. Cost: a whole village's lives, chronicle and
temperaments take about an eighth of `settlementAt` on the same cells.

## 7. What comes after (contracts only)

- **Awakening (step 2).** The first time anyone meets a person, one call to a cheap model turns
  `temperamentOf` + `lifeOf` + the chronicle years they witnessed into first-person memories, each
  citing the event keys it rests on. A validator rejects any memory naming a person or a year missing
  from the input. Stored keyed on `Person.id`, never regenerated; later events are narrated
  incrementally. L3 holds: nothing narrated or said becomes a world fact.
- **Schedules (step 3).** `whereIs(person, worldTime)` as a pure prior shaped by trade, age and these
  events (a widow at the grave on the anniversary, a retired miner on the commons), with delta
  overrides. This refines `society.ts:22`, which files "where someone is standing this afternoon"
  under delta: the prior is closed form and the delta overrides it.
- **Memory of players (step 5).** Sparse delta rows (SOC-6.C) keyed on a **signed** player id, in the
  erasure cascade, transferring degraded to kin on death (SOC-6.I). `⚑33` must be settled before the
  first such row exists.

## 8. Decisions (taken 2026-10-17, as `C40`)

1. Events do not feed back into demography in v1.
2. Temperament is constant over a life in v1.
3. Temperament is on the eight player axes.

## 9. Size

Built in one session, with the friendship calibration taking most of it. The proposal said 1–2 weeks
as an estimate; it is not evidence about the later steps, which need a model call (2), geometry (3)
and the frame budget (4).
