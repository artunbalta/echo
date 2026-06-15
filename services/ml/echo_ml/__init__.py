"""ECHO ML service — the learning engine (§9).

Implements the full mathematical stack:
  - persona.py   §9.2  amortized variational persona posterior (online Gaussian update)
  - policy.py    §9.3  behavioral cloning via frozen base LLM + persona + retrieval
  - reward.py    §9.4  inverse-RL reward model (Bradley-Terry preference + outcome BCE)
  - gate.py      §9.5  calibration + cost-aware autonomy decision + Thompson exploration
  - bald.py      §9.6  BALD active-learning NPC selection (expected information gain)
  - autonomy.py  §9.7  graduated per-context autonomy buckets + drift detection

Per-user state is lightweight (no per-user LLM fine-tuning, §9.9). The math is in NumPy
with hand-derived gradients so it is fully inspectable and unit-testable.
"""

__version__ = "0.1.0"
