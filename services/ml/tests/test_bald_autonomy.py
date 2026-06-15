"""§9.6 BALD selection and §9.7 graduated autonomy / drift tests."""
import numpy as np
from echo_ml import persona as P
from echo_ml.persona_axes import AXIS_INDEX
from echo_ml.bald import bald_scores
from echo_ml.autonomy import Bucket
from echo_ml.config import HYPER


def test_bald_prefers_discriminative_npc_on_uncertain_axis():
    # Posterior: confident on warmth (low var), uncertain on openness (high var).
    post = P.prior()
    post.var[AXIS_INDEX["warmth"]] = 0.02
    post.mu[AXIS_INDEX["warmth"]] = 0.9
    post.var[AXIS_INDEX["openness"]] = 1.0
    post.mu[AXIS_INDEX["openness"]] = 0.0

    warmth_axis = np.zeros(P.D); warmth_axis[AXIS_INDEX["warmth"]] = 1.0
    openness_axis = np.zeros(P.D); openness_axis[AXIS_INDEX["openness"]] = 1.0
    scores = bald_scores(post, [("probes_known", warmth_axis), ("probes_unknown", openness_axis)], samples=2000)
    top = scores[0]
    # The NPC probing the uncertain axis yields more information.
    by_id = {s.npc_id: s.score for s in scores}
    assert by_id["probes_unknown"] > by_id["probes_known"]
    assert top.npc_id == "probes_unknown"


def test_bald_nonnegative():
    post = P.prior()
    a = np.ones(P.D) / np.sqrt(P.D)
    scores = bald_scores(post, [("x", a)], samples=500)
    assert scores[0].score >= 0


def test_bucket_starts_copilot():
    assert Bucket("first_greeting").level == "copilot"


def test_promotion_requires_all_conditions():
    b = Bucket("smalltalk")
    b.set_ece(0.05)  # good calibration
    # feed enough agreements to exceed α* and n*
    for _ in range(30):
        b.record(True, confidence=0.85)
    assert b.level in ("supervised", "auto")
    assert b.agreement_ewma >= HYPER.alpha_promote


def test_no_promotion_with_bad_calibration():
    b = Bucket("smalltalk")
    b.set_ece(0.5)  # bad calibration blocks promotion
    for _ in range(30):
        b.record(True, confidence=0.85)
    assert b.level == "copilot"


def test_demotion_and_hysteresis():
    b = Bucket("smalltalk")
    b.set_ece(0.05)
    for _ in range(30):
        b.record(True, confidence=0.85)
    promoted = b.level
    assert promoted != "copilot"
    # sustained disagreement demotes
    for _ in range(30):
        b.record(False, confidence=0.85)
    assert b.level == "copilot"


def test_drift_cusum_triggers_demotion():
    b = Bucket("propose_meeting")
    b.set_ece(0.05)
    for _ in range(20):
        b.record(True, confidence=0.8)
    level_before = b.level
    # a sudden run of disagreements should fire the CUSUM drift detector
    drifted = False
    for _ in range(10):
        ev = b.record(False, confidence=0.8)
        drifted = drifted or ev["drift"]
    assert drifted
    assert b.level <= level_before or b.level == "copilot"
