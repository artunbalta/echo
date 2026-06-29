"""World-design deliverable #6 — the individuation eval as a suite test.

Two synthetic personas with equal axis-averages but different conditional signatures must
come out distinguishable through the real engine, while a pooled readout cannot separate
them. The harness lives in scripts/individuation_eval.py so it is also runnable standalone.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.individuation_eval import run_eval  # noqa: E402


def test_individuation_eval_passes():
    r = run_eval(seed=0)
    # Equal marginals — a non-conditional readout cannot separate P and Q.
    assert r["pooled_dist"] < 0.20, r["pooled_dist"]
    # P carries a conditional signature; Q is essentially flat.
    assert r["sig_norm_p"] > 0.60, r["sig_norm_p"]
    assert r["sig_norm_q"] < 0.25, r["sig_norm_q"]
    # The two signatures separate cleanly.
    assert r["separation"] > 0.50, r["separation"]
    # The named conditionals are recovered with the right sign and size.
    assert r["warmth_gap_p"] > 0.40 and r["dom_gap_p"] > 0.40
    # One dramatic out-of-character act barely moves a converged posterior (robustness).
    assert r["outlier"]["shift"] < 0.15, r["outlier"]
    assert r["passed"]


def test_individuation_is_deterministic():
    a = run_eval(seed=0)
    b = run_eval(seed=0)
    assert abs(a["separation"] - b["separation"]) < 1e-9
