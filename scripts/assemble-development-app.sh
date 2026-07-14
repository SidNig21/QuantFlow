#!/bin/zsh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="${1:-$root/.build/QuantFlow.app}"

cd "$root"
swift build -c release --product QuantFlow

mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$root/.build/release/QuantFlow" "$app/Contents/MacOS/QuantFlow"
cp "$root/Packaging/QuantFlow-Info.plist" "$app/Contents/Info.plist"

cat <<EOF
Development app assembled at:
  $app

To run with the native sidecar during development:
  export QUANTFLOW_RUNTIME_ROOT="$root/tools/agentos-host-mac"
  export OPENCODE_GO_API_KEY="..."
  "$app/Contents/MacOS/QuantFlow"

This bundle is unsigned and intentionally does not embed Node or credentials.
EOF
