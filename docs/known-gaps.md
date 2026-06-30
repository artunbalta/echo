# Known gaps & tracked debt

Deliberate deferrals, recorded so they are tracked, not lost. Each entry states what, root cause,
why we are not fixing it now, the resolution criterion, and status.

---

## ★ SCHEDULED MILESTONE — the one-time W re-anchor (after Step 6/7)

**openness is, as of Step 4, effectively UNMEASURED across the whole product.** The ⚑ routing gap
is now **cross-flow**, not an F0 quirk: every cue whose design-doc prior is *openness* loads off-axis
because the committed `W` (`services/ml/echo_ml/artifacts/measurement.npz`) has **no
telemetry→openness path** (it was anchored on the island day-loop economy only). Affected, confirmed:
- **F0 locomotion/curiosity:** `enter_unmarked`, `approach_distant_lone`, `egg_horizon_seen`,
  `egg_hollow` → dominance/warmth (gap #1).
- **F2 social openness:** `asks_question`, `self_disclosure` → affect/pace; `deviate_custom` →
  dominance (gap #3).

warmth, dominance, pace, formality, affect all measure cleanly and are validated end-to-end
(Steps 2–4 walkthroughs + the live courtesy gradient). **openness is the one axis with no working
implicit path.**

**Resolution (scheduled, ONE-TIME, do NOT fix piecemeal):** re-anchor `W` exactly once on the
**full multi-flow cue set** (F0 + F2 + F3, and F4–F6 once they exist) with **real user behavioral
data**, via `scripts/train_measurement.py` + `anchor_alignment`. **Scheduled right after Step 6/7**
(all flows + Higgsfield assets in), so the corpus is complete and the calibration is done once, not
re-done per flow (cross-cutting rule #1: loadings are learned, the tables are priors).
**Acceptance:** after the re-anchor, the ⚑ cues above load predominantly onto openness in their
walkthroughs, the numerics regression gate stays green, and the individuation eval still passes.
Gaps #1 and #3 below are the per-flow detail of this single milestone.

---

## 1. F0 exploration cues route to dominance/warmth instead of openness

- **Opened:** 2026-06-29 (Step 2, the 7-flow archipelago build).
- **What:** In the Flow 0 walkthrough (`services/ml/scripts/flow0_walkthrough.py`), the cues
  `enter_unmarked`, `egg_horizon_seen`, `egg_hollow`, and `approach_distant_lone` **move the
  posterior** but load onto **dominance / warmth**, not the **openness** the design doc intends
  (the four ⚑ rows in the Step-2 evidence). The cues that have a real implicit path land exactly
  on the doc's axis (first_move→pace, climb_persist→formality, gaze_reflection→affect,
  stack_tidy→formality).
- **Root cause:** the committed measurement matrix `W` (`services/ml/echo_ml/artifacts/measurement.npz`)
  has **no telemetry→openness path**. It was anchored on the island day-loop economy (time-shares,
  save/risk/persistence), not on F0 locomotion/exploration. With no openness path, an exploration
  cue's signal seeps to the nearest existing path — a costly/uncertain off-trail choice reads as
  `risk_index` → **dominance**; going toward a far thing reads as `approach` → **warmth**.
- **Why we are NOT fixing it now:** re-anchoring W on F0 cues alone is **partial** and would be
  redone once Flows 3–6 exist. Per the design doc's cross-cutting rule #1 (loadings are *learned*;
  the cue→axis tables are priors, not hardcodes), W is to be re-anchored **once** on the **full
  multi-flow cue set with real user behavioral data**, then re-verified by the numerics regression
  gate. A one-time, correct calibration beats two partial refits.
- **Resolution criterion:** after the multi-flow re-anchor, the four ⚑ cues load **predominantly
  onto openness** in `flow0_walkthrough.py` (the `implicit_channel_matches_doc_priors` check is
  extended to assert openness for them), the numerics regression gate stays green, and the
  individuation eval (`services/ml/scripts/individuation_eval.py`) still passes.
- **Status:** OPEN — deferred to the **W re-anchor milestone** (after Flows 3–6 land).

## 2. Flow 0 continuous passive sampler (every ~1.5s) not built

- **Opened:** 2026-06-29 (Step 2).
- **What:** The design doc's F0 t=5.5–20 beat specifies continuous passive emitters firing every
  ~1.5s: movement-speed-variance → pace/energy, heading-change-rate → openness, dwell points,
  cursor/camera micro-jitter & backtracking → deliberation. Step 2 built the **discrete**,
  high-validity cues (first_move, the 6 affordances, dwell at stations, the 3 eggs) but **not** the
  fine-grained ~1.5s passive sampler as a live emitter.
- **Root cause / why deferred now:** two reasons. (a) **Flood risk** — emitting one
  `/observe/behavioral` per ~1.5s over a 3–4 min flow is ~120–160 low-validity events; it needs
  proper batching/debouncing + change-thresholding + a per-flow cap before it ships, or it will
  flood ML. (b) **Same W gap as #1** — its headliner signal is heading-rate → *openness*, which W
  cannot route yet (no telemetry→openness path). Building it before the re-anchor produces cues that
  load on the wrong axis anyway. It is therefore correctly **co-deferred with the W re-anchor**, at
  which point it will be added as a debounced, batched, change-thresholded emitter.
- **Resolution criterion:** a debounced sampler emits ≤1 aggregated movement cue per ~1.5s (capped
  per flow), and after the re-anchor heading-variance loads onto openness/pace as the doc intends,
  with no measurable ML load regression in local two-tab runs.
- **Status:** OPEN — co-deferred to the **W re-anchor milestone**.

## 3. F2/F3 openness-intended social cues route to other axes (same W gap as #1)

- **Opened:** 2026-06-29 (Step 4, F2 dialogue + F3 clearing).
- **What:** Several Flow-2/Flow-3 cues whose design-doc prior is **openness** load elsewhere under
  the committed W: `asks_question` and `self_disclosure` (F2) → affect/pace (carried by reply
  latency + a mild `ts_social`, not openness); `deviate_custom` (F3) → dominance (via `risk_index`).
  They move the posterior and are bucketed on the right `counterpart_status`, but the openness
  direction the doc intends is not yet expressed. Flagged ⚑ in `scripts/flow2_dialogue_walkthrough.py`
  / `flow3_clearing_walkthrough.py` and in `social.ts`.
- **Root cause:** identical to #1 — W has **no telemetry→openness path** (anchored on the day-loop
  economy). Openness is carried mostly by the semantic embedding channel, which is a hash offline.
