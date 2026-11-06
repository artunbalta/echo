"""The draft with its numbers filled in from the analysis code's own output, never by hand.

    services/ml/.venv/bin/python research/paper/build.py

Reads research/pilot/runs/study-16.json (the many-group study) and research/pilot/runs/power.json (the power
run) for Study 3, and research/deeds/runs/facts.json for Studies 1 and 2. It fills the {{placeholders}} of
`draft.template.md` and `preregistration.template.md`, and writes `draft.md` and `preregistration.md`.
An unknown placeholder fails.

A Study 1–2 placeholder is {{f:key:format}}. The formats are:
- `,d` and `d`: integers;
- `.3f`, `+.3f`: decimals, signed or not;
- `%`: a percentage;
- `r2`, `r3`: a correlation without its leading zero;
- `p`: a p-value;
- `pts`: a difference in accuracy points;
- `s`: as written.
Minus signs are typographic throughout.
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


def fact(facts: dict, spec: str) -> str:
    key, _, fmt = spec.partition(":")
    if key not in facts:
        raise KeyError(f"f:{key} (run research/deeds/facts.py)")
    x = facts[key]
    minus = lambda t: t.replace("-", "−")  # noqa: E731
    if fmt == "s":
        return str(x)
    if fmt == ",d":
        return f"{int(round(x)):,}"
    if fmt == "d":
        return str(int(round(x)))
    if fmt == "%":
        return minus(f"{round(100 * x)}%")
    if fmt in ("r2", "r3"):
        t = f"{x:.{fmt[1]}f}"
        return minus(t.replace("0.", ".", 1))
    if fmt == "p":
        return "< .001" if x < 0.001 else f"{x:.3f}".replace("0.", ".", 1)
    if fmt == "pts":
        return f"{abs(x) * 100:.1f}"
    return minus(format(x, fmt))


def main() -> int:
    facts_path = HERE.parent / "deeds" / "runs" / "facts.json"
    facts = json.loads(facts_path.read_text()) if facts_path.exists() else {}
    study = json.loads((PILOT / "runs" / "study-16.json").read_text())
    power = json.loads((PILOT / "runs" / "power.json").read_text())
    power3_path = PILOT / "runs" / "power-3visits.json"
    power3 = json.loads(power3_path.read_text()) if power3_path.exists() else None
    pooling_path = PILOT / "runs" / "pooling.json"
    pooling = json.loads(pooling_path.read_text()) if pooling_path.exists() else None
    sizes = sorted(int(k) for k in power["sizes"])

    def need(test: str) -> str:
        n = next((n for n in sizes if power["sizes"][str(n)]["power"][test] >= 0.8), None)
        return str(n) if n else f">{sizes[-1]}"

    h2, nu = 0.18, 0.45

    def value(key: str) -> str:
        parts = key.split(":")
        if key == "date":
            return date.today().isoformat()
        if key.startswith("f:"):
            return fact(facts, key[2:])
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
        if parts[0] == "pooling":
            if pooling is None:
                raise KeyError("pooling: run research/pilot/experiments/pooling.py first")
            row = pooling["results"][f"{'as assumed' if parts[1] == 'assumed' else 'unequal'} · pool {parts[2]}"]
            return pct(row[parts[3]]) if parts[3] == "h1_power" else signed(row[parts[3]])
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
