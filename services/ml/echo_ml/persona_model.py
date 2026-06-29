"""Learned measurement model — WI-2 (§9.2 calibration of the loading matrix).

The old featurizer hand-set which signal loads on which axis ("long message → energy",
"! → affect"). That mapping is arbitrary and English-bound. Here it is *learned from data*
as a Factor Analysis model — the ESPIRiT-style auto-calibration of the loading matrix:

    φ = Wᵀ z + μ_φ + ε,   z ~ N(0, I),   ε ~ N(0, diag(Ψ))           (FA generative model)

where φ ∈ R^F is the language-independent feature vector (persona.featurize_raw) and z ∈ R^D
is the persona latent. We store the loading in *axis-major* orientation `W: (D, F)` (row d =
how strongly each raw feature loads on axis d — directly usable for interpretability), and
hand the Kalman update its transpose `Wᵀ: (F, D)` as the measurement matrix for

    φ − μ_φ = Wᵀ z + ε.

The trait/state split (WI-5) adds transient loadings `V: (F, K_state)` whose variance is
marginalized into the measurement covariance: Ψ_total = diag(Ψ) + V diag(Σ_m) Vᵀ.

`apply(φ)` returns `(Wᵀ, Ψ_total)` for kalman_update_general; `center(φ)` subtracts μ_φ.
The model loads from a committed artifact `artifacts/measurement.npz`; if that file is
absent (clean checkout) `load()` returns an *untrained* sentinel and the caller
(persona.observe) falls back to the legacy heuristic featurizer — preserving the zero-key
invariant. The fitting routines (fa_em / anchor_alignment) live here so they are unit-
testable, but they are only ever called offline by scripts/train_measurement.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import numpy as np

from .config import HYPER
from .persona_axes import AXIS_KEYS
from ._numerics import quiet_fp

ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "measurement.npz"
MODEL_VERSION = 1
_PSI_FLOOR = 1e-4   # keep Ψ strictly positive so the innovation covariance stays PD


# ── the runtime model ─────────────────────────────────────────────────────────────

@dataclass
class PersonaModel:
    W: np.ndarray                              # (D, F) axis-major loading; measurement = Wᵀ
    mu_phi: np.ndarray                         # (F,)   feature mean
    Psi: np.ndarray                            # (F,)   diagonal residual noise (> 0)
    feature_names: list[str] = field(default_factory=list)
    axis_keys: list[str] = field(default_factory=lambda: list(AXIS_KEYS))
    V: Optional[np.ndarray] = None             # (F, K_state) transient-state loadings (WI-5)
    Sigma_m: Optional[np.ndarray] = None       # (K_state,)   transient-state variances (WI-5)
    trained: bool = True

    @staticmethod
    def untrained() -> "PersonaModel":
        """Sentinel returned when no artifact exists — callers fall back to the heuristic."""
        return PersonaModel(np.zeros((HYPER.persona_dim, 0)), np.zeros(0), np.zeros(0),
                            trained=False)

    def center(self, phi: np.ndarray) -> np.ndarray:
        return np.asarray(phi, dtype=float) - self.mu_phi

    @quiet_fp
    def apply(self, phi: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Return (measurement matrix Wᵀ ∈ R^{F×D}, measurement covariance Ψ_total ∈ R^{F×F})
        for the centered observation φ − μ_φ. Ψ_total folds in the marginalized transient
        state (WI-5) when present; otherwise it is just diag(Ψ)."""
        Psi_total = np.diag(np.maximum(self.Psi, _PSI_FLOOR))
        if self.V is not None and self.Sigma_m is not None and self.V.shape[1] > 0:
            Psi_total = Psi_total + self.V @ np.diag(self.Sigma_m) @ self.V.T
        return self.W.T, Psi_total

    def interpretability(self, top: int = 4) -> dict:
        """Replaces the hard-coded "which axis / why" explanation: for each axis, the raw
        features that load most strongly on it (signed), read straight from W."""
        out: dict[str, list[dict]] = {}
        names = self.feature_names or [f"f{i}" for i in range(self.W.shape[1])]
        for d, axis in enumerate(self.axis_keys):
            row = self.W[d]
            order = np.argsort(-np.abs(row))[:top]
            out[axis] = [{"feature": names[j], "loading": round(float(row[j]), 4)} for j in order]
        return out

    # ── persistence ──────────────────────────────────────────────────────────────
    def save(self, path: Path | str = ARTIFACT_PATH) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = dict(
            W=self.W, mu_phi=self.mu_phi, Psi=self.Psi,
            feature_names=np.array(self.feature_names, dtype=object),
            axis_keys=np.array(self.axis_keys, dtype=object),
            version=np.array(MODEL_VERSION),
        )
        if self.V is not None and self.Sigma_m is not None:
            data["V"] = self.V
            data["Sigma_m"] = self.Sigma_m
        np.savez(path, **data)

    @staticmethod
    def load(path: Path | str = ARTIFACT_PATH) -> "PersonaModel":
        """Load the committed artifact, or return an untrained sentinel if it is missing /
        unreadable (clean checkout → heuristic fallback, never an error)."""
        path = Path(path)
        if not path.exists():
            return PersonaModel.untrained()
        try:
            d = np.load(path, allow_pickle=True)
            V = d["V"] if "V" in d.files else None
            Sigma_m = d["Sigma_m"] if "Sigma_m" in d.files else None
            return PersonaModel(
                W=d["W"].astype(float),
                mu_phi=d["mu_phi"].astype(float),
                Psi=d["Psi"].astype(float),
                feature_names=[str(x) for x in d["feature_names"]] if "feature_names" in d.files else [],
                axis_keys=[str(x) for x in d["axis_keys"]] if "axis_keys" in d.files else list(AXIS_KEYS),
                V=None if V is None else V.astype(float),
                Sigma_m=None if Sigma_m is None else Sigma_m.astype(float),
                trained=True,
            )
        except Exception as err:  # corrupt artifact → degrade to heuristic, never crash
            print(f"[persona_model] failed to load {path}: {err}; using heuristic fallback")
            return PersonaModel.untrained()


