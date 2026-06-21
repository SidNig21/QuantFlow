# v4 Spawn Model — the single source of truth

> **Canonical home for the Mode-1 / Mode-2 spawn decision and the
> role / harness / model vocabulary.** Decided 2026-06-20; frame sharpened
> 2026-06-21. `BUILD_PLAN_V4.md` and the R8 handoff point *here* — do not restate
> this decision a third time elsewhere; link to this file.

---

## 0. The frame (locked 2026-06-21)

**An agent is just three layers — model + tools + harness.**

1. **Model** — reached by an **API key**. Swappable. Opus / Sonnet / a
   third-party key / an Eve-exposed model. The model is the cheap, interchangeable
   part.
2. **Tools** — JSON-schema tool definitions + the code behind them.
   **Provider-agnostic by construction:** the same tool works regardless of which
   model is bound.
3. **Harness** — the loop that feeds the model the tools, runs the calls, feeds
   results back, repeats.

There are **no per-provider species of agent** (no "Eve agent" vs "Claude Code
agent" vs "Codex agent" as different kinds). All the same shape. What differs is
only *which key you point at* and *which tool set you bind*. The **model is
swappable; the tools + QuantFlow orchestration are the owned asset.**

---

## 1. Vocabulary — role vs harness vs model (the wording that must stay precise)

These three words were colliding in builder jargon and caused the R8 UX mistake.
Hold them apart:

| Term | Precise meaning | Where it lives |
| --- | --- | --- |
| **role** | A summonable **persona** — one `roles/*.json` entry (`commandTemplate`, `cwd`, `runtimeTarget`, `modelHint`). The thing a legend row spawns. | `roles/*.json` |
| **harness** | **OVERLOADED — never write it unqualified.** Two distinct things: (a) the model's *intra-agent* loop *inside* the worker (e.g. Eve's session loop); (b) QuantFlow's `WorkerHarness` *runtime adapter* contract (the Mode-2 `eve-harness`). | (a) inside the worker · (b) `src/harness/*` |
| **model** | The **API-key binding**. QuantFlow does **not** route models. The key lives in the agent's own folder (`.env.local`); `modelHint` in `roles.json` is a **display label only**, not a router input. | the agent folder's `.env.local` |

Consequences of keeping them apart:
- A legend row = a **role**, not a "harness kind." Clicking it summons a terminal.
- "Multiple models" = **multiple roles = multiple folders**, each with its own
  `.env.local`. QuantFlow never picks a model for you.
- `eve-harness` is a **harness (sense b)** used only by Mode 2 — it is not a role
  and not a legend target.

---

## 2. Two spawn modes

| Mode | What happens | Used by |
| --- | --- | --- |
| **Mode 1 — terminal summon** (default for **all** agents incl. Eve) | legend click → **terminal tile** → the operator chats / works directly | the **legend bar** + settings inventory, every day |
| **Mode 2 — background task** (optional, automation) | Conductor `assign_task` → `eve-harness` (headless) → artifact verify | the **Conductor / DAG** path (R1), when the Kernel must prove completion |

Rules that follow:

- **Legend bar = Mode 1 only.** A legend click opens a terminal tile the operator
  drives — identical feel for Codex, Claude, Python, **and Eve** (Eve = `eve dev`
  TUI in its package folder, same as any CLI recipe).
- **`eve-harness` is Mode 2 only** — it is **not** the default Eve spawn path. Keep
  it (R1 proof + future pods/automation depend on it); never wire it to a legend
  click.
- **`herdr` is plumbing, not an agent** — "this terminal runs in WSL." It is an
  implementation detail of Mode 1, never part of the operator model.

---

## 3. Three verbs on the same agent (kept distinct)

| Verb | Meaning | Owned by |
| --- | --- | --- |
| **author** | define the agent — tool set + instructions (Eve package = `instructions.md` + `tools/`), then bind a model (key) | Eve-first authoring → **R8.5** |
| **summon** | open it as a Mode-1 terminal from the legend | **R8** |
| **automate** | run it headless via the Conductor (Mode 2, `eve-harness`) | **R1** |

The **front door is "author a tool set, then bind a model (key)"** — *not* "pick
an Eve project," *not* "pick a CLI package," *not* the R8 modal form (which is
demoted in favor of Eve-first authoring at R8.5).

---

## 4. R8 correction (the only authorized build on this axis)

R8 shipped Eve as **Mode 2** (an idle headless tile via `harnessKind: eve-harness`)
on a legend click. That is wrong: the legend must be **Mode 1** for *all* agents
including Eve. The fix:

- An Eve persona is a plain **`roles/*.json`** (`commandTemplate: npm run dev` +
  `cwd` = the Eve folder + `runtimeTarget: windows-pty`; `modelHint` = label only).
- **Collapse the legend registry to `roles/*.json`** — drop the
  `eve-packages/manifest.json` split.
- Remove the `isEveHarness` headless fork from the legend click so **every row
  spawns a terminal**.
- Thread the recipe `cwd` into the spawn; update R8 tests.
- **Keep `eve-harness` for Mode 2 (Conductor, env-configured) only.**
- Multiple provider/model combos = multiple Eve folders = multiple rows, each with
  its own `.env.local` (QuantFlow does not route models).

**Product proof:** a legend-click on an Eve row opens a working `eve dev` TUI tile.
This is an **R8 scope clarification, not a rewrite** — R0 / R1 / the R8 registry
all stand. Handoff: `docs/v4/handoffs/R8-mode1-spawn-correction.md`.

---

## 5. Sequencing notes

- **Promote R8.5 (Eve-first authoring + settings agent inventory) only after R8 is
  marked Complete.** R8.5 changes the *authoring* front door; it presumes the
  Mode-1 *summon* path is already correct.
- **R2 / R3 dependency snag:** R2 (Context Envelope) is paused because it serves
  Mode-2 multi-worker handoffs and does **not** block legend summon. But **R3's
  cross-worker context handoff depends on R2's envelope** — the R3 DAG *structure*
  can land first, but real cross-worker context-passing needs R2 un-paused. Do not
  treat R2 as droppable; treat it as deferred-until-R3-context.

See also: [[agent-as-model-plus-tools]] (memory), `BUILD_PLAN_V4.md` § Operator
spawn model (pointer), `docs/v4/handoffs/R8-mode1-spawn-correction.md`.
