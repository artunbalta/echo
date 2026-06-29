# ECHO Event Schema (Deliverable #4 — the BehavioralEvent instrumentation contract)

> **Status:** canonical instrumentation contract. Conforms to the cue spine
> ([`cue-catalog.md`](./cue-catalog.md)) — every `cue` ID referenced here is defined there; never
> renumber. This document specifies the **wire shape** every affordance must emit, the **hard rules**
> that make an emission valid, the per-affordance emission table, how new cues extend the engine, and
> the consent gating. It upgrades the stub `TelemetryEvent` in
> [`packages/shared/src/telemetry.ts`](../../packages/shared/src/telemetry.ts) **backward-compatibly** —
> no existing emitter breaks.

---

## 0. The governing idea

ECHO inverts a **cue ecology** into a posterior over the 8 persona axes (Brunswik lens —
[`services/ml/echo_ml/persona.py`](../../services/ml/echo_ml/persona.py),
[`persona_axes.py`](../../services/ml/echo_ml/persona_axes.py)). The engine can only invert what it
*observes*; the observation is only diagnostic if it arrives **with its context** and only **valid** if
it was **freely emitted**. The `TelemetryEvent` shipping today
([`telemetry.ts`](../../packages/shared/src/telemetry.ts) L31–36) is a stub: `{ type, sessionId, ts,
payload }` — no actor, no target status, no context envelope, no per-actor social fan-out. That is the
gap this schema closes.

**One sentence:** an affordance's job is not to "do a thing" — it is to emit a **typed, context-stamped,
per-actor `BehavioralEvent`** on **both** its taking **and** its refusal, routed into exactly one
actor's private stream.

---

## 1. The `BehavioralEvent` interface

The brief's ideal event carries five mandatory parts: **who** (`actor_id`), **when** (`t`), **what
channel/action** (`channel`, `action`, `cue`), **on whom/what** (`target`), **under what conditions**
(`context` — all fields mandatory), and the **raw implicit signals** (`raw_signals`). The current
`TelemetryEvent` is preserved verbatim as a legacy alias so nothing breaks; `BehavioralEvent` is the new
envelope all *new* and *upgraded* emitters use.

