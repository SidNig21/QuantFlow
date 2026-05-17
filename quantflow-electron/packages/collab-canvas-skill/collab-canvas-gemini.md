# QuantFlow Canvas - Gemini CLI Instructions

You have access to the `qf` CLI for controlling QuantFlow's spatial canvas.
The canvas is a pannable, zoomable surface where tiles display terminals, files, images, and graphs.

## Coordinate System

All positions and sizes use **grid units** (1 unit = 20px).
Origin (0,0) is top-left. X increases rightward, Y downward.

## Tile Types and Default Sizes

| Type    | Default size (w x h) | Use for                          |
|---------|-----------------------|----------------------------------|
| `term`  | 20 x 25              | Terminal / shell session         |
| `note`  | 22 x 27              | Markdown files (.md, .txt)       |
| `code`  | 22 x 27              | Source code files                |
| `image` | 14 x 14              | Images (.png, .jpg, .gif, .webp) |
| `graph` | 30 x 25              | .graph.json or folder graphs     |

Type is inferred from file extension when `--file` is used.

## Commands

```bash
# List all tiles
qf tile list
# Includes routeHandle, relaySyntax, role/status identity, and connectionIds.

# Add a tile (returns tile ID)
qf tile create <type> [--file <path>] [--pos x,y] [--size w,h]

# Remove a tile
qf tile rm <id>

# Move a tile
qf tile move <id> --pos x,y

# Resize a tile
qf tile resize <id> --size w,h

# Focus one or more tiles
qf tile focus <id> [<id>...]

# List and spawn configured terminal roles
qf role list
qf role spawn <role-id> [--cwd <path>] [--pos x,y] [--size w,h]

# Inspect and inject shared Obsidian-vault context
qf context get
qf context preview [--max-chars N] [--text]
qf context pin <file> [--mode full|summary-header|excerpt] [--excerpt <text>]
qf context unpin <file>
qf context mode <file> <mode> [--excerpt <text>]
qf context decision [--author <name>] [--source <name>] [--file <path>] [--cable <id>] <text>
qf context inject <tileId> [--max-chars N]

# List cables
qf connection list

# Connect two tiles with a visible cable
qf connection create <tileA> <tileB> [--label <text>]

# Remove or relabel a cable
qf connection rm <id>
qf connection label <id> <label>

# Send a cable-bounded message
qf connection send <id> --from <tileId> <message>

# Inspect relay history and agent status
qf connection log <id> [--limit N]
qf relay log [--limit N]
qf watchtower snapshot

# Get viewport state
qf viewport

# Set viewport pan/zoom
qf viewport set [--pan x,y] [--zoom level]
```

## Examples

```bash
# Side-by-side code comparison
qf tile create code --file ./old.ts --pos 0,0
qf tile create code --file ./new.ts --pos 23,0

# Research workspace: graph left, notes right, terminal below
qf tile create graph --file ./research.graph.json --pos 0,0 --size 30,25
qf tile create note --file ./notes.md --pos 31,0
qf role spawn codex --cwd . --pos 0,26
qf role spawn claude-reviewer --cwd . --pos 21,26
qf connection create <worker-id> <reviewer-id> --label review
qf context preview --max-chars 12000
qf context inject <worker-id> --max-chars 12000
qf connection send <connection-id> --from <worker-id> "Please review the pinned notes."
qf connection log <connection-id> --limit 10

# Frame the viewport after arranging
qf viewport set --pan 0,0 --zoom 0.8
```

## Conventions

1. Always `qf tile list` first to see existing tiles before creating new ones.
2. Use `qf role list` and `qf role spawn` for agent terminals when possible so role/status metadata stays visible.
3. Use `qf context preview` before injecting shared context so missing files and truncation are visible.
4. Create visible connections with `qf connection create` before coordinating agents across tiles.
5. Inspect `connection log`, `relay log`, or `watchtower snapshot` before assuming a relay arrived.
6. Use `qf viewport set` or `qf tile focus` to frame the view after arranging tiles.
7. Remove tiles and connections when no longer needed.
8. Leave 1 grid unit gap between adjacent tiles.
9. File tiles auto-refresh when you write to the underlying file.
10. Graph tiles support incremental updates — append nodes to `.graph.json` and the graph updates smoothly.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | RPC error |
| 2 | Connection failure (QuantFlow not running) |
