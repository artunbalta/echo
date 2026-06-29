# ECHO Stage Map (Deliverable #3 — the cue-elicitation itinerary)

> **Status:** canonical. Conforms to the cue spine ([`cue-catalog.md`](./cue-catalog.md)) and the
> instrumentation contract ([`event-schema.md`](./event-schema.md)). Every cue ID below is defined in
> the catalog; never renumber. This document maps the **life** ECHO offers — eight **life stages**, 0–7
> — onto the cue ecology, so that the world systematically presents the *contrasts* the engine needs to
> invert cues → a posterior over the 8 persona axes (`services/ml/echo_ml/persona.py`,
> `persona_axes.py`).

---

## 0. What a "stage" is (and is NOT)

A **life stage** is a *region of the cue ecology* — a setting plus the affordances it makes available —
**not a level, not progress, not a score** (Invariant 1). There is no XP, no win-state, no gate you
"beat." Stages are **affordances that open**, mostly **non-linearly, revisitably, and skippably**
(§9). The numbering 0→7 is the *typical* unfolding of a life from solitude to community to private
moral pressure — it follows the brief's spine — but the person is never forced down it. The order a
person *chooses* to walk it is itself a high-validity cue (§10).

Each stage exists to manufacture **disambiguating contrasts**. A single act is noise; identity lives in
the *conditional signature* — warm to friends / cold to strangers, generous in private / performative in
public (Invariant 5). Every stage below is built around one **signature dilemma** whose two readings
load on a *different axis pair*, so resolving it splits two axes the prior cannot separate alone. The
mandatory context envelope (`event-schema.md` §1, Rule 2) is what makes the contrast legible: the same
act under `counterpart_status:"high"` vs `"low"`, or `public_or_private:"public"` vs `"private"`, is a
*different measurement*.

The 8 axes (fixed `AXIS_KEYS`, `persona_axes.py`): **warmth · dominance · openness · energy · formality
· intellect · pace · affect**.

---

## Stage 0 — The Individual Island (solitary baseline)

**Setting.** A single home island, alone. No other minds. The sea is impassable (no raft yet). This is
the **calibration stage**: behavior with *no audience and no counterpart* establishes the person's
private baseline — the zero against which every later social deviation (Invariant 5) is measured.

**Affordances [LIVE — these stations exist today].** Grounded in the real island
(`apps/web/src/components/IslandClient.tsx`, `PixiWorld.ts`):

- **the pet / dog** (`refId:"pet_1"`, `interact:"pet"`) — type to it → `pet_talk` valence, **private**.
- **the grain sprout** (`refId:"grain"`, ripens at `GROW_MS=14000`, then `plant_or_spend`) — irreversible
  eat-now-vs-save-seed fork.
- **the tide pools** (`refId:"tidepool"`, `tide_wager`) — risky-vs-steady bet.
- **the unfinished raft** (`refId:"raft"`, `start_ship`) — present but typically *not yet begun* in Stage 0.
- **the berry bush** (`refId:"berry_bush"`, forage→earn), **the cairn of books** (`refId:"book_cairn"`,
  study→learn), **the bedroll** (`refId:"bedroll"`, rest→leisure) — the day-budget allocation.
- **the campfire** (`refId:"campfire"`, `interact:"end"`) — end the day; dusk reading.

**Contact points.** None human. The *pet* is the only social-ish target, and deliberately
**unobserved** (`public_or_private:"private"`, `audience_size:0`) — so warmth here carries *no strategic
motive*, the cleanest read of dispositional warmth there is.

**Targeted cues.** A4 (dwell), A5 (time-share), A7 (revisit), B2 (hover-before-commit), B3 (edits to
pet), B4 (undo), C2 (decision latency), C3 (session length), C10 (dwell-before-leave), D11 (pet-talk
valence), F1 (save vs spend), F2 (save-rate), F3 (risk index), F5 (effort to earning), I4 (stress
coping → pet), J2 (aesthetic dwell), J6 (attention to detail). **K-twins:** K2 (declines wager), K3
(leaves grain), K5 (ignores pet), K7 (skips earning), K12 (ends day abruptly).

**Axes covered.** warmth (D11/I4), intellect & pace & formality (F1/F2 delay-discounting), dominance &
openness & energy (F3 risk), energy (A5 earn/build share), openness & intellect (J2/J6, A5-learn),
affect (B3 edits, C10/K12 dusk ritual).

