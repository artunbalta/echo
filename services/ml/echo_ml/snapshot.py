"""Turning a UserState into rows and back, with no network anywhere in it (SOC-2.D, C34).

THE TRANSPORT IS SOMEWHERE ELSE ON PURPOSE. Everything here is a pure function of its arguments, so
the part that is easy to get subtly wrong — a covariance that round-trips as its own diagonal, a
posterior restored under a `W` it was never folded through — is testable without a database, a key,
or a running service. `persistence.py` holds the client; it imports this and this imports nothing
from it.

TWO STAMPS, AND A HYDRATE MUST REFUSE A ROW THAT FAILS EITHER.

  `w_sha256` — a posterior is a point in the coordinate system of the measurement matrix it was
  folded through, and nothing else. When `W` is re-anchored (C29, once, deliberately) every stored
  `mu` becomes a number in a system that no longer exists. THIS IS WHY A SNAPSHOT IS SURVIVABLE AT
  ALL: replay was the competing design precisely because it would survive the re-anchor, and a
  snapshot that SELF-INVALIDATES degrades to the prior, which is exactly today's behaviour — so the
  re-anchor costs nothing relative to the status quo and one column buys the whole of replay's
  advantage. Adapting a stale row instead of discarding it would be the one unforgivable option.

  `snapshot_version` — the shape of the JSON. A version this code does not recognise is discarded,
  not guessed at.

WHAT IS AND IS NOT CARRIED, stated here rather than discovered later. Carried: the pooled posterior,
the per-context conditional posteriors, temperature, the calibration pairs, the drift baseline, the
autonomy buckets (including `_cusum`), the reward head, and the behaviour index with its `context`
and its `provenance`. Not carried: `Bucket._recent`, which is written and never read — the ECE that
gates promotion comes from `calib` — and `UserState.locomotion`, whose source rows already live in
`behavioral_events` under migration 0011 and are recoverable with a select.
"""
from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

from .autonomy import Bucket
from .persona import Posterior
from .reward import RewardModel
from .store import BehaviorEntry, UserState

#: The shape of the JSON blobs below. Bump it when a field changes meaning, never when one is added
#: with a safe default — a bump discards every stored row, which is correct for a change of meaning
#: and wasteful for an addition.
SNAPSHOT_VERSION = 1


def w_stamp() -> str:
    """sha256 of the measurement matrix the process is folding through, or "" when untrained.

    An untrained process (a clean checkout with no artifact, the zero-key path) stamps "" and only
    ever matches another untrained one, which is right: the heuristic featurizer is a different
    coordinate system from the learned one, not a degraded version of it.
    """
    try:
        from .persona_model import get_persona_model

        model = get_persona_model()
        W = getattr(model, "W", None)
        if W is None or not getattr(model, "trained", False):
            return ""
        return hashlib.sha256(np.ascontiguousarray(W, dtype=np.float64).tobytes()).hexdigest()
    except Exception:
        # A stamp that cannot be computed must not be a stamp that matches. "" is the untrained
        # value and an untrained row will not be handed to a trained process.
        return ""


# ── UserState → rows ────────────────────────────────────────────────────────────


def persona_row(state: UserState, stamp: str | None = None) -> dict[str, Any]:
    """The one row that carries everything scalar, vector and matrix about a user."""
    return {
        "user_id": state.user_id,
        "z_mean": [float(x) for x in state.posterior.mu],
        "z_cov_json": [[float(x) for x in row] for row in state.posterior.Sigma],
        "version": int(state.posterior.version),
        "cond_json": {k: v.to_dict() for k, v in state.cond.items()},
        "temperature": float(state.temperature),
        "calib_json": [[float(c), int(a)] for c, a in state.calib],
        "baseline_mu": None if state.baseline_mu is None else [float(x) for x in state.baseline_mu],
        "w_sha256": w_stamp() if stamp is None else stamp,
        "snapshot_version": SNAPSHOT_VERSION,
    }


def bucket_rows(state: UserState) -> list[dict[str, Any]]:
    return [
        {
            "user_id": state.user_id,
            "context_bucket": name,
            "level": b.level,
            "agreement_ewma": float(b.agreement_ewma),
            "volume": int(b.volume),
            "ece": float(b.ece),
            "cusum": float(b._cusum),
        }
        for name, b in state.buckets.items()
    ]


def reward_row(state: UserState) -> dict[str, Any]:
    return {"user_id": state.user_id, "params_json": state.reward.to_dict(), "version": 0}


def behavior_rows(state: UserState, entries: list[BehaviorEntry]) -> list[dict[str, Any]]:
    return [
        {
            "user_id": state.user_id,
            "context_embedding": [float(x) for x in e.embedding],
            "action_text": e.action_text,
            "context": e.context,
            "provenance_json": dict(e.provenance),
        }
        for e in entries
    ]


# ── rows → UserState ────────────────────────────────────────────────────────────


def restore(
    user_id: str,
    persona: dict[str, Any] | None,
    buckets: list[dict[str, Any]] | None = None,
    reward: dict[str, Any] | None = None,
    behaviors: list[dict[str, Any]] | None = None,
    stamp: str | None = None,
) -> UserState | None:
    """Rebuild a UserState, or None if the row may not be trusted.

    REFUSING IS A RESULT, not a failure. None means "start from the prior", which is what every
    restart does today, so a refused row costs exactly nothing relative to the status quo. That is
    the property the whole snapshot design rests on.
    """
    if not persona:
        return None
    if int(persona.get("snapshot_version") or 0) != SNAPSHOT_VERSION:
        return None
    if (persona.get("w_sha256") or "") != (w_stamp() if stamp is None else stamp):
        return None

    state = UserState(user_id)
    state.posterior = Posterior.from_dict(
        {"mu": persona.get("z_mean"), "Sigma": persona.get("z_cov_json"), "version": persona.get("version", 0)}
    )
    state.cond = {k: Posterior.from_dict(v) for k, v in (persona.get("cond_json") or {}).items()}
    if persona.get("temperature") is not None:
        state.temperature = float(persona["temperature"])
    state.calib = [(float(c), int(a)) for c, a in (persona.get("calib_json") or [])]
    base = persona.get("baseline_mu")
    state.baseline_mu = None if base is None else np.array(base, dtype=float)

    for row in buckets or []:
        b = Bucket(row["context_bucket"])
        b.level = row.get("level", b.level)
        b.agreement_ewma = float(row.get("agreement_ewma", b.agreement_ewma))
        b.volume = int(row.get("volume", b.volume))
        b.ece = float(row.get("ece", b.ece))
        b._cusum = float(row.get("cusum", 0.0))
        state.buckets[b.name] = b

    if reward and reward.get("params_json"):
        state.reward = RewardModel.from_dict(reward["params_json"])

    for row in behaviors or []:
        state.behaviors.append(
            BehaviorEntry(
                np.array(row["context_embedding"], dtype=float),
                row.get("action_text") or "",
                row.get("context") or "",
                dict(row.get("provenance_json") or {}),
            )
        )
    return state
