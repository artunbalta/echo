# ECHO — Build Plan: from proof-of-magic to the life-simulation

> A phased, implementation-level plan for turning ECHO from an AI-mirror demo into a
> permadeath life-simulation whose gameplay loop **is** the data-collection loop for a
> personal agent — and, ultimately, the part of you that outlasts your one life.
>
> This document is the *what* and the *why*, down to files, schemas, and contracts. It is a
> living checklist; check boxes as workstreams land. It deliberately front-loads **proof**
> and back-loads **breadth**. Nothing here is built yet.

**Status legend:** ☐ not started · ◑ in progress · ✅ done · ⛔ gated (blocked on a prior gate)

---

## 0. How to read this document

1. **§1 Thesis** explains why the phases are ordered the way they are. Read it once; it is the
   contract every phase answers to.
2. **§2 Current state** maps what already exists in the repo, so each phase says *reuse X* vs
   *build Y* honestly.
3. **§3 The spine** (behavioral featurization) and **§4 Cross-cutting concerns** thread through
   every phase. Build them incrementally, not all at once.
4. **§5–§9** are the phases. Each phase has: strategic role → prerequisites/gate → workstreams
   (files, schemas, contracts, notes) → **definition of done + validation metric** → effort.
5. **§10 Critical path**, **§11 Risk register**, **§12 Open decisions**, **§13 Appendices**.

**The single rule:** a phase does not start until the prior phase's *validation metric* is met.
"Coherent design" ≠ "validated design." We have spent four iterations making the design
coherent; from here the only currency is evidence.

---

## 1. Thesis (the why behind the order)

ECHO's differentiator is not the world and not the LLM. It is a claim:

> **If a person makes irreversible choices under scarcity, the choices reveal who they
> actually are — well enough that an agent trained on them is valuable.**

Everything follows from stress-testing that claim as cheaply as possible.

**1.1 The spine: signal moves from *words* to *choices*.**
Today the learning engine reads mostly what you *say* — `FEATURE_DIM = 50 = 32` embedding-
projection `+ 14` stylometry `+ 4` telemetry (`services/ml/echo_ml/config.py`). The whole
vision rides on reading what you *choose*. The central technical program of this plan is to
grow the behavioral/telemetry portion of the feature vector and re-anchor the learned
measurement matrix `W` so that allocation, timing, risk, and solitude choices move the persona
posterior. See **§3**.

**1.2 Permadeath is load-bearing, not flavor.**
The reason in-game behavior usually fails to predict real behavior is the *absence of
irreversible consequence* (the "magic circle"). One life, no respawn, removes that. Scarcity +
irreversibility is exactly the condition under which revealed preference is valid. So
permadeath is the mechanism that makes the data *real*. We must not quietly add "restart" — it
would refund the validity we paid for.

**1.3 The pet bootstraps the cold start — for data and for warmth.**
A solitary opening island is, for a social product, backwards: the most fragile moment (first
10 minutes) becomes a lonely grind, and the agent has nothing to learn from yet. A companion
animal fixes both: it gives the persona model a conversational partner from minute one, and it
turns solitude from *empty* into *intimate* (Cast Away's Wilson; Animal Crossing's tone).
**Design constraint:** the pet must be a *neutral elicitor*, not a character — see **§4.2**.

