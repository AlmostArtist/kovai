#!/usr/bin/env bash
# Double-click this file in Finder to start KOVAI.
#
# It sets itself up on first run, so this is the only thing a new copy needs:
# no terminal, no commands, no order to get right.
cd "$(dirname "$0")/.."

if [ ! -d node_modules/next ] || [ ! -f .env.local ]; then
  node scripts/setup.mjs --yes || { echo; echo "Setup failed. Press any key to close."; read -r -n 1; exit 1; }
fi

exec npm run dev
