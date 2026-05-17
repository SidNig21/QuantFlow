# QuantFlow Canvas

Control QuantFlow's spatial canvas from the terminal using the `qf` CLI.
The canvas is a pannable, zoomable surface where tiles display terminals, files, images, and graphs.

## Coordinate System

All positions and sizes use **grid units**. One grid unit = 20 pixels.
Origin (0,0) is the top-left corner. X increases rightward, Y increases downward.

## Tile Types

| Type    | Use for                          | Default size (w x h) |
|---------|----------------------------------|-----------------------|
| `term`  | Terminal / shell session         | 20 x 25              |
| `note`  | Markdown files (.md)             | 22 x 27              |
| `code`  | Source code files                | 22 x 27              |
| `image` | Images (.png, .jpg, .gif, .webp) | 14 x 14              |
| `graph` | .graph.json or folder graphs     | 30 x 25              |

Type is inferred from the file when `--file` is used:
- `.md`, `.txt` -> `note`
- `.graph.json` -> `graph`
- `.png`, `.jpg`, `.gif`, `.svg`, `.webp` -> `image`
- Directories -> `graph`
- Everything else -> `code`

## Commands

### qf tile list

List all tiles on the canvas. Returns JSON with id, type, position, size, route handle, relay syntax, role/status identity, and connected cable IDs for each tile.

```bash
qf tile list
```

### qf tile create

Create a new tile on the canvas.

```bash
qf tile create <type> [--file <path>] [--pos x,y] [--size w,h]
```

- `<type>`: term, note, code, image, or graph
- `--file <path>`: file to display (required for note, code, image, graph; omit for term)
- `--pos x,y`: position in grid units (default: viewport center)
- `--size w,h`: size in grid units (default: per-type default above)

Returns the new tile's ID on stdout.

**Examples:**
```bash
# Open a terminal at position (5, 5)
qf tile create term --pos 5,5

# Open a markdown file with default placement
qf tile create note --file ./README.md

# Open a graph file at a specific position and size
qf tile create graph --file ./entities.graph.json --pos 25,0 --size 35,30
```

### qf tile rm

Remove a tile from the canvas.

```bash
qf tile rm <id>
```

### qf tile move

Reposition a tile.

```bash
qf tile move <id> --pos x,y
```

### qf tile resize

Resize a tile.

```bash
qf tile resize <id> --size w,h
```

### qf tile focus

Pan and zoom the viewport to bring one or more tiles into view, then flash their focus rings.

```bash
qf tile focus <id> [<id>...]
```

**Examples:**
```bash
# Focus a single tile
qf tile focus tile-abc123

# Focus multiple tiles (viewport zooms to fit all)
qf tile focus tile-abc123 tile-def456
```

### qf role list

List configured terminal roles, including command availability diagnostics.

```bash
qf role list
```

### qf role spawn

Spawn a terminal tile from a configured role. QuantFlow copies the role identity, shell target, startup command, startup prompt, and status parser metadata into the new terminal tile.

```bash
qf role spawn <id> [--cwd <path>] [--pos x,y] [--size w,h]
```

- `--cwd <path>`: working directory (default: current directory)
- `--pos x,y`: position in grid units (default: auto placement)
- `--size w,h`: size in grid units (default: terminal default)

**Examples:**
```bash
# See available local agent roles
qf role list

# Spawn a Codex terminal for the current project
qf role spawn codex --cwd . --pos 0,0
```

### qf context

Inspect, prepare, and inject shared context from the configured Obsidian vault. Context pins stay vault-relative inside QuantFlow; the vault remains the durable memory source.

```bash
qf context get
qf context preview [--max-chars N] [--text]
qf context pin <file> [--mode full|summary-header|excerpt] [--excerpt <text>]
qf context unpin <file>
qf context mode <file> <mode> [--excerpt <text>]
qf context decision [--author <name>] [--source <name>] [--file <path>] [--cable <id>] <text>
qf context inject <tileId> [--max-chars N]
```

**Examples:**
```bash
# Pin the active hardening spec and preview what will be sent
qf context pin "/mnt/c/Users/rybow/Obsidian/Cursor Collab/Specs/QuantFlow-phase-9-hardening-spec.md" --mode summary-header
qf context preview --max-chars 12000

# Record an inspectable decision and inject the current pack to a terminal tile
qf context decision --author codex --source cli "Use cable-bounded routing for agent handoffs."
qf context inject tile-worker --max-chars 12000
```

### qf connection list

List all visible cables on the canvas.

```bash
qf connection list
```

### qf connection create

Connect two tiles with a visible cable.

```bash
qf connection create <tileA> <tileB> [--label <text>]
```

Returns the new connection ID on stdout.

**Examples:**
```bash
# Connect a worker terminal to a reviewer terminal
qf connection create tile-worker tile-reviewer --label review-loop
```

