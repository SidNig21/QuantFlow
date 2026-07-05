# Eve agents (QuantFlow dock)

Two QuantFlow-specific Eve packages used by the QF Dock spawn rail:

| Package | Dock id | Role |
| --- | --- | --- |
| `bovada-odds/` | `bovada-odds` | Sports odds research persona |
| `canvas-scout/` | `canvas-scout` | Canvas/workflow reporter for A2A coordination |

Dock tiles spawn these on the **AgentOS fabric** (`runtimeTarget: agentos`) so cable relay,
orchestrator delegation, and session registry work out of the box. Each package also runs
standalone via `npm run dev` when developing the Eve persona locally.

Override package root with `QUANTFLOW_EVE_AGENTS_DIR` (defaults to this folder under the
QuantFlow repo when `QUANTFLOW_DEV_WORKTREE_ROOT` is set).

See `docs/v4/EVE_SETUP.md` for provider keys and Eve boot gotchas.
