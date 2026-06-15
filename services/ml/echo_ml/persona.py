"""Persona posterior — §9.2.

We maintain a *distribution* over who the user is, not a point estimate:

    q(z | H) = N(mu, Sigma),   z in R^8 (the persona axes)

Prior z ~ N(mu0, Σ0) with Σ0 large (high initial uncertainty everywhere). Each observed
behavior is treated as a noisy *linear* measurement of z

    φ = W z + ε,   ε ~ N(0, Ψ)

and we apply the general linear-Gaussian (Kalman/Laplace-style) conditioning step that
§9.2 explicitly permits as the online alternative to re-running the amortized encoder over
the whole history. The loading matrix W is hand-set here only for the legacy diagonal
featurizer; WI-2 replaces it with a *learned* measurement matrix (see persona_model.py).

The covariance Σ is full (not diagonal): real persona axes co-move (warmth↔affect,
dominance↔formality), and the cross-terms are load-bearing for calibration (§9.5), active
learning (§9.6), and the learned W (WI-2). A `var` property exposes diag(Σ) so every
existing per-axis caller (decode_traits, observability, BALD) keeps working unchanged.

A transparent featurizer maps raw signals (text style + implicit telemetry) into partial
axis evidence, so every update is inspectable: you can see *which* axis a behavior moved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
import math
import numpy as np

from .config import HYPER, SETTINGS
from .persona_axes import AXES, AXIS_INDEX
from .embeddings import embed
from .stylometry import stylometry_features, STYLOMETRY_FEATURE_NAMES

D = HYPER.persona_dim


# ── numerical helpers ─────────────────────────────────────────────────────────────

def _symmetrize(M: np.ndarray) -> np.ndarray:
    return 0.5 * (M + M.T)


def _floor_eigs(M: np.ndarray, floor: float) -> np.ndarray:
    """Project a symmetric matrix onto {symmetric PSD with eigenvalues ≥ floor}.

    eig-decompose Σ = V Λ Vᵀ, clamp Λ ≥ floor, reconstruct. Guarantees Σ stays symmetric
    positive-definite so a bucket can always re-open on drift (no axis collapses to a
    delta) and Cholesky/Mahalanobis math downstream never fails.
    """
    M = _symmetrize(M)
    vals, vecs = np.linalg.eigh(M)
    vals = np.maximum(vals, floor)
    out = (vecs * vals) @ vecs.T
    return _symmetrize(out)


def gaussian_kl(mu1: np.ndarray, Sigma1: np.ndarray,
                mu2: np.ndarray, Sigma2: np.ndarray) -> float:
    """KL( N(mu1,Σ1) ‖ N(mu2,Σ2) ) for full-covariance multivariate Gaussians:

        KL = ½ [ tr(Σ2⁻¹ Σ1) + (μ2−μ1)ᵀ Σ2⁻¹ (μ2−μ1) − k + ln(detΣ2 / detΣ1) ]

    Accepts 1-D arrays as shorthand for a diagonal covariance. Always ≥ 0; exactly 0 for
    identical Gaussians. (Clamped at 0 to absorb float round-off.)
    """
    mu1 = np.asarray(mu1, dtype=float).reshape(-1)
    mu2 = np.asarray(mu2, dtype=float).reshape(-1)
    S1 = np.asarray(Sigma1, dtype=float)
    S2 = np.asarray(Sigma2, dtype=float)
    if S1.ndim == 1:
        S1 = np.diag(S1)
    if S2.ndim == 1:
        S2 = np.diag(S2)
    k = mu1.shape[0]
    diff = mu2 - mu1
    tr = np.trace(np.linalg.solve(S2, S1))
    quad = float(diff @ np.linalg.solve(S2, diff))
    _, logdet1 = np.linalg.slogdet(S1)
    _, logdet2 = np.linalg.slogdet(S2)
    kl = 0.5 * (tr + quad - k + (logdet2 - logdet1))
    return float(max(0.0, kl))


# ── posterior ─────────────────────────────────────────────────────────────────────

@dataclass
class Posterior:
    mu: np.ndarray = field(default_factory=lambda: np.zeros(D))
    Sigma: np.ndarray = field(default_factory=lambda: np.eye(D) * HYPER.prior_var)
    version: int = 0

    def __post_init__(self):
        # Keep mu a writable float array and Σ a C-contiguous float matrix so the `var`
        # property below can hand out a *writable* view of the diagonal (legacy callers
        # do `post.var[i] = x`). A diagonal Σ stored as a 1-D array is promoted to a
        # full matrix for backward compatibility with old in-memory state.
        self.mu = np.asarray(self.mu, dtype=float)
        Sigma = np.asarray(self.Sigma, dtype=float)
        if Sigma.ndim == 1:
            Sigma = np.diag(Sigma)
        self.Sigma = np.ascontiguousarray(Sigma)

    @property
    def var(self) -> np.ndarray:
        """Per-axis marginal variance diag(Σ), as a *writable* strided view into Σ so the
        legacy idiom `post.var[i] = x` still sets Σ[i,i]. Reading behaves like np.diag(Σ)."""
        return self.Sigma.reshape(-1)[:: D + 1]

    def copy(self) -> "Posterior":
        return Posterior(self.mu.copy(), self.Sigma.copy(), self.version)

    def to_dict(self) -> dict:
        return {"mu": self.mu.tolist(), "Sigma": self.Sigma.tolist(), "version": self.version}

    @staticmethod
    def from_dict(d: dict) -> "Posterior":
        """Load persisted state. Accepts the new full-covariance row {mu, Sigma, version}
        OR a legacy diagonal row {mu, var, version} (var → diag(var)). Round-trips exactly."""
        mu = np.array(d.get("mu", np.zeros(D)), dtype=float)
        if d.get("Sigma") is not None:
            Sigma = np.array(d["Sigma"], dtype=float)
        elif d.get("var") is not None:
            Sigma = np.diag(np.array(d["var"], dtype=float))
        else:
            Sigma = np.eye(D) * HYPER.prior_var
        return Posterior(mu, Sigma, int(d.get("version", 0)))


def prior() -> Posterior:
    return Posterior(np.zeros(D), np.eye(D) * HYPER.prior_var, 0)


# ── observation update (general linear-Gaussian / Kalman) ─────────────────────────

def kalman_update_general(post: Posterior, phi: np.ndarray, W: np.ndarray,
                          Psi: np.ndarray) -> Posterior:
    """General linear-Gaussian conditioning step for the measurement model

        φ = W z + ε,   ε ~ N(0, Ψ)        (Ψ diagonal-as-1D or full matrix)

    with the standard Kalman equations

        innovation     ỹ = φ − W μ
        innovation cov S = W Σ Wᵀ + Ψ
        gain           K = Σ Wᵀ S⁻¹
        mean           μ' = μ + K ỹ
        covariance     Σ' = (I − K W) Σ (I − K W)ᵀ + K Ψ Kᵀ   (Joseph form, PSD-stable)

    Σ' is symmetrized and its eigenvalues floored at HYPER.min_var. μ is clipped to [-1,1].
    Gains are solved (np.linalg.solve), never via an explicit inverse.
    """
    mu = post.mu
    Sigma = post.Sigma
    W = np.atleast_2d(np.asarray(W, dtype=float))
    phi = np.asarray(phi, dtype=float).reshape(-1)
    Psi = np.asarray(Psi, dtype=float)
    if Psi.ndim == 1:
        Psi = np.diag(Psi)

    y_tilde = phi - W @ mu                      # (F,)
    S = W @ Sigma @ W.T + Psi                   # (F,F) innovation covariance
    # K = Σ Wᵀ S⁻¹  ⟺  Kᵀ = solve(S, W Σ)  (S symmetric)
    K = np.linalg.solve(S, W @ Sigma).T         # (D,F)

    new_mu = mu + K @ y_tilde
    ImKW = np.eye(D) - K @ W
    new_Sigma = ImKW @ Sigma @ ImKW.T + K @ Psi @ K.T   # Joseph form
    new_Sigma = _floor_eigs(new_Sigma, HYPER.min_var)

    return Posterior(np.clip(new_mu, -1.0, 1.0),
                     np.ascontiguousarray(new_Sigma), post.version + 1)


def kalman_update(post: Posterior, y: np.ndarray, mask: np.ndarray, r: float) -> Posterior:
    """Legacy diagonal partial-measurement update, kept as a thin wrapper over the general
    path: a partial observation y of z (only where mask==1, measurement variance r) is the
    measurement model W = diag(mask), Ψ = r·I, φ = y. Behaviour is identical to the old
    per-dimension Kalman update when Σ is diagonal.
    """
    W = np.diag(np.asarray(mask, dtype=float))
    Psi = float(r) * np.eye(D)
    return kalman_update_general(post, np.asarray(y, dtype=float), W, Psi)


# ── robust observation update (WI-4): innovation gating + Student-t downweighting ─

def _norm_ppf(p: float) -> float:
    """Standard-normal inverse CDF — Acklam's rational approximation refined by one Halley
    step (via math.erfc), giving full double precision (|err| < 1e-12 across (0,1); the bare
    rational form alone is only ~5e-5 in the tails). No scipy — used only to derive the χ²_F
    gate threshold at runtime."""
    p = min(max(p, 1e-12), 1 - 1e-12)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = np.sqrt(-2 * np.log(p))
        x = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    elif p > phigh:
        q = np.sqrt(-2 * np.log(1 - p))
        x = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    else:
        q = p - 0.5
        r = q * q
        x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
    # One Halley refinement step: e = Φ(x) − p, then x ← x − u/(1 + x·u/2), u = e·√(2π)·e^{x²/2}.
    e = 0.5 * math.erfc(-x / math.sqrt(2)) - p
    u = e * math.sqrt(2 * math.pi) * math.exp(x * x / 2)
    return float(x - u / (1 + x * u / 2))


def chi2_quantile(p: float, df: int) -> float:
    """χ²_df quantile at probability p via the Wilson–Hilferty normal approximation:
        χ²_df(p) ≈ df · (1 − 2/(9df) + z_p·√(2/(9df)))³ .
    Used to translate HYPER.mahalanobis_gate_quantile into a gate threshold scaling with F."""
    df = max(1, int(df))
    z = _norm_ppf(p)
    t = 1.0 - 2.0 / (9 * df) + z * np.sqrt(2.0 / (9 * df))
    return float(df * t ** 3)


def robust_kalman_update(post: Posterior, phi: np.ndarray, W: np.ndarray, Psi: np.ndarray,
                         nu: Optional[float] = None, gate_chi2: Optional[float] = None,
                         irls_iters: Optional[int] = None,
                         trace: Optional[dict] = None) -> Posterior:
    """Outlier-robust linear-Gaussian update (§9.8). A typo storm, an angry outburst, or a
    pasted quote should not rewrite the doppelgänger; a naive Kalman swallows outliers.

    Models the measurement noise as Student-t (a Gaussian scale mixture) and solves it by
    IRLS. Surprise is measured against the *base* predictive innovation covariance
    S₀ = W Σ Wᵀ + Ψ (a fixed reference — inflating Ψ/w inside the metric would let a true
    outlier masquerade as in-distribution and the iteration would oscillate):

        Mahalanobis distance   d² = ỹᵀ S₀⁻¹ ỹ          (ỹ = φ − W μ̂, re-linearized each sweep)
        Student-t weight       w  = min(1, (ν + F)/(ν + d²))    (downweight, never over-trust)
        effective noise        Ψ_eff = Ψ / w                    (reweight, NOT a hard reject)

    Each IRLS sweep re-solves the provisional downweighted state μ̂ from the prior and
    recomputes d²; for an atypical message μ̂ barely moves so d² stays large and w→0 — its
    influence vanishes. The final Joseph-form update uses the converged Ψ_eff. `gate_chi2`
    (a χ²_F quantile) flags the message as "surprising" in the trace; the response is always
    the soft downweight. An in-distribution message has d²≲F, w≈1 ⇒ a normal update.
    """
    nu = HYPER.student_t_nu if nu is None else nu
    irls_iters = HYPER.irls_iters if irls_iters is None else irls_iters
    W = np.atleast_2d(np.asarray(W, dtype=float))
    phi = np.asarray(phi, dtype=float).reshape(-1)
    Psi = np.asarray(Psi, dtype=float)
    if Psi.ndim == 1:
        Psi = np.diag(Psi)
    F = W.shape[0]
    if gate_chi2 is None:
        gate_chi2 = chi2_quantile(HYPER.mahalanobis_gate_quantile, F)

    Sigma = post.Sigma
    WSigWt = W @ Sigma @ W.T
    S0 = WSigWt + Psi                                     # base predictive innovation cov
    y0 = phi - W @ post.mu

    d2 = float(y0 @ np.linalg.solve(S0, y0))             # prior-predictive surprise (gate)
    surprising = bool(d2 > gate_chi2)
    w = min(1.0, (nu + F) / (nu + d2))
    for _ in range(max(0, irls_iters - 1)):              # IRLS state re-linearization
        K = np.linalg.solve(WSigWt + Psi / w, W @ Sigma).T
        mu_hat = post.mu + K @ y0
        y_hat = phi - W @ mu_hat
        d2k = float(y_hat @ np.linalg.solve(S0, y_hat))
        w = min(1.0, (nu + F) / (nu + d2k))

    if trace is not None:
        trace.update({"mahalanobis_d2": round(d2, 3), "weight": round(w, 4),
                      "gate_chi2": round(gate_chi2, 3), "surprising": surprising, "F": F})

    return kalman_update_general(post, phi, W, Psi / w)


def reliability_noise_scale(text: str, telemetry: Optional[dict] = None) -> float:
    """Heteroscedastic reliability multiplier (≥ 1) on the measurement noise Ψ (WI-4).
    Short, low-information, or heavily-edited messages are less reliable ⇒ larger noise ⇒
    a smaller posterior step. Durable signal accrues from *consistent* drift across many
    messages, never from one atypical one."""
    n = len((text or "").split())
    edits = (telemetry or {}).get("editsCount") or 0
    return 1.0 + HYPER.het_noise_short / (1.0 + n) + HYPER.het_noise_edit * float(edits)


def inflate(post: Posterior, axes: Optional[list[str]] = None, factor: float = 2.0) -> Posterior:
    """Re-open learning on drift (§9.7) by inflating covariance. For the selected axes
    (all if None) scale Σ's rows & columns by √factor — a congruence transform D Σ Dᵀ that
    multiplies each selected variance by `factor` while preserving PSD — then clamp the
    diagonal at prior_var and re-floor eigenvalues."""
    out = post.copy()
    idxs = list(range(D)) if axes is None else [AXIS_INDEX[a] for a in axes if a in AXIS_INDEX]
    s = float(np.sqrt(factor))
    Sigma = out.Sigma
    for i in idxs:
        Sigma[i, :] *= s
        Sigma[:, i] *= s
    diag = np.diag(Sigma).copy()
    np.fill_diagonal(Sigma, np.minimum(diag, HYPER.prior_var))
    out.Sigma = np.ascontiguousarray(_floor_eigs(Sigma, HYPER.min_var))
    out.version = post.version + 1
    return out


# ── signal → axis evidence featurizer ────────────────────────────────────────────

def featurize(text: str, telemetry: Optional[dict] = None) -> tuple[np.ndarray, np.ndarray, float]:
    """Map a behavior into partial persona-axis evidence.

    Returns (y, mask, r): y in [-1,1]^8 axis evidence, mask of which axes were observed,
    and measurement noise r (lower = more confident). Heuristic but transparent — this is
    the legacy deployment featurizer; WI-2/WI-3 replace it with featurize_raw + a learned W.
    """
    telemetry = telemetry or {}
    y = np.zeros(D)
    mask = np.zeros(D)

    t = (text or "").strip()
    words = t.split()
    n = len(words)

    def setv(axis: str, val: float):
        i = AXIS_INDEX[axis]
        y[i] = float(np.clip(val, -1, 1))
        mask[i] = 1

    if n > 0:
        # Energy / pace from message length.
        setv("energy", np.tanh((n - 8) / 8.0))
        # Affect from punctuation intensity.
        excl = t.count("!")
        setv("affect", np.tanh(excl - 0.2) if excl else -0.2)
        # Openness from question-asking + uncommon length variety.
        q = t.count("?")
        setv("openness", np.tanh(q * 0.6 - 0.1))
        # Formality from capitalization + lack of contractions/slang.
        contractions = sum(t.lower().count(c) for c in ["'", "lol", "haha", "u ", "gonna"])
        cap_ratio = sum(1 for ch in t if ch.isupper()) / max(1, len(t))
        setv("formality", np.tanh(cap_ratio * 4 - contractions * 0.5 - 0.3))
        # Intellect register from average word length.
        avg_len = np.mean([len(w) for w in words]) if words else 4
        setv("intellect", np.tanh((avg_len - 4.5) / 2.0))
        # Warmth from greeting / second-person engagement.
        warm_tokens = sum(t.lower().count(w) for w in ["thanks", "you", "nice", "love", "glad", "hey", "hi "])
        setv("warmth", np.tanh(warm_tokens * 0.4 - 0.2))
        # Dominance from imperatives / declaratives vs hedging.
        hedges = sum(t.lower().count(w) for w in ["maybe", "i think", "sort of", "i guess", "perhaps"])
        setv("dominance", np.tanh(-hedges * 0.5 + (1 if t.endswith(".") else 0) * 0.2))

    # Implicit telemetry overrides / adds evidence (revealed > stated, §2).
    lat = telemetry.get("latencyMs")
    if lat is not None:
        # Slow, deliberate replies ⇒ low pace; fast ⇒ high pace.
        setv("pace", float(np.tanh((1500 - lat) / 1500.0)))
    edits = telemetry.get("editsCount")
    if edits is not None and edits > 0:
        # Lots of edits ⇒ more deliberate/formal, less impulsive affect.
        i = AXIS_INDEX["formality"]
        y[i] = float(np.clip(y[i] + np.tanh(edits * 0.2), -1, 1))
        mask[i] = 1

    approach = telemetry.get("approach")
    if approach is not None:
        # Walking toward someone is warm/assertive; avoiding is cold/deferential.
        setv("warmth", 0.5 if approach else -0.5)
        setv("dominance", 0.3 if approach else -0.3)

    # Confidence: more observed axes + implicit signal ⇒ lower noise.
    observed = int(mask.sum())
    r = HYPER.obs_noise * (1.0 + 1.5 / max(1, observed))
    return y, mask, r


# ── language-independent raw featurizer (WI-3) ────────────────────────────────────
# featurize_raw produces a rich, language-agnostic feature vector φ ∈ R^F. The mapping
# φ → persona-axis evidence is NOT here — it is the *learned* measurement matrix W
# (WI-2, persona_model.py), applied via kalman_update_general. This separates measurement
# (what we observe) from calibration (how observations load on traits).

# Fixed seeded Johnson–Lindenstrauss projection embed_dim → embed_proj_dim. It preserves
# the cosine geometry of the (multilingual) semantic embedding — so Turkish and English
# paraphrases stay close — while keeping the learned W a small (D × F) matrix.
_PROJ = (np.random.default_rng(7).standard_normal((HYPER.embed_proj_dim, SETTINGS.embed_dim))
         / np.sqrt(HYPER.embed_proj_dim))

TELEMETRY_FEATURE_NAMES = ["latency_norm", "has_latency", "edits_norm", "approach"]


def _telemetry_features(telemetry: Optional[dict]) -> np.ndarray:
    """Implicit, inherently language-free signals (reply latency, edit count, approach/
    avoid). Bounded; absent signals are 0 with an explicit `has_latency` presence flag."""
    t = telemetry or {}
    lat = t.get("latencyMs")
    latency_norm = float(np.tanh((1500.0 - lat) / 1500.0)) if lat is not None else 0.0
    has_latency = 1.0 if lat is not None else 0.0
    edits = t.get("editsCount") or 0
    edits_norm = float(np.tanh(edits * 0.2))
    approach = t.get("approach")
    approach_f = 0.0 if approach is None else (1.0 if approach else -1.0)
    return np.array([latency_norm, has_latency, edits_norm, approach_f], dtype=float)


def featurize_raw(text: str, telemetry: Optional[dict] = None,
                  embedding: Optional[np.ndarray] = None,
                  length_stats: Optional[tuple[float, float]] = None) -> np.ndarray:
    """Rich, language-independent measurement vector φ ∈ R^FEATURE_DIM for one behavior:

        φ = concat( JL-projected semantic embedding,  stylometry,  telemetry )

    No axis logic and no English token lists — the semantic block comes from a multilingual
    embedder (Voyage voyage-3.5) and the rest are ratios/distributions. `embedding` may be
    passed to avoid a redundant embed() call in the hot path. Always finite.
    """
    emb = embedding if embedding is not None else embed(text or "")
    emb_proj = _PROJ @ np.asarray(emb, dtype=float)
    sty = stylometry_features(text or "", length_stats=length_stats)
    tel = _telemetry_features(telemetry)
    phi = np.concatenate([emb_proj, sty, tel])
    return np.nan_to_num(phi, nan=0.0, posinf=1.0, neginf=-1.0)


FEATURE_NAMES = ([f"emb{i}" for i in range(HYPER.embed_proj_dim)]
                 + list(STYLOMETRY_FEATURE_NAMES) + TELEMETRY_FEATURE_NAMES)
FEATURE_DIM = len(FEATURE_NAMES)   # F = embed_proj_dim + len(STYLOMETRY) + len(TELEMETRY)


def feature_names() -> list[str]:
    """Ordered names of the FEATURE_DIM raw features (for W interpretability / the UI)."""
    return list(FEATURE_NAMES)


def observe(post: Posterior, text: str, telemetry: Optional[dict] = None,
            model: Optional["object"] = None, trace: Optional[dict] = None) -> Posterior:
    """One online persona update from a single behavior (§9.8 `update persona posterior`).

    When a learned measurement model is available (committed artifact, WI-2) the update is
    the *robust* general linear-Gaussian step on the rich features φ = featurize_raw, with
    heteroscedastic reliability noise and Student-t outlier downweighting (WI-4):
        φ − μ_φ = Wᵀ z + ε  →  robust_kalman_update(post, φ−μ_φ, Wᵀ, Ψ·reliability).
    On a clean checkout with no artifact the model is *untrained* and we fall back to the
    legacy heuristic featurizer — preserving the zero-key / clean-checkout invariant.
    Pass `trace={}` to capture the gating diagnostics (Mahalanobis d², weight, surprising).
    """
    from .persona_model import get_persona_model
    model = model if model is not None else get_persona_model()
    if model is not None and getattr(model, "trained", False):
        # No information at all (empty text AND no telemetry) ⇒ no-op, matching the heuristic
        # path's mask.sum()==0 short-circuit. Telemetry-only updates (e.g. latency→pace) still
        # flow through, since their signal lives in the telemetry features of φ.
        if not (text or "").strip() and not (telemetry or {}):
            return post
        phi = featurize_raw(text, telemetry)
        W_meas, Psi = model.apply(phi)
        Psi = Psi * reliability_noise_scale(text, telemetry)   # heteroscedastic (WI-4)
        return robust_kalman_update(post, model.center(phi), W_meas, Psi, trace=trace)

    # heuristic fallback (no learned artifact)
    y, mask, r = featurize(text, telemetry)
    if mask.sum() == 0:
        return post
    return kalman_update(post, y, mask, r)


# ── decoding (for the cloning policy, §9.3) ──────────────────────────────────────

def decode_traits(post: Posterior, threshold: float = 0.33) -> list[str]:
    """Decode the latent mean into natural-language trait phrases, skipping axes the
    posterior is too uncertain about (var high) or too neutral on."""
    out: list[str] = []
    for axis in AXES:
        i = AXIS_INDEX[axis.key]
        if post.var[i] > 0.6:  # too uncertain to assert
            continue
        v = post.mu[i]
        if abs(v) < threshold:
            continue
        word = axis.pos if v > 0 else axis.neg
        intensity = "strongly " if abs(v) > 0.66 else ""
        out.append(f"{intensity}{word}")
    return out


# ── ELBO (the training objective, §9.2) ──────────────────────────────────────────

def elbo(post: Posterior, evidence: list[tuple[np.ndarray, np.ndarray, float]]) -> float:
    """Evidence Lower BOund for the linear-Gaussian model over a batch of partial
    observations (y, mask, r). With p(y|z) = N(Hz, rI) (H = diag(mask)) and prior
    N(0, prior_var·I):

        L = E_q[ Σ_i log p(y_i | z) ] − KL( q ‖ prior )

    The Gaussian expectation under q = N(μ, Σ) is closed-form; the per-dim likelihood uses
    Σ_ii = var_i, and the KL is the full-covariance gaussian_kl above (≡ the diagonal sum
    when Σ is diagonal). A concrete, testable objective — not asserted in the hot path.
    """
    mu = post.mu
    var = post.var
    ll = 0.0
    for y, mask, r in evidence:
        for i in range(D):
            if mask[i] <= 0:
                continue
            ll += -0.5 / r * ((y[i] - mu[i]) ** 2 + var[i]) - 0.5 * np.log(2 * np.pi * r)

    Sigma0 = np.eye(D) * HYPER.prior_var
    kl = gaussian_kl(mu, post.Sigma, np.zeros(D), Sigma0)
    return float(ll - kl)