**1.4 Death means the echo persists (legacy framing).**
The chosen end-state (see **§12 Open decision D1**, recommended resolution baked into this
plan): when a life ends, the echo it produced *remains*. ECHO is then not "an assistant that
runs errands" but "the part of you that outlasts your one life." This is on-brand with the
existing melancholic tone ("a country that does not exist… no one knows you here, not even
you") and makes the agent the emotional core rather than a utility bolt-on.

**1.5 Validation gates every phase.**
Each phase ships an instrument that answers "did this actually work with real humans?" If the
answer is no, we stop and fix the design before spending on the next, more expensive phase.

---

## 2. Current state of the repo (reuse vs build)

What exists today (verified by reading the tree), so phases can be honest about leverage:

| Area | Path | State we inherit |
|---|---|---|
| Client world (render, input, camera) | `apps/web/src/game/PixiWorld.ts`, `tilemap.ts` | PixiJS world, 64×64 procedural map (seed=7), proximity interaction, glow/ping. **Reuse for the island.** |
| Telemetry collector | `apps/web/src/game/telemetry.ts` | Batched, debounced `emit(type, payload)`; flushes to realtime → ML. **Reuse; extend taxonomy.** |
| World UI shell | `apps/web/src/components/WorldClient.tsx` | 1170-line client: HUD, conversation panel, "let my echo answer", roster. **Reuse pieces; new island shell.** |
| Recognition surfaces | `EchoPanel.tsx`, `RecognitionMeter.tsx`, `OutcomesPanel.tsx`, `EchoActivityPanel.tsx` | Posterior visualization, recognition meter, outcomes. **Reuse for the dusk reading.** |
| Identity / onboarding | `apps/web/src/app/onboard/`, `components/AuthModal.tsx`, `lib/useEcho.ts` | Consent → identity → reveal; anon identity. **Reuse; extend to persistent life.** |
| LLM grounding pattern | `apps/web/src/lib/connections.ts` | Server-only, Claude-with-key / heuristic-fallback, strict-JSON, grounded-to-transcript. **Copy this pattern for pet + dusk reading.** |
| Realtime authority | `apps/realtime/src/WorldRoom.ts` | Single Colyseus room; players+NPCs; relays peer chat; forwards `/observe`,`/telemetry`,`/npc/turn` to ML. **Single instance — see Phase 2 infra.** |
| Wire protocol | `packages/shared/src/protocol.ts` | `TelemetryType`, `TelemetryEvent`, `INTERACT_TURN`, chat. **Extend with behavioral events.** |
| World constants | `packages/shared/src/world.ts` | Tile 16px×3, 20Hz tick, 4 tiles/s, room cap 150, interaction radius 1.5. |
| Persona axes | `packages/shared/src/persona.ts` | 8 bipolar latent axes. **Audit whether they can express the sim's value dimensions — §3.3.** |
| NPC generation | `packages/shared/src/npcgen.ts` | 100-NPC spanning set (seed=1337). **Reuse for islanders/visitors later.** |
| ML engine | `services/ml/echo_ml/*` | Full-cov Bayesian persona (`persona.py`), learned `W` (`persona_model.py`), reward (`reward.py`), calibrated autonomy gate (`gate.py`, `autonomy.py`), BALD (`bald.py`), FastAPI loop (`app.py`). **The crown jewel — extend, don't replace.** |
| ML config / hyperparams | `services/ml/echo_ml/config.py` | `persona_dim=8`, `embed_proj_dim=32`, autonomy thresholds (`alpha_promote=0.80`, `n_promote=8`, `ece_promote=0.10`). |
| Measurement artifact | `services/ml/echo_ml/artifacts/measurement.npz` + `scripts/train_measurement.py` | Learned `W (8×F)` via FA + anchoring. **Re-fit when F grows — §3.2.** |
| DB | `db/migrations/0001_init.sql`, `db/seed/` | Supabase (Postgres + pgvector), NPC seed. **Add life/island/choice tables — Phase 1.** |
| Brand-stand demo | `apps/web/src/app/{venue,dashboard}/`, `lib/venue/*` | Self-contained B2B intent-research demo. **Optional funding wedge — Phase 4.** |

**Net:** the ML brain, the renderer, the telemetry pipe, the LLM-grounding pattern, and the
autonomy gate already exist. The new work is (a) the behavioral spine, (b) the island/pet
single-player loop, (c) persistence + permadeath, (d) instanced islands + seas, (e) the legacy
payoff. Most of Phase 3 is *wiring existing pieces*, not new ML.

---

## 3. The spine — behavioral featurization (cross-cutting, build incrementally)

This is the most important technical program in the plan. Every phase adds to it.

### 3.1 Event taxonomy (client → realtime → ML)

Extend `TelemetryType` in `packages/shared/src/protocol.ts`. Each event is emitted via the
existing `TelemetryCollector.emit(type, payload)` (`apps/web/src/game/telemetry.ts`), batched,
and forwarded by `WorldRoom` to ML `/telemetry`. New behavioral events (introduced across
phases, listed here once):

```ts
// packages/shared/src/protocol.ts  (additions)
type BehavioralTelemetryType =
  | "choice_made"      // a fork was resolved        payload: { forkKey, option, optionsShown, latencyMs, dayIndex }
  | "allocation"       // budget spent on a category  payload: { category: "earn"|"learn"|"social"|"leisure"|"build", units, ofBudget }
  | "resource_bet"     // a risky/safe economic bet   payload: { stake, expectedValue, variance, chosenRisk: "safe"|"risky" }
  | "pet_talk"         // a turn spoken to the pet     payload: { chars, valence, turnIndex, underStress }
  | "leave_intent"     // progress toward escaping     payload: { stage, dayIndex, shipProgress01, secondsAlone }
  | "structure_progress" // building effort            payload: { structure: "ship"|..., delta01, sessionSeconds }
  | "fork_deliberation"  // hover/undo-attempt before commit  payload: { forkKey, hovers, msDeliberated }
```

**Privacy:** `pet_talk.valence` is a derived sentiment scalar; raw pet dialogue text is
consented telemetry like any message and is covered by the existing deletion cascade
(`DELETE /user/{uid}`). Keep raw text minimal/optional; the *features* are what the model needs.

### 3.2 Feature vector growth + re-anchoring `W`

Today `φ = concat(embed_proj[32], stylometry[14], telemetry[4])`, `F = 50`, and `W` is
`(8 × F)` in `artifacts/measurement.npz`. To make choices move the posterior:

1. **Define a behavioral feature block** (target ~12–16 dims) computed by aggregating the
   §3.1 events over a rolling window (per day / per session). Concrete features:

   | Feature | Source events | Reveals |
   |---|---|---|
   | time-share: earn / learn / social / leisure / build (5 dims) | `allocation` | revealed priorities (achievement vs affiliation vs leisure) |
   | save-rate = saved / earned | `choice_made`, economy | future-orientation / delay discounting |
   | risk index = E[chosen variance] | `resource_bet` | risk tolerance |
   | solitude-tolerance = f(time-to-first `leave_intent`, ship start stage) | `leave_intent` | social need / introversion |
   | pet-attachment = volume × frequency × stress-talk | `pet_talk` | attachment, coping style |
   | decision latency (mean, normalized) | `choice_made.latencyMs` | impulsivity vs deliberation |
   | persistence = finished / started structures | `structure_progress` | conscientiousness / grit |
   | consistency = variance of choices across days | all | stability vs volatility (feeds trait/state split) |

2. **Grow `F`** from 50 to ~62–66. Update `config.py` (`TELEMETRY` block length) and
   `persona.py` `FEATURE_DIM`; keep embedding+stylometry blocks unchanged so existing
   behavior is preserved.

3. **Re-anchor `W`.** Run `services/ml/echo_ml/scripts/train_measurement.py` with **anchors**
   that map the new behavioral features to persona axes (semi-supervised FA anchoring already
   supported). Example anchors: high `save-rate` → +future-orientation axis; high `risk index`
   → +risk axis; low `solitude-tolerance` → +social-need axis. Commit the new
   `artifacts/measurement.npz`. The heuristic fallback (no artifact) must still produce a
   sane `W` so a clean checkout runs key-free.

4. **Keep the robust update honest.** The Student-t / Mahalanobis-gate update in
   `persona.robust_kalman_update` already prevents a single weird choice from rewriting the
   doppelgänger. Behavioral features should use the heteroscedastic noise path so a single
   day can't dominate; only consistent choices across days should move trait `z` (the
   trait/state split `K_state=4` marginalizes a "bad day").

