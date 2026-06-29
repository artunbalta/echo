# ECHO Individuation Eval (Deliverable #6 — the proof the instrument individuates)

> **Status:** canonical test protocol. Conforms to the cue spine
> ([`cue-catalog.md`](./cue-catalog.md)) and the instrumentation contract
> ([`event-schema.md`](./event-schema.md)). Every cue ID below is defined in the catalog; every
> engine function named below is real and cited by file + symbol. The protocol runs as a
> deterministic `pytest` under [`services/ml/tests/`](../../services/ml/tests) against the
> **actual** measurement engine — no mocks of the engine, no hardcoded loadings.

---

## 0. What "individuates" means here, and why the naive test fails

The acceptance bar is **not** "two different people get different doppelgängers" — that is
trivial (different axis means → different posteriors). The hard claim ECHO makes is the
**conditional-signature** claim of Invariant 5: *identity lives in the deviation-from-the-crowd
conditional* ("warm to friends / cold to strangers"), not in the marginal average. So the test
is adversarial **by construction**:

> Two synthetic personas **P** and **Q** are built so their **marginal 8-axis means are equal**
> (statistically indistinguishable on every axis). They differ **only** in how their cues
> respond to the *context envelope* (`counterpart_status`, `scarcity_level`, `time_pressure`,
> `public_or_private`, …). A naive marginal read of `Posterior.mu` cannot tell them apart. The
> instrument passes **iff** its *conditional* read — the posterior built from events filtered to
> context A vs context B — separates them.

This directly stresses the part of the engine the brief says carries identity: the context-keyed
behavior, folded through the **learned** measurement matrix `W` (`persona_model.py`), never a
hardcoded mapping.

---

## 1. The two personas (concrete cue × context response functions)

Each persona is a deterministic function `behave(cue_id, context) -> raw_signals/payload` that
emits the telemetry scalars the engine actually reads
(`persona.TELEMETRY_FEATURE_NAMES`, L396–411) plus a short context-appropriate utterance for the
content channel. The seeds (`rng`) add realistic within-persona noise so a *single* act is noise
and only the *pattern* separates them (Invariant 4).

**One-line definitions:**

- **Persona P — "conditional/structured":** *warm-to-friends, cold-to-strangers; generous with money, stingy with time.* Its `warmth`/`affect` cues (A1 approach distance, D5 self-disclosure, E5 initiative, C1 reply latency) **swing hard on `counterpart_status`** (warm to `peer`/`high`, cold to `stranger`), and its economic cues split **money-generous / time-stingy** (F7 shares freely, F1/F2 low save-rate = spends down to give, but A5/F12 hoards *time* — short sessions, fast exits, low `ts_social`).
- **Persona Q — "uniform/flat":** *uniformly mild to everyone; stingy with money, generous with time.* Its warmth/affect cues are **context-flat** (the same mild value for `stranger`, `peer`, and `high` — `counterpart_status` has ~zero slope), and its economic cues are the **mirror** of P: **money-stingy / time-generous** (F1/F2 high save-rate, F7 keeps resources, but A5/C3 long sessions, lingering dusk dwell C10, high `ts_social`).

### 1.1 The matching constraint (how the marginals are forced equal)

The marginal mean of a cue over a session is its average across all contexts visited. The
generator visits a **fixed, identical context schedule** for both personas (same number of
`stranger`/`peer`/`high` encounters, same scarcity days, same timed/untimed forks — see §2.2), so:

| Axis driver | Persona P (conditional) | Persona Q (flat) | Marginal mean (forced equal) |
|---|---|---|---|
| **warmth/affect** (A1, D5, E5, I-valence) | `+0.8` to friends, `−0.8` to strangers | `0.0` to everyone | both average to **≈ 0** over the 50/50 friend/stranger schedule |
| **money** (F1 save, F2 save-rate, F7 generosity) | generous: low save, high give | stingy: high save, low give | P's `−` and Q's `+` are **swapped vs time**, and the generator scales them so the *money+time composite* nets equal (see below) |
| **time** (A5 `ts_*`, C3 session length, C10 dusk, F12) | stingy: short sessions, fast exits | generous: long sessions, lingering | mirror of money |

