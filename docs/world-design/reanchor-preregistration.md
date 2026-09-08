# The W re-anchor, pre-registered

> **Status:** canonical, and it is a COMMITMENT rather than a description. It is written BEFORE the
> second `W` re-anchor and must not be edited after the re-anchor has run — amend by appending a
> dated section that says what changed and why, the way `known-gaps.md` appends rather than rewrites.
>
> Takes `⚑20` option 3 and makes option 4 a rule. Recorded as `DECISIONS.md` C29 (SOCIETY-PLAN
> SOC-0.D). The scope list is `⚑13`, `⚑18` and SOC-6.G's society cues.

---

## 0. Why a piece of paper is the whole intervention

`⚑20` records that the second re-anchor happens **once**, on the full cue set, and lists four
options. Option 3 is taken here: keep the one-time rule, and write down in advance — for every
flagged cue — what "it carries signal" would look like.

That is not a hedge. `⚑19` establishes that the committed `W` was fit on an **entirely synthetic**
corpus, so the second re-anchor is not a refinement of a measured matrix; it is **the first time any
loading is tested against behaviour at all**. A single non-repeatable event, whose success criteria
are written afterwards by the people who designed the cues, is not a measurement. It is an
interpretation.

The cost of this document is a few hours. The cost of not having it is that every outcome will look
like a confirmation.

**And option 4 becomes a rule at the same time, because it costs nothing:** an acceptance bar passed
by a flow whose signature cue is unrouted is **not** evidence that the flow measures its thesis, and
every flow report must say so in those words rather than in prose that can be skimmed past.

---

## 1. The bar, stated once

A feature **carries signal** when, after the re-anchor:

  ‖w_f‖∞ ≥ **0.15** on some axis, with the **sign predicted below**, estimated from at least
  **N_min = 120 distinct emissions across at least 30 distinct users**.

`0.15` is not invented here — it is the repo's own threshold, the one
`docs/world-design/action-axis-map.md` already uses to decide whether an action may drive a world
reaction at all. Reusing it means this document cannot be accused of choosing a bar that its
predictions happen to clear.

**Three outcomes, and the third is the one this document exists for:**

| Outcome | Meaning | What follows |
| --- | --- | --- |
| **CARRIES** | ≥ 0.15, predicted sign, N ≥ N_min | Route it. The flow measured its thesis. |
| **DARK** | < 0.15, or wrong sign, N ≥ N_min | The cue does not carry what it was designed to carry. **The flow built on it did not measure its thesis, and its report says so.** |
| **UNDERPOWERED** | N < N_min | **Not a null.** Nothing is concluded. The cue stays flagged and the corpus keeps collecting. |

Recording UNDERPOWERED as a distinct outcome is the single most important line here. Without it, a
cue nobody emitted 120 times reads as a cue that carries nothing, and the design decision built on
it gets retired for the wrong reason.

**A wrong sign is a FAILURE, not a discovery.** If `circled01` loads −0.4 on warmth, the cue is not
"interestingly inverted"; the construct is wrong and the flow that rests on it is wrong with it.
Post-hoc sign flips are how a pre-registration becomes decoration.

---

## 2. The scope, counted correctly

