# ECHO — Claude Code Execution Prompts

> Companion to `ECHO_PLAYABLE_BLUEPRINT.md`. Put both files in the repo root (e.g. `docs/`).
> Then paste the prompts below into Claude Code **one at a time, in order**. Each phase is a
> self-contained instruction that leaves the app runnable, runs its own acceptance gate, and
> commits. Do **not** paste all phases at once — run a phase, verify it, then paste the next.
>
> How to read this file: **§0** is the one-time kickoff (paste first, once). **§P1…§P7** are the
> build phases. **§V** is the final verification pass. Everything in `CODE FONT` is meant to be
> pasted verbatim.

---

## §0 — KICKOFF PROMPT (paste this first, once)

```
You are implementing the ECHO playable-doppelganger build. The full design spec is in
docs/ECHO_PLAYABLE_BLUEPRINT.md — read it in full before writing any code, especially Part 0
(the four design laws), Part VII (code-level change spec), Part IX (verification), and the
storyboard in Part VI.

Before touching code, do a repo survey and confirm these paths actually exist (report back any
that differ from the blueprint's assumptions):
  - packages/shared/src/{world.ts, persona.ts, archipelago.ts, protocol.ts, npcgen.ts, sprite.ts}
  - apps/web/src/components/{IslandClient.tsx, WorldClient.tsx, EchoPanel.tsx, OutcomesPanel.tsx}
  - apps/web/src/game/{PixiWorld.ts, telemetry.ts, tilemap.ts}
  - apps/realtime/src/WorldRoom.ts  (find the logInteraction call)
  - services/ml/echo_ml/{persona.py, persona_model.py, reward.py, gate.py, bald.py, autonomy.py,
    reconstruct.py, policy.py, config.py} and services/ml/scripts/*
  - db/migrations/*  and the venue Store / archipelago IslandStore persistence seams

NON-NEGOTIABLE RULES (from Part 0 — enforce in every phase, reject your own diff if it violates):
  1. NO game-layer overlay: no xp, score, levels-you-beat, streaks, badges, points, win-states,
     quest checklists — anywhere in user-facing copy or code identifiers. Difficulty comes ONLY
     from scarcity + irreversibility.
  2. Non-choice is data: every affordance is skippable; refusing it must NEVER block progress or
     show a penalty. Each new affordance defines a Channel-K "refusal" cue.
  3. Identity lives in the conditional signature: always record the context envelope
     (counterpart_status, audience_size, public_or_private, scarcity_level, stage) with every cue.
  4. Every survival mechanic must be a cue emitter AND justified by a felt game reason.
  5. Zero-key path must keep working: every new subsystem needs a mock; a clean checkout with no
     API keys must still run end-to-end. Never break the ML-offline / in-memory fallbacks.
  6. The 8 persona axes are FIXED. Do NOT add a 9th axis. All new reads load onto existing axes
     via W. Adding an axis breaks PERSONA_DIM, measurement.npz, and every ML test.

WORKING METHOD:
  - Work phase by phase (P1..P7). Do not start a phase until I paste its prompt.
  - Each phase must leave the app runnable (npm run dev:web + dev:realtime; dev:ml optional).
  - Before coding a phase, write a short plan (files to touch, new files, test plan) and wait if
    anything is ambiguous.
  - After coding, run the phase's acceptance gate (given in each prompt), then commit with the
    message format:  "ECHO Pxx: <what> -> <fix ids>".
  - After committing, STOP and report: what changed, how to see it in-app, what the acceptance
    gate showed, and any deviations from the blueprint. Then wait for the next phase.

Confirm you have read the blueprint and completed the repo survey, list any path/assumption
mismatches, and propose the P1 plan. Do not write P1 code yet — wait for the P1 prompt.
```

---

## §P1 — SURVIVAL SPINE (playability + persistence)

