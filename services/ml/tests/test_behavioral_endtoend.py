"""Deliverable #7 (headless end-to-end) — Stage 0 + Stage 4 BehavioralEvents flow through the
real pipeline (FastAPI /observe/behavioral → ingest → persona.observe → featurize_raw) and:
move the posterior, capture refusals (non-action is data), enforce mandatory context, form
per-context conditional buckets, and keep two actors' measurements siloed.

The walkthrough harness lives in scripts/slice_walkthrough.py so it is also runnable standalone.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from scripts.slice_walkthrough import walk  # noqa: E402
from echo_ml import ingest  # noqa: E402


@pytest.fixture(scope="module")
def report():
    return walk()


def test_stage0_and_stage4_acts_move_posterior(report):
    assert report["checks"]["stage0_acts_move_posterior"]
    assert report["checks"]["stage4_acts_move_posterior"]


def test_refusal_is_data(report):
    # A Channel-K refusal is accepted and moves the posterior (non-action is data).
    assert report["refusal"]["status"] == 200
    assert report["refusal"]["polarity"] == "refuse"
    assert report["refusal"]["delta_mu"] > 1e-4


def test_mandatory_context_enforced(report):
    assert report["missing_context_status"] == 422


def test_conditional_buckets_form(report):
    assert len(report["cond_keys"]) >= 2
    assert any(k.startswith("counterpart:") for k in report["cond_keys"])


def test_per_actor_siloing(report):
    pa = report["per_actor"]
    assert pa["distance"] > 0.05            # two independent reads from one encounter
    assert pa["alice_norm"] > 1e-3 and pa["bob_norm"] > 1e-3


def test_walkthrough_passes_overall(report):
    assert report["passed"], report["checks"]


def test_ingest_rejects_incomplete_context():
    with pytest.raises(ingest.MissingContext):
        ingest.event_to_observation({"actor_id": "u", "channel": "A", "context": {"stakes": "low"}})


def test_ingest_requires_actor_id():
    full_ctx = {k: (0 if k in ("audience_size", "stage") else
                    0.0 if k in ("scarcity_level", "mood_proxy", "time_pressure") else
                    "low" if k == "stakes" else "private" if k == "public_or_private" else "none")
                for k in ingest.REQUIRED_CONTEXT}
    with pytest.raises(ValueError):
        ingest.event_to_observation({"channel": "A", "action": "dwell", "context": full_ctx})
