# QuantFlow V2 GoalBuddy Templates — ARCHIVED

**Superseded.** Execute only from repo root: `CONCEPT.md` → `SCOPE.md` → `BUILD_PLAN_V2.md`.

This folder is historical GoalBuddy layer charters (Layers 1–7). Kept for reference; not an active build path. A2A Layer 3 content is rejected.

---

Purpose (historical): paste-ready GoalBuddy charters for the QuantFlow v2 rebuild on branch `quantflow-v2`.

Authority (historical):
- Repo workspace: `C:\Users\rybow\QuantFlow`
- Active branch: `quantflow-v2`
- Was: `ARCHITECTURE.md` and `BUILD_PLAN_V2.md` — now root docs only
- Supplementary scope map: pasted "QuantFlow V2 - Full Rebuild Scope"

Guardrails:
- Do not execute from the v1 `QuantFlow` branch, `reference/archive/`, or v1 vault plans.
- Do not start a section until its listed dependency has passed acceptance.
- Do not delete legacy paths until the replacement proof is complete.
- Prefer one GoalBuddy session per section.
- After every implemented section, record proof commands, screenshots/log snippets where applicable, commit SHA, and remaining risks before moving on.

Recommended execution order:
1. Layer 1 audit can run first or in parallel as documentation-only.
2. Layer 2B through 2G are the first required code path.
3. Layer 3A through 3G follows Layer 2 proof.
4. Layer 5A can be prepared after Layer 2B/2C shape is clear, but 5F depends on Layer 2G.
5. Layer 4 Envoy bridge follows a stable A2A/string identity path.
6. Layer 6 Watchtower evolves as event sources land, with 6D as the whole-system proof.
7. Layer 7 external QA loop can run in parallel and must not block Layers 2 through 6.

Files:
- [[Layer 1 - Visual Canvas]]
- [[Layer 2 - Process Runtime Herdr]]
- [[Proof - Layer 2B Session Spawn]]
- [[Layer 3 - Communication A2A MCP]]
- [[Layer 4 - Shared Memory Envoy]]
- [[Layer 5 - Legend Palette Templates]]
- [[Layer 6 - Watchtower]]
- [[Layer 7 - External QA Loop]]

First code goal:
- Start with [[Layer 2 - Process Runtime Herdr#2B - Session Spawn]].
- Before executing any goal, confirm the repo is on branch `quantflow-v2` by running `git branch`. If it is not on `quantflow-v2`, stop and switch before proceeding.
