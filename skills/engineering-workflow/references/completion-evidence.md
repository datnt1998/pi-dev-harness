# Completion Evidence

A task is complete only when requested behavior maps to evidence.

## Required record

```markdown
Scope: <approved target>
Changes: <files/modules, concise>
Acceptance:
- <criterion> → <test, command, or manual evidence>
Checks: <command> — pass|fail
Review: <independent or structured self-review result>
Unverified: none | <explicit gap>
Residual risk: none | <risk>
Git: <status; proposed/made commit>
```

## Rules

- Preserve failures; never summarize red checks as success.
- Separate automated evidence, manual evidence, and assumptions.
- Review does not replace validation; validation does not replace review.
- If an acceptance criterion lacks evidence, list it under `Unverified`.
- Keep happy-path output terse; expand only exceptions.
- Worker/subagent claims are intermediate until the parent verifies evidence.