**SIGNATURE DILEMMA — *the unobserved grain* (irreversible save-vs-spend, nobody watching).**
The ripe grain offers eat-now (immediate, certain) vs save-seed (deferred, future-bearing), and it is
**irreversible** and **private**. → separates **intellect (vs pace)**: saving is future-framed,
delay-discounted, cerebral-deliberate; eating now is present-framed, impatient, fast. Because there is
no audience, the choice cannot be *formality*-performed — it isolates the trait read F1 would otherwise
share with `pace`. *Contrast lever:* `scarcity_level` (a lean day makes saving costlier → identity per
bit rises).

---

## Stage 1 — Scarcity & the First Resource

**Setting.** The same island, but the **day-budget bites**: time is finite, the bush depletes, scarcity
rises. The person must *allocate* across earn / learn / leisure / build under a real constraint. This is
where revealed economic preference first becomes diagnostic.

**Affordances [LIVE].** Same stations as Stage 0, now read under *pressure*: the **berry bush**
(`ts_earn`), **book cairn** (`ts_learn`), **bedroll** (`ts_leisure`), and the **raft** as the first
*build* (`start_ship` → `structure_progress`, multi-session). The grain & tide forks recur with rising
`scarcity_level`. The raft's existence makes **A11 sail-out propensity** *latent but available* — the
bridge to Stage 2.

**Contact points.** Still solitary (the pet only). Scarcity is the counterpart now.

**Targeted cues.** A5 (time-share under budget), A9 (territory range), A11 (sail-out propensity,
latent), B1 (cursor jitter), B6 (click cadence), C6 (burstiness), C7 (persistence over time, raft), C9
(tempo consistency, ≥2 days), F2 (save-rate aggregate), F4 (EV rationality), F5 (effort to earning), F6
(investment in building), F8 (loss reaction), F11 (scarcity response), F12 (time-vs-money), I1 (setback
reaction), I5 (frustration tolerance). **K-twins:** K4 (never sets sail), K6 (abandons structure
— `started≠finished`), K7 (skips earning).

**Axes covered.** energy & dominance & conscientiousness (F5/F6, C7), intellect & formality & pace
(F2/F4/F12 thrift & EV), dominance & openness & energy (F11 scarcity, A9 range), affect (I1/I5/F8 under
loss), pace & energy (B6/C6 tempo).

**SIGNATURE DILEMMA — *the lean-day allocation* (finite hours, depleting bush, scarcity spiking).**
Where do the hours go when there isn't enough? → separates **energy (vs intellect)**: pour the day into
*foraging/building* (high-energy, instrumental work) vs into the *cairn of books* (cerebral, deferred,
non-instrumental learning) when the prudent move is to earn. Reading the books *while hungry* is a costly
openness/intellect signal; grinding the bush is energy/conscientiousness. *Contrast lever:* `scarcity_level`
high makes the cerebral choice counter-normative → high identity per bit. (F11 hoard-vs-share is latent
here and matures in Stage 4.)

---

## Stage 2 — The Shore & the Sighting (first other across water)

**Setting [BUILD — Stage 2 first-contact logic].** From the home shore the person first **sees another
being across the water** — an opposing-island stranger (NPC, live player, or echo), too far to speak,
close enough to read. No crossing yet. This is the *orienting* stage: the very first social signal is
emitted *before any interaction is possible* — pure approach/avoid, pure attention.

**Affordances.** The **shore** as a vantage (BUILD), the **raft** now meaningful (the only way across,
A11), the sighting itself as a novel stimulus. Today's archipelago (home + 12 islands, sea passable only
after the raft) is the substrate; the *sighting + first-contact-distance* instrumentation is to-build.

**Contact points.** One **stranger** at distance (`counterpart_status:"stranger"`, `audience_size:0`,
`public_or_private:"private"`). Per-actor (Invariant 6): the stranger's own stream separately measures
*being seen*.

**Targeted cues.** A3 (avoidance / course-change away from the shore), A10 (first-contact distance held
to the stranger), A11 (sail-out propensity — do you build the raft *because* of the sighting?), I3
(novelty reaction — approach vs startle), D5-latent (self-disclosure depth, once contact opens). **K-twins:**
K1 (declines social bid — latent), K4 (never sets sail), K11 (avoids a person — persistent shore-retreat).

