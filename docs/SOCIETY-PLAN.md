# ECHO — Society Plan: from an empty planet to a peopled, generational, shared world

> **Status:** canonical for the direction decided 2026-09-07. It **supersedes** `docs/BUILD-PLAN.md`
> §7 (Phase 2 "Seas: instanced islands"), whose premise was one instanced world per player. The
> world is now ONE SHARED WORLD. Everything else in BUILD-PLAN.md — its thesis, its cross-cutting
> concerns (§3 the featurization spine, §4.1 validation harness, §4.4 privacy, §4.5 key-free
> invariant) — is inherited unchanged and is not restated here.
>
> This plan is written against the repo at commit `2999d59` (= `main`). Every factual claim carries
> a `file:line`. Where a number is quoted from a document rather than reproduced, it says so.

**Status legend** (BUILD-PLAN.md:11): ☐ not started · ◑ in progress · ✅ done · ⛔ gated on a decision

---

### Where this stands — 2026-09-09

**Decisions taken and recorded** as `C24`–`C38` in `docs/DECISIONS.md`: the world clock, NPC land in
the substrate, read-only mortality, the planet frame and the parcel as the shared unit (which also
answers C11), the measured whole frame, the pre-registered re-anchor, the `consistency` zero column,
trade access, and the planet's own census (`C24`–`C33`); then the ML store snapshotted rather than
replayed (`C34`), the retention window (`C35`), the frame attributed per layer (`C36`), the detail
radius refuted as the lever (`C37`), and the missing LOD built and priced in draw calls (`C38`).

**Done.** SOC-0.A · SOC-0.B (and C11) · SOC-0.C *(seven passages, not four)* · SOC-0.D *(option 3
taken, plus a finding worse than the thirteen it covers)* · SOC-0.E *(the register merged and a gate
that fails on a dangling ⚑)* · SOC-1.A *(machine and per-layer; only the phone is owed)* · SOC-1.B
*(not the item it was written as — §3 item 7)* · SOC-1.C *(89.43 MiB → 7.81 MiB)* · SOC-1.D *(the
stated cause refuted; the real one was the test runner)* · SOC-1.E *(the promise is true, pinned in a
browser)* · SOC-2.B *(the collision, not the foreign key)* · SOC-2.C *(a ledger, verified against a
real Postgres)* · SOC-2.D *(the durable half; `shared` deliberately not taken)* · SOC-2.F *(the class
that exists is carried)* · SOC-2.G *(taken as C35)* · SOC-2.H *(eight holes, not one, and the
registry suite now actually runs)* · SOC-2.E *(five surfaces, not three — `C39`)* · SOC-6.A ·
SOC-6.B · SOC-6.G.

**Nine things found while doing it, each worse than the plan assumed.**
1. `C28`/`C31` — the shipped frame is **907,250 triangles against a 600,000 ceiling**, the ORDINARY
   parcel is the expensive route, and **a body costs 46 draw calls of WHOLE frame, not 46 of main**.
   SOC-4 is not blocked *by* SOC-1.A; it is blocked by what SOC-1.A found.
2. **§3 item 7** — SOC-1.B in this very document was wrong in all three of its claims and its remedy
   was a bug. The document about wrong records had one.
3. `C30`/`⚑23` — **`consistency` is an exact zero column in `W`**, and the Ring of Gyges routes to
   nothing else. The blueprint's flagship moral probe moves the posterior by exactly zero.
4. SOC-6.G — **the never-renumber rule was already breached in shipped code**, before any society
   cue: three actions squatting on two other cues' IDs, and two more shipped with no catalogue row.
5. SOC-2.H — **eight gate holes, not one**, including a `typecheck` that is red on a clean checkout
   and a registry suite that is red *behind* its skip.
6. SOC-2.B — the claim route keyed on the typed NAME, so **two people who both typed "Sam" were one
   owner** on a page promising "exactly one owner, permanently". `parcels` had carried an unwritten
   `display_name` column since 0009: the schema had the split and the code had collapsed it.
7. SOC-1.D — **fixed twice**, because the first fix's constant was measured on the pre-merge tree and
   carried forward without re-measuring. Three workers is 6 failed in 27.8 m; one is 21 passed in
   1.1. The §3 error, committed inside the change that closed §3's own workstream.
8. `C36`–`C38` — **the frame budget is not a triangle problem.** SOC-1.A set out to find triangles
   and found that `detailLayer` was 68% of the worst frame for want of a MIDDLE LOD — which C37
   named after refuting the radius, and C38 built and shipped at −48% of that layer. But the constraint that decided the design was **draw
   calls**: C16's ceiling is 600,000 triangles *and* 120 calls, the demo parcel measures 119 of 120,
   and a mid mesh costs one unavoidable call per class. So the triangle lever that exists can only be
   pulled for the classes the CALL budget can pay for — one of them — and SOC-4's bodies, which cost
   46 calls each, are competing for the same single call of headroom. §3 item 9 is the error I
   committed inside this work, and it is **§3 item 8's** species: a check that could not have failed.
9. `C39`/`⚑27` — **SOC-2.E was five surfaces, not three, and two of them were a public credential.**
   The item names the persona read, the id minting and the room join. It does not name
   `GET /api/telemetry/recent?uid=`, which returns a person's RAW behavioural rows, or
   `POST /api/account/delete {userId}`, which HARD-DELETES their posterior and eight tables — both on
   a bare string. And the string was published: `/api/planet/status` served up to 1,500 of them and
   `refId` was a SYNCED Colyseus field, so standing near someone in the shared world handed you the
   credential for erasing them. **Two correct changes composed into it:** SOC-2.B made `ownerId` the
   canonical key to fix the "Sam" collision, and the globe had been publishing that field since it
   was a first name. Neither half was wrong alone.

**Open and unchanged:** SOC-0.F, SOC-2.A, SOC-3, SOC-4, SOC-5, SOC-6.C–F/H/I, SOC-7.

**The two ordering deadlines the plan names have both been met.** `feat/f4-trust` was merged before
a society cue touched `ingest.py` (SOC-0.G), and `session_mode` reaches the store before a society
event reaches a posterior (SOC-2.F, L7) — rows written in the interim could never have been
reclassified by anyone.

**Both of the things owed to a person were answered, 2026-09-08.** The density is `SETTLEMENT_RATE`
0.3 — 26,602 settlements and a 41-minute walk between them (`C33`) — and `feat/f4-trust` is merged
rather than retired (SOC-0.G).

**Gates, measured 2026-09-09:** `check:register` ✅ *(1,196 lines, 27 entries, every ⚑ resolves)* ·
`build:shared` + `typecheck` ✅ (4 workspaces, and in that order — SOC-2.H hole 6) · `@echo/planet`
160/164 with 4 skipped, 0 failed *(the 4 need `PLANET_TEST_DATABASE_URL`; **164/164 against a real
Postgres migrated by `db:migrate:apply`** was measured 2026-09-08 and is not re-measured here, so it
carries that date)* · `@echo/shared` 31/31 · `@echo/web` **256/256** · `@echo/realtime` copresence ✅ ·
`services/ml` **186/186** · e2e **27 passed of 37**, at `workers: 1` — see SOC-1.D, where that
constant was wrong the first time and is now measured on this tree. **Red, all ten pre-existing:**
`scatterSplit` ×2 (the `C28` overage), `scatterImpostor` ×4, `globePick` ×2, `slice` ×1, `spawnSea` ×1
— quarantined by reason, never by retuning a threshold, and **re-verified pre-existing on 2026-09-09**
by reverting `detailLayer.ts` and `scatterDetail.ts` to the pre-`C38` commit and re-running: the same
five tests fail in the three specs checked, so the mid band caused none of them. *(A bare `npm run
e2e` runs all 37; `E2E_QUARANTINE=skip` is what reports 21/21, and the two counts describe the same
tree.)*

---

## §0. How to read this document

### 0.1 The direction being planned

Stated by the user, 2026-09-07, in four parts:

1. Populate the planet with generative-agent NPCs — farming, an economy, ordinary working people,
   developed regions and undeveloped ones, serious places and relaxed ones, "whatever it is in the
   real world". Every NPC has its own life, a real family, knows the others, and all of them differ.
2. **ONE SHARED WORLD**, not one per player.
3. **Players interact with each other**, not only with NPCs.
4. **NPCs age, die and have children.** Generational.

### 0.2 Phase codes — this repo already has seven numbering schemes

They collide, and a new one must not. Read this table before naming anything.

| Scheme | Range | Means | Lives in |
| --- | --- | --- | --- |
| `Phase 0–4` | 0–4 | business/validation phases, workstreams `0.A`–`4.C` | `docs/BUILD-PLAN.md:228,323,409,481,528` |
| `P1–P7` | P1–P7 | the executable ML build order, all run to completion | `docs/ECHO_PLAYABLE_BLUEPRINT.md:1172` |
| `Step 1–6` | 1–6 | the 7-flow/social build steps (commit messages + code headers) | e.g. `app/town/page.tsx:3` |
| `build order step 1–11` | 1–11 | a **second, unrelated** Step scheme, for the planet/parcel | `app/parcel/[cell]/page.tsx:2` |
| `W1–W6` / `Wn-m`, tasks `A1–A28`, `C0` | — | the landing-world rebuild | `game/world/terrainChunks.ts:2`, `walkLayer.ts:2` |
| `C1–C23` | C1–C23 | **decisions**, not phases | `docs/DECISIONS.md` |
| `F0–F6`, `Stage 0–7`, cue IDs `A1…K`, `⚑1–⚑20`, `WI-1–WI-6`, ux `M1–M6` | — | flows, cue ecology regions, cue catalogue, tracked debt | `docs/world-design/*` |

**This document uses `SOC-0` … `SOC-7`, with workstreams `SOC-3.B`.** The prefix is deliberately
three letters and greppable, because every single-letter namespace is taken — `S` would be read as
`Stage`, `G` is a cue channel, `W` is a landing-rebuild workstream, `A` and `C` are both a task code
and a cue channel and a decision number.

### 0.3 What "detailed" means here, and what it does not

Every workstream below states what it changes, what proves it done, and what it is blocked by. It
does **not** state a date. Sizes are orders of magnitude — hours / days / weeks / months — and they
are deliberately unflattering. Three of the eight phases are months of work and say so.

Nothing in this document may be marked ✅ by an agent on the strength of tests passing. The house
already learned this: `⚑11` records that the island did not render at all for three weeks while
every gate stayed green, because the harness reads events off the network and never the framebuffer
(`docs/known-gaps.md`), and `docs/verify-3d-render.md` says in as many words that nothing in it may
be marked done by an agent.

---

## §1. The honest headline

**Most of the machinery this direction needs already exists — in the other world.**

This repo contains two worlds:

- **The old `/play` stack** — `apps/web/src/components/WorldClient.tsx` → `game/net.ts` →
  `apps/realtime` — has a shared authoritative Colyseus room, server-integrated movement,
  distance-gated **player-to-player** interaction with chat and per-actor measurement, ~109 NPC
  entities, NPC dialogue brokered to Anthropic, and a social-cue catalogue of ~50 actions already
  reachable over the wire.
- **The new planet/parcel stack** — `apps/web/src/game/world/*`, route `/parcel/[cell]` — has all
  the rendering, the H3 land registry, the measurement chain and the consent story, and **zero
  networking**: no remote entities, no NPCs, no dialogue. `buildCharacter` is called exactly once,
  at `playerLayer.ts:157`.

So the work is **convergence plus a substrate**, not greenfield. But two things must be said as
plainly as the good news:

1. **The existing NPCs are not people.** `generateSpanningSet(100)` chooses a *designed stimulus
   set* to cover persona space — `packages/shared/src/npcgen.ts:2-4` says so outright: "NOT flavor —
   they are a designed stimulus set". An `NpcSpec` is 8 fields; the `npcs` table is 9 columns; the
   synced `Entity` is 16 fields (`apps/realtime/src/state.ts:7-38`). **Not one of them expresses
   age, birth, death, parents, children, spouse, occupation, employer, dwelling, schedule, needs or
   memory of another agent.** The `homeX`/`homeY` fields that do exist are dead: `spawnNpcs`
   (`WorldRoom.ts:1022-1046`) never reads them and places NPC *i* by golden angle, with an in-line
   comment that the seed coordinates "were for the 64-tile map = now open sea".
2. **The two worlds' frames are not reconcilable by a transform.** `WorldRoom.integrate`'s land gate
   is `oceanLandAt` over 100 phyllotaxis discs (`WorldRoom.ts:885`); the parcel's gate is H3 region
   membership plus the terrain field. One parcel at `k=1` is a 2,084 m radius disc
   (`packages/planet/lib/parcel.ts:20-22`) ≈ 2,600 tiles across at `TILE_M` 1.6; the **entire**
   shared room is 768 tiles ≈ 1,229 m. **One parcel is physically larger than the whole existing
   multiplayer world**, and there are up to 1,074,942 of them (`PUBLISHED_CAPACITY`,
   `packages/planet/lib/manifest.ts:98`). `WorldRoom` would refuse essentially every step a parcel
   player takes.

---

## §2. Current state — reuse vs build

In the shape of BUILD-PLAN.md §2, corrected: that table still names `PixiWorld.ts`, which no longer
exists. So does `docs/MULTIPLAYER.md:19`.

