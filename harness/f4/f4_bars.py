"""F4's two acceptance bars, driven through the real /flow4 client.

BAR 1, INDIVIDUATION. Two personas perform the SAME four beats and take the SAME branch in every
one of them: both keep the promise, both cooperate every round they are able to, both forgive, both
give. They differ only in MANNER. This is the trap F4 is built against — if one keeps the promise
and the other breaks it, what got measured is a decision, and a decision is a button in disguise.

BAR 2, THE REPETITION DELTA. N repeated rounds with ONE recurring partner, against N one-shot rounds
with N DIFFERENT partners. Same drive, same acts, same count. If repetition reads the same as
repetition-free contact then F4 measures nothing F2 and F3 did not, and the flow does not justify
itself.

WHAT A PASS HERE DOES NOT MEAN. Every number is a property of the DRIVE as much as of the product: a
scripted persona keeps a promise because the script says so. And F4's signature cue,
`response_to_defect01`, has no anchored feature in the committed W and is emitted unrouted, along
with `settle_distance`, `circled01`, `return_directness01`, `detoured_first01`, `unprompted`,
`stake_amount01` and `cost_paid01`. So a pass demonstrates that the pipeline carries a difference
through the cues that ARE routed. It does not demonstrate that the flow measures what it was
designed to measure, and this file prints which cues carried the delta so that claim can be checked
rather than assumed.

VARIANCE, per P21: median of N COMPLETE runs, and locomotion-driven axes reported as uncontrolled
rather than gated.
"""
from __future__ import annotations

import json
import os
import statistics
import time

WEB = os.environ.get("WEB", "http://localhost:3000")
AXES = ["warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect"]
UNCONTROLLED = {"energy", "openness", "pace"}
DAY_MS = 24 * 60 * 60 * 1000


# ── the two performances. SAME beats, SAME branches, different manner. ─────────────────────────
PERSONAS = {
    # deliberate: comes straight back, holds the full measure, goes back for more
    "tessa": {
        "dawdle_ms": 500,
        "errands": 0,            # goes to them first, before anything of her own
        "circle": True,          # approaches around rather than straight at
        # None = withholds that round. BOTH personas withhold the round after being taken from, so
        # the BRANCH is identical and only the amounts and the timing differ. That is the whole
        # discipline of bar 1: a persona who forgave while the other retaliated would be measuring
        # a decision.
        "place_ms": [2900, 2900, None, 2900],
        "conflict_pause_ms": 2600,
        "settle_off": 1.8,       # stops close
        "give_ms": [1700, 1900],  # two trips, the full measure
    },
    # hasty: gets to it eventually, gives what is left over, one trip
    "hank": {
        "dawdle_ms": 200,
        "errands": 2,            # does his own business first, then arrives
        "circle": False,
        "place_ms": [900, 900, None, 900],
        "conflict_pause_ms": 900,
        "settle_off": 3.2,       # comes close too, but keeps a gap. SAME branch, not the same manner.
        "give_ms": [1100],       # one trip, a partial gift
    },
}


def _mk(page, tol_default=1.5):
    """The drive's two primitives: read where you are, and walk somewhere. Nothing else is exposed."""
    def me():
        return page.evaluate("() => window.__echo4.self()")

    def walk_to(x, y, tol=tol_default, budget=18.0):
        t0 = time.time()
        last = 0.0
        while time.time() - t0 < budget:
            now = time.time()
            if now - last > 0.55:
                page.evaluate("([x,y]) => window.__echo4.walkTo(x,y)", [x, y])
                last = now
            s = me()
            if ((s["x"] - x) ** 2 + (s["y"] - y) ** 2) ** 0.5 < tol:
                return True
            page.wait_for_timeout(100)
        return False
    return me, walk_to