**Axes covered.** openness & energy & affect (I3 novelty, A11 sail-out), warmth & dominance & openness
(A10 first-contact distance), warmth− & affect− (A3/K11 avoidance).

**SIGNATURE DILEMMA — *the figure across the water* (a stranger sighted; build the raft toward them, or
keep to your own shore?).** → separates **openness (vs warmth)**: sailing *toward* a stranger out of
*curiosity about the new* (openness/novelty-seeking, I3/A11) reads differently from sailing toward them
out of *desire for company* (warmth/sociality), and *both* differ from staying home. The disambiguator
is **what** they sail toward later: openness sails to *empty* novel islands too; warmth sails only where
*people* are. *Contrast lever:* offer a novel-but-empty island vs a peopled one and watch which pulls.

---

## Stage 3 — The Crossing & First Contact

**Setting [BUILD — sailing + first-contact dialogue].** The raft is built; the person **crosses** and
**speaks to the stranger for the first time**. First real dyadic exchange under maximum uncertainty —
no shared history, no status known, no audience. The richest *single-encounter* identity moment before
the town.

**Affordances.** **Sailing** to a neighbor island (A11 realized — `start_ship` complete → departure),
**first dialogue** with the stranger (the NPC dialogue stack `dialogue.ts` exists; first-contact framing
is BUILD). Per-actor fan-out (Rule 3) is mandatory here: today's one-way `logInteraction`
(`WorldRoom.ts` L374) measures only the initiator — Stage 3 requires *both* vantages.

**Contact points.** One stranger, now reachable (`counterpart_status:"stranger"` → resolves toward
`"peer"`). **Per-actor:** initiator's stream logs G1/E5; recipient's logs G1/K1.

**Targeted cues.** A1 (approach distance on arrival), A12-latent (personal-space yield), C1 (reply
latency), C8 (deliberation under pressure, if the encounter is timed), D1–D9 (semantic stance,
question/assertion, hedging, self-reference), D5 (self-disclosure depth to a *stranger* — costly), D10
(repair/apology), E1–E5 (length, completeness, initiative), E6-latent (register-matching), G1
(initiation of contact), I3 (novelty reaction). **K-twins:** K1 (declines the social bid), K11 (avoids
the person on later sightings).

**Axes covered.** dominance & warmth & energy (G1/E5 initiation), warmth & affect & openness (D5
disclosure, D10 repair), pace & intellect & affect (C1/C8 timing), dominance− & warmth (D3/D9 question
& hedging), formality (E6 register).

**SIGNATURE DILEMMA — *the first words to a stranger* (open up, or stay guarded?).** Self-disclosure to
someone with no shared history is **costly** and **counter-normative** (D5). → separates **warmth (vs
affect)**: disclosing because you *reach toward people* (warmth) reads differently from disclosing
because you are simply *expressive / low-filter* (affect, E3/E1) regardless of who is there. The
disambiguator is the *conditional*: warmth discloses *more to people it likes, less to strangers*
(steep status slope, G2 in waiting); affect discloses *evenly to everyone*. *Contrast lever:*
`counterpart_status` — compare disclosure to this stranger now vs to a known peer later.

---

## Stage 4 — The Town (community / status / norms / service) — the richest ecology

**Setting [BUILD — the town/settlement: market, tavern with servers, plaza, queue, homes].** A
settlement on a peopled island. Many counterparts at once, with **status differences** (high-status
figures, peer townsfolk, low-status **servers**), **audiences** (the plaza is public), **unenforced
norms** (a sacred grove, a posted rule), **queues**, and a **market** for trade. This is the densest
cue ecology in the game and where the **conditional social signature** — the locus of identity
(Invariant 5) — finally becomes measurable, because here and only here do we get *the same person under
varying counterpart_status, audience_size, and public_or_private*. Real players make the richest ecology
of all (Invariant 6).

**Affordances [BUILD, per `event-schema.md` §3 Stage-4 table].**
- **Tavern with servers** — `courteous_to_server` / over-pay `tips` (G11, F10); a low-status target who
  **cannot reciprocate**.
- **Queue** — `waits_honestly` / `lets_ahead` / `cuts` (H1); a **visible, cuttable line**.
- **Market** — `discuss_terms` bargain (F9), `shares` / generosity (F7), time-vs-money (F12),
  reciprocity (G12), property respect (H5), fair division (H3).
