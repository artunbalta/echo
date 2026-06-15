"""§9.4 reward model tests (Bradley-Terry + outcome BCE)."""
import numpy as np
from echo_ml.reward import RewardModel, _sigmoid
from echo_ml.embeddings import embed


def test_bt_step_increases_preferred_reward_gap():
    rm = RewardModel.init(seed=1)
    xp = embed("warm thoughtful reply about books")
    xn = embed("curt dismissive one word")
    before = rm.reward(xp) - rm.reward(xn)
    for _ in range(50):
        rm.step_pair(xp, xn)
    after = rm.reward(xp) - rm.reward(xn)
    assert after > before
    # preferred should end up clearly higher
    assert rm.reward(xp) > rm.reward(xn)


def test_bt_loss_decreases():
    rm = RewardModel.init(seed=2)
    xp = embed("yes lets meet for coffee")
    xn = embed("no thanks not interested")
    losses = []
    for _ in range(40):
        losses.append(rm.step_pair(xp, xn))
    assert losses[-1] < losses[0]


def test_outcome_anchor_pushes_probability_toward_label():
    rm = RewardModel.init(seed=3)
    x = embed("propose a real meeting with aligned stranger")
    for _ in range(60):
        rm.step_outcome(x, 1.0)
    assert _sigmoid(rm.reward(x)) > 0.6
    rm2 = RewardModel.init(seed=3)
    for _ in range(60):
        rm2.step_outcome(x, 0.0)
    assert _sigmoid(rm2.reward(x)) < 0.4


def test_serialization_roundtrip():
    rm = RewardModel.init(seed=4)
    xp, xn = embed("a b c"), embed("d e f")
    rm.step_pair(xp, xn)
    d = rm.to_dict()
    rm2 = RewardModel.from_dict(d)
    assert np.isclose(rm.reward(xp), rm2.reward(xp))
