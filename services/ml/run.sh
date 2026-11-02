#!/usr/bin/env bash
# Boot the ECHO ML service. Creates a venv on first run.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[ml] creating venv…"
  python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
fi

# Load repo root .env if present.
if [ -f ../../.env ]; then set -a; . ../../.env; set +a; fi

# THE DEV CREDENTIAL LIVES HERE, not in the service. `config.py`'s `ml_token` defaults to "" and
# `_auth` refuses when it is empty, so a deployment that does not run this script — Render's
# Dockerfile CMD is uvicorn directly — fails closed with nothing to configure. A local checkout
# still runs with no keys, which is the property C39 kept for the web tier's dev key. This is the
# same line harness/f4/run_f4_acceptance.sh:30 and three sibling scripts already carry.
export ML_SERVICE_TOKEN="${ML_SERVICE_TOKEN:-dev-ml-token-change-me}"

PORT="${ML_PORT:-8000}"
exec ./.venv/bin/uvicorn echo_ml.app:app --host 0.0.0.0 --port "$PORT" --reload
