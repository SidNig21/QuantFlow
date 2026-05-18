# check-native-locks.ps1
#
# Checks whether any QuantFlow-scoped Electron processes are running that
# may hold node-pty\build\Release\conpty.node locked.  If such processes
# exist, bun install (specifically the postinstall electron-rebuild step)
# will fail with:
#
#   EPERM: operation not permitted, unlink '...conpty.node'
#
# Run this script BEFORE bun install, npm install, or any step that
# rebuilds native modules.
#
# Scope guarantee: only processes whose executable path starts with this
# repo's quantflow-electron directory are detected.  Cursor, VS Code,
# Discord, Slack, and any other Electron apps outside this repo are
# NEVER touched.
#
# To stop detected processes, run:
#   powershell -ExecutionPolicy Bypass -File scripts\stop-quantflow-dev.ps1

param(
  [switch]$Fix  # If set, stop detected processes automatically
)

$ErrorActionPreference = "Stop"

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
# The scope boundary: only processes under this directory are considered.
$scopeDir = $repoRoot + [System.IO.Path]::DirectorySeparatorChar

Write-Host "QuantFlow native-lock preflight check"
Write-Host "Scope: $scopeDir"
Write-Host ""

$found = Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" `
  -ErrorAction SilentlyContinue |
  Where-Object {
    $path = Normalize-Path $_.ExecutablePath
    $path -and $path.StartsWith($scopeDir, [System.StringComparison]::OrdinalIgnoreCase)
  }

if (-not $found) {
  Write-Host "[OK] No QuantFlow-scoped Electron processes detected."
  Write-Host "     Safe to run: bun install"
  exit 0
}

Write-Host "[WARN] QuantFlow-scoped Electron process(es) detected:"
foreach ($proc in $found) {
  $isSidecar = $proc.CommandLine -like "*pty-sidecar.js*"
  $label = if ($isSidecar) { "sidecar (holds conpty.node)" } else { "main app" }
  Write-Host "  PID $($proc.ProcessId)  [$label]"
  Write-Host "    Path: $($proc.ExecutablePath)"
}

Write-Host ""
Write-Host "[ACTION REQUIRED] These processes may hold conpty.node locked."
Write-Host ""
Write-Host "  If you run bun install while they are running, electron-rebuild"
Write-Host "  will fail with:"
Write-Host "    EPERM: operation not permitted, unlink '...conpty.node'"
Write-Host ""
Write-Host "  To stop ONLY these QuantFlow-scoped processes and then reinstall:"
Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\stop-quantflow-dev.ps1"
Write-Host "    bun install"
Write-Host ""
Write-Host "  To stop them automatically now, rerun with -Fix:"
Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\check-native-locks.ps1 -Fix"
Write-Host ""
Write-Host "  NOTE: This script will NEVER stop Cursor, VS Code, Discord, Slack,"
Write-Host "  or any Electron app outside of:"
Write-Host "    $scopeDir"

if ($Fix) {
  Write-Host ""
  Write-Host "[-Fix] Stopping detected processes..."
  foreach ($proc in $found) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Host "  Stopped PID $($proc.ProcessId)"
    } catch {
      Write-Host "  [WARN] Could not stop PID $($proc.ProcessId): $_"
    }
  }
  Write-Host ""
  Write-Host "Done. Wait a moment for file handles to release, then run:"
  Write-Host "  bun install"
  exit 0
}

exit 1
