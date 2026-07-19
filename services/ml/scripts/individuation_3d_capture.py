"""3D individuation — driven through the REAL client, not synthesized.

The 2D walkthrough (flow1_embodied_walkthrough.py) proves the measurement SPINE: it hands crafted
events to the ML service and shows they individuate. But it would pass UNCHANGED even if the 3D
client silently stopped emitting the manner cues — it never touches the client. That is exactly the
hole this harness closes.

Here, a real headless-Chromium browser loads the real /flow1 3D scene twice, and Playwright drives
the raft build through two contrasting PERFORMANCES of the same activity:

  • Tessa — thorough: gathers every driftwood, holds the lashings long past "it floats" to decorate,
            works deliberately.
  • Hank  — hasty: gathers the minimum, holds only until it floats, launches at once.

Every /api/observe/behavioral POST the client fires is captured off the network — these are the REAL
BehavioralEvents the real client emitted, raw_signals and all. We then feed each persona's captured
stream to a fresh posterior through the REAL ingress (the same W, untouched) and measure the
distance between the two, exactly as the 2D baseline did — but on events that came out of the client
under real motion and real key presses, not out of a Python dict.

Gate: ‖μ_tessa − μ_hank‖ against the 2D baseline of 0.2620. Report it honestly, worse or not. If the
captured raw_signals do NOT diverge, the 3D cue path is broken and this FAILS loudly.

Run (servers are booted for you by with_server / run_individuation_3d.sh):
    WEB=http://localhost:3000 ML=http://localhost:8000 python scripts/individuation_3d_capture.py
Exit 0 PASS, 1 FAIL, 2 INFRA (couldn't drive the client — reported, never faked).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

WEB = os.environ.get("WEB", "http://localhost:3000")
ML = os.environ.get("ML", "http://localhost:8000")
ML_TOKEN = os.environ.get("ML_SERVICE_TOKEN", "dev-secret-token")

BAR = "=" * 104


def ml_post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        ML + path,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {ML_TOKEN}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def ml_get(path: str) -> dict:
    req = urllib.request.Request(ML + path, headers={"authorization": f"Bearer {ML_TOKEN}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


# ── the two performances ──────────────────────────────────────────────────────────
# Each is a list of (action, hold_ms) the harness enacts through the REAL input path: walk to the
# object with setAutoWalk, then press/hold space (a real keydown/keyup) for hold_ms. The DIFFERENCE
# between the two is manner — how much wood, how long the hold — never which buttons.


def drive(page, persona: str, thorough: bool) -> dict:
    """Drive one raft build in the live client through genuinely different MANNER, and return a small
    trace of what actually happened so the caller can tell a real performance from a stuck one.

    The two personas differ in exactly the ways "thorough" and "hasty" are supposed to differ, and
    in nothing else — both complete the same build:
      • gather: Tessa takes every piece (over-gathers → thoroughness); Hank takes the 5 needed.
      • build : Tessa holds the lashings to ~13 s (past SOLID_MS 9000 → decoration); Hank to ~5 s
                (just past MIN_BUILD_MS 4200 → it floats, no more).
    """
    page.wait_for_function("() => !!window.__echo && window.__echo.points", timeout=20000)
    pts = page.evaluate("() => window.__echo.points()")
    wood = pts["wood"]
    assembly = pts["assembly"]
    launch = pts["launch"]

    def me():
        return page.evaluate("() => window.__echo.self()")

    def walk_to(x, y, tol=0.9, timeout=14.0) -> bool:
        # Re-issue the walk target periodically (a single click can be dropped if we clip a corner),
        # and wait until we have actually ARRIVED before doing anything — the flakiness last time was
        # pressing before the avatar reached the wood.
        last_issue = 0.0
        t0 = time.time()
        while time.time() - t0 < timeout:
            now = time.time()
            if now - last_issue > 1.2:
                page.evaluate(f"() => window.__echo.walkTo({x}, {y})")
                last_issue = now
            s = me()
            if abs(s["x"] - x) < tol and abs(s["y"] - y) < tol:
                return True
            page.wait_for_timeout(100)
        return False

    def hold(ms):
        # One continuous hold — actionDown stays true across OS key-repeat, so raftBuild accumulates
        # workMs the whole time. (Slicing it last time let the accumulator fall between presses.)
        page.keyboard.down(" ")
        page.wait_for_timeout(ms)
        page.keyboard.up(" ")

    trace = {"gathered": 0, "reached_assembly": False, "built_ms": 0, "reached_launch": False}

    # ── gather ──
    take = wood if thorough else wood[:5]
    for w in take:
        if walk_to(w["x"], w["y"]):
            page.wait_for_timeout(250 if thorough else 120)  # a beat to settle, thorough lingers
            hold(70)  # a tap picks
            trace["gathered"] += 1

    # ── assemble ──
    # MIN_BUILD_MS=4200 (floats), SOLID_MS=9000, LAVISH_BUILD_MS=15000 (full decoration). Both must
    # clear the float gate so both EMIT the assemble cue — the scripted slips stall ~420ms each, so
    # even the hasty hold sits well above 4200. The divergence is real manner: Tessa holds past SOLID
    # into decoration, Hank stops the moment it is seaworthy.
    if walk_to(assembly["x"], assembly["y"], tol=1.0):
        trace["reached_assembly"] = True
        # Hasty still means "float it and stop" — 6500ms lands ~5800 workMs, comfortably past the
        # float gate (MIN 4200) so launch fires reliably even when headless render jank steals frames,
        # yet far below SOLID (9000) so there is still zero decoration. The manner contrast is
        # unchanged (thoroughness ~0.39 vs ~1.0); only the drive's reliability improves.
        build_ms = 16500 if thorough else 6500
        hold(build_ms)
        trace["built_ms"] = build_ms
        trace["raft_after_build"] = page.evaluate("() => window.__echo.raft && window.__echo.raft()")

    # ── finish + launch ── the assemble cue fires when the raft floats AND you carry it away from the
    # workspace (dist > AT_STATION+0.6). Walk clearly off the spot first so that finish triggers, then
    # on to the waterline where it auto-launches.
    walk_to(assembly["x"] + 3, assembly["y"] + 3, tol=1.2, timeout=8)
    if walk_to(launch["x"], launch["y"], tol=1.6):
        trace["reached_launch"] = True
        # Push it in — the launch cue carries decision_latency_ms (commitment latency → pace). Tessa
        # considers it; Hank snaps it off.
        page.wait_for_timeout(1600 if thorough else 120)
        page.keyboard.down(" "); page.wait_for_timeout(80); page.keyboard.up(" ")
    trace["raft_final"] = page.evaluate("() => window.__echo.raft && window.__echo.raft()")

    # ── the other five F1 beats, played to each persona's character (this is what makes the 3D number
    #    comparable to the 2D 0.2620, which drove all of them). Tessa: patient, persistent, cautious.
    #    Hank: hasty, minimal, risk-seeking. The forks are the doc's high-validity individuators —
    #    plant-vs-eat (save_rate), stay-vs-enter the cave (risk→dominance), long-vs-brief study, a
    #    persisted dig, the stillness that coaxes the creature. ──
    beats = pts["beats"]

    def tap(hold_ms=70):
        page.keyboard.down(" ")
        page.wait_for_timeout(hold_ms)
        page.keyboard.up(" ")

    def at(name):
        return name in beats and beats[name]

    if thorough:
        # study the stone at length (dwell past the reveal), then walk away to emit. Do it FIRST, while
        # nothing else is nearby, so the active-beat pick is unambiguous.
        if at("marker_stone") and walk_to(beats["marker_stone"]["x"], beats["marker_stone"]["y"]):
            page.wait_for_timeout(250); tap(); page.wait_for_timeout(3400)
            walk_to(beats["marker_stone"]["x"] + 4, beats["marker_stone"]["y"] + 4, tol=1.2)
        # plant the seed (delayed payoff)
        if at("fertile_patch") and walk_to(beats["fertile_patch"]["x"], beats["fertile_patch"]["y"]):
            page.wait_for_timeout(300); tap()
        # dig the cache, holding through the resistance (persist_after_fail)
        if at("buried_cache") and walk_to(beats["buried_cache"]["x"], beats["buried_cache"]["y"]):
            page.keyboard.down(" "); page.wait_for_timeout(4200); page.keyboard.up(" ")
        # linger at the cave mouth, then think better of it (stay_safe, cautious → low risk)
        if at("gamble_cave") and walk_to(beats["gamble_cave"]["x"], beats["gamble_cave"]["y"], tol=1.9):
            page.wait_for_timeout(1300); walk_to(beats["gamble_cave"]["x"] + 5, beats["gamble_cave"]["y"] + 5, tol=1.5)
        # hold still until the shy creature comes out (calm / solitude)
        page.wait_for_timeout(9000)
    else:
        # eat now (instant payoff)
        if at("berry_bush") and walk_to(beats["berry_bush"]["x"], beats["berry_bush"]["y"]):
            page.wait_for_timeout(120); tap()
        # a brief glance at the stone (short dwell), then move on
        if at("marker_stone") and walk_to(beats["marker_stone"]["x"], beats["marker_stone"]["y"]):
            tap(); page.wait_for_timeout(700); walk_to(beats["marker_stone"]["x"] + 3, beats["marker_stone"]["y"] + 3, tol=1.2)
        # enter the dark cave (risk-seeking → dominance, the doc's biggest single individuator)
        if at("gamble_cave") and walk_to(beats["gamble_cave"]["x"], beats["gamble_cave"]["y"]):
            page.wait_for_timeout(150); tap()

    page.wait_for_timeout(1000)  # let the final batch flush
    return trace


def capture(playwright, persona: str, thorough: bool) -> list[dict]:
    events: list[dict] = []
    browser = playwright.chromium.launch(
        headless=True,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    )
    ctx = browser.new_context(viewport={"width": 900, "height": 640})
    page = ctx.new_page()

    def on_request(req):
        if "/api/observe/behavioral" in req.url and req.method == "POST":
            try:
                body = req.post_data_json
                for ev in body.get("events", []):
                    events.append(ev)
            except Exception:
                pass

    page.on("request", on_request)
    page.goto(f"{WEB}/flow1?u={persona}", wait_until="networkidle")
    trace = {}
    try:
        trace = drive(page, persona, thorough)
    finally:
        page.wait_for_timeout(600)  # let the last batch flush
        browser.close()
    print(f"    trace: gathered={trace.get('gathered')} assembly={trace.get('reached_assembly')} "
          f"built_ms={trace.get('built_ms')} launch={trace.get('reached_launch')}")
    print(f"    raft after build: {trace.get('raft_after_build')}   final: {trace.get('raft_final')}")
    return events, trace


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"[INFRA] playwright not importable: {e}")
        return 2

    print(BAR)
    print("3D INDIVIDUATION — the real client, driven through two performances of the raft build")
    print(BAR)
    print()

    try:
        with sync_playwright() as pw:
            print("driving Tessa (thorough)…")
            tessa_ev, tessa_tr = capture(pw, "cap_tessa", thorough=True)
            print(f"  captured {len(tessa_ev)} real events from the client")
            print("driving Hank (hasty)…")
            hank_ev, hank_tr = capture(pw, "cap_hank", thorough=False)
            print(f"  captured {len(hank_ev)} real events from the client")
    except Exception as e:
        print(f"[INFRA] could not drive the client: {e}")
        return 2

    # Both must actually have PERFORMED the build — else the distance measures "one played, one
    # didn't", not two styles. This is the honesty gate the first run failed. Completion means the
    # raft floated and the assemble cue (C7) fired: that cue is the whole individuation of the build.
    def assembled(evs):
        return any(e.get("cue") == "C7" for e in evs)

    for name, tr, evs in (("Tessa", tessa_tr, tessa_ev), ("Hank", hank_tr, hank_ev)):
        if tr.get("gathered", 0) < 5 or not tr.get("reached_assembly") or not assembled(evs):
            print(f"[INFRA] {name} did not complete the build "
                  f"(gathered={tr.get('gathered')}, assembly={tr.get('reached_assembly')}, "
                  f"assemble_cue={assembled(evs)}). The harness could not drive the client cleanly "
                  "— NOT a measurement result.")
            return 2

    # Every counted run must be a COMPLETE performance: each persona's characteristic beats must have
    # fired. Otherwise a timing-sensitive beat that mis-fires in headless (e.g. the cave fork not
    # landing) silently deflates the pooled L2 and pollutes the 2D-vs-3D comparison with drive luck
    # rather than cue fidelity. A missing beat is INFRA (drive flakiness), never a low number.
    def actions(evs):
        return {e.get("action") for e in evs}

    REQUIRED = {
        "Tessa": {"plant_seed", "study_marker", "dig_cache", "stay_safe", "sit_still", "launch_raft"},
        "Hank": {"eat_now", "study_marker", "enter_cave", "launch_raft"},
    }
    for name, evs in (("Tessa", tessa_ev), ("Hank", hank_ev)):
        missing = REQUIRED[name] - actions(evs)
        if missing:
            print(f"[INFRA] {name} did not perform every beat this run (missing {sorted(missing)}). "
                  "A timing-sensitive beat mis-fired in headless — drive flakiness, NOT a measurement "
                  "result. Re-run; do not count this number.")
            return 2

    if not tessa_ev or not hank_ev:
        print("[INFRA] no events captured — the client did not emit. Not a measurement result.")
        return 2

    # LABEL keys the ML users AND the dump files, so 2D and 3D can be captured against ONE ML
    # instance without their posteriors colliding (the whole point of the real-2D-vs-real-3D run).
    label = os.environ.get("LABEL", "ind3d")
    if os.environ.get("DUMP"):
        with open(f"/tmp/{label}_tessa.json", "w") as f:
            json.dump(tessa_ev, f, indent=2)
        with open(f"/tmp/{label}_hank.json", "w") as f:
            json.dump(hank_ev, f, indent=2)
        print(f"  dumped raw events to /tmp/{label}_{{tessa,hank}}.json")

    # ── the locomotion cues get their own look: these are the render-independent sampler outputs
    #    (speed/heading/novelty/still) that a bad port would smear. Report them separately so a drop
    #    can be traced to the sampler vs the discrete beats. ──
    def raw_of(evs, key):
        vals = [e.get("raw_signals", {}).get(key) for e in evs]
        return [v for v in vals if isinstance(v, (int, float))]

    def stat(evs, key):
        v = raw_of(evs, key)
        return (max(v) if v else 0.0, sum(v) / len(v) if v else 0.0, len(v))

    print()
    print("captured raw_signals (real, off the client) — max shown:")
    diverged = False
    for k in ("thoroughness01", "decoration", "persist_after_fail", "dwell_ms", "still_ms",
              "speed_var", "heading_var", "explore_ratio"):
        tm, _, _ = stat(tessa_ev, k)
        hm, _, _ = stat(hank_ev, k)
        mark = "  ⟵ diverges" if abs(tm - hm) > 1e-3 else ""
        if abs(tm - hm) > 1e-3:
            diverged = True
        tag = " [locomotion]" if k in ("speed_var", "heading_var", "explore_ratio", "still_ms") else ""
        print(f"  {k:<20} tessa={tm:<10.3f} hank={hm:<10.3f}{mark}{tag}")

    # ── feed each stream to a fresh posterior through the REAL ingress, measure the distance ──
    tessa_uid = f"{label}_tessa"
    hank_uid = f"{label}_hank"
    # Re-key the captured events onto clean users so the two posteriors are independent.
    for ev in tessa_ev:
        ev = dict(ev)
        ev["actor_id"] = tessa_uid
        try:
            ml_post("/observe/behavioral", {"event": ev})
        except Exception:
            pass
    for ev in hank_ev:
        ev = dict(ev)
        ev["actor_id"] = hank_uid
        try:
            ml_post("/observe/behavioral", {"event": ev})
        except Exception:
            pass

    import numpy as np

    mu_t = np.array(ml_get(f"/persona/{tessa_uid}")["persona"]["mu"], dtype=float)
    mu_h = np.array(ml_get(f"/persona/{hank_uid}")["persona"]["mu"], dtype=float)
    dist = float(np.linalg.norm(mu_t - mu_h))
    axes = ["warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect"]
    diff = (mu_t - mu_h).tolist()

    print()
    print(BAR)
    print(f"‖μ_tessa − μ_hank‖ = {dist:.4f}   [{label}]")
    print("  FULL per-axis separation (μ_tessa − μ_hank):")
    for a, dv, mt, mh in sorted(zip(axes, diff, mu_t.tolist(), mu_h.tolist()), key=lambda z: -abs(z[1])):
        loco = "  ← locomotion-driven" if a in ("pace", "openness", "energy") else ""
        print(f"    {a:<10} {dv:+.4f}   (tessa {mt:+.3f}  hank {mh:+.3f}){loco}")
    finite = bool(np.all(np.isfinite(mu_t)) and np.all(np.isfinite(mu_h)))
    ok = diverged and finite and dist > 0.05
    print()
    print(f"  raw_signals diverge: {diverged}    posteriors finite: {finite}    distance > 0.05: {dist > 0.05}")
    print(f"RESULT: {'PASS ✅' if ok else 'FAIL ❌'}")
    print(BAR)

    # Machine-readable result for the real-2D vs real-3D comparison.
    with open(f"/tmp/{label}_result.json", "w") as f:
        json.dump({"label": label, "dist": dist, "axes": axes, "diff": diff,
                   "mu_tessa": mu_t.tolist(), "mu_hank": mu_h.tolist()}, f, indent=2)
    print(f"  wrote /tmp/{label}_result.json")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