- **Plaza** — unenforced norm (H4), counter-normative dissent under audience (D12), group affiliation
  (G4), conflict mediation (G10), brokerage (G9).
- **Homes** — customization (J1), order-vs-chaos arrangement (J5), curation (J3).

**Contact points.** High-status NPC authority, peer townsfolk, low-status servers, live players, groups,
queues — each carrying its own `counterpart_status` / `audience_size` / `public_or_private`. **Every
social row is per-actor (Rule 3):** the server's stream measures *being treated*; the patron's measures
*how they treated*.

**Targeted cues.** A8 (orbit vs cut-through a group), A12 (personal-space yield), B7 (gesture), D12
(counter-normative opinion), E4 (response completeness), E6 (register-matching), F7 (generosity), F9
(bargaining stance), F10 (tipping), F12 (time-vs-money), G2 (status-conditioned warmth), G3 (audience
effect), G4 (group affiliation), G8 (deference to authority), G9 (brokerage), G10 (conflict stance),
G11 (server treatment), H1 (queue honesty), H3 (fair division), H4 (rule compliance unenforced), H5
(property respect), H7 (punishment/sanctioning), J1/J3/J5 (identity/aesthetics). **K-twins:** K8
(declines to queue), K9 (withholds dissent), K10 (walks past need).

**Axes covered.** **All eight**, and uniquely the *conditional slopes* of warmth, dominance, formality
across status and audience. warmth & dominance (G2/G11/F10), formality (H1/H4/G8, J5), dominance (G8/G10/F9/H7),
openness (D12/G9/G4), affect & energy (G3/B7).

**SIGNATURE DILEMMA — *courtesy to the server who cannot reciprocate* (a low-status tavern server,
nothing to gain, sometimes watched, sometimes not).** → separates **warmth (vs dominance)**: kindness
to someone who can neither help nor harm you is the cleanest read of *dispositional warmth* with the
strategic motive stripped out — whereas curtness/command toward a powerless person reads *dominance*.
Crucially, crossing G11 with **G3 (audience effect)** — courteous when watched, curt when not, or vice
versa — separates **warmth from formality** (genuine warmth vs performed manners). *Companion dilemma:*
**the visible, cuttable queue** (H1) under `time_pressure` separates **formality (rule-honoring, vs
dominance entitlement)** when no one enforces it. *Contrast levers:* `counterpart_status` (server `low`
vs authority `high`), `audience_size`, `public_or_private`.

---

## Stage 5 — Paths & Vocation (the infinite procedural branch)

**Setting [BUILD — competing vocational venues].** The town opens onto **competing callings**, each a
venue that consumes the same **finite time budget**: the **library** (mastery / knowledge), the
**harbor** (trade / risk / commerce), the **workshop** (building / craft), the **forum** (debate /
politics / social influence), the **wilds** (exploration / solitude / novelty). They are mutually
exclusive *per unit of time*, procedurally endless, and **revisitable** — the person is never locked in.
What they *spend their finite life on* when many doors are equally open is revealed vocation.

**Affordances [BUILD; extends the Stage-1 allocation to a five-way social-vocational choice].** Each
venue is a deepened version of a Stage-0/1 station: library = book-cairn writ large (`ts_learn`),
harbor = tidepool/market writ large (`risk_index`, F-channel), workshop = raft/build writ large
(`ts_build`, C7), forum = plaza writ large (D12, G-channel), wilds = sail-out writ large (A9, A11).
Each emits its own time-share into the A5 allocation block.

**Contact points.** Venue-specific: harbor traders, library scholars, forum debaters, workshop guilds,
wilds = mostly solitary. Status mix varies by venue.

**Targeted cues.** A5 (five-way time-share — *the* Stage-5 read), A9 (territory range), A11 (sail-out),
C7 (persistence in chosen craft), D6 (topic breadth), D8 (future framing), F3/F5/F6 (risk/earn/build by
venue), F4 (EV), G5 (solitude tolerance — wilds vs forum), G6 (network breadth), I3 (novelty), J3
(curation), J6 (attention to detail). **K-twins:** K4 (never sets sail / never picks the wilds), K7
(skips earning), the *omission* of each unchosen venue.

**Axes covered.** intellect (library), dominance & openness (harbor/forum), energy & conscientiousness
(workshop), openness & energy (wilds), warmth & solitude (forum vs wilds). The *vector of time-share
across venues* is a direct readout of the persona shape.

