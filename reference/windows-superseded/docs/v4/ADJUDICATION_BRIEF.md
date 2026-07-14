# v4 Review Adjudication Brief (Codex)

**Purpose:** Two reviewers — Claude (`qa/v4-review-claude.md`) and Cursor (`qa/v4-review-cursor.md`)
— independently reviewed the v4 rung work against [REVIEW_BRIEF.md](REVIEW_BRIEF.md). You (Codex)
are the **neutral adjudicator**. Your job is NOT to merge two lists — it is to **independently
verify each claimed finding against the actual code** and produce the *true* combined finding set.

You were not a reviewer, so you have no finding to defend. Use that. Trust neither review; test both.

---

## 1. Inputs
- `qa/v4-review-claude.md` — Claude's findings (IDs `C-##`).
- `qa/v4-review-cursor.md` — Cursor's findings (IDs `X-##`).
- `docs/v4/REVIEW_BRIEF.md` — the shared scope + the 10 invariants (KT/F1/F14/F15/F16/NSS/MIG/EO/REF/AUTH).
- The code itself: scope `b381bcb..quantflow-v4` (v3 is out of scope).

## 2. What to do — per finding
For **every** finding in both files, open the cited `file:line` and verify the claim against the
actual code. Assign one verdict:

| Verdict | Meaning |
|---|---|
| **Confirmed** | The claim is real as stated; evidence checks out. |
| **Confirmed-but-mis-sevved** | Real, but the severity is wrong (state the correct severity + why). |
| **Partial** | Partly true — the core is real but a sub-claim or mitigation is wrong/missing. |
| **Refuted** | The claim does not hold against the code (cite the line that disproves it). |
| **Needs-decision** | Real, but resolution is a product/authority call, not a code fact. |

Then assign the **true severity** yourself (`blocker/major/minor/nit/question`) — do not just copy
the reviewer's. Quote the disambiguating line in each case.

## 3. Cross-reference
- **Agreements:** findings BOTH reviewers raised (match by claim, not ID). These are high-confidence
  — but still verify; two reviewers can share the same wrong assumption.
- **Conflicts:** where the two reviews **disagree** — different severity for the same issue, or one
  asserts an invariant holds and the other says it's violated. **These are the most important.**
  Adjudicate each with code evidence and declare the correct position.
- **Unique-to-each:** a finding only one reviewer caught. Verify it; unique real findings are the
  blind-spot value of having two reviewers.
- **Bonus:** if while verifying you find a real issue **neither** reviewer caught, add it (prefix
  `Z-##`). Don't go hunting beyond the cited surfaces, but log what you trip over.

## 4. Re-run where testable
Any finding that a smoke can prove/disprove — run it. At minimum, if you touch the F1/F14/F15/F16
claims, re-run `bun run smoke:judgment` and `bun run smoke:run-template` and cite the result. Do not
take a reviewer's "smoke proves X" on faith.

## 5. Output → `qa/v4-review-adjudication.md`
1. **Verdict table** — one row per finding: `id(s) · source(Claude/Cursor/both) · claim (1 line) ·
   Codex verdict · true severity · evidence (file:line or smoke result)`.
2. **Invariant reconciliation** — the 10-invariant table with YOUR adjudicated verdict for each
   (holds / violated / holds-with-caveat), noting where the two reviews diverged on it.
3. **Conflicts resolved** — each disagreement, with the call and why.
4. **Consolidated punch list** — the *true* combined findings, severity-ordered, deduped. This is
   the deliverable: what actually needs doing.
5. **Overall** — is v4 machine-complete as claimed? Any real blocker? One paragraph.

## 6. Guardrails
- Commit locally only; do **not** push; do **not** touch `BUILD_PLAN_V4.md`.
- You are adjudicating reviews, not re-reviewing all of v4 from scratch — stay on the cited surfaces
  plus whatever a cited claim forces you to open.
- Be willing to refute. A finding both reviewers raised can still be wrong. "Both agreed" is a
  prior, not a proof.