### 3.3 Audit the 8 persona axes

Open `packages/shared/src/persona.ts` and confirm the 8 bipolar axes can *express* the value
dimensions the sim reveals: future-orientation (delay discounting), risk tolerance,
solitude/social need, achievement-vs-affiliation, conscientiousness/persistence. If the
current axes (originally tuned for conversational persona) cannot express these, remap or
replace 2–3 of them. **This is a design decision to make before Phase 0.4 anchoring** — the
axes are the target space `z` that `W` projects onto; they must be able to hold what the sim
measures. Document any axis change in `README.md` §18 (the assumptions table).

---

## 4. Cross-cutting concerns (apply in every phase)

### 4.1 Validation harness (the actual product of Phase 0; persists forever)

A consented, key-free instrument that captures, after any echo "reading":
- per-line self-rating: *"this is me" / "not me"* on each statement the echo makes;
- an overall accuracy score (1–5).
Stored via `apps/web/src/lib/funnel.ts` / telemetry (localStorage + ML when consented). Define
explicit pass/fail thresholds per phase (see each phase's DoD). Without this number we are
flying blind; it is built first and never removed.

### 4.2 The pet as a neutral elicitor (observer-effect guard)

The pet's prompt must elicit, not impose. If the pet has a strong valence, it steers the
user's input and we measure our prompt instead of the person. Rules for the pet system prompt
(kept in a dedicated, versioned file beside `apps/web/src/lib/agent.ts`):
- low-valence, open-ended, mostly listening/mirroring; short turns;
- never proposes opinions, plans, or judgments; asks "what / how / why" not "don't you think…";
- never role-plays a personality with traits that could bleed into the user.
Later (Phase 2.4) we *measure* the residual bias by comparing pet-phase persona to human-phase
persona and calibrating.

### 4.3 Ethical valve for the lonely long tail (Phase 2 onward)

Social gravity means a few islands become hubs and most do not. In a permadeath world where
escaping loneliness is the goal, an unvisited island is a *permanent* rejection with no reset.
Build a valve from the start of the social phase: the pet fills the gap, a matchmaking nudge
("someone wondered about you"), and a guaranteed minimum of inbound attention. This is both an
ethics requirement and a retention requirement (it saves the bottom ~80%).

### 4.4 Privacy & deletion (never regress)

Every new derived store (life, choices, persona snapshots, visits, pet features) must be
covered by the existing hard-delete cascade (`DELETE /user/{uid}` in `services/ml/echo_ml/app.py`
and the account deletion path). Selfies remain discarded-after-attributes (Phase 3 of the old
roadmap). KVKK + GDPR posture is a non-negotiable invariant.

### 4.5 "Always runnable, key-free" invariant

Per the repo's philosophy, every phase must run with zero external keys via mocks (procedural
art, mock pet dialogue, in-memory persistence, hash-mock embeddings). A missing key changes
behavior, never breaks the build. Validation runs, however, need real keys (`ANTHROPIC_API_KEY`,
`VOYAGE_API_KEY`) to produce a real signal.

