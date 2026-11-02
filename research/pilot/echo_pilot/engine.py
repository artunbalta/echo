"""The learning engine, used as it is (services/ml is protected, C7: nothing here changes it).

Two ways to build a person's echo from what they did, and the tests hold them to the same answer:

- `Exact` replays the export's rows through the engine's own endpoints, in this process (FastAPI's test
  client): `/observe/behavioral` for an act, `/telemetry` for a walking window or any other signal, with
  the engine's clock set to each row's time so a session's walk counts as the engine counts it (C74).
  This is what the analysis of real data uses: whatever the engine does, the echo here is the echo.
- `fast_*` calls the same library functions directly, for the simulation's thousands of people.

And one way to ask an echo what someone would do (`expected_choice`): the engine's own measurement model,
run forwards. From the posterior over the eight axes it says what it expects of the one feature a
paradigm's choice is read through; each option is weighed by how likely that expectation makes it. No
language model is involved: the prediction is the measurement model's, and nothing else's.

Nothing is persisted and nothing leaves this process: the engine's store stays in memory, embeddings are
the deterministic local ones, and the engine's token is a local one.
"""
from __future__ import annotations

import math
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable, Optional

ROOT = Path(__file__).resolve().parents[3]
ML = ROOT / "services" / "ml"

# Before the engine is imported, because its settings are read at import: no persistence, no remote
# embeddings, a local token.
os.environ.pop("ECHO_ML_PERSIST", None)
os.environ["EMBEDDINGS_PROVIDER"] = "mock"
for key in ("VOYAGE_API_KEY", "EMBEDDINGS_API_KEY"):
    os.environ.pop(key, None)
os.environ.setdefault("ML_SERVICE_TOKEN", "research-local-token")
if str(ML) not in sys.path:
    sys.path.insert(0, str(ML))

import numpy as np  # noqa: E402

from echo_ml import ingest  # noqa: E402
from echo_ml import persona as P  # noqa: E402
from echo_ml.config import HYPER, SETTINGS  # noqa: E402
from echo_ml.persona_axes import AXIS_KEYS  # noqa: E402
from echo_ml.persona_model import get_persona_model  # noqa: E402

from .paradigms import FEATURE_OF, OPTION_TELEMETRY  # noqa: E402

AXES: tuple[str, ...] = tuple(AXIS_KEYS)
Posterior = P.Posterior


def when(row: dict) -> float:
    """A row's moment, in seconds."""
    t = row.get("t") or row.get("created_at")
    if isinstance(t, (int, float)):
        return float(t) / (1000.0 if t > 1e11 else 1.0)
    return datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()


def event_of(row: dict, uid: str) -> dict:
    """The BehavioralEvent a behavioural row was, addressed to `uid`."""
    return {
        "actor_id": uid,
        "t": int(when(row) * 1000),
        "type": row.get("type") or "unknown",
        "channel": row.get("channel"),
        "cue": row.get("cue"),
        "action": row.get("action"),
        "polarity": row.get("polarity") or "take",
        "target": row.get("target_json") or {"id": "", "kind": "none"},
        "context": row.get("context_json") or {},
        "raw_signals": row.get("raw_signals_json") or {},
        "payload": row.get("payload_json") or {},
        "session_mode": row.get("session_mode") or "landing",
        "provenance": row.get("provenance") or "live",
    }


class Exact:
    """The engine's own endpoints, in this process."""

    def __init__(self) -> None:
        from fastapi.testclient import TestClient

        from echo_ml import app as engine_app

        self.app = engine_app
        self.client = TestClient(engine_app.app)
        self.headers = {"Authorization": f"Bearer {SETTINGS.ml_token}"}

    def replay(self, uid: str, rows: Iterable[dict], keep: Callable[[dict], bool] = lambda r: True) -> Posterior:
        """The echo `uid` would be after these rows, in time order, from nothing."""
        self.app.STORE.delete(uid)
        saved = self.app._clock
        try:
            for row in sorted(rows, key=when):
                if not keep(row):
                    continue
                t = when(row)
                self.app._clock = lambda t=t: t
                if row.get("kind") == "telemetry":
                    body = {"userId": uid, "event": {"type": row.get("type"), "payload": row.get("payload_json") or {}}}
                    r = self.client.post("/telemetry", headers=self.headers, json=body)
                else:
                    r = self.client.post("/observe/behavioral", headers=self.headers, json={"event": event_of(row, uid)})
                if r.status_code != 200:
                    raise RuntimeError(f"the engine refused a row ({r.status_code}): {r.text[:200]}")
        finally:
            self.app._clock = saved
        post = self.app.STORE.get(uid).posterior.copy()
        self.app.STORE.delete(uid)
        return post


# ── the fast path: the same library calls, for the simulation ──────────────────────────────────────


def prior() -> Posterior:
    return P.prior()


def fast_act(post: Posterior, event: dict, model=None) -> Posterior:
    """`/observe/behavioral`'s pooled update: what ingest.py reads, and nothing it does not (C73)."""
    return P.observe(post, "", ingest.event_to_observation(event)["telemetry"], model=model)


