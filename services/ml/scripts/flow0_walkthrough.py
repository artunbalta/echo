"""FLOW 0 ("Waking Alone") vertical-slice walkthrough — Step 2 evidence.

Drives the EXACT Flow-0 cue sequence from ECHO_level_design_7flows.md through the REAL,
unchanged measurement spine (FastAPI ``/observe/behavioral`` → ``ingest.event_to_observation``
→ ``persona.observe`` → ``featurize_raw`` → learned W → robust Kalman ``Posterior``) and shows,
for every beat the design doc specifies:

  • the cue moves the posterior (Δ‖μ‖ > 0) — on USE, and on REFUSE/IGNORE (non-action is data),
  • WHICH axis it moved (signed Δμ per axis; dominant axis named),
  • mapped back to the doc's cue→axis prior line so fidelity is visible,
  • with the mandatory F0 context enforced (an incomplete envelope → HTTP 422),
  • and zero RuntimeWarnings (run under ``-W error::RuntimeWarning``).

Per ECHO_level_design_7flows.md cross-cutting rule #1, cue→axis loadings are LEARNED in W; the
doc's tables are priors. So this report names BOTH the doc's intended axis and the axis the
committed W actually moves, and flags where they diverge (the openness exploration cues, whose
routing sharpens when W is re-anchored on Flow-0 data).

Run:  ./.venv/bin/python -W error::RuntimeWarning scripts/flow0_walkthrough.py   (zero keys, offline)
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
from echo_ml import ingest
from echo_ml.persona_model import get_persona_model

_C = TestClient(app)
_H = {"Authorization": f"Bearer {SETTINGS.ml_token}"}

# The learned measurement model — used to isolate the LANGUAGE-FREE implicit channel.
_M = get_persona_model()
_T = len(P.TELEMETRY_FEATURE_NAMES)
_F = _M.W.shape[1]


_EMPTY_TEL = P._telemetry_features({})               # the no-cue baseline feature block


def telemetry_axis_push(tel: dict) -> np.ndarray:
    """Project ONE cue's implicit (language-free) telemetry signal through the learned W to
    see which persona axes it loads on — exactly the read the design-doc cue→axis priors are
    about. We use the cue's MARGINAL feature change (features-with-cue minus the empty baseline)
    so the feature mean cancels and only the signal the cue actually carries remains. This
    deliberately EXCLUDES the action-text embedding (semantic with Voyage; a deterministic hash
    with no keys), which otherwise dominates short labels offline and masks the implicit read.
    Returns the (D,) axis-evidence vector."""
    marginal = P._telemetry_features(tel) - _EMPTY_TEL   # (T,) only what this cue changed
    return _M.W[:, _F - _T:] @ marginal                  # (D,) which axes the implicit signal drives


def dominant(vec: np.ndarray):
    i = int(np.argmax(np.abs(vec)))
    return AXIS_KEYS[i], float(vec[i])


def f0_ctx(**over):
    """The mandatory Flow-0 context envelope (all 8 fields). Per the doc: stage 0, no audience,
    private, no counterpart, no stakes/scarcity/time-pressure, neutral mood."""
    base = dict(stakes="low", audience_size=0, public_or_private="private",
                counterpart_status="none", stage=0, scarcity_level=0.0,
                mood_proxy=0.0, time_pressure=0.0)
    base.update(over)
    return base


def ev(actor, channel, action, *, cue="", polarity="take", target=None, raw=None, context=None):
    return {
        "actor_id": actor, "t": 0, "channel": channel, "cue": cue, "action": action,
        "polarity": polarity, "target": target or {"id": "", "kind": "none", "status": "none"},
        "raw_signals": raw or {}, "context": context or f0_ctx(),
    }


def post(event):
    return _C.post("/observe/behavioral", headers=_H, json={"event": event})


def persona_mu(uid):
    return np.array(_C.get(f"/persona/{uid}", headers=_H).json()["persona"]["mu"], dtype=float)


# ── the Flow-0 beat sequence, each tagged with the design doc's cue→axis PRIOR line ──────────
# Tuple: (label, event, doc_prior). The doc_prior is the spec's intended axis(es) for the cue.
def flow0_beats(actor):
    shore = {"id": "shore", "kind": "place", "status": "none"}
    return [
        # t=0..5.5 — first input after the WASD glyph fades. Pure tempo of the first move.
        ("first_move (fast)", ev(actor, "C", "first_move", cue="C1", target=shore,
            raw={"latency_ms": 700}), "pace(±,HIGH), energy(±,MED)"),
        # t=5.5..20 — free roam; a passive dwell at a learning station (spatial attention).
        ("dwell @ book_cairn", ev(actor, "A", "dwell", cue="A4",
            target={"id": "book_cairn", "kind": "station", "status": "none"},
            raw={"dwell_ms": 6000}), "dwell→attention: ts_learn + linger-warmth"),
        # geography fork: the obvious paved path east — deliberately a WEAK signal.
        ("take_marked_path", ev(actor, "B", "take_marked_path", cue="B6",
            target={"id": "east_path", "kind": "place", "status": "none"}),
            "openness(−,LOW) — obvious ⇒ weak"),
        # the unmarked thicket west — costly, free, no visible reward (strong curiosity cue).
        ("enter_unmarked", ev(actor, "B", "enter_unmarked", cue="B7",
            target={"id": "thicket", "kind": "place", "status": "none"}),
            "openness(+,HIGH) — costly+free"),
        # the hill: bothering to climb at all.
        ("climb_hill", ev(actor, "B", "climb_hill", cue="B8",
            target={"id": "hill", "kind": "place", "status": "none"}),
            "openness(+)"),
        # the hill: retrying after each slip-back — persistence.
        ("climb_persist", ev(actor, "B", "climb_persist", cue="B8",
            target={"id": "hill", "kind": "place", "status": "none"}),
            "persistence→affect/energy(HIGH)"),
        # the tide pool: lingering at one's own reflection (inward, self-focused dwell).
        ("gaze_reflection", ev(actor, "A", "gaze_reflection", cue="A4",
            target={"id": "tidepool", "kind": "place", "status": "none"},
            raw={"dwell_ms": 3500}), "affect/self-focus(MED)"),
        # 5 scattered objects: ORDERING them (not just collecting) — conscientiousness.
        ("stack_tidy", ev(actor, "B", "stack_tidy", cue="B3",
            target={"id": "scatter", "kind": "resource", "status": "none"}),
            "conscientiousness→formality(+,MED)"),
        # the lone driftwood far west: crossing to the one odd distant thing.
        ("approach_distant_lone", ev(actor, "A", "approach_distant_lone", cue="A12",
            target={"id": "driftwood", "kind": "resource", "status": "none"},
            raw={"distance": 9.0}), "openness(+)+mild risk"),
        # easter egg: climbed high enough to glimpse the far island (seed of Flow 2).
        ("egg_horizon_seen", ev(actor, "B", "egg_horizon_seen", cue="B9",
            target={"id": "horizon", "kind": "place", "status": "none"}),
            "openness(+)"),
        # easter egg: the reflection holds a different posture for one frame (self-awareness).
        ("egg_reflection", ev(actor, "B", "egg_reflection", cue="J2",
            target={"id": "tidepool", "kind": "place", "status": "none"}),
            "affect/self-awareness"),
        # easter egg: the hidden carved hollow in the thicket — pure curiosity, zero reward.
        ("egg_hollow", ev(actor, "B", "egg_hollow", cue="B9",
            target={"id": "hollow", "kind": "place", "status": "none"}),
            "openness(+,HIGH) — zero extrinsic reward"),
    ]


# the doc's REFUSE/IGNORE beat: the player leaves the 5 objects scattered (non-action is data).
def ignore_beat(actor):
    return ("ignore_all (REFUSE)", ev(actor, "B", "ignore_all", cue="B3", polarity="refuse",
            target={"id": "scatter", "kind": "resource", "status": "none"}),
            "ignore_all → formality(−); non-action is data")


# Key fidelity expectations: cues whose implicit signal SHOULD load on the doc's intended axis
# (the cues the committed W has a real telemetry path for). Asserted, not just printed.
_FIDELITY = {
    "first_move (fast)": {"pace"},
    "climb_persist": {"formality", "affect", "energy"},
    "gaze_reflection": {"affect"},
    "stack_tidy": {"formality"},
    "egg_reflection": {"affect"},
    # ★ P5 re-anchor (known-gaps #1 closed): the exploration cues now have a REAL
    # telemetry→openness path (the curiosity/novelty feature block) and are ASSERTED
    # to load on openness — no longer a documented divergence.
    "enter_unmarked": {"openness"},
    "approach_distant_lone": {"openness"},
    "egg_horizon_seen": {"openness"},
    "egg_hollow": {"openness"},
}
# (Resolved by the ★ P5 re-anchor — kept for the report annotation only.)
_OPENNESS_DIVERGENCE: set[str] = set()


def _record(report, label, e, r, prior):
    before_after = r.json()
    tel = before_after.get("telemetry_used", {})
    push = telemetry_axis_push(tel)
    iax, ival = dominant(push) if np.linalg.norm(push) > 1e-9 else ("—", 0.0)
    return {
        "label": label, "polarity": e["polarity"], "prior": prior,
        "implicit_axis": iax, "implicit_delta": round(ival, 4),
        "delta_mu": round(float(before_after.get("delta_mu", 0.0)), 4),
        "tel": tel,
    }


def walk():
    report = {"steps": [], "checks": {}}
    a = "u_flow0_alice"
    _C.delete(f"/user/{a}", headers=_H)
    report["mu_start"] = persona_mu(a).tolist()

    deltas = []
    fidelity_ok = True
    for label, e, prior in flow0_beats(a):
        r = post(e)
        assert r.status_code == 200, (label, r.status_code, r.text)
        step = _record(report, label, e, r, prior)
        deltas.append(step["delta_mu"])
        report["steps"].append(step)
        if label in _FIDELITY and step["implicit_axis"] not in _FIDELITY[label]:
            fidelity_ok = False

    # the REFUSE/IGNORE beat — non-action is data
    label, e, prior = ignore_beat(a)
    rr = post(e)
    step = _record(report, label, e, rr, prior)
    report["refusal"] = {"status": rr.status_code, "polarity": rr.json().get("polarity"),
                         "delta_mu": step["delta_mu"], "implicit_axis": step["implicit_axis"]}
    report["steps"].append(step)

    report["mu_end"] = persona_mu(a).tolist()

    # — mandatory context: an incomplete envelope is rejected —
    bad = ev(a, "C", "first_move", context={"stakes": "low"})  # missing 7 of 8 fields
    report["missing_context_status"] = post(bad).status_code

    # — checks —
    c = report["checks"]
    c["every_use_cue_moves_posterior"] = all(d > 1e-4 for d in deltas)
    c["refusal_accepted_and_moves"] = (report["refusal"]["status"] == 200
                                       and report["refusal"]["polarity"] == "refuse"
                                       and report["refusal"]["delta_mu"] > 1e-4)
    c["implicit_channel_matches_doc_priors"] = fidelity_ok
    c["mandatory_context_rejected_422"] = report["missing_context_status"] == 422
    c["posterior_actually_shifted"] = float(np.linalg.norm(
        np.array(report["mu_end"]) - np.array(report["mu_start"]))) > 1e-3
    report["passed"] = all(c.values())
    return report


def format_report(r):
    L = ["=" * 100,
         "ECHO FLOW 0 — \"Waking Alone\": every design-doc beat → the real posterior (unchanged spine)",
         "=" * 100, "",
         "Δ‖μ‖ = full posterior step (proves the cue moves the posterior).",
         "implicit→axis = the LANGUAGE-FREE signal projected through the learned W (the doc's",
         "                cue→axis priors are about this channel; the action embedding is excluded",
         "                here because offline it is a semantics-free hash that masks the implicit read).",
         ""]
    L.append(f"Posterior μ at spawn ({', '.join(AXIS_KEYS)}):")
    L.append("  " + "  ".join(f"{v:+.2f}" for v in r["mu_start"]))
    L.append("")
    L.append(f"{'beat':24} {'pol':7} {'doc cue→axis prior':34} {'implicit→axis (W)':22} {'Δ‖μ‖':>7}")
    L.append("-" * 100)
    for s in r["steps"]:
        imp = "{}({:+.3f})".format(s["implicit_axis"], s["implicit_delta"])
        flag = ""
        if s["label"] in _OPENNESS_DIVERGENCE:
            flag = "  ⚑ openness routes via risk/approach (W not yet F0-anchored)"
        L.append(f"{s['label']:24} {s['polarity']:7} {s['prior']:34} {imp:22} {s['delta_mu']:>7.4f}{flag}")
    L.append("-" * 100)
    L.append("")
    L.append("Posterior μ after the solitary episode:")
    L.append("  " + "  ".join(f"{v:+.2f}" for v in r["mu_end"]))
    L.append(f"Total shift ‖μ_end − μ_start‖ = "
             f"{np.linalg.norm(np.array(r['mu_end']) - np.array(r['mu_start'])):.4f}")
    L.append(f"Incomplete-context event → HTTP {r['missing_context_status']} (expect 422)")
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
    print(format_report(rep))
    sys.exit(0 if rep["passed"] else 1)
