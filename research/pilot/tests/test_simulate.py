"""The simulation: deterministic, shaped like the export, and paced like the director."""
import math

from echo_pilot import simulate as M
from echo_pilot.analysis import acts_of
from echo_pilot.paradigms import LEVELS, PARADIGMS


def test_same_seed_same_group():
    a, ta = M.make_group(5, seed=11)
    b, tb = M.make_group(5, seed=11)
    assert a == b and ta == tb
    c, _ = M.make_group(5, seed=12)
    assert c != a


def test_it_comes_out_as_the_export_does(group8):
    export, truth = group8
    assert export["simulated"] is True
    assert {"people", "ratings", "byPerson", "cell", "exportedAt"} <= set(export)
    for p in export["people"]:
        assert {"subject", "nickname", "self", "stated", "sessions"} <= set(p)
        rec = export["byPerson"][p["subject"]]
        assert {"stagings", "events"} <= set(rec) and {"rows", "source"} <= set(rec["events"])
    for r in export["ratings"]:
        assert (r["axes"] is None and r["predicted"] is None) if r["know"] == 0 else len(r["axes"]) == 8
    acts = acts_of(export)
    for s, person in truth["people"].items():
        for p in PARADIGMS:
            for v, code in person["acts"][p].items():
                assert acts[s][p].get(v) == code


def test_the_director_asks_one_at_a_time(group8):
    export, _ = group8
    from datetime import datetime

    def t(x):
        return datetime.fromisoformat(x.replace("Z", "+00:00")).timestamp()

    for rec in export["byPerson"].values():
        sts = sorted(rec["stagings"], key=lambda s: t(s["createdAt"]))
        for a, b in zip(sts, sts[1:]):
            if b["createdAt"][:10] == a["createdAt"][:10] and t(b["createdAt"]) - t(a["createdAt"]) < 3600:
                assert t(b["createdAt"]) >= t(a["resolvedAt"]) + 30 - 1e-6


def test_oracles_and_shares_are_distributions(group8):
    export, truth = group8
    s = export["people"][0]["subject"]
    for p in PARADIGMS:
        for knows in (False, True):
            dist = M.oracle(truth, s, p, knows_own=knows)
            assert [lv for lv, _ in dist] == list(LEVELS[p])
            assert math.isclose(sum(q for _, q in dist), 1.0)
    for parts in M.shares().values():
        assert math.isclose(sum(parts.values()), 1.0)
