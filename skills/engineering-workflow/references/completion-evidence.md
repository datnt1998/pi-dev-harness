# Completion Evidence

A task is complete only when requested behavior maps to evidence. When any evidence comes from a delegation, apply `delegation-policy.md` as the normative evidence ranking, C1–C7, claim gate, and fan-in record; this file does not redefine those rules.

## Required record

```markdown
Scope: <approved target>
Changes: <files/modules, concise>
Acceptance:
- <criterion> → <test, command, or manual evidence>
Validation selection: <owned seam; static/focused/integration/full/specialized; sequential|parallel reason>
Test cycle: not-applicable — <reason + alternative evidence> | red <command + expected failure> → green <same command>
Checks: <command> — pass|fail
Failures/retries: none | <red evidence → diagnosis → corrective action → bounded rerun>
Review: <independent or structured self-review result>
Delegation evidence: not-applicable | <attribution, routing, C1–C7, acceptance projections>
Claims checked: not-applicable | <ids, verdicts, parent-observed evidence>
Unverified: none | <explicit gap>
Residual risk: none | <risk>
Git: <status; proposed/made commit>
```

## Rules

- Evidence entered under `Acceptance` must be binding per `evidence-binding.md`, not a copy of the thing it claims to check.
- A fidelity-driven red follows the monotonic-fidelity rule in `tests-and-mocking.md` (semantic fidelity of test doubles); acceptance evidence obtained through a weakened double is not evidence.
- Preserve failures; never summarize red checks as success.
- Apply `testing-strategy.md`: static checks first when available, smallest related behavioral guard next, broader layers only for a named reason, sequential execution by default, and full-suite execution only at a repository-required/requested/release gate.
- Every retry requires a recorded diagnosis or evidenced transient policy. Never weaken, skip, quarantine, loosen, or replace a valid guard merely to restore green.
- Separate automated evidence, manual evidence, and assumptions.
- Review does not replace validation; validation does not replace review.
- If an acceptance criterion lacks evidence, list it under `Unverified`.
- Prose around this record follows `response-shape.md`: keep happy-path output terse and expand only exceptions. The record above stays exhaustive — `response-shape.md` never truncates evidence, findings, or unverified criteria.
- Worker/subagent claims remain intermediate until the parent applies `delegation-policy.md`; no action-driving unchecked claim may support completion.
