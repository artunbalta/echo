"""
The leak tests are only as good as the leaks they catch. Each mutant here is a plausible slip that lets a
person's own truth into their guess. Every one must be caught by the same check `test_leaks.py` uses.
(The pilot did the same with ten planted leaks: research/pilot/README.md.)
"""
import deeds  # noqa: F401

import numpy as np
import pytest

from deeds.data import load
from deeds import witnesses as W

TASKS = ["omission", "base rate"]


@pytest.fixture(scope="module")
def tw():
    return load()


def _leaky_ridge_columns(X, Y, folds, rows=None):
    n, q = Y.shape
    rows = np.ones(n, bool) if rows is None else rows
    out = np.full((n, q), np.nan)
    for f in np.unique(folds[rows]):
        test = (folds == f) & rows
        for j in range(q):
            tr = rows & ~np.isnan(Y[:, j])  # the slip: the test fold is trained on
            A, B = W._prep(X[tr], X[test])
            out[test, j] = W._ridge_group(A, B, Y[tr][:, [j]])[:, 0]
    return out


def _leaky_rounded(truth, folds, score):
    out = np.full(len(truth), np.nan)
    for f in np.unique(folds):
        test = folds == f
        out[test] = W.to_admissible(score[test], truth[~np.isnan(truth)])  # the slip: their own answer is admissible
    return out


def _leaky_base(tw_, truth, folds):
    point, score = W._frame(tw_, truth.index), W._frame(tw_, truth.index)
    for c in tw_.columns:
        y = truth[c].to_numpy(dtype=float)
        point[c] = np.median(y[~np.isnan(y)]) + 0 * y  # the slip: everyone's median, theirs included
        score[c] = np.nanmean(y) + 0 * y
    return point, score


def _leaky_stack(m_tr, x_tr, y_tr, m_te, x_te):
    # The slip: the stacker is also fitted on the test people (their truth smuggled in through a global).
    m_all, x_all, y_all = np.concatenate([m_tr, m_te]), np.concatenate([x_tr, x_te]), np.concatenate([y_tr, _LEAK["y_te"]])
    return _ORIG_STACK(m_all, x_all, y_all, m_te, x_te)


_LEAK: dict = {}
_ORIG_STACK = W._stack


def _leaky_echo_on(tw_, truth, earlier, folds, prior):
    point, score = W._frame(tw_, truth.index), W._frame(tw_, truth.index)
    for c in tw_.columns:
        y, x, m = (t[c].to_numpy(dtype=float) for t in (truth, earlier, prior))
        sc = np.full(len(y), np.nan)
        for f in np.unique(folds):
            train, test = folds != f, folds == f
            _LEAK["y_te"] = y[test]
            sc[test], _ = _leaky_stack(m[train], x[train], y[train], m[test], x[test])
        score[c] = sc
        point[c] = W.rounded(y, folds, sc)
    return point, score, None


def _changed(tw_, truth, who):
    t = truth.copy()
    pid = tw_.ids[who]
    for c in tw_.columns:
        if not np.isnan(t.at[pid, c]):
            t.at[pid, c] = tw_.hi[c] if t.at[pid, c] < (tw_.lo[c] + tw_.hi[c]) / 2 else tw_.lo[c]
    return t


def _beside(tw_, truth, who, score):
    """
    Their answer moved to a value nobody else gave, a hair from their own honest score. A rounding that
    admits their own answer then snaps to it; an honest one cannot even know it exists. (Moving it to the
    scale's end changes nothing here: someone else always gave that end, so that leak is inert in this
    data, and a test built on it would wrongly pass.)
    """
    t = truth.copy()
    pid = tw_.ids[who]
    for c in [c for c in tw_.columns if tw_.task[c] in TASKS]:
        if not np.isnan(t.at[pid, c]) and not np.isnan(score.at[pid, c]):
            t.at[pid, c] = score.at[pid, c] + 1e-3
    return t


def _moved(tw_, make, who=3, rounding=False) -> bool:
    truth = tw_.w4
    p0, s0 = make(truth)
    changed = _beside(tw_, truth, who, s0) if rounding else _changed(tw_, truth, who)
    p1, s1 = make(changed)
    pid = tw_.ids[who]
    cols = [c for c in tw_.columns if tw_.task[c] in TASKS]
    a = np.concatenate([p0.loc[pid, cols].to_numpy(float), s0.loc[pid, cols].to_numpy(float)])
    b = np.concatenate([p1.loc[pid, cols].to_numpy(float), s1.loc[pid, cols].to_numpy(float)])
    return not np.array_equal(a, b, equal_nan=True)


MUTANTS = {
    "regression trains on the test fold": ("ridge_columns", _leaky_ridge_columns, lambda tw_, f: W.regression(tw_, tw_.w4 if False else _T["t"], f, ("facts",), None, tasks=TASKS)),
    "rounding admits their own answer": ("rounded", _leaky_rounded, lambda tw_, f: W.regression(tw_, _T["t"], f, ("facts",), None, tasks=TASKS)),
    "base is everyone's median": ("base", lambda t, tr, f: _leaky_base(t, tr, f), lambda tw_, f: W.base(tw_, _T["t"], f)),
    "echo's prior trains on the test fold": ("ridge_columns", _leaky_ridge_columns, lambda tw_, f: W.echo(tw_, _T["t"], tw_.w13, f, ("facts",), None, tasks=TASKS)[:2]),
    "echo's rounding admits their own answer": ("rounded", _leaky_rounded, lambda tw_, f: W.echo(tw_, _T["t"], tw_.w13, f, ("facts",), None, tasks=TASKS)[:2]),
    "the stacker sees the test people": ("echo_on", _leaky_echo_on, lambda tw_, f: W.echo_on(tw_, _T["t"], tw_.w13, f, tw_.llm["Text Persona - GPT4.1-mini"].fillna(3.0))[:2]),
}
_T: dict = {}


@pytest.mark.parametrize("name", list(MUTANTS))
def test_every_planted_leak_is_caught(tw, monkeypatch, name):
    attr, leaky, run = MUTANTS[name]
    folds = W.folds_of(len(tw.ids))

    def make(truth):
        _T["t"] = truth
        return run(tw, folds)

    rounding = "rounding" in name
    assert not _moved(tw, make, rounding=rounding), "the honest witness moved: the check itself is broken"
    monkeypatch.setattr(W, attr, leaky)
    assert _moved(tw, make, rounding=rounding), f"planted leak not caught: {name}"
