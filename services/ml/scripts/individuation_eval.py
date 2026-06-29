"""Individuation eval (world-design deliverable #6) — runnable, zero-keys, offline.

Proves the brief's core claim: two synthetic personas with *equal axis-averages* but
*different conditional signatures* come out **distinguishable** through the REAL engine
(``featurize_raw`` → ``observe`` → robust Kalman ``Posterior``), while a non-conditional
(pooled) readout cannot tell them apart.

Why per-context buckets. The feature vector ``phi`` is context-blind by design (the engine
marginalizes context out of a single posterior). A *conditional signature* — "warm to
friends, cold to strangers; bold with high stakes, timid with low" — is therefore read by
maintaining one ``Posterior`` per context value and comparing them. This mirrors how
``autonomy.py`` already keeps a per-context bucket.

The two personas (matching ``docs/world-design/individuation-eval.md``):
  • P — conditional: warm to friends / cold to strangers; bold at high stakes / timid at low.
  • Q — uniformly mild: identical mild behavior in every context.
Over equal exposure their *marginal* means coincide (the perturbations are symmetric about
zero), so only the conditional structure separates them.

Run:  ./.venv/bin/python scripts/individuation_eval.py
Exit code 0 on PASS, 1 on FAIL. Uses no API keys (hash-mock embeddings).
"""
from __future__ import annotations

import os
import sys

# Allow `python scripts/individuation_eval.py` from services/ml without PYTHONPATH games.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np

from echo_ml import persona as P
from echo_ml.persona_model import PersonaModel, anchor_alignment
from echo_ml.persona_axes import AXIS_KEYS, AXIS_INDEX

FIXED_TEXT = "act"  # identical for every observation ⇒ semantic/stylometry block centers out
WARMTH = AXIS_INDEX["warmth"]
DOMINANCE = AXIS_INDEX["dominance"]


def _sig(x: np.ndarray | float) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.asarray(x, dtype=float)))


def tel_from_z(z: np.ndarray) -> dict:
    """Planted, monotonic, symmetric-about-zero map from an axis-space target z∈R^8 to a
    telemetry dict the real featurizer reads. Sigmoid/odd-tanh keep it symmetric so that the
    average of a +δ and −δ perturbation on any single axis equals the neutral (z=0) behavior
    feature-for-feature — which is what makes the two personas' *marginal* means coincide."""
    w, dom, op, en, fo, intel, pa, af = (float(v) for v in z)
    return {
        "ts_social": float(_sig(w)),
        "pet_attach": float(_sig(0.6 * w + 0.6 * af)),
        "solitude_tol": float(_sig(-0.5 * w + 0.4 * op)),
        "risk_index": float(_sig(dom)),
        "save_rate": float(_sig(0.7 * dom + 0.5 * intel)),
        "persistence": float(_sig(0.3 * dom + 0.6 * fo)),
        "ts_earn": float(_sig(en)),
        "ts_build": float(_sig(0.6 * en + 0.4 * fo)),
        "ts_learn": float(_sig(0.6 * op + 0.6 * intel)),
        "ts_leisure": float(_sig(-0.4 * en + 0.3 * af)),
        "consistency": float(_sig(fo)),
        "editsCount": float(np.clip(round(3 * _sig(fo) + 2 * _sig(-af)), 0, 10)),
        "latencyMs": float(np.clip(1500 - 1100 * np.tanh(pa), 50, 4000)),
        "decision_latency": float(np.clip(2200 - 1600 * np.tanh(pa), 50, 5000)),
    }


def build_model(seed: int = 0, n: int = 1500, ridge: float = 1e-2) -> PersonaModel:
    """Fit a deterministic measurement model with the REAL ``anchor_alignment`` so the
    telemetry→axis loading is known. Training features come from the REAL ``featurize_raw``
    on the same FIXED_TEXT, so the eval exercises the production feature path."""
    rng = np.random.default_rng(seed)
    Z = rng.standard_normal((n, P.D))                       # axis-space labels ~ N(0, I)
    Phi = np.array([P.featurize_raw(FIXED_TEXT, tel_from_z(Z[i])) for i in range(n)])
    mu_phi = Phi.mean(axis=0)
    W, Psi = anchor_alignment(Phi - mu_phi, Z, ridge=ridge)
    Psi = np.maximum(Psi, 1e-2)                             # condition the innovation cov
    return PersonaModel(W=W, mu_phi=mu_phi, Psi=Psi,
                        feature_names=P.feature_names(), axis_keys=list(AXIS_KEYS),
                        trained=True)


