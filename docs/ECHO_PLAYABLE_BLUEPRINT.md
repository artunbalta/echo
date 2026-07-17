# ECHO — The Playable Doppelgänger Blueprint

> **Working title of this document:** *From "a place you stand" to "a life you live."*
> **Scope:** a single, drop-in build spec that turns ECHO from an explorable world into a
> playable, scarcity-driven life whose every second doubles as a measurement of the person
> — so the echo it grows is a faithful behavioral doppelgänger.
> **Grounding:** every recommendation below cites a real file, constant, module, or design
> doc already in `github.com/artunbalta/echo`. Nothing here contradicts the invariants in
> `docs/world-design/stage-map.md`; it *completes* them.
> **Authors (role-play panel):** (I) Game Level Engineer · (II) ML/AI Engineer · (III)
> Psychologist–Philosopher / Human Analyst · (IV) Mathematician · (V) UX Lead.
> Experts II–IV answer one shared question in their own idiom — *what makes a human human,
> and how can that be simulated inside a computer?* — and I + V co-own the felt experience
> and the zeroing of friction.

---

## 0. Read this first — the diagnosis and the one-sentence thesis

### 0.1 What ECHO already is (and it is a lot)

ECHO is not a thin prototype. Under the hood it already has:

- **A calibrated measurement brain** (`services/ml/echo_ml/`): a full-covariance Bayesian
  persona posterior `q(z|H)=N(μ,Σ)` over **8 bipolar axes** — `warmth, dominance, openness,
  energy, formality, intellect, pace, affect` (`packages/shared/src/persona.ts`,
  `services/ml/echo_ml/persona.py`) — updated by a robust Student-t + Mahalanobis-gated
  Kalman step, a learned measurement matrix `W` (`persona_model.py`), a reward head
  (`reward.py`), a calibrated autonomy gate (`gate.py`), BALD active learning (`bald.py`),
  and per-bucket autonomy with hysteresis (`autonomy.py`).
- **A complete cue design on paper**: an 8-stage "life" (`docs/world-design/stage-map.md`),
  an 11-channel cue taxonomy A–K (`docs/world-design/cue-catalog.md`), a mandatory context
  envelope (`docs/world-design/event-schema.md`), and an individuation eval
  (`docs/world-design/individuation-eval.md`).
- **A real, deterministic world**: a 768×768 shared ocean holding a phyllotaxis archipelago
  of 100 island slots (`packages/shared/src/archipelago.ts`), authoritative 20 Hz Colyseus
  multiplayer with prediction/reconciliation (`docs/MULTIPLAYER.md`), distance-gated presence
  (`PRESENCE` in `world.ts`), 100 spanning NPCs (`packages/shared/src/npcgen.ts`), and a
  zero-key mock path for everything.

**The brain is arguably ahead of the body.** That is the whole problem.

### 0.2 What the user actually feels ("you just spawn on an island and stuff is around")

`docs/ux-audit.md` already names this precisely, and it agrees with the user:

- **Stage 4 (dead air):** *"You step through into a quiet field… the world reads as 'nothing
  to do.'"* (finding **M2**).
- **Stage 8 (the payoff has no UI):** *"The handover does not exist"* (finding **B1**).
- **Recognition invisible:** *"is it learning me?" is unanswerable at a glance* (finding **B2**).

And `docs/known-gaps.md` names the deeper structural hole:

- The measurement matrix `W` **was anchored on "the island day-loop economy (time-shares,
  save/risk/persistence)"** — *but that economy is not actually built as a compelling loop.*
  Stages 0–1 exist as **stations** (`pet`, `grain`, `tidepool`, `raft`, `berry_bush`,
  `book_cairn`, `bedroll`, `campfire`) but not as a **survival system with teeth**.
- **`openness` is effectively unmeasured** end-to-end (the scheduled one-time `W` re-anchor):
  there is no telemetry→openness path, so novelty/exploration — the most Minecraft-like,
  most individuating behavior — currently reads as *dominance/warmth*.