---

## 5. Phase 0 — Proof of Magic (single-player) 🎯 PRIORITY

**Strategic role:** prove §1's thesis as cheaply as possible. A stranger plays one
irreversible day with a pet; at dusk the echo's reading is *eerily accurate*. No multiplayer,
no seas, no economy depth, no infra. This phase exists to produce **one number** (§4.1) that
says go / no-go for the entire company.

**Prerequisite/gate:** none (this is the start). **Do §3.3 axis audit first.**

**Estimated effort:** ~2–4 weeks.

### Workstream 0.A — Single-player island scene ☐

- **New route:** `apps/web/src/app/island/page.tsx` (+ an `IslandClient.tsx` modeled on the
  structure of `WorldClient.tsx`, but stripped of multiplayer/roster).
- **Reuse renderer:** `apps/web/src/game/PixiWorld.ts` + `tilemap.ts`. Generate a small island
  (water-bordered subset of the tilemap; a new `islandMap.ts` or a parameter on the existing
  generator). Constants stay in `packages/shared/src/world.ts`.
- **No Colyseus.** Single-player state lives client-side + server actions; do **not** touch
  `apps/realtime/src/WorldRoom.ts`. (This keeps Phase 0 free of netcode entirely.)
- **DoD:** a player spawns on a small island, moves (WASD/touch), nothing else present except
  the pet.

### Workstream 0.B — The pet (neutral elicitor) ☐

- **Dialogue path:** reuse the NPC dialogue contract (`/npc/turn` → Claude with key, mock
  otherwise) but with the dedicated elicitor system prompt from §4.2 (new file, e.g.
  `apps/web/src/lib/pet.ts`, server-only, mirroring `connections.ts` structure).
- **Entity:** a single companion sprite on the island (reuse the 16×24 sprite spec,
  `packages/shared/src/sprite.ts`); proximity-interactable like NPCs.
- **Emit `pet_talk`** events (§3.1) on each user turn: chars, derived valence, turnIndex,
  underStress flag.
- **DoD:** the player can talk to the pet; turns produce `pet_talk` telemetry; the pet never
  imposes valence (reviewed against §4.2 checklist).

### Workstream 0.C — The day: scarcity + irreversible forks ☐

- **Day loop:** a bounded time/energy budget per day. A small fixed number of **irreversible**
  forks (2–3), e.g.:
  - *plant/save vs spend now* (future-orientation);
  - *start the ship vs stay* (solitude tolerance — and the seed of Phase 2 travel);
  - *spend the day's budget* across earn/learn/social/leisure/build (revealed priorities).
- **Irreversibility:** within the session there is no undo. (Full cross-session permadeath is
  Phase 1; here we only need the day to commit.)
- **Emit** `choice_made`, `allocation`, `resource_bet`, `leave_intent`, `structure_progress`,
  `fork_deliberation` (§3.1).
- **DoD:** a full day can be played to dusk; every fork writes a behavioral event; choices feel
  consequential (no take-backs).

### Workstream 0.D — Behavioral featurization v1 (the spine, §3) ☐

- Implement §3.1 events end-to-end; §3.2 feature block (subset sufficient for the Phase 0
  forks: save-rate, time-share, solitude-tolerance, pet-attachment, decision-latency).
- Grow `F`, update `config.py` + `persona.py`, re-anchor `W` via `train_measurement.py`, commit
  the artifact. Keep the heuristic fallback working.
- Pipe events to ML `/observe` + `/telemetry` (single-player can POST directly to the ML
  service or via a thin Next API route `apps/web/src/app/api/island/observe/route.ts`).
