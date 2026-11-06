"""
Study 4's analysis on data where the answer is known: people whose looks are exchangeable, so the theory's
looks curve and copy law hold exactly in expectation. Also: the crowd for a fold never reads that fold.
"""
import numpy as np
import pandas as pd

import run_mm


def synthetic(n_people: int = 20000, seed: int = 0, sd: float = 0.2, survey_share: float = 0.5):
    rng = np.random.default_rng(seed)
    sessions = np.where(rng.random(n_people) < 0.3, 1, rng.integers(2, 31, n_people))
    who = np.repeat(np.arange(n_people), sessions)
    T = len(who)
    n_rows = T * 12
    user_of_row = np.repeat(who, 12)
    dim = np.tile(np.repeat(np.arange(6), 2), T).astype(np.int8)
    feat = {"intervention": rng.integers(0, 2, n_rows), "pedped": rng.integers(0, 2, n_rows), "barrier": rng.integers(0, 2, n_rows),
            "signal": rng.integers(0, 3, n_rows), "nchar": rng.integers(1, 6, n_rows), "diff": rng.integers(0, 5, n_rows)}
    shift = np.array([0.25, -0.05, 0.05, 0.15, 0.1, 0.3])
    a = rng.normal(0, sd, (n_people, 6))
    p = np.clip(0.5 + shift[dim] + 0.1 * (feat["intervention"] - 0.5) + 0.04 * (feat["signal"] - 1) + a[user_of_row, dim], 0.02, 0.98)
    ids = rng.integers(1, 2**62, n_people)
    country = pd.Categorical(rng.choice(["AAA", "BBB", "CCC"], n_people)[user_of_row])
    rows = pd.DataFrame({"rid": np.arange(n_rows), "user": ids[user_of_row], "session": np.repeat(rng.integers(1, 2**62, T), 12),
                         "dim": dim, "order": rng.integers(1, 14, n_rows).astype(np.int8),
                         "saved": (rng.random(n_rows) < p).astype(np.int8), "country": country,
                         **{k: v.astype(np.int8) for k, v in feat.items()}})
    takers = rng.random(n_people) < survey_share
    people = pd.DataFrame({"user": ids[takers], "country": rng.choice(["AAA", "BBB"], takers.sum()),
                           "Review_age": rng.integers(18, 70, takers.sum()).astype(float),
                           "Review_education": rng.choice(["high", "college", "default"], takers.sum()),
                           "Review_gender": rng.choice(["male", "female", "default"], takers.sum()),
                           "Review_income": rng.choice(["5000", "50000", "default"], takers.sum()),
                           "Review_political": rng.random(takers.sum()), "Review_religious": rng.random(takers.sum())})
    return rows, people


def test_crowd_never_reads_the_fold():
    rows, _ = synthetic(3000, seed=1)
    rows = rows.sort_values(["dim", "session"]).reset_index(drop=True)
    fold = run_mm.fold_of(rows["user"].to_numpy())
    before = run_mm.Crowd(rows, fold, 20).without(3)
    flipped = rows.copy()
    flipped.loc[fold == 3, "saved"] = 1 - flipped.loc[fold == 3, "saved"]
    after = run_mm.Crowd(flipped, fold, 20).without(3)
    assert np.array_equal(before, after)
    assert not np.array_equal(before, run_mm.Crowd(flipped, fold, 20).without(4))


def test_looks_curve_and_copy_law_on_exchangeable_people():
    rows, people = synthetic()
    res = run_mm.analyse(rows, people, draws=6, boot=20, min_panel=400, min_cell=30)
    pooled = res["M1"]["pooled"]
    assert all(res["M1"][k]["K"] >= 10 for k in run_mm.DIMS)
    assert pooled["corr"] > 0.95 and pooled["mad"] < 0.015, pooled
    for k in run_mm.DIMS:
        m = res["M2"][k]
        assert abs(m["copy"]["value"] - m["theory_copy"]) < 0.04, (k, m)
        assert abs(m["echo1"]["value"] - m["theory_echo1"]) < 0.03, (k, m)
        # The persona here is noise, so it knows nothing; one look knows something.
        assert res["M3"][k]["persona"]["value"] < res["M3"][k]["echo1"]["value"]
        assert res["M3"][k]["persona"]["value"] < 0.01
