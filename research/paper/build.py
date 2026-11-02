"""The draft with its numbers filled in from the analysis code's own output, never by hand.

    services/ml/.venv/bin/python research/paper/build.py

Reads research/pilot/runs/study-16.json (the many-group study) and research/pilot/runs/power.json (the power
run), fills the {{placeholders}} of `draft.template.md` and `preregistration.template.md`, and writes
`draft.md` and `preregistration.md`. An unknown placeholder fails.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent / "pilot"
sys.path.insert(0, str(PILOT))

from echo_pilot import theory as T  # noqa: E402


def signed(x) -> str:
    return "–" if x is None else f"{x:+.2f}".replace("-", "−")


def pct(x) -> str:
    return "–" if x is None else f"{round(100 * x)}%"


def main() -> int:
    study = json.loads((PILOT / "runs" / "study-16.json").read_text())
    power = json.loads((PILOT / "runs" / "power.json").read_text())
    power3_path = PILOT / "runs" / "power-3visits.json"
    power3 = json.loads(power3_path.read_text()) if power3_path.exists() else None
    sizes = sorted(int(k) for k in power["sizes"])

    def need(test: str) -> str:
        n = next((n for n in sizes if power["sizes"][str(n)]["power"][test] >= 0.8), None)
        return str(n) if n else f">{sizes[-1]}"

    h2, nu = 0.18, 0.45

    def value(key: str) -> str:
        parts = key.split(":")
        if key == "date":
            return date.today().isoformat()
        if key == "reps":
            return str(study["reps"])
        if key == "n":
            return str(study["n"])
        if parts[0] in ("again", "elsewhere"):
            s = study["skill"][f"{parts[0]}:{parts[1]}"]
            if len(parts) == 3 and parts[2] == "iqr":
                return "[" + ", ".join(signed(v) for v in s["iqr"]) + "]"
            return signed(s["median"])
        if parts[0] == "acc":
            return pct(study["accuracy"][f"{parts[1]}:{parts[2]}"]["median"])
        if parts[0] == "cross":
            c = study["crossings"][parts[1]]
            if len(parts) == 3 and parts[2] == "share":
                return pct(c["share"])
            return "–" if c["median"] is None else f"{c['median']:.0f}"
        if parts[0] == "power":
            return pct(power["sizes"][parts[1]]["power"][":".join(parts[2:])])
        if parts[0] == "power3":
            if power3 is None:
                raise KeyError("power3: run research/pilot/visits.py first")
            return pct(power3["sizes"][parts[1]]["power"][":".join(parts[2:])])
        if parts[0] == "need":
            return need(":".join(parts[1:]))
        if parts[0] == "gap":
            return f"{study['gap'][f'{parts[1]}:{parts[2]}']['median']:.2f}"
        if parts[0] == "holier":
            return signed(study["holier"][f"{parts[1]}:{parts[2]}"]["median"])
        if parts[0] == "theory":
            if parts[1] == "h2":
                return f"{h2:.2f}"
            if parts[1] == "nu":
                return f"{nu:.2f}"
            if parts[1] == "catch":
                return str(T.looks_to_catch_up(h2, nu))
            fn = {"one": T.one_layer, "two": T.two_layers}[parts[1]]
            return f"{fn(h2, nu, int(parts[2])):.2f}"
        raise KeyError(key)

    for name in ("draft", "preregistration"):
        text = (HERE / f"{name}.template.md").read_text()
        out = re.sub(r"\{\{([^}]+)\}\}", lambda m: value(m.group(1)), text)
        (HERE / f"{name}.md").write_text(out)
        print(f"{name}.md: {len(out.split())} words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
