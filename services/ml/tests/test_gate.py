"""§9.5 autonomy gate tests (calibration + cost-aware threshold + exploration)."""
import numpy as np
from echo_ml import gate as G


def test_threshold_monotonic_in_stakes():
    taus = [G.threshold(s) for s in ["low", "medium", "high", "irreversible"]]
    assert taus == sorted(taus)            # higher stakes ⇒ higher τ
    assert taus[-1] > 0.99                 # irreversible ≈ never autonomous


def test_calibration_tempers_overconfidence():
    # T>1 should pull a high raw confidence toward 0.5
    assert G.calibrate(0.95, 2.0) < 0.95
    assert G.calibrate(0.95, 2.0) > 0.5


def test_high_stakes_never_auto_even_when_confident():
    res = G.decide(0.999, "irreversible", "auto", temperature=1.0)
    assert res.decision == "ask"


def test_low_stakes_confident_auto_bucket_acts():
    res = G.decide(0.95, "low", "auto", temperature=1.0)
    assert res.decision == "auto"


def test_copilot_always_routes_to_human():
    res = G.decide(0.99, "low", "copilot", temperature=1.0)
    assert res.decision == "copilot"


def test_no_exploration_in_high_stakes():
    rng = np.random.default_rng(0)
    res = G.decide(0.5, "high", "auto", beta_params=(50, 1), rng=rng)
    assert res.explored is False


def test_fit_temperature_reduces_ece():
    rng = np.random.default_rng(0)
    # overconfident raw probs: claims 0.9 but only ~0.6 correct
    confs, corr = [], []
    for _ in range(400):
        p = 0.9
        confs.append(p)
        corr.append(1 if rng.random() < 0.6 else 0)
    ece_raw = G.expected_calibration_error(confs, corr)
    T = G.fit_temperature(confs, corr)
    ece_cal = G.expected_calibration_error([G.calibrate(c, T) for c in confs], corr)
    assert ece_cal < ece_raw
