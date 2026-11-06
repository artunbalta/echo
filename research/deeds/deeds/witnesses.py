"""
The witnesses (PREREG §3): every way of guessing a person's answer that the study compares.

Each witness's guess for person *i* is a function of other people's answers and *i*'s own predictors,
never of *i*'s truth. Folds are over people, and a person's truth enters only the fits of the folds they are
not in. `tests/test_leaks.py` changes one person's truth and checks that none of their guesses move.

A guess has two forms:
- **point**: one admissible answer, scored for accuracy. A ridge score is rounded to the nearest answer the
  training people gave; for a yes/no item that is the median.
- **score**: the continuous guess before rounding, for the score version of r. The released twins and
  `again` have only points.

The two-layer echo is the pilot's model (research/pilot/echo_pilot/layers.py, C77) in its simplest exact
form. A person's answer is three parts:
- what the persona predicts, m;
- their own steady way with this very question, u;
- the day, e.

One earlier answer x = m + u + e′ is pulled back towards m by how much of x is u rather than e. With a
linear stacker the weights are learned from other people: ŷ = a + b·m + c·x. When b + c = 1 that is
m + c(x − m), with c = var(u) / (var(u) + var(e)), Kelley's 1927 estimate of a true score.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from .data import Twin, features, others_matrix

FOLDS = 10
INNER = 5
ALPHAS = np.logspace(-1, 6.5, 31)

KIND_SETS = {
    "facts": ("facts",),
    "self": ("self",),
    "choices": ("choices",),
    "tests": ("tests",),
    "words": ("facts", "self"),
    "deeds": ("choices", "tests"),
    "persona": ("facts", "self", "choices", "tests"),
}


def folds_of(n: int, k: int = FOLDS, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = np.arange(n) % k
    rng.shuffle(f)
    return f


# ── Ridge, several columns at once, penalty by efficient leave-one-out on the training people ───────────


def _prep(X_train: np.ndarray, X_test: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Impute with training means, add an indicator per column missing anywhere, standardise on the training rows."""
    miss_tr = np.isnan(X_train)
    miss_te = np.isnan(X_test)
    with np.errstate(invalid="ignore"):
        mu = np.nanmean(np.where(miss_tr.all(0), 0.0, X_train), axis=0)
    mu = np.where(np.isnan(mu), 0.0, mu)
    A = np.where(miss_tr, mu, X_train)
    B = np.where(miss_te, mu, X_test)
    some = miss_tr.any(0) | miss_te.any(0)
    if some.any():
        A = np.column_stack([A, miss_tr[:, some].astype(float)])
        B = np.column_stack([B, miss_te[:, some].astype(float)])
    m, s = A.mean(0), A.std(0)
    keep = s > 1e-9
    return (A[:, keep] - m[keep]) / s[keep], (B[:, keep] - m[keep]) / s[keep]


def _svd(A: np.ndarray):
    """LAPACK's divide-and-conquer SVD, and its slower, sturdier sibling when that does not converge (rare, ill-conditioned draws)."""
    try:
        return np.linalg.svd(A, full_matrices=False)
    except np.linalg.LinAlgError:
        import scipy.linalg

        return scipy.linalg.svd(A, full_matrices=False, lapack_driver="gesvd")