def approach_until(page, target, want, budget=20.0):
    """Walk toward `target` and stop the moment you are within `want` of it.

    The drive's third primitive, and still only the real player-facing surface: aim, and let go.
    `stop()` is `setAutoWalk(null)`, which is what happens when a walk ends. It commands nothing the
    measurement reads.
    """
    import time as _t
    t0, last = _t.time(), 0.0
    while _t.time() - t0 < budget:
        s = page.evaluate("() => window.__echo4.self()")
        d = ((s["x"] - target["x"]) ** 2 + (s["y"] - target["y"]) ** 2) ** 0.5
        if d <= want:
            page.evaluate("() => window.__echo4.stop()")
            return True
        now = _t.time()
        if now - last > 0.55:
            page.evaluate("([x,y]) => window.__echo4.walkTo(x,y)", [target["x"], target["y"]])
            last = now
        page.wait_for_timeout(80)
    page.evaluate("() => window.__echo4.stop()")
    return False


def open_beat(page, persona: str, beat: str, partner: str, uid: str | None = None):
    u = uid or f"{persona}_{beat}"
    page.goto(f"{WEB}/flow4?u={u}&beat={beat}&partner={partner}", wait_until="networkidle")
    page.wait_for_function("() => !!window.__echo4", timeout=30000)
    page.wait_for_timeout(1000)
    objs = {o["id"].split("_")[-1]: o for o in page.evaluate("() => window.__echo4.objects")}
    return objs


def drive_promise(page, persona, partner, uid):
    o = open_beat(page, persona, "promise", partner, uid)
    _, walk_to = _mk(page)
    if not walk_to(o["post"]["x"], o["post"]["y"], tol=1.55):
        return False
    page.wait_for_timeout(400)
    page.keyboard.down(" ")
    page.wait_for_timeout(2400)
    page.keyboard.up(" ")
    page.wait_for_timeout(600)
    return True


def drive_return(page, persona, partner, uid):
    """Both personas KEEP the promise. One comes straight back; the other gets to it eventually."""
    p = PERSONAS[persona]
    o = open_beat(page, persona, "return", partner, uid)
    _, walk_to = _mk(page)
    page.wait_for_timeout(p["dawdle_ms"])
    for i in range(p["errands"]):
        e = o.get(f"errand{i}")
        if e:
            walk_to(e["x"], e["y"], tol=1.6, budget=12)
            page.wait_for_timeout(2200)
    if p["circle"]:
        walk_to(o["partner"]["x"] + 3.0, o["partner"]["y"] - 3.0, tol=1.8, budget=10)
    ok = walk_to(o["partner"]["x"], o["partner"]["y"], tol=1.8, budget=20)
    page.wait_for_timeout(900)
    return ok


def drive_exchange(page, persona, partner, uid, rounds: int | None = None):
    """Both personas COOPERATE in every round they can; how much and how fast is the manner.

    `rounds=1` is the one-shot arm: the session performs a single round with this partner and closes,
    which is what a one-shot IS. Nothing about the flow is reconfigured to produce it.
    """
    p = PERSONAS[persona]
    o = open_beat(page, persona, "exchange", partner, uid)
    _, walk_to = _mk(page)
    home = page.evaluate("() => window.__echo4.home")
    n = rounds if rounds is not None else len(p["place_ms"])
    for r in range(n):
        if not walk_to(o["store"]["x"], o["store"]["y"], tol=1.5, budget=16):
            return False
        page.wait_for_timeout(300)
        if not walk_to(o["cache"]["x"], o["cache"]["y"], tol=1.5, budget=16):
            return False
        page.wait_for_timeout(400)
        hold = p["place_ms"][min(r, len(p["place_ms"]) - 1)]
        if hold is None:
            # carried it all the way there and walked away with it. The round's other ending, and it
            # is performed rather than chosen: no branch is selected anywhere.
            walk_to(home["x"], home["y"], tol=1.6, budget=16)
            page.wait_for_timeout(700)
            continue
        page.keyboard.down(" ")
        page.wait_for_timeout(hold)
        page.keyboard.up(" ")
        page.wait_for_timeout(500)
    # the last partial round only closes once you step away from the cache, so step away
    walk_to(o["store"]["x"], o["store"]["y"], tol=1.8, budget=16)
    page.wait_for_timeout(900)
    return True


