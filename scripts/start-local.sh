#!/usr/bin/env bash
#
# Starts the KOVAI local runtime (FastAPI) and, unless KOVAI_RUNTIME_ONLY is set,
# the web interface alongside it.
#
#   ./scripts/start-local.sh               # runtime + interface
#   KOVAI_RUNTIME_ONLY=1 ./start-local.sh  # runtime only (used by the app's
#                                          # "Start local runtime" button)
#
# When the app starts this itself the process is detached and has no terminal,
# so everything printed here is captured to .kovai/runtime.log and read back by
# the interface. Failures therefore have to be *said*, not just exited on.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${KOVAI_RUNTIME_PORT:-8756}"
VENV="$ROOT/runtime/.venv"

say()  { printf '\033[2m[kovai]\033[0m %s\n' "$1"; }
# The interface watches for this prefix, so a failure surfaces as a message
# rather than as a start that never finishes.
fail() { printf '[kovai] FAILED: %s\n' "$1" >&2; exit 1; }

trap 'fail "start-local.sh stopped unexpectedly at line $LINENO."' ERR

# Already up? Starting a second one would only collide on the port.
if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
  say "Local runtime already running on :${PORT}"
else
  # Anything else holding the port will make uvicorn exit with a message the
  # user cannot see, so check for it directly.
  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN > /dev/null 2>&1; then
    fail "Port ${PORT} is already in use by another process. Stop it, or set KOVAI_RUNTIME_PORT to a free port."
  fi

  PYTHON="$(command -v python3 || command -v python || true)"
  [ -n "$PYTHON" ] || fail "Python 3.10 or newer is required but was not found on PATH."

  # The runtime uses modern typing syntax; an old interpreter fails at import
  # with a traceback that means nothing to most people.
  "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
    || fail "Python 3.10 or newer is required (found $("$PYTHON" -V 2>&1))."

  if [ ! -d "$VENV" ]; then
    say "Creating the runtime virtual environment (first run only)…"
    "$PYTHON" -m venv "$VENV" || fail "Could not create a virtual environment at runtime/.venv."
  fi

  # shellcheck disable=SC1091
  source "$VENV/bin/activate" || fail "Could not activate runtime/.venv. Delete it and try again."

  say "Installing runtime dependencies (first run can take a few minutes)…"
  pip install --quiet --upgrade pip \
    || say "Could not upgrade pip; continuing with the version already installed."
  pip install --quiet -r runtime/requirements.txt \
    || fail "Installing Python dependencies failed. Check your network, then retry."

  say "Starting the local runtime on http://127.0.0.1:${PORT}"
  cd "$ROOT/runtime"
  KOVAI_RUNTIME_PORT="$PORT" python main.py &
  RUNTIME_PID=$!
  cd "$ROOT"

  mkdir -p "$ROOT/.kovai"
  echo "$RUNTIME_PID" > "$ROOT/.kovai/runtime.pid"

  # Confirm it actually answers before claiming success.
  READY=0
  for _ in $(seq 1 60); do
    sleep 0.5
    if ! kill -0 "$RUNTIME_PID" 2>/dev/null; then
      fail "The runtime process exited during startup. See the output above."
    fi
    if curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
      READY=1
      say "Local runtime ready"
      break
    fi
  done
  [ "$READY" = "1" ] || fail "The runtime started but did not answer on :${PORT} within 30 seconds."

  trap 'kill "$RUNTIME_PID" 2>/dev/null || true' EXIT
fi

if [ "${KOVAI_RUNTIME_ONLY:-0}" = "1" ]; then
  # Started by the interface: hold the runtime in the foreground of this
  # detached process and stay out of the way.
  wait
  exit 0
fi

if [ ! -d "$ROOT/node_modules" ]; then
  say "Installing interface dependencies…"
  npm install || fail "npm install failed."
fi

say "Starting KOVAI on http://localhost:3000"
# The runtime is already up here, so start the interface alone rather than
# re-entering the orchestrator in scripts/dev.mjs.
npm run dev:web
