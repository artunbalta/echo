"""Flow 2 per-actor siloing regression — Step 3.

Two LIVE players meeting in the shared ocean produce a SEPARATE BehavioralEvent per actor; the
proven ingress must route each strictly into that actor's own posterior (never co-mingled), move
both, let them diverge when the players behave differently, bucket on counterpart:peer, and reject
an incomplete context with 422.

The walkthrough harness lives in scripts/flow2_peractor_walkthrough.py (runnable standalone).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.flow2_peractor_walkthrough import walk  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_first_contact_moves_both_posteriors(report):
    assert report["checks"]["first_contact_moves_both"]


def test_alice_event_does_not_touch_bob(report):
    assert report["checks"]["alice_event_did_not_touch_bob"]


def test_strict_per_actor_siloing(report):
    assert report["checks"]["strict_siloing_alice_only_leaves_bob"]


def test_posteriors_diverge_when_players_differ(report):
    assert report["checks"]["posteriors_diverge"]


def test_peer_conditional_bucket(report):
    assert report["checks"]["peer_conditional_bucket"]


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_overall(report):
    assert report["passed"], report["checks"]
