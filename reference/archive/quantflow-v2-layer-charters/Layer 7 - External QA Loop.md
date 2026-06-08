# Layer 7 - External QA Loop

Status: new, runs outside QuantFlow.

Owner: Claude Code + Factory Droid + Envoy.

Layer rule: External QA runs parallel to the main build and does not block Layers 2 through 6. It should test QuantFlow from the outside like an operator, then post results through Envoy.

## 7A - External Envoy Space Setup

```text
Goal: QuantFlow V2 Layer 7A - External Envoy space setup
Layer: 7 - External QA Loop
Depends on: Envoy CLI available outside the QuantFlow app.
Scope: Set up an external Envoy space that runs independently of QuantFlow app internals. This space coordinates QA tasks between code-writing and testing agents.
Acceptance criteria:
- Create or identify an external QA Envoy space distinct from the app's per-canvas Envoy space.
- Document space name/id, startup command, health check, and cleanup/reset procedure.
- Confirm external agents can post and read tasks without launching QuantFlow.
- Proof: post a sample QA task and read it back from another shell/session.
Out of scope:
- Modifying QuantFlow app code.
- App-internal Envoy bridge.
- Factory Droid testing automation.
Retirement: None.
```

## 7B - Claude Code Side

```text
Goal: QuantFlow V2 Layer 7B - Claude Code side
Layer: 7 - External QA Loop
Depends on: 7A External Envoy space setup passed.
Scope: Configure the code-writing side of the external QA loop. Claude Code writes code or prepares a change, then posts a "ready for testing" task to the external Envoy space with enough context for Factory Droid to test.
Acceptance criteria:
- Define the ready-for-testing task schema with repo path, branch, commit/diff summary, test target, expected behavior, and risk notes.
- Claude Code can post a valid ready-for-testing task to the external Envoy space.
- Task includes no secrets and enough reproduction steps for a tester.
- Proof: create one sample ready-for-testing task for a harmless/no-op or documentation change.
Out of scope:
- Factory Droid pickup/testing.
- QuantFlow app code changes except whatever code work produced the task.
- RTK installation.
Retirement: None.
```

## 7C - Factory Droid Side

```text
Goal: QuantFlow V2 Layer 7C - Factory Droid side
Layer: 7 - External QA Loop
Depends on: 7B Claude Code side passed.
Scope: Configure Factory Droid to pick up ready-for-testing tasks, open QuantFlow through computer use/browser automation as appropriate, run the requested checks, and post structured results back to the external Envoy space.
Acceptance criteria:
- Factory Droid can read pending ready-for-testing tasks from the external Envoy space.
- Test result schema includes task id, commit/branch, steps run, pass/fail, screenshots/log references if any, defects found, and retest recommendation.
- Factory Droid can launch or interact with QuantFlow without relying on internal app APIs unless the task explicitly asks for them.
- Factory Droid launch path is `C:\Users\rybow\QuantFlow\quantflow-electron` or the packaged app path. Document the exact launch command in the task spec so Factory Droid does not search for it.
- Proof: Factory Droid picks up the sample task from 7B and posts a result.
Out of scope:
- Automatic code fixing.
- App-internal Watchtower changes.
- RTK installation.
Retirement: None.
```

## 7D - Loop Verification

```text
Goal: QuantFlow V2 Layer 7D - External QA loop verification
Layer: 7 - External QA Loop
Depends on: 7C Factory Droid side passed.
Scope: Prove the end-to-end external QA loop: code written -> testing task posted -> QuantFlow tested -> results posted -> fix made -> retest repeated.
Acceptance criteria:
- Complete one full loop on a bounded QuantFlow change.
- Envoy external space contains the original ready-for-testing task, Factory Droid result, fix acknowledgement, and retest result.
- The repo has proof of the code commit(s) and QA result IDs.
- Failures are tracked as actionable issues rather than loose chat.
- Proof: provide task IDs, result IDs, commit SHAs, and pass/fail outcome.
Out of scope:
- Making this mandatory for every future commit.
- Replacing local unit/build tests.
- App-internal Envoy bridge.
Retirement: None.
```

## 7E - RTK Installation

```text
Goal: QuantFlow V2 Layer 7E - RTK installation for agent shell sessions
Layer: 7 - External QA Loop
Depends on: 7A External Envoy space setup passed; can run in parallel with 7B-7D if needed.
Scope: Install/configure RTK token compression for all agent shell sessions used in the external QA loop. Keep this outside QuantFlow app behavior unless a later architecture update explicitly brings it in.
Acceptance criteria:
- Identify which agent shell sessions need RTK.
- Install/configure RTK according to the approved local procedure.
- Verify Claude Code and Factory Droid sessions can use the compressed-token path without breaking Envoy posting/reading.
- Document rollback/disable steps.
- Proof: run a before/after or smoke command showing RTK active in the relevant shell sessions.
Out of scope:
- Changing QuantFlow app runtime.
- Applying RTK to end-user tiles by default.
- Rewriting prompts/tasks for token compression beyond necessary setup.
Retirement: None.
```
