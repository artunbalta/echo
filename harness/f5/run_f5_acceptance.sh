#!/usr/bin/env bash
# Boot the two services the F5 acceptance capture needs (ML + web pointed at it), run the capture
# against the real /flow5 client, then tear the servers down. Zero-key.
#
#   ECHO_WEB_PORT=3001 bash harness/f5/run_f5_acceptance.sh
#
# Lives outside services/ml because that tree is frozen except ingest.py. It does not touch the F1
# runner, drive, capture or gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TOKEN="${ML_SERVICE_TOKEN:-dev-ml-token-change-me}"
WEB_PORT="${ECHO_WEB_PORT:-3000}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
LOG="$(mktemp -d)"

echo "building shared…"; npm run build:shared >/dev/null 2>&1

echo "booting ML…"
( cd services/ml && ML_SERVICE_TOKEN="$TOKEN" ./.venv/bin/python -m uvicorn echo_ml.app:app \
    --host 127.0.0.1 --port 8000 --log-level warning ) >"$LOG/ml.log" 2>&1 &
ML_PID=$!

echo "booting web…"
( cd apps/web && ML_SERVICE_URL=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" \
    npx next dev -p "$WEB_PORT" ) >"$LOG/web.log" 2>&1 &
WEB_PID=$!

cleanup() { kill "$ML_PID" "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "waiting for services…"
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:8000/health" -H "authorization: Bearer $TOKEN" >/dev/null 2>&1 \
    && curl -sf -o /dev/null "http://localhost:$WEB_PORT/flow5" && break
  sleep 1
done

echo "running F5 acceptance capture…"
WEB=http://localhost:$WEB_PORT ML=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" \
  services/ml/.venv/bin/python harness/f5/f5_capture.py
