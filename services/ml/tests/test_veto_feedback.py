"""P6 — the veto (blueprint II.6 / B1): "that wasn't me" on a real autonomous act.

agreed=false + rejected (with NO chosen correction) must:
  1. train the reward head as a negative OUTCOME on that action (the counterfactual), and
  2. still feed calibration + the autonomy bucket (demotion pressure) as before.
A veto is the highest-value signal the system receives; it must never be a no-op.
"""
from fastapi.testclient import TestClient

from echo_ml.app import app, STORE
from echo_ml.config import SETTINGS
from echo_ml.embeddings import embed

client = TestClient(app)
H = {"authorization": f"Bearer {SETTINGS.ml_token}"}


def _veto(uid: str, text: str, ctx: str):
    return client.post(
        "/feedback",
        json={"userId": uid, "bucket": "smalltalk", "confidence": 0.6,
              "agreed": False, "rejected": text, "context": ctx},
        headers=H,
    )


def test_veto_trains_reward_head_negatively():
    uid = "u_veto_reward"
    st = STORE.get(uid)
    x = embed("talking with Ada || That lands for me, totally.")
    before_score = st.reward.reward(x)
    before_version = st.reward.version

    r = _veto(uid, "That lands for me, totally.", "talking with Ada")
    assert r.status_code == 200

    assert st.reward.version > before_version, "the veto must train the reward head"
    assert st.reward.reward(x) < before_score, "the vetoed act must score lower afterwards"


def test_veto_still_feeds_bucket_and_calibration():
    uid = "u_veto_bucket"
    st = STORE.get(uid)
    r = _veto(uid, "Sure, whatever you say.", "talking with Bo")
    assert r.status_code == 200
    assert len(st.calib) == 1 and st.calib[0][1] == 0  # disagreement recorded
    assert st.bucket("smalltalk").volume >= 1  # the bucket saw the verdict


def test_plain_disagreement_without_rejected_text_stays_calibration_only():
    uid = "u_veto_plain"
    st = STORE.get(uid)
    v0 = st.reward.version
    r = client.post(
        "/feedback",
        json={"userId": uid, "bucket": "smalltalk", "confidence": 0.5,
              "agreed": False, "context": "talking with Cy"},
        headers=H,
    )
    assert r.status_code == 200
    assert st.reward.version == v0, "no utterance to anchor on -> reward head untouched"