```
Implement Phase P1 from docs/ECHO_PLAYABLE_BLUEPRINT.md (Part I, Part VI.A, Part VII.1/VII.2/
VII.4). Goal: turn the island from a static diorama into a playable day with three clocks and
soft-irreversible, persistent consequences. This is the "now it's actually a game" phase.

Deliver:
1. packages/shared/src/world.ts — add the SURVIVAL constants block (DAY_MS, VITALITY_MAX,
   VITALITY_DRAIN_PER_MIN, GROW_MS, DECAY{CROP_WILT_MS, STRUCT_WEATHER_PER_DAY, TIE_COOL_PER_DAY},
   SCARCITY{LEAN, NORMAL}) as a single shared source of truth, mirroring the WORLD pattern.
2. apps/web/src/components/IslandClient.tsx — a useDay() state machine: daylight countdown,
   vitality drain (scaled by scarcity_level), the grain fork (eat-now vs save-seed, committed
   once, irreversible) and tide wager as commit-once interactions, and the campfire `end` action
   that closes the day (advance crop growth tick, compute decay, set tomorrow's scarcity_level
   from today's allocation).
3. apps/web/src/game/PixiWorld.ts — DIEGETIC rendering only (Part V.1): sun-arc + shadow length
   for daylight; sprite posture/tint for vitality; bush-thinning / tide-level for scarcity.
   NO numeric health/hunger bars.
4. Persistence (closes known-gaps #5): a new IslandStateStore following the archipelago.ts
   IslandStore seam — persist { cropStage, structureProgress, vitalityCarry, scarcityLevel,
   dayCount, tieWarmth }. Supabase-backed when DATABASE_URL is set, in-memory fallback otherwise
   (zero-key path preserved). Add the db migration under db/migrations/ (guarded/idempotent).
   On session load, apply wall-clock decay (SURVIVAL.DECAY).
5. Telemetry: emit survival_tick and fork_decision events (respecting telemetry consent). Add the
   payloads to packages/shared/src/protocol.ts. Include the full context envelope on every event.

Keep interactions commit-once with a single confirm on the irreversible forks (no accidental
commits — Part VIII.4). Do not add any tutorial modal chain (Part V.4).

ACCEPTANCE GATE (run before committing; report results):
  - A full day is playable start->campfire in <=10 min with WASD/touch.
  - The grain fork is irreversible and its consequence is visible next session (persistence works
    with and without DATABASE_URL).
  - Scarcity visibly bites (diegetic, no bars).
  - npm run build:shared, dev:web, dev:realtime all run; zero-key path still works.
  - Invariant grep: no xp|score|level|streak|badge|points in user-facing strings.

Commit "ECHO P1: survival day-loop + persistence + decay -> fixes M2, gap #5", then STOP and
report how to see it in-app.
```

---

## §P2 — RECOGNITION FELT (make the learning visible & honest)

```
Implement Phase P2 (Part V.3/V.5/V.6, Part VI.A dusk, ux-audit B2/M1/M3/m2/m3). Goal: the person
can feel the echo learning them, honestly, without any game-layer.

Deliver:
1. Recognition meter (fixes B2): elevate EchoPanel.tsx into an always-glanceable world HUD element
   — a portrait-coming-into-focus / 8-axis constellation, NOT a bar, NOT xp. Bind ONLY to real
   /persona signals: certainty (1 - mean(uncertainty)), breadth (traits.length/8), evidence
   (behaviors, diminishing returns), reliability (low ece, rising agreement_ewma). Empty on day 1,
   visibly waiting. Wrap animation in prefers-reduced-motion; make touch-legible (M6).
2. Offline honesty (m2): when ML is mock/offline, label it explicitly ("echo brain offline — demo
   values"); never fake a fill.
3. Dusk mirror beat (fixes M1) in WorldClient.tsx: at campfire `end`, if a real trait newly
   resolves (diff traits[] across /persona polls) OR a bucket's agreement ticks up, show ONE
   in-tone sentence bound to the ONE real axis/bucket that moved. Copy names a CONTINGENCY, not a
   trait number ("...someone who saves for a leaner day", never "warmth: 0.7", never "+1"). If
   nothing resolved, show NOTHING (silence is content — Part VIII.10).
4. Per-bucket graduation progress (fixes M4, setup for P6): in the mirror, show progress vs the
   REAL gate — agreement vs alpha*, volume vs n*, ECE vs e* (read the actual thresholds from
   services/ml/echo_ml/config.py). Honest "almost there", never a fake bar.
5. Teaching discoverability (M3): first time a conversation opens, a one-time in-tone hint that
   approve/edit/reject teaches the echo; tie the feedback to a visible meter tick.
6. Funnel instrumentation (m3): consented, key-free markers via the telemetry pipe/localStorage:
   world_enter, first_nearby, first_conversation, first_let_echo_answer, first_promotion,
   handover_start, plus first_fork_decision, first_dusk, day_2_return, first_collapse.

ACCEPTANCE GATE:
  - Meter moves ONLY on real /persona change; with ML offline it shows the honest label.
  - Dusk beat fires only on real resolution and names a contingency; no beat when nothing moved.
  - Graduation progress reflects the real config.py thresholds.
  - Invariant grep passes; reduced-motion + touch verified.

Commit "ECHO P2: recognition meter + dusk mirror beat + graduation progress -> fixes B2,M1,M3,M4,m2,m3",
then STOP and report.
```

