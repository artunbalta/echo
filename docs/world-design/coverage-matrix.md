# ECHO Coverage Matrix (Deliverable #2 — the identifiability proof)

> **Status:** canonical. Conforms to the cue spine ([`cue-catalog.md`](./cue-catalog.md)), the stage
> map ([`stage-map.md`](./stage-map.md)), and the instrumentation contract
> ([`event-schema.md`](./event-schema.md)). Every cue ID is defined in the catalog; never renumber.
> This document **proves the instrument is identifiable**: that each of the 8 persona axes is measured
> by **≥3 independent, confound-resolved cues spanning ≥2 life stages**, that every *confusable axis
> pair* has a disambiguating contrast, and that the *conditional signature* (where identity lives) is
> recoverable from `cue × context`.

---

## 0. What this proves, and why it matters

The engine inverts cues → a full-covariance posterior over `z ∈ R^8` (`services/ml/echo_ml/persona.py`)
through the **learned** measurement matrix `W` (`phi = Wᵀ z + mu_phi + eps`, `persona_model.py`). An
inversion is only trustworthy if the cue ecology is **identifiable**: no axis may rest on a single
situation (one situation = one confound away from being unreadable). The bar, from the acceptance
checklist:

> Each of the 8 axes is measured by **≥3 independent, confound-resolved cues across ≥2 stages.**

"Independent" = different channels and/or different stations, so a single instrumentation failure or a
single confound cannot blind an axis. "Confound-resolved" = the catalog names an alternative explanation
**and** a contrast (timed/untimed, observed/private, high/low status, lean/plenty) that isolates the
trait. Two stages = the read survives a person who skips or lingers in any one region (`stage-map.md` §9).

**The axis-hypothesis columns below are priors, not loadings.** They seed/align `W` via
`anchor_alignment`; FA-EM + population data set the true loadings (`persona_model.py`). A `+`/`−` is the
*hypothesized sign*; the matrix exists to prove **structural coverage**, not to hardcode mappings
(catalog Appendix rule 5).

Legend: **High / Med / Low** = catalog validity (ecological validity × reliability). `s0..s7` = the
earliest stages that elicit the cue (`stage-map.md`). **bold cue** = a High-validity anchor for that axis.

---

## 1. The master matrix — 8 axes × cues

Each row lists the cues whose prior loads on that axis, the channels they span (independence), the
stages they appear in, and the High-validity anchors. Signs in parentheses are the hypothesized polarity.