- The **continuous passive sampler** (movement/heading/dwell every ~1.5 s) is **not built**
  (gap #2), so the least-fakeable channel (locomotion) is under-sampled.
- **Multi-session world memory** and the **F1 economy** are not built (gap #5), so nothing
  *persists*, *decays*, or *compounds* — the three things that make survival matter.

### 0.3 The thesis (one sentence)

> **ECHO's missing spine is a scarcity-driven survival economy: the same loop that makes free
> play genuinely compelling (Minecraft-like agency, but with real irreversibility and real
> loss) is *identical* to the apparatus that manufactures high-identity-per-bit measurement.
> Build the scarcity engine, and you simultaneously fix "not playable" and "the doppelgänger
> is thin."**

Everything below serves that one sentence. The five experts each argue *why* it is true from
their domain; I + V then specify the second-by-second experience, and the code spec makes it
real.

### 0.4 The four design laws every recommendation obeys (do not break these)

Lifted from `stage-map.md` §0 and the repo's stated invariants; non-negotiable because
breaking them breaks either the science or the ethics.

1. **No game-layer overlay.** No XP, scores, levels-you-beat, streaks, win-states, or quest
   checklists. "Difficulty" comes from **scarcity and irreversibility**, never from a progress
   bar. (Invariant 1.)
2. **Non-choice is data (never coerce).** Every affordance is skippable; refusal is a
   first-class Channel-K cue. The BALD director *raises salience*, never forces an act.
   (Invariant 2.)
3. **Identity lives in the conditional signature, not the act.** The engine measures *slopes*
   — warm-to-friends/cold-to-strangers, generous-in-private/performative-in-public — so the
   world must systematically stage the *same* act under different `counterpart_status`,
   `audience_size`, and `public_or_private`. (Invariant 5.)
4. **Every survival mechanic is a cue emitter, and every cue is paid for by a felt game
   reason** (added by this blueprint, defended by all five experts). No mechanic exists only
   to measure; no measurement exists without a mechanic the user would want anyway. *Fun and
   measurement are the same surface, or the design has failed.*

---

# PART I — GAME LEVEL ENGINEER

### Report I.1 — What is actually broken (and it is not "content")

The instinct when a world feels empty is "add more stuff." That is the wrong fix here and it
would actively hurt the measurement. The world feels empty for three structural reasons, none
of which is a content shortage:

1. **No pressure gradient.** In `IslandClient.tsx` the stations (`berry_bush`, `book_cairn`,
   `bedroll`, `grain`, `tidepool`, `raft`, `campfire`) exist, but nothing *forces a tradeoff
   between them*. Minecraft is not fun because it has blocks; it is fun because night is
   coming, you are hungry, and you have not built shelter — three clocks running at once
   against a finite you. ECHO has stations but no clocks. **A choice with no cost is not a
   choice, and a choice with no cost measures nothing** (see Expert IV, §IV.3 on information
   and opportunity cost).
2. **No irreversibility.** `stage-map.md` calls the grain fork "irreversible," but if the day
   never ends and nothing is ever lost, "irreversible" has no teeth. The user learns within
   30 seconds that nothing they do matters, and correctly stops investing. **Stakes are the
   substrate of both engagement and measurement.**
3. **No compounding across sessions.** Gap #5 (`known-gaps.md`): no multi-session world
   memory. So the island is a diorama that resets, not a homestead that remembers. Return
   hooks (`ux-audit.md` M5/return) are impossible without persistent state that *changed
   because you were there*.

### Report I.2 — The design move: a **survival economy** as the world's spine

I am *not* proposing a survival shooter. I am proposing the smallest set of interacting clocks
that (a) make free play tense and meaningful in the calm, literary tone ECHO already owns, and
(b) manufacture exactly the economic/locomotion/moral contrasts the cue catalog wants. This is
"Minecraft's tension, Journey's tone."

**The three clocks (the whole game-feel in one table).**

| Clock | Game meaning | Runs on | The tradeoff it forces | Cue channels it feeds |
|---|---|---|---|---|
| **Vitality** (hunger/warmth composite, 0–100) | you decay if you don't sustain yourself | real-time + per-action drain | eat *now* vs invest the calorie in work/learning | F (economic), I (affective under stress) |
| **Daylight** (the day is a finite budget of "hours") | the day *ends* at the campfire; you get N action-hours | discrete action points per day | how to spend a finite life-unit: earn / learn / build / rest / socialize | A5 time-share, C tempo, F economic |
| **Season / decay** (world state ages between sessions) | crops wilt, structures weather, ties cool | wall-clock across sessions | tend what you have vs reach for the new | G7 tie-persistence, F6 investment, K abandonment |

These three are deliberately the *same three* the ML `W` was already anchored on
("time-shares, save/risk/persistence" — `known-gaps.md`). **We are not inventing an economy;
we are shipping the economy the brain already expects.** This closes gap #5 *and* the
"W anchored on an economy that isn't playable" mismatch in one move.

**Scarcity is the difficulty knob, and it is already in the schema.** The `scarcity_level`
context field (`stage-map.md`, "Contrast lever: `scarcity_level`") is the single dial. A lean
day makes every allocation costlier, which (Expert IV, §IV.3) *raises identity-per-bit*: the
same person reveals more of themselves per action when the action costs more. So **harder =
better measurement**, which is exactly the user's intuition ("Minecraft gibi çok kolay
olmamalı… çünkü ölçülmek istenen o insanın dopplegangerını yaratmak"). Difficulty is not
punishment; it is resolution.

**Why not just make it hard like a roguelike?** Because death-with-total-reset destroys the
*longitudinal* signal (Stages 6–7 need history). ECHO's difficulty must be **soft-irreversible**:
you can lose a crop, a structure's progress, a cooling friendship — real, felt, compounding
losses — but never your *self* (the posterior) or your island (the slot in
`archipelago.ts`). Loss is a scar the world remembers, not a game-over. (See §I.6 on death.)

### Report I.3 — Levels are not levels: the archipelago **is** the level graph

ECHO's genius, already built, is that the "levels" are **regions of the one shared ocean**,
not gated rooms. `stage-map.md` §9 nails this: stages are *affordances that open*, non-linear,
revisitable, skippable. My job as level engineer is to make that graph **legible as a place
you traverse** without ever adding a wall or a "Level 2" sign. The connective tissue is
**geography + the raft**, both already in the codebase.

**The macro-layout (all real today).**

- Every user **owns one island** (`placeUser` in `archipelago.ts`), their solitary Stage-0/1
  home. This is the calibration baseline — behavior with *no audience* (`stage-map.md` Stage 0).
- Islands sit ~36 world-tiles apart with ~10 tiles of open water between grass edges
  (`world.ts` MAP comment): **a readable stretch of sea you sail across.** The distance is the
  friction that makes Stage 2 (the sighting) and Stage 3 (the crossing) *feel* like crossing.
- New users cluster around the most-recently-joined island (`nearestEmptySlot`), so your first
  neighbor is spatially close — the cold-start fix is already done. **Your Stage-2 stranger is
  literally the person who joined just before or after you.**
- `PRESENCE` tiers (`world.ts`) already gate identity by distance: `CLOSE` (2.0 tiles) names +
  enables interaction/social measurement; `APPROACH` (5.0) and `HORIZON` (40.0) render a sharp
  but *anonymous* figure ("someone is out there"). **This is the Stage-2 "figure across the
  water" mechanic already implemented — it just needs a reason to matter.**

**The level graph, then, is:**

```
        [your island: Stage 0/1 — solitude + scarcity]
                     |  build the raft (start_ship)  <-- the ONE gate, and it is self-imposed
                     v
        [the crossing: Stage 2 sighting -> Stage 3 first contact]
                     |  sail toward people vs empty novel islands  <-- openness vs warmth split
                     v
        [a peopled island / the town: Stage 4 — status, audience, norms, market, queue]
              /            |             \
     [Stage 5 vocations]  [Stage 6 bonds]  [Stage 7 private moral pressure]
        (five doors)     (repeated games)   (costly good, no one watching)
```

The only "gate" in the entire game is **the raft you choose to build** — and choosing *not*
to build it (K4) is one of the strongest cues in the system (high solitude-tolerance, low
openness). That is the deepest expression of Law 2: the gate is self-imposed, so refusing it
is data, not a dead end.

### Report I.4 — The core loop, second-resolved (the "day")

This is the beating heart. One **day** is ~6–10 minutes of real time and is the atomic unit of
both play and measurement. It is a loop, not a level; it repeats, deepens under scarcity, and
compounds across sessions. (The full clock-by-clock storyboard is in **Part VI**; here is the
engineer's spec of the loop's *shape*.)

**Day structure (finite action-budget model).**

- The day grants a budget of **daylight** — model it as continuous real-time with a visible
  sun arc, *not* discrete AP (AP feels boardgame-y and breaks the calm tone). The pressure is
  that the **campfire/`end` action** closes the day, crops advance a growth tick, decay
  applies, and tomorrow's scarcity is a function of today's choices.
- Within the day the person freely allocates attention across the **five verbs**, each mapped
  to an existing station and an existing cue:

  | Verb | Station (exists) | Vitality effect | Primary cue | Axis it loads |
  |---|---|---|---|---|
  | **Forage / Earn** | `berry_bush` | + | `ts_earn`, F5 effort-to-earning | energy, conscientiousness |
  | **Study / Learn** | `book_cairn` | 0 (costly when hungry) | `ts_learn`, A5, J6 | intellect, openness |
  | **Build** | `raft` / structures | − (invests calories) | `structure_progress`, C7, F6 | conscientiousness, dominance |
  | **Rest / Leisure** | `bedroll` | + (recovers, spends time) | `ts_leisure`, C10 | affect, low-energy |
  | **Tend / Bond** | `pet_1`, later NPCs | + warmth (private) | `pet_talk` valence D11, I4 | warmth |

- Two **forks** punctuate the day, both already specced:
  - **The grain fork** (`grain`, `plant_or_spend`, ripens `GROW_MS=14000`): eat-now (certain,
    immediate) vs save-seed (deferred, compounding). *Irreversible, private.* Splits **intellect
    vs pace** (delay discounting with no audience — the cleanest possible read; Expert III §III.4
    on time preference, Expert IV §IV.4 on hyperbolic discounting).
  - **The tide wager** (`tidepool`, `tide_wager`): risky-vs-steady bet. `risk_index`, F3. Splits
    **dominance/openness/energy** (risk appetite).

**The loop's felt arc (why it doesn't bore):** morning = orientation + one soft pull (the
recognition meter waiting at zero, `ux-audit.md` M2); midday = the allocation squeeze (three
clocks tighten, a fork appears); dusk = a quiet reckoning at the campfire where the day's
consequence lands and **the echo shows you one thing it learned about you today** (this is the
mirror beat, `ux-audit.md` M1 — see §V for the exact copy rules). The dusk beat is the *entire*
retention mechanic and it is honest: it only ever reports a *real* axis that moved.

### Report I.5 — Connecting the days: **persistence, decay, and the return hook**

This is gap #5, and it is the difference between a diorama and a life.

- **Persist island state across sessions** (Supabase when keyed, in-memory `Store` when not —
  the seam already exists in `archipelago.ts`'s `IslandStore` and the venue `Store`). State to
  persist: crop stage, structure progress, vitality carry-over, `scarcity_level`, tended-tie
  warmth per counterpart, and the day counter.
- **Decay between sessions** (wall-clock aware): crops wilt if untended past a window;
  half-built structures weather (progress decays slowly); friendship warmth cools toward
  baseline (feeds G7 tie-persistence, the Stage-6 signal). Decay is the *teeth* of
  irreversibility and the engine of the return hook — you come back because *something you care
  about is at risk*, not because a streak counter demands it (Law 1).
- **The honest return hook** (`ux-audit.md` M5): on re-entry the world *shows what changed
  while you were gone* — "your grain ripened; the raft you started has weathered a little; the
  figure you met has drifted to another shore." And once the echo reaches `auto` in a bucket
  (Stage 8 handover, `ux-audit.md` B1), the strongest hook of all: *"while you were away, your
  echo crossed to the next island and met two people — here's who's worth meeting yourself."*
  This is the one return hook the product was *built* for and it is non-manipulative because it
  only reports real autonomous activity.

### Report I.6 — Difficulty, death, and "harder than Minecraft" — done right

The user is explicit: *not as easy as Minecraft*, because the goal is a real doppelgänger.
Here is how to make it genuinely hard **without** breaking the longitudinal signal or the
no-game-layer law.

- **Soft-irreversible loss, never hard reset.** If vitality hits zero you don't "die and
  respawn fresh" — you **collapse**: you lose the day, the world advances (crops decay, ties
  cool), and you wake weakened at higher `scarcity_level`. The *self* (posterior) and the
  *island* (slot) are never lost. This is harder than Minecraft (loss compounds; there is no
  clean slate) but it is not roguelike-cruel (you are never erased). Expert III (§III.6)
  defends this as the difference between *stakes* (motivating) and *trauma* (disengaging).
- **Scarcity as the difficulty curve, tuned by BALD, not by a designer.** `scarcity_level`
  rises with poor allocation and can be *raised deliberately by the BALD director* (`bald.py`,
  `stage-map.md` §11) when the posterior is uncertain on an axis a lean day would resolve. So
  the game gets harder *exactly where it would learn the most about you* — difficulty is
  personalized information-seeking, not a global slider. (Expert II §II.5, Expert IV §IV.6.)
- **No hand-holding, few affordances labeled.** Discoverability is via *legible affordances*
  (a bush that visibly has berries, a cairn that visibly holds books), not tooltips and quest
  markers. The one exception is a single first-day orientation nudge (`ux-audit.md` M2) that
  dismisses itself. Everything else you find by exploring — and *how* you explore is the
  openness cue we are about to fix (Expert II §II.4).
- **Meaningful scarcity of *people*, too.** Islands are far apart; crossing costs a built
  raft and real sailing time. So social contact is scarce and therefore *valued* and
  *revealing* — who you spend a scarce crossing on (empty novel island vs a peopled one) is
  the openness-vs-warmth split (`stage-map.md` Stage 2 signature dilemma).

### Report I.7 — The engineer's non-negotiables handed to UX (Expert V)

The level design only works if friction is zero at the exact moments pressure is highest. I
hand Expert V four hard constraints (V picks up each in Part V):

1. **The recognition meter must be always-glanceable** and sit at zero on day 1, visibly
   *waiting* (`ux-audit.md` B2). It is the world's only HUD ambition.
2. **The dusk mirror beat must never feel like a report card** — one sentence, in-tone, bound
   to one real axis (`ux-audit.md` M1). It is the retention mechanic; if it reads as
   gamified, retention *and* trust die.
3. **Movement must be perfect on touch and keyboard** (`ux-audit.md` M6) because locomotion is
   the least-fakeable cue channel (Expert II §II.4) — bad controls corrupt the purest signal.
4. **Scarcity must be *felt* before it is *understood*** — the sun visibly lowering, the bush
   visibly thinning, vitality as a diegetic body-state (warmth of the sprite, not a red bar).

### Report I.8 — Literature the level design stands on

- **Csikszentmihalyi (1990), *Flow*** — the engagement loop is a flow channel: challenge (the
  three clocks) tracked to skill; boredom (no clocks) and anxiety (roguelike cruelty) are the
  two failure walls the difficulty tuning stays between.
- **Malone (1981), "Toward a theory of intrinsically motivating instruction"** — challenge,
  curiosity, control, fantasy: ECHO's calm world leans on *curiosity* (novel islands) and
  *control* (free allocation), not fantasy/score.
- **Deci & Ryan, Self-Determination Theory (1985; 2000)** — autonomy, competence, relatedness.
  The no-coercion law (Law 2) *is* autonomy support; scarcity supplies competence stakes;
  Stages 2–6 supply relatedness. Intrinsic motivation is the only motivation ECHO is allowed
  to use (no extrinsic score).
- **Juul (2013), *The Art of Failure*** — failure that is *legible and one's own fault*
  motivates; arbitrary failure disengages. Soft-irreversible collapse (§I.6) is designed to
  be legible and attributable.
- **Hunicke, LeBlanc, Zubek (2004), MDA framework** — we design *mechanics* (clocks) to
  produce target *dynamics* (allocation tension) to yield the *aesthetic* of "a life with
  weight." The cue system is downstream of the same dynamics.
- **Schell (2008), *The Art of Game Design* (lenses of Endogenous Value, of the Economy)** —
  value must be created *inside* the system (a saved seed matters because tomorrow is lean),
  never imported from an external score.
- **Chris Hecker, "Achievements Considered Harmful?" (2010)** — extrinsic reward markers
  crowd out intrinsic motivation and *contaminate the very disposition ECHO measures*. This is
  the game-design argument for Invariant 1, and it is why the meter must never read as XP.

---

# PART II — ML / AI ENGINEER

*Answering: what makes a human human, and how can it be simulated in a computer?*

### Report II.1 — The ML framing of "a human"

From a machine-learning standpoint, a person is not a label and not a static trait vector. A
person is a **policy**: a conditional distribution `π(action | context, history)` that is
(a) *stable* enough to be recognizable across contexts, (b) *conditional* enough that the same
person behaves differently by situation, and (c) *non-stationary* enough to drift slowly over
time. "Simulating a human" therefore means learning a policy whose *conditional signatures*
match the target person's — not one that scores high on a personality quiz. ECHO already
encodes exactly this stance: the doppelgänger objective in `reconstruct.py` is
**behavioral-reproduction fidelity** `L(z)`, not trait-label accuracy. That is the single most
important architectural decision in the repo and everything below protects it.

Three properties make the problem tractable *and* faithful:

1. **Low-dimensional cause, high-dimensional expression.** A short latent `z` (the 8 axes,
   `persona.ts`) generates a huge variety of behavior through a decoder (the frozen LLM +
   retrieval, `policy.py`). Identity is a compact cause; behavior is its rich, context-
   modulated expression. (Cf. **Park et al., 2023, *Generative Agents*.**)
2. **Behavior is an inverse problem.** We never see `z`; we see cues `φ`. The model is
   `φ = W·z + ε` (`persona_model.py`) inverted with a robust Kalman posterior (`persona.py`).
   Personhood, computationally, is *the posterior over the cause of your behavior*, carried
   with its uncertainty `Σ`.
3. **The least-fakeable signal is implicit.** Explicit self-report is cheap talk and gameable;
   involuntary micro-behavior (locomotion, tempo, hesitation, allocation under scarcity) is
   the honest channel. This is why `stage-map.md`'s Channel strip puts A/B/C/F (locomotion,
   cursor, tempo, economic) as the *early, solitary, hard-to-fake baseline*.

### Report II.2 — What the repo already does right (protect these)

