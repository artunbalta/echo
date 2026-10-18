# Known gaps & tracked debt

Deliberate deferrals, recorded so they are tracked, not lost. Each entry states what, root cause,
why we are not fixing it now, the resolution criterion, and status.

---

## ★ MILESTONE RESOLVED — the one-time W re-anchor (ECHO P5, 2026-07-12)

**DONE.** The re-anchor ran exactly once, on the full multi-flow cue set (F0 exploration from
the P3 passive sampler + F2/F3 dialogue + P4 travel with `dest_occupants`), via
`scripts/train_measurement.py` + `anchor_alignment`. What changed:

- `persona.py` grew four IDENTIFIED openness features (F 62 → 66): `novel_tile_ratio`,
  `path_tortuosity`, `travel_novelty`, `curiosity` — the telemetry→openness path W lacked.
- `ingest.py` re-routed every ⚑ cue onto them (`enter_unmarked`, `approach_distant_lone`,
  `egg_horizon_seen`, `egg_hollow`, `asks_question`, `self_disclosure`, `deviate_custom`,
  `travel_far` incl. the bare-shore modulation); `passive_locomotion` now featurizes.
- New committed `measurement.npz`; openness's top loadings are now
  `path_tortuosity +0.47, travel_novelty +0.41, curiosity +0.41`.

**Acceptance, verified:** all 8 flagged cues load PREDOMINANTLY onto openness (delta
projection, 8/8); flow0 walkthrough now *asserts* openness for the four F0 cues and passes;
the numerics regression gate + all 126 ML tests stay green; `individuation_eval.py` passes;
telemetry-block Fisher information for openness rose 4.06 → 44.9 (13.7×, no near-zero
eigenvalue on the openness direction). New north-star: `scripts/brs_eval.py` (BRS —
held-out next-choice per context bucket) passes at 1.00 conditional / 0.50 pooled-control.

The original milestone text is kept below for the record.

---

## ★ (historical) SCHEDULED MILESTONE — the one-time W re-anchor (after Step 6/7)

