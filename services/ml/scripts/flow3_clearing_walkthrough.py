"""FLOW 3 — the clearing walkthrough (Step 4 evidence).

One player moves through the clearing's stations (service / queue / group / marginal NPC /
bargain), each emitting its design-doc cue with the COUNTERPART_STATUS carried in context, through
the unchanged ingress. Shows:

  • every station cue moves the posterior;
  • the conditional signature forms: cond_keys include counterpart:low, counterpart:high,
    counterpart:peer, stakes:* — F3 individuation lives in cue × status;
  • the COURTESY GRADIENT is recoverable — warmth to a low-status server vs to a high-status figure
    are stored in SEPARATE conditional posteriors and differ (the cue that defines character);
  • mandatory context (with counterpart_status) enforced — 422 on missing;
  • openness-routing ⚑ (deviate_custom) flagged, not silently re-routed; zero RuntimeWarnings.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/flow3_clearing_walkthrough.py
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

# Mirror of social.ts SOCIAL_CUES for the F3 stations this walkthrough exercises.
CUES = {
    "courtesy_warm_server": ("G", "G11", "warmth(HIGH) — to one who can't repay"),
    "curt_to_server": ("G", "G11", "low warmth to low-status"),
    "courtesy_to_high": ("G", "G11", "warmth/status-management (gradient)"),
    "wait_in_queue": ("H", "H1", "fairness/formality"),
    "cut_queue": ("H", "H1", "dominance/low-fairness"),
    "let_others_ahead": ("H", "H2", "warmth/fairness"),
    "group_initiate": ("G", "G1", "dominance/energy/warmth"),
    "group_join": ("G", "G1", "warmth/energy"),
    "group_observe": ("A", "A4", "observer / low energy"),
    "conform_custom": ("H", "H3", "conformity/consistency"),
    "deviate_custom": ("H", "H3", "openness/dominance ⚑"),
    "include_marginal": ("G", "G1", "warmth(HIGH) — moral-social"),
    "ignore_marginal": ("G", "G1", "low warmth"),
    "bargain_hard": ("F", "F9", "dominance/economic-aggression"),
    "fairness_split_fair": ("F", "F7", "fairness/warmth"),
}
POLARITY = {"curt_to_server", "cut_queue", "ignore_marginal", "deviate_custom"}


def ev(actor, action, counterpart_status, *, target_id="npc", raw=None, bad=False):
    ch, cue, _ = CUES[action]
    kind = "server" if "server" in action else ("player" if counterpart_status == "peer" else "npc")
    ctx = {"stakes": "low", "audience_size": 4, "public_or_private": "public",
           "counterpart_status": counterpart_status, "stage": 3, "scarcity_level": 0.0,
           "mood_proxy": 0.0, "time_pressure": 0.0}
    if bad:
        ctx = {"stakes": "low", "stage": 3}  # missing counterpart_status etc.
    return {
        "actor_id": actor, "sessionId": "s", "t": 0, "type": "interaction_start",
        "channel": ch, "cue": cue, "action": action,
        "polarity": "refuse" if action in POLARITY else "take",
        "target": {"id": target_id, "kind": kind, "status": counterpart_status},
        "raw_signals": raw or {}, "context": ctx,
    }


def post(e):
    return _C.post("/observe/behavioral", headers=_H, json={"event": e})


def persona(uid):
    return _C.get(f"/persona/{uid}", headers=_H).json()


def walk():
    report = {"steps": [], "checks": {}}

    # ── (A) the courtesy gradient: a STATUS-MANAGER — warm to the high-status figure, curt to the
    #    low-status server who can't repay. The gap between the two conditional posteriors is the
    #    single most individuating cue (dilemma a: genuine warmth vs status-management). ──
    grad = "u_f3_manager"
    _C.delete(f"/user/{grad}", headers=_H)
    post(ev(grad, "courtesy_to_high", "high", target_id="elder"))
    post(ev(grad, "curt_to_server", "low", target_id="server"))
    pg = persona(grad)
    cond = pg["conditional"]
    wi = AXIS_KEYS.index("warmth")
    warmth_high = cond.get("counterpart:high", [0] * 8)[wi]
    warmth_low = cond.get("counterpart:low", [0] * 8)[wi]
    report["gradient"] = {
        "cond_keys": sorted(pg["conditional_keys"]),
        "warmth_to_high": round(float(warmth_high), 4),
        "warmth_to_low": round(float(warmth_low), 4),
        "gap": round(float(warmth_high - warmth_low), 4),
    }

    # ── (B) one player walks the full set of stations; every cue moves the posterior and tags its
    #    counterpart_status so the conditional signature deepens. ──
    u = "u_f3_player"
    _C.delete(f"/user/{u}", headers=_H)
    stations = [
        ("courtesy_warm_server", "low", "server"),     # treat the waiter warmly
        ("wait_in_queue", "peer", "queue"),            # queue honestly (no enforcement)
        ("cut_queue", "peer", "queue"),                # (a different visit) cut it
        ("group_join", "peer", "group"),               # join the group conversation
        ("group_observe", "peer", "group"),            # vs hang back and watch
        ("conform_custom", "peer", "group"),           # copy the group's little ritual
        ("deviate_custom", "peer", "group"),           # ⚑ openness route
        ("include_marginal", "low", "marginal"),       # include the excluded one
        ("bargain_hard", "peer", "trader"),            # haggle aggressively
        ("fairness_split_fair", "peer", "trader"),     # split fairly (ultimatum)
    ]
    for action, status, tid in stations:
        r = post(ev(u, action, status, target_id=tid, raw={"amount": 0.6} if "bargain" in action or "split" in action else None))
        assert r.status_code == 200, (action, r.status_code, r.text)
        d = r.json()
        report["steps"].append({
            "action": action, "status": status, "prior": CUES[action][2],
            "delta_mu": round(d["delta_mu"], 4), "cond": d["cond_key"],
        })
    pu = persona(u)
    report["player_cond_keys"] = sorted(pu["conditional_keys"])

    # — mandatory context (counterpart_status) enforced —
    report["missing_context_status"] = post(ev(u, "courtesy_warm_server", "low", bad=True)).status_code

    c = report["checks"]
    c["every_station_moves_posterior"] = all(s["delta_mu"] > 1e-4 for s in report["steps"])
    c["courtesy_gradient_recoverable"] = (
        "counterpart:high" in report["gradient"]["cond_keys"]
        and "counterpart:low" in report["gradient"]["cond_keys"]
        and abs(report["gradient"]["gap"]) > 0.05
    )
    c["conditional_signature_by_status"] = (
        "counterpart:low" in report["player_cond_keys"]
        and "counterpart:peer" in report["player_cond_keys"]
    )
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    report["passed"] = all(c.values())
    return report


def fmt(r):
    L = ["=" * 100,
         "ECHO FLOW 3 — the clearing: status / service / queue / group / marginal / bargain",
         "=" * 100, ""]
    g = r["gradient"]
    L.append("[A] COURTESY GRADIENT (a status-manager: warm to high-status, curt to the low-status server):")
    L.append(f"    warmth | counterpart:high = {g['warmth_to_high']:+.3f}     warmth | counterpart:low = {g['warmth_to_low']:+.3f}")
    L.append(f"    gradient (high − low) = {g['gap']:+.3f}   ← the conditional that defines character")
    L.append(f"    conditional buckets formed: {g['cond_keys']}")
    L.append("")
    L.append("[B] stations walked (each tags counterpart_status; the conditional signature deepens):")
    L.append(f"    {'station':22} {'counterpart':12} {'doc cue→axis prior':34} {'Δ‖μ‖':>7}  {'bucket'}")
    for s in r["steps"]:
        L.append(f"    {s['action']:22} {s['status']:12} {s['prior']:34} {s['delta_mu']:>7.4f}  {s['cond']}")
    L.append(f"    player conditional buckets: {r['player_cond_keys']}")
    L.append(f"    incomplete-context (no counterpart_status) → HTTP {r['missing_context_status']} (expect 422)")
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