- **Full-covariance posterior with a robust update** (`persona.py`): Student-t likelihood +
  Mahalanobis gating rejects outlier cues (a bad-day fluke doesn't yank the model), and the
  Joseph-form update keeps `Σ` positive-definite. The correct way to be *confident but
  correctable*.
- **Frozen base LLM, no per-user fine-tuning** (§9.9 constraint). Correct: per-user gradient
  training would overfit, leak, and be impossible to delete cleanly. The person is captured in
  `z` + retrieval, not in weights — so deletion is a hard delete of a small state
  (`DELETE /user/{uid}`): a privacy *and* ML-hygiene win.
- **Calibrated autonomy gate** (`gate.py`): temperature scaling + ECE + cost-aware threshold
  `τ(c)` + Thompson exploration that *never* fires on high-stakes actions. Acting on someone's
  behalf is gated by *calibrated* confidence, not raw softmax.
- **BALD active learning** (`bald.py`): the world asks the question that most reduces posterior
  uncertainty — how a faithful model is built from *few* interactions.

### Report II.3 — The doppelgänger fidelity objective, sharpened

The repo has the right objective (`reconstruct.py`: reconstruction fidelity `L(z)` + CEM latent
refinement with a KL-to-posterior regularizer). To make the *game* produce a faithful echo, add
three things:

1. **Held-out behavioral reproduction as the north-star metric.** Faithfulness = *can the echo
   predict the person's next choice on held-out situations it never saw?* At each dusk, take the
   person's actual day (allocations, forks, social choices) and score
   `P(observed action | π_echo)` on a held-out slice. Track this **Behavioral Reproduction
   Score (BRS)** over days — the ML-side twin of `individuation-eval.md`, and the only honest
   answer to "is the doppelgänger real?" It is what the recognition meter should ultimately bind
   to (Expert V).
2. **Turing-style discrimination as a secondary check.** Periodically present two responses to a
   situation — the echo's and the person's — and ask which is theirs. A faithful echo drives
   discrimination toward chance. (Cf. **Turing, 1950**; preference-based evaluation,
   **Christiano et al., 2017**.) Reuse `reward.py`'s Bradley–Terry machinery.
3. **Conditional-signature fidelity, not marginal fidelity.** A model can match a person's
   *average* warmth and still be a bad echo if it misses warm-to-friends/cold-to-strangers.
   Score fidelity *per context bucket* (the autonomy buckets in `autonomy.py`), so the echo is
   graded on slopes, not means — Invariant 5 written into the loss.

### Report II.4 — The single highest-leverage ML fix: **make `openness` measurable** (close gap #1/#3)

The most important ML recommendation in this document, because the game we build in Part I is
*made of* exploration, novelty-seeking, and breadth — and right now those signals land on the
wrong axes (`known-gaps.md`: "openness is the one axis with no working implicit path"). Ship the
survival/exploration game without fixing this and the most Minecraft-like behavior gets
mis-attributed to dominance/warmth — the doppelgänger is systematically wrong on the axis that
most distinguishes explorers from settlers.

**Root cause (from `known-gaps.md`):** the committed `W`
(`services/ml/echo_ml/artifacts/measurement.npz`) has *no telemetry→openness path*; it was
anchored only on the day-loop economy. So `heading-change-rate`, `enter_unmarked`, `travel_far`,
`asks_question`, `self_disclosure`, `deviate_custom` all seep to the nearest existing path.

**The fix, in the order it must happen:**

1. **Build the openness-bearing telemetry first** (Part I's exploration mechanics are not
   flavor — they are the openness measurement apparatus):
   - `heading_change_rate`, `path_tortuosity`, `novel_tile_ratio` (fraction of newly-visited
     tiles per minute), `backtrack_rate` — the continuous locomotion sampler (gap #2), emitted
     **debounced, change-thresholded, per-flow-capped** at ≤1 event / ~1.5 s so it never floods
     `/observe` (exactly the constraint gap #2 requires).
   - `travel_far` vs `travel_near` (sail to a novel-empty island vs a peopled/known one),
     already named in `stand_travel_walkthrough.py`.
   - `enter_unmarked`, `egg_horizon_seen` (F0 exploration cues that already fire but misroute).
2. **Then do the scheduled one-time `W` re-anchor** (`known-gaps.md` ★ milestone) on the *full
   multi-flow cue set with real behavioral data* via `scripts/train_measurement.py` +
   `anchor_alignment`. Acceptance is already written: the ⚑ cues load predominantly onto
   `openness`, the numerics regression gate stays green, the individuation eval still passes.
   **Do this once, after the exploration mechanics ship — not piecemeal.**

Design consequence: **exploration must be a first-class, curiosity-rewarded verb** (Part I §I.3,
the openness-vs-warmth crossing), *because that is how openness becomes observable at all.* The
game design and the ML gap are the same problem viewed twice.

### Report II.5 — Active, information-seeking difficulty (BALD as the game director)

`stage-map.md` §11 already generalizes `bald.py` to **situation-selection**. Three ML-concrete
recommendations:

1. **Let BALD drive `scarcity_level` and fork framing, not just which NPC appears.** Score
   *(affordance, context)* candidates including `scarcity_level ∈ {lean, normal}`,
   `audience_size ∈ {0, >0}`, `public_or_private`. Raise salience of the max-MI candidate (a
   lean day arrives; a server appears while watched vs unwatched) — never coerce (Law 2).
2. **Budget the questions.** Always asking the hardest question is exhausting. Cap
   information-seeking interventions per session and decay their rate as `Σ` tightens, so the
   game relaxes as the echo grows confident — also the correct *felt* curve (early days probing,
   later days calm mastery).
3. **Reopen on drift.** `autonomy.py` CUSUM + full-cov KL drift + `persona.py inflate()` already
   reopen learning when a person changes. Spike BALD's intervention rate on detected drift —
   personhood is non-stationary and the system must track it (Expert IV §IV.5).

### Report II.6 — Simulating a human faithfully: the policy stack, end to end

The generation path (`policy.py`) is behavioral cloning with a frozen LLM: decoded traits
(`describeAxes`) + retrieval of the person's own past turns + Best-of-N reranked by the reward
head (`reward.py`). To make the *echo* (not just NPC dialogue) convincing:

- **Retrieval is where the person's texture lives.** Weight retrieval toward *high-identity-
  per-bit* episodes (Stage-7 private moral choices, the scarcity forks) over idle chatter; those
  are the memories that make an echo sound like *this* person, not a warm-cold average. (Cf.
  episodic memory, **Park et al., 2023**; RAG, **Lewis et al., 2020**.)
- **Reward model anchors on real outcomes** (`reward.py` outcome BCE + Bradley–Terry pairs from
  approve/edit/reject). Feed the *veto* from Stage-8 handover ("that wasn't me", `ux-audit.md`
  B1) straight into the preference pairs — a veto is the most valuable training signal because
  it is a *corrected counterfactual on a real autonomous act*.
- **Keep the base frozen; adapt only `z`, retrieval, and the reward head** (§9.9). Bounds
  overfitting; keeps deletion clean.

### Report II.7 — What "simulate a human in a computer" *cannot* mean here (honesty)

An ML engineer must state the limits — also product-honesty requirements (`ux-audit.md` m2, §3):

- The echo is a **behavioral** doppelgänger, not a consciousness or a claim about inner
  experience. It reproduces *what you'd do/say*, calibrated with uncertainty. Overclaiming is
  scientifically false and an ethics violation.
- **Uncertainty is a feature.** When `Σ` is wide, the honest UI is "the echo isn't sure yet,"
  and the honest gate is "don't act." All of `gate.py` exists to make *not acting* the default
  until calibrated. The meter degrades honestly offline; it never fakes a fill.
- **Fidelity is bounded by contrast volume.** You cannot learn a warmth-to-strangers slope if
  the person never meets a stranger. This is *why* the game must stage contrasts (Part I) — the
  ML is only as good as the situations the level design manufactures. II and I are one system.

### Report II.8 — Literature the ML design stands on

- **Park et al. (2023), "Generative Agents: Interactive Simulacra of Human Behavior."** Low-dim-
  cause / rich-behavior architecture and episodic-memory retrieval.
- **Houlsby et al. (2011), "Bayesian Active Learning… (BALD)."** The acquisition function in
  `bald.py`.
- **Christiano et al. (2017), "Deep RL from Human Preferences"**; **Ouyang et al. (2022),
  InstructGPT/RLHF.** Preference learning as reward — `reward.py`'s Bradley–Terry head, per-user.
- **Ho & Ermon (2016), "GAIL"**; **Ng & Russell (2000), "Algorithms for IRL."** Inferring the
  policy/reward behind observed behavior — the formal "invert cues into the person."
- **Guo et al. (2017), "On Calibration of Modern Neural Networks."** Temperature scaling + ECE,
  exactly what `gate.py` uses before autonomy.
- **Ha & Schmidhuber (2018), "World Models."** A compact latent predicting behavior in an
  environment — conceptual cousin of `z` + world.
- **Rabinowitz et al. (2018), "Machine Theory of Mind" (ToMnet).** Predicting an agent's
  behavior from few observations — the closest published analogue to ECHO's task.
- **Kalman (1960)**; **Bishop (2006), *PRML* ch. 13.** The linear-Gaussian / robust-filtering
  backbone of `persona.py`.
- **Settles (2009), "Active Learning Literature Survey."** Information-seeking-as-difficulty
  (§II.5).
- **Turing (1950), "Computing Machinery and Intelligence."** The imitation-game evaluation frame
  for §II.3.

---

# PART III — PSYCHOLOGIST / PHILOSOPHER (HUMAN ANALYST)

*Answering: what makes a human human, and how can it be simulated in a computer?*

### Report III.1 — The claim: a person is an *if–then signature*, not a set of traits

The single most consequential idea for ECHO — and the one the design already half-implements —
comes from **Mischel & Shoda's (1995) Cognitive-Affective Personality System (CAPS)**. After
decades of the "person vs situation" debate, the resolution was: personality is *not* a bundle
of context-free traits (which predict behavior weakly, ~r=0.3, the "personality coefficient"),
and it is *not* pure situational determinism either. Personality is a stable pattern of
**if-then contingencies**: *"if my status is challenged, then I withdraw; if a friend is in
need, then I over-give."* The person is the *shape of the conditional*, not the average level.

This is exactly Invariant 5 ("identity lives in the conditional signature") and exactly what
`stage-map.md` builds every stage's signature dilemma around. My contribution as the human
analyst is to say, with force: **ECHO must resist the gravitational pull toward reporting the
person as eight trait numbers.** Eight numbers is the *marginal*; the person is the *conditional
surface over context*. Every design choice that flattens context (measuring warmth without
recording `counterpart_status`) discards the actual person and keeps a caricature.

- **Fleeson (2001), "Toward a structure- and process-integrated view of personality"** gives the
  empirical form: within-person behavior is a *density distribution* — a person is not "an
  extravert" but "someone whose extraversion, across situations, has this mean *and this
  variance and this situational contingency*." ECHO's full-covariance posterior `Σ`
  (`persona.py`) is the right object: it can carry the *spread*, not just the point.
- **Design mandate:** never surface a bare axis value without the contexts that produced it. The
  recognition meter (Expert V) shows *resolved contingencies* ("warm to those who can't repay
  you") over *scalar levels* ("warmth: 0.7"). The former is a person; the latter is a horoscope.

### Report III.2 — The measurement principle: character is what you do when it cannot pay

The deepest identity signal is behavior that is **costly, counter-normative, and unobserved** —
`stage-map.md` Stage 7, "the costly good no one will ever know about." This is not a game
conceit; it is the classical definition of character:

- **The Ring of Gyges** (Plato, *Republic* II): if you were invisible and could act without
  consequence, what would you do? Glaucon's challenge is *the* thought experiment for measuring
  character, and ECHO literally stages it (`public_or_private:"private"`, `audience_size:0`, no
  penalty, no reward). The **public-minus-private delta** (§III.5) is the operational Ring of
  Gyges.
- **Aristotle (*Nicomachean Ethics*):** virtue is a stable disposition (*hexis*) revealed in
  action under the pull of appetite — measured over repeated choices, not one act. This is why
  Stage 6 (repeated games, the "second round," the last-round endgame) matters: a disposition is
  visible only in the *pattern*, especially where the norm-follower would defect.
- **Design mandate:** weight Stage-7 private-moral cues highest in `identity_per_bit` (the cue
  catalog already does — Channel H, Invariant 4), and *always* pair a public twin with a private
  twin so the delta is computable. A single moral act is theatre; the *public-vs-private gap* is
  the person.

### Report III.3 — Self-monitoring: the axis hidden between warmth and formality

**Snyder's (1974) self-monitoring** construct is the psychological name for ECHO's warmth-vs-
formality disambiguation (Stage 4's server dilemma crossed with audience effect, `stage-map.md`).
A high self-monitor tailors behavior to the audience (courteous when watched, curt when not); a
low self-monitor is consistent across audiences. This is *not* one of the 8 axes — it is a
**second-order feature: the slope of behavior against `audience_size`.** ECHO can and should
compute it directly (it is the G3 audience-effect cue), and it is one of the most individuating
things about a person. Recommendation: expose "self-monitoring" as a *derived* read in the mirror
(honest, computed from real slopes), because users find it uncannily recognizable and it proves
the echo is measuring *conditional structure*, not levels.

### Report III.4 — Revealed preference over stated preference (why the game, not a quiz)

Philosophy of action and behavioral economics converge on one rule ECHO already obeys: **what
people *do* under real tradeoffs reveals who they are; what they *say* they'd do does not.**

- **Samuelson (1938), revealed preference:** preferences are recovered from choices under
  scarcity, not from self-report. The grain fork, the tide wager, the five-door vocation choice
  (Stages 0–5) are revealed-preference instruments. *This is the philosophical justification for
  making the game a scarcity economy rather than a questionnaire* — and therefore the deepest
  reason the user's instinct ("not too easy, real scarcity") is correct.
- **Frankfurt (1971), "Freedom of the Will and the Concept of a Person":** a person is defined
  by *second-order desires* — what they want to want. Scarcity forks surface this: eating the
  grain now vs saving the seed is a first-order appetite vs a second-order endorsed value in
  visible conflict. The choice under cost is the person's will made legible.
- **Design mandate:** minimize explicit self-report (the onboarding quiz should be short and
  treated as a weak prior; `persona.py` already down-weights it relative to implicit cues). The
  world is the instrument.

### Report III.5 — What makes a human *human*, distilled to five properties the sim must honor

Synthesizing the psychology and philosophy, a human (as opposed to a caricature or a bot) has:

1. **Conditional coherence** — recognizable across contexts *because* of stable if-then
   structure, not despite context (Mischel). → ECHO honors it with per-bucket measurement.
2. **A private self that can diverge from the public one** — the gap *is* moral character
   (Plato, Snyder). → ECHO honors it with the public-minus-private delta (Stage 4 vs 7).
3. **Narrative identity across time** — a person is partly the *story* connecting their choices;
   **McAdams (2001), "The psychology of life stories"** and **Ricoeur (1990), *Oneself as
   Another*** (narrative identity), building on **Locke's** memory-continuity theory of personal
   identity. → ECHO honors it with multi-session persistence (gap #5): the echo must remember
   *your* history, and the *sequence* of stages you walked is itself a high-level cue
   (`stage-map.md` §10, "the trajectory of a life").
4. **Genuine valuation under scarcity and mortality** — choices matter because time and
   resources are finite (existentialist strand: **Heidegger**'s being-toward-finitude,
   **Frankl**'s meaning under constraint). → ECHO honors it with the three clocks and
   soft-irreversible loss (Part I §I.6). *A world without scarcity cannot reveal what someone
   values, because nothing costs anything.*
5. **Non-stationarity — people change** — and a faithful model must track drift without
   discarding history (William James, the stream; **Roberts & Mroczek, 2008**, personality
   change across the lifespan). → ECHO honors it with `inflate()` + CUSUM drift (`autonomy.py`).

### Report III.6 — The ethics the philosopher will not let the design skip

- **Stakes, not trauma.** Loss must motivate (Juul's legible failure), never distress. This is
  why collapse is soft-irreversible, not a cruel wipe (Part I §I.6). A tool that studies a
  person must not harm them to do so — this is also a `user_wellbeing` requirement.
- **Sovereignty and consent.** The handover (Stage 8) is an *explicit, revocable delegation*;
  the human stays sovereign; the "that wasn't me" veto is a first-class right, not an edge case
  (`ux-audit.md` B1). Philosophically this preserves autonomy (Kantian: never treat the person
  as mere means, even by their own echo).
- **The right to be unmeasured.** Non-choice is data, but the person must never be *punished*
  for refusing (Law 2). Refusal is read, not penalized. And telemetry-off leaves the world fully
  playable (`event-schema.md` §5). Measurement is a gift the person grants, not a toll the world
  extracts.
- **Honesty about what the echo is.** It is a behavioral mirror, not a soul. Claiming more is a
  category error (the philosopher's version of Expert II §II.7) and a manipulation risk.

### Report III.7 — Literature the human-analysis stands on

- **Mischel & Shoda (1995), "A cognitive-affective system theory of personality" (CAPS).** The
  if-then signature — the theoretical spine of Invariant 5.
- **Fleeson (2001)**; **Fleeson & Jayawickreme (2015), Whole Trait Theory.** Density
  distributions — why `Σ` (spread), not just `μ`, is the person.
- **Snyder (1974), "Self-monitoring of expressive behavior."** The public-vs-private slope
  (§III.3).
- **Samuelson (1938), revealed preference**; **Frankfurt (1971), second-order desires.** Why the
  scarcity game beats the quiz (§III.4).
- **Plato, *Republic* (Ring of Gyges)**; **Aristotle, *Nicomachean Ethics* (hexis).** Character
  as unobserved, repeated disposition (§III.2).
- **Locke (1689, *Essay* II.27)**; **Parfit (1984, *Reasons and Persons*)**; **Ricoeur (1990,
  *Oneself as Another*)**; **McAdams (2001), narrative identity.** Personal identity over time
  (§III.5.3), grounding multi-session persistence.
- **Big Five / OCEAN — Costa & McCrae (1992); Goldberg (1990).** The trait tradition ECHO's 8
  axes adapt (warmth/dominance are interpersonal-circumplex-flavored; note ECHO deliberately
  splits interpersonal `warmth`/`dominance` finer than raw OCEAN, closer to **Wiggins' (1979)
  interpersonal circumplex**).
- **Roberts & Mroczek (2008), "Personality trait change in adulthood."** Non-stationarity —
  drift is real, not noise (§III.5.5).
- **Kahneman & Tversky (1979), Prospect Theory.** Loss aversion and framing — why the
  save-vs-spend and risk forks are so diagnostic (they load on how a person weighs loss).

---

# PART IV — MATHEMATICIAN

*Answering: what makes a human human, and how can it be simulated in a computer?*

### Report IV.1 — The formal object: identity as a posterior, personhood as a manifold

Let `z ∈ ℝ⁸` be the persona latent (the axes, `persona.ts`). A behavioral cue is
`φ = W·z + ε`, `ε ~ N(0, R)` (heteroscedastic; `persona.py`, `persona_model.py`). The person,
formally, is not `z` but the **posterior**

```
q(z | H) = N(μ, Σ)
```

carried over their whole history `H`. This is the mathematically honest statement of "who ECHO
thinks you are": a point *and its uncertainty*. Two consequences the design must respect:

1. **Identity is a distribution, not a point.** Collapsing `q` to `μ` (a scoreboard of 8 numbers)
   throws away `Σ` — which encodes *what we still don't know* and *how the axes covary*. The
   covariance off-diagonals are where the conditional structure lives (Expert III's if-then
   surface, in linear-Gaussian form). **Keep and surface `Σ`, not just `μ`.**
2. **The person is a manifold in behavior space, not a coordinate.** Because `W` maps the
   8-dim `z` into a high-dim behavior space, the reachable behaviors form a low-dim manifold.
   Two people with the same *mean* warmth but different *covariance* trace different manifolds —
   they are different people. Fidelity (Expert II's BRS) is *manifold reproduction*, not
   coordinate matching.

### Report IV.2 — The update: Bayesian filtering as "becoming known over time"

The posterior updates by a robust Kalman step (Joseph form, Student-t + Mahalanobis gate,
`persona.py`). Written plainly, each cue tightens `Σ` and moves `μ`:

```
Kalman gain      K = Σ Wᵀ (W Σ Wᵀ + R)⁻¹
mean update      μ ← μ + K (φ − W μ)          (robustified: down-weight if Mahalanobis dist large)
cov  update      Σ ← (I − K W) Σ (I − K W)ᵀ + K R Kᵀ   (Joseph form, keeps Σ ⪰ 0)
```

Three mathematically-motivated design rules fall out:

- **Robustness is not optional.** Without the Student-t/Mahalanobis gate, one anomalous cue
  (a rage-quit, a misclick) moves `μ` as much as a true signal. The gate is what makes the echo
  *confident but correctable*. Never bypass it for "faster learning."
- **`Σ` must be allowed to grow, not only shrink** — via `inflate()` on detected drift.
  Monotonically shrinking `Σ` would make a person un-updatable once "known," which is false
  (people change; Expert III §III.5.5). Drift detection is a **CUSUM** test (**Page, 1954**) on
  the cue stream + a full-covariance **KL divergence** drift on the posterior (`autonomy.py`).
- **Convergence is measurable.** `tr(Σ)` (total posterior variance) is a scalar "how well do we
  know this person" — a legitimate, honest binding for the *uncertainty* component of the
  recognition meter (Expert V), because it is a real quantity, not a gamified fill.

### Report IV.3 — Why scarcity = information: the load-bearing theorem of the whole design

This is the mathematical proof of the user's instinct that the game must be *hard*. Frame each
game choice as a Bayesian experiment. The information a choice yields about `z` is the **expected
reduction in posterior entropy**, i.e. the **mutual information** `I(z; a)` between the latent
and the observed action — **Lindley (1956), "On a measure of the information provided by an
experiment."** For a linear-Gaussian model this reduces to a function of the Fisher information
the choice carries.

**Key fact:** an action taken under *no cost* carries almost no information about preference. If
eating the grain and saving the seed are equally free, the choice is a coin flip — `I(z; a) ≈ 0`.
Introduce scarcity and the two options acquire *different opportunity costs that depend on `z`*
(a patient/cerebral person values the saved seed more), so the choice becomes *diagnostic* —
`I(z; a)` rises with the cost of the tradeoff. Formally, **identity-per-bit increases with the
stakes of the choice.** Hence:

```
harder (scarcer) world  ⇒  higher Fisher information per action  ⇒  faithful echo in fewer days
```

This is why `scarcity_level` is the master dial (`stage-map.md`) and why "make it not-easy" is
not a mood but a *measurement requirement*. It also bounds the ethics: you want the *minimum*
scarcity that identifies the person (Expert III's "stakes not trauma"), which is exactly a
constrained information-maximization: maximize `I(z; a)` subject to a distress budget.

### Report IV.4 — The forks are designed to be *identifiable* (breaking axis degeneracy)

A latent-variable model has an **identifiability problem**: if two axes always move together in
the data, no amount of data separates them (the factor-rotation indeterminacy; **Anderson &
Rubin, 1956**). ECHO's known-gaps openness problem is exactly this — with no telemetry→openness
path, `openness` is *unidentified* and its variance leaks into `dominance`/`warmth`.

The stage-map's "signature dilemma" per stage is, mathematically, a **contrast designed to break
a specific degeneracy**: each dilemma's two readings load on a *different axis pair*, so resolving
it is a rank-increasing observation that separates two previously-confounded axes. This is
**optimal experimental design** (**Chaloner & Verdinelli, 1995**): choose experiments that make
the Fisher information matrix well-conditioned (no near-zero eigenvalues = no unidentified
direction). Design mandates:

- **Every new mechanic must state which axis-pair degeneracy it breaks** (the stage-map already
  does this per stage; hold new content to the same bar). A mechanic that doesn't break a
  degeneracy adds behavior but not *resolution*.
- **The openness fix (Expert II §II.4) is literally adding a row to `W`** so the openness
  direction becomes observable — turning an unidentified parameter into an identified one. It is
  the highest-value single change because it lifts an eigenvalue of the information matrix off
  zero.
- **Delay-discounting math for the grain fork:** model the save-vs-spend value as hyperbolic,
  `V = R / (1 + k·D)` (**Ainslie, 1975**; **Mazur, 1987**). The person's discount rate `k` is a
  near-direct readout of the `intellect`-vs-`pace` contrast (patient/future-framed vs
  impatient/present-framed). Estimating `k` from repeated forks at varying delay `D` and reward
  `R` is a clean 1-parameter fit — one of the highest-SNR reads in the system.

### Report IV.5 — The director as an information-maximizer (BALD, formally)

BALD (`bald.py`, **Houlsby et al., 2011**) scores a candidate probe `c` by

```
BALD(c) = H[ E_q[ p(a|z,c) ] ] − E_q[ H[ p(a|z,c) ] ]
```

— the mutual information between the outcome and `z` under the current posterior. Two remarks:

- **Generalize the candidate set from NPCs to (affordance, context) pairs** (`stage-map.md` §11,
  Expert II §II.5). The math is unchanged; only the candidate space grows. Estimate the
  expectation by Cholesky MC sampling `z ~ N(μ, Σ)` — already implemented for NPC selection.
- **Diminishing returns are automatic.** As `Σ` shrinks, `BALD(c) → 0` for all `c`, so the
  director naturally stops probing and the game relaxes — the correct felt curve *falls out of
  the math* without a hand-tuned schedule. Add only a per-session cap for comfort (Expert II).

### Report IV.6 — The autonomy gate as a decision-theoretic threshold

Letting the echo act is a decision under uncertainty. The gate (`gate.py`) should act iff
expected utility beats abstention:

```
act(a)  ⇔  p_calibrated(a is right) · U(a) − (1 − p) · C(a)  >  U(abstain)
```

with `p` *calibrated* (temperature scaling, **Guo et al., 2017**; **Platt, 1999**), the cost
`C(a)` scaled by stakes, and a hysteresis band so buckets don't flap (`autonomy.py`). The
mathematically important properties, all present and worth protecting:

- **Calibration before autonomy.** An uncalibrated 0.9 is not 90%; acting on it is a
  miscalibrated bet. ECE is the guardrail; the gate refuses promotion until `ece < e*` (the
  `α*, n*, e*` thresholds in `config.py`).
- **Never explore on high-stakes.** Thompson sampling is fine for low-stakes ambient turns,
  never for consequential acts — a hard constraint, not a tuning choice.
- **Hysteresis = stability.** Promotion at a higher bar than demotion prevents limit-cycle
  flapping between autonomy levels — a control-theory requirement for a system a human must be
  able to trust.

### Report IV.7 — What "human" means, mathematically (the one-paragraph answer)

A human, to this system, is a **robust, drifting, full-covariance posterior over a low-dimensional
latent that generates high-dimensional conditional behavior through a fixed decoder, identifiable
only through choices whose information content is proportional to their cost.** Simulating a human
is (1) inverting behavior into that posterior (filtering), (2) staging cost-bearing contrasts that
keep the information matrix well-conditioned (experimental design), (3) decoding the latent back
into behavior and grading the reproduction on held-out conditional slopes (the BRS), and (4)
acting only when calibrated expected utility says so. Every one of these four has a home in the
existing `services/ml` modules; the blueprint's job is to feed them a world rich enough in
cost-bearing contrast to make the posterior *identifiable across all eight axes.*

### Report IV.8 — Literature the mathematics stands on

- **Kalman (1960); Anderson & Moore (1979), *Optimal Filtering*; Bishop (2006), *PRML* ch. 13.**
  The linear-Gaussian filtering backbone (§IV.2).
- **Lindley (1956), "On a measure of the information provided by an experiment."** Information =
  expected entropy reduction — the scarcity-as-information theorem (§IV.3).
- **Cover & Thomas (2006), *Elements of Information Theory*.** Mutual information, identity-per-
  bit.
- **Chaloner & Verdinelli (1995), "Bayesian experimental design"; Anderson & Rubin (1956),
  factor-analysis identifiability.** Contrasts that break axis degeneracy (§IV.4).
- **Houlsby et al. (2011), BALD; MacKay (1992), "Information-based objective functions."** The
  director's acquisition (§IV.5).
- **Ainslie (1975); Mazur (1987), hyperbolic discounting.** The grain-fork discount-rate read
  (§IV.4).
- **Page (1954), CUSUM; drift detection.** Non-stationarity tracking (§IV.2).
- **Guo et al. (2017); Platt (1999), calibration; Bradley & Terry (1952), paired comparisons.**
  The gate and the reward head (§IV.6).
- **Kahneman & Tversky (1979), Prospect Theory (value function curvature).** Formal shape of the
  loss/risk reads in the forks.

---

# PART V — UX LEAD (ZEROING FRICTION, CO-DESIGNED WITH THE LEVEL ENGINEER)

*The level design (Part I) manufactures pressure and contrast. My job is to make sure the person
never fights the interface at the exact moments the pressure is highest — and to make the
invisible learning* felt *without ever turning it into a game-layer. This report works down
`docs/ux-audit.md` (which already did the heuristic evaluation) and binds each fix to the new
survival loop.*

### Report V.1 — The friction philosophy: diegetic first, chrome last

Every piece of state the survival loop needs the player to feel — vitality, daylight, scarcity,
recognition — should live **in the world (diegetic)** before it lives in a HUD widget. A red
health bar breaks the calm literary tone *and* reads as a game-layer (Law 1). Instead:

- **Vitality** = the *body*: the avatar's posture/warmth/tint shifts as it decays (a slight slump,
  a cooler palette), not a bar. (Cf. *Dead Space*'s spine-health as the canonical diegetic-HUD
  proof; **Iacovides et al., 2015**, on diegetic UI and immersion.)
- **Daylight** = the *sky*: a visible sun arc and lengthening shadows. Dusk is felt, not counted.
- **Scarcity** = the *world*: the bush visibly thins, the tide runs low. The player infers
  pressure from the environment (recognition over recall — **Nielsen, 1994**, heuristic #6).

Only **one** deliberately non-diegetic element is allowed, because it is the product's whole
promise and must be always-glanceable: the **recognition meter** (V.3).

### Report V.2 — The activation funnel, re-sequenced for the survival loop

`ux-audit.md` stages the funnel 0–10 and flags 4–8 as broken. The survival loop lets us fix all
of them at once, because now there is *always something to do and a reason to do it.* The
re-sequenced first session:

| # | Stage | Old feeling (audit) | New design |
|---|---|---|---|
| 0–3 | Landing→reveal | ✅/◑ | Keep; reframe the reveal (m1): *"This is you in the world. Your **echo** is what learns you."* |
| 4 | First entry | ✗ dead air | **Cold-open into the first morning of the survival day** (V.4): one soft pull, the meter at zero, vitality just beginning to matter. No quiet empty field. |
| 5 | Recognition | ✗ invisible | Recognition meter is on screen from second one, at zero, *waiting* (V.3). |
| 6 | Teaching | ✗ undiscoverable | The dusk mirror beat + first "let my echo answer" hint (V.5). |
| 7 | Graduation | ✗ invisible | Per-bucket progress in the mirror + a calm earned graduation moment (V.6). |
| 8 | **Handover** | ✗ absent | The autonomous crossing, with rationale trace + "that wasn't me" veto (V.7). |
| 9–10 | Outcomes/return | ◑ buried | The honest return hook: what changed while away + who the echo met (V.8). |

### Report V.3 — The recognition meter (fixes B2, M2; the one HUD element)

The single most important UX object. Rules, all from `ux-audit.md` B2 + the invariants:

- **Form:** *not* a bar, *not* XP. A **portrait coming into focus** or a **constellation of the 8
  axes filling in** — in-tone, literary. Empty on day 1, visibly waiting.
- **Binding (honest):** a blend of *real* `/persona` signals — posterior certainty
  `1 − mean(uncertainty)` (i.e. a function of `tr(Σ)`, Expert IV §IV.2), breadth
  (`traits.length / 8` axes resolved), evidence volume (`behaviors`, diminishing returns),
  reliability (low `ece`, rising `agreement_ewma`). Ultimately bind the headline to the
  **Behavioral Reproduction Score** (Expert II §II.3) once it exists — the most honest possible
  "how real is the echo."
- **On expand:** show the honest sub-components and *which contingencies have resolved* (Expert
  III §III.1) — "warm to those who can't repay you," not "warmth 0.7."
- **Offline honesty (m2):** when ML is mock, label it ("echo brain offline — demo values"), never
  fake a fill.
- **Motion (M6):** wrap any animation in `prefers-reduced-motion`; make it touch-legible.

### Report V.4 — Killing the cold-start dead air (fixes M2)

The survival loop *is* the fix: you no longer step into a quiet field, you wake into the first
morning with vitality just starting to tick and the sun low. The orientation is **one** in-tone
line that re-plants the hook and gives exactly one soft pull, then dismisses itself on first
action:

> *"Your first day here. No one knows you yet — not even you. The light won't last; see what
> the island offers."*

No quest list, no objective markers, no tutorial modal chain. The affordances are legible
(a bush with berries, a cairn of books, a sprout, a sleeping dog). Discovery is the openness cue
(Expert II §II.4), so a heavy tutorial would *destroy the measurement* — the lightest possible
touch is both better UX and better science.

### Report V.5 — Making learning *felt* in the moment (fixes M1, M3)

The dusk **mirror beat** is the retention mechanic and it must never read as a report card:

- **Trigger:** at the campfire (`end`), when a real trait newly resolves (diff `traits[]` across
  `/persona` polls) or a bucket's agreement ticks up after feedback.
- **Copy rule:** one sentence, in-tone, bound to the *one real axis/bucket that moved* — *"your
  echo is starting to see you as someone who saves for a leaner day."* Never generic ("nice!"),
  never a number, never "+1."
- **Discoverability of teaching (M3):** the first time a conversation opens, a one-time in-tone
  hint: *"you can let your echo try a reply — every yes or no teaches it."* The proposal card
  labels the teaching explicitly and ties approve/edit/reject to a visible meter tick (so the
  person *sees* the correction land).

### Report V.6 — The graduation moment (fixes M4)

`copilot → supervised → auto` is the journey to the handover but is currently invisible. Surface:

- **Per-bucket progress in the mirror** against the *real* gate: agreement vs `α*=0.80`, volume
  vs `n*=8`, ECE vs `e*=0.10` (the actual thresholds, `config.py`). Honest "almost there,"
  never a fake bar.
- **A calm, earned graduation moment in-world** when a bucket crosses to `auto`: *"your echo can
  carry this on its own now."* This is simultaneously the on-ramp to the handover (V.7) — the
  most meaningful state change in the system, currently unmarked.

### Report V.7 — The handover UI (fixes B1, the product's entire promise)

The protocol already reserves `speaker:"agent"` + `rationale` (`protocol.ts`); it was built for
this and never wired. UX for the autonomous act:

- **On-ramp:** the graduation moment offers, never forces: *"let your echo cross to the next
  island for you?"* Explicit, revocable delegation.
- **The watch:** the person can watch their echo walk up to NPCs and converse via `/agent/turn`,
  or idle. Every autonomous utterance surfaces its **"why it said that" trace** (the `rationale`).
- **The veto:** a first-class, always-present **"that wasn't me"** button → `sendFeedback(agreed:
  false)` → demotes the bucket via existing hysteresis, and feeds the highest-value reward pair
  (Expert II §II.6). A healthy veto rate is `< ~15%` (`ux-audit.md` B1 measure).
- **The payoff:** route encounters into the connections view (V.8).

### Report V.8 — The honest return hook (fixes M5, and gives the game a tomorrow)

Two layers, both non-manipulative (they only report *real* state change):

1. **World change:** on re-entry, show what changed while gone — grain ripened, raft weathered,
   a met figure drifted (the decay from Part I §I.5). You return because something you value is
   at stake, not because a streak nags (Law 1).
2. **Echo change (once at `auto`):** *"while you wandered, your echo met 3 people — here's who's
   worth meeting yourself,"* tagging autonomously-met people in connections. The one return hook
   the product was built for.

### Report V.9 — Instrumentation so we tune by evidence, not vibes (fixes m3)

Add lightweight, consented, key-free funnel markers (reuse the telemetry pipe / `localStorage`,
respecting telemetry consent): `world_enter`, `first_nearby`, `first_conversation`,
`first_let_echo_answer`, `first_promotion`, `handover_start`, plus survival-loop markers
`first_fork_decision`, `first_dusk`, `day_2_return`, `first_collapse`. Target metrics:
time-to-first-conversation, sessions-to-first-promotion, day-2 return rate, veto rate, BRS-over-days.

### Report V.10 — Friction-zeroing checklist handed back to the Level Engineer

1. Movement flawless on touch + keyboard (M6) — locomotion is the purest cue (Expert II §II.4).
2. Every fork is a single, unambiguous, reversible-to-read / irreversible-to-commit interaction —
   no accidental commits on the irreversible grain/raft (respect the weight of the choice).
3. Z-order/overlap audited on small screens with the new meter present (polish p1).
4. Consent for voice/biometric deferred to first use in-world (polish p2) so onboarding is short.
5. Scarcity is *felt before understood* (V.1) — no numbers where a diegetic cue will do.

### Report V.11 — Literature the UX stands on

- **Nielsen (1994), 10 usability heuristics** — visibility of system status (the meter),
  recognition over recall (diegetic affordances), match to the real world (the calm metaphors).
- **Norman (2013), *The Design of Everyday Things*** — affordances & signifiers: a bush that
  *looks* forageable needs no tooltip.
- **Csikszentmihalyi (1990), Flow / clear proximal feedback** — the dusk beat is the immediate
  feedback that sustains flow without a score.
- **Hamari & Koivisto / gamification critique; Deci, Koestner & Ryan (1999) meta-analysis** —
  extrinsic reward markers undermine intrinsic motivation: the empirical basis for "no XP,"
  reinforcing Law 1 from the UX side.
- **Iacovides et al. (2015), diegetic UI & immersion; Fagerholt & Lorentzon (2009), "Beyond the
  HUD."** The diegetic-first principle (V.1).
- **Bakker, Niemantsverdriet et al., peripheral/calm interaction; Weiser & Brown (1996), "The
  Coming Age of Calm Technology."** The always-glanceable-but-non-intrusive recognition meter.
- **Norman & Nielsen on error prevention** — the irreversible-commit safeguards (V.10.2).

---

# PART VI — THE SECOND-BY-SECOND STORYBOARD

*This is the itinerary the user asked for: the experience resolved to the second, annotated at
every beat with (a) what the player sees/does, (b) the felt purpose, and (c) the cue(s) emitted
and the axis they resolve. Timestamps are wall-clock in the session. Cue IDs and channels are
from `cue-catalog.md` / `stage-map.md`. This is written so an engineer can build directly
against it.*

## VI.A — First session, first day (target ~10 min: onboarding → first dusk)

### Onboarding (t = 0:00 → ~1:30) — kept short on purpose

| t | Player sees / does | Felt purpose | Cue → axis |
|---|---|---|---|
| 0:00 | Landing: *"You've arrived in a country that does not exist… no one knows you here — not even you."* | The hook. Literary, calm. | — (no measurement pre-consent) |
| 0:20 | Consent (honest, one screen; voice/biometric deferred per polish p2) | Trust; sovereignty | consent flags set (Law 2, Invariant 7) |
| 0:45 | Identity: quick premade avatar or selfie→attributes (Phase 3, mock ok) | Embodiment, *not* the echo | weak self-report prior only (down-weighted, Expert III §III.4) |
| 1:15 | **Reveal, reframed (m1):** *"This is you in the world. Your **echo** is what will learn you — and one day act as you."* | Plants the core metaphor + foreshadows the handover | — |
| 1:30 | "Step through" → cold-open into the **first morning** | Transition into the living world | `world_enter` funnel marker |

### The first morning (t = 1:30 → ~3:30) — orientation without a tutorial

| t | Player sees / does | Felt purpose | Cue → axis |
|---|---|---|---|
| 1:30 | Wakes on the home island. Low sun, long shadows (daylight clock visible). One line fades in: *"The light won't last; see what the island offers."* Recognition meter sits at zero, visibly waiting. | Re-plant hook; exactly one soft pull (fixes M2). | — |
| 1:31–1:45 | First input: player moves. **First-move latency + heading** captured. | Baseline locomotion — least-fakeable channel. | `first_move` → **pace**; passive sampler begins (`heading_change_rate`, `novel_tile_ratio`) → **openness** (post-W-reanchor) |
| 1:45–2:30 | Free roam. Bush (berries), cairn (books), sprout (grain), sleeping dog, unfinished raft, tide pools, bedroll, campfire are all *legibly* present, none labeled. | Discovery **is** the openness read; no tutorial by design (Expert II §II.4). | `enter_unmarked`, `path_tortuosity`, `A9 territory range`, `A7 revisit` → **openness/energy** |
| 2:30–3:00 | Player pets the dog (or doesn't — K5). Types to it; valence measured. Private, unobserved. | Cleanest dispositional **warmth** read (no audience, no strategic motive). | `D11 pet_talk` valence, `I4 stress→pet` → **warmth** |
| 3:00–3:30 | Player finds a verb to commit to (forage / study / build / rest). Dwell + time-share begins. | First allocation under the (still gentle) daylight clock. | `A4 dwell`, `A5 time-share`, `J2 aesthetic dwell` → **energy/intellect/openness** |

### Midday — the squeeze (t = 3:30 → ~7:00) — where the game acquires teeth

| t | Player sees / does | Felt purpose | Cue → axis |
|---|---|---|---|
| 3:30 | Vitality now visibly matters (sprite posture cooler). Sun past zenith. Three clocks tighten. | The first real pressure — a choice now costs. | — (context: `scarcity_level` rising) |
| 3:45 | **THE GRAIN FORK.** The sprout has ripened (`GROW_MS=14000`). Prompt: eat now (certain, immediate vitality) vs save the seed (deferred, compounds tomorrow). **Irreversible. Private.** Decision latency + hover-before-commit captured. | The signature dilemma of Stage 0. Splits **intellect vs pace** (delay discounting, no audience — the purest read; Expert IV §IV.4). | `F1 save_or_spend`, `B2 hover-before-commit`, `C2 decision latency` → **intellect vs pace** |
| 4:15 | Consequence lands diegetically (fuller/ hungrier body; a seed icon on the plot if saved). | The choice *mattered* — irreversibility felt. | — |
| 4:30–5:30 | Continued allocation under bite: forage to survive, or read the cairn *while hungry* (costly openness/intellect), or push the raft (invests calories). | The lean-day allocation — Stage 1 signature dilemma; splits **energy vs intellect**. | `A5`, `F5 effort-to-earn`, `F6 investment`, `C7 persistence` → **energy/conscientiousness/intellect** |
| 5:30 | **THE TIDE WAGER** (BALD may surface this if risk-appetite is uncertain). Risky bet vs steady forage. | Splits **dominance/openness/energy** (risk appetite); director-timed for max info (Expert IV §IV.5). | `F3 risk_index`, `F4 EV rationality` → **dominance/openness/energy** |
| 6:00–7:00 | Player may begin the raft (`start_ship`) — latent bridge to Stage 2 — or ignore it (K4). The horizon shows a far, sharp, anonymous figure across the water (`PRESENCE.HORIZON`), too far to reach. | The pull toward Stage 2 is planted, never forced. Seeing the figure is itself a cue. | `A11 sail-out propensity` (latent), `egg_horizon_seen`, `I3 novelty reaction` → **openness/energy/affect** |

### Dusk — the reckoning + the mirror beat (t = 7:00 → ~9:00) — the retention core

| t | Player sees / does | Felt purpose | Cue → axis |
|---|---|---|---|
| 7:00 | Sun low; the world signals the day is ending. Player walks to the campfire. | A natural, unforced "wrap up." | `C10 dwell-before-leave` → **affect** |
| 7:30 | **`end` the day.** Crops advance a growth tick; decay is computed; tomorrow's `scarcity_level` is set from today's choices. | The day is *finite* and *irreversible* — the whole difficulty thesis in one action. | `K12 ends day abruptly` (twin) → **affect** |
| 8:00 | **THE MIRROR BEAT** (fixes M1). If a real axis resolved today, one in-tone line by the fire: *"your echo is starting to see you as someone who saves for a leaner day."* Bound to the one real axis that moved. The recognition meter ticks up a real, honest amount. | The single most important retention + trust beat. The person *feels* the echo sharpen. | surfaces resolved `traits[]` diff; honest `tr(Σ)` movement |
| 8:30 | Optional: open **your echo** (the mirror) to see the constellation and which contingencies resolved. | Transparency (Invariant/§10); deepens investment. | `first_promotion` marker if a bucket advanced |
| 9:00 | Fade to next-day prompt or exit. Return hook seeded: *"the grain you saved will be ready tomorrow."* | A reason to come back that is a *stake*, not a streak. | `day_2_return` marker on return |

## VI.B — The day loop (session N) — how it stays fresh without new content

Each day is the same five verbs + two forks, but **three forces keep it from repeating**:

1. **Scarcity drift.** `scarcity_level` changes with yesterday's allocation, so the *same* forks
   carry different stakes — a saved seed matters more on a lean day (Expert IV §IV.3). The
   optimal move changes; the person's *style* under the changed stakes is the new signal.
2. **The BALD director.** It surfaces, among open affordances, the highest-information contrast:
   an unwatched server vs a watched one, a `time_pressure:1` fork, a novel-empty island appearing
   on the horizon. Never coerced; refusal is data (§stage-map §11).
3. **Compounding world state.** Structures progress across days (`C7`), ties cool or deepen
   (`G7`), the raft nears completion — so the *world* changes even when the verbs don't.

The felt curve across days: **Days 1–3 probing** (director active, scarcity varied, echo
uncertain) → **Days 4–7 mastery + first crossing** (raft done, Stage 2/3, echo confident enough
to draft replies) → **Week 2+ bonds + handover** (Stages 6–8). BALD's diminishing returns
(Expert IV §IV.5) make this relaxation *automatic*.

## VI.C — The crossing (Stages 2→3), second-resolved

| t (relative to sail) | Beat | Cue → axis |
|---|---|---|
| −days | Raft built or not (K4 if never). *Choosing* to build it because of the sighting is itself the read. | `A11`, `start_ship` → **openness/energy** |
| 0:00 | Depart. **What** you sail toward disambiguates: a novel *empty* island (openness/novelty) vs a *peopled* one (warmth/sociality). The Stage-2 signature split. | `travel_far` vs `travel_near` → **openness vs warmth** (post-reanchor) |
| on arrival | Approach distance to the stranger; personal-space held. | `A1`, `A10 first-contact distance` → **warmth/dominance** |
| first words | **THE FIRST WORDS TO A STRANGER.** Open up (costly self-disclosure) vs stay guarded. Per-actor: both vantages logged (fix the one-way `logInteraction`, Part VII). | `D5 self-disclosure`, `G1 initiation`, `C1 reply latency`, `D10 repair` → **warmth vs affect, pace** |

## VI.D — The handover (Stage 8), second-resolved — the promised payoff

| t | Beat | System |
|---|---|---|
| trigger | A bucket crosses to `auto` (agreement ≥ `α*`, volume ≥ `n*`, ECE ≤ `e*`). The **graduation moment** fires in-world (fixes M4). | `autonomy.py` promotion + hysteresis |
| offer | *"Your echo can carry this on its own now — let it cross to the next island for you?"* Explicit, revocable. | on-ramp (fixes B1) |
| the watch | Echo self-initiates: walks up to NPCs, converses via `/agent/turn` policy+gate. Each utterance shows its **"why it said that"** trace. Player watches or idles. | `speaker:"agent"` + `rationale` (already in `protocol.ts`) |
| the veto | Always-present **"that wasn't me"** → `sendFeedback(agreed:false)` → demotes bucket, feeds the highest-value reward pair. | fixes B1; Expert II §II.6 |
| the payoff | *"While your echo wandered, it met 3 people — here's who's worth meeting yourself."* Routed to connections. | honest return hook (fixes M5) |

---

# PART VII — CODE-LEVEL CHANGE SPECIFICATION

*Concrete, drop-in changes mapped to the real repo. Organized by subsystem, then sequenced into
phases. File paths are those observed in the repo; where a file is inferred from the monorepo
layout it is marked `(new)` or `(verify path)`. This section is written so you can hand it to a
build agent flow-by-flow, each leaving the app runnable (the repo's own §15 phasing rule).*

### VII.1 — Shared protocol & world (`packages/shared/src/`)

- **`world.ts` — add the survival-clock constants** next to `WORLD`:
  ```ts
  export const SURVIVAL = {
    DAY_MS: 8 * 60 * 1000,        // ~8 min of daylight per day (tune)
    VITALITY_MAX: 100,
    VITALITY_DRAIN_PER_MIN: 6,    // baseline decay; scaled by scarcity_level
    GROW_MS: 14_000,              // grain ripen (already used by IslandClient)
    DECAY: { CROP_WILT_MS: 36*3600*1000, STRUCT_WEATHER_PER_DAY: 0.05, TIE_COOL_PER_DAY: 0.08 },
    SCARCITY: { LEAN: 1.6, NORMAL: 1.0 },   // multiplier on drain + fork stakes
  } as const;
  ```
  Single source of truth (mirrors the `WORLD` pattern), shared by client + server + tests.
- **`persona.ts` — do NOT add axes.** The 8 axes are correct and the ML is built on them. All new
  reads load onto existing axes via `W`. (This is a hard rule; adding a 9th axis breaks
  `PERSONA_DIM`, `measurement.npz`, and every test.)
- **`protocol.ts` — telemetry event additions.** Add the survival + locomotion cue payloads to
  the wire protocol (the `InteractTurnPayload` `speaker:"agent"`/`rationale` fields already exist
  — reuse for handover). New event kinds: `survival_tick`, `fork_decision`, `passive_locomotion`.
- **`archipelago.ts` — unchanged for placement**, but its `IslandStore` seam is the model for the
  new `IslandStateStore` (VII.4). Reuse the pure-core + store-seam pattern exactly.

### VII.2 — Client: the survival loop & diegetic HUD (`apps/web/src/`)

- **`components/IslandClient.tsx`** — promote the existing stations from static props to a
  **day-loop state machine**: a `useDay()` hook driving daylight, vitality, `scarcity_level`; the
  grain/tide forks as committed-once interactions; the campfire `end` closing the day. Emit
  `survival_tick`, `fork_decision` telemetry.
- **`game/PixiWorld.ts`** — diegetic rendering: sun-arc + shadow length for daylight; sprite
  posture/tint for vitality; bush-thinning / tide-level for scarcity. **No numeric bars** (Expert
  V §V.1).
- **`game/telemetry.ts`** — add the **debounced, change-thresholded, per-flow-capped passive
  locomotion sampler** (`known-gaps.md` gap #2 constraints): aggregate `heading_change_rate`,
  `path_tortuosity`, `novel_tile_ratio`, `backtrack_rate`, dwell points; emit ≤1 `passive_
  locomotion` event / ~1.5 s, capped per day. This is the openness apparatus — build it *before*
  the W re-anchor (Expert II §II.4).
- **`components/EchoPanel.tsx` → the recognition meter** — elevate to an always-glanceable world
  HUD element (fixes B2): constellation/portrait bound to real `/persona` (certainty, breadth,
  evidence, reliability), honest offline label (m2), `prefers-reduced-motion` guard (M6).
- **`components/WorldClient.tsx`** — the dusk **mirror beat** (M1: diff `traits[]` across
  `/persona` polls), the first-conversation teaching hint (M3), and the **handover** path (B1):
  wire `speaker:"agent"` autonomous turns + rationale trace + "that wasn't me" veto → `sendFeedback`.
- **`components/OutcomesPanel.tsx` / `lib/connections.ts`** — the return hook (M5): surface
  autonomously-met people + "what changed while away."
- **`onboard/page.tsx`** — reframe the reveal (m1); defer voice/biometric consent (p2).

### VII.3 — Realtime server (`apps/realtime/src/`)

- **`WorldRoom.ts`** — **fix the one-way `logInteraction` (≈L374)** to emit **per-actor** events
  (both vantages), required by Stage 3+ (Rule 3, `event-schema.md`). This is a prerequisite for
  the conditional-signature science, not a nicety.
- **Sighting/first-contact & sail:** wire the Stage-2 sighting (already renderable via
  `PRESENCE.HORIZON`) and Stage-3 first-contact dialogue framing; forward `travel_far`/
  `travel_near` on sail completion.
- **Handover broker:** allow the agent to self-initiate an interaction in `auto` buckets, calling
  `/agent/turn`; broadcast `speaker:"agent"` turns. (The room currently only responds to
  human-opened interactions — this is B1's server half.)
- Continue forwarding `/observe`, `/telemetry`, `/npc/turn` to ML when `ML_SERVICE_URL` set.

### VII.4 — Persistence (multi-session memory, closes gap #5)

- **`IslandStateStore` (new)** following the `archipelago.ts` `IslandStore` pattern: persist per
  island `{ cropStage, structureProgress, vitalityCarry, scarcityLevel, dayCount, tieWarmth:
  Record<counterpartId, number> }`. Supabase when keyed (new migration in `db/migrations/`),
  in-memory fallback otherwise (zero-key path preserved).
- **Decay on load:** apply wall-clock decay (`SURVIVAL.DECAY`) when a session resumes — the teeth
  of irreversibility and the engine of the return hook (Part I §I.5).

### VII.5 — ML service (`services/ml/echo_ml/`) — mostly config + the scheduled re-anchor

- **New telemetry→cue mappings** in the featurizer (`persona.py` `featurize_raw` / the cue tables)
  for `passive_locomotion`, `fork_decision`, `travel_far/near`, `survival_tick`. Add the named
  scalars (`crossing_latency`, `town_rush`, `breadth_index`, `novel_tile_ratio`, hyperbolic-
  discount estimate `k` from repeated grain forks).
- **★ The one-time `W` re-anchor** (`known-gaps.md` scheduled milestone) — run
  `scripts/train_measurement.py` + `anchor_alignment` on the *full multi-flow cue set with real
  behavioral data* once the exploration/survival telemetry ships. Acceptance: ⚑ cues load onto
  `openness`; numerics regression gate green; `individuation_eval.py` passes. **Do not do this
  piecemeal.**
- **BALD → situation director** (`bald.py`): extend the candidate set from NPCs to
  `(affordance, context)` pairs including `scarcity_level`, `audience_size`, `public_or_private`
  (Expert II §II.5, Expert IV §IV.5). Add a per-session intervention cap.
- **BRS metric (new)** `scripts/brs_eval.py`: held-out next-choice reproduction, per context
  bucket (Expert II §II.3) — the north-star fidelity number, twin of `individuation_eval.py`.
- **Reward/gate:** feed the handover veto into `reward.py` preference pairs; no gate changes
  needed (calibration + hysteresis already correct).

### VII.6 — Phased build order (each phase leaves the app runnable)

| Phase | Delivers | Depends on | Fixes |
|---|---|---|---|
| **P1 Survival spine** | day loop, 3 clocks, forks with teeth, diegetic HUD, persistence + decay | VII.1, VII.2, VII.4 | M2 dead air; gap #5 |
| **P2 Recognition felt** | recognition meter, dusk mirror beat, teaching hint, offline honesty, funnel markers | P1 | B2, M1, M3, m2, m3 |
| **P3 Locomotion measurement** | passive sampler (debounced/capped); per-actor `logInteraction` | P1 | gap #2, #4; Rule 3 |
| **P4 The crossing** | Stage-2 sighting + Stage-3 first contact + sail (`travel_far/near`) | P3 | Stages 2–3 |
| **P5 ★ W re-anchor** | one-time full-cue-set recalibration; openness identified | P3+P4 (telemetry complete) | gap #1, #3 (the ★ milestone) |
| **P6 Graduation + handover** | per-bucket progress, graduation moment, autonomous crossing, veto, return hook | P2+P4 | M4, B1, M5 |
| **P7 Town & beyond** | Stage 4 (market/tavern/queue/plaza), Stages 5–7 | P4+P6 | the rich ecology |

**Why this order:** P1 makes it *playable* (the user's headline complaint) and ships the economy
the ML already expects. P2 makes the learning *felt* (retention). P3 builds the openness
apparatus so P5's re-anchor is *complete and done once* (the doc's emphatic requirement). P6 is
the promised payoff. P7 is the long tail of ecology the stage-map already specs.

---

# PART VIII — THE FINE POINTS (small details, outsized impact)

*The user asked specifically for "ince noktalar" — subtle, high-leverage details that make a big
difference while staying genuinely buildable. Each is cheap to implement and disproportionately
improves either fidelity or feel.*

1. **Measure the *hesitation*, not just the choice.** `B2 hover-before-commit` and `C2 decision
   latency` on the irreversible forks are higher-SNR than the choice itself: *how long you
   agonize over saving the seed* separates a torn deliberator from a decisive one even when they
   pick the same option. Cheap to capture (already partly there); very individuating.

2. **The empty island is a probe, not a dead end.** Placing one *novel but empty* island within
   sail range and watching whether a person sails to it (openness) or only ever sails to peopled
   ones (warmth) is the cleanest openness-vs-warmth disambiguator in the game (Stage-2 contrast
   lever). One asset, huge measurement value.

3. **Vitality tint doubles as an honest affect probe.** How a person *responds* to their own
   decline — push harder (energy/grit) vs retreat to the bedroll (self-care) vs seek the pet
   (`I4` stress→warmth) — is a costly, unfakeable affect/coping read that only exists *because*
   the survival clock exists.

4. **Never auto-save the irreversible forks.** A single "commit" confirmation on grain/raft (V.10.2)
   is both good error-prevention UX *and* what makes the latency measurement clean (an accidental
   commit is measurement noise). Weight and honesty align.

5. **The refusal timing is a cue.** `K`-channel refusals (never build the raft, never queue, never
   disclose) are already first-class — but *when* in the arc a person refuses (early vs after long
   deliberation) adds a second bit. Log `stage` + day on every K event (the `EventContext.stage`
   field already exists).

6. **Let scarcity, not the designer, choose the hard days.** Binding `scarcity_level` to BALD's
   uncertainty (Expert IV §IV.6) means the game is hardest exactly where it learns most — and it
   *relaxes on its own* as the echo converges. This single wire turns difficulty from a static
   curve into personalized information-seeking.

7. **The dusk beat must name a *contingency*, not a trait.** "someone who saves for a leaner day"
   (a conditional) lands as uncanny recognition; "warmth: 0.7" lands as a horoscope (Expert III
   §III.1). Same data, opposite feeling. The copy template is the product.

8. **Retrieval should prefer costly memories.** Weighting the echo's retrieval toward Stage-7
   private-moral episodes and scarcity forks (Expert II §II.6) is a one-line ranking change that
   makes the echo sound like *this* person instead of a polite average — the difference between
   a doppelgänger and a chatbot.

9. **The public-minus-private delta is a stored quantity, not a live computation.** Persist each
   person's Stage-4 (public) and Stage-7 (private) behavior on matched acts so the *delta*
   (self-monitoring, Expert III §III.3) is directly readable. This is the single most
   identity-rich number ECHO can produce; make it first-class in the mirror.

10. **Silence is content.** In the calm tone, the *absence* of the mirror beat on a day where
    nothing resolved is honest and restful — do not manufacture a beat every day (that would be
    a streak, Law 1). Beats are earned by real posterior movement only.

11. **Crossing latency is a life-scale cue.** Days from "raft available" to "actually sailed"
    (`stage-map.md` §10) is one scalar that captures novelty-approach-vs-avoidance at the scale of
    a life. Compute it server-side over the `stage` field; it is nearly free and deeply
    individuating.

12. **Keep the first neighbor human when possible.** `nearestEmptySlot` already clusters new users
    around the latest arrival — so a real person is often your Stage-2 stranger. Real players are
    the richest ecology (Invariant 6); bias the crossing toward live neighbors when present, NPCs
    otherwise.

---

# PART IX — VERIFICATION, ACCEPTANCE & MEASUREMENT VALIDITY

*A blueprint that ships must be checkable. This is the acceptance gate for each phase and the
scientific validity checks that keep the doppelgänger honest.*

### IX.1 — Invariant regression (must pass at every phase — automate these)

- **No game-layer overlay:** grep the client for `xp|score|level|streak|badge|points`; zero hits
  in user-facing copy. (Law 1 / Invariant 1.)
- **Non-choice is data:** every affordance has a defined K-twin cue and refusing it never blocks
  progress or shows a penalty. (Law 2 / Invariant 2.)
- **Consent-bounded:** with telemetry OFF the world is fully playable and emits nothing
  (`event-schema.md` §5). Toggle-test each phase.
- **Deletion cascade:** `DELETE /user/{uid}` still hard-deletes all new persisted state (island
  state, tie warmth, funnel markers). Extend the existing deletion test.
- **Zero-key path:** every new subsystem has a mock; a clean checkout with no keys runs P1–P7
  end-to-end. (Repo invariant.)

### IX.2 — Per-phase acceptance criteria

| Phase | Acceptance test |
|---|---|
| P1 | A full day is playable in ≤10 min; the grain fork is irreversible and its consequence persists to the next session; scarcity visibly bites; `time-to-first-fork-decision` recorded. |
| P2 | Recognition meter moves on real `/persona` change only; dusk beat fires only when a trait resolves and names a *contingency*; offline shows an honest label, never a fake fill. |
| P3 | Passive sampler emits ≤1 event / ~1.5 s, capped per day, with no measurable `/observe` load regression in a local two-tab run (the gap #2 bar); `logInteraction` emits both actor vantages. |
| P4 | Sail to empty-novel vs peopled island emits `travel_far` vs `travel_near`; first-contact logs per-actor D5/G1/C1. |
| **P5** | **After the one-time re-anchor:** the ⚑ cues (`enter_unmarked`, `travel_far`, `asks_question`, `self_disclosure`, `deviate_custom`) load *predominantly onto openness* in their walkthroughs; the numerics regression gate stays green; `individuation_eval.py` still passes. (The `known-gaps.md` ★ acceptance, verbatim.) |
| P6 | A bucket reaching `auto` fires the graduation moment; the echo self-initiates a crossing; every autonomous turn shows a rationale; the veto demotes the bucket; veto rate `< ~15%` in playtest. |
| P7 | Stage-4 same-act-under-varying-context produces measurable warmth/formality *slopes* (G2×G3); the public-minus-private delta (Stage 4 vs 7) is computed and stored. |

### IX.3 — Measurement-validity checks (is the echo actually faithful?)

1. **Individuation eval** (`services/ml/scripts/individuation_eval.py`) — distinct persona
   profiles stay distinguishable after each change. Run as a CI gate.
2. **Behavioral Reproduction Score (BRS)** (new, Expert II §II.3) — held-out next-choice
   prediction, *per context bucket*. Track over days; it should rise and plateau. The headline
   "how real is the echo" number.
3. **Per-axis identifiability** (Expert IV §IV.4) — after P5, the Fisher-information matrix has no
   near-zero eigenvalue on the openness direction (the degeneracy is broken). Check the condition
   number of `WᵀR⁻¹W` before/after re-anchor.
4. **Calibration** (`gate.py`) — ECE stays below `e*` before any bucket promotes; no autonomy on
   miscalibrated confidence.
5. **Turing discrimination** (secondary) — a held-out judge distinguishing echo-vs-person should
   trend toward chance as BRS rises.

### IX.4 — Recommended verification method for the build itself

Because this spec spans game, client, server, and ML, verify with a **subagent adversarial read**
before merging each phase: one agent implements, a second audits the diff against the invariant
regression (IX.1) and the acceptance table (IX.2); ML changes are gated by the numerics
regression + individuation eval that already exist in `services/ml`. Never mark a phase done on
partial passes (this mirrors the repo's own phase discipline).

---

# PART X — HOW TO USE THIS DOCUMENT + CONSOLIDATED REFERENCES

### X.1 — How to drive the product from this file

1. Start at **Part VII.6 (phased build order)** — the executable spine. Hand each phase to a build
   flow with its acceptance row from **IX.2**.
2. For *why* a mechanic exists, follow its cross-reference into the relevant expert report (I=game,
   II=ML, III=psych/phil, IV=math, V=UX). Every mechanic is justified from at least two domains.
3. Treat **Part VI (storyboard)** as the felt-experience contract: if a build decision makes any VI
   beat worse, it is wrong regardless of local convenience.
4. Hold every change against **Part IX.1 invariants** — the guardrails that keep ECHO *ECHO*.

### X.2 — The one-paragraph summary (if you read nothing else)

ECHO already has a world-class measurement brain and a beautiful 8-stage cue design, but the
*playable body* — the second-to-second survival loop that generates the cues — is missing, which
is exactly why it feels like "you just spawn on an island." The fix is a **scarcity-driven survival
economy** (three clocks: vitality, daylight, season/decay; soft-irreversible loss; multi-session
persistence) that is *simultaneously* what makes free play compelling and the apparatus that
manufactures high-identity-per-bit measurement — because, mathematically, a choice reveals a person
only in proportion to what it costs. Ship that economy (it is the very economy the ML matrix `W`
was already anchored on), build the exploration mechanics that finally make `openness` measurable,
re-anchor `W` once, make the learning *felt* at dusk and the handover *real*, and the result is a
genuinely playable world whose echo is a faithful behavioral doppelgänger.

### X.3 — Consolidated references

**Game design & motivation.** Csikszentmihalyi (1990) *Flow* · Malone (1981) intrinsically
motivating instruction · Deci & Ryan (1985; 2000) Self-Determination Theory · Deci, Koestner &
Ryan (1999) meta-analysis on extrinsic reward · Juul (2013) *The Art of Failure* · Hunicke,
LeBlanc & Zubek (2004) MDA · Schell (2008) *The Art of Game Design* · Hecker (2010) "Achievements
Considered Harmful?"

**HCI / UX.** Nielsen (1994) heuristics · Norman (2013) *The Design of Everyday Things* · Weiser &
Brown (1996) Calm Technology · Iacovides et al. (2015) diegetic UI & immersion · Fagerholt &
Lorentzon (2009) "Beyond the HUD."

**ML / AI.** Park et al. (2023) Generative Agents · Houlsby et al. (2011) BALD · Christiano et al.
(2017) RL from human preferences · Ouyang et al. (2022) InstructGPT/RLHF · Ho & Ermon (2016) GAIL ·
Ng & Russell (2000) IRL · Guo et al. (2017) calibration · Ha & Schmidhuber (2018) World Models ·
Rabinowitz et al. (2018) Machine Theory of Mind · Lewis et al. (2020) RAG · Settles (2009) active
learning survey · Turing (1950).

**Psychology / philosophy.** Mischel & Shoda (1995) CAPS · Fleeson (2001) / Fleeson & Jayawickreme
(2015) Whole Trait Theory · Snyder (1974) self-monitoring · Samuelson (1938) revealed preference ·
Frankfurt (1971) second-order desires · Plato *Republic* (Ring of Gyges) · Aristotle *Nicomachean
Ethics* · Locke (1689) / Parfit (1984) / Ricoeur (1990) / McAdams (2001) personal & narrative
identity · Costa & McCrae (1992) / Goldberg (1990) Big Five · Wiggins (1979) interpersonal
circumplex · Roberts & Mroczek (2008) personality change · Kahneman & Tversky (1979) Prospect
Theory.

**Mathematics / statistics.** Kalman (1960) · Anderson & Moore (1979) *Optimal Filtering* · Bishop
(2006) *PRML* · Lindley (1956) information of an experiment · Cover & Thomas (2006) *Information
Theory* · Chaloner & Verdinelli (1995) Bayesian experimental design · Anderson & Rubin (1956)
factor identifiability · MacKay (1992) information-based objectives · Ainslie (1975) / Mazur (1987)
hyperbolic discounting · Page (1954) CUSUM · Platt (1999) / Bradley & Terry (1952) calibration &
paired comparison.

### X.4 — Repo artifacts this blueprint is grounded in

`README.md` · `packages/shared/src/{world.ts, persona.ts, archipelago.ts, protocol.ts, npcgen.ts}` ·
`services/ml/README.md` + `echo_ml/{persona.py, persona_model.py, reward.py, gate.py, bald.py,
autonomy.py, reconstruct.py, policy.py, config.py}` · `docs/world-design/{stage-map.md,
cue-catalog.md, event-schema.md, coverage-matrix.md, situation-templates.md, individuation-eval.md,
art-bible.md}` · `docs/ux-audit.md` · `docs/known-gaps.md` · `apps/web/src/components/{IslandClient,
WorldClient, EchoPanel, OutcomesPanel}.tsx` · `apps/realtime/src/WorldRoom.ts`.

*End of blueprint.*

---
