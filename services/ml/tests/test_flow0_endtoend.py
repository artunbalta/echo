"""Flow 0 ("Waking Alone") end-to-end regression — Step 2.

Every design-doc Flow-0 beat, driven through the REAL unchanged spine
(/observe/behavioral → ingest → persona.observe → featurize_raw → learned W), must:
move the posterior on USE and on REFUSE (non-action is data), enforce the mandatory F0
context (422), and route its LANGUAGE-FREE implicit signal onto the design-doc's intended
axis for the cues the committed W has a real telemetry path for (first_move→pace,
climb_persist→formality/affect, gaze_reflection→affect, stack_tidy→formality).

The walkthrough harness lives in scripts/flow0_walkthrough.py so it is also runnable standalone.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.flow0_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_every_use_cue_moves_the_posterior(report):
    assert report["checks"]["every_use_cue_moves_posterior"]


def test_refusal_is_data(report):
    assert report["refusal"]["status"] == 200
    assert report["refusal"]["polarity"] == "refuse"
    assert report["refusal"]["delta_mu"] > 1e-4


def test_implicit_channel_matches_doc_priors(report):
    # first_move→pace, climb_persist→formality/affect, gaze_reflection→affect, stack_tidy→formality
    assert report["checks"]["implicit_channel_matches_doc_priors"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_solitary_episode_shifts_posterior(report):
    assert report["checks"]["posterior_actually_shifted"]


def test_walkthrough_passes_overall(report):
    assert report["passed"], report["checks"]
