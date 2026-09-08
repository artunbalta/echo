"""The dead columns of the committed W, and the cues that route to nothing else (known-gaps ⚑23).

Four of W's 66 columns are EXACTLY zero on all 8 axes, and `consistency` is one of them. Four
shipped actions set `consistency` and set nothing else, so their designed feature moves the
posterior by exactly zero — `return_cache` / `keep_cache` among them, which IS the Ring of Gyges,
the blueprint's flagship moral probe.

This file is not a request to route them somewhere. Attaching a flagged scalar to the nearest live
feature is the silent re-route cross-cutting rule #1 forbids and ⚑6 records the cost of. It is a
tripwire: the day the re-anchor gives `consistency` a direction, or the day somebody quietly adds a
second feature to one of these four actions, a test fails and somebody reads ⚑23 and DECISIONS C30.

Run:  cd services/ml && python3 -m pytest tests/test_zero_columns.py
"""
import re
from pathlib import Path

import numpy as np

ARTIFACT = Path(__file__).resolve().parents[1] / "echo_ml" / "artifacts" / "measurement.npz"
INGEST = Path(__file__).resolve().parents[1] / "echo_ml" / "ingest.py"

# Measured 2026-09-07 against version 1 of the artifact. `ellipsis_ratio`, `emoji_ratio` and
# `digit_ratio` are text-manner features on a channel the product does not measure by promise, so
# their being dead is consistent with the consent card. `consistency` is not.
EXPECTED_ZERO = {"ellipsis_ratio", "emoji_ratio", "digit_ratio", "consistency"}

# The actions whose ONLY telemetry feature is `consistency`. wait_in_queue and cut_queue also set
# persistence / approach respectively, so they are deliberately absent.
DARK_ACTIONS = {"conform_custom", "travel_near", "return_cache", "keep_cache"}


def _matrix():
    d = np.load(ARTIFACT, allow_pickle=True)
    return d["W"], [str(x) for x in d["feature_names"]]


def test_the_zero_columns_are_exactly_the_four_recorded_in_flag_23():
    W, names = _matrix()
    assert W.shape == (8, 66), f"W is {W.shape}; ⚑23 and cue-catalog.md both say (8, 66)"
    zero = {names[i] for i in range(W.shape[1]) if float(np.abs(W[:, i]).max()) == 0.0}
    assert zero == EXPECTED_ZERO, (
        f"the dead columns of W changed: {sorted(zero)} against ⚑23's {sorted(EXPECTED_ZERO)}. "
        "If a re-anchor gave one of these a direction that is GOOD NEWS — update ⚑23 and "
        "DECISIONS C30 and this test. If a live column went dead, find out why first."
    )


def test_consistency_is_dead_and_the_features_that_rescue_two_cues_are_not():
    W, names = _matrix()

    def peak(feature):
        return float(np.abs(W[:, names.index(feature)]).max())

    assert peak("consistency") == 0.0
    # These two are what save wait_in_queue and cut_queue from the same fate, and they clear the
    # repo's own 0.15 reaction bar (action-axis-map.md) by a wide margin.
    assert peak("persistence") > 0.15
    assert peak("approach") > 0.15


def test_the_four_dark_actions_still_set_consistency_and_nothing_else():
    """Read from ingest.py itself, so adding a second feature to one of these four is visible here."""
    src = INGEST.read_text(encoding="utf-8")
    for action in sorted(DARK_ACTIONS):
        # The branch body runs from `if a == "<action>":` to the next line at the same indent that
        # opens a new branch. Good enough to see every `tel[...] =` the branch performs.
        m = re.search(rf'\n(\s*)if a == "{action}":\n(.*?)(?=\n\1if |\n\1# |\n\1return |\Z)', src, re.S)
        assert m, f"{action} no longer has its own branch in ingest.py — ⚑23's table is stale"
        features = set(re.findall(r'tel\["([a-z_0-9]+)"\]', m.group(2)))
        assert features == {"consistency"}, (
            f'{action} now sets {sorted(features)}. If it gained a live feature, ⚑23 improved and '
            "the register should say so. If it lost one, a cue just went dark."
        )
