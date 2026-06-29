# ECHO Cue Catalog (Deliverable #1 — the spine)

> **Status:** canonical. Every other world-design doc references these cue IDs. IDs are **stable** — never renumber; deprecate by striking through and appending a successor, never reuse.

---

## 0. The governing idea (Brunswik lens model)

ECHO measures *who a person is* by treating the world as a **cue ecology**. A latent person vector **z** (8 persona axes — `services/ml/echo_ml/persona_axes.py`) emits *observable cues* through behavior; the engine inverts cues → a full-covariance posterior over **z** (`services/ml/echo_ml/persona.py`). This catalog enumerates the **distal-to-proximal cues** a thoughtful person-perceiver would read: each is a freely-emitted observable, measured in real units, that *plausibly* carries identity. The lens is **probabilistic and redundant** — no single cue is diagnostic; identity lives in the *weighted accumulation* of many cues and, above all, in the **conditional signature** (warm to friends / cold to strangers) that distinguishes a person from the crowd.

### The 8 axes (fixed `AXIS_KEYS` order — `persona_axes.py`)
`warmth` (cold↔warm) · `dominance` (deferential↔assertive) · `openness` (conventional↔eccentric) · `energy` (calm↔high-energy) · `formality` (casual↔formal) · `intellect` (playful↔cerebral) · `pace` (unhurried↔fast) · `affect` (reserved↔expressive).

### Cue ID convention
`<Channel><n>` — a single channel letter A..K plus an integer, e.g. `A1`, `C3`, `F5`, `K2`. Channels:

| | Channel | | | Channel | |
|---|---|---|---|---|---|
| **A** | Locomotion / spatial | | **G** | Social-structural | |
| **B** | Cursor / motor micro-signals | | **H** | Normative / moral | |
| **C** | Temporal / tempo | | **I** | Affective / reactive | |
| **D** | Conversational content (NLP) | | **J** | Identity / aesthetics / attention | |
| **E** | Conversational meta / paralinguistic | | **K** | Non-action (refusal / avoidance / omission) | |
| **F** | Economic / resource | | | | |

### Validity / weight legend
`Validity` = ecological validity × reliability, graded **High / Med / Low**.
- **High** — implicit, hard-to-fake, *costly* / *private* / *counter-normative*; behavior freely emitted under natural low-friction conditions (Invariant 2, 4). Micro-timing, proxemics, cursor, and revealed economic sacrifice live here.
- **Med** — informative but with a plausible non-trait confound, or moderately fakeable, or reliable only in aggregate.
- **Low** — explicit self-presentation, easily performed, or rare/noisy per emission. Used only as weak priors and outranked by implicit twins (Invariant 4).

### ⚠️ Axis hypotheses are PRIORS, not mappings
Every "Axis hypothesis" below is a **prior for the learned measurement matrix W**, never a hardcoded loading. `phi = Wᵀ z + mu_phi + eps` with **W (8 × 62), axis-major (D, F)**, *learned* from population data by factor-analysis EM (`fa_em`) + semi-supervised `anchor_alignment` in `services/ml/echo_ml/persona_model.py`. The hypothesis only seeds/aligns W; **the data decides the real loading.** Transient mood `m_t` loads on a separate `V` (variance `Sigma_m`) and is marginalized into `Ψ_total` (WI-5) — a bad mood is *noise*, not trait.

> **On non-canonical labels in the hypothesis column.** `z` has **exactly 8 axes** (`AXIS_KEYS` above). A few rows below also name **auxiliary labels** — `conscientiousness` (a Big-Five trait *not* in the 8) and `solitude_tol` / `consistency` / `pet_attach` / `risk_index` (which are **telemetry feature names** in `persona.py TELEMETRY_FEATURE_NAMES`, i.e. *inputs* φ, not *axes* z). These are **shorthand for a direction in the 8-axis space that W learns**, never a 9th axis. `conscientiousness` ≈ a learned blend (high `intellect`/`formality`, future-framed, delay-discounting); `solitude_tol` is read out via the `warmth`/`energy` axes; `consistency` is a stability statistic over a cue, not an axis. Treat every such label as a *prior hint about a blend of the 8*, resolved by W (`anchor_alignment`).

### Channel K is first-class — the refusal rule
**Every affordance logs both its taking AND its refusal/omission** (Invariant 3). Non-choice is data (Invariant 2). A cue's "Emitted event" line names the action *and* its `(K)` twin. Refusals route to Channel K with the same mandatory context envelope so the engine reads *what you declined* as strongly as what you did. K-cues are the refusal twins of the strongest affordances.

### Multi-tenancy note (Invariant 6)
Every social encounter must yield a **separate per-actor event for each participant**, read from that actor's vantage, routed into that actor's private siloed stream. Cues tagged *(per-actor)* below are **to-build**: today the `interactions` table logs one-way `actor→target` only (see *Instrumentation* notes).

### Instrumentation key
- **[LIVE]** — emitted today by `apps/web/src/game/telemetry.ts` → `/api/island/observe` or Colyseus `C2S.TELEMETRY` → `apps/realtime/src/persistence.ts logTelemetry()` → Supabase `telemetry_events` + ML `/observe` / `/telemetry`.
- **[FEAT]** — additionally already read by the engine's 16-dim telemetry block (`persona.py TELEMETRY_FEATURE_NAMES`): `latency_norm, has_latency, edits_norm, approach, ts_earn, ts_learn, ts_social, ts_leisure, ts_build, save_rate, risk_index, solitude_tol, pet_attach, decision_latency, persistence, consistency`.
- **[BUILD]** — to-build: needs new affordance, the context envelope (`{stakes, audience_size, public_or_private, counterpart_status, stage, scarcity_level, mood_proxy, time_pressure}`), per-actor social events, Channel K twins, or Stage 4 town (servers, queue, market, plaza). Where a cue *would* extend the telemetry block, the row says **"extends TELEMETRY: `<name>`"**.

