$ErrorActionPreference = "Stop"
$repoDir = Join-Path $PSScriptRoot ".."
Set-Location $repoDir
& bun run dev