def drive_conflict(page, persona, partner, uid):
    """Both personas FORGIVE: they come close, they stand there, they do nothing back. What differs
    is how long before they go, whether they circle, and how close they settle."""
    p = PERSONAS[persona]
    o = open_beat(page, persona, "conflict", partner, uid)
    _, walk_to = _mk(page)
    # you find out by finding out: the beat does not start until you reach the emptied cache
    if not walk_to(o["cache"]["x"], o["cache"]["y"], tol=1.6, budget=18):
        return False
    page.wait_for_timeout(p["conflict_pause_ms"])
    pt = o["partner"]
    if p["circle"]:
        walk_to(pt["x"] + 3.4, pt["y"] - 3.4, tol=1.8, budget=12)
    off = p["settle_off"]
    # Walk TOWARD them and stop when you are as close as you meant to get, rather than aiming at a
    # fixed tile beside them. Aiming at a tile failed 7 of 9 conflict drives: the post and the
    # partner are both solid, so a point at a chosen offset is often simply not standable, and the
    # walk timed out. Approaching-and-stopping is also what a person does, and it is what makes
    # `settle_distance` carry the persona instead of the controller's fixed stopping distance.
    if not approach_until(page, pt, off, budget=22):
        return False
    page.wait_for_timeout(1800)          # settle: a distance has to be HELD to count
    # then go, without having done anything back. That is what forgiveness looks like in the body.
    home = page.evaluate("() => window.__echo4.home")
    ux, uy = home["x"] - pt["x"], home["y"] - pt["y"]
    m = max(0.001, (ux * ux + uy * uy) ** 0.5)
    walk_to(pt["x"] + (ux / m) * 11.0, pt["y"] + (uy / m) * 11.0, tol=2.0, budget=18)
    page.wait_for_timeout(1000)
    return True


def drive_generosity(page, persona, partner, uid):
    """Both personas GIVE. How much, and whether they go back for more, is the manner."""
    p = PERSONAS[persona]
    o = open_beat(page, persona, "generosity", partner, uid)
    _, walk_to = _mk(page)
    for hold in p["give_ms"]:
        if not walk_to(o["store"]["x"], o["store"]["y"], tol=1.5, budget=16):
            return False
        page.wait_for_timeout(250)
        if not walk_to(o["post"]["x"], o["post"]["y"], tol=1.5, budget=16):
            return False
        page.wait_for_timeout(400)
        page.keyboard.down(" ")
        page.wait_for_timeout(hold)
        page.keyboard.up(" ")
        page.wait_for_timeout(400)
    # leaving is the ending; a partial gift only flushes once you have actually gone
    home = page.evaluate("() => window.__echo4.home")
    walk_to(home["x"], home["y"], tol=2.0, budget=18)
    page.wait_for_timeout(4000)   # the beat ends on REST away from both post and store, not a radius
    return True


DRIVES = {
    "promise": drive_promise, "return": drive_return, "exchange": drive_exchange,
    "conflict": drive_conflict, "generosity": drive_generosity,
}


def capture(playwright, persona, beat, partner, uid, **kw):
    """Drive one beat in a real headless browser and collect the events it actually POSTed."""
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
    ok = False
    try:
        ok = DRIVES[beat](page, persona, partner, uid, **kw)
    except Exception as e:
        print(f"    [INFRA] could not drive {persona}/{beat}: {str(e)[:160]}")
    finally:
        page.wait_for_timeout(700)
        browser.close()
    return events, ok


