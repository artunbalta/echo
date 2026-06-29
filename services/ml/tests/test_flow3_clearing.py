"""Flow 3 clearing regression — Step 4.

The clearing's stations (service / queue / group / marginal / bargain) must each move the
posterior, tag counterpart_status so the conditional signature forms, and — critically — make the
courtesy gradient (warmth to a low-status server vs a high-status figure) recoverable as two
separate conditional posteriors. Harness: scripts/flow3_clearing_walkthrough.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.flow3_clearing_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_every_station_moves_posterior(report):
    assert report["checks"]["every_station_moves_posterior"]


def test_courtesy_gradient_recoverable(report):
    # warmth to high-status vs low-status server lives in separate conditional posteriors
    assert report["checks"]["courtesy_gradient_recoverable"]
    assert abs(report["gradient"]["gap"]) > 0.05


def test_conditional_signature_by_status(report):
    assert report["checks"]["conditional_signature_by_status"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_overall(report):
    assert report["passed"], report["checks"]
