# QuantFlow Windows Dev Setup

This is the supported local development path for the active QuantFlow fork.

## Prerequisites

- Windows 11 or current Windows 10.
- PowerShell 7 is recommended for local shell work.
- Git for Windows.
- Node.js 22 or newer.
- Bun 1.3 or newer.
- WSL2 with at least one distro if you want WSL terminal tiles.

Check the tools from PowerShell:

```powershell
node --version
bun --version
git --version
wsl.exe --status
wsl.exe -l -v
```

## Install

Clone the QuantFlow fork and install Electron app dependencies:

```powershell
git clone https://github.com/SidNig21/QuantFlow.git C:\Users\<you>\QuantFlow
cd C:\Users\<you>\QuantFlow\collab-electron
bun install
```

For the active local workspace used by this branch:

```powershell
cd C:\Users\rybow\QuantFlow\collab-electron
bun install
```

The equivalent WSL path is:

```bash
cd /mnt/c/Users/rybow/QuantFlow/collab-electron
bun install
```

## Run

Start the Electron app with hot reload:

```powershell
cd C:\Users\<you>\QuantFlow\collab-electron
bun run dev
```

Create a terminal tile by double-clicking the canvas. In Settings, the terminal target can be left on `auto`, set to PowerShell, or set to a detected WSL distro.

## Test And Build

For fast iteration, run focused tests first:

```powershell
bun test src\windows\shell\src\cable-overlay.test.ts
bun test src\main\string-relay.test.ts
git diff --check
```

Run the full app build before a push-ready slice:

```powershell
bun run build
```

`bun run build` runs `electron-vite build` for main, preload, and the full renderer bundle. The renderer phase transforms roughly 10,000 modules, so it is expected to be much slower than focused tests.

## Common PATH Fixes

If QuantFlow reports that `bun` is missing, confirm Bun is on the same PATH used by Electron:

```powershell
where.exe bun
```

If `bun` is installed but not found, add Bun's bin directory to the user PATH and restart QuantFlow:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  $env:Path + ";$env:USERPROFILE\.bun\bin",
  "User"
)
```

If a role command such as `codex`, `claude`, `gemini`, or `opencode` is missing, install that CLI and verify it from PowerShell:

```powershell
where.exe codex
where.exe claude
```

If WSL terminal tiles do not launch, verify WSL is installed and at least one distro is running:

```powershell
wsl.exe --install
wsl.exe -l -v
```

## Local App Data

Development and packaged builds should write QuantFlow state under a QuantFlow namespaced app-data directory. Canvas state, roles, context, and relay logs should not be written to the old Collaborator app-data path.
