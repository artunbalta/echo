"""The analysis: scoring that means what it says, and witnesses that never see what they are asked."""
import copy

import pytest

from echo_pilot import analysis as A
from echo_pilot.paradigms import PARADIGM_OF, VERB_FOR


def _items():
    out = []
    for i, s in enumerate("abcdef"):
        for p, actual in (("greet", float(i % 2)), ("give", (i % 4) / 3)):
            out.append({"subject": s, "paradigm": p, "actual": actual, "base": 0.5 if p == "greet" else 1 / 3, "right": actual, "silent": None, "wrong": 1 - actual})
    return out


def test_skill_means_what_it_says():
    items = _items()
    assert A.score(items, "right", ci=False)["skill"] == 1.0
    assert A.score(items, "bar", ci=False)["skill"] == 0.0
    silent = A.score(items, "silent", ci=False)
    assert silent["skill"] == 0.0 and silent["silent"] == 1.0
    assert A.score(items, "wrong", ci=False)["skill"] < 0
    assert A.duel(items, "bar", "right", ci=False)["p"] < 0.05
    assert A.duel(items, "right", "bar", ci=False)["p"] == 1.0


def test_crossing_interpolates():
    curve = {0: 0.0, 10: 0.2, 20: 0.4}
    assert abs(A.crossing(curve, 0.3) - 15.0) < 1e-9
    assert A.crossing(curve, 0.5) is None
    assert A.crossing(curve, -0.1) == 0.0
    assert A.crossing(curve, None) is None


@pytest.fixture(scope="module")
def analysed(group8):
    export, truth = group8
    return A.analyze(export, mode="fast", truth=truth, ci=False, minutes=(0, 4, 25))


def test_everything_is_reported(analysed):
    res = analysed
    for name in A.SETTINGS:
        w = res["settings"][name]["witnesses"]
        assert set(A.WITNESSES) | {"retest", "oracle_axes", "oracle_person"} <= set(w)
        assert all(v["n"] > 0 for v in w.values())
    assert res["curve"]["minutes"] == [0, 4, 25] and set(res["curve"]["witnesses"]) == set(A.CURVE_WITNESSES)
    assert set(res["shares"]["give"]) == {"traits", "own", "visit"}
    assert res["act_noise_scale"] == 7.0


def _flip(export, subject, keep_paradigm=None, visit=None):
    """A copy where this person did otherwise: in one paradigm (all visits), or on one visit (all paradigms)."""
    out = copy.deepcopy(export)
    person = next(p for p in out["people"] if p["subject"] == subject)
    rec = out["byPerson"][subject]
    gone = set()
    for st in rec["stagings"]:
        p = PARADIGM_OF[st["situation"]]
        v = A.visit_of(st["createdAt"], person["sessions"])
        if (keep_paradigm and p != keep_paradigm) or (visit and v != visit) or st["resolved"] == "unmet":
            continue
        verbs = list(VERB_FOR[p].values())
        st["resolved"] = verbs[(verbs.index(st["resolved"]) + 1) % len(verbs)] if st["resolved"] in verbs else verbs[0]
        gone.add(f"staged:{st['id']}")
    rows = rec["events"]["rows"]
    if visit:
        # Only that visit's rows go: the other visit is left exactly as it was.
        rec["events"]["rows"] = [r for r in rows if A.visit_of(r["t"], person["sessions"]) != visit]
    else:
        rec["events"]["rows"] = [r for r in rows if (r.get("target_json") or {}).get("id") not in gone]
    return out


PREDICTORS = ("echo", "echo_axes", "echo_2l", "traits", "twin", "self", "friends", "together", "base", "retest")


def _same_posterior(a, b) -> bool:
    return a.mu.tolist() == b.mu.tolist() and a.Sigma.tolist() == b.Sigma.tolist()


def test_again_never_sees_the_second_visit(group8, analysed):
    export, truth = group8
    s = next(p["subject"] for p in export["people"] if len(p["sessions"]) == 2)
    flipped = _flip(export, s, visit=2)
    # What every witness of `again` rests on, exactly (floats, not the levels they round to).
    e0, e1 = A.engine_echoes(export, "fast", (0, 4, 25)), A.engine_echoes(flipped, "fast", (0, 4, 25))
    assert _same_posterior(e0[s]["again"][1], e1[s]["again"][1])
    assert all(_same_posterior(e0[s]["curve"][1][t], e1[s]["curve"][1][t]) for t in (0, 4, 25))
    assert not _same_posterior(e0[s]["all"], e1[s]["all"])
    l0, l1 = A.layer_echoes(export, (0, 4, 25)), A.layer_echoes(flipped, (0, 4, 25))
    assert l0[s]["again"][1] == l1[s]["again"][1] and l0[s]["curve"][1] == l1[s]["curve"][1] and l0[s]["traits"] == l1[s]["traits"]
    a0, a1 = A.acts_of(export), A.acts_of(flipped)
    assert a0[s] != a1[s]
    for p in A.PARADIGMS:
        assert A.twin_again(a0, s, p) == A.twin_again(a1, s, p)
        assert A.bar_of(a0, s, p) == A.bar_of(a1, s, p)
    other = A.analyze(flipped, mode="fast", truth=truth, ci=False, minutes=(0, 4, 25))
    before = [it for it in analysed["items"]["again"] if it["subject"] == s]
    after = [it for it in other["items"]["again"] if it["subject"] == s]
    assert len(before) == len(after) > 0
    for a, b in zip(before, after):
        for key in (*PREDICTORS, "echo@4", "echo_2l@4", "echo@25", "echo_2l@25"):
            assert a[key] == b[key], (a["paradigm"], key)


