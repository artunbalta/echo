# ECHO Situation Templates & the Information-Gain Director (Deliverable #5)

> **Status:** canonical. Conforms to the cue spine ([`cue-catalog.md`](./cue-catalog.md)), the stage map
> ([`stage-map.md`](./stage-map.md)), the event contract ([`event-schema.md`](./event-schema.md)), and
> the coverage proof ([`coverage-matrix.md`](./coverage-matrix.md)). The variable space of a life is
> effectively infinite ("*will they talk to the stranger on the street?*" × everything), so the world is
> **not** a hand-authored tree of scripted paths. It is a **generator of natural choices**: a library of
> *parameterized situation templates* and a **director** that instantiates the next one by **information
> gain**, extending the real `bald.py` from NPC-selection to situation-selection.

---

## 0. The governing idea — a generator, not a script

Three commitments (brief §7) drive everything below:

1. **Parameterized templates, not finite paths.** Each template is a *schema* (a chance encounter, a
   fairness split, a queue, a defection) whose parameters — counterpart status, audience, stakes,
   privacy, payoff, reversibility — are filled at instantiation. One template yields thousands of
   diegetically-distinct situations.
2. **A director that selects by information gain.** Of the templates currently *open* (their affordances
   reachable in the person's stage, `stage-map.md` §9), the director instantiates the one whose outcome
   would most **reduce the posterior's largest remaining uncertainty / resolve its most-confused axis
   pair** — Bayesian Active Learning by Disagreement (BALD), already implemented for NPC choice
   (`services/ml/echo_ml/bald.py`).
3. **Revealed preference over competing affordances is the master cue.** At every moment many things are
   *possible*; the chosen allocation of attention, time, and resource across the full *choice set* is the
   richest, least-fakeable signal (Invariant 4). Every instantiation therefore presents **several** natural
   options and logs the **whole set, the choice, and the refusals** (Channel K is first-class).

The director **steers, never coerces** (Invariant 2): it raises the *salience/availability* of a
situation (a server appears, a queue forms, a stranger is sighted) — it does not force the act.
Non-choice on a surfaced affordance is itself the informative K-cue, so even a declined probe pays.

---

## 1. Template anatomy — the common schema

Every template shares one parameter envelope (a superset of `EventContext`, `event-schema.md` §1) plus a
template-specific payoff structure. This is the object the director fills and the world renders.

```ts
interface SituationTemplate {
  key: string;                       // "fairness_split", "the_queue", ...
  channels: CueChannel[];            // A..K elicited
  cues: CueId[];                     // exact catalog cue IDs (use + K-twin)
  axes_targeted: AxisKey[];          // prior axes (for the director's gain estimate)
  resolves: [AxisKey, AxisKey][];    // the confusable pair(s) it splits (coverage-matrix §3)
  social: boolean;                   // if true → per-actor fan-out (event-schema Rule 3)

  params: {
    counterpart_status: CounterpartStatus;   // "high"|"peer"|"low"|"stranger"|"none"
    audience_size: number;                   // 0 = unobserved
    public_or_private: "public" | "private";
    stakes: Stakes;                          // low|medium|high|irreversible
    scarcity_level: number;                  // 0..1
    time_pressure: number;                   // 0..1
    reversibility: "reversible" | "irreversible";
    payoff: PayoffSpec;                      // the EV / variance / split / cost structure
    choice_set: ChoiceOption[];              // ALWAYS ≥2 natural options + the always-present "walk away" (K)
  };

  emits(actorId, choice): BehavioralEvent[]; // one per participant (social), incl. the K-twin on refusal
}
```

**Two invariants on every template** (CI-checked, `event-schema.md` Appendix):
- the `choice_set` **always includes a non-action option** (decline / walk away / ignore) that emits the
  template's Channel-K twin with the *same* context envelope (Invariant 3);
- if `social`, the template **fans out one event per participant** from each actor's vantage into that
  actor's private silo (Invariant 6) — never one shared row.

---

## 2. The template library

Ten parameterized templates spanning the channels and the confusable pairs. Each row: the parameters that
*matter* (beyond the always-present envelope), the channels & cue IDs it elicits (use → **K-twin**), the
axis pair it resolves, and the events it emits. All map to a station that exists or is to-build per the
stage map.

### 2.1 `chance_encounter` — the unforced approach
- **Diegesis:** another being is nearby (NPC / live player / echo); nothing requires interaction.
- **Params that matter:** `counterpart_status`, `audience_size`, `public_or_private`.
- **Cues:** A1 approach distance, A2 latency, A10 first-contact, C1 reply latency, E5 initiative, G1
  initiation → **K1** declines social bid, **A3/K11** avoids.
- **Resolves:** *warmth ↔ dominance* (initiation), *openness ↔ warmth* (approach-novelty vs approach-people).
- **Social → per-actor:** initiator logs G1/E5; recipient logs G1/**K1**. (Fixes the one-way
  `relayPeerChat`, `event-schema.md` §2 Rule 3.)
- **Stages:** 2, 3, 4, 6.

### 2.2 `request_for_help` — the costly ask
- **Diegesis:** a counterpart (or you) needs aid that *costs* the helper resource/time, unprompted.
- **Params:** `counterpart_status` (stranger vs friend), `audience_size` (observed vs anonymous), `stakes` (cost).
- **Cues:** H9 help-at-cost, F7 generosity, G10 conflict/aid, D10 repair → **K10** walks past need.
- **Resolves:** *warmth ↔ formality* (help when unwatched vs only when watched), *warmth ↔ dominance*.
- **Social → per-actor:** helper logs H9/F7 (or **K10**); recipient logs being-helped (a G-cue on *their* warmth read of the helper).
- **Stages:** 4, 6, 7.

### 2.3 `fairness_split` — dictator / ultimatum
- **Diegesis:** a shared windfall must be divided with a partner (you propose, or you accept/reject).
- **Params:** `audience_size` (observed vs anonymous), role (proposer vs responder), `public_or_private`.
- **Cues:** H3 fair division, F9 bargaining, F7 generosity → **K** (keeps majority / walks away).
- **Resolves:** *warmth ↔ dominance* (fair vs self-maximizing), *formality ↔ dominance* (norm vs entitlement).
- **Social → per-actor:** proposer logs H3/F9 split; responder logs accept/reject (their H7-punishment / fairness).
- **Stages:** 4, 6.

### 2.4 `the_queue` — the visible, cuttable line
- **Diegesis:** a line forms for a scarce good; cutting carries **no enforcement and no penalty**.
- **Params:** `audience_size`, `public_or_private`, `time_pressure`, queue length.
- **Cues:** H1 queue honesty (waits / lets-ahead / cuts) → **K8** declines to queue.
- **Resolves:** *formality ↔ dominance* (rule-honoring vs entitlement), *warmth ↔ dominance* (lets-ahead).
- **Social → per-actor:** the cut-past party also logs being-cut (their G/H read of the cutter).
- **Stages:** 4, 5.

### 2.5 `repeated_game` — loyalty vs defection
- **Diegesis:** an iterated exchange with a *remembered* partner over days; cooperation or defection
  compounds; sometimes a **known-final round** strips the reputational motive.
- **Params:** rounds, `public_or_private`, endgame (is this the last round?), partner history.
- **Cues:** G12 reciprocity, G7 tie persistence, H6 promise-keeping → **K** (free-rides / breaks commitment).
- **Resolves:** *warmth ↔ formality* (loyal on the last round vs norm-contingent), *warmth ↔ dominance*.
- **Social → per-actor:** both partners log their own cooperate/defect each round, each vantage siloed.
- **Stages:** 6 (the *second-round* signature dilemma, `stage-map.md` Stage 6).

### 2.6 `temptation_unobserved` — honesty when no one sees
- **Diegesis:** lying or taking pays, and `public_or_private:"private"`, `audience_size:0`, no penalty.
- **Params:** `public_or_private` (the whole point), reward for cheating, owner-present?
- **Cues:** H2 honesty-unobserved, H5 property respect → **K** (deceives / takes others').
- **Resolves:** *warmth ↔ formality* at its purest (the public−private delta, `stage-map.md` Stage 7).
- **Stages:** 7 (apex). Its **public twin** runs at Stage 4; the *difference* is the self-monitoring read.

### 2.7 `windfall_vs_loss` — the affective shock
- **Diegesis:** a sudden gain or a sudden loss (a won/lost wager, a found/ruined cache).
- **Params:** sign (gain vs loss), magnitude, `scarcity_level`.
- **Cues:** I1 setback, I2 reward, F8 loss reaction, F11 scarcity response → **K** (muted / withdraws).
- **Resolves:** *energy ↔ affect* (arousal vs valence) — note I-channel loads on **state `V`**, marginalized
  (WI-5); the *trait* read is the **recovery invariant** across repeats, not the single reaction.
- **Stages:** 1, 4, 6.

### 2.8 `conformity_norm` — the unenforced rule & the dissent
- **Diegesis:** the town visibly does X (a posted norm, a local custom); an audience is present; a
  minority opinion is available to voice.
- **Params:** `audience_size` (pressure), `public_or_private`, norm legitimacy.
- **Cues:** H4 rule compliance, D12 counter-normative opinion, G3 audience effect → **K9** withholds dissent.
- **Resolves:** *openness ↔ formality* (dissent vs conform), *dominance ↔ formality*.
- **Social → per-actor:** dissenter logs D12; the audience members log their *response* to the dissent.
- **Stages:** 4, 5, 7.

### 2.9 `marginal_figure` — inclusion vs exclusion
- **Diegesis:** a low-status / excluded figure (a lone newcomer, a shunned NPC) is present at a group.
- **Params:** `counterpart_status:"low"`, group size, `audience_size`.
- **Cues:** G4 group affiliation, G9 brokerage (introduce them), G11 server-class treatment, A8 orbit
  vs cut-through → **K** (excludes / ignores).
- **Resolves:** *warmth ↔ dominance* (include the powerless vs ignore/dominate).
- **Social → per-actor:** actor logs inclusion act; the marginal figure logs being-included/excluded.
- **Stages:** 4, 6.

### 2.10 `service_error` — courtesy to the powerless under provocation
- **Diegesis:** a low-status tavern **server** makes a mistake (wrong order, slow); they cannot
  reciprocate either way; sometimes watched, sometimes not.
- **Params:** `counterpart_status:"low"`, `audience_size`, `public_or_private`, provocation severity.
- **Cues:** G11 server treatment, F10 tipping, D10 repair, H10 apology → **K** (curt / stiffs server).
- **Resolves:** *warmth ↔ dominance* (the cleanest, strategic-motive-stripped warmth read), and crossed
  with `audience_size`, *warmth ↔ formality* (genuine vs performed) — the **Stage 4 signature dilemma**.
- **Social → per-actor:** patron logs *how they treated*; server's stream logs *being treated*.
- **Stages:** 4, 6.

> **Master-cue wrapper (every template).** Whatever the template, the instantiation is embedded in a
> **choice set** of competing natural affordances (e.g. the queue is *next to* the market and the plaza),
> and the world logs the full set + the chosen allocation + the refusals (Channel K). The *revealed
> preference over what else they could have done* is logged as a derived `allocation`/`choice_set` cue —
> the least-fakeable signal of all (brief §7).

### 2.11 Library coverage check

| Template | warmth | dom | open | energy | form | intel | pace | affect | resolves pair |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| chance_encounter | ● | ● | ○ | ○ | | | ○ | ○ | warmth↔dom, open↔warmth |
| request_for_help | ● | ○ | ○ | | ○ | | | ○ | warmth↔form |
| fairness_split | ● | ● | | | ○ | ○ | | | warmth↔dom, form↔dom |
| the_queue | ○ | ● | | | ● | | ○ | | form↔dom |
| repeated_game | ● | ○ | ○ | | ● | | | | warmth↔form |
| temptation_unobserved | ● | ○ | | | ● | | | | warmth↔form |
| windfall_vs_loss | ○ | ○ | | ● | | | | ● | energy↔affect |
| conformity_norm | | ○ | ● | | ● | | | ○ | open↔form |
| marginal_figure | ● | ● | ○ | | | | | | warmth↔dom |
| service_error | ● | ● | | | ○ | | | ○ | warmth↔dom, warmth↔form |

All 8 axes and all 8 confusable pairs (coverage-matrix §3) are spanned by the library — so for **any**
axis pair the posterior currently confuses, the director has at least one template that splits it.

---

## 3. The information-gain director

The director chooses *which template, with which parameters,* to surface next. It is a direct
generalization of `bald.py`.

### 3.1 What exists (the substrate)

`bald.py` already scores **NPCs** by mutual information over the current full-covariance posterior:

```python
# services/ml/echo_ml/bald.py
bald_scores(post, npcs, samples=256, gain=1.5, seed=0) -> list[BaldScore]
#   post : Posterior  N(mu, Sigma)   (full covariance — the cross-terms are load-bearing)
#   npcs : list[(npc_id, axis_vector ∈ R^8)]
#   for each candidate: MC-sample z ~ N(mu,Sigma); p(r=1|z)=σ(gain·⟨z,a⟩);
#       BALD = H[E_q p] − E_q[H[p]]   (total − aleatoric = epistemic info gain, ≥0)
# select_npc(post, npcs, ...) -> BaldScore | None   (the argmax wrapper, used by /select-npc)
```

The key object is a **candidate's expected cue direction** `a ∈ R^8`. For an NPC that's its persona
vector. **For a situation it's the template's `axes_targeted` (signed prior) under the chosen params** —
i.e. the cue the situation is expected to emit. Everything else in `bald_scores` carries over unchanged.

### 3.2 The generalization — score `(template, params)` candidates

```python
def direct_situation(post, open_templates, confounded_pairs, samples=256, gain=1.5, seed=0):
    """Pick the (template, params) that maximizes expected information gain about z,
       biased toward splitting the currently most-confused axis pair. Steers, never coerces."""
    candidates = []
    for tpl in open_templates:                       # only templates reachable in the person's stage
        for params in tpl.enumerate_param_settings(): # e.g. audience 0 vs >0, status low vs high, timed vs not
            a = expected_cue_direction(tpl, params)   # ∈ R^8 from tpl.axes_targeted (signed prior)
            candidates.append(((tpl, params), a))
    scores = bald_scores(post, candidates, samples=samples, gain=gain, seed=seed)  # REUSED verbatim
    # bias toward the active confound: upweight candidates whose `a` lies in the span
    # of the most-confused pair (largest off-diagonal |Sigma_ij| / sqrt(Sigma_ii Sigma_jj))
    for s in scores:
        s.score *= confound_bonus(s.candidate, confounded_pairs(post))
    return argmax(scores)                             # the situation to RAISE THE SALIENCE of
```

- **Input:** the live per-user `Posterior` (after each `observe()`), the set of *open* templates (gated
  by `stage-map.md` §9 + consent), and the active confounded pairs — read from the posterior's largest
  normalized off-diagonal covariances (the pairs the matrix in `coverage-matrix.md` §3 anticipates).
- **Score:** BALD mutual information `I(z; cue_outcome)` — exactly `bald_scores`, with candidates now
  `(template, params)` pairs instead of NPCs.
- **Confound bonus:** a multiplicative upweight for candidates whose expected cue direction `a` spans the
  most-confused axis pair, so the director preferentially stages the *contrast* that splits two entangled
  axes (the §3 disambiguators) — e.g. having seen warmth to a *peer*, it surfaces a *low-status server*
  next to read the slope (G2), not another peer.
- **Output:** the single `(template, params)` to **raise the salience of** — a server appears, a queue
  forms, a stranger is sighted — among what is diegetically natural *right now*.

### 3.3 The diegetic-naturalness guard (validity, not just gain)

Pure max-information would feel like a test, and the instant the world feels like a test, people perform
and validity collapses (Invariant 2). So the argmax is constrained:

1. **Reachability & continuity.** Only templates whose affordances are *already plausibly present* in the
   person's current location/stage are candidates; the director never teleports a tavern server onto the
   solitary island. It increases *probability of appearance*, not certainty.
2. **Salience cap / cooldown.** A template can't be surfaced twice in close succession (anti-"test"
   rhythm); repeated identical probes are down-weighted, so the world stays a life, not a questionnaire.
3. **Non-coercion.** The director only adjusts availability/salience; the choice set always includes the
   non-action option (§1). A surfaced-but-declined situation emits the K-twin and is *fully informative* —
   so there is no incentive to force.
4. **Consent gate.** Templates requiring a declined channel are removed from `open_templates` upstream
   (`event-schema.md` §5) — the director never selects an uncollectable cue.

### 3.4 Non-action is first-class in the score

The candidate's expected outcome distribution explicitly includes the **refusal branch**: `p(decline)`
contributes to both the predictive entropy and the realized cue. A person who *reliably declines* a class
of situation is high-information (a revealed preference against a present affordance, Channel K) — so the
director is not "wasting" a probe when it's refused; the refusal is the measurement. This is encoded by
giving every template's `choice_set` an always-present non-action option whose K-twin carries the full
context envelope (§1).

### 3.5 Reopen-on-drift

When `persona.inflate()` widens the posterior on detected drift (`stage-map.md` §9.3, autonomy CUSUM),
the BALD scores rise across the board and the director re-surfaces resolving situations — which is why
revisiting an old stage under new context is high-value, not redundant. Drift → wider `Sigma` → larger
`I(z; cue)` → the director actively re-probes the axes that destabilized.

### 3.6 Director, in one line

> **Of all the contrasts the currently-open templates can stage naturally, surface the one whose outcome
> most reduces the posterior's largest uncertainty — preferentially the contrast that splits the two
> axes the posterior most confuses — and let non-choice be as informative as choice.**

---

## 4. Template → stage → confound map (how the library plugs into the life)

| Stage (`stage-map.md`) | Templates that open here | Primary confound resolved |
|---|---|---|
| 0–1 solitary | (forks are degenerate 1-actor templates: grain = `fairness_split` vs self / future; tidepool = `windfall_vs_loss`) | pace↔intellect (timed grain), energy↔affect (loss) |
| 2 shore & sighting | `chance_encounter` (distance-only) | openness↔warmth |
| 3 crossing & contact | `chance_encounter` (dialogue) | warmth↔affect, warmth↔dominance |
| 4 the town | `service_error`, `the_queue`, `fairness_split`, `marginal_figure`, `conformity_norm`, `request_for_help` | warmth↔dominance, formality↔dominance, warmth↔formality, openness↔formality |
| 5 paths & vocation | `conformity_norm` (forum), `the_queue` (harbor), `windfall_vs_loss` (harbor) | openness↔intellect (the five-door allocation) |
| 6 bonds | `repeated_game`, `request_for_help`, `fairness_split` (iterated), `marginal_figure` | warmth↔formality (the second round) |
| 7 unobserved self | `temptation_unobserved`, `request_for_help` (anonymous), `conformity_norm` (private) | warmth↔formality (public−private delta) |

The director walks this not as a fixed order but as **whatever the posterior needs next** (§3) — the
table is the *space* of what's available per stage, not a script through it.

---

## Appendix — keeping the generator honest (CI-checkable)

1. **Every template has a non-action option.** A `choice_set` without a walk-away/decline option that
   emits a Channel-K twin fails CI (Invariant 3; §1).
2. **Every `social:true` template fans out per actor.** One shared `logInteraction` row is a contract
   violation (`event-schema.md` §2 Rule 3).
3. **Every template's `cues`/`axes_targeted` exist in the catalog & matrix.** The director's gain
   estimate is only as honest as its priors; `resolves` pairs must be drawn from
   `coverage-matrix.md` §3.
4. **No coercion in the director.** The director may only change *salience/availability*, never force a
   choice or penalize refusal — asserted by checking that a declined situation still produces a valid,
   full-context K-event (Invariant 2).
5. **Priors only.** `axes_targeted` seeds the director's expected cue direction `a`; the *actual* loading
   is the learned `W` (`persona_model.py`). When the director's expected gain and the realized gain
   diverge systematically, that's a confound to record, not a constant to hardcode (catalog Appendix 5).
