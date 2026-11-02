"""The engine, used as it is: the research path agrees with the endpoints, and each option reads as the paradigm table says."""
import numpy as np

from echo_pilot import engine as E
from echo_pilot.paradigms import FEATURE_OF, OPTION_TELEMETRY, PARADIGMS, VERB_FOR
from echo_pilot.simulate import BASE_CONTEXT, PASSED, VERB_MEASURE, VERB_RAW


def _row(paradigm: str, verb: str) -> dict:
    if verb == "passed":
        channel, cue, action, polarity, with_distance = PASSED[paradigm]
        raw = {"distance": 36.0} if with_distance else {}
        context = {**BASE_CONTEXT, "stakes": "medium"}
    else:
        channel, cue, action, stakes = VERB_MEASURE[verb]
        raw = {"dwell_ms": 1500, "decision_latency_ms": 2500, **VERB_RAW.get(verb, {})}
        context = {**BASE_CONTEXT, "stakes": stakes, "counterpart_status": "stranger"}
        polarity = "take"
    return {"kind": "behavioral", "t": "2026-11-03T18:00:00Z", "type": "act", "channel": channel, "cue": cue, "action": action, "polarity": polarity, "target_json": {"id": "x", "kind": "resource"}, "context_json": context, "raw_signals_json": raw, "payload_json": {}}


def test_each_option_reads_as_the_table_says():
    for p in PARADIGMS:
        table = dict(OPTION_TELEMETRY[p])
        for code, verb in VERB_FOR[p].items():
            tel = E.ingest.event_to_observation(E.event_of(_row(p, verb), "u"))["telemetry"]
            feat = FEATURE_OF[p]
            if feat is None:
                assert table[code] == {} and not ({"ts_social", "risk_index", "save_rate", "curiosity", "approach"} & set(tel)), verb
            else:
                assert {feat: tel.get(feat)} == table[code], (p, verb, tel)


def test_the_fast_path_is_the_endpoints_bit_for_bit(group8):
    export, _ = group8
    exact = E.Exact()
    for person in export["people"][:3]:
        s = person["subject"]
        rows = export["byPerson"][s]["events"]["rows"]
        a = exact.replay(f"t|{s}", rows)
        b = E.fast_replay(rows, s)
        assert np.array_equal(a.mu, b.mu) and np.array_equal(a.Sigma, b.Sigma)
        half = E.when(rows[len(rows) // 2])
        keep = lambda r, half=half: E.when(r) < half  # noqa: E731
        a, b = exact.replay(f"t|{s}", rows, keep), E.fast_replay(rows, s, keep)
        assert np.array_equal(a.mu, b.mu) and np.array_equal(a.Sigma, b.Sigma)


def test_an_echo_says_nothing_of_what_it_cannot_hear():
    post = E.prior()
    assert E.choice_distribution(post, "lend") is None and E.expected_choice(post, "lend") is None
    for p in PARADIGMS:
        dist = E.choice_distribution(post, p)
        if dist is not None:
            assert abs(sum(q for _, q in dist) - 1) < 1e-9
            assert abs(E.expected_choice(post, p) - sum(v * q for v, q in dist)) < 1e-12


def test_an_act_is_weighed_as_a_wordless_message():
    # The engine scales an act's noise by its short-message heuristic (C77 finding): 1 + 6/(1 + 0) today.
    assert E.act_noise_scale() == 1 + E.HYPER.het_noise_short
    ears = E.ears()
    assert ears["lend"]["total_bits"] == 0.0
    assert all(ears[p]["total_bits"] > 0 for p in PARADIGMS if FEATURE_OF[p])
