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
    ml_token: str = os.getenv("ML_SERVICE_TOKEN", "dev-ml-token-change-me")
    anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model_strong: str = os.getenv("LLM_MODEL_STRONG", "claude-opus-4-8")
    model_cheap: str = os.getenv("LLM_MODEL_CHEAP", "claude-haiku-4-5-20251001")
    embeddings_provider: str = os.getenv("EMBEDDINGS_PROVIDER", "mock")
    embeddings_key: str = os.getenv("EMBEDDINGS_API_KEY", "")
    embed_dim: int = int(os.getenv("EMBEDDINGS_DIM", "256"))
    supabase_url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    best_of_n: int = int(os.getenv("POLICY_BEST_OF_N", "4"))


SETTINGS = Settings()
