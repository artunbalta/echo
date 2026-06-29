# Known gaps & tracked debt

Deliberate deferrals, recorded so they are tracked, not lost. Each entry states what, root cause,
why we are not fixing it now, the resolution criterion, and status.

---

## 1. F0 exploration cues route to dominance/warmth instead of openness

- **Opened:** 2026-06-29 (Step 2, the 7-flow archipelago build).
- **What:** In the Flow 0 walkthrough (`services/ml/scripts/flow0_walkthrough.py`), the cues
  `enter_unmarked`, `egg_horizon_seen`, `egg_hollow`, and `approach_distant_lone` **move the
  posterior** but load onto **dominance / warmth**, not the **openness** the design doc intends
  (the four ⚑ rows in the Step-2 evidence). The cues that have a real implicit path land exactly
  on the doc's axis (first_move→pace, climb_persist→formality, gaze_reflection→affect,
  stack_tidy→formality).
- **Root cause:** the committed measurement matrix `W` (`services/ml/echo_ml/artifacts/measurement.npz`)
  has **no telemetry→openness path**. It was anchored on the island day-loop economy (time-shares,
  save/risk/persistence), not on F0 locomotion/exploration. With no openness path, an exploration
  cue's signal seeps to the nearest existing path — a costly/uncertain off-trail choice reads as
  `risk_index` → **dominance**; going toward a far thing reads as `approach` → **warmth**.
- **Why we are NOT fixing it now:** re-anchoring W on F0 cues alone is **partial** and would be
  redone once Flows 3–6 exist. Per the design doc's cross-cutting rule #1 (loadings are *learned*;
  the cue→axis tables are priors, not hardcodes), W is to be re-anchored **once** on the **full
  multi-flow cue set with real user behavioral data**, then re-verified by the numerics regression
  gate. A one-time, correct calibration beats two partial refits.
- **Resolution criterion:** after the multi-flow re-anchor, the four ⚑ cues load **predominantly
  onto openness** in `flow0_walkthrough.py` (the `implicit_channel_matches_doc_priors` check is
  extended to assert openness for them), the numerics regression gate stays green, and the
  individuation eval (`services/ml/scripts/individuation_eval.py`) still passes.
- **Status:** OPEN — deferred to the **W re-anchor milestone** (after Flows 3–6 land).

## 2. Flow 0 continuous passive sampler (every ~1.5s) not built

- **Opened:** 2026-06-29 (Step 2).
- **What:** The design doc's F0 t=5.5–20 beat specifies continuous passive emitters firing every
  ~1.5s: movement-speed-variance → pace/energy, heading-change-rate → openness, dwell points,
  cursor/camera micro-jitter & backtracking → deliberation. Step 2 built the **discrete**,
  high-validity cues (first_move, the 6 affordances, dwell at stations, the 3 eggs) but **not** the
  fine-grained ~1.5s passive sampler as a live emitter.
- **Root cause / why deferred now:** two reasons. (a) **Flood risk** — emitting one
  `/observe/behavioral` per ~1.5s over a 3–4 min flow is ~120–160 low-validity events; it needs
  proper batching/debouncing + change-thresholding + a per-flow cap before it ships, or it will
  flood ML. (b) **Same W gap as #1** — its headliner signal is heading-rate → *openness*, which W
  cannot route yet (no telemetry→openness path). Building it before the re-anchor produces cues that
  load on the wrong axis anyway. It is therefore correctly **co-deferred with the W re-anchor**, at
  which point it will be added as a debounced, batched, change-thresholded emitter.
- **Resolution criterion:** a debounced sampler emits ≤1 aggregated movement cue per ~1.5s (capped
  per flow), and after the re-anchor heading-variance loads onto openness/pace as the doc intends,
  with no measurable ML load regression in local two-tab runs.
- **Status:** OPEN — co-deferred to the **W re-anchor milestone**.

---

_Decision recorded for Step 3: the passive sampler is left here (not built this turn) for the two
reasons above — flood risk + it shares the openness-routing gap, so it would be reworked at the
re-anchor regardless._