def _ridge_group(A: np.ndarray, B: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """One decomposition, several targets (columns of Y, no NaN): each its own penalty by leave-one-out."""
    ybar = Y.mean(0)
    if A.shape[1] == 0:
        return np.tile(ybar, (B.shape[0], 1))
    U, s, Vt = _svd(A)
    Yc = Y - ybar
    UtY = U.T @ Yc                                  # k × q
    s2 = s * s
    F = s2[None, :] / (s2[None, :] + ALPHAS[:, None])  # alphas × k
    H = (U * U) @ F.T                               # n × alphas: hat diagonals
    best = np.full(Y.shape[1], np.inf)
    pick = np.zeros(Y.shape[1], int)
    for i in range(len(ALPHAS)):
        fitted = U @ (F[i][:, None] * UtY)          # n × q
        loo = (Yc - fitted) / np.maximum(1 - H[:, i], 1e-9)[:, None]
        e = (loo * loo).mean(0)
        better = e < best
        best[better], pick[better] = e[better], i
    out = np.empty((B.shape[0], Y.shape[1]))
    BV = B @ Vt.T                                   # m × k
    for j in range(Y.shape[1]):
        a = ALPHAS[pick[j]]
        out[:, j] = BV @ ((s / (s2 + a)) * UtY[:, j]) + ybar[j]
    return out


def ridge_columns(X: np.ndarray, Y: np.ndarray, folds: np.ndarray, rows: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Out-of-fold ridge scores, n × q, for the people in `rows` (default everyone); NaN elsewhere.
    Columns whose training people coincide share one decomposition (a task's columns usually do).
    """
    n, q = Y.shape
    rows = np.ones(n, bool) if rows is None else rows
    out = np.full((n, q), np.nan)
    for f in np.unique(folds[rows]):
        test = (folds == f) & rows
        if not test.any():
            continue
        groups: dict[bytes, list[int]] = {}
        for j in range(q):
            tr = rows & (folds != f) & ~np.isnan(Y[:, j])
            groups.setdefault(tr.tobytes(), []).append(j)
        for key, cols in groups.items():
            tr = np.frombuffer(key, dtype=bool)
            if tr.sum() < 20:
                continue
            A, B = _prep(X[tr], X[test])
            out[np.ix_(test, cols)] = _ridge_group(A, B, Y[np.ix_(tr, cols)])
    return out


# ── Rounding a score to an answer ────────────────────────────────────────────────────────────────────────


def to_admissible(score: np.ndarray, admissible: np.ndarray) -> np.ndarray:
    """The nearest answer people actually gave (ties to the lower). NaN stays NaN."""
    a = np.sort(np.unique(admissible[~np.isnan(admissible)]))
    out = np.full(np.shape(score), np.nan, dtype=float)
    ok = ~np.isnan(score)
    if not len(a) or not ok.any():
        return out
    if len(a) == 1:
        out[ok] = a[0]
        return out
    idx = np.clip(np.searchsorted(a, score[ok]), 1, len(a) - 1)
    lo, hi = a[idx - 1], a[idx]
    out[ok] = np.where(score[ok] - lo <= hi - score[ok], lo, hi)
    return out


def rounded(truth: np.ndarray, folds: np.ndarray, score: np.ndarray) -> np.ndarray:
    """Round each fold's scores to the answers given by the people outside it, so even the rounding is blind."""
    out = np.full(len(truth), np.nan)
    for f in np.unique(folds):
        test = folds == f
        out[test] = to_admissible(score[test], truth[(folds != f) & ~np.isnan(truth)])
    return out


# ── The witnesses ────────────────────────────────────────────────────────────────────────────────────────


def _frame(tw: Twin, index, data: Optional[np.ndarray] = None, cols: Optional[list[str]] = None) -> pd.DataFrame:
    return pd.DataFrame(np.nan if data is None else data, index=index, columns=cols or tw.columns)


def base(tw: Twin, truth: pd.DataFrame, folds: np.ndarray) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The group's median answer (point) and mean (score), from the people outside each fold. Knows nobody."""
    point, score = _frame(tw, truth.index), _frame(tw, truth.index)
    for c in tw.columns:
        y = truth[c].to_numpy(dtype=float)
        p, m = np.full(len(y), np.nan), np.full(len(y), np.nan)
        for f in np.unique(folds):
            tr = (folds != f) & ~np.isnan(y)
            p[folds == f] = to_admissible(np.array([np.median(y[tr])]), y[tr])[0]
            m[folds == f] = y[tr].mean()
        point[c], score[c] = p, m
    return point, score


def design(tw: Twin, kinds: tuple[str, ...], task: str, with_others: Optional[str]) -> np.ndarray:
    """The predictors for one task's columns: persona kinds, plus the person's answers to the other tasks."""
    X = features(kinds)[0] if kinds else np.zeros((len(tw.ids), 0))
    if with_others:
        X = np.column_stack([X, others_matrix(task, with_others)[0]])
    return X


def regression(tw: Twin, truth: pd.DataFrame, folds: np.ndarray, kinds: tuple[str, ...], with_others: Optional[str] = None,
               tasks: Optional[list[str]] = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """A statistical twin: ridge from some kinds of information to each column, out of fold."""
    point, score = _frame(tw, truth.index), _frame(tw, truth.index)
    for task in tasks or tw.tasks:
        cols = [c for c in tw.columns if tw.task[c] == task]
        Y = truth[cols].to_numpy(dtype=float)
        S = ridge_columns(design(tw, kinds, task, with_others), Y, folds)
        for j, c in enumerate(cols):
            score[c] = S[:, j]
            point[c] = rounded(Y[:, j], folds, S[:, j])
    return point, score


def again(tw: Twin, earlier: pd.DataFrame) -> pd.DataFrame:
    """The person's own answer to the same column on the other occasion: the retest, used as a guess."""
    return earlier[tw.columns].copy()


def _stack(m_tr, x_tr, y_tr, m_te, x_te) -> tuple[np.ndarray, tuple[float, float, float]]:
    ok = ~np.isnan(m_tr) & ~np.isnan(x_tr) & ~np.isnan(y_tr)
    if ok.sum() < 20:
        return m_te.copy(), (np.nan, np.nan, np.nan)
    Z = np.column_stack([np.ones(ok.sum()), m_tr[ok], x_tr[ok]])
    (a, b, c), *_ = np.linalg.lstsq(Z, y_tr[ok], rcond=None)
    xt = np.where(np.isnan(x_te), m_te, x_te)
    return a + b * m_te + c * xt, (float(a), float(b), float(c))


def echo(tw: Twin, truth: pd.DataFrame, earlier: pd.DataFrame, folds: np.ndarray, kinds: tuple[str, ...], with_others: Optional[str],
         tasks: Optional[list[str]] = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    The two-layer echo after one look, with a ridge prior. Per outer fold:
    - the prior for the test people is ridge trained on all the training people;
    - the prior for the training people is ridge out of inner folds among themselves;
    - the stacker ŷ = a + b·m + c·x is fitted on the training people.
    The test people's truth enters nothing. Returns the point, the score and the learned weights.
    """
    point, score = _frame(tw, truth.index), _frame(tw, truth.index)
    weights = []
    n = len(tw.ids)
    for task in tasks or tw.tasks:
        cols = [c for c in tw.columns if tw.task[c] == task]
        X = design(tw, kinds, task, with_others)
        Y = truth[cols].to_numpy(dtype=float)
        Xe = earlier[cols].to_numpy(dtype=float)
        S = np.full(Y.shape, np.nan)
        for f in np.unique(folds):
            train, test = folds != f, folds == f
            one = np.where(train, 0, 1)  # fold 0 = the training people, 1 = the test people
            m_test = ridge_columns(X, Y, one, rows=None)[test]
            inner = np.full(n, -1)
            inner[train] = folds_of(int(train.sum()), INNER, seed=1000 + int(f))
            m_train = ridge_columns(X, Y, inner, rows=train)[train]
            for j, c in enumerate(cols):
                S[test, j], (a, b, cc) = _stack(m_train[:, j], Xe[train, j], Y[train, j], m_test[:, j], Xe[test, j])
                weights.append({"column": c, "task": task, "fold": int(f), "a": a, "b": b, "c": cc})
        for j, c in enumerate(cols):
            score[c] = S[:, j]
            point[c] = rounded(Y[:, j], folds, S[:, j])
    return point, score, pd.DataFrame(weights)


def echo_on(tw: Twin, truth: pd.DataFrame, earlier: pd.DataFrame, folds: np.ndarray, prior: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """The same echo with an external prior (the released twins' average): blind by construction."""
    point, score = _frame(tw, truth.index), _frame(tw, truth.index)
    weights = []
    for c in tw.columns:
        y, x, m = (t[c].to_numpy(dtype=float) for t in (truth, earlier, prior))
        sc = np.full(len(y), np.nan)
        for f in np.unique(folds):
            train, test = folds != f, folds == f
            sc[test], (a, b, cc) = _stack(m[train], x[train], y[train], m[test], x[test])
            weights.append({"column": c, "task": tw.task[c], "fold": int(f), "a": a, "b": b, "c": cc})
        score[c] = sc
        point[c] = rounded(y, folds, sc)
    return point, score, pd.DataFrame(weights)