# Process-wide singleton so the artifact is read at most once.
_MODEL: Optional[PersonaModel] = None


def get_persona_model() -> PersonaModel:
    global _MODEL
    if _MODEL is None:
        _MODEL = PersonaModel.load()
    return _MODEL


def set_persona_model(model: Optional[PersonaModel]) -> None:
    """Test/ops hook to override (or reset with None) the cached model."""
    global _MODEL
    _MODEL = model


# ── offline fitting (called only by scripts/train_measurement.py and unit tests) ──

@quiet_fp
def fa_em(Phi: np.ndarray, K: int, iters: int = 100, seed: int = 0,
          tol: float = 1e-6) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[float]]:
    """Factor Analysis by EM (pure NumPy). Fits φ = L z + μ + ε, z~N(0,I), ε~N(0,diag(Ψ)).

    Returns (L, Psi, mu, lls) where L is (F, K), Psi is (F,), mu is (F,), and `lls` is the
    per-iteration marginal log-likelihood Σ_n log N(φ_n | μ, L Lᵀ + diag(Ψ)) — monotonically
    non-decreasing, the EM lower bound.

    E-step (Woodbury, K≪F):  β = Lᵀ (L Lᵀ + Ψ)⁻¹ = (I + Lᵀ Ψ⁻¹ L)⁻¹ Lᵀ Ψ⁻¹
        E[z_n]     = β (φ_n − μ)
        E[z z ᵀ]_n = (I − β L) + E[z_n] E[z_n]ᵀ
    M-step:
        L = (Σ_n (φ_n−μ) E[z_n]ᵀ) (Σ_n E[z zᵀ]_n)⁻¹
        Ψ = diag( (1/N) Σ_n diag( (φ_n−μ)(φ_n−μ)ᵀ − L E[z_n](φ_n−μ)ᵀ ) )
    """
    rng = np.random.default_rng(seed)
    Phi = np.asarray(Phi, dtype=float)
    N, F = Phi.shape
    mu = Phi.mean(axis=0)
    Xc = Phi - mu
    # init loadings small, residual = feature variance
    L = 0.1 * rng.standard_normal((F, K))
    Psi = np.maximum(Xc.var(axis=0), _PSI_FLOOR)

    lls: list[float] = []
    eyeK = np.eye(K)
    for _ in range(iters):
        Psi_inv = 1.0 / Psi
        LtPsi = L.T * Psi_inv                           # (K, F) = Lᵀ Ψ⁻¹
        M = eyeK + LtPsi @ L                            # (K, K) = I + Lᵀ Ψ⁻¹ L
        M_inv = np.linalg.inv(M)
        beta = M_inv @ LtPsi                            # (K, F) = Lᵀ (L Lᵀ + Ψ)⁻¹  (Woodbury)
        Ez = Xc @ beta.T                                # (N, K)  posterior means
        Ezz = N * (eyeK - beta @ L) + Ez.T @ Ez         # (K, K)  Σ_n E[z zᵀ]

        # marginal log-likelihood at the CURRENT params (EM lower-bound trace, non-decreasing).
        # log|LLᵀ+Ψ| = log|Ψ| + log|M| ; quadₙ = xᵀΨ⁻¹x − (LᵀΨ⁻¹x)ᵀ M⁻¹ (LᵀΨ⁻¹x) (Woodbury).
        _, logdetM = np.linalg.slogdet(M)
        logdet = float(np.sum(np.log(Psi)) + logdetM)
        Bx = Xc @ LtPsi.T                               # (N, K) = (LᵀΨ⁻¹ x)ₙ
        quad = float(np.sum(Xc * (Xc * Psi_inv)) - np.einsum("nk,kj,nj->", Bx, M_inv, Bx))
        lls.append(-0.5 * (N * F * np.log(2 * np.pi) + N * logdet + quad))

        # M-step: L = (Σ x Ezᵀ)(Σ E[z zᵀ])⁻¹ ; Ψ = diag(S − L (1/N Σ Ez xᵀ))
        L = (Xc.T @ Ez) @ np.linalg.inv(Ezz)            # (F, K)
        Psi = np.maximum(np.mean(Xc * Xc, axis=0) - np.mean(Xc * (Ez @ L.T), axis=0), _PSI_FLOOR)

        if len(lls) >= 2 and abs(lls[-1] - lls[-2]) < tol * max(1.0, abs(lls[-2])):
            break

    return L, Psi, mu, lls


