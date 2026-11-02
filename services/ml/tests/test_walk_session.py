"""A session's walk is one measurement (web DECISIONS C74).

C73 stopped counting what a walk does not see as average, and that showed what the false average had
hidden. Sixty windows counted as sixty independent measurements, and the synthetic W's two nearly
collinear walking features explained their small difference by inflating energy (+1.00 in ten minutes).
A session's walking is one way of walking, measured many times: each window is 1/60 of a measurement,
a session stops at one, and a pause starts a new session.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
import pytest  # noqa: E402
from scripts.slice_walkthrough import _C, _H, ctx, ev, post  # noqa: E402
import echo_ml.app as A  # noqa: E402
from echo_ml import persona as P  # noqa: E402
from echo_ml.config import HYPER  # noqa: E402
from echo_ml.persona_axes import AXIS_INDEX  # noqa: E402

N = HYPER.walk_windows_per_measurement


@pytest.fixture
def clock(monkeypatch):
    now = [1_800_000_000.0]
    monkeypatch.setattr(A, "_clock", lambda: now[0])
    return now


def _uid() -> str:
    return f"walk-{uuid.uuid4().hex[:10]}"


def _walk(uid, clock, rng, windows: int, every_s: float = 1.5):
    """Windows the way the world sends them: at most one each 1.5 s, the self-trial's spread."""
    for _ in range(windows):
        clock[0] += every_s
        r = _C.post("/telemetry", headers=_H, json={"userId": uid, "event": {"type": "passive_locomotion", "payload": {
            "novel_tile_ratio": float(rng.uniform(0.2, 0.8)), "path_tortuosity": float(rng.uniform(1.1, 3.0)),
            "heading_change_rate": 0.3, "tiles": 12}}})
        assert r.status_code == 200, r.text


def _persona(uid) -> dict:
    return _C.get(f"/persona/{uid}", headers=_H).json()


def test_n_windows_at_one_nth_carry_what_one_carries():
    tel = {"novel_tile_ratio": 0.15, "path_tortuosity": 1.5}
    once = P.observe(P.prior(), "", tel)
    split = P.prior()
    for _ in range(10):
        split = P.observe(split, "", tel, weight=0.1)
    assert np.allclose(once.mu, split.mu, atol=1e-6)
    assert np.allclose(once.Sigma, split.Sigma, atol=1e-6)


def test_a_weight_is_a_fraction_of_one():
    for bad in (0.0, -0.5, 1.5):
        with pytest.raises(ValueError):
            P.observe(P.prior(), "", {"approach": True}, weight=bad)


def test_a_session_walk_stops_at_one_measurement(clock):
    uid, rng = _uid(), np.random.default_rng(1)
    _walk(uid, clock, rng, N)
    one = _persona(uid)
    assert one["persona"]["version"] == N
    _walk(uid, clock, rng, 2 * N)
    later = _persona(uid)
    assert later["persona"]["version"] == N, "a session's walking is one measurement"
    assert np.allclose(later["persona"]["mu"], one["persona"]["mu"])
    assert later["locomotion"] == 3 * N, "every window is still recorded"


def test_a_pause_starts_a_new_session(clock):
    uid, rng = _uid(), np.random.default_rng(2)
    _walk(uid, clock, rng, N + 5)
    assert _persona(uid)["persona"]["version"] == N
    # Walking on without a long pause is the same session...
    _walk(uid, clock, rng, 1, every_s=HYPER.walk_session_gap_s - 1)
    assert _persona(uid)["persona"]["version"] == N
    # ...and after one, a new session's walk is evidence again.
    _walk(uid, clock, rng, 1, every_s=HYPER.walk_session_gap_s + 1)
    assert _persona(uid)["persona"]["version"] == N + 1


def test_a_whole_day_of_walking_makes_nobody_open_and_energetic(clock):
    uid, rng = _uid(), np.random.default_rng(0)
    _walk(uid, clock, rng, 400)   # the world's daily cap, in one sitting
    p = _persona(uid)
    mu = np.array(p["persona"]["mu"])
    # Before C74: openness +0.88 and energy +1.00 after sixty of these.
    assert np.max(np.abs(mu)) < 0.4, mu
    assert p["uncertainty"] > 0.85, "a walk is not much to know someone by, and the echo says so"


def test_an_act_after_the_walk_still_counts_in_full(clock):
    uid, rng = _uid(), np.random.default_rng(3)
    _walk(uid, clock, rng, N)
    before = _persona(uid)["persona"]["mu"][AXIS_INDEX["warmth"]]
    r = post(ev(uid, "A", "go", raw={"distance": 2.0}, context=ctx(stakes="low")))
    assert r.status_code == 200, r.text
    after = _persona(uid)["persona"]["mu"][AXIS_INDEX["warmth"]]
    assert after - before > 0.3


def test_the_weight_holds_without_a_learned_model_too():
    class Untrained:
        trained = False
    tel = {"latencyMs": 400}
    once = P.observe(P.prior(), "", tel, model=Untrained())
    split = P.prior()
    for _ in range(4):
        split = P.observe(split, "", tel, model=Untrained(), weight=0.25)
    assert np.allclose(once.mu, split.mu, atol=1e-6)
    assert np.allclose(once.Sigma, split.Sigma, atol=1e-6)


def test_other_signals_count_in_full(clock):
    uid = _uid()
    r = _C.post("/telemetry", headers=_H, json={"userId": uid, "event": {"type": "approach", "payload": {}}})
    assert r.status_code == 200, r.text
    expected = P.observe(P.prior(), "", {"approach": True})
    assert np.allclose(_persona(uid)["persona"]["mu"], expected.mu)


def test_a_window_that_measured_nothing_spends_nothing(clock):
    uid = _uid()
    for _ in range(N):
        clock[0] += 1.5
        r = _C.post("/telemetry", headers=_H, json={"userId": uid, "event": {"type": "passive_locomotion", "payload": {
            "heading_change_rate": 0.3, "tiles": 12}}})
        assert r.status_code == 200, r.text
    assert _persona(uid)["persona"]["version"] == 0
    _walk(uid, clock, np.random.default_rng(4), 1)
    assert _persona(uid)["persona"]["version"] == 1
