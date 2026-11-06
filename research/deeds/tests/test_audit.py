"""The twin audit on a panel built to known answers: the crowd knows 0% of the knowable, the truth itself more than all of it."""
import deeds  # noqa: F401

import numpy as np
import pandas as pd

from audit import Panel, audit


def _panel(n=400, items=6, seed=0):
    rng = np.random.default_rng(seed)
    t = rng.normal(0, 1, (n, items))
    def wave():
        return np.clip(np.round(3 + t + rng.normal(0, 0.8, (n, items))), 1, 5)
    cols = [f"q{j}" for j in range(items)]
    idx = pd.Index(range(n), name="pid")
    truth, earlier = pd.DataFrame(wave(), index=idx, columns=cols), pd.DataFrame(wave(), index=idx, columns=cols)
    meta = pd.DataFrame({"item": cols, "group": ["a", "a", "b", "b", "c", "c"][:items], "lo": 1.0, "hi": 5.0})
    return Panel(truth, earlier, meta)


def test_the_crowd_knows_nothing_and_the_truth_everything():
    panel = _panel()
    crowd = panel.crowd()
    res = audit(panel, {"crowd": crowd, "truth": panel.truth, "earlier": panel.earlier})
    tw = res["twins"]
    assert abs(tw["crowd"]["knows"]) < 1e-12 and abs(tw["crowd"]["vs_crowd"]) < 1e-12
    assert tw["truth"]["accuracy"] == 1.0 and tw["truth"]["knows"] > 1.0
    # the retest as a twin is the retest; one look through it beats it, as the theory says
    assert abs(tw["earlier"]["accuracy"] - tw["earlier"]["retest"]) < 1e-12
    assert tw["earlier"]["with_one_look"] > tw["earlier"]["accuracy"]
    assert res["ceiling"]["overall"]["ceiling"] > res["ceiling"]["overall"]["base"]
