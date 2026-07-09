#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: bash bootstrap.sh <agent> <cloud> [--model <id>] [--region <id>] [--size <id>]"
  exit 1
fi

if command -v spawn >/dev/null 2>&1; then
  exec spawn "$@"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes @phaseo/spawn@latest "$@"
fi

echo "Could not find spawn CLI or npx on PATH."
echo "Install Node.js 20+ and rerun, or install spawn globally."
exit 1