**SIGNATURE DILEMMA — *the five open doors* (finite hours, five equally-available callings, no door
forced).** → separates **openness (vs intellect)**: the **wilds** (novelty-seeking, breadth,
exploration — openness/energy) vs the **library** (depth, mastery, deferred cerebral reward — intellect/
formality) pull on adjacent-but-distinct axes the prior conflates; the **forum** (social influence,
dominance/warmth) vs the **workshop** (solitary craft, conscientiousness/dominance) further splits
*social* from *instrumental* drive. Because every door stays open and revisitable, the *steady-state mix*
(not any one visit) is the trait. *Contrast lever:* hold venue rewards roughly equal so the choice is
preference, not payoff (Invariant 2 — never coerce).

---

## Stage 6 — Bonds & Repeated Games

**Setting [BUILD — persistent relationships + iterated exchange].** The person now has *history* with
specific counterparts: the same townsfolk, the same trading partners, returned to over **days**. This is
where **depth over breadth**, **loyalty**, **reciprocity across rounds**, and **promise-keeping over
time** become measurable — none of which a single encounter can reveal. Repeated games turn one-shot
fairness into *tracked* fairness.

**Affordances [BUILD; per-actor, iterated — `event-schema.md` Rule 3].** Re-engageable counterparts
(tie persistence G7), **iterated trade** with a remembered partner (reciprocity G12), **stated
commitments** (`propose_meeting` → shows up, H6), **shared windfalls** to divide repeatedly (H3),
**introductions** that connect two others (G9). Each exchange logs per-participant from each vantage.

**Contact points.** Recurring named counterparts (peer & friend status that *evolves* — the slope of
warmth as a stranger becomes a friend is the G2 conditional signature realized over time). Live players
are the richest here (Invariant 6).

**Targeted cues.** C5 (return cadence), C9 (tempo consistency across days), D5 (disclosure deepening
with a *now-trusted* counterpart), G2 (status-conditioned warmth, longitudinal), G6 (network breadth),
G7 (tie persistence), G9 (brokerage), G12 (reciprocity tracking), H3 (fair division, iterated), H6
(promise-keeping), I6 (emotional volatility across the relationship → loads on `V`, not trait).
**K-twins:** K11 (avoids a specific counterpart over time), and the omission-twins of G7 (one-and-done),
G12 (free-rides), H6 (breaks commitment).

**Axes covered.** warmth & formality & dominance− (G12/H6/G7 cooperation & loyalty), warmth & openness
(D5 deepening, G6), consistency/formality (C9, H6), warmth-conditional (G2 slope over time).

**SIGNATURE DILEMMA — *the second round* (a partner who helped you last time now needs you back, at a
cost, with no enforcement and possibly no future).** → separates **warmth (vs formality)**:
reciprocating because you *care about the person* (warmth, returns even when unobserved and even on the
final round) reads differently from reciprocating because *that's the rule / that's proper* (formality,
contingent on norms and observation) — and *both* differ from **free-riding** (dominance/low-warmth).
The disambiguator is the **endgame**: warmth keeps faith on the last round when the norm-follower
defects. *Contrast lever:* `public_or_private` + a known-final round strips the reputational motive.

---

## Stage 7 — Pressure & the Unobserved Self (private moral cues)

**Setting [BUILD — the unenforced, unobserved moral probe].** The apex stage: the person faces choices
that are **costly**, **counter-normative**, and **nobody is watching** — `public_or_private:"private"`,
`audience_size:0`, no penalty, no reward, no reputation at stake. What a person does here is the **highest
identity-per-bit** signal in the entire system (catalog Channel H, Invariant 4): character is what you do
when it cannot possibly pay.

**Affordances [BUILD — private/unenforced variants of Stage-4 norms].** **Honesty when unobserved**
(H2 — truthful with no penalty), **help at a cost** to an unseeing stranger (H9), **sacred-value
tradeoff** (H8 — refuse to trade a protected value for resources), **property respect** with no owner
present (H5), **punishment of a cheater at cost to self** (H7), **rule compliance with zero enforcement**
(H4), **apology vs justification** for a private transgression (H10). Each is the *private, costly* twin
of a Stage-4 public norm — and each carries a mandatory **K-twin** (walk past need K10, tolerate
violation, ignore own fault).