def _emit(post, model, z_target, rng, jitter=0.15):
    z = np.asarray(z_target, dtype=float) + rng.normal(0.0, jitter, size=P.D)
    return P.observe(post, FIXED_TEXT, tel_from_z(z), model=model)


def run_persona(model, conditional: bool, seed: int, n_per_bucket: int = 60):
    """Drive one persona through social (counterpart) and economic (stakes) contexts,
    keeping a Posterior per context value plus a pooled Posterior."""
    rng = np.random.default_rng(seed)
    buckets = {k: P.prior() for k in ("friend", "stranger", "high", "low")}
    pooled = P.prior()
    DELTA = 1.3

    for _ in range(n_per_bucket):
        # social interactions — counterpart conditions warmth (only if `conditional`)
        for ctx, sign in (("friend", +1.0), ("stranger", -1.0)):
            z = np.zeros(P.D)
            if conditional:
                z[WARMTH] = sign * DELTA
            buckets[ctx] = _emit(buckets[ctx], model, z, rng)
            pooled = _emit(pooled, model, z, rng)
        # economic interactions — stakes condition dominance (only if `conditional`)
        for ctx, sign in (("high", +1.0), ("low", -1.0)):
            z = np.zeros(P.D)
            if conditional:
                z[DOMINANCE] = sign * DELTA
            buckets[ctx] = _emit(buckets[ctx], model, z, rng)
            pooled = _emit(pooled, model, z, rng)

    sig_counterpart = buckets["friend"].mu - buckets["stranger"].mu
    sig_stakes = buckets["high"].mu - buckets["low"].mu
    signature = np.concatenate([sig_counterpart, sig_stakes])
    return {
        "buckets": buckets, "pooled": pooled,
        "sig_counterpart": sig_counterpart, "sig_stakes": sig_stakes,
        "signature": signature,
    }


def outlier_robustness(model, seed: int = 7, n: int = 60) -> dict:
    """One dramatic out-of-character act must barely move a converged posterior (Student-t)."""
    rng = np.random.default_rng(seed)
    post = P.prior()
    for _ in range(n):                                   # converge to a 'cold' disposition
        post = _emit(post, model, np.array([-1.3] + [0.0] * (P.D - 1)), rng)
    before = float(post.mu[WARMTH])
    post = P.observe(post, FIXED_TEXT, tel_from_z(np.array([+3.0] + [0.0] * (P.D - 1))), model=model)
    after = float(post.mu[WARMTH])
    return {"before": before, "after": after, "shift": abs(after - before)}


