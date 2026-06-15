"""ECHO ML service — the learning engine (§9).

Implements the full mathematical stack:
  - persona.py        §9.2  full-covariance posterior; general/robust Kalman update;
                            language-independent featurizer; full-cov KL; ELBO; drift inflation
  - persona_model.py  §9.2  learned measurement matrix W (Factor Analysis + anchoring) and
                            trait/state factors V,Σ_m; committed artifact (heuristic fallback)
  - stylometry.py     §9.1  language-agnostic style features (ratios/distributions, TR+EN lexicons)
  - embeddings.py     §9.1  multilingual Voyage embeddings (input_type) + deterministic hash mock
  - policy.py         §9.3  behavioral cloning via frozen base LLM + persona + retrieval
  - reconstruct.py    §9.3  doppelgänger objective: reconstruction fidelity + CEM latent refinement
  - reward.py         §9.4  inverse-RL reward model (Bradley-Terry preference + outcome BCE)
  - gate.py           §9.5  calibration + cost-aware autonomy decision + Thompson exploration
  - bald.py           §9.6  BALD active-learning NPC selection (expected information gain)
  - autonomy.py       §9.7  graduated per-context autonomy buckets + drift detection

The persona core is a calibrated inverse problem φ = W·z + ε: learned loading, robust
full-covariance updates, trait/state separation, behavioral-reproducibility refinement.
Per-user state is lightweight (no per-user LLM fine-tuning, §9.9). The math is in NumPy
with hand-derived gradients so it is fully inspectable and unit-testable.
"""

__version__ = "0.1.0"