| Axis | Anchor cues (High) | Supporting cues (Med/Low) | Channels spanned | Stage span |
|---|---|---|---|---|
| **warmth** (cold↔warm) | **D11**(+ pet, s0) · **D5**(+ disclosure, s3) · **G2**(conditional, s4) · **G11**(+ server, s4) · **F7**(+ generosity, s4) · **F10**(+ tip, s4) · **G7**(+ loyalty, s6) · **H9**(+ help-at-cost, s7) · **H2**(+ honesty, s7) | A1, A7, A8, A10, C10, D3, D4, D10, E4, E5, E6, G1, G4, G5(−), G6, G10, G12, H1, H3, H5, H6, I2, I4 · K1(−), K5(−), K10(−), K11(−) | A,C,D,E,F,G,H,I,K | s0,s2,s3,s4,s6,s7 |
| **dominance** (deferential↔assertive) | **F1**(+ save, s0) · **F3**(+ risk, s0) · **C7**(+ grit, s1) · **G1**(+ initiation, s3) · **G8**(− deference, s4) · **F9**(+ bargain, s4) · **G10**(+ conflict, s4) · **H7**(+ punish, s7) | A1, A6, A8(−), A10, A11, A12, C2(−), C8, D3(−), D9(−), D12, E5, E6(−), F5, F6, F8, F11, F12, G9, G11(−), H1(−), H8, I1, I5 · K6(−) | A,C,D,E,F,G,H,I,K | s0,s1,s3,s4,s7 |
| **openness** (conventional↔eccentric) | **A9**(+ range, s1) · **A11**(+ sail-out, s1) · **I3**(+ novelty, s2) · **A10**(+ first-contact, s2) · **J2**(+ aesthetic dwell, s0) · **D12**(+ dissent, s4) · **G9**(+ brokerage, s4) · **H9**(+ help, s7) | A4, B4(−), C3, D2, D3, D5, D6, D7, E4, F3, F6, F7, G4, G6, G7(−), H4(−), H8, J1, J3, J4, J5(−), J6 · K3(−), K4(−), K9(−) | A,B,C,D,E,F,G,H,I,J,K | s0,s1,s2,s4,s5,s7 |
| **energy** (calm↔high-energy) | **A9**(+ range, s1) · **A11**(+ sail-out, s1) · **F5**(+ work effort, s1) · **I3**(+ novelty, s2) · **G1**(+ initiation, s3) | A2, A6, B1, B5(−), B6, C3, C6, D6, E1, E3, E5, F8(−), G6, I2, I5, I6 | A,B,C,D,E,F,G,I | s1,s2,s3,s4 |
| **formality** (casual↔formal) | **F2**(+ thrift, s1) · **C9**(+ tempo stability, s1) · **H1**(+ queue, s4) · **H4**(+ norm, s4) · **G8**(+ deference, s4) · **J5**(+ order, s4) · **H5**(+ property, s7) | A8, D9, E1, E3(−), E6, F9, F10, G2, G3, G11, G12, H6, H7, H8 · D12(−), K8(−), K9(+) | A,C,D,E,F,G,H,J,K | s1,s4,s7 |
| **intellect** (playful↔cerebral) | **F1**(+ delay-discount, s0) · **F2**(+ save-rate, s1) · **F4**(+ EV, s1) · **J2**(+ aesthetic dwell, s0) · **J6**(+ detail, s1) · **C8**(+ deliberation, s3) | A4, C1, C2, D2, D7(− playful), D8, E2, F12, J3, J5 | A,C,D,E,F,J | s0,s1,s3,s4,s5 |
| **pace** (unhurried↔fast) | **C1**(− reply, s3) · **C2**(− decision, s0) · **B2**(− hover, s0) · **C8**(+ under pressure, s3) | A2, A6, B4(−), B5(−), B6, F2(−), F12, J6(−) · K8(+), K12(+) | A,B,C,F,J,K | s0,s1,s3,s4 |
| **affect** (reserved↔expressive) | **D11**(+ pet valence, s0) · **B3**(− edits, s0) · **C10**(+ dusk dwell, s0) · **G3**(+ audience, s4) · **D5**(+ disclosure, s3) | A1, A2, A3(−), B1, C1(−), D4(−), D10, E1, E3, F8(−), F11(−), H10, I1, I2, I3, I6 · K12(−) | A,B,C,D,E,F,G,H,I,K | s0,s1,s3,s4 |

**Independence note.** No axis's anchors come from a single channel or a single station: warmth spans
F/G/H/D/I across the pet, the server, the gift, and the unobserved-help probe; dominance spans the
grain fork, the wager, the raft-grind, and social initiation/deference. The full per-cue axis priors are
in [`cue-catalog.md`](./cue-catalog.md) (the source of truth); this table is the inverted view.

---

## 2. Per-axis identifiability audit (the ≥3-independent-cues-across-≥2-stages proof)

For each axis, three **independent** (different channel *and* different station/affordance),
**confound-resolved** anchors, in **different stages**. ✅ = passes the bar.