def run_eval(seed: int = 0, n_per_bucket: int = 60) -> dict:
    model = build_model(seed=seed)
    p = run_persona(model, conditional=True, seed=seed + 1, n_per_bucket=n_per_bucket)
    q = run_persona(model, conditional=False, seed=seed + 2, n_per_bucket=n_per_bucket)

    pooled_dist = float(np.linalg.norm(p["pooled"].mu - q["pooled"].mu))
    sig_norm_p = float(np.linalg.norm(p["signature"]))
    sig_norm_q = float(np.linalg.norm(q["signature"]))
    separation = float(np.linalg.norm(p["signature"] - q["signature"]))
    warmth_gap_p = float(p["sig_counterpart"][WARMTH])
    warmth_gap_q = float(q["sig_counterpart"][WARMTH])
    dom_gap_p = float(p["sig_stakes"][DOMINANCE])
    dom_gap_q = float(q["sig_stakes"][DOMINANCE])
    robo = outlier_robustness(model, seed=seed + 3)

    # Pass criteria (brief §11): equal marginals, P has conditional structure, Q is flat,
    # the signatures separate, and a single outlier barely moves a converged posterior.
    checks = {
        "marginal_means_equal (pooled_dist < 0.20)": pooled_dist < 0.20,
        "P_has_conditional_signature (||sig_P|| > 0.60)": sig_norm_p > 0.60,
        "Q_is_flat (||sig_Q|| < 0.25)": sig_norm_q < 0.25,
        "signatures_separate (||sig_P - sig_Q|| > 0.50)": separation > 0.50,
        "P_warm_to_friends_cold_to_strangers (gap > 0.40)": warmth_gap_p > 0.40,
        "P_bold_high_timid_low (gap > 0.40)": dom_gap_p > 0.40,
        "outlier_robust (single-act shift < 0.15)": robo["shift"] < 0.15,
    }
    passed = all(checks.values())
    return {
        "passed": passed, "checks": checks,
        "pooled_dist": pooled_dist, "sig_norm_p": sig_norm_p, "sig_norm_q": sig_norm_q,
        "separation": separation,
        "warmth_gap_p": warmth_gap_p, "warmth_gap_q": warmth_gap_q,
        "dom_gap_p": dom_gap_p, "dom_gap_q": dom_gap_q,
        "outlier": robo,
        "p": p, "q": q,
    }


def _fmt_axes(v: np.ndarray) -> str:
    return "  ".join(f"{k}={v[i]:+.2f}" for i, k in enumerate(AXIS_KEYS))


def format_report(r: dict) -> str:
    L = []
    L.append("=" * 78)
    L.append("ECHO INDIVIDUATION EVAL — equal averages, different conditionals")
    L.append("=" * 78)
    L.append("")
    L.append("Persona P (conditional): warm→friends / cold→strangers; bold→high / timid→low")
    L.append("Persona Q (uniform):     identical mild behavior in every context")
    L.append("")
    L.append("-- MARGINAL (pooled) posterior means — should be ~EQUAL --------------------")
    L.append(f"  P pooled: {_fmt_axes(r['p']['pooled'].mu)}")
    L.append(f"  Q pooled: {_fmt_axes(r['q']['pooled'].mu)}")
    L.append(f"  ||P_pooled - Q_pooled|| = {r['pooled_dist']:.3f}   (a pooled readout CANNOT separate them)")
    L.append("")
    L.append("-- CONDITIONAL signatures — should DIFFER ----------------------------------")
    L.append(f"  P  friend−stranger: {_fmt_axes(r['p']['sig_counterpart'])}")
    L.append(f"  Q  friend−stranger: {_fmt_axes(r['q']['sig_counterpart'])}")
    L.append(f"  P  high−low stakes: {_fmt_axes(r['p']['sig_stakes'])}")
    L.append(f"  Q  high−low stakes: {_fmt_axes(r['q']['sig_stakes'])}")
    L.append("")
    L.append(f"  ||signature_P|| = {r['sig_norm_p']:.3f}   ||signature_Q|| = {r['sig_norm_q']:.3f}")
    L.append(f"  separation ||sig_P - sig_Q|| = {r['separation']:.3f}")
    L.append(f"  warmth gap  P={r['warmth_gap_p']:+.3f}  Q={r['warmth_gap_q']:+.3f}")
    L.append(f"  dominance gap  P={r['dom_gap_p']:+.3f}  Q={r['dom_gap_q']:+.3f}")
    L.append("")
    L.append("-- OUTLIER ROBUSTNESS (Student-t) ------------------------------------------")
    o = r["outlier"]
    L.append(f"  converged warmth={o['before']:+.3f} → after one +3σ warm act={o['after']:+.3f}"
             f"  (shift {o['shift']:.3f})")
    L.append("")
    L.append("-- CHECKS ------------------------------------------------------------------")
    for name, ok in r["checks"].items():
        L.append(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    L.append("")
    L.append(f"RESULT: {'PASS ✅' if r['passed'] else 'FAIL ❌'}")
    L.append("=" * 78)
    return "\n".join(L)


if __name__ == "__main__":
    report = run_eval()
    print(format_report(report))
    sys.exit(0 if report["passed"] else 1)