```ts
// packages/shared/src/telemetry.ts  (upgrade — additive, backward-compatible)

// ── Cue spine (cue-catalog.md): channels A..K, stable IDs <Channel><n>. ──
export type CueChannel =
  | "A" // Locomotion / spatial
  | "B" // Cursor / motor micro-signals
  | "C" // Temporal / tempo
  | "D" // Conversational content (NLP)
  | "E" // Conversational meta / paralinguistic
  | "F" // Economic / resource
  | "G" // Social-structural
  | "H" // Normative / moral
  | "I" // Affective / reactive
  | "J" // Identity / aesthetics / attention
  | "K"; // Non-action (refusal / avoidance / omission)

/** Stable cue id, e.g. "A1", "F3", "K2". Validated against cue-catalog.md at build time. */
export type CueId = `${CueChannel}${number}`;

/** What an action did to its referent — distinguishes the positive twin from its K-refusal twin. */
export type ActionPolarity = "take" | "refuse";

export type TargetKind =
  | "self" | "pet" | "resource" | "structure" | "station"
  | "npc" | "player" | "echo" | "group" | "server" | "queue" | "place" | "none";

/** Read from the ACTING participant's vantage — never the target's self-report (Invariant 5). */
export type CounterpartStatus = "high" | "peer" | "low" | "stranger" | "none";

/** Coarse life-stage label, NOT a level. "stage" never implies progress/score (Invariant 1). */
export type LifeStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * MANDATORY context envelope. A cue WITHOUT a fully-populated context is DISCARDED, not stored
 * (rule 2 below). The conditional signature (warm-to-friends / cold-to-strangers) — where identity
 * actually lives (Invariant 5) — is unreadable without these fields, so they are non-optional.
 */
export interface EventContext {
  stakes: Stakes;                       // "low" | "medium" | "high" | "irreversible" (reuses existing Stakes)
  audience_size: number;                // # of other actors who could observe this act (0 = nobody)
  public_or_private: "public" | "private";
  counterpart_status: CounterpartStatus; // from the ACTOR's vantage
  stage: LifeStage;                     // life stage, not a level
  scarcity_level: number;              // 0 plenty .. 1 famine, current resource pressure
  mood_proxy: number;                  // −1 low .. +1 high, transient affect proxy → loads on V/Σ_m, NOT trait
  time_pressure: number;               // 0 untimed .. 1 hard deadline
}

/**
 * Implicit, hard-to-fake raw signals (Invariant 4 — these OUTRANK explicit self-presentation).
 * All optional individually, but an event with an EMPTY raw_signals object on a channel that
 * declares one is a contract violation (see the affordance table). Derived scalars only — NEVER raw text.
 */
export interface RawSignals {
  latency_ms?: number;      // C1/C2 — prompt-shown → commit
  dwell_ms?: number;        // A4/C10/J2 — lingering
  cursor_path?: number[];   // B1 — sampled [x,y,x,y,...] trajectory (jitter/entropy computed server-side)
  edits?: number;           // B3 — backspace/edit count
  hesitations?: number;     // B2/B4 — hover/undo count before commit
  distance?: number;        // A1/A10/A12 — final stopping radius, tiles
  valence?: number;         // D11/I-channel — derived sentiment scalar (never the text it came from)
  variance?: number;        // F3 — chosen risk
  amount?: number;          // F-channel — resource quantity
  [k: string]: unknown;     // forward-compatible; unknown keys ignored by the featurizer
}

/** The upgraded event. EXTENDS the legacy envelope (type/sessionId/ts/payload still present). */
export interface BehavioralEvent {
  // ── identity & routing ──
  actor_id: string;         // WHOSE measurement this is. Routes into exactly this actor's private silo.
  sessionId: string;        // (legacy field, retained)
  t: number;                // client epoch ms (legacy `ts`, renamed; `ts` kept as alias on the wire)

  // ── what happened ──
  type: TelemetryType;      // (legacy) coarse type, e.g. "choice_made" — kept for back-compat & routing
  channel: CueChannel;      // A..K
  cue: CueId;               // the specific cue this event evidences, e.g. "F1"
  action: string;           // semantic label, e.g. "saves_seed" | "declines_to_wager"
  polarity: ActionPolarity; // "take" | "refuse" — a K-twin is polarity:"refuse"

  // ── on whom / what ──
  target: {
    id: string;             // entity ref id ("none" for self/ambient)
    kind: TargetKind;
    status: CounterpartStatus; // target's status FROM THE ACTOR'S VANTAGE (mirrors context.counterpart_status)
  };

  // ── mandatory conditions ──
  context: EventContext;    // ALL fields required; absent ⇒ event discarded

  // ── implicit measurement ──
  raw_signals: RawSignals;

  // ── legacy payload (derived scalars only; superset preserved) ──
  payload: Record<string, unknown>;
}
```

### 1.1 Backward compatibility — how legacy events map in

The existing `TelemetryEvent` type is **kept verbatim** (a `BehavioralEvent` is structurally a superset:
`type`, `sessionId`, `payload` are unchanged; `ts` is retained as a wire alias for `t`). A normalizer at
the ingress boundary lifts any legacy `{type, sessionId, ts, payload}` into the new envelope so the
~10 emitters live today keep working with **zero client changes**:

```ts
// Applied server-side (persistence ingress) AND client-side (TelemetryCollector.emit) during migration.
export function liftLegacy(ev: TelemetryEvent, actorId: string, ctx: EventContext): BehavioralEvent {
  return {
    actor_id: actorId,
    sessionId: ev.sessionId,
    t: ev.ts,
    type: ev.type,
    channel: CUE_FOR_TYPE[ev.type].channel,   // static map: type → primary {channel, cue}
    cue: CUE_FOR_TYPE[ev.type].cue,
    action: String(ev.payload.option ?? ev.payload.action ?? ev.type),
    polarity: "take",
    target: legacyTarget(ev),                  // from payload.targetId / forkKey; defaults to self/none
    context: ctx,                              // supplied by the affordance's local context provider
    raw_signals: legacyRawSignals(ev.payload), // pulls latencyMs/editsCount/etc into typed slots
    payload: ev.payload,
  };
}
```

