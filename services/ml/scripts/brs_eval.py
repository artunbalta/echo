#!/usr/bin/env python
"""BRS — the Behavioral Reproduction Score (blueprint II.3 / IX.3; the ★ P5 north-star).

Faithfulness = can the echo predict the person's NEXT CHOICE on held-out situations,
scored PER CONTEXT BUCKET (conditional-signature fidelity — Invariant 5 written into the
metric: a model that matches someone's average but misses their warm-to-friends /
cold-to-strangers slope is a bad echo and must score badly here).

Harness (deterministic, key-free, exit 0 = PASS):

  * Uses the COMMITTED measurement artifact (echo_ml/artifacts/measurement.npz) — the real
    deployed W — so the number grades what actually ships.
  * Persona P is CONDITIONAL: saves the seed on lean days / spends on plenty; wagers risky
    in private / safe when watched; explores novel ground when alone / stays put when
    observed (the P5 openness block is graded too).
  * Persona Q is UNIFORM (no conditional structure) — the control.
  * Each bucket's posterior is fed n_train choices through the REAL persona.observe path,
    then the last k_test choices are held out and predicted from the posterior mean:
    the candidate whose feature vector has the smaller Psi-weighted residual to z@W wins.

Checks:
  * P per-bucket BRS from the CONDITIONAL posteriors is high (the echo reproduces the
    person where the person lives — in the conditionals);
  * P scored from the POOLED posterior alone drops toward chance (a marginal model cannot
    reproduce a conditional person — why buckets exist);
  * Q: pooled and conditional score alike (no slope to find — no fake advantage).

Run:  ./.venv/bin/python scripts/brs_eval.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from echo_ml import persona as P
from echo_ml.persona_axes import AXIS_KEYS
from echo_ml.persona_model import get_persona_model

# ── the three conditioned forks: (bucket_a, bucket_b, choice_a_tele, choice_b_tele) ────
FORKS = {
    "grain": {
        "buckets": ("scarcity:lean", "scarcity:plenty"),
        # A constant neutral latencyMs in every row: absent latency otherwise reads as a huge
        # below-mean deviation that contaminates pace and drowns the weak fork contrast (a
        # controlled experiment holds confounds fixed).
        "choices": {
            "save": {"save_rate": 1.0, "decision_latency": 1200, "latencyMs": 900},
            "spend": {"save_rate": 0.0, "decision_latency": 500, "latencyMs": 900},
        },
        # P's policy: lean -> save, plenty -> spend.
        "policy_P": {"scarcity:lean": "save", "scarcity:plenty": "spend"},
    },
    "wager": {
        "buckets": ("privacy:private", "privacy:public"),
        "choices": {
            "risky": {"risk_index": 0.9, "latencyMs": 900},
            "safe": {"risk_index": 0.1, "latencyMs": 900},
        },
        "policy_P": {"privacy:private": "risky", "privacy:public": "safe"},
    },
    "explore": {
        "buckets": ("audience:alone", "audience:watched"),
        "choices": {
            "roam": {"novel_tile_ratio": 0.8, "path_tortuosity": 4.0, "latencyMs": 900},
            "stay": {"novel_tile_ratio": 0.05, "path_tortuosity": 1.1, "latencyMs": 900},
        },
        "policy_P": {"audience:alone": "roam", "audience:watched": "stay"},
    },
}

N_TRAIN = 40
K_TEST = 20


def choice_of(persona: str, fork: dict, bucket: str, rng: np.random.Generator) -> str:
    names = list(fork["choices"].keys())
    if persona == "P":
        return fork["policy_P"][bucket]
    return names[int(rng.random() < 0.5)]  # Q: a fair coin, context-blind


def predict(model, mu: np.ndarray, fork: dict) -> str:
    """The echo's next-choice prediction from a posterior mean: which candidate does the
    posterior's implied measurement z @ W LEAN toward, along the (Psi-weighted) direction
    that separates the two choices? Relative to the neutral prior (z=0 -> lean 0), not to
    an absolute midpoint: the 8-dim latent reconstructs feature DIRECTIONS, never extreme
    magnitudes (shrinkage), so an absolute-distance rule is biased toward the low-signal
    candidate. The sign of the lean is exactly the Bradley-Terry readout of the choice."""
    implied = mu @ model.W  # (F,) expected centered features
    (name_a, tele_a), (name_b, tele_b) = list(fork["choices"].items())
    phi_a = P.featurize_raw("", tele_a) - model.mu_phi
    phi_b = P.featurize_raw("", tele_b) - model.mu_phi
    w = (phi_a - phi_b) / np.maximum(model.Psi, 1e-6)
    return name_a if float(w @ implied) > 0 else name_b


def run_persona(persona: str, model, seed: int):
    rng = np.random.default_rng(seed)
    cond = {b: P.prior() for f in FORKS.values() for b in f["buckets"]}
    pooled = P.prior()
    held: list[tuple[str, str, str]] = []  # (fork_key, bucket, actual_choice)

    for i in range(N_TRAIN + K_TEST):
        for fk, fork in FORKS.items():
            for bucket in fork["buckets"]:
                c = choice_of(persona, fork, bucket, rng)
                if i < N_TRAIN:
                    tele = dict(fork["choices"][c])
                    cond[bucket] = P.observe(cond[bucket], "", tele, model=model)
                    pooled = P.observe(pooled, "", tele, model=model)
                else:
                    held.append((fk, bucket, c))

    # Score the held-out slice, per bucket, from both vantages. The CONDITIONAL vantage
    # predicts from the bucket's deviation from the person's own pooled baseline — the
    # conditional SIGNATURE (Invariant 5: identity lives in slopes, not levels; subtracting
    # the person's own mean also cancels the absent-feature drag every sparse telemetry row
    # shares). The POOLED vantage has only the marginal lean — what a bucket-less model knows.
    per_bucket: dict[str, dict[str, float]] = {}
    for fk, fork in FORKS.items():
        for bucket in fork["buckets"]:
            rows = [(f, b, c) for (f, b, c) in held if f == fk and b == bucket]
            hit_c = sum(predict(model, cond[bucket].mu - pooled.mu, fork) == c for _, _, c in rows)
            hit_p = sum(predict(model, pooled.mu, fork) == c for _, _, c in rows)
            per_bucket[bucket] = {
                "conditional": hit_c / len(rows),
                "pooled": hit_p / len(rows),
            }
    overall_c = float(np.mean([v["conditional"] for v in per_bucket.values()]))
    overall_p = float(np.mean([v["pooled"] for v in per_bucket.values()]))
    return per_bucket, overall_c, overall_p


def main() -> int:
    model = get_persona_model()
    if not model.trained:
        print("FAIL: no committed measurement artifact (run scripts/train_measurement.py)")
        return 1

    lines = ["=" * 88,
             "BRS - Behavioral Reproduction Score (held-out next-choice, per context bucket)",
             "=" * 88]

    pb_P, brs_P_cond, brs_P_pooled = run_persona("P", model, seed=11)
    pb_Q, brs_Q_cond, brs_Q_pooled = run_persona("Q", model, seed=13)

    lines.append(f"{'bucket':22} {'P cond':>8} {'P pooled':>9}")
    for b, v in pb_P.items():
        lines.append(f"  {b:20} {v['conditional']:>8.2f} {v['pooled']:>9.2f}")
    lines.append(f"  {'OVERALL':20} {brs_P_cond:>8.2f} {brs_P_pooled:>9.2f}   "
                 f"(Q uniform control: cond {brs_Q_cond:.2f} / pooled {brs_Q_pooled:.2f})")

    checks = {
        # The echo reproduces a conditional person where they live: in the conditionals.
        "P_conditional_brs_high": brs_P_cond >= 0.90,
        # A marginal (pooled) model cannot reproduce a conditional person (Invariant 5).
        "P_pooled_drops_toward_chance": brs_P_pooled <= brs_P_cond - 0.25,
        # The uniform control gains nothing from conditioning (no fake slope advantage).
        "Q_no_conditioning_advantage": abs(brs_Q_cond - brs_Q_pooled) <= 0.15,
    }
    lines.append("")
    for k, v in checks.items():
        lines.append(f"  [{'PASS' if v else 'FAIL'}] {k}")
    ok = all(checks.values())
    lines.append("")
    lines.append(f"RESULT: {'PASS' if ok else 'FAIL'}  (headline BRS = {brs_P_cond:.2f})")
    lines.append("=" * 88)
    print("\n".join(lines))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
