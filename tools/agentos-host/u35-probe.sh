#!/usr/bin/env bash
set -eu
BASE="${1:-http://127.0.0.1:7430}"
PROMPT="${2:-Reply with exactly: eve-u35-live-ok}"

echo "=== U3.5 Eve checkpoint ==="
echo "health: $(curl -s --max-time 5 "$BASE/health")"

t0=$(date +%s%3N)
session_json=$(curl -s --max-time 180 -X POST "$BASE/session" \
  -H 'Content-Type: application/json' \
  -d '{"software":"eve","workspaceId":"u35-verify","tileId":"eve-checkpoint-tile"}')
t1=$(date +%s%3N)
echo "session: $session_json"

session_id=$(printf '%s' "$session_json" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')
if [ -z "$session_id" ]; then
  echo "FAIL: no sessionId in response"
  exit 1
fi

reply_json=$(curl -s --max-time 300 -X POST "$BASE/session/$session_id/prompt" \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"$PROMPT\"}")
t2=$(date +%s%3N)
echo "reply: $reply_json"

reply_text=$(printf '%s' "$reply_json" | sed -n 's/.*"text":"\([^"]*\)".*/\1/p')
cold_boot_ms=$((t1 - t0))
prompt_ms=$((t2 - t1))
echo "cold_boot_ms=$cold_boot_ms"
echo "prompt_ms=$prompt_ms"

if printf '%s' "$reply_json" | grep -q 'eve-u35-live-ok'; then
  echo "U3.5 PASS"
  exit 0
fi

if printf '%s' "$reply_text" | grep -q 'eve-u35-live-ok'; then
  echo "U3.5 PASS"
  exit 0
fi

echo "U3.5 FAIL: expected substring eve-u35-live-ok"
exit 1
