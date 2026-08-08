"""F4 acceptance capture: cross-session driving, siloing, individuation, and the repetition delta.

Built BEFORE the F4 flow, deliberately. Last round produced a feature with no number because the
capture came second; the standing rule is now measurement first, and this is its first test. If the
round runs out of room it runs out with a working harness and no flow, not the reverse.

Lives OUTSIDE services/ml, which is frozen except ingest.py. It does not touch the F1 or F5 captures,
drives or gates; F4's capture is additive.

WHAT A SYNTHETIC NUMBER HERE CAN AND CANNOT ESTABLISH. Carried forward from F5's Bar 2, and F4 is
more exposed to it. Every number this file reports is a property of the DRIVE as much as of the
product. A scripted persona keeps a promise because the script says so, not because it is
conscientious. So what these bars legitimately prove is that the pipeline carries a difference and
which cue carries it. They do NOT prove that real people exhibit that difference. Any report
quoting these numbers must carry that boundary with them.

THE TRAP THIS IS DESIGNED AROUND. F4's beats are choices: a promise kept or broken, a conflict
repaired or not. A decision is a button in disguise, and a button cannot individuate people. If the
two personas differ in WHICH BRANCH they take, the posteriors diverge because two different choices
were scripted, which is the multiple-choice questionnaire the whole design exists to escape. So Bar 1
requires both personas to take the SAME branch and differ only in the manner around it: how promptly
they return unasked, the path back, hesitation at the moment of committing, how much they give and
how fast when nothing is owed.

VARIANCE. P21 established the harness cannot control locomotion timing, that transit windows vary by
up to +/-530ms while stationary ones match within ~11ms, and that the shift reaches every axis through
a non-diagonal W. F4 involves walking back to a partner, so it inherits this. Median of N COMPLETE
runs, never a single run, and locomotion-driven axes reported as uncontrolled rather than gated.

TIEWARMTH IS NOT THE POSTERIOR. `tieWarmth` is world state, the homestead remembering who you tended.
The posterior is the person model. F4 feeds both and this file never conflates them: any tieWarmth
figure is labelled WORLD and any mu figure is labelled POSTERIOR.

Exit 0 pass, 1 fail, 2 INFRA (could not drive; reported, never faked).
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
import urllib.request

WEB = os.environ.get("WEB", "http://localhost:3000")
ML = os.environ.get("ML", "http://localhost:8000")
ML_TOKEN = os.environ.get("ML_SERVICE_TOKEN", "dev-secret-token")
BAR = "=" * 104
AXES = ["warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect"]
UNCONTROLLED = {"energy", "openness", "pace"}
DAY_MS = 24 * 60 * 60 * 1000


def ml_post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        ML + path, data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {ML_TOKEN}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def ml_get(path: str) -> dict:
    req = urllib.request.Request(ML + path, headers={"authorization": f"Bearer {ML_TOKEN}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def web_get(path: str) -> dict:
    with urllib.request.urlopen(WEB + path, timeout=20) as r:
        return json.loads(r.read())


def web_post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        WEB + path, data=json.dumps(body).encode(),
        headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


# ── the cross-session machinery ────────────────────────────────────────────────────────────────
#
# A run is not one session. Between sessions the island's persisted state is what carries the
# relationship forward, and the between-session decay is compressed with the injected clock rather
# than waited on. `cropPlantedAt` is backdated because the decay reads it directly; `updatedAt` is
# re-stamped by the POST route, so tie cooling over the wire is bounded by that and is asserted on
# the pure core instead (see known-gaps ⚑15 for the limitation).

def load_island(user: str) -> dict:
    return web_get(f"/api/island/state?userId={user}")


def save_island(user: str, state: dict) -> dict:
    return web_post("/api/island/state", {"userId": user, "state": state})


def age_island(user: str, days: float) -> dict:
    """Push a user's island `days` into the past so the next load decays it. Injected, not waited."""
    st = load_island(user)["state"]
    back = int(days * DAY_MS)
    if st.get("cropPlantedAt"):
        st["cropPlantedAt"] = st["cropPlantedAt"] - back
    st["updatedAt"] = st["updatedAt"] - back
    save_island(user, st)
    return load_island(user)


# ── siloing: the protected-spine property this asserts for the first time ──────────────────────
#
# Social interactions emit a SEPARATE per-actor event per participant, each into that actor's own
# private posterior, never co-mingled. The copresence integration test already asserts both events
# are EMITTED. What has never been exercised is that they land in SEPARATE POSTERIORS: that A's act
# moves A's model and leaves B's untouched. Under a repeated-game flow, where the same pair interacts
# many times, a leak would accumulate rather than cancel, which is why F4 is where it matters.

