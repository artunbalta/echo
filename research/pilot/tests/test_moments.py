"""The village's moments (registration §5, RQ6–RQ8): shares with their denominators, contrasts the literature's way
round, effort from the act's own event, consistency, and the echo with and without the moments."""
import copy

import pytest

from echo_pilot import analysis as A
from echo_pilot import moments as M


def _row(s, kind, arm, outcome, visit=1, n=0, seen=5.0, raw=None):
    return {
        "subject": s, "ref": f"moment:{s}|people|{kind}|{arm}|{visit}|{n}", "circle": "study", "visit": visit, "kind": kind,
        "lane": "wayside" if kind in ("lost-purse", "honey-stall", "litter") else "people", "arm": arm, "armRaw": raw,
        "seenAt": "2026-11-12T10:00:00.000Z", "endedAt": "2026-11-12T10:00:30.000Z", "seenS": seen, "nearestM": 2.0, "outcome": outcome,
    }


def _export(rows, events=None, unreadable=()):
    people = sorted({r["subject"] for r in rows} | set(unreadable))
    by = {s: {"stagings": [], "events": {"rows": (events or {}).get(s, []), "source": "test"}, "echo": None, "moments": [r for r in rows if r["subject"] == s]} for s in people}
    for s in unreadable:
        by[s]["moments"] = None
    return {"people": [{"subject": s} for s in people], "byPerson": by}


def _purse_rows():
    rows = []
    for i, s in enumerate("abcdef"):
        # Nine coins: five of six leave it; two coins: two of six do. One walks past each, deciding nothing.
        rows.append(_row(s, "lost-purse", "many", "leave" if i < 5 else "take-all"))
        rows.append(_row(s, "lost-purse", "few", "leave" if i < 2 else "take-one", n=1))
    rows.append(_row("a", "lost-purse", "many", "none", n=2))
    rows.append(_row("b", "lost-purse", "few", "none", n=3))
    return rows


def test_shares_have_their_denominators_and_run_the_literatures_way():
    v = M.village(_export(_purse_rows()))
    purse = next(c for c in v["contrasts"] if c["kind"] == "lost-purse")
    # Walking past a purse decides nothing: it is in the exposures, not in the purse's share.
    assert purse["many"]["n"] == 6 and purse["few"]["n"] == 6
    assert purse["many"]["share"] == pytest.approx(5 / 6) and purse["few"]["share"] == pytest.approx(2 / 6)
    assert purse["difference"] == pytest.approx(0.5)
    assert purse["as_expected"] is True
    lo, hi = purse["ci"]
    assert lo is not None and lo <= purse["difference"] <= hi
    assert v["exposures"]["lost-purse"]["many"]["met"] == 7 and v["exposures"]["lost-purse"]["many"]["outcomes"]["none"] == 1
    assert 0 <= purse["many"]["lo"] <= purse["many"]["share"] <= purse["many"]["hi"] <= 1
    # The same export, the same interval: the bootstrap is seeded.
    assert M.village(_export(_purse_rows()))["contrasts"] == v["contrasts"]


def test_help_is_counted_among_everyone_who_saw_and_effort_comes_from_the_act():
    rows, events = [], {}
    for i, s in enumerate("abcdef"):
        rows.append(_row(s, "fallen-elder", "alone", "help-up" if i < 4 else "passed"))
        rows.append(_row(s, "fallen-elder", "onlookers", "help-up" if i < 2 else "passed", n=1))
        wall_alone, wall_crew = _row(s, "imece-wall", "alone", "lend-hand", n=2), _row(s, "imece-wall", "crew", "lend-hand", n=3)
        rows += [wall_alone, wall_crew]
        events[s] = [
            {"action": "work_shift", "target_json": {"id": wall_alone["ref"]}, "raw_signals_json": {"thoroughness01": 1.0}},
            {"action": "shirk_work", "target_json": {"id": wall_crew["ref"]}, "raw_signals_json": {"thoroughness01": 0.5}},
        ]
    v = M.village(_export(rows, events))
    elder = next(c for c in v["contrasts"] if c["kind"] == "fallen-elder")
    # Walking past the old man is not helping him: everyone who saw him is in the share.
    assert elder["alone"]["n"] == 6 and elder["alone"]["share"] == pytest.approx(4 / 6)
    assert elder["onlookers"]["share"] == pytest.approx(2 / 6) and elder["as_expected"] is True
    wall = next(c for c in v["contrasts"] if c["kind"] == "imece-wall")
    assert wall["effort"]["alone"]["mean"] == pytest.approx(1.0) and wall["effort"]["crew"]["mean"] == pytest.approx(0.5)
    assert wall["effort"]["difference"] == pytest.approx(0.5)


