"""FOOD + WORKPLACE stand walkthrough (Step 6, Part 2 evidence).

The food/dining stand (warmth/generosity/hosting) and the workplace/business stand
(industriousness/time-allocation/vocation) emit per-actor cues through the unchanged ingress
(the SAME envelopes the WorldRoom emits via SOCIAL_CUE → buildSocialEvent). Shows:

  • food cues (treat_other, host_table, eat_meal) and workplace cues (work_shift, take_vocation)
    move the actor's posterior, with mandatory context (stage + counterpart);
  • a generous host (food) ends at a different posterior than an industrious worker (workplace) —
    two independent reads on different axes (warmth/sociability vs industriousness/build);
  • 422 on an incomplete context envelope; zero RuntimeWarnings.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/stand_food_work_walkthrough.py
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

# mirror of social.ts SOCIAL_CUES (channel, cue, stage, polarity, counterpart) for these stand cues
CUES = {
    "treat_other":   ("F", "F7",  3, "take",   "peer", "generosity → warmth"),
    "host_table":    ("G", "G14", 3, "take",   "peer", "hosting → warmth/dominance/energy"),
    "eat_meal":      ("G", "G13", 3, "take",   "peer", "self-feeding (low social)"),
    "work_shift":    ("C", "C8",  1, "take",   "none", "industriousness → energy/formality"),
    "take_vocation": ("C", "C9",  1, "take",   "none", "commit to a craft → persistence/formality"),
    "shirk_work":    ("C", "C8",  1, "refuse", "none", "avoidance / low-industriousness"),
}


def ev(actor, action, *, bad=False):
    ch, cue, stage, pol, cp, _ = CUES[action]
    ctx = {"stakes": "low", "audience_size": 3, "public_or_private": "public",
           "counterpart_status": cp, "stage": stage, "scarcity_level": 0.0,
           "mood_proxy": 0.0, "time_pressure": 0.0}
    if bad:
        ctx = {"stakes": "low"}
    kind = "player" if cp == "peer" else "station"
    return {
        "actor_id": actor, "sessionId": "s", "t": 0, "type": "interaction_start",
        "channel": ch, "cue": cue, "action": action, "polarity": pol,
        "target": {"id": "stand", "kind": kind, "status": cp},
        "raw_signals": {"amount": 0.6}, "context": ctx,
    }


def post(e):
    return _C.post("/observe/behavioral", headers=_H, json={"event": e})


def mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


def walk():
    report = {"steps": [], "checks": {}}
    host, worker = "u_food_host", "u_work_worker"
    for u in (host, worker):
        _C.delete(f"/user/{u}", headers=_H)

    seq = [
        (host, "treat_other"), (host, "host_table"), (host, "eat_meal"),
        (worker, "work_shift"), (worker, "take_vocation"), (worker, "shirk_work"),
    ]
    for actor, action in seq:
        r = post(ev(actor, action))
        assert r.status_code == 200, (actor, action, r.status_code, r.text)
        d = r.json()
        report["steps"].append({"actor": "host" if actor == host else "worker", "action": action,
                                 "prior": CUES[action][5], "delta_mu": round(d["delta_mu"], 4),
                                 "cond": d["cond_key"]})

    mu_h, mu_w = mu(host), mu(worker)
    report["distance"] = round(float(np.linalg.norm(mu_h - mu_w)), 4)
    report["mu_host"] = mu_h.tolist()
    report["mu_worker"] = mu_w.tolist()
    report["missing_context_status"] = post(ev(host, "treat_other", bad=True)).status_code

    c = report["checks"]
    c["stand_cues_move_posterior"] = all(s["delta_mu"] > 1e-4 for s in report["steps"])
    c["host_diverges_from_worker"] = report["distance"] > 0.05
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    report["passed"] = all(c.values())
    return report


def fmt(r):
    L = ["=" * 92, "ECHO FOOD + WORKPLACE stands — per-actor cues → the posterior", "=" * 92, ""]
    L.append(f"axes: {', '.join(AXIS_KEYS)}")
    L.append(f"{'actor':8} {'cue':16} {'doc prior':40} {'Δ‖μ‖':>7}  bucket")
    L.append("-" * 92)
    for s in r["steps"]:
        L.append(f"{s['actor']:8} {s['action']:16} {s['prior']:40} {s['delta_mu']:>7.4f}  {s['cond']}")
    L.append("-" * 92)
    L.append(f"μ host  (food)      = " + "  ".join(f"{v:+.2f}" for v in r["mu_host"]))
    L.append(f"μ worker (workplace)= " + "  ".join(f"{v:+.2f}" for v in r["mu_worker"]))
    L.append(f"distance(host,worker) = {r['distance']}  ·  incomplete-context → HTTP {r['missing_context_status']} (expect 422)")
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
