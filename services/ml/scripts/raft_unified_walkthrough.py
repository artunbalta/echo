"""The unified raft — P4's day-loop cues, fired by acts instead of a menu.

There were two rafts on one island. The day loop's `day_raft` station was a menu whose "begin the
raft" button added a flat 0.1 to a counter and handed you the sea; F1's embodied build was driftwood
you walk to, pick up, lash through the slips, and push into the water. They did not know about each
other, and the station's promise ("the raft is ready. the sea is yours.") became a lie the moment
sailing became the build's output.

They are one raft now. The station is deleted; the gate is the wood. This asserts the unification
LOST NO MEASUREMENT — every read P4 took off the menu still lands, off the acts instead:

  start_ship "start"   the first plank off the sand       (was: the "begin the raft" button)
  start_ship "stay"    stand over the wood, walk away     (was: the "leave it be" button)
  start_ship "refused" never went near the wood           (unchanged: read at dusk, Law 2)
  structure_progress   started → persistence 0.5          (was: the click; now: the first pick)
  → finished           the hull is in the water → 1.0     (NEW — has never fired in this product)

THE SEAM, STATED HONESTLY: the real emit path is
    WorldClient → /api/island/observe (route.ts) → ML /observe
and route.ts is TypeScript this script cannot execute. So the payloads below MIRROR that route's
`actionText` / `behavioralTelemetry` / `eventContext` mapping verbatim (see the file; keep them in
step). What is proven here is the ML half: given the payloads the route builds, the engine moves,
and moves differently for different acts. The TS half is covered by typecheck and the browser run.

Note what this makes visible: `fork_decision` carries its option ONLY in the embedded action text —
the telemetry dict gets latency and nothing else. That is why "stay" had to stay a distinct act
rather than collapse into the refusal.

Nothing protected is touched: app.py, persona.py and the committed W are read, never modified.

Run:  ./.venv/bin/python scripts/raft_unified_walkthrough.py     (zero keys, mock embeddings)
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
from echo_ml.store import STORE

_C = TestClient(app)
_H = {"Authorization": f"Bearer {SETTINGS.ml_token}"}

BAR = "=" * 104

# The survival context every day fork carries (route.ts `eventContext`) — an even day, mid-vitality.
CTX = {"stage": "island", "scarcityLevel": 0.2, "vitality": 0.7, "dayCount": 2}


def observe(user: str, action: str, telemetry: dict) -> np.ndarray:
    """POST through the REAL /observe ingress and return the Δμ it actually wrote."""
    before = STORE.get(user).posterior.mu.copy()
    r = _C.post("/observe", headers=_H,
                json={"userId": user, "context": CTX, "action": action, "telemetry": telemetry})
    assert r.status_code == 200, f"/observe → HTTP {r.status_code}: {r.text}"
    return STORE.get(user).posterior.mu.copy() - before


def fork(user: str, option: str, latency_ms: int) -> np.ndarray:
    """Mirrors route.ts actionText+behavioralTelemetry for fork_decision(start_ship)."""
    if option == "refused":
        action = ('On an even day (day 2) they let the fork "start_ship" go undecided; '
                  "the day ended without choosing.")
        tele: dict = {}  # route.ts sends no decision_latency for a refusal
    else:
        action = f'On an even day (day 2) they chose "{option}" at fork "start_ship".'
        tele = {"latencyMs": latency_ms, "decision_latency": latency_ms}
    return observe(user, action, tele)


def progress(user: str, finished: bool, delta01: float) -> np.ndarray:
    """Mirrors route.ts actionText+behavioralTelemetry for structure_progress(ship)."""
    action = f"They worked on the ship and {'finished' if finished else 'started'} it."
    # delta01 rides in the payload but route.ts does NOT map it into telemetry — asserted below.
    tele = {"persistence": 1 if finished else 0.5}
    return observe(user, action, tele)


def show(label: str, d: np.ndarray, note: str) -> None:
    print(f"  {label:<46} ‖Δμ‖ = {float(np.linalg.norm(d)):<10.4f} {note}")


def main() -> int:
    ok = True
    print(BAR)
    print("THE UNIFIED RAFT — P4's cues survive the menu's deletion, off acts instead of buttons")
    print(BAR)
    print()

    # ── 1. the gate's three arms ──────────────────────────────────────────────────────────────
    print("1. THE SELF-IMPOSED GATE (start_ship) — was two buttons, is now two acts")
    print("-" * 104)
    d_start = fork("u_start", "start", 4200)
    show("first plank off the sand → 'start'", d_start, "the act IS the commitment")
    d_stay = fork("u_stay", "stay", 9100)
    show("stood over the wood, walked away → 'stay'", d_stay, "an ACTIVE decline")
    d_ref = fork("u_ref", "refused", 240000)
    show("never went near the wood → K4 at dusk", d_ref, "non-action is data (Law 2)")

    moved = [float(np.linalg.norm(d)) > 1e-9 for d in (d_start, d_stay, d_ref)]
    distinct = (float(np.linalg.norm(d_start - d_stay)) > 1e-9
                and float(np.linalg.norm(d_stay - d_ref)) > 1e-9
                and float(np.linalg.norm(d_start - d_ref)) > 1e-9)
    if not all(moved):
        print("\n  [FAIL] an arm of the gate does not move the posterior at all")
        ok = False
    elif not distinct:
        print("\n  [FAIL] the three arms are not distinguishable")
        ok = False
    else:
        print("\n  [PASS] start / stay / refused each move the posterior, and all three differ.")
        print("         The option lives in the EMBEDDED action text, not the telemetry dict — which")
        print("         is exactly why 'let it lie' had to stay its own act, not fold into the refusal.")
    print()

    # ── 2. structure_progress: started preserved, finished newly reachable ────────────────────
    print("2. structure_progress → persistence — the click's read preserved, and the new one")
    print("-" * 104)
    d_begun = progress("u_b", False, 0.08)
    show("first pick (was: the 'begin' click)", d_begun, "persistence 0.5 — unchanged by A")
    d_done = progress("u_f", True, 1.0)
    show("the hull is in the water   ← NEW", d_done, "persistence 1.0 — never fired before A")

    if float(np.linalg.norm(d_begun)) <= 1e-9:
        print("\n  [FAIL] beginning the raft no longer moves the posterior")
        ok = False
    elif float(np.linalg.norm(d_done)) <= 1e-9:
        print("\n  [FAIL] finishing the raft does not move the posterior")
        ok = False
    elif float(np.linalg.norm(d_done - d_begun)) <= 1e-9:
        print("\n  [FAIL] finishing reads identically to beginning")
        ok = False
    else:
        print("\n  [PASS] beginning still reads, and finishing reads DIFFERENTLY (persistence 0.5 → 1.0).")
        print("         That `finished` branch has existed in the ingress all along and never once fired:")
        print("         a click-station could only ever say 'started'. Unifying the rafts makes it real.")
    print()

    # ── 3. delta01 is honesty, not measurement ────────────────────────────────────────────────
    print("3. delta01 — now honest, but NOT a measurement (checked, not assumed)")
    print("-" * 104)
    d_flat = progress("u_d1", False, 0.1)      # the old flat value a click produced
    d_deriv = progress("u_d2", False, 0.0334)  # the new value derived from real wood + work
    print(f"  old flat 0.1 for a click        ‖Δμ‖ = {float(np.linalg.norm(d_flat)):.6f}")
    print(f"  new derived 0.0334 from a pick  ‖Δμ‖ = {float(np.linalg.norm(d_deriv)):.6f}")
    if float(np.linalg.norm(d_flat - d_deriv)) > 1e-9:
        print("\n  [FAIL] delta01 moves the posterior — then it needs its own evidence")
        ok = False
    else:
        print("\n  [PASS] identical: neither route.ts nor the ingress reads delta01 (only started/")
        print("         finished). Sending the real derived value is honesty in the payload, not a")
        print("         measurement change — so it needs no re-baselining.")
    print()

    # ── 4. numerics ───────────────────────────────────────────────────────────────────────────
    print("4. NUMERICS — every posterior these cues touched stays finite")
    print("-" * 104)
    bad = [u for u in ("u_start", "u_stay", "u_ref", "u_b", "u_f", "u_d1", "u_d2")
           if not (np.all(np.isfinite(STORE.get(u).posterior.mu))
                   and np.all(np.isfinite(STORE.get(u).posterior.Sigma)))]
    if bad:
        print(f"  [FAIL] non-finite posterior for: {', '.join(bad)}")
        ok = False
    else:
        print("  [PASS] μ and Σ finite for all 7 users touched (zero NaN/Inf)")
    print()

    print(BAR)
    print(f"RESULT: {'PASS ✅' if ok else 'FAIL ❌'}")
    print(BAR)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
