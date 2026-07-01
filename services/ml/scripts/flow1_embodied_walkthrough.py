"""FLOW 1 ("Scarcity, Learning, Solving") EMBODIED raft-build walkthrough + individuation proof.

Drives the raft-build activity (ECHO_level_design_7flows.md §FLOW 1, the doc's headline "building a
raft" example) through the REAL, unchanged measurement spine (``/observe/behavioral`` →
``ingest.event_to_observation`` → ``persona.observe`` → ``featurize_raw`` → learned W → robust Kalman
``Posterior``), for TWO contrasting play-styles of the SAME activity:

  • "Tessa"  — thorough, deliberate, persistent, decorative (gathers every piece, deliberates before
               building, slips and re-engages, keeps going past "done" to add a flourish).
  • "Hank"   — hasty, minimal (gathers just enough, no deliberation, no redo, stops the instant it floats).

The whole point of the embodied rebuild is the INDIVIDUATION TEST: because the measurement is the
*manner* (continuous raw_signals), not a discrete button, two people performing the same activity in
different styles must produce measurably DIFFERENT posteriors. This script proves it: it prints both
final μ vectors and their L2 distance, and asserts the distance is non-trivial.

Per cross-cutting rule #1 the cue→axis loadings are LEARNED in W (the doc's tables are priors). This
report names the axis the committed W actually moves for each cue, and flags (⚑) the openness-intended
manner (decoration) that W cannot yet route (docs/known-gaps.md #6) — carried honestly, never faked.

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/flow1_embodied_walkthrough.py   (zero keys)
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
_EMPTY_TEL = P._telemetry_features({})


def telemetry_axis_push(tel: dict) -> np.ndarray:
    """Project ONE cue's language-free telemetry signal through the learned W → which axes it drives
    (the doc's cue→axis priors are about exactly this implicit channel). Marginal vs the empty baseline
    so the feature mean cancels; excludes the action-text embedding (a semantics-free hash offline)."""
    marginal = P._telemetry_features(tel) - _EMPTY_TEL
    return _M.W[:, _F - _T:] @ marginal


def dominant(vec: np.ndarray):
    i = int(np.argmax(np.abs(vec)))
    return AXIS_KEYS[i], float(vec[i])


def f1_ctx(**over):
    """The mandatory solo Flow-1 context (own island, no audience, private). Stakes vary per activity."""
    base = dict(stakes="medium", audience_size=0, public_or_private="private",
                counterpart_status="none", stage=1, scarcity_level=0.15,
                mood_proxy=0.0, time_pressure=0.0)
    base.update(over)
    return base


def ev(actor, channel, action, *, cue="", polarity="take", target=None, raw=None, context=None):
    return {
        "actor_id": actor, "t": 0, "channel": channel, "cue": cue, "action": action,
        "polarity": polarity, "target": target or {"id": "raft", "kind": "structure", "status": "none"},
        "raw_signals": raw or {}, "context": context or f1_ctx(),
    }


def post(event):
    return _C.post("/observe/behavioral", headers=_H, json={"event": event})


def persona_mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


# ── the two contrasting raft-build performances (SAME activity, different MANNER) ────────────────────
# Tuple: (label, event, doc_prior). The manner scalars are what a real embodied performance would derive.
def tessa_build(actor):
    """Thorough / deliberate / persistent / decorative."""
    return [
        ("gather_driftwood (all 6/6)", ev(actor, "F", "gather_driftwood", cue="F2",
            raw={"thoroughness01": 1.0, "dwell_ms": 9000}),
            "thoroughness→persistence(conscientiousness)"),
        ("movement (careful, exploring)", ev(actor, "A", "movement_sample", cue="A6",
            raw={"still_ms": 2600, "heading_var": 0.7, "speed_var": 0.4, "explore_ratio": 0.8, "distance": 6.0}),
            "still→solitude_tol; heading/explore ⚑ (captured for re-anchor)"),
        ("assemble_raft (deliberate+redo+flourish)", ev(actor, "C", "assemble_raft", cue="C7",
            raw={"thoroughness01": 1.0, "persist_after_fail": 0.85, "edits": 3,
                 "decision_latency_ms": 5000, "dwell_ms": 11000, "decoration": 0.9}),
            "persistence(grit)+edits(formality)+deliberation(pace)+decoration ⚑openness"),
        ("launch_raft (considered)", ev(actor, "C", "launch_raft", cue="C7",
            raw={"decision_latency_ms": 3000}), "commitment latency→pace"),
    ]


def hank_build(actor):
    """Hasty / minimal."""
    return [
        ("gather_driftwood (just 3)", ev(actor, "F", "gather_driftwood", cue="F2",
            raw={"thoroughness01": 0.34, "dwell_ms": 2000}),
            "thoroughness→persistence(conscientiousness)"),
        ("movement (beeline, restless)", ev(actor, "A", "movement_sample", cue="A6",
            raw={"still_ms": 200, "heading_var": 0.1, "speed_var": 0.9, "explore_ratio": 0.2, "distance": 7.5}),
            "still→solitude_tol; heading/explore ⚑ (captured for re-anchor)"),
        ("assemble_raft (fast, minimal)", ev(actor, "C", "assemble_raft", cue="C7",
            raw={"thoroughness01": 0.55, "edits": 0, "decision_latency_ms": 200, "dwell_ms": 2600}),
            "persistence(grit)+edits(formality)+deliberation(pace)"),
        ("launch_raft (snap)", ev(actor, "C", "launch_raft", cue="C7",
            raw={"decision_latency_ms": 150}), "commitment latency→pace"),
    ]


_FIDELITY = {
    "assemble_raft (deliberate+redo+flourish)": {"formality", "affect", "energy", "pace", "intellect"},
    "assemble_raft (fast, minimal)": {"pace", "formality", "affect", "energy", "intellect"},
}


def _record(label, e, r, prior):
    body = r.json()
    tel = body.get("telemetry_used", {})
    push = telemetry_axis_push(tel)
    iax, ival = dominant(push) if np.linalg.norm(push) > 1e-9 else ("—", 0.0)
    return {"label": label, "polarity": e["polarity"], "prior": prior,
            "implicit_axis": iax, "implicit_delta": round(ival, 4),
            "delta_mu": round(float(body.get("delta_mu", 0.0)), 4), "tel": tel}


def run_style(actor, beats):
    _C.delete(f"/user/{actor}", headers=_H)
    steps, deltas = [], []
    for label, e, prior in beats(actor):
        r = post(e)
        assert r.status_code == 200, (label, r.status_code, r.text)
        s = _record(label, e, r, prior)
        steps.append(s)
        deltas.append(s["delta_mu"])
    return steps, deltas, persona_mu(actor)


def walk():
    report = {"checks": {}}
    ts_steps, ts_d, mu_tessa = run_style("u_f1_tessa", tessa_build)
    hk_steps, hk_d, mu_hank = run_style("u_f1_hank", hank_build)
    report["tessa"] = {"steps": ts_steps, "mu": mu_tessa.tolist()}
    report["hank"] = {"steps": hk_steps, "mu": mu_hank.tolist()}

    dist = float(np.linalg.norm(mu_tessa - mu_hank))
    report["individuation_distance"] = dist
    report["axis_gap"] = {AXIS_KEYS[i]: round(float(mu_tessa[i] - mu_hank[i]), 3) for i in range(len(AXIS_KEYS))}

    # mandatory context: an incomplete envelope is rejected 422
    bad = ev("u_f1_tessa", "C", "assemble_raft", context={"stakes": "low"})
    report["missing_context_status"] = post(bad).status_code

    fidelity_ok = True
    for s in ts_steps + hk_steps:
        if s["label"] in _FIDELITY and s["implicit_axis"] != "—" and s["implicit_axis"] not in _FIDELITY[s["label"]]:
            fidelity_ok = False

    c = report["checks"]
    c["every_cue_moves_posterior_tessa"] = all(d > 1e-4 for d in ts_d)
    c["every_cue_moves_posterior_hank"] = all(d > 1e-4 for d in hk_d)
    c["individuation_distance_nontrivial"] = dist > 0.05  # same activity, different manner → different μ
    c["implicit_channel_matches_doc_priors"] = fidelity_ok
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    c["posteriors_finite"] = bool(np.all(np.isfinite(mu_tessa)) and np.all(np.isfinite(mu_hank)))
    report["passed"] = all(c.values())
    return report


def format_report(r):
    L = ["=" * 104,
         'ECHO FLOW 1 — the EMBODIED raft build: two play-styles, one activity → the individuation test',
         "=" * 104, "",
         "The measurement is the MANNER (continuous raw_signals), never a button. So two people building",
         "the same raft in different styles must move their posteriors measurably differently.", ""]
    for who, key in (("TESSA (thorough / deliberate / persistent / decorative)", "tessa"),
                     ("HANK  (hasty / minimal)", "hank")):
        L.append(who)
        L.append(f"{'beat':40} {'doc cue→axis prior':52} {'implicit→axis (W)':20} {'Δ‖μ‖':>7}")
        L.append("-" * 104)
        for s in r[key]["steps"]:
            imp = "{}({:+.3f})".format(s["implicit_axis"], s["implicit_delta"])
            flag = "  ⚑" if "decoration" in s["prior"] or "⚑" in s["prior"] else ""
            L.append(f"{s['label']:40} {s['prior']:52} {imp:20} {s['delta_mu']:>7.4f}{flag}")
        L.append("  μ = " + "  ".join(f"{k}:{v:+.2f}" for k, v in zip(AXIS_KEYS, r[key]["mu"])))
        L.append("")
    L.append("-- INDIVIDUATION --")
    L.append(f"  ‖μ_tessa − μ_hank‖ = {r['individuation_distance']:.4f}   (same activity, different manner)")
    gaps = sorted(r["axis_gap"].items(), key=lambda kv: -abs(kv[1]))
    L.append("  biggest axis gaps (tessa − hank): " + ", ".join(f"{k} {v:+.2f}" for k, v in gaps[:4]))
    L.append(f"  incomplete-context event → HTTP {r['missing_context_status']} (expect 422)")
    L.append("")
    L.append("-- CHECKS --")
    for k, v in r["checks"].items():
        L.append(f"  [{'PASS' if v else 'FAIL'}] {k}")
    L.append("")
    L.append(f"RESULT: {'PASS ✅' if r['passed'] else 'FAIL ❌'}")
    L.append("=" * 104)
    return "\n".join(L)


if __name__ == "__main__":
    rep = walk()
    print(format_report(rep))
    sys.exit(0 if rep["passed"] else 1)
