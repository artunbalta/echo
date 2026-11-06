"""The research code reads what the web writes: verbs, passing, situations and the export, from the sources themselves."""
import re

from echo_pilot.paradigms import ACTION_CODE, PARADIGMS, SITUATION_OF, VERB_FOR, code_stated, stated_from_codes
from echo_pilot.simulate import PASSED, VERB_MEASURE, VERB_RAW

KIND_OF = {"give": "hungry-stranger", "lend": "raft-borrower", "bet": "tide-fisher", "seed": "seed-offer", "path": "overgrown-path", "greet": "lone-traveler"}


def _kind_block(src: str, kind: str) -> str:
    start = src.index(f'  "{kind}": [')
    return src[start : src.index("  ],", start)]


def test_verbs_are_measured_as_the_planet_sends_them(root):
    src = (root / "packages/planet/lib/affordances.ts").read_text()
    seen = set()
    for paradigm, kind in KIND_OF.items():
        for line in _kind_block(src, kind).splitlines():
            m = re.search(r'v\(\{ id: "([^"]+)".*?stakes: "([^"]+)".*?measure: m\("([^"]+)", "([^"]+)", "([^"]+)"\)', line)
            if not m:
                continue
            verb, stakes, cue, action, _route = m.groups()
            assert VERB_MEASURE[verb] == (cue[0], cue, action, stakes), verb
            raw = re.search(r"raw: \{ (\w+): ([\d.]+) \}", line)
            assert VERB_RAW.get(verb) == ({raw.group(1): float(raw.group(2))} if raw else None), verb
            assert verb in VERB_FOR[paradigm].values(), verb
            seen.add(verb)
    assert seen == set(VERB_MEASURE)


def test_passing_by_is_read_as_the_director_sends_it(root):
    src = (root / "packages/planet/lib/director.ts").read_text()
    for paradigm, situation in SITUATION_OF.items():
        start = src.index(f"  {situation}: {{")
        block = src[start : src.index("\n  },", start)]
        m = re.search(r'passed: \{ action: "([^"]+)", cue: "([^"]+)", channel: "([^"]+)", polarity: "([^"]+)", route: "([^"]+)" \}', block)
        if PASSED[paradigm] is None:
            assert "passed: null" in block, paradigm
            continue
        action, cue, channel, polarity, route = m.groups()
        assert PASSED[paradigm][:4] == (channel, cue, action, polarity), paradigm
        # Distance goes with every pass the engine routes (acts.ts), never with an unrouted one.
        assert PASSED[paradigm][4] == (route != "unrouted"), paradigm


def test_the_six_are_the_directors_pilot_situations(root):
    src = (root / "packages/planet/lib/director.ts").read_text()
    m = re.search(r"export const PILOT_SITUATIONS: readonly SituationId\[\] = \[([^\]]+)\]", src)
    assert [x.strip().strip('"') for x in m.group(1).split(",")] == [SITUATION_OF[p] for p in PARADIGMS]


def test_every_answer_has_a_code_and_codes_round_trip():
    for p in PARADIGMS:
        for code, verb in VERB_FOR[p].items():
            assert ACTION_CODE[p][verb] == code
    for give in (0, 1, 2, 3):
        for bet in ("bet-safe", "bet-even", "bet-long"):
            stated = {"give": give, "lend": give % 2 == 0, "bet": bet, "seed": "plant", "path": "marked", "greet": True}
            assert stated_from_codes(code_stated(stated)) == stated
    assert code_stated({"give": 1, "lend": True, "bet": "none", "seed": "now", "path": "unmarked", "greet": False})["bet"] == 0.0
    assert all(v is None for v in code_stated(None).values())


def test_the_export_carries_what_the_analysis_reads(root):
    route = (root / "apps/web/src/app/api/pilot/route.ts").read_text()
    assert "{ stagings: pilotOnly(stagings), events, echo }" in route
    assert re.search(r"people,\s*ratings,\s*byPerson", route)
    # The debrief split (registration §2) reads the visit count and whether the debrief was on.
    assert re.search(r"\bvisits,\s*reveal: process\.env\.ECHO_PILOT_REVEAL === \"1\"", route)
    store = (root / "apps/web/src/lib/behavioral-store.ts").read_text()
    assert 'return { rows, source: "table" }' in store
    pilot = (root / "apps/web/src/lib/pilot.ts").read_text()
    assert re.search(r"predicted: PilotStated \| null", pilot)
    for key in ("subject", "self", "stated", "sessions"):
        assert re.search(rf"\b{key}\b", pilot), key
