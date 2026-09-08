#!/usr/bin/env bash
# Boot the services the F4 acceptance capture needs, run the capture, then tear them down. Zero-key.
#
#   ECHO_WEB_PORT=3001 bash harness/f4/run_f4_acceptance.sh
#
# Four services, and one of them is new this round:
#
#   ML (8000)        the real persona service; every posterior read comes from here
#   proxy (8010)     a RECORDING pass-through in front of ML. The realtime server posts to it
#                    instead of straight to ML, so the harness sees the actual per-actor events the
#                    server emitted rather than inferring emission from a posterior that moved.
#                    Every request is relayed verbatim; it is not a parallel measurement path.
#   realtime (2567)  the authoritative room, so the siloing check drives a REAL two-player
#                    interaction rather than hand-rolled envelopes. Render is suspended, so local.
#   web (WEB_PORT)   the client the beats are driven through.
#
# The web server is booted TWICE, in sequence, never at once (two `next dev` in one project fight
# over .next):
#
#   pass 1  WITHOUT ECHO_TEST_CLOCK — proves the injected clock is inert without the server-side
#           opt-in, which is what makes the hook unreachable from a production client.
#   pass 2  WITH ECHO_TEST_CLOCK=1 — the harness clock, used for the cross-session decay check.
#
# Lives outside services/ml because that tree is frozen except ingest.py. It does not touch the F1
# or F5 runners, drives, captures or gates.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TOKEN="${ML_SERVICE_TOKEN:-dev-ml-token-change-me}"
WEB_PORT="${ECHO_WEB_PORT:-3001}"
PROXY_PORT="${F4_PROXY_PORT:-8010}"
RT_PORT="${F4_RT_PORT:-2567}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
export F4_PROXY_LOG="${F4_PROXY_LOG:-/tmp/f4_observe.jsonl}"
export F4_GATE_RESULT="${F4_GATE_RESULT:-/tmp/f4_gate.json}"
LOG="$(mktemp -d)"
PY="$ROOT/services/ml/.venv/bin/python"

echo "building shared…"; npm run build:shared >/dev/null 2>&1

echo "booting ML…"
( cd services/ml && ML_SERVICE_TOKEN="$TOKEN" ./.venv/bin/python -m uvicorn echo_ml.app:app \
    --host 127.0.0.1 --port 8000 --log-level warning ) >"$LOG/ml.log" 2>&1 &
ML_PID=$!

echo "booting the recording proxy…"
( ML=http://127.0.0.1:8000 PROXY_PORT="$PROXY_PORT" "$PY" harness/f4/observe_proxy.py ) \
  >"$LOG/proxy.log" 2>&1 &
PROXY_PID=$!

echo "booting realtime (pointed at the proxy)…"
( cd apps/realtime && REALTIME_PORT="$RT_PORT" \
    ML_SERVICE_URL="http://127.0.0.1:$PROXY_PORT" ML_SERVICE_TOKEN="$TOKEN" \
    npx tsx src/index.ts ) >"$LOG/rt.log" 2>&1 &
RT_PID=$!

# Resolve the PORT to a PID and kill that. Never a name pattern: a name pattern once killed an
# unrelated dev server belonging to another project on this machine.
kill_port() {
  local p="$1" pids
  pids="$(lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  for _ in $(seq 1 30); do
    lsof -nP -tiTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  pids="$(lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  return 0
}

WEB_PID=""
cleanup() {
  # Backgrounding a subshell makes $! the SUBSHELL's pid, so killing it can leave the real server
  # holding the port — which silently made the second web boot land on a different port and read as
  # "the clock hook is shut". Kill by resolved port instead.
  kill_port "$WEB_PORT"
  kill "$ML_PID" "$PROXY_PID" "$RT_PID" 2>/dev/null || true
  kill_port 8000; kill_port "$PROXY_PORT"; kill_port "$RT_PORT"
}
trap cleanup EXIT

wait_web() {
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "http://localhost:$WEB_PORT/play" && return 0
    sleep 1
  done
  echo "web never came up; see $LOG/web.log"; tail -40 "$LOG/web.log"; return 1
}

echo "waiting for ML + realtime…"
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:8000/health" -H "authorization: Bearer $TOKEN" >/dev/null 2>&1 \
    && curl -sf -o /dev/null "http://127.0.0.1:$RT_PORT/health" && break
  sleep 1
done

# ── pass 1: the gate CLOSED (no ECHO_TEST_CLOCK) ──
echo "booting web WITHOUT the clock flag (closed-gate pass)…"
( cd apps/web && ML_SERVICE_URL="http://127.0.0.1:8000" ML_SERVICE_TOKEN="$TOKEN" \
    npx next dev -p "$WEB_PORT" ) >"$LOG/web.log" 2>&1 &
WEB_PID=$!
wait_web
WEB=http://localhost:$WEB_PORT "$PY" harness/f4/f4_capture.py --gate-only || true
kill_port "$WEB_PORT"
WEB_PID=""
sleep 2

# ── pass 2: the real run, with the clock hook open ──
echo "booting web WITH ECHO_TEST_CLOCK=1…"
( cd apps/web && ECHO_TEST_CLOCK=1 ML_SERVICE_URL="http://127.0.0.1:8000" ML_SERVICE_TOKEN="$TOKEN" \
    npx next dev -p "$WEB_PORT" ) >"$LOG/web.log" 2>&1 &
WEB_PID=$!
wait_web

echo "running F4 acceptance capture…"
WEB=http://localhost:$WEB_PORT ML=http://127.0.0.1:8000 RT_WS="ws://127.0.0.1:$RT_PORT" \
  ML_SERVICE_TOKEN="$TOKEN" "$PY" harness/f4/f4_capture.py
