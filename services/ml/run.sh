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

PORT="${ML_PORT:-8000}"
exec ./.venv/bin/uvicorn echo_ml.app:app --host 0.0.0.0 --port "$PORT" --reload