- **`CUE_FOR_TYPE`** is a static, audited map (e.g. `choice_made` → `{A:"F1"}` when `forkKey==="plant_or_spend"`,
  `resource_bet` → `F3`, `pet_talk` → `D11`, `allocation` → `A5`, `structure_progress` → `C7/F6`,
  `reply_latency` → `C1`, `approach` → `A1`, `dwell` → `A4`, `leave_intent` → `G5/C3`).
- During migration a legacy event with **no derivable context** is accepted with a synthetic
  `context` flagged `"legacy_unknown"` and **down-weighted** by the engine's heteroscedastic
  `reliability_noise_scale` (it already inflates Ψ for ambiguous acts — `persona.py observe()`), so old
  data is read but never trusted as much as a fully-stamped event. New emitters MUST supply real context
  (rule 2); the synthetic path is for backfill only and is removed once all emitters are upgraded.

---

## 2. The hard rules (a malformed event is discarded, not stored)

### Rule 1 — every affordance declares its **refusal twin** (Invariant 3, Channel K is first-class)

Every affordance that emits a positive event MUST also be able to emit the **not-taken / declined /
ignored / abandoned** event, with `polarity:"refuse"`, on Channel **K**, carrying the **same context
envelope** as its positive twin. Refusal is detected by the affordance's own watcher (proximity +
salience + window-focus gate, so AFK ≠ refusal). Examples from the table below: grain fork → `F1 take` or
`K3 refuse`; tide wager → `F3 take` or `K2 refuse`; pet → `D11 take` or `K5 refuse`; structure → `C7/F6
take` or `K6 refuse`. **A positive affordance shipped without a wired K-twin is an incomplete cue and
fails CI** (Appendix rule 1 of the catalog).

### Rule 2 — context is **mandatory** on every event

`context` is required and fully populated, or the event is **dropped at ingress** (not stored with
nulls). Validity-by-contrast cues (`G2` status-conditioned warmth, `G3` audience effect, `H2` honesty
when unobserved, `C8` deliberation under pressure, `F1` save-vs-spend, `F7` generosity) are *literally
unreadable* without `counterpart_status` / `audience_size` / `public_or_private` / `scarcity_level` /
`time_pressure`. `mood_proxy` is mandatory too, but it is routed to the **state** path: it loads on `V`
with variance `Σ_m` and is marginalized into `Ψ_total` (WI-5, `persona_model.py`) — so a bad mood becomes
*noise*, never a trait read.

### Rule 3 — **per-actor fan-out** on every social affordance (Invariant 6)

> One encounter → **two+ independent measurements**, each read from one actor's own vantage, each routed
> into **only that actor's private siloed stream**. Never co-mingled.

**Today's bug (one-way logging).** A peer chat turn logs **exactly one row** from the sender's vantage:
[`apps/realtime/src/WorldRoom.ts`](../../apps/realtime/src/WorldRoom.ts) `relayPeerChat()` (L343–383)
calls `logInteraction({ actorId: sender.refId, targetId: partner.refId, userText: msg.text, npcText: ""
})` once. [`persistence.ts`](../../apps/realtime/src/persistence.ts) `logInteraction()` (L72–95) then
POSTs a single `/observe` for `actorId` and writes one `interactions` row keyed `actor_id→target_id`.
**The partner's vantage of the same encounter is never measured** — their initiation cue (`G1`),
register-matching (`E6`), their personal-space yield (`A12`), their `K1` if they *declined* the bid — all
lost.