- **DoD:** after a played day, `GET /persona/{uid}` shows the posterior `μ` moved along axes
  that correspond to the player's actual choices (sanity-checkable by hand on a few scripted
  playthroughs).

### Workstream 0.E — The dusk reading (payoff) ☐

- **Server action** (new `apps/web/src/app/api/island/reading/route.ts`) that calls
  `GET /persona/{uid}` for real posterior (`μ`, traits, uncertainty) and grounds an LLM
  rendering of it — *specific and honest*, never flattering — citing the day's actual choices.
  Copy the structure of `connections.ts` (key → Claude strict-JSON; no key → deterministic
  heuristic, flagged `mocked: true`).
- **UI:** a dusk "reading" screen; reuse `RecognitionMeter.tsx` + `EchoPanel.tsx` visual
  language. Each statement bound to a real axis/behavior ("you started the ship early — low
  tolerance for solitude; but you saved — you invest in a future you expect to reach").
- **DoD:** at dusk the player sees 4–7 grounded statements, each tied to a real posterior axis
  and a real choice they made.

### Workstream 0.F — Validation harness (§4.1) ☐

- After the reading: per-line *"this is me / not me"* + overall 1–5; logged via `funnel.ts`.
- **Pass threshold (set before testing, e.g.):** across ≥20 strangers, mean accuracy ≥ 4.0 and
  "this is me" rate ≥ 70%, with the *specific* (not generic) statements scoring as high as the
  generic ones (guards against Barnum/horoscope effect — include 1–2 deliberately generic
  control statements and require the specific ones to beat them).
- **DoD:** a dashboard (reuse `dashboard/` patterns or a simple page) shows the live metric.

### Workstream 0.G — Run the test ☐

- Deploy the single-player island (Vercel; no realtime needed). Enable `ANTHROPIC_API_KEY` +
  `VOYAGE_API_KEY` for real signal. Recruit 20–50 strangers. Collect the metric.
- **GATE DECISION:** thesis holds → proceed to Phase 1. Thesis fails → iterate forks / featurizer
  / axes; do **not** build Phase 1+.

**Phase 0 definition of done:** a real-user accuracy number above the pre-registered threshold,
plus the qualitative "how did it know that" moment captured. This number unlocks everything.

---

## 6. Phase 1 — One Life: persistence, irreversibility, the meaning of death

**Strategic role:** make the single life real, persistent, and irreversible across sessions;
define the end-state as **legacy** (the echo persists). This is where permadeath becomes load-
bearing for data validity *and* the emotional spine.

**Prerequisite/gate:** Phase 0 metric met.

**Estimated effort:** ~3–4 weeks.

### Workstream 1.A — Persistent identity & life ☐

- Extend `apps/web/src/lib/useEcho.ts` + `components/AuthModal.tsx` to upgrade anon → persistent
  account (Supabase auth already wired via `lib/supabase.ts` / `supabaseAdmin.ts`).
- **New migration** `db/migrations/0002_life.sql`:

```sql
-- one row per life; a user gets exactly one active life
create table life (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('alive','ending','echo_persists')) default 'alive',
  born_at timestamptz not null default now(),
  ended_at timestamptz,
  age_ticks bigint not null default 0
);
create table island_state (
  life_id uuid primary key references life(id) on delete cascade,
  seed int not null,
  resources jsonb not null default '{}',
  structures jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
-- append-only; the irreversibility ledger
create table choices_log (
  id bigserial primary key,
  life_id uuid not null references life(id) on delete cascade,
  day_index int not null,
  fork_key text not null,
  option_chosen text not null,
  latency_ms int,
  context jsonb,
  ts timestamptz not null default now()
);
create table persona_snapshot (
  life_id uuid not null references life(id) on delete cascade,
  ts timestamptz not null default now(),
  mu jsonb not null, sigma jsonb not null, traits jsonb, ece real
);
```

- **DoD:** a returning user resumes the same life, island state, and accumulated choices.

### Workstream 1.B — Irreversible economy ☐

- Plant → earn → accumulate → **unlock "right to leave the island"**. All transactions are
  append-only into `choices_log`; nothing is refundable. The economy is the scarcity that makes
  forks meaningful.
- Feed the economy choices into the §3 featurizer (save-rate, risk index now have real,
  cross-session data).
- **DoD:** earning and spending persist; the "leave" right is gated on real accumulation; the
  ledger is append-only (no edit/delete except the full GDPR cascade).

### Workstream 1.C — Life state machine + the death/legacy definition ☐

- Implement `alive → ending → echo_persists`. Decide the *ending trigger* (Open decision D2:
  fixed lifespan in ticks / age, or a narrative trigger). On end:
  - freeze the final `persona_snapshot` as the **echo of record**;
  - the island becomes a visitable memorial / the echo continues (Phase 3 payoff);
  - **no rebirth.** A new account = a new life; the prior echo persists separately.
- **DoD:** a life can reach its end; the echo snapshot is preserved; there is no restart path
  that refunds irreversibility (validity invariant, §1.2).

### Workstream 1.D — Legacy seed in UI ☐

- Thread the "what remains" framing through the HUD and the dusk reading: the echo is being
  built as the thing that outlasts the life. (Full payoff is Phase 3; here it is foreshadowed.)
- **DoD:** the player understands, before the end, that the echo is their continuation.

**Phase 1 definition of done:** a continuous, persistent, irreversible single life with a
defined legacy end-state, all choices feeding the persona. Validation metric: **session-2
return rate** and **choice-volume per life** (do irreversible stakes increase or paralyze
engagement? watch for loss-aversion paralysis, §11).

---

## 7. Phase 2 — Seas: instanced islands, visiting, social gravity (infra-heavy)

**Strategic role:** turn the single-player proof into a social product; collect the social-
gravity signals; calibrate the pet→human transfer; protect the long tail. This is the heaviest
infrastructure phase.

**Prerequisite/gate:** Phase 1 return-rate healthy (people come back to one life).

**Estimated effort:** ~4–6 weeks.

### Workstream 2.A — Per-user instanced island rooms ☐

- Today `WorldRoom` is a single shared room, single instance (`joinOrCreate("world")`,
  `apps/realtime/src/WorldRoom.ts`; cap 150 in `world.ts`). Refactor to **one room per island**
  plus a **sea/matchmaking** layer that routes a visitor into a host's island room.
- **Scale-out:** wire `@colyseus/redis-presence` + `@colyseus/redis-driver` (the documented
  next step in `docs/MULTIPLAYER.md`) so matchmaking is shared across instances; otherwise two
  visitors can land on different processes and not meet. Update `render.yaml` / infra.
- **DoD:** a player can open a *specific* island room (their own or another's) deterministically
  across instances.

### Workstream 2.B — Visiting mechanic ☐

- Build the ship (Phase 0/1 structure) → sail to another island → enter that island's room,
  see and interact with the host (reuse peer-chat relay `relayPeerChat` and proximity
  interaction already in `WorldRoom`).
- **DoD:** two real players on two devices can visit each other's islands and converse.

### Workstream 2.C — Social-gravity instrumentation ☐

- **New migration** `db/migrations/0003_visits.sql`:

```sql
create table visits (
  id bigserial primary key,
  visitor_life_id uuid not null references life(id) on delete cascade,
  host_life_id    uuid not null references life(id) on delete cascade,
  arrived_at timestamptz not null default now(),
  left_at timestamptz,
  reason jsonb,        -- what preceded the visit (what made this island a draw)
  duration_s int
);
```

- Emit/aggregate: *whose island gathered whom, and why; when each player tried to escape
  loneliness; how much they spoke to their pet before leaving.* These extend the §3 feature
  block (social-need, charisma/hub-formation) **and** seed the organic social graph.
- **DoD:** the visit graph is captured; hub-formation is measurable.

### Workstream 2.D — Pet→human transfer calibration ☐

- Compare each player's **pet-phase persona** to their **human-phase persona** (now that both
  exist). People are warmer/more honest with animals → pet-phase likely over-indexes warmth.
  Use the comparison to estimate and correct the instrument's bias (route through
  `gate.py` calibration / persona drift in `autonomy.py`). This turns a risk into a measurable
  feature: the two phases together let us measure our own measurement bias.