# ── the per-beat completeness gate ─────────────────────────────────────────────────────────────
#
# A run that missed a beat is INFRA, is re-run, and is never counted as a low number.
REQUIRED = {
    "promise":    {"promise_made"},
    "return":     {"promise_kept", "promise_broken"},
    "exchange":   {"cooperate", "defect"},
    "conflict":   {"forgive", "retaliate", "withdraw", "repair"},
    "generosity": {"give_unreciprocated", "withhold_unreciprocated"},
}


def complete(events, beat):
    seen = {e.get("action") for e in events}
    if not (seen & REQUIRED[beat]):
        return False, f"{beat}: missing (saw {sorted(a for a in seen if a)})"
    return True, ""


def age_a_day(uid):
    """Between the promise and the return, inject a day with the gated clock (P30). The return is
    measured after the island has ACTUALLY aged, not after a timer."""
    import urllib.request
    t = int(time.time() * 1000)
    try:
        with urllib.request.urlopen(f"{WEB}/api/island/state?userId={uid}&now={t + DAY_MS}", timeout=20) as r:
            return "testClock" in json.loads(r.read())
    except Exception:
        return False


def posterior_for(events, uid, ml_post, ml_get):
    import numpy as np
    for ev in events:
        e = dict(ev)
        e["actor_id"] = uid
        ml_post("/observe/behavioral", {"event": e})
    return np.array(ml_get(f"/persona/{uid}")["persona"]["mu"], dtype=float)


def _axis_table(per_run, med, indent="  "):
    print(f"\n{indent}{'axis':<12}{'median delta':>14}{'min':>11}{'max':>11}   note")
    for i, a in enumerate(AXES):
        vals = [r[i] for r in per_run]
        note = "uncontrolled (locomotion)" if a in UNCONTROLLED else ""
        print(f"{indent}{a:<12}{med[i]:>14.4f}{min(vals):>11.4f}{max(vals):>11.4f}   {note}")


def _raw_median(batches, key):
    vals = []
    for b in batches:
        for e in b:
            v = (e.get("raw_signals") or {}).get(key)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                vals.append(float(v))
    return round(statistics.median(vals), 4) if vals else None