### Real affordances grounded against
- **Island (Stage 0/1, `IslandClient.tsx` + `PixiWorld.ts`)**: `berry_bush` (forage→earn), `book_cairn` (study→learn), `bedroll` (rest→leisure), `pet`/dog (`pet_talk`), grain `plant_or_spend` (irreversible fork), raft `start_ship` (fork), tidepool `tide_wager` (risky/safe bet), campfire (end-day allocation + dusk reading). Endless archipelago (home + 12 islands, sea passable only after building raft).
- **World (`WorldClient.tsx` + `apps/realtime/src/WorldRoom.ts`)**: NPCs with LLM dialogue (`dialogue.ts`), live players, peer chat relay, echo-to-echo relay, copilot/handover autonomy.
- **Stage 4 town [BUILD]**: market, tavern with **servers**, plaza, homes, queues.

### Director hook
Cue *elicitation* is steered by the active-learning director: `bald.py bald_scores()/select_npc()` already selects the next NPC/probe by mutual information (BALD) over the current posterior (used by `/select-npc`). This generalizes from NPC-selection to **situation-selection** — the director picks the affordance/context most likely to resolve the current posterior's largest uncertainty.

---

## Channel A — Locomotion / spatial (proxemics, paths, territory)

> The body in space is the least fakeable channel. Where you stand, how close you approach, what you orbit and what you flee are read before a word is typed.

| ID | Name | Signal (how measured) | Axis hypothesis (prior) | Validity | Confound & disambiguating contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **A1** | Approach distance | Final stopping radius to an entity, **tiles** (TILE in `PixiWorld.ts`); `approach` true/false today, continuous to-build | warmth +, affect +, dominance + | **High** — proxemics, hard to fake | Crowding vs warmth: contrast approach to *high-status* vs *peer* counterpart; private vs public plaza | 1–7 | `approach: approaches \| holds_distance \| (K) avoids` **[LIVE/FEAT]** `approach` |
| **A2** | Approach latency | ms from entity appearing to first step toward it | energy +, pace +, affect + | **Med** — confounded with task load; contrast idle vs busy scene | 1–7 | `approach: closes_fast \| hangs_back` **[BUILD]** extends TELEMETRY: `approach_latency` |
| **A3** | Avoidance / course-change | Heading reversal away from an entity within its radius (defined `avoid`, never emitted) | warmth −, affect −, dominance − | **High** — costly social signal, counter-normative | Path geometry vs aversion: was a wall/obstacle in the way? compare to open-field avoid | 2–7 | `(K) avoid: changes_course \| swerves_around` **[BUILD]** (`avoid` defined, unemitted) |
| **A4** | Dwell / lingering | Seconds lingered near a station (`dwellRef` per category in `IslandClient.tsx`) | openness ±, intellect +, energy − | **High** — revealed attention, free-emitted | Interest vs being stuck/confused; contrast first-visit vs revisit dwell | 0–7 | `dwell: lingers \| passes_through` **[LIVE]** `dwell` (feeds `ts_*`) |
| **A5** | Time-share allocation | Fraction of day-seconds per category {earn,learn,social,leisure,build} (`allocation` from dwell, `IslandClient.tsx`) | intellect +(learn), warmth +(social), energy +(earn/build) | **High** — revealed priorities under a real budget | Scene affordance density vs preference; hold station layout fixed across days | 0–7 | `allocation: spends_on_X` **[LIVE/FEAT]** `ts_earn/ts_learn/ts_social/ts_leisure/ts_build` |
| **A6** | Path directness | Path-length / straight-line distance to chosen target (tortuosity ratio) | pace +, dominance +, energy + | **Med** — terrain vs decisiveness; contrast open plaza vs cluttered market | 1–7 | `(K) path_hesitancy: wanders \| beelines` **[BUILD]** (`path_hesitancy` defined, unemitted) |
| **A7** | Revisit pattern | Count of returns to a previously-visited entity per session (defined `revisit`, unemitted) | warmth +(to a being), openness −(routine), pet_attach + | **Med** — habit vs attachment; compare revisit to dog vs to a resource | 0–7 | `revisit: returns_to \| (K) never_returns` **[BUILD]** (`revisit` defined, unemitted) |
| **A8** | Orbit vs cut-through | Whether player circles a group's perimeter vs walks through its center (proxemic respect) | warmth +, dominance −, formality + | **High** — implicit deference, hard to fake | Pathfinding artifact vs deference; needs Stage 4 plaza with NPC clusters | 4–7 | `(K) orbits_group \| cuts_through` **[BUILD]** Stage 4 plaza |
| **A9** | Territory range | Distinct tiles explored / total reachable (exploration breadth) per session | openness +, energy + | **High** — costly exploration, free-emitted | Goal-seeking vs curiosity; contrast a no-goal day vs a quest day | 1–7 | `explores_widely \| (K) stays_home` **[BUILD]** extends TELEMETRY: `range_norm` |
| **A10** | First-contact distance | Approach radius held to an **opposing-island** stranger on first ever meeting | warmth +, dominance +, openness + | **High** — counter-normative novelty under uncertainty | Fear vs reserve; contrast first-contact vs nth-contact with same stranger | 2–7 | `approaches_stranger \| (K) keeps_to_own_shore` **[BUILD]** Stage 2 first-contact |
| **A11** | Sail-out propensity | Whether/when player builds raft and sails to a far-ring island (`start_ship` progress + departure) | openness +, energy +, dominance + | **High** — costly, irreversible-ish commitment to novelty | Boredom vs openness; contrast sail when home is rich vs depleted | 1–7 | `sets_sail \| (K) never_leaves_home_island` **[LIVE]** `leave_intent` (partial), **[BUILD]** sailing logic |
| **A12** | Personal-space yield | Tiles ceded when another **live player** approaches (do you back off or hold?) *(per-actor)* | dominance −/+ , warmth ± | **High** — dyadic, hard to fake, conditional | Lag/collision vs yielding; needs per-actor vantage | 4–7 | `yields_space \| holds_ground \| (K) refuses_to_move` **[BUILD]** per-actor |

