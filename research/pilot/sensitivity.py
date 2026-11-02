"""How much rests on the simulation's assumptions: `python research/pilot/sensitivity.py [reps]` (C77).

The same analysis, at the planned size (16), under each assumption moved one at a time from what
`simulate.SimParams` sets: less or more of a person's own steadiness, stronger traits, keener friends,
noisier days. Writes runs/sensitivity.json.
"""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from echo_pilot.power import power  # noqa: E402
from echo_pilot.simulate import SimParams  # noqa: E402

BASE = SimParams()
SETTINGS = {
    "as assumed": {},
    "less of their own (stable sd .35)": {"stable_sd": 0.35},
    "more of their own (stable sd .8)": {"stable_sd": 0.8},
    "stronger traits (loadings ×1.6)": {"loadings": {p: tuple(1.6 * x for x in v) for p, v in BASE.loadings.items()}},
    "keener friends (insight .6–.85, half their ways)": {"friend_insight": (0.0, 0.6, 0.75, 0.85), "friend_tendency": 0.5},
    "noisier days (visit sd .8)": {"visit_sd": 0.8},
}

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    t = time.time()
    out = {"reps": reps, "n": 16, "settings": {}}
    for name, overrides in SETTINGS.items():
        res = power(sizes=(16,), reps=reps, workers=int(os.environ.get("ECHO_RESEARCH_WORKERS", "10")), overrides=overrides or None, seed0=5000)
        row = res["sizes"][16]
        out["settings"][name] = {
            "overrides": {k: (v if k != "loadings" else "×1.6") for k, v in overrides.items()},
            "power": row["power"],
            "skill": {k: v["median"] for k, v in row["skill"].items()},
            "crossing_friends": row["crossings"]["friends"],
        }
        print(name, json.dumps({k: round(row["skill"][f"again:{k}"]["median"], 2) for k in ("echo_2l", "echo_axes", "friends", "self", "oracle_axes")}), "H1", row["power"]["again:echo_2l>echo_axes"])
    out["seconds"] = round(time.time() - t, 1)
    (Path(__file__).resolve().parent / "runs" / "sensitivity.json").write_text(json.dumps(out, indent=1))
    print(f"{out['seconds']} s")
