"""Measure the REAL client-vs-server drift in 3D — the invariant "drift 0.0000" never measured.

Opens the real /play 3D client against the real Colyseus server, walks the avatar around so the
client predicts and the server integrates the same motion, and reads WorldCore.getDrift() — the
per-self-snapshot divergence between the client's predicted (x,y) and the server's authoritative
(x,y), sampled before any reconcile snap can hide it.

Local three-service run, so latency is a tick or two and this is the real number (not the networked
worst case — see known-gaps ⚑8). Needs ML + realtime + web already up (run_drift_3d.sh boots them).

    WEB=http://localhost:3000 python scripts/measure_drift_3d.py
"""
from __future__ import annotations

import os
import sys

WEB = os.environ.get("WEB", "http://localhost:3000")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"[INFRA] playwright not importable: {e}")
        return 2

    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_context(viewport={"width": 900, "height": 640}).new_page()
        pg.goto(f"{WEB}/play?u=drift_probe&drift", wait_until="networkidle")

        # Wait until the client has connected and started receiving self-snapshots.
        try:
            pg.wait_for_function("() => window.__drift && (window.__drift.moving.samples + window.__drift.settled.samples) > 3", timeout=25000)
        except Exception:
            got = pg.evaluate("() => window.__drift || null")
            print(f"[INFRA] no server snapshots reached the client (drift={got}). Is realtime up? "
                  "NOT a measurement result.")
            b.close()
            return 2

        # Walk a varied path (exposes the moving/prediction-lead drift), then STAND STILL for a good
        # while (settles → the true position-agreement number, no lead). Repeat so both buckets fill.
        def walk(seq, ms):
            for key in seq:
                pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key); pg.wait_for_timeout(120)

        walk(["d", "s", "a", "w", "d"], 850)
        pg.keyboard.down("d"); pg.keyboard.down("w"); pg.wait_for_timeout(1400); pg.keyboard.up("d"); pg.keyboard.up("w")
        pg.wait_for_timeout(4000)   # STAND STILL → settled bucket (no prediction lead)
        walk(["a", "w", "s"], 800)
        pg.wait_for_timeout(4000)   # settle again

        d = pg.evaluate("() => window.__drift")
        b.close()

    mv, st = d["moving"], d["settled"]
    print("=" * 92)
    print("REAL client↔server drift, 3D (/play against the live Colyseus server)")
    print("=" * 92)
    print("  the invariant the old 'drift 0.0000' never actually measured:")
    print(f"  SETTLED (standing still — the true position-agreement number, no prediction lead):")
    print(f"    mean {st['mean']:.4f}   max {st['max']:.4f}   (n={st['samples']})")
    print(f"  MOVING (client predictor leading a snapshot that is ~150ms stale — expected lead):")
    print(f"    mean {mv['mean']:.4f}   max {mv['max']:.4f}   (n={mv['samples']})   ≈ MOVE_SPEED(4) × snapshot-age")
    print()
    # The honest acceptance gate is on the SETTLED number: with two integrators running the same
    # geometry it should collapse toward ~0. The moving number is prediction lead, not disagreement.
    ok = st["samples"] > 0 and st["max"] < 0.5
    print(f"  settled max < 0.5 (integrators agree at rest): {st['max'] < 0.5}")
    print(f"RESULT: {'OK' if ok else 'CHECK'} — the number is the report, either way")
    print("=" * 92)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