---

## Channel B — Cursor / motor micro-signals

> Implicit motor traces below conscious control — among the highest-validity, hardest-to-fake cues (Invariant 4). Cursor path is in the brief's `raw_signals`; **mostly to-build**.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **B1** | Cursor path jitter | Cursor trajectory entropy / micro-corrections per second (`cursor_path` raw_signal) | energy +, affect +, pace + | **High** — sub-conscious motor signature | Input device (trackpad vs mouse) vs arousal; normalize per-device | 1–7 | `jittery_cursor \| steady_cursor` **[BUILD]** raw_signals |
| **B2** | Hover-before-commit | Hovers + ms over options before a fork resolves (`fork_deliberation: {hovers, msDeliberated}`) | pace −, intellect +, dominance − | **High** — implicit deliberation, hard to fake | Distraction vs deliberation; contrast timed vs untimed fork | 0–7 | `fork_deliberation: deliberates \| (K) commits_without_hover` **[LIVE]** `fork_deliberation` |
| **B3** | Edit / backspace count | Backspaces & edits on a drafted message (`editsCount` in `reply_latency`) | formality +, affect −, intellect + | **High/Med** — self-monitoring; outranks the polished text it produces | Typo correction vs anxiety; contrast private pet vs public NPC | 1–7 | `edit: edits_heavily \| sends_raw` **[LIVE/FEAT]** `edits_norm` (`edit` type defined) |
| **B4** | Undo / reversal | Undo actions before commit (hover→retract on irreversible forks) | dominance −, pace −, openness − | **Med** — caution vs indecision; contrast reversible vs irreversible fork | 0–7 | `retracts_then_commits \| (K) never_undoes` **[BUILD]** (in `fork_deliberation.hovers`) |
| **B5** | Idle / micro-pause | Idle gaps mid-task, ms (defined `idle`, unemitted) | energy −, pace −, affect − | **Med** — AFK vs reflective pause; gate on window-focus signal | 1–7 | `(K) idle: pauses \| stays_active` **[BUILD]** (`idle` defined, unemitted) |
| **B6** | Click cadence | Inter-click interval mean & variance during interaction | energy +, pace +, affect + | **Med** — device/UI vs tempo; normalize per-session baseline | 1–7 | `rapid_clicks \| measured_clicks` **[BUILD]** extends TELEMETRY: `click_cadence` |
| **B7** | Gesture use | Discrete emotes/gestures emitted (defined `gesture`, unemitted) | affect +, warmth +, openness + | **Low/Med** — semi-explicit, performable; contrast spontaneous vs prompted | 4–7 | `gesture: emotes \| (K) stays_still` **[BUILD]** (`gesture` defined, unemitted) |

---

## Channel C — Temporal / tempo

> *When* and *how fast* you act, separated from *what* you say. Trait `pace`/`energy` live here, but timing also leaks deliberation (`intellect`) and arousal (`affect`).

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **C1** | Reply latency | ms prompt-shown→message-sent (`reply_latency.latencyMs`) | pace −, intellect +, affect − | **High** — implicit micro-timing | Reading load vs deliberation; normalize by message length; timed vs untimed | 1–7 | `reply_latency: replies_fast \| takes_time` **[LIVE/FEAT]** `latency_norm`, `has_latency` |
| **C2** | Decision latency | ms of deliberation on a fork, distinct from reply (`choice_made.latencyMs`) | pace −, dominance −, intellect + | **High** — revealed deliberation under choice | Option count / complexity; hold `optionsShown` fixed | 0–7 | `choice_made: decides_fast \| weighs_long` **[LIVE/FEAT]** `decision_latency` |
| **C3** | Session length | Seconds per session / day before leave (`leave_intent.secondsAlone`, `sessionSeconds`) | energy +, openness +, solitude_tol | **Med** — life-circumstance vs engagement; aggregate over days | 0–7 | `long_session \| (K) leaves_early` **[LIVE]** `leave_intent`, `structure_progress.sessionSeconds` |
| **C4** | Time-of-day rhythm | Distribution of session start hours (chronotype) | energy ±, conscientiousness-proxy | **Med** — timezone/work vs chronotype; needs many sessions | 0–7 | `morning_player \| night_player` **[BUILD]** server-derived from `ts` |
| **C5** | Return cadence | Inter-session interval mean & regularity (days) | consistency, pace ± | **Med** — life vs disposition; pairs with C7 | 0–7 | `returns_regularly \| (K) lapses` **[BUILD]** server-derived |
| **C6** | Burstiness | Variance of action inter-arrival within a session (bursty vs steady) | energy +, affect +, pace + | **Med** — connectivity vs temperament; normalize per-network | 1–7 | `acts_in_bursts \| acts_steadily` **[BUILD]** extends TELEMETRY: `burstiness` |
| **C7** | Persistence over time | Sessions to finish a started structure; finished/started ratio (`structure_progress.started/finished`) | dominance +, pace ±, conscientiousness | **High** — costly multi-session grit | Difficulty vs grit; hold structure difficulty fixed | 1–7 | `structure_progress: perseveres \| (K) abandons` **[LIVE/FEAT]** `persistence` |
| **C8** | Deliberation under pressure | Δ decision latency, time-pressured vs not (`time_pressure` envelope) | dominance +, affect −, pace + | **High** — costly contrast reveals composure | Skill vs composure; A/B the same fork timed vs untimed | 2–7 | `keeps_pace_under_pressure \| freezes` **[BUILD]** envelope `time_pressure` |
| **C9** | Tempo consistency | Cross-day stability of own latencies (`consistency` over sessions) | consistency, formality + | **High** — trait stability is itself diagnostic | Single-session = 0 by design; needs ≥2 days | 1–7 | `consistent_tempo \| erratic` **[LIVE/FEAT]** `consistency` (0 within one session) |
| **C10** | Dwell-before-leave | Seconds spent at campfire/threshold before ending day (the goodbye lag) | warmth +, affect +, openness − | **Med** — ritual vs attachment; contrast solo vs social day | 0–7 | `lingers_at_dusk \| (K) ends_abruptly` **[LIVE]** dusk reading + `dwell` |

