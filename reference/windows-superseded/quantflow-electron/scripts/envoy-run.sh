#!/usr/bin/env bash
# Envoy lifecycle wrapper for legend spawns (WSL). Posts start/complete/fail to one canvas space.
set -euo pipefail

PROFILE="${ENVOY_PROFILE:?missing ENVOY_PROFILE}"
SPACE="${ENVOY_SPACE:?missing ENVOY_SPACE}"

if [ "$#" -eq 0 ]; then
  echo "usage: envoy-run.sh <command> [args...]" >&2
  exit 2
fi

COMMAND="$*"

send_msg() {
  envoy --profile "$PROFILE" --json send --space "$SPACE" --stdin <<<"$1"
}

send_msg "Started: $COMMAND"

set +e
OUTPUT="$("$@" 2>&1)"
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  send_msg "Completed successfully: $COMMAND

Output:
$OUTPUT"
else
  send_msg "Failed: $COMMAND

Exit code: $STATUS

Output:
$OUTPUT"
fi

exit "$STATUS"