def test_a_contrast_with_no_registered_direction_claims_none():
    rows = [_row(s, "narrow-way", arm, "aside", n=k) for s in "abc" for k, arm in enumerate(("elder", "porter"))]
    narrow = next(c for c in M.village(_export(rows))["contrasts"] if c["kind"] == "narrow-way")
    assert narrow["directed"] is False and narrow["as_expected"] is None


def test_help_under_time_pressure_against_help_without():
    rows = []
    for i, s in enumerate("abcde"):
        rows.append(_row(s, "spilled-basket", None, "help" if i < 1 else "passed", raw={"time_pressure": 1}))
        rows.append(_row(s, "stuck-cart", None, "push" if i < 4 else "passed", n=1))
    p = M.village(_export(rows))["pressure"]
    assert p["under"] == {"k": 1, "n": 5, "share": pytest.approx(0.2)} and p["free"]["share"] == pytest.approx(0.8)
    assert p["as_expected"] is True


def test_consistency_visit_against_visit_and_kind_against_kind():
    rows = []
    for i, s in enumerate("abcdef"):
        helps = i % 3  # 0, 1 or 2 of two moments helped, on both visits and in both halves of the family
        for visit in (1, 2):
            rows.append(_row(s, "fallen-elder", "alone", "help-up" if helps >= 1 else "passed", visit=visit))
            rows.append(_row(s, "stuck-cart", None, "push" if helps >= 2 else "passed", visit=visit, n=1))
    c = M.village(_export(rows))["consistency"]["help"]
    assert c["retest"]["pairs"] == 6 and c["retest"]["r"] == pytest.approx(1.0)
    assert c["split_half"]["pairs"] == 6 and c["split_half"]["spearman_brown"] is not None


def test_a_person_whose_moments_could_not_be_read_is_named_and_not_counted():
    v = M.village(_export(_purse_rows(), unreadable=("z",)))
    assert v["unreadable"] == ["z"] and v["people"] == 6


@pytest.fixture(scope="module")
def analysed(group8):
    export, truth = group8
    return A.analyze(export, mode="fast", truth=truth, ci=False, minutes=(0, 4, 25))


def test_the_echo_with_and_without_the_moments(group8, analysed):
    # Simulated groups have no moments: the echo without them is the same echo.
    ve = analysed["village_echo"]
    assert ve["echo"]["skill"] == pytest.approx(ve["echo_bare"]["skill"])
    # A moment event changes the echo but never the bare one.
    export, _ = group8
    s = export["people"][0]["subject"]
    moved = copy.deepcopy(export)
    rows = moved["byPerson"][s]["events"]["rows"]
    rows.append({**copy.deepcopy(next(r for r in rows if r.get("kind") != "telemetry")), "action": "help_at_cost", "cue": "H9", "target_json": {"id": f"moment:{s}|people|99", "kind": "resource"}})
    e0, e1 = A.engine_echoes(export, "fast", (0,)), A.engine_echoes(moved, "fast", (0,))
    p = "give"
    assert (e0[s]["elsewhere_bare"][p].mu == e1[s]["elsewhere_bare"][p].mu).all()
