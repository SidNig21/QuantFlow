# QuantFlow Vault Pairing

QuantFlow uses two workspaces:

| Workspace | Root | Current role |
| --- | --- | --- |
| Repo | `C:\Users\rybow\QuantFlow` | Code and execution authority |
| Vault | `C:\Users\rybow\Obsidian\QuantFlow Vault` | Operator planning, references, live mirrors, Envoy output |

Current repo branch for v3 work:

```text
quantflow-v3
```

Base branch:

```text
quantflow-v2
```

## Authority Split

| Question | Read here |
| --- | --- |
| What do we build for v3? | Repo `BUILD_PLAN_V3.md` |
| What was shipped/working in v2? | Repo `BUILD_PLAN_V2.md`, `CONCEPT.md`, `ENVOY.md`, `TESTING.md` |
| What is the operator-facing v3 plan? | Vault `V3 Official.md` |
| What fresh vault files can inform v3? | Vault root files listed below |
| What older context is still useful but dated? | Vault `Projects/QuantFlow/reference/` |
| What is live Envoy state? | Vault `Projects/QuantFlow/Envoy/` |
| How do tile agents operate? | Vault `Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md` |

Repo `BUILD_PLAN_V3.md` wins for implementation scope.

## Fresh Vault Root References

These are current and relevant reference files, but not execution authority:

- `V3 Official.md`
- `Cursor Roadmap.md`
- `Fable URL List.md`
- `QuantFlow_Integration_Map.md`
- `QuantFlow Constructor Theory.md`

Use them to clarify intent, vocabulary, and strategy. Fold any implementation-changing decision back into repo docs before coding.

## Older Dated Context

The project reference folder remains useful, but treat it as historical context:

```text
C:\Users\rybow\Obsidian\QuantFlow Vault\Projects\QuantFlow\reference
```

Use it for prior decisions, links, design artifacts, and v2/v1 archaeology. Do not treat files there as current marching orders unless `BUILD_PLAN_V3.md` explicitly points to them.

## Before Coding

```bash
git branch --show-current
git status --short --branch
```

Expected branch:

```text
quantflow-v3
```

Then read:

1. `AGENTS.md`
2. `REPO_MAP.md`
3. `BUILD_PLAN_V3.md`
4. `CONCEPT.md`
5. The repo files in the current v3 goal scope
6. Fresh vault root references only if needed for context

## Handoff Rule

Every v3 handoff should state:

```text
Repo branch:
Active v3 goal:
Authority docs read:
Files changed:
Proof commands:
Reference notes used:
Risks / follow-ups:
```
