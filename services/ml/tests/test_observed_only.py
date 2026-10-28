"""Only what a behavior measured moves the persona (web DECISIONS C73).

Two defects, found by the first self-trial on a real person, in ten minutes of play:

1. Every update conditioned on all 66 raw features, and a feature nobody measured comes out of
   featurize_raw as 0, so it was evidence that the person is average. Sixty walking windows, which
   measure two things, put every axis at the same ±0.14: as sure of warmth as of pace, and so sure
   that an act after the walk barely moved it.
2. The behavioral path passed the cue's own name ("approach_distant_lone") into the text features,
   and the committed W reads intellect almost entirely from mean word length. Three identical acts
   swung intellect from −0.22 to +0.85 by their name alone.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
from scripts.slice_walkthrough import _C, _H, ctx, ev, post  # noqa: E402
from echo_ml import persona as P  # noqa: E402
from echo_ml.persona_axes import AXIS_INDEX  # noqa: E402

WALKS = [{"novel_tile_ratio": 0.2 + 0.01 * i, "path_tortuosity": 1.1 + 0.03 * i} for i in range(60)]


def _uid() -> str:
    return f"observed-{uuid.uuid4().hex[:10]}"


def _walked() -> P.Posterior:
    post_ = P.prior()
    for w in WALKS:
        post_ = P.observe(post_, "", w)
    return post_


def test_the_mask_is_what_arrived():
    n_text = P._TEXT_FEATURES
    names = P.feature_names()
    assert not P.observed_mask("", {}).any()
    assert not P.observed_mask("   ", None).any()
    text_only = P.observed_mask("hello there", {})
    assert text_only[:n_text].all() and not text_only[n_text:].any()
    lat = P.observed_mask("", {"latencyMs": 300})
    assert lat[names.index("latency_norm")]
    assert not lat[names.index("has_latency")], "presence is the mask now; the flag measures nothing"
    # False is a measurement (they walked away); None is not one.
    assert P.observed_mask("", {"approach": False})[names.index("approach")]
    assert not P.observed_mask("", {"approach": None}).any()


def test_measuring_nothing_is_no_update():
    before = P.prior()
    after = P.observe(before, "", {"scarcityLevel": 0.7, "dayCount": 3})
    assert after.version == before.version
    assert np.allclose(after.mu, before.mu) and np.allclose(after.Sigma, before.Sigma)


def test_absent_is_not_average():
    base = P.observe(P.prior(), "", {"approach": True})
    # A key that is no feature changes nothing...
    same = P.observe(P.prior(), "", {"approach": True, "not_a_feature": 5})
    assert np.allclose(base.mu, same.mu) and np.allclose(base.Sigma, same.Sigma)
    # ...and an explicit 0 is a measurement (they gave nothing), where a missing key is not.
    zero = P.observe(P.prior(), "", {"approach": True, "ts_social": 0.0})
    assert not np.allclose(base.Sigma, zero.Sigma)


def test_a_walk_sharpens_only_what_it_measures():
    sd = np.sqrt(_walked().var)
    # The walking features load on openness; intellect, pace, dominance and formality they barely touch.
    assert sd[AXIS_INDEX["openness"]] < 0.7
    for axis in ("intellect", "pace", "dominance", "formality"):
        assert sd[AXIS_INDEX[axis]] > 0.9, f"a walk is no evidence of {axis} (sd {sd[AXIS_INDEX[axis]]:.2f})"


def test_after_a_walk_an_act_still_moves_the_echo():
    walked = _walked()
    acted = P.observe(walked, "", {"approach": True})
    # Before C73 this was +0.07: sixty walks had made the echo deaf to what came after.
    assert acted.mu[AXIS_INDEX["warmth"]] - walked.mu[AXIS_INDEX["warmth"]] > 0.3


def test_the_cue_name_is_not_read():
    short, long_ = _uid(), _uid()
    for uid, name in ((short, "go"), (long_, "a_considerably_longer_name_for_the_very_same_step")):
        r = post(ev(uid, "A", name, raw={"distance": 2.0}, context=ctx(stakes="low")))
        assert r.status_code == 200, r.text
    a = _C.get(f"/persona/{short}", headers=_H).json()
    b = _C.get(f"/persona/{long_}", headers=_H).json()
    assert np.allclose(a["persona"]["mu"], b["persona"]["mu"])
    assert np.allclose(a["persona"]["Sigma"], b["persona"]["Sigma"])
    assert a["conditional"] == b["conditional"]
    # The name still goes where it belongs: the behavior index.
    assert a["behaviors"] == b["behaviors"] == 1


def test_our_sentence_about_a_choice_is_not_their_style():
    one, two = _uid(), _uid()
    for uid, said in ((one, "chose save"), (two, 'On a lean day (day 3) they chose "save" at fork "plant_or_spend".')):
        r = _C.post("/observe", headers=_H, json={"userId": uid, "action": said, "telemetry": {"save_rate": 1.0}})
        assert r.status_code == 200, r.text
    a = _C.get(f"/persona/{one}", headers=_H).json()["persona"]
    b = _C.get(f"/persona/{two}", headers=_H).json()["persona"]
    assert np.allclose(a["mu"], b["mu"]) and np.allclose(a["Sigma"], b["Sigma"])


def test_an_event_that_measures_nothing_is_recorded_but_is_no_update():
    uid = _uid()
    body = ev(uid, "E", "first_contact", cue="E1", raw={"distance": 0.5},
              target={"id": "other", "kind": "player", "status": "peer"},
              context=ctx(counterpart_status="peer", public_or_private="public"))
    r = post(body)
    assert r.status_code == 200, r.text
    got = _C.get(f"/persona/{uid}", headers=_H).json()
    assert got["behaviors"] == 1
    assert got["persona"]["version"] == 0
