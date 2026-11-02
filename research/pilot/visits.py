"""What a third visit buys: `python research/pilot/visits.py [reps]` (C77). Writes runs/power-3visits.json.

The power run again, with every friend asked to come three times instead of two (`SimParams.visits`).
`again` then predicts the second visit from the first and the third from the first two; everything else
is the registered analysis. Compare with runs/power.json at the same sizes.
"""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from echo_pilot.power import power  # noqa: E402

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    t = time.time()
    result = power(sizes=(8, 12, 16, 20), reps=reps, workers=int(os.environ.get("ECHO_RESEARCH_WORKERS", "10")), overrides={"visits": 3})
    result["seconds"] = round(time.time() - t, 1)
    result["visits"] = 3
    out = Path(__file__).resolve().parent / "runs" / "power-3visits.json"
    out.write_text(json.dumps(result, indent=1))
    for n, row in result["sizes"].items():
        print(n, json.dumps({k: round(v, 2) for k, v in row["power"].items()}))
    print(f"{result['seconds']} s -> {out}")
