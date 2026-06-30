"""TRAVEL STAND walkthrough (Step 6, Part 1 evidence).

The travel stand (the co-presence amplifier) emits a per-actor travel cue through the unchanged
ingress. This drives the EXACT envelopes the WorldRoom emits (social.ts buildSocialEvent) and shows:

  • far vs near travel both move the actor's posterior, and a wanderer (far) ends at a different
    posterior than a homebody (near) — two independent reads;
  • prepare_before_travel (planning) moves it too;
  • mandatory context (stage 2, the destination island as target) enforced — 422 on incomplete;
  • the doc-intended axis for far travel is OPENNESS, which the committed W routes via risk→dominance
    (⚑ the cross-flow openness gap, scheduled for the W re-anchor — NOT silently re-routed);
  • zero RuntimeWarnings.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/stand_travel_walkthrough.py
Exit 0 on PASS, 1 on FAIL.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from fastapi.testclient import TestClient

from echo_ml.app import app
from echo_ml.config import SETTINGS
from echo_ml.persona_axes import AXIS_KEYS

_C = TestClient(app)
_H = {"Authorization": f"Bearer {SETTINGS.ml_token}"}

# mirror of social.ts SOCIAL_CUES for the travel cues
CUES = {
    "travel_far": ("A", "A12", "openness/novelty + risk ⚑"),
    "travel_near": ("A", "A9", "conventional / the known"),
    "prepare_before_travel": ("C", "C7", "planning/conscientiousness"),
}


def ev(actor, action, dest_slot, *, bad=False):
    ch, cue, _ = CUES[action]
    ctx = {"stakes": "low", "audience_size": 1, "public_or_private": "public",
           "counterpart_status": "none", "stage": 2, "scarcity_level": 0.0,
           "mood_proxy": 0.0, "time_pressure": 0.0}
    if bad:
        ctx = {"stakes": "low"}
    return {
        "actor_id": actor, "sessionId": "s", "t": 0, "type": "interaction_start",
        "channel": ch, "cue": cue, "action": action, "polarity": "take",
        "target": {"id": f"island_{dest_slot}", "kind": "place", "status": "none"},
        "raw_signals": {"amount": dest_slot}, "context": ctx,
    }


def post(e):
    return _C.post("/observe/behavioral", headers=_H, json={"event": e})


def mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


def walk():
    report = {"steps": [], "checks": {}}
    wanderer, homebody = "u_travel_wanderer", "u_travel_homebody"
    for u in (wanderer, homebody):
        _C.delete(f"/user/{u}", headers=_H)

    # the wanderer prepares, then sails far; the homebody stays near.
    seq = [
        (wanderer, "prepare_before_travel", 60),
        (wanderer, "travel_far", 60),
        (homebody, "travel_near", 2),
    ]
    for actor, action, dest in seq:
        before = mu(actor)
        r = post(ev(actor, action, dest))
        assert r.status_code == 200, (actor, action, r.status_code, r.text)
        d = r.json()
        report["steps"].append({"actor": "wanderer" if actor == wanderer else "homebody",
                                 "action": action, "prior": CUES[action][2],
                                 "delta_mu": round(d["delta_mu"], 4), "cond": d["cond_key"]})

    mu_w, mu_h = mu(wanderer), mu(homebody)
    report["distance"] = round(float(np.linalg.norm(mu_w - mu_h)), 4)
    report["missing_context_status"] = post(ev(wanderer, "travel_far", 60, bad=True)).status_code

    c = report["checks"]
    c["travel_cues_move_posterior"] = all(s["delta_mu"] > 1e-4 for s in report["steps"])
    c["wanderer_diverges_from_homebody"] = report["distance"] > 0.05
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    report["passed"] = all(c.values())
    report["mu_wanderer"] = mu_w.tolist()
    report["mu_homebody"] = mu_h.tolist()
    return report


def fmt(r):
    L = ["=" * 92, "ECHO TRAVEL STAND — the co-presence amplifier: travel cues → the posterior", "=" * 92, ""]
    L.append(f"axes: {', '.join(AXIS_KEYS)}")
    L.append(f"{'actor':10} {'cue':24} {'doc prior':34} {'Δ‖μ‖':>7}  bucket")
    L.append("-" * 92)
    for s in r["steps"]:
        L.append(f"{s['actor']:10} {s['action']:24} {s['prior']:34} {s['delta_mu']:>7.4f}  {s['cond']}")
    L.append("-" * 92)
    L.append(f"μ wanderer (far) = " + "  ".join(f"{v:+.2f}" for v in r["mu_wanderer"]))
    L.append(f"μ homebody (near)= " + "  ".join(f"{v:+.2f}" for v in r["mu_homebody"]))
    L.append(f"distance(wanderer,homebody) = {r['distance']}  ·  incomplete-context → HTTP {r['missing_context_status']} (expect 422)")
    L.append("")
    for k, v in r["checks"].items():
        L.append(f"  [{'PASS' if v else 'FAIL'}] {k}")
    L.append("")
    L.append(f"RESULT: {'PASS ✅' if r['passed'] else 'FAIL ❌'}")
    L.append("=" * 92)
    return "\n".join(L)


if __name__ == "__main__":
    rep = walk()
    print(fmt(rep))
    sys.exit(0 if rep["passed"] else 1)
