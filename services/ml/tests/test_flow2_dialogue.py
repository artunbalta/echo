"""Flow 2 dialogue-dynamics regression — Step 4.

A real two-actor F2 exchange (opener → turns → cold-response dilemma → close) must move each
actor's OWN posterior per turn, diverge on the dilemma (Alice warm vs Bob cold), bucket on
counterpart:peer, and enforce mandatory context. Harness: scripts/flow2_dialogue_walkthrough.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.flow2_dialogue_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_every_beat_moves_the_actor(report):
    assert report["checks"]["every_beat_moves_actor"]


def test_dyad_diverges_on_cold_response_dilemma(report):
    assert report["checks"]["dyad_diverges_on_dilemma"]
    assert report["checks"]["alice_warmer_than_bob"]


def test_peer_conditional_bucket(report):
    assert report["checks"]["peer_conditional_bucket"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_overall(report):
    assert report["passed"], report["checks"]
