"""Persona posterior — §9.2.

We maintain a *distribution* over who the user is, not a point estimate:

    q(z | H) = N(mu, diag(var)),   z in R^8 (the persona axes)

Prior z ~ N(mu0, Σ0) with Σ0 large (high initial uncertainty everywhere). Each observed
behavior is treated as a noisy linear measurement of z, and we apply the incremental
Gaussian (Kalman/Laplace-style) update that §9.2 explicitly permits as the online
alternative to re-running the amortized encoder over the whole history.

The uncertainty `var` is load-bearing: it feeds calibration (§9.5) and active learning
(§9.6). High uncertainty on an axis ⇒ the gate is cautious and BALD seeks to probe it.

A transparent featurizer maps raw signals (text style + implicit telemetry) into partial
axis evidence, so every update is inspectable: you can see *which* axis a behavior moved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
import numpy as np

from .config import HYPER
from .persona_axes import AXES, AXIS_INDEX

D = HYPER.persona_dim


@dataclass
class Posterior:
    mu: np.ndarray = field(default_factory=lambda: np.zeros(D))
    var: np.ndarray = field(default_factory=lambda: np.full(D, HYPER.prior_var))
    version: int = 0

    def copy(self) -> "Posterior":
        return Posterior(self.mu.copy(), self.var.copy(), self.version)

    def to_dict(self) -> dict:
        return {"mu": self.mu.tolist(), "var": self.var.tolist(), "version": self.version}

    @staticmethod
    def from_dict(d: dict) -> "Posterior":
        return Posterior(
            np.array(d.get("mu", np.zeros(D)), dtype=float),
            np.array(d.get("var", np.full(D, HYPER.prior_var)), dtype=float),
            int(d.get("version", 0)),
        )


def prior() -> Posterior:
    return Posterior(np.zeros(D), np.full(D, HYPER.prior_var), 0)


# ── observation update (Kalman, diagonal) ────────────────────────────────────────

def kalman_update(post: Posterior, y: np.ndarray, mask: np.ndarray, r: float) -> Posterior:
    """Apply a noisy partial measurement y of z (only where mask==1), measurement
    variance r. Per-dimension diagonal Kalman update:

        K_i   = var_i / (var_i + r)
        mu_i  = mu_i + K_i (y_i - mu_i)
        var_i = (1 - K_i) var_i

    Returns a new Posterior; var is floored at HYPER.min_var so learning can re-open.
    """
    out = post.copy()
    for i in range(D):
        if mask[i] <= 0:
            continue
        k = out.var[i] / (out.var[i] + r)
        out.mu[i] = out.mu[i] + k * (y[i] - out.mu[i])
        out.var[i] = max(HYPER.min_var, (1.0 - k) * out.var[i])
    out.mu = np.clip(out.mu, -1.0, 1.0)
    out.version = post.version + 1
    return out


def inflate(post: Posterior, axes: Optional[list[str]] = None, factor: float = 2.0) -> Posterior:
    """Re-open learning on drift (§9.7) by inflating variance (all axes, or a subset)."""
    out = post.copy()
    idxs = range(D) if axes is None else [AXIS_INDEX[a] for a in axes if a in AXIS_INDEX]
    for i in idxs:
        out.var[i] = min(HYPER.prior_var, out.var[i] * factor)
    out.version = post.version + 1
    return out


# ── signal → axis evidence featurizer ────────────────────────────────────────────

def featurize(text: str, telemetry: Optional[dict] = None) -> tuple[np.ndarray, np.ndarray, float]:
    """Map a behavior into partial persona-axis evidence.

    Returns (y, mask, r): y in [-1,1]^8 axis evidence, mask of which axes were observed,
    and measurement noise r (lower = more confident). Heuristic but transparent — this is
    the deployment featurizer; the population-level amortized encoder (the ELBO objective
    below) would refine the same mapping offline.
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


def observe(post: Posterior, text: str, telemetry: Optional[dict] = None) -> Posterior:
    """One online persona update from a single behavior (§9.8 `update persona posterior`)."""
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
    """Evidence Lower BOund for the linear-Gaussian model, for a batch of observations
    (y, mask, r). Under p(y|z) = N(Hz, rI) (H = mask-selected identity) and prior
    N(mu0, Σ0):

        L = E_q[ Σ_i log p(y_i | z) ] − KL( q || prior )

    The expectation under q=N(mu,var) of the Gaussian log-likelihood has a closed form;
    we include it so the objective in §9.2 is concrete and testable, not just asserted.
    """
    mu, var = post.mu, post.var
    mu0 = np.zeros(D)
    var0 = np.full(D, HYPER.prior_var)

    # E_q[log p(y|z)] for each masked dimension: -0.5/r * ((y-mu)^2 + var) - 0.5 log(2πr)
    ll = 0.0
    for y, mask, r in evidence:
        for i in range(D):
            if mask[i] <= 0:
                continue
            ll += -0.5 / r * ((y[i] - mu[i]) ** 2 + var[i]) - 0.5 * np.log(2 * np.pi * r)

    # KL( N(mu,var) || N(mu0,var0) ) for diagonal Gaussians.
    kl = 0.0
    for i in range(D):
        kl += 0.5 * (
            np.log(var0[i] / var[i]) + (var[i] + (mu[i] - mu0[i]) ** 2) / var0[i] - 1.0
        )
    return float(ll - kl)
