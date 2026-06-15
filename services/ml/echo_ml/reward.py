"""Reward model — §9.4 (inverse RL / preference learning).

Recovers *why* the user chooses, so the agent can generalize as the user would *want*
("best you", not "average you"). r_φ(s,a) is a small MLP head on the shared embedding of
(s,a). Trained from:

  • Bradley-Terry preference loss over (chosen ≻ rejected) pairs:
        P(a+ ≻ a-) = σ( r(s,a+) − r(s,a-) )
        L_R = − Σ log σ( r(s,a+) − r(s,a-) )
  • a supervised anchor from ground-truth meeting outcomes y∈{0,1}:
        L_R += λ_out · BCE( σ(r(s,a_taken)), y )

Per-user params are tiny and stored in reward_model_state. No per-user LLM training.
Gradients are derived by hand so the loss is exactly the one specified.
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from .config import HYPER, SETTINGS


def _sigmoid(x: float) -> float:
    # numerically stable
    if x >= 0:
        z = np.exp(-x)
        return float(1.0 / (1.0 + z))
    z = np.exp(x)
    return float(z / (1.0 + z))


@dataclass
class RewardModel:
    W1: np.ndarray
    b1: np.ndarray
    W2: np.ndarray
    b2: float
    version: int = 0

    @staticmethod
    def init(dim: int = None, hidden: int = None, seed: int = 0) -> "RewardModel":
        dim = dim or SETTINGS.embed_dim
        hidden = hidden or HYPER.reward_hidden
        rng = np.random.default_rng(seed)
        # Small init so the model starts near r≈0 (uninformative).
        W1 = rng.normal(0, 0.1, size=(hidden, dim))
        b1 = np.zeros(hidden)
        W2 = rng.normal(0, 0.1, size=hidden)
        return RewardModel(W1, b1, W2, 0.0, 0)

    # ── forward / backward ──────────────────────────────────────────────────────
    def _forward(self, x: np.ndarray):
        h_pre = self.W1 @ x + self.b1
        h = np.maximum(0.0, h_pre)
        r = float(self.W2 @ h + self.b2)
        return r, (x, h_pre, h)

    def reward(self, x: np.ndarray) -> float:
        return self._forward(x)[0]

    def _grad(self, cache, dr: float):
        """Backprop dL/dr through the head → parameter gradients."""
        x, h_pre, h = cache
        gW2 = dr * h
        gb2 = dr
        dh = dr * self.W2
        dh_pre = dh * (h_pre > 0)
        gW1 = np.outer(dh_pre, x)
        gb1 = dh_pre
        return gW1, gb1, gW2, gb2

    def _apply(self, g, lr: float):
        gW1, gb1, gW2, gb2 = g
        # L2 regularization (weight decay).
        self.W1 -= lr * (gW1 + HYPER.l2 * self.W1)
        self.b1 -= lr * gb1
        self.W2 -= lr * (gW2 + HYPER.l2 * self.W2)
        self.b2 -= lr * gb2

    # ── losses / training ───────────────────────────────────────────────────────
    def pair_loss(self, x_pos: np.ndarray, x_neg: np.ndarray) -> float:
        rp, _ = self._forward(x_pos)
        rn, _ = self._forward(x_neg)
        d = rp - rn
        p = _sigmoid(d)
        return float(-np.log(max(p, 1e-12)))

    def step_pair(self, x_pos: np.ndarray, x_neg: np.ndarray, lr: float = None) -> float:
        """One SGD step on the Bradley-Terry loss for a single preference pair."""
        lr = lr or HYPER.reward_lr
        rp, cp = self._forward(x_pos)
        rn, cn = self._forward(x_neg)
        d = rp - rn
        p = _sigmoid(d)
        # dL/dd = σ(d) − 1 ; dr+ = dL/dd, dr- = −dL/dd
        dLdd = p - 1.0
        gp = self._grad(cp, dLdd)
        gn = self._grad(cn, -dLdd)
        self._apply(gp, lr)
        self._apply(gn, lr)
        self.version += 1
        return float(-np.log(max(p, 1e-12)))

    def step_outcome(self, x: np.ndarray, y: float, lr: float = None) -> float:
        """One SGD step on the supervised outcome anchor: BCE(σ(r(x)), y), weighted by
        λ_out. y is the ground-truth meeting outcome (occurred & positive = 1)."""
        lr = lr or HYPER.reward_lr
        r, cache = self._forward(x)
        p = _sigmoid(r)
        # dBCE/dr = (p − y)
        dr = HYPER.lambda_outcome * (p - y)
        self._apply(self._grad(cache, dr), lr)
        self.version += 1
        eps = 1e-12
        return float(-(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)) * HYPER.lambda_outcome)

    def fit(self, pairs, outcomes=None, epochs: int = 5, lr: float = None) -> float:
        """Batch fit over pairs [(x_pos, x_neg)] and outcomes [(x, y)]. Returns final loss."""
        last = 0.0
        for _ in range(epochs):
            tot = 0.0
            for xp, xn in pairs:
                tot += self.step_pair(xp, xn, lr)
            for x, y in outcomes or []:
                tot += self.step_outcome(x, y, lr)
            last = tot
        return last

    # ── persistence ─────────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            "W1": self.W1.tolist(),
            "b1": self.b1.tolist(),
            "W2": self.W2.tolist(),
            "b2": self.b2,
            "version": self.version,
        }

    @staticmethod
    def from_dict(d: dict) -> "RewardModel":
        return RewardModel(
            np.array(d["W1"]), np.array(d["b1"]), np.array(d["W2"]), float(d["b2"]),
            int(d.get("version", 0)),
        )