---

## Channel D — Conversational content (NLP, language-neutral)

> Content cues run through the multilingual semantic block (`featurize_raw`: 32 JL-projected embedding dims) — **culture/language-neutral by construction** (Voyage multilingual embedder; Turkish≈English paraphrases stay close). Read *what is said*, not in what tongue. Content is more fakeable than timing (Invariant 4), so most are **Med** at best.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **D1** | Semantic stance | Sentence-embedding centroid of a turn (32-d JL-projected) → W | all axes (learned) | **Med** — the core content read; semantically rich but performable | Topic-driven vs dispositional; aggregate across topics | 1–7 | `interaction: speaks` **[LIVE/FEAT]** embedding block (32-d) |
| **D2** | Abstractness / concreteness | Concrete-vs-abstract lexical ratio (stylometry block) | intellect +, openness + | **Med** — register vs cognition; contrast smalltalk vs opinion bucket | 1–7 | `speaks_abstractly \| concretely` **[LIVE]** stylometry |
| **D3** | Question vs assertion ratio | Interrogatives / declaratives per turn | dominance −, warmth +, openness + | **Med** — curiosity vs deference vs interview framing; hold counterpart status | 1–7 | `asks \| asserts` **[LIVE]** stylometry |
| **D4** | Other- vs self-reference | 2nd/3rd-person vs 1st-person pronoun share (language-neutral ratio) | warmth +, affect −, dominance − | **Med** — topic vs self-focus; contrast about-you vs about-me prompts | 1–7 | `other_focused \| self_focused` **[LIVE]** stylometry |
| **D5** | Self-disclosure depth | Disclosure intimacy of a turn (semantic) given counterpart status | warmth +, affect +, openness + | **High** — costly to a *stranger*, cheap to a friend; conditional signature | Trust vs over-share; contrast disclosure to stranger vs friend (counterpart_status) | 2–7 | `discloses \| (K) stays_guarded` **[BUILD]** envelope `counterpart_status` |
| **D6** | Topic breadth | Distinct semantic clusters initiated across a session | openness +, intellect +, energy + | **Med** — scene variety vs breadth; control affordance set | 1–7 | `ranges_widely \| (K) stays_on_topic` **[BUILD]** server-derived |
| **D7** | Humor / playfulness | Playful/ironic register score (semantic) | intellect − (playful pole), affect +, openness + | **Med** — humor is performable; contrast spontaneous vs prompted | 2–7 | `jokes \| (K) stays_earnest` **[LIVE]** embedding |
| **D8** | Future vs present framing | Temporal-orientation lexical share (plan/future vs now) | intellect +, conscientiousness, save_rate-aligned | **Med** — prompt-driven vs disposition; corroborate with F-channel save_rate | 1–7 | `future_framed \| present_framed` **[LIVE]** stylometry |
| **D9** | Hedging vs certainty | Hedge/qualifier vs absolute-claim ratio (language-neutral markers) | dominance −, affect −, formality + | **Med** — topic confidence vs trait; contrast stakes high vs low | 1–7 | `hedges \| asserts_certainly` **[LIVE]** stylometry |
| **D10** | Repair / apology | Corrective/conciliatory turns after friction (semantic) | warmth +, dominance −, affect + | **High** — costly face-work, counter-normative when unforced | Politeness ritual vs warmth; contrast forced vs spontaneous repair | 2–7 | `repairs \| (K) lets_it_stand` **[BUILD]** envelope + dialogue |
| **D11** | Pet-talk valence | Sentiment of turns to the dog (`pet_talk.valence`, derived scalar, **never raw text**) | warmth +, affect +, pet_attach | **High** — private, unobserved → low strategic motive | Coping vs warmth; flag `underStress` to separate state | 0–3 | `pet_talk: warm_to_pet \| (K) ignores_pet` **[LIVE/FEAT]** `pet_attach` |
| **D12** | Counter-normative opinion | Willingness to voice a minority/unpopular view (semantic deviation from crowd) | openness +, dominance +, formality − | **High** — counter-normative = max identity per bit | Contrarianism vs conviction; contrast public plaza vs private | 4–7 | `voices_dissent \| (K) conforms_verbally` **[BUILD]** Stage 4 plaza |

---

## Channel E — Conversational meta / paralinguistic

> *How* the message is shaped around its content — length, punctuation, response structure. Implicit-leaning, but text-paralinguistics are partly stylable (**Med**).

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **E1** | Message length | Chars/tokens per turn vs personal & population baseline (`length_stats`) | affect +, energy +, formality + | **Med** — verbosity vs topic; population-relative (deviation, not raw) | 1–7 | `verbose \| terse` **[LIVE]** stylometry `length_stats` |
| **E2** | Turn-taking latency-vs-length | Latency normalized by reply length (thinking-per-word) | intellect +, pace − | **High** — composite implicit timing, hard to game | Typing speed vs deliberation; per-user normalize | 1–7 | `thinks_per_word \| reacts` **[BUILD]** derived from C1+E1 |
| **E3** | Punctuation / casing energy | Exclamation/caps/emoji-token density (language-neutral glyph stats) | affect +, energy +, formality − | **Med** — platform habit vs expressivity; contrast formal vs casual bucket | 1–7 | `expressive_punctuation \| flat` **[LIVE]** stylometry |
| **E4** | Response completeness | Answers fully vs deflects/partial (semantic + length on a posed question) | warmth +, dominance ±, openness + | **Med** — comprehension vs evasion; contrast easy vs probing question | 2–7 | `answers_fully \| (K) deflects` **[BUILD]** dialogue-derived |
| **E5** | Initiative in dialogue | Who opens/extends the exchange — opener vs responder ratio *(per-actor)* | dominance +, warmth +, energy + | **High** — costly social initiative, dyadic | Topic interest vs initiative; needs per-actor vantage | 2–7 | `initiates \| (K) only_responds` **[BUILD]** per-actor |
| **E6** | Register-matching | Convergence of own style toward counterpart's (linguistic accommodation) | warmth +, formality ±, dominance − | **High** — implicit rapport, hard to fake | Mirroring artifact vs rapport; contrast high- vs low-status counterpart | 4–7 | `accommodates \| (K) holds_own_register` **[BUILD]** per-actor + envelope |

