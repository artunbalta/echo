"""The two-layer echo: the engine's arithmetic, a fit that finds the parts it was given, and no peeking."""
import numpy as np

from echo_pilot import engine as E
from echo_pilot import layers as L


def _model(w, tau2, sigma2, j=0):
    W = np.zeros((L.J, L.K))
    W[j] = w
    t = np.full(L.J, 0.0)
    t[j] = tau2
    s = np.ones(L.J)
    s[j] = sigma2
    return L.Fitted(mu=np.zeros(L.J), W=W, tau2=t, sigma2=s, layers=2 if tau2 else 1)


def test_one_layer_is_the_engines_update():
    w = np.array([0.3, -0.2, 0.1, 0.0, 0.25, 0.0, -0.1, 0.05])
    model = _model(w, 0.0, 0.2)
    m, S = model.prior()
    m, S = L.update(model, m, S, 0, 0.5)
    post = E.P.kalman_update_general(E.P.prior(), np.array([0.5]), w[None, :], np.array([0.2]))
    assert np.allclose(m[: L.K], post.mu, atol=1e-12)
    assert np.allclose(S[: L.K, : L.K], post.Sigma, atol=1e-12)


def test_the_second_layer_keeps_what_the_first_cannot():
    w = np.array([0.1, 0, 0, 0, 0, 0, 0, 0])
    one, two = _model(w, 0.0, 0.3), _model(w, 0.25, 0.1)
    moved = {}
    for name, model in (("one", one), ("two", two)):
        m, S = L.posterior(model, [(1, "give", 1.0)])
        dist = L.distribution(model, m, S, "give")
        assert abs(sum(p for _, p in dist) - 1) < 1e-9
        moved[name] = L.mean_of(dist) - L.mean_of(L.distribution(model, *model.prior(), "give"))
    # One generous act: the one layer can only read it as warmth, which barely loads; the second keeps it.
    assert 0 <= moved["one"] < 0.02 and moved["two"] > 0.25
    # What goes to u stays with that feature: the other features barely move.
    m, S = L.posterior(two, [(1, "give", 1.0)])
    assert abs(L.mean_of(L.distribution(two, m, S, "path")) - L.mean_of(L.distribution(two, *two.prior(), "path"))) < 1e-9


def test_the_fit_finds_the_parts_it_was_given():
    rng = np.random.default_rng(3)
    n, w, tau, sigma = 600, np.array([0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]), 0.5, 0.4
    z = {f"p{i}": rng.normal(size=L.K) for i in range(n)}
    obs = {}
    for s, zs in z.items():
        u = rng.normal(0, tau)
        obs[s] = [(v, "give", float(0.5 + w @ zs + u + rng.normal(0, sigma))) for v in (1, 2)]
    model = L.fit(obs, z, layers=2)
    share = L.stable_share(model)["give"]
    total = w @ w + tau**2 + sigma**2
    assert abs(share["traits"] - w @ w / total) < 0.05
    assert abs(share["own"] - tau**2 / total) < 0.06
    assert abs(share["visit"] - sigma**2 / total) < 0.05
    one = L.fit(obs, z, layers=1)
    assert one.tau2[0] == 0 and abs(one.sigma2[0] - (model.sigma2[0] + model.tau2[0])) < 1e-9


def test_median_is_where_half_the_weight_lies():
    assert L.median([(0.0, 0.3), (0.5, 0.15), (1.0, 0.55)]) == 1.0
    assert L.median([(0.0, 0.5), (1.0, 0.5)]) == 0.0
    assert L.median([(0.0, 0.2), (1 / 3, 0.2), (2 / 3, 0.2), (1.0, 0.4)]) == 2 / 3


def test_observations_respect_drop_until_and_visits(group8):
    export, _ = group8
    s = export["people"][0]["subject"]
    every = L.observations(export, s)
    assert {f for _, f, _ in every} <= set(L.FEATURES)
    no_give = L.observations(export, s, drop=["give"])
    assert all(f != "give" for _, f, _ in no_give)
    first = L.observations(export, s, visits=[1])
    assert first and all(v == 1 for v, _, _ in first)
    start = L.session_start(export, s, 1)
    assert L.observations(export, s, visits=[1], until=start - 1) == []
    # Leaving giving out also leaves out the decision time of the giving act.
    lat = {v: x for v, f, x in every if f == "latency"}
    lat_drop = {v: x for v, f, x in no_give if f == "latency"}
    assert lat.keys() == lat_drop.keys() and any(lat[v] != lat_drop[v] for v in lat)


def test_pooling_shrinks_each_choice_toward_the_others_and_keeps_its_variance():
    rng = np.random.default_rng(5)
    z = {f"p{i}": rng.normal(size=L.K) for i in range(14)}
    obs = {}
    for s in z:
        rows = []
        for j, f in enumerate(L.PARADIGMS):
            own = rng.normal(0, 0.3 + 0.1 * j)
            rows += [(v, f, float(0.5 + own + rng.normal(0, 0.4))) for v in (1, 2)]
        obs[s] = rows
    saved = L.POOL_PAIRS
    try:
        L.POOL_PAIRS = 0.0
        raw = L.fit(obs, z, layers=2)
        L.POOL_PAIRS = 10.0
        pooled = L.fit(obs, z, layers=2)
    finally:
        L.POOL_PAIRS = saved
    js = [L.FEATURES.index(p) for p in L.PARADIGMS]
    ratio = lambda m, j: m.tau2[j] / (m.tau2[j] + m.sigma2[j])  # noqa: E731
    mean = np.mean([ratio(raw, j) for j in js])
    for j in js:
        assert abs((pooled.tau2[j] + pooled.sigma2[j]) - (raw.tau2[j] + raw.sigma2[j])) < 1e-9
        assert abs(ratio(pooled, j) - mean) <= abs(ratio(raw, j) - mean) + 1e-12
    assert np.std([ratio(pooled, j) for j in js]) < np.std([ratio(raw, j) for j in js])
    # Walking and decision time are not choices: pooling leaves them as they were.
    for f in ("novel", "tortuosity", "latency"):
        j = L.FEATURES.index(f)
        assert pooled.tau2[j] == raw.tau2[j] and pooled.sigma2[j] == raw.sigma2[j]
