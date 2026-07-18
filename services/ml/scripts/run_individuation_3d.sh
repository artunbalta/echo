#!/usr/bin/env bash
# Boot the two services the 3D individuation capture needs (ML + web, pointed at ML), run the
# Playwright capture against the real /flow1 client, then tear the servers down. Zero-key.
#
#   services/ml/scripts/run_individuation_3d.sh
#
# The capture drives the real 3D client through a thorough and a hasty performance of Flow 1,
# captures the real /observe/behavioral events off the network, and measures ‖μ_tessa − μ_hank‖.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

TOKEN="${ML_SERVICE_TOKEN:-dev-ml-token-change-me}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
LOG="$(mktemp -d)"

echo "building shared…"; npm run build:shared >/dev/null 2>&1

echo "booting ML…"
( cd services/ml && ML_SERVICE_TOKEN="$TOKEN" ./.venv/bin/python -m uvicorn echo_ml.app:app \
    --host 127.0.0.1 --port 8000 --log-level warning ) >"$LOG/ml.log" 2>&1 &
ML_PID=$!

echo "booting web…"
ML_SERVICE_URL=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" npm run dev:web >"$LOG/web.log" 2>&1 &
WEB_PID=$!

cleanup() { kill "$ML_PID" "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "waiting for services…"
for i in $(seq 1 40); do
  curl -sf "http://127.0.0.1:8000/health" -H "authorization: Bearer $TOKEN" >/dev/null 2>&1 \
    && curl -sf -o /dev/null "http://localhost:3000/flow1" && break
  sleep 1
done

echo "running capture…"
WEB=http://localhost:3000 ML=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" \
  services/ml/.venv/bin/python services/ml/scripts/individuation_3d_capture.py
