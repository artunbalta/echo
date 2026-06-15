# ECHO — UX audit: first play → handover

> Deliverable A of the experience-ownership brief. A heuristic evaluation of the
> activation funnel, ranked by severity, each finding citing the file/line and a fix.
> Grounded in an actual zero-key traversal (web :3000 + realtime :2567, ML offline →
> mock) captured under `/tmp/echo_shots` while writing this. Deliverable B (the build)
> works down this list, handover arc first.

## How I evaluated

Played the whole funnel as a first-time user with a stopwatch, then re-read every surface.
At each stage I named the user's **goal** and **emotional state**, then hunted three
failure classes: **dead air** (no pull / no feedback), **friction** (unclear goal /
undiscoverable action), and **invisible value** (the product is doing something impressive
the user can't see, feel, or anticipate). Heuristics: Nielsen (visibility of system status,
match to mental model, feedback, recognition-over-recall) + game-feel "juice" applied
*within* the calm, literary, non-game tone.

The product's own promise is the yardstick: *your echo learns you and earns the right to act
as you.* The funnel today delivers the learning under the hood but barely lets the user
**feel** it, and the headline payoff — **the echo taking over** — has no on-ramp and no UI.

## The funnel, staged

| # | Stage | User goal | Feels like today |
|---|-------|-----------|------------------|
| 0 | Landing | "What is this?" | ✅ Strong, literary, polished |
| 1 | Consent | "What will it take from me?" | ✅ Clean, honest |
| 2 | Identity | "Make me someone" | ◑ Fine, slightly long |
| 3 | Reveal | "Meet myself" | ◑ Shows a *body*, not the *echo* |
| 4 | First entry | "What do I do?" | ✗ Dead air, no pull |
| 5 | Recognition | "Is it learning me?" | ✗ Invisible — buried side bar |
| 6 | First "let my echo answer" | "What's this button?" | ✗ Undiscoverable; teaching not felt |
| 7 | Graduation | "Is it getting trusted?" | ✗ Invisible as an event |
| 8 | **Handover** | "Let it act as me" | ✗ **Does not exist** |
| 9 | Outcomes | "Who did I/it meet?" | ◑ Good, but buried + no payoff loop |
| 10 | Return | "Why come back?" | ✗ No honest hook |

---

## Findings (severity-ranked)

Severity: **Blocker** (breaks the core promise / activation) · **Major** (significant
drop-off or invisible value) · **Minor** · **Polish**.

### BLOCKERS

