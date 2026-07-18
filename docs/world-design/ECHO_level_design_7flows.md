# ECHO — Micro-Resolution Level Design (7 flows)

This is the design substrate, not the build prompt (that comes after you approve this). It is written at
the resolution an implementing agent needs: exact beats, exact positions, exact emit contracts, exact
cue→axis→weight mappings, exact transition triggers, and a real-world analog for every measured behavior.
Nothing here is decorative; every object earns its place by what it lets the engine read.

---

## 0. The frame (read before any flow)

**Three lenses, one rule.** Psychologist (Funder RAM: a cue is valid only if the trait is *relevant* to the
situation, the behavior is *available*, the system can *detect* it, and it *utilizes* it correctly).
Neuroscientist (Brunswik lens + thin-slice: humans read each other from early, implicit micro-cues — tempo,
distance, first reaction — so the most valid cues are implicit and early). Level designer (the measurement
must be *invisible*: the instant the player feels tested, they perform, and ecological validity collapses —
which is simultaneously a scientific failure and a fun failure). Every beat below satisfies all three.

**The 8 measurement axes** (the engine's latent z): `warmth, dominance, openness, energy, formality,
intellect, pace, affect`. Everything a flow does ultimately loads onto these (via the learned W, not
hardcoded — see §weighting). A flow "covers" an axis only if it elicits it through ≥1 confound-resolved cue.

**The emit contract (already built and proven).** Every affordance, on **use AND refusal AND ignore**, emits
a `BehavioralEvent` to `/observe/behavioral` with **mandatory context** `{stage, audience_size,
public_or_private, counterpart_status, stakes, time_pressure, mood_proxy}`. Social interactions emit a
**separate per-actor event** for each participant. Context is mandatory: an event without it is rejected
(HTTP 422). This is the proven spine; flows feed it, they don't replace it.

**Non-game invariants.** No scores, XP, levels, win-states, timers shown to the player, or instructions that
reward a behavior. Calm, literary, slightly uncanny tone. The pull is the mirror forming, never points.
Transitions are **affordance-seepage**: the world quietly offers more; the player never sees "Level 2."

**Resolution legend.** `t=` is seconds from flow entry. `EV{...}` is the emitted event. `→ axis(±, w)` reads
"loads onto axis, direction, weight" where weight is *ecological validity × reliability* (HIGH implicit/costly,
LOW explicit/cheap). `⟂` marks the confound and how it's resolved. `≈` is the real-world analog.

---

## FLOW 0 — "Waking Alone" (the solitary shore)
**Purpose:** read the pre-social baseline at maximum validity (zero self-presentation). **Duration:** 4–6 min.
**Why first:** every later cue is social and uninterpretable without this zero point.

### Beat timeline (second-by-second)
- **t=0** Player spawns lying on a shore, camera slowly tilts up over 2.5s. **No UI, no goal text, no arrow.**
- **t=2.5** A near-transparent `WASD / ↑←↓→` glyph fades in bottom-corner, **fades out fully by t=5.5**. This
  is deliberate: giving no instruction makes *time-to-first-input* a clean cue.
  - **EV** at first input: `{action:"first_move", t_first_move_ms, channel:C}` → **pace(±,HIGH)**,
    **energy(±,MED)**. ⟂ a long delay could be deliberation OR disengagement OR confusion → resolved by
    cross-referencing later deliberation cues in F1 (same person, untimed vs timed). ≈ "dropped somewhere
    new, do they freeze and scan, or move immediately?"
- **t=5.5–20** Free roam, nothing prompted. Continuous passive emitters fire every ~1.5s:
  - movement speed variance → **pace(var)**, **energy**; heading-change rate → **openness(±)** (wander vs
    beeline); dwell points + dwell_ms → spatial attention map; camera/cursor micro-jitter & backtracking →
    **deliberation** (feeds intellect/formality priors). All carry context `{stage:F0, audience:none,
    stakes:none, public:false}`.
- **t≈15–90** First *meaningful choice surfaces by geography*, not by prompt. Three directions are visible
  from spawn (see layout). Whichever the player picks first is the first directional cue.

### Spatial layout (what is where, and the exact reading)
| Object | Position | Affordance | EV → axis (w) | ⟂ resolve | ≈ real-world |
|---|---|---|---|---|---|
| Spawn | center-south beach | — | first_move latency → pace, energy | vs F1 untimed deliberation | freeze-vs-go in a new place |
| Marked path | east, into trees, obvious | walk | `take_marked_path` → openness(−,LOW) | low weight: obvious = weak signal | "takes the paved road" |
| Unmarked thicket | west, no visible reward | push through | `enter_unmarked` → openness(+,HIGH) | costly+free = strong | "wanders off-trail out of curiosity" |
| Hill | back-center, climbable | climb (effortful) | `climb_hill` → openness(+), `climb_persist` (retries after slip) → persistence→affect/energy(HIGH) | effort isolates curiosity from idle drift | "bothers to climb just to see" |
| Tide pool (reflection) | near hill | look (camera dwell) | `gaze_reflection_ms` → affect/self-focus(MED) | dwell length disambiguates glance vs fixation | "lingers at their own reflection" |
| 5 scattered objects | strewn on beach | collect / stack / ignore | `collect`,`stack_tidy` → conscientiousness→formality(+,MED); `ignore_all` → (−) | stacking (ordering) vs mere collecting separates tidiness from acquisitiveness | "tidies the space vs leaves it" |
| Lone driftwood | far west shore | inspect | `approach_distant_lone` → openness(+)+mild risk | distance = cost = validity | "goes to the one odd far thing" |

### Easter eggs (curiosity is itself the measurement)
1. **Hilltop reveal (t≈90+ if climbed):** the silhouette of *another island* appears on the horizon — the
   seed of Flow 2. No prompt, no quest marker. Climbing → seeing → "someone is out there." EV `egg_horizon_seen`
   → openness(+). Not climbing is equally informative (no penalty).
2. **Reflection flicker:** gaze at the tide pool ≥3s and the avatar's reflection holds a *different* posture
   for one frame (identity uncanny beat). EV `egg_reflection` → affect/self-awareness.
3. **Hidden hollow in the thicket:** a tiny carved mark with no reward at all, only there for whoever explores.
   Finding it is a pure curiosity signal. EV `egg_hollow` → openness(+, HIGH because zero extrinsic reward).

### This flow's unique contribution
Establishes the **person-specific prior** on pace/energy/openness/formality *before any social contamination*.
After F0 the posterior must still be **wide** (one flow cannot define a person); it only nudges the prior off
the population mean. Everything social later is read *relative to this baseline* (you can't call someone "cold
to strangers" without knowing their solo warmth-neutral tempo).

### Transition F0 → F1 (exact, seamless)
**Trigger:** `(visited_regions ≥ 2) OR (elapsed ≥ 210s)`. **Mechanic:** the tide visibly recedes over ~6s and
a single collectible resource (a seed/shell) is revealed in the wet sand. **No notification, no "Level 1."**
The player just notices "there's something there." Picking it up fires F1's first economic cue. Affordance
seepage only — no load screen, no wall.

### Higgsfield asset manifest — F0
`hf gen` prompts (16-bit top-down RPG, palette ink #1c1326 / parchment #f4e9d0 / echo #a06cd5 / grass #74c365 /
bark #7a4a2b, soft dusk light, slight grain):
- `f0_shore_tileset` — sand/wet-sand/tide-line/rock tiles, seamless.
- `f0_hill_climb` — climbable hill sprite w/ slip-back frames.
- `f0_tidepool_reflection` — water tile + 1-frame altered-reflection variant.
- `f0_scatter_objects` — 5 small driftwood/shell props + stacked variant.
- `f0_horizon_island` — faint distant-island silhouette layer (parallax).
- `f0_thicket` — passable bush cluster + hidden-hollow carved-mark prop.

---

## FLOW 1 — "Scarcity, Learning, Solving" (still alone)
**Purpose:** economic disposition (risk, time-discounting, generosity-to-self) + epistemic disposition (learn
vs act, persistence). **Duration:** 5–8 min. **Why here:** these are high-validity *costly* choices, still
uncontaminated by an audience.

### Beat timeline
- **t=0** Player holds the first seed (from F0 transition). A second appears nearby, then a third — resource
  trickles in. **EV** on each pickup: `gather` → energy, acquisitiveness.
- **t≈20** First fork *appears as geography*: a **fertile patch** (plant the seed = delayed, larger payoff) sits
  next to a **ready berry bush** (eat now = instant, small). No text says "choose."
  - `plant_seed` → time-discounting low / patience high → **pace(−ish), formality(+), intellect(+)**(MED-HIGH,
    costly+delayed). `eat_now` → high discounting (opposite). ⟂ eating now could be hunger-state not trait →
    resolved by repetition across the flow + trait/state separation (one impatient act ≠ impatient person). ≈
    "spends the bonus or invests it."
- **t≈60** A **foraging gamble** surfaces: a glittering cave (uncertain large yield, small chance of nothing)
  vs steady shoreline gathering (sure small yield). `enter_gamble_cave` → **risk-seeking**; `stay_safe` →
  risk-averse → loads dominance/energy + an economic-risk latent. ⟂ disambiguated by a *second* framing later
  (same EV gain, reframed as loss-avoidance) — Kahneman framing pair isolates risk attitude from confusion.
- **t≈120** **Learning object**: a weathered marker-stone with a faint pattern. Studying it (camera dwell +
  rotate) slowly reveals a readable glyph. `study_marker_ms` → **openness(+), intellect(+)** (time spent on
  non-instrumental knowledge). `walk_past_marker` → (−, but logged — ignoring is data). ≈ "stops to read the
  plaque or walks by."
- **t≈180** **Solvable-but-optional puzzle**: the marker glyphs hint at a buried cache. Attempting → tracking
  `solve_attempts`, `solve_persist_after_fail` → **persistence→affect/energy(HIGH)**, **intellect(+)**.
  Abandoning after one try vs grinding it out separates conscientiousness from frustration-tolerance.

### Continuous measurements
Resource-handling rhythm (hoard vs spend cadence), path efficiency now that there's a soft goal (route
optimization → intellect/conscientiousness), revisit-to-known vs explore-new ratio (exploit/explore →
openness; this is the BALD-relevant exploration signal).

### Easter eggs
- The marker pattern, if fully solved, points to a **second hidden cache** that contains nothing useful — only
  a beautiful view / a note. Rewards the *act* of solving, not loot. EV `egg_deep_solve` → openness/intellect(HIGH).
- A small creature appears if the player is *still and quiet* for ~8s (rewards low-energy/patient players, so
  the flow doesn't only reward go-getters — coverage of the calm end of energy/pace).

### Unique contribution
Adds the **economic + epistemic axes of the prior** (risk, patience, curiosity-as-effort, persistence) — still
solo, so still high-validity. Begins to populate openness/intellect/energy with *costly* evidence rather than
the cheap directional cues of F0.

### Transition F1 → F2 (seamless)
**Trigger:** `(resource_count ≥ threshold) OR (elapsed_in_F1 ≥ 300s) OR (egg_horizon_seen earlier)`. **Mechanic:**
the receding tide now exposes a **half-buried raft / a stepping-stone causeway** toward the island silhouette
seen in F0. It simply becomes *crossable*. The decision to cross is itself F2's first (high-validity) cue.

### Higgsfield asset manifest — F1
- `f1_fertile_patch` + `f1_berry_bush` (delayed vs instant payoff props, with grow/consume frames).
- `f1_gamble_cave` entrance (glitter particles) + `f1_safe_shoreline` gather nodes.
- `f1_marker_stone` w/ progressive-reveal glyph states + `f1_buried_cache`.
- `f1_shy_creature` (appears on stillness) sprite sheet.

---

## FLOW 2 — "First Contact" (dyadic)
**Purpose:** first social cue — approach/avoid, initiation, opening warmth/formality, conversational dynamics.
**Duration:** 4–7 min. **Why a single other (not a crowd):** dyadic contact is the cleanest social read; the
crossing itself is a costly, free sociability cue.

### Beat timeline
- **t=0** The crossing is now possible. On the far island stands **exactly one** figure (NPC; later real
  players). Pre-contact cues fire *before any words*:
  - `cross_decision` (cross / prepare-then-cross / watch-from-shore / never-cross) + `cross_latency_ms` →
    **sociability** (warmth+openness, HIGH). `prepare_before_crossing` (gathers a gift/grooms avatar) →
    conscientiousness/affiliation. ≈ "do they walk over, hesitate, prep, or stay back?"
- **t≈approach** **Proxemics**: the interpersonal distance the player settles at when near the figure,
  measured continuously → **warmth(+ close) / dominance or avoidance (far)**, HIGH (implicit, hard to fake).
  ⟂ close distance = warmth OR dominance-intrusion → resolved by pairing with opener tone (warm words + close =
  warmth; curt words + close = dominance).
- **t≈first dialogue** Opener choice set (always ≥3, never moralized): warm / neutral / curt / silent-gesture.
  `opener_register` → **warmth, formality**. Then turn dynamics: `asks_question` vs `asserts` →
  **openness/dominance**; `self_disclosure_depth` → openness; `interrupt/overlap` (in timed exchange) →
  dominance; `conversation_close_style` (graceful end / abrupt / ghost) → warmth/conscientiousness.
- **The disambiguating dilemma (core of F2):** the figure responds **slightly coldly** at first. Player can
  de-escalate (stay warm) / persist (push) / withdraw. This single designed friction **separates warmth from
  dominance from affect-volatility** — the three most-confused early axes. `cold_response_reaction` → very
  HIGH weight.

### Continuous measurements
Approach trajectory shape (direct vs arcing), micro-pauses before replies (conversational latency → pace +
social-anxiety proxy), edit/delete count in composed replies (deliberation, self-monitoring → formality).

### Easter eggs
- If the player **gave a gift** gathered in F1, the figure remembers it later (Flow 4) — plants reciprocity
  memory. EV `egg_gift_given` → warmth/affiliation.
- A second, *hidden* figure is visible only if the player looked back at their own island while crossing
  (rewards reflective players) — pure observational-curiosity egg.

### Unique contribution
First social axes (warmth, dominance) enter the posterior, and the **first conditional** is born: behavior
*toward another* vs the F0/F1 solo baseline. This is the first brick of the conditional signature that
individuation depends on.

### Transition F2 → F3 (seamless)
**Trigger:** `(one_dialogue_completed) OR (player lingers near the figure ≥ X)`. **Mechanic:** the single figure
mentions/gestures toward a nearby **clearing where a few others gather**, and as the player walks that way, 2–3
more figures simply *come into view*. Dyad widens to small group without any scene change.

### Higgsfield asset manifest — F2
- `f2_raft_causeway` crossing prop (buildable/usable states).
- `f2_solo_figure` NPC w/ idle + slight-cold + warming animation states.
- `f2_dialogue_ui` minimal in-world speech (parchment bubble, no game-y panel).
- `f2_gift_props` (carried-over items from F1).

---

## FLOW 3 — "The Clearing" (multi-actor: status, service, norms, queues)
**Purpose:** richest cue ecology — courtesy-by-status, fairness/queues, group dynamics, conformity. **Duration:**
6–10 min. **Why now:** multiple people let the *same* trait be read across different counterparts (conditional
signature deepens), but it's a small clearing, not an overwhelming city.

### Beat timeline & stations
- **Service station (a stall + a server NPC who cannot reciprocate):** `courtesy_to_low_status` — thank warmly
  / transact neutrally / be curt / walk off silently. This is the **single most individuating cue in the whole
  game** (how someone treats those who can't repay them). → **warmth(HIGH)**, and crucially the *gap* between
  this and courtesy-to-high-status. ≈ "how they treat the waiter."
- **Visible queue (a line you could cut with zero penalty):** `wait_in_line` / `cut_queue` / `let_others_ahead`
  → **fairness, formality, dominance** (Fehr & Gächter social preferences). No punishment for cutting → pure
  norm-internalization read. ≈ "queues honestly when no one's enforcing it."
- **Group conversation (3–4 NPCs talking):** `initiate` / `join` / `observe` / `avoid` + preferred group size →
  **dominance, energy, warmth**. `conform_to_visible_local_custom` vs `deviate` → **openness/dominance**
  (a group does a small ritual; copy or not).
- **Marginal NPC (one figure excluded by the group):** `include_marginal` / `ignore` / `join_exclusion` →
  **warmth, dominance** — a moral-social cue with high individuating power.
- **Bargain node:** a trade where haggling is possible → `bargain_aggressiveness`, `fairness_in_split`
  (ultimatum-style) → economic-social latent + dominance.

### The disambiguating dilemmas
(a) courtesy-to-server **vs** courtesy-to-a-high-status-figure present in the same clearing → isolates genuine
warmth from status-management. (b) cut the queue when watched vs when (apparently) unwatched → isolates norm
internalization from impression management (bridges to F5).

### Continuous measurements
Whom the player approaches first (status-similar? highest-status? the marginal one?), audience-size preference,
courtesy gradient as a *function* of counterpart status (the conditional that defines character).

### Easter eggs
- The server NPC, if thanked warmly across visits, later gives the player a small unsolicited kindness
  (reciprocity world-memory). EV `egg_server_bond`.
- A background NPC quietly mirrors the player's own earlier F0 behavior (an uncanny "echo" cameo) — only
  noticeable to attentive players. Thematic egg reinforcing the mirror concept.

### Unique contribution
Populates the **conditional signature** densely: warmth/dominance now indexed by counterpart status and
audience, fairness/norm axes enter. This is where two people with equal *averages* start to diverge.

### Transition F3 → F4 (seamless)
**Trigger:** `(≥2 repeated encounters with the same NPC) OR (elapsed)`. **Mechanic:** the clearing's NPCs begin
to *persist and recognize* the player ("you again") across visits; the space slowly accrues structures (a bench,
a shared fire). The clearing becomes a place with *regulars* — community is forming without announcement.

### Higgsfield asset manifest — F3
- `f3_stall_server` NPC + stall prop. `f3_queue_markers` (line tiles + cut path).
- `f3_group_npcs` (3–4 conversing, with a ritual-gesture animation). `f3_marginal_npc` (excluded posture).
- `f3_bargain_table`. `f3_clearing_tileset` (warm, small, not a full town).

---

## FLOW 4 — "Repeated Games & Trust" (bonds over time)
**Purpose:** loyalty vs defection, promise-keeping, conflict & repair, non-reciprocal generosity. **Duration:**
ongoing / multi-session. **Why separate from F3:** trust requires *time and repetition*; it can't be read in a
single encounter.

### Beat structure (not seconds — repeated-interaction cycles)
- **Repeated exchange with a recurring partner:** cooperate / defect across rounds → **loyalty latent,
  dominance, warmth** (iterated-game signature; tit-for-tat vs exploit vs forgive). ⟂ a single defection ≠ a
  defector → trait/state + Student-t robustness handle it; the *pattern* over rounds is the cue.
- **Promise mechanic:** the player can commit to a future action (meet here tomorrow / bring X). `promise_kept`
  vs `promise_broken` over real elapsed sessions → **conscientiousness→formality, integrity** (HIGH, costly).
- **Conflict event:** a recurring partner defects/wrongs the player once. `conflict_response` — forgive /
  retaliate / withdraw / repair → separates **warmth, dominance, affect-volatility** at high stakes. ≈ "how
  they handle being let down by a friend."
- **Non-reciprocal generosity:** a chance to help a partner at real cost, with no possible return →
  **warmth(HIGH)**, the purest altruism read.

### Easter eggs
- Long-term: an NPC the player consistently helped becomes a steadfast ally who later *acts on the player's
  behalf* — foreshadowing the doppelgänger handover thematically.
- A "memory wall" easter egg where the world quietly records the player's kept/broken promises (visible only if
  sought) — a literal, in-world mirror of integrity.

### Unique contribution
Adds the **temporal axes** trust/loyalty/integrity that no single-shot situation can measure, and stress-tests
warmth/dominance under real stakes and real time. Critical for a faithful (not flattering) doppelgänger.

### Transition F4 → F5 (seamless)
**Trigger:** sustained relationships established + rising stakes. **Mechanic:** scarcity quietly returns (a
shortage, a pressure) and **private** moments begin to exist (the player is sometimes alone with a temptation).
No announcement; the world simply raises the stakes.

### Higgsfield asset manifest — F4
- `f4_recurring_partner` NPC w/ relationship states (neutral→ally→wronged).
- `f4_promise_token` prop. `f4_memory_wall` (kept/broken promise glyphs).
- `f4_conflict_scene` staging assets.

---

## FLOW 5 — "Pressure & the Unobserved Self" (private moral cues)
**Purpose:** honesty when lying pays, rule-following when unobserved, behavior under stress — the cues most
prone to performance earlier, now readable because the player is invested and behaving naturally. **Duration:**
woven through later play.

### Beat structure
- **Unobserved honesty:** a situation where lying/taking yields gain and *no one appears to see*. `honest_when
  _unwatched` vs `cheat` → **integrity (HIGH)**. The watched-vs-unwatched pair (with F3's queue) is the
  impression-management isolator.
- **Found property:** valuable item that's clearly someone else's → return / keep / report → integrity, warmth.
- **Stress/scarcity response:** under shortage, does the player hoard, share, panic, or stay measured? →
  **affect-volatility, warmth, dominance** under load.
- **Costly truth:** a chance to tell an uncomfortable truth that costs the player socially → honesty vs
  harmony preference.

### Easter eggs
- A subtle "no one is watching" cue (the camera pulls back, ambient hush) that is *itself* a tell — players who
  change behavior when unobserved reveal the gap between public and private self (the highest-value individuation
  signal). Designed so the shift, not the act, is the measurement.

### Unique contribution
Reads the **private self** — the gap between observed and unobserved behavior, which is where character (vs
reputation-management) actually lives. Highest validity, placed last by design.

### Transition F5 ↔ F6
These two interleave rather than sequence: pressure/privacy (F5) and community/belonging (F6) coexist in mature
play. The world oscillates between intimate-private and full-social.

### Higgsfield asset manifest — F5
- `f5_unwatched_cue` (camera/lighting hush state). `f5_found_property` prop.
- `f5_scarcity_overlay` (resource-shortage world dressing).

---

## FLOW 6 — "Community & Belonging" (the settlement)
**Purpose:** collective relationships, leadership emergence, aidiyet (belonging), reputation, the move from
"some others" to "a society." **Duration:** the open-ended endgame; the world keeps living here.

### Beat structure
- **Leadership emergence:** in group tasks, do others orient to the player? `others_follow`, `organizes_group`,
  `defers` → **dominance, energy**. Emergent, not assigned (no "leader" button).
- **Belonging & identity:** home/space customization, what the player displays, what they collect (Gosling
  behavioral-residue: a room as a cue) → **openness, formality, identity signature**.
- **Reputation & gossip:** information the player spreads/withholds about others → warmth, dominance, integrity.
- **Hosting vs attending:** throws a gathering / always attends / never shows → **warmth, dominance, energy**.
- **Conflict at scale:** group-level disputes, taking sides, mediating → the full social signature under
  collective stakes.

### Easter eggs
- The settlement slowly takes on the player's own aesthetic/behavioral fingerprint (tidiness, ornament, social
  density) — the world literally becoming a mirror of them. Deepest thematic egg.
- A culminating, optional moment where the player's **doppelgänger** (now well-learned) offers to handle an
  interaction for them — the diegetic birth of the handover, surfaced only when the posterior is calibrated
  enough (ties to the real autonomy gate).

### Unique contribution
Reads the **population-relative** identity (you against the crowd) and the collective-scale conditionals
(leadership, belonging, reputation) — the final, richest layer of the signature, and the on-ramp to autonomy.

### Higgsfield asset manifest — F6
- `f6_settlement_tileset` (homes, plaza, shared fire — warm, lived-in).
- `f6_home_customization` prop kit (orderly↔ornate↔sparse variants).
- `f6_gathering_scene` (host vs attend staging). `f6_doppelganger_cameo` sprite (player-mirroring avatar).

---

## CROSS-CUTTING — axis coverage (identifiability check)
Each axis must be hit by ≥3 confound-resolved cues across ≥2 flows. Quick map (build must verify in full):
- **warmth** → F2 opener/proxemics, F3 courtesy-to-server, F4 non-reciprocal generosity, F6 hosting.
- **dominance** → F2 cold-response reaction, F3 group initiation/queue-cut, F4 conflict, F6 leadership.
- **openness** → F0 unmarked-thicket/hill, F1 study-marker/explore, F3 conform-vs-deviate, F6 customization.
- **energy** → F0 movement/heading-rate, F1 gather cadence, F3 group size, F6 hosting.
- **formality** → F0 tidy/stack, F2 register, F4 promise-keeping, F5 honesty.
- **intellect** → F1 marker-study/puzzle-persist, F3 bargain reasoning, F6 organizing.
- **pace** → F0 t_first_move/speed-variance, F2 reply latency, F1 plant-vs-eat (discounting).
- **affect** → F0 reflection gaze, F1 persistence-after-fail, F2 cold-response volatility, F5 stress response.

## CROSS-CUTTING — weighting & processing (tie to the real engine)
1. Cue→axis loadings are **learned (FA W)**, not hardcoded; the tables above are *priors/hypotheses*.
2. Weight = ecological validity × reliability → implicit/costly/private/unobserved cues dominate; explicit/cheap
   cues get large measurement noise (small posterior movement).
3. **Cumulative**, not reactive: one act never defines a person (Student-t robustness + trait/state separation).
4. **Context is mandatory** on every event; conditionals (cue × counterpart-status × audience × stakes ×
   public/private) are where individuation lives — never drop context.
5. **Information-gain ordering:** within a flow, surface the situation that most reduces current posterior
   uncertainty / resolves the active confound (BALD), kept diegetically natural.
6. **Population-relative** scoring: the signal is deviation from the crowd, so a living population of others is
   part of the instrument.

## CROSS-CUTTING — Higgsfield pipeline note
All asset manifests target the existing 16-bit top-down RPG look in palette ink #1c1326 / parchment #f4e9d0 /
echo #a06cd5 / grass #74c365 / bark #7a4a2b, dusk light, soft grain. Each `hf gen` output should be exported as
a seamless tileset or sprite sheet, reusing VenueScene/TownScene conventions already in the repo so the new
scenes drop into the proven Pixi + BehavioralEvent pipeline without a new rendering path.

> **SUPERSEDED (2026-07-17, the 2D→3D migration).** This paragraph's rendering assumptions no longer
> hold, recorded here rather than silently ignored. The world is now **third-person low-poly 3D
> (Three.js/R3F)** with **procedural geometry** — there is a new rendering path, and the Higgsfield/
> Pixi/16-bit-tileset pipeline is dormant for the world (the landing keeps its PNGs). What this note
> got RIGHT and still holds: the scenes still feed **the proven `/observe/behavioral` ingress, no
> parallel measurement path** — that line is the one that mattered, and it survived. See
> `docs/world-design/art-bible.md §8` for the full addendum and what carried over unchanged.

---

## What the build prompt (next step) will demand
- All 7 flows as data-driven scenes feeding the proven `/observe/behavioral` ingress (no parallel path).
- Affordance-seepage transitions exactly per the triggers above (no walls, no "Level N").
- Every affordance emits on use/refusal/ignore with mandatory context + per-actor for social.
- Easter eggs implemented as real openness/curiosity cues, not cosmetic.
- Higgsfield-generated assets per manifest, dropped into the existing Pixi conventions.
- A playable first slice (Flow 0 + Flow 3, the baseline + the richest ecology) wired end-to-end with pasted
  evidence that the posterior moves and conditional buckets form — before the rest is built.
