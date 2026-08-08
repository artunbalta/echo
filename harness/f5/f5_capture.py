"""F5 acceptance capture: individuation, and the public-minus-private delta.

Lives OUTSIDE services/ml because that tree is frozen except ingest.py. It reuses the same pattern as
services/ml/scripts/individuation_3d_capture.py and does not modify it: the F1 capture, drive and gate
are untouched, F5 is additive.

TWO BARS, and they are different tests.

  BAR 1, INDIVIDUATION. Two personas perform the SAME beats and differ only in MANNER, never in
  choice. This is the trap the design exists to escape: if one frees the gull and the other walks
  past, what got measured is a decision, which is a button in disguise. So both free the gull and both
  dig the cache; they differ in approach latency, in how long they persist through the slips, in how
  thoroughly they finish, and in whether they stop partway.

  BAR 2, THE PUBLIC-MINUS-PRIVATE DELTA. One persona, the same beat, both privacy conditions. F5's
  thesis is that a person reads differently observed and unobserved. A beat that reads identically
  under both has failed even if it individuates.

VARIANCE. P21 established that the harness cannot control locomotion timing: transit windows vary by
up to +/-530ms while stationary ones match within ~11ms, each window is a separate observation, and W
is not diagonal so the shift reaches every axis. F5's beats involve walking to things, so this capture
inherits that. Therefore: MEDIAN of N COMPLETE runs, never a single run, and locomotion-driven axes
are reported as uncontrolled rather than gated.

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
# Locomotion-driven axes, per P21. Reported, never gated: the harness cannot control walk timing.
UNCONTROLLED = {"energy", "openness", "pace"}


def ml_post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        ML + path, data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {ML_TOKEN}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def ml_get(path: str) -> dict:
    req = urllib.request.Request(ML + path, headers={"authorization": f"Bearer {ML_TOKEN}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ── the two performances. SAME beats, different manner. ────────────────────────────────────────
#
# Every field here is a way of DOING the act, not a choice about whether to do it. Both personas
# free the gull and both dig the cache.
PERSONAS = {
    # deliberate: hesitates before committing, works through every slip, finishes the job
    "tessa": {
        "approach_pause_ms": 1400,   # stands over it before acting
        "gull_hold_ms": 11000,       # past the full release, works it all the way out
        "gull_slices": 4,            # re-takes the hold after each slip
        "cache_pause_ms": 1600,      # dwells at the owner's mark
        "cache_hold_ms": 2200,       # digs a little and stops
        "circle": True,              # approaches around rather than straight at
    },
    # bar 2's persona: performs the same beat, but takes visibly less when there is a witness
    "mira": {
        "approach_pause_ms": 900,
        "gull_hold_ms": 7000,
        "gull_slices": 3,
        "cache_pause_ms": 1200,
        "cache_hold_ms": 5600,       # nearly empties it when unobserved
        "self_monitor": 0.22,        # takes far less when someone is up the shore
        "circle": False,
    },
    # hasty: acts at once, gives up on the first real resistance, takes the lot
    "hank": {
        "approach_pause_ms": 120,
        "gull_hold_ms": 3200,        # stops partway; the gull is left partly free
        "gull_slices": 2,
        "cache_pause_ms": 100,
        "cache_hold_ms": 6500,       # empties it
        "circle": False,
    },
}


def drive(page, persona: str, probe: str, privacy: str) -> dict:
    """Drive one persona through one probe under one privacy condition. Returns a trace."""
    p = PERSONAS[persona]
    trace = {"probe": probe, "privacy": privacy, "reached": False, "acted_ms": 0}

    page.goto(f"{WEB}/flow5?u={persona}_{probe}_{privacy}&probe={probe}&privacy={privacy}",
              wait_until="networkidle")
    page.wait_for_function("() => !!window.__echo5", timeout=30000)
    page.wait_for_timeout(1200)

    objs = page.evaluate("() => window.__echo5.objects")
    target = next((o for o in objs if o["id"].endswith(probe)), None)
    if not target:
        return trace
    mark = next((o for o in objs if o["id"].endswith("cache_mark")), None)

    def me():
        return page.evaluate("() => window.__echo5.self()")

    def walk_to(x, y, tol=1.1, budget=16.0):
        t0 = time.time()
        last = 0.0
        while time.time() - t0 < budget:
            now = time.time()
            if now - last > 0.55:
                page.evaluate("([x,y]) => window.__echo5.walkTo(x,y)", [x, y])
                last = now
            s = me()
            # EUCLIDEAN, because that is what the controller's reach uses. A per-axis check rejected
            # arrivals that were genuinely in range and aborted the drive before it could hold.
            if ((s["x"] - x) ** 2 + (s["y"] - y) ** 2) ** 0.5 < tol:
                return True
            page.wait_for_timeout(100)
        return False

    # the approach. circling is a manner difference, not a choice difference: both arrive.
    if p["circle"]:
        walk_to(target["x"] + 2.6, target["y"] - 2.6, tol=1.6, budget=10)
        walk_to(target["x"] - 2.4, target["y"] - 1.2, tol=1.6, budget=10)
    # RANGE in the controller is 1.6 and autoWalk settles about 1.5 tiles off a placed prop, so a
    # tighter tolerance aborts the drive before it can hold. Match the reach, never exceed it.
    if not walk_to(target["x"], target["y"], tol=1.55, budget=20):
        return trace
    trace["reached"] = True

    if probe == "cache" and mark:
        # both read the mark; how long they stand over it is the manner
        walk_to(mark["x"], mark["y"], tol=1.1, budget=10)
        page.wait_for_timeout(p["cache_pause_ms"])
        walk_to(target["x"], target["y"], tol=1.5, budget=10)

    page.wait_for_timeout(p["approach_pause_ms"])

    total = p["gull_hold_ms"] if probe == "gull" else p["cache_hold_ms"]
    # SELF-MONITORING, for bar 2 only. A scripted drive that performs the identical act in both
    # conditions produces a zero delta BY CONSTRUCTION, because the script does not care whether it
    # is watched. That measures the drive, not the beat. So bar 2 drives a persona who genuinely
    # behaves differently when seen (takes less from the cache under a witness), which is what the
    # instrument is supposed to be able to detect. See the report for what this does and does not
    # establish: it proves the pipeline CAN see a public-private difference, not that real players
    # exhibit one, which is a human question this harness cannot answer.
    if p.get("self_monitor") and privacy == "public":
        total = int(total * p["self_monitor"])
    slices = p["gull_slices"] if probe == "gull" else 1
    per = max(300, total // slices)
    for _ in range(slices):
        page.keyboard.down(" ")
        page.wait_for_timeout(per)
        page.keyboard.up(" ")
        page.wait_for_timeout(140)  # the beat between re-takes
    trace["acted_ms"] = total

    # Leaving is what flushes a PARTIAL performance, which is the whole point of the beat, so the
    # walk-away has to actually succeed. Walk back INLAND toward the island centre: the probes sit
    # near the shore and the seaward side is water, so walking outward is blocked and the player
    # never gets far enough for the controller to see them leave.
    page.wait_for_timeout(400)
    home = page.evaluate("() => window.__echo5.home")
    ux, uy = home["x"] - target["x"], home["y"] - target["y"]
    m = max(0.001, (ux * ux + uy * uy) ** 0.5)
    walk_to(target["x"] + (ux / m) * 5.0, target["y"] + (uy / m) * 5.0, tol=1.8, budget=12)
    page.wait_for_timeout(1200)
    return trace


def capture(playwright, persona: str, probe: str, privacy: str):
    events: list[dict] = []
    browser = playwright.chromium.launch(
        headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"])
    ctx = browser.new_context(viewport={"width": 900, "height": 640})
    page = ctx.new_page()

    def on_request(req):
        if "/api/observe/behavioral" in req.url and req.method == "POST":
            try:
                for ev in (req.post_data_json or {}).get("events", []):
                    events.append(ev)
            except Exception:
                pass

    page.on("request", on_request)
    try:
        trace = drive(page, persona, probe, privacy)
    except Exception as e:
        print(f"    [INFRA] could not drive {persona}/{probe}/{privacy}: {e}")
        trace = {"reached": False}
    finally:
        page.wait_for_timeout(600)
        browser.close()
    return events, trace


# ── the per-beat completeness gate, in the shape of the F1 one ─────────────────────────────────
#
# A run that missed a beat is INFRA and is re-run, never counted as a low number. The F5 beats each
# have one characteristic cue; if it is absent the drive did not perform the act, which is drive
# flakiness rather than a measurement result.
REQUIRED = {
    "gull": {"help_at_cost", "abandon_free_gull"},   # either ending is a performance
    "cache": {"keep_cache", "return_cache"},
}


def complete(events: list[dict], probe: str) -> tuple[bool, str]:
    if not events:
        return False, "no events captured"
    actions = {e.get("action") for e in events}
    want = REQUIRED[probe]
    if not (actions & want):
        return False, f"missing the {probe} beat (saw {sorted(a for a in actions if a)})"
    return True, ""


def posterior_for(events: list[dict], uid: str, cond: bool = False):
    import numpy as np
    for ev in events:
        e = dict(ev)
        e["actor_id"] = uid
        try:
            ml_post("/observe/behavioral", {"event": e})
        except Exception as ex:
            print(f"    [INFRA] ingest POST failed: {ex}")
            raise
    p = ml_get(f"/persona/{uid}")
    mu = np.array(p["persona"]["mu"], dtype=float)
    return mu


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"[INFRA] playwright not importable: {e}")
        return 2

    import numpy as np
    label = os.environ.get("LABEL", "f5")
    n_runs = int(os.environ.get("F5_RUNS", "5"))

    print(BAR)
    print("F5 ACCEPTANCE — the Ring of Gyges probes, driven through the real client")
    print(BAR)

    with sync_playwright() as pw:
        # a discarded WARM-UP: the INFRA actually observed in P21 was a cold-Next-compile
        # Page.goto timeout on the first run of a session, not a beat miss.
        print("\nwarm-up run (discarded)…")
        try:
            capture(pw, "hank", "gull", "private")
        except Exception as e:
            print(f"  warm-up raised (ignored): {e}")

        # ── BAR 1 ──
        print(f"\n{'-'*104}\nBAR 1 — INDIVIDUATION: same beats, different manner, median of {n_runs} COMPLETE runs")
        print(f"{'-'*104}")
        per_run = []
        infra1 = 0
        attempts = 0
        while len(per_run) < n_runs and attempts < n_runs * 3:
            attempts += 1
            run = {}
            ok = True
            for persona in ("tessa", "hank"):
                evs_all = []
                for probe in ("gull", "cache"):
                    evs, tr = capture(pw, persona, probe, "private")
                    good, why = complete(evs, probe)
                    if not good:
                        print(f"  [INFRA] run {attempts}: {persona}/{probe}: {why}")
                        ok = False
                        break
                    evs_all += evs
                if not ok:
                    break
                run[persona] = evs_all
            if not ok:
                infra1 += 1
                continue
            uid_t, uid_h = f"{label}_b1_{attempts}_tessa", f"{label}_b1_{attempts}_hank"
            mt = posterior_for(run["tessa"], uid_t)
            mh = posterior_for(run["hank"], uid_h)
            per_run.append((mt - mh).tolist())
            d = float(np.linalg.norm(mt - mh))
            print(f"  run {len(per_run)}/{n_runs}  pooled {d:.4f}   "
                  f"(tessa {len(run['tessa'])} ev, hank {len(run['hank'])} ev)")

        if len(per_run) < n_runs:
            print(f"\n[INFRA] only {len(per_run)}/{n_runs} COMPLETE runs after {attempts} attempts.")
            return 2

        med = [statistics.median([r[i] for r in per_run]) for i in range(8)]
        pooled = [float(np.linalg.norm(np.array(r))) for r in per_run]
        print(f"\n  INFRA runs excluded: {infra1}")
        print(f"  pooled L2, median of {n_runs}: {statistics.median(pooled):.4f}  "
              f"(min {min(pooled):.4f}, max {max(pooled):.4f})")
        print(f"\n  {'axis':<12}{'median delta':>14}{'min':>11}{'max':>11}   note")
        for i, a in enumerate(AXES):
            vals = [r[i] for r in per_run]
            note = "uncontrolled (locomotion)" if a in UNCONTROLLED else ""
            print(f"  {a:<12}{med[i]:>14.4f}{min(vals):>11.4f}{max(vals):>11.4f}   {note}")

        # The bar: the two manners must separate on at least one CONTROLLED axis, and the pooled
        # median must be non-trivial. Locomotion-driven axes cannot carry the verdict (P21).
        controlled = [(a, med[i]) for i, a in enumerate(AXES) if a not in UNCONTROLLED]
        best = max(controlled, key=lambda kv: abs(kv[1]))
        bar1 = abs(best[1]) > 0.02 and statistics.median(pooled) > 0.05
        print(f"\n  strongest CONTROLLED axis: {best[0]} at {best[1]:+.4f}")
        print(f"  BAR 1: {'PASS' if bar1 else 'FAIL'}")

        # ── BAR 2 ──
        print(f"\n{'-'*104}\nBAR 2 — PUBLIC MINUS PRIVATE: one persona, one beat, both conditions, median of {n_runs}")
        print(f"{'-'*104}")
        print("  note: circled01, the cue that most directly IS the unobserved self, is known-gaps ⚑13")
        print("  and therefore unrouted, so it cannot contribute. The delta must come through the")
        print("  routed cues, taken01 -> consistency in particular.")
        d2 = []
        infra2 = 0
        attempts = 0
        raw_pub, raw_prv = [], []
        while len(d2) < n_runs and attempts < n_runs * 3:
            attempts += 1
            evp, _ = capture(pw, "mira", "cache", "public")
            gp, why = complete(evp, "cache")
            evq, _ = capture(pw, "mira", "cache", "private")
            gq, why2 = complete(evq, "cache")
            if not (gp and gq):
                print(f"  [INFRA] run {attempts}: {why or why2}")
                infra2 += 1
                continue
            up, uq = f"{label}_b2_{attempts}_pub", f"{label}_b2_{attempts}_prv"
            mp = posterior_for(evp, up)
            mq = posterior_for(evq, uq)
            d2.append((mp - mq).tolist())
            raw_pub.append(evp)
            raw_prv.append(evq)
            print(f"  run {len(d2)}/{n_runs}  ||public - private|| = {float(np.linalg.norm(mp-mq)):.4f}")

        if len(d2) < n_runs:
            print(f"\n[INFRA] only {len(d2)}/{n_runs} COMPLETE delta runs.")
            return 2

        med2 = [statistics.median([r[i] for r in d2]) for i in range(8)]
        pooled2 = [float(np.linalg.norm(np.array(r))) for r in d2]
        print(f"\n  INFRA runs excluded: {infra2}")
        print(f"  ||public - private||, median of {n_runs}: {statistics.median(pooled2):.4f}")
        print(f"\n  {'axis':<12}{'median delta':>14}{'min':>11}{'max':>11}   note")
        for i, a in enumerate(AXES):
            vals = [r[i] for r in d2]
            note = "uncontrolled (locomotion)" if a in UNCONTROLLED else ""
            print(f"  {a:<12}{med2[i]:>14.4f}{min(vals):>11.4f}{max(vals):>11.4f}   {note}")

        # which routed cues actually differ between the two conditions
        def rawstat(batches, key):
            vals = []
            for b in batches:
                for e in b:
                    v = e.get("raw_signals", {}).get(key)
                    if isinstance(v, (int, float)):
                        vals.append(float(v))
            return statistics.median(vals) if vals else None

        print("\n  routed cues, public vs private (median over runs), i.e. what carries the delta:")
        for key in ("taken01", "dwell_ms", "decision_latency_ms", "thoroughness01", "persist_after_fail"):
            a, b = rawstat(raw_pub, key), rawstat(raw_prv, key)
            if a is None and b is None:
                continue
            routed = "-> consistency" if key == "taken01" else (
                "UNROUTED (⚑13)" if key == "dwell_ms" else (
                "-> decision_latency" if key == "decision_latency_ms" else "-> persistence"))
            print(f"    {key:<22} public={a}  private={b}   {routed}")
        print("\n  carried but UNROUTED (⚑13), so contributing nothing to the delta above:")
        for key in ("circled01", "dwell_at_marker_ms", "cost_paid01", "approach_detour01"):
            a, b = rawstat(raw_pub, key), rawstat(raw_prv, key)
            if a is None and b is None:
                continue
            print(f"    {key:<22} public={a}  private={b}")

        controlled2 = [(a, med2[i]) for i, a in enumerate(AXES) if a not in UNCONTROLLED]
        best2 = max(controlled2, key=lambda kv: abs(kv[1]))
        bar2 = abs(best2[1]) > 0.02
        print(f"\n  strongest CONTROLLED axis: {best2[0]} at {best2[1]:+.4f}")
        print(f"  BAR 2: {'PASS' if bar2 else 'FAIL'}")

        print(f"\n{BAR}")
        print(f"BAR 1 individuation: {'PASS' if bar1 else 'FAIL'}    "
              f"BAR 2 public-minus-private: {'PASS' if bar2 else 'FAIL'}")
        print(BAR)
        with open(f"/tmp/{label}_acceptance.json", "w") as f:
            json.dump({"bar1": bar1, "bar2": bar2, "b1_median": med, "b2_median": med2,
                       "b1_pooled": pooled, "b2_pooled": pooled2}, f, indent=2)
        return 0 if (bar1 and bar2) else 1


if __name__ == "__main__":
    sys.exit(main())