#### B1 — The handover does not exist (the product's core promise has no UI)
- **Stage:** 8. **Files:** [WorldClient.tsx](../apps/web/src/components/WorldClient.tsx) (no autonomous path), [WorldRoom.ts](../apps/realtime/src/WorldRoom.ts) (NPCs only respond to a human-opened interaction).
- **Impact:** The echo never acts on its own. It only drafts a reply when the user clicks
  "let my echo answer" *mid-conversation* ([WorldClient.tsx:603-611](../apps/web/src/components/WorldClient.tsx#L603-L611)). The single most exciting promise — *your echo takes over* — has **no on-ramp and no payoff**. The autonomy levels exist (`copilot→supervised→auto`) and `auto` already makes the agent act in-line ([WorldClient.tsx:333-338](../apps/web/src/components/WorldClient.tsx#L333-L338)), but only reactively. Note: `InteractTurnPayload` already reserves `speaker:"agent"` + a `rationale` field ([protocol.ts:55-63](../packages/shared/src/protocol.ts#L55-L63)) — the protocol was built for this and it was never wired.
- **Fix:** In a promoted (`auto`) context, let the echo **self-initiate**: walk up to NPCs and converse via the existing `/agent/turn` policy+gate, while the user watches or idles. Surface every autonomous utterance with its "why it said that" trace and a **"that wasn't me" veto** that feeds `sendFeedback(agreed:false)` → demotes the bucket via the existing hysteresis. Route the encounters into the connections payoff. Keep it an explicit, revocable delegation (human stays sovereign).
- **Measure:** % of users who reach `auto` in ≥1 bucket who then start a handover; veto rate (a healthy < ~15% means the agent is trusted); connections produced per autonomous run.

#### B2 — Recognition is invisible: "is it learning me?" is unanswerable at a glance
- **Stage:** 5. **Files:** [EchoPanel.tsx:57-65](../apps/web/src/components/EchoPanel.tsx#L57-L65) (thin `confidence` bar), [WorldClient.tsx:498-519](../apps/web/src/components/WorldClient.tsx#L498-L519) (it's behind a toolbar button).
- **Impact:** The "does my echo know me" signal already exists but is a 1.5px bar
  (`(1-uncertainty)*100`) **inside a side panel polled every 3s**, off-screen by default. The mirror effect — the entire engagement loop per the README — is **not felt**. A first-timer has no reason to believe anything is happening, so no reason to continue.
- **Fix:** Elevate it to a primary, always-glanceable **recognition meter** in the world HUD — in-tone (a portrait coming into focus / a constellation of the 8 axes filling in), never an XP bar. Bind it to a blend of **real** `/persona` signals: posterior certainty `1−mean(uncertainty)`, breadth (`traits.length/8` axes resolved), evidence (`behaviors`, diminishing returns), reliability (low `ece`, rising `agreement_ewma`). Honest sub-components on expand (transparency, §10). Degrade honestly when ML is offline (label it, don't fake a fill).
- **Measure:** sessions-to-first-meter-movement; correlation between meter glances (hover/expand) and session length / number of conversations.

### MAJORS

#### M1 — Learning is never legible *in the moment* (no "it learned from that" beat)
- **Stage:** 5–6. **Files:** [WorldClient.tsx:347-377](../apps/web/src/components/WorldClient.tsx#L347-L377) (approve/edit/reject just POST silently), persona featurizer knows the moved axis ([persona.py:206-270](../services/ml/echo_ml/persona.py#L206-L270)) but the UI never surfaces it.
- **Impact:** When you correct the echo or talk to someone, the model *does* move, but the
  feedback loop is closed server-side and **invisible**. There is no moment where the user feels the echo get sharper. The single biggest "juice" gap in the calm tone.
- **Fix:** When a real trait newly resolves (diff `traits[]` across `/persona` polls) or a
  bucket's agreement ticks up after feedback, surface a sparse, in-tone acknowledgement near the meter ("your echo is starting to see you as *warm*"), bound to the real axis/bucket that moved — never a generic "nice!". Tie approve/edit/reject to a visible meter tick.
- **Measure:** repeat-use of "let my echo answer" after the first acknowledgement fires.

#### M2 — Cold start / dead air: the first 60s have no pull
- **Stage:** 4. **Files:** [WorldClient.tsx:490-495](../apps/web/src/components/WorldClient.tsx#L490-L495) (HUD is just a key legend), world spawns the player center-map with NPCs ~5 tiles away (observed `nearest.dist ≈ 5.2`).
- **Impact:** You step through into a quiet field. The HUD reads "WASD to move / E to talk" — controls, not a *reason*. The landing page's intrigue ("no one knows you here — not even you") **evaporates**; the world reads as "nothing to do." This is where first-session drop-off happens.
- **Fix:** A calm first-day orientation that re-plants the hook and gives exactly one soft
  pull ("someone is nearby — go and be seen"), plus the recognition meter sitting visibly at zero, *waiting* to fill. No quests, no objectives list — one intriguing nudge, in-tone, that dismisses itself once you act.
- **Measure:** time-to-first-conversation; % of sessions with ≥1 conversation.

#### M3 — The core action is undiscoverable and its purpose is unexplained
- **Stage:** 6. **Files:** [WorldClient.tsx:603-611](../apps/web/src/components/WorldClient.tsx#L603-L611).
- **Impact:** "↪ let my echo answer" only appears *inside* a conversation, as a small
  low-contrast outline button. A first-timer won't find it, and nothing says that
  approving/editing/rejecting **teaches** the echo. The mechanism that drives the whole
  product is hidden in plain sight.
- **Fix:** Make the affordance legible the first time (a one-time in-tone hint the first time
  a conversation opens: "you can let your echo try a reply — every yes/no teaches it"), and label the teaching explicitly on the proposal card. Pair with M1's "it learned" beat.
- **Measure:** first-conversation "let my echo answer" click-through.

#### M4 — The graduation arc is invisible as an event
- **Stage:** 7. **Files:** [EchoPanel.tsx:72-86](../apps/web/src/components/EchoPanel.tsx#L72-L86) (autonomy shown as tiny text), promotion logic [autonomy.py:70-96](../services/ml/echo_ml/autonomy.py#L70-L96), thresholds [config.py:27-33](../services/ml/echo_ml/config.py#L27-L33).
- **Impact:** `copilot→supervised→auto` is the journey toward the handover, but the user
  can't see progress toward it (no sense of "almost there") and the **moment** a context is
  earned passes with zero acknowledgement — it's just a word that changes color in a panel
  nobody has open. The most meaningful state change in the system is unmarked.
- **Fix:** Per-bucket progress in the mirror (agreement vs `α*=0.80`, volume vs `n*=8`, ECE
  vs `e*=0.10` — the real gate), and a calm, earned **graduation moment** surfaced in-world
  when a bucket crosses to `auto` ("your echo can carry this on its own now") — which is also the on-ramp to B1's handover.
- **Measure:** % of users who notice graduation (open the mirror within N s of the beat) → start a handover.

#### M5 — Outcomes are good but buried, and there's no return hook
- **Stage:** 9–10. **Files:** [OutcomesPanel.tsx](../apps/web/src/components/OutcomesPanel.tsx), [connections.ts](../apps/web/src/lib/connections.ts), analysis only runs when the panel is opened ([WorldClient.tsx:506-511](../apps/web/src/components/WorldClient.tsx#L506-L511)).
- **Impact:** The "who to actually meet" read is genuinely good, but it's behind a toolbar
  button, only computed on open, and nothing pulls the user back tomorrow. The honest return
  hook the product is built for — *the echo met people while you were away* — isn't realized
  because B1 doesn't exist yet.
- **Fix:** After an autonomous run (B1), surface the payoff directly ("while your echo
  wandered, it met 3 people — here's who's worth meeting yourself"), tagging autonomously-met
  people. Non-manipulative: it only ever reports *real* autonomous activity.
- **Measure:** return rate after a session that produced autonomous encounters.

#### M6 — Mobile & reduced-motion gaps
- **Stage:** all. **Files:** [WorldClient.tsx](../apps/web/src/components/WorldClient.tsx) (keyboard-first HUD copy "WASD / arrows", "press E/O"), [globals.css:67-71,236-240](../apps/web/src/app/globals.css#L67-L71) (`echo-pulse`, `scroll-cue` ignore `prefers-reduced-motion`). PixiWorld already supports click/drag/pinch-ish, so touch movement works, but the HUD never says so.
- **Impact:** On touch, the instructions are wrong/incomplete and any new animated meter would
  ignore reduced-motion preferences.
- **Fix:** Make new HUD elements touch-legible and wrap their motion in a
  `prefers-reduced-motion` guard; have the orientation copy adapt to coarse pointers.

### MINORS

#### m1 — The reveal conflates "your character" with "your echo"
- **Stage:** 3. **File:** [onboard/page.tsx:233-249](../apps/web/src/app/onboard/page.tsx#L233-L249) ("This is your echo." over a sprite).
- **Impact:** The reveal calls the *body* "your echo," but the echo is the *learned model*
  that grows and will act for you. The one moment to plant the core metaphor instead muddies it.
- **Fix:** Reframe: this is *you* in the world; **the echo is what learns you** and will one
  day act as you — a single line that foreshadows the handover before "Step through."

#### m2 — ML-offline is indistinguishable from "not learned yet"
- **Stage:** 5. **File:** [EchoPanel.tsx:37-41,87](../apps/web/src/components/EchoPanel.tsx#L37-L41) — the "ML offline — demo values" note lives in the `behaviors>0` branch, but offline → `behaviors:0`, so it never shows; the user sees the cold-start copy instead.
- **Impact:** Honesty gap (§3): a user running without the ML service can't tell "nothing
  learned yet" from "the brain isn't connected."
- **Fix:** Surface mock/offline state in the recognition meter explicitly, even at zero.

#### m3 — No funnel instrumentation to prioritize by
- **Stage:** all. **Files:** [telemetry.ts](../apps/web/src/game/telemetry.ts) captures *behavior* but no funnel stages.
- **Impact:** Prioritization is vibes, not evidence. We can't see time-to-first-conversation,
  drop-off, or sessions-to-first-promotion.
- **Fix:** Lightweight, consented, key-free funnel markers (reuse the telemetry pipe /
  localStorage) for: world_enter, first_nearby, first_conversation, first_let_echo_answer,
  first_promotion, handover_start. Respects telemetry consent like everything else.

### POLISH
- **p1** Proximity prompt and portal prompt both sit at `bottom-24` and the conversation panel
  at `bottom-4`; with the new meter, audit z-order/overlap on small screens.
- **p2** Onboarding is 5 steps before entry; `voice`/`biometric` consent could be deferred
  to first use in-world without losing consent integrity (out of scope here; flagged).

---

## Build order (Deliverable B)

1. **B2 + M1** Recognition meter HUD + in-the-moment trait beats + honest offline state. *(done)*
2. **M4** Per-bucket graduation progress + the graduation moment. *(done)*
3. **B1** Agent self-initiation (handover): autonomous approach+converse in `auto` contexts,
   rationale trace, "that wasn't me" veto → demote, connections payoff. *(done)*
4. **M2 + m1 + M3** Cold-start orientation + reveal reframe + discoverability hint. *(done)*
5. **m3** Funnel instrumentation. *(done)*
6. **M6 / m2 / polish** Reduced-motion + mobile + offline honesty passes. *(done)*

Each ships as its own `UX: <problem> → <fix>` commit. Invariants held throughout: no
points/XP/levels/streaks; every progress element binds to real `/persona` state with
inspectable sub-components; zero-key degrades honestly; the learning loop, consent, and
deletion are untouched or strengthened.
