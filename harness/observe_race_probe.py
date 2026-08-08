"""The ⚑16 probes, kept, so the lost-update defect stays measurable rather than remembered.

These are the four probes that found and characterized the defect, run against a LIVE ML service
rather than a TestClient, because that is how it was found and because a live uvicorn threadpool is
the thing that actually races. `tests/test_observation_race.py` covers the same ground in-process; this
is the end-to-end version and the one whose numbers are quoted in known-gaps ⚑16.

    ML=http://127.0.0.1:8000 ML_SERVICE_TOKEN=... python harness/observe_race_probe.py

Exit 0 if every probe reports the post-fix answer, 1 otherwise.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.request

ML = os.environ.get("ML", "http://127.0.0.1:8000")
TOK = os.environ.get("ML_SERVICE_TOKEN", "dev-ml-token-change-me")
BAR = "=" * 96


def post(body: dict) -> bytes:
    r = urllib.request.Request(
        ML + "/observe/behavioral", data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {TOK}"},
        method="POST")
    return urllib.request.urlopen(r, timeout=30).read()


def persona(uid: str) -> tuple[int, int, list[float]]:
    r = urllib.request.Request(f"{ML}/persona/{uid}", headers={"authorization": f"Bearer {TOK}"})
    d = json.loads(urllib.request.urlopen(r, timeout=30).read())
    return d["persona"]["version"], d["behaviors"], d["persona"]["mu"]


def ev(actor: str, action: str, cue: str, ch: str, t: int | None = None) -> dict:
    return {
        "actor_id": actor, "sessionId": "race", "t": t or int(time.time() * 1000),
        "type": "social_cue", "channel": ch, "cue": cue, "action": action, "polarity": "take",
        "target": {"id": "other", "kind": "user", "status": "peer"},
        "context": {"stakes": "low", "audience_size": 2, "public_or_private": "public",
                    "counterpart_status": "peer", "stage": 2, "scarcity_level": 0.2,
                    "mood_proxy": 0.0, "time_pressure": 0.0},
        "raw_signals": {"distance": 0.0}, "payload": {}, "provenance": "live",
    }


def main() -> int:
    ts = int(time.time())
    ok = True
    print(BAR)
    print("⚑16 probes, re-run against the STORE-LEVEL fix (live service, not a TestClient)")
    print(BAR)

    # 1. two events, sequential vs concurrent — the original pair that exposed it
    u1 = f"p_seq_{ts}"
    post({"event": ev(u1, "first_contact", "E1", "E")})
    post({"event": ev(u1, "proxemics_close", "G1", "G")})
    v1, b1, _ = persona(u1)
    u2 = f"p_par_{ts}"
    with cf.ThreadPoolExecutor(2) as ex:
        list(ex.map(post, [{"event": ev(u2, "first_contact", "E1", "E")},
                           {"event": ev(u2, "proxemics_close", "G1", "G")}]))
    v2, b2, _ = persona(u2)
    print(f"\n[1] two events for one actor")
    print(f"    sequential -> version {v1}, behaviors {b1}")
    print(f"    concurrent -> version {v2}, behaviors {b2}   (was version 1 before the fix)")
    ok &= (v1 == 2 and b1 == 2 and v2 == 2 and b2 == 2)

    # 2. eight concurrent for one actor — the probe that quantified the loss
    u3 = f"p_par8_{ts}"
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(post, [{"event": ev(u3, "first_contact", "E1", "E")} for _ in range(8)]))
    v3, b3, _ = persona(u3)
    print(f"\n[2] EIGHT concurrent events for one actor")
    print(f"    version {v3}, behaviors {b3}   (was version 2 / behaviors 8 before the fix: six lost)")
    ok &= (v3 == 8 and b3 == 8)

    # 3. six DIFFERENT users concurrently — the loss was always per actor, and must stay parallel
    us = [f"p_xu{ts}_{i}" for i in range(6)]
    t0 = time.time()
    with cf.ThreadPoolExecutor(6) as ex:
        list(ex.map(post, [{"event": ev(u, "first_contact", "E1", "E")} for u in us]))
    el = time.time() - t0
    got = [persona(u)[:2] for u in us]
    print(f"\n[3] six DIFFERENT users, one event each, concurrent")
    print(f"    per-user (version, behaviors): {got}   (each must be (1, 1))")
    print(f"    wall clock {el*1000:.0f}ms — different users are not serialized against each other")
    ok &= all(g == (1, 1) for g in got)

    # 4. the update is deterministic and time-independent, so the earlier mismatch really was
    #    lost updates and not ordering or timing sensitivity
    a, b = f"p_det_a_{ts}", f"p_det_b_{ts}"
    post({"event": ev(a, "first_contact", "E1", "E", t=1000)})
    post({"event": ev(a, "proxemics_close", "G1", "G", t=2000)})
    post({"event": ev(b, "first_contact", "E1", "E", t=1000)})
    time.sleep(3.0)
    post({"event": ev(b, "proxemics_close", "G1", "G", t=2000)})
    _, _, ma = persona(a)
    _, _, mb = persona(b)
    gap = sum((x - y) ** 2 for x, y in zip(ma, mb)) ** 0.5
    print(f"\n[4] same two events back-to-back vs three seconds apart")
    print(f"    ||mu_a - mu_b|| = {gap:.3e}   (must be 0: pure lost update, not timing)")
    ok &= gap < 1e-12

    print(f"\n{BAR}")
    print(f"⚑16 PROBES: {'PASS' if ok else 'FAIL'}")
    print(BAR)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