| Area | Path | State we inherit |
| --- | --- | --- |
| Shared authority | `apps/realtime/src/WorldRoom.ts` | 20 Hz tick (`TICK_MS` 50), per-entity integrate, per-axis slide, `maxClients` 150. **Reuse the loop; its geography is the old archipelago.** |
| Entity sync | `apps/realtime/src/state.ts:7-38` | 16 synced fields; a user and an NPC are the same class split by `kind`. **Reuse; it carries no life-model field.** |
| Player↔player | `WorldRoom.ts:444-743` | Strict **1:1 lock**: open by proximity ≤ 2.0 tiles, chat relayed with a 600 ms rate limit, closed by walk-apart (3.5 tiles), 120 s idle, disconnect or explicit end. Emits `proxemics_close/far`, `dialogue_turn`, `receives_turn`, and the refusal twin `declines_to_engage`. **Reuse the dyad; groups are a new primitive.** |
| Social cues | `packages/shared/src/social.ts` | ~50 actions wire-reachable; the UI exposes 13. **Reuse; adding a social act is a UI + table change, not a protocol change.** |
| NPC roster | `apps/realtime/src/npcs.ts` | Supabase `npcs` → `db/seed/npcs.generated.json` → `generateSpanningSet(100)`. **Reuse as a probe set — see SOC-6.F.** |
| NPC dialogue | `apps/realtime/src/dialogue.ts` | ML `/npc/turn` → Anthropic → deterministic mock. **Stateless: no memory, no history cap on the NPC branch.** |
| NPC behaviour | `WorldRoom.ts:911-966` | A hash-seeded two-state wander at 20 Hz. **This is the entirety of it.** |
| Measurement engine | `services/ml/echo_ml/*` | Full-covariance Bayesian persona, learned `W`, BALD director, calibrated autonomy gate. **The crown jewel — extend, don't replace.** |
| Measurement store | `services/ml/echo_ml/store.py` | A **process-local dict** with a per-user RLock. Every posterior resets on redeploy. **Hard ceiling under everything — SOC-2.D.** |
| Planet + registry | `packages/planet/lib/*` | H3 addressing, terrain, biome, spawn, subdivision rounds, referral-adjacency placement, a concurrency-correct Postgres registry. **Reuse; the registry is never instantiated — see §3.** |
| Parcel world | `apps/web/src/game/world/*` | Layer list in one place (`parcelWorld.ts`), measurement chain, consent, touch controls (C23). **Reuse; single-body only.** |
| Character rig | `apps/web/src/game/three/character.ts` | 24 meshes, 15,868 triangles, 6 materials, 24 fresh geometries per call, every mesh `castShadow`, nothing merged or instanced. **≈46 draw calls per body — SOC-4.A.** |
| Design already written | `docs/world-design/stage-map.md:179-305` | Stages 4–7 (Town, Paths & Vocation, Bonds, Pressure) all marked `[BUILD]`; F6 "Community & Belonging" designed. **Read before designing anything new.** |
| Situation generator | `docs/world-design/situation-templates.md:37-70` | `SituationTemplate` schema + BALD generalised from NPC-selection to situation-selection. **This is the designed shape of "a world that generates situations". Reuse it.** |
| F4 trust (repeated games) | branch `feat/f4-trust` | Reciprocity, promise-keeping across sessions, conflict/repair, non-reciprocal generosity — the nearest existing "NPCs who remember you". **UNMERGED. See SOC-0.G.** |

---

## §3. Corrections this plan makes to the record

A roadmap that cites a wrong record inherits the error. **Nine are listed here — four record
errors, two live defects, and three this document produced itself.** Item 7 was found by the
ground-truth pass that CORRECTED the first four, in this document's own SOC-1.B; item 8 was CREATED
by this document's own SOC-0.E and found by its SOC-2.C; item 9 was created and committed by SOC-1's
own frame work and found by an adversarial review of it.

**Items 1–4 (SOC-0.C), 6 (SOC-1.E), 7, 8 and 9 are ✅ done. Item 5 is ◑ — SOC-2.B removed the
name-as-key collision, and the foreign key is still owed to SOC-2.E.**

*That two of the eight are this plan's own is not an embarrassment to be tidied away; it is the
measurement. A document that corrects records and produces none of its own has not been read
closely enough.*

1. **`DECISIONS.md` C23 and `game/world/touchInput.ts` both state "MOVER.ACCEL is 28 tiles/s² and
   the walk-to-run gap is 2.4 tiles/s, so the mover crosses it in 86 ms".** Wrong for the route
   described. `MOVER` is the LEGACY profile (`controller.ts:58-92`); the parcel installs
   `parcelMovement(tileM)` (`playerLayer.ts:105,135`) and passes it to `stepMover` (`:180`).
   `parcelMovement(1.6)` = walk 1.031, run 2.625, accel 4.375 tiles/s². **The real ramp is
   (2.625 − 1.031) / 4.375 = 364 ms**, 4.25× the recorded number. The conclusion (run hysteresis is
   necessary) survives and is in fact stronger; the derivation must be rewritten, not patched.
2. **The same paragraphs justify a non-analog stick with "MOVER.WALK is frozen for parity with
   WorldRoom.integrate".** That parity is *already broken* on the parcel route by `parcelMovement`.
   The real reason a stick cannot be analog is that `stepMover` normalises the input direction and
   takes its speed from the boolean `run` — which is still true and is the sentence that should be
   there.
3. **`docs/world-design/living-world-rendering.md`: "the locomotion measurement sampler retains its
   legacy speed normalization".** The mechanism does not exist. The parcel's `LocomotionSampler`
   (`game/telemetry.ts:89-190`) has no speed normalisation of any kind; its six scalars are
   `heading_change_rate`, `path_tortuosity`, `novel_tile_ratio`, `backtrack_rate`, `dwell_ms`,
   `tiles`. The only speed normalisation in the repo is `WorldCore.ts:917` on the OLD stack, and
   `services/ml/echo_ml/ingest.py:169` says `speed_var` "stays UNMAPPED here on purpose". **The
   doc's conclusion stands, its stated reason does not** — the real coupling is that
   `novel_tile_ratio`'s denominator is distinct tiles per 1.5 s window and is therefore
   speed-dependent, and it carries one of openness's largest learned loadings.
4. **`packages/shared/src/world.ts:37` defends the frozen constants with "every locomotion scalar W
   was anchored on (speedVar over MOVE_SPEED, …)".** `speedVar` is anchored on nothing; it is
   unrouted. This matters because `TILE_M` and `MOVE_SPEED` are defended by an argument that is half
   false, which makes the *real* constraint (`novel_tile_ratio`) look weaker than it is.

**And two live defects, found in the same pass — item 5 here and item 6 below:**

5. **The parcel registry is in memory and ownership is by typed name.**
   `apps/web/src/lib/planet.ts:99` hardcodes `backend: "memory"` and `:103` always constructs
   `MemoryRegistry`, with the comment at `:89` saying the page runs on it "until DATABASE_URL is
   configured and the seed script has been run against it". `app/api/planet/claim/route.ts:23` passes the trimmed typed
   display **name** as the owner id. `db/migrations/0009_planet_registry.sql:61` declares
   `parcels.owner_id` as plain `text not null` with no FK. **Today: two people typing the same name
   are one owner, every claim lives in one serverless instance's memory, and the "one owner,
   permanently" promise on the claim page is backed by nothing.**

6. **`ConsentCard` promises "you can stop it at any time from the inspector". There is no production
   caller of `chain.revoke()`.** C23 fixed the phone-shaped half of that sentence (the panel could
   not be opened without a backtick); the other half is still false. **SOC-1.E.**

**And an eighth, created BY this plan's own SOC-0.E and found by its SOC-2.C:**

8. **⚑22 on this branch pointed "Migration 0009" at the wrong file.** ✅ *corrected.* SOC-0.E merged
   ⚑22's prose off `feat/measurement-corpus`, where 0009 is `0009_measurement_corpus.sql` — and on
   this branch 0009 is `0009_planet_registry.sql`, a table of land parcels with **no personal data
   and no retention question at all.** So a reader on the only branch anyone reads followed a
   retention warning to a parcel registry. **The merge was verified byte-identical to its source and
   that is exactly what made it wrong**: a reference that was true in its old home was imported
   unchanged into one where it is false. Byte-identical is the right check for *whether the text
   survived* and no check at all for *whether it still means what it said.*

**And a seventh, found by the pass that fixed the first four — in THIS DOCUMENT:**

