# ECHO ML service — the learning engine (§9)

The heart of ECHO. A standalone Python/FastAPI microservice that learns a model of each
user from explicit and implicit signals and decides when their agent may act for them.

## Design choice: NumPy, not PyTorch

The spec recommends PyTorch but allows swaps with justification. Per-user state is tiny
(an 8-d persona latent, a small reward head, autonomy buckets), the service is
event-driven, and there is **no per-user gradient training of an LLM** (a hard §9.9
constraint). So the math is implemented in **NumPy with hand-derived gradients** — fully
inspectable, dependency-light, and unit-tested. The frozen base LLM (Claude) is called
over HTTP for policy candidates and NPC dialogue. Swap to Torch later behind the same
module interfaces if population-level training ever needs autograd.

## The math (all in `echo_ml/`)

| Module | Spec | What it implements |
|--------|------|--------------------|
| `persona.py` | §9.2/§9.8 | Full-covariance posterior `q(z\|H)=N(μ,Σ)`; general Joseph-form Kalman update `φ=Wz+ε`; **robust** Student-t + Mahalanobis-gate update; heteroscedastic noise; language-independent `featurize_raw`; full-cov KL; ELBO; covariance inflation on drift |
| `persona_model.py` | §9.2 | **Learned** measurement matrix `W` via Factor Analysis EM + semi-supervised anchoring; trait/state factors `V,Σ_m`; loads `artifacts/measurement.npz` (heuristic fallback if absent); `interpretability()` |
| `stylometry.py` | §9.1 | Language-agnostic style features (punctuation/cap/emoji/diversity/length/sentence ratios + pluggable per-language hedge/assertive lexicons, default TR+EN) |
| `embeddings.py` | §9.1 | Multilingual embeddings — Voyage `voyage-3.5` (256-d Matryoshka) with `input_type` query/document asymmetry; deterministic hash-mock fallback |
| `reconstruct.py` | §9.3/§9.9 | Doppelgänger objective: reconstruction fidelity `L(z)` (frozen-LLM, black-box) + CEM latent refinement with KL-to-posterior regularizer |
| `policy.py` | §9.3 | Behavioral cloning: frozen LLM + decoded traits + retrieval, Best-of-N reranked by reward |
| `reward.py` | §9.4 | Reward head `r_φ(s,a)`; Bradley-Terry preference loss + outcome BCE anchor; manual backprop |
| `gate.py` | §9.5 | Temperature calibration, ECE, cost-aware threshold `τ(c)`, Thompson exploration (never high-stakes) |
| `bald.py` | §9.6 | BALD expected-information-gain NPC selection via Cholesky MC sampling of `z` from full `Σ` |
| `autonomy.py` | §9.7 | Per-bucket agreement EWMA, promotion/demotion with hysteresis, CUSUM drift, full-covariance KL drift |
| `app.py` | §9.8 | FastAPI endpoints wiring the full online loop |
| `scripts/train_measurement.py` | §9.2 | Offline FA fitter → committed `artifacts/measurement.npz` (seeded, idempotent; synthetic corpus or `anchors.jsonl`) |

The persona core is a **calibrated inverse problem** `φ = W·z + ε`: a learned, language-
independent measurement matrix, a robust full-covariance update, transient-state marginalization,
and a behavioral-reproducibility objective — replacing the original hand-coded English featurizer.
A clean checkout with no artifact and no keys runs entirely on the heuristic + hash-mock fallbacks.

## Run

```bash
cd services/ml
./run.sh                      # creates .venv, installs, serves on :8000 (reads ../../.env)
# or from repo root:  npm run dev:ml
```

## Test

```bash
./.venv/bin/python -m pytest -q          # 77 math unit tests (§14), key-free & deterministic
```

To (re)build the learned measurement artifact (offline, optional — a clean checkout falls back
to the heuristic featurizer):

```bash
./.venv/bin/python scripts/train_measurement.py            # → echo_ml/artifacts/measurement.npz
# real data:  ./.venv/bin/python scripts/train_measurement.py --anchors anchors.jsonl
```

## API (all but /health need `Authorization: Bearer $ML_SERVICE_TOKEN`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness |
| POST | `/observe` | a user action → persona update + behavior index + drift check |
| POST | `/telemetry` | an implicit signal → revealed-preference persona update |
| POST | `/npc/turn` | NPC dialogue (called by the realtime server) |
| POST | `/agent/turn` | agent acts on the user's behalf → policy + gate decision |
| POST | `/feedback` | human approve/edit/reject → calibration + autonomy + reward pair |
| POST | `/meeting-outcome` | ground-truth outcome → supervised reward anchor |
| GET | `/persona/{uid}` | inspect posterior, traits, ECE, buckets (observability) |
| POST | `/select-npc` | BALD active-learning selection |
| DELETE | `/user/{uid}` | hard delete all derived state (§13) |

The realtime server forwards `/observe`, `/telemetry`, and `/npc/turn` automatically when
`ML_SERVICE_URL` is set, closing the loop between the world and the learner.