class WalkSession:
    """`/telemetry`'s walking windows as the engine weighs them (C74): 1/60 each, one measurement a session."""

    def __init__(self) -> None:
        self.at = -1e18
        self.windows = 0

    def weight(self, t: float) -> float:
        if t - self.at > HYPER.walk_session_gap_s:
            self.windows = 0
        self.at = t
        if self.windows >= HYPER.walk_windows_per_measurement:
            return 0.0
        self.windows += 1
        return 1.0 / HYPER.walk_windows_per_measurement


def fast_walk(post: Posterior, payload: dict, weight: float, model=None) -> Posterior:
    tele = {k: float(payload[k]) for k in ("novel_tile_ratio", "path_tortuosity") if isinstance(payload.get(k), (int, float))}
    if not tele or weight <= 0:
        return post
    return P.observe(post, "", tele, weight=weight, model=model)


def fast_replay(rows: Iterable[dict], uid: str = "fast", keep: Callable[[dict], bool] = lambda r: True, model=None) -> Posterior:
    """
    The echo after these rows, by the library: acts and walking windows (the pilot's two kinds of row).
    `model` is a measurement model other than the engine's (duck-typed as PersonaModel); None is the engine's.
    """
    post = P.prior()
    walk = WalkSession()
    for row in sorted(rows, key=when):
        if not keep(row):
            continue
        if row.get("kind") == "telemetry":
            if row.get("type") == "passive_locomotion":
                payload = row.get("payload_json") or {}
                tele = [k for k in ("novel_tile_ratio", "path_tortuosity") if isinstance(payload.get(k), (int, float))]
                if tele:
                    post = fast_walk(post, payload, walk.weight(when(row)), model)
            continue
        post = fast_act(post, event_of(row, uid), model)
    return post


# ── asking an echo what someone would do ───────────────────────────────────────────────────────────

_ZEROS = np.zeros(SETTINGS.embed_dim)


def _model(model=None):
    m = model if model is not None else get_persona_model()
    W, Psi = m.apply(np.zeros(P.FEATURE_DIM))
    return m, W, Psi


def choice_distribution(post: Posterior, paradigm: str, model=None) -> Optional[list[tuple[float, float]]]:
    """
    What this echo expects the person to choose: the posterior predictive of the one feature the
    paradigm is read through, φ_j ~ N(μφ_j + W_j·μ, Ψ_jj + W_j Σ W_jᵀ), evaluated at each option's own
    feature value and normalised over the options, as (coded value, probability). None where nothing
    reads the paradigm (trust, C75): the echo cannot say what it cannot hear.
    """
    feat = FEATURE_OF[paradigm]
    if feat is None:
        return None
    m, W, Psi = _model(model)
    j = P.feature_names().index(feat)
    mean = float(m.mu_phi[j] + W[j] @ post.mu)
    var = float(Psi[j, j] + W[j] @ post.Sigma @ W[j])
    logs, values = [], []
    for value, tel in OPTION_TELEMETRY[paradigm]:
        phi_j = float(P.featurize_raw("", tel, embedding=_ZEROS)[j])
        logs.append(-0.5 * (phi_j - mean) ** 2 / var)
        values.append(value)
    top = max(logs)
    weights = [math.exp(x - top) for x in logs]
    total = sum(weights)
    return [(v, w / total) for v, w in zip(values, weights)]


def expected_choice(post: Posterior, paradigm: str, model=None) -> Optional[float]:
    """The mean of `choice_distribution`: what the echo expects, as a coded value."""
    dist = choice_distribution(post, paradigm, model)
    return None if dist is None else sum(v * p for v, p in dist)


def act_noise_scale() -> float:
    """
    The multiplier the engine puts on an act's measurement noise. `observe` scales Ψ by
    `reliability_noise_scale(text, telemetry)`, a heuristic for short chat messages; an act has no words,
    so it is weighed as the shortest message there is (1 + het_noise_short/(1 + 0) = 7 today).
    """
    return float(P.reliability_noise_scale("", {}))


def ears() -> dict[str, dict]:
    """
    What the engine can hear of each paradigm today: the loadings of the feature its choice is read
    through, and how far one act narrows each axis from the prior (bits, 0.5·log2 of the variance
    ratio), with the act's noise as the engine weighs it (`act_noise_scale`). A paradigm whose feature W
    barely loads is one the echo is all but deaf to.
    """
    m, W, Psi = _model()
    Psi = Psi * act_noise_scale()
    names = P.feature_names()
    out: dict[str, dict] = {}
    for paradigm, feat in FEATURE_OF.items():
        if feat is None:
            out[paradigm] = {"feature": None, "loadings": {a: 0.0 for a in AXES}, "bits": {a: 0.0 for a in AXES}, "total_bits": 0.0}
            continue
        j = names.index(feat)
        w = W[j]
        sigma0 = np.eye(len(AXES)) * HYPER.prior_var
        s = float(w @ sigma0 @ w + Psi[j, j])
        k = sigma0 @ w / s
        sigma1 = sigma0 - np.outer(k, w @ sigma0)
        bits = {a: float(0.5 * math.log2(sigma0[i, i] / max(sigma1[i, i], 1e-12))) for i, a in enumerate(AXES)}
        out[paradigm] = {
            "feature": feat,
            "loadings": {a: float(w[i]) for i, a in enumerate(AXES)},
            "bits": bits,
            "total_bits": float(sum(bits.values())),
            "noise_sd": float(math.sqrt(Psi[j, j])),
        }
    return out
