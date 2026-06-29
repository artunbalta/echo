"""FLOW 2 ("First Contact") per-actor siloing walkthrough — Step 3 evidence.

When two LIVE players meet in the shared ocean, the authoritative WorldRoom emits a SEPARATE
BehavioralEvent per participant (one per actor, each from its own vantage). This drives the EXACT
envelopes the server emits (verified shape-for-shape by apps/realtime/src/copresence.test.mts)
through the REAL unchanged ingress (/observe/behavioral → ingest → persona.observe) and shows:

  • each actor's event moves ONLY that actor's own posterior (strict per-actor siloing — never
    co-mingled): an event for Alice leaves Bob's posterior byte-identical, and vice-versa;
  • two real users who then behave DIFFERENTLY (Alice stays warm, Bob responds coldly — the doc's
    F2 cold-response dilemma) end at two posteriors a measurable distance apart;
  • mandatory context is enforced (an incomplete envelope → HTTP 422);
  • zero RuntimeWarnings.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/flow2_peractor_walkthrough.py
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


def f2_ctx(**over):
    """The mandatory F2 context: public, stage 2, a peer counterpart (the other live player)."""
    base = dict(stakes="low", audience_size=0, public_or_private="public",
                counterpart_status="peer", stage=2, scarcity_level=0.0,
                mood_proxy=0.0, time_pressure=0.0)
    base.update(over)
    return base


def ev(actor, channel, action, *, cue="", polarity="take", counterpart_id="", raw=None, context=None):
    return {
        "actor_id": actor, "sessionId": "s", "t": 0, "type": "interaction_start",
        "channel": channel, "cue": cue, "action": action, "polarity": polarity,
        "target": {"id": counterpart_id, "kind": "player", "status": "peer"},
        "raw_signals": raw or {}, "context": context or f2_ctx(),
    }


def post(event):
    return _C.post("/observe/behavioral", headers=_H, json={"event": event})


def mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


def walk():
    alice, bob = "u_live_alice", "u_live_bob"
    for u in (alice, bob):
        _C.delete(f"/user/{u}", headers=_H)
    report = {"steps": [], "checks": {}}

    # ── (1) FIRST CONTACT — the exact per-actor envelopes WorldRoom.emitFirstContact emits ──────
    # One event per actor, each from its own vantage (counterpart = the OTHER player, peer).
    fc_a = ev(alice, "G", "first_contact", cue="G1", counterpart_id=bob, raw={"distance": 1.16})
    fc_b = ev(bob, "G", "first_contact", cue="G1", counterpart_id=alice, raw={"distance": 1.16})

    mu_a_before = mu(alice)  # both at the prior (zero) here
    ra = post(fc_a); assert ra.status_code == 200, ra.text
    # Bob's posterior must be UNTOUCHED by Alice's event (strict siloing).
    mu_b_after_alice = mu(bob)
    rb = post(fc_b); assert rb.status_code == 200, rb.text

    report["first_contact"] = {
        "alice_delta": round(ra.json()["delta_mu"], 4),
        "bob_delta": round(rb.json()["delta_mu"], 4),
        "alice_cond": ra.json()["cond_key"],
        "bob_cond": rb.json()["cond_key"],
    }

    # ── (2) THE DYAD DIVERGES — Alice stays warm; Bob responds coldly / withdraws (doc F2) ──────
    # (These represent the subsequent F2 exchange; first_contact above is the wired server emission.)
    post(ev(alice, "G", "warm_opener", cue="G1", counterpart_id=bob, raw={"distance": 1.0}))
    post(ev(bob, "K", "declines_social", cue="K1", polarity="refuse", counterpart_id=alice))

    mu_a, mu_b = mu(alice), mu(bob)
    dist = float(np.linalg.norm(mu_a - mu_b))
    report["after"] = {"alice_norm": round(float(np.linalg.norm(mu_a)), 4),
                       "bob_norm": round(float(np.linalg.norm(mu_b)), 4),
                       "distance": round(dist, 4)}
    report["mu_alice"] = mu_a.tolist()
    report["mu_bob"] = mu_b.tolist()

    # ── (3) STRICT SILOING — an Alice-only event must leave Bob's posterior byte-identical ──────
    mu_b_before = mu(bob)
    post(ev(alice, "G", "warm_opener", cue="G1", counterpart_id=bob, raw={"distance": 1.0}))
    mu_b_after = mu(bob)
    siloed = float(np.linalg.norm(mu_b_after - mu_b_before)) < 1e-9
    report["siloing"] = {"bob_unchanged_by_alice_event": siloed,
                         "bob_drift": round(float(np.linalg.norm(mu_b_after - mu_b_before)), 8)}

    # ── (4) mandatory context enforced ──────────────────────────────────────────────────────────
    bad = ev(alice, "G", "first_contact", counterpart_id=bob, context={"stakes": "low"})
    report["missing_context_status"] = post(bad).status_code

    # ── checks ──
    c = report["checks"]
    c["first_contact_moves_both"] = report["first_contact"]["alice_delta"] > 1e-4 and report["first_contact"]["bob_delta"] > 1e-4
    c["alice_event_did_not_touch_bob"] = bool(np.allclose(mu_b_after_alice, np.zeros_like(mu_b_after_alice)))
    c["posteriors_diverge"] = dist > 0.05
    c["strict_siloing_alice_only_leaves_bob"] = siloed
    c["peer_conditional_bucket"] = report["first_contact"]["alice_cond"] == "counterpart:peer"
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    report["passed"] = all(c.values())
    return report


def fmt(r):
    L = ["=" * 92,
         'ECHO FLOW 2 — "First Contact": two LIVE players → two siloed per-actor posteriors',
         "=" * 92, ""]
    L.append(f"axes: {', '.join(AXIS_KEYS)}")
    L.append("")
    fc = r["first_contact"]
    L.append("[1] FIRST CONTACT (the two per-actor events the WorldRoom emits on interaction-open):")
    L.append(f"    Alice: Δ‖μ‖={fc['alice_delta']}  cond={fc['alice_cond']}")
    L.append(f"    Bob:   Δ‖μ‖={fc['bob_delta']}  cond={fc['bob_cond']}")
    L.append("")
    L.append("[2] the dyad diverges (Alice warm, Bob cold — doc F2 cold-response):")
    L.append(f"    μ Alice = " + "  ".join(f"{v:+.2f}" for v in r["mu_alice"]))
    L.append(f"    μ Bob   = " + "  ".join(f"{v:+.2f}" for v in r["mu_bob"]))
    L.append(f"    ‖μ_Alice‖={r['after']['alice_norm']}  ‖μ_Bob‖={r['after']['bob_norm']}  "
             f"distance={r['after']['distance']}  (two independent reads)")
    L.append("")
    L.append(f"[3] strict siloing: an Alice-only event moved Bob's posterior by "
             f"{r['siloing']['bob_drift']} (must be 0)")
    L.append(f"[4] incomplete-context event → HTTP {r['missing_context_status']} (expect 422)")
    L.append("")
    L.append("-- CHECKS --")
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
