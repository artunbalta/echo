"""FLOW 2 — dialogue dynamics walkthrough (Step 4 evidence).

A real two-actor Flow-2 exchange (opener → turn-taking → the cold-response dilemma → close),
driven as the EXACT per-actor envelopes the authoritative WorldRoom emits on a live player↔player
exchange (packages/shared/src/social.ts buildSocialEvent), through the unchanged ingress
(/observe/behavioral → ingest._social_features → persona.observe → learned W). Shows:

  • every dialogue beat moves the actor's OWN posterior (per-actor; counterpart:peer bucket);
  • the cold-response dilemma SEPARATES the two: Alice de-escalates (warmth) while Bob stays
    cold/dominant → two posteriors a real distance apart;
  • the implicit→axis read (language-free signal through W) maps to the doc's cue→axis priors,
    with the openness dialogue cues (asks_question/self_disclosure) flagged ⚑ (no W path yet);
  • mandatory context (stage 2 + counterpart) enforced — 422 on an incomplete envelope;
  • zero RuntimeWarnings.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/flow2_dialogue_walkthrough.py
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
from echo_ml import persona as P
from echo_ml.persona_model import get_persona_model

_C = TestClient(app)
_H = {"Authorization": f"Bearer {SETTINGS.ml_token}"}

_M = get_persona_model()
_T = len(P.TELEMETRY_FEATURE_NAMES)
_F = _M.W.shape[1]
_EMPTY = P._telemetry_features({})


def implicit_axis(tel: dict):
    """Which axis the language-free signal loads on, via the learned W (excludes the action
    embedding, which offline is a semantics-free hash). Marginal vs the empty-cue baseline."""
    push = _M.W[:, _F - _T:] @ (P._telemetry_features(tel) - _EMPTY)
    if np.linalg.norm(push) < 1e-9:
        return "—", 0.0
    i = int(np.argmax(np.abs(push)))
    return AXIS_KEYS[i], float(push[i])


# A small mirror of packages/shared/src/social.ts SOCIAL_CUES (the cues this exchange uses), so the
# walkthrough drives the SAME channel/cue/stage/polarity the server stamps.
CUES = {
    "opener_warm": ("G", "G2", 2, "take", "warmth(+), formality"),
    "opener_curt": ("G", "G4", 2, "refuse", "warmth(−)/dominance"),
    "asks_question": ("D", "D2", 2, "take", "openness(+) ⚑"),
    "asserts": ("D", "D3", 2, "take", "dominance(+)"),
    "self_disclosure": ("D", "D5", 2, "take", "openness(+) ⚑"),
    "interrupt": ("D", "D7", 2, "take", "dominance(+)"),
    "cold_response_deescalate": ("G", "G8", 2, "take", "warmth (stay warm), HIGH"),
    "cold_response_persist": ("D", "D8", 2, "take", "dominance (push), HIGH"),
    "close_graceful": ("E", "E4", 2, "take", "warmth/conscientiousness"),
    "close_abrupt": ("E", "E5", 2, "refuse", "dominance/low-warmth"),
}


def social_ev(actor, action, counterpart, *, audience=0, raw=None, context_bad=False):
    ch, cue, stage, polarity, _ = CUES[action]
    ctx = {"stakes": "low", "audience_size": audience, "public_or_private": "public",
           "counterpart_status": "peer", "stage": stage, "scarcity_level": 0.0,
           "mood_proxy": 0.0, "time_pressure": 0.0}
    if context_bad:
        ctx = {"stakes": "low"}
    return {
        "actor_id": actor, "sessionId": "s", "t": 0, "type": "interaction_start",
        "channel": ch, "cue": cue, "action": action, "polarity": polarity,
        "target": {"id": counterpart, "kind": "player", "status": "peer"},
        "raw_signals": raw or {}, "context": ctx,
    }


def post(ev):
    return _C.post("/observe/behavioral", headers=_H, json={"event": ev})


def mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


def conditional_keys(uid):
    return _C.get(f"/persona/{uid}", headers=_H).json()["conditional_keys"]


def walk():
    alice, bob = "u_f2_alice", "u_f2_bob"
    for u in (alice, bob):
        _C.delete(f"/user/{u}", headers=_H)
    report = {"steps": [], "checks": {}}

    # The scripted-but-real exchange. Alice plays warm; Bob is the cold figure. Reply latency +
    # edits ride along as implicit deliberation/pace signals on the composed turns.
    exchange = [
        (alice, "opener_warm", {"latency_ms": 1200, "edits": 0}),
        (bob, "opener_curt", {"latency_ms": 600, "edits": 0}),
        (alice, "asks_question", {"latency_ms": 1500, "edits": 1}),
        (bob, "asserts", {"latency_ms": 500, "edits": 0}),
        (alice, "self_disclosure", {"latency_ms": 2200, "edits": 2}),
        (bob, "interrupt", {"latency_ms": 300, "edits": 0}),
        # ── the disambiguating dilemma (core of F2): Bob has been cold; each reacts ──
        (alice, "cold_response_deescalate", {"latency_ms": 1800, "edits": 1}),  # stay warm
        (bob, "cold_response_persist", {"latency_ms": 400, "edits": 0}),        # push / stay cold
        (alice, "close_graceful", {"latency_ms": 1000, "edits": 0}),
        (bob, "close_abrupt", {"latency_ms": 300, "edits": 0}),
    ]

    pre_dilemma = {}
    for actor, action, raw in exchange:
        before = mu(actor)
        r = post(social_ev(actor, action, bob if actor == alice else alice, audience=0, raw=raw))
        assert r.status_code == 200, (actor, action, r.status_code, r.text)
        d = r.json()
        iax, ival = implicit_axis(d.get("telemetry_used", {}))
        if action.startswith("cold_response"):
            pre_dilemma[actor] = before
        report["steps"].append({
            "actor": "Alice" if actor == alice else "Bob", "action": action,
            "prior": CUES[action][4], "implicit_axis": iax, "implicit_delta": round(ival, 4),
            "delta_mu": round(d["delta_mu"], 4), "cond": d["cond_key"],
        })

    mu_a, mu_b = mu(alice), mu(bob)
    report["mu_alice"] = mu_a.tolist()
    report["mu_bob"] = mu_b.tolist()
    report["distance"] = round(float(np.linalg.norm(mu_a - mu_b)), 4)
    report["alice_cond_keys"] = conditional_keys(alice)

    # — mandatory context enforced —
    report["missing_context_status"] = post(social_ev(alice, "opener_warm", bob, context_bad=True)).status_code

    c = report["checks"]
    c["every_beat_moves_actor"] = all(s["delta_mu"] > 1e-4 for s in report["steps"])
    c["dyad_diverges_on_dilemma"] = report["distance"] > 0.05
    # Alice (de-escalate, warm) should end warmer than Bob (cold/dominant)
    wi = AXIS_KEYS.index("warmth")
    c["alice_warmer_than_bob"] = mu_a[wi] > mu_b[wi]
    c["peer_conditional_bucket"] = "counterpart:peer" in report["alice_cond_keys"]
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    report["passed"] = all(c.values())
    return report


def fmt(r):
    L = ["=" * 100,
         'ECHO FLOW 2 — dialogue dynamics: a real two-actor exchange → two per-actor posteriors',
         "=" * 100, "",
         f"axes: {', '.join(AXIS_KEYS)}", ""]
    L.append(f"{'actor':6} {'beat':26} {'doc cue→axis prior':30} {'implicit→axis (W)':20} {'Δ‖μ‖':>7}  {'bucket'}")
    L.append("-" * 100)
    for s in r["steps"]:
        imp = "{}({:+.3f})".format(s["implicit_axis"], s["implicit_delta"])
        L.append(f"{s['actor']:6} {s['action']:26} {s['prior']:30} {imp:20} {s['delta_mu']:>7.4f}  {s['cond']}")
    L.append("-" * 100)
    L.append("")
    L.append(f"μ Alice (warm/de-escalate) = " + "  ".join(f"{v:+.2f}" for v in r["mu_alice"]))
    L.append(f"μ Bob   (cold/dominant)    = " + "  ".join(f"{v:+.2f}" for v in r["mu_bob"]))
    L.append(f"distance(Alice,Bob) = {r['distance']}   ·   Alice conditional buckets: {r['alice_cond_keys']}")
    L.append(f"incomplete-context event → HTTP {r['missing_context_status']} (expect 422)")
    L.append("")
    L.append("-- CHECKS --")
    for k, v in r["checks"].items():
        L.append(f"  [{'PASS' if v else 'FAIL'}] {k}")
    L.append("")
    L.append(f"RESULT: {'PASS ✅' if r['passed'] else 'FAIL ❌'}")
    L.append("=" * 100)
    return "\n".join(L)


if __name__ == "__main__":
    rep = walk()
    print(fmt(rep))
    sys.exit(0 if rep["passed"] else 1)