- **Why we are NOT fixing it now:** same as #1 — re-anchor W **once** on the full multi-flow cue set
  (F0 exploration + F2/F3 openness dialogue) with real behavioral data, not piecemeal.
- **Note (turn latency can dominate the implicit read):** F2 dialogue cues carry reply-latency as an
  implicit signal; on a fast turn the strong `latency_norm→pace` loading can dominate the dominance
  signal of `asserts`/`interrupt` in the *implicit→axis* read. This is faithful (a fast curt turn is
  high-pace), not a bug; the dominance signal (`risk_index`) is still present, just not the top axis.
- **Resolution criterion:** after the multi-flow re-anchor, `asks_question`/`self_disclosure`/
  `deviate_custom` load predominantly onto openness in their walkthroughs; numerics gate + the F2/F3
  regression tests stay green.
- **Status:** OPEN — folded into the **W re-anchor milestone** (same one as #1 and #2).

## 4. F2 proxemics sampled at contact (coarse), not continuously

- **Opened:** 2026-06-29 (Step 4).
- **What:** The doc's proxemics beat is the interpersonal distance "measured **continuously** →
  warmth(+ close) / dominance-or-avoidance (far)". Step 4 derives proxemics authoritatively from
  positions, but only **at the moment of opening contact**, where the interaction-open gate clamps
  distance to ≤ 2.0 tiles. So it is a coarse binary read (intimate ≤1 tile → `proxemics_close`; a
  kept gap 1–2 tiles → `proxemics_far`), not the full continuous settle-distance (which would also
  capture "watches from afar / never approaches", a distance > 2 the open gate excludes).
- **Why deferred:** a true continuous proximity sampler is the same debounced-emitter machinery as
  gap #2 (the F0 passive sampler) and carries the same flood considerations; build both together.
- **Resolution criterion:** a debounced proximity sampler emits the settled distance while a player
  lingers near another (including > 2 tiles = hang-back), not only at interaction-open.
- **Status:** OPEN — co-deferred with the passive-sampler work (gap #2).

## 5. Flow 3 staging / eggs / dilemma-b deferred (measurement wired; theatre + later-flow hooks not)

- **Opened:** 2026-06-29 (Step 4).
- **What (all measurement is wired + proven; these are theatre or later-flow hooks):**
  - **F2→F3 seep is geographic** — the clearing station NPCs are present in the shared room and the
    player walks to them; there is no scripted "the figure gestures and 2–3 others fade into view"
    reveal. No wall, no "Level 3" (the invariant holds), but not the doc's staged reveal.
  - **Conform/deviate has no visible group ritual; the marginal NPC has no visible exclusion
    posture; stations are NPCs without bespoke stall/queue/table props** — text action menus only.
    Art/animation is Step 6 (Higgsfield) + later polish.
  - **Dilemma (b) watched-vs-unwatched queue** is not wired (the doc itself defers it to F5);
    `public_or_private` is currently fixed to "public" for social cues. The basic queue choice
    (wait/cut/let) IS wired.
  - **Eggs** `egg_server_bond` (reciprocity across visits) and the F0-mirroring echo cameo are not
    wired (require world-memory across sessions); `egg_gift_given`/`prepare_before_crossing`/
    `close_ghost` exist in the cue catalog but are not yet reachable from gameplay (F1 economy /
    multi-session not built).
  - **Continuous "whom approached first" / preferred group size** not tracked (audience_size IS
    carried in context).
- **Why deferred:** these are staging/world-memory/later-flow concerns; the per-actor measurement,
  counterpart-status conditionals, and the courtesy gradient — the scientific core of F2/F3 — are
  wired and proven (flow2_dialogue / flow3_clearing walkthroughs + copresence integration test).
- **Status:** OPEN — theatre to Step 6 + polish; dilemma-b to F5; eggs to F4/multi-session.

---

_Decision recorded for Step 3: the passive sampler is left here (not built this turn) for the two
reasons above — flood risk + it shares the openness-routing gap, so it would be reworked at the
re-anchor regardless._
