"""Travel-stand regression — Step 6 Part 1.

The travel cues (far/near/prepare) must move the actor's posterior, a far-wanderer must diverge from
a near-homebody, and mandatory context is enforced. Harness: scripts/stand_travel_walkthrough.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.stand_travel_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_travel_cues_move_posterior(report):
    assert report["checks"]["travel_cues_move_posterior"]


def test_wanderer_diverges_from_homebody(report):
    assert report["checks"]["wanderer_diverges_from_homebody"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_overall(report):
    assert report["passed"], report["checks"]
