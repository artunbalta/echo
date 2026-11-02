"""Small-sample statistics over people."""
import math

from echo_pilot import stats as S


def test_sign_flip_is_exact_for_small_groups():
    assert S.sign_flip([1, 2, 3, 4, 5], "greater") == 1 / 32
    assert S.sign_flip([1, 2, 3, 4, 5], "less") == 1.0
    assert S.sign_flip([1, -1], "two-sided") == 1.0
    assert S.sign_flip([], "greater") is None


def test_pearson_and_its_interval():
    r = S.pearson([1, 2, 3, 4, 5, 6], [2, 4, 5, 4, 5, 7])
    assert abs(r["r"] - 13.5 / (17.5 * 13.5) ** 0.5) < 1e-12 and r["lo"] < r["r"] < r["hi"]
    assert S.pearson([1, 1, 1], [1, 2, 3])["r"] is None
    assert S.pearson([1, None, 3], [1, 2, None])["n"] == 1


def test_bootstrap_is_reproducible_and_brackets_the_mean():
    xs = [0.1, 0.4, 0.2, 0.5, 0.3, 0.6, 0.2, 0.4]
    a = S.bootstrap(xs, S.mean, seed=4)
    assert a == S.bootstrap(xs, S.mean, seed=4)
    assert a[0] < S.mean(xs) < a[1]


def test_dz():
    assert S.dz([1.0, 1.0]) is None
    assert math.isclose(S.dz([1.0, 2.0, 3.0]), 2.0)
