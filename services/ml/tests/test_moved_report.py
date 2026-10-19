"""The mirror's report (web DECISIONS C61): every update says its own move, per axis.

/observe/behavioral, /telemetry and /observe each add `delta` (μ after − μ before), `version_before`
and `version` to their response. The fields are a report and nothing else: these tests pin that
they are exact, that they add up to where the posterior is, and that they change nothing.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402
from scripts.slice_walkthrough import _C, _H, ctx, ev, persona_mu, post  # noqa: E402
from echo_ml import persona as P  # noqa: E402


def _uid() -> str:
    return f"mirror-{uuid.uuid4().hex[:10]}"


def _walk(uid, novel, tort):
    return _C.post("/telemetry", headers=_H, json={"userId": uid, "event": {"type": "passive_locomotion", "payload": {
        "novel_tile_ratio": novel, "path_tortuosity": tort, "heading_change_rate": 0.3, "tiles": 12}}})


def test_an_act_reports_its_own_move_exactly():
    uid = _uid()
    r = post(ev(uid, "F", "wager", cue="F3", raw={"variance": 0.8}, context=ctx(stakes="medium"))).json()
    delta = np.array(r["delta"])
    assert delta.shape == (P.D,)
    assert r["version"] == r["version_before"] + 1
    # The norm the response always gave, now with its direction.
    assert abs(np.linalg.norm(delta) - r["delta_mu"]) < 1e-9
    # And exactly the step from where it was to where it is.
    prior = P.prior().mu
    assert np.allclose(np.array(r["persona"]["mu"]) - prior, delta)


def test_walking_reports_what_it_did_and_a_window_with_nothing_in_it_says_nothing_moved():
    uid = _uid()
    r = _walk(uid, 0.9, 1.6).json()
    assert r["ok"] is True and "uncertainty" in r
    assert r["version"] == r["version_before"] + 1 and np.linalg.norm(r["delta"]) > 0
    still = _C.post("/telemetry", headers=_H, json={"userId": uid, "event": {"type": "passive_locomotion", "payload": {}}}).json()
    assert still["version"] == still["version_before"] and np.allclose(still["delta"], 0)


def test_the_moves_add_up_to_where_the_posterior_is():
    uid = _uid()
    total = np.zeros(P.D)
    versions = []
    for i in range(6):
        r = _walk(uid, 0.2 + 0.1 * i, 1.0 + 0.2 * i).json()
        total += r["delta"]
        versions.append((r["version_before"], r["version"]))
        a = post(ev(uid, "D", "pet_talk", cue="D11", target={"id": "pet", "kind": "pet"}, raw={"amount": 0.8, "valence": 0.7})).json()
        total += a["delta"]
        versions.append((a["version_before"], a["version"]))
    choice = _C.post("/observe", headers=_H, json={"userId": uid, "action": "shared the last of the water", "telemetry": {"ts_social": 0.8}}).json()
    total += choice["delta"]
    versions.append((choice["version_before"], choice["version"]))
    # Each update starts where the last one ended: nothing moved in between unreported.
    assert all(prev[1] == nxt[0] for prev, nxt in zip(versions, versions[1:])), versions
    assert np.allclose(P.prior().mu + total, persona_mu(uid), atol=1e-9)


def test_the_report_changes_nothing():
    # Two actors given the same evidence end in the same place, whatever the response carried.
    a, b = _uid(), _uid()
    for uid in (a, b):
        post(ev(uid, "F", "wager", cue="F3", raw={"variance": 0.6}, context=ctx(stakes="medium")))
        _walk(uid, 0.5, 1.2)
    assert np.allclose(persona_mu(a), persona_mu(b))
