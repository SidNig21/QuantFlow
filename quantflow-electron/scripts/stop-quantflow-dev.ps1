# stop-quantflow-dev.ps1
#
# Stops QuantFlow-scoped Electron processes (main app + PTY sidecar) before
# running bun install or any step that rebuilds native modules.
#
# Scope guarantee: only processes whose executable path starts with this
# repo's quantflow-electron directory are stopped.  Cursor, VS Code,
# Discord, Slack, and any other Electron apps outside this repo are
# NEVER touched.
#
# Typical use before dependency repair:
#   powershell -ExecutionPolicy Bypass -File scripts\stop-quantflow-dev.ps1
#   bun install
#
# For a non-destructive check first:
#   powershell -ExecutionPolicy Bypass -File scripts\check-native-locks.ps1

$ErrorActionPreference = "SilentlyContinue"

function Normalize-Path {
  param([string]$P)
  if ($null -eq $P) { return $null }
  if ($P.StartsWith("\\?\UNC\")) { return "\\" + $P.Substring("\\?\UNC\".Length) }
  if ($P.StartsWith("\\?\")) { return $P.Substring("\\?\".Length) }
  return $P
}

$scriptRoot = Normalize-Path $PSScriptRoot
$repoRoot = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine($scriptRoot, "..")
)
$scopeDir = $repoRoot + [System.IO.Path]::DirectorySeparatorChar

Write-Host "Stopping QuantFlow-scoped Electron processes"
Write-Host "Scope: $scopeDir"
Write-Host ""

$processes = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" |
  Where-Object {
    $path = Normalize-Path $_.ExecutablePath
    $path -and $path.StartsWith($scopeDir, [System.StringComparison]::OrdinalIgnoreCase)
  }

if (-not $processes) {
  Write-Host "[OK] No QuantFlow-scoped Electron processes found."
  Write-Host "     Safe to run: bun install"
  exit 0
}

$stopped = 0
$failed  = 0

foreach ($proc in $processes) {
  $isSidecar = $proc.CommandLine -like "*pty-sidecar.js*"
  $label = if ($isSidecar) { "sidecar" } else { "main" }
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "  Stopped PID $($proc.ProcessId) [$label]"
    $stopped++
  } catch {
    Write-Host "  [WARN] Could not stop PID $($proc.ProcessId) [$label]: $_"
    $failed++
  }
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "[WARN] $failed process(es) could not be stopped."
  Write-Host "       Close the QuantFlow app manually, then rerun this script."
  exit 1
}

Write-Host "[OK] Stopped $stopped process(es)."
Write-Host ""
Write-Host "Wait a moment for file handles to release before running:"
Write-Host "  bun install"
Write-Host ""
Write-Host "If bun install still fails with EPERM unlink ...conpty.node:"
Write-Host "  1. Check Task Manager for any remaining 'electron.exe' under:"
Write-Host "     $scopeDir"
Write-Host "  2. End those processes manually."
Write-Host "  3. Run: bun install"
exit 0