| Axis | Independent anchor 1 | Independent anchor 2 | Independent anchor 3 | Stages spanned | Verdict |
|---|---|---|---|---|---|
| **warmth** | **D11** pet valence (Ch D, pet, s0; private → no strategic motive) | **G11** server treatment (Ch G, tavern, s4; low-status, can't reciprocate) | **H9** help-at-cost (Ch H, stranger, s7; private, costly) | s0, s4, s7 | ✅ |
| **dominance** | **F3** risk index (Ch F, tidepool, s0; stake held fixed) | **G8** deference to authority (Ch G, town, s4; legit vs illegit authority) | **G1** initiation (Ch G/E, contact, s3; per-actor, proximity-controlled) | s0, s3, s4 | ✅ |
| **openness** | **A9** territory range (Ch A, island, s1; no-goal vs quest day) | **I3** novelty reaction (Ch I, sighting, s2; aggregated over novelties) | **D12** counter-normative opinion (Ch D, plaza, s4; public vs private) | s1, s2, s4 | ✅ |
| **energy** | **A9** range / **F5** work effort (Ch A/F, island, s1; need vs ethic, rich/depleted bush) | **I3** novelty approach (Ch I, sighting, s2) | **G1** initiation (Ch G, contact, s3) | s1, s2, s3 | ✅ |
| **formality** | **F2** save-rate (Ch F, island, s1; income vs thrift, pop-relative) | **H1**+**H4** queue & norm (Ch H, town, s4; observed vs not) | **H5** property respect (Ch H, s7; owner present vs not) | s1, s4, s7 | ✅ (see §4 flag) |
| **intellect** | **F1/F4** delay-discount & EV (Ch F, grain/tidepool, s0–1) | **J2/J6** aesthetic & detail dwell (Ch J/A, cairn, s0–1; useful vs useless beauty) | **C8** deliberation under pressure (Ch C, s3; timed vs untimed) | s0, s1, s3 | ✅ |
| **pace** | **C2** decision latency (Ch C, fork, s0; option-count held fixed) | **B2** hover-before-commit (Ch B, cursor, s0; distraction-gated) | **C8**/**C1** timing under pressure & reply (Ch C, s3; normalized by length) | s0, s3 | ✅ (see §3 pair) |
| **affect** | **D11** pet valence + **B3** edits (Ch D/B, pet, s0; `underStress` flag) | **C10** dusk dwell (Ch C, campfire, s0; solo vs social) | **G3** audience effect (Ch G, plaza, s4; public vs private A/B) | s0, s4 | ✅ (see §4 flag) |

Every axis clears **≥3 independent, confound-resolved cues across ≥2 stages.** Two axes carry caveats
worth design attention (§4).

---

## 3. Confusable axis-pairs and their disambiguators

Adjacent traits load on overlapping cues; the matrix is only identifiable if each confusable pair has a
**contrast** that splits it. Each pair below is resolved by a designed dilemma (`stage-map.md`) and the
context envelope (`event-schema.md` Rule 2). This is exactly what the BALD director targets first
(`stage-map.md` §11): of all open contrasts, surface the one that best splits the two most-confused axes.

| Confused pair | Why they co-load | Disambiguating contrast | Where staged | Resolves via |
|---|---|---|---|---|
| **pace ↔ intellect** | both lengthen latency (C1/C2) — slow can be *unhurried* or *deliberating* | **timed vs untimed** the *same* fork (C8); deliberation that *shrinks* under time pressure = pace, that *persists* = intellect | s0 fork → s3 timed | `time_pressure` envelope; C8 |
| **warmth ↔ dominance** | both drive approach/initiation (A1/G1) | kindness to a **powerless** server who can't reciprocate (G11) — warmth has nothing to gain; command/curtness = dominance | s4 *courtesy-to-server* dilemma | `counterpart_status:"low"` |
| **warmth ↔ formality** | both yield politeness (D10/H1/G11) | **observed vs unobserved** (G3): genuine warmth is *invariant* to audience; performed manners *collapse* in private | s4 public ↔ s7 private (the public-minus-private delta) | `public_or_private`, `audience_size` |
| **warmth ↔ affect** | both drive disclosure/expressivity (D5/E1/E3) | **status slope** (G2): warmth discloses *more to friends, less to strangers* (steep slope); affect discloses *evenly to all* | s3 *first words to a stranger* | `counterpart_status` slope |
| **openness ↔ warmth** | both pull you across the water (A10/A11) | **what** you sail toward: openness sails to *empty* novel islands; warmth sails only where *people* are | s2 *figure across the water* | empty vs peopled target |
| **openness ↔ intellect** | both reward the library/learning (A5-learn, D2) | **breadth vs depth**: openness = wilds/novelty/range (A9); intellect = mastery/deferred cerebral reward (C8, F-thrift) | s5 *five open doors* | venue time-share vector |
| **dominance ↔ formality** | both honor/break a queue (H1) | **entitlement vs rule**: cutting an unenforced line = dominance; honoring it with no enforcement = formality | s4 *cuttable queue* | `time_pressure`, no enforcement |
| **energy ↔ affect** | both raise tempo/expressivity (C6/B1/E3) | **arousal vs valence**: energy = action rate (A9/F5 work), affect = emotional swing (I6 → loads on `V`/state, not trait) | s1 work vs s4 audience | trait/state split (V, Σ_m) |

Each confusable pair maps to a **signature dilemma** in `stage-map.md`, so the world *manufactures* the
contrast as a natural place to live rather than a test (Invariant 2).

---

## 4. Identifiability flags (honest gaps + the fix)

Coverage passes, but three axes are thinner than the rest and warrant design attention. Flagging them is
the point of an identifiability audit — silence here would read as "fully covered" when it isn't.

1. **`formality` is thin in the solitary stages.** Pre-town, only **F2** (save-rate) and **C9** (tempo
   stability) carry it; its richest anchors (H1 queue, H4 norm, G8 deference, G3 manners) all ignite at
   **Stage 4**. A person who never reaches the town has a weakly-identified `formality` axis. **Fix:**
   pull **J5** (order-vs-chaos in how the home/camp is arranged) and **B3** (edit/self-monitoring on the
   *private* pet) earlier as Stage-0/1 formality priors, and let the BALD director (`stage-map.md` §11)
   prioritize a formality-resolving contrast once the person reaches s4. *Recorded as a prior, not a
   loading — W decides.*

2. **`affect`'s reactive channel (I) is state-loaded.** I1/I2/I6 (setback, reward, volatility) are
   exactly the transient-state variance the trait/state split (`V`, `Σ_m`, `Ψ_total`, WI-5) marginalizes
   into noise. So the *trait*-affect read must rest on the **style** anchors (B3 edits, D11 valence, E1/E3
   expressivity, C10 dusk ritual) plus the **G3** audience contrast — **not** on the I-channel, which by
   design moves `V`, not `z`. The matrix above already lists the style anchors as the High anchors; the
   I-channel cues are supporting only.

3. **`energy`'s implicit cues are Med-validity** (B1 jitter, B6 cadence, C6 burstiness are confounded by
   device/network). Its identifiability rests on the **High** anchors A9 (range), A11 (sail-out), F5
   (work effort), I3 (novelty) — costly, free-emitted acts — with the tempo cues as corroboration only,
   normalized per-device/per-session (catalog confound notes).

None of these blocks the ≥3/≥2 bar; all three are met. They are sharpening notes for the director and for
where to add priors.

---

## 5. Conditional coverage — the part that actually individuates

Per Invariant 5, identity lives in **`cue × context` interactions**, not axis main effects. The mandatory
context envelope (`event-schema.md` §1: `counterpart_status, audience_size, public_or_private,
scarcity_level, time_pressure, mood_proxy, stage`) is what makes each conditional recoverable — the same
cue under two contexts is **two measurements**. Below: every major conditional signature, the cue × context
that yields it, and where it's staged.

| Conditional signature | Cue(s) × context field | Yields | Staged | Recoverable because |
|---|---|---|---|---|
| **warm-to-friends / cold-to-strangers** | A1, C1, D5, E5 × `counterpart_status` | warmth **slope** (G2) | s3→s4, s6 | events carry `counterpart_status` per actor |
| **generous-with-money / stingy-with-time** | F1/F2/F7 (money) vs A5/C3/C10/F12 (time) | the money↔time *cross* | s1, s4 | resource vs `ts_*`/session telemetry split |
| **performs-for-audience / same-in-private** | *any* cue × `audience_size`, `public_or_private` | self-monitoring (G3); the **public−private delta** | s4↔s7 | same act run public (s4) and private (s7) |
| **composed-under-pressure / freezes** | C2 × `time_pressure` | composure (C8) | s3, s4 | `time_pressure` balanced 50/50 in schedule |
| **honest-when-unobserved / strategic** | H2/H5 × `public_or_private` | conscience vs impression (H2) | s7 | private, no-penalty probes |
| **hoards / shares under scarcity** | F7/F11 × `scarcity_level` | scarcity disposition (F11) | s1, s4 | scarcity alternates day-by-day |
| **loyal-on-the-last-round / norm-contingent** | G12/H6 × `public_or_private` + known-final round | warmth vs formality at endgame | s6 | iterated, per-actor, endgame strips reputation |
| **deference high-status / dominance low-status** | A1/D3/G8/G11 × `counterpart_status` | the dominance×status slope | s4 | high (authority) vs low (server) counterparts |

These are precisely the conditionals the **individuation eval** ([`individuation-eval.md`](./individuation-eval.md))
operationalizes: two personas with **equal marginals** but opposite conditionals (warm-conditional vs
flat; money-generous/time-stingy vs the mirror) must produce distinguishable doppelgängers. The eval's
PASS criterion is the *conditional* contrast vector `Δ = post_friend.mu − post_stranger.mu`, not the
marginal — i.e. this table's first two rows, made a hard test.

**Population-relative scoring.** Every cue is read as **deviation from the crowd**, not absolute: the
posterior is population-prior'd, and generic behavior is low-information while idiosyncratic behavior is
high (Invariant 8). The conditional contrast vectors `Δ` are themselves scored against the crowd's
distribution of contrast vectors (individuation-eval §4.3) — a person is an *outlier in their slope*, not
their average. This requires a real, diverse population living in the world (Invariant 10); each user
sharpens the baseline against which every other is individuated.

---

## 6. Coverage summary (stage × axis)

`●` = a High-validity anchor for that axis is *first available* here · `○` = supporting/again present ·
blank = not yet in play. (Compresses §1's stage spans; cross-check `stage-map.md` §12.)

| Stage | warmth | dominance | openness | energy | formality | intellect | pace | affect |
|---|---|---|---|---|---|---|---|---|
| **0** Individual island | ● (D11) | ● (F1/F3) | ● (J2) | | ○ (C9) | ● (F1/J2) | ● (C2/B2) | ● (D11/B3/C10) |
| **1** Scarcity | ○ | ● (C7) | ● (A9/A11) | ● (A9/F5) | ● (F2/C9) | ● (F2/F4/J6) | ○ (F2) | ○ (I1) |
| **2** Shore & sighting | ○ (A10) | ○ (A10/A11) | ● (I3/A10) | ● (I3/A11) | | | | ○ (I3) |
| **3** Crossing & contact | ● (D5) | ● (G1) | ○ (D5) | ● (G1) | ○ (E6) | ● (C8) | ● (C1/C8) | ● (D5) |
| **4** The town | ● (G2/G11/F7/F10) | ● (G8/F9/G10) | ● (D12/G9) | ○ (G3) | ● (H1/H4/G8/J5) | ○ (D2/J5) | ○ (K8) | ● (G3) |
| **5** Paths & vocation | ○ | ● (harbor/forum) | ● (wilds/A9) | ○ | ○ | ● (library) | ○ | ○ |
| **6** Bonds | ● (G7/G12) | ○ | ○ (G6) | | ○ (G12/H6) | | ○ (C9) | ○ (I6→V) |
| **7** Pressure & unobserved | ● (H2/H9) | ● (H7/H8) | ○ (H9) | | ● (H5/H4) | | | ○ (H10) |

Every axis column has **≥2 `●` rows in different stages** — the identifiability bar, visualized. The
left-heavy fill for `intellect`, `pace`, `affect` (readable from the solitary baseline) and the
right-heavy fill for `formality`, `warmth`-conditional, `dominance`-social (readable only in society)
shows the design intent: a hard-to-fake private baseline first (Invariant 4), the costly social contrasts
where identity truly lives second (Invariant 5).

---

## Appendix — how to keep this matrix honest (CI-checkable)

1. **Re-derive from the catalog, never by hand.** This matrix is the *inverted view* of
   `cue-catalog.md`'s axis-hypothesis column. A script that parses the catalog and asserts
   "every axis has ≥3 cues from ≥2 channels across ≥2 stages" guards it against drift.
2. **Loadings are learned.** After `W` is fit (`persona_model.anchor_alignment`), compare the *learned*
   top-loading cues per axis (`PersonaModel.interpretability()`) against this prior table. **Disagreement
   is a finding, not an error** — it usually means a confound the prior missed (catalog Appendix rule 5;
   §4 of the brief). Record the diff; the data wins.
3. **The conditional is the product, not the marginal.** A regression that improves marginal coverage but
   flattens the `cue × context` interactions (§5) *fails the instrument's purpose* — guarded by
   `individuation-eval.md`'s `KL_cond(P) ≥ 4·KL_cond(Q)` gate.