The money/time mirror is what keeps the **economic axis means** (`intellect`/`dominance`/`pace`,
which the catalog hypothesizes load on F1/F2/F3/F12) equal: P is `(money+, time−)`, Q is
`(money−, time+)`; the generator centers each persona's `(save_rate, ts_social, session_norm,
generosity)` block so the **per-axis projection through the learned W** has equal expectation
while the **joint conditional pattern** differs. Concretely the generator enforces, per persona,
across the full schedule:

```
mean(save_rate)  + mean(generosity_inv)          ≈ const   # money composite matched
mean(ts_social)  + mean(session_norm) + mean(dwell_norm) ≈ const   # time composite matched
mean_over_contexts( warmth_cue )                 ≈ 0       # warmth marginal matched
```

and a **pre-flight assertion (§3, gate 0)** verifies the two personas' marginal axis means are
within tolerance *before* the distinguishability test is even allowed to run — otherwise the test
would be cheating by smuggling a marginal difference in.

### 1.2 Cue × context response table (the generator's core)

`status ∈ {stranger, peer, high}`, `scarcity ∈ [0,1]`, `time_pressure ∈ {0,1}`. Values are the
emitted `raw_signals`/payload scalars (the engine reads them via `_telemetry_features`,
`persona.py` L414–440). `~` = small gaussian jitter per emission.

| Cue (catalog) | Emitted scalar(s) → engine feature | **Persona P** | **Persona Q** |
|---|---|---|---|
| **A1** approach distance | `raw_signals.distance`, `approach` (→ `approach`) | `approach=+1` if status∈{peer,high} else `−1`; distance `~1` to friends, `~5` to strangers | `approach` `~0` (holds mid distance `~3`) **for every status** |
| **C1** reply latency | `latencyMs` (→ `latency_norm`) | fast to friends (`~500ms`), slow to strangers (`~3500ms`) | uniform `~1800ms` for all status |
| **D5** self-disclosure | utterance text + `valence` | intimate text to friends, guarded text to strangers | mild, equally shallow text to all |
| **E5/G1** initiative | per-actor event presence | initiates with friends, only-responds to strangers | responds at a flat rate to all |
| **A5** time-share | `ts_earn/ts_learn/ts_social/ts_leisure` | **low `ts_social`**, brisk earn (time-stingy) | **high `ts_social`**, lingering (time-generous) |
| **C3/C10** session/dusk | `secondsAlone`, dusk `dwell_ms` | short sessions, `ends_abruptly` (K12) | long sessions, `lingers_at_dusk` |
| **F1/F2** save vs spend | `save_rate` | **low save_rate** (spends down to give) | **high save_rate** (hoards money) |
| **F7** generosity | `generosity` (proposed feat, §4 schema) / payload `amount` | **shares freely** (high give) | **keeps all** (low give) |
| **F3** risk index | `risk_index`, `variance` | moderate, status-independent | moderate, status-independent (held equal — a control) |
| **I4** pet-talk | `pet_talk.valence`, `pet_attach` | warm (private, no audience effect) | warm (held equal — a control) |

Cues **F3** and **I4** are deliberately held **identical** across P and Q: they are *controls* that
must **not** separate the personas, proving the separation comes from the conditional signature and
not from leakage.

The two personas live as `Persona` dataclasses in the test file (see §2.1); each is a pure
function of `(cue_id, EventContext)` → emitted `BehavioralEvent` payload, seeded for determinism.

---

## 2. The harness — driving the REAL engine

### 2.1 What we call (all real symbols, no engine mocks)

The harness drives the production online path exactly as `app.py POST /observe` does:

1. **Fit a measurement model `W`** so the *learned* path is active (not the heuristic fallback).
   Use the real offline fitters on a synthetic population:
   - `persona_model.anchor_alignment(Phi_centered, Z_target, ridge)` → `(W (8×F), Psi)`
   - optional `persona_model.fit_state_factors(residual, k_state)` → `(V, Sigma_m, Psi)` to
     exercise the **trait/state split** (WI-5) for §4's bad-mood check.
   - assemble `PersonaModel(W=W, mu_phi=mu_phi, Psi=Psi, V=V, Sigma_m=Sigma_m,
     feature_names=persona.feature_names())` and install it with
     `persona_model.set_persona_model(model)` so `observe()` picks it up.
   The population `Phi`/`Z_target` is generated from the **same cue catalog priors** (the
   axis-hypothesis columns seed the anchor labels), so `W` is learned, never hardcoded — honoring
   Invariant: *"loadings are LEARNED"* (`event-schema.md` Appendix rule 5).

   > If a committed `artifacts/measurement.npz` exists, the harness may instead just
   > `set_persona_model(None); get_persona_model()` and skip if `not model.trained`
   > (mirrors `test_committed_artifact_*` in `test_persona_model.py`). The fit-synthetic path is
   > the default so the eval is hermetic and runs on a clean checkout.

2. **Simulate each persona into a `BehavioralEvent` stream.** For a fixed schedule of
   `(cue_id, context)` slots (§2.2), call `persona.behave(cue_id, ctx)` to get the event's
   `text` + `telemetry` dict (the engine reads `telemetry` keys from
   `BehavioralEvent.raw_signals`/`payload` per `event-schema.md §4`).

3. **Fold each event into the posterior** via the real online update — the engine entry point:
   ```python
   post = persona.observe(post, ev.text, ev.telemetry)     # → robust_kalman_update internally
   ```
   `observe()` (`persona.py` L472–510) calls `featurize_raw(text, telemetry)` →
   `model.apply(phi)` → `model.center(phi)` →
   `robust_kalman_update(post, φ−μ_φ, Wᵀ, Ψ·reliability_noise_scale)` (Joseph form, Student-t
   downweight, Mahalanobis gate). This is **byte-for-byte the production path**; the harness adds
   nothing. Optionally pass `trace={}` to capture `mahalanobis_d2`/`weight`/`surprising` for the
   outlier check (§4.2).

4. **Build per-context conditional posteriors.** The crux. For each persona we fold **two extra
   posteriors** alongside the marginal one, by routing each event into the conditional posterior
   keyed by its context:
   - `post_friend` ← only events with `context.counterpart_status ∈ {peer, high}`
   - `post_stranger` ← only events with `context.counterpart_status == stranger`
   (and analogously `post_scarce` vs `post_plenty`, `post_timed` vs `post_untimed` for the
   economic/time conditionals). Each conditional posterior starts from `persona.prior()` and is
   updated only by its slice of the stream — these are **predictions of behavior given context**.

### 2.2 The fixed schedule (identical for P and Q)

`N = 240` events per persona over a simulated `D_days = 12` (so `consistency` is non-zero — it is 0
within a single session, `persona.py` L410). Context slots are drawn from a **fixed seeded
schedule shared by both personas**:

- 50% `counterpart_status=stranger`, 50% `∈{peer,high}` (forces the warmth marginal to match).
- scarcity alternates `{0.1 plenty, 0.8 famine}` day-by-day (same days for both).
- `time_pressure ∈ {0,1}` balanced 50/50, same slots.
- `audience_size`/`public_or_private` balanced, same slots.

Because the schedule is identical, any divergence in the **marginal** posterior is bounded by the
matching tolerance (gate 0); all real signal is in the **conditional** posteriors.

### 2.3 Where this lives

`services/ml/tests/test_individuation.py` (new), peer of `test_trait_state.py` /
`test_persona_model.py`. Runs under the existing `pytest.ini`. Pattern, fixtures, and
`set_persona_model` discipline mirror `test_persona_model.py::test_committed_artifact_*` exactly.
Deterministic (`np.random.default_rng(seed)`); the embedder is the offline deterministic
hash provider (`embeddings._hash_embed`, used automatically when no `VOYAGE_API_KEY`), so content
cues are reproducible and the whole eval is hermetic.

---

## 3. Distinguishability metric + PASS/FAIL

Let `KL(·‖·) = persona.gaussian_kl` (full-covariance, `persona.py` L60–84), and reuse
`autonomy.persona_drift_kl(mu_a, mu_b, Sig_a, Sig_b)` as the named wrapper for the symmetric-ish
posterior divergence. Define the **conditional contrast vector** of a persona as the difference of
its two conditional posterior means:

```
Δ_P = post_P_friend.mu − post_P_stranger.mu          # P's friend-vs-stranger swing (R^8)
Δ_Q = post_Q_friend.mu − post_Q_stranger.mu          # Q's friend-vs-stranger swing (R^8)
```

### Gate 0 — marginal indistinguishability (the test must be honest)
```
for each axis i:  | post_P.mu[i] − post_Q.mu[i] |  <  τ_marg      (τ_marg = 0.15)
AND  KL_marg = max( drift_kl(P‖Q), drift_kl(Q‖P) )  <  κ_marg     (κ_marg = 0.5)
```
If gate 0 **fails**, the personas were not actually matched on the marginal → the whole eval is
**invalid** (not a pass), because any later separation could be smuggled marginal difference.

### Primary PASS criterion — conditional separation
The instrument **individuates** iff, with the marginals matched (gate 0), the **conditional**
reads diverge by a wide margin:

```
PASS  ⇔   gate0_holds
      AND  KL_cond = max( drift_kl(post_P_friend ‖ post_P_stranger),     # P's own conditional gap
                          drift_kl(post_Q_friend ‖ post_Q_stranger) )    #   (P should be large)
      AND  ‖Δ_P − Δ_Q‖₂  >  ρ · max(‖Δ_P‖, ε)                            # P swings, Q is flat
      AND  KL_cond(P) ≥ SEP · KL_cond(Q)                                  # P's slope ≫ Q's slope
