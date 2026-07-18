#!/usr/bin/env bash
# Boot the three services (ML + realtime + web) and measure the REAL client-vs-server drift in the
# 3D /play client — the invariant "drift 0.0000" never actually measured. Zero-key.
#
#   services/ml/scripts/run_drift_3d.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
TOKEN="${ML_SERVICE_TOKEN:-dev-ml-token-change-me}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
LOG="$(mktemp -d)"

npm run build:shared >/dev/null 2>&1
( cd services/ml && ML_SERVICE_TOKEN="$TOKEN" ./.venv/bin/python -m uvicorn echo_ml.app:app --host 127.0.0.1 --port 8000 --log-level warning ) >"$LOG/ml.log" 2>&1 &
ML_PID=$!
ML_SERVICE_URL=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" npm run dev:realtime >"$LOG/rt.log" 2>&1 &
RT_PID=$!
ML_SERVICE_URL=http://127.0.0.1:8000 ML_SERVICE_TOKEN="$TOKEN" npm run dev:web >"$LOG/web.log" 2>&1 &
WEB_PID=$!
cleanup() { kill "$ML_PID" "$RT_PID" "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 40); do
  curl -sf "http://127.0.0.1:8000/health" -H "authorization: Bearer $TOKEN" >/dev/null 2>&1 \
    && curl -sf -o /dev/null "http://localhost:3000/play" && sleep 3 && break
  sleep 1
done

WEB=http://localhost:3000 services/ml/.venv/bin/python services/ml/scripts/measure_drift_3d.py
