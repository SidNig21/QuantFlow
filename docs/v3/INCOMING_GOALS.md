# Incoming Goals — v3 Backlog (intake, not authority)

A capture surface for candidate goals discovered while **using** QuantFlow during
the dogfooding phase. Items here are raw intake: ideas, gaps, papercuts, and
"this feels missing" notes.

**Nothing here is authorized work.** A candidate becomes real only when the
operator promotes it into `BUILD_PLAN_V3.md` as a numbered goal with full scope
and explicitly authorizes it (one goal at a time). Until then, do not implement
from this file.

See `docs/v3/STATUS.md` for current v3 state and `BUILD_PLAN_V3.md` for the
authoritative ladder (Goal 10 / cloud is the only parked rung).

## How to add an item

Keep entries short and evidence-based — what you actually hit, not a feature
wishlist. Use this shape:

```md
### <short title>
- **Problem / friction:** what felt missing or wrong while using the product
- **Evidence:** where you saw it (workflow, tile, command, receipt/eval id, screenshot)
- **Proposed scope:** rough idea of the change (1–3 bullets), if any
- **Layer(s):** kernel / renderer / conductor / harness / vault / evals / shell
- **Priority:** low / medium / high
- **Status:** captured | discussed | promoted to BUILD_PLAN_V3 (Goal N) | dropped
```

## Candidates

_None yet — add as you dogfood._

## Promotion checklist (when an item graduates)

1. Operator decides it's worth a goal.
2. Write it up in `BUILD_PLAN_V3.md` with Goal/Why/Repo scope/Out of
   scope/Acceptance/Failure signals (the standard goal shape).
3. Confirm it respects the Kernel Constitution (no new authority outside the
   Kernel; canvas stays a projector; evals/vault stay derived/mirror).
4. Mark the item here as `promoted to BUILD_PLAN_V3 (Goal N)`.
5. Authorize and build under the normal worker/verifier protocol.