7. **SOC-1.B below was wrong in all three of its claims, and its remedy was a bug.** ✅ *corrected.*
   `63,700` is the ALLOCATION CEILING — 49 patches × 1300 slots — not a census: `mesh.count` starts
   at zero and only accepted blades raise it, and a patch outside the green biome set draws none.
   "Provably invisible **on every route measured**" is true of nothing; the meadow has never appeared
   in a measured frame, which C23 concedes two paragraphs above the sentence that claims it, and
   42.30% is a GEOMETRIC ratio, π·24² over 56², the overhead of covering a disc with a square grid.
   And "pull the ring radius to the fade distance" cannot be done, because **the ring radius already
   IS the fade distance exactly**: `RADIUS 3 × SIZE 8 = 24 m` against a `smoothstep(17., 24., …)`
   far stop. Following the instruction — RADIUS 3 → 2 — opens an 8 m annulus of missing grass whose
   inner metre is before the smoothstep has opened, at full opacity, sweeping the ground as the
   player walks.
   *This is the lesson §3 exists to teach, arriving inside the document that teaches it:* a number
   quoted from a reading ("42% invisible") became a claim about a measurement ("on every route
   measured") and then a remedy, and none of the three steps was checked against the file.

9. **I refuted a real defect with an instrument that could not have seen it, and committed the
   refutation.** ✅ *corrected.* Building the mid-band form for C38, the first hypothesis was that
   coarsening a primitive SHRINKS it. I checked with bounding boxes, got ratios of 0.93–1.00, and
   wrote into both a test comment and a commit message that "the envelope is intact and the
   difference is rim, not size."
   **A bounding box cannot see a coarsening.** three puts a primitive's vertices ON the
   circumscribing radius and cuts the chord between them, so the extreme points that set the box are
   exactly the ones a coarsening preserves; the instrument was guaranteed to return 1.00 whether the
   hypothesis was true or false. Measured by covered silhouette area instead, the mid form loses up
   to 22%, one-sided, on every class — the shrink was real.
   *This is item 8's species, not item 7's.* Item 8 verified that text had survived a merge rather
   than that it still meant what it said; this verified that a number came back unchanged from a
   measurement that could not have changed. **A check that cannot fail is not evidence**, and both
   times the failure was invisible because the check passed. It was found by pointing four
   adversarial reviewers at the design before it shipped, which is the only reason it is item 9 of
   this list rather than a wrong sentence in `DECISIONS`.

---

## §4. Cross-cutting laws (apply in every phase)

These are inherited or newly stated. Violating one is a defect, not a trade-off.

**L1 — Seed is the prior, the database is the delta.** An NPC nobody has ever met has **zero rows**.
The house idiom already exists: migration 0004's "empty cells are simply absent rows", and 0009's
terminal-cell rule that avoided 140 million ocean rows. Without this, a peopled planet is 1.4 M+
rows of people nobody will ever meet.

**L2 — Everything demographic is a function of `(seed, time)`, never of `(seed, visit history)`.**
If any roll happens "when a player first arrives", two players arriving in a different order see
different villages and the shared world silently forks. `packages/planet` already has this
discipline; the render layers do not, so a closed-form society inherits the discipline of one half
of the codebase and none of the other.

**L3 — Free text never changes world state.** Conversation writes only the speaking player's
private relationship record. World-changing acts go through a narrow, structured, server-validated
channel. This is what makes a shared LLM world tractable at all: it removes contradictory mutation,
cross-player planting, and most of the moderation surface at once.

**L4 — Shared = the world's facts. Private = what an NPC thinks of *you*.** Everyone meets the same
baker with the same family and the same bread price; the baker's regard for you is yours. Where two
players observe the same NPC simultaneously, its *observable* behaviour (position, schedule, mood)
is the shared one.

**L5 — One list, one place.** `parcelWorld.ts:1-10` states the rule and the bug that taught it. A
society layer will be composed in exactly one factory, the way the parcel's layers are.

**L6 — A number is measured or it is not a number.** DECISIONS' own standard: "a recorded
measurement nobody can reproduce is worse than no measurement: it is spent as evidence." This plan
inherits it, and §3 is what happens when it lapses.

**L7 — Provenance before ingestion.** Once a row of one evidentiary class is ingested it is
indistinguishable from another forever (`⚑10`). In a shared world the classes multiply:
NPC-witnessed vs player-witnessed, server-stamped vs client-asserted, solo vs observed.

**L8 — No score, no XP, no levels, no points.** Blueprint Design Law 1, with a grep-able CI
invariant. The economy in SOC-7 needs an explicit exemption or a different shape; it does not get to
quietly reintroduce a ladder.

---

## SOC-0 — The decisions and the record ◑ · *A, B, C, E, G done; D half — the decision taken, the labels not; F open*

**Nothing below this phase may start.** No code. Every item is hours of writing and potentially
weeks of thinking, and every one of them is impossible to reverse once data exists.

> **TAKEN 2026-09-07.** SOC-0.A and SOC-0.B are answered and recorded as `C24`–`C27` in
> `docs/DECISIONS.md`; SOC-0.C is done. The answers are summarised inline below, but DECISIONS is
> the record and this is the plan — where they differ, DECISIONS is right.

### SOC-0.A — The three irreversible decisions the user owes ✅ · *taken, recorded as C24, C25, C26*

Each becomes a new `C`-entry in `docs/DECISIONS.md`, written in that file's voice, with the
consequence spelled out.

**(a) The world clock's compression ratio, and a single shared epoch.**
There is no world clock. `game/world/skyLayer.ts:93` has `DEFAULT_CYCLE_S = 12*60`, `:478-479`
accumulates `dt` from dusk **per mount**, and `parcelWorld.ts` pins `timeOfDay 0.38` on every mount —
so two players standing in the same place today see different hours. `WorldManifest` carries
`createdAt` and nothing else time-shaped.
*The decision must state:* real-seconds per world-year, the epoch every mount derives its hour from,
and — stated in wall-clock hours — how long one NPC lifetime lasts.
*Why irreversible:* once a birth or death timestamp is in a row, changing the ratio rewrites every
lifespan, and any NPC a player has met becomes a different person.
**✅ ANSWERED — C24.** The twelve-minute day is kept and moved into `@echo/planet` as `WORLD_DAY_S`,
so a world-year is 262,800 real seconds = **73 real hours exactly**, and a 70-year life is 5,110 real
hours ≈ **seven real months**. The epoch is `WORLD_EPOCH`, a fixed constant of the world written into
`world_manifest.created_at` rather than defaulted to `now()`. The hour is DERIVED per frame, never
accumulated; `skyLayer` takes a `clock` and `parcelWorld`'s pinned `timeOfDay: 0.38` is gone.
*What it costs, stated:* mortality is invisible inside one session and one month, which promotes
**SOC-6.H from a want to a requirement**.

**(b) Whether NPCs hold land in the parcel registry.**
`parcels.owner_id` is `text not null` with no FK (`0009_planet_registry.sql:61`), and
`PUBLISHED_CAPACITY` = 1,074,942 is a measured constant (`manifest.ts:98`).
*The decision must state:* whether an NPC settlement is a `parcels` row drawing from the same finite
inventory players buy, or a separate table keyed on `h3_index` — and what the published capacity
number means under the answer.
*Recommendation on record:* NPCs hold land in the **substrate**, not the registry. A player who buys
a parcel buys the ground and finds people already living on it. This makes the ownership story
stronger, and it immediately raises the question the product must answer anyway: can you evict them?
**✅ ANSWERED — C25, the substrate.** `parcels.owner_id` never holds an NPC, `PUBLISHED_CAPACITY`
keeps exactly its current meaning, and a settlement has ZERO ROWS until a player touches something in
it. The eviction question is now open and owed (SOC-0.F).

**(c) Whether a player can cause a death.**
*Why this is the storage model:* if lifespan is drawn from the seed at birth, "is this person alive
at time N" is `birth + lifespan > N` — a pure function, and the entire lineage of the planet is
computable at any instant without ever having been simulated. The moment a player can save or end a
life, that person leaves the closed form **and so does every descendant**, cascading into stored
state.
*Recommendation on record:* the demographic layer is **read-only to players**. Relationships,
reputation, wealth and what someone does today are all mutable; who is born and who dies is not. If
player causation is wanted, it must be a very narrow, explicit, structured channel — never a general
capability.
**✅ ANSWERED — C26, read-only.** `alive(p, day) = p.birthDay + p.lifespanDays > day` is the entire
mortality model and it is arithmetic. It also answers half of §6 question 10: erasing a player never
has to delete a person, because the lineage was never theirs to hold.

### SOC-0.B — Which frame the shared world uses ✅ · *taken, recorded as C27*

**✅ ANSWERED — C27: the PLANET frame, and the shared unit is ONE PARCEL.** The room key is the
parcel's H3 index; rooms exist on demand, which is L1 applied to processes instead of rows.
`ROOM_CAPACITY` 150 was never the binding constraint on a 2,084 m disc — one room per parcel is.
This also answers **C11 in the direction of KEEP**: `/play`, `ThreeWorld` and `/flow1` stay alive,
frozen, as the individuation fixture, receiving no features. What it retires is the archipelago
geometry, and `travel_far`/`travel_near` therefore lose their basis and must be re-derived against
parcel-scale distances, with the distribution measured over an identical path at both scales BEFORE
either side moves (`⚑9`). What it does NOT decide is whether a room is Colyseus at all (SOC-3.C).

The old `/play` ocean frame, or the H3 planet frame. They are not reconcilable by a transform (§1).
Seven things in `WorldRoom` key off the archipelago geometry, including the `travel_far`/`travel_near`
measurement, so whichever direction this goes, **a measurement channel loses its basis and must be
re-derived**. Record as a `C`-entry.

Also unanswered, and part of this decision: **at planet scale, what does "one shared world" mean —
a planet, a region, a parcel, or a settlement?** Nobody has written it down.

### SOC-0.C — Correct the wrong records ✅ · *done*

§3 items 1–4, **and it was SEVEN passages, not four** — the same falsehood was duplicated in places
the plan did not name, which is what a wrong record does if it is left standing long enough:

| Where | Was | Now |
| --- | --- | --- |
| `game/world/touchInput.ts` (parity block) | "MOVER.WALK is frozen for parity with WorldRoom.integrate" | the real reason: `stepMover` normalises the direction and takes its speed from the boolean `run` |
| `game/world/touchInput.ts` (hysteresis block) | "MOVER.ACCEL is 28 … 86 ms" | 2.55 / 7 = **364 ms**, scale-free in `tileM`, and it is the `runBlend` that re-triggers, not the state |
| `docs/DECISIONS.md` C23 | both of the above, plus the parity claim a third time in the closing sentence, plus the `speedVar` claim | one rewritten paragraph carrying both corrections |
| `docs/world-design/living-world-rendering.md` | "retains its legacy speed normalization" | there is none to retain; the coupling is `novel_tile_ratio`'s 1.5 s window |
| `packages/shared/src/world.ts` | "every locomotion scalar W was anchored on (speedVar over MOVE_SPEED …)" | `speedVar` is routed nowhere; the real constraint is stated and measured |
| `game/world/controller.ts` `MOVER.WALK` | "the locomotion sampler normalises speedVar by it" | the tile-count-per-window coupling |
| `game/world/controller.ts` `MOVER.RUN` | "the sampler's speedVar is normalised by MOVE_SPEED and clips at 1" | a run raises tiles/window 2.5 → 4.5, which is a mechanism that exists |

**Two tests now derive the numbers from the code**, so neither can drift again:
`tests/controller.test.mts` pins the 364 ms against `parcelMovement` across four tile scales *(and
notes that `livingWorld.test.mts` already exercised `parcelMovement` — it asserted only terminal
speeds, never accel, which is exactly the axis the record drifted on)*; `tests/locomotionQuantum.test.mts`
derives the whole `TILE_M` defence from the shipped sampler — tiles/window 2.5 / 4.5 / 6.5, the same
straight walk reading as novelty 0.625 / 0.825 / 0.417 at three tile scales, and the six-key scalar
set that contains no speed at all.

**One thing the correction deliberately does NOT say:** "the parcel does not use MOVER". `stepMover`
still reads `MOVER.STILL`, `TURN_RATE`, `TURN_THRESHOLD` and `JUMP_S`; only the four SPEED numbers
come from the profile, and the tidy version of that sentence would be a fresh wrong record.

### SOC-0.D — Take the `⚑20` decision, and name a source of `z` labels ◑ · *the decision is taken; the labels are still a research programme*

**✅ TAKEN — `C29`, option 3, and option 4 promoted to a rule.** The re-anchor stays one-time; what
changes is that `docs/world-design/reanchor-preregistration.md` now states, for every flagged cue,
which axis, which sign and at what threshold "it carries signal" would mean — at **0.15**, the
repo's own bar from `action-axis-map.md`, so the threshold cannot be accused of being chosen to fit.
Three verdicts, not two: CARRIES, DARK, and **UNDERPOWERED**, because without the third a cue nobody
emitted enough times reads as a cue that carries nothing. Several predictions carry a collinearity
clause — a feature within cosine 0.9 of one already in the model has not measured a new construct,
however well it loads.

**A count corrected on the way:** `⚑20`'s "thirteen flagged manner scalars" is thirteen
(scalar, flow) PAIRS but **eleven distinct scalars** — `circled01` and `cost_paid01` are each flagged
in both F4 and F5, and `⚑18` says so itself.

**And a finding that is worse than the thirteen: `C30` / `⚑23`.** `consistency` is an **exact zero
column** in the committed `W`, and four shipped actions set it and nothing else —
`conform_custom`, `travel_near`, `return_cache`, `keep_cache`. **`return_cache`/`keep_cache` IS the
Ring of Gyges**, the blueprint's flagship moral probe, and its designed feature moves the posterior
by exactly zero. `travel_near` makes the travel stand's far/near contrast measured on one side only.
Pinned by `services/ml/tests/test_zero_columns.py`, which reads the branch bodies out of `ingest.py`
so a fifth dark action is visible too.

**☐ Still owed, and unchanged by any of this:** a real source of `z` labels. `⚑21` measured why it
does not resolve by building more — 7 of 66 features had any variance in a 240-row corpus, and labels
taken from a user's own posterior give ‖W‖ = 0.00 by construction. C29 makes the re-anchor
*evaluable*; it does not make a corpus.

`docs/known-gaps.md` records the re-anchor of `W` as **one-time** and lists four unchosen options.
`⚑21` (unmerged) measures why it is not schedulable: 7 of 66 features had any variance in a 240-row
corpus, and labels taken from a user's own posterior give ‖W‖ = 0.00 **by construction**, because
that posterior was produced by the committed `W`.

A society is a whole new cue class — kinship, bereavement, employment, transaction, being-known,
inheritance — whose signature cues the existing corpus cannot contain. Either they consume the one
re-anchor, or they ship unrouted like the thirteen manner scalars already riding on this.

The cheapest option (option 3: a pre-registered falsifiable check per flagged cue) costs nothing and
is compatible with the others. **Take it now.** Establishing real `z` labels from outside the loop —
curated self-report, a human-rated subset, or an outcome the axes are supposed to predict — is a
research programme and does not resolve by building more.

### SOC-0.E — Merge `⚑17`, `⚑18`, `⚑21`, `⚑22` into `known-gaps.md` on main ✅ · *done*

**Done as a pure insertion, 867 → 1,033 lines.** ⚑17/⚑18 came from `feat/f4-trust`, ⚑21/⚑22 from
`feat/measurement-corpus`; `feat/landing-world` and `feat/planet-registry` carry a byte-identical
file and contributed nothing. Verified three ways rather than eyeballed: each inserted block is
byte-identical to its source branch, deleting the two inserted ranges reproduces main's file exactly
(**no existing byte was altered**), and the ⚑ headers now run `… 16 16b 17 18 19 20 21 22`.

**And the defect is now a gate rather than a discovery.** `npm run check:register` fails on a
⚑-header out of order or a ⚑N cited in prose with no header — run against the pre-merge file it
prints exactly the original symptom, `dangling reference: ⚑18 is cited but has no header`. A
register nobody can resolve is how ⚑17, the single most relevant entry to this direction, stayed
invisible to every planner reading `main`.

The register on `main` is internally unresolvable: `⚑20` cites "`⚑18`'s eight" from a file whose
headers run `⚑16b → ⚑19 → ⚑20`. `⚑17` (NPC-partner vs human-partner construct validity) is **the
single most relevant entry to this direction** and a planner reading `main` would never see it.
Merging the docs does not require merging the code.

### SOC-0.F — Reopen C15: what does an ordinary parcel contain? ☐

`DECISIONS.md:221-229` froze human structures to `DEMO_CELL` for the reason at
`lib/stationSet.ts:11-14`: at launch the whole planet is unclaimed, so an unscoped rule puts a cave
and a campfire on all 284,004 parcels. **Populating the planet IS that deferred decision.** It is not
in the "Still open" list, so nothing currently tracks it.

Same workstream: **enumerate every string in the product that a populated world makes false** — the
Inspector's honest-emptiness mode (task A6), the claim page's ownership promise, ConsentCard's
revoke sentence.

### SOC-0.G — C11 ✅, and `feat/f4-trust` ✅ merged

**C11 — ANSWERED by C27, in the direction of KEEP.** `/play`, `ThreeWorld` and `/flow1` stay alive,
frozen, as the individuation fixture and receive no features. The headline number is produced by
driving a real headless Chromium through `/flow1` twice against a 2D baseline of 0.2620, and
`Flow1Client.tsx:13` imports `ThreeWorld`; retiring the route would retire the number or force a
re-baseline that breaks comparability with everything previously quoted. It is a measuring
instrument now, and it is maintained as one.

**`feat/f4-trust` ✅ MERGED**, 2026-09-08, and on the deadline this item names: SOC-6.G's cue ids
landed the commit before, so the next society cue would have touched `ingest.py` with half its
routing still on a branch.

**Its line counts here were wrong and the reason is worth recording**: "649 lines of activity code,
170 of shared types, 503 of harness, 119 of `ingest.py`" is verbatim the per-file stat block of ONE
COMMIT (`f67750f`), mistaken for the branch's diff against main. The branch is 19 files, +3,063/−15
as merged; the activity code is 666 lines and the harness 1,399, and about nine files were missed
entirely. The `170` and the `119` are right.

**One conflict, in `known-gaps.md`, and it resolved to ours because ours is a superset** — ⚑17 and
⚑18 were lifted off this branch under SOC-0.E days earlier so that `main`'s register could resolve
its own cross-references. The resolution is verified byte-identical to the branch's own block, and
`check:register` passes on the result.

**The cue-renumber safety claim was re-checked after the merge rather than assumed:** the merged
`ingest.py` still reads cue-id prefixes only for F1/F3/F7/F9, D11, G11, H1 and K1/K11, and none of
C8, C9, C11, C12, G12 or G15 is one of them. `packages/shared/dist` is gitignored, so the stale build
output noted earlier never entered the tree.

What it buys the direction: reciprocity, promise-keeping across sessions, and conflict/repair — the
nearest thing the repo has to an NPC who remembers you, which is SOC-6.F and SOC-6.I territory.

---

## SOC-1 — Ground truth: measure and repair what already ships ◑ · *B, C, D, E done; A half — only the phone frame is owed*

*Blocked by: SOC-0.C.* Everything here is small, and every item is a number the rest of the plan
needs or a promise the product is currently breaking.

### SOC-1.A — Measure the shipped whole frame ◑ · *machine and per-layer done; only the phone is owed*

**✅ MEASURED — DECISIONS C28.** It cost nothing: `tests/e2e/scatterSplit.spec.ts` was already
computing it, in a real headless Chromium, at the real spawn, over both passes — it was simply red
and had been. Apple M4 Pro, worst of eight headings: **ordinary parcel 907,250 triangles** (main
664,805 + shadow 242,445) and **demo 695,457** (489,459 + 205,998), against C16's ceiling of 600,000
— and C16's reference machine is an M1 Air, which is slower. The two changes in this pass take them
to 899,450 and 640,857.

**Note which route is worse: the ORDINARY parcel**, the one with no demo structures on it and the one
every buyer walks, because the demo's station clearings remove scatter an ordinary parcel keeps.

**What this does to SOC-4:** a rig is ~15,868 triangles and ~46 draw calls against a frame already
50% over budget. "Other bodies in the parcel" is not a rendering task on top of a frame that fits; it
is a task that has to make the frame fit first. That is a harder ordering constraint than the plan
assumed when it said SOC-4 was blocked *by* SOC-1.A — it is blocked by what SOC-1.A found.

**✅ AND THE PER-LAYER SPLIT EXISTS — `C31`.** It was not available from `parcelWorld`'s composition,
exactly as this item predicted, so the host now stamps each object with the layer whose code was
running when it entered the scene and brackets its draws with three's own hooks — chaining them,
never replacing, because `scatterLayer` uses that same pair to zero its shadow twin and an instrument
that overwrote it would double the frame it was sent to measure. `?debug=render` and `?debug=layers`
open it in a production build; the readout is drawn on the page, because a phone has no console.

**The split is EXACT — attributed equals the pass, to the triangle, on both routes.** It was not the
first time: an "unattributed" row of 643,197 against a 434,859 main pass, because `THREE.Scene` has
render hooks of its own that three calls at the top and bottom of `render()`, so hooking the root
brackets the whole frame as one object. The hook is on drawables only now.

**What the table says, at the spawn view:**
| | ordinary parcel | demo |
| --- | --- | --- |
| `detail` | **205,466** (42% of the main pass, 9 calls) | 169,816 |
| `meadow` | **171,600** (31%, 22 calls) | 171,600 |
| `terrain` | 82,391 + 20,439 shadow | 59,115 + 19,634 |
| `player` | 15,856 + **15,856 shadow** | same |
| `scatter` | 10,668 + 34,896 shadow | 16,264 + 45,625 |
| `slice` | — | 0 main, 132 shadow |

**Three things this settles, and one of them re-costs SOC-4:**
1. `detailLayer` is the biggest thing in the frame on an ordinary parcel. It was known to be
   expensive; it was not known to be first.
2. `meadowLayer` is second, at 31% of every parcel and every landing preview — the layer §3 item 7
   records this plan calling a free win.
3. **A BODY COSTS TWICE WHAT SOC-4.A ASSUMES** — see below.

**✅ AND THE FRAME THAT ACTUALLY BREAKS THE BUDGET IS NOW ATTRIBUTED — `C36`.** C31's split was the
SPAWN VIEW, which is the cheapest frame either route draws. Over a full 24-heading turn:

| | worst frame | `detail` | everything else |
| --- | --- | --- | --- |
| ordinary `8482589` | 921,050 | 255,481 | scatter 279k · meadow 172k · terrain 181k |
| ordinary `847db45` | **1,580,189** | **1,077,608 in 8 calls — 68%** | 259,788 combined |
| demo | 867,015, **119 of 120 calls** | 254,092 | scatter 244k · terrain 178k |

**Four things this settles, and the first makes C28 and C31 imprecise.**
1. **"The ordinary parcel" is TWO cells** — `scatterSplit` measures `8482589`, `demoUrl` designates
   `847db45` — and they differ **1.7×** at their worst headings. Both entries said "the ordinary
   parcel" as though it were one place.
2. **`detailLayer` is the whole problem on the worse cell**: 68% of the frame, in eight draw calls,
   5.2× its own spawn-view cost. Every plan for fitting the frame was aimed at the spawn view's
   biggest layers.
3. **The shadow pass is NOT the problem** — the standing hypothesis, refuted. 7% of the worst frame.
   C20's 1.7 m rule is working: `detail` and `meadow` cast nothing.
4. **One parcel is not one number.** `847db45`'s best heading is 596,810 — *under* the ceiling —
   against 1,580,189 at its worst. A 2.6× swing without moving.

*The instrument was checked against itself first: `?debug=render` and `?debug=layers` return
1,580,189 identically, so the per-object hooks are not in the reading.*

**☐ Still owed: the phone reading.** It is now possible without a harness, and nobody has taken it.

There is **no measured shipped whole-frame number.** `DECISIONS.md:806-807` gives 326,414 tri / 37
draws at the real parcel spawn; `living-world-rendering.md` gives 628,415 / 70 on a different
machine and a different view and self-labels it "not a mobile or production performance guarantee";
C23 concedes outright that `detailLayer` and `meadowLayer` appear in no table and that the frame has
never been measured on a phone.

*Do:* ungate `RenderInfo` behind a query parameter (C23 already names this as the cheapest step —
`WorldCanvas.tsx` already writes `data-world-fps`/`-triangles`/`-calls` — the DOM hyphenates a
dataset key, so the camel-case spelling this plan first used matches nothing in a real browser — and
`RenderInfo` is a TypeScript interface plus a `devInfo` option, not a component).
**And the ungate ALONE does not produce a whole-frame number:** three calls `info.reset()` after
`shadowMap.render()`, so `world.info` is the MAIN PASS ALONE — the same half-frame error
`tests/e2e/scatterSplit.spec.ts` exists to correct (928,034 reported against 1,623,152 actual). The
ungate must ship the pass split with it, and the row must name device, OS, browser version and the
pixel ratio `createRendererHandle` actually used, or it is not comparable to any table in DECISIONS.
Then measure per route × per stand × **per layer**, plus at least one real phone reading, and record
it in DECISIONS' style.
*Why it gates everything visible:* a character body is 23 visible `castShadow` meshes ≈ 46 draw
calls, against a measured rim reading of 44 (parcel) and 73 (demo) of a 120 budget
(`DECISIONS.md:976`). **Nothing about visible crowds can be planned before this number exists.**

### SOC-1.B — Guard the meadow ring ✅ · *done, and NOT the item it was written as*

**Originally: "Trim the meadow ring." That premise is refuted — see §3 item 7.** The ring radius is
already exactly the fade far stop (`RADIUS 3 × SIZE 8 = 24 m` against `smoothstep(17., 24., …)`), so
there was no slack to pull and the trim would have opened an 8 m band of missing grass. The 42.30%
is disc-in-square overhead, structural to covering a circle with a grid of squares.

**What was actually done, and it is the durable half:**
- `SIZE`, `RADIUS`, `BLADES`, `MEADOW_FADE_NEAR_M`, `MEADOW_FADE_FAR_M`, `MEADOW_RING_M` and
  `MEADOW_FADE_GLSL` are exported, and the shader's `smoothstep` is now INTERPOLATED from those
  constants rather than written as two float literals inside a template string. Before this, no test
  could read either side of the relationship, which is exactly why the record could say anything.
- `tests/meadowRing.test.mts` holds it two-sided: the ring may not be SHORTER than the fade (the
  bug the plan asked for), and may not be a whole patch LONGER (so the bound cannot be satisfied by
  growing `RADIUS`), and it parses the two floats back out of the GLSL the shader is compiled with.
- The `customProgramCacheKey` is derived from the two constants, so a fade change cannot reuse a
  stale program.
- The one genuinely free win that does exist was taken: the 4–10 patches of the 49 whose nearest
  corner is past the far stop at any instant are no longer submitted (`mesh.visible = false`). They
  stay RESIDENT, because the player's offset inside its own patch changes as they walk and a rebuild
  is 1,300 terrain samples. The build loop is deliberately NOT gated the same way — a patch skipped
  there is a patch built one-per-frame later, and the player reaches it before the builder does.

**Still open, and now honestly stated:** the meadow has never appeared in a measured frame. It is
part of SOC-1.A, not of this item.

### SOC-1.C — Stop `detailLayer`'s per-frame full re-upload ✅ · *done*

**Measured, fail-to-pass: 89.43 MiB handed to the GPU over a 19-frame walk to draw 7.73 MiB of
matrices — 11.6×, and 99.3× standing perfectly still. Now 7.81 MiB, 1.01×.** The still-frame figure
is the worse one and it is the one the plan did not predict: `packInto`'s unchanged path writes
nothing at all, so the leftover unranged dirty flag re-sent every class anyway, sixty times a second,
to draw a frame identical to the last.

**It was THREE blanket dirty-flag sites per frame, not two.** The third is in `update()`'s restore,
and deleting it is necessary rather than cosmetic: keeping it would leave an unranged dirty flag that
makes the new ranges a no-op on exactly the still frames that were worst. It is safe only because
`PlanetWorld` runs every `update`, then every `beforeRender`, then renders, with nothing drawn in
between — that ordering is now a comment at the deletion site, because **SOC-1.A's spec rewrites that
same frame loop.** Apply order: SOC-1.C before SOC-1.A.

**The zero guard is load-bearing and sits before the clear**, which is the opposite of `packInto`'s
shape, because this layer does not own `pair.source`: clearing a range `packInto` just added, while
its version bump stands, leaves the attribute dirty with an empty range list — which three treats as
"send everything". `tests/detailUpload.test.mts` replays three's own upload rules over a NaN-filled
buffer and holds three things at once: the drawn prefix is bit-for-bit the CPU array, every drawn
matrix is one `placeAssets` produced, and the bytes uploaded stay within 2× the bytes drawn.

*Not done, deliberately split out:* the mesh is still sized at the full class count. Shrinking it
buys memory only (3.91 MiB per world) once the ranges are in place, and it is not a safe drop-in —
`partitionDetail` writes `high[at+j]` with no cap, and the full-count allocation is the only thing
bounding that write today.

It flags both instance buffers dirty with no update range and sizes the detail mesh at the full class
count. `scatterSplit.ts:434-438` already does the right thing (`clearUpdateRanges` +
`addUpdateRange`) for exactly this reason. Hold the invariant `scatterSplit.test.mts` already holds:
the packed prefix the GPU sees equals the matrices the placement produced, bit for bit.

### SOC-1.D — Fix the C23 mobile leftovers ✅ · *done, and the stated cause was wrong*

**"Heavy WebGL specs back to back exceed the 60 s default while the world builds" is REFUTED by the
world.** Measured on an idle machine with one browser and this config's own launch args: the demo
parcel reaches `data-phase="ready"` **1,440 ms** after `goto`, the ordinary parcel 1,745 ms,
`/dev/goldens` 739 ms, the landing's globe 3,780 ms. The 60 s default was already 16–43× the largest
of those. Nor is the server it: `✓ Compiled /parcel/[cell] in 559ms`, `[planet] built … in 0.2s`,
a cold parcel response of 1,316 ms. The one ten-second server cost, `[planet] seeded the registry in
11.1s`, is lazy by design and is on no route any spec navigates to.

**THE CAUSE IS THE RUNNER, AND THE SUITE WAS MEASURING ITSELF.** `playwright.config.ts` set no
`workers`, so Playwright picked `ceil(12/2) = 6` on a 12-core box — and `use.launchOptions` sets
`--disable-gpu-vsync` and `--disable-frame-rate-limit`, so **each browser spins the WebGL world
uncapped**: 534 fps on the ordinary parcel and 312 on the demo, measured through the host's own
instrument (`C31`). A worker is not a process waiting on a page, it is a process burning every cycle
it can reach, on the same box as the `next dev` server it is talking to. **Measured: ONE worker takes
the load average from 3.1 to 7.1 by itself.**

**THIS ITEM WAS FIXED TWICE, AND THE FIRST NUMBER WAS WRONG.** The first pass measured 6 / 3 / 1
workers on the PRE-MERGE tree and concluded three was both green and faster than one, so `workers: 3`
was committed. `feat/f4-trust` then added routes and modules and the constant was carried forward
**without being re-measured** — which is precisely the class of error §3 exists to catch, committed
inside the change that closed this item. Re-measured on the merged tree, quarantine excluded, 21
tests:

| workers | wall | result | load average, before → after |
| --- | --- | --- | --- |
| 3 | 27.8 m | **6 FAILED** / 15 passed | 3.99 → **62.10** |
| 1 | **1.1 m** | **21 passed**, exit 0 | 3.08 → 7.09 |

**Twenty-five times faster and green**, confirmed over three consecutive runs (1.1 m, 1.2 m, 1.2 m,
21/21 each) — and the third started at a load average of 14.6 and still passed, which is robustness
three workers never had. Every one of the six three-worker failures was a `Test timeout` or
`page.goto: net::ERR_ABORTED`, **including `smoke.spec.ts`, whose entire body is a goto and a title
assertion and which passes ALONE IN 3.0 SECONDS on the same machine.** Not one was an assertion about
the world.

*(A run taken while macOS Spotlight was re-indexing — 142% CPU on `Metadata.framework`, load 105 —
gave 11 failed of 21 with the identical signature. It is not evidence about the code, and it is
recorded only because it is the same failure arriving from outside and it took a third run to tell
the two apart.)*

**Both of the remedies this item offered were taken anyway, for the reasons they are actually good
for, not the one it gave:**
- `timeout: 120_000`, because six tests relying on the 60 s default hold internal waits of 90–180 s,
  and **a wait that outlives the test holding it can never print its own message** — the runner kills
  the spec and prints "Test timeout of 60000ms exceeded" instead of the sentence the author wrote.
  That is a legibility fix, and it is how a starved dev server spent months looking like a slow world.
- `globalSetup.ts` warms the five routes the suite drives with a plain fetch before any worker
  exists. Second-order on an idle machine (3.7 s for `/`), and it is where those numbers are cheap:
  the same compiler cost 27.6 s on `/demo` and 184.1 s on `/api/telemetry` when it landed mid-suite.

**And the honest state of the suite, which `C28` first understated as "two red specs":** 10 failed,
24 passed, zero timeouts, across **five** spec files — `globePick` ×2, `scatterImpostor` ×4,
`scatterSplit` ×2, `slice` ×1, `spawnSea` ×1. Every one fails on an assertion, and every one was
verified pre-existing by stashing the day's render changes and re-running. Three are measurement
paths. Each is owed its own item.

### SOC-1.E — Wire the revoke the consent card already promises ✅ · *done*

One prop, one control, one line at the mount: `Inspector` takes `onRevoke`, `ParcelCanvas` passes
`() => chain.revoke()`. Nothing in `measure.ts` changed — `revoke()` already did the right thing and
already had a test; what it did not have was a caller.

**The control is drawn only while `consent === "accepted"` AND a callback was handed down**, because
a button that stops nothing would be a second false promise in the same panel. Afterwards the panel
says what stopped and, as plainly, what did not: the buffer, the sampler, the collector and the
panel's log are dropped and `telemetry:false` goes to the shared key that `/play`'s gate reads too,
but **rows already sent are not recalled** — the telemetry route records before it forwards — so the
line points at `/account` rather than saying "erased". Writing "erased" there would have been the
next false sentence in a panel that had just finished paying for one.

**Pinned in a browser, not only in a render.** `tests/inspectorRevoke.test.mts` holds the markup
rules and *would keep passing if the `ParcelCanvas` line were deleted* — which is the identical hole
`recognitionMeter.spec.ts` was written for, and the reason `revoke()` sat uncalled for months. So
`tests/e2e/consentRevoke.spec.ts` clicks the control in a real Chromium on a real parcel and asserts
the shared key flipped. **Run and passing.**

*Left as a decision rather than shipped inside this item:* there is no re-accept control on the
parcel. `ConsentCard` renders only for `unset`, so the revoke is one-way on that page and re-consent
lives at `/account`. Adding `onAllow` would change what "say no and the world plays exactly the same"
implies, and that is a `C`-entry, not a widget.

---

## SOC-2 — Foundations ◑ · *C, D, E, G, H done; B and F half; only A open*

*Blocked by: SOC-0.A(b), SOC-0.A(c).* None of this is visible to a player. All of it is underneath
every line of the direction, and each item is a hard ceiling if skipped.

### SOC-2.A — Decide the Postgres access path, then close C10 ☐ · *days*

Two disjoint paths exist. Everything running today uses PostgREST via `supabase-js`;
`packages/planet/lib/registry.ts` uses `pg` and **is never instantiated in the app** (§3 item 5). A
mutable society needs transactions, `SELECT … FOR UPDATE SKIP LOCKED` and advisory locks, which
PostgREST cannot express and which the registry already demonstrates.

C10 as currently written ("provision `DATABASE_URL` and run the seed") is missing a fifth step
nobody has scoped: **replace `planet.ts`'s hardcoded `backend: "memory"` with a two-backend seam**,
and decide pooling for `pg` on Vercel serverless.

### SOC-2.B — Fix ownership identity ◑ · *the collision is gone; the foreign key is not*

**✅ THE NAME IS NO LONGER THE KEY.** `claim/route.ts` called `store.claim(name, ...)` with the
trimmed typed display name, so **two people who both typed "Sam" were one owner** — the second one's
claim found the first one's parcel already assigned and handed it back as theirs. The claim page
says "Every parcel has exactly one owner, permanently" and "That identifier is permanent"; both were
backed by a string anybody could retype.

**The schema already had the split and the code had collapsed it.** `packages/planet` has always
taken an `ownerId`, and `parcels` has carried a `display_name` column since migration 0009 that
**nothing ever wrote**. The whole defect was one argument at one call site. `claim` now takes
`ClaimOptions { displayName, referrerParcel }`, both backends store the name, and the Postgres
`parcelOf` reads it back — so the column stops being dead rather than the name being dropped.

**Where the test had to go, and why the obvious place was wrong.** A test driving the registry with
two ids would have passed *before* the fix and caught nothing: the registry contract was never the
bug. The route itself cannot be tested — it imports `next/server`, which refuses to load outside a
server component — so the branch lives in `lib/claimRequest.ts` and the route calls it, which is
`sliceOptionsFor`'s move for `sliceOptionsFor`'s stated reason: a test that writes its own branch is
testing its own branch. Seven tests there, five in `packages/planet/tests/ownership.test.ts` for the
registry contract (distinct ids get distinct parcels; a repeated id stays idempotent, which is how a
returning owner finds their own land; changing your name costs you nothing).

**The id is REQUIRED, not defaulted, and both tempting alternatives are worse.** Falling back to the
name keeps the bug alive for exactly the callers most likely to hit it; minting one server-side
hands out permanent ownership no browser could ever prove again. `resolveUserId()` mints on the
client — correct here and only here, because this page asks no consent question a stamped key would
answer early, and already promises the identifier is permanent.

**☐ Still owed, and it is the harder half: the foreign key.** `owner_id` is still `text` with no
reference, because the id is an unauthenticated localStorage UUID — anyone can send any string and
claim as anybody. That is SOC-2.E, and until it lands a FK to `users` would be a constraint against a
table nothing writes. **This item removed a collision; it did not add proof.** Also unanswered: what
happens to claims already made under a name as the key, which is a data question for whenever the
memory registry becomes durable (SOC-2.A).

### SOC-2.C — Migration discipline ✅ · *done, and verified against a real Postgres*

Every claim here was confirmed — and the 0010 search went further than "no branch has it": zero hits
across all nine refs' trees, `git log --all --diff-filter=A`, every reflog-reachable commit, every
dangling object from `git fsck --lost-found`, and **every tree in the object database**. The gap is
permanent, no commit or doc anywhere explains it, and `db/migrations/README.md` says that rather than
inventing a reason.

**Shipped:** `schema_migrations` (as migration `0012`, so the ledger is reviewable in the same folder
as everything else), and `scripts/migrate.mjs` — root, plain `.mjs`, beside `check-env.mjs` and
`check-register.mjs`, because `db/migrations` is a root concern and only one of the eleven files
belongs to `@echo/planet`. `npm run db:migrate` reports and changes nothing; `db:migrate:apply`
applies. **The default is report, so a typo cannot write to a database.**

**Verified by running it against Postgres 16.15, not by reading it.** Clean apply: 30 tables. Every
guard exercised and every exit code checked, because a guard that reports and exits 0 is not a guard:

| behaviour | result |
| --- | --- |
| duplicate version, before any connection | `COLLISION: 0009 is claimed by …`, **exit 2** |
| an applied file edited afterwards | `DRIFT`, refuses to apply, **exit 1** |
| a ledger row with no file | `ORPHAN`, **exit 1** |
| no `DATABASE_URL` | **exit 2** |
| clean tree, nothing pending | `nothing to apply`, **exit 0** |
| `--baseline 0008` on a fresh database | 8 rows recorded, **1 table created** — it records without running |

**THREE THINGS SOC-2.C DID NOT SAY.**

1. **There are TWO collisions, not one.** 0006 was also used twice, resolved by `2db6375`, which is
   the precedent *and* states the licence it used: "no runner, no `schema_migrations` table, nothing
   recorded the old name". **This item closes that escape hatch** — once a version is in the ledger,
   renaming its file is an ORPHAN plus a PENDING.
2. **The implied blame is backwards.** This reads as though the unmerged branch took a number main
   already had. The corpus took 0009 on 2026-08-07, documenting that it checked
   `git log --all --diff-filter=A` first; the planet registry took it **twenty-six days later**,
   without. The branch that broke the rule is this one. The resolution is to rename the corpus
   migration to `0013_` **before it merges**, while nothing has recorded the old name — it breaks
   four prose references and, verified, no code.
3. **THE COLLISION HAD ALREADY CORRUPTED THE RECORD HERE**, via this plan's own SOC-0.E. See §3
   item 8; corrected.

**AND A MEASURED FINDING THAT CHANGES SOC-2.A AND SOC-2.H:** the migration set is **not portable to a
plain Postgres.** `0007_waitlist.sql` fails with `role "anon" does not exist` — 0007 and 0008
hard-depend on Supabase's `anon`/`authenticated` roles. Anything standing up a bare Postgres has to
create those two roles first or skip those two files, and must say which. *(The failure also proved
the transaction boundary: six files applied, 0007 left nothing behind in the schema or the ledger,
and a resume after creating the roles picked up exactly where it stopped.)*

**One dependency the repo was hiding:** `pg` was not declared in the root `package.json`. It resolved
only because npm hoisted `@echo/planet`'s devDependency. Now declared at the same 8.23.0 the lock
already had.

### SOC-2.D — Give the ML store a shared, durable backing ◑ · *the DURABLE half is built (C34, ⚑24, migration 0014); `shared` is deliberately not taken*

`services/ml/echo_ml/store.py` is a **process-local dict** with a per-user `RLock` held at five call
sites. `config.py:76-77` declares `supabase_url`/`supabase_key` and nothing in `services/ml` reads
them. `Dockerfile` and `run.sh` have no `--workers`. **Every posterior resets on redeploy.** `⚑16b`
states the binding sentence: the lock is exactly as complete as the store, so anyone adding workers
has to fix the store first.

`UserState` carries posterior, reward, behaviors, buckets, cond, temperature, calib, baseline_mu and
locomotion — including a full-covariance matrix and a vector index.

**✅ BUILT — `C34`, `⚑24`, migration `0014`. The DURABLE half only; `shared` is explicitly not
taken and the entry says why.**

`snapshot.py` (pure, no network — so the subtle failures are testable with no key and no service),
`persistence.py` (PostgREST over the httpx the service already has, a write-behind queue, a bounded
hydrate), `0014_ml_state.sql` (only what had no column at all, plus a `comment on column` where 0001
said "diagonal covariance" of a matrix that has been full since seven hours after it shipped), and
the join in `store.py`. **34 tests**, each file verified fail-to-pass by reverting the thing it
exists for — removing the one line that marks a user dirty fails three of the four end-to-end tests.

**⚠️ THE TRANSPORT IS NOT VERIFIED.** Every test runs against a dict-backed fake. There is no
PostgREST to run locally and the deployed path is Render→Supabase over TLS, so the serialization,
the queue and the join are proven and **the wire is not**. The first environment to set
`ECHO_ML_PERSIST=1` is the test of the wire, and it should be a staging project.

**"A hard ceiling below every other line of this plan" is OVERSTATED, checked against this document's
own blocker lines.** Exactly one workstream names SOC-2.D: SOC-3. SOC-4 does not and says it is
"buildable against a fake snapshot source"; SOC-5 reaches it only through SOC-3.A; SOC-6 and SOC-7 do
not name it at all. **And SOC-6.A and SOC-6.B are both ✅ shipped, under the ceiling.** The real
dependency is one edge and it is specific: SOC-3.A's fix is Redis presence so matchmaking spans
instances and SOC-3.E asks where a sim tick runs — every answer is *a second process that measures*,
and a second process cannot share a posterior with the first.

**The item has ONE NAME AND TWO PROBLEMS.** *Amnesia* is ~300 lines; *one process, forever* is the
weeks. `C34` takes the first and leaves the second, and says so — because the shared half needs the
read-modify-write inside Postgres (`registry.ts`'s `pg_advisory_xact_lock`), which is expressible
through the `pg` client and **not** through PostgREST, so it is coupled to SOC-2.A and the durable
half is not.

**Measured, so the cost of the amnesia is a number:** `render.yaml` has `autoDeploy: true` and no
`buildFilter`, so 143 commits over 90 days on `main` across 17 active days redeploy both services —
**and only 38 of them touch `services/ml`. A docs commit resets everyone.** *(And a record corrected
in passing: `⚑21`'s "Render's starter plan spins down" is contradicted twice in this repo. Starter
does not. The resets correlate with the team shipping, not with users being away.)*

**✅ THE PRECONDITION IS DONE — `⚑24`, and it was a live hazard rather than a design question.**
`config.py` read the repo-wide `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, which
`run.sh` sources from a gitignored `.env` holding a URL **byte-identical to production** and a live
service-role key. Every candidate design begins by reading exactly those. Now ML-owned names behind
an explicit `ECHO_ML_PERSIST=1`, with `persist_enabled` as the single gate, pinned by twelve tests —
three of which go red if the old shape returns.

**Three false persistence records fixed with it**, all claiming a durability that has never existed:
`store.py`'s header, `config.py`'s declarations, and — the damaging one, because an operator can
follow it — `render.yaml`'s "with both set, learning state hydrates/persists to Supabase".

### SOC-2.E — Authenticate the ingress, the persona read and the room join ✅ · *done, and it was five surfaces rather than three*

Verified: there is no `middleware.ts` under `apps/web`; `api/agent/persona/route.ts:7` returns any
posterior for any `uid` in a query string; `lib/identity.ts` mints a bare localStorage UUID at `:36-39`
and honours `?u=<id>` verbatim at `:26` and `:33`; `WorldRoom.ts:134` copies `options.userId` into
`refId` unchecked. `refId` is the key **every** `BehavioralEvent` is written under.

*(The original citation here said `identity.ts:24-40` "mints", which conflates two functions whose
difference is the point: `:24-29` is `peekUserId`, which NEVER mints — that is its entire purpose, so
that a render which runs before the consent card cannot stamp a durable key under a card promising a
"no" changes nothing. Only `resolveUserId` mints.)*

In a solo world this is a convenience. **In a shared one it is a way to author another person's
persona**, and posteriors written under a spoofed id are indistinguishable from real evidence
afterwards. The care needed: `?u=` is load-bearing for the two-tab test path and for the harness that
produces the headline individuation number, so confine it to non-production without breaking that.

**✅ DONE — `C39`, and the item was bigger than it was written.** Two surfaces the entry does not name
turned out to be the ones that made the three it does name exploitable rather than merely weak:
`GET /api/telemetry/recent?uid=` returns a person's **raw behavioural rows**, and
`POST /api/account/delete {userId}` **hard-deletes** their posterior, eight Supabase tables and their
island state — both on a bare string. And the string was public: `/api/planet/status` served up to
1,500 of them (`⚑27`) and `refId` was a **synced** Colyseus field, so standing near someone in the
shared world handed you the credential for erasing them.

- **`packages/shared/src/identityToken.ts`** — HMAC sign/verify plus the pure policy, reached by the
  `@echo/shared/identity` subpath so `node:crypto` never enters a browser bundle. One module, because
  `apps/web` and `apps/realtime` both enforce it and a policy written twice drifts (L5).
- **`apps/web/src/lib/subject.ts`** — the request plumbing and the one place a Bearer header is read.
- **`/api/identity/session`** — the only minter. It refuses to sign an id handed to it, which is why
  rollout orphans existing anonymous echoes; `C39` states that cost rather than discovering it later.
- **16 of 19 id-bearing routes guarded.** The other three *should* not be: `auth/sync` verifies a
  Supabase token and always did, `identity/session` takes no id, and `narrate` declares a `userId` it
  never reads.
- **`refId` lost its `@type`, not its value.** The server still attributes every emission to it; it
  stops leaving the process. Clients identify a person by Colyseus's own room-scoped `sessionId`.
- **The second minter is gone** — `Flow0Client` wrote `"u_" + Math.random()…` into the canonical key
  on mount, pre-consent, with the exact prefix `identity.ts` says it "deliberately DON'T prepend".

**The closed-gate proof, not an assertion that it is closed:** `npm run test:copresence` FAILS with no
relaxation and PASSES with `ECHO_TRUST_CLIENT_ID=1`. 26 tests on the token and the gate, every strict
subset of the relaxation asserted closed.

**Still owed:** the foreign key SOC-2.B waits on — now unblocked, because there is finally a verified
subject to point it at.

### SOC-2.F — Provenance in ingest, before any society event reaches a posterior ◑ · *the class that exists is carried; two more have nothing to stamp them*

**✅ `session_mode` now reaches the store.** It was declared in `packages/shared/src/telemetry.ts`,
stamped by `measure.ts` at the TOP LEVEL of the event, forwarded verbatim by `/api/observe/behavioral`
(the ML request model is `event: dict`, so nothing stripped it), stored as a checked column in
migration 0011 — and `ingest.event_to_observation` read it nowhere, so it died one function short of
the posterior. `grep -rn session_mode services/ml/` returned NOTHING. Every behavioural row written
until now is permanently unfilterable, which is L7 exactly, and it is why this was small and urgent
rather than large and clever.

**IT IS CARRIED, NOT WEIGHED, and the second half is what makes the first safe to ship.** Provenance
rides in its own field on `BehaviorEntry`. It never enters `telemetry`, so no posterior moves; it
never enters `cond_key`, because that would **fork every existing user's conditional buckets** and
silently re-partition evidence already gathered. L7 asks that classes stay DISTINGUISHABLE, not that
they be weighed differently — the second is a modelling decision and nobody has taken it.

`services/ml/tests/test_provenance.py`, 14 tests, holds both halves: the class survives the wire to
the store through the real token-gated FastAPI route; an unstamped row carries **nothing rather than
a guess** (defaulting to `"solo"` would be L7's failure wearing a helpful face); a value outside the
declared three is dropped, because a provenance field that can hold anything distinguishes nothing;
and the posterior after observing is **identical to the last bit** with and without the stamp,
`array_equal` on both `mu` and `Sigma`. Eleven of the fourteen fail with the change reverted.

**☐ Still owed: the two classes a shared world actually needs** — NPC-witnessed vs player-witnessed,
and server-stamped vs client-asserted. **Neither is invented here, because nothing populates either.**
The first needs the interaction path to say who was watching; the second needs `WorldRoom` to mark
what it stamped itself. The field is a dict so that day is an added key rather than a migration.

### SOC-2.G — Retention window and profiling posture ✅ · *taken as C35; one question deferred to SOC-5.D*

**⚑25, closed the same day it was created.** SOC-2.D started writing four tables that had **no row
level security**, because all sixteen of `0001`'s tables predate `0007` — the migration that
introduced RLS to this repo and framed itself as the exception, on the grounds that everything else
was "survivable for game state". `persona_state` is an eight-axis personality measurement of a named
person; it was never game state, and until this week it was also empty. Measured with Supabase's
default grant simulated: RLS off, anon reads the row; RLS on, anon reads nothing. All sixteen now
have it, zero policies, and nothing breaks because every table access in the repo uses the service
role, which bypasses RLS.

**That closed the exposure and not the window. The window is now taken too — `C35`.**

**RAW behavioural data lives 90 days; the DERIVED profile lives while the account does.** The split
is the decision rather than the number: the sensitive surface is the log — what you did, when, with
whom, in what words — and the eight axes are the product. An echo that forgets you every quarter is
not an echo; a minute-by-minute record of a named person kept forever is not defensible.

**The price is real and is paid deliberately.** `⚑21` measured a 240-row corpus with variance in
only 7 of its 66 features, so the second `W` re-anchor needs volume and a rolling 90-day window may
never accumulate it — traded against an exposure that is real every day, for an event `⚑21` says is
"not schedulable until labels exist". If a date ever appears, this is the first number to revisit.

**Basis: consent** — which is what the card already asks. So withdrawal stops sampling immediately
and existing rows age out on the clock; it does not erase, because `/account` does that on demand
and SOC-1.E was careful not to let a toggle imply otherwise. **A subject-access request returns
both**, derived and raw, labelled as two different things — the inspector already shows a person
that much live, and an access request should not be a worse view than the product's own.

**Mechanism:** `lib/retention.ts` and `0016_retention_indexes.sql`, riding the EXISTING daily cron
rather than adding one — Vercel's Hobby plan rejects the whole deployment for a second, which cost
this repo twelve hours once. Eight tests, pinning the shape rather than the number, because a test
asserting `=== 90` would fail the day someone legitimately changes it and teach them to edit the test.

**☐ Still open, and named where a reader meets it:** `messages.text` is the typed content of a
conversation and the most sensitive row in the schema. It is swept on the same clock as everything
else, which is the conservative option available today — but whether it should exist at all, given
ConsentCard's "never what you type", is SOC-5.D's question.

`0011_behavioral_events.sql` ships a durable, identity-keyed log with `created_at`, **no TTL, no
expiry column, no pruning job, RLS on with zero policies.** Erasure works; retention does not exist
and has no default. `⚑22` names it as a legal question and is only on an unmerged branch, so main
ships the exposure and not the entry.

*Do:* a written window with a number in it, its lawful basis, and whether a subject-access request
returns the raw log as well as the derived posterior. Note the trade `⚑22` names: a shorter window is
safer and shrinks the corpus `⚑21` needs.

### SOC-2.H — CI ✅ · *done — `.github/workflows/{ci,e2e}.yml`*

`.github` did not exist. Every gate was a command someone remembered to run. **And it was EIGHT
holes, not the one this item names** — each re-established by execution, not by reading:

1. `.github` absent.
2. `apps/web`'s `lint` gate **cannot execute at all**: `next lint` with no ESLint config drops into
   an interactive "How would you like to configure ESLint?" prompt and exits 1.
3. **`apps/realtime` is wired out of every aggregate gate** — no `test` key, so
   `--workspaces --if-present` skips it silently.
4. `registry.test.ts` skips 4 of 4 with exit 0 — and see 8.
5. **`services/ml`'s 135 tests are reached by ZERO npm script.** No package.json, not in
   `workspaces`, and the string "pytest" appears in no script in the repo. It is the largest ungated
   suite here and the cheapest to run — 135 passed in 2.1 s — and §2 calls it the crown jewel.
6. **`npm run typecheck` is RED on a clean checkout.** It never runs `build:shared`; with
   `packages/{shared,planet}/dist` moved aside it exits 2 with 222 errors. Any CI that orders
   typecheck before build:shared is red on day one — the workflow's comment says so at the step.
7. **The blocking `npm test` carries a wall-clock budget that fails under its own parallelism.**
   `scene.test.ts` asserts a 400 ms region build: 201–217 ms alone (5/5 green), but 288–814 ms
   across the 18-file parallel run — **three failures in seven full-suite runs**. Now armed by
   default and disarmed by `ECHO_PERF_BUDGETS=0` in the correctness job, with a separate
   non-blocking job running it ARMED so a CI-hardware number finally exists. **Nobody may move 400
   until one does.**
8. **The registry suite is not merely skipped — it is RED behind the skip on a default Postgres.**
   `registry.test.ts` opens `new pg.Pool({ max: 200 })` and fires 200 concurrent claims; against
   `max_connections=100` it dies with SQLSTATE 53300 at `Promise.all` index 100. At 300 all four
   pass — "200 concurrent claims in 243 ms". **So the `SKIP LOCKED` property this item calls
   unverified is verifiable and correct**, and a CI author writing the obvious `services: postgres`
   block gets a red that has nothing to do with the code. The workflow starts the container by hand
   with `-c max_connections=300` and says why.

**AND CI NOW APPLIES THE WHOLE MIGRATION SET THROUGH THE RUNNER**, not one hand-picked file
(SOC-2.C). Verified locally with the exact CI sequence — fresh Postgres 16, `create role anon` +
`authenticated`, `npm run db:migrate:apply`: **11 migrations, 30 tables**, and then the planet suite
at **164 pass / 0 fail / 0 SKIPPED**. The four registry tests that have never run in this repo's
history — the `SKIP LOCKED` and single-fire-subdivision properties a shared mutable world depends on
— pass, at "200 concurrent claims in 886 ms". Hole 4 and hole 8 are closed together, because the
thing that unskipped them is the same thing that made the database real.

**The browser suite is manual-dispatch on macOS, not `pull_request`, and that is a measurement.**
`playwright.config.ts` launches chromium with `--use-angle=metal --enable-gpu` and records why: on
software rendering a frame costs 568 ms against 8.3 ms, and Playwright's actionability check needs a
box unchanged across two frames before it will click — so the consent card never settles and every
click times out on a button that is visible and unobstructed. GitHub's Linux runners have no GPU, so
a red there would mean the runner, not the world. **A gate whose red does not mean anything is worse
than no gate**, because people learn to ignore it — ⚑11's lesson exactly.

**Quarantine, and it is a list of reasons.** `E2E_QUARANTINE=skip` runs the 21 green tests as the
gate (54.6 s); `=only` runs the five known-red files and reports without blocking; unset runs
everything, which is what a person at a terminal should see. **Nothing in it moves a threshold** —
600,000 triangles is C16's number and 1.3 tiles is the spec's, and retuning a number until it passes
is the failure mode §3 exists to catch.

---

## SOC-3 — One world that is actually one ☐ · *months*

*Blocked by: SOC-0.B, SOC-2.C, SOC-2.D.* **The item most likely to be underestimated, because a
working room already exists.**

### SOC-3.A — Single-world guarantee ☐

`client.joinOrCreate("world")` against `maxClients` 150 means **the 151st player creates a second
world**, with its own NPCs and its own tick. The server is constructed with no presence and no
driver, so rooms cannot span processes. `docs/MULTIPLAYER.md:62-71` warns to keep it a single
instance and names `@colyseus/redis-presence` + `@colyseus/redis-driver` as "the documented next
step, not wired here".

### SOC-3.B — Durability of world state ☐

`WorldState` is built fresh in `onCreate`; there is no load and no save anywhere in
`apps/realtime/src`. `world_entities` exists in migration 0001 and has **zero writers**. **A restart
is a new world.**

### SOC-3.C — Interest management, or a different substrate ☐

`WorldState` is one `MapSchema` broadcast to every client with no area-of-interest and no `@filter`.
On a 768×768 tile map with 109 entities that is fine. On a planet with 1,074,942 parcels it is the
whole architecture. **The honest question is not "add Redis" — it is whether Colyseus is the
substrate at all.**

### SOC-3.D — Measure the Colyseus encode ☐ · *prerequisite for SOC-6*

`apps/realtime/src/index.ts:16` raises `Encoder.BUFFER_SIZE` to 64 KB with a prose reason and **no
byte count anywhere in the repo**. The failure mode on overflow is total — every state patch dies and
nobody moves — not graceful. *Do:* encode full-state and delta at 109 / 500 / 2,000 entities and
record the bytes. Every "how many NPCs can a shared world hold" number is unfounded until this
exists.

### SOC-3.E — Where does the simulation tick run? ☐ · **the single largest unaddressed infrastructure question**

`render.yaml` defines exactly two services, both `plan: starter`, no worker, no queue, no Redis, no
`numInstances`. `vercel.json` has one cron at 03:00 daily, and
`api/cron/waitlist-sweep/route.ts:29-34` records that a finer schedule got a production deployment
**rejected for 12 hours**. An ageing, farming, trading society needs a tick and **there is no host
for one.**

### SOC-3.F — Reconcile the movement profile ☐

`WorldRoom.integrate` steps users at 4 tiles/s with no acceleration; the parcel passes 1.031 walk /
2.625 run with accel 4.375. **The server's walk is 3.88× the parcel's walk.** A joined parcel client
exceeds `WorldCore`'s 1.5-tile reconcile snap within a fraction of a second of holding a key.
Whichever number moves, record the measured `novel_tile_ratio` distribution shift over an identical
path at both speeds **before** either number moves (`⚑9`'s rule forbids moving one side alone).

---

## SOC-4 — Other bodies in the parcel ☐ · *weeks*

*Blocked by: SOC-1.A (the frame budget), SOC-0.B.* Buildable against a **fake snapshot source**
before any socket exists — and that is the recommended order, because it de-risks the rendering
without waiting on SOC-3.

### SOC-4.A — Make the rig affordable to draw more than once ☐ · *weeks, and worse than costed*

24 meshes (19 spheres × 720 tri + 4 skinned cylinders × 544 + 1 box × 12 = **15,868 triangles**), 6
materials, 24 distinct geometries allocated fresh per call, every mesh `castShadow`, nothing merged
or instanced (`game/three/character.ts:9-12,30,56-88`).

**⚠️ RE-COSTED BY `C31`, MEASURED: the "≈46 draw calls per body" above is the MAIN PASS counted as if
it were the frame.** The body really draws **15,856 triangles in 23 calls in the main pass, and
15,856 triangles in 23 calls again in the shadow pass** — every one of its 23 visible meshes is
`castShadow`. One body is **31,712 triangles and 46 draw calls of WHOLE FRAME**.

So the sentence "one or two extra bodies exhaust the demo route's headroom" is optimistic in the
wrong direction. An empty ordinary parcel already spends **103 draw calls of C16's 120**, and C28
puts its worst frame at 907,250 triangles against a 600,000 ceiling. **Two players standing together
exceed the draw-call ceiling by themselves, on a frame that is already 1.5× over the triangle one.**

This is why SOC-4 is not blocked *by* SOC-1.A but *by what SOC-1.A found*: SOC-4.A is no longer
"make the rig affordable to draw more than once", it is **make the frame fit at all**, and the rig is
one term in it.

**And `C36` says which term matters, which is not the one `C31`'s spawn view suggested.** On the
frame that actually breaks the ceiling, `detailLayer` is **1,077,608 triangles in eight draw calls —
68% of everything** — while meadow, scatter, terrain and the rig together are 259,788.

**`C37` then asked whether its radius could simply be cut, and the answer is NO — measured, and the
opposite of what was expected.** The 180/75/34 m bands were a bare ternary with no derivation
anywhere, while C22 derived every far-band distance against a pixel budget. Running C22's own method
on the detail pair puts every shipped radius at **0.1×–0.7× of where the two forms stop differing**:
they are conservative, and trimming them is visibly lossy by this repo's own measure.

**The real finding is the gap.** Ordinary forms are 4–36 triangles, detail forms 38–1,376 — **62×
for a broadleaf, 102× for a grass tuft, with no middle form.** A class is either a blob or a tree, so
the switch is enormous wherever it is put. Every class got a far-band impostor under C22; no class
ever got a mid-band. **That is the lever for SOC-4, not the radius.**

**The draw-call half is separately urgent:** the demo's worst heading spends **119 of C16's 120
calls** before a second body exists, and a body is 46.

Merging to one skinned geometry with vertex colours is also the prerequisite for reusing
`deriveImpostor`, which reads `geometry.getAttribute('color')` unconditionally
(`scatterImpostor.ts:260`) — an attribute the rig does not have. Do it against the tests that pin
`poseCharacter`, `solveLeg`, `gaitFootTarget` and `reachCharacter`; **no bone may move.**

### SOC-4.B — A multi-body layer contract ☐ · *weeks*

`buildCharacter` is called exactly once in `game/world/`, at `playerLayer.ts:157`; `playerLayer`
holds one `parts`, one `MoverState`, one camera; `PlanetWorld.addLayer` throws on a duplicate name.
`FlowHost` (`controller.ts:297`) declares `addEntity`/`removeEntity`/`setEntitySprite` and has
**exactly one reference in the repo — its own declaration.**

Port `WorldCore`'s existing machinery: the entity map, the 20-entry interpolation buffers,
`INTERP_DELAY` 100 ms, cull-on-absence, the 1.5-tile reconcile snap. *(Nobody has read `WorldCore.ts`
in full; it is the biggest single piece of client work here and has not been costed beyond "it
exists".)*

### SOC-4.C — A person impostor ☐ · *weeks*

Distant people must not be 46 draw calls each. The far-band machinery from C21/C22 is the precedent
and it must be applied **from day one, not retrofitted**. Needs a decision about which pose the
twelve-azimuth raster is taken at, with the pose error **measured rather than assumed**.

### SOC-4.D — Real reconciliation ☐ · *days*

`lastSeq` is plumbed end to end and **discarded**: `WorldCore.ts:483-485` says so in as many words —
"there is no input replay, only the hard error snap". Real reconciliation is a change to one client
function, not to the wire.

---

## SOC-5 — Player to player ☐ · *months*

*Blocked by: SOC-3.A, SOC-2.E, SOC-2.F.*

### SOC-5.A — Beyond the 1:1 lock ☐

`ActiveInteraction` holds exactly two participant ids and refuses a third; `stn_group` is one
stationary entity acted on by a cue. **A world of families and gatherings has no primitive here.**
Groups are a new primitive: the eight-field context envelope must stay valid for an N-party
interaction with per-actor fan-out, and the room enforces distance and idle per tick.

### SOC-5.B — Make the dyadic cues carry features ☐

`dialogue_turn` and `receives_turn` already fire and carry almost nothing — `receives_turn` produces
an **empty telemetry dict**, so it moves the posterior on an action-label embedding alone. Neither
has a branch in `ingest._social_features`. *Blocked on SOC-0.D.*

### SOC-5.C — Embodied first, text second ☐

`ConsentCard` promises the product reads "where you go and what you choose, **never what you type**".
**So player-to-player text is measurement-dark by promise.** The only player-to-player channel ECHO
can honestly measure is the embodied one: who you approached, who you waited for, what you gave,
whether you behaved differently with an audience. That is also the highest-signal personality read
there is, and it cannot be faked with NPCs because people know NPCs do not matter.

*This is the reason `⚑12` ("a solo session contributes almost no openness evidence") gets better
rather than worse under this direction: a shared world supplies the observed/unobserved contrast that
neither half provides alone.*

### SOC-5.D — Moderation ☐

`relayPeerChat` has **no moderation, no profanity gate, no per-turn distance check**. Human-generated
text in a shared world is a larger moderation problem than NPC output, and it is an ops commitment
(reporting, blocking, muting), not a filter. L3 removes most of the *NPC* moderation surface; it
removes none of this.

---

## SOC-6 — The society substrate ◑ · *months*

*Blocked by: SOC-2.C, SOC-2.G, SOC-3.D. SOC-0.A is answered.* **SOC-6.A exists; the rest does not.**
Still true of everything that is persisted: across all ten migrations, `NpcSpec`, the `npcs` table
and the synced `Entity`, not one field anywhere expresses age, birth, death, kinship, household,
occupation, wealth, memory-of-another-agent or a schedule — and under C25 most of that never becomes
a column at all.

### SOC-6.A — The closed-form demographic function ✅ · *done*

`society(seed, time)` — settlements, households, lineages, births, deaths, marriages — as a **pure,
DOM-free, renderer-free, node-testable module**. Shipped as `packages/planet/lib/society.ts`
(and the clock it measures in as `packages/planet/lib/worldclock.ts`), in `chooseCommons`'s idiom:
geography arrives as an injected six-number `SettlementGeography` rather than being sampled here, so
it is testable on a synthetic planet in milliseconds and SOC-6.B's ~10 s-warm/~33 s-cold per-cell
scan is not inherited.

*(Correction to this entry's own text: it named `followCamera.ts` and `controller.ts` at
`apps/web/src/game/`. Both are in `apps/web/src/game/world/`.)*

**What is pinned, in `packages/planet/tests/society.test.ts` — 19 tests:**
- **L2, the one that matters.** A lineage generated to day N is a PREFIX of the lineage generated to
  any later day: every birth-settled field of every person is asserted equal, over 60 cells and
  hundreds of people. Two bugs were caught by writing it, and the first is the one that would have
  forked the shared world in a way nobody would have found for a month: `bearChildren` originally
  truncated at the horizon, so a pair whose last child fell past the day you asked about emitted
  fewer people, **every person generated after them shifted an index, and `Person.id` became a
  function of WHEN YOU ASKED.** A delta row keyed on an id would have attached to a different human
  being. The horizon now lives in one place — the pairing loop, where advancing it only ever appends.
- **C26.** `alive` is exactly `birth + lifespan > day`; nobody is alive before birth or on the day
  they died; nobody outlives the ceiling; child deaths land inside childhood. (The second bug: an
  incomer's age was drawn as an offset from their PARTNER'S birthday, so a twelve-year-old could
  marry in and the "already dead on arrival" repair then gave them a thirteen-year life — a
  fourteen-year-old adult smuggled into a mortality model that has exactly two draws in it.)
- **Bounded history**, capacity damping, and `MAX_PEOPLE` reporting `truncated` rather than capping
  silently. **Kinship**: no pairing with a parent, child or sibling; parents older than children and
  alive at the birth; `relation()` terminating on a married couple, which is the recursion the naive
  in-law check falls into. **Households** standing until the last person in them is gone.
- **Design Law 1**: a structural assertion that no field of a `Person` or a `Settlement` is named
  like a ladder — score, level, xp, points, rank, wealth, gold, coin, reputation.

*Marked ✅ on the tests deliberately, and §0.3 permits it here for the one reason it does not permit
it elsewhere: this module has no framebuffer. It draws nothing, mounts nothing and touches no socket
or database, so there is no render-blind gap between what the harness sees and what a person would.*

**Bound the history.** Settlements have a founding date, not an infinite past — at most 300 years
(`FOUNDING.maxYearsAgo`). Dwarf Fortress generates a few hundred years and stops; that is enough for
everything to feel deep.

### SOC-6.B — Placement from geography, not authorship ✅ · *done — `packages/planet/lib/geography.ts`*

Farmers on arable land, fishers on coasts, mining in mountains, rich at trade-route junctions, poor
at the ends — **derived**, and now measured: farmer 20.3%, trader 10.5%, herder 9.0%, miner 4.9%,
fisher 1.7% of a 2.5 M-person planet (`C33`). Fishers are rare because `coastal` needs water inside
3 km and most land does not have it, which is the ground deciding rather than a table.

**⚠️ THE COST WARNING WAS AIMED AT THE WRONG THING.** `lib/planet.ts:12,44`'s 284,004-cell scan is
the REGISTRY's (`registry()` → `new MemoryRegistry`), not `planet()`'s — that header has been stale
since the registry became lazy, and `app/claim/page.tsx:5` repeats the error. Measured: `planet()` is
~160 ms; the scan is 9.78 s and nothing in this workstream needs it. **Geography is 0.089 ms per
cell**, 0.63 ms for a whole k=1 parcel disk — 190× cheaper than one 60 Hz frame — and `settlementAt`
on the same cell is 3.5–4.4 ms, **40–50× more**. Geography was never the expensive half. On demand,
per visited cell, exactly as L1 wants.

**THE FINDING THAT SHAPED THE MODULE: a cell is too small to have a geography.** The height field's
finest expressible feature is ~1.56 km and a resolution-4 cell is 1,294 m across, so a cell's own
49-point descendant grid returns a SINGLE biome for 82.3% of resolution-4 cells and 98.3% of
resolution-7 ones, and a land fraction of exactly 0 or 1 for 94.9–99.5%. **The cell supplies a
position and a frame; the geography is a property of the ground around it.** So the sample is a 3 km,
91-point metric disk — which also makes the reading resolution-INDEPENDENT, and that is the L2
property a subdividing registry needs: a parcel and the seven children it becomes must agree about
where they are. Pinned two ways in `tests/geography.test.ts`, parent-against-child and the same
lat/lng at resolutions 4 through 7 (spread < 1e-9).

**Five of the six numbers are read off the ground; the sixth is invented and says so** — `C32`.
`tradeAccess` has no source at all, could not come from the neighbours' settlements (unbounded mutual
recursion, and an L2 violation), and could not come from `referral.ts` (`gridDistance` throws on 85%
of far resolution-4 pairs). It is distance to the nearest of the twelve commons, which ASSERTS that
the twelve public cells are where trade converges. Safe to take now only because C25 means zero rows.

**✅ AND THE DENSITY WAS CHOSEN, not left where it fell — `C33`.** The first measurement was 33.8% of
cells settled: 96,088 settlements, 2.55 M people, a village every 2.2 km. §5 says this direction does
not go breadth-first, and one cell in three is not that world. `SETTLEMENT_RATE` 0.3 makes it
**9.4% of cells, 26,602 settlements, 619,413 people, a village every ~4.1 km — about a 41-minute
walk** with real ground in between. It is a HISTORY dial and not a geography one: `habitable` stays
at 55.7% across both rows, which is the check that the ground did not move.

### SOC-6.C — The sparse delta layer ☐ · *weeks*

Only touched things get rows (L1). Every player-linked table must join the erasure cascade — which
forces an early answer to **what "delete this player" means when a player has married into an NPC
lineage.**

### SOC-6.D — Extend the Entity schema, only after SOC-3.D ☐

Every added `@type` field is a per-tick delta against a 64 KB buffer sized by prose for ~110
entities, and the failure mode is total. The **synced vs server-only split** (`state.ts` already
draws it) is the load-bearing decision and cannot be made without a byte count.

### SOC-6.E — A per-entity agent update slot ☐

`WorldRoom.ts:911-966` is the entirety of NPC behaviour: a hash-seeded two-state wander at 20 Hz,
alongside an **O(n) interaction-membership scan per NPC** and O(n) audience counts per social event.
Whatever schedules an agent's day fits in that slot or moves off the tick — and the per-tick wall
time at any entity count **has never been measured on this server**.

### SOC-6.F — NPC memory, and the fate of the BALD probe set ☐

`ActiveInteraction.history` starts empty and is destroyed at close; nothing reads the `interactions`
table back; `PEER_HISTORY_CAP` is applied only to peer chat, so the NPC branch re-sends an unbounded
transcript every turn. **An NPC meets every player for the first time, every time.** "Every NPC has
its own life and knows the others" is a memory-store problem before it is a model problem.

**The unresolved tension:** `npcgen.ts:2-4` says the 100 NPCs are a designed stimulus set covering
persona space, and `bald.select_npc` chooses among them to maximise information gain. If NPCs become
people with jobs and families, their axis vectors come from a demographic model, not a design grid,
and **the director's candidate set stops being a spanning probe set.**
*Recommendation on record:* **geography places people; BALD selects among those already nearby.** A
nudge, not a teleport. Decide whether the probe set survives as a separate population, is abandoned,
or is folded in.

### SOC-6.G — Enumerate the society cues against the existing catalogue ✅ · *done, and it changed SOC-0.D's shape*

**The list exists now**, and four of the six classes needed ZERO new cue IDs:

| Class | Verdict |
| --- | --- |
| **Kinship** | **NOT a cue gap — an ENVELOPE gap.** `CounterpartStatus` is a status ladder with no relational value, and `WorldRoom` stamps every live player `peer`. Catalogue G2 is already the right read; it has no kin value to condition on. Inventing a cue id here would be the wrong edit. |
| **Being-known** | **The same envelope gap, plus a missing memory store.** `first_contact` fires on EVERY user↔user open — there is no seen-pair set and no migration stores who has met whom, so meeting one person and meeting a hundred are indistinguishable. |
| **Employment** | **Had cues, on the WRONG IDS.** `work_shift`/`shirk_work` sat on **C8** ("deliberation under pressure") and `take_vocation` on **C9** ("tempo consistency") — two cues that mean something else and that `coverage-matrix.md` builds axis claims on. |
| **Transaction** | **Covered as measurement, substrate absent.** `bargain_hard` → dominance +0.410; `fairness_split_fair`/`treat_other` → warmth +0.700. No new construct needed. |
| **Bereavement** | **Genuinely new.** Channel I stopped at I6 and covers loss of a wager, not loss of a person. → **I7**. |
| **Inheritance** | **Genuinely new.** The nearest rows are all within-generation. → **F13**. |

**The never-renumber rule was ALREADY breached in shipped code, before any society cue.** Beyond the
C8/C9 squatting, `eat_meal` and `host_table` shipped as **G13/G14** with no catalogue row at all. Both
are fixed the way the rule requires: the squatters move to new rows (**C11**, **C12**, and
`transact_neutral` off G12 — "reciprocity tracking" — onto **G15**), and G13/G14 are **RATIFIED at
the ids they already carry**, never renumbered.

Six rows added to `cue-catalog.md`: **C11 C12 F13 G13 G14 G15 I7**. Two of its own numbers corrected
in the same pass (`W (8 × 62)` → `(8 × 66)`, "16-dim telemetry block" → 20-dim, both verified against
`measurement.npz`).

**Safe because the ids are not what ingest dispatches on** — and that claim is narrower than it
sounds, so it is written narrowly: `ingest.py`'s generic block DOES read cue-id prefixes, but only
F1/F3/F7/F9, D11, G11, H1 and K1/K11, and none of the moved ids is one of them. The four actions are
each dispatched by name. `test_stand_food_work.py` passes unchanged, which is the demonstration.

**`packages/shared/tests/cueCatalog.test.ts` is the join that could not exist before**: `CueId` is a
template-literal type, so the compiler accepts any letter-and-digits string, and the catalogue is
prose. Neither side could see the other. It now fails on an unlisted id, a duplicate row, a
channel/id mismatch, and specifically on C8/C9/G12 being re-taken.

`packages/shared/src/social.ts` holds ~50 actions; `cue-catalog.md` holds the A–K channel IDs with a
**"never renumber"** rule. **Nobody has produced the list:** which of kinship, bereavement,
employment, transaction, being-known and inheritance already has a cue, which needs one, and which of
those has a `W` direction. That list does not exist and SOC-0.D cannot be taken well without it.

### SOC-6.H — Make mortality visible through artifacts, not through waiting ☐

Ageing is only legible to a *returning* player, so the payoff is entirely in retention while the cost
is paid up front. First session must carry the evidence: graves, an old person talking about someone
dead, a half-built house, "in my father's time this was…". **Do not make the player wait to be shown
that time passes.**

### SOC-6.I — Relationship inheritance ☐

When an NPC dies, its record of you does not die with it — it **transfers, degraded**. The baker's
daughter has *heard* you were kind to her father: less detail, second-hand sentiment. This is the
compression you wanted anyway, and it is a stronger continuity than a baker who never dies. It is
also the highest-signal measurement moment the world can offer.

---

## SOC-7 — Economy and regional development ☐ · *months*

*Blocked by: SOC-0.F, SOC-2.C, SOC-6.E, SOC-0.A.* **Zero code exists** — no balance, no item, no
ledger, no server-side transaction. The trader is an entity whose only fields are `role: "trader"`
and `status: "peer"`; `bargain_hard` and the fairness-split cues exist purely as measurement labels.

### SOC-7.A — Simulation-visible, player-inert, first ☐

Prices move, trade routes matter, a village visibly gets rich — and players do **not** arbitrage it.
Opening it later is easy; closing it later is impossible. The land registry is already a scarce-good
market with a waitlist, and a player-exploitable economy touches it.

### SOC-7.B — The Design Law 1 exemption ☐

No XP, no score, no levels, no points — with a grep-able CI invariant. Wealth ladders and reputation
scores need an **explicit written exemption or a different shape**. Do not let an economy quietly
reintroduce a ladder.

### SOC-7.C — Developed vs undeveloped, derived ☐

Falls out of geography + resources + trade distance + settlement age. Authored tiers are the failure
mode: they read as set dressing, and they are the thing L2 exists to prevent.

---

## §5. What this plan deliberately does not do

- **It does not run 1.4 M LLM agents.** Even five people per parcel is 1,420,020 agents; Stanford's
  Smallville was 25 and cost thousands of dollars for two simulated days. The LLM is spent **only at
  the point of contact**, bounded by how fast a human can talk. Depth where the player is looking,
  consistency everywhere else.
- **It does not ask the model to make NPCs different.** A thousand personalities written by one
  model is one personality in a thousand hats. Differentiation comes from the **substrate** —
  different circumstances, histories and material interests — which is a design constraint, not a
  prompt.
- **It does not go breadth-first.** Twenty people whose lives actually interlock read as more real
  than ten thousand carrying LLM-generated flavour text. A planet of shallow people reads as fake
  *faster* than an empty one.
- **It does not let players burn down the mill.** L3. If that is wanted, it is a different and much
  larger commitment and must be decided in SOC-0, not discovered in SOC-6.

---

## §6. Open questions nobody in this repo has answered

Listed because an unasked question is more dangerous than an unfinished task.

1. **What does "one shared world" mean at planet scale** — a planet, a region, a parcel, a
   settlement? (SOC-0.B)
2. **Where does a simulation tick run?** There is no host for one. (SOC-3.E)
3. **How many bytes is a Colyseus state patch?** Never measured; the failure mode is total.
   (SOC-3.D)
4. **What is the shipped whole-frame cost, on any machine, with all layers?** Never measured.
   (SOC-1.A)
5. **Which migrations does production actually have?** Unanswerable today. (SOC-2.C)
6. **What are the society's cues, and does `W` have a direction for any of them?** The list does not
   exist. (SOC-6.G)
7. **What is a player's server-side identity?** Today: a localStorage UUID that never becomes a row
   unless they sign up through the old island flow. (SOC-2.E)
8. **Does the BALD probe set survive a peopled world?** (SOC-6.F)
9. **What is the human-in-a-real-browser gate for a populated world, and who runs it?** The suite is
   structurally render-blind and every visible NPC adds a defect class it cannot see. (§0.3)
10. **What does erasure mean when a player has married into an NPC lineage?** (SOC-6.C)

---

## §7. The shortest honest path to knowing whether this works

Not the planet. Not even a village, at first.

1. ~~**SOC-0** — take the three decisions.~~ ✅ `C24`–`C27`.
2. ◑ **SOC-1.A** — get one real frame number, including a phone. **The machine number exists and it
   is bad: 907,250 against 600,000 (`C28`).** The phone reading is still owed, and it now matters
   more rather than less.
3. **SOC-4.A + SOC-4.B against a fake snapshot source** — put a second body in a parcel with no
   server involved. This proves the render half without waiting on SOC-3. **Re-ordered by C28:**
   SOC-4.A is no longer "make the rig affordable to draw more than once", it is *make the frame fit
   at all*, and the rig is one term in it. A body is ~15,868 triangles and ~46 draw calls onto a
   frame that is already 50% over.
4. ~~**SOC-6.A** — write `society(seed, time)` as a pure module with node tests.~~ ✅ Shipped as
   `packages/planet/lib/society.ts` with `worldclock.ts`, 19 + 5 tests. It needed nothing else to
   exist, exactly as this step predicted — and the two bugs it caught were both invisible to a type
   checker and fatal to a shared world.
5. **Then, and only then**, one settlement on one commons cell: substrate + schedules + LLM at
   contact. Stand in it for five minutes and ask whether it reads as the real world or as a chatbot
   in a hat.

**The next honest step is 5-minus-one: put `society(seed, time)`'s output on the ground.** SOC-6.B
(geography → the six numbers `SettlementGeography` already takes) is now the only thing between a
lineage that exists and a village you can stand in — and it is deliberately the one seam the module
was built around, so it is an additive change to one function rather than to the substrate.

Stanford's result is that ~25 agents is enough for emergent social behaviour to be legible. **If
twenty do not feel alive, 1.4 million will not either** — and step 5 answers that in weeks rather
than in the months SOC-3, SOC-6 and SOC-7 would otherwise spend first.

One more thing about density, because it is the quietest threat: 284,004 parcels and players spread
across them means two people will essentially never meet by chance, and **a shared world where you
never see anyone is worse than a single-player one — it advertises loneliness.** The registry already
supplies the answer: there are twelve named commons cells, public, owned by nobody. **Commons are
where people are; parcels are where you live.** Build the social layer there first.
