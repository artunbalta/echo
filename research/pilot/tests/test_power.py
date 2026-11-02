"""The power run, end to end on a tiny scale (two workers, spawned as the real run spawns them)."""
from echo_pilot.power import TESTS, power


def test_power_smoke():
    out = power(sizes=(6,), reps=2, workers=2, seed0=5)
    row = out["sizes"][6]
    assert set(row["power"]) == set(TESTS) and all(0 <= v <= 1 for v in row["power"].values())
    assert row["curve"]["minutes"][0] == 0 and "echo_2l" in row["curve"]
    assert "friends" in row["crossings"]
