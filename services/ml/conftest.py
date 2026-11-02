# Presence of this file puts services/ml on sys.path so `import echo_ml` resolves.

# The suite drives the real `_auth`, which now REFUSES when ML_SERVICE_TOKEN is unset (503
# ml_token_unconfigured) rather than falling back to a literal committed in this repository. Tests
# are a launcher like any other, so the dev credential comes from the one place the launchers share.
import _devlauncher  # noqa: F401  (imported for its side effect: the setdefault)