@quiet_fp
def anchor_alignment(Phi_centered: np.ndarray, Z_target: np.ndarray,
                     ridge: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """Resolve FA's rotation/scale indeterminacy by a regularized alignment to the named
    axes (the brief's "regularized alignment of the latent to the labels"). With curated
    axis labels `Z_target: (n, D)` for the corpus, fit the ridge regression that explains the
    centered features by the axes,

        φ − μ ≈ z Wᵀ,    W = argmin ‖Φc − Z Wᵀ‖² + ridge‖W‖²
              ⟹  W (axis-major, D×F) = (Zᵀ Z + ridge I)⁻¹ Zᵀ Φc,

    and take the per-feature residual variance as the measurement noise Ψ — the part of each
    feature NOT explained by the persona traits. This yields a *parsimonious, interpretable,
    transfer-stable* loading (each feature loads on the axes it actually co-varies with —
    e.g. latency on pace), unlike inverting the FA mixing of (possibly non-semantic) factors.

    Returns (W: (D, F), Psi: (F,)). FA EM (fa_em) is fit separately for the feature
    covariance / EM lower-bound; this read-out is what the Kalman update consumes.
    """
    Phi_centered = np.asarray(Phi_centered, dtype=float)
    Z = np.asarray(Z_target, dtype=float)
    D = Z.shape[1]
    G = Z.T @ Z + ridge * np.eye(D)
    W = np.linalg.solve(G, Z.T @ Phi_centered)           # (D, F) axis-major
    resid = Phi_centered - Z @ W                          # (N, F)
    Psi = np.maximum(resid.var(axis=0), _PSI_FLOOR)
    return W, Psi


@quiet_fp
def fit_state_factors(residual: np.ndarray, k_state: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Separate the durable trait from transient state (WI-5). The model is

        φ = Wᵀ z + V m + ε,   m ~ N(0, diag Σ_m) fresh per message,

    so marginalizing the per-message state m turns it into *structured* extra measurement
    covariance: φ ~ N(Wᵀ z, V diag(Σ_m) Vᵀ + diag(Ψ)). Given the trait residual
    `residual = Φ_centered − Z W` (the feature variation NOT explained by the named traits),
    the top-k principal directions of its covariance are the structured transient directions
    V (mood / fatigue / who they're talking to); the leftover per-feature variance is the iid
    noise Ψ. In the directions V spans, noise is large, so one-off fluctuations there don't
    move the trait z.

    Returns (V: (F, k), Σ_m: (k,), Ψ: (F,)).
    """
    N, F = residual.shape
    k_state = max(0, min(int(k_state), F))
    Cov = (residual.T @ residual) / max(1, N)
    if k_state == 0:
        return np.zeros((F, 0)), np.zeros(0), np.maximum(np.diag(Cov), _PSI_FLOOR)
    vals, vecs = np.linalg.eigh(Cov)                     # ascending
    order = np.argsort(-vals)[:k_state]
    V = np.ascontiguousarray(vecs[:, order])             # (F, k) structured state directions
    Sigma_m = np.maximum(vals[order], 0.0)               # variance along each state direction
    explained = (V * Sigma_m) @ V.T                      # V diag(Σ_m) Vᵀ
    Psi = np.maximum(np.diag(Cov) - np.diag(explained), _PSI_FLOOR)
    return V, Sigma_m, Psi