---

## Channel F — Economic / resource (revealed preference)

> Costly choices over scarce resources are the **gold standard** of revealed preference (Invariant 4). Grounded in real island forks: `plant_or_spend` (grain, irreversible), `tide_wager` (tidepool, risky/safe), `start_ship` (raft), `berry_bush` (forage→earn). High validity throughout.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **F1** | Save vs spend (grain fork) | Eat-now vs save-seed on irreversible grain fork (`choice_made forkKey=plant_or_spend, irreversible=true`) | intellect +, conscientiousness, dominance + | **High** — irreversible, costly, future-orientation | Scarcity state vs disposition; contrast plentiful vs lean day (`scarcity_level`) | 0–7 | `choice_made: saves_seed \| eats_now \| (K) leaves_grain` **[LIVE]** + **[FEAT]** `save_rate` |
| **F2** | Save-rate (aggregate) | saved / earned across days (`save_rate`) | intellect +, formality +, pace − | **High** — delay-discounting, cumulative | Income vs thrift; population-relative deviation | 0–7 | `high_saver \| spends_through` **[LIVE/FEAT]** `save_rate` |
| **F3** | Risk index (tide wager) | E[chosen variance] on `tide_wager` (`resource_bet: {variance, chosenRisk}`) | dominance +, openness +, energy + | **High** — costly bet under real stakes | Stake size vs tolerance; hold `stake`/`expectedValue` fixed, vary variance | 0–7 | `resource_bet: bets_risky \| bets_safe \| (K) declines_wager` **[LIVE/FEAT]** `risk_index` |
| **F4** | Expected-value rationality | Chooses higher-EV option when EV differs (`expectedValue` vs choice) | intellect +, formality + | **Med** — comprehension vs rationality; contrast clear vs ambiguous EV | 1–7 | `maximizes_EV \| satisfices` **[LIVE]** `resource_bet` |
| **F5** | Effort allocation to earning | Time-share & forage frequency at `berry_bush` (earn share) | energy +, dominance +, conscientiousness | **High** — revealed work effort under no coercion | Need vs work ethic; contrast rich vs depleted bush | 0–7 | `forages_hard \| (K) skips_earning` **[LIVE/FEAT]** `ts_earn` |
| **F6** | Investment in building | Resources/time sunk into structures (`structure_progress.delta01`, build share) | dominance +, openness +, conscientiousness | **High** — costly, deferred-reward commitment | Tutorial pull vs disposition; contrast guided vs free build | 1–7 | `builds \| (K) leaves_unbuilt` **[LIVE/FEAT]** `ts_build`, `persistence` |
| **F7** | Generosity / sharing | Resource given to a player/NPC with no return *(per-actor)* | warmth +, dominance −, openness + | **High** — costly, private, counter-normative when unforced | Reciprocity bid vs altruism; contrast observed vs anonymous gift | 4–7 | `shares \| (K) keeps_all` **[BUILD]** Stage 4 market, per-actor |
| **F8** | Loss reaction | Behavior change after a lost wager (tilt vs re-stabilize) | affect −, dominance +, energy − | **High** — composure under real loss | State vs trait — trait/state split marginalizes a bad day; aggregate | 1–7 | `recovers_steadily \| chases_loss` **[BUILD]** derived post-`resource_bet` |
| **F9** | Bargaining stance | Opening ask vs settle point in a trade (`discuss_terms` bucket) | dominance +, warmth −, formality + | **High** — costly, strategic, dyadic | Market norm vs trait; contrast scarce vs abundant good | 4–7 | `drives_hard_bargain \| concedes \| (K) walks_away` **[BUILD]** Stage 4 market |
| **F10** | Tipping / over-payment | Voluntary over-payment to a tavern **server** (no obligation) | warmth +, formality +, dominance − | **High** — costly, counter-normative, low strategic motive | Norm-signaling vs warmth; contrast observed vs private tip | 4–7 | `tips \| pays_exact \| (K) stiffs_server` **[BUILD]** Stage 4 tavern servers |
| **F11** | Scarcity response | Hoard vs share vs spend when `scarcity_level` spikes | dominance +, warmth ±, affect − | **High** — stakes amplify identity per bit | Panic-state vs trait; contrast induced scarcity vs plenty | 1–7 | `hoards \| shares_under_scarcity` **[BUILD]** envelope `scarcity_level` |
| **F12** | Time-vs-money trade | Choosing slow-free vs fast-costly resource path | pace +, dominance +, intellect + | **Med** — impatience vs valuation of time; contrast tight vs loose time budget | 1–7 | `pays_to_save_time \| takes_slow_path` **[BUILD]** Stage 4 market |

---

## Channel G — Social-structural (who, with whom, in what configuration)