def test_elsewhere_never_sees_the_paradigm(group8):
    export, _ = group8
    s = export["people"][1]["subject"]
    e0, l0, a0 = A.engine_echoes(export, "fast", (0,)), A.layer_echoes(export, (0,)), A.acts_of(export)
    for p in ("give", "greet", "seed"):
        flipped = _flip(export, s, keep_paradigm=p)
        e1, l1, a1 = A.engine_echoes(flipped, "fast", (0,)), A.layer_echoes(flipped, (0,)), A.acts_of(flipped)
        assert a0[s][p] != a1[s][p]
        assert _same_posterior(e0[s]["elsewhere"][p], e1[s]["elsewhere"][p])
        for key in ("echo_axes", "echo_2l"):
            assert l0[s]["elsewhere"][key][p] == l1[s]["elsewhere"][key][p], (p, key)
        m0 = {q: {k: A.S.mean(list(a0[q][k].values())) for k in A.PARADIGMS} for q in a0}
        m1 = {q: {k: A.S.mean(list(a1[q][k].values())) for k in A.PARADIGMS} for q in a1}
        assert A.twin_elsewhere(m0, s, p) == A.twin_elsewhere(m1, s, p)
        assert A.bar_of(a0, s, p) == A.bar_of(a1, s, p)


def test_the_curve_never_sees_ahead(group8):
    export, _ = group8
    s = next(p["subject"] for p in export["people"] if len(p["sessions"]) == 2)
    person = next(p for p in export["people"] if p["subject"] == s)
    start = A._t(person["sessions"][0]["startedAt"]).timestamp()
    cut = copy.deepcopy(export)
    rec = cut["byPerson"][s]
    from echo_pilot.engine import when

    rec["events"]["rows"] = [r for r in rec["events"]["rows"] if when(r) <= start + 4 * 60 or when(r) > start + 3600]
    for st in rec["stagings"]:
        t = A._t(st["resolvedAt"]).timestamp() if st.get("resolvedAt") else None
        if t is not None and start + 4 * 60 < t < start + 3600:
            st["resolved"] = None
    e0, e1 = A.engine_echoes(export, "fast", (0, 4, 25)), A.engine_echoes(cut, "fast", (0, 4, 25))
    assert _same_posterior(e0[s]["curve"][1][4], e1[s]["curve"][1][4]) and not _same_posterior(e0[s]["curve"][1][25], e1[s]["curve"][1][25])
    l0, l1 = A.layer_echoes(export, (0, 4, 25)), A.layer_echoes(cut, (0, 4, 25))
    for key in ("echo_axes", "echo_2l"):
        assert l0[s]["curve"][1][key][4] == l1[s]["curve"][1][key][4]
        assert l0[s]["curve"][1][key][25] != l1[s]["curve"][1][key][25]


def test_the_bar_is_everyone_else():
    acts = {"a": {"give": {1: 1.0, 2: 1.0}}, "b": {"give": {1: 0.0}}, "c": {"give": {1: 0.0, 2: 1 / 3}}}
    assert A.bar_of(acts, "a", "give") == 0.0
    assert A.bar_of(acts, "b", "give") == (1 / 3 + 1.0) / 2
    assert A.bar_of({"a": {"give": {1: 1.0}}}, "a", "give") is None


def test_each_visit_from_the_other_never_sees_it(group8):
    export, truth = group8
    s = next(p["subject"] for p in export["people"] if len(p["sessions"]) == 2)
    flipped = _flip(export, s, visit=1)
    e0, e1 = A.engine_echoes(export, "fast", (0, 25)), A.engine_echoes(flipped, "fast", (0, 25))
    assert _same_posterior(e0[s]["again"][2], e1[s]["again"][2]) and not _same_posterior(e0[s]["again"][1], e1[s]["again"][1])
    assert all(_same_posterior(e0[s]["curve"][2][t], e1[s]["curve"][2][t]) for t in (0, 25))
    l0, l1 = A.layer_echoes(export, (0, 25)), A.layer_echoes(flipped, (0, 25))
    assert l0[s]["again"][2] == l1[s]["again"][2] and l0[s]["curve"][2] == l1[s]["curve"][2] and l0[s]["again"][1] != l1[s]["again"][1]
    a0, a1 = A.acts_of(export), A.acts_of(flipped)
    for p in A.PARADIGMS:
        assert A.twin_again(a0, s, p, visit=1) == A.twin_again(a1, s, p, visit=1)
    both = A.analyze(flipped, mode="fast", truth=truth, ci=False, minutes=(0, 25), directions=(2, 1))
    assert {it["watched"] for it in both["items"]["again"] if it["subject"] == s and it["visit"] == 1} == {2}


def test_the_echoes_never_read_the_persons_ratings(group8):
    export, _ = group8
    s = export["people"][2]["subject"]
    rated = copy.deepcopy(export)
    for p in rated["people"]:
        if p["subject"] == s:
            p["self"] = [8 - x for x in p["self"]]
    for r in rated["ratings"]:
        if r["ratee"] == s and r.get("axes"):
            r["axes"] = [8 - x for x in r["axes"]]
    l0, l1 = A.layer_echoes(export, (0,)), A.layer_echoes(rated, (0,))
    # The world's echoes of them are fitted on everyone else, on everyone else's scale.
    assert l0[s]["again"] == l1[s]["again"] and l0[s]["elsewhere"] == l1[s]["elsewhere"]
    # The questionnaire twin is the one witness made of those ratings.
    assert l0[s]["traits"] != l1[s]["traits"]
