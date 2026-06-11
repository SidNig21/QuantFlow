$ErrorActionPreference = "Stop"

function Normalize-WindowsPath {
	param([string]$Path)
	if ($null -eq $Path) { return $null }
	if ($Path.StartsWith("\\?\UNC\")) {
		return "\\" + $Path.Substring("\\?\UNC\".Length)
	}
	if ($Path.StartsWith("\\?\")) {
		return $Path.Substring("\\?\".Length)
	}
	return $Path
}

function Refresh-ExplorerIconCache {
	try {
		Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
		Start-Sleep -Milliseconds 400
		Start-Process explorer.exe
	} catch {
		Write-Warning "Could not restart Explorer. Sign out/in if the icon still looks stale."
	}
}

$scriptRoot = Normalize-WindowsPath $PSScriptRoot
$repoDir = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))
$sourceIconIco = Join-Path $repoDir "build\icon.ico"
$sourceIconPng = Join-Path $repoDir "build\icon.png"
$launcherPath = Join-Path $scriptRoot "QuantFlow-dev.ps1"
$iconDir = Join-Path $env:LOCALAPPDATA "QuantFlow\icons"
$iconIcoPath = Join-Path $iconDir "app.ico"
$iconPngPath = Join-Path $iconDir "app.png"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "QuantFlow.lnk"

$packagedExe = Get-ChildItem -Path (Join-Path $repoDir "dist") -Recurse -Filter "QuantFlow.exe" -ErrorAction SilentlyContinue |
	Select-Object -First 1

if (-not (Test-Path $sourceIconIco)) {
	Write-Error "Missing icon at $sourceIconIco. Run: bun run generate:icon"
	exit 1
}

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
Copy-Item -Path $sourceIconIco -Destination $iconIcoPath -Force
if (Test-Path $sourceIconPng) {
	Copy-Item -Path $sourceIconPng -Destination $iconPngPath -Force
}

if ($packagedExe) {
	$targetPath = $packagedExe.FullName
	$arguments = ""
	$workingDirectory = $packagedExe.Directory.FullName
	Write-Host "Using packaged app: $targetPath"
} else {
	@(
		'$ErrorActionPreference = "Stop"',
		'$repoDir = Join-Path $PSScriptRoot ".."',
		'Set-Location $repoDir',
		'& bun run dev'
	) | Set-Content -Path $launcherPath -Encoding UTF8

	$targetPath = (Get-Command powershell.exe).Source
	$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
	$workingDirectory = $repoDir
	Write-Host "Using dev launcher: $launcherPath"
}

if (Test-Path $shortcutPath) {
	Remove-Item $shortcutPath -Force
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.IconLocation = "$iconIcoPath,0"
$shortcut.Description = "QuantFlow"
$shortcut.Save()

Write-Host "Installed icon cache-bust copy: $iconIcoPath"
Write-Host "Created desktop shortcut: $shortcutPath"
Write-Host "Refreshing Explorer icon cache..."
Refresh-ExplorerIconCache