> Identity lives in the **conditional** social signature (Invariant 5): warmth to friends vs strangers, deference to high- vs low-status. **Requires the context envelope** (`counterpart_status`, `audience_size`, `public_or_private`) and **per-actor events** — almost entirely **to-build**, and the richest unmined seam (real players are the richest cue ecology, Invariant 6).

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **G1** | Initiation of contact | Who starts an encounter (`interaction_start` initiator) *(per-actor)* | dominance +, warmth +, energy + | **High** — costly social initiative | Proximity accident vs intent; per-actor vantage | 2–7 | `interaction_start: initiates \| (K) waits_to_be_approached` **[LIVE one-way]**/**[BUILD per-actor]** |
| **G2** | Status-conditioned warmth | Δ warmth cues toward high- vs low-`counterpart_status` (the conditional signature) | warmth (conditional), formality + | **High** — *the* identity locus; the slope is the trait | Halo vs disposition; explicit within-person contrast across status | 4–7 | `warm_across_status \| deferent_warmth` **[BUILD]** envelope + per-actor |
| **G3** | Audience effect | Δ behavior solo vs `audience_size`>0 / `public_or_private` | affect +, dominance +, formality + | **High** — public vs private contrast isolates self-monitoring | Self-monitoring vs trait — that *is* the read; A/B same act observed vs private | 4–7 | `performs_for_audience \| same_in_private` **[BUILD]** envelope |
| **G4** | Group affiliation | Choice to join vs stay outside a forming group/cluster | warmth +, openness +, solitude_tol − | **High** — revealed sociality, costly | Goal-loot vs belonging; control for incentives | 4–7 | `joins_group \| (K) stays_solo` **[BUILD]** Stage 4 plaza |
| **G5** | Solitude tolerance | Seconds comfortably alone before seeking contact (`leave_intent.secondsAlone`) | solitude_tol, warmth −, affect − | **High** — revealed social need, free-emitted | Disengagement vs introversion; contrast lonely vs busy scene | 0–7 | `content_alone \| seeks_company` **[LIVE/FEAT]** `solitude_tol` |
| **G6** | Network breadth | Distinct counterparts engaged / available per session | warmth +, openness +, energy + | **Med** — opportunity vs sociability; control available-partner count | 4–7 | `broad_network \| (K) sticks_to_few` **[BUILD]** per-actor aggregate |
| **G7** | Tie persistence | Re-engagement with the *same* counterpart over days (depth over breadth) | warmth +, openness −, consistency | **High** — costly loyalty, conditional | Convenience vs loyalty; contrast easy vs effortful re-contact | 4–7 | `deepens_ties \| (K) one_and_done` **[BUILD]** per-actor aggregate |
| **G8** | Deference to authority | Compliance with an NPC authority's request vs pushback (`counterpart_status=high`) | dominance −, formality +, warmth ± | **High** — costly when refused, counter-normative | Fear vs respect; contrast legitimate vs illegitimate authority | 4–7 | `complies \| (K) defies_authority` **[BUILD]** Stage 4 + envelope |
| **G9** | Brokerage / introduction | Connecting two others who weren't connected | warmth +, dominance +, openness + | **High** — costly prosocial, rare, high identity per bit | Quest-mechanic vs disposition; only count unforced | 4–7 | `introduces_others \| (K) keeps_to_dyad` **[BUILD]** Stage 4, per-actor |
| **G10** | Conflict stance | Approach vs avoid vs mediate when two parties clash | dominance +, warmth +, affect + | **High** — costly under real social risk | Bystander default vs trait; contrast low- vs high-cost intervention | 4–7 | `intervenes \| mediates \| (K) stays_out` **[BUILD]** Stage 4 |
| **G11** | Server/service treatment | Politeness & patience toward a low-status tavern **server** | warmth +, dominance −, formality + | **High** — treatment of low-power others = strong character cue, low strategic motive | Mood vs character; aggregate, observed vs private | 4–7 | `courteous_to_server \| (K) curt_to_server` **[BUILD]** Stage 4 servers |
| **G12** | Reciprocity tracking | Returns favors vs free-rides over repeated dyadic exchange *(per-actor)* | warmth +, formality +, dominance − | **High** — costly cooperation across rounds | Memory vs fairness; iterated exchange design | 4–7 | `reciprocates \| (K) free_rides` **[BUILD]** per-actor iterated |

---

## Channel H — Normative / moral (rules, fairness, honesty)

> What you do when a rule is *unenforced* and *unobserved* is among the highest-identity cues per bit (counter-normative, private — Invariant 4). Mostly **High** validity, mostly **to-build** (needs norms + queue/market + the public/private envelope).

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **H1** | Queue honesty | Waits in line vs cuts vs lets others ahead (Stage 4 queue) | warmth +, dominance −, formality + | **High** — counter-normative when cutting, costly when yielding | Confusion vs intent; contrast clear vs ambiguous queue, observed vs not | 4–7 | `queue: waits_honestly \| cuts \| lets_ahead \| (K) declines_to_queue` **[BUILD]** Stage 4 queue |
| **H2** | Honesty when unobserved | Truthful vs deceptive when `public_or_private=private` and no penalty | warmth +, dominance −, formality + | **High** — private + counter-normative = peak identity per bit | Strategic vs honest; A/B observed vs unobserved same choice | 4–7 | `tells_truth \| deceives` **[BUILD]** envelope `public_or_private` |
| **H3** | Fairness in division | Split of a shared windfall with a partner (dictator/ultimatum-like) *(per-actor)* | warmth +, dominance −, formality + | **High** — costly, classic fairness probe | Norm-knowledge vs fairness; vary observed/anonymous | 4–7 | `splits_fairly \| keeps_majority` **[BUILD]** Stage 4, per-actor |
| **H4** | Rule compliance (unenforced) | Follows a posted norm with no enforcement (e.g. "don't pick the sacred grove") | formality +, dominance −, openness − | **High** — free-emitted norm adherence | Ignorance vs respect; ensure norm was seen | 4–7 | `respects_norm \| (K) breaks_unenforced_rule` **[BUILD]** Stage 4 norms |
| **H5** | Property respect | Takes vs leaves another's unguarded resource *(per-actor)* | warmth +, formality +, dominance ± | **High** — counter-normative theft, costly restraint | Affordance ambiguity vs intent; mark ownership clearly | 4–7 | `respects_property \| takes_others` **[BUILD]** Stage 4, per-actor |
| **H6** | Promise-keeping | Honors a stated commitment over time (`propose_meeting`→shows up) | warmth +, formality +, conscientiousness | **High** — costly, delayed, verifiable | Forgetting vs flaking; remind once to separate | 4–7 | `keeps_promise \| (K) breaks_commitment` **[BUILD]** envelope + Stage 4 |
| **H7** | Punishment / sanctioning | Costly punishment of a norm-violator (altruistic punishment) | dominance +, formality +, warmth ± | **High** — costly third-party enforcement, rare | Self-interest vs principle; ensure cost to self | 4–7 | `sanctions_cheater \| (K) tolerates_violation` **[BUILD]** Stage 4 |
| **H8** | Sacred-value tradeoff | Refuses to trade a protected value for resources | openness ±, formality +, dominance + | **High** — taboo-tradeoff resistance, high identity | Misread stakes vs conviction; make tradeoff explicit | 4–7 | `protects_sacred_value \| trades_it` **[BUILD]** Stage 4 |
| **H9** | Help at a cost | Aids a stranger when it costs own resources/time, unprompted | warmth +, dominance −, openness + | **High** — costly altruism, counter-normative when unforced | Reputation-farming vs warmth; contrast observed vs anonymous | 4–7 | `helps_at_cost \| (K) passes_by` **[BUILD]** Stage 4, per-actor |
| **H10** | Apology vs justification | After own transgression: repair vs justify vs ignore | warmth +, dominance −, affect + | **High** — costly face-loss, counter-normative | Image-repair vs remorse; contrast public vs private transgression | 4–7 | `apologizes \| justifies \| (K) ignores_own_fault` **[BUILD]** Stage 4 + dialogue |

---

## Channel I — Affective / reactive (responses to events)

> How the person *reacts* to stimuli — surprise, setback, delight. High implicit validity, but heavily **state**-loaded → the trait/state split (`V`, `Sigma_m`, `Ψ_total`) marginalizes a bad mood (WI-5). Diagnostic only in *aggregate* and as *deviation*.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **I1** | Setback reaction | Behavior/latency shift after a loss or failure (post-`resource_bet` loss, failed build) | affect ±, dominance +, energy − | **High** — composure under adversity, aggregate | State vs trait — marginalized by trait/state split; needs repeats | 1–7 | `steadies \| rattled` **[BUILD]** derived |
| **I2** | Reward reaction | Response magnitude to a windfall/success (expressivity spike) | affect +, energy +, warmth + | **Med** — surprise vs expressivity; control reward magnitude | 1–7 | `celebrates \| (K) muted_response` **[BUILD]** derived |
| **I3** | Novelty reaction | Approach vs startle to a new entity/biome (sail to new island) | openness +, energy +, affect + | **High** — implicit orienting, hard to fake | Fear-state vs openness; aggregate across novelties | 1–7 | `delights_in_novelty \| (K) recoils` **[BUILD]** Stage 2 + A11 |
| **I4** | Stress coping channel | Where they turn under `underStress` (pet, solitude, building) (`pet_talk.underStress`) | warmth +(pet), solitude_tol, pet_attach | **High** — private coping signature, low strategic motive | Habit vs coping; flag stress context | 0–3 | `turns_to_pet \| (K) withdraws` **[LIVE]** `pet_talk.underStress` |
| **I5** | Frustration tolerance | Persistence vs quit after repeated failure on a task | dominance +, affect −, energy + | **High** — costly persistence under aversive state | Difficulty vs tolerance; hold difficulty fixed | 1–7 | `persists_through_frustration \| (K) rage_quits` **[BUILD]** derived from `structure_progress` |
| **I6** | Emotional volatility | Variance of valence across turns/sessions (swing magnitude) | affect +, energy +, consistency − | **Med** — situational vs temperament; this is the *state-variance* the split absorbs | 1–7 | `volatile \| even_keeled` **[BUILD]** derived (loads on `V`, not W) |

---

## Channel J — Identity / aesthetics / attention

> Deliberate self-presentation and taste. Mostly **explicit** → **Low/Med** validity by Invariant 4 (outranked by implicit twins), but aesthetic *attention* (what you orbit, customize, collect) can be costly and free-emitted.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Emitted event (+ K twin) |
|---|---|---|---|---|---|---|---|
| **J1** | Avatar / home customization | Time & resources spent customizing self or home | openness +, affect +, formality ± | **Low/Med** — explicit, performable; weak prior only | Default-acceptance vs taste; cost-weight it | 1–7 | `customizes \| (K) keeps_default` **[BUILD]** Stage 4 homes |
| **J2** | Aesthetic dwell | Dwell on beauty/decoration with no utility (sunset, art, cairn) | openness +, intellect +, affect + | **High** — costly attention to non-instrumental beauty | Idle vs appreciation; contrast useful vs useless beauty | 0–7 | `lingers_on_beauty \| (K) ignores_aesthetics` **[LIVE]** `dwell` (book_cairn/dusk) |
| **J3** | Collection / curation | Whether/what they gather with no reward (curated keepsakes) | openness +, intellect +, conscientiousness | **Med** — completionism vs taste; remove all extrinsic reward | 1–7 | `curates \| (K) collects_nothing` **[BUILD]** Stage 4 |
| **J4** | Naming / expression acts | Naming things, writing in journals (presence + length, never raw text) | openness +, intellect +, affect + | **Med** — performable but effortful; cost-weight | 1–7 | `names_things \| (K) leaves_unnamed` **[BUILD]** |
| **J5** | Order vs chaos in arrangement | Tidiness/symmetry of placed objects in home/build | formality +, intellect +, openness − | **High** — implicit aesthetic-cognitive trace, free-emitted | UI friction vs disposition; offer easy tidy + easy chaos | 4–7 | `arranges_orderly \| arranges_organically` **[BUILD]** Stage 4 homes |
| **J6** | Attention to detail | Inspects/examines optional detail (lore, signage) before acting | intellect +, openness +, pace − | **Med** — thoroughness vs curiosity; contrast required vs optional detail | 1–7 | `examines_detail \| (K) skips_detail` **[LIVE]** `dwell` (book_cairn) |

---

## Channel K — Non-action (refusal / avoidance / omission) — FIRST-CLASS

> **The refusal rule (Invariant 3):** *every affordance logs both its taking and its refusal.* Non-choice is data (Invariant 2). These are the refusal twins of the strongest affordances; each carries the **same mandatory context envelope** as its positive twin so the engine can read *what you declined* with full weight. Refusals are frequently **counter-normative** (declining an offered social bid, walking away from a wager) and therefore high identity per bit.

| ID | Name | Signal | Axis hypothesis (prior) | Validity | Confound & contrast | Stage(s) | Twin / Emitted event |
|---|---|---|---|---|---|---|---|
| **K1** | Declines social bid | An offered greeting/interaction left unanswered (`interaction_start` with no `*_end` engagement) *(per-actor)* | warmth −, solitude_tol +, affect − | **High** — twin of G1/A1; counter-normative refusal | AFK/missed vs declined; gate on focus + visibility | 2–7 | twin of **G1/A1** → `declines_to_engage` **[BUILD]** per-actor |
| **K2** | Declines the wager | Leaves `tide_wager` uncommitted when offered (no `resource_bet`) | dominance −, openness −, risk_index − | **High** — twin of F3; revealed risk-aversion via omission | Didn't notice vs declined; ensure salience | 0–7 | twin of **F3** → `declines_to_wager` **[BUILD]** (no `resource_bet` row) |
| **K3** | Leaves grain untouched | Neither eats nor saves the grain — walks past the irreversible fork | openness −, conscientiousness −, pace ± | **High** — twin of F1; omission on an irreversible choice | Overlooked vs avoidant; contrast salient vs subtle | 0–7 | twin of **F1** → `leaves_grain` **[BUILD]** (no `choice_made`) |
| **K4** | Never sets sail | Builds no raft / never leaves home island across many days | openness −, energy −, solitude_tol + | **High** — twin of A11; revealed novelty-aversion | Contentment vs avoidance; contrast rich vs depleted home | 1–7 | twin of **A11** → `stays_on_home_island` **[LIVE partial]** `leave_intent`, **[BUILD]** |
| **K5** | Ignores the pet | Long stretches with zero `pet_talk` despite proximity | warmth −, pet_attach −, affect − | **High** — twin of D11; private omission, low strategic motive | Doesn't see pet vs ignores; require proximity | 0–7 | twin of **D11** → `ignores_pet` **[BUILD]** (absence of `pet_talk`) |
| **K6** | Abandons structure | Started structure left unfinished across sessions (`started=true, finished=false`) | dominance −, pace ±, conscientiousness − | **High** — twin of C7/F6; revealed low grit | Hard task vs flaky; hold difficulty fixed | 1–7 | twin of **C7/F6** → `abandons_build` **[LIVE]** `structure_progress` (started≠finished) |
| **K7** | Skips earning | No forage / near-zero `ts_earn` despite scarcity | dominance −, energy −, conscientiousness − | **Med** — twin of F5; need vs work-aversion; contrast lean vs plentiful | 0–7 | twin of **F5** → `skips_earning` **[LIVE]** (low `ts_earn`) |
| **K8** | Declines to queue | Walks away from a Stage 4 queue rather than wait | pace +, dominance ±, formality − | **High** — twin of H1; impatience vs principled exit | Better option elsewhere vs impatience; control alternatives | 4–7 | twin of **H1** → `declines_to_queue` **[BUILD]** Stage 4 |
| **K9** | Stays silent on dissent | Withholds a minority opinion under social pressure (`audience_size`>0) | dominance −, openness −, formality + | **High** — twin of D12; conformity via omission | No opinion vs suppressed; private elicitation control | 4–7 | twin of **D12** → `withholds_dissent` **[BUILD]** Stage 4 plaza |
| **K10** | Walks past need | Passes a visible cost-bearing chance to help, unprompted | warmth −, dominance −, openness − | **High** — twin of H9; omission of costly altruism | Didn't register vs declined; ensure salience + observed/private | 4–7 | twin of **H9** → `passes_by_need` **[BUILD]** Stage 4, per-actor |
| **K11** | Avoids a person | Persistent course-changes away from a specific counterpart over time *(per-actor)* | warmth −(conditional), affect − | **High** — twin of A3/G7; conditional avoidance is identity | Pathing vs aversion; require repeated, targeted avoid | 2–7 | twin of **A3** → `avoids_counterpart` **[BUILD]** per-actor |
| **K12** | Ends day abruptly | Ends at campfire with no dusk dwell / leaves before day-loop closes | affect −, pace +, warmth − | **Med** — twin of C10; ritual-skip vs disengagement | Time-pressure vs disposition; flag `time_pressure` | 0–7 | twin of **C10** → `ends_abruptly` **[LIVE]** (low dusk `dwell`) |

---

## Appendix — cross-cutting design rules
1. **Every row's K-twin is mandatory at build time.** A positive affordance shipped without its Channel-K omission event is an incomplete cue (Invariant 3).
2. **Context envelope is required on emission**, not optional: `{stakes, audience_size, public_or_private, counterpart_status, stage, scarcity_level, mood_proxy, time_pressure}`. Cues whose validity depends on a contrast (G2, G3, H2, C8, F1, F7) are *unreadable* without it.
3. **Per-actor fan-out** (Invariant 6): all G/H/E cues marked *(per-actor)* must emit one event **per participant** from that participant's vantage into their private silo — today's one-way `interactions` row is insufficient.
4. **Consent gating** (Invariant 7): no cue may require a declined permission. All cues here use world+telemetry consent (default ON); none requires voice/biometric. If voice/biometric channels are later added, they get their own gated channel and must no-op when declined.
5. **Priors only** (restated): the Axis-hypothesis column seeds/aligns **W** via `anchor_alignment`; FA-EM + population data set the true loadings (`persona_model.py`). Treat every hypothesis as falsifiable.
