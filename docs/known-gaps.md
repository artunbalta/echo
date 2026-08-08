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
- **One honest limitation:** the HTTP route calls `loadIslandState(userId)` with its default
  `now = Date.now()`, so the injectable clock is not reachable over HTTP. The crop branch was
  exercised end to end because decay reads `cropPlantedAt` directly, but the raft-weather and
  tie-cool branches key off `now - updatedAt`, which POST re-stamps, so those two were proven on the
  pure core rather than over the wire. If a future test needs compressed decay through the route, the
  route would have to accept an injected `now`, and that is a change nobody has needed yet.
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
