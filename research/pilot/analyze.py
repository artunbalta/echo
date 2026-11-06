"""The pilot's analysis, from the command line (C76, C77).

    services/ml/.venv/bin/python research/pilot/analyze.py export.json [--fast] [--out DIR]
    services/ml/.venv/bin/python research/pilot/analyze.py --simulate [--n 16] [--seed 1016] [--out DIR]

The first reads the owner's export (`GET /api/pilot?op=export` with `x-pilot-admin`) and analyses it with
the engine's own endpoints (`--fast` uses the library path, which the tests hold to the endpoints bit for
bit). The second makes one simulated group and analyses it the same way, as a rehearsal. Either writes
`results.json` and `report.html`. A simulated report draws its panels from the many-group study
(`runs/study-16.json`, made by `study.py`), its power panel from `runs/power.json` and its assumptions
panel from `runs/sensitivity.json`, when they are there.
"""
import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from echo_pilot import report  # noqa: E402
from echo_pilot.analysis import analyze, before_debrief  # noqa: E402
from echo_pilot.simulate import make_group  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", nargs="?", help="the export JSON")
    ap.add_argument("--simulate", action="store_true", help="analyse one simulated group instead")
    ap.add_argument("--n", type=int, default=16, help="simulated group size")
    ap.add_argument("--seed", type=int, default=None, help="simulated group seed (default: the study's most typical group, else 1016)")
    ap.add_argument("--fast", action="store_true", help="the engine's library path instead of its endpoints")
    ap.add_argument("--power", default=str(HERE / "runs" / "power.json"), help="the power run, for the simulation's power panel")
    ap.add_argument("--study", default=str(HERE / "runs" / "study-16.json"), help="the many-group study (study.py), for the simulation's panels")
    ap.add_argument("--sensitivity", default=str(HERE / "runs" / "sensitivity.json"), help="the sensitivity run (sensitivity.py), for the simulation's assumptions panel")
    ap.add_argument("--power3", default=str(HERE / "runs" / "power-3visits.json"), help="the third-visit power run (visits.py), for the power panel")
    ap.add_argument("--out", default=str(HERE / "out"), help="where results.json and report.html go")
    args = ap.parse_args()
    if not args.simulate and not args.export:
        ap.error("give an export, or --simulate")

    t = time.time()
    study = json.loads(Path(args.study).read_text()) if (args.simulate and args.study and Path(args.study).exists()) else None
    if args.simulate and args.seed is None:
        args.seed = study["typical_seed"] if study and study.get("n") == args.n else 1016
    if args.simulate:
        export, truth = make_group(args.n, seed=args.seed)
    else:
        export, truth = json.loads(Path(args.export).read_text()), None
    mode = "fast" if args.fast or args.simulate else "exact"
    results = analyze(export, mode=mode, truth=truth)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"sim-{args.n}-{args.seed}" if args.simulate else "pilot"
    if results["coverage"]["after_debrief"]:
        # Registered (§2, Blinding): also without the ratings made once the rater's debrief was open.
        early = analyze(before_debrief(export), mode=mode, truth=truth)
        (out / f"{stem}-before-debrief-results.json").write_text(report.to_json(early))
        (out / f"{stem}-before-debrief-report.html").write_text(report.render(early), encoding="utf-8")
        print(f"{results['coverage']['after_debrief']} ratings made after the rater's debrief opened; "
              f"without them: {out / (stem + '-before-debrief-report.html')}")
    (out / f"{stem}-results.json").write_text(report.to_json(results))
    power = json.loads(Path(args.power).read_text()) if (args.simulate and Path(args.power).exists()) else None
    sensitivity = json.loads(Path(args.sensitivity).read_text()) if (args.simulate and Path(args.sensitivity).exists()) else None
    power3 = json.loads(Path(args.power3).read_text()) if (args.simulate and Path(args.power3).exists()) else None
    (out / f"{stem}-report.html").write_text(report.render(results, power, study, sensitivity, power3), encoding="utf-8")
    again = results["settings"]["again"]["witnesses"]
    print(json.dumps({w: (None if v["skill"] is None else round(v["skill"], 3)) for w, v in again.items()}))
    print(f"{time.time() - t:.1f} s -> {out / (stem + '-report.html')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