- **DoD:** a per-user correction factor exists; documented; reduces the pet-warmth bias.

### Workstream 2.E — Ethical valve (§4.3) ☐

- Guarantee inbound attention for the long tail (pet companionship, "someone wondered about
  you" nudges, matchmaking floor). Monitor the distribution of inbound visits; alert if the
  bottom quantile is going to zero.
- **DoD:** no life with non-trivial play time has zero social contact; bottom-quantile
  retention tracked.

**Phase 2 definition of done:** real two-device social play; a captured social graph; a
calibrated pet→human transfer; a protected long tail. Validation metric: **D7 retention** and
**inbound-visit Gini** (is the social economy compounding without abandoning the tail?).

---

## 8. Phase 3 — Autonomy + the legacy payoff (mostly wiring existing pieces)

**Strategic role:** the echo earns autonomy and becomes "what remains." Much of the ML already
exists; this phase wires it to the now-rich persona and the legacy end-state.

**Prerequisite/gate:** Phase 2 retention healthy; persona enriched by pet + human phases.

**Estimated effort:** ~3–4 weeks.

### Workstream 3.A — Real promotion through the existing gate ☐

- The autonomy ladder (`copilot → supervised → auto`) already exists: `autonomy.py`
  (agreement EWMA, hysteresis, drift), `gate.py` (temperature calibration, ECE, cost-aware
  threshold), thresholds in `config.py` (`alpha_promote=0.80`, `n_promote=8`, `ece_promote=0.10`).
  With the richer persona, promotions become meaningful. Surface per-bucket progress (the
  ux-audit M4 "graduation moment") in the mirror.
- **DoD:** a context can be earned to `auto` from real behavior; the moment is legible in-UI.

### Workstream 3.B — Echo self-initiation ☐

- In `auto` contexts, the echo acts on its own: sails to islands, meets people and other echoes
  (echo-to-echo already exists, `docs/MULTIPLAYER.md`). Every autonomous utterance carries its
  "why it said that" rationale (the protocol already reserves `speaker:"agent"` + `rationale`)
  and a **"that wasn't me" veto** that feeds `sendFeedback(agreed:false)` → demotes via existing
  hysteresis. (This is ux-audit B1, now with real stakes and a real graph.)
- **DoD:** the echo can autonomously meet people; the user can watch, veto, and thereby teach.

### Workstream 3.C — The legacy payoff (emotional climax) ☐

- When the one life ends, the echo *persists* and continues to meet people / represent the
  person. "This is the echo that remains of you." Bind `OutcomesPanel.tsx` + `connections.ts`
  to autonomous, real encounters. The melancholic brand pays off here.
- **DoD:** a life that has ended leaves a persistent, active echo; the surviving echo's
  encounters are surfaced honestly (only real activity, ux-audit M5).

### Workstream 3.D — Return hook ☐

- "While you were away, your echo met 3 people — here's who's worth meeting yourself." Only
  ever reports *real* autonomous activity (non-manipulative).
- **DoD:** a return-day surface that reports genuine echo activity.

**Phase 3 definition of done:** an echo that earns trust, acts within it, and persists as a
legacy. Validation metric: **% of users who reach `auto` and start a handover**, **veto rate
< ~15%** (trust), **return rate after an autonomous run**.

---

## 9. Phase 4 — Breadth + monetization (only after a proven core)

**Strategic role:** depth and revenue, layered on a validated core. Each activity is *texture*
that adds new behavioral signal; none is the core. **Do not start before Phase 0–3 are
validated.**

**Estimated effort:** open-ended; sequence by signal value and monetization.

### Workstream 4.A — Activity depth ☐
- Economy depth, professions, school/education, football/basketball, concerts. Each adds a new
  behavioral feature (e.g., team sports → cooperation/competition signal; school → long-horizon
  investment). Each plugs into §3 the same way.

### Workstream 4.B — Monetization: status ladder ☐
- VIP islands / status ladder = virtual goods + access (Robux-style). The game economy funds
  the data engine that builds the agent moat. Keep this explicit so the roadmap doesn't tear
  between "game company" and "agent company" (§12 D3).

### Workstream 4.C — Optional B2B wedge ☐
- The `venue/` + `dashboard/` demo already exists: branded islands + agentic intent research
  ("who came, what was discussed, why people didn't buy"). A faster-revenue wedge that can fund
  Path A. Productize toward self-serve only if pursued.

---

## 10. Critical path & sequencing discipline

```
§3 axis audit ─▶ PHASE 0 (proof) ──gate──▶ PHASE 1 (one life) ──gate──▶ PHASE 2 (seas)
                                                                              │
                                                          PHASE 3 (autonomy+legacy) ◀─┘
                                                                              │
                                                                     PHASE 4 (breadth+$)
```

**Rules (where these products usually die):**
1. **No Phase 1+ before the Phase 0 metric.** Do not spend on instanced-island infra until the
   magic is proven on real strangers.
2. **Breadth is Phase 4.** Sports / school / professions / VIP islands live here, not in the
   core. The four-iteration pillar stack belongs *after* validation.
3. **Every phase stays runnable** (key-free mocks) and is **gated by a validation metric**.
4. **The spine (§3) deepens every phase** — never let the model drift back to reading only words.
5. **Never refund irreversibility** (no quiet "restart") — it would void the data validity that
   permadeath buys (§1.2).

---

## 11. Risk register (named in the design conversation)

| # | Risk | Why it could be fatal | Mitigation in this plan |
|---|---|---|---|
| R1 | **Transfer validity** — sim behavior may not predict the real person | The whole company rides on this claim | Phase 0 is a cheap pre-registered test (§5.F/G); permadeath manufactures real stakes (§1.2) |
| R2 | **Magic circle** — fake stakes ⇒ YOLO behavior ⇒ anti-correlation with real life | Agent learns the *gamer*, not the person | Irreversibility + scarcity; never add restart |
| R3 | **Observer effect** — the pet's persona shapes the user's inputs | We'd measure our prompt, not the user | Neutral-elicitor pet (§4.2); calibrate residual bias (§7.D) |
| R4 | **Pet→human transfer** — warmth to an animal ≠ to people | Over-indexed warmth corrupts the persona | Measure it directly via two-phase comparison (§7.D) |
| R5 | **Social-gravity dark side** — unvisited islands = permanent rejection | Cruelty + churn of the bottom ~80% | Ethical valve (§4.3); inbound-attention floor |
| R6 | **Cold-start / empty world** | Social product, dead on day 1 | Pet bootstraps warmth + data (§1.3); single-player Phase 0 needs no crowd |
| R7 | **Loss-aversion paralysis** — permadeath can freeze mass-market players | Niche ceiling instead of unicorn | Watch choice-volume per life (Phase 1 metric); tune stakes; legacy framing reframes loss as continuation |
| R8 | **Scope sprawl** | Build the cathedral, run out of money before the first stone is tested | Phase gating; breadth deferred to Phase 4 |
| R9 | **Business-identity tear** — game company vs agent company | Roadmap, team, and pitch pull apart | Decide D3 explicitly; game economy funds the agent moat |

---

## 12. Open decisions (resolve before the dependent phase)

- **D1 — End-state model.** *Recommended & assumed here:* **legacy** (echo persists). Alternatives:
  roguelike cult (die → done; niche ceiling) or incoherent (secret restart; voids validity).
  **Decide before Phase 1.C.**
- **D2 — Ending trigger.** Fixed lifespan (ticks/age) vs narrative trigger vs player-chosen.
  **Decide before Phase 1.C.**
- **D3 — Primary business identity.** Agent company (real-world value moat) vs game company
  (virtual-goods/status). *Recommended:* game economy **funds** the agent moat; state it
  explicitly. **Decide before Phase 4.B.**
- **D4 — Persona axes.** Whether the existing 8 bipolar axes can express the sim's value
  dimensions, or need remap/replacement (§3.3). **Decide before Phase 0.D anchoring.**
- **D5 — Pet permanence.** Is the pet a lifelong companion (a persistent legacy character) or a
  tutorial-phase elicitor only? Affects §4.3 valve and the legacy payoff.

---

## 13. Appendices

### 13.A — New/changed API surface (cumulative)

| Method | Path | Phase | Purpose |
|---|---|---|---|
| POST | `/api/island/observe` (web → ML `/observe`,`/telemetry`) | 0 | forward behavioral events |
| POST | `/api/island/reading` | 0 | dusk reading (GET `/persona` + grounded LLM) |
| POST | `/api/island/validate` | 0 | capture self-rating (validation harness) |
| — | ML `/persona/{uid}` (existing) | 0 | read posterior for the reading |
| — | ML `/observe`,`/telemetry` (existing, extended payloads) | 0 | persona update from choices |
| POST | `/api/life/*` | 1 | life state, economy transactions |
| POST | `/api/sea/visit` | 2 | matchmake into a host island room |
| — | ML `/agent/turn`,`/feedback` (existing) | 3 | echo self-initiation + veto |

### 13.B — Feature vector after Phase 0 (target)

```
F ≈ 62–66 = embed_proj[32] + stylometry[14] + telemetry/behavioral[16–20]
behavioral = time-share[5] + save-rate[1] + risk[1] + solitude-tolerance[1]
           + pet-attachment[1] + decision-latency[1] + persistence[1] + consistency[1] + …
W : (8 × F), re-anchored via scripts/train_measurement.py, committed to artifacts/measurement.npz
```

### 13.C — Glossary

- **Spine** — the program of moving the learning signal from words to choices (§3).
- **Dusk reading** — the end-of-day echo portrait, grounded in real posterior axes + real choices.
- **Neutral elicitor** — a pet that draws the user out without imposing valence (§4.2).
- **Legacy** — the persistent echo that remains after a life ends (§1.4, Phase 3.C).
- **Validation gate** — the per-phase real-user metric that must be met before the next phase.

---

*This plan is the contract; the metrics are the judge. Build the smallest thing that proves the
magic, then earn the right to build the next.*
