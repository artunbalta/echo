"""Food + workplace stand regression — Step 6 Part 2.

The food (treat/host/eat) and workplace (work/vocation/shirk) cues move the actor's posterior with
mandatory context; a generous host diverges from an industrious worker; 422 on incomplete context.
Harness: scripts/stand_food_work_walkthrough.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.stand_food_work_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_stand_cues_move_posterior(report):
    assert report["checks"]["stand_cues_move_posterior"]


def test_host_diverges_from_worker(report):
    assert report["checks"]["host_diverges_from_worker"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_overall(report):
    assert report["passed"], report["checks"]