`⚑20` says "thirteen flagged manner scalars (⚑13's five, ⚑18's eight)". That is **thirteen
(scalar, flow) pairs but only ELEVEN distinct scalars** — `circled01` and `cost_paid01` are each
flagged in both F4 and F5, and `⚑18` says so itself ("identical to F5's, unrouted for the identical
reason"). Both counts are defensible; they are not the same count, and the register quotes the
larger one without saying which it means. Corrected here rather than left to be re-quoted.

Two of the eleven are emitted by two different flows, which is a **gift**, not a nuisance: a scalar
that loads the same way in F4 and in F5 has survived a replication the other nine have not. That is
recorded below as a prediction of its own.

---

## 3. The pre-registered predictions

### 3.1 The two that decide whether the flows measured their theses

These are the ones `⚑20` is really about: each is its flow's entire reason to exist.

| Scalar | Flow | Prediction | If DARK |
| --- | --- | --- | --- |
| `circled01` — did the approach circle the cache before acting | F5, and F4 | **openness ≥ 0.15 OR dominance ≤ −0.15.** The behavioural definition of "checked whether anyone was watching" is vigilance, which should read as low dominance or high openness-to-scanning, NOT as warmth. A warmth loading here is a WRONG SIGN result. | F5's thesis — the unobserved self — has no measured basis. F5's report must say that its Ring-of-Gyges reading rests on the decision cue alone. |
| `response_to_defect01` — what you did the round after they took more than their share | F4 | **warmth ≥ 0.15 with a POSITIVE sign for forgiving responses**, and, critically, a loading **distinguishable from `consistency`'s** — the whole `⚑18` argument is that cooperation LEVEL and conditional response to being wronged are two constructs. Falsified if the fitted loading vector's cosine similarity with the cooperation-level feature's exceeds **0.9**. | F4's thesis — the iterated game, tit-for-tat — has no measured basis, and the branch's merge (SOC-0.G) buys measurement it cannot demonstrate. |

The cosine-similarity clause is deliberate. `response_to_defect01` could clear 0.15 and still be
worthless if it is simply a second copy of a feature that already exists — and "it loaded, therefore
it works" would hide that. **A feature that is collinear with one already in the model has not
measured a new construct.**

### 3.2 The nine remaining flagged scalars

| Scalar | Flow(s) | Predicted axis and sign | Why that axis, and what would falsify it |
| --- | --- | --- | --- |
| `cost_paid01` — vitality actually spent on the act | F5, F4 | **warmth ≥ 0.15** | Doc-intended warmth. It is kept off `ts_social` because cost-paid and time-spent are different quantities; if it lands within cosine 0.9 of `ts_social`, that argument was wrong and the scalar should be retired rather than routed. |
| `approach_detour01` — graded path deviation toward the probe | F5 | **warmth ≥ 0.15** | The graded twin of the boolean `approach`, which loads warmth +0.70. Falsified if it lands below 0.15 while `approach` stays high — that would mean the boolean carries everything and the gradient is noise. |
| `dwell_at_marker_ms` — hesitation over the owner's carved mark | F5 | **formality ≥ 0.15 OR pace ≤ −0.15** | Hesitation at a norm marker. Deliberately NOT `decision_latency`, which the same event already carries; falsified by cosine > 0.9 with `decision_latency`, which would prove the double-count `⚑13` feared. |
| `dwell_ms` (the probe's own) | F5 | **no directional prediction; power only.** | `⚑13` un-routed it on a category argument (`ts_build` is the build economy's time-share and neither probe is a build). It is here to be MEASURED, not predicted: the pre-registered claim is only that it will reach N_min so the question can be settled. |
| `settle_distance` — where you stop when you are angry | F4 | **dominance ≥ 0.15** | The proxemics of a grievance. ⚠️ **`⚑18` records that the first version of this scalar measured the pathing CONTROLLER and not the person** — two personas both returned 1.5. So this prediction is conditional on a controller check being re-run on the corpus's own rows before the loading is read at all. A loading taken without that check is void, whatever its value. |
| `return_directness01` — path deviation on the way back | F4 | **openness ≤ −0.15** | Directness as low novelty-seeking. Kept off `path_tortuosity` because that was anchored on the P3 sampler's normalised ratio; falsified by cosine > 0.9 with `path_tortuosity`, which would make it `⚑6`'s mistake after all. |
| `detoured_first01` — a fraction of a delay | F4 | **pace ≤ −0.15** | It is a delay fraction, not a day-share, which is why no `ts_*` fits. |
| `unprompted` — self-starting | F4 | **energy ≥ 0.15 OR dominance ≥ 0.15** | Nothing anchored means "began without being asked". Falsified by cosine > 0.9 with `decision_latency`, which already carries the timing. |
| `stake_amount01` — a reciprocal stake | F4 | **dominance ≥ 0.15** | Kept apart from `gift_amount01` on purpose: a stake expects return and a gift does not. Falsified if the two are within cosine 0.9, which would mean the distinction is a design belief and not a behavioural one. |

### 3.3 `taken01`'s untested interior — a different kind of prediction

`⚑13` records that `taken01` IS routed, to `consistency`, but that `W` learned that loading from a
corpus containing only the two point masses `return_cache` 0.9 and `keep_cache` 0.1. **The linearity
between them is assumed, never observed.**

*Pre-registered:* on the real corpus, bin `taken01` into deciles and fit the loading per bin. The
routing is upheld only if the per-bin loadings are **monotone in `taken01`** and the largest
deviation from the straight line between the endpoints is **< 0.10**. A half-emptied cache reading
like a full one, or like an untouched one, falsifies the interpolation — and that is a real finding
about a moral probe, not a fitting detail.

### 3.4 The society cues (SOC-6.G), pre-registered before they exist

Written now precisely because they do not exist yet. A cue whose success criteria are written after
its first data is a cue nobody can be wrong about.

| Cue | Status today | Prediction | Note |
| --- | --- | --- | --- |
| **C11** shift labour (`work_shift` / `shirk_work`) | routed to `persistence` | **formality ≥ 0.15** — `persistence` already loads formality +0.284, so this one is predicted to CARRY, and it is the control case | If a cue routed to an already-strong feature comes back DARK, the re-anchor itself is suspect, not the cue |
| **C12** vocation commitment (`take_vocation`) | routed to `persistence` | **formality ≥ 0.15** | Same control |
| **G14** hosting (`host_table`) | routed to `approach` + `ts_social` | **warmth ≥ 0.15** via `approach` (+0.70 today) | Control case |
| **G13** self-feeding (`eat_meal`) | routed to `ts_leisure` only | **DARK is the predicted outcome.** `ts_leisure`'s largest loading is 0.0577 | Pre-registering a predicted null. If it comes back CARRYING, something moved that nobody intended |
| **G15** neutral register (`transact_neutral`) | routed to `approach` | **warmth ≥ 0.15**, and **weaker than G11's warm twin** | The gradient is the read, not the level |
| **I7** bereavement | no emitter | **warmth ≥ 0.15 AND affect ≥ 0.15** | Needs SOC-6.H's death events first. UNDERPOWERED until then, by construction |
| **F13** inheritance disposition | no emitter | **warmth ≥ 0.15** for passing on / giving away | Needs SOC-6.I. UNDERPOWERED until then |

**Kinship and being-known are deliberately absent from this table.** SOC-6.G established they are
not missing cues at all — they are one missing dimension of the eight-field context envelope
(`counterpart_status` is a status ladder with no relational value, and every live player is stamped
`peer`). An envelope field is not a loading and has nothing to pre-register here; it has a schema
decision to make instead.

---

## 4. What this document does NOT solve, said plainly

**Establishing real `z` labels is a research programme and it does not resolve by building more.**
`⚑21` measured why: 7 of 66 features had any variance in a 240-row corpus, and labels taken from a
user's own posterior give ‖W‖ = 0.00 **by construction**, because that posterior was produced by the
committed `W`. Nothing in this file changes that. The three honest sources are outside the loop —
curated self-report, a human-rated subset, or an outcome the axes are supposed to predict — and
choosing one is a separate decision that this pre-registration makes *possible to evaluate*, not
*unnecessary*.

Everything above is falsifiable given a corpus. None of it manufactures one.