**openness is, as of Step 4, effectively UNMEASURED across the whole product.** The ⚑ routing gap
is now **cross-flow**, not an F0 quirk: every cue whose design-doc prior is *openness* loads off-axis
because the committed `W` (`services/ml/echo_ml/artifacts/measurement.npz`) has **no
telemetry→openness path** (it was anchored on the island day-loop economy only). Affected, confirmed:
- **F0 locomotion/curiosity:** `enter_unmarked`, `approach_distant_lone`, `egg_horizon_seen`,
  `egg_hollow` → dominance/warmth (gap #1).
- **F2 social openness:** `asks_question`, `self_disclosure` → affect/pace; `deviate_custom` →
  dominance (gap #3).
- **Stand / travel (F2+/F6):** `travel_far` (sail to a far island — openness/novelty-seeking) routes
  via `risk_index` → dominance/intellect under the committed W; openness stays flat (gap #3).

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
- **UPDATE (2026-06-30, embodied rebuild):** the debounced sampler IS now built as the
  `movement_sample` cue (≤1 aggregate/~1.5s, change-thresholded, per-flow cap) — see
  `apps/web/src/game/activities/`. Its ONLY mapped signal is `still_ms → solitude_tol` (a real W
  path — calm/stillness, the low end of energy). `heading_var`, `speed_var`, `explore_ratio` are
  carried in `raw_signals` (captured for the re-anchor) but are deliberately **NOT** mapped to any
  feature in `ingest.py` (`_embodied_features`, the `movement_sample` branch), precisely so a
  high-frequency sampler cannot contaminate dominance/warmth before the re-anchor learns their true
  (openness/pace) direction. So the sampler infrastructure is done; the openness *routing* remains
  deferred to the re-anchor.
- **UPDATE (2026-07-16):** superseded. The ★ P5 re-anchor closed this via the **P3
  `passive_locomotion` sampler** (`game/telemetry.ts`), whose `novel_tile_ratio` / `path_tortuosity`
  ARE the anchored openness directions. There are now two samplers; `passive_locomotion` is canonical
  and this branch's F1 `movement_sample` keeps only `still_ms → solitude_tol`. See #6 for why the two
  sets of scalars are not interchangeable.
- **Status:** CLOSED for the locomotion→openness routing (via P5 + `passive_locomotion`); see #6 for
  the remaining `decoration` flag.

## 6. Embodied-activity openness cues route off-axis / are captured-unrouted (same W gap as #1)

- **Opened:** 2026-06-30 (the F1/F4/F5/F6 embodied rebuild).
- **What:** the embodied activities emit *manner* scalars that the design doc intends for **openness**
  but the committed W cannot route: `decoration` (a decorative/non-functional flourish on a build —
  doc: openness) is carried honestly as extra build-time (`ts_build`) in `ingest._embodied_features`,
  NOT as openness; `explore_ratio` / `heading_var` (explore-vs-exploit while gathering/roaming — doc:
  openness) are captured in `raw_signals` but unrouted (see gap #2). The manner cues that DO have a W
  path load exactly as the doc's priors intend and individuate cleanly: `thoroughness01` /
  `persist_after_fail` → `persistence` (grit/conscientiousness→affect/formality), `decision_latency_ms`
  → `decision_latency` (deliberation→pace), `edits` → `editsCount` (self-monitoring→formality),
  `dwell_ms` → `ts_build`/`ts_earn`/`ts_learn` (industriousness/curiosity time-share), `risk01` →
  `risk_index` (dominance), `delayed` → `save_rate` (time-discounting→pace), `still_ms` →
  `solitude_tol` (calm).
- **Root cause (ORIGINAL):** identical to #1/#3 — W had no telemetry→openness path (anchored on the
  day-loop economy). Not re-routed; carried on the nearest honest own-axis feature or captured-unrouted.
- **UPDATE (2026-07-16, the 2D→3D renderer migration merged main in):** the ★ P5 re-anchor **is done**
  and W now HAS an openness path (`novel_tile_ratio`, `path_tortuosity`, `travel_novelty`, `curiosity`).
  This gap does **not** close automatically, because those directions were anchored on *other cues'*
  scalar definitions:
  - `explore_ratio` / `heading_var` (this branch's F1 `movement_sample`) are **not the same quantities**
    as the P3 `passive_locomotion` sampler's `novel_tile_ratio` / `path_tortuosity` — the latter is a
    normalized ≥1 tortuosity ratio, the former a 4-way facing-change count per distance. **Decision:
    `passive_locomotion` (P3, `game/telemetry.ts`) is the canonical locomotion→openness channel**;
    `movement_sample` keeps only the job it alone does (`still_ms → solitude_tol`). Feeding one
    sampler's scalars into the other's learned direction would be exactly the silent re-route
    cross-cutting rule #1 forbids.
  - `decoration` ("spent longer making the raft ornate") has no anchored direction of its own:
    `curiosity` was anchored on *choice* cues (`enter_unmarked`, the eggs, `asks_question`,
    `self_disclosure`, `deviate_custom`). Routing decoration onto it is a real hypothesis, not a
    rename — so it stays carried honestly as `ts_build` and stays ⚑ until evidence.
- **Resolution criterion (revised):** `decoration` is shown to load predominantly onto openness before
  it is routed there (its own change, its own evidence); the numerics gate and the embodied
  individuation walkthrough stay green. Do NOT re-train W for this — the re-anchor was one-time.
- **Status:** OPEN (narrowed) — `explore_ratio`/`heading_var` **resolved by decision** (superseded by
  `passive_locomotion`, not routed); `decoration` still ⚑ pending evidence.

## 3. F2/F3/travel openness-intended cues route to other axes (same W gap as #1)

- **Opened:** 2026-06-29 (Step 4, F2 dialogue + F3 clearing; extended Step 6 for the travel stand).
- **What:** Several cues whose design-doc prior is **openness** load elsewhere under the committed W:
  `asks_question` and `self_disclosure` (F2) → affect/pace (carried by reply latency + a mild
  `ts_social`, not openness); `deviate_custom` (F3) → dominance (via `risk_index`); and the travel
  stand's `travel_far` (Step 6 — sailing to a far island, openness/novelty-seeking) → dominance/
  intellect (via `risk_index`), openness flat (confirmed in `scripts/stand_travel_walkthrough.py`:
  μ_wanderer openness ≈ −0.19 while dominance/intellect move). `travel_near` → `consistency`,
  `prepare_before_travel` → `persistence` route fine. All move the posterior and bucket correctly,
  but the openness direction is not yet expressed. Flagged ⚑ in `scripts/flow2_dialogue_walkthrough.py`
  / `flow3_clearing_walkthrough.py` / `stand_travel_walkthrough.py` and in `social.ts`.
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

---

## ⚑ 7. W learned `persistence` = 1.0 from data where 1.0 was never observed (2026-07-17)

- **Opened:** 2026-07-17 (the raft unification, `a4f8a8c` — the day-loop and the F1 build became one
  raft, which is what first fires `structure_progress { finished: true }`).
- **What:** `finished: true` maps to `persistence = 1.0` in the ingress (`app.py`), and that value is
  now emitted for real when the raft is launched (the hull hits the water). Before the unification it
  had **never fired in the product's life** — a click-station could only ever say `started` (→ 0.5).
  So the committed W learned the `persistence` loading from a corpus in which the feature's **1.0 edge
  was never present**; every training row sat at ≤ 0.5.
- **Why it's a ⚑, not a bug:** a linear-Gaussian measurement model (factor analysis + Kalman) is least
  reliable **extrapolating to the edge of a feature's range it never saw**. The 1.0 reads are honest
  and the posterior stays finite (numerics gate green, individuation green), so nothing is broken
  today — but the loading at 1.0 is an extrapolation, not a fit. Do not silently trust it as if it
  were interpolated.
- **Resolution:** the **next** scheduled W re-anchor (whenever it comes — NOT now, the P5 one-time
  re-anchor is done) will have real `finished: true` rows in its corpus, so `persistence`'s top of
  range gets fit from data instead of extrapolated. Until then: flagged, not re-routed, not retrained.
- **Status:** OPEN — carried to the next re-anchor's corpus. No action before then.

---

## ⚑ 8. "drift 0.0000" never measured client-vs-server; the real invariant was unmeasured (2026-07-17)

- **Opened:** 2026-07-17 (the 2D→3D migration, reviewing what the drift claim actually proved).
- **What:** The product has long cited **"drift 0.0000"** as proof that the client's predicted (x,y)
  and the server's authoritative (x,y) stay together. **They were never compared.** Two different
  things wore that number:
  - The **copresence integration test** (`apps/realtime/src/copresence.test.mts`, `#4 no-rebound`)
    walks an entity **on the server only** and checks it stops cleanly at the shoreline with no
    rebound. That is a real, valuable **server-side no-jitter** test — but it never runs the client
    predictor, so it cannot measure client↔server divergence.
  - The client **reconcile error** in `WorldCore.applySnapshot` (`err = |localX − snap.x|`, snap if
    `> 1.5`) compares the predictor to the incoming snapshot — but historically this was described/
    used as if it proved agreement, when a hard snap on `> 1.5` **masks** any real divergence, and
    the predictor + the thing it was checked against were driven by the **same client ticker**.
  - Net: **the real invariant — client-predicted vs server-authoritative (x,y) for the same entity
    at the same tick — was unmeasured.** "0.0000" was a comforting mask, not a guarantee. Do not cite
    it as one.
- **What's done now (not deferred):** `WorldCore.getDrift()` measures it directly — sampled per
  self-snapshot in `applySnapshot`, **before** the reconcile snap, so a correction cannot hide it —
  and the `/play?drift` dev HUD surfaces `last / max / mean`. This is the honest instrument; the
  reported 3D number comes from it.
- **Still open (the rigorous form):** the direct sample compares the client's CURRENT prediction
  against a snapshot that, on a real network, reflects the server a latency ago — so over the
  internet it reads a floor, not the tick-exact error. The fully tick-aligned version keeps a ring
  of the client's predicted position keyed by input `seq` and compares against the snapshot's acked
  `seq`. Deferred (the local three-service run has ~1–2 ticks of latency, where the direct sample is
  already the real number); flagged so nobody mistakes the local floor for the networked worst case.
- **Status:** OPEN (rigorous seq-aligned form) — direct instrument shipped; do not resurrect
  "drift 0.0000" as proof.

## ⚑ 9. A fixed client simulation step must move both sides together (option B), deferred (2026-07-17)

- **Opened:** 2026-07-17 (reverting a client-only fixed/clamped step introduced during the migration).
- **What:** The client integrates local movement at the **render-frame delta** (`WorldCore.step`:
  `dt = dtMs/1000`, unclamped), because the **authoritative server integrates at exactly that shape**
  (`WorldRoom.tick`: `dt = dtMs/1000` from `setSimulationInterval`, variable, **not** a fixed 20 Hz).
  A migration-era change clamped/fixed the client step alone; it was **reverted**, because a fixed
  client stepping against a variable-dt server agrees **less**, not more — the reconcile error grew
  under it, which is the tell. A client-only step change is always wrong here.
- **Why a fixed step could still be wanted:** a fixed simulation step (accumulator, both sides) makes
  integration deterministic and frame-rate-independent, which is the textbook basis for input replay
  / rollback reconciliation. It is a legitimate future direction.
- **Resolution (the correct fix, deferred):** **option B — change BOTH sides together.** Client and
  server adopt the same fixed step + accumulator, and reconciliation becomes seq-aligned replay
  rather than a `> 1.5` snap. This is its own piece of work with its own verification (the
  `getDrift()` instrument from ⚑8 is the acceptance test: the fixed-both-sides number must beat the
  variable-both-sides number, not just the broken variable-vs-fixed one). **Do NOT touch one side
  alone.**
- **Status:** OPEN — deferred by design; guarded by the comment in `WorldCore.step` and by ⚑8's
  instrument.

---

## ⚑ 10. A solo session's cues are client-authoritative and unstamped (2026-08-07)

- **Opened:** 2026-08-07 (the solo fallback). **Revised the same day** after the travel-budget
  question below turned out to be a real bias rather than a footnote.
- **What:** When the realtime room is unreachable the client simulates a solo session rather than
  showing a blocking modal: it authors its own self entity, ticks `applySnapshot` at `WORLD.TICK_HZ`,
  and runs Flow 0, Flow 1 and the day loop. Those flows emit behavioral cues.
- **1. Solo positions are CLIENT-AUTHORITATIVE with no server-stamped context.** No server ever saw
  the player's (x, y), and no server stamped the context a room-mediated cue would carry
  (`audience_size`, `public_or_private`, counterpart status). This much is unchanged from the
  existing client-side ingress: Flow 0 and Flow 1 post directly to `/api/observe/behavioral` from the
  client in the ONLINE case too, through `Flow1Scene`'s `send` and `emitFlow0`. The room was never in
  that path.
- **2. Solo travel IS budgeted the same as online. This was NOT true when solo first landed.**
  Online, `WorldRoom.integrate` calls `beginCrossing` at every landfall, so reach is a budget PER
  CROSSING and `effectiveSeaworthiness` ages the raft by its accumulated open-water path. The first
  solo implementation had no server integrate loop and therefore did neither: a solo raft kept its
  launch-time reach forever, never aged, and a solo player could island-hop indefinitely.
  **That was a measurement defect, not a gameplay one.** Unlimited travel inflates
  `novel_tile_ratio`, `path_tortuosity`, `travel_novelty` and `curiosity`, precisely the four
  openness features the ★ P5 W re-anchor added. With `SOLO_CUES_FEED_POSTERIOR` true, an unbudgeted
  solo session would have read as **systematically MORE OPEN** than an online session for the same
  person performing the same behaviour, on the newest and most recently re-anchored axis.
  **Closed:** `beginCrossing` was lifted out of `WorldRoom` (where it was private) into shared
  `raft.ts` as a pure function, and both the server and the solo tick now call that one definition.
  The solo tick detects landfall with the same shared `oceanLandAt(x, y, OCEAN_BEACH_W)` and
  accumulates the same open-water path length the server does. `apps/web/tests/solo-raft.test.mts`
  replays both accountings over one identical path and asserts they agree step for step, plus that a
  solo raft's reach strictly decreases across successive crossings and never falls below
  `REACH_FLOOR`. So the openness features are no longer biased by session mode.
- **3. Whether solo sessions should feed the posterior at all is the HUMAN'S OPEN DECISION (P3.6).**
  Not made here, and not to be made by an agent. The default is `SOLO_CUES_FEED_POSTERIOR = true` in
  `apps/web/src/components/WorldClient.tsx`, which is no change: solo cues flow to the same endpoint
  with the same payload, no new field, no suppression. It is named and referenced at the single place
  it matters so the policy is one line to flip, not a gate to invent.
  - **For feeding it:** the behaviour is real. The manner scalars (`thoroughness01`, `dwell_ms`,
    `persist_after_fail`, `decision_latency_ms`) are exactly as earned as in an online session, they
    come from the same controllers, and the travel budget now matches. Discarding them throws away
    the only data a player generates when the room is down, which is precisely when a solo player is
    playing hardest to be seen.
  - **Against feeding it:** the posterior would contain rows no server ever witnessed, which is a
    different evidentiary class from the rest of the corpus and is not marked as such. There is no
    `session_mode` field on the event, so once ingested a solo row is indistinguishable from an
    online one, and a future re-anchor could not exclude them even if it wanted to. If the answer is
    "yes but marked", that is a schema change and its own piece of work.
- **Related, and it DOES need a decision (see ⚑12):** room-routed telemetry simply stops in a solo session.
  `TelemetryCollector` flushes through `net.sendTelemetry`, and `tele.start()` is only reached inside
  the `try` after `net.connect()` resolves, so the collector never starts and the call site is never
  reached. The consequence is that the `passive_locomotion` channel (⚑2, the canonical
  locomotion→openness path) produces nothing in a solo session. **⚑12 works this through and finds
  it is not a footnote: three of the four openness features the ★ P5 re-anchor added receive zero
  evidence in a solo session, and the fourth receives two one-shot sources out of seven.**
- **Status:** OPEN on point 3 only, awaiting the human's call. Point 2 is CLOSED. Nothing suppressed,
  no gate invented.

## ⚑ 11. The automated suite is render-blind, and proved it for three weeks (2026-08-07)

- **Opened:** 2026-08-07 (after the invisible-landmass defect, `353e729`).
- **What:** From 2026-07-18 to 2026-08-07 the island landmass did not render in production at all.
  `buildIsland()` wound every triangle so its geometric normal pointed at `-Y`,
  `computeVertexNormals()` derived the normals from that winding, and `MeshLambertMaterial` defaults
  to `THREE.FrontSide`, so the whole disc was back-face culled from a camera above it. Players saw
  bare sea with the per-island flora apparently floating on it. **Every automated gate stayed green
  throughout.**
- **Why the gates could not see it:** the measurement spine is renderer-independent **by design**. It
  reads timing, path, hesitation, thoroughness and persistence, and knows nothing about how the world
  is drawn. Collision runs on `oceanLandAt(x, y, OCEAN_BEACH_W)` over the flat plane and never
  consults `groundHeight()`. So a player can walk the island, perform every Flow-1 beat and emit a
  fully valid cue stream through a world in which the land is not drawn. The individuation harness
  (`run_individuation_3d.sh`) does drive the REAL client through Playwright, which is what makes this
  worth recording: it reads `/observe/behavioral` events off the **network**, never the framebuffer,
  so it passed against an invisible landmass and its number was correct while it did.
- **The load-bearing consequence:** a green `npm run build`, 129 passing ML tests, an empty protected
  `services/ml/` diff and a passing individuation number **jointly prove nothing about the render**.
  The human browser check (`docs/verify-3d-render.md`) is not a formality layered on top of the
  automated suite. For this class of defect it is the only coverage that exists.
- **The mitigation that worked, and the pattern to reuse:** `apps/web/tests/terrain.test.mts` is
  renderer-free. It touches no WebGL and does not import `three`. It parses the real constants and the
  actual `idx.push` order out of `terrain.ts`, replays the vertex grid over the real shared geometry,
  and asserts a **geometric invariant** (no triangle winds downward) plus a structural one
  (`draw()` calls `ensureTerrain`). It was verified to fail against the pre-fix code. **When adding 3D
  coverage, reach for an invariant over the geometry rather than a screenshot**, because headless
  WebGL is not trustworthy in this project and a pixel assertion would be both flakier and weaker.
- **Still uncovered:** the mid-session terrain rebuild. `ensureTerrain` disposes and reconstructs up to
  seven island discs plus their flora synchronously while the player is moving and the scene is live.
  No automated test exercises that path and no harness does either, because a Flow-1 capture never
  leaves one island. It is a step in `docs/verify-3d-render.md` instead.
- **Status:** OPEN as a standing property of the suite, not a bug to fix. Recorded so nobody reads a
  green board as evidence about the render again.

## ⚑ 12. A solo session contributes almost no openness evidence (2026-08-07)

- **Opened:** 2026-08-07, investigating a line filed too lightly in ⚑10 ("the collector never starts
  in solo, so `passive_locomotion` produces nothing. Stated, not changed."). That is true and it is
  not a footnote. **No behaviour was changed here. This entry is analysis; the decision is the
  human's.**

### The routing, end to end

`passive_locomotion` is the canonical locomotion to openness channel (⚑2, ⚑6). It is **room-routed**,
and it never touches `/observe/behavioral` at all:

| # | Step | File |
|---|---|---|
| 1 | `this.hooks.onSelfSample?.(this.localX, this.localY)` every step | `game/WorldCore.ts:409` |
| 2 | `onSelfSample: telemetryConsent ? (x, y) => loco.feed(x, y) : undefined` | `components/WorldClient.tsx:1007` |
| 3 | `LocomotionSampler.feed` samples at `SAMPLE_MS` 250ms, emits at most one window per `EMIT_MS` 1500ms, skips windows under `MIN_PATH_TILES` 0.5, change-thresholds against the last emit, caps at `MAX_EMITS_PER_DAY` 400 | `game/telemetry.ts:82-86, 100-190` |
| 4 | scalars: `heading_change_rate`, `path_tortuosity` (raw path/net ratio, >= 1), `novel_tile_ratio`, `backtrack_rate`, `dwell_ms`, `tiles` | `game/telemetry.ts:167-174` |
| 5 | `teleRef.current?.emit("passive_locomotion", { ...scalars })` | `components/WorldClient.tsx:1004` |
| 6 | `TelemetryCollector.emit` buffers; flushes on a 2000ms timer **or** at 25 buffered events | `game/telemetry.ts:34-49` |
| 7 | the collector's sender is `(events) => net.sendTelemetry(events)` | `components/WorldClient.tsx:1101` |
| 8 | **`sendTelemetry(events) { this.room?.send(C2S.TELEMETRY, { events }); }`** | `game/net.ts:124-126` |
| 9 | server handler; returns early unless `userId` resolves from room state | `realtime/WorldRoom.ts:245-252` |
| 10 | `logTelemetry` POSTs `{ userId, sessionId, event }` to `${ML_URL}/telemetry` | `realtime/persistence.ts:46-53` |
| 11 | the `passive_locomotion` branch sets `tele["novel_tile_ratio"]` and `tele["path_tortuosity"]`, then `P.observe(st.posterior, "", tele)` | `services/ml/echo_ml/app.py:262-279` |

Step 8 is the whole of it. With no room, `this.room` is undefined and the send is a silent no-op.

**Sharper than ⚑10 had it.** `tele.start()` is only reached inside the `try` after `net.connect()`
resolves (`WorldClient.tsx:1409-1411`), so in solo the 2000ms flush timer never starts. But `emit()`
still buffers, and it still calls `flush()` at 25 events, and `stop()` flushes again on unmount. So
the events are constructed, accumulated, handed to a no-op, and discarded. Nothing is sent, nothing
errors, nothing is logged. The failure is completely silent.

### What one solo session loses, against one online session of identical behaviour

The ★ P5 re-anchor added four IDENTIFIED openness features and took openness Fisher information from
4.06 to 44.9. Their complete set of sources:

| Feature | Fed by | Solo |
|---|---|---|
| `novel_tile_ratio` | `passive_locomotion` only (`app.py:271`) | **none** |
| `path_tortuosity` | `passive_locomotion` only (`app.py:273`) | **none** |
| `travel_novelty` | `travel_far` only (`ingest.py:304`), emitted by the server's travel stand | **none** |
| `curiosity` | `enter_unmarked` (`ingest.py:82`), `approach_distant_lone` (109), `egg_horizon_seen` (112), `egg_hollow` (118), `deviate_custom` (265), `asks_question` (342), `self_disclosure` (345) | **2 of 7** |

Of `curiosity`'s seven sources, only `enter_unmarked` and `egg_hollow` survive: both are client-side
F0 cues posted straight to `/api/observe/behavioral`, and both are **one-shot eggs**, not continuous
channels. `egg_horizon_seen` is server-emitted (`WorldRoom.ts:792`). `approach_distant_lone` needs
another person. `deviate_custom`, `asks_question` and `self_disclosure` are F2/F3, room-only.

So: **three of the four openness features receive zero evidence in a solo session, and the fourth
receives two one-shot sources out of seven.** Everything else the flows measure is unaffected, because
F0 and F1 post client-side either way: `persistence`, `decision_latency`, `editsCount`, the `ts_*`
time-shares, `risk_index`, `save_rate` and `solitude_tol` all arrive normally. The loss is
concentrated almost entirely on openness, with a smaller secondary loss on the social axes (warmth,
dominance) because F2/F3 cannot happen with nobody there.

**Why this matters right now:** with the Render services suspended, every visitor to the deployed
site is in a solo session. Openness is therefore going unmeasured product-wide again, which is the
exact condition ★ P5 was built to end.

### This runs OPPOSITE to the bias ⚑10 records, and both must be said together

⚑10 point 2 records that an unbudgeted solo raft would have inflated these same four features, and
that P12 closed it. This entry records that the channel carrying three of them does not fire in solo
at all. Both are true, and either alone is misleading: **the P12 inflation was latent rather than
active.** It would only have become active if locomotion were ever routed in solo. Anyone who reads
⚑10 and concludes "solo openness is now correct" has it wrong; anyone who reads this entry and
concludes "so the P12 fix was unnecessary" also has it wrong, because routing locomotion in solo is
exactly the option under consideration below, and it would activate the inflation if P12 had not
landed first.

### The options, including doing nothing

**Option 0, do nothing.** Solo sessions contribute no locomotion openness evidence. Zero risk, zero
code, no possibility of silent re-routing. The cost is that openness stays unmeasured for every solo
player, which is currently all of them, and that the posterior quietly reports low openness for
people who may simply never have had the channel read.

**Option 1, send `passive_locomotion` to `/observe/behavioral` in solo.** Rejected on inspection.
That endpoint takes `BehavioralEvent`s with the eight mandatory context fields, and the ML's
`passive_locomotion` handler lives on `/telemetry`, not on the behavioral ingress. Making this work
would need a new event shape, which the constraints forbid.

**Option 2, keep the channel and change only the transport. The correction above makes this the
cheapest option, not the riskiest.** A Next API route that forwards a
`TelemetryEvent` to the ML service's existing `/telemetry`, used by the solo path in place of
`net.sendTelemetry`. For this **not** to be silent re-routing, all of the following must hold, and
all of them can:

- the same sampler instance, `LocomotionSampler` in `game/telemetry.ts`, unmodified;
- the same scalar definitions, in particular `path_tortuosity` as the raw path/net ratio >= 1 that
  `persona.py:454` expects and NOT the F1 sampler's 4-way facing-change count (the exact confusion
  ⚑6 forbids);
- the same accumulation window and caps: `SAMPLE_MS` 250, `EMIT_MS` 1500, `MIN_PATH_TILES` 0.5, the
  change threshold, `MAX_EMITS_PER_DAY` 400;
- the same ML branch, `app.py:262`, unmodified;
- differing **only** in transport.

Achievable without touching protected files: **yes.** `services/ml/**` needs no change at all, because
the `/telemetry` endpoint and the `passive_locomotion` branch already exist and already do the right
thing. What would change is one new Next route and the `send` callback in `WorldClient`. No new field
on `BehavioralEvent`, no scalar change, no threshold change, no retraining.

**What would stamp the mandatory context in the absence of a server? Nothing needs to, and the
online path contributes far less than it looks like it does.** The eight context fields live on
`BehavioralEvent`, not on `TelemetryEvent`, so `passive_locomotion` has **never** carried them,
online or offline.

What the room actually does with a telemetry batch, end to end:

```
game/telemetry.ts:122-190     LocomotionSampler.tryEmit   <- the scalars are computed HERE, on the client
                              (WorldCore.ts:911 sampleLocomotion() likewise, for F1's movement_sample)
realtime/WorldRoom.ts:134     e.refId = options.userId ?? client.sessionId   <- client-asserted at join
realtime/WorldRoom.ts:245-252 onMessage(C2S.TELEMETRY, ...)
                                userId = state.entities.get(sessionId)?.refId
                                logTelemetry(userId, sessionId, ev)
```

**The room recomputes nothing, validates nothing and clamps nothing.** It looks up a `userId` the
client asserted at join and relays the batch with a `sessionId` attached. So **online locomotion
scalars were never server-witnessed either.**

That materially lowers the bar for the decision below, and an earlier draft of this entry overstated
it. Routing locomotion in a solo session is **not** "letting unwitnessed data into the posterior": it
is restoring a channel that was already unwitnessed, over a different transport, with the same
sampler and the same scalars. The only thing genuinely lost in solo is **`sessionId` continuity**,
because the room is what mints and tracks the session. Anything an attacker or a bug could do to
solo locomotion scalars, it could already do to online ones.

**Option 3, buffer solo locomotion and replay it when a room becomes reachable.** Preserves server
stamping, but the timestamps are stale by then, the session is over, and the posterior's update is
order-sensitive. More machinery and more ways to be wrong than option 2. Not recommended.

### What this implies for P3.6, and for the TIMING of that decision

⚑10 point 3 asks whether solo sessions should feed the posterior at all. This entry collapses that
into one question with the `session_mode` question, because solo and online sessions do not produce
the same cue set. A solo row is not an online row with some fields missing; it is a structurally
different composition, openness-poor by construction.

So if solo cues feed the posterior as they do today, they feed a systematically openness-POOR subset.
That is a downward bias on openness for solo players, and it is the mirror image of the upward bias
P12 closed. Under option 2 the composition would come much closer to matching, and the question would
weaken accordingly.

**The timing consequence is the load-bearing part.** There is no `session_mode` field on the event,
so once a solo row is ingested it is indistinguishable from an online one forever. A future re-anchor
could not exclude solo rows from its corpus even if it wanted to, because it could not find them.
Therefore:

> **The P3.6 decision has to be made BEFORE the second W re-anchor, not after.** After the re-anchor
> the corpus is fixed and the rows are unlabelled inside it. If the human later concludes that solo
> rows should not have counted, or should have counted differently, the only remedy is another
> re-anchor, and ★ P5 was explicitly one-time.

The cheapest thing that keeps every option open is to decide the policy, or add the label, before the
corpus for the next re-anchor starts accumulating. Adding a `session_mode` field is itself a schema
change and its own piece of work, and it is forbidden here, so it is named as an option and not taken.

- **Status:** OPEN. Analysis only. No behaviour changed, no constant flipped, no field added, no
  protected file touched. Options 0 through 3 are laid out; the choice is the human's, and per the
  timing argument above it is the more urgent half of ⚑10 point 3.

## ⚑ 13. Four of F5's manner scalars have no anchored feature and are carried unrouted (2026-08-07)

- **Opened:** 2026-08-07 (F5 embodied, `feat/f5-embodied`).
- **What:** F5's two Ring-of-Gyges probes became performed activities, so each now emits the MANNER of
  the act alongside the decision cue P7 already shipped. Six manner scalars land on features whose
  definitions genuinely fit. **Four do not, and are carried in `raw_signals` and left unrouted:**
  - `circled01`, whether the approach circled the cache before acting rather than going direct. This
    is the looking-around tell, and it is the **behavioural definition of the unobserved self**, which
    is the whole thesis of F5. There is no existing feature for "checked whether anyone was watching".
  - `dwell_at_marker_ms`, hesitation while standing over the owner's carved mark, before acting. The
    closest existing feature is `decision_latency`, which `decision_latency_ms` already carries on the
    same event; routing both would double-count one construct.
  - `cost_paid01`, the vitality actually spent freeing the gull. Doc-intended warmth, but `ts_social`
    already carries the act's time-share and cost-paid is a different quantity from time-spent.
  - `approach_detour01`, graded path deviation toward the probe. `approach` is a boolean the cue
    already sets, and `path_tortuosity` was anchored on the P3 sampler's normalized ratio, which this
    is not. Routing it there would be ⚑6's exact mistake with a different scalar.
- **Why unrouted rather than approximated:** cue-to-axis loadings stay LEARNED (cross-cutting rule
  #1). Attaching these to the nearest plausible feature is the silent re-route the rule forbids, and
  `circled01` is the case where the temptation is strongest precisely because it is the most valuable
  signal in the flow.
- **`dwell_ms`, re-examined and now ALSO unrouted.** It was briefly mapped to `ts_build` by analogy
  with `_EMBODIED_TS`. That was wrong by exactly the category argument used above to reject
  `cost_paid01`: `ts_build` is the time-share of the day-loop economy's BUILD axis, and neither probe
  is a build. Freeing a bird builds nothing, and digging up someone else's food is not construction.
  The gull's own time-share is already carried honestly by `help_at_cost`'s `ts_social`; the cache has
  no existing time-share whose definition fits. Dropped rather than kept, which makes the count
  **5 routed, 5 flagged**.
- **What IS routed, and why each is safe:** `thoroughness01` and `persist_after_fail` → `persistence`
  (byte-identical definitions to the raft's gather and its slips, which are what the feature was
  anchored on); `taken01` → `consistency`; `decision_latency_ms` → `decision_latency` via the generic
  top block; `abandon_free_gull` / `abandon_take_cache` → `ts_leisure` via the existing abandon branch.
- **⚑ `taken01` onto `consistency` has an UNTESTED INTERIOR, the mirror of ⚑7's unseen edge.** The
  routing **interpolates** between the two values P7 already anchored (`return_cache` 0.9 and
  `keep_cache` 0.1) rather than extending the feature past either, so taking the whole cache
  reproduces P7's 0.1 exactly and the endpoints are unchanged. That is more defensible than ⚑7's
  extrapolation. But W learned this loading from a corpus containing **only** those two point masses,
  so it has never seen an intermediate value, and the **linearity between them is assumed rather than
  observed**. A half-emptied cache is a real reading the model has no evidence for the shape of.
  Keeping the routing, because a graded honest act is genuinely the same construct at finer
  resolution, and flagging the interior so nobody mistakes it for fitted. The next re-anchor's corpus
  will contain intermediate values for the first time, which is when the shape becomes checkable.
- **Resolution:** the second W re-anchor happens ONCE, after all flows exist, on the full cue set.
  These four will be in that corpus with real behavioural data behind them, which is the right time to
  learn whether they load anywhere. Do NOT retrain W for them. Do not route them meanwhile.
- **Status:** OPEN by design. 6 routed, 4 flagged. The flagged four are emitted and recorded, so the
  corpus accumulates even while the posterior cannot read them.

## ⚑ 14. A structurally non-functional feature was carried as shipped, because nothing measured it (2026-08-07)

- **Opened:** 2026-08-07 (building F5's acceptance harness).
- **What:** The project's record lists the **public-minus-private delta** as delivered in P7. It was
  not, and could not have been. P7's probes were **always private**: `audience_size` 0,
  `public_or_private` "private", no witness, no public arm anywhere in the client. The ingress dutifully
  built `cond_key = "privacy:private"` and the conditional bucket accumulated correctly. There was
  simply never a `privacy:public` bucket to subtract it from. **The delta was unmeasurable by
  construction for as long as it was listed as shipped.**
- **Why nobody noticed:** every part of it looked done in isolation. The conditioning code was real and
  correct. The bucket machinery worked. The cue routed. The walkthrough passed. What was missing was
  the other half of a comparison, and no test computed the comparison, so nothing anywhere failed.
- **The generalization, which is why this is its own entry and not a line in ⚑13:** a feature whose
  correctness is a RELATION between two conditions cannot be validated by checking either condition.
  Everything P7 built was individually right. Only the pair was wrong, and only a test that actually
  subtracts one from the other could have seen it. This class of defect is invisible to per-component
  verification by definition, and this project has now produced it twice: the invisible landmass
  (⚑11), where every gate was green against a world with no land drawn, and this.
- **The standing rule it argues for:** **measurement before feature.** Had the capture been built
  against P7's probes first, there would have been a baseline number, the missing public arm would have
  shown up immediately as an empty bucket, and the embodied version would have been measured as a delta
  against a real prior value. Building the feature first makes "a feature with no number" a reachable
  state, which is exactly where this sat for the whole of P7's life.
- **Fixed:** F5 adds the public arm (a witness in sight, outside the `CLOSE <= 2.0` gate) and the
  harness measures the delta directly. See the acceptance numbers in the F5 report.
- **Status:** CLOSED for the delta itself. OPEN as a lesson, recorded so the ordering rule has a
  written reason behind it.

## ⚑ 15. RECORD CORRECTION: island_state is not dead schema, and has not been for some time (2026-08-08)

- **Opened:** 2026-08-08, verifying persistence before building F4 on top of it.
- **The claim, which was carried forward in the handover record rather than in this file:**
  "`0006_island_state.sql` is dead schema, nothing references it, `islandState.ts` doesn't exist for
  it. Don't assume island persistence works."
- **It was true once and is now false.** The migration did land ahead of its consumers, so there was a
  window where the table existed with nothing reading it. That window closed. Recording both halves
  rather than deleting the claim, because a reader who finds only the correction cannot tell whether
  the caution was ever warranted.
- **What is actually there, verified 2026-08-08:**
  - `packages/shared/src/islandState.ts`, the pure core plus the `IslandStateStore` seam, exported
    from `index.ts`.
  - `apps/web/src/lib/island-state.ts`, `SupabaseIslandStateStore` against the 0006 table, with the
    in-memory store as the zero-key fallback and as the error fallback.
  - `apps/web/src/app/api/island/state/route.ts`, GET applies decay exactly once and returns the
    honest "what changed while you were gone" lines, POST persists.
  - `api/account/delete/route.ts:31`, `island_state` wired into the erasure cascade.
- **What it already carries that F4 needs:** `tieWarmth: Record<string, number>` (per-counterpart
  warmth, 0..1, cooling between sessions at `TIE_COOL_PER_DAY` 0.08), `tieDeltas` on `DaySummary`
  (warmth earned today, folded by `closeDay`), and the tending function. **Note the name: it is
  `tendTie(state, counterpartId, delta)`, not `warmTie`**, which the handover record also had wrong.
- **Verified end to end, not inferred from the files existing:**
  - A cross-session round trip against the **Supabase-backed store** (`persistence: "supabase"` on
    both load and save): `dayCount` 0 to 1, `cropStage` none to planted, `raft.workMs` 0 to 9000,
    `tieWarmth` {} to `{partner_a: 0.85, partner_b: 0.40}`, all returned on a fresh session.
  - The decay tick over HTTP against the same store: a crop backdated three days came back
    `wilted` with the change line "the grain you saved has wilted, left too long".
  - The **injected-clock seam** proven directly on the pure core: advancing `now` alone wilts the
    crop, weathers unfinished lashings (9000 to 8580 ms over two days), and cools ties (0.85 to 0.69,
    0.20 to 0.04). The same `(state, now)` gives byte-identical output twice, a different `now`
    changes it, and a launched raft never weathers. `islandState.ts` contains no `Date.now`,
    `new Date`, `performance.now` or `Math.random`.
- **One honest limitation, CLOSED 2026-08-08 (same day):** the HTTP route called
  `loadIslandState(userId)` with its default `now = Date.now()`, so the injectable clock was not
  reachable over HTTP. The crop branch was exercised end to end because decay reads `cropPlantedAt`
  directly, but the raft-weather and tie-cool branches key off `now - updatedAt`, which POST
  re-stamps, so those two were proven on the pure core rather than over the wire. This was filed as
  "a change nobody has needed yet", and that was wrong within the same round: **`tieWarmth` is the
  exact substrate F4 rides on**, so the one cross-session mechanism the harness could demonstrate
  was the one F4 does not use. The route now accepts an injected `now` behind a server-side gate
  (see the route's own comment, and P30 in the F4 report, for what makes it unreachable from a
  production client), and the harness shows a tie cooling 0.60 to 0.36 across a session boundary
  over HTTP.
- **Status:** CLOSED as a correction. The substrate F4 needs is real, durable and decaying.

## ⚑ 16. Concurrent observations for ONE actor silently lost the posterior update (2026-08-08)

- **Opened:** 2026-08-08, building an interaction-path siloing check for F4's harness.
- **What was happening:** a persona update is a read-modify-write on that actor's posterior
  (`app.py`: `st.posterior = P.observe(st.posterior, …)`), and nothing serialized it per actor.
  `WorldRoom.emitFirstContact` fires **two** events per actor back to back with
  `void observeBehavioral(...)`, so both were in flight at once and one update was lost. The
  behavior index recorded both; the posterior advanced once.
- **The evidence, measured rather than reasoned:**
  - A live four-client run: actor A, **4 events, `behaviors` 4, `persona.version` 2**. Every
    interaction contributed one update instead of two.
  - Direct probe: the same two events posted **sequentially** gave `version 2`; posted
    **concurrently** gave `version 1`. **Eight** concurrent events for one actor gave `version 2`
    and `behaviors 8` — six observations recorded and discarded.
  - It is strictly **within one actor**: six users' events posted concurrently each landed intact
    (`version 1, behaviors 1` for all six).
  - The update itself is deterministic and time-independent: the same two events posted back to back
    and posted three seconds apart give `||mu_a - mu_b|| = 0.000e+00`. So this was pure lost-update,
    not ordering sensitivity.
- **What it cost:** F2 and F3 are both shipped and both social, so **roughly half of every live
  player-to-player interaction's measurement** was being discarded for as long as those flows have
  existed. It left no trace: no error, no log, and a posterior that looks fine and is built on half
  its evidence. F0/F1/F5 were never affected — the web forwarder
  (`api/observe/behavioral/route.ts`) already loops sequentially, with a comment saying why.
- **Why nothing caught it:** the copresence integration test asserts both events are **emitted**, and
  they were. `behaviors` counted them, and it was right. Nothing compared the number of events an
  actor emitted against the number of updates its posterior took. This is ⚑14's shape again: every
  component was individually correct and only the relation between two of them was wrong.
- **Fixed, in two layers (defence in depth, because this was silent for weeks):**
  1. **The emission site.** `apps/realtime/src/persistence.ts` chains observations **per actor**, so
     one is in flight at a time. Keyed per actor because the loss is per actor; a global chain would
     cost throughput and buy nothing. Callers keep their fire-and-forget `void` semantics. Guarded by
     `apps/realtime/src/observe-race.test.mts`, which fails against the pre-fix file with a peak
     in-flight of 8 against an expected 1.
  2. **The store**, so the guarantee holds for every caller and not just this one. See the entry
     immediately below.
- **Status:** CLOSED at the emission site. See ⚑16b for the store-level half and for what it does
  and does not cover.

## ⚑ 16b. The store-level half of the lost-update fix, and exactly how far it reaches (2026-08-08)

- **Opened:** 2026-08-08, immediately after ⚑16's emission-site fix shipped.
- **Why a second layer:** serializing in `apps/realtime/src/persistence.ts` closes the realtime path
  and nothing else. Every other concurrent writer for one actor still lost updates: two browser
  tabs, a modified client, the web forwarder if it ever stopped looping sequentially, any future
  caller. The guarantee belongs in the read-modify-write, not in one of its callers.
- **What was added:** `Store.lock_for(user_id)` and `Store.updating(user_id)` in
  `services/ml/echo_ml/store.py`, a re-entrant lock **per user**, and `app.py` now holds it across
  the whole read-modify-write in every endpoint that MUTATES user state: `/observe`,
  `/observe/behavioral`, `/telemetry`, `/feedback`, `/meeting_outcome`. Read-only endpoints
  (`/persona`, `/bald`, `/select_npc`, `/metrics`, `/npc/turn`, `/agent/turn`) deliberately do not
  take it, because taking a write lock to read would serialize reads for nothing. `delete()` takes
  it too, so §13 erasure cannot land mid-update and leave half an update behind for a user who asked
  to be forgotten.
- **Keyed per user, not globally.** The loss is per user: six different users' events posted
  concurrently each landed intact, before and after. A global lock would serialize unrelated traffic
  and buy nothing.
- **Both layers stay.** Defence in depth, because this was silent for weeks and left no trace.

### How far the fix reaches, stated rather than assumed

`threading.RLock` serializes threads inside ONE Python process. How the service is actually run:

| where | command | workers |
|---|---|---|
| `services/ml/Dockerfile` (Render) | `uvicorn echo_ml.app:app --host 0.0.0.0 --port ${PORT:-8000}` | 1 (uvicorn's default; no `--workers`) |
| `services/ml/run.sh` (local) | `uvicorn echo_ml.app:app --host 0.0.0.0 --port $PORT --reload` | 1 |
| `render.yaml` | `plan: starter`, no `numInstances`, no autoscaling | 1 instance |

FastAPI runs sync `def` endpoints in a **threadpool**, so multiple threads inside that one process is
exactly the condition that raced. **The lock is therefore complete for the deployment as it stands,
and would NOT survive `--workers N`, multiple Render instances, or any horizontal scaling.**

**But the lock is not what would break first.** `Store` is a process-local in-memory dict with no
shared backing (the module docstring's "optionally hydrated/persisted to Supabase" is aspirational;
nothing implements it). Under two workers a user's posterior would already depend on which worker
served the request, which is a larger and far more visible problem than a lost update. So this lock
is **exactly as complete as the store is**, and anyone adding workers has to fix the store first, at
which point the lock has to move to wherever the state then lives.

### Evidence

- `services/ml/tests/test_observation_race.py`, three tests: the store's guarantee, a negative
  control that can only ever lose and never gain, and an end-to-end concurrent POST. Against the
  pre-fix files the end-to-end one fails with **version 1 for 8 events**.
- `harness/observe_race_probe.py`, the original four probes kept and re-run against a live service:
  two concurrent now give version 2 (was 1), eight concurrent give version 8 / behaviors 8 (was
  2 / 8), six different users stay parallel at 11ms, and the update is still exactly
  time-independent at `||mu_a - mu_b|| = 0.000e+00`.
- **Status:** CLOSED for the single-process deployment. The multi-worker case is a property of the
  store, tracked here rather than left implicit.

## ⚑ 17. F4 is measured against an NPC partner, and that may not generalize to human partners (2026-08-08)

- **Opened:** 2026-08-08, resolving F4's partner fork.
- **The decision, which stands:** F4's recurring partner is an **NPC**, resolved from the design
  rather than from convenience (the F4 asset manifest names `f4_recurring_partner` with relationship
  states neutral to ally to wronged; the easter egg is an NPC who becomes a steadfast ally; the F3 to
  F4 transition is the clearing's NPCs beginning to persist and recognize the player). The argument
  for it is that F4 measures the **player's** pattern — tit-for-tat versus exploit versus forgive,
  promise-keeping across elapsed sessions, response to being wronged, giving when nothing returns —
  and every one of those is a property of the player rather than of the pair. The counterpart must
  persist, must have done something to you, and must remember; it need not be human.
- **What that argument does NOT settle:** whether a promise made to a visibly artificial partner is
  **the same construct** as a promise made to a person. F5's entire thesis is that people behave
  differently depending on who is watching, and there is no principled reason that logic stops at the
  boundary between people and NPCs. If it does not, then F4's integrity and loyalty reads are
  measured under a condition that systematically differs from the one they are meant to generalize
  to, and the direction of the bias is not obvious: a player might be freer with an NPC (nothing real
  at stake) or more consistent (no social pressure to perform).
- **This is a construct-validity question, and the harness cannot answer it.** No synthetic drive
  can: a scripted persona keeps a promise because the script says so, and it has no opinion about who
  it made the promise to. Answering it needs the same beats run against a human partner with real
  people on both ends, which is an experiment, not a test.
- **Not a blocker.** F4 is built and measured against the NPC partner. This is recorded so that no
  later reader treats an F4 pass as evidence about promises to people.
- **Status:** OPEN, and open in the way that does not resolve by building more.

## ⚑ 18. F4's manner scalars, and the running unrouted list the re-anchor has to cover (2026-08-08)

- **Opened:** 2026-08-08, building F4's four beats.
- **The rule this is under, unchanged:** cue-to-axis loadings stay LEARNED in W. A manner scalar is
  routed only where an already-anchored feature's definition genuinely fits. Everything else is
  emitted, carried in `raw_signals` for the second re-anchor's corpus, and flagged — never attached
  to the nearest plausible loading.

### F4, eight flagged

| Scalar | Why it has nowhere clean to go |
|---|---|
| `response_to_defect01` | **the important one.** What you did in the round after they took more than their share: the tit-for-tat signature, and F4's entire reason to exist. `consistency` is the cooperation LEVEL, not its conditional response to being wronged, and routing it there would collapse a forgiving cooperator and a steadfast one into one number |
| `settle_distance` | the proxemics of a grievance. `proxemics_close` / `proxemics_far` were anchored at the interaction-OPEN gate, a different quantity from where you stop when you are angry |
| `return_directness01` | graded path deviation on the way back. `path_tortuosity` was anchored on the P3 sampler's normalized ratio, which this is not — ⚑6's exact mistake |
| `circled01` | identical to F5's, unrouted for the identical reason |
| `detoured_first01` | a fraction of a DELAY, not a share of a day, so no `ts_*` fits |
| `unprompted` | no anchored feature means self-starting; `decision_latency` already carries the timing |
| `stake_amount01` | a reciprocal stake in an exchange, deliberately kept apart from `gift_amount01`, which the existing F7 give/share anchor does fit |
| `cost_paid01` | what the act cost you. Same argument as ⚑13 |

### A second, separate problem with `settle_distance`, and how it was found

The first version of the F4 drive aimed at a fixed tile beside the partner. Two personas driven to
settle at visibly different distances both came back at **1.5**, because the auto-walk controller
stops at a fixed distance from a solid prop — the cue was reporting the CONTROLLER, not the persona.
The same fixed-tile approach also failed 7 of 9 conflict drives outright, because the post and the
partner are both solid and a chosen offset is often not standable.

Fixed by walking toward them and stopping when you are as close as you meant to get, which is also
what a person does. `settle_distance` now separates (1.5 against 3.0) and the beat completes 6 of 6.

**The lesson is the one worth keeping:** a spatial cue driven by a pathing controller measures the
controller unless the drive stops the way a player stops. This is the P21 class again, and it means
any spatial scalar in the re-anchor's corpus needs checking against the controller before it is
trusted, not just against the persona.

### The running list, which is the re-anchor's actual scope

The second W re-anchor happens ONCE, after all flows exist, on the full cue set. That list now is:

- **⚑13, F5, four:** `cost_paid01`, `approach_detour01`, `circled01`, `dwell_at_marker_ms`. Plus
  `dwell_ms`, which was routed to `ts_build` and then un-routed on the category argument, making it
  **five**. Plus `taken01`'s untested interior (routed, but the graded middle between the two
  anchored endpoints has never been observed).
- **⚑18, F4, eight:** the table above.
- **⚑6, embodied:** `decoration`, still carried as extra build time rather than routed to openness.
- **⚑1 / ⚑3, the openness cues** across F0, F2, F3 and travel.

**Thirteen manner scalars across F4 and F5 alone**, and in both flows the cue that most directly IS
the flow's thesis is on the flagged side: F5's `circled01` (the unobserved self) and F4's
`response_to_defect01` (the iterated game). That is a pattern, not a coincidence: a flow's signature
cue is by definition the one the previous corpus had no reason to contain, so W cannot have a
direction for it. It also means **no new flow currently measures its own thesis**, and any acceptance
bar that passes today passes through generic manner cues. Say so whenever one is quoted.

- **Status:** OPEN by design. Do NOT retrain W for these. Do not route them meanwhile.

## ⚑ 19. FINDING: the ★P5 corpus is 100% synthetic, so the lost updates cost it nothing (2026-08-08)

- **Opened:** 2026-08-08, asking what ⚑16's lost updates did to the corpus that anchored the
  committed `measurement.npz`.
- **The question, and why it was worth asking rather than assuming.** The loss correlates with
  concurrency, and concurrency correlates with interaction density, so dense social moments lost
  proportionally more of their observations than sparse ones. That is not random thinning, which
  costs precision and leaves the direction alone. It is thinning that skews toward the sparse end of
  exactly the behaviour F2 and F3 exist to capture. If any live social event had reached the corpus,
  W would carry that skew.
- **The answer: no live event of any kind has ever entered the corpus.** The ★P5 re-anchor
  (`22aa568`, 2026-07-12) was fit on a **deterministic synthetic corpus** produced entirely inside
  `services/ml/scripts/train_measurement.py` by three generators, all seeded from `--seed`
  (default 0):
  - `synthetic_corpus()` — text rows drawn from a hardcoded fragment bank, with latency/edits.
  - `behavioral_corpus()` — telemetry-only rows, axis targets written by hand in the function.
  - `openness_corpus()` — telemetry-only rows for the four new openness features, drawn
    independently so openness decorrelates from warmth/dominance.
- **The only door live data could have come through is `--anchors <file>.jsonl`**, a hand-curated
  `{text, telemetry, axes}` file. No such file exists in the working tree or anywhere in git history
  (`git log --all -- '*anchors*.jsonl'` is empty), and `--anchors` defaults to `""`.
- **Proved by reproduction, not by reading.** Re-running `train_measurement.py` with **no arguments
  at all** and `--out` pointed at a scratch path reproduces the committed artifact across all seven
  arrays:

  | array | shape | max abs difference |
  |---|---|---|
  | `W` | (8, 66) | 5.995e-15 |
  | `Psi` | (66,) | 7.494e-16 |
  | `V` | (66, 4) | 9.048e-15 |
  | `Sigma_m` | (4,) | 4.441e-16 |
  | `mu_phi` | (66,) | 2.776e-17 |
  | `axis_keys`, `feature_names` | — | exactly equal |

  Worst difference anywhere: **9.048e-15**, i.e. floating-point noise. The regenerated openness
  loadings are `path_tortuosity +0.47, travel_novelty +0.41, curiosity +0.41`, matching the
  committed values quoted in the ★P5 commit exactly. `train_measurement.py` is also the ONLY writer
  of the artifact (`individuation_eval.py` builds a `PersonaModel` in memory and never saves).
- **So: the racing path contributed nothing to W, and the second re-anchor has nothing to undo.**
  The corpus does not need recollecting on account of ⚑16.

### What the lost updates DID cost, which is a different thing

Not the corpus, but every **live user's runtime posterior** since F2 and F3 shipped. Those were built
on roughly half their social evidence. Thirteen of the 66 features are writable by a social event's
telemetry — `approach`, `ts_social`, `ts_leisure`, `ts_build`, `save_rate`, `risk_index`,
`solitude_tol`, `pet_attach`, `decision_latency`, `persistence`, `consistency`, `travel_novelty`,
`curiosity` — so the under-feeding was concentrated there. It is not recoverable (the events were
never stored as a corpus, only folded into posteriors), and it is self-correcting going forward now
that every observation lands. No action is proposed here; recollection is not required.

### The larger finding, which is not about the race at all

The corpus being entirely synthetic means the ★P5 re-anchor learned **designed** relationships, not
observed ones: every anchor target `z` in `behavioral_corpus()` and `openness_corpus()` is a line of
code written by hand (`z[iz["dominance"]] += (ri - 0.5) * 1.2`, and so on). W therefore reproduces
the design document's priors rather than testing them. That is a defensible bootstrap and the
script's docstring is honest about it, but it means **no cue's loading has yet been learned from
behaviour**, which is a far more consequential fact for the second re-anchor than the race would
have been. See ⚑20.

- **Status:** CLOSED as a question. The corpus is clean with respect to ⚑16.

## ⚑ 20. RISK: the one-time re-anchor rule means three flows are designed blind, with no second try (2026-08-08)

- **Opened:** 2026-08-08. **This is a risk to be decided, not a defect to be fixed.** Recorded so it
  is decided deliberately rather than inherited.
- **The rule as it stands:** the second W re-anchor happens ONCE, after all flows exist, on the full
  cue set. It is written that way for a good reason: a one-time correct calibration beats several
  partial refits, and re-anchoring per flow would let each flow's designer tune W toward their own
  cues.
- **The structural problem, which follows from something the F4 round established:** a flow's
  signature cue is by definition the one the previous corpus had no reason to contain, so W cannot
  have a direction for it. That is not bad luck, it is the shape of the thing. And it has now
  happened twice in a row: F5's `circled01` (the unobserved self) and F4's `response_to_defect01`
  (the iterated game) are both ⚑ and both unrouted, and in both flows the cue that IS the flow's
  thesis is the one on the flagged side.
- **The consequence nobody has decided yet.** F4, F5 and F6 have their signature beats designed
  **blind**: the beat table, the manner scalars, the mechanics and the acceptance bars are all
  chosen before anyone can see whether the signature cue carries signal. If, after the one-time
  re-anchor, a signature cue turns out to load nowhere, three flows will have been built on
  unmeasured design decisions and the rule allows no second attempt. Thirteen flagged manner scalars
  are riding on this (⚑13's five, ⚑18's eight).
- **⚑19 sharpens it.** The first re-anchor's corpus was entirely synthetic, so W currently encodes
  the design document's priors rather than anything learned from behaviour. The second re-anchor is
  therefore not a refinement of a measured W; it is the **first** time any loading gets tested
  against real data. Making that a single non-repeatable event puts every flagged cue in one basket.
- **Options, none taken:**
  1. **Keep the rule.** Cheapest, and the tuning-pressure argument for it is real.
  2. **Two re-anchors:** one after F4/F5 on the cues that exist, one after F6. Halves the blast
     radius; costs a second calibration and reopens the tuning-pressure question.
  3. **Keep one re-anchor but add a pre-registered check:** before the re-anchor, write down for
     each flagged cue what "it carries signal" would look like, so the outcome is falsifiable rather
     than interpreted afterward. Cheap, and it does not change the rule.
  4. **Decouple the flows from the rule:** stop treating an acceptance bar as evidence that a flow
     measures its thesis while its signature cue is unrouted, and say so in each flow's report. This
     round already does that in prose; it is not yet a rule.
- **Not acted on.** No re-anchor is scheduled, W is untouched, and nothing here changes any flow.
- **Status:** OPEN, for a human decision.

## ⚑ 21. The corpus now exists, and what it still cannot do (2026-08-08)

- **Opened:** 2026-08-08, building the missing pipeline ⚑19 exposed.
- **What was wrong, and it was worse than ⚑19 said.** ⚑19 established that the committed W was fit
  on a synthetic corpus. The mechanism meant to replace that was `UserState.locomotion`, which
  `app.py` reported as "the ★ re-anchor's corpus volume" by name. It was a bounded in-process list
  with **no write path anywhere** — no Supabase, no disk, no serialization of any kind. It died with
  the process, and the ML service restarts on every redeploy while Render's starter plan spins down.
  **No real corpus had ever accumulated, and nothing was collecting one.** The same gap meant every
  live user's posterior reset to the prior on every restart.
- **Built:**
  - `services/ml/echo_ml/corpus.py`, a recorder at the ingress covering `/observe`,
    `/observe/behavioral` and `/telemetry`. Supabase-backed when keyed, in-memory otherwise, exactly
    as `Store` and `island_state` already degrade.
  - `db/migrations/0009_measurement_corpus.sql` — **to be renamed `0013_` before this branch merges;
    0009 collided with `0009_planet_registry.sql`, which took the number 26 days LATER. See
    `db/migrations/README.md`.** (0006 was used twice in this repo's history, so
    0009 was checked against both the tree and `git log --all --diff-filter=A`.)
  - Replay hydration: a first-seen user is rebuilt from their corpus through the **real endpoint
    functions**, so the rebuild cannot drift from the live fold. Bit-identical, `cond` buckets
    included.
  - `scripts/export_corpus.py`, corpus to the jsonl `train_measurement.py --anchors` expects.
- **The corpus stores RAW payloads, never featurized rows.** A corpus of already-featurized rows
  would be the synthetic trap one layer down, frozen against today's 66 features. Storing raw is
  also what records the thirteen flagged manner scalars (⚑13, ⚑18) for the first time: they ride in
  `raw_signals`, which `featurize_raw` discards.
- **Ordering matters and was found by a failing test.** Hydrate, then record, then fold. With the
  record first, a background flush landing between the record and the rebuild let the replay fold an
  event the endpoint was about to fold again: four events produced five updates.

### What it still cannot do, and this is the binding constraint

`--anchors` expects `{"text", "telemetry", "axes"}` and **`axes` is a LABEL** — the supervision that
resolves factor analysis's rotation indeterminacy. **The corpus supplies φ and cannot supply z.** A
recorded event says what somebody did, not how warm they are. Exporting rows is mechanical; getting
labels is not, and no amount of recorded play produces them.

Measured on a 240-row behavioural corpus exported and fed through `train_measurement.py`:

| | |
|---|---|
| features with ANY variance | **7 of 66** (`approach`, `ts_social`, `ts_leisure`, `solitude_tol`, `decision_latency`, `persistence`, `consistency`) |
| features constant, so unidentifiable | **59 of 66**, of which 32 are the embedding dims and the rest stylometry, all of which need TEXT |
| labels from one user's posterior | constant across that user's rows, so `‖W‖ = 0.00` and Fisher information is zero on every axis |
| labels varying across 12 users | `‖W‖ = 1.78`, information non-zero on all eight axes, `max |W_new - W_committed| = 1.3937` |

So the door opens and the committed artifact stayed byte-identical throughout
(`sha256 da1918477f99dd8a` before and after). **What a second re-anchor needs is not rows. It needs
(a) labels from outside the loop — a curated self-report, a human-rated subset, or an outcome the
axes are supposed to predict — and (b) coverage of more than 7 of the 66 features, which means the
corpus must include text-bearing events and not only behavioural ones.** Anchoring on the users' own
posteriors is circular by construction: those posteriors were produced BY the committed W.

- **Status:** OPEN. Recording is live; the re-anchor is not schedulable until labels exist. This is
  what turns ⚑20 from a philosophical question into a costed one.

## ⚑ 22. LEGAL: a durable behavioural log is a retention decision nobody has made (2026-08-08)

- **Opened:** 2026-08-08, on shipping the corpus. **Flagged, not decided.**
- **What changed.** Until now the behavioural model was in-memory and died with the process. As of
  ⚑21 there is a durable, timestamped, identity-keyed log of what a person did, stored indefinitely.
  That is a materially different retention posture, and it is the thing data-protection regimes ask
  about first.
- **Under GDPR and KVKK this is profiling.** The corpus exists precisely to infer personality traits
  from behaviour, which is the definition. The questions that follow are not engineering questions:
  what is the lawful basis; how long is the log kept; is the retention window disclosed; does a
  subject-access request return the raw log as well as the derived posterior; is a trait inference
  itself personal data that must be disclosed.
- **⚑7 is the precedent and the warning:** the photo path shipped before a lawyer reviewed it. This
  entry exists so the same thing does not happen twice with a heavier artifact.
- **What IS built, because erasure is engineering:**
  - `Store.delete()` wipes the corpus under the same per-user lock that guards the posterior, so no
    caller can forget it.
  - `measurement_corpus` is in `api/account/delete`'s cascade as well, so erasure still works if the
    ML service is down.
  - Proven end to end rather than asserted: write 5 rows, delete the account, `corpus_rows_deleted`
    comes back 5 and the read returns empty (`tests/test_corpus_hydration.py`).
- **What is NOT built, deliberately: any retention window.** The corpus migration has no TTL, no
  pruning job and no expiry column, and the code has no default.
  ⚠️ *This bullet said "Migration 0009" until SOC-2.C. It meant `0009_measurement_corpus.sql`, which
  exists only on `feat/measurement-corpus` — and SOC-0.E merged this entry onto a branch where 0009
  is `0009_planet_registry.sql`, a table of land parcels with no personal data and no retention
  question at all. The merge imported a number that is wrong in its new home. The corpus migration
  is to be renamed `0013_measurement_corpus.sql` before that branch merges (see
  `db/migrations/README.md`), and the analogue that IS here is `0011_behavioral_events.sql`, whose
  own retention gap SOC-2.G owns.* Choosing one is a legal decision with a
  product cost attached — a shorter window is safer and shrinks the corpus the re-anchor needs — and
  it is not an engineering default to pick quietly.
- **Status:** the human half is ANSWERED — `DECISIONS.md` C35, 2026-09-09. Raw behavioural data
  lives **90 days**; the derived profile lives while the account does; the basis is **consent**;
  withdrawal stops sampling and lets existing rows age out rather than erasing (`/account` erases on
  demand); a subject-access request returns **both**, labelled as two different things. Mechanism in
  `apps/web/src/lib/retention.ts` + `0016_retention_indexes.sql`, riding the existing daily cron.
  **The trade this entry named was priced and paid:** a rolling 90-day window may never reach the
  corpus volume ⚑21 measured as necessary, and that is accepted against an exposure that is real
  every day. If a re-anchor ever gets a date, this is the first number to revisit.
  **Still OPEN, and genuinely for a lawyer:** whether 90 days is the right number for this
  jurisdiction and this basis. The mechanism makes it a config change.

## ⚑ 23. `consistency` is an EXACT ZERO column, and the Ring of Gyges routes to nothing else (2026-09-07)

- **Opened:** 2026-09-07, while taking `⚑20`'s decision (DECISIONS C29). **Measured, not suspected**
  — read straight off `services/ml/echo_ml/artifacts/measurement.npz`, `W.shape == (8, 66)`,
  version 1.
- **What.** Four of `W`'s 66 columns are exactly zero on every one of the 8 axes:
  `ellipsis_ratio`, `emoji_ratio`, `digit_ratio`, **`consistency`**. The first three are text-manner
  features on a channel the product does not measure by promise, so their being dead is consistent
  with what the consent card says. `consistency` is not: it is a live
  `TELEMETRY_FEATURE_NAMES` entry that `ingest.py` sets on six actions.
- **For four of those six it is the ONLY feature the action sets:**

  | Action | What it sets | Anything else? |
  |---|---|---|
  | `conform_custom` | `consistency` 0.85 | no |
  | `travel_near` | `consistency` 0.70 | no |
  | `return_cache` | `consistency` 0.90 | no |
  | `keep_cache` | `consistency`, graded by how much was taken | no |
  | `wait_in_queue` | `consistency` 0.85 **+ `persistence` 0.8** | yes — formality +0.284 carries it |
  | `cut_queue` | `consistency` 0.1 **+ `approach` False** | yes — warmth +0.700 carries it |

- **Why this is worse than the thirteen manner scalars `⚑20` cites.** `return_cache` / `keep_cache`
  **IS the Ring of Gyges** — the blueprint's flagship moral probe, Stage 7, the costly good nobody
  will ever know about, the entire private-versus-public design. Its designed feature moves the
  posterior by **exactly zero**. It still moves the posterior through the action-label embedding, as
  every flagged cue does, but the signal it was built to carry is dark. And `travel_near` is one half
  of the travel stand's far/near contrast: `travel_far` routes to `risk_index` (dominance +0.410) and
  `travel_novelty`, so **the contrast is measured on one side only**, which is not a contrast.
- **`⚑13` already half-knew.** It records `taken01` → `consistency` as one of F5's ROUTED scalars,
  and calls that routing safe because it interpolates between two anchored endpoints. It is safe from
  extrapolation and dark all the same: both endpoints sit on a zero column.
- **Not re-routed, deliberately.** Attaching these to the nearest live feature is the silent re-route
  cross-cutting rule #1 forbids and `⚑6` records the cost of. They stay where they are.
- **Acted on, minimally:** `services/ml/tests/test_zero_columns.py` pins the four zero columns and
  the four single-feature actions, so the day a re-anchor gives `consistency` a direction the test
  fails and somebody reads this entry. `consistency` is the first named line in C29's
  pre-registration scope.
- **Status:** OPEN. It is fixed by the re-anchor or it is not fixed at all.

## ⚑ 24. The ML service's persistence was a loaded default aimed at production (2026-09-09)

- **Opened:** 2026-09-09, in the ground-truth pass for SOC-2.D, and closed the same day. Recorded
  because the fix is one rename and the reasoning is the part worth keeping.
- **The shape.** `services/ml/echo_ml/config.py` declared `supabase_url` / `supabase_key` off the
  REPO-WIDE names `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and **nothing read
  them**, so the gun never fired. It was loaded, though. `services/ml/run.sh:14` sources the
  gitignored repo-root `.env` into this service's environment, and on a developer machine that file
  holds a `NEXT_PUBLIC_SUPABASE_URL` **byte-identical to `render.yaml`'s production project** —
  verified by comparing sha256 prefixes, not by printing either — beside a live 219-character
  service-role key, which bypasses RLS.
- **So the FIRST line of SOC-2.D that read `SETTINGS.supabase_*` would have turned `npm run dev:ml`
  into a laptop writing personas into the production database.** And `apps/web/src/lib/identity.ts`
  honours `?u=<id>` verbatim (SOC-2.E), so it would have written into a REAL PERSON'S row.
- **Why it was worth catching before the feature and not during it.** Every candidate design for
  SOC-2.D begins by reading exactly those two variables. A default that only fires once the feature
  lands is a default nobody tests, and the window in which this is a ten-line change is the window
  before the first durable write exists.
- **Acted on:**
  - `ECHO_ML_SUPABASE_URL` / `ECHO_ML_SUPABASE_SERVICE_KEY` — ML-owned names, so the shared `.env`
    no longer reaches this service. Proven under `run.sh`'s own env loading: with both repo-wide
    names present in the process, `SETTINGS.supabase_url` and `supabase_key` are empty.
  - `ECHO_ML_PERSIST=1` is required in addition. **Credentials alone must never be enough**: a key
    pasted into a shell to run one script would otherwise arm every write for the life of that shell.
  - `SETTINGS.persist_enabled` is THE gate, and it is a property rather than a convention so that a
    later author who only needed a URL cannot route around it.
- **Three false records fixed alongside**, all claiming a persistence that has never existed:
  `store.py` ("optionally hydrated/persisted to Supabase"), `render.yaml` ("with both set, learning
  state hydrates/persists to Supabase" — **the damaging one, because it is a deployment instruction
  an operator can follow**), and `config.py`'s bare declarations.
- **Status:** CLOSED as a hazard. The absence it exposes — no durable store at all — is SOC-2.D and
  is open.

## ⚑ 25. Sixteen tables had no RLS, and SOC-2.D started writing four of them (2026-09-09)

- **Opened and closed:** 2026-09-09, immediately after SOC-2.D's durable store landed. Recorded
  because the *reason* it was safe before and unsafe now is the part worth keeping.
- **`0007_waitlist.sql` wrote the rule and framed itself as the exception:** *"This is the FIRST
  table in the repo to enable row level security, and the departure is deliberate. Every other table
  relies on an implicit boundary ('the anon client never touches tables'), which is **survivable for
  game state** but not for a public list of real names and email addresses: with RLS disabled,
  PostgREST exposes the table to anyone holding the anon key, **which ships in the browser bundle by
  definition**."*
- **That premise changed when SOC-2.D started writing `persona_state`, `behavior_index`,
  `reward_model_state` and `autonomy_buckets`** — declared since June with zero writers, and never
  game state: `persona_state` is an eight-axis personality measurement of a named person, and
  `behavior_index` is what they did, embedded, with SOC-2.F's evidentiary class attached. A durable
  store is also an *exposure*, and the exposure arrives in the same commit as the feature.
- **MEASURED, on Postgres 16.15 with Supabase's default grant simulated exactly**
  (`grant select on all tables in schema public to anon`):

  | | owner | anon, WITH the grant |
  | --- | --- | --- |
  | RLS on (this migration) | 1 row | **0 rows** |
  | RLS off (the counterfactual) | 1 row | **1 row** |

  So RLS is the thing that stops it, not the absence of a grant — which is what makes this worth a
  migration rather than a note.
- **All sixteen, not the four I touched.** The four would have been arbitrary: `messages`,
  `telemetry_events`, `interactions`, `users` and `characters` hold more obviously personal data
  than `autonomy_buckets` does. One line each, zero policies.
- **Nothing that works today breaks, and that was checked rather than assumed.** Every table access
  in the repo goes through the service role, which bypasses RLS: `supabaseAdmin.adminClient`,
  `apps/realtime/src/{npcs,persistence}.ts`, and `services/ml`'s new `persistence.py`. The one
  browser-side client is used only for `auth.*` and Storage and **never reads a table** — precisely
  the implicit boundary 0007 named, now made explicit.
- **What this is NOT.** Not a retention window and not erasure. SOC-2.G is still open, and 0011's
  "no TTL, no expiry column, no pruning job" is now true of five more tables. This makes the rows
  unreadable by the public; it does not make them go away.
- **Status:** CLOSED. `db/migrations/0015_rls_on_0001.sql`.
- **CORRECTED 2026-09-14, and the correction is in the title.** *Sixteen* was the number of tables
  0015 CHANGED, not the number that needed changing. This entry reasoned "all sixteen, not the four
  I touched — the four would have been arbitrary", which was the right instinct applied to the wrong
  set: it scoped itself to what `0001` created and never re-counted the folder. MEASURED on
  `b22c3d4`: **20 of 30 public tables had RLS.** Ten did not, including `connection_analyses`, whose
  `transcript_json` holds the full `[{who,text}]` exchange. This flag was closed at 61%. The
  remainder, and the gate that stops a third round of the same arithmetic, are `⚑29`.

## ⚑ 26. Erasure said "your data is gone" three different ways it could not know (2026-09-09)

- **Opened and closed:** 2026-09-09, in the SOC-2.G pass, immediately after SOC-2.D gave the ML
  state tables rows.
- **`api/account/delete` answered `ok: true` and HTTP 200 in three cases where data survived**, and
  `/account` then cleared the local id and showed "Erased.":
  1. **No service key** returned `{wiped: [], failed: []}` — an empty failure list read as success,
     so a deployment without `SUPABASE_SERVICE_ROLE_KEY` reported a clean erasure **without ever
     looking at a table.**
  2. **The ML service's result was not part of `ok` at all.** The ML service is the thing that holds
     the posterior. A service that was down or unset erased nothing and the route still said 200.
  3. **A three-element `Promise.all` destructured into two bindings**, so `deleteIslandState`'s
     outcome was discarded and could never reach `ok`.
- **All three were harmless for three months and stopped being harmless in one commit.** The ML
  state tables had ZERO WRITERS until SOC-2.D; erasure over an empty table cannot lie about much.
  **A promise that is only true because a feature is missing is not a promise**, and this is the
  general form of the failure this register keeps recording: the defect is written long before it
  becomes reachable, and it becomes reachable in a commit that is about something else.
- **The one that reads wrong at first glance**, pinned in a test so nobody "fixes" it: `deleted:
  false` from the ML service is NOT a failure. `Store.delete` reports whether the user was in
  MEMORY, and after a restart that is false for everyone while the durable rows are removed anyway.
  The failure signal is `mocked`, which `lib/ml.ts` sets when the call never reached the service.
- **Acted on:** the verdict moved to `lib/erasureResult.ts` so a test drives the same branch the
  route does, and every failure kind now lands in `supabaseTablesFailed` — the field `/account`
  already reads by name and shows to the person, so the fix reaches the screen without a second
  change. Eight tests.
- **Status:** CLOSED. Erasure now reports what it knows and nothing more. The RETENTION question —
  how long the rows should have lived in the first place — is SOC-2.G and is open.


## ⚑ 27. The globe published 1,500 canonical user ids, and the test forbidding it required them (2026-09-09)

**`GET /api/planet/status` is unauthenticated, `force-dynamic`, and served `recentlyClaimed(1500)` —
and every row carried `ownerId`.** Neither consumer wanted it: `HeroPlanet.tsx:80` and
`ClaimClient.tsx:98` both type the response `Array<{ h3Index: string }>` and map straight to
`c.h3Index`. The field was never read by anything. It was only published.

**THE ID IS NOT AN IDENTIFIER HERE, IT IS A CREDENTIAL.** Verified by reading the three routes, each
of which asks for nothing else before answering:

| route | what it does with a bare id |
|---|---|
| `GET /api/agent/persona?uid=` | returns that person's posterior |
| `GET /api/telemetry/recent?uid=` | returns their **raw behavioural event rows**, not an aggregate |
| `POST /api/account/delete` `{userId}` | **hard-deletes** the ML posterior, eight Supabase tables including `behavioral_events`, and the island state |

`telemetry/recent/route.ts:7-9` states the posture itself and names the group: *"the id is the only
credential either read has… Tighten all three together when auth lands."* So the destructive one was
reachable with a string the globe handed out fifteen hundred at a time.

**WHAT MADE IT SERIOUS WAS AN EARLIER FIX IN THIS SAME WORKSTREAM.** While `ownerId` was the trimmed
typed display name, this endpoint leaked **first names** — publishable beside a hex cell, arguably by
design. SOC-2.B then made `ownerId` the canonical user key, correctly, to close the collision where two
people who typed "Sam" were one owner. Neither half was wrong alone; together they converted a
first-name leak into a credential leak, and **nothing in between noticed that the meaning of the field
had changed underneath it.**

**AND THE GUARD ASSERTED THE OPPOSITE OF ITS OWN TITLE.**
`packages/planet/tests/ownership.test.ts:96` is named *"lighting the globe reveals no owner ids, which
is what it did before and must keep doing"*, and its comment said it existed *"so that a future change
which starts surfacing owner_id has to come past a test rather than quietly publish an identifier that
used to be a first name."* Its assertion was
`deepEqual(Object.keys(recent[0]).sort(), ["h3Index", "ownerId"])` — it **required** the leak. Removing
the leak would have failed it, and anyone reading the title would have believed the opposite of what
ran. It was written when the field was a first name, which is the same sentence again: the assertion
outlived the meaning it was written against.

**Acted on.** `owner_id` is no longer SELECTed in the Postgres implementation, rather than selected and
dropped, so a later author adding it back to the mapped object out of symmetry has nothing to map. The
interface return type no longer carries it, so the leak cannot return without a type change. The test
now asserts `["h3Index"]`, and **it was checked that it fails when the leak returns** — 159 pass / 1
fail with `ownerId` put back — because a guard that cannot fail is what this entry is about
(SOCIETY-PLAN §3 items 8 and 9).

**Status:** CLOSED, both halves, as `C39` / SOC-2.E.

The globe no longer publishes the credential, and **the shared world no longer broadcasts it either**:
`refId` lost its `@type` decorator, so it stays server-side where every emission is attributed to it
and stops crossing the wire. Clients now identify a person by Colyseus's own room-scoped `sessionId`,
which says "the same someone" without saying who, and NPC ids ride a separate synced field because an
NPC's id is not a credential.

All three routes named above derive their subject from an HMAC signature instead of reading it out of
the request — 16 of 19 id-bearing routes do, **and that sentence is the one `⚑28` is about: 16 counts
ROUTE FILES containing `subjectOf`, and one file exports two verbs with one guard.** The exceptions
being `auth/sync` (which verifies a
Supabase token and always did), `identity/session` (which accepts no id) and `narrate` (which declares
a `userId` it never reads). The room join is verified by `WorldRoom.onAuth` using the **same function**
the routes use, imported from `@echo/shared/identity` rather than restated, because a policy written
twice is a policy that drifts.

**What is NOT closed by this, and is stated in `C39` rather than left to be discovered:** rollout
orphans every existing anonymous echo, because the minter refuses to sign an id handed to it. That is
the same loss as clearing site data — but once to everyone, rather than one person at a time.

---

## ⚑ 28. C39 guarded the route FILES; one file has two verbs, and no client ever sent the signature (2026-09-14)

**`POST /api/island/state` never called `subjectOf`.** `route.ts:51-59` derived the GET's subject and
loaded under `caller.subject`; the POST at `:67-87` read `userId` out of the body and handed it to
`saveIslandState` at `:83`. So the island day state — a person's crop, raft, scarcity and tie warmth,
and on a configured deployment a durable Supabase row — **was read-refused and write-open at the same
time.** Anyone holding a user id could overwrite it while its owner could not read it back.

**WHY THE RECORD SAID OTHERWISE, AND IT IS AN ARITHMETIC SHAPE, NOT A LIE.** `C39` and `⚑27` both say
"16 of 19 id-bearing routes are guarded". MEASURED: `grep -rl subjectOf apps/web/src/app/api` returns
exactly 16 files and 19 route files are id-bearing, so the sentence was true throughout. **The unit is
the file.** `island/state` is the only **id-bearing** route in the tree that exports two verbs — `waitlist/route.ts` exports POST and GET too, and carries no id at all (MEASURED: zero hits for `userId|uid|ownerId|user_id`), which is why it cannot have this defect, so it is the only
place where a file could be counted as guarded while a handler was not. A count over files cannot see
inside one.

**THE SECOND HALF IS LARGER: MOST BROWSER CALL SITES SENT NO SIGNATURE AT ALL.** **30 of 33 browser fetch expressions to guarded routes sent no signature** — 27 sending `content-type` alone and 3 sending no headers at all. (Across 23 of 26 distinct *(file, route)* pairs; the first published figure here was "23 of 31", which took its numerator from the pair count and its denominator from neither — an L6 slip inside the entry about a count that could not fail. Both units are stated now, because the fix is counted in expressions and the defect reads naturally in pairs.) MEASURED on
`b22c3d4` by enumerating every `fetch` in `apps/web/src` that targets a route containing `subjectOf`.
`identityHeaders()` existed — as a closure inside `createMeasureChain` (`measure.ts:257`), reachable
by the three routes the parcel chain calls and by nothing else. Everything outside that chain — the
whole day loop, `/flow0`, `/flow1`, `/flow4`, `/flow5`, `/claim`, `/account`, and every one of
`lib/agent.ts`'s five calls — sent `content-type` and nothing else, so **every one of those routes had
been answering 403 to its only caller since C39 shipped**, silently: each call site swallows its own
failure (`.catch(() => {})`, `if (res.ok)`), which is what the swallow is for. A header policy living
in one component's closure is a policy three other components do not have (L5).

**AND `/play` NEVER MINTED A TOKEN, so the shared world was dead on the canonical path.**
`WorldClient.tsx` joined with `token: identityToken()`, which only READS `localStorage`.
`ensureIdentity` — the only thing that mints — was called from exactly one place in the tree,
`measure.ts:393`, the parcel measure chain. The canonical route to the world is landing → `/onboard`
→ `/play`, and `/onboard` does not require sign-in: `page.tsx:67` calls `resolveUserId()`, which
stamps an id with **no signature**. So in production `WorldRoom.onAuth` threw `identity_no-identity`,
`WorldClient.tsx:1486-1493` caught it, set offline and started the solo world. **The failure mode was
not an error anyone would see. It was an empty ocean.** A player was told nothing; the world simply
looked unpopulated. **AND THE OUTAGE WAS TOTAL, not partial.** The first version of this entry said
"only a browser that had signed in through `AuthModal` could join at all", which describes an EMPTY
POPULATION: `AuthModal.tsx` is imported by nothing — `app/page.tsx:41` says so in as many words, "NO
AUTH. The header's Log in, the hero's two auth buttons and `AuthModal` are all gone (§6)". So the one
path in the tree that called `storeIdentity` with `/api/auth/sync`'s token was unreachable, and
**nothing in the shipped product minted a token for the shared world at all.** The sentence sized a
total outage as a partial one, which is the same failure as the count above: a claim about coverage
written from a grep rather than from a call graph.

**A FOURTH THING, FOUND WHILE FIXING THE THIRD.** `/account`'s erase removed four localStorage keys
and not `echo.identityToken`. `resolveUserId` then minted a fresh anonymous id beside last life's
signature, and `ensureIdentity` short-circuited on `existing && identityToken()` — **both keys
present, so no mint** — leaving every write refused with `identity_mismatch` permanently, because the
only thing that could have re-minted was the thing that returned early. No reload healed it.

**Acted on, and the gate is the point.**

- The POST derives its subject and writes under `caller.subject`, not the asserted string — the
  fourth test is the one that separates a guard from a fix, because a guard that then writes wherever
  the caller pointed is decoration.
- `apps/web/tests/islandState.test.mts` drives the REAL route handler, not a copy of its branch.
  **It was checked that it fails when the defect returns: 3 fail / 1 pass with the guard removed and
  the asserted string restored, 4 pass with the fix.** The one that stays green is the one that
  should — "the legitimate caller is not the casualty" is true either way, and it is a regression
  guard rather than a gate.
- `identityHeaders()` moved to `lib/identity.ts` and all 30 bare expressions go through it. It carries
  one rule the closure did not need: **a `?u=` override sends NO token.** `subjectFor` checks the
  token branch before the relaxation, so a browser profile that had ever held a token would present
  it beside `?u=alice` and be refused — which would break the two-tab harness `verify-3d-render.md`
  depends on, and `?u=` is the only mechanism in the tree that yields two identities in one profile.
  The Colyseus join asks `outboundIdentityToken()` for the same reason through a different transport.
- `/play` awaits the mint **before** `world.init`, so the subject is settled before any world
  callback exists and `uid` is set exactly once — setting it twice would re-run `useDay`'s load
  effect under a new id and reset a returning player to day 0.
- The mint is memoized on a module-level in-flight promise. `next.config.mjs` sets
  `reactStrictMode: true`, so the effect that calls it is double-invoked in dev, and nothing was
  memoized: two callers both failed the early return, both POSTed, and `identity/session` minted two
  different subjects. The last response won `localStorage` while the other caller kept the id it was
  handed — one subject, the other's token, `identity_mismatch`.
- The early return now requires that the stored token actually covers the stored id
  (`tokenMatchesSubject`, `packages/shared/src/identityFormat.ts`), so a browser already in the
  erased state heals itself on the next visit rather than staying refused forever. The erase list
  also drops the token now, which was never right on its own terms: leaving a credential behind after
  "erase everything" is its own answer.

**Status:** CLOSED for the server half and for the two surfaces that matter; **PARTIAL on the client,
deliberately, and the remainder is named below.** The first version of this entry said CLOSED flatly,
which was the same mistake it was opened about — plumbing counted as behaviour. **Routing a call site
through `identityHeaders()` does not make it send a signature; it makes it send one IF THE BROWSER HAS
ONE.** `ensureIdentity` has three callers: `arm()`, `/play` and `/claim`. So on a cold browser
`/flow0`, `/flow1`, `/flow4`, `/flow5` and `/account` still send nothing and are still refused.

**That remainder is a decision, not an oversight.** For the four flow pages, minting is exactly what
C39 REMOVED: `Flow0Client` is the file the second minter was deleted from, and adding one back under
a different name would be the same act before the same question. They run under `?u=` and the
relaxation, which is what the harnesses use; in production they write unsigned and are refused.
`/account` is sharper and worse: a browser with no token cannot prove the subject whose data it is
asking to erase, so "delete everything" is refused for precisely the people who never signed in.
**Both are open. Neither is closed by this entry, and the fix for either is a consent question about
where that surface asks — not a line of plumbing.**

**UPDATE 2026-09-14 — `/onboard` MINTS NOW, which was the largest piece of this remainder** and is
closed under `⚑30`, because guarding the two paid routes required it. The consent rule is satisfied by
the step order rather than by an argument: `Step` is `"consent" | "select" | "selfie" | "reveal"`, the
initial state is `"consent"`, and the only exit is the Continue button — so `resolveUserId` was
ALREADY stamping a durable key there, after the answer. Minting a signed id at the same point changes
what is stamped, not when. With it, the "every brand-new player is stamped unsigned and replaced on
their first `/play`" property above is gone, and with it the island relocation and the leaked slot for
new players. **An existing player whose island was assigned under an unsigned id still relocates
once** — the mint moved earlier, it did not become retroactive. `ensureIdentity` now has four callers:
`arm()`, `/play`, `/claim`, `/onboard`. The flow pages and `/account` are still open, unchanged.

The consent rule `identity.ts` states is unchanged and now has three callers rather than one: `/play`
is behind a render gate that will not mount `WorldClient` until `echo.character` exists, and
`/onboard` writes `echo.consent` before it writes that; `/claim` asks no consent question a stamped
key would answer early and already promises the identifier is permanent, which is the case SOC-2.B
makes for it in its own words. It is not the mistake C39 removed — `Flow0Client` was a SECOND MINTER
of a different form (`"u_" + Math.random()`), writing pre-consent.

**TWO COSTS THIS ENTRY DID NOT NAME WHEN IT WAS WRITTEN, both found by review.**

*The re-mint moves your island and leaks a slot.* A browser holding an unsigned id X gets a signed
Y, and `/api/island/assign` then assigns under Y: `archipelago.ts:191-194` returns an existing
assignment only for a matching userId, `0005_island_slots.sql:12` puts a UNIQUE index on
`slot_index`, and `island-registry.ts`'s `remove()` is never called on this path. So X's row holds
its slot forever and the player's island relocates. C39 disclosed the orphaning of evidence; it did
not disclose that the island moves.

*And it is not "once to everyone at rollout", which is how `identity/session/route.ts:16-17` and C39
both describe it.* `onboard/page.tsx:66-67` calls `resolveUserId()` during character creation and
`:147` then pushes to `/play`, so **every brand-new player is stamped with an unsigned id and has it
replaced on their first visit to the world — permanently, as a standing property of the flow.** It
costs nothing today because nothing durable is written under the first id, but the record describes
a migration where the code has an invariant. The honest fix is for `/onboard` to mint, since it is
the surface that asks the consent question; that is a change to the onboarding flow and is not taken
here.

**What this does NOT close:** `harness/f4/f4_capture.py` sends no Authorization header either, so the
F4 acceptance harness has been failing its first GET since that route was gated and reporting it as
`[INFRA] could not reach the no-flag server`. It is a harness, not a product surface, and it is not in
any gate list — but it is the same defect and it is still open.

---

## ⚑ 29. RLS was closed on a count of sixteen; the real number was twenty-six (2026-09-14)

**`⚑25` closed at 61%.** MEASURED on `b22c3d4`: **20 of 30 public tables had row level security.**
0015 enabled it for the sixteen tables `0001_init.sql` created and never re-counted the folder, so the
ten created by `0002`, `0003`, `0004`, `0006` and `0009` were never in scope. `0015:8-10` states the
exposure in its own words — with RLS disabled, PostgREST serves a table to anyone holding the anon
key, **which ships in the browser bundle by definition** — and `lib/config.ts:4` is that key.

**Four of the ten are live, and one of them is the reason this is not housekeeping.**
`connection_analyses` (`0002:5`) carries `user_id` and `transcript_json`, the full `[{who,text}]`
exchange — the same sensitivity class as `messages.text`, which `lib/retention.ts:44-48` marks with a
⚠️. The others: `island_validation` (`0003:6`), `islands` (`0004:6`, `owner_user_id`) and
`island_state` (`0006:7`), which is also `⚑28`'s table. The remaining six are `0009`'s planet
registry, which has no writers until SOC-2.A because `lib/planet.ts:99` hardcodes `backend: "memory"`
— RLS before the first row is free, and this folder is forward-only.

**MEASURED, on PostgreSQL 16.15, against a database the runner built from this folder.** Granting
`anon` the table privileges Supabase grants, and inserting one row:

| | anon reads | anon deletes |
|---|---|---|
| with `0017` | **0 rows** | — |
| with RLS disabled in the same transaction | **1 row, and the transcript text with it** | **1 row it does not own** |

**THE MIGRATION IS GUARDED PER TABLE, AND THAT IS NOT DEFENSIVENESS.** `scripts/migrate.mjs:130-143`
runs a whole file in ONE transaction, so one missing relation aborts all of it and records nothing. A
database migrated by hand and adopted with `--baseline` has `0009` **recorded as applied and not
run** — the expected production shape, because the planet registry has never been deployed. MEASURED
end to end through the real runner: a bare `alter table world_manifest …` fails such a database with
`relation "world_manifest" does not exist`, **the four live tables get nothing**, and every later
`--apply` fails identically because `0009` will never run. The operator is handed an error naming a
parcel table with no personal data while the transcript table stays open — SOCIETY-PLAN §3 item 8's
species exactly. With the guard: **24 of 24 on that database, the four live tables covered**, and the
six absent ones skipped with a notice. On a fully migrated database: **30 of 30, zero policies.**

**THE ELEVENTH TABLE IS A GATE, NOT A MIGRATION.** This invariant has now been broken twice by one
mechanism — a migration covers what it can see, later migrations add tables, nobody re-counts — so
`.github/workflows/ci.yml` asserts it against the schema the runner just built: every public table has
`rowsecurity`, and `pg_policies` is empty. **Verified to fire in both directions:** green at 30 of 30,
red on a table created without RLS, red on a policy added. A loop over `pg_tables` inside the
migration would have covered the eleventh table too, and was rejected — it would silently enable RLS
on tables nobody has looked at, in a forward-only folder, which is the opposite of the per-table
decision 0015 documented.

**Status:** CLOSED. `db/migrations/0017_rls_on_0002_0009.sql` plus the CI gate.

**What this does NOT close, and it is owed to C35:** `connection_analyses` and `island_validation` are
in NEITHER of `lib/retention.ts`'s lists, and that file says in its own words that "a table in neither
list is a table nobody has decided about". C35 classified thirteen identity-keyed tables and did not
see these two. Making rows unreadable by the public does not decide how long they live — and
`connection_analyses` holds the transcripts `messages` is already on a clock for.

---

## ⚑ 30. Two routes spent real money for anybody who asked, and one of them fetched a URL of their choosing (2026-09-14)

**`POST /api/vision` and `POST /api/portrait` had no gate of any kind.** MEASURED: zero `subjectOf`
in either file, no input cap in either, and the repo's only rate limiter is the waitlist's — whose
own comment says why it exists, *"Rate limiting matters more here than it looks: the selfie path
spends real image-generation money"*, about this exact path. `/api/vision` forwards a caller-supplied
base64 image to `api.anthropic.com`; `/api/portrait` sends a caller-supplied prompt to Fal or
Higgsfield. MEASURED before the fix: a 5 MB base64 selfie was forwarded verbatim as a **5,243,524-byte
request body**, from a request that proved nothing about who sent it.

**THE WORST OF IT WAS NOT THE MONEY.** `/api/portrait` read `selfieUrl` out of the body and handed it
to `generatePortrait`, which sets `input.image_url = req.selfieUrl` (`lib/art/fal.ts`) or
`InputImage.fromUrl(req.selfieUrl)` (`lib/art/higgsfield.ts`). So an unauthenticated caller could make
**this project's paid image-generation account fetch an arbitrary URL of their choosing** and
generate from it, on this project's credentials. MEASURED: the field had **no sender**.
`lib/character.ts`'s `fetchPortrait` posts `{ attributes }` and nothing else, and every other
`selfieUrl` in the tree belongs to the waitlist portrait pipeline, which is server-side and uploads to
fal storage itself. A dead parameter, wired straight through to a paid backend.

**WHY IT COULD NOT BE CLOSED UNTIL NOW, and what closed it.** Guarding these two needs the caller to
hold a signature, and the caller is onboarding — which was `⚑28`'s named remainder: `/onboard` called
`resolveUserId()`, stamping a durable id with no signature. The step order settles the consent
question rather than arguing it: `Step` is `"consent" | "select" | "selfie" | "reveal"`, the initial
state is `"consent"`, and the only exit is the Continue button — so every paid call already happened
*after* the answer, and `resolveUserId` was already stamping a durable key there. Minting a **signed**
id at the same point changes *what* is stamped, not *when*. The selfie path is additionally gated on
`consent.biometric` (`onboard/page.tsx:235` disables the button), so `/api/vision` is unreachable
without explicit biometric consent.

**Acted on.**

- Both routes derive a subject. This is the tree's **first `subjectOf(req)` with no asserted id** —
  every other call site passes one — which answers with the token's own subject and refuses a caller
  with no token. Stated as a new pattern rather than left to be inferred.
- `MAX_SELFIE_CHARS` 512 KB and `MAX_ATTRIBUTE_CHARS` 4 KB, both refused with 413 **before** any
  provider call. The product's own capture is a 384×384 JPEG at quality 0.9 — an order of magnitude
  under the cap.
- `selfieUrl` is **gone from `PortraitRequest` and from both providers**, not filtered at the route.
  That is `⚑27`'s move for `ownerId`: the passthrough cannot come back without a type change, so a
  later author adding it out of symmetry has nothing to add it to.
- `/onboard` mints, closing `⚑28`'s largest remainder. The mint is fired when the consent question is
  answered and awaited where it is needed, so its round trip overlaps with choosing a character
  instead of sitting in front of the first paid call.
- `lib/character.ts` sends `identityHeaders()` — the other half of `⚑28`, on this path.
- `apps/web/tests/paidRoutes.test.mts`, seven tests, driving the REAL handlers with `globalThis.fetch`
  replaced by a recorder. **The outbound assertion is the one that matters:** a route can answer 403
  and still have called the provider, and `/api/vision` degrades to a mock on any error, so a test
  that only read the status would pass on a route that refuses *after* spending. MEASURED, each
  defect turning exactly one test red: guard removed → `an unsigned caller cannot spend…` (6 pass /
  1 fail) · cap removed → `an oversized selfie is refused BEFORE the provider…` (6/1) · portrait
  guard removed → `an unsigned caller cannot spend the project's image-generation budget` (6/1).

**Writing that suite reproduced the trap it warns about.** `vision/route.ts` reads
`ANTHROPIC_API_KEY` into a module-level `KEY` at load, so setting it in `before()` — after the import
— left the handler answering a mock and never reaching the forward. The guard tests were green and
the outbound assertions were vacuous. The only reason it was caught is that the "legitimate caller is
not the casualty" test asserts a forward DID happen, and it went red. A regression guard caught a
hole in the gates beside it.

**Status:** CLOSED, in two passes. The second one is below, and it also carries the corrections
review made to the first.

**THE GUARD IS NOT A COST CONTROL AND MUST NOT BE READ AS ONE.** `/api/identity/session` mints for
anyone who asks, so a determined caller mints a token and spends anyway. What the guard buys is that
the spend is ATTRIBUTABLE and that a casual unauthenticated script is refused; the caps bound a single
call. **Neither bounds a loop, and that is what the second pass added.**

**THE LIMIT, AND THE POSTURE IS THE DECISION.** `0018_rate_limit.sql` generalises 0007's limiter with
a BUCKET column, and `lib/rateLimit.ts` is the one place `hashIp`, `clientIp` and the window
arithmetic live — they were route-private, and copying them would have meant two IP-hashing policies
with two salts (L5). The bucket is the whole point: `waitlist_rate`'s key is `(ip_hash, window_start)`
alone, so the moment a second caller used it a burst on `/api/vision` would consume the waitlist's own
window and tell a real person the list was full. MEASURED against PostgreSQL 16.15 through the real
runner: same bucket+ip+window counts 1 → 2; the SAME ip and window in another bucket answers 1, not 3;
another ip answers 1; the next window is back to 1; **forty concurrent calls produce exactly 40**; and
as `anon`, with the grants Supabase gives, the counter reads 0 rows. Coverage after it: **31 of 31
tables with RLS, 0 policies.**

**`onUnavailable` is per caller, and the two callers choose opposite answers — the user's call.** The
waitlist keeps `"allow"`, whose reason still stands and is now declared rather than implied: if the
counter is unavailable a real person must still be able to join. The paid routes take `"deny"`,
because "the counter is unavailable" and "there is no limit" are the same sentence when every call
spends. 429 for over-limit, **503 for a counter that is down** — 429 would tell the caller to slow
down, which is a lie about what happened and would have them retry into the same wall.

**AND THE ORDER OF THE CHECKS IS LOAD-BEARING, which the first version got wrong.** Placed before the
no-provider short circuits, a deny-on-unavailable limiter closed the ZERO-KEY LOCAL RUN: with no
Supabase there is no counter, so `/api/vision` answered 503 even on the path that would only ever
have returned a mock. A deployment with nothing to spend has nothing to fail closed about. The
limiter is now reached only past `if (!KEY)` on vision and only inside `if (process.env.ART_PROVIDER)`
on portrait, and "works with no keys" is exactly as it was. **MEASURED: five tests caught the
inversion**, which is the second time in this workstream that a test caught a hole in the fix rather
than in the original defect.

**Also owed, and named rather than bundled:** `COST_DAILY_USD_BUDGET` (`services/ml/echo_ml/cost.py`)
enforces nothing — `over_budget` has exactly one hit in the tree, its own assignment — and the meter
never sees `/api/vision`, `/api/portrait`, the TTS providers or `apps/realtime`'s direct Anthropic
call. A ceiling nobody reads is not a budget.

**And the six `/api/venue/*` routes are untouched here, deliberately.** `/venue` is a nine-line
redirect to `/play` — the entry point was retired in `b406d49` — but **the API routes under it were
not**, and `/api/venue/dialogue/simulate` bills eleven Claude calls per request with an unbounded
`profile` stringified into every system prompt. Gate it, delete it, or keep it: that is a product call
and it is the user's, not a defect to be quietly patched.

*CORRECTED, and it was wrong in a way that mattered to that decision.* This paragraph first said "the
four `/api/venue/*` paid routes" and then "the six API routes" three words later — `find` returns
**six** — and asserted that the subsystem "appears in none of the four planning documents
(`grep -ric venue`: 0, 0, 0, 0)". MEASURED: SOCIETY-PLAN 0, DECISIONS 0, NEW-AGENT 0, and
**`docs/BUILD-PLAN.md` 4** — which `NEW-AGENT.md` names as inherited-unchanged, and whose `:98`
tables the brand-stand demo as an "**Optional funding wedge — Phase 4**" with `:547-548` calling it
"a faster-revenue wedge that can fund" the rest. So it is planned work with a phase attached, not an
orphan. Checking four documents and reporting "none of the four" was true of the set I looked at and
false of the claim I made, which is the third published count in this workstream that did not
reproduce.


---

## ⚑ 31. The venue API outlived the page it belonged to (2026-09-14)

`b406d49` retired the THY brand-stand demo as an entry point — `app/venue/page.tsx` became a nine-line
redirect to `/play`. **The six routes under `/api/venue/` were not retired with it.** They stayed
reachable with no page in front of them, unauthenticated and unlimited, and three of them spend:
`tts` at ElevenLabs or OpenAI, `dialogue/sales-turn` at Anthropic, and `dialogue/simulate` — which
bills **eleven Claude calls per request** (`orchestrate.ts` loops six states producing six sales turns
and five visitor turns, then calls `finalize`, which calls Claude again) and stringifies an unbounded
caller-supplied `profile` into every one of those system prompts.

**Decided: 410 Gone, not a guard and not a delete, and the reasoning is the point.**
`docs/BUILD-PLAN.md:98` tables this demo as an "**Optional funding wedge — Phase 4**" and `:547-548`
calls it "a faster-revenue wedge that can fund" the rest — so it is planned work with a phase
attached, and deleting it throws that away. But it has no entry point today, so gating it would be
securing a surface nobody can reach: investment in an inactive subsystem, while money stays spendable
for as long as that investment takes. 410 says "this existed and is deliberately gone", stops the
spend now, and costs one line to reverse. `lib/venue/*`, `game/venue/VenueScene.ts` and the
`/dashboard` page are untouched and still compile. Each route's header says what it was and what
bringing it back needs first: the treatment `⚑30` gave `/api/vision` and `/api/portrait`.

**`/dashboard` was the live surface nobody accounted for.** It polls `/api/venue/research` **every two
seconds** with `.catch(() => {})` and `r.json()` on whatever comes back — so against a 410 it would
have set its state to the error body and hammered a dead endpoint forever, showing an empty dashboard
with no explanation. It now stops on 410 and says what happened. The page is deliberately kept rather
than retired: its code is the demo's, and `⚑30` is where the decision to keep it is recorded.

**Status:** CLOSED. Six routes answer 410; nothing is deleted; the record says how to come back.

**Not closed, and it belongs to whoever brings this back:** the routes were never in
`SOCIETY-PLAN.md`, `DECISIONS.md` or the gate lists, and `/api/venue/dialogue/simulate`'s eleven-call
fan-out was never costed anywhere. A surface that spends per request and appears in no gate is how
this one survived a retirement.

---

## ⚑ 32. `census()` on a past day counts people who were not in the village yet (2026-10-17)

`alive(p, day)` is `birthDay <= day < deathDay` (`society.ts:471`), and `census(s, day)` filters on
it alone (`society.ts:878`). An incomer is born elsewhere years before they marry in
(`society.ts:662-673`), and a founder before the founding day, so for those days they are *alive* and
*not here* — and `census()` counts them as living in the village.

**MEASURED** with a probe over 60 cells (`echo-capacity-1`, one fixed geography, horizon 0): of
1,813 incomers alive five years before they arrived, **1,813** are in `census(s, thatDay).alive`.
Founders show the same before the founding day: **720**.

**Nothing shipped is wrong because of it.** Five of the six call sites — including
`scripts/census-planet.ts:58-62`, which produces C33 — ask about day 0 of a settlement generated to
day 0, and an incomer in that list has always arrived by then. The sixth, `society.test.ts:206-210`,
generates to year 10 and asks about day 0, so it does overcount; it asserts an UPPER bound
(`<= capacity * 2.2`), so the overcount makes it stricter and hides nothing.

**Why it is recorded now:** `lib/life.ts` (C40) asks about the past constantly — who witnessed a fever
forty years ago, who could teach a trade — and it uses `present()` (alive AND arrived) for exactly this
reason. The two predicates now coexist, and the next caller to ask `census()` about a past day gets
the wrong one without being told.

**Status:** OPEN. The fix is one line in `census()` (filter on `present`), but it changes what
`census()` returns for past days, and `society.test.ts:210`'s bound would then be measured against a
different population. Take it as its own change, re-run that test, and say what moved.

---

## ⚑ 33. A person's `seedKey` doubles in length every generation, and every draw reads all of it (2026-10-17)

`bearChildren` keys a child on both parents' full keys — `` `${mother.seedKey}+${father.seedKey}/kid/${i}` ``
(`society.ts:595`) — so a key is roughly twice its parents' length, and `stream()` calls
`hashString(key, n)` (`terrain.ts:245`), whose `hashSeed` walks the whole string on EVERY draw
(`terrain.ts:108-115`).

**MEASURED** over 60 sample cells at horizon 0 (`echo-capacity-1`, one geography, 3,141 people): the
longest `seedKey` is **36,037 characters** and the mean is **2,089**. A person costs a dozen or so
draws, each one a full pass over a key that size. What share of `settlementAt`'s time that is has
**not** been measured; nor has the memory the keys hold (up to `MAX_PEOPLE` = 4,000 of them per
settlement).

`lib/life.ts` (C40) does not inherit it: it keys its streams on `Person.id`, and says why in its
header.

**THE DEADLINE, which is the reason this is an entry and not a note.** Compressing the key (hashing
the parents' keys rather than concatenating them, say) is a small change, but it changes **every draw
of every person on the planet** — names, lifespans, trades, who pairs with whom. Today that costs
nothing that persists: C25 means zero rows, and the delta layer (SOC-6.C) does not exist. **The day
SOC-6.C writes its first row keyed on a `Person.id`, it becomes unpayable**, because the same id would
then name a different human being. It is the same species as the `bearChildren` horizon bug, with a
date on it.

**Status:** OPEN, and a decision for the user: compress it before SOC-6.C, or accept the cost
permanently. Recommendation: before. Measure `settlementAt` with and without first, so the decision
is made on a number.

**Status (2026-10-18):** CLOSED by C43, before any row. A child is keyed on its parents' ids —
`` `${mother.id}+${father.id}/kid/${i}` `` — and `Person.id` is `uidOf(seedKey)`, sixteen hex
characters of the lineage, so a key is about forty characters in any generation and an id names the
same human being whatever happens to anyone else. `society.test.ts` fails if a key passes eighty
characters. It was done together with ⚑38, because each re-rolls the planet and doing them apart
would have re-rolled it twice.

---

## ⚑ 34. The landing page downloads the planet's village index: 594 KB, 103 KB compressed (2026-10-17)

`HeroPlanet` fetches `/planet/villages-<seed>.json` after the globe has drawn, to light every
village (C41). It is 28,282 cells and their capacities: 594,391 bytes, 103,036 gzip -9. It never
blocks the planet — a missing file is no lights — but it is the heaviest thing the landing fetches
after the scripts, and it has **not been measured on a phone**, on a slow connection, or for the time
`setVillages` spends placing 28,282 points (one `globeRadiusAt` each).

**Status:** OPEN. Cheaper shapes exist and none is chosen: drop hamlets below a capacity, ship
resolution-3 parents with counts, or a binary encoding of the h3 indices. Measure first.

---

## ⚑ 35. A village is drawn as it stood on the day the parcel was built, and its people walk through walls (2026-10-17)

Three limits of C41's first village, written down rather than discovered:

- **The houses are the build day's.** `PlanetWorld` builds the village once; a world day is twelve
  real minutes, so a session that stays an hour sees five days of schedules on one day's houses: a
  family that dissolves keeps its lit windows until a reload. The schedule itself does change daily.
- **Nobody avoids anything.** Legs are straight lines: a villager can cross a house, a field or
  another villager, and the player walks through villagers (houses do stop the player).
- **Only start-resolution parcels have villages.** `settlementAt` keys on the cell id, so a
  subdivided child would get a different village from the parent C33 counted. `villageAt` and
  `/api/planet/village` refuse any other resolution until SOC-0.F says what a child's village is.

**Status:** OPEN, all three. The first is a rebuild on a day change; the second is a path graph over
the plan's lanes; the third is a decision.

**Status (2026-10-18, C46):** the second is CLOSED. Every leg is routed round the houses, the well,
the mine and the graveyard wall (`lib/nav.ts`). `nav.test.ts` samples every walked point of twelve
villages' days and fails on one inside a wall, and the same days drawn straight cross houses on
dozens of legs. Nobody walks through the stranger either. The first and third are still open.

---

## ⚑ 36. The frame has about ten draw calls of headroom left on a large village (2026-10-17)

Measured with people, worst of twelve headings: Vakeel (74 people) **110 of 120 calls and 520k of
600k triangles** at dusk; Drurkkuifell 110 / 447k; Konreef 92 / 302k (C41's table). The village itself
is cheap — two calls — and the crowd is thirteen with its shadows whatever its size, so the cost is the
ORDINARY parcel's (C28, C31) with a village on top. A bigger town, smoke, more props or the C38
`buttress-tree` mid band each spend from the same ten.

**Re-measured 2026-10-18 after C43's re-roll:** the biggest village is now Kamgull, 84 people —
**112 calls / 526k triangles**, worst of 12 headings at dusk and at morning. Eight calls of headroom.
**And after C48:** weather adds one call while it rains or snows; a stormy midday on `8414d53ffffffff`
read **115 of 120**. About five calls of headroom on a big village in bad weather.

**Status:** OPEN. The levers on record: SOC-4.C's person impostor (fewer crowd calls at distance),
thinning the scatter inside a settled cell (realistic, and cuts scatter calls), and C38's mid band
for more classes. None is free; pick with a measurement.

---

## ⚑ 37. Talking to a villager is closed wherever migration 0018 has not been applied, and remembers nobody (2026-10-18)

`/api/village/talk` (C42) uses the shared limiter with `onUnavailable: "deny"`. On this machine the
configured Supabase answers the `rate_limit_hit` rpc with an error — `0018_rate_limit.sql` has not
been applied there — so the route answers **503 `rate_limiter_unavailable`** for every real call, as
`/api/vision` and `/api/portrait` do. That is the fail-closed posture working, not a bug in it; but it
means the feature, and the two paid routes, are dark on any environment whose database is behind, and
**which migrations production has is still unanswerable** (SOCIETY-PLAN §6 question 5).

Two further limits, written down rather than found later:
- **No memory.** Each conversation starts from nothing: the villager does not know you were there
  yesterday. That is SOC-6.C's delta layer and SOC-6.F's memory store, and it needs a signed subject
  and an erasure path before a single row is written.
- **The server does not check proximity.** Any living villager can be spoken to by id from anywhere.
  It changes nothing in the world (L3) and is rate-limited, so it is a cost question, not a state one.

**Status:** OPEN. Applying 0018 is an operator action on a database this repository does not own a
connection to; it was not done here.


**Status (2026-10-18, C44):** the two further limits are closed. Villagers remember strangers
(`villager_memories`), and a conversation begins only beside the villager (`talk/begin`, 25 m, against
the closed form). The first limit still stands, and C44 widens it: 0019 must be applied as well as
0018, or memory and decisions are dark too. What is left is ⚑39.

---

## ⚑ 38. The society's random stream was one number and its shifts (2026-10-18)

`stream(key)` was `() => hashString(key, n++)`. `hashString` is FNV-1a with the salt XORed into the
state and multiplied through, and no final mixing, so `(H ⊕ n)·p⁴ mod 2³²` is draw 0 plus a small
integer times one constant (≈ 0.6868) modulo 1. **Every draw a person ever made was a shift of their
first.** Found while explaining one villager's numbers to the user, not by any test: his first six
draws were an arithmetic progression.

**MEASURED, before → after the fix (C43):**

| | before | after |
|---|---|---|
| distinct gaps between a stream's first two draws, 20,000 keys | **2** | 20,000 |
| distinct gaps between two siblings' first draws, 20,000 families | **1** | 20,000 |
| sd of the three-uniform bell (lifespans), against 1/6 | **0.135** | 0.1666 |
| founders' temperament sd per axis, dial 0.4 (7,946 → 7,984 founders) | **0.32–0.35** | 0.394–0.402 |
| strongest correlation between two founder axes | **0.52** (dominance–pace) | −0.029 |
| mean adult lifespan, women / men | **70.0 / 69.1** | 67.4 / 67.4 |
| mean founding date of a settled valley, window mean 180 | **218 years** | 181 |

The last row is the one with consequences beyond a person: the roll that settles a cell and the roll
that dates it were two draws of the same stream, so settled cells were systematically old, which is
why C33's census had 2.81 M graves and the re-rolled planet has 2.36 M.

**Why nothing caught it.** The tests measured rates and L2, never independence; the temperament test
compared founders' spread with the last generation's, and both were shrunk alike. Three tests in
`society.test.ts` and two in `life.test.ts` now pin independence, and all five fail on the old stream
(injected and checked).

**What was NOT changed:** `hashString` itself. Terrain, scene, assets and walkable read it, and
changing it would move the whole planet's ground. Only the society side (`society`, `life`,
`schedule`, `village`) moved to `stream` and `hash01`. Whether `hashString`'s own callers draw
consecutive salts anywhere this matters has **not** been audited.

**Status:** CLOSED for the society (C43). OPEN for the audit of `hashString`'s other callers.

---

## ⚑ 39. What C44 does not do, and what it trusts (2026-10-18)

- **The stranger's position is their browser's word.** `talk/begin` checks it against the closed
  form, so nobody talks to someone asleep, at sea or gone, but a crafted client can compute where a
  villager stands and claim to be there. The rate limit is still the cost guard.
- **Death is not changeable.** No change touches a drawn lifespan, so "lives not fixed in advance"
  holds for what people do, where they go and who is born after a decision, not for when anyone dies.
  A hazard model (lifespan as a threshold over circumstances a change can alter) would make it
  changeable. It is not built, and it would re-roll every death on the planet.
- **No matchmaking, no return.** Nobody can be talked into a marriage, and a leaver is gone: they
  are not living in some other village of the planet. Each is a further event kind.
- **Griefing is bounded, not prevented.** One leaving per village per 30 world days (6 real hours),
  and leaving needs a second meeting, so one persistent stranger can still empty a village slowly.
  There is no reverting tool beyond a database row.
- **Decisions are rare, and that is measured on five conversations only** (C44): one decision in
  five. Whether real players find villagers too stubborn is unmeasured.
- **The village a page shows is fetched once.** A change made by someone else while you are on the
  parcel arrives on your next visit. Your own changes are folded in at once (`PlanetWorld.revillage`).
  The houses are the build day's either way (⚑35).
- **0019 is applied nowhere.** Locally the store runs as `VILLAGE_STORE=memory`, and production needs
  the migration before any of this is more than talk.

**Status:** OPEN, all of it, written down rather than discovered.

---

## ⚑ 40. What C45 does not do yet, and what it trusts (2026-10-18)

- **Nothing here has moved a real posterior yet.** The ML service was offline for every browser run,
  so the acts reached `/api/observe/behavioral` and came back `mocked`. Each named label's handler is
  checked by a test to exist; what these acts actually do to μ and Σ is unmeasured. That needs an
  individuation run in the embodied build's style: two contrasting players, two posteriors, an L2
  distance.
- **Many acts are unrouted, on purpose.** Trespass, theft, trampling, respect at a grave and play
  have no feature whose definition they match (C30: the property-respect handlers route to
  `consistency`, an exact zero column). They move the posterior through the label embedding and the
  privacy bucket only, until the one-time re-anchor (C29) decides.
- **The stranger's position is their browser's word**, as in ⚑39. Reach is checked against it, and
  who saw the act is computed by the server's clock. A browser whose sky is frozen sees a different
  audience from the server's witnesses (the measurement's `audience_size` is the browser's).
- **Taking is not having.** What you carry lives in the page. It is gone on reload, and a gift is
  trusted to have been carried. There is no inventory store. *CLOSED by C47: the pack is the
  server's (`player_items`), a pick-up needs room in it, and a gift is checked to be in it.*
- **The boat is per-viewer.** Others see the family's boat at its mooring while you row it. Nothing
  is synchronised in real time (C27's shared unit is the parcel, and this is a presentation).
- **No violence toward people.** There is no verb that hurts a villager. That is deliberate in v1:
  it is the one category whose consequence (C26) this world cannot yet carry.
- **Grievance is family-deep and month-long, and those are dials.** Whether villagers forgive too
  fast or know too little is unmeasured with real players.

**Status:** OPEN, all of it, written down rather than discovered.

## ⚑ 41. What C50 does not do yet, and what it trusts (2026-10-18)

- **Asked when, not asked or not.** Helping when asked and helping unprompted reach ingest.py as the
  same label (`give_gift`, `help_at_cost`). They are different evidence — responsiveness against
  initiative — and the protected ML boundary (C7) is why the request is not a feature yet.
- **Villagers rarely bring it up unprompted in conversation.** It was 0 of 2 when asked about their
  day, and 2 of 2 when help was offered. The bubble asks; the conversation waits to be asked. Whether
  that is the right balance is unmeasured with real players.
- **"Asked once" is this page's memory.** A villager who asked for a shell asks again after a
  reload. It is not per stranger, and not stored.
- **A gift at a door meets one need**, the first household member's whose need it is, in the order
  the village lists them. A household where two people want the same thing is not tested.
- **The need is in English templates**, as the chatter is; Turkish is feature 20. The model says it in
  the stranger's language.
- **Migration 0022 is applied nowhere**, like 0019–0021 (⚑37).

**Status:** OPEN, all of it, written down rather than discovered.

## ⚑ 42. What C52 does not do yet, and what it trusts (2026-10-18)

- **Weddings are rare in the present.** Senstrand pairs nobody in 3.3 world years, and Kamgull one
  couple. That is the society's demography (C40). Whether the planet's marriage rate is right is
  unmeasured.
- **A village is walked in real time and lived in a compressed one.** A world day is twelve
  minutes, and a walk across the village is up to two. So a burial an hour long by the village's
  clock is a real minute and a half, and the evening after a burial can be over before the mourners
  reach the green. The schedule copes, and the scale itself is C41's.
- **No coffin, no flowers, no music.** A burial is people in rings with their heads bowed. Sound is
  feature 10.
- **The grave is the build day's (⚑35).** Someone who died after the page was built is buried at a
  slot their grave is not yet drawn at, until a reload.
- **The stranger's position is their browser's word**, as in ⚑39/⚑40. The server checks it is
  within reach at the hour, not that it was there for two-fifths of the gathering.
- **The labels are unrouted.** `mourns`, `joins_group` and `stays_solo` reach ingest.py by the label
  embedding only (C7); I7's "consoles_survivor" and "visits_grave" later are not read.
- **Phones do not see the news card** (`max-sm:hidden`); feature 20.
- **Migration**: none needed. Deeds of verb `attend` use 0020's `village_deeds` unchanged.

**Status:** OPEN, all of it, written down rather than discovered.

## ⚑ 43. What C53 does not do yet, and what it trusts (2026-10-18)

- **Two writes, two cells, no transaction.** A move is a row in each village. If the second write
  fails, the person has left and arrived nowhere. That is C44's world, not a broken one, but it is
  not what was decided.
- **Coming home is for the unmarried.** Someone who married where they went cannot go home in v1:
  their partner, and children born there, would have to come too, as people the home village has
  never had. A person who came home cannot leave again (`already-leaving`).
- **The house a returner comes home to stands in between.** `closeHouseholds` counts it lived in
  from the day they left until they come back, even if nobody was in it.
- **A newcomer family's house is the build day's (⚑35).** They have a plot in the plan, and until a
  reload the drawing is the one before they came.
- **Introductions read the stranger's last forty conversations** and load each village they were
  in. That is a cost per conversation, paid only from the second meeting.
- **Who speaks first goes.** The visitor and the one who moves are always the one who sent word
  first. Whether the man, the woman, or the smaller village's should go is not modelled.
- **Weddings are between a man and a woman**, because the generator's pairing is (C40). Nothing in
  C53 requires it, and nothing in C53 changes it.
- **The other village does not hear of a refusal.** Word sent and never answered stays waiting for
  sixty days, and then is forgotten.
- **Migration 0023 is applied nowhere** (⚑37).

**Status:** OPEN, all of it, written down rather than discovered.

## ⚑ 44. What C54 does not do yet, and what it trusts (2026-10-18)

- **An invitation is the page's.** It lasts the world day in this browser and is gone on a reload.
  It is not stored, and the server does not check it: walking in through a door you were asked
  through changes nothing shared, so nothing has to.
- **Entering a forced house with the family home is not a deed of its own.** Forcing the door
  already is (C45, trespass, weight 3). What the family, against the back wall, think of the
  stranger standing in their room is not modelled beyond that.
- **One room.** A two-storey house's upstairs is not drawn; everyone sleeps downstairs.
- **The cut takes off everything of the village inside the house's box** above 1.45 m, including a
  neighbour's eaves that reach into it.
- **Sleepers can be walked through.** Beds are solid; a body in one is the bed.
- **The doorway is a hole whatever the door's state.** A door you were asked through is drawn
  open, not as a door standing open on its hinges.
- **The labels are unrouted** (C7): `enter_invited`, `enter_forced`, `explore_house`.

**Status:** OPEN, all of it, written down rather than discovered.

