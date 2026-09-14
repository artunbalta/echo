"""The ML service's one gate, tested at the edge that decides whether it is worth having.

WHAT THIS EXISTS TO CATCH. `config.py` used to default `ml_token` to the literal
"dev-ml-token-change-me", which is also committed at `.env.example:21`. `render.yaml:37` marks
ML_SERVICE_TOKEN `sync: false`, so an operator who skipped the dashboard prompt got a service that
came up HEALTHY and accepted a token anyone could read out of this repository. Behind that one
token: `GET /persona/{uid}` returns a person's posterior and `DELETE /user/{uid}` hard-deletes it —
the same two capabilities `⚑27` closed at the Next.js boundary, one layer down. Nothing in this
suite covered `_auth` at all before this file: 186 tests, zero assertions about the gate.

THE TRAP, AND WHY IT IS THE MOST IMPORTANT TEST HERE. The obvious half of the fix is "stop
defaulting to a published literal". Done alone, with `_auth`'s original `token != SETTINGS.ml_token`,
that makes the service accept EVERYONE: a request with no Authorization header produces token "",
the expected value is "", and `"" != ""` is false. MEASURED before the fix landed — no-header
`GET /persona/{uid}` answered 200 and no-header `DELETE /user/{uid}` answered 200 `{"deleted": true}`.
`test_unconfigured_refuses_everything` is the assertion that fails if anyone reintroduces that
shape, and it is the reason the empty branch exists rather than the empty default.

HOW THESE VARY THE TOKEN. `Settings` is `@dataclass(frozen=True)`, so its fields cannot be assigned
— `monkeypatch.setattr(SETTINGS, ...)` raises `FrozenInstanceError`. What works, and is the reason
these tests can drive the REAL handler rather than a copy of its branch, is that `_auth` reads the
module-level name `SETTINGS` per call instead of capturing `ml_token` at import: `dataclasses.replace`
makes a new frozen instance and `monkeypatch.setattr(app_module, "SETTINGS", ...)` swaps it in. Keep
`_auth` reading it per call, or this file starts needing `importlib.reload`.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from echo_ml import app as app_module
from echo_ml.app import app
from echo_ml.config import SETTINGS

# Committed in this repository, at `.env.example:21` and `services/ml/_devlauncher.py`. That is the
# whole point: it is not a secret and must never be what a deployment falls back to.
PUBLISHED_DEV_TOKEN = "dev-ml-token-change-me"
REAL_TOKEN = "a-real-operator-secret-9f3c"

# The two that make this a security gate rather than a hygiene one, plus one write.
GUARDED = [
    ("get", "/persona/somebody-elses-uid", None),
    ("delete", "/user/somebody-elses-uid", None),
    ("get", "/metrics", None),
]


def _with_token(monkeypatch, token: str) -> None:
    """Swap the whole frozen Settings, because its fields cannot be assigned."""
    monkeypatch.setattr(app_module, "SETTINGS", replace(SETTINGS, ml_token=token))


def _call(client: TestClient, verb: str, path: str, body, headers: dict[str, str] | None = None):
    return getattr(client, verb)(path, headers=headers or {}) if body is None else getattr(client, verb)(path, json=body, headers=headers or {})


def test_unconfigured_refuses_everything_including_a_bare_bearer(monkeypatch):
    """An unset token is a REFUSAL, not an open door — and the empty-string caller is the trap."""
    _with_token(monkeypatch, "")
    client = TestClient(app)

    for verb, path, body in GUARDED:
        for label, headers in [
            ("no header at all", {}),
            ("a bare `Bearer `", {"Authorization": "Bearer "}),
            ("an empty header", {"Authorization": ""}),
            ("the published dev token", {"Authorization": f"Bearer {PUBLISHED_DEV_TOKEN}"}),
        ]:
            res = _call(client, verb, path, body, headers)
            assert res.status_code == 503, f"{verb.upper()} {path} with {label} was not refused"
            assert res.json()["detail"] == "ml_token_unconfigured"


def test_health_still_answers_when_unconfigured(monkeypatch):
    """`/health` is how Render decides whether to route traffic, so it is deliberately not gated.

    It reports liveness only — that a fail-closed service still answers 200 here is the reason
    `render.yaml`'s own warning about `ECHO_IDENTITY_SECRET` ("absent → every join is refused,
    deliberately rather than silently") applies to this service too, and is recorded as open work
    rather than fixed here: a readiness check belongs in the same pass that gives echo-realtime one.
    """
    _with_token(monkeypatch, "")
    assert TestClient(app).get("/health").status_code == 200


def test_the_published_dev_token_is_not_a_key_to_a_configured_deployment(monkeypatch):
    _with_token(monkeypatch, REAL_TOKEN)
    client = TestClient(app)

    for verb, path, body in GUARDED:
        res = _call(client, verb, path, body, {"Authorization": f"Bearer {PUBLISHED_DEV_TOKEN}"})
        assert res.status_code == 401, f"{verb.upper()} {path} accepted the published dev token"
        assert res.json()["detail"] == "bad ML token"


def test_the_real_token_still_works_so_the_gate_is_not_just_a_wall(monkeypatch):
    """The legitimate caller is not the casualty — the shape every guard in this repo has to pass."""
    _with_token(monkeypatch, REAL_TOKEN)
    client = TestClient(app)

    res = client.get("/persona/a-user-who-has-done-nothing", headers={"Authorization": f"Bearer {REAL_TOKEN}"})
    assert res.status_code == 200
    # Measured on this tree rather than assumed: the posterior read answers with `persona`, `var`
    # and the uid it was asked about. Asserting a key that is not there would make this test red for
    # a reason that has nothing to do with the gate.
    body = res.json()
    assert body["userId"] == "a-user-who-has-done-nothing"
    assert "persona" in body and "var" in body


@pytest.mark.parametrize("presented", ["", "  ", "wrong", REAL_TOKEN + "x", REAL_TOKEN[:-1]])
def test_a_configured_deployment_refuses_everything_but_the_token(monkeypatch, presented):
    _with_token(monkeypatch, REAL_TOKEN)
    res = TestClient(app).get("/persona/x", headers={"Authorization": f"Bearer {presented}"})
    assert res.status_code == 401


def test_the_DEFAULT_is_empty_and_not_a_literal_anyone_can_read(monkeypatch):
    """The other half, and the one the tests above cannot see.

    Everything above monkeypatches `SETTINGS`, so it exercises `_auth` and never reaches
    `config.py`'s fallback. MEASURED: restoring `os.getenv("ML_SERVICE_TOKEN", "dev-ml-token-change-me")`
    leaves all of them green — a gate that does not catch the original defect, which is the shape
    `⚑27`'s `ownership.test.ts` had for months. This is the assertion that does.

    `Settings` evaluates its field defaults when the class body runs, so the only way to observe the
    fallback is to re-import the module with the variable unset. That is why this test reloads
    rather than instantiating.
    """
    import importlib

    import echo_ml.config as config_module

    monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    try:
        reloaded = importlib.reload(config_module)
        assert reloaded.SETTINGS.ml_token == "", (
            "config.py fell back to a literal instead of refusing; the service must never invent a "
            "credential — the dev token belongs in the launchers (_devlauncher.py, run.sh)."
        )
    finally:
        # Leave the module as the rest of the session found it, token and all.
        monkeypatch.undo()
        importlib.reload(config_module)
