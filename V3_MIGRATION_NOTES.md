# V3 Migration Notes

Maps v2 vocabulary and patterns to canonical v3 vocabulary.

Do not rename v2 concepts arbitrarily. When v3 introduces a term that replaces a v2 term, use the v3 term in new code and docs.

For v3 execution, follow `BUILD_PLAN_V3.md`. This document tracks the transition, not the destination.

## Vocabulary Map

| v2 concept | v3 canonical term | Notes |
| --- | --- | --- |
| tile state (renderer-local) | Kernel state → renderer projection | Canvas is now a projector, not owner |
| role | Role + WorkerInstance | Role is the type; WorkerInstance is the running participant |
| worker | WorkerInstance | Named to clarify instance vs. type |
| profile (Hermes) | Harness + Model | Harness is the adapter; Model is the intelligence backend; they are separate |
| canvas tile state | Kernel tile state | Canonical state lives in Kernel SQLite; canvas renders it |
| Envoy space + task | Task (Kernel-owned) | Tasks are Kernel state; Envoy remains the coordination bus |
| receipt | Receipt | Same concept, now a Kernel-first primitive |
| watcher | StateCard watcher | Watchers consume events/receipts and produce StateCards |
| herdr pane | herdr pane | Unchanged; wrapped by `herdr-shell` Harness adapter |
| MCP tools | Kernel command adapters | MCP tools call Kernel commands; they are not the commands |
| string relay | Connection (semantic) | Strings gain a type in Goal 7; string relay is not revived |
| vault note | Vault export | Vault receives OKF-style exports; it is not live state |

## What Does Not Change

- Infinite canvas — the product surface is unchanged.
- Live terminal tiles — herdr-backed WSL panes are kept.
- Envoy task bus — remains the coordination bus; now wraps Kernel task state.
- Obsidian mirror — remains the durable knowledge mirror.
- Existing MCP tools — kept as external adapter interface until Kernel commands are proven.
- Phase-6 delegation proof — preserved as shipped v2 behavior reference.
- node-pty — remains display glass for WSL and Windows shell fallback.

## What Changes

- **State authority**: Kernel owns it; canvas renders it.
- **Task lifecycle**: adds `submitted` and `verifying` gates before `complete`.
- **WorkerInstance**: separates role/harness/model (previously fused in Hermes profile).
- **State Cards**: first-class Kernel primitive (previously ad hoc or absent).
- **Conductor**: native in-process planner (previously Hermes via PTY/MCP).
- **Harness Layer**: explicit adapter boundary so `role ≠ harness ≠ model`.

## v2 Reference Authority

`BUILD_PLAN_V2.md` remains at root as shipped-behavior reference.

Use it to understand what exists and how it behaves. Do not use it as execution scope for v3 work.

## Retirement Queue (Scheduled, Not Yet Done)

These are scheduled for refactor or replacement in specific v3 goals. Do not retire them ahead of schedule.

| Item | Scheduled in | Status |
| --- | --- | --- |
| Direct renderer tile state mutations | Goal 2 | Pending |
| Hermes-in-PTY as primary planner | Goal 5 | Pending; Hermes tile stays |
| `complete` without verification gate | Goal 3 | Pending |

## Already Retired (Do Not Revive)

- String relay — retired in v2. Not revived in v3.
- A2A / Agent Cards — rejected for local v2 and v3.
- `herdr pane read` polling as tile display — retired.