**The fix.** Every social affordance emits **one `BehavioralEvent` per participant**, each with:
- `actor_id` = that participant; `target` = the *other* participant from this actor's vantage
  (`target.status` is the counterpart's status **as this actor sees it**, which differs per actor);
- `context.counterpart_status`, `audience_size`, `public_or_private` computed **per actor**;
- routed into **that actor's** silo only.

Concretely, `relayPeerChat` must fan out into two events instead of one `logInteraction`:

```ts
// REPLACES the single logInteraction(...) at WorldRoom.ts L374–382.
const enc = { id: it.id, t: now };
emitBehavioral(sender.refId, {            // sender's vantage
  channel: "E", cue: "E5", action: "initiates_turn", polarity: "take",
  target: { id: partner.refId, kind: "player", status: statusOf(sender, partner) },
  context: contextFor(sender, it),
  raw_signals: { latency_ms: msg.latencyMs, edits: msg.editsCount },
});
emitBehavioral(partner.refId, {           // partner's vantage — NEW, previously dropped
  channel: "G", cue: "G1", action: "is_addressed", polarity: "take",
  target: { id: sender.refId, kind: "player", status: statusOf(partner, sender) },
  context: contextFor(partner, it),
  raw_signals: {},                         // partner's own reply/refusal fills its own raw_signals later
});
// If the partner never replies within the salience window → emit their K1 (declines_social_bid).
```

`emitBehavioral(actorId, …)` is the single routing primitive: it stamps the envelope, validates
context (rule 2), and writes only into `actorId`'s stream. The `interactions` table gains a
`vantage_actor_id` column so the two rows of one encounter stay siloed and are never read together.

---

## 3. Affordance → emitted-events table

Columns: **Affordance** · **On USE** (event + `cue`) · **On REFUSAL** (K-twin + `cue`) · **Context
fields that must be populated** (beyond the always-required ones) · **Status**. `[LIVE]` = emitted today,
`[FEAT]` = also read by the 16-dim telemetry block, `[BUILD]` = to-build. Channels/cues are exactly those
in [`cue-catalog.md`](./cue-catalog.md).

### Island (Stage 0/1 — `IslandClient.tsx` + `PixiWorld.ts`)

| Affordance | On USE → event (cue) | On REFUSAL → K-twin (cue) | Context that matters | Status |
|---|---|---|---|---|
| **Grain fork** (`plant_or_spend`, irreversible) | `choice_made: saves_seed \| eats_now` (**F1**); deliberation **B2** | walks past → `leaves_grain` (**K3**) | `stakes:"irreversible"`, `scarcity_level` | `[LIVE/FEAT save_rate]` |
| **Tidepool** (`tide_wager`) | `resource_bet: bets_risky \| bets_safe` (**F3**, **F4** EV) | leaves uncommitted → `declines_to_wager` (**K2**) | `stakes`, `scarcity_level`, `time_pressure` | `[LIVE/FEAT risk_index]` |
| **Raft** (`start_ship`, sail-out) | `structure_progress` + `leave_intent: sets_sail` (**A11**, **C7**) | never builds → `stays_on_home_island` (**K4**) | `scarcity_level` (home rich vs lean) | `[LIVE partial]`/`[BUILD]` sailing |
| **Berry bush** (forage→earn) | `allocation: forages` (**A5**, **F5**) | `skips_earning` (**K7**) | `scarcity_level` | `[LIVE/FEAT ts_earn]` |
| **Book cairn** (study→learn) | `dwell` + `allocation: studies` (**A5**, **A4**, **J6**, **J2**) | `ignores_aesthetics/detail` (**K**-via low dwell) | — | `[LIVE/FEAT ts_learn]` |
| **Bedroll** (rest→leisure) | `allocation: rests` (**A5**) | (low leisure share) | — | `[LIVE/FEAT ts_leisure]` |
| **Pet / dog** (`pet_talk`) | `pet_talk: warm_to_pet` (**D11**, **I4** under stress) | proximity + zero pet_talk → `ignores_pet` (**K5**) | `public_or_private:"private"`, `mood_proxy` | `[LIVE/FEAT pet_attach]` |
| **Campfire** (end-day) | dusk `dwell` (**C10**, **J2**) | leaves early → `ends_abruptly` (**K12**) | `time_pressure` | `[LIVE]` |
| **Any structure** (build) | `structure_progress: perseveres` (**C7**, **F6**) | `started≠finished` → `abandons_build` (**K6**) | `stakes`, difficulty held fixed | `[LIVE/FEAT persistence]` |
| **Movement / approach** | `approach: approaches` (**A1**), `dwell` (**A4**), path (**A6**) | `avoid: changes_course` (**A3**) | `counterpart_status`, `audience_size` | `[LIVE approach/dwell]`/`[BUILD avoid,path]` |
| **Cursor (ambient)** | (sampled) jitter **B1**, hover **B2**, edits **B3** | idle **B5** | `time_pressure` | `[LIVE edits]`/`[BUILD cursor_path]` |

### World (multiplayer — `WorldClient.tsx` + `WorldRoom.ts`)

| Affordance | On USE → event (cue) | On REFUSAL → K-twin (cue) | Context that matters | Status |
|---|---|---|---|---|
| **NPC dialogue** (`dialogue.ts`) | `interaction_start` + reply (**D1–D9**, **C1**, **E1–E4**) | no engage → `declines_to_engage` (**K1**) | `counterpart_status`, `time_pressure` | `[LIVE one-way]` |
| **Peer chat** (live player ↔ player) | **per-actor:** sender **E5/G1**; partner **G1**; register-match **E6** | partner silent → `declines_social_bid` (**K1**); persistent → `avoids_counterpart` (**K11**) | `counterpart_status` (per actor), `audience_size`, `public_or_private` | `[LIVE one-way → BUILD per-actor]` |
| **Echo-to-echo relay** | per-actor turns (capped); same cues as peer chat | declines relay → `K1` | as peer chat | `[LIVE one-way → BUILD per-actor]` |
| **Personal-space (player approach)** | `yields_space \| holds_ground` (**A12**) | `refuses_to_move` (**K**, **A12** refusal) | `counterpart_status`, `audience_size` | `[BUILD]` per-actor |

### Stage 4 town (to-build — market, tavern with servers, plaza, queue, homes)

| Affordance | On USE → event (cue) | On REFUSAL → K-twin (cue) | Context that matters | Status |
|---|---|---|---|---|
| **Server / service** (tavern) | `courteous_to_server` (**G11**); over-pay `tips` (**F10**) | `curt_to_server` / `stiffs_server` (**G11/F10** refuse) | `counterpart_status:"low"`, `public_or_private`, `audience_size` | `[BUILD]` |
| **Queue** | `waits_honestly \| lets_ahead` (**H1**) | `cuts` / walks off → `declines_to_queue` (**K8**) | `public_or_private`, `audience_size`, `time_pressure` | `[BUILD]` |
| **Market bargain** (`discuss_terms`) | `drives_hard_bargain \| concedes` (**F9**); `shares` (**F7**) | `walks_away` / `keeps_all` (**F9/F7** refuse) | `scarcity_level`, `stakes:"irreversible"` | `[BUILD]` |
| **Plaza norm** (unenforced rule / dissent) | `respects_norm` (**H4**); `voices_dissent` (**D12**) | `breaks_unenforced_rule` (**K**); `withholds_dissent` (**K9**) | `public_or_private`, `audience_size`, `counterpart_status` | `[BUILD]` |
| **Stranger first-contact** (opposing island) | `approaches_stranger` (**A10**, **I3**) | `keeps_to_own_shore` (**K**, A10 refuse) | `counterpart_status:"stranger"`, `audience_size:0` | `[BUILD]` |

Every Stage-4 social row is **per-actor** (rule 3): the server's own stream measures *being treated*; the
patron's stream measures *how they treated*.

---

## 4. How the new cues extend the engine (loadings stay LEARNED)

New telemetry cues become **named scalars in a row of `BehavioralEvent.payload` / `raw_signals`**, which
the ML service folds into the feature vector φ. The 16-dim telemetry block read today is
[`persona.py` `TELEMETRY_FEATURE_NAMES`](../../services/ml/echo_ml/persona.py) (L396–411):
`latency_norm, has_latency, edits_norm, approach, ts_earn, ts_learn, ts_social, ts_leisure, ts_build,
save_rate, risk_index, solitude_tol, pet_attach, decision_latency, persistence, consistency`, assembled by
`_telemetry_features()` (L414–440) into φ via `featurize_raw()` (L443–459).

**Representative new cues → proposed new telemetry features** (extend the block; absent ⇒ 0 neutral, all
bounded like the existing reads):

| New cue (catalog) | Proposed `TELEMETRY_FEATURE_NAMES` entry | From `raw_signals` / payload |
|---|---|---|
| **A2** approach latency | `approach_latency` | `raw_signals.latency_ms` on `approach` |
| **A9** territory range | `range_norm` | session tiles-explored / reachable |
| **B1** cursor jitter | `cursor_jitter` | entropy of `raw_signals.cursor_path` (server-computed) |
| **B6** click cadence | `click_cadence` | inter-click interval variance |
| **C6** burstiness | `burstiness` | action inter-arrival variance |
| **G11** server treatment | `server_courtesy` | per-actor server-vantage valence × patience |
| **H1/H2** queue/honesty | `norm_adherence` | queue-honest & unobserved-honest aggregate |
| **F7** generosity | `generosity` | unforced resource given / held |

**Critical — loadings are never hardcoded.** Adding a feature only widens φ (e.g. F = 62 → 70). The
mapping φ → axis evidence is the **learned** measurement matrix **W** (8 × F): `phi = Wᵀ z + mu_phi +
eps`, fit by factor-analysis EM (`fa_em`) + semi-supervised `anchor_alignment`
([`persona_model.py`](../../services/ml/echo_ml/persona_model.py)). A cue's catalog "axis hypothesis" is
only a **prior** that seeds/aligns W; **the population data decides the real loading** (`persona.py`
L385–388 makes this explicit: *"the mapping φ → persona-axis evidence is NOT here — it is the learned
measurement matrix W"*). Do not add an `if cue == X: axis += …` anywhere.

**Wire path (unchanged shape, richer payload):**

```
client TelemetryCollector.emit()           apps/web/src/game/telemetry.ts (flush @2s / 25 events)
  → POST /api/island/observe (island)   OR  Colyseus C2S.TELEMETRY (world, WorldRoom.ts L193)
  → apps/realtime/src/persistence.ts logTelemetry()        (per-actor; rule-3 fan-out for social)
      → Supabase telemetry_events { user_id, session_id, type, payload_json, ts }
      → ML POST /telemetry  (feature read)  and  POST /observe (posterior update, robust_kalman_update)
```

The envelope upgrade rides inside `payload_json` / a widened `context` column — **no new endpoint**.
`/observe` and `/telemetry` ([`app.py`](../../services/ml/echo_ml/app.py)) already accept a `telemetry`
dict; the new named scalars simply appear there and `_telemetry_features()` reads them by key.

---

## 5. Consent gating (Invariant 7 — a declined permission ⇒ the event is never emitted)

Onboarding ([`apps/web/src/app/onboard/page.tsx`](../../apps/web/src/app/onboard/page.tsx)) grants four
toggles: **world** (required), **telemetry** (optional, default ON), **voice** (optional, off),
**biometric** (optional, off). Each channel maps to exactly one toggle; if the toggle is OFF the
affordance's emitter **no-ops** (the event is never constructed, never sent, never stored — not merely
filtered downstream).

| Channels | Consent toggle | If declined |
|---|---|---|
| A, B, C, F, G, H, I, J, K (and D content-derived scalars, E meta) | **telemetry** | emitter no-ops; no `BehavioralEvent` produced |
| (world presence / movement existence) | **world** (required) | cannot decline; without it there is no session |
| any future raw-audio paralinguistic cue | **voice** | channel gated off entirely; no-op when off |
| any future physiological cue | **biometric** | channel gated off entirely; no-op when off |

Every cue in [`cue-catalog.md`](./cue-catalog.md) uses **world + telemetry** only (catalog Appendix rule
4) — none requires voice or biometric. So with the default-ON telemetry toggle, the full schema is
emittable; a user who turns telemetry OFF keeps a fully playable world that simply emits **no**
`BehavioralEvent`s. The check is enforced at `TelemetryCollector.emit()` and again at `persistence`
ingress (defense in depth), consistent with the existing deletion-cascade discipline (payloads are
derived scalars, never raw text).

---

## Appendix — contract checklist (CI-enforceable)

1. **K-twin present.** Every affordance with a positive event has a wired refusal/omission event on
   Channel K (rule 1). No twin ⇒ incomplete cue ⇒ fail.
2. **Context complete.** Every emitted event has all 8 `EventContext` fields populated; missing ⇒
   discarded at ingress (rule 2). `mood_proxy` routes to V/Σ_m (state), never trait.
3. **Per-actor fan-out.** Every social affordance emits one event per participant from that actor's
   vantage into that actor's silo (rule 3); replaces today's single one-way `logInteraction`
   (`WorldRoom.ts` L374 / `persistence.ts` L72).
4. **`cue` valid.** Every event's `cue` exists in `cue-catalog.md`; `CUE_FOR_TYPE` map audited.
5. **Loadings learned.** New cues add a named φ feature only; no hardcoded axis loading anywhere — W is
   fit from data (`persona_model.py`).
6. **Consent honored.** Declined toggle ⇒ emitter no-ops; no cue requires a declined permission.
