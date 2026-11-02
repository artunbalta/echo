"""Every panel of the simulated report across many groups: `python research/pilot/study.py [reps] [n]` (C77). Writes runs/study-<n>.json."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from echo_pilot.study import study  # noqa: E402

if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 16
    t = time.time()
    result = study(n=n, reps=reps, workers=10)
    result["seconds"] = round(time.time() - t, 1)
    out = Path(__file__).resolve().parent / "runs" / f"study-{n}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=1))
    print(json.dumps({k: round(v["median"], 3) for k, v in result["skill"].items() if v["median"] is not None and k.startswith("again")}))
    print(f"typical seed {result['typical_seed']} · {result['seconds']} s -> {out}")
