"""How many friends the pilot needs: `python research/pilot/power.py [reps] [sizes…]` (C76, C77). Writes runs/power.json (a trial at chosen sizes goes to out/)."""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from echo_pilot.power import power  # noqa: E402

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    sizes = tuple(int(x) for x in sys.argv[2:]) or (6, 8, 10, 12, 16, 20, 30, 40)
    t = time.time()
    result = power(sizes=sizes, reps=reps, workers=int(os.environ.get("ECHO_RESEARCH_WORKERS", "10")))
    result["seconds"] = round(time.time() - t, 1)
    out = Path(__file__).resolve().parent / ("runs" if len(sys.argv) <= 2 else "out") / ("power.json" if len(sys.argv) <= 2 else f"power-{'-'.join(map(str, sizes))}.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=1))
    for n, row in result["sizes"].items():
        print(n, json.dumps({k: round(v, 2) for k, v in row["power"].items()}))
    print(f"{result['seconds']} s -> {out}")
