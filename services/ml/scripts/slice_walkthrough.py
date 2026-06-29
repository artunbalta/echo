"""Stage 0 + Stage 4 vertical-slice walkthrough (deliverable #7, headless end-to-end).

Drives REAL BehavioralEvent envelopes through the REAL ML pipeline
(FastAPI ``/observe/behavioral`` → ``ingest.event_to_observation`` → ``persona.observe`` →
``featurize_raw`` → robust Kalman ``Posterior``) and shows:

  • Stage 0 (solitary island) acts move the posterior.
  • Stage 4 (town) acts move it, AND a Channel-K *refusal* moves it too (non-action is data).
  • One social encounter yields TWO independent per-actor measurements, siloed by actor_id.
  • An event with an incomplete context envelope is rejected (mandatory context).

Run:  ./.venv/bin/python scripts/slice_walkthrough.py     (zero keys, offline)
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

_C = TestClient(app)
_H = {"Authorization": f"Bearer {SETTINGS.ml_token}"}


def ctx(**over):
    """A fully-populated context envelope (all 8 fields mandatory). Override as needed."""
    base = dict(stakes="low", audience_size=0, public_or_private="private",
                counterpart_status="none", stage=0, scarcity_level=0.3,
                mood_proxy=0.0, time_pressure=0.0)
    base.update(over)
    return base


def ev(actor, channel, action, *, cue="", polarity="take", target=None, raw=None, context=None):
    return {
        "actor_id": actor, "t": 0, "channel": channel, "cue": cue, "action": action,
        "polarity": polarity, "target": target or {"id": "", "kind": "none", "status": "none"},
        "raw_signals": raw or {}, "context": context or ctx(),
    }


def post(event):
    return _C.post("/observe/behavioral", headers=_H, json={"event": event})


def persona_mu(uid):
    r = _C.get(f"/persona/{uid}", headers=_H)
    return np.array(r.json()["persona"]["mu"], dtype=float)


def stage0_episode(actor):
    s0 = lambda **k: ctx(stage=0, public_or_private="private", counterpart_status="none", **k)
    return [
        ev(actor, "A", "dwell", cue="A4", target={"id": "book_cairn", "kind": "station"},
           raw={"dwell_ms": 6000}, context=s0()),
        ev(actor, "A", "dwell", cue="A4", target={"id": "berry_bush", "kind": "station"},
           raw={"dwell_ms": 5000}, context=s0(scarcity_level=0.6)),
        ev(actor, "F", "save_seed", cue="F1", target={"id": "grain", "kind": "resource"},
           raw={"decision_latency_ms": 2200}, context=s0(stakes="medium")),
        ev(actor, "F", "wager", cue="F3", target={"id": "tidepool", "kind": "resource"},
           raw={"variance": 0.8}, context=s0(stakes="medium")),
        ev(actor, "D", "pet_talk", cue="D11", target={"id": "pet", "kind": "pet"},
           raw={"amount": 0.8, "valence": 0.7}, context=s0()),
        ev(actor, "A", "dwell", cue="A4", target={"id": "bedroll", "kind": "station"},
           raw={"dwell_ms": 4000}, context=s0()),
    ]


def stage4_episode(actor):
    return [
        # courtesy to a low-status server who cannot reciprocate (top individuating cue)
        ev(actor, "G", "thank_server", cue="G11", target={"id": "srv1", "kind": "server", "status": "low"},
           raw={"latency_ms": 900, "edits": 0},
           context=ctx(stage=4, public_or_private="public", audience_size=3, counterpart_status="low")),
        # wait honestly in a cuttable queue
        ev(actor, "H", "wait_in_queue", cue="H1", target={"id": "market", "kind": "queue"},
           context=ctx(stage=4, public_or_private="public", audience_size=4, counterpart_status="peer")),
        # bargain at the market
        ev(actor, "F", "bargain", cue="F9", target={"id": "stall", "kind": "npc", "status": "peer"},
           raw={"amount": 0.6}, context=ctx(stage=4, public_or_private="public", audience_size=2,
                                            counterpart_status="peer", stakes="medium")),
        # approach a peer in the plaza
        ev(actor, "G", "approach", cue="G1", target={"id": "p_kai", "kind": "player", "status": "peer"},
           raw={"distance": 1.2}, context=ctx(stage=4, public_or_private="public", audience_size=5,
                                              counterpart_status="peer")),
    ]


def walk():
    report = {"steps": [], "checks": {}}

    # — Stage 0 —
    a = "u_walk_alice"
    _C.delete(f"/user/{a}", headers=_H)
    s0_deltas = []
    for e in stage0_episode(a):
        r = post(e)
        assert r.status_code == 200, (r.status_code, r.text)
        d = r.json()["delta_mu"]
        s0_deltas.append(d)
        report["steps"].append(("S0", e["action"], e["polarity"], round(d, 4)))
    s0_mu = persona_mu(a)

    # — Stage 4 (take acts) —
    s4_deltas = []
    for e in stage4_episode(a):
        r = post(e)
        assert r.status_code == 200, (r.status_code, r.text)
        d = r.json()["delta_mu"]
        s4_deltas.append(d)
        report["steps"].append(("S4", e["action"], e["polarity"], round(d, 4)))

    # — Stage 4 refusal (Channel K): declines a social bid; non-action must move the posterior —
    refusal = ev(a, "K", "declines_social", cue="K1", polarity="refuse",
                 target={"id": "stranger1", "kind": "npc", "status": "stranger"},
                 context=ctx(stage=4, public_or_private="public", audience_size=6,
                             counterpart_status="stranger"))
    rr = post(refusal)
    report["refusal"] = {"status": rr.status_code, "polarity": rr.json().get("polarity"),
                         "delta_mu": round(rr.json().get("delta_mu", 0.0), 4)}
    report["steps"].append(("S4", refusal["action"], "refuse", report["refusal"]["delta_mu"]))

    # conditional buckets formed for this actor
    cond = _C.get(f"/persona/{a}", headers=_H).json()
    report["cond_keys"] = sorted(cond.get("conditional_keys", []))

    # — mandatory context: an incomplete envelope is rejected —
    bad = ev(a, "A", "dwell", context={"stakes": "low"})  # missing 7 of 8 fields
    br = post(bad)
    report["missing_context_status"] = br.status_code

    # — per-actor siloing: ONE encounter, TWO independent measurements —
    alice, bob = "u_walk_warm", "u_walk_curt"
    _C.delete(f"/user/{alice}", headers=_H)
    _C.delete(f"/user/{bob}", headers=_H)
    enc_ctx = ctx(stage=4, public_or_private="public", audience_size=2, counterpart_status="peer")
    post(ev(alice, "F", "share", cue="F7", target={"id": bob, "kind": "player", "status": "peer"},
            raw={"amount": 0.9}, context=enc_ctx))                       # alice: warm/generous
    post(ev(bob, "K", "declines_social", cue="K1", polarity="refuse",
            target={"id": alice, "kind": "player", "status": "peer"}, context=enc_ctx))  # bob: withdraws
    mu_alice, mu_bob = persona_mu(alice), persona_mu(bob)
    report["per_actor"] = {
        "alice_norm": round(float(np.linalg.norm(mu_alice)), 4),
        "bob_norm": round(float(np.linalg.norm(mu_bob)), 4),
        "distance": round(float(np.linalg.norm(mu_alice - mu_bob)), 4),
    }

    # — checks —
    c = report["checks"]
    c["stage0_acts_move_posterior"] = all(d > 1e-4 for d in s0_deltas)
    c["stage4_acts_move_posterior"] = all(d > 1e-4 for d in s4_deltas)
    c["refusal_accepted_and_moves"] = (report["refusal"]["status"] == 200
                                       and report["refusal"]["polarity"] == "refuse"
                                       and report["refusal"]["delta_mu"] > 1e-4)
    c["missing_context_rejected_422"] = report["missing_context_status"] == 422
    c["conditional_buckets_formed"] = len(report["cond_keys"]) >= 2
    c["per_actor_independent"] = (report["per_actor"]["distance"] > 0.05
                                  and report["per_actor"]["alice_norm"] > 1e-3
                                  and report["per_actor"]["bob_norm"] > 1e-3)
    report["s0_mu"] = s0_mu.tolist()
    report["passed"] = all(c.values())
    return report


def format_report(r):
    L = ["=" * 78, "ECHO VERTICAL SLICE — Stage 0 + Stage 4, real events → real posterior", "=" * 78, ""]
    L.append(f"{'stage':5} {'action':16} {'polarity':8} {'Δ‖μ‖':>8}")
    for stage, action, pol, d in r["steps"]:
        L.append(f"{stage:5} {action:16} {pol:8} {d:>8.4f}")
    L.append("")
    L.append(f"Stage-0 posterior μ after solo episode: "
             + "  ".join(f"{v:+.2f}" for v in r["s0_mu"]))
    L.append(f"Conditional buckets formed: {r['cond_keys']}")
    L.append(f"Refusal (Channel K): {r['refusal']}")
    L.append(f"Incomplete-context event → HTTP {r['missing_context_status']} (expect 422)")
    pa = r["per_actor"]
    L.append(f"Per-actor siloing: warm μ‖{pa['alice_norm']}‖  curt μ‖{pa['bob_norm']}‖  "
             f"distance {pa['distance']} (one encounter, two independent reads)")
    L.append("")
    L.append("-- CHECKS --")
    for k, v in r["checks"].items():
        L.append(f"  [{'PASS' if v else 'FAIL'}] {k}")
    L.append("")
    L.append(f"RESULT: {'PASS ✅' if r['passed'] else 'FAIL ❌'}")
    L.append("=" * 78)
    return "\n".join(L)


if __name__ == "__main__":
    rep = walk()
    print(format_report(rep))
    sys.exit(0 if rep["passed"] else 1)
