"""Numerical-stability regression gate.

Two jobs:
  1. Catch any REAL NaN/Inf loudly — assert the posterior (μ, Σ) and the feature vector are
     finite after every update, across adversarial inputs. This is the gate the silent
     nan_to_num rescue was hiding; if real non-finite values ever appear, this fails.
  2. Prove the Accelerate spurious-warning fix (quiet_fp / np.errstate) is a numerical NO-OP:
     observe is bit-identical with and without the wrapper, and a raw matmul is bit-identical
     under np.errstate — so silencing the warnings changed warning behaviour only, not values.
"""
import warnings

import numpy as np

from echo_ml import persona as P
from echo_ml.persona import observe, featurize_raw
from echo_ml.embeddings import _hash_embed
from echo_ml.config import SETTINGS

# empty, normal, edit-heavy, very long, non-Latin/unicode, and out-of-range telemetry
ADVERSARIAL = [
    ("", {}),
    ("act", {"ts_social": 0.9, "risk_index": 0.7}),
    ("", {"latencyMs": 0, "editsCount": 50}),
    ("a very long message " * 50, {"ts_earn": 1.0, "ts_build": 1.0, "save_rate": 1.0}),
    ("şçöğü ünïcödé merhaba", {"risk_index": 1.0, "decision_latency": 999999}),
    ("x", {"ts_social": -5.0, "risk_index": 5.0, "latencyMs": -10}),  # out of range → clipped internally
]


def test_featurize_raw_always_finite():
    for text, tel in ADVERSARIAL:
        phi = featurize_raw(text, tel)
        assert np.isfinite(phi).all(), (text, np.where(~np.isfinite(phi)))


def test_posterior_finite_and_psd_after_every_update():
    """The loud gate: any REAL NaN/Inf entering the posterior fails here instead of being
    silently rescued downstream."""
    post = P.prior()
    for i in range(60):
        text, tel = ADVERSARIAL[i % len(ADVERSARIAL)]
        post = observe(post, text, tel)
        assert np.isfinite(post.mu).all(), f"mu non-finite at step {i}"
        assert np.isfinite(post.Sigma).all(), f"Sigma non-finite at step {i}"
        eig = np.linalg.eigvalsh(0.5 * (post.Sigma + post.Sigma.T))
        assert eig.min() > -1e-9, f"Sigma lost PSD at step {i}: min eig {eig.min()}"


def test_hash_embed_always_unit_norm_and_finite():
    for t in ["", "act", "şç", "the quick brown fox", "<empty>", "a a a a", "🙂🙂"]:
        e = _hash_embed(t, SETTINGS.embed_dim)
        assert np.isfinite(e).all(), t
        assert abs(float(np.linalg.norm(e)) - 1.0) < 1e-9, (t, float(np.linalg.norm(e)))


def test_no_spurious_matmul_warnings_from_observe():
    """quiet_fp must silence the Accelerate flags at the SOURCE — not merely via pytest.ini —
    so scripts and the running service see clean output too. We override any inherited filter
    with simplefilter('always') so a regression is caught even though pytest.ini ignores matmul."""
    post = P.prior()
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        for i in range(20):
            post = observe(post, "act", {"ts_social": 0.9 if i % 2 else 0.1, "risk_index": 0.7})
    offenders = [str(x.message) for x in w if "matmul" in str(x.message).lower()]
    assert not offenders, offenders[:3]


def test_quiet_fp_is_bit_identical():
    """quiet_fp changes warning behaviour ONLY. Prove it: the decorated observe and its
    undecorated original (__wrapped__) produce byte-identical posteriors."""
    seq = [("act", {"ts_social": 0.8}), ("", {"risk_index": 0.9, "editsCount": 3}),
           ("merhaba dünya", {"ts_learn": 0.7})]
    a = P.prior()
    for text, tel in seq:
        a = observe(a, text, tel)
    b = P.prior()
    raw = observe.__wrapped__  # the original, before @quiet_fp
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for text, tel in seq:
            b = raw(b, text, tel)
    assert np.array_equal(a.mu, b.mu)
    assert np.array_equal(a.Sigma, b.Sigma)


def test_errstate_matmul_is_bit_identical():
    """The raw op: np.errstate(all='ignore') silences the flag but returns the same bits."""
    rng = np.random.default_rng(0)
    M = rng.standard_normal((32, 256))
    v = rng.standard_normal(256)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        plain = M @ v
    with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
        quiet = M @ v
    assert np.array_equal(plain, quiet)