def run_bars(label: str) -> bool:
    import numpy as np
    from playwright.sync_api import sync_playwright
    from f4_capture import ml_post, ml_get

    # N justified: P21 established the harness cannot control locomotion timing (transit windows vary
    # by up to +/-530ms while stationary ones match within ~11ms) and W is not diagonal, so the shift
    # reaches every axis. F4's beats are almost entirely walking. N=5 is the same N F5's bars used,
    # and each F4 run is FIVE browser sessions per persona rather than two, so the min/max spread is
    # printed beside every median for the reader to judge stability rather than take the median alone.
    n_runs = int(os.environ.get("F4_RUNS", "5"))
    beats = ["promise", "return", "exchange", "conflict", "generosity"]

    with sync_playwright() as pw:
        # a discarded WARM-UP: the INFRA actually observed in P21 was a cold-Next-compile goto
        # timeout on the first run of a session, not a beat miss.
        print("\nwarm-up run (discarded)…")
        try:
            capture(pw, "hank", "generosity", "warm_partner", "warmup")
        except Exception as e:
            print(f"  warm-up raised (ignored): {e}")

        # ── BAR 1 ──
        print(f"\n{'-'*104}")
        print(f"BAR 1 — INDIVIDUATION: the same four beats, the SAME branch in every one, "
              f"median of {n_runs} COMPLETE runs")
        print(f"{'-'*104}")
        per_run, infra1, attempts = [], 0, 0
        raw_by_persona = {"tessa": [], "hank": []}
        while len(per_run) < n_runs and attempts < n_runs * 3:
            attempts += 1
            run, ok = {}, True
            for persona in ("tessa", "hank"):
                uid = f"{label}_b1_{attempts}_{persona}"
                evs_all = []
                for beat in beats:
                    evs, drove = capture(pw, persona, beat, f"{label}_partner", uid)
                    good, why = complete(evs, beat)
                    if not (drove and good):
                        print(f"  [INFRA] run {attempts}: {persona}/{why or 'drive failed'}")
                        ok = False
                        break
                    evs_all += evs
                    if beat == "promise":
                        age_a_day(uid)   # a real elapsed day between the promise and the return
                if not ok:
                    break
                run[persona] = evs_all
            if not ok:
                infra1 += 1
                continue
            mt = posterior_for(run["tessa"], f"{label}_b1_{attempts}_t", ml_post, ml_get)
            mh = posterior_for(run["hank"], f"{label}_b1_{attempts}_h", ml_post, ml_get)
            per_run.append((mt - mh).tolist())
            raw_by_persona["tessa"].append(run["tessa"])
            raw_by_persona["hank"].append(run["hank"])
            print(f"  run {len(per_run)}/{n_runs}  pooled {float(np.linalg.norm(mt - mh)):.4f}   "
                  f"(tessa {len(run['tessa'])} ev, hank {len(run['hank'])} ev)")

        if len(per_run) < n_runs:
            print(f"\n[INFRA] only {len(per_run)}/{n_runs} COMPLETE runs after {attempts} attempts.")
            return False

        med = [statistics.median([r[i] for r in per_run]) for i in range(8)]
        pooled = [float(np.linalg.norm(np.array(r))) for r in per_run]
        print(f"\n  INFRA runs excluded: {infra1}")
        print(f"  pooled L2, median of {n_runs}: {statistics.median(pooled):.4f}  "
              f"(min {min(pooled):.4f}, max {max(pooled):.4f})")
        _axis_table(per_run, med)

        print("\n  branch check — both personas must take the SAME branch in every beat:")
        for persona in ("tessa", "hank"):
            acts = sorted({e.get("action") for b in raw_by_persona[persona] for e in b})
            print(f"    {persona:<7} {acts}")

        print("\n  what actually differs, tessa vs hank (median over runs):")
        for key, disp in (("gift_amount01", "-> ts_social (routed)"),
                          ("trips", "-> persistence (routed)"),
                          ("decision_latency_ms", "-> decision_latency (routed)"),
                          ("repair_hold01", "-> persistence (routed)"),
                          ("rounds_cooperated", "-> consistency (routed, with rounds_total)"),
                          ("stake_amount01", "UNROUTED ⚑"),
                          ("return_directness01", "UNROUTED ⚑"),
                          ("detoured_first01", "UNROUTED ⚑"),
                          ("settle_distance", "UNROUTED ⚑"),
                          ("circled01", "UNROUTED ⚑"),
                          ("response_to_defect01", "UNROUTED ⚑ (F4's signature cue)")):
            a, b = _raw_median(raw_by_persona["tessa"], key), _raw_median(raw_by_persona["hank"], key)
            if a is None and b is None:
                continue
            print(f"    {key:<22} tessa={a}  hank={b}   {disp}")

        controlled = [(a, med[i]) for i, a in enumerate(AXES) if a not in UNCONTROLLED]
        best = max(controlled, key=lambda kv: abs(kv[1]))
        bar1 = abs(best[1]) > 0.02 and statistics.median(pooled) > 0.05
        print(f"\n  strongest CONTROLLED axis: {best[0]} at {best[1]:+.4f}")
        print(f"  BAR 1: {'PASS' if bar1 else 'FAIL'}")

        # ── BAR 2 ──
        print(f"\n{'-'*104}")
        print(f"BAR 2 — THE REPETITION DELTA: {len(PERSONAS['tessa']['place_ms'])} rounds with ONE "
              f"recurring partner vs the same number of one-shots with DIFFERENT partners")
        print(f"{'-'*104}")
        print("  Same persona, same acts, same count. The only thing that varies is whether the")
        print("  counterpart is the same person each time. If these read alike, F4 measures nothing")
        print("  F2 and F3 did not.")
        d2, infra2, attempts = [], 0, 0
        rep_raw, one_raw = [], []
        while len(d2) < n_runs and attempts < n_runs * 3:
            attempts += 1
            uid_r = f"{label}_b2_{attempts}_rep"
            rep, drove = capture(pw, "tessa", "exchange", f"{label}_recurring", uid_r)
            good_r, why_r = complete(rep, "exchange")
            one, ok_o = [], True
            for k in range(len(PERSONAS["tessa"]["place_ms"])):
                uid_o = f"{label}_b2_{attempts}_one{k}"
                evs, d = capture(pw, "tessa", "exchange", f"{label}_stranger{k}", uid_o, rounds=1)
                g, _ = complete(evs, "exchange")
                if not (d and g):
                    ok_o = False
                    break
                one += evs
            if not (drove and good_r and ok_o):
                print(f"  [INFRA] run {attempts}: {why_r or 'a one-shot arm did not complete'}")
                infra2 += 1
                continue
            mr = posterior_for(rep, f"{label}_b2_{attempts}_R", ml_post, ml_get)
            mo = posterior_for(one, f"{label}_b2_{attempts}_O", ml_post, ml_get)
            d2.append((mr - mo).tolist())
            rep_raw.append(rep)
            one_raw.append(one)
            print(f"  run {len(d2)}/{n_runs}  ||repeated - one-shot|| = "
                  f"{float(np.linalg.norm(mr - mo)):.4f}   ({len(rep)} ev vs {len(one)} ev)")

        if len(d2) < n_runs:
            print(f"\n[INFRA] only {len(d2)}/{n_runs} COMPLETE delta runs.")
            return False

        med2 = [statistics.median([r[i] for r in d2]) for i in range(8)]
        pooled2 = [float(np.linalg.norm(np.array(r))) for r in d2]
        print(f"\n  INFRA runs excluded: {infra2}")
        print(f"  ||repeated - one-shot||, median of {n_runs}: {statistics.median(pooled2):.4f}  "
              f"(min {min(pooled2):.4f}, max {max(pooled2):.4f})")
        _axis_table(d2, med2)

        print("\n  which cues carry the delta, repeated vs one-shot (median over runs):")
        for key, disp in (("rounds_cooperated", "-> consistency (routed)"),
                          ("rounds_total", "-> consistency (routed, the denominator)"),
                          ("decision_latency_ms", "-> decision_latency (routed)"),
                          ("stake_amount01", "UNROUTED ⚑"),
                          ("response_to_defect01", "UNROUTED ⚑ — F4's signature cue, "
                                                   "and it exists ONLY in the repeated arm")):
            a, b = _raw_median(rep_raw, key), _raw_median(one_raw, key)
            if a is None and b is None:
                continue
            print(f"    {key:<22} repeated={a}  one-shot={b}   {disp}")
        reps = {e.get("action") for b in rep_raw for e in b}
        ones = {e.get("action") for b in one_raw for e in b}
        print(f"    actions, repeated arm: {sorted(reps)}")
        print(f"    actions, one-shot arm: {sorted(ones)}")

        controlled2 = [(a, med2[i]) for i, a in enumerate(AXES) if a not in UNCONTROLLED]
        best2 = max(controlled2, key=lambda kv: abs(kv[1]))
        bar2 = abs(best2[1]) > 0.02
        print(f"\n  strongest CONTROLLED axis: {best2[0]} at {best2[1]:+.4f}")
        print(f"  BAR 2: {'PASS' if bar2 else 'FAIL'}")

        with open(f"/tmp/{label}_f4_acceptance.json", "w") as f:
            json.dump({"bar1": bar1, "bar2": bar2, "b1_median": med, "b2_median": med2,
                       "b1_pooled": pooled, "b2_pooled": pooled2}, f, indent=2)
        return bool(bar1 and bar2)
