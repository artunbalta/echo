"""The durable store's gate, and the loaded default it replaced (known-gaps ⚑24, SOC-2.D).

`config.py` used to read the REPO-WIDE `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`,
and nothing read those settings, so the gun never fired. It was loaded: `services/ml/run.sh` sources
the gitignored repo-root `.env` into this service's environment, and on a developer machine that
file holds a URL byte-identical to production plus a live service-role key that bypasses RLS. The
first line of SOC-2.D to read `SETTINGS.supabase_*` would have made `npm run dev:ml` write personas
into the production database — into a real person's row, because `identity.ts` honours `?u=<id>`.

WHAT THIS FILE PINS, and the second one is the half that keeps being re-invented:

  1. The ML service reads ML-OWNED names. Having the repo-wide pair in the environment — exactly
     what `run.sh` guarantees — must leave this service with nothing.
  2. CREDENTIALS ALONE ARE NOT ENOUGH. `ECHO_ML_PERSIST=1` is required as well, because a key
     pasted into a shell to run one script would otherwise arm every write for the life of that
     shell. Durability is a deliberate act per environment, not a side effect of having a `.env`.

And `persist_enabled` is the ONE gate: no durable path may read `supabase_url`/`supabase_key`
directly, or a later author who only needed a URL routes around all of this.

Run:  cd services/ml && python3 -m pytest tests/test_persistence_gate.py
"""
import importlib

import pytest


def settings_under(env, monkeypatch):
    """Re-import config with a chosen environment. Settings reads os.getenv at class-definition."""
    for key in (
        "ECHO_ML_SUPABASE_URL",
        "ECHO_ML_SUPABASE_SERVICE_KEY",
        "ECHO_ML_PERSIST",
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import echo_ml.config as config

    return importlib.reload(config).SETTINGS


PROD_LOOKALIKE = {
    # Exactly what run.sh puts in the environment from the repo-root .env.
    "NEXT_PUBLIC_SUPABASE_URL": "https://ibinblpqcbrgbndeqtsc.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "eyJ" + "x" * 216,
}
ML_KEYS = {
    "ECHO_ML_SUPABASE_URL": "https://local.example.supabase.co",
    "ECHO_ML_SUPABASE_SERVICE_KEY": "local-key",
}


def test_the_repo_wide_env_does_not_reach_this_service(monkeypatch):
    """⚑24 itself. run.sh guarantees these are present; the ML service must see none of them."""
    s = settings_under(PROD_LOOKALIKE, monkeypatch)
    assert s.supabase_url == "", "the shared .env reached the ML service — ⚑24 is back"
    assert s.supabase_key == ""
    assert s.persist_enabled is False


def test_credentials_alone_do_not_arm_it(monkeypatch):
    s = settings_under(ML_KEYS, monkeypatch)
    assert s.supabase_url and s.supabase_key, "the ML-owned names should be read"
    assert s.persist is False
    assert s.persist_enabled is False, "keys without ECHO_ML_PERSIST=1 must not enable writes"


def test_the_opt_in_alone_does_not_arm_it_either(monkeypatch):
    s = settings_under({"ECHO_ML_PERSIST": "1"}, monkeypatch)
    assert s.persist is True
    assert s.persist_enabled is False, "an opt-in with no credentials must not claim to be enabled"


def test_all_three_together_arm_it_and_nothing_less_does(monkeypatch):
    s = settings_under({**ML_KEYS, "ECHO_ML_PERSIST": "1"}, monkeypatch)
    assert s.persist_enabled is True

    # Every strict subset stays off. This is the assertion that survives someone "simplifying" the
    # gate to `bool(url and key)` — which is exactly the shape ⚑24 was.
    for drop in ("ECHO_ML_SUPABASE_URL", "ECHO_ML_SUPABASE_SERVICE_KEY", "ECHO_ML_PERSIST"):
        partial = {**ML_KEYS, "ECHO_ML_PERSIST": "1"}
        del partial[drop]
        assert settings_under(partial, monkeypatch).persist_enabled is False, f"armed without {drop}"


@pytest.mark.parametrize("value", ["", "0", "true", "TRUE", "yes", "1 ", "on"])
def test_only_the_literal_1_opts_in(monkeypatch, value):
    """A truthy-string check would make ECHO_ML_PERSIST=0 mean yes. It is one exact value."""
    s = settings_under({**ML_KEYS, "ECHO_ML_PERSIST": value}, monkeypatch)
    assert s.persist_enabled is False, f"{value!r} armed the durable store"


def test_nothing_is_armed_today_because_nothing_writes_yet(monkeypatch):
    # SOC-2.D is not built. Until it is, the honest default for every environment is off, and
    # render.yaml ships ECHO_ML_PERSIST="0" to say so out loud rather than by omission.
    assert settings_under({}, monkeypatch).persist_enabled is False
