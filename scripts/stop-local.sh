#!/usr/bin/env bash
# Stops a local runtime that KOVAI started.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.kovai/runtime.pid"
PORT="${KOVAI_RUNTIME_PORT:-8756}"

# Release the loaded model first, so stopping the runtime does not leave a
# llama-server holding gigabytes of weights behind it.
curl -fsS --max-time 15 -X POST "http://127.0.0.1:${PORT}/models/unload" > /dev/null 2>&1 || true

if [ ! -f "$PID_FILE" ]; then
  echo "[kovai] No runtime was started by KOVAI."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill "$PID" 2>/dev/null; then
  echo "[kovai] Local runtime stopped."
else
  echo "[kovai] That runtime is no longer running."
fi
rm -f "$PID_FILE"