```

with thresholds:

| Symbol | Value | Meaning |
|---|---|---|
| `τ_marg` | `0.15` | per-axis marginal-mean tolerance (gate 0) |
| `κ_marg` | `0.5` | marginal posterior-KL ceiling (gate 0) |
| `ρ` | `0.6` | the conditional-contrast vectors of P and Q must differ by ≥60% of P's swing magnitude |
| `SEP` | `4.0` | P's friend↔stranger conditional KL must be ≥4× Q's (reuses `config.drift_kl_threshold = 4.0`) |
| `ε` | `1e-6` | numeric floor |

**Plain English:** P and Q look identical on the average dashboard (gate 0), but when you ask the
posterior to *predict behavior toward a friend vs a stranger*, **P predicts a large warmth swing
and Q predicts none** — `Δ_P` is big, `Δ_Q` ≈ 0, so `‖Δ_P − Δ_Q‖` is large and
`KL_cond(P) ≫ KL_cond(Q)`. The same structure is asserted on the **money/time conditional**
(`scarcity`/`session` slices): P is money-generous/time-stingy, Q the mirror, so
`Δ^money_P ≈ −Δ^money_Q` (opposite-signed), giving a large `‖Δ^money_P − Δ^money_Q‖` even though
the money+time *composite* marginal matched. **The pass metric is the conditional, not the
marginal — which is the entire point of the instrument.**

### Control assertion (no-leakage)
The held-equal cues **F3** (risk) and **I4** (pet-talk) must **not** separate the personas:
`| post_P.mu[i] − post_Q.mu[i] | < τ_marg` on the axes those cues primarily drive — proving the
separation is the conditional signature, not an accidental marginal leak.

---

## 4. Secondary checks (each tied to a brief invariant)

All four run in the same test module, reusing the harness.

### 4.1 Trait/state separation — a bad mood is noise, not trait (Invariant 5 / WI-5)
Re-run **persona P** but inject a transient **bad-mood state** on a contiguous block of days:
set `context.mood_proxy = −1` and add a fluctuation along the fitted state directions `V` to each
event's φ (the mood loads on `V`, marginalized into `Ψ_total` via `model.apply`,
`persona_model.py` L63–70). Fold with the **state-aware** model.
**PASS:** `‖post_P_badmood.mu − post_P.mu‖₂ < δ_state` (`δ_state = 0.1`) — the bad-mood run stays
close in `z` to the baseline P. Mirror of `test_trait_state.py::test_state_fluctuation_does_not_move_trait`.

### 4.2 Outlier robustness — one dramatic out-of-character act barely moves z (Invariant 5, §9.8)
After P's stream converges, inject **one** wildly out-of-character event (e.g. an `affect=+5`,
`latencyMs=50`, all-caps tirade) and fold it with `trace={}`.
**PASS:** the trace reports `surprising=True` and `weight < 0.2` (Student-t downweight), **and**
`‖post_after − post_before‖₂ < δ_outlier` (`δ_outlier = 0.05`) — the doppelgänger is not
rewritten by one act. Mirrors the robustness intent of `test_robust.py` and
`robust_kalman_update` (`persona.py` L231–283).

### 4.3 Population-relative individuation (Invariant 5 — signal is deviation from the crowd)
Generate a **crowd** of `M = 200` synthetic personas with random axis means and the *same*
context schedule. Standardize each persona's marginal `mu` against the crowd
(`z_score = (mu − crowd_mean) / crowd_std`). **PASS:** P and Q have **near-zero** marginal z-scores
(they sit at the crowd center — that's the matched-marginal design) **but** their **conditional
contrast vectors** `Δ_P`, `Δ_Q` are **outliers** vs the crowd's conditional-contrast distribution
(`|z_score(‖Δ‖)| > 2` for P, ≈ 0 for Q). Identity = the deviation in the *conditional*, not the
marginal.

### 4.4 Calibration — ECE against held-out outcomes (§9.5)
Hold out `H = 60` future `(cue, context)` slots per persona. From each persona's posterior, predict
a **binary behavioral outcome** (e.g. "will approach the next `peer`?" via `P(approach=+1)` from the
posterior-implied feature mean), with a confidence. Score against the generator's ground-truth
emission for those held-out slots and compute
`gate.expected_calibration_error(confidences, correct, bins=10)` (`gate.py` L134–151).
**PASS:** `ECE_P < 0.1` and `ECE_Q < 0.1` — the posterior's confidence matches its hit-rate on
held-out behavior, so the conditional predictions are *trustworthy*, not just *separated*.

---

## 5. How to run

```bash
cd services/ml
.venv/bin/pytest tests/test_individuation.py -q
# gate 0 (marginals matched) → primary conditional PASS → 4 secondary checks
```

Deterministic, hermetic (hash embedder, no network, no API keys), no committed artifact required
(fits `W` in-process via `anchor_alignment`). Asserts exactly the §3 criterion plus the four §4
checks; a regression that flattens the conditional read (e.g. someone reintroducing a marginal-only
featurizer, or breaking the context fan-out) fails gate `KL_cond(P) ≥ 4·KL_cond(Q)`.

---

## Appendix — engine symbols this protocol exercises (all real)

| Step | Symbol | File |
|---|---|---|
| online update | `persona.observe` → `robust_kalman_update` → `kalman_update_general` | `services/ml/echo_ml/persona.py` |
| featurize | `persona.featurize_raw`, `_telemetry_features`, `TELEMETRY_FEATURE_NAMES` | `persona.py` |
| learned W | `persona_model.anchor_alignment`, `fa_em`, `PersonaModel.apply/center` | `persona_model.py` |
| trait/state | `persona_model.fit_state_factors`, `V`, `Sigma_m`, `Ψ_total` | `persona_model.py` |
| model install | `persona_model.set_persona_model` / `get_persona_model` | `persona_model.py` |
| divergence metric | `persona.gaussian_kl`, `autonomy.persona_drift_kl` | `persona.py`, `autonomy.py` |
| calibration | `gate.expected_calibration_error` | `gate.py` |
| outlier trace | `robust_kalman_update(..., trace={})` → `mahalanobis_d2`, `weight`, `surprising` | `persona.py` |
| axes/order | `persona_axes.AXIS_KEYS`, `AXIS_INDEX` | `persona_axes.py` |
```
