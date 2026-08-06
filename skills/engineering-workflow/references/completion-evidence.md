# Completion Evidence

A task is complete only when requested behavior maps to evidence. When any evidence comes from a delegation, apply `delegation-policy.md` as the normative evidence ranking, C1–C7, claim gate, and fan-in record; this file does not redefine those rules.

## Required record

```markdown
Scope: <approved target>
Changes: <files/modules, concise>
Acceptance:
- <criterion> → <test, command, or manual evidence>
Checks: <command> — pass|fail
Review: <independent or structured self-review result>
Delegation evidence: not-applicable | <attribution, routing, C1–C7, acceptance projections>
Claims checked: not-applicable | <ids, verdicts, parent-observed evidence>
Unverified: none | <explicit gap>
Residual risk: none | <risk>
Git: <status; proposed/made commit>
```

## Rules

- Evidence entered under `Acceptance` must be binding per `evidence-binding.md`, not a copy of the thing it claims to check.
- Preserve failures; never summarize red checks as success.
- Separate automated evidence, manual evidence, and assumptions.
- Review does not replace validation; validation does not replace review.
- If an acceptance criterion lacks evidence, list it under `Unverified`.
- Prose around this record follows `response-shape.md`: keep happy-path output terse and expand only exceptions. The record above stays exhaustive — `response-shape.md` never truncates evidence, findings, or unverified criteria.
- Worker/subagent claims remain intermediate until the parent applies `delegation-policy.md`; no action-driving unchecked claim may support completion.
