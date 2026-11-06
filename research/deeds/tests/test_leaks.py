"""
Nothing sees what it predicts (PREREG §5): change one person's truth and none of their guesses may move, to
the last float, for every witness. Each test also checks that someone else's guess did move. Otherwise the
test would pass for a witness that ignores the truth altogether, and prove nothing.

    /opt/anaconda3/bin/python3.13 -m pytest research/deeds/tests -q
"""
import deeds  # noqa: F401

import numpy as np
import pandas as pd
import pytest

from deeds.data import load
from deeds import witnesses as W

TASKS = ["omission", "pricing", "base rate"]  # one item, forty items, a between-subject pair


@pytest.fixture(scope="module")
def tw():
    return load()


def _perturbed(tw, truth: pd.DataFrame, who: int) -> pd.DataFrame:
    """The same answers, except person `who` answers every scored column at the far end of its scale."""
    t = truth.copy()
    pid = tw.ids[who]
    for c in tw.columns:
        if not np.isnan(t.at[pid, c]):
            t.at[pid, c] = tw.hi[c] if t.at[pid, c] < (tw.lo[c] + tw.hi[c]) / 2 else tw.lo[c]
    return t


def _check(tw, before: pd.DataFrame, after: pd.DataFrame, who: int, cols):
    pid = tw.ids[who]
    a, b = before.loc[pid, cols].to_numpy(dtype=float), after.loc[pid, cols].to_numpy(dtype=float)
    assert np.array_equal(a, b, equal_nan=True), f"person {pid}'s guesses moved when only their truth changed"
    others = before.index != pid
    moved = ~np.isclose(before.loc[others, cols].to_numpy(dtype=float), after.loc[others, cols].to_numpy(dtype=float), equal_nan=True)
    assert moved.any(), "nobody else's guess moved: the witness ignores the truth, so this test proves nothing"


@pytest.mark.parametrize("who", [3, 1500])
def test_base_regression_and_echo_are_blind(tw, who):
    folds = W.folds_of(len(tw.ids))
    truth, earlier = tw.w4, tw.w13
    changed = _perturbed(tw, truth, who)
    cols = [c for c in tw.columns if tw.task[c] in TASKS]
    for make in (
        lambda t: W.base(tw, t, folds),
        lambda t: W.regression(tw, t, folds, ("facts", "choices"), "w13", tasks=TASKS),
        lambda t: W.echo(tw, t, earlier, folds, ("facts",), "w13", tasks=TASKS)[:2],
        lambda t: W.echo_on(tw, t, earlier, folds, tw.llm["Text Persona - GPT4.1-mini"].fillna(3.0))[:2],
    ):
        (p0, s0), (p1, s1) = make(truth), make(changed)
        _check(tw, s0, s1, who, cols)
        pid = tw.ids[who]
        assert np.array_equal(p0.loc[pid, cols].to_numpy(float), p1.loc[pid, cols].to_numpy(float), equal_nan=True)


def test_again_and_the_twins_never_read_the_truth(tw):
    """The retest and the released twins are fixed tables: no truth goes in at all."""
    assert W.again(tw, tw.w13).equals(tw.w13[tw.columns])
    for spec, table in tw.llm.items():
        assert list(table.columns) == tw.columns, spec


def test_the_rounding_is_blind_too(tw):
    """A person's point guess is rounded to answers other people gave: their own answer cannot make it admissible."""
    folds = W.folds_of(len(tw.ids))
    y = np.array([1.0, 2.0, 7.0, 2.0, 1.0, 2.0])
    f = np.array([0, 0, 1, 1, 2, 2])
    out = W.rounded(y, f, np.array([6.9, 1.2, 6.9, 1.9, 1.4, 1.6]))
    assert out[2] == 2.0  # person 2 alone answered 7: the others never did, so 6.9 rounds to 2
    assert len(folds) == len(tw.ids)
