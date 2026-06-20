# Eve Setup — Operator Guide (read before the R1 product proof)

This is for **you (the operator)**, not Codex. Goal: get **one minimal Eve agent
running locally** so QuantFlow's `eve-harness` has something real to drive during
the **R1 product proof**. Codex builds the QuantFlow↔Eve wiring; you just need a
runnable agent to point it at.

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
Then, in a second terminal, send it a message:
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
  the other terminal and is on port 3000.
