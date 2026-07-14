# v4 Rung Handoff — R0 — Auth / Capability Preflight

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** none (first rung)

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R0 — Auth / Capability Preflight" — read it as binding. This brief front-loads essentials + the verification contract. If brief and plan disagree, **the plan wins — flag it, don't silently pick.**

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → child `AGENTS.md` for any folder you touch
- `BUILD_PLAN_V4.md` § "Goal R0" **and** § "Eve Integration" (the R0 Eve delta + the OpenRouter/AI-Gateway decision)
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md`
- Seam files: `quantflow-electron/src/main/diagnostics/{types,probes,health-runner}.ts`, `quantflow-electron/src/main/role-service.ts`, `quantflow-electron/src/main/workflow-agent-ready.ts`, `src/main/conductor/model-provider.ts`, `quantflow-electron/src/main/harness-service.ts`, `quantflow-electron/src/main/cli-installer.ts`

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- **Extend the existing diagnostics health-probe framework** with a new `capability` group. Do NOT invent a parallel framework. Reuse `HealthProbe`/`runProbe`/`runHealth`, the `healthy|degraded|down` levels, and the `remediation` field.
- Capability result `detail` shape: `{ capabilityId, kind: 'role'|'harness'|'provider', present, reachable, authed:boolean|null, ready, checkedAt }`. Level map: `ready→healthy`, `present-but-not-ready→degraded`, `absent/unreachable→down`.
- **Probes (two lanes):**
  - Local-CLI lane — per spawn-rail role with a `commandTemplate` (`codex`, `claude`, `opencode`, `hermes`): `present` via `commandExists(getRoleCommandName(role))`; `authed` via a bounded non-interactive readiness check (or, fallback, a bounded interactive spawn that reaches `isAgentPromptReady`).
  - herdr-wsl reachability; local-shell baseline (always green on a supported platform).
  - Model provider — credential present via the new accessor + a **cheap** reachability check (NO paid tokens / no real completion).
  - **Eve lane** — `/eve/v1/info` reachability + `OPENROUTER_API_KEY` present/valid.
- **Single credential accessor** `getCredential()` over Electron `safeStorage` (holds `OPENROUTER_API_KEY`). It is the only credential read path.
- **Read-only report surface:** `runPreflight()` façade over `runHealth({ capability group })`; IPC `capability:run` / `capability:snapshot` (read-only); a minimal in-app report view (status badge + message + remediation per row). Optional `qf capability` CLI — **must NOT reuse the existing `preflight` npm script name**; the new smoke is `smoke:capability-preflight`.
- **R0 spike (carry the result in §5 notes):** confirm `defineAgent` accepts a custom AI-SDK provider (OpenRouter, own key) instead of an AI-Gateway slug. Don't lock the credential design until this is answered.

## 3. Hard guardrails — do NOT
- Report **green for an installed-but-unauthenticated CLI** (presence ≠ readiness — this is the whole point).
- Write any `kernel.*` command / mutate Kernel, worker, or task state (preflight is **derived, read-only**).
- Add an `auth_status` column or **any** Kernel schema change.
- Build a Settings/credential-management UI, a credential manager, a capability registry, packaging/signing, or broad permission enforcement.
- Register a CLI (e.g. `codex`) as a **harness kind** — `role ≠ harness`. Harness kinds stay `local-shell`/`herdr-shell`.
- Spend paid tokens in a provider probe. Auto-spawn or auto-auth anything. Use AI Gateway. Read credentials from more than one place. Reuse the `preflight` script name.
- One rung only. Commit locally. **Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)
- **Machine proof (CI, no auth/cost):**
  - `capability-probes.test.ts` — injected fakes prove the full matrix: present+authed+reachable→`ready/healthy`; present+not-authed→`degraded`/`authed:false`/`ready:false`+remediation; absent→`down`/`present:false`; herdr unreachable→`down`+remediation; non-auth-bearing (local-shell, manual provider)→`authed:null`/`ready:true`.
  - `preflight.test.ts` — `runPreflight()` aggregates worst-of deterministically; report render is stable (no timestamps in compared body).
  - `credential-accessor.test.ts` — get/has over an injected storage fake.
- **Product proof (manual — capture before/after):** operator manually starts/auths one real worker via the normal worker path; its probe flips **amber → green**; an installed-but-unauthed CLI shows **amber, not green**; `local-shell` is green. (Any rail reaching ready satisfies it; herdr fix optional.)
- **Regression guard (must stay green):**
  ```
  cd quantflow-electron
  bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
  bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
  bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && bun run smoke:eval && \
  bun run smoke:capability-preflight && \
  bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
  bun run build
  cd ../tools/quantflow-mcp && node --test
  ```

## 5. Verification handoff — paste THIS back
1. **Diff** — `git diff <the commit before your work>..HEAD` (or changed-files list + full contents of every new/changed file).
2. **Command outputs** — the full, real output of every §4 command (each test, the regression stack, the build). Don't trim failures.
3. **Self-assessment** — table: each §4 criterion → met/not-met → evidence line.
4. **Notes** — scope deviations, guardrails tempted, and the **OpenRouter-provider spike result**, plus any file the plan didn't anticipate.