---

## §P3 — LOCOMOTION MEASUREMENT (the openness apparatus + per-actor logging)

```
Implement Phase P3 (Part II.4, Part VII.2/VII.3, known-gaps #2 and #4, event-schema Rule 3). Goal:
build the least-fakeable measurement channel and the per-actor logging the social science needs.
No big visible change — this is measurement infrastructure that P5 depends on.

Deliver:
1. Continuous passive locomotion sampler in apps/web/src/game/telemetry.ts. It MUST be debounced,
   change-thresholded, and per-day-capped (the exact known-gaps #2 constraints): aggregate
   heading_change_rate, path_tortuosity, novel_tile_ratio (fraction of newly-visited tiles/min),
   backtrack_rate, and dwell points; emit AT MOST 1 passive_locomotion event per ~1.5s, hard-
   capped per day. Add the payload to protocol.ts. It must NOT flood /observe.
2. Fix the one-way logInteraction in apps/realtime/src/WorldRoom.ts (~L374) to emit PER-ACTOR
   events from BOTH vantages (initiator + recipient), each with its own context envelope. This is
   a prerequisite for the conditional-signature science (event-schema Rule 3), not a nicety.
3. Add the ML featurizer mappings (services/ml/echo_ml/persona.py featurize_raw + cue tables) for
   passive_locomotion and the named scalars (novel_tile_ratio, path_tortuosity). DO NOT re-anchor
   W yet — that is P5. Just make the cues flow and be recorded.

ACCEPTANCE GATE:
  - Local two-tab run: passive sampler emits <=1 event/~1.5s, capped per day, with no measurable
    /observe load regression (watch the realtime->ML forwarding).
  - logInteraction produces two events (both actors) with correct context envelopes.
  - services/ml existing tests + numerics regression gate still pass (nothing re-anchored).
  - Zero-key path unaffected.

Commit "ECHO P3: passive locomotion sampler + per-actor logging -> gap #2,#4, Rule 3", then STOP
and report.
```

---

## §P4 — THE CROSSING (Stages 2–3: sighting, sail, first contact)

```
Implement Phase P4 (Part I.3, Part VI.C, stage-map Stages 2-3, Part VII.3). Goal: the raft becomes
meaningful, the horizon figure becomes reachable, and the first social contact across water works
and is measured from both sides.

Deliver:
1. Stage-2 sighting: use the existing PRESENCE tiers (world.ts) so a far, sharp, ANONYMOUS figure
   is visible across the water (HORIZON), name-resolving only at CLOSE. Wire the sighting as a cue
   (egg_horizon_seen, I3 novelty) with context.
2. Sail: completing start_ship lets the player depart to a neighbour island. Emit travel_far vs
   travel_near on arrival, chosen by Euclidean distance via archipelago.ts nearestSlot (NOT index
   arithmetic). Add at least one NOVEL-EMPTY island within sail range as the openness-vs-warmth
   probe (Part VIII.2).
3. Stage-3 first contact: first-words dialogue with the stranger, per-actor logging (from P3) so
   both D5 self-disclosure / G1 initiation / C1 latency and the recipient's K1 are captured.
   Prefer a live neighbour when present, NPC otherwise (Part VIII.12).
4. Compute crossing_latency server-side over the stage field (Part VIII.11) and forward it.

Respect Law 2 throughout: never force the crossing; never building the raft (K4) is a first-class
cue, not a dead end.

ACCEPTANCE GATE:
  - Sailing to an empty-novel vs peopled island emits travel_far vs travel_near correctly.
  - First contact logs per-actor D5/G1/C1 from both vantages.
  - The horizon figure renders sharp+anonymous at HORIZON and names only at CLOSE.
  - Zero-key path works (NPC stranger when no live neighbour).

Commit "ECHO P4: sighting + sail + first contact (Stages 2-3)", then STOP and report.
```