### qf connection rm

Remove a cable from the canvas.

```bash
qf connection rm <id>
```

### qf connection label

Rename a cable label.

```bash
qf connection label <id> <label>
```

### qf connection send

Send a plain-English message across an existing cable from one endpoint tile to the other. The `--from` tile must be one endpoint of the cable.

```bash
qf connection send <id> --from <tileId> <message>
```

Returns the structured relay result, including `ok`, `eventId`, and any relay error code.

**Examples:**
```bash
qf connection send conn-abc123 --from tile-worker "Please review the current diff."
```

### qf connection log

Inspect recent relay events for one cable.

```bash
qf connection log <id> [--limit N]
```

- `--limit N`: maximum number of events to return (default: 50)

### qf relay log

Inspect recent relay success and failure events across all cables.

```bash
qf relay log [--limit N]
```

### qf watchtower snapshot

Inspect current Watchtower agent status snapshots.

```bash
qf watchtower snapshot
```

### qf viewport

Read or set the canvas viewport.

```bash
qf viewport
qf viewport set [--pan x,y] [--zoom level]
```

- `--pan x,y`: canvas pan in pixels
- `--zoom level`: zoom level where `1` is 100%

### qf terminal write

Send input to a terminal tile. The tile must be of type `term` with an active PTY session.

```bash
qf terminal write <id> <input>
```

**Examples:**
```bash
# Run a command in a terminal tile
qf terminal write tile-abc123 $'ls -la\n'

# Launch Claude Code in headless JSON mode
qf terminal write tile-abc123 $'claude -p "fix the bug" --output-format json\n'
```

### qf terminal read

Read recent output from a terminal tile. Returns raw terminal output from the PTY session's ring buffer.

```bash
qf terminal read <id> [--lines N]
```

- `--lines N`: number of lines to capture (default: 50)

## Composition Patterns

### Side-by-side comparison

Two files next to each other for comparison.

```bash
qf tile create code --file ./old.ts --pos 0,0
qf tile create code --file ./new.ts --pos 23,0
```

### Research workspace

Knowledge graph on the left, notes on the right, terminal below.

```bash
qf tile create graph --file ./research.graph.json --pos 0,0 --size 30,25
qf tile create note --file ./notes.md --pos 31,0
qf role spawn codex --cwd . --pos 0,26
qf role spawn claude-reviewer --cwd . --pos 21,26
qf connection create <worker-id> <reviewer-id> --label review
qf context preview --max-chars 12000
qf context inject <worker-id> --max-chars 12000
qf connection send <connection-id> --from <worker-id> "Please review the pinned notes."
qf connection log <connection-id> --limit 10
```

### Dashboard layout

Multiple views arranged in a grid.

```bash
qf tile create graph --file ./entities.graph.json --pos 0,0 --size 30,25
qf tile create note --file ./log.md --pos 31,0
qf tile create note --file ./report.md --pos 31,14
qf tile create term --pos 0,26
```

### Focus view

Single tile centered with generous size.

```bash
qf tile create code --file ./main.ts --pos 5,2 --size 40,35
```

### Agent in a terminal

Launch a Claude Code instance in a terminal tile for the human to observe.

```bash
# Create terminal, wait for PTY, then launch agent
qf tile create term --pos 0,0
# (use tile list to get the tile ID, then)
qf terminal write <id> $'claude -p "summarize this project" --output-format json\n'
# Read the result when done
qf terminal read <id> --lines 100
```

## Conventions

1. **Always `tile list` first** to see what's already on the canvas before creating tiles.
2. **Use visible connections for coordination**: create cables between terminals before asking agents to relay or hand off work.
3. **Inspect relay results**: use `connection log`, `relay log`, or `watchtower snapshot` before assuming a message arrived.
4. **Use `tile focus` to frame** after arranging tiles so the user can see them.
5. **Clean up when done**: remove tiles and connections you created when they're no longer needed.
6. **Leave 1 grid unit gap** between adjacent tiles for visual clarity.
7. **File tiles auto-refresh**: when you write to a file that has a tile, the tile updates automatically. No need to close and reopen.
8. **Graph tiles support incremental updates**: append nodes to a `.graph.json` file and the graph tile smoothly incorporates them.
9. **Terminal tiles need time to initialize**: after `tile create term`, wait a few seconds before `terminal write` so the PTY session can start.

## Setup

The `qf` CLI is installed to `~/.local/bin/`. If the command is not found, the user needs to add it to their PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add this to `~/.zshrc` (macOS) or `~/.bashrc` (Linux) to persist across sessions.

## Exit Codes

| Code | Meaning                                    |
|------|--------------------------------------------|
| 0    | Success                                    |
| 1    | RPC error (tile not found, invalid params) |
| 2    | Connection failure (QuantFlow not running) |