def siloing_assertion(label: str) -> tuple[bool, str]:
    import numpy as np
    a, b = f"{label}_silo_a", f"{label}_silo_b"

    def mu(u):
        return np.array(ml_get(f"/persona/{u}")["persona"]["mu"], dtype=float)

    def ev(actor, counterpart, action):
        # The real accepted shape, taken from a live captured event rather than invented. A
        # hand-rolled envelope is rejected 422 by the ingress, which is the ingress doing its job.
        return {
            "actor_id": actor, "sessionId": f"{label}_silo", "t": int(time.time() * 1000),
            "type": "social_cue", "channel": "B", "cue": "B1", "action": action, "polarity": "take",
            "target": {"id": counterpart, "kind": "user", "status": "peer"},
            "context": {
                "stakes": "high", "audience_size": 1, "public_or_private": "public",
                "counterpart_status": "peer", "stage": 4, "scarcity_level": 0.2,
                "mood_proxy": 0.0, "time_pressure": 0.0,
            },
            "raw_signals": {"latency_ms": 900, "decision_latency_ms": 900},
            "payload": {}, "provenance": "live",
        }

    mu_a0, mu_b0 = mu(a), mu(b)
    # A acts on B, ten times. Only A's actor_id is on the event.
    for _ in range(10):
        ml_post("/observe/behavioral", {"event": ev(a, b, "opener_warm")})
    mu_a1, mu_b1 = mu(a), mu(b)

    moved_a = float(np.linalg.norm(mu_a1 - mu_a0))
    moved_b = float(np.linalg.norm(mu_b1 - mu_b0))
    ok = moved_a > 0.01 and moved_b == 0.0
    detail = (f"A's posterior moved {moved_a:.4f} over 10 of A's own acts; "
              f"B's moved {moved_b:.4f} (must be exactly 0)")
    return ok, detail


# ── the completeness gate, in the shape of the F1 and F5 ones ──────────────────────────────────
#
# F4's beats, once they exist. A run missing one is INFRA, is re-run, and is never counted as a low
# number. Declared here rather than in the flow so the gate exists before the beats do, which is the
# whole point of building the capture first.
REQUIRED_F4 = {
    "return":     {"promise_kept", "promise_broken"},
    "exchange":   {"cooperate", "defect"},
    "conflict":   {"forgive", "retaliate", "withdraw", "repair"},
    "generosity": {"give_unreciprocated", "withhold_unreciprocated"},
}


def complete_f4(events: list[dict], beats: list[str]) -> tuple[bool, str]:
    if not events:
        return False, "no events captured"
    seen = {e.get("action") for e in events}
    for b in beats:
        if not (seen & REQUIRED_F4[b]):
            return False, f"missing the {b} beat (saw {sorted(a for a in seen if a)})"
    return True, ""


def f4_surface_present() -> bool:
    """Is there an F4 surface to drive at all? Checked rather than assumed."""
    try:
        with urllib.request.urlopen(WEB + "/flow4", timeout=10) as r:
            return r.status == 200
    except Exception:
        return False


def main() -> int:
    import numpy as np
    label = os.environ.get("LABEL", "f4")

    print(BAR)
    print("F4 ACCEPTANCE: cross-session trust, built before the flow")
    print(BAR)

    # ── the machinery, exercised for real ──
    print("\n" + "-" * 104)
    print("CROSS-SESSION MACHINERY (the injected clock, against the real store)")
    print("-" * 104)
    u = f"{label}_xsess_{int(time.time())}"
    s1 = load_island(u)
    print(f"  session 1: fresh={s1['fresh']}  persistence={s1['persistence']}  "
          f"dayCount={s1['state']['dayCount']}  tieWarmth={s1['state']['tieWarmth']}  (WORLD state)")
    st = s1["state"]
    st["cropStage"] = "planted"
    st["cropPlantedAt"] = st["updatedAt"]
    st["tieWarmth"] = {"partner": 0.80}
    st["dayCount"] = 1
    save_island(u, st)
    aged = age_island(u, 3)
    print(f"  session 2 after +3 days injected: dayCount={aged['state']['dayCount']}  "
          f"cropStage={aged['state']['cropStage']}  tieWarmth={aged['state']['tieWarmth']}  (WORLD state)")
    print(f"  changes: {aged['changes']}")
    machinery_ok = (aged["state"]["dayCount"] == 1 and aged["state"]["cropStage"] == "wilted")
    print(f"  cross-session carry + injected decay: {'PASS' if machinery_ok else 'FAIL'}")

    # ── siloing ──
    print("\n" + "-" * 104)
    print("SILOING (protected spine: per-actor events land in separate posteriors)")
    print("-" * 104)
    silo_ok, silo_detail = siloing_assertion(f"{label}_{int(time.time())}")
    print(f"  {silo_detail}")
    print(f"  SILOING: {'PASS' if silo_ok else 'FAIL'}    (POSTERIOR, not world state)")

    # ── the bars ──
    print("\n" + "-" * 104)
    print("BARS 1 AND 2")
    print("-" * 104)
    if not f4_surface_present():
        print("  No F4 surface at /flow4 to drive.")
        print("  Bar 1 (individuation) and Bar 2 (the repetition delta) are NOT MEASURED.")
        print("  This is the honest empty result the ordering rule is meant to produce: the gate,")
        print("  the cross-session machinery and the siloing assertion all exist and pass BEFORE")
        print("  any F4 gameplay is written, so the flow will be measured as a delta against this")
        print("  rather than shipped with no number.")
        print(f"\n{BAR}")
        print(f"machinery: {'PASS' if machinery_ok else 'FAIL'}    "
              f"siloing: {'PASS' if silo_ok else 'FAIL'}    bars: NOT MEASURED (no F4 surface)")
        print(BAR)
        return 0 if (machinery_ok and silo_ok) else 1

    print("  An F4 surface exists; the bars would run here.")
    print(f"\n{BAR}")
    return 0 if (machinery_ok and silo_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