---

## §P5 — ★ THE ONE-TIME W RE-ANCHOR (make openness measurable)

```
Implement Phase P5 — the SCHEDULED, ONE-TIME W re-anchor from docs/known-gaps.md (the ★ milestone)
and Part II.4 / Part IV.4 of the blueprint. This is done ONCE, now that the full multi-flow cue set
(F0 exploration from P3 + F2/F3 dialogue + travel from P4) exists. Do NOT do it piecemeal.

Preconditions (verify first, abort if unmet): P3 and P4 are merged and emitting real cues
(passive_locomotion, travel_far/near, enter_unmarked, asks_question, self_disclosure,
deviate_custom). Gather a real behavioral corpus from playthroughs (or the walkthrough scripts if
real data is thin) covering F0+F2+F3.

Deliver:
1. Re-run services/ml/scripts/train_measurement.py with anchor_alignment on the FULL multi-flow cue
   set, producing a new services/ml/echo_ml/artifacts/measurement.npz. Seeded + idempotent.
2. Add/extend a BRS metric script services/ml/scripts/brs_eval.py: held-out next-choice
   reproduction scored PER CONTEXT BUCKET (Part II.3). This becomes the north-star fidelity number.

ACCEPTANCE GATE (this is the known-gaps ★ acceptance, verbatim — all must hold):
  - The flagged cues (enter_unmarked, egg_horizon_seen, approach_distant_lone, travel_far,
    asks_question, self_disclosure, deviate_custom) now load PREDOMINANTLY onto openness in their
    walkthroughs (flow0_walkthrough.py, flow2_dialogue_walkthrough.py, flow3_clearing_walkthrough.py,
    stand_travel_walkthrough.py).
  - The numerics regression gate stays green.
  - services/ml/scripts/individuation_eval.py still passes.
  - Condition number of Wᵀ R⁻¹ W improves on the openness direction (no near-zero eigenvalue).

Commit "ECHO P5: one-time W re-anchor on full multi-flow cue set -> gap #1,#3 (openness measurable)",
then STOP and report the before/after axis loadings and BRS baseline.
```

---

## §P6 — GRADUATION + HANDOVER (the product's promise)

```
Implement Phase P6 (Part V.6/V.7/V.8, Part VI.D, ux-audit B1/M4/M5). Goal: the echo earns autonomy
in a bucket, the person is offered an explicit handover, the echo self-initiates and acts, every
act is explained and vetoable, and the honest return hook lands.

Deliver:
1. Graduation moment (M4): when a bucket crosses to `auto` (agreement>=alpha*, volume>=n*,
   ECE<=e*, via autonomy.py hysteresis), fire a calm, earned in-world moment ("your echo can carry
   this on its own now"). This is the on-ramp to the handover.
2. Handover server half (B1): in apps/realtime/src/WorldRoom.ts, let the agent SELF-INITIATE an
   interaction in `auto` buckets, calling /agent/turn, and broadcast turns with speaker:"agent".
   The InteractTurnPayload speaker:"agent"/rationale fields already exist in protocol.ts — reuse
   them; do not invent a new channel.
3. Handover client half (B1) in WorldClient.tsx: an explicit, revocable OFFER (never forced); the
   person watches the echo approach NPCs and converse, each utterance showing its "why it said
   that" rationale trace; an always-present "that wasn't me" veto -> sendFeedback(agreed:false) ->
   demotes the bucket AND feeds the highest-value reward pair (Part II.6).
4. Return hook (M5) in OutcomesPanel.tsx / lib/connections.ts: after an autonomous run, surface
   "while your echo wandered, it met N people — here's who's worth meeting yourself", tagging
   autonomously-met people. Only ever reports REAL autonomous activity.
5. Feed the veto into services/ml/echo_ml/reward.py preference pairs.

ACCEPTANCE GATE:
  - A bucket reaching `auto` fires the graduation moment.
  - The echo self-initiates a crossing/conversation; every autonomous turn shows a rationale.
  - The veto demotes the bucket and creates a reward pair; observed veto rate < ~15% in playtest.
  - Handover is always revocable; human stays sovereign.
  - Zero-key path: mock policy still drives a visible (mock) handover.

Commit "ECHO P6: graduation moment + agent self-initiation + veto + return hook -> fixes B1,M4,M5",
then STOP and report.
```

