"""Autonomy gate — §9.5.

Decides, per candidate agent action, whether to ACT autonomously, ASK the human, or run
in COPILOT. Three ingredients:

1. Calibration. Raw policy confidence p is overconfident → temperature-scale it:
       p̂ = σ( logit(p) / T )
   T is fit on held-out agreement data; we track Expected Calibration Error (ECE).

2. Cost-aware decision rule. With C_wrong(c), V_act(c), U_ask:
       act iff  p̂·V_act − (1−p̂)·C_wrong ≥ U_ask
            ⟺  p̂ ≥ τ(c),  τ(c) = (C_wrong + U_ask)/(V_act + C_wrong)
   High stakes ⇒ high τ ⇒ rarely autonomous.

3. Explore/exploit. Where acting is low-stakes and yields learning value, add a Thompson
   sample from a per-bucket Beta posterior of agreement. NEVER explore in high-stakes
   (hard constraint).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
import numpy as np

from .config import HYPER

Decision = Literal["auto", "ask", "copilot"]

# Stakes → (C_wrong, V_act). U_ask is shared. Irreversible ⇒ effectively infinite cost.
STAKES_COST = {
    "low": (1.0, 1.0),
    "medium": (4.0, 1.2),
    "high": (20.0, 1.5),
    "irreversible": (1e6, 2.0),
}


def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return float(np.log(p / (1 - p)))


def _sigmoid(x: float) -> float:
    return float(1.0 / (1.0 + np.exp(-x)))


def calibrate(p: float, temperature: float) -> float:
    """Temperature scaling: p̂ = σ(logit(p)/T)."""
    return _sigmoid(_logit(p) / max(temperature, 1e-3))


def threshold(stakes: str, u_ask: float = None) -> float:
    """τ(c) = (C_wrong + U_ask)/(V_act + C_wrong)."""
    u_ask = HYPER.u_ask if u_ask is None else u_ask
    c_wrong, v_act = STAKES_COST.get(stakes, STAKES_COST["medium"])
    return (c_wrong + u_ask) / (v_act + c_wrong)


@dataclass
class GateResult:
    decision: Decision
    p_hat: float
    tau: float
    explored: bool
    stakes: str


def decide(
    p: float,
    stakes: str,
    level: str,
    temperature: float = None,
    beta_params: tuple[float, float] = None,
    rng: np.random.Generator = None,
) -> GateResult:
    """Full gate decision.

    level: the bucket's current autonomy level (§9.7). Only an `auto` bucket may act
    autonomously; `supervised` acts-but-reviewable (treated as auto here, the human can
    veto post-hoc); `copilot` always routes to the human.
    """
    temperature = HYPER.temperature_init if temperature is None else temperature
    p_hat = calibrate(p, temperature)
    tau = threshold(stakes)

    explored = False
    score = p_hat
    # Thompson exploration only where it's safe and there's something to learn.
    if stakes in ("low", "medium") and beta_params is not None:
        rng = rng or np.random.default_rng()
        a, b = beta_params
        sample = float(rng.beta(max(a, 1e-3), max(b, 1e-3)))
        # Use the optimistic of (calibrated p, sampled agreement) to encourage probing
        # uncertain-but-low-stakes actions.
        score = max(p_hat, sample)
        explored = score > p_hat + 1e-9

    if level == "copilot":
        return GateResult("copilot", p_hat, tau, explored, stakes)

    if score >= tau:
        decision: Decision = "auto" if level == "auto" else "ask"
        # supervised acts but is surfaced for review → we model that as "ask" producing a
        # label, unless the bucket is fully promoted to auto.
        if level == "supervised":
            decision = "auto"  # acts; review handled downstream (§10 "that wasn't me")
        return GateResult(decision, p_hat, tau, explored, stakes)

    return GateResult("ask", p_hat, tau, explored, stakes)


# ── calibration fitting + ECE ────────────────────────────────────────────────────

def fit_temperature(confidences: list[float], correct: list[int], grid=None) -> float:
    """Fit temperature T by minimizing NLL of agreement labels over a 1-D grid. Returns
    the T that best calibrates raw confidences to observed agreement."""
    if not confidences:
        return HYPER.temperature_init
    # Lower bound 0.1 lets calibration express high confidence when the agent is
    # consistently right (drives down ECE so a well-behaved bucket can promote).
    grid = grid if grid is not None else np.linspace(0.1, 5.0, 60)
    best_t, best_nll = HYPER.temperature_init, float("inf")
    for t in grid:
        nll = 0.0
        for p, y in zip(confidences, correct):
            ph = calibrate(p, float(t))
            ph = min(max(ph, 1e-6), 1 - 1e-6)
            nll -= y * np.log(ph) + (1 - y) * np.log(1 - ph)
        if nll < best_nll:
            best_nll, best_t = nll, float(t)
    return best_t


def expected_calibration_error(confidences: list[float], correct: list[int], bins: int = 10) -> float:
    """ECE: weighted average gap between confidence and accuracy across probability bins."""
    if not confidences:
        return 1.0
    conf = np.array(confidences)
    acc = np.array(correct, dtype=float)
    n = len(conf)
    ece = 0.0
    edges = np.linspace(0, 1, bins + 1)
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (conf > lo) & (conf <= hi) if i > 0 else (conf >= lo) & (conf <= hi)
        if mask.sum() == 0:
            continue
        bin_conf = conf[mask].mean()
        bin_acc = acc[mask].mean()
        ece += (mask.sum() / n) * abs(bin_conf - bin_acc)
    return float(ece)