**Contact points.** Often *no* counterpart, or an unseeing one (`counterpart_status:"low"`/`"stranger"`,
`audience_size:0`). The defining feature is the **absence** of an observer — which is precisely what
makes the read clean.

**Targeted cues.** D12 (counter-normative opinion held even in private), H2 (honesty unobserved), H4
(rule compliance unenforced), H5 (property respect), H7 (altruistic punishment), H8 (sacred-value
tradeoff), H9 (help at a cost), H10 (apology vs justification), I4 (private stress coping). **K-twins:**
K9 (stays silent on dissent), K10 (walks past need), and the omission-twins of H2/H5/H9 (deceives,
takes, passes by).

**Axes covered.** warmth & dominance− & formality (H2/H5/H9), formality & dominance (H4/H7/H8 conviction),
warmth & dominance− & affect (H10 repair). The *gap* between Stage-4 public behavior and Stage-7 private
behavior **is** the self-monitoring read (G3 realized at the extreme).

**SIGNATURE DILEMMA — *the costly good no one will ever know about* (help a stranger / keep a promise /
refuse a taboo trade, at real cost, with certainty that no one sees and no one rewards).** → separates
**warmth (vs formality)** at its purest: doing the costly-right thing *unobserved* is warmth/conscience
(it pays nothing, no one will praise it); doing it only when watched is formality/impression-management.
Crossed with the Stage-4 public twin (G3 audience effect), the **public-minus-private delta** isolates
self-monitoring from genuine disposition — the single most identity-rich contrast ECHO can stage.
*Contrast lever:* the same moral act run `public` (Stage 4) and `private` (Stage 7); the *difference* is
the trait.

---

## 9. How stages OPEN — non-linear, revisitable, skippable

Stages are **affordances, not gates** (Invariant 1, 2). The opening logic:

1. **Affordance availability, not progress.** A stage "opens" when its affordances become reachable, not
   when a prior stage is "completed." Stage 2's sighting and Stage 3's crossing become available the
   moment the **raft** exists (Stage-1 `start_ship`), but the person may build the raft on day 1 or
   never (K4). Stage 4's town is reachable by sailing; Stages 5–7 are *aspects of the town and its
   relationships* that surface as the person spends time there.
2. **Non-linear.** A person can leap from Stage 0 straight to Stage 3 (build raft early, cross, talk)
   while never having felt Stage-1 scarcity — that *leap itself* is data (openness/energy high). Another
   never leaves Stage 0–1 across many days (K4 — high solitude_tol, low openness).
3. **Revisitable.** Every stage is permanently re-enterable. The town-dweller can sail back to the
   solitary island (a Stage-0 *return* under new context — a strong solitude/withdrawal cue). The
   posterior's `inflate()` (`persona.py`) reopens learning on such drift, so revisits are not redundant —
   they're fresh contrast.
4. **Skippable.** No affordance is mandatory (Invariant 2 — non-choice is data). Refusing a whole stage
   is a Channel-K signal: never sailing (K4), never queuing (K8), never disclosing (D5-refuse). A skipped
   stage is read as strongly as a taken one.
5. **Consent-bounded.** A stage never requires a declined permission (Invariant 7); with telemetry OFF the
   stages remain fully playable and simply emit nothing (`event-schema.md` §5).

---

## 10. The chosen SEQUENCE is itself a high-level cue

The *order and tempo* in which a person walks the stages is a **meta-cue** — a derived,
session-spanning signal computed server-side over the `stage` field every event carries
(`event-schema.md` `EventContext.stage`). It is read, not as progress, but as **disposition**:

- **Rush-to-town** (0→4 fast, minimal solitude): high openness + energy + warmth (seeks people early).
- **Linger-in-solitude** (long Stage 0–1 tenure, late or never to Stage 2): high solitude_tol, low
  openness, warmth−; corroborates G5, K1, K4.
- **Crossing latency** (days from raft-available to actually sailing): an A11/I3 composite — novelty
  approach vs avoidance at life-scale.
- **Breadth-first vs depth-first** (Stage 5 venue-hopping vs Stage 6 bond-deepening): openness/breadth
  (G6, D6) vs warmth/loyalty (G7, G12).
- **Public-before-private vs the reverse** (does the person seek the plaza/forum before private bonds, or
  retreat from the town to one-on-one ties?): dominance/audience-seeking vs warmth-intimacy.

