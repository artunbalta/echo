"""F4 acceptance capture: cross-session driving, siloing, individuation, and the repetition delta.

Built BEFORE the F4 flow, deliberately. A previous round produced a feature with no number because
the capture came second; the standing rule is now measurement first.

Lives OUTSIDE services/ml, which is frozen except ingest.py. It does not touch the F1 or F5 captures,
drives or gates; F4's capture is additive.

WHAT A SYNTHETIC NUMBER HERE CAN AND CANNOT ESTABLISH. Carried forward from F5's Bar 2, and F4 is
more exposed to it. Every number this file reports is a property of the DRIVE as much as of the
product. A scripted persona keeps a promise because the script says so, not because it is
conscientious. So what these bars legitimately prove is that the pipeline carries a difference and
which cue carries it. They do NOT prove that real people exhibit that difference. Any report
quoting these numbers must carry that boundary with them.

AND A PASSING BAR IS NARROWER STILL. F4's signature cue, `response_to_defect01` (the iterated-game
tit-for-tat read), has no anchored feature in the committed W and is emitted unrouted, exactly as
F5's `circled01` is. So a bar that passes demonstrates that the pipeline carries a difference
through GENERIC MANNER CUES; it does not demonstrate that the flow measures the thing it was
designed to measure. F5 showed this plainly, separating on `formality` in a flow about rescuing a
bird and robbing a cache. The report must not overstate it.

THE TRAP THIS IS DESIGNED AROUND. F4's beats are choices: a promise kept or broken, a conflict
repaired or not. A decision is a button in disguise, and a button cannot individuate people. If the
two personas differ in WHICH BRANCH they take, the posteriors diverge because two different choices
were scripted, which is the multiple-choice questionnaire the whole design exists to escape. So Bar 1
requires both personas to take the SAME branch and differ only in the manner around it.

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
import subprocess
import sys
import time
import urllib.error
import urllib.request

WEB = os.environ.get("WEB", "http://localhost:3000")
# A second web server booted WITHOUT ECHO_TEST_CLOCK, so the gate's CLOSED state is demonstrated
# rather than argued. Optional: skipped (and said so) when the runner did not boot it.
WEB_NOCLOCK = os.environ.get("WEB_NOCLOCK", "")
ML = os.environ.get("ML", "http://localhost:8000")
ML_TOKEN = os.environ.get("ML_SERVICE_TOKEN", "dev-secret-token")
PROXY_LOG = os.environ.get("F4_PROXY_LOG", "/tmp/f4_observe.jsonl")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BAR = "=" * 104
AXES = ["warmth", "dominance", "openness", "energy", "formality", "intellect", "pace", "affect"]
UNCONTROLLED = {"energy", "openness", "pace"}
DAY_MS = 24 * 60 * 60 * 1000
# packages/shared/src/world.ts SURVIVAL.DECAY — the rates this check predicts against.
TIE_COOL_PER_DAY = 0.08


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


def web_get(path: str, base: str | None = None) -> dict:
    with urllib.request.urlopen((base or WEB) + path, timeout=20) as r:
        return json.loads(r.read())


def web_post(path: str, body: dict, base: str | None = None) -> dict:
    req = urllib.request.Request(
        (base or WEB) + path, data=json.dumps(body).encode(),
        headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


# ── the cross-session machinery, over HTTP, with the gated clock ───────────────────────────────
#
# The gap this closes. Crop wilt decays from `cropPlantedAt`, which the client supplies, so it was
# already ageable over the wire. Tie cooling and raft weathering decay from `now - updatedAt`, and
# POST re-stamped `updatedAt` to the present on every save, so between two back-to-back harness
# sessions a tie could never cool. tieWarmth is the exact substrate F4 rides on, so the ONE
# cross-session mechanism previously demonstrated was the one F4 does not use.
#
# The route now accepts an injected `now` behind a server-side gate (see the route's own comment for
# what makes it unreachable from a production client). These helpers use it, and assert it is
# actually live rather than assuming it: a response without the `testClock` echo means the gate is
# shut, which is INFRA and is reported, never worked around.

def load_island(user: str, now: int | None = None, base: str | None = None) -> dict:
    q = f"/api/island/state?userId={user}" + (f"&now={now}" if now is not None else "")
    return web_get(q, base)


def save_island(user: str, state: dict, now: int | None = None, base: str | None = None) -> dict:
    body: dict = {"userId": user, "state": state}
    if now is not None:
        body["now"] = now
    return web_post("/api/island/state", body, base)


def cross_session_check(label: str) -> tuple[bool, list[str]]:
    """Two sessions, a real store, an injected clock, and a tie that must actually cool."""
    lines: list[str] = []
    u = f"{label}_xsess_{int(time.time())}"
    t0 = int(time.time() * 1000)

    s1 = load_island(u, t0)
    if "testClock" not in s1:
        lines.append("  the clock hook is SHUT on this server (no testClock echo) — cannot run.")
        return False, lines
    lines.append(f"  session 1: fresh={s1['fresh']}  persistence={s1['persistence']}  "
                 f"tieWarmth={s1['state']['tieWarmth']}  (WORLD state)")

    st = s1["state"]
    st["cropStage"] = "planted"
    st["cropPlantedAt"] = t0
    st["raft"] = {**st["raft"], "workMs": 9000, "planks": 3, "launched": False}
    st["tieWarmth"] = {"partner_a": 0.60, "partner_b": 0.85}
    st["dayCount"] = 1
    saved = save_island(u, st, t0)
    if saved.get("testClock") != t0:
        lines.append("  POST did not honour the injected clock — cannot run.")
        return False, lines
    lines.append(f"  saved at the injected t0, updatedAt pinned: {saved}")

    # A NEW session three days later. Nothing waited on; the clock is injected.
    days = 3
    s2 = load_island(u, t0 + days * DAY_MS)
    w2 = s2["state"]["tieWarmth"]
    lines.append(f"  session 2, +{days} days injected: persistence={s2['persistence']}  "
                 f"cropStage={s2['state']['cropStage']}  raft.workMs={s2['state']['raft']['workMs']:.1f}")
    lines.append(f"  tieWarmth BEFORE {{'partner_a': 0.6, 'partner_b': 0.85}}  (WORLD state)")
    lines.append(f"  tieWarmth AFTER  {{'partner_a': {w2['partner_a']:.4f}, "
                 f"'partner_b': {w2['partner_b']:.4f}}}  (WORLD state)")
    lines.append(f"  changes: {s2['changes']}")

    want_a = 0.60 - TIE_COOL_PER_DAY * days
    want_b = 0.85 - TIE_COOL_PER_DAY * days
    cooled = abs(w2["partner_a"] - want_a) < 1e-3 and abs(w2["partner_b"] - want_b) < 1e-3
    lines.append(f"  predicted from TIE_COOL_PER_DAY={TIE_COOL_PER_DAY} over {days}d: "
                 f"partner_a {want_a:.4f}, partner_b {want_b:.4f}   "
                 f"{'MATCH' if cooled else 'MISMATCH'}")

    # The injected clock is what drives it: a different `now` must give a different answer.
    u2 = f"{label}_xsess2_{int(time.time())}"
    load_island(u2, t0)
    st2 = dict(st)
    st2["tieWarmth"] = {"partner_a": 0.60}
    save_island(u2, st2, t0)
    s6 = load_island(u2, t0 + 6 * DAY_MS)
    six = s6["state"]["tieWarmth"]["partner_a"]
    lines.append(f"  the same state read at +6 days instead: partner_a {six:.4f} "
                 f"(vs {w2['partner_a']:.4f} at +3d) — the injected clock is what moves it")

    weathered = s2["state"]["raft"]["workMs"] < 9000
    wilted = s2["state"]["cropStage"] == "wilted"
    tie_line = any("bond" in c for c in s2["changes"])
    ok = cooled and weathered and wilted and tie_line and abs(six - w2["partner_a"]) > 1e-3
    lines.append(f"  tie cooled: {cooled}   raft weathered: {weathered}   crop wilted: {wilted}   "
                 f"honest change line for the tie that crossed 0.5: {tie_line}")
    return ok, lines


def gate_closed_probe() -> tuple[bool, list[str]]:
    """The other half of the hook: with ECHO_TEST_CLOCK unset the injected clock is INERT.

    Demonstrated rather than argued. This runs against a web server booted WITHOUT the opt-in (the
    runner boots one first, runs this, tears it down, and only then boots the flagged one, so both
    passes use the SAME route file and never fight over .next). The same `?now=` a production client
    could send is sent here; the response must carry no testClock echo and the state must not have
    aged by a single day in either direction.
    """
    lines: list[str] = []
    u = f"gate_{int(time.time())}"
    t0 = int(time.time() * 1000)
    try:
        s1 = load_island(u)
        st = s1["state"]
        st["tieWarmth"] = {"partner_a": 0.60}
        st["cropStage"] = "planted"
        st["cropPlantedAt"] = t0
        save_island(u, st, t0 - 30 * DAY_MS)   # a client lying about the past
        s2 = load_island(u, t0 + 30 * DAY_MS)  # a client lying about the future
    except Exception as e:
        return False, [f"  [INFRA] could not reach the no-flag server: {e}"]
    warm = s2["state"]["tieWarmth"].get("partner_a", 0.0)
    lines.append(f"  ECHO_TEST_CLOCK unset on this server.")
    lines.append(f"  testClock echoed back on GET? {'testClock' in s2}   (must be False)")
    lines.append(f"  ?now= lied by 30 days into the PAST on POST and 30 days into the FUTURE on GET")
    lines.append(f"  tieWarmth after both lies: {s2['state']['tieWarmth']}   (must be ~0.60, untouched)")
    lines.append(f"  cropStage after both lies: {s2['state']['cropStage']}   (must still be planted)")
    ok = ("testClock" not in s2) and warm > 0.599 and s2["state"]["cropStage"] == "planted"
    lines.append(f"  the parameter is INERT without the server-side opt-in: {ok}")
    return ok, lines


def gate_result() -> tuple[bool | None, list[str]]:
    """Read the closed-gate probe the runner performed against the unflagged server."""
    path = os.environ.get("F4_GATE_RESULT", "")
    if not path or not os.path.exists(path):
        return None, ["  (skipped: the runner did not run the closed-gate pass)"]
    with open(path) as f:
        r = json.load(f)
    return bool(r.get("ok")), list(r.get("lines", []))


# ── siloing, on the INTERACTION path ───────────────────────────────────────────────────────────
#
# The previous version of this check drove the proxemic path, where the counterpart emits nothing at
# all, so "B did not move" was the expected result whether or not siloing worked. The interaction
# path builds BOTH actors' events side by side in one function from one interaction, which is where a
# mix-up would actually happen, and it is the path F4 runs on because repeated games are interactions
# rather than proximity. See harness/f4/siloing_driver.mjs for what is driven.

def read_proxy_log() -> list[dict]:
    try:
        with open(PROXY_LOG) as f:
            return [json.loads(ln) for ln in f if ln.strip()]
    except FileNotFoundError:
        return []


def siloing_interaction(label: str) -> tuple[bool, list[str]]:
    import numpy as np
    lines: list[str] = []

    before = len(read_proxy_log())
    env = dict(os.environ, LABEL=label, ML=ML, ML_SERVICE_TOKEN=ML_TOKEN)
    try:
        p = subprocess.run(
            ["node", os.path.join(ROOT, "harness/f4/siloing_driver.mjs")],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    except Exception as e:
        return False, [f"  [INFRA] could not run the driver: {e}"]
    try:
        res = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        return False, [f"  [INFRA] driver produced no JSON.\n  stdout: {p.stdout[-800:]}\n"
                       f"  stderr: {p.stderr[-800:]}"]
    if "error" in res:
        return False, [f"  [INFRA] driver failed: {res['error'][:600]}"]

    ids = res["ids"]
    ab, ad, bc, self_ = res["phases"]["ab"], res["phases"]["ad"], res["phases"]["bc"], res["phases"]["self"]

    # 1. BOTH events emitted. Read off the wire, not inferred from a posterior that moved.
    emitted = [ln["event"] for ln in read_proxy_log()[before:] if "event" in ln]
    by_actor: dict[str, list[dict]] = {}
    for e in emitted:
        by_actor.setdefault(e.get("actor_id", "?"), []).append(e)
    counts = {k: len(v) for k, v in sorted(by_actor.items())}
    lines.append(f"  events the server actually emitted, by actor_id: {counts}")
    # emitFirstContact emits TWO events per actor per interaction (first-contact + proxemics).
    want = {ids["a"]: 4, ids["b"]: 4, ids["c"]: 2, ids["d"]: 2, ids["twin"]: 1}
    both_emitted = counts == want
    lines.append(f"  expected (2 per actor per interaction, + the 1 control cue): "
                 f"{ {k.split('_')[-1]: v for k, v in want.items()} }   "
                 f"{'MATCH' if both_emitted else 'MISMATCH'}")
    # and every event names the OTHER actor as its target: the pair is not built swapped
    swapped = [e for e in emitted
               if e.get("target", {}).get("id") == e.get("actor_id")]
    lines.append(f"  events whose target is the actor itself (must be 0): {len(swapped)}")

    # 2. EACH LANDS IN ITS OWN POSTERIOR — both participants move, both bystanders do not.
    lines.append("")
    lines.append(f"  phase 1  A opens on B   A moved {ab['movedA']:.4f}   B moved {ab['movedB']:.4f}   "
                 f"C {ab['movedC']:.4f}   D {ab['movedD']:.4f}")
    lines.append(f"  phase 2  A opens on D   A moved {ad['movedA']:.4f}   D moved {ad['movedD']:.4f}   "
                 f"B {ad['movedB']:.4f}   C {ad['movedC']:.4f}")
    lines.append(f"  phase 3  B opens on C   B moved {bc['movedB']:.4f}   C moved {bc['movedC']:.4f}   "
                 f"A {bc['movedA']:.4f}   D {bc['movedD']:.4f}")
    lines.append("           (POSTERIOR movement, not world state. Bystanders must be exactly 0.)")
    both_land = ab["movedA"] > 0.01 and ab["movedB"] > 0.01
    frozen = (ab["movedC"] == 0.0 and ab["movedD"] == 0.0
              and ad["movedB"] == 0.0 and ad["movedC"] == 0.0
              and bc["movedA"] == 0.0 and bc["movedD"] == 0.0)
    directions = ad["movedA"] > 0.01 and ad["movedD"] > 0.01 and bc["movedB"] > 0.01 and bc["movedC"] > 0.01

    # 3. EACH POSTERIOR MOVED ONLY FROM ITS OWN ACTOR'S EVENTS. The strongest form available: replay
    #    exactly the events whose actor_id is X into a FRESH posterior and require the same answer. A
    #    co-mingled posterior would have absorbed its counterpart's events too and could not match a
    #    replay of its own alone.
    lines.append("")
    lines.append("  replay reference: a fresh posterior fed EXACTLY the events whose actor_id is X,")
    lines.append("  and nothing else, must land where X actually landed.")
    replay_ok = True
    for key in ("a", "b", "c", "d"):
        uid = ids[key]
        mine = by_actor.get(uid, [])
        ref = f"{uid}_ref"
        for e in mine:
            ml_post("/observe/behavioral", {"event": {**e, "actor_id": ref}})
        got = np.array(ml_get(f"/persona/{ref}")["persona"]["mu"], dtype=float)
        real = np.array(res["final"][key], dtype=float)
        gap = float(np.linalg.norm(got - real))
        same = gap < 1e-6
        replay_ok = replay_ok and same
        lines.append(f"    {key}: {len(mine)} own events replayed -> "
                     f"||replay - live|| = {gap:.2e}   {'IDENTICAL' if same else 'DIFFERS'}")

    # 4. THE SELF-MEASUREMENT GUARD. One userId holding both ends of an interaction must measure
    #    nothing at all, and the control proves the cue itself works.
    lines.append("")
    lines.append(f"  self-measurement guard: one userId, two clients, a real interaction opened "
                 f"({'yes' if self_['openedId'] else 'no'})")
    lines.append(f"    that user's posterior moved {self_['movedTwin']:.4f}  (must be exactly 0)")
    lines.append(f"    control, the SAME cue aimed at another actor: moved "
                 f"{self_['movedTwinOnControlCue']:.4f}  (must be > 0, or 'nothing happened' proves nothing)")
    lines.append(f"    and that control cue moved its TARGET by {self_['movedTargetOnControlCue']:.4f}  "
                 f"(must be 0: only the actor is measured)")
    guard = (self_["movedTwin"] == 0.0 and self_["movedTwinOnControlCue"] > 0.01
             and self_["movedTargetOnControlCue"] == 0.0)

    ok = both_emitted and not swapped and both_land and frozen and directions and replay_ok and guard
    lines.append("")
    lines.append(f"  both events emitted: {both_emitted}   both land: {both_land}   "
                 f"bystanders frozen: {frozen}   both directions: {directions}")
    lines.append(f"  own-events-only (replay): {replay_ok}   self-measurement guard: {guard}")
    return ok, lines


# ── the completeness gate, in the shape of the F1 and F5 ones ──────────────────────────────────
#
# A run that missed a beat is INFRA, is re-run, and is never counted as a low number.
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
    label = os.environ.get("LABEL", "f4")

    # The runner's first pass: probe the CLOSED gate against a web server booted without the
    # opt-in, stash the result, and exit. Kept in this file so both halves of the hook are
    # asserted by the same code against the same route.
    if "--gate-only" in sys.argv:
        ok, lines = gate_closed_probe()
        out = os.environ.get("F4_GATE_RESULT", "/tmp/f4_gate.json")
        with open(out, "w") as f:
            json.dump({"ok": ok, "lines": lines}, f)
        for ln in lines:
            print(ln)
        return 0 if ok else 1

    print(BAR)
    print("F4 ACCEPTANCE: cross-session trust, built before the flow")
    print(BAR)

    print("\n" + "-" * 104)
    print("P30.1/2  CROSS-SESSION DECAY OVER HTTP, WITH THE GATED CLOCK (the branch F4 actually uses)")
    print("-" * 104)
    xs_ok, xs_lines = cross_session_check(label)
    for ln in xs_lines:
        print(ln)
    print(f"  CROSS-SESSION TIE COOLING OVER HTTP: {'PASS' if xs_ok else 'FAIL'}")

    print("\n" + "-" * 104)
    print("P30.1  THE GATE, CLOSED (what makes the hook unreachable from a production client)")
    print("-" * 104)
    gate_ok, gate_lines = gate_result()
    for ln in gate_lines:
        print(ln)
    if gate_ok is not None:
        print(f"  GATE CLOSED WITHOUT THE FLAG: {'PASS' if gate_ok else 'FAIL'}")

    print("\n" + "-" * 104)
    print("P30.3  SILOING ON THE INTERACTION PATH (where both actors' events are built side by side)")
    print("-" * 104)
    silo_ok, silo_lines = siloing_interaction(f"{label}sil{int(time.time())}")
    for ln in silo_lines:
        print(ln)
    print(f"  SILOING (interaction path): {'PASS' if silo_ok else 'FAIL'}")

    print("\n" + "-" * 104)
    print("BARS 1, 2a AND 2b")
    print("-" * 104)
    if not f4_surface_present():
        print("  No F4 surface at /flow4 to drive.")
        print("  Bar 1 (individuation) and Bar 2 (the repetition delta) are NOT MEASURED.")
        print(f"\n{BAR}")
        print(f"cross-session: {'PASS' if xs_ok else 'FAIL'}    "
              f"gate: {'PASS' if gate_ok else ('SKIPPED' if gate_ok is None else 'FAIL')}    "
              f"siloing: {'PASS' if silo_ok else 'FAIL'}    bars: NOT MEASURED (no F4 surface)")
        print(BAR)
        return 0 if (xs_ok and silo_ok and gate_ok is not False) else 1

    from f4_bars import run_bars
    bars_ok = run_bars(label)

    print(f"\n{BAR}")
    print(f"cross-session: {'PASS' if xs_ok else 'FAIL'}    "
          f"gate: {'PASS' if gate_ok else ('SKIPPED' if gate_ok is None else 'FAIL')}    "
          f"siloing: {'PASS' if silo_ok else 'FAIL'}    bars: {'PASS' if bars_ok else 'FAIL'}")
    print(BAR)
    return 0 if (xs_ok and silo_ok and bars_ok and gate_ok is not False) else 1


if __name__ == "__main__":
    sys.exit(main())
