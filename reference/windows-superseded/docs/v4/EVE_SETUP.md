# Eve Setup — Operator Guide (read before the R1 product proof)

This is for **you (the operator)**, not Codex. Goal: get **one minimal Eve agent
running locally** so QuantFlow's `eve-harness` has something real to drive during
the **R1 product proof**. Codex builds the QuantFlow↔Eve wiring; you just need a
runnable agent to point it at.

## ✅ Proven working config (verified 2026-06-19 — OpenCode Go)

Proven end-to-end (real chat response via `deepseek-v4-pro`). **This is the
canonical setup — it supersedes the generic OpenRouter/Anthropic examples below.**

`agent/agent.ts`:
```ts
import { defineAgent } from "eve";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const opencode = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",   // NO /chat/completions — the SDK appends it
  apiKey: process.env.OPENCODE_GO_API_KEY,
});

export default defineAgent({
  model: opencode("deepseek-v4-pro"),          // BARE id — no "opencode-go/" prefix
  modelContextWindowTokens: 128000,            // required for custom (non-AI-Gateway) providers
});
```

Install (version-aligned with Eve's `ai@7-beta`): `npm i @ai-sdk/openai-compatible@beta` (→ 3.x v7 line).
`.env.local`: `OPENCODE_GO_API_KEY=sk-...` (gitignored; **fully restart** `npm run dev` after editing).

Hard-won gotchas:
- Model IDs are **bare** (`deepseek-v4-pro`), no `opencode-go/` prefix. Live list: `curl.exe https://opencode.ai/zen/go/v1/models -H "Authorization: Bearer <key>"`.
- Custom (non-AI-Gateway) providers have no context-window metadata → compaction fails unless you set `modelContextWindowTokens`.
- `eve dev` compiles config at startup — a full restart is required after editing `agent.ts` or `.env.local`.
- `Vercel CLI not found · /vc` is cosmetic for OpenCode Go (no AI Gateway, no deploy) — ignore until R4.
- `@openrouter/ai-sdk-provider` targets `ai@^6` and does NOT fit Eve's `ai@7-beta`; use `@ai-sdk/openai-compatible` (works for OpenRouter too — just swap `baseURL`/key).
- Model menu (bare ids): `deepseek-v4-pro`/`-flash` · `glm-5.2`/`5.1`/`5` · `kimi-k2.7-code`/`k2.6` · `qwen3.7-max`/`-plus` · `minimax-m3`/`m2.7` · `mimo-v2.5-pro`.

## Multiple personas / providers — one folder each (the legend model)

Eve gives you **as many provider/model combos as you have agent folders.** There is
no global "provider hub" — each Eve package is one persona with one default model in
`defineAgent`, its own `.env.local`, and (in Mode 1) **one legend row**. Want
OpenCode Go *and* OpenRouter? That's **two folders, two `.env.local`, two rows.**

```text
C:\Users\rybow\agents\
  research-opencode\   → OpenCode Go + deepseek-v4-pro   (.env.local: OPENCODE_GO_API_KEY)
  review-openrouter\   → OpenRouter + claude-sonnet       (.env.local: OPENROUTER_API_KEY)
  scout-fast\          → OpenRouter + a cheap model       (.env.local: OPENROUTER_API_KEY)
```

OpenCode Go variant = the proven config above. **OpenRouter variant** (same
`@ai-sdk/openai-compatible`, just swap baseURL/key/model id):
```ts
import { defineAgent } from "eve";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
export default defineAgent({
  model: openrouter("anthropic/claude-sonnet-4"),   // an OpenRouter model id
  modelContextWindowTokens: 200000,
});
```

**Running several at once:** each `eve dev` binds one port. Give each package a
port-specific script and point its legend recipe's `commandTemplate` at it:
```jsonc
// package.json
"scripts": { "dev:research": "eve dev --port 3001" }
```
One persona per port when you run multiple tiles together.

> **Legend recipe = a plain `role.json`** (`commandTemplate: "npm run dev"`, `cwd:
> <that folder>`, `runtimeTarget: "windows-pty"`, `modelHint` as a label). The model
> /provider truth lives in the folder's `agent.ts` + `.env.local` — QuantFlow does
> **not** route models. (See `BUILD_PLAN_V4.md` § Operator spawn model; the
> `eve-packages/manifest.json` split is being collapsed to `roles/*.json`.)

## Eve agent package — full folder reference (R8.5 authoring)

Eve builds an agent by walking the filesystem under `agent/`. Below is the
authoritative layout, each slot annotated with the **QuantFlow boundary** (the rule
that keeps Kernel-owns-truth intact) and **when** we need it.
**Verified 2026-06-21 against [eve.dev/docs/reference/project-layout](https://eve.dev/docs/reference/project-layout).**

> **⚠️ This tree is the MENU, not the scaffold.** Eve does **not** pre-create these
> folders. `npx eve init` gives you only `agent.ts` + `instructions.md` +
> `channels/eve.ts`. **You create a folder only when you author that capability** —
> e.g. there is no `skills/` until you add `agent/skills/<name>.md`.
>
> **❌ Do NOT pre-create empty capability folders (verified 2026-06-21).** Eve's
> discovery is strict: an empty `agent/skills/`, `lib/`, `schedules/`, or `sandbox/`
> — even with a `.gitkeep` placeholder — makes `eve dev` **fail discovery and refuse
> to boot** ("Expected … to be a supported authored module", "Sandbox folder contains
> neither a definition nor a workspace/"). A `.gitkeep` is treated as a broken module,
> not ignored. So: leave a slot **absent** until it has real content. (We tried the
> skeleton approach and had to revert it.)
>
> Our `quantflow-eve/agent/` currently holds: `agent.ts`, `instructions.md`,
> `channels/eve.ts`, and `tools/write_task_artifact.ts`. That is the expected R1
> state — everything below marked `[create on demand]` is added later, as needed,
> **with content, not as an empty folder.**

```text
quantflow-eve-agents/
└── odds-analyst/              ← one persona = one package = one legend row (Mode 1)
    ├── package.json           [scaffolded]
    ├── tsconfig.json          [scaffolded]
    ├── .env.local             [scaffolded] the API key(s) — gitignored, NEVER committed
    ├── agent/
    │   ├── agent.ts           [scaffolded] model + runtime config  ← model binding lives HERE
    │   ├── instructions.md    [scaffolded] always-on system prompt (who / how / rules)
    │   ├── channels/          [scaffolded] how callers reach the agent (eve.ts = HTTP) [root-only]
    │   ├── tools/             [create on demand] typed functions the model can call
    │   ├── skills/            [create on demand] longer on-demand procedures
    │   ├── connections/       [create on demand] external MCP / OpenAPI / auth integrations
    │   ├── subagents/         [create on demand] child agents (intra-agent delegation)
    │   ├── sandbox/           [create on demand] sandboxed-compute config + lifecycle hooks
    │   ├── hooks/             [create on demand] subscribe to runtime stream events
    │   ├── schedules/         [create on demand] cron-like repeatable runs    [root-only]
    │   ├── instrumentation.ts [create on demand] runtime tracing / telemetry  [root-only]
    │   └── lib/               [create on demand] shared helper code across agent files
    └── evals/                 [create on demand] scored checks — project ROOT, sibling of agent/
```

> **Path-derived naming (Eve rule):** identity comes from the file path — you never
> write a `name`/`id` on a `define*` call. `agent/tools/get_weather.ts` → tool
> `get_weather`; `agent/connections/linear.ts` → connection `linear`;
> `agent/subagents/researcher/agent.ts` → subagent `researcher`. So in our world a
> persona's surface is *literally its folder tree* — which is exactly why the
> R8.5 front door is "drop a folder," not a form.

| Slot | What it is | QuantFlow boundary rule | When |
| --- | --- | --- | --- |
| `agent.ts` | model + runtime config | **the model binding** (+ `.env.local`); QF does **not** route models — `modelHint` in the role is a label only | R1 scaffold |
| `instructions.md` | always-on prompt | core authoring surface | R1 scaffold |
| `instrumentation.ts` | runtime tracing/telemetry **[root-only]** | telemetry only; not a truth source | later |
| `channels/` | how callers reach Eve; `eve.ts` = HTTP channel **[root-only]** | `eve-harness` drives `eve.ts` in **Mode 2**; Mode 1 is the `eve dev` TUI | R1 (scaffold default) |
| `schedules/` | cron / repeatable runs **[root-only]** | **do not make this a second QF scheduler.** Use only when Eve is a packaged external worker; QF owns run state / Night Shift | later (guarded) |
| `tools/` | typed model-callable functions | **never mutate the Kernel.** Eve tools read/produce artifact *files*; Kernel mutation stays behind QuantFlow (F4) | **R8.5** |
| `skills/` | reusable procedures (e.g. skeptic review, odds analysis, research brief) | pure procedure; no Kernel writes | **R8.5** |
| `connections/` | external MCP / OpenAPI / auth services | maps to the future **`xmcp` Kernel-read connection** (one read surface, hosted/later); Eve never *owns* QF truth | R3+/later |
| `subagents/` | child agents for focused subtasks | **intra-agent — stays BELOW the DAG line.** Eve subagents ≠ the QuantFlow cross-worker DAG | later |
| `sandbox/` | sandboxed execution + lifecycle hooks | safe code-exec for isolated runs | **R4** |
| `hooks/` | runtime event-stream extension points | may emit telemetry, but the **Kernel owns official receipts** (the `eve-harness` translator drafts them — F4) | later |
| `lib/` | shared helper code across agent files | plain code reuse; no special role | as needed |
| `evals/` | scored checks, `defineEval` / `eve eval` (**project root**, sibling of `agent/`) | `eve eval` may feed **per-agent** scoring; QF evals stay **non-authoritative + cross-run** (R7) | R7 |

> **Subagent limitation (verified):** a declared subagent under
> `agent/subagents/<id>/` may have its own `agent.ts`, `instructions.md/ts`,
> `tools/`, `skills/`, `connections/`, `hooks/`, `sandbox/`, `lib/`, and nested
> `subagents/`. **`channels/`, `schedules/`, and `instrumentation.ts` are
> ROOT-ONLY** — not allowed inside a subagent.

**Minimum to be runnable (R1 product proof):** just `agent.ts` + `instructions.md`
+ the scaffolded `channels/eve.ts`. Everything else is authoring depth you add as
the persona matures (`tools/`+`skills/` at R8.5; `sandbox/` at R4).

## eve-harness wiring (R1+) — how QuantFlow talks to this agent

R1 shipped a minimal `eve-harness` (`src/harness/eve/index.ts`) that drives this
agent over HTTP. It is configured by two env vars (with sensible defaults):

| Env var | Default | What it is |
| --- | --- | --- |
| `QF_EVE_BASE_URL` | `http://127.0.0.1:3000` | Where the `eve dev` server is listening. **Eve's scaffold default is `:3000`; set this if you run on another port.** |
| `QF_EVE_WORKSPACE` | process cwd | The folder the Eve agent writes artifacts into; structural verify reads the bytes back from here. |

> **Proven R1 product-proof config (2026-06-20):** the agent ran on **port 2000**,
> so the proof set `QF_EVE_BASE_URL=http://127.0.0.1:2000` and
> `QF_EVE_WORKSPACE=C:\Users\rybow\quantflow-eve\qf-artifacts`. Confirm your actual
> `eve dev` port (the TUI prints it on start) and set `QF_EVE_BASE_URL` to match —
> the code default is `:3000`, so a `:2000` instance **needs** the override.

The harness opens the Eve session on the **first `send`** (the task text is the
first model turn), reads the NDJSON stream, parses the pinned `ARTIFACT_PATH:`
line, reads that file from the workspace, and returns a `ReceiptDraft` — it never
writes Kernel state (F4). The caller posts `artifact.create` + `submit`.

## When you actually need this
- **R0:** you need **none** of this. R0's Eve-lane probe only checks reachability +
  that a key is present. Don't set up Eve for R0.
- **R1 product proof:** this is the moment. Local `npm run dev` is enough — you do
  **not** need to deploy to Vercel yet.
- **R4:** the deploy-to-Vercel / durability step. Later. Ignore for now.

So: do this at a relaxed pace before R1. It is not blocking earlier work.

## What you need
| Need | How to check / get |
| --- | --- |
| **Node 24+** | `node --version` — Eve requires **Node 24 or newer**. Upgrade if older (most likely gap). |
| **Vercel account** | You have one. ✅ |
| **Vercel CLI, logged in** | `npm i -g vercel` → `vercel login` (CLI login is separate from the browser session). |
| **A model API key** | You have an OpenRouter key. ✅ (see the wiring note below.) |

## Steps

### 1. Confirm Node 24+
```bash
node --version
```
If it's below 24, upgrade (nvm, or the installer from nodejs.org) before continuing.

### 2. Scaffold the agent
```bash
npx eve@latest init quantflow-eve
```
This creates a `quantflow-eve/` folder, installs dependencies, inits git, and
starts an interactive dev TUI. It scaffolds:
- `agent/instructions.md` — the system prompt (leave the default for now)
- `agent/agent.ts` — model config
- `agent/channels/eve.ts` — the HTTP channel exposing `POST /eve/v1/session`

**Don't build a fancy agent.** The default scaffold is enough for QuantFlow to drive.

### 3. Give it a model credential
The default model is `anthropic/claude-sonnet-4.6`. When you run it, the dev TUI
**flags a missing credential and its `/model` command walks you through pasting a
key.** Put the key in a local `.env` (e.g. `OPENROUTER_API_KEY=...`).

> **OpenRouter note (the one fiddly bit):** Eve supports **direct provider** models
> with your own key (not only Vercel AI Gateway), so OpenRouter should work as a
> direct provider. The exact routing config is the **R0 spike** Codex resolves —
> so for *this* setup, just get the agent answering with **any** working model
> first (the TUI `/model` flow is the easy path). Don't get stuck on
> OpenRouter-specifically before the agent runs at all.

### 4. Run it and confirm it responds
```bash
npm run dev
```
Then, in a second terminal, send it a message (**substitute your actual port** —
the TUI prints it on start; this operator's instance runs on `:2000`):
```bash
curl -X POST http://127.0.0.1:3000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"say hello"}'
```
You should get a response back (and a session id). The dev TUI also lets you chat
with it directly.

## You're "Eve-ready" when…
- `node --version` ≥ 24, and `vercel login` succeeded.
- `npm run dev` starts the agent with no missing-credential error.
- The `curl` above returns a real model response.

That's it — stop there. Deploy, durability, and OpenRouter fine-tuning come later
(R4 and the R0 spike).

## Security
The model key lives in the agent's local `.env` only. **Never commit it, never
paste it into chat or a handoff.** If you paste Codex output that contains a key,
scrub it first.

## Quick troubleshooting
- *"command not found: vercel"* → `npm i -g vercel`.
- *Node too old* → upgrade to 24+, reopen the terminal, re-check `node --version`.
- *Missing credential at `npm run dev`* → use the TUI `/model` command, or add the
  key to `.env`.
- *`curl` hangs / connection refused* → make sure `npm run dev` is still running in
  the other terminal, and that you're hitting **its actual port** (the TUI prints it;
  `:3000` is the scaffold default, but this operator's instance runs on `:2000`).
