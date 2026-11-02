"""The closed forms the report draws, held to a Monte Carlo of the model they come from."""
import numpy as np

from echo_pilot import theory as T


def test_closed_forms_match_the_model():
    rng = np.random.default_rng(1)
    h2, nu, N = 0.18, 0.45, 300_000
    eps, rho = 1 - h2 - nu, h2 + nu
    traits, own = rng.normal(0, h2**0.5, N), rng.normal(0, nu**0.5, N)

    def look():
        return traits + own + rng.normal(0, eps**0.5, N)

    def skill(pred, nxt):
        return 1 - np.mean((nxt - pred) ** 2) / np.var(nxt)

    for n in (1, 4):
        seen = np.mean([look() for _ in range(n)], axis=0)
        nxt = look()
        c = h2 / (h2 + (nu + eps) / n)
        assert abs(skill(rho / (rho + eps / n) * seen, nxt) - T.two_layers(h2, nu, n)) < 0.01
        assert abs(skill(c * seen, nxt) - T.one_layer(h2, nu, n)) < 0.01
    nxt = look()
    assert abs(skill(look(), nxt) - T.copying(h2, nu)) < 0.01
    assert abs(skill(traits, nxt) - T.axes_ceiling(h2, nu)) < 0.01


def test_the_orderings_the_paper_states():
    for h2 in (0.05, 0.1, 0.2, 0.3):
        for nu in (0.2, 0.4, 0.5):
            if h2 + nu >= 0.95:
                continue
            # Two layers after one look beat copying the last choice, and one layer after one look.
            assert T.two_layers(h2, nu, 1) >= T.copying(h2, nu)
            assert T.two_layers(h2, nu, 1) > T.one_layer(h2, nu, 1)
            # Both approach the person's ceiling, never pass it.
            assert T.two_layers(h2, nu, 1000) <= T.ceiling(h2, nu) + 1e-9
            assert T.one_layer(h2, nu, 1000) <= T.ceiling(h2, nu) + 1e-9
            # Two layers after one look beat knowing the traits exactly whenever ρ² > h².
            assert (T.two_layers(h2, nu, 1) > T.axes_ceiling(h2, nu)) == ((h2 + nu) ** 2 > h2)
    assert T.looks_to_catch_up(0.18, 0.45) == 4