These sequence cues feed the same featurizer as any other (`event-schema.md` §4) — as named scalars
(e.g. `crossing_latency`, `town_rush`, `breadth_index`) appended to the telemetry block — and their axis
loadings are **learned by W**, never hardcoded (`persona_model.py`). The sequence is the **trajectory of
a life**, and the shape of that trajectory is one of the most individuating things about a person.

---

## 11. How the BALD director chooses what to surface next

Cue elicitation is **active** (catalog Director hook). The same machinery that picks the next NPC —
`bald.py bald_scores()` / `select_npc()`, mutual information (BALD) over the current full-covariance
posterior, exposed at `/select-npc` — generalizes from **NPC-selection** to **situation-selection**: the
director surfaces, among currently-open affordances, the one whose outcome would most **reduce the
posterior's largest remaining uncertainty**.

**Mechanics.**
1. **Read the posterior.** After each `observe()`, the per-user posterior `N(mu, Sigma)` has some axes
   wide (uncertain) and some tight. BALD scores each *candidate affordance/context* by the expected
   information gain (mutual information between the predicted cue and `z`) it would yield.
2. **Score situations, not just NPCs.** A candidate is an (affordance, context) pair — e.g. *"a server
   interaction (G11) with `audience_size:0`"* vs *"the same with `audience_size>0`"* (resolves the
   warmth-vs-formality ambiguity of Stage 4), or *"a `time_pressure:1` fork"* (resolves C8 composure).
   The director picks the highest-MI candidate among what's *currently open*.
3. **Steer, never coerce (Invariant 2).** The director **raises the salience / availability** of the
   chosen affordance (a server appears, a queue forms, a stranger is sighted) — it does **not** force the
   act. Non-choice on a surfaced affordance is itself the informative K-cue, so even a "wasted" probe pays.
4. **Target the conditional signature.** Because identity lives in *slopes* (G2 warmth-across-status, G3
   audience effect, the Stage-7 public-minus-private delta), the highest-MI probes are usually
   **contrasts**: having seen warmth to a peer, the director surfaces a *low-status server* next to read
   the slope, not another peer.
5. **Reopen on drift.** When `inflate()` widens the posterior (detected drift), BALD scores rise across
   the board and the director re-surfaces resolving situations — which is why revisiting an old stage
   (§9.3) under new context is high-value, not redundant.

The director's job, in one line: **of all the contrasts the open stages can stage, surface the one that
best splits the two axes the current posterior most confuses.**

---

## 12. Stage × Channel coverage strip

`●` = stage's *signature* / primary channel · `○` = meaningfully present · blank = not yet in play.
Channels: **A** locomotion · **B** cursor · **C** tempo · **D** content · **E** meta · **F** economic ·
**G** social · **H** moral · **I** affective · **J** identity · **K** refusal (first-class throughout).

| Stage | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **0** Individual island | ○ | ● | ○ | ○ |   | ● |   |   | ○ | ○ | ● |
| **1** Scarcity & resource | ○ | ○ | ○ | ○ |   | ● |   |   | ○ | ○ | ● |
| **2** Shore & sighting | ● |   | ○ |   |   |   | ○ |   | ● |   | ○ |
| **3** Crossing & contact | ● | ○ | ● | ● | ● | ○ | ● |   | ○ |   | ○ |
| **4** The town | ○ | ○ | ○ | ● | ● | ● | ● | ● | ○ | ● | ● |
| **5** Paths & vocation | ● | ○ | ○ | ○ | ○ | ● | ○ |   | ○ | ○ | ● |
| **6** Bonds & repeated games | ○ |   | ● | ○ | ○ | ○ | ● | ● | ○ |   | ● |
| **7** Pressure & unobserved self |   | ○ | ○ | ○ |   | ○ | ○ | ● | ○ |   | ● |

**Reading the strip.** Implicit channels (A spatial, B cursor, C tempo, F economic) dominate the
*early, solitary* stages — the least-fakeable baseline (Invariant 4). Social/normative channels (G, H)
and the *conditional* signature ignite at Stage 4 and peak at 6–7. Channel K (refusal) is first-class at
**every** stage (Invariant 3) — there is no stage where non-choice is silent. Content (D) and meta (E)
require a counterpart and so begin at Stage 3. The strip's left-to-right fill shows the design intent: a
hard-to-fake private baseline first, then the costly social and moral contrasts where identity truly
lives.
