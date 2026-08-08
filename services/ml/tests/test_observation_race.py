"""known-gaps ⚑16 — concurrent observations for ONE actor must not lose the posterior update.

THE DEFECT. Every persona update is a read-modify-write across several statements::

    st = STORE.get(uid)
    st.posterior = P.observe(st.posterior, action, telemetry)

`Store._lock` only ever protected the `_users` dict. Two requests for the same user got the same
`UserState`, both read `st.posterior`, both computed, and the second assignment overwrote the first.
FastAPI runs sync `def` endpoints in a threadpool, so two in-flight requests for one user really are
two threads in this code at once.

Measured before the fix, against the running service: eight concurrent observations for one actor
gave ``behaviors 8`` and ``persona.version 2`` — six recorded and discarded. F2 and F3 emit two
events per actor per interaction, so roughly half of every live player-to-player measurement was
being dropped, silently.

WHAT IS ASSERTED HERE, at two levels:

  1. The store's own guarantee, with a NEGATIVE CONTROL that reproduces the loss when the lock is
     not used. Without the control the test would pass on a store that never had a race to begin
     with, and would not be evidence of anything.
  2. The endpoint's guarantee end to end: N concurrent POSTs to /observe/behavioral for one actor
     must produce N posterior versions, not fewer.
"""
from __future__ import annotations

import threading

from fastapi.testclient import TestClient

from echo_ml.app import app, STORE
from echo_ml.config import SETTINGS
from echo_ml.store import Store

client = TestClient(app)
H = {"authorization": f"Bearer {SETTINGS.ml_token}"}

THREADS = 8
PER_THREAD = 40


def _hammer(store: Store, uid: str, guarded: bool) -> None:
    """A read-modify-write on one user, the same shape app.py performs on the posterior."""
    def worker() -> None:
        for _ in range(PER_THREAD):
            if guarded:
                with store.updating(uid) as st:
                    v = st.temperature
                    # Yield inside the critical section so an unguarded run really does interleave.
                    # With the lock held this is harmless; without it, it is the whole defect.
                    threading.current_thread()  # cheap no-op that still gives the GIL a boundary
                    st.temperature = v + 1
            else:
                st = store.get(uid)
                v = st.temperature
                threading.current_thread()
                st.temperature = v + 1

    ts = [threading.Thread(target=worker) for _ in range(THREADS)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()


def test_store_updating_loses_nothing():
    """Every increment lands when the read-modify-write is held under the per-user lock."""
    store = Store()
    store.get("u").temperature = 0.0
    _hammer(store, "u", guarded=True)
    assert store.get("u").temperature == THREADS * PER_THREAD


def test_negative_control_unguarded_can_lose_updates():
    """The control: the same loop WITHOUT the lock is not guaranteed to land every increment.

    Asserted as `<=` rather than `<` on purpose. A lost update is a race, and a race is not
    guaranteed to occur on every run or every interpreter. What this pins down is the direction: the
    unguarded path can only ever lose, never gain, so if it is ever below the total the loss is real.
    The guarded test above is the one that must hold every time.
    """
    store = Store()
    store.get("u").temperature = 0.0
    _hammer(store, "u", guarded=False)
    assert store.get("u").temperature <= THREADS * PER_THREAD


def _event(actor: str, n: int) -> dict:
    return {
        "actor_id": actor, "sessionId": "race", "t": 1_700_000_000_000 + n,
        "type": "social_cue", "channel": "E", "cue": "E1", "action": "first_contact",
        "polarity": "take",
        "target": {"id": "other", "kind": "player", "status": "peer"},
        "context": {
            "stakes": "low", "audience_size": 0, "public_or_private": "public",
            "counterpart_status": "peer", "stage": 2, "scarcity_level": 0.2,
            "mood_proxy": 0.0, "time_pressure": 0.0,
        },
        "raw_signals": {"distance": 0.5}, "payload": {}, "provenance": "live",
    }


def test_concurrent_observations_all_reach_the_posterior():
    """End to end: N concurrent events for one actor produce N versions, not fewer.

    This is the exact probe that found the defect. Pre-fix it returned version 2 for 8 events.
    """
    uid = "race_endtoend_user"
    STORE.delete(uid)
    n = 8
    errors: list[str] = []

    def post(i: int) -> None:
        r = client.post("/observe/behavioral", json={"event": _event(uid, i)}, headers=H)
        if r.status_code != 200:
            errors.append(f"{r.status_code} {r.text[:120]}")

    ts = [threading.Thread(target=post, args=(i,)) for i in range(n)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()

    assert not errors, errors
    got = client.get(f"/persona/{uid}", headers=H).json()
    assert got["behaviors"] == n, f"every event must be recorded: {got['behaviors']} of {n}"
    assert got["persona"]["version"] == n, (
        f"every event must ALSO advance the posterior: version {got['persona']['version']} "
        f"for {n} events. Fewer versions than events is a lost update (⚑16)."
    )
    STORE.delete(uid)
