#!/usr/bin/env bash
#
# KOVAI — one-command install for macOS and Linux.
#
#   ./install.sh
#
# Checks for Node, installs dependencies, walks you through your API keys, and
# offers to start the workspace. Safe to run again at any point; nothing here
# overwrites a key you have already set.
#
set -euo pipefail

cd "$(dirname "$0")"

bold=$'\033[1m'; dim=$'\033[2m'; green=$'\033[32m'; red=$'\033[31m'; off=$'\033[0m'
say() { printf '%s\n' "$*"; }

say ""
say "${bold}KOVAI${off} ${dim}— the creative intelligence workspace${off}"
say ""

# ── Node ────────────────────────────────────────────────────
# Everything else depends on this, so it is checked first and the failure
# explains itself rather than surfacing later as a syntax error.
if ! command -v node > /dev/null 2>&1; then
  say "${red}●${off} Node.js is not installed."
  say ""
  say "  Install it, then run this script again:"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    say "    ${bold}brew install node${off}       ${dim}(or https://nodejs.org)${off}"
  else
    say "    ${bold}https://nodejs.org${off}      ${dim}(version 20 or newer)${off}"
  fi
  say ""
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  say "${red}●${off} Node $(node -v) is too old — KOVAI needs 20 or newer."
  say "  ${dim}nvm install 20 && nvm use 20${off}"
  say ""
  exit 1
fi

# ── Setup ───────────────────────────────────────────────────
# The real work lives in one Node script so macOS, Linux and Windows all run
# the same logic rather than three copies that drift apart.
node scripts/setup.mjs "$@"

# ── Start ───────────────────────────────────────────────────
if [[ -t 0 && "${*:-}" != *--yes* ]]; then
  printf '%s' "Start KOVAI now? [Y/n] "
  read -r reply
  case "${reply:-y}" in
    [nN]*) say ""; say "  When you are ready: ${bold}npm run dev${off}"; say "" ;;
    *)     say ""; exec npm run dev ;;
  esac
else
  say "  Start it with: ${bold}npm run dev${off}"
  say ""
fi
