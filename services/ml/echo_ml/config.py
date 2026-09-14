"""Configuration + documented hyperparameters (§18)."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Hyper:
    # Persona latent (§9.2)
    persona_dim: int = 8
    prior_var: float = 1.0          # Σ0 diagonal — high initial uncertainty everywhere
    obs_noise: float = 0.35         # likelihood noise for the Gaussian observation update
    min_var: float = 0.02           # floor so a bucket can always re-open on drift
    embed_dim: int = 256            # context/action embedding dimension
    # Language-independent raw featurizer (WI-3). phi = concat(embedding_projection,
    # stylometry, telemetry). The embedding is JL-projected to embed_proj_dim so the
    # learned W (WI-2) sees semantic variation without a 256-wide loading matrix.
    embed_proj_dim: int = 32        # JL random-projection dim of the semantic embedding
    # feature_dim F = embed_proj_dim + len(STYLOMETRY) + len(TELEMETRY); see persona.FEATURE_DIM.
    # Trait/state split (WI-5): K_state transient directions V whose variance is marginalized
    # into the measurement covariance so a bad day / mood can't corrupt the durable trait z.
    k_state: int = 4

    # Robust observation update (WI-4) — innovation gating + Student-t downweighting
    student_t_nu: float = 4.0          # Student-t dof ν: smaller ⇒ heavier tails ⇒ more robust
    mahalanobis_gate_quantile: float = 0.99   # χ²_F quantile flagging a "surprising" message
    irls_iters: int = 3                # IRLS reweighting iterations for the Student-t update
    # Heteroscedastic reliability: short / low-information / heavily-edited messages get more
    # measurement noise, so a single message can never move the posterior far (§9.8).
    het_noise_short: float = 6.0       # noise added ∝ 1/(1+n_words)
    het_noise_edit: float = 0.5        # noise added ∝ edit count

    # Behavioral-reproducibility latent refinement (WI-6) — the doppelgänger objective
    gamma_reconstruction: float = 0.5   # weight on KL(z ‖ posterior) regularizer in CEM

    # Reward model (§9.4)
    reward_hidden: int = 32
    reward_lr: float = 0.05
    lambda_outcome: float = 1.0     # weight on the supervised meeting-outcome anchor (BCE)
    l2: float = 1e-4

    # Calibration + gate (§9.5)
    temperature_init: float = 1.5   # >1 because raw policy confidence is overconfident
    u_ask: float = 0.15             # utility of asking the human (baseline)

    # Graduated autonomy (§9.7)
    alpha_promote: float = 0.80     # α*  promotion agreement threshold
    alpha_demote: float = 0.60      # α*_down  demotion threshold (hysteresis margin = 0.20)
    n_promote: int = 8              # n*  minimum volume before promotion
    ece_promote: float = 0.10       # e*  max calibration error to promote
    ewma_beta: float = 0.2          # agreement EWMA smoothing

    # Drift (§9.7)
    drift_kl_threshold: float = 4.0
    cusum_threshold: float = 3.0


HYPER = Hyper()


@dataclass(frozen=True)
class Settings:
    # THE SERVICE NEVER INVENTS A CREDENTIAL. This used to default to the literal
    # "dev-ml-token-change-me", which is also committed at .env.example:27 — so an operator who
    # skipped render.yaml's `sync: false` prompt got a service that came up healthy and accepted a
    # token anyone can read out of this repository. Behind that one token: GET /persona/{uid} and
    # DELETE /user/{uid}, which are the same two capabilities ⚑27 closed at the Next.js boundary,
    # one layer down. C39 chose fail-closed-in-production for exactly this shape; services/ml has no
    # production marker to key that on (render.yaml sets NODE_ENV on echo-realtime and nothing on
    # echo-ml), so the polarity is inverted instead: EMPTY MEANS REFUSE, and the dev literal lives
    # in the launcher — `run.sh` and `conftest.py` — the way harness/f4/run_f4_acceptance.sh:30 and
    # three sibling scripts already keep it. Every deployment path that does not run `run.sh`
    # (Render's Dockerfile CMD is uvicorn directly) therefore fails closed with nothing to
    # configure, and there is no flag that could re-open the published literal in production.
    #
    # NOT a module-level constant: `_auth` re-reads this so a test can drive the real handler with
    # monkeypatch instead of reloading the module.
    ml_token: str = os.getenv("ML_SERVICE_TOKEN", "")
    anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model_strong: str = os.getenv("LLM_MODEL_STRONG", "claude-opus-4-8")
    model_cheap: str = os.getenv("LLM_MODEL_CHEAP", "claude-haiku-4-5-20251001")
    embeddings_provider: str = os.getenv("EMBEDDINGS_PROVIDER", "mock")  # mock | voyage | openai
    embeddings_key: str = os.getenv("EMBEDDINGS_API_KEY", "")
    embeddings_model: str = os.getenv("EMBEDDINGS_MODEL", "")  # blank → provider default
    # Voyage AI (WI-3): multilingual embeddings (voyage-3.5, 256-d Matryoshka) — fixes the
    # Turkish collapse. VOYAGE_* take precedence; fall back to the generic EMBEDDINGS_* vars.
    voyage_key: str = os.getenv("VOYAGE_API_KEY", "") or os.getenv("EMBEDDINGS_API_KEY", "")
    voyage_model: str = os.getenv("VOYAGE_MODEL", "") or os.getenv("EMBEDDINGS_MODEL", "") or "voyage-3.5"
    embed_dim: int = int(os.getenv("EMBEDDINGS_DIM", "256"))
    # ── the durable store's credentials, and why they are NOT the repo-wide names ────────────
    #
    # These were `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and NOTHING read them, so
    # the loaded gun never fired. It was loaded, though: `run.sh:14` sources the gitignored repo-root
    # `.env` into this service's environment, and on a developer machine that file holds a URL
    # BYTE-IDENTICAL to `render.yaml`'s production project plus a live service-role key — which
    # bypasses RLS. So the first line of SOC-2.D that reads `SETTINGS.supabase_*` turns
    # `npm run dev:ml` into a laptop writing personas into production. `identity.ts` honours
    # `?u=<id>` verbatim (SOC-2.E), so it would write into a REAL PERSON'S row.
    #
    # Distinct, ML-owned names close it at zero cost: the shared `.env` no longer reaches this
    # service, and enabling persistence becomes something someone has to do ON PURPOSE, per
    # environment. Renamed BEFORE the first durable write exists, because a default that only fires
    # once the feature lands is a default nobody tests.
    #
    # ⚑24. See also `persist_enabled` below: having the keys is necessary and not sufficient.
    supabase_url: str = os.getenv("ECHO_ML_SUPABASE_URL", "")
    supabase_key: str = os.getenv("ECHO_ML_SUPABASE_SERVICE_KEY", "")
    # An explicit, per-environment opt-in. Credentials alone must never be enough: a key pasted into
    # a shell to run one script would otherwise silently arm every write for the life of that shell.
    persist: bool = os.getenv("ECHO_ML_PERSIST", "") == "1"
    best_of_n: int = int(os.getenv("POLICY_BEST_OF_N", "4"))


    @property
    def persist_enabled(self) -> bool:
        """Whether the durable store may write. THE ONE GATE — no caller reads the keys directly.

        All three, and the opt-in is not redundant with the keys (⚑24): `run.sh` sources the
        repo-root `.env`, so a developer machine can have production credentials in this process
        without anybody choosing that. Requiring `ECHO_ML_PERSIST=1` as well makes durability a
        deliberate act per environment rather than a side effect of having a `.env`.

        Returns False today for everyone, because nothing writes yet — SOC-2.D. When something does,
        it reads THIS and never `supabase_url`/`supabase_key`, so the gate cannot be routed around
        by a later author who only needed a URL.
        """
        return self.persist and bool(self.supabase_url) and bool(self.supabase_key)


SETTINGS = Settings()
