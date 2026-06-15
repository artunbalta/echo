"""Graduated autonomy & drift — §9.7.

Each context bucket b tracks: agreement EWMA α_b (agent prediction == user actual/
approved), volume n_b, calibration ECE_b, and an autonomy level. Levels graduate:

    copilot → supervised → auto

  PROMOTE when  α_b ≥ α*  AND  n_b ≥ n*  AND  ECE_b ≤ e*
  DEMOTE  when  α_b < α*_down                      (hysteresis avoids flapping)

Cold start: every bucket begins at `copilot` with high posterior uncertainty; an imported
prior may seed traits but NEVER grants autonomy — autonomy is earned per bucket.

Drift: a CUSUM detector on the agreement stream. On trigger we demote affected buckets and
inflate posterior variance (handled by the caller via persona.inflate) to re-open learning.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np

from .config import HYPER

LEVELS = ["copilot", "supervised", "auto"]


@dataclass
class Bucket:
    name: str
    level: str = "copilot"
    agreement_ewma: float = 0.5
    volume: int = 0
    ece: float = 1.0
    # CUSUM drift state (one-sided, detects a drop in agreement).
    _cusum: float = 0.0
    # recent agreement labels for ECE/diagnostics
    _recent: list = field(default_factory=list)

    def record(self, agreed: bool, confidence: float | None = None) -> dict:
        """Record one outcome (the human approved/edited-to-match → agreed=True).
        Updates EWMA, volume, CUSUM, and re-evaluates the level. Returns an event dict."""
        beta = HYPER.ewma_beta
        x = 1.0 if agreed else 0.0
        self.agreement_ewma = (1 - beta) * self.agreement_ewma + beta * x
        self.volume += 1
        self._recent.append((confidence if confidence is not None else self.agreement_ewma, int(agreed)))
        self._recent = self._recent[-200:]

        # CUSUM: accumulate evidence that agreement dropped below the promote target.
        # s_t = max(0, s_{t-1} + (α* − x)); a sustained run of disagreements grows it.
        self._cusum = max(0.0, self._cusum + (HYPER.alpha_promote - x))

        drift = self._cusum > HYPER.cusum_threshold
        old = self.level
        self._reevaluate(drift)
        return {
            "bucket": self.name,
            "level": self.level,
            "changed": self.level != old,
            "agreement": round(self.agreement_ewma, 3),
            "volume": self.volume,
            "ece": round(self.ece, 3),
            "drift": drift,
        }

    def set_ece(self, ece: float):
        self.ece = ece
        self._reevaluate(False)

    def _reevaluate(self, drift: bool):
        if drift:
            # Demote one rung and reset the detector; caller re-opens posterior variance.
            self._demote()
            self._cusum = 0.0
            return
        # Demotion on low agreement (hysteresis: uses α*_down, below promote threshold).
        if self.agreement_ewma < HYPER.alpha_demote:
            self._demote()
            return
        # Promotion gate: all three conditions.
        if (
            self.agreement_ewma >= HYPER.alpha_promote
            and self.volume >= HYPER.n_promote
            and self.ece <= HYPER.ece_promote
        ):
            self._promote()

    def _promote(self):
        i = LEVELS.index(self.level)
        if i < len(LEVELS) - 1:
            self.level = LEVELS[i + 1]

    def _demote(self):
        i = LEVELS.index(self.level)
        if i > 0:
            self.level = LEVELS[i - 1]

    # Beta posterior over agreement for Thompson sampling in the gate (§9.5).
    def beta_params(self) -> tuple[float, float]:
        a = 1.0 + self.agreement_ewma * max(self.volume, 1)
        b = 1.0 + (1 - self.agreement_ewma) * max(self.volume, 1)
        return a, b

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "level": self.level,
            "agreement_ewma": self.agreement_ewma,
            "volume": self.volume,
            "ece": self.ece,
            "_cusum": self._cusum,
        }

    @staticmethod
    def from_dict(d: dict) -> "Bucket":
        b = Bucket(d["name"], d.get("level", "copilot"), d.get("agreement_ewma", 0.5),
                   int(d.get("volume", 0)), d.get("ece", 1.0))
        b._cusum = d.get("_cusum", 0.0)
        return b


def persona_drift_kl(mu_recent: np.ndarray, mu_prior: np.ndarray,
                     cov_recent: np.ndarray, cov_prior: np.ndarray) -> float:
    """KL( recent behavior posterior ‖ persona prior ) for **full-covariance** Gaussians
    (§9.7). A large value signals the user's recent behavior diverged from their
    established model. `cov_*` may be a full (D,D) covariance matrix or a 1-D diagonal
    (legacy callers) — gaussian_kl handles both and reduces to the diagonal KL when both
    covariances are diagonal."""
    from .persona import gaussian_kl
    return gaussian_kl(mu_recent, cov_recent, mu_prior, cov_prior)