---

## §P7 — THE TOWN & BEYOND (Stages 4–7, the rich ecology)

```
Implement Phase P7 (stage-map Stages 4-7, Part I.3, event-schema §3 Stage-4 table). Goal: the
peopled island / town, where the CONDITIONAL signature (same act under varying status/audience/
privacy) finally becomes measurable. Build incrementally; each sub-piece leaves the app runnable.

Deliver (in this order, committing each):
1. Stage 4 town affordances: tavern with low-status servers (courteous_to_server G11, tips F10),
   a visible cuttable queue (H1), a market (bargain F9, generosity F7, fair division H3, property
   H5), a plaza with an unenforced norm (H4) and counter-normative dissent under audience (D12).
   Every social row is PER-ACTOR (Rule 3) and carries counterpart_status / audience_size /
   public_or_private.
2. Wire the BALD situation-director (services/ml/echo_ml/bald.py -> stage-map §11): extend the
   candidate set from NPCs to (affordance, context) pairs incl. scarcity_level, audience_size,
   public_or_private; RAISE SALIENCE of the max-MI candidate, never coerce; add a per-session
   intervention cap that decays as Sigma tightens (Part II.5 / IV.5).
3. Stage 5 five-door vocation (library/harbor/workshop/forum/wilds) as a five-way time-share.
4. Stage 6 repeated games (tie persistence G7, iterated reciprocity G12, promise-keeping H6).
5. Stage 7 private moral probes (H2 honesty unobserved, H9 help at a cost, H8 sacred-value), each
   the private twin of a Stage-4 public norm. Persist and expose the PUBLIC-MINUS-PRIVATE delta
   (self-monitoring) as a first-class read in the mirror (Part VIII.9).

ACCEPTANCE GATE:
  - Same act under varying context produces measurable warmth/formality SLOPES (G2 x G3).
  - The public-minus-private delta is computed and stored.
  - BALD raises salience without ever forcing; refusal on a surfaced affordance is logged as a
    K-cue, never penalized.
  - individuation_eval + numerics gate stay green; BRS trends up.

Commit each sub-piece "ECHO P7.x: <piece>", then STOP after each and report.
```

---

## §V — FINAL VERIFICATION PASS (paste after P7)

```
Run the full verification from Part IX of docs/ECHO_PLAYABLE_BLUEPRINT.md as an adversarial audit.
Prefer to run this as a SEPARATE reviewer pass (fresh context) that only reads diffs and tests.

Check and report a pass/fail table:
  IX.1 Invariants:
    - grep the whole client for xp|score|level|streak|badge|points in user-facing copy: expect 0.
    - every affordance has a K-twin and refusing never blocks/penalizes.
    - telemetry OFF => world fully playable, emits nothing.
    - DELETE /user/{uid} hard-deletes ALL new state (island state, tie warmth, funnel markers).
    - clean checkout, no keys => P1..P7 run end-to-end.
  IX.3 Measurement validity:
    - individuation_eval.py passes.
    - brs_eval.py: BRS rises and plateaus over days, scored per context bucket.
    - openness identifiability: no near-zero eigenvalue on the openness direction post-P5.
    - gate.py: ECE < e* before any promotion; no autonomy on miscalibrated confidence.

For anything failing, open a fix task, patch, and re-run — do not mark done on partial passes.
Finish with a one-page report: what a first-time player now experiences day 1 -> handover, and the
current BRS.
```

---

## Notes for you (the human, not for Claude Code)

- **Run phases in order and one at a time.** P5 depends on P3+P4 existing (real openness cues must
  flow before the W re-anchor, or it recalibrates on nothing). P6 depends on P2 (graduation
  progress UI) + P4 (something to hand over).
- **After each phase**, actually run `npm run dev:web` + `dev:realtime` and look at it before
  pasting the next prompt — the whole point is that each phase is independently visible/runnable.
- **If Claude Code reports a path mismatch in §0**, let it adapt the later prompts to the real
  paths rather than forcing the blueprint's assumed names.
- **The first "wow, it's a game now" moment is after P1**; the **full product promise lands after
  P6**. P7 is depth you can keep extending indefinitely.
```
